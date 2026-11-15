# Phòng Nghiên cứu, gói 20b: sửa 8 minor của phản biện E7b; lưu phản biện; kiểm test m1

**Gói nhỏ: 3 hạng mục. Ngân sách 3M token.** Giao 15/11/2026. Việc nối của BRIEF-27 (T-20261115-172258-bab): làm tiếp trên nhánh `ccoding/t-20261115-172258-bab`.

**Căn cứ:** biên bản CTO của BRIEF-27. Chưa nghiệm thu: số trong bài chưa khớp nguồn ở hai chỗ, và còn 8 minor của phản biện K4.
- **Phần chính đã đạt:** phân tích đúng RUNBOOK, nhánh (h) = F, nhãn P1 "chưa phân biệt được", P2 "chưa kết luận".
- **Tái lập:** người điều phối đã chạy lại `e7b-analyze.mjs` trên Linux, ra đúng byte với `report.md` (`1ea7deea…`) và `report.json` (`cc51ec64…`). Không cần làm lại.
- **8 minor của K4** (`outputs/research-S5-peer-reviewer.md` của nhiệm vụ BRIEF-27, mục Minor):
  1. `paper.md:924` ghi "Hai lượt E7 từng bị phân loại lại (lỗi 403)", trong khi §9 ghi 16 lượt (R1 8, R2 8; `preregistration.md:1169`, `:1606`). Câu "không dùng ở đây" dễ hiểu sai: cột E7 dùng lượt chạy lại, chỉ không dùng bản ghi ban đầu.
  2. Mức bằng chứng vai CTO: "vừa" ở `paper.md:774`, "Thấp" ở `model-per-role.md:21`, mà "Thấp" không có trong thang của tệp (`:9`, Vừa / Yếu / Không có).
  3. `paper.md:955` "chênh lệch chính nằm ở chặn nhầm" đọc như khẳng định có khác biệt, trong khi nhãn P2 là "chưa kết luận".
  4. `paper.md:915`, `:956`, `model-per-role.md:76`:
     - 6 trong 10 cặp "chỉ R1b chặn" của P2 nằm ở `t5-logq`;
     - bootstrap lấy mẫu theo 8 bài, nên thêm mục trong cùng 8 bài khó làm CI hẹp lại;
     - việc tiếp theo phải ưu tiên tăng số **bài**;
     - phân tích bỏ `t5-logq` (nếu có) chỉ là [Khám phá], đăng ký riêng.
  5. `paper.md:952–957` chưa trả lời trực tiếp (a)(i), (ii) đã đăng ký (`preregistration.md:1521–1523`):
     - (i): cận dưới CP chặn nhầm R1b là 11,3 % > 10 %;
     - (ii): điều kiện (1), (2) của nhánh A thỏa, với **gói** "Opus + trần 16";
     - cả hai đều là câu trả lời mô tả.
  6. `preregistration.md:1804` ghi khối "chưa vào lock" nhưng S4 đã khóa (sha `7d114203…`). Khối đã khóa không sửa được; ghi ở CHANGELOG.
  7. `paper.md:926–934` chưa nêu các khoảng còn mở của `e7b-verify.md:105–106`.
  8. `analysis/e7b-verify.md:38`: cách suy "13 − 3 = 10" khó theo dõi; viết lại theo dạng "R1b chặn 13 mục đúng, cả hai chặn 3, chỉ R1b chặn 10".
- **Phản biện K4 chưa được lưu vào repo;** phải lưu ở `docs/research/context/`.
- **Test m1 (BRIEF-27 K1)** kiểm theo `name` chứ không theo `msg`, và chưa thử đảo nhánh.

**Phạm vi:**
- **Được sửa:** `docs/research/paper/paper.md`, `docs/research/analysis/decisions/model-per-role.md`, `docs/research/analysis/e7b-verify.md`, `docs/research/CHANGELOG.md`, `docs/research/facts.json`, `docs/research/context/`, `docs/research/analysis/e7b-analyze.test.mjs`.
- **Không sửa:** `preregistration.md`, `preregistration.lock.json`, `docs/research/analysis/e7b-analyze.mjs`, `bench/`, `src/`. Không đổi số nào của `report.md`.
- **Không chạy LLM để đo.** Tệp nháp chỉ đặt trong `.scratch/`.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:**
- Mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề. K3 giao cho `@peer-reviewer`, chỉ đọc.
- Mô tả hạng mục K1 không nhắc tới việc thực thi lệnh, test hay script (vai biên tập không có công cụ chạy lệnh).
- Mô tả hạng mục của vai chỉ đọc không nhắc tới việc thực thi lệnh, test hay script, kể cả bằng câu phủ định.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run lint`, `npm run test:research`.

## Hạng mục

**K1 — academic-writer: sửa minor 1–8, lưu biên bản K4**
- Sửa đủ 1–8 theo đề xuất của K4 ở căn cứ, mỗi điểm ghi tệp:dòng trước và sau trong báo cáo. Mức bằng chứng dùng đúng thang của `model-per-role.md`; mức chắc chắn của câu trả lời ghi riêng.
- Chép nguyên văn phản biện K4 của BRIEF-27 vào `docs/research/context/e7b-peer-review-2026-11-15.md`.
- `CHANGELOG.md` ghi 8 điểm và việc khóa khối "Sai lệch thực thi và phân tích E7b" ở BRIEF-27 S4 (sha `7d114203…`). `facts.json` đồng bộ nếu đổi câu có số.

**K2 — data-scientist: siết test m1**
- Hai test QH11 trong `e7b-analyze.test.mjs` kiểm cả `msg` của lỗi kiểm (nhánh "giá trị lạ" và nhánh "thiếu ở dòng done").
- Thử đảo: sửa tạm ca dữ liệu để đi nhánh kia ⇒ test đỏ; trả lại ⇒ xanh. Ghi kết quả vào báo cáo.
- Không sửa `e7b-analyze.mjs`.

**K3 — peer-reviewer: phản biện (chỉ đọc)**
- Dòng đầu: `**Kết luận:** Đạt`, `Sửa nhỏ` hoặc `Chưa đạt`.
- **Đọc và đối chiếu:**
  - từng minor 1–8 đã đóng, kèm tệp:dòng;
  - không câu nào vượt nhãn ("chưa kết luận", "chưa phân biệt được") hay viết hiệu của riêng model;
  - số trong bài vẫn khớp `report.md` và `facts.json`;
  - không có tệp ngoài phạm vi.
