# SOP 1 Trang — Vận Hành Hằng Ngày PNJ E-Brochure

Mục tiêu: cập nhật nội dung nhanh, đúng quy trình, hạn chế lỗi production.

---

## A. Trước khi thao tác (2 phút)

1. Mở đúng admin URL production: `.../admin.html`
2. Đăng nhập đúng tài khoản admin được cấp quyền.
3. Vào `Media Library` bấm `Reload` để lấy trạng thái mới nhất.

---

## B. Cập nhật nội dung hằng ngày (10–20 phút)

### 1) Cập nhật theo branch/campaign
1. Vào `Cấu hình Text`
2. Chọn branch cần chỉnh
3. Cập nhật: Label tab, Signature, Intro, Page title, Hero video
4. Bấm `Lưu Branch`

### 2) Cập nhật block
1. Vào `Nội dung Blocks`
2. Chỉnh block ảnh/video/text theo nhu cầu
3. Với ảnh: ưu tiên nút `Lấy từ Library` để tránh upload trùng
4. Bấm `Lưu & Public`

### 3) Cập nhật hotspot sản phẩm
1. Click vào ảnh để thêm/chỉnh hotspot
2. Dán link sản phẩm PNJ và bấm `Lấy dữ liệu`
3. Kiểm tra lại: tên, giá, ảnh popup, link mua
4. Bấm `Lưu Hotspot`

---

## C. Quy trình Media Library (bắt buộc)

### Khi upload mới
- Dùng `+ Upload Image` / `+ Upload Video` trong `Media Library`.

### Khi ảnh đã upload trên Cloudinary Console nhưng chưa thấy trong admin
1. Bấm `Sync Cloudinary`
2. Nếu vẫn chưa có, bấm thêm `Reload`

### Khi cần gom media cũ từ nội dung hiện có
- Bấm `Merge Cloudinary`

### Khi xóa media
1. Bấm `Delete` tại card
2. Xác nhận xóa
3. Kiểm tra đã biến mất khỏi list

---

## D. Checklist QA trước khi chốt (5 phút)

1. Mở viewer production và hard refresh.
2. Kiểm tra 4 tab branch hiển thị đúng text.
3. Click 2–3 hotspot bất kỳ:
- popup mở đúng
- ảnh popup trượt được
- nút `MUA NGAY` đúng link
4. Test form ưu đãi:
- số điện thoại đúng format VN
- submit thành công
5. Quay lại admin > `Thống kê`, xác nhận có event mới.

---

## E. Xử lý lỗi nhanh

### 1) `Failed to fetch` / CORS
- Kiểm tra function `media-library` đã deploy chưa.
- Kiểm tra `ADMIN_ALLOWED_ORIGINS`.

### 2) `unknown_api_key`
- Sai Cloudinary API key/secret.
- Set lại secrets đúng cặp key/secret cùng cloud name.

### 3) `Invalid Signature` khi delete
- Function chưa ở bản mới.
- Deploy lại `media-library`.

---

## F. Quy tắc vận hành

- Không upload trùng nếu đã có trong library.
- Không xóa media khi chưa chắc đang được dùng ở popup/hotspot.
- Mỗi lần chỉnh lớn phải QA lại viewer trên mobile.
- Nếu có lỗi production, chụp màn hình + gửi log console để xử lý nhanh.
