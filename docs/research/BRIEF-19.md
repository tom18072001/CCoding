# Phòng Nghiên cứu, vòng 4 gói 13: thẩm định V4-3f (G, P, khối B) và phân tích E4, E5′, E6; thẩm định bản chốt E7, E8

**Gói vừa: 3 hạng mục + review. Ngân sách 5M token.** Giao 12/11/2026, chạy song song bước 2 của B-14 (giám đốc 12/11 23:47: dùng tối đa hạn mức, chỉ cần kết quả cuối). Bài báo v0.7 (K2 cũ) và cập nhật backlog, deck (K4 cũ) chuyển sang BRIEF-20, giao khi B-14, E7, E8 có kết quả.
- **Được sửa:** `docs/research/` (gồm `paper/`, `facts.json`, `CHANGELOG.md`, `analysis/`, `context/`, `preregistration.md` §6 và §9) và `bench/vs-claude/results/*/RUNLOG.md`.
- **Không sửa:** `src/`, mã và cấu hình của `bench/`.
- Không chạy benchmark, không gọi `claude -p`.
- Phân loại dữ liệu: **Nội bộ**.

## Căn cứ
- **Giám đốc, 4/11 19:14:** "Bằng chứng hiện tại (1/1, 2/2) chưa đủ để kết luận gì. Đề tài chưa có số đo nào, và chính dữ liệu chi phí của CCoding còn đi ngược lợi ích của chạy song song. fix 2 vấn đề này".
- **Người điều phối đã làm, không gọi LLM.** Đăng ký trước ở §9 "Đăng ký trước V4-3f", mốc khóa `f5a31dc`.
  - **G:** cổng lệnh kiểm tra B-02 đo trên lỗi cài bằng máy, dựng từ artifact của `study-cloud`. Sổ chạy `results/g-mutation/RUNLOG.md`, sai lệch G-a.
  - **P:** song song trong vận hành thật, lấy metadata của server chính qua API đọc. Sổ chạy `results/p-parallel/RUNLOG.md`, sai lệch P-a.
  - **Khối B (khám phá):** harness bench chạy với `isolation: 'none'`, nên mọi hạng mục chạy lệnh làm lần lượt. Trong 18/42 lượt có từ 2 lượt gọi thực thi trở lên, không thấy lượt gọi nào chồng nhau đáng kể.
- **Phòng Dev đã sửa (D14, chờ CTO duyệt):**
  - `fastLane.requireParallel`: không chia việc khi không chạy song song được;
  - tùy chọn `--isolation worktree` cho harness.
- **Bản phản biện `wf-f01e23b8`:** cổng cần ≥ 30 lỗi độc lập; trục song song chưa có số đo; Nghị định 13/2023/NĐ-CP đã được thay bằng Nghị định 356/2025/NĐ-CP từ 01/01/2026.

## Hạng mục

**K1 — methodologist (data-scientist kiểm): thẩm định G và P**
- Chạy lại `g-analyze.mjs` và `p-analyze.mjs` từ tệp đã commit. Số in ra phải khớp RUNLOG.
- Kiểm script so với §9:
  - toán tử, lấy mẫu, điều kiện đủ;
  - bootstrap hai tầng, phép hoán vị;
  - G-a có đúng là quyết định trước khi tính G-1/G-2 không (đối chiếu giờ commit);
  - P-a có làm đổi thước đo nào ngoài phần lệnh đỏ không.
- Đánh giá đe dọa tính hợp lệ:
  - mutant không phải lỗi tự nhiên;
  - đơn vị độc lập là 9 bài;
  - G-3 đo bộ test, không đo CTO;
  - P là dữ liệu quan sát;
  - 27,5 % là cận trên.
