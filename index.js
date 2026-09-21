import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config.js';
import { closeDb, query, withTransaction } from './db.js';
import { asyncRoute, HttpError, sendError } from './http.js';
import { authenticateUser, clearSession, createSession, getUserFromRequest, publicUser, registerUser, requireAuth, requireAdmin } from './auth.js';
import { buildPaymentUrl, verifyResponse } from './vnpay.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..');
const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const publicLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });

const registerSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^0\d{9}$/),
  address: z.string().trim().max(500).optional().default('')
});
const loginSchema = z.object({ email: z.string().trim().email().max(255), password: z.string().min(1).max(72) });
const profileSchema = z.object({ fullName: z.string().trim().min(2).max(120), phone: z.string().trim().regex(/^0\d{9}$/).or(z.literal('')), address: z.string().trim().max(500) });
const itemSchema = z.object({ productId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(99), rice: z.string().trim().max(80).optional().default('Gạo lứt'), note: z.string().trim().max(500).optional().default('') });
const orderSchema = z.object({
  customer: z.object({ fullName: z.string().trim().min(2).max(120), phone: z.string().trim().regex(/^0\d{9}$/), email: z.string().trim().email().max(255), address: z.string().trim().min(5).max(500), note: z.string().trim().max(500).optional().default('') }),
  paymentMethod: z.enum(['cod', 'vnpay']),
  items: z.array(itemSchema).min(1).max(50)
});
const contactSchema = z.object({ fullName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(255), phone: z.string().trim().regex(/^0\d{9}$/).or(z.literal('')), subject: z.string().trim().min(2).max(180), message: z.string().trim().min(5).max(3000) });
const statusSchema = z.object({ status: z.enum(['processing', 'confirmed', 'shipping', 'completed', 'cancelled']) });
const paymentCreateSchema = z.object({ orderId: z.string().uuid() });
const reviewSchema = z.object({ rating: z.coerce.number().int().min(1).max(5), title: z.string().trim().max(120).optional().default(''), body: z.string().trim().min(8).max(1200) });
const assistantSchema = z.object({ message: z.string().trim().min(1).max(800) });

