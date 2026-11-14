# Đề bài vòng 4, gói 6, cho Phòng Nghiên cứu: sửa các câu lỗi thời, tách "đã sửa / đang làm / cần đo" trong bài báo và backlog

Gói nhỏ: **2 hạng mục + review, ngân sách 4M token**. Chỉ sửa:
- `docs/research/paper/paper.md`
- `improvement-backlog.md`
- `challenges.md`
- `facts.json`, `CHANGELOG.md`

Không sửa `src/` hay `bench/`. Phân loại dữ liệu: **Nội bộ**. Đọc tệp theo đoạn.

## Vì sao
Giám đốc (3/11 19:56): "các đề xuất đã có thì cứ sửa đi; đã là đề tài thì phải fix hết, không để đề xuất sửa."
- Phòng Dev đang làm D9 (`docs/research/BRIEF-D9.md`), gồm toàn bộ mục còn mở: B-03, B-07, B-08, B-09, B-12, B-13, B-14, B-16, B-17.
- Bài báo và backlog phải tách rõ ba nhóm: **đã sửa** (kèm commit), **đang làm ở D9**, và **việc cần đo**. Việc cần đo là việc cần chạy benchmark, không phải việc sửa.

## Hạng mục

**U1 — academic-writer (data-scientist kiểm): sửa câu lỗi thời và cập nhật trạng thái trong `paper.md`**
- **Câu lỗi thời cần sửa:**
  - "l1-modules, l2-chain chưa có `task.json`" (§6.1, §7.4, §8.1(5), §9): đã có từ 3/11, D8 `3ff7df3`, oracle 1,00, null ≤ 0,01. Còn thiếu là **chưa đo**, không phải chưa có bài.
  - "MAST mới đọc tóm tắt" (§8.2): gói 2 đã đọc toàn văn bản v3 (`related-work.md` §2.12).
  - Rà các câu khác có cùng kiểu: tìm "chưa có", "đề xuất", "chờ".
- **Kiểm trên mã nguồn trước khi ghi "đã sửa":**
  - Reviewer nhận diff kèm kết quả lệnh kiểm (P3, B-02): `src/prompts.ts` khoảng dòng 543.
  - Lỗi review không trỏ đúng hạng mục vẫn vào vòng sửa: `c55a249`.
  - Lệnh kiểm tra đỏ thì vào thẳng vòng sửa: B-02.
  - Cờ "cần xem": D-02.
  - Ghi commit và dòng mã cho từng mục.
- **§7.4 và §9 "Trước khi công bố cần":** viết lại thành ba nhóm.
  - **(a) Đã sửa:** kèm commit.
  - **(b) Đang làm ở D9:** liệt kê theo mã B-xx.
  - **(c) Cần đo:** B-14 chạy chẩn đoán; B-12 đo recall; B-15 arm B1 trên l1/l2; H6 với A1/A2 trên T5, l1, l2; B-16 thí điểm; nhãn người.

**U2 — research-lead: cập nhật trạng thái trong `improvement-backlog.md` và `challenges.md`**
- Bảng tổng quan backlog có thêm cột trạng thái: đã làm (commit) / D9 / cần đo / cần giám đốc duyệt.
- Mục nào chỉ còn bước đo thì ghi rõ "chỉ còn đo", kèm số lượt cần chạy theo đặc tả.
- `challenges.md`: các thách thức đã có bản sửa thì đổi trạng thái kèm commit, ví dụ P-14 (đã có κ, còn nhãn người).

**U3 — peer-reviewer: review U1, U2**
- Mỗi "đã sửa" có truy được về commit hoặc dòng mã không?
- Còn câu "đề xuất" nào thực ra đã làm xong không?
- Kiểm bằng "🧪 Lệnh kiểm tra của dự án".

## Không làm
- Không chạy benchmark.
- Không sửa phần số liệu của §6.
- Không làm slide.
