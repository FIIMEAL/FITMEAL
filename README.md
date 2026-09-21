# FitMeal — Full-stack

FitMeal hiện chạy theo mô hình full-stack:

- **Frontend:** HTML/CSS/JavaScript hiện có của bản redesign.
- **Backend:** Node.js 20+ + Express 5.
- **Database:** PostgreSQL 17.
- **Auth:** password hash bằng bcrypt + session opaque token lưu dạng hash trong DB + cookie HttpOnly.
- **Order:** server xác thực user, đọc giá từ DB và tính lại subtotal / phí giao hàng / total trong transaction.
- **Payment:** VNPAY sandbox/production; backend ký HMACSHA512, kiểm tra checksum, số tiền và cập nhật trạng thái qua Return URL + IPN.
- **Admin:** dashboard đọc trực tiếp từ PostgreSQL và có thể đổi trạng thái đơn.

## 1. Cài đặt

Yêu cầu:

- Node.js 20+
- Docker Desktop / Docker Engine

Cài dependency:

```bash
npm install
```

## 2. PostgreSQL

Khởi động database:

```bash
docker compose up -d db
```

Tạo file môi trường:

```bash
copy .env.example .env
```

Trên macOS/Linux:

```bash
cp .env.example .env
```

Đặt ít nhất `ADMIN_PASSWORD` trong `.env`.

Chạy migration và seed:

```bash
npm run db:migrate
npm run db:seed
```

## 3. Chạy website + API

Development:

```bash
npm run dev
```

Production-like:

```bash
npm start
```

Mở `http://localhost:8080`.

Kiểm tra API:

```text
GET http://localhost:8080/api/health
```

## 4. Đăng nhập admin

Tài khoản admin được seed từ:

```env
ADMIN_EMAIL=admin@fitmeal.vn
ADMIN_PASSWORD=...
```

Không commit `.env` và không dùng mật khẩu mặc định trong môi trường thật.

## 5. VNPAY

Điền các biến:

```env
VNPAY_TMN_CODE=
VNPAY_HASH_SECRET=
VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=https://YOUR_PUBLIC_DOMAIN/api/payments/vnpay/return
VNPAY_IPN_URL=https://YOUR_PUBLIC_DOMAIN/api/payments/vnpay/ipn
```

Server phải truy cập được từ internet để VNPAY gọi IPN. Trong production nên dùng HTTPS và `COOKIE_SECURE=true`.

Localhost chỉ phù hợp cho frontend/backend nội bộ; để test IPN cần một public HTTPS endpoint/tunnel hoặc môi trường staging được VNPAY cho phép.

## 6. Luồng đặt hàng

1. User đăng nhập.
2. Frontend giữ giỏ hàng ở trình duyệt.
3. `POST /api/orders` gửi product IDs + số lượng.
4. Backend khóa/đọc sản phẩm từ PostgreSQL và tự tính giá.
5. COD: đơn chuyển `processing` và hiển thị xác nhận.
6. VNPAY: đơn tạo ở `pending_payment`, backend tạo payment request, rồi redirect sang VNPAY.
7. VNPAY gọi IPN/Return; backend kiểm tra chữ ký, số tiền và cập nhật `payments` + `orders` trong transaction.
8. Frontend chỉ đọc trạng thái cuối cùng từ API.

## 7. Bảo mật đã áp dụng

- Không lưu password ở `localStorage`.
- Session token không lưu plaintext trong database.
- Cookie session có `HttpOnly`, `SameSite=Lax` và có thể bật `Secure`.
- Rate-limit cho auth và public API.
- `helmet` cho HTTP security headers.
- Zod validation ở API boundary.
- Không tin giá do frontend gửi; server tự tính lại.
- VNPAY checksum HMACSHA512 + kiểm tra amount + xử lý IPN idempotent.
- Escape dữ liệu khi render HTML ở frontend.

## 8. Kiểm tra mã

```bash
npm run check
```

Lưu ý: môi trường hiện tại không có Docker/PostgreSQL chạy sẵn nên chưa thể thực hiện integration test thực tế với DB/VNPAY tại đây. Mã migration, seed, API và frontend đã được kiểm tra syntax; để test end-to-end, chạy PostgreSQL bằng `docker compose up -d db`, migration/seed rồi khởi động server.

## 9. Menu gốc & lộ trình khảo sát