const shippingFeeFor = (subtotal) => subtotal >= 300_000 ? 0 : 25_000;
const generateOrderCode = () => {
  const stamp = new Date().toISOString().slice(2,10).replace(/-/g, '');
  return `FO${stamp}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};
const asciiText = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D').replace(/đ/g, 'd').replace(/[^A-Za-z0-9 .,_-]/g, ' ').replace(/\s+/g, ' ').trim();

async function getOrderForUser(orderId, user) {
  const result = await query(
    `SELECT o.*, COALESCE(json_agg(json_build_object('id',oi.id,'productId',oi.product_id,'title',oi.title_snapshot,'price',oi.unit_price,'qty',oi.quantity,'rice',oi.rice,'note',oi.note) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id=o.id
     WHERE o.id=$1
     GROUP BY o.id`,
    [orderId]
  );
  const order = result.rows[0];
  if (!order) throw new HttpError(404, 'Không tìm thấy đơn hàng.');
  if (user.role !== 'admin' && order.user_id !== user.id) throw new HttpError(403, 'Bạn không có quyền xem đơn hàng này.');
  return order;
}

async function createOrderForUser(user, payload) {
  return withTransaction(async (client) => {
    const productIds = [...new Set(payload.items.map(item => item.productId))];
    const productsResult = await client.query(
      `SELECT id,title,price,image FROM products WHERE id = ANY($1::int[]) AND is_active = true FOR UPDATE`,
      [productIds]
    );
    const products = new Map(productsResult.rows.map(row => [row.id, row]));
    if (products.size !== productIds.length) throw new HttpError(400, 'Một hoặc nhiều món không còn khả dụng.');
    const lineItems = payload.items.map(item => {
      const product = products.get(item.productId);
      return { ...item, title: product.title, unitPrice: product.price, image: product.image };
    });
    const subtotal = lineItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const shippingFee = shippingFeeFor(subtotal);
    const total = subtotal + shippingFee;
    const orderCode = generateOrderCode();
    const status = payload.paymentMethod === 'vnpay' ? 'pending_payment' : 'processing';
    const orderResult = await client.query(
      `INSERT INTO orders (order_code,user_id,status,payment_method,payment_status,subtotal,shipping_fee,total,customer_name,customer_phone,customer_email,shipping_address,note,payment_provider)
       VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [orderCode,user.id,status,payload.paymentMethod,subtotal,shippingFee,total,payload.customer.fullName,payload.customer.phone,payload.customer.email,payload.customer.address,payload.customer.note || null,payload.paymentMethod === 'vnpay' ? 'vnpay' : null]
    );
    const order = orderResult.rows[0];
    for (const item of lineItems) {
      await client.query(
        `INSERT INTO order_items (order_id,product_id,title_snapshot,unit_price,quantity,rice,note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [order.id,item.productId,item.title,item.unitPrice,item.quantity,item.rice || 'Gạo lứt',item.note || null]
      );
    }
    if (payload.paymentMethod === 'vnpay') {
      await client.query(`INSERT INTO payments (order_id,provider,status,amount,txn_ref) VALUES ($1,'vnpay','pending',$2,$3)`, [order.id,total,orderCode]);
    }
    return order;
  });
}

async function updateVnpayPayment(params) {
  const txnRef = String(params.vnp_TxnRef || '');
  return withTransaction(async (client) => {
    const paymentResult = await client.query(
      `SELECT p.*,o.id AS order_id,o.total,o.payment_status AS order_payment_status,o.status AS order_status
       FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.txn_ref=$1 FOR UPDATE`,
      [txnRef]
    );
    const payment = paymentResult.rows[0];
    if (!payment) return { code: '01', message: 'Order not found' };
    if (Number(params.vnp_Amount) !== Number(payment.amount) * 100) return { code: '04', message: 'Invalid Amount' };
    if (payment.status !== 'pending' && payment.status !== 'processing') return { code: '02', message: 'Order already confirmed' };

    const success = params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00';
    const nextPaymentStatus = success ? 'paid' : 'failed';
    const nextOrderStatus = success ? 'processing' : 'cancelled';
    await client.query(
      `UPDATE payments SET status=$1,provider_transaction_no=$2,response_code=$3,transaction_status=$4,raw_response=$5::jsonb,updated_at=NOW() WHERE id=$6`,
      [nextPaymentStatus,params.vnp_TransactionNo || null,params.vnp_ResponseCode || null,params.vnp_TransactionStatus || null,JSON.stringify(params),payment.id]
    );
    await client.query(`UPDATE orders SET payment_status=$1,status=$2,payment_provider_ref=$3,updated_at=NOW() WHERE id=$4`, [nextPaymentStatus,nextOrderStatus,params.vnp_TransactionNo || txnRef,payment.order_id]);
    return { code: '00', message: 'Confirm Success', success };
  });
}

app.get('/api/health', asyncRoute(async (_req,res) => {
  await query('SELECT 1');
  res.json({ ok: true, service: 'fitmeal-api', database: 'up', time: new Date().toISOString() });
}));

app.use('/api', publicLimiter);

app.get('/api/products', asyncRoute(async (req,res) => {
  const result = await query(`SELECT p.id,p.title,p.region,p.country,p.calories AS cal,p.goal,p.price,p.old_price AS "oldPrice",COALESCE(ROUND(AVG(r.rating)::numeric,1), p.rating) AS rating,COUNT(r.id)::int AS "reviewCount",p.tags,p.image,p.description AS desc FROM products p LEFT JOIN reviews r ON r.product_id=p.id AND r.status='published' WHERE p.is_active=true GROUP BY p.id ORDER BY p.id`);
  const q = String(req.query.q || '').trim().toLowerCase();
  const region = String(req.query.region || 'all');
  const goal = String(req.query.goal || 'all');
  const filtered = result.rows.filter(p => (!q || `${p.title} ${p.country} ${p.region} ${(p.tags || []).join(' ')}`.toLowerCase().includes(q)) && (region === 'all' || p.region === region) && (goal === 'all' || p.goal === goal));
  res.json({ items: filtered });
}));


app.get('/api/products/:id/reviews', asyncRoute(async (req,res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId)) throw new HttpError(400, 'Mã món không hợp lệ.');
  const result = await query(`SELECT r.id,r.rating,r.title,r.body,r.is_verified,r.created_at,u.full_name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=$1 AND r.status='published' ORDER BY r.created_at DESC LIMIT 30`, [productId]);
  res.json({ items: result.rows });
}));

app.post('/api/products/:id/reviews', requireAuth, asyncRoute(async (req,res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId)) throw new HttpError(400, 'Mã món không hợp lệ.');
  const data = reviewSchema.parse(req.body);
  const purchased = await query(`SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.user_id=$1 AND oi.product_id=$2 AND o.status='completed' LIMIT 1`, [req.user.id, productId]);
  if (!purchased.rowCount) throw new HttpError(403, 'Bạn chỉ có thể đánh giá món sau khi hoàn tất đơn hàng có món này.');
  const orderId = purchased.rows[0].id;
  const exists = await query(`SELECT id FROM reviews WHERE user_id=$1 AND product_id=$2 AND order_id=$3`, [req.user.id, productId, orderId]);
  if (exists.rowCount) throw new HttpError(409, 'Bạn đã đánh giá món này cho đơn hàng đó.');
  const result = await query(`INSERT INTO reviews (product_id,user_id,order_id,rating,title,body,is_verified,status) VALUES ($1,$2,$3,$4,$5,$6,true,'published') RETURNING id,rating,title,body,is_verified,created_at`, [productId,req.user.id,orderId,data.rating,data.title,data.body]);
  res.status(201).json({ review: result.rows[0] });
}));

app.use('/api/auth', authLimiter);
app.post('/api/auth/register', asyncRoute(async (req,res) => {
  const data = registerSchema.parse(req.body);
  const user = await registerUser({ email:data.email,password:data.password,fullName:data.fullName,phone:data.phone,address:data.address });
  await createSession(res, req, user.id);
  res.status(201).json({ user: publicUser(user) });
}));
app.post('/api/auth/login', asyncRoute(async (req,res) => {
  const data = loginSchema.parse(req.body);
  const user = await authenticateUser(data.email, data.password);
  if (!user) throw new HttpError(401, 'Email hoặc mật khẩu chưa đúng.');
  await createSession(res, req, user.id);
  res.json({ user: publicUser(user) });
}));
app.post('/api/auth/logout', asyncRoute(async (req,res) => { await clearSession(req,res); res.status(204).end(); }));
app.get('/api/auth/me', asyncRoute(async (req,res) => { const user = await getUserFromRequest(req); res.json({ user: user ? publicUser(user) : null }); }));

app.get('/api/me', requireAuth, asyncRoute(async (req,res) => res.json({ user: publicUser(req.user) })));
app.patch('/api/me', requireAuth, asyncRoute(async (req,res) => {
  const data = profileSchema.parse(req.body);
  const result = await query(`UPDATE users SET full_name=$1,phone=$2,address=$3,updated_at=NOW() WHERE id=$4 RETURNING id,email,full_name,phone,address,role,created_at`, [data.fullName,data.phone || null,data.address || null,req.user.id]);
  res.json({ user: publicUser(result.rows[0]) });
}));

app.post('/api/orders', requireAuth, asyncRoute(async (req,res) => {
  const payload = orderSchema.parse(req.body);
  const order = await createOrderForUser(req.user,payload);
  res.status(201).json({ order });
}));
app.get('/api/orders', requireAuth, asyncRoute(async (req,res) => {
  const result = await query(`SELECT o.*, COALESCE(json_agg(json_build_object('id',oi.id,'productId',oi.product_id,'title',oi.title_snapshot,'price',oi.unit_price,'qty',oi.quantity,'rice',oi.rice,'note',oi.note) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.user_id=$1 GROUP BY o.id ORDER BY o.created_at DESC`, [req.user.id]);
  res.json({ items: result.rows });
}));
app.get('/api/orders/:id', requireAuth, asyncRoute(async (req,res) => { res.json({ order: await getOrderForUser(req.params.id, req.user) }); }));
app.post('/api/orders/:id/cancel', requireAuth, asyncRoute(async (req,res) => {
  const order = await getOrderForUser(req.params.id, req.user);
  if (['completed','cancelled'].includes(order.status)) throw new HttpError(409,'Đơn hàng không thể hủy ở trạng thái hiện tại.');
  const result = await query(`UPDATE orders SET status='cancelled',updated_at=NOW() WHERE id=$1 RETURNING *`, [order.id]);
  res.json({ order: result.rows[0] });
}));

app.post('/api/payments/vnpay/create', requireAuth, asyncRoute(async (req,res) => {
  const body = paymentCreateSchema.parse(req.body);
  const order = await getOrderForUser(body.orderId, req.user);
  if (order.payment_method !== 'vnpay') throw new HttpError(400,'Đơn hàng này không dùng VNPAY.');
  if (order.payment_status === 'paid') throw new HttpError(409,'Đơn hàng đã được thanh toán.');
  const url = buildPaymentUrl({ txnRef:order.order_code, amount:order.total, orderInfo:asciiText(`Thanh toan don hang ${order.order_code}`), ipAddr:req.ip || '127.0.0.1' });
  await query(`UPDATE payments SET status='processing',updated_at=NOW() WHERE order_id=$1`, [order.id]);
  res.json({ paymentUrl:url, orderCode:order.order_code });
}));

async function vnpayResultHandler(req,res,mode) {
  const params = Object.fromEntries(Object.entries(req.query).map(([key,value]) => [key,String(value)]));
  if (!verifyResponse(params)) {
    if (mode === 'ipn') return res.status(200).json({ RspCode:'97', Message:'Invalid Signature' });
    return res.redirect(`/xacnhandon.html?payment=invalid`);
  }
  try {
    const result = await updateVnpayPayment(params);
    if (mode === 'ipn') return res.status(200).json({ RspCode:result.code, Message:result.message });
    const orderResult = await query('SELECT id FROM orders WHERE order_code=$1',[params.vnp_TxnRef]);
    const order = orderResult.rows[0];
    const payment = params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00' ? 'success' : 'failed';
    return res.redirect(`/xacnhandon.html?id=${encodeURIComponent(order?.id || '')}&payment=${payment}`);
  } catch (error) {
    if (mode === 'ipn') return res.status(200).json({ RspCode:'99', Message:'Unknown error' });
    return res.redirect(`/xacnhandon.html?payment=error`);
  }
}
app.get('/api/payments/vnpay/return', asyncRoute((req,res) => vnpayResultHandler(req,res,'return')));
app.get('/api/payments/vnpay/ipn', asyncRoute((req,res) => vnpayResultHandler(req,res,'ipn')));


function fallbackAssistant(message, products) {
  const q = message.toLowerCase();
  if (q.includes('món') || q.includes('thực đơn') || q.includes('ăn')) {
    const match = products.find(p => `${p.title} ${p.goal} ${p.region} ${(p.tags||[]).join(' ')}`.toLowerCase().includes(q.replace(/[^\p{L}\p{N}\s]/gu,' ').trim().split(/\s+/).find(Boolean) || ''));
    return match ? `Bạn có thể xem “${match.title}” — ${match.cal} kcal, mục tiêu ${match.goal}. Mình có thể mở chi tiết món để bạn xem cách chế biến và đánh giá.` : 'FitMeal hiện có 42 món. Bạn có thể lọc theo khu vực/mục tiêu hoặc mở chi tiết từng món để xem cách chế biến.';
  }
  if (q.includes('khảo sát') || q.includes('bmr') || q.includes('tdee')) return 'Khảo sát là bước thu thập thông tin cơ thể và sở thích để tính BMR/TDEE/BMI. Lộ trình là bước tiếp theo: dùng hồ sơ đó để chọn gói, tùy chỉnh suất và đi đến đặt hàng.';
  if (q.includes('thanh toán') || q.includes('vnpay')) return 'Bạn có thể chọn COD hoặc VNPAY ở bước thanh toán. Với VNPAY, FitMeal tạo đơn trước rồi chuyển sang cổng thanh toán; trạng thái chỉ được cập nhật khi máy chủ nhận xác thực giao dịch.';
  if (q.includes('đơn')) return 'Mở mục “Đơn hàng” sau khi đăng nhập để xem trạng thái, chi tiết món và phí giao hàng của từng đơn.';
  return 'Mình là trợ lý FitMeal. Mình có thể giúp bạn tìm món, hiểu khảo sát/lộ trình, hướng dẫn đặt hàng hoặc giải thích thanh toán.';
}

app.post('/api/assistant/chat', asyncRoute(async (req,res) => {
  const data = assistantSchema.parse(req.body);
  const products = (await query(`SELECT title,region,country,goal,calories AS cal,tags FROM products WHERE is_active=true ORDER BY id`)).rows;
  if (!process.env.OPENAI_API_KEY) return res.json({ reply: fallbackAssistant(data.message, products), mode:'smart-fallback' });
  const compactProducts = products.map(p => `${p.title} | ${p.region} | ${p.country} | ${p.goal} | ${p.cal} kcal | ${(p.tags||[]).join(', ')}`).join('\n');
  const system = `Bạn là trợ lý CSKH của FitMeal. Trả lời bằng tiếng Việt, ngắn gọn, lịch sự, tập trung vào thực đơn, khảo sát, lộ trình, đơn hàng và thanh toán. Không khẳng định chẩn đoán y khoa, không bịa thông tin ngoài dữ liệu sản phẩm.\nDanh mục món hiện có:\n${compactProducts}`;
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},
      body:JSON.stringify({model:process.env.OPENAI_MODEL || 'gpt-5.6-luna', input:[
        {role:'system',content:[{type:'input_text',text:system}]},
        {role:'user',content:[{type:'input_text',text:data.message}]}
      ], max_output_tokens:400})
    });
    if (!response.ok) throw new Error('OpenAI request failed');
    const payload=await response.json();
    const reply=payload.output_text?.trim();
    if (!reply) throw new Error('Empty assistant response');
    res.json({reply,mode:'openai'});
  } catch {
    res.json({reply:fallbackAssistant(data.message, products),mode:'smart-fallback'});
  }
}));

app.post('/api/contact', asyncRoute(async (req,res) => {
  const data = contactSchema.parse(req.body);
  const user = await getUserFromRequest(req);
  await query(`INSERT INTO contact_messages (user_id,full_name,email,phone,subject,message) VALUES ($1,$2,$3,$4,$5,$6)`, [user?.id || null,data.fullName,data.email,data.phone || null,data.subject,data.message]);
  res.status(201).json({ message:'Đã ghi nhận yêu cầu.' });
}));

app.get('/api/admin/stats', requireAuth, requireAdmin, asyncRoute(async (req,res) => {
  const filter = String(req.query.filter || 'all');
  const where = filter === 'today' ? `WHERE o.created_at >= CURRENT_DATE` : filter === 'month' ? `WHERE date_trunc('month',o.created_at)=date_trunc('month',CURRENT_DATE)` : '';
  const [stats,orders,customers,today] = await Promise.all([
    query(`SELECT COUNT(*)::int AS orders, COUNT(DISTINCT COALESCE(o.user_id::text,o.customer_phone))::int AS customers, COALESCE(SUM(o.total),0)::int AS revenue FROM orders o ${where}`),
    query(`SELECT o.id,o.order_code,o.customer_name,o.customer_phone,o.customer_email,o.created_at,o.payment_method,o.payment_status,o.status,o.total FROM orders o ${where} ORDER BY o.created_at DESC LIMIT 200`),
    query(`SELECT u.id,u.full_name,u.phone,u.email,COUNT(o.id)::int AS order_count,COALESCE(SUM(o.total),0)::int AS total_spent FROM users u JOIN orders o ON o.user_id=u.id WHERE u.role='customer' GROUP BY u.id ORDER BY total_spent DESC LIMIT 200`),
    query(`SELECT COALESCE(SUM(total),0)::int AS revenue FROM orders WHERE created_at >= CURRENT_DATE`)
  ]);
  res.json({ stats:{ ...stats.rows[0], today:today.rows[0].revenue }, orders:orders.rows, customers:customers.rows });
}));
app.patch('/api/admin/orders/:id/status', requireAuth, requireAdmin, asyncRoute(async (req,res) => {
  const data = statusSchema.parse(req.body);
  const result = await query(`UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *`, [data.status,req.params.id]);
  if (!result.rowCount) throw new HttpError(404,'Không tìm thấy đơn hàng.');
  res.json({ order: result.rows[0] });
}));

app.use(express.static(publicDir, { index:'index.html', extensions:['html'], maxAge: config.nodeEnv === 'production' ? '1d' : 0 }));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error:'API endpoint không tồn tại.' });
  return res.status(404).sendFile(path.join(publicDir, '404.html'));
});

app.use((error, _req, res, _next) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error:'Dữ liệu gửi lên không hợp lệ.', details:error.issues });
  if (error.code === '23505') return res.status(409).json({ error:'Dữ liệu đã tồn tại.' });
  console.error(error);
  return sendError(res,error);
});

const server = app.listen(config.port, () => console.log(`FitMeal server listening on ${config.appOrigin}`));
const shutdown = async (signal) => { console.log(`[server] ${signal}`); server.close(async () => { await closeDb(); process.exit(0); }); };
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
