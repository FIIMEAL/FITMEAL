import 'dotenv/config';

const bool = (value, fallback = false) => {
  if (value == null || value === '') return fallback;
  return value === 'true' || value === '1' || value === 'yes';
};

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8080),
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:8080',
  databaseUrl: process.env.DATABASE_URL || 'postgres://fitmeal:fitmeal@localhost:5432/fitmeal',
  sessionDays: Math.max(1, Number(process.env.SESSION_DAYS || 30)),
  cookieSecure: bool(process.env.COOKIE_SECURE, (process.env.NODE_ENV || 'development') === 'production'),
  adminEmail: (process.env.ADMIN_EMAIL || 'admin@fitmeal.vn').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
  vnpay: {
    tmnCode: process.env.VNPAY_TMN_CODE || '',
    hashSecret: process.env.VNPAY_HASH_SECRET || '',
    paymentUrl: process.env.VNPAY_PAYMENT_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    returnUrl: process.env.VNPAY_RETURN_URL || 'http://localhost:8080/api/payments/vnpay/return',
    ipnUrl: process.env.VNPAY_IPN_URL || 'http://localhost:8080/api/payments/vnpay/ipn',
    orderType: process.env.VNPAY_ORDER_TYPE || 'other',
    locale: process.env.VNPAY_LOCALE || 'vn',
    expireMinutes: Math.max(5, Number(process.env.VNPAY_EXPIRE_MINUTES || 15))
  }
};

export const isProduction = config.nodeEnv === 'production';
