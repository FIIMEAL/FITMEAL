# FoodOnline – Bộ giao diện website

## Trang đã có
- index.html — Chi tiết món ăn
- order.html — Thông tin đặt món
- menu.html — Danh sách thực đơn + tìm kiếm/lọc
- cart.html — Giỏ hàng
- login.html — Đăng nhập
- account.html — Tài khoản khách hàng
- orders.html — Theo dõi đơn hàng
- contact.html — Liên hệ & hỗ trợ
- style.css — Giao diện dùng chung

## Luồng
Thực đơn → Chi tiết món → Đặt ngay → Thông tin đặt món.
Giỏ hàng, đăng nhập, tài khoản, đơn hàng và liên hệ được nối từ thanh điều hướng.

Đây là frontend/demo tĩnh; backend, database, tài khoản thật và cổng thanh toán chưa kết nối.


## Phần quản trị mới
- `admin.html` — Dashboard chủ website.
- Theo dõi số người mua duy nhất, tổng đơn hàng, tổng doanh thu và doanh thu hôm nay.
- Xem danh sách đơn hàng và khách hàng đã mua.
- Đơn hàng từ `order.html` được lưu vào `localStorage` để demo.
- Đăng nhập quản trị demo: `admin@foodonline.vn` / `admin123`.

> Lưu ý: đây vẫn là frontend/demo. Dữ liệu chỉ nằm trên trình duyệt đang sử dụng. Muốn nhiều khách hàng trên Internet cùng ghi nhận vào một hệ thống doanh thu chung thì cần backend + database.