Bản này **giữ nguyên đủ 42 món trong menu gốc** của project, bao gồm 7 nhóm khu vực: Việt Nam, Châu Á, Châu Âu, Châu Mỹ, Châu Đại Dương, Châu Phi và Chay. Không cắt còn 16 món như bản fallback cũ.

`survey.html` giữ luồng khảo sát theo file FitMeal của bạn: thông tin sinh học → vận động & mục tiêu → sở thích ẩm thực → BMR/TDEE/BMI/Macro → chuyển sang thực đơn/lộ trình. `Lotrinhhoa.html` tiếp tục giữ wizard lộ trình chi tiết, chỉ chỉnh lỗi kết nối, hình ảnh và giao diện sang tông xanh.

## 9. SEO & sitemap

Project đã có sẵn bộ SEO cơ bản cho website public:

- `sitemap.xml`: danh sách URL công khai để công cụ tìm kiếm crawl.
- `sitemap.html`: sơ đồ website trực quan cho người dùng.
- `robots.txt`: quy tắc crawl và khai báo sitemap.
- Các trang có session/trạng thái giao dịch như cart, account, checkout và admin được đánh dấu `noindex,nofollow` và không xuất hiện trong XML sitemap.
- `survey.html`: trang khảo sát BMR/TDEE riêng, dùng chung design system của FitMeal và liên kết với lộ trình cá nhân.

Mặc định sitemap đang dùng URL GitHub Pages:

```text
https://fiimeal.github.io/FITMEAL/
```

Nếu deploy FitMeal bằng domain riêng, đổi hostname trong `sitemap.xml`, `robots.txt` và các thẻ `canonical` của `index.html`, `menu.html`, `Lotrinhhoa.html`, `contact.html`, `survey.html`, `sitemap.html`.

## SEO chuẩn hóa

Bản frontend đã được chuẩn hóa SEO cho 19 trang HTML hiện có (bao gồm `404.html`, `gioi-thieu.html` và `tin-tuc.html`):

- Trang public có `title`, `meta description`, canonical tuyệt đối, Open Graph, Twitter Card, favicon, manifest, `hreflang` vi-VN và JSON-LD theo ngữ cảnh.
- Trang riêng tư (`account`, `admin`, `cart`, `checkout`, `payment`, `login`, `register`, `orders`, `confirmation`) dùng `noindex,nofollow,noarchive` và không xuất hiện trong `sitemap.xml`.
- `robots.txt` cho phép crawler đọc các trang HTML để nhận `noindex`, chỉ chặn `/api/`.
- `404.html` dùng cho GitHub Pages và cũng có `noindex`.
- `sitemap.xml` chỉ chứa 8 URL public có giá trị index; `sitemap.html` là sơ đồ website dành cho người dùng.
- `assets/og-fitmeal.png`, `assets/favicon.svg` và `site.webmanifest` cung cấp bộ nhận diện cho chia sẻ mạng xã hội và thiết bị.

### URL production mặc định

`https://fiimeal.github.io/FITMEAL/`

Khi đổi domain, cập nhật `BASE` trong các canonical/JSON-LD, `sitemap.xml`, `robots.txt`, Open Graph URL và `site.webmanifest` nếu cần.


## Bản xanh lá — trải nghiệm cửa hàng

Bản redesign giữ nguyên 42 món gốc và bổ sung lớp trải nghiệm: hero chữ chuyển động, food rail ngang tự chạy và dừng khi bấm, modal chi tiết món, giá chỉ xuất hiện ở chi tiết/giỏ hàng, đánh giá đã xác thực theo đơn hoàn tất, trang Về FitMeal, Cẩm nang và Google Maps.

### Phân biệt Khảo sát và Lộ trình

- `survey.html`: bước thu thập dữ liệu cơ thể, vận động, mục tiêu và sở thích; trả về BMR/TDEE/BMI/Macro tham khảo.
- `Lotrinhhoa.html`: giữ luồng gốc của project để dùng hồ sơ trên vào việc chọn gói, phân bổ suất, đổi món và tiến tới đặt hàng.

### Trợ lý AI

`assistant.js` là lớp giao diện chat nổi trên website. Backend có `POST /api/assistant/chat`; khi chưa có `OPENAI_API_KEY`, server dùng câu trả lời dự phòng, nên site vẫn hoạt động. API key chỉ đặt ở server trong `.env`, không đưa vào frontend.

Địa điểm FitMeal hiện được cấu hình tại Cơ sở Nguyễn Văn Dung (IUH): Số 10 Nguyễn Văn Dung, Phường An Nhơn, TP.HCM.
