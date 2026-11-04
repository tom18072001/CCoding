# Phòng Dev, D12: sửa mã thống kê theo thẩm định K2; thêm giá Haiku 5.5; thêm hai arm ép làn đầy đủ

**Nhiệm vụ vừa, ba phần độc lập.** Trưởng phòng chạy song song K1, K2, K3. K4 làm sau cùng.
- Ngân sách: 8M token.
- Nhánh `perf/vs-claude-loop`. Phân loại dữ liệu: **Nội bộ**.
- **Gấp:** E6 trên máy giám đốc đang chờ bản sửa T-1. Kịch bản `run3e-b.ps1` dừng trước E6a cho tới khi D12 gộp và hash đã ghi RUNLOG, theo V4-3e-E6 (6). Dự kiến E4 xong vào chiều 4/11.

## Căn cứ
- **Thẩm định K2 của Phòng Nghiên cứu** (`docs/research/context/k2-stats-review-2026-11-04.md`, BRIEF-16):
  - Mục 2 có 24 phát hiện trong `bench/vs-claude/lib/stats.mjs` và `bench/vs-claude/analyze.mjs`: T-1…T-6, B-1…B-4, C-1, C-2, S-1, S-2, P-1, P-2, A-1…A-7.
  - Mục 3 và 10.2 có 12 ca biên F1–F12, kèm đầu ra hiện tại và chỗ lệch đăng ký.
  - Câu chốt: "**T-1 phải sửa trước V4-3e-E6.**" CTO của BRIEF-16 giao việc này cho Phòng Dev, có người đọc mã độc lập (N-2).
- **Giám đốc (3/11 19:56):** "đã là đề tài thì phải fix hết, không để đề xuất sửa". Vì vậy làm cả các mục minor.
- **E3** (`bench/vs-claude/results/large-pilot/RUNLOG.md`):
  - `costUsd` của arm CCoding là `null` với `unknown-model`, vì `lib/pricing.mjs` chưa có `claude-haiku-5-5`.
  - B0 không có pha họp trên `l1-modules` và `l2-chain`, vì làn tự chọn là nhanh hoặc đơn. Phòng Nghiên cứu đang thiết kế lại E5 (BRIEF-17) và cần arm ép làn đầy đủ.

## Hạng mục

**K1: sửa mọi phát hiện ở mục 2 của K2.** Chỉ sửa trong `bench/vs-claude/lib/stats.mjs`, `bench/vs-claude/analyze.mjs` và test của chúng.

- **Ưu tiên một: T-1 và B-1.** Theo `preregistration.md` §2.5 v2.1 (c):
  - Phân phối bootstrap hay hoán vị suy biến thì **không bao giờ** cho `equivalent = true` hay p = 1/(B + 1). Kết quả là p = NA, nhãn "không kết luận (suy biến)".
  - Điểm không hữu hạn (NaN) cũng tính là suy biến.
  - Áp cho `tost` (H2, H6, B-01), `bootP`, `h6Combine`, và nhãn H6 trong `analyze.mjs`. Nhãn H6 phải lấy từ `h6Combine`, không lấy từ `h6.equiv` (C-2).
- **Phần còn lại:**
  - T-2: B-01 dùng **trung bình log-tỉ số theo bài**, như P:80 và `prereg-tests.mjs`.
  - T-3, T-6: quy tắc trần ≥ 0,99 và cổng ≥ 3 bài cho B-01 (c).
  - T-4: phân vị.
  - T-5: NaN.
  - B-2: nhãn "Bác bỏ" khi CI nằm hẳn ngoài biên.
  - B-3: ghi chú CI một tầng.
  - B-4: thống nhất cách phân tầng, hoặc ghi rõ lý do giữ khác.
  - C-1: báo lỗi khi thiếu `arm`.
  - S-1: trần có margin ở `permStratified`. Áp cách bảo thủ giống H6 v2.1 (b): loại bài trần, rồi kiểm suy biến. Ghi rằng quy tắc này **chờ Phòng Nghiên cứu đăng ký** trước khi khóa H1′, H2′.
  - S-2: test hai phía.
  - P-1: H3 đăng ký đúng 1 bài s1, nên bỏ cổng ≥ 3 bài cho H3.
  - P-2: chặn kích thước, chuyển Monte Carlo M = 10 000, hạt 20261102 khi ∏ C > 10⁶.
  - A-1: H7 có cổng r ≥ 5 và ≥ 3 bài như P:174. Tỉ số SD gộp 0/0 hay sd gộp = 0 thì ra "suy biến", không SUPPORTED. Giữ phép cũ làm độ nhạy (V4-K2-1).
  - A-2: H1 theo danh sách cố định c3, c4, c5, r1 (P:181); giữ cách lọc `size` làm độ nhạy.
  - A-3: H9 đọc `citationValidityOf`.
  - A-4: `verdict()` tách "bác bỏ" và "không kết luận".
  - A-5: mỗi giả thuyết một luồng ngẫu nhiên riêng từ hạt đã đăng ký.
  - A-6: phân vị CI 95 %.
  - A-7: báo cáo ghi rõ khi chạy với `--allow-mixed-judge`.
