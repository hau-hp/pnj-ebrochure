# Hướng Dẫn Sử Dụng PNJ E-Brochure

Tài liệu này hướng dẫn sử dụng nhanh toàn bộ tính năng cho:
- Người xem e-brochure (`index.html`)
- Admin quản trị nội dung (`admin.html`)

---

## 1) Mở hệ thống

- Giao diện người xem: `index.html`
- Giao diện admin: `admin.html`

Khi deploy production:
- Viewer: `https://hau-hp.github.io/pnj-ebrochure/`
- Admin: `https://hau-hp.github.io/pnj-ebrochure/admin.html`

---

## 2) Đăng nhập Admin

Truy cập `admin.html` và đăng nhập bằng tài khoản đã seed:
- `hau.hp`
- `anh.hk`
- `chau.hg`
- `hau.nt`
- `yen.dnh`

Lưu ý:
- Admin có chặn domain theo `adminAllowedOrigins` trong `config.js`.
- Nếu mở sai domain sẽ không đăng nhập được.

---

## 3) Cấu trúc quản trị

Trong admin có 4 khu vực chính:
- `Cấu hình Text` (config)
- `Nội dung Blocks` (blocks)
- `Media Library` (media)
- `Thống kê` (analytics)

### Branch
- Mỗi branch tương ứng 1 tab trên giao diện viewer.
- Có thể tạo branch mới bằng nút `+ Tạo Branch`.

---

## 4) Quản lý nội dung Blocks

Trong tab `Nội dung Blocks`:
- Tạo block mới: `image`, `video`, `text`, `grid`, `video_hero`
- Chỉnh sửa nội dung block
- Sắp xếp thứ tự block (mũi tên lên/xuống)
- Xóa block

### Hotspot
- Block `image` và `grid` hỗ trợ hotspot.
- Click lên ảnh để tạo hotspot mới.
- Hotspot cần đủ:
  - Link sản phẩm
  - Tên sản phẩm
  - Giá
  - Ít nhất 1 ảnh popup

### Import sản phẩm PNJ
- Dán link sản phẩm PNJ vào `Link sản phẩm PNJ`
- Bấm `Lấy dữ liệu`
- Hệ thống tự điền: tên, giá, ảnh, url sản phẩm
- Có thể chỉnh tay trước khi lưu hotspot

---

## 5) Media Library

Tab `Media Library` dùng để quản lý media tập trung.

### Upload
- `+ Upload Image`
- `+ Upload Video`

### Chọn lại media khi edit block/hotspot
- Ở các field ảnh có nút `Lấy từ Library`
- Mở popup chọn ảnh và bấm `Dùng ảnh này`

### Sync từ Cloudinary
- Nút `Sync Cloudinary`:
  - Kéo danh sách asset từ Cloudinary về `media_assets` trong Supabase
  - Dùng khi ảnh upload qua Cloudinary Console chưa hiện trong admin

### Merge media cũ trong data
- Nút `Merge Cloudinary`:
  - Quét media URL cũ từ `hero_video`, `blocks`, `hotspots`
  - Chỉ lấy URL Cloudinary
  - Upsert vào library (không trùng)

### Filter
- Tìm kiếm theo tên file/public_id
- Lọc nguồn:
  - `Cloudinary only`
  - `External only`
  - `Tất cả nguồn`
- Lọc loại file:
  - image / video / raw

### Thứ tự hiển thị
- Library sắp xếp `mới nhất trước` (newest first).

### Xóa media
- Bấm `Delete` trên card media
- Luồng xóa:
  1. Gọi Edge Function `media-library`
  2. Xóa file trên Cloudinary
  3. Xóa record trong bảng `media_assets`

---

## 6) Form ưu đãi (viewer)

Form có các lớp chống spam:
- Honeypot field ẩn (bot trap)
- Chặn submit quá nhanh
- Cooldown giữa các lần gửi
- Chặn trùng số điện thoại trong khoảng thời gian ngắn

Validation:
- Bắt buộc tên
- Số điện thoại đúng format VN
- Tick đồng ý điều khoản

---

## 7) Analytics / Event

Event đã chuẩn hóa thêm:
- `event_version`
- `source`
- `device`

Các event chính:
- `branch_view`
- `hotspot_click`
- `video_play`
- `cta_click`
- `lead_submit`

---

## 8) Checklist deploy quan trọng

### 8.1 Config frontend
Trong `config.js`:
- `pnjImportEndpoint`
- `mediaLibraryEndpoint`
- `adminAllowedOrigins`
- `cloudinaryCloudName`
- `cloudinaryUploadPreset`

### 8.2 Supabase Function
Deploy function:
- `pnj-product-import`
- `media-library`

Ví dụ:
```bash
supabase functions deploy media-library --project-ref yenfqqdllyjneqxwkrfp --no-verify-jwt
```

### 8.3 Secrets cho media-library
Phải set đủ:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `ADMIN_ALLOWED_ORIGINS`

Ví dụ:
```bash
supabase secrets set \
  CLOUDINARY_CLOUD_NAME=dhe7uziws \
  CLOUDINARY_API_KEY=YOUR_KEY \
  CLOUDINARY_API_SECRET=YOUR_SECRET \
  ADMIN_ALLOWED_ORIGINS=https://hau-hp.github.io \
  --project-ref yenfqqdllyjneqxwkrfp
```

---

## 9) Lỗi thường gặp & cách xử lý

### Lỗi `Failed to fetch` / CORS khi gọi `media-library`
- Nguyên nhân:
  - Chưa deploy function
  - Domain chưa trong allowlist
- Cách xử lý:
  - Deploy lại function
  - Kiểm tra `ADMIN_ALLOWED_ORIGINS` + `config.js`

### Lỗi `unknown_api_key`
- Nguyên nhân:
  - Sai Cloudinary key/secret hoặc không cùng product environment với cloud name
- Cách xử lý:
  - Set lại secrets đúng cặp key/secret
  - Deploy lại function

### Lỗi `Invalid Signature` khi delete
- Nguyên nhân:
  - Version function cũ
- Cách xử lý:
  - Deploy lại `media-library` bản mới nhất

### Upload Cloudinary thành công nhưng không thấy trong admin
- Bấm `Sync Cloudinary` để đồng bộ từ Cloudinary về library

---

## 10) Gợi ý vận hành

- Sau mỗi lần chỉnh nội dung lớn:
  1. Test viewer trên mobile
  2. Test popup hotspot
  3. Test form lead
  4. Test upload/sync/delete media trong admin
- Nên dùng `Media Library` để tái sử dụng ảnh/video, tránh upload trùng.
