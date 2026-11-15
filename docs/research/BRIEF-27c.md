# Phòng Nghiên cứu, gói 20c: đóng 4 minor của phản biện 27b

**Gói nhỏ: 2 hạng mục. Ngân sách 2M token.** Giao 15/11/2026. Việc nối của BRIEF-27b (T-20261115-183600-9c6): làm tiếp trên nhánh `ccoding/t-20261115-183600-9c6`.

**Căn cứ:** biên bản CTO của BRIEF-27b. Chưa nghiệm thu vì hai lý do.
- **Biên bản K4 chưa nguyên văn.** Người điều phối đã chép nguyên văn vào `docs/research/context/e7b-peer-review-2026-11-15.md` (commit `3d78a92b` trên nhánh); việc này xong.
- **Phản biện K3 của 27b nêu 4 minor mới:**
  1. `paper.md:924` dẫn `preregistration.md:1606`; căn cứ đúng cho "16 lượt (R1 8, R2 8)" là `preregistration.md:1169` và `:1171`.
  2. `paper.md:959` lặp lại cặp recall 61/64 và 60/64 đã nêu ở trên.
  3. `paper.md:954` chưa ghi rõ gói: "Sonnet (R1b, trần 6)".
  4. `facts.json` chưa có khóa cho "R2b 0/9" ở `t5-logq` và cho "6 trong 10" mục chỉ R1b chặn.
- **`consistency-check.mjs`** chưa được chạy sau các sửa của 27b.
- **Câu "bootstrap lấy mẫu theo 8 bài"** chưa có dòng nguồn: cần dẫn tới chỗ định nghĩa bootstrap hai tầng theo bài ở §9 E7b (g) và tới hàm bootstrap trong `e7b-analyze.mjs`.

**Phạm vi:**
- **Được sửa:** `docs/research/paper/paper.md`, `docs/research/facts.json`, `docs/research/CHANGELOG.md`.
- **Không sửa:** `preregistration.md`, `preregistration.lock.json`, `docs/research/analysis/e7b-analyze.mjs`, `bench/`, `src/`, `docs/research/context/e7b-peer-review-2026-11-15.md`. Không đổi số nào của `report.md`.
- **Không chạy LLM để đo.** Tệp nháp chỉ đặt trong `.scratch/`.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:**
- Mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề. K2 giao cho `@peer-reviewer`, chỉ đọc.
- Mô tả hạng mục của vai chỉ đọc không nhắc tới việc thực thi lệnh, test hay script, kể cả bằng câu phủ định.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run lint`, `npm run test:research`.

## Hạng mục

**K1 — data-scientist: sửa 4 minor, dẫn nguồn bootstrap, chạy kiểm nhất quán**
- Sửa 1–4 như ở căn cứ. Báo cáo ghi tệp:dòng trước và sau cho từng điểm.
- Câu "bootstrap lấy mẫu theo 8 bài" dẫn tới §9 E7b (g) (`preregistration.md`, tệp:dòng) và tới hàm bootstrap trong `e7b-analyze.mjs` (tên hàm và dòng).
- Thêm khóa vào `facts.json` cho mọi số mới, giá trị lấy từ `report.md`/`report.json`.
- Chạy `node docs/research/scripts/consistency-check.mjs`, ghi đầu ra vào báo cáo; sửa mọi chỗ lệch trong phạm vi.
- CHANGELOG ghi 4 điểm.

**K2 — peer-reviewer: phản biện (chỉ đọc)**
- Dòng đầu: `**Kết luận:** Đạt`, `Sửa nhỏ` hoặc `Chưa đạt`.
- **Đọc và đối chiếu:**
  - 4 điểm đã đóng, kèm tệp:dòng;
  - số trong `paper.md` §6.7 khớp `report.md` và `facts.json`;
  - không câu nào vượt nhãn P1 "chưa phân biệt được", P2 "chưa kết luận", hay viết hiệu của riêng model;
  - không có tệp ngoài phạm vi.
