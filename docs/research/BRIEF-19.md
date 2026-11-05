# Phòng Nghiên cứu, vòng 4 gói 13: thẩm định V4-3f (G, P, khối B); bài báo v0.7 theo ba trục; chốt E7, E8

**Gói vừa: 4 hạng mục + review. Ngân sách 5M token.** Giao **sau khi đợt 3e chạy xong**, để không tranh hạn mức với đợt đo.
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
- Ghi vào `context/v43f-review-2026-11-0x.md`.

**K1b — methodologist: đăng ký trước phép đo trục 2 (quản trị), không gọi LLM**
- Hiện trục 2 chưa có số đo nào. 27 lệnh tấn công trong test do nhóm tự viết.
- **Thiết kế và ghi §9 trước khi tính:**
  - (a) tỉ lệ chặn nhầm của bộ kiểm lệnh (`src/tools/shell-policy.ts`, `claude-guard.ts`) trên **lệnh thật agent đã chạy**, lấy từ nhật ký sẵn có (sự kiện của hook, `calls.jsonl` của các đợt đo; chỉ đọc qua API hoặc từ thư mục kết quả đã commit), có người gán nhãn lệnh nào đáng chặn;
  - (b) tỉ lệ chặn đúng trên một **bộ lệnh tấn công do bên ngoài viết** (ví dụ ca lệnh của AgentDojo hay AIShellJack, nếu giấy phép cho dùng), chạy qua đúng hàm thật như `scripts/replay-guard-deny.mjs`.
- Báo n, Clopper–Pearson. Không chạy sandbox thật khi giám đốc chưa đăng nhập WSL.

**K2 — academic-writer (data-scientist kiểm số): bài báo v0.7**
- **Dựng lại đóng góp quanh ba trục.** Mỗi trục ghi số đo và giới hạn:
  - (1) nghiệm thu bằng kiểm chứng thật, với G-1, G-2, G-3, G-3Δ;
  - (2) khung quản trị, với hiện trạng và việc còn thiếu;
  - (3) song song an toàn, với P-1, P-2, P-3, kèm câu "bench đo chi phí chia việc mà không có song song".
- **Kết quả chi phí đã đăng ký trước** giữ nguyên và giữ làm kết quả chính.
- **§6:** thêm hai đe dọa:
  - harness bench `isolation: none` khác cấu hình vận hành;
  - `wallSec` của arm CCoding làm tròn lên theo vòng hỏi 10 s (lệch khoảng 5 s mỗi lượt), nên tỉ số thời gian ở Bảng chi phí bị lệch lên một chút.
- **Thay Nghị định 13/2023/NĐ-CP bằng Nghị định 356/2025/NĐ-CP** ở mọi chỗ: bài báo, `facts.json`, tài liệu trong `docs/`. Ghi rõ có hiệu lực từ 01/01/2026.
- `facts.json` và `CHANGELOG.md` đồng bộ; `consistency-check` đạt.

**K3 — methodologist: thẩm định bản chốt E7 và E8**
- Giám đốc đã duyệt chạy E7 và E8 (5/11 khoảng 10:05). Người điều phối đã ghi bản chốt ở §9 ("Bản chốt E7 và E8", v2.6) trước mọi lượt gọi LLM, vì đợt đo cần mốc khóa trước khi lấy mẫu trên máy chạy.
- Việc của K3 là thẩm định, không viết lại:
  - E7: trần 10 mỗi bài; quy tắc kiểm lại nhãn (3 lần cho mục lỗi); thay mục dự phòng; cắt mục đúng cho ghép cặp; định nghĩa R3 (cùng văn bản, bỏ hồ sơ CTO); "không đọc được kết luận" tính là không chặn; McNemar chính xác.
  - E8: σ_ln = 0,178 (df 24, lệch xuống do làm tròn 10 s), giữ 0,25 và 6 lượt mỗi ô; thước đo chính `wallSecTask`; kiểm B6w1 không chạy chồng.
- Thấy lỗi thiết kế thì ghi thành sai lệch ở §9 kèm giờ và lý do. Chỉ được sửa khi E7 hoặc E8 chưa có lượt gọi nào; nếu đã có thì chỉ ghi, không sửa.
- Ghi chú cho K1: bộ test ẩn của `t5-logq` cho số test khác nhau giữa các lần chạy (123–146 với cùng mã). Hai lỗi G-4 của bài này không tái lập được. Cần đánh giá ảnh hưởng tới G-3 của `t5-logq`.

**K4 — research-lead:** cập nhật `improvement-backlog.md` và `run-plan.md` (E7, E8 sau đợt 3e) và deck PL7 theo v0.7.

**K5 — peer-reviewer:** review K1–K4.
- Có câu nào dựa vào điểm E3 hoặc E4 không? Phải không có.
- Có số nào không có nguồn không?
- Kiểm bằng "🧪 Lệnh kiểm tra của dự án". `git status` sạch.

## Không làm
- Không chạy benchmark, không gọi `claude -p`, không xem điểm E3, E4, E5′, E6 trước khi đợt 3e có kết quả chính thức.
- Không sửa `src/`, `bench/` (trừ `RUNLOG.md`).
