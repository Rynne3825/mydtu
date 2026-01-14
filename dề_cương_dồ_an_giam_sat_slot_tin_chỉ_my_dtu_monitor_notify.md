# Đề cương đồ án

## Hệ thống giám sát slot tín chỉ MyDTU (Monitor & Notify)

## 1. Tóm tắt đề tài

Đồ án xây dựng một website cho phép người dùng đăng ký tài khoản và **theo dõi trạng thái “Còn trống” (slot)** của **từng lớp học phần cụ thể** trên trang tra cứu của MyDTU (Duy Tân). Hệ thống sẽ **tự động kiểm tra theo chu kỳ 10 phút** và **gửi thông báo ngay khi slot mở** (điều kiện: *từ 0 → >0*, hoặc *“Hết chỗ” → số*). Thông báo được gửi qua **Telegram** và **Email**.

Đặc điểm bài toán:

- Trang nguồn **không yêu cầu đăng nhập**, **không có CAPTCHA**, mọi người đều xem được.
- Người dùng **dán link lớp** (class detail) để theo dõi.
- Mục tiêu: **ứng dụng thực tế** (độ ổn định, chống báo trùng, log, vận hành).

---

## 2. Mục tiêu và phạm vi

### 2.1 Mục tiêu

- Theo dõi slot chính xác theo lớp (class detail).
- Phát hiện sự kiện **mở slot** và thông báo kịp thời.
- Cung cấp dashboard cho người dùng quản lý danh sách theo dõi và lịch sử thông báo.
- Ghi log kiểm tra, lỗi, và kết quả gửi thông báo.

### 2.2 Phạm vi

**Trong phạm vi**:

