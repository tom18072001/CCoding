# Phản biện K4 của E7b (BRIEF-27, 15/11/2026): CHƯA PHẢI NGUYÊN VĂN, chờ chép từ bản gốc

Phân loại dữ liệu: **Nội bộ**.

> **Trạng thái: chưa phải nguyên văn, chờ chép từ bản gốc.** Tệp này **không** phải bản sao phản biện của K4. Nội dung bên dưới chỉ gồm kết luận và 8 điểm minor như BRIEF-27b (T-20261115-183600-9c6) đã nêu; không dựng lại lập luận, trích dẫn hay chi tiết nào của K4.

- **Nguồn gốc cần chép:** `.ccoding/T-20261115-172258-bab/outputs/research-S5-peer-reviewer.md` (nhiệm vụ BRIEF-27, hạng mục S5, `@peer-reviewer`, 15/11/2026).
- **Đã thử đọc (15/11/2026, gói 20b, S1):** đường dẫn trên, trong worktree `wt-T-20261115-183600-9c6--S1`. Kết quả: **không có tệp** (thư mục `.ccoding/T-20261115-172258-bab/` không tồn tại; chỉ có `.ccoding/T-20261115-183600-9c6/inputs/`). `NHIEM-VU-TRUOC.md` dòng 136 xác nhận nội dung đầy đủ chỉ nằm ở tệp nguồn đó.
- **Việc còn mở:** Tom hoặc người điều phối chép nguyên văn bản gốc vào tệp này (đầu tệp ghi nguồn, ngày, BRIEF-27), rồi bỏ nhãn "chưa phải nguyên văn".
- **Tên tệp:** `e7b-peer-review-2026-11-15.md` theo BRIEF-27b, thay cho tên cũ `k4-e7b-review-2026-11-15.md` ở `NHIEM-VU-TRUOC.md` dòng 136.

## Kết luận (theo BRIEF-27b)

**Sửa nhỏ (0 blocker, 0 major, 8 minor).**

## 8 minor (theo BRIEF-27b; không phải trích nguyên văn)

1. `paper.md:924` ghi "Hai lượt E7 từng bị phân loại lại (lỗi 403)", trong khi §9 ghi 16 lượt (R1 8, R2 8; `preregistration.md:1169`, `:1606`). Câu "không dùng ở đây" dễ hiểu sai: cột E7 dùng lượt chạy lại, chỉ không dùng bản ghi ban đầu.
2. Mức bằng chứng vai CTO: "vừa" ở `paper.md:774`, "Thấp" ở `model-per-role.md:21`, mà "Thấp" không có trong thang của tệp (`:9`, Vừa / Yếu / Không có).
3. `paper.md:955` "chênh lệch chính nằm ở chặn nhầm" đọc như khẳng định có khác biệt, trong khi nhãn P2 là "chưa kết luận".
4. `paper.md:915`, `:956`, `model-per-role.md:76`: 6 trong 10 cặp "chỉ R1b chặn" của P2 nằm ở `t5-logq`; bootstrap lấy mẫu theo 8 bài, nên thêm mục trong cùng 8 bài khó làm CI hẹp lại; việc tiếp theo phải ưu tiên tăng số **bài**; phân tích bỏ `t5-logq` (nếu có) chỉ là [Khám phá], đăng ký riêng.
5. `paper.md:952–957` chưa trả lời trực tiếp (a)(i), (ii) đã đăng ký (`preregistration.md:1521–1523`): (i) cận dưới CP chặn nhầm R1b là 11,3 % > 10 %; (ii) điều kiện (1), (2) của nhánh A thỏa, với **gói** "Opus + trần 16"; cả hai đều là câu trả lời mô tả.
6. `preregistration.md:1804` ghi khối "chưa vào lock" nhưng S4 đã khóa (sha `7d114203…`). Khối đã khóa không sửa được; ghi ở CHANGELOG.
7. `paper.md:926–934` chưa nêu các khoảng còn mở của `e7b-verify.md:105–106`.
8. `analysis/e7b-verify.md:38`: cách suy "13 − 3 = 10" khó theo dõi; viết lại theo dạng "R1b chặn 13 mục đúng, cả hai chặn 3, chỉ R1b chặn 10".

Cách đã xử lý 8 điểm: xem `CHANGELOG.md`, mục gói 20b (T-20261115-183600-9c6).