- **Test hồi quy:**
  - Mười hai ca F1–F12 thành test trong `bench/vs-claude/test/`.
  - Đầu ra kỳ vọng lấy **theo quy tắc đã đăng ký**, không theo đầu ra hiện tại. F1 phải không `equivalent`; F7 phải p = null; F11 phải không `confirmable`; F12 phải cho est ≈ 0,3466.
  - Không đổi biên, ngưỡng, B hay hạt đã đăng ký.
- **Không đổi số công bố một cách âm thầm:**
  - Chạy lại `analyze.mjs` trên `results/study-cloud`, `study-cloud-final`, `b7prime`.
  - Ghi bảng "số trước D12 → số sau D12 → mã phát hiện" vào `docs/research/context/d12-stats-fixes-2026-11-04.md`, cho Phòng Nghiên cứu.
  - **Không sửa** `docs/research/paper/`, `preregistration.md`, `facts.json`.
- **Người đọc mã độc lập:**
  - Một agent **khác người viết** đọc diff K1.
  - Người này tự suy lại kỳ vọng F1–F12 từ văn bản `preregistration.md` §2.4–§2.7, không chép từ test.
  - Kết luận ghi trong tài liệu D12.

**K2: giá Haiku 5.5 trong `bench/vs-claude/lib/pricing.mjs`.**
- **Lấy giá từ trang chính thức**, không lấy từ bài viết bên thứ ba:
  - https://www.anthropic.com/claude-haiku-5-5
  - https://platform.claude.com/docs/en/models/haiku-5-5/overview
- **Ghi chú của người điều phối:** nhiều bài viết bên thứ ba nói Haiku 5.5 có **hai bậc giá theo độ dài prompt**, ngưỡng 100K token. Con số họ nêu:

  | Mỗi 1M token | ≤ 100K | > 100K |
  |---|---|---|
  | Vào | $0,10 | $0,50 |
  | Ra | $0,50 | $2,50 |
  | Ghi cache 5 phút | $0,125 | $0,625 |
  | Ghi cache 1 giờ | $0,20 | $1,00 |
  | Đọc cache | $0,01 | $0,05 |

  **Phải đối chiếu với trang chính thức trước khi dùng.**
- **Bậc giá:** `calls.jsonl` chỉ có token cộng dồn của cả phiên `claude -p`, nên không biết bậc của từng request. Không đoán:
  - `costUsd` tính theo bậc cao, tức cận trên.
  - Thêm `costUsdLow` theo bậc thấp.
  - `costBasis` ghi `…/haiku-tier-upper`.
  - Đổi `PRICING_VERSION`.
- **Dữ liệu thô:** không sửa `runs.jsonl` đã có. Thêm lệnh tính lại chi phí từ `calls` cho phân tích, và test.
- Cập nhật tài liệu chi phí nếu có nhắc `unknown-model`.

**K3: hai arm ép làn đầy đủ trong `bench/vs-claude/arms.json`.**
- `B0F`: `{ "lane": "full" }`, nhãn "CCoding làn đầy đủ (ép)".
- `B1F`: `{ "lane": "full", "discussionRounds": 0 }`, nhãn "CCoding làn đầy đủ (ép), bỏ họp".
- **Test bằng runtime giả, không gọi `claude -p`:**
  - Ép `lane: full` với kế hoạch ≥ 3 hạng mục và ≥ 2 người thì có pha `discuss`.
  - Thêm `discussionRounds: 0` thì không có.
  - `checkArms` nhận hai arm mới.
- Không đổi arm cũ.

**K4: kiểm cuối và bàn giao.**
- Trong tài liệu D12, ghi **hash commit** của `stats.mjs` và `analyze.mjs` sau sửa. Người điều phối chép hash này vào RUNLOG của E6 trước lượt đầu.
- Chạy:
  - `npm run typecheck`;
  - `npm test` ba lần;
  - `npm run test:bench`;
  - các lệnh kiểm của `ccoding-research`: `consistency-check`, `holdout-sample-size --check`, `token-analysis --check`, `node --test docs/research/analysis/*.test.mjs`.

## Không làm
- Không chạy benchmark, không gọi `claude -p`.
- Không sửa `src/`, `docs/research/paper/`, `preregistration.md`, `facts.json`.
- Không đổi biên, ngưỡng, hạt hay quy tắc đã đăng ký. Chỗ nào đăng ký chưa có quy tắc thì làm bảo thủ (NA hoặc không kết luận) và ghi lại cho Phòng Nghiên cứu.
