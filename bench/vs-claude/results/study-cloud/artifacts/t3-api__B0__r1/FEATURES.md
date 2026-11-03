# Yêu cầu tính năng — đợt 0.4

Bốn tính năng dưới đây làm trên API hiện có (`src/`, Node thuần, không thêm thư viện ngoài). Giữ nguyên `createServer({ seed?, now? })` và các route hiện có trừ chỗ được nêu đổi. Lỗi luôn trả JSON `{ "error": { "code": "...", ... } }` như `src/http.js`.

Thứ tự kiểm tra cho mọi route `/tasks…` và `/audit`: **xác thực (401)** → **tham số truy vấn (400)** → **tồn tại/quyền đọc (404)** → **quyền thao tác (403)** → **validate body (400)**.

## 1. Xác thực & phân quyền

- Mọi route `/tasks…` và `/audit` cần header `X-User: <id người dùng>` (người trong `seed.users`). Thiếu hoặc không tồn tại → `401 { error: { code: "UNAUTHENTICATED" } }`.
- Vai trò:
  - **admin**: làm mọi việc.
  - **manager**: đọc mọi nhiệm vụ của mọi nhóm. Tạo nhiệm vụ chỉ cho nhóm mình (`team` khác nhóm mình → 403). Sửa mọi trường của nhiệm vụ thuộc nhóm mình (nhiệm vụ nhóm khác → 403); không được chuyển nhiệm vụ sang nhóm khác (`team` khác nhóm mình → 403). Không được xóa (403).
  - **member**: chỉ **thấy** nhiệm vụ của nhóm mình — danh sách/xuất CSV tự lọc theo nhóm mình; `GET`/`PATCH`/`DELETE` nhiệm vụ nhóm khác → **404** (không lộ sự tồn tại). Không được tạo (403), không được xóa (403). Chỉ sửa được nhiệm vụ **giao cho chính mình** (`assignee` = mình) và chỉ trường `status`; body có trường khác `status` (kể cả trùng giá trị cũ) hoặc nhiệm vụ không giao cho mình → 403.
- Cấm → `403 { error: { code: "FORBIDDEN" } }`.

## 2. Danh sách nhiệm vụ: lọc, tìm, sắp xếp, phân trang

`GET /tasks` đổi dạng kết quả thành `{ "items": [...], "total": <số nhiệm vụ khớp bộ lọc>, "page": <n>, "pageSize": <n> }`.

Tham số truy vấn (mọi tham số đều tùy chọn; **tham số không có trong danh sách này** hoặc **xuất hiện hai lần** → 400):

| Tham số | Ý nghĩa |
|---|---|
| `status` | một hoặc nhiều giá trị cách nhau bởi dấu phẩy, mỗi giá trị ∈ `todo`, `doing`, `done` (vd. `todo,doing`) |
| `assignee` | id người được giao; giá trị đặc biệt `none` = chưa giao ai |
| `team` | `A` hoặc `B` |
| `q` | tìm trong `title`: không phân biệt hoa/thường **và không phân biệt dấu tiếng Việt** (chuẩn hóa NFD, bỏ dấu kết hợp, `đ`/`Đ` → `d`); khớp chuỗi con. `q` rỗng (`q=`) = không lọc |
| `dueBefore` | `YYYY-MM-DD` (ngày hợp lệ theo lịch); chỉ lấy nhiệm vụ có `dueDate` ≤ ngày này (nhiệm vụ không có `dueDate` bị loại) |
| `sort` | một trường trong `createdAt`, `dueDate`, `priority`, `title`; tiền tố `-` = giảm dần. Mặc định `createdAt` tăng dần. Hòa → theo `id` **tăng dần theo số** (`t2` < `t10`) bất kể chiều sắp. Với `dueDate`: nhiệm vụ không có `dueDate` luôn nằm **cuối** (cả tăng lẫn giảm). `title` so bằng `localeCompare` với locale `vi` |
| `page` | số nguyên ≥ 1, mặc định 1 |
| `pageSize` | số nguyên 1–100, mặc định 20 |

- Giá trị không hợp lệ (status lạ, team lạ, ngày sai dạng hoặc không có thật như `2026-02-30`, sort lạ, page/pageSize không phải số nguyên trong miền — `"1.5"`, `"0"`, `"abc"`, `"101"`) → `400 { error: { code: "INVALID_QUERY", field: "<tên tham số>" } }`. Nhiều lỗi thì báo tham số **đầu tiên theo thứ tự xuất hiện trên URL**.
- `page` vượt quá số trang → `items: []` (vẫn 200, `total` đúng).
- Member: bộ lọc nhóm của chính mình luôn được áp thêm (nếu member truyền `team` của nhóm khác thì kết quả rỗng, không lỗi).

## 3. Xuất CSV

`GET /tasks/export.csv` — cùng bộ lọc, tìm kiếm, sắp xếp và quyền như danh sách nhưng **không phân trang** (`page`/`pageSize` → 400 `INVALID_QUERY`).

- Header HTTP: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="tasks.csv"`.
- Nội dung bắt đầu bằng BOM UTF-8 (`﻿`), dòng tiêu đề `id,title,status,priority,assignee,team,dueDate,createdAt`, mỗi nhiệm vụ một dòng; xuống dòng `\r\n`, kể cả sau dòng cuối.
- Chuẩn RFC 4180: trường chứa `,` `"` `\r` hoặc `\n` được bọc trong `"…"` và `"` bên trong nhân đôi. `null` → ô trống.
- Chống chèn công thức: giá trị **chuỗi** bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc `\r` được thêm `'` ở đầu (trước khi bọc ngoặc kép). Số (`priority`) giữ nguyên.

## 4. Nhật ký thao tác

- Mỗi thao tác ghi **thành công** (`POST /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id`) thêm một mục: `{ seq, at, userId, action, taskId, changes }` — `seq` tăng dần từ 1; `at` = `now().toISOString()` (đồng hồ của `createServer`); `action` ∈ `create`, `update`, `delete`; `changes` = danh sách tên trường đã đổi giá trị, sắp xếp a→z (`create`: các trường có trong body; `update`: chỉ trường có giá trị mới khác giá trị cũ; `delete`: `[]`). Thao tác lỗi không ghi.
- `GET /audit` — chỉ admin (người khác → 403). Kết quả `{ "items": [...] }` mới nhất trước (theo `seq` giảm dần). Tham số tùy chọn `taskId` để lọc; tham số khác → 400 `INVALID_QUERY`.
