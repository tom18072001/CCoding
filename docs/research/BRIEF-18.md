# Đề bài vòng 4, gói 12, cho Phòng Nghiên cứu: script phân tích bước 2 của B-14; bài báo v0.6 theo D12; rà hai điểm chưa chốt

Gói vừa: **4 hạng mục + review, ngân sách 5M token**.
- **Được sửa:** `docs/research/` (gồm `paper/paper.md`, `facts.json`, `CHANGELOG.md`, `analysis/`, `context/`, `preregistration.md` §9) và `bench/vs-claude/results/*/RUNLOG.md`.
- **Không sửa:** `src/`, mã và cấu hình của `bench/`.
- Không chạy benchmark, không gọi `claude -p`. Không xem điểm E3, E4.
- Phân loại dữ liệu: **Nội bộ**.

## Căn cứ
- **D12 và BRIEF-17 đã gộp** (`57148de`, `f36a1d9`; HEAD `8c6d2d1`).
  - Trên Linux: `npm test` 415/415 chạy ba lần, `npm run test:bench` 245/245, các lệnh kiểm của dự án đều đạt.
  - `docs/research/analysis/d11-stats-edgecases.mjs` giờ import bản `stats.mjs` trước D12, đông cứng ở `analysis/vendor/`, để vẫn tái lập được K2 §10.
- **D12** sửa 23 mã của K2. Bảng "trước D12 → sau D12" ở `context/d12-stats-fixes-2026-11-04.md`. Hash mã thống kê dùng cho E6 đã ghi ở `results/local-3e/RUNLOG.md`, nên H6 dùng p của SR-26.
- **Giám đốc đã duyệt** (12:50 ngày 4/11):
  - **E5′:** sổ chạy `results/b15f-main/RUNLOG.md`, chạy sau E6.
  - **Bước 2 của B-14:** 96 lượt, chạy sau E5′.
- **Bước 2 của B-14 còn thiếu hai tiền điều kiện ở §9:**
  - Mục (6): script `docs/research/analysis/b14-step2.mjs` có test, commit và hash ghi trước lượt đầu. Nếu thiếu thì kết quả chỉ được báo mô tả.
  - Mục (7): bộ test lệnh ác ý cho chế độ `stablePrefix` (B-14 trường 7(c)) xanh trên commit ghim.

## Hạng mục

**K1 — data-scientist (methodologist kiểm): `analysis/b14-step2.mjs` và test**
- **Đọc:** `results/b14-step2/on/runs.jsonl` và `off/runs.jsonl`.
- **Tính đúng §9, mục "Đăng ký trước bước 2 của B-14", (5) và (6):**
  - T = trung bình theo bài của (TB ln bật − TB ln tắt);
  - p hai phía bằng `permStratified` với `alt: 'two'`, `margin: 0`, `M: 10000`, hạt 20261104;
  - CI 95 % của R = exp(T), bootstrap phân tầng 4000 vòng;
  - phán quyết "giảm", "tăng" hoặc "không phân biệt được";
  - các thước đo phụ (a)–(e);
  - loại lượt theo (8);
  - chỉ phân tích các cặp khối AB đủ cả hai nhánh nếu dừng giữa chừng.
- **Test bằng dữ liệu giả:**
  - hai nhánh y hệt nhau → "không phân biệt được";
  - nhánh bật giảm 20 % → "giảm";
  - thiếu khối → chỉ dùng cặp đủ;
  - lượt `status ≠ done` bị loại.
- Script **không đọc dữ liệu thật**, vì chưa có. Ghi hash commit của script vào `results/b14-step2/RUNLOG.md`, ở dòng sau dòng mốc khóa `8941103`.

**K2 — academic-writer (data-scientist kiểm số): bài báo v0.6**
- Cập nhật Bảng 10 và các số liên quan theo bảng "sau D12", mỗi ô một nguồn. Ghi rõ số nào đổi, và đổi do mã nào của K2 (T-1, A-1, A-2…).
- Thêm vào §5 hoặc §6 kết quả E3 ở mức quy trình: làn tự chọn không có pha họp, nên thiết kế lại thành E5′. Không dùng điểm E3.
- `facts.json` và `CHANGELOG.md` đồng bộ; `consistency-check` đạt.
- **Ẩn danh: chưa làm.** Giám đốc chưa chọn mức trong `context/anonymization-options-2026-11-04.md`, nên giữ tên như v0.5.

**K3 — methodologist: hai điểm còn treo**
- **(a) Arm null ăn điểm cao trên `t2-orders` (0,53) và `t4-perf` (0,84).** Đây là ghi chú QA của D11. Hai bài này thuộc tập 7 bài của H6 (E6 đang chạy trên `6c454f6`).
  - Đánh giá ảnh hưởng tới H6: độ nhạy của Δ, khả năng phân biệt.
  - Đề xuất xử lý **cho lần đo sau**, không đổi bài giữa đợt 3e.
  - Ghi §9 nếu cần.
- **(b) Bộ test lệnh ác ý cho `stablePrefix`.** Đối chiếu `test/claude-stable-prefix.test.ts` và `test/shell-policy-adversarial.test.ts` với danh sách của B-14 trường 7: `; rm`, `$(...)`, heredoc, `> tệp`, `tee`, `sed -i`, `awk 'BEGIN{system(...)}'`, `.env`.
  - Ca nào chưa có thì liệt kê cho Phòng Dev (D13 sẽ thêm).
  - Ghi kết luận vào `results/b14-step2/RUNLOG.md` mục tiền điều kiện.

**K4 — research-lead: cập nhật `improvement-backlog.md` và `run-plan.md`**
- **B-15:** E5′ đã đăng ký và duyệt, chạy sau E6.
- **B-14:** bước 2 đã duyệt, chờ K1 và K3(b).
- **Thứ tự còn lại của đợt 3e:** E4 → E6 → E5′ → B-14 bước 2.

**K5 — peer-reviewer: review K1–K4**
- Script K1 có gọi đúng hàm và đúng tham số như đã đăng ký không? Phải có test.
- Có câu nào trong v0.6 dựa vào điểm E3, E4 không? Phải không có.
- Kiểm bằng "🧪 Lệnh kiểm tra của dự án". `git status` sạch.

## Không làm
- Không chạy benchmark, không gọi `claude -p`, không xem điểm E3, E4.
- Không sửa `src/`, `bench/` (trừ `RUNLOG.md`).
- Không ẩn danh bài báo khi giám đốc chưa chọn mức.