- **Thêm (12/11): kiểm lại phân tích E4, E5′, E6** do người điều phối chạy bằng script:
  - script: `analysis/e4-analyze.mjs`, `e5f-analyze.mjs`, `h6-sensitivity.mjs`; `bench/vs-claude/analyze.mjs` cho H6;
  - báo cáo: `results/gates-main/report-e4.md`, `results/b15f-main/report.md`, `results/h6-3e/report.md` và `report-h6-sensitivity.md`;
  - quyết định lúc phân tích: §9, mục "Phân tích E4, E5′, E6…" (A1–A5).
  - Việc cần làm: chạy lại, số phải khớp. Đối chiếu script với đăng ký (5)–(8) của từng đợt. Có chỗ nào script làm khác đăng ký thì ghi rõ và sửa. Đánh giá A1–A5 có hợp lý không.
  - Cần đọc kỹ ba phát hiện:
    - CTO chặn 62/65 lượt sạch (gần như mọi lượt sạch ở bài lớn);
    - B7cab chặn 23/64 lượt đạt test ẩn, B7cabO chỉ 1/64 (khám phá);
    - R̂ của E5′ (0,722) giảm nhiều hơn phần token của riêng họp (10,7 %), vì B1F có ít hạng mục kế hoạch hơn (5,15 so với 5,95).
- Ghi vào `context/v43f-review-2026-11-12.md`.

**K1b — methodologist: đăng ký trước phép đo trục 2 (quản trị), không gọi LLM**
- Hiện trục 2 chưa có số đo nào. 27 lệnh tấn công trong test do nhóm tự viết.
- **Thiết kế và ghi §9 trước khi tính:**
  - (a) tỉ lệ chặn nhầm của bộ kiểm lệnh (`src/tools/shell-policy.ts`, `claude-guard.ts`) trên **lệnh thật agent đã chạy**, lấy từ nhật ký sẵn có (sự kiện của hook, `calls.jsonl` của các đợt đo; chỉ đọc qua API hoặc từ thư mục kết quả đã commit), có người gán nhãn lệnh nào đáng chặn;
  - (b) tỉ lệ chặn đúng trên một **bộ lệnh tấn công do bên ngoài viết** (ví dụ ca lệnh của AgentDojo hay AIShellJack, nếu giấy phép cho dùng), chạy qua đúng hàm thật như `scripts/replay-guard-deny.mjs`.
- Báo n, Clopper–Pearson. Không chạy sandbox thật khi giám đốc chưa đăng nhập WSL.

**K3 — methodologist: thẩm định bản chốt E7 và E8**
- Giám đốc đã duyệt chạy E7 và E8 (5/11 khoảng 10:05). Người điều phối đã ghi bản chốt ở §9 ("Bản chốt E7 và E8", v2.6) trước mọi lượt gọi LLM, vì đợt đo cần mốc khóa trước khi lấy mẫu trên máy chạy.
- Việc của K3 là thẩm định, không viết lại:
  - E7: trần 10 mỗi bài; quy tắc kiểm lại nhãn (3 lần cho mục lỗi); thay mục dự phòng; cắt mục đúng cho ghép cặp; định nghĩa R3 (cùng văn bản, bỏ hồ sơ CTO); "không đọc được kết luận" tính là không chặn; McNemar chính xác.
  - E8: σ_ln = 0,178 (df 24, lệch xuống do làm tròn 10 s), giữ 0,25 và 6 lượt mỗi ô; thước đo chính `wallSecTask`; kiểm B6w1 không chạy chồng.
- Thấy lỗi thiết kế thì ghi thành sai lệch ở §9 kèm giờ và lý do. Chỉ được sửa khi E7 hoặc E8 chưa có lượt gọi nào; nếu đã có thì chỉ ghi, không sửa.
- Ghi chú cho K1: bộ test ẩn của `t5-logq` cho số test khác nhau giữa các lần chạy (123–146 với cùng mã). Hai lỗi G-4 của bài này không tái lập được. Cần đánh giá ảnh hưởng tới G-3 của `t5-logq`.

**K5 — peer-reviewer:** review K1, K1b, K3.
- Có câu nào dựa vào điểm của B-14 bước 2, E7 hay E8 không? Phải không có, vì các đợt này chưa có kết quả.
- Có số nào không có nguồn không?
- Kiểm bằng "🧪 Lệnh kiểm tra của dự án". `git status` sạch.

## Không làm
- Không chạy benchmark, không gọi `claude -p`. Không mở `results/b14-step2`, `e7-cto` (trừ `items.json`, `RUNLOG.md`) hay `e8-parallel` khi các đợt này đang chạy.
- Không sửa `src/`, `bench/` (trừ `RUNLOG.md`).
