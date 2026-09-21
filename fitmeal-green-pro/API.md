# FitMeal API

Base URL khi chạy cùng frontend: `/api`.

## Authentication

- `POST /auth/register` — tạo tài khoản customer và tạo session cookie HttpOnly.
- `POST /auth/login` — đăng nhập.
- `POST /auth/logout` — hủy session hiện tại.
- `GET /auth/me` — lấy tài khoản hiện tại.

## Products

- `GET /products` — danh sách món từ PostgreSQL. Hỗ trợ `q`, `region`, `goal`.

## Account

- `GET /me` — hồ sơ hiện tại.
- `PATCH /me` — cập nhật họ tên, điện thoại, địa chỉ.

## Orders

- `POST /orders` — tạo đơn. Server tự đọc giá từ database, tính subtotal/phí ship/tổng và snapshot từng dòng món.
- `GET /orders` — lịch sử đơn của user hiện tại.
- `GET /orders/:id` — chi tiết đơn; customer chỉ xem đơn của mình, admin xem được tất cả.
- `POST /orders/:id/cancel` — hủy đơn khi trạng thái còn cho phép.

## Payments

- `POST /payments/vnpay/create` — tạo URL thanh toán VNPAY từ order đã tồn tại.
- `GET /payments/vnpay/return` — URL VNPAY redirect người dùng về.
- `GET /payments/vnpay/ipn` — IPN server-to-server để cập nhật trạng thái thanh toán.

## Admin

- `GET /admin/stats?filter=all|today|month` — thống kê, danh sách đơn và khách hàng.
- `PATCH /admin/orders/:id/status` — cập nhật trạng thái vận hành.

## Contact

- `POST /contact` — lưu yêu cầu liên hệ vào PostgreSQL.


## Reviews

- `GET /products/:id/reviews` — danh sách review đã publish.
- `POST /products/:id/reviews` — tạo review; yêu cầu đăng nhập và user phải có đơn hoàn tất chứa món đó.

## Assistant

- `POST /assistant/chat` — trợ lý CSKH; dùng OpenAI Responses API nếu có `OPENAI_API_KEY`, nếu không sẽ dùng fallback server-side.


## Database migrations

- `001_init.sql` — users, sessions, products, orders, payments, contact messages.
- `002_reviews.sql` — reviews có xác thực theo đơn hàng hoàn tất.