- Theo dõi theo **link lớp** (ví dụ `...p=home_listclassdetail&classid=...`).
- ví dụ:\
  [https://courses.duytan.edu.vn/Sites/Home\_ChuongTrinhDaoTao.aspx?p=home\_listclassdetail&timespan=92&semesterid=92&classid=275412&academicleveltypeid=&curriculumid=](https://courses.duytan.edu.vn/Sites/Home_ChuongTrinhDaoTao.aspx?p=home_listclassdetail\&timespan=92\&semesterid=92\&classid=275412\&academicleveltypeid=\&curriculumid=)\
  [https://courses.duytan.edu.vn/Sites/Home\_ChuongTrinhDaoTao.aspx?p=home\_listclassdetail&timespan=92&semesterid=92&classid=285491&academicleveltypeid=&curriculumid=](https://courses.duytan.edu.vn/Sites/Home_ChuongTrinhDaoTao.aspx?p=home_listclassdetail\&timespan=92\&semesterid=92\&classid=285491\&academicleveltypeid=\&curriculumid=)
- Chu kỳ kiểm tra: **10 phút/lần**.
- Thông báo: **Telegram + Email**.
- Sự kiện thông báo:
  - Gửi khi **0 → >0** (mở slot lần đầu).
  - Gửi khi slot **tăng thêm** (ví dụ **1 → 3**) theo yêu cầu.
  - Chỉ quan tâm slot (kể cả “Tình trạng đăng ký” khác nhau); “Còn hạn đăng ký” với slot=0 vẫn được xem là hợp lệ và chỉ chờ slot mở.
- Quản lý tài khoản người dùng.

**Ngoài phạm vi** (đề xuất nêu rõ để tránh bị hỏi quá sâu):

- Không tự động đăng ký tín chỉ.
- Không xử lý các trang yêu cầu xác thực nội bộ (nếu tương lai thay đổi).
- Không đảm bảo 100% nếu trang nguồn thay đổi lớn cấu trúc HTML; chỉ có cơ chế giảm thiểu và cảnh báo.

---

## 3. Yêu cầu chức năng (Functional Requirements)

### FR-01: Quản lý tài khoản

- Đăng ký tài khoản bằng email.
- Đăng nhập/đăng xuất.
- Quên mật khẩu hoặc OTP (tùy chọn).

### FR-02: Quản lý theo dõi (Watch list)

- Thêm một theo dõi bằng cách **dán link lớp**.
- Hệ thống tự tách và lưu các tham số quan trọng từ URL: `classid`, `semesterid`, `timespan` (nếu có).
- Bật/tắt theo dõi từng lớp.
- Xóa theo dõi.

### FR-03: Kiểm tra định kỳ (Scheduler/Cron)

- Chạy job định kỳ mỗi 10 phút.
- Fetch HTML của từng link lớp.
- Parse trường **Còn trống** (remaining slot).
- Lưu trạng thái mới và thời điểm kiểm tra.

### FR-04: Phát hiện sự kiện và chống báo trùng

- Định nghĩa sự kiện “OPEN/INCREASE”:
  - OPEN: `last_remaining <= 0` và `current_remaining > 0`.
  - INCREASE: `last_remaining > 0` và `current_remaining > last_remaining`.
- Không gửi thông báo nếu:
  - Slot không đổi.
  - Slot giảm.
  - Fetch/parse lỗi.

### FR-05: Thông báo Telegram

- Người dùng liên kết Telegram bằng cơ chế mã liên kết (link code).
- Gửi tin nhắn khi xảy ra OPEN hoặc INCREASE.
- Nội dung tối thiểu: “Còn X chỗ” + link lớp.

### FR-06: Thông báo Email

- Người dùng xác nhận email.
- Gửi email khi xảy ra OPEN hoặc INCREASE.
- Nội dung tối thiểu: “Còn X chỗ” + link lớp.

### FR-07: Dashboard và lịch sử

- Trang tổng quan: danh sách lớp theo dõi, slot hiện tại, thời điểm check gần nhất, trạng thái (OK/lỗi).
- Trang lịch sử: danh sách thông báo đã gửi (kênh, thời gian, slot, kết quả).

---

## 4. Yêu cầu phi chức năng (Non-functional Requirements)

### NFR-01: Độ tin cậy

- Hệ thống vẫn hoạt động khi máy cá nhân tắt (triển khai cloud).
- Retry giới hạn khi lỗi mạng.

### NFR-02: Hiệu năng

- Tối ưu số request: có thể gom các watch trùng URL (nếu phát triển nâng cao).
- Tần suất 10 phút đảm bảo tải thấp.

### NFR-03: Bảo mật

- Mật khẩu lưu bằng hash + salt.
- Không lưu thông tin nhạy cảm không cần thiết.
- Telegram liên kết bằng mã một lần, có hạn.

### NFR-04: Quan sát hệ thống (Observability)

- Log lỗi fetch, lỗi parse, lỗi gửi notification.
- Có trạng thái hiển thị cho người dùng.

---

## 5. Kiến trúc hệ thống (đề xuất triển khai)

### 5.1 Thành phần

- **Frontend (Web UI)**: Cloudflare Pages (hoặc tương đương).
- **Backend API**: Cloudflare Workers.
- **Cron/Scheduler**: Cloudflare Workers Cron Triggers (mỗi 10 phút).
- **Database**: Cloudflare D1 (SQLite).
- **Notification**:
  - Telegram Bot API.
  - Email service (SendGrid/Mailgun/Resend hoặc tương đương).

### 5.2 Luồng dữ liệu tổng quát

1. User đăng nhập → thêm link lớp để theo dõi.
2. Cron chạy → fetch HTML → parse slot.
3. So sánh với trạng thái cũ → nếu OPEN/INCREASE → gửi Telegram/Email.
4. Ghi log và cập nhật trạng thái.

---

## 6. Mô hình dữ liệu (ERD ở mức bảng)

### 6.1 Bảng `users`

- `id` (PK)
- `email` (unique)
- `password_hash`
- `email_verified` (bool)
- `telegram_chat_id` (nullable)
- `created_at`

### 6.2 Bảng `watch_items`

- `id` (PK)
- `user_id` (FK → users.id)
- `class_url`
- `classid` (nullable)
- `semesterid` (nullable)
- `timespan` (nullable)
- `is_active` (bool)
- `notify_telegram` (bool)
- `notify_email` (bool)
- `created_at`

### 6.3 Bảng `watch_state`

- `watch_item_id` (PK/FK → watch\_items.id)
- `last_remaining` (int)
- `last_checked_at`
- `last_event_type` (OPEN/INCREASE/none)
- `last_event_at` (timestamp)
- `last_error` (nullable)

### 6.4 Bảng `notification_log`

- `id` (PK)
- `watch_item_id` (FK)
- `event_type` (OPEN/INCREASE)
- `channel` (telegram/email)
- `remaining` (int)
- `sent_at`
- `status` (success/fail)
- `error_message` (nullable)

### 6.5 Bảng `telegram_link_codes` (khuyến nghị)

- `code` (PK)
- `user_id` (FK)
- `expires_at`
- `used_at` (nullable)

---

## 7. Đặc tả parser và logic phát hiện

### 7.1 Trích tham số URL

- Parse query string từ `class_url`.
- Lưu `classid`, `semesterid`, `timespan` nếu có.

### 7.2 Parse “Còn trống”

- Tìm khối “Thông tin đăng ký lớp học”.
- Tìm nhãn “Còn trống:” và đọc giá trị số kế bên.
- Quy đổi:
  - Nếu hiển thị chữ (ví dụ “Hết chỗ”) → coi là `0`.
  - Nếu là số → parse int.

### 7.3 Rule phát hiện sự kiện

- `OPEN` nếu `last_remaining <= 0` và `current_remaining > 0`.
- `INCREASE` nếu `last_remaining > 0` và `current_remaining > last_remaining`.
- Không gửi khi `current_remaining == last_remaining` hoặc giảm.

---

## 8. Thiết kế thông báo

### 8.1 Telegram message format

- Tiêu đề: “Slot mở” hoặc “Slot tăng”.
- Nội dung: “Còn trống: X” + link lớp.
- (Tùy chọn) Thêm “Mã đăng ký”, “Học kỳ”, “Giờ học”.

### 8.2 Email format

- Subject: “[MyDTU Slot] Còn trống X chỗ”.
- Body: Tóm tắt + link.

---

## 9. Kế hoạch kiểm thử (Test Plan)

### 9.1 Unit test

- Parse URL: tách `classid`, `semesterid`, `timespan` đúng.
- Parser HTML: đọc đúng remaining với các trường hợp 0 và >0.

### 9.2 Integration test

- Cron chạy và cập nhật `watch_state`.
- Điều kiện OPEN/INCREASE hoạt động đúng.
- Gửi Telegram/Email và ghi `notification_log`.

### 9.3 Failure test

- Trang trả 500/timeout → không gửi, ghi lỗi.
- HTML thay đổi/parse fail → không gửi, cảnh báo trên dashboard.

---

## 10. Rủi ro và phương án giảm thiểu

1. **Trang nguồn đổi HTML** → Parser dựa trên nhãn “Còn trống”, có cảnh báo parse fail.
2. **Rate-limit/chặn** → Chu kỳ 10 phút, retry giới hạn, backoff.
3. **Thông báo trùng** → Dựa vào OPEN/INCREASE, lưu trạng thái và log.
4. **Email fail** → Log + retry, hiển thị trạng thái gửi.

---

## 11. Kế hoạch triển khai (Milestones)

- M1: Đặc tả dữ liệu + UI đăng nhập + CRUD watchlist.
- M2: Cron fetch + parser + lưu state.
- M3: Telegram bot liên kết + gửi notify.
- M4: Email service + gửi notify.
- M5: Dashboard + lịch sử + kiểm thử & hoàn thiện báo cáo.

---

## 12. Tiêu chí nghiệm thu

- Người dùng thêm link lớp và bật theo dõi.
- Cron chạy mỗi 10 phút, cập nhật “Còn trống” hiển thị trên dashboard.
- Khi slot 0→>0 hoặc tăng >0, hệ thống gửi thông báo Telegram/Email (theo cấu hình) và lưu log.
- Hệ thống xử lý lỗi fetch/parse an toàn, không spam thông báo.

