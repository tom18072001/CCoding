# Đăng ký trước giả thuyết — vòng 3, gói 1 (v1.0)

> Phân loại dữ liệu: **Nội bộ** (benchtest trên bài tổng hợp, không có DLCN). Tác giả: @methodologist, hạng mục S2 của nhiệm vụ T-20261102-134405-b2c, ngày 2/11/2026.
> Trạng thái: **bản đăng ký, có hiệu lực khi commit gộp vào nhánh nhiệm vụ** (xem §8 Khoá đăng ký). Sau khoá chỉ sửa bằng bảng §9, không sửa lặng lẽ.

## Tóm tắt

Đăng ký 9 giả thuyết (H1–H8 giữ mã của đề bài, thêm H9 cho chỉ tiêu của B-01). Phân tích chính gồm họ Holm {H1, H2, H3, H5, H6} và H7 là kiểm định xác nhận riêng (D6). H4, H8 là giả thuyết phụ. Dữ liệu xác nhận là C9 (làn nhanh 6 lượt, Claude Code Sonnet 8 lượt, mỗi bài t1–t5, chạy cùng lúc), cùng `l1-modules`/`l2-chain` và t6–t8 (chưa có). Hai rủi ro lớn nhất, nêu thẳng để chủ dự án cân nhắc trước khi mở dữ liệu:
- **Công suất của H1 phụ thuộc vào σ chưa biết.** Với σ của S1 (gộp thiết kế cũ C1–C8), C9 chỉ có công suất khoảng 3–11 %; nếu σ bằng của thiết kế hiện tại (giả định hệ số biến thiên 25 %), công suất khoảng 79–93 %. Giả định này mới có một ô làm căn cứ (t2 C8).
- **H3 ở mức lượt không thể chứng minh không kém hơn trong biên 2 điểm %** với 30 lượt (cận trên của tỉ lệ lượt lỗi ≈ 11,6 %). H3 được chuyển sang đơn vị test ẩn (D9), kèm cảnh báo về tính độc lập giữa các test.

Chưa có công cụ cho phép margin, hồi quy bootstrap và kiểm định điểm của H3 (xem §2.5). Cần có trước khi mở C9.

## Tệp đã lưu

- `docs/research/preregistration.md` (tệp này, v1.0). Không sửa `src/`, không sửa `token-analysis.*`, `CHANGELOG.md`.
- Đầu vào đã đối chiếu: đề bài `.ccoding/T-20261102-134405-b2c/inputs/BRIEF.md` (dòng 47–56); bàn giao S1 `.ccoding/T-20261102-134405-b2c/outputs/research-S1-data-scientist.md` (dòng 26–101, 108–116); `bench/vs-claude/harness/stats.mjs` dòng 1–60, 64–72, 273; `bench/vs-claude/harness/run.mjs` dòng 109, 154–165, 209–211; `docs/PROCESS-REVIEW.md` §13 (dòng 221–300); `bench/vs-claude/README.md` dòng 38, 60, 68; `bench/vs-claude/results/C7/t2-orders.ccoding-fastlane.1/result.json`.

## 1. Thiết kế & RQ

**Câu hỏi nghiên cứu (RQ-V3).** Với việc nhỏ, làn nhanh của CCoding so với Claude Code đơn **cùng mô hình Sonnet** chậm hơn và đắt hơn bao nhiêu, chất lượng có giữ được không, và từ cỡ việc nào thì điều phối đa tác tử bắt đầu có lợi? Câu trả lời là đầu vào chính thức cho ngưỡng nhỏ/lớn của B-01 và chỉ tiêu của B-02.

**Thiết kế: thực nghiệm đối chứng song song, phân tầng theo bài** (so sánh hai nhánh chạy cùng lúc, có lặp). Hai phương án khác đã cân nhắc:

| Phương án | Ưu | Nhược | Quyết định |
|---|---|---|---|
| A. So cặp theo bài, hai nhánh cùng lúc, nhiều lượt mỗi ô (chọn) | Loại biến động theo thời điểm (t3: 155 s ở C5, 246 s ở C6; PROCESS-REVIEW:278); tận dụng C9 đã lên lịch | Máy 2 nhân chạy hai hệ cùng lúc (xem §6) | Chọn |
| B. Gộp các vòng khác thời điểm, hồi quy có hiệu ứng vòng | Nhiều dữ liệu hơn | Phiên bản CCoding đổi giữa các vòng, hiệu ứng vòng lẫn với hiệu ứng hệ | Chỉ làm khám phá |
| C. Từng hệ chạy riêng tuần tự | Không tranh CPU | Lẫn biến động theo thời gian; chậm hơn nhiều | Không dùng |

**Phân tầng.** Mỗi bài là một tầng. Thống kê gộp bằng trung bình các bài của (TB lượt CCoding − TB lượt Claude), giống `stats.mjs` (header dòng 11) và `token-analysis.mjs` T-f.

**Hệ so sánh.** "CCoding" = `ccoding-fastlane` (làn nhanh). "Claude" = `claude-sonnet` (Claude Code Sonnet, `--baseline claude-sonnet`). Chọn Sonnet vì C7 đã chỉ ra phần lớn chênh lệch C5–C6 là hiệu ứng mô hình (Opus so Sonnet; PROCESS-REVIEW:288–298). So với Opus chỉ làm khám phá, vì C9 không có nhánh Opus.

**Bài.** `t1-duration, t2-orders, t3-api, t4-perf, t5-logq` (bài nhỏ, đã dùng để tinh chỉnh CCoding, tức là **không phải bài giữ lại**); `l1-modules` (5 module độc lập), `l2-chain` (4 tầng phụ thuộc); `t6–t8` (**bài giữ lại**, chưa dựng, xem H7 và §6).

## 2. Đo lường & mẫu

### 2.1 Biến đo và nguồn

| Biến | Cột trong `runs.csv` / trường `result.json` | Dùng ở |
|---|---|---|
| Thời gian tường (s) | `wall_s` / `run.wallSec` (không dùng `wallSecHarness`, gồm cả khởi tạo) | H1, H4, H5, H6, H7, H9 |
| Chi phí (USD) | `cost_usd` / `run.costUsd` | H2, H6, H9 |
| Test ẩn đạt / tổng | `hidden_pass`, `hidden_total` / `grade.hidden.pass,total` | H3, H9 |
| Token ghi cache | `cache_write` / `run.tokens.cacheWrite` | H8 |
| Phụ | `cache_read`, `output`, `input`, `perf_ms` (t4), `visible_tests`, số lượt gọi (`calls.csv`), số pha (`phases.csv`) | mô tả |

### 2.2 Mẫu: số lượt mỗi ô

C9 (đã lên lịch, không đổi được): **làn nhanh 6, Claude Sonnet 8, mỗi bài t1–t5**. Hai bài lớn và t6–t8: số lượt đăng ký ở từng giả thuyết (§3).

Truy nguồn các con số n. Đầu ra nguyên văn của mọi lệnh `stats.mjs` và bảng phương sai nằm trong tệp đã commit `docs/research/performance/required-runs-2026-11-02.md` (mục số trong cột Nguồn); các "dòng" của bàn giao S1 chỉ là tham chiếu phụ, bản gốc nằm ngoài git:

| Nguồn | Lệnh hoặc công thức |
|---|---|
| `docs/research/performance/required-runs-2026-11-02.md` mục 2 (bàn giao S1 dòng 35–43) | `node bench/vs-claude/harness/stats.mjs --baseline claude-sonnet --required-runs --sim --delta wall=30,cost=0.1` |
| `docs/research/performance/required-runs-2026-11-02.md` mục 4–5 (H1; bàn giao S1 dòng 45–63) | cùng lệnh, `--delta wall=<Δ>` với Δ = 0,3 × TB Sonnet đơn C7 theo bài, kèm `--tasks <bài>`; gộp 5 bài Δ = 25,7 s |
| S2, tính tay (đánh dấu **[S2]**) | n mỗi nhánh = 2·(z₁₋α + z₁₋β)²·σ²/Δ²; kiểm lại công thức bằng ô t2 của S1: σ = 28,1; Δ = 30; α hai phía 0,05; công suất 0,8 → 14 (khớp bàn giao dòng 40). Sai số chuẩn nhiều tầng: SE² = (1/K²)·Σₜ(σ²ₜ,CC/n_CC + σ²ₜ,Cl/n_Cl), K = số bài |

σ do S1 báo (thời gian, s): t1 88,6; t2 28,1; t3 143,9; t4 162,7; t5 110,7. σ chi phí (USD): 0,297; 0,220; 0,344; 0,340; 0,434. Các σ này **gộp mọi thiết kế CCoding C1–C8** (bàn giao dòng 16, 120), nên là cận trên cho thiết kế hiện tại. Mỗi ô Sonnet C7 chỉ có n = 2 (sd 0,7–10,6 s) và mỗi ô làn nhanh t1/t3/t4/t5 chỉ n = 1 (bàn giao dòng 73–85). Chỉ t2 C8 có sd thật của thiết kế hiện tại: 33,0 s trên TB 129,3 s, tức hệ số biến thiên CV ≈ 25 %. Dùng làm **giả định CV = 25 % cho làn nhanh** và **CV = 8 % cho Sonnet** (7–10 % trên các ô C7 có sd). Cả hai là giả định, kiểm lại bằng sd quan sát ở C9 (chỉ mô tả).

Quy ước α: mọi kiểm định xác nhận là **một phía ở mức 0,025** (tương ứng CI 95 % hai phía, để CI và p không mâu thuẫn). Z tới hạn: 1,96 (một mình) đến 2,576 (hạng Holm thấp nhất trong họ 5 giả thuyết). Công suất 0,8 (z = 0,8416).

### 2.3 Công cụ có và chưa có

| Cần | Có trong `stats.mjs`? |
|---|---|
| CI bootstrap 95 % của chênh lệch và tỉ số TB (phân tầng), p hoán vị phân tầng (H0: chênh lệch = 0; chính xác nếu ≤ 200 000 tổ hợp, nếu không 10 000 lần ngẫu nhiên), Cliff's delta, `--required-runs`, `--exclude-run`, `--baseline` | **Có** (dòng 5–7, 64–72, 103–131, 255) |
| Kiểm định theo biên (H0: R ≤ R₀) | **Không**. Cách thay thế đã đăng ký: chia thời gian/chi phí/cache_write của CCoding cho R₀ rồi chạy hoán vị phân tầng một phía cho chênh lệch > 0 (biên R₀ thành chênh lệch 0). Nhược điểm: phương sai CCoding đổi theo 1/R₀², hoán vị chỉ xấp xỉ |
| Kiểm định điểm / Newcombe cho H3 (tỉ lệ test ẩn lỗi) | **Không** |
| Hồi quy OLS bootstrap cho H4; chỉ tiêu tương đương TOST cho H9; hợp nhất Holm, IUT | **Không** |

⇒ **Điều kiện trước khi mở C9** (xem §8): một tệp `bench/vs-claude/harness/prereg-tests.mjs` (chưa tồn tại) làm các việc "Không" ở trên, có test, chạy thử trên C7 và hash được ghi vào §8. Nếu không kịp, dùng phương án lùi đã đăng ký: quyết định theo cận dưới CI bootstrap của tỉ số (`ratioCI` của `stats.mjs`) so với biên; p dùng cho Holm = tỉ lệ mẫu bootstrap có tỉ số ≤ biên. Việc dùng phương án lùi phải ghi vào §9.

### 2.4 Hợp nhất kết luận (ba trạng thái)

Mỗi giả thuyết kết thúc một trong ba trạng thái, định nghĩa trước:
- **Xác nhận**: qua phép kiểm của giả thuyết ở mức Holm (nếu thuộc họ) **và** cận CI bootstrap 95 % phía liên quan vượt biên.
- **Bác bỏ**: CI 95 % nằm hoàn toàn phía bên kia của biên so với hướng kỳ vọng (dòng "Kết quả bác bỏ" của từng giả thuyết).
- **Không kết luận**: còn lại. Không gọi là "bằng chứng cho giả thuyết rỗng".

### 2.5 Họ giả thuyết chính và Holm (theo D6)

- **Họ chính Holm (K = 5):** H1, H2, H3, H5, H6. Sắp p một phía tăng dần p₍₁₎ ≤ … ≤ p₍₅₎; bác bỏ H0 thứ i nếu p₍ᵢ₎ ≤ 0,025/(5 − i + 1), dừng ở lần đầu thất bại. H6 là hợp giao (IUT, xem H6): p(H6) = max(p_thời gian, p_chi phí).
- **H7:** kiểm định xác nhận riêng trên bài giữ lại, một phép kiểm, α = 0,025 một phía, **không** vào họ Holm (vì dữ liệu, bài và mục đích khác: kiểm khái quát hoá).
- **H4, H8:** giả thuyết phụ. Báo kết quả kèm CI, không dùng để ra quyết định, không hiệu chỉnh (kết quả của H4 là đầu vào hiệu chỉnh B-01, xem §7).
- **H9:** họ riêng (kiểm chỉ tiêu B-01 sau khi triển khai), tạo bởi ba điều kiện cùng phải đạt (IUT), nên không hiệu chỉnh thêm.
- Mọi phân tích gộp vòng, chọn sau khi thấy dữ liệu, so với Opus, hoặc theo từng bài là **khám phá** (§5).

## 3. Kế hoạch phân tích — các giả thuyết

Quy ước chung cho mọi giả thuyết dưới đây (không lặp lại): phép kiểm gồm (i) p hoán vị phân tầng theo bài (hạt 20261102), (ii) CI bootstrap 95 % phân tầng (10 000 mẫu, hạt 20261102), (iii) Cliff's delta (báo, không dùng quyết định); lệnh gốc `node bench/vs-claude/harness/stats.mjs --baseline claude-sonnet --rounds C9 --tasks <danh sách> --format md [--exclude-run …]`. Quy tắc dừng chung ở §4.3, tiêu chí loại lượt ở §4.2 (mã E1–E4 và N1).

### H1 — Làn nhanh chậm hơn Claude Code Sonnet trên bài nhỏ

- **Bản nháp:** thời gian làn nhanh / Claude Code ≥ 1,3 (t1–t5, cùng Sonnet).
- **Sửa so với bản nháp:** (1) H0 là R ≤ 1,3 và giả thuyết là R > 1,3, vì phép kiểm cần biên mở, hơn nữa với dữ liệu liên tục P(R = 1,3) = 0; (2) chỉ dùng dữ liệu **C9** (Sonnet và làn nhanh chạy cùng lúc), không dùng C7/C8 (đã dùng để đặt giả thuyết, nên không độc lập); (3) thống kê là tỉ số các TB đã gộp theo bài.
- **Biến đo chính:** thời gian tường `wall_s`, tỉ số R = TB bài(CCoding) / TB bài(Sonnet). **Phụ:** R theo từng bài; thời gian pha lập kế hoạch/thực thi/review (`phases.csv`); số vòng sửa.
- **Hướng kỳ vọng:** R > 1 (CCoding chậm hơn). Ước lượng trước từ C7+C8: R = 1,545, CI [1,452; 1,647] (S1, dòng 28–31).
- **Ngưỡng:** R > 1,3. Quy đổi theo D10 để lập kế hoạch: Δwall = 0,3 × TB Sonnet đơn C7 = 25,7 s (0,3 × 85,8; S1 dòng 55). `stats.mjs` có `ratioCI` nên phép kiểm xác nhận dùng R trực tiếp, Δ chỉ dùng cho `--required-runs`. Lý do giữ cả Δ: `--required-runs` chỉ nhận chênh lệch tuyệt đối.
- **Phép kiểm:** hoán vị phân tầng một phía trên wall_CC/1,3 (§2.3); CI bootstrap 95 % của R; Cliff's delta. Họ Holm (K = 5).
- **Số lượt mỗi ô:**
  - Lệnh S1 (dòng 45–63): `--required-runs --delta wall=<Δ> --tasks <bài>`; theo bài riêng lẻ n = 318 (t1), 80 (t2), 312 (t3), 1 924 (t4), 78 (t5) với σ cũ. Không khả thi theo từng bài. Hiệu ứng gộp 5 bài:
  - **[S2]** với σ của S1 (kịch bản A, cận trên): SE² = (68 072/25)·(1/6 + 1/8) = 794 → SE = 28,2 s; cần cỡ nghĩa D − M = 46,8 − 25,7 = 21,1 s → z = 0,75, **công suất ≈ 3 % (z tới hạn 2,576) đến 11 % (1,96)**. Để đạt 0,8 cần SE ≤ 6,2–7,5 s, tức n ≈ **96–143 mỗi nhánh mỗi bài** (n = 2·2 722,9/SE²).
  - **[S2]** với σ của thiết kế hiện tại (kịch bản B, CV 25 % làn nhanh, 8 % Sonnet; trung bình lượt C7/C8 làm cỡ): SE ≈ 6,2 s → z = 3,4 → **công suất ≈ 79–93 %** với n = 6/8.
  - **Quyết định:** chạy C9 với n = 6/8. Kết luận về công suất chỉ rút ra sau C9 bằng σ quan sát (mô tả, không dùng để đổi phép kiểm). Nếu σ quan sát đưa công suất tính lại < 50 % thì kết quả "Không kết luận" được dự báo trước và báo là **thiếu công suất**, không phải bằng chứng ủng hộ hay phản đối.
- **Tiêu chí loại lượt:** E1–E4 (§4.2); N1 (không loại lượt CCoding chậm vì lỗi sản phẩm, ví dụ treo do lệnh đọc stdin của agent).
- **Quy tắc dừng:** theo §4.3 (không xem p giữa chừng; dừng ở n đã định).
- **Kết quả bác bỏ:** CI 95 % của R có cận trên ≤ 1,3 (dữ liệu loại trừ R > 1,3). Nếu cận dưới còn > 1 nhưng cận trên ≤ 1,3 thì kết luận "CCoding chậm hơn nhưng dưới 30 %".

### H2 — Làn nhanh đắt hơn Claude Code Sonnet

- **Bản nháp:** chi phí làn nhanh > Claude Code. Sửa: "Claude Code" là Sonnet (như H1), chỉ dùng C9.
- **Biến đo chính:** chi phí `cost_usd` (USD/lượt), chênh lệch gộp theo bài D = TB CCoding − TB Sonnet. **Phụ:** tỉ số chi phí; chi phí trên mỗi test ẩn đạt; token đầu ra.
- **Hướng kỳ vọng:** D > 0. Ước lượng trước: +0,501 USD, tỉ số 2,947, CI tỉ số [2,727; 3,235] (S1 dòng 28–31).
- **Ngưỡng:** D > 0 là điều kiện xác nhận. "Đáng kể" nếu cận dưới CI ≥ 0,1 USD (≈ 39 % TB Sonnet 0,257 USD/lượt; TB của 5 giá trị trong S1 dòng 74–85 ở C7: 0,200; 0,156; 0,341; 0,150; 0,439).
- **Phép kiểm:** hoán vị phân tầng một phía (H0: D ≤ 0); CI bootstrap 95 %; Cliff's delta. Họ Holm.
- **Số lượt mỗi ô:**
  - Lệnh S1: `--required-runs --sim --delta wall=30,cost=0.1` cho n(chi phí, Δ = 0,1) = 139; 76; 186; 182; 296 (t1…t5; S1 dòng 39–43).
  - **[S2]** với Δ = 0,5 (cỡ quan sát): n = 2·7,849·σ²/0,25 → 6; 4; 8; 8; 12 (t1…t5), tức n = 6/8 đủ gần ở mọi bài. Gộp 5 bài: SE² = (0,5589/25)·(1/6 + 1/8) = 0,00652; SE = 0,081 USD; chênh nhỏ nhất phát hiện được (công suất 0,8) ≈ **0,23–0,28 USD**. Δ = 0,1 USD không có công suất ở C9 (z = 1,24), và không được đăng ký là hiệu ứng cần phát hiện.
- **Tiêu chí loại lượt:** E1–E4; N1. Lượt tốn tiền do vòng sửa hay review lặp là kết quả, không loại.
- **Quy tắc dừng:** §4.3.
- **Kết quả bác bỏ:** CI 95 % của D có cận trên ≤ 0 (làn nhanh không đắt hơn). Đã có C7 nên khả năng thấp nhưng vẫn kiểm được.

### H3 — Tỉ lệ test ẩn đạt của làn nhanh không kém hơn (biên 2 điểm %)

- **Bản nháp:** không kém hơn, biên 2 điểm %. Sửa theo D9 (đơn vị đo chuyển từ lượt sang test ẩn).
- **Vấn đề đã nêu thẳng (D9).** Tỉ lệ test ẩn đạt ở cấp lượt gần 100 % và sd = 0 ở mọi ô có n ≥ 2 (S1 dòng 87), nên công thức n theo phương sai suy biến. Quy tắc ba cho 0 lỗi trong N lần đo có cận trên 95 % một phía ≈ 3/N; để cận < 2 % cần **N ≥ 150**. **[S2]** Với α = 0,025 (một phía) cần N ≥ −ln(0,025)/0,02 = **185**, và với hạng Holm thấp nhất (α = 0,005) cần N ≥ **265**. Ở cấp lượt: mỗi ô chỉ 6 lượt, tổng 30 lượt làn nhanh, cận trên Clopper–Pearson một phía 97,5 % của tỉ lệ lượt có lỗi = 1 − 0,025^(1/30) ≈ **11,6 %**, tức không thể chứng minh biên 2 điểm % ở cấp lượt, và cần ≥ 185 lượt mỗi nhánh nếu muốn.
- **Phương án chọn:** đơn vị là **test ẩn**, gộp theo số test của 5 bài t1–t5 (149 + 60 + 87 + 19 + 146 = 461 test mỗi bộ; C9: 6 × 461 = 2 766 test làn nhanh, 8 × 461 = 3 688 test Sonnet, ≫ 265). Lý do: đây là phương án khả thi duy nhất với n đã khoá của C9; biên 2 điểm % giữ nguyên như đề bài. Không chọn nới biên ở cấp lượt vì sẽ làm mất ý nghĩa của "không kém hơn".
- **Hạn chế bắt buộc ghi kèm:** các test ẩn trong cùng một lượt **không độc lập** (C7 t2: 8/60 lỗi đều đến từ hai quy tắc nghiệp vụ sai trong một lượt; result.json dòng 40–52). Kết quả theo test vì vậy **lạc quan hơn** kết quả theo lượt. Mọi báo cáo H3 phải kèm số lỗi theo lượt và cận 11,6 % ở trên, và không được nói "không kém hơn ở mức lượt".
- **Biến đo chính:** Δ = tỉ lệ test ẩn lỗi(CCoding) − tỉ lệ test ẩn lỗi(Sonnet). **Phụ:** tỉ lệ lượt đạt trọn 100 %; số lỗi theo từng test; test ẩn t4 kèm `perf_ms`.
- **Hướng kỳ vọng:** Δ ≈ 0 (không kém hơn). Dữ liệu trước: Sonnet 0/922 (C7); làn nhanh 8/60 ở t2 C7 (trước c55a249), 0/180 ở C8 (S1 dòng 88).
- **Ngưỡng:** H0: Δ ≥ 0,02. Giả thuyết: Δ < 0,02.
- **Phép kiểm:** kiểm định điểm một phía cho hiệu hai tỉ lệ (Miettinen–Nurminen hoặc Newcombe; công cụ ở §2.3; chưa kiểm chứng nguồn thuật toán, cần chọn khi dựng công cụ) cho p của Holm; cận trên 97,5 % một phía < 0,02. Khi cả hai nhánh có 0 lỗi dùng cận chính xác: P = (1 − 0,02)^N. Hoán vị và Cliff's delta không áp dụng ở cấp test (báo ở cấp lượt, tham khảo). Họ Holm.
- **Số lượt mỗi ô:** n = 6/8 như C9; cỡ mẫu theo test: công thức −ln(α)/0,02 (ở trên), thoả với N = 2 766 và 3 688. Không dùng `--required-runs` vì σ = 0 (D9; S1 dòng 87 báo "suy biến").
- **Tiêu chí loại lượt:** E1–E4. **Không** loại lượt có test ẩn rơi, kể cả khi lỗi nằm ở một test. Lượt hết giờ chấm điểm (`grade.hidden.timedOut = true`) tính là lỗi toàn bộ test chưa chạy xong (N2).
- **Quy tắc dừng:** §4.3. Nếu một lượt làn nhanh có ≥ 10 % test ẩn lỗi, ghi nhận một **tín hiệu an toàn chất lượng**: xem §4.3 (c).
- **Kết quả bác bỏ:** cận dưới CI 95 % của Δ ≥ 0,02 (làn nhanh kém hơn quá 2 điểm %).

### H4 — Chi phí cố định của điều phối gần như hằng số (phụ)

- **Bản nháp:** hồi quy thời gian CCoding theo thời gian Claude, hệ số chặn > 30 s. Giữ, cụ thể hoá theo D7.
- **Mô hình:** y = a + b·x + e. y = `wall_s` của từng lượt làn nhanh; x = TB `wall_s` của Sonnet đơn cùng bài **cùng vòng** (C9). a là chi phí cố định (giây); b là hệ số tỉ lệ. 7 điểm x: t1–t5 (C9), `l1-modules`, `l2-chain` (cùng các lượt của H5, H6; không chạy thêm).
- **Biến đo chính:** a (giây), CI bootstrap 95 % (lấy lại mẫu lượt trong mỗi ô bài × hệ, tính lại x̄ của Sonnet mỗi lần). **Phụ:** b; hiệu CCoding − Sonnet theo từng bài và có tăng theo x không; R² thấp ⇒ cảnh báo.
- **Hướng kỳ vọng:** a > 0. Ước lượng trước: chi phí cố định ≈ 55,8 % thời gian CCoding (C7, S1 dòng 3, 14), không đổi khi thêm C8.
- **Ngưỡng:** a > 30 s. Ngưỡng 30 s lấy từ bản nháp; đối chiếu: lập kế hoạch bằng Opus mất 30–46 s ở C1/C2 (PROCESS-REVIEW:231). Làn nhanh dùng Sonnet nên giá trị này chỉ là mốc.
- **Hai giai đoạn (D7):**
  1. **Định cỡ** (mô tả): C1–C8, ghép CCoding ở vòng có Claude cùng vòng (`fastRounds` của S1: C5, C6, C7). Không kiểm định, không có p. Chỉ có Sonnet ở C7 (n = 2/bài) nên x chỉ có 5 điểm và từ một vòng.
  2. **Xác nhận**: C9 + `l1-modules` + `l2-chain`, hồi quy theo trên.
- **Phép kiểm:** CI bootstrap 95 % của a (không dùng hoán vị: không có nhãn nhóm để hoán vị) và Cliff's delta không áp dụng. Không dùng Holm (giả thuyết phụ, D6).
- **Số lượt mỗi ô:** theo C9 (6/8), H5 và H6 (12/12). Không có công thức n riêng: độ chính xác của a bị chi phối bởi **ngoại suy về x = 0** (x nhỏ nhất ≈ 40 s ở t2; ngoại suy từ một khoảng x rộng hơn nhiều ở hai bài lớn) nên không báo công suất; chỉ báo độ rộng CI.
- **Tiêu chí loại lượt:** E1–E4; N1.
- **Quy tắc dừng:** §4.3 (không có lượt riêng cho H4).
- **Kết quả bác bỏ:** CI 95 % của a có cận trên ≤ 30 s (chi phí cố định không vượt 30 s); hoặc b ≈ 1 và a ≈ 0 (không có phần cố định, chỉ là hệ số tỉ lệ).
- **Lưu ý:** một đường thẳng chung cho cả bài độc lập (l1) và bài chuỗi (l2) có thể sai hình thức. Mô hình hai độ dốc theo loại bài là **khám phá** (§5).

### H5 — `l1-modules`: CCoding nhanh hơn Claude Code Sonnet

- **Bản nháp:** CCoding nhanh hơn Claude Code cùng mô hình. Sửa: "cùng mô hình" là Sonnet; phát biểu hướng kèm cỡ hiệu ứng quan tâm.
- **Biến đo chính:** `wall_s`, tỉ số R = TB CCoding / TB Sonnet trên `l1-modules` (một tầng, nên hoán vị phân tầng suy ra hoán vị thường). **Phụ:** chi phí; test ẩn đạt; thời gian đường găng so với tổng thời gian các module (`events.jsonl`).
- **Hướng kỳ vọng:** R < 1 (5 module độc lập cho song song thật). Chưa có dữ liệu trước (không ước lượng được).
- **Ngưỡng:** R < 1 để xác nhận; cỡ quan tâm R ≤ 0,8 (nhanh hơn ≥ 20 %).
- **Phép kiểm:** hoán vị một phía (H0: R ≥ 1); CI bootstrap 95 %; Cliff's delta. Họ Holm.
- **Số lượt mỗi ô:**
  - Công thức **[S2]** n = 2·(z₁₋α + z₁₋β)²·(CV/δ)², CV = 0,25 (giả định, §2.2), δ = 0,20. Cho z = 1,96 → **25**; cho z = 2,576 (hạng Holm thấp nhất) → **37** mỗi nhánh.
  - **Quyết định: n = 12 mỗi nhánh** (ngân sách). **[S2]** Chênh nhỏ nhất phát hiện được (công suất 0,8) = (z₁₋α + 0,8416)·CV·√(2/n) = **28,6 % (z = 1,96) đến 34,9 % (z = 2,576)** của TB Sonnet. Nếu hiệu ứng thật là 20 %, công suất ≈ 27 % (z = 2,576) đến 50 % (z = 1,96). Ghi nhận trước: một kết quả "Không kết luận" ở H5 có thể do thiếu công suất.
  - Không có σ của bài này; nếu 3 lượt đầu mỗi nhánh cho CV quan sát khác xa 25 %, tính lại bằng công thức trên rồi **thông báo** (§9) và cho phép tăng đến 25 mỗi nhánh nếu ngân sách đủ. Không đổi n dựa trên hướng hiệu ứng.
- **Tiêu chí loại lượt:** E1–E4; N1.
- **Quy tắc dừng:** §4.3.
- **Kết quả bác bỏ:** CI 95 % của R có cận dưới ≥ 1 (dữ liệu loại trừ việc CCoding nhanh hơn; CCoding bằng hoặc chậm hơn).

### H6 — `l2-chain`: CCoding không nhanh hơn, và tốn hơn

- **Bản nháp:** "CCoding không nhanh hơn, và tốn hơn". Sửa: "không nhanh hơn" là mệnh đề rỗng, không bác bỏ được nếu viết thẳng; viết thành kiểm định không-có-lợi-thế với biên 15 %, trùng với dải ±15 % của chỉ tiêu B-01 (BRIEF dòng 97 nêu "ví dụ ±15 %").
- **Cấu trúc:** hợp giao (IUT) của hai phần, cùng phải đạt:
  - **H6a (thời gian):** H0: R ≤ 0,85 (CCoding nhanh hơn ≥ 15 %); giả thuyết: R > 0,85.
  - **H6b (chi phí):** H0: D ≤ 0; giả thuyết: D > 0 (như H2).
  - p(H6) = max(p(H6a), p(H6b)); mỗi phần ở mức α của hạng Holm.
- **Biến đo chính:** `wall_s` (H6a) và `cost_usd` (H6b) trên `l2-chain`. **Phụ:** số vòng sửa; thời gian chờ giữa các tầng; test ẩn đạt.
- **Hướng kỳ vọng:** R ≥ 1 và D > 0 (tầng phụ thuộc không song song hoá được, phần điều phối cố định vẫn trả; xem H4).
- **Ngưỡng:** R > 0,85 và D > 0.
- **Phép kiểm:** H6a hoán vị một phía trên wall_Sonnet·0,85 so wall_CC (chia hoặc nhân tương đương, §2.3), H6b như H2; CI bootstrap 95 % cho R và D; Cliff's delta. Họ Holm (một hạng).
- **Số lượt mỗi ô:** cùng công thức H5. **[S2]** Với kỳ vọng R = 1,1 (δ = 0,25 so với biên 0,85): n = 2·(z₁₋α + z₁₋β)²·(0,25/0,25)² = **16** (z = 1,96) đến **24** (z = 2,576). **n = 12 mỗi nhánh** cho khoảng cách tới biên nhỏ nhất phát hiện = 28,6–34,9 % TB, nên H6a có công suất đủ chỉ khi R thật ≥ 1,14–1,20. H6b có công suất cao nếu tỉ lệ chi phí gần 3 như C7.
- **Tiêu chí loại lượt:** E1–E4; N1.
- **Quy tắc dừng:** §4.3.
- **Kết quả bác bỏ:** CI 95 % của R có cận trên ≤ 0,85 (CCoding nhanh hơn ≥ 15 %), hoặc CI của D có cận trên ≤ 0 (không đắt hơn). Một trong hai là đủ để bác bỏ H6.

### H7 — Bài giữ lại t6–t8: hướng của H1 vẫn giữ

- **Bản nháp:** "hướng của H1 vẫn giữ". **Hiểu và cụ thể hoá:** hướng = CCoding chậm hơn Claude Sonnet (R > 1). Cỡ (R > 1,3) báo kèm CI nhưng **không** là điều kiện của H7, vì 3 bài mới chưa cùng cỡ với t1–t5; kiểm khái quát hoá hướng, không kiểm lại độ lớn.
- **Biến đo chính:** `wall_s`, R = TB bài(CCoding) / TB bài(Sonnet) trên t6–t8 (3 tầng). **Phụ:** R theo bài; chi phí; test ẩn đạt; R so với R của H1 (khác biệt, mô tả).
- **Hướng kỳ vọng:** R > 1.
- **Ngưỡng:** R > 1 (xác nhận); R > 1,3 chỉ để mô tả mức "tái lập độ lớn H1".
- **Phép kiểm:** hoán vị phân tầng một phía (H0: R ≤ 1); CI bootstrap 95 %; Cliff's delta. Một phép kiểm, α = 0,025 một phía; **không** vào họ Holm.
- **Số lượt mỗi ô:** **6 mỗi nhánh mỗi bài** (18 + 18). **[S2]** Với CV 25 % và 8 %: SE của log R mỗi bài = √(0,25²/6 + 0,08²/6) = 0,107; gộp 3 bài = 0,062. R thật 1,2 → z = ln(1,2)/0,062 = 2,95 → công suất ≈ 84 % (z tới hạn 1,96); R = 1,3 → z = 4,2. Công thức nền: như ở H1 §2.2; không có lệnh `--required-runs` vì chưa có σ của t6–t8.
- **Ràng buộc bài giữ lại:** (a) bản CCoding chạy t6–t8 **phải là cùng hash với C9** (§8), không phải bản đã sửa theo B-01/B-02; (b) kiểm chứng đề bài bằng lời giải tham chiếu trên harness (không chạy hệ nào); (c) mọi lần chạy t6–t8 trước khi khoá ghi vào §9; (d) không dùng kết quả t6–t8 để tinh chỉnh CCoding; (e) nếu bắt buộc sửa bài (lỗi đề), sửa **trước** lượt đo đầu tiên của hệ nào, và ghi vào §9.
- **Tiêu chí loại lượt:** E1–E4; N1.
- **Quy tắc dừng:** §4.3.
- **Kết quả bác bỏ:** CI 95 % của R có cận trên ≤ 1 (CCoding không chậm hơn trên bài giữ lại), tức hướng đảo ngược. Nếu H1 xác nhận mà H7 bị bác bỏ thì kết luận của H1 là **đặc thù của t1–t5** (đã dùng để tinh chỉnh).

### H8 — Token ghi cache của CCoding ≥ 2 lần Claude Code (phụ)

- **Bản nháp:** token ghi cache mỗi lượt chạy của CCoding ≥ 2× Claude Code. Sửa: Claude Code = Sonnet C9; hệ so sánh cùng vòng.
- **Biến đo chính:** `cache_write` mỗi lượt, tỉ số R = TB bài(CCoding) / TB bài(Sonnet). **Phụ:** `cache_read`, `output`, số lượt gọi agent (`calls.csv`), tỉ lệ chi phí ghi cache trong tổng chi phí.
- **Hướng kỳ vọng:** R ≥ 2. Căn cứ: ghi cache 2,8–4,0 lần so với Opus (PROCESS-REVIEW:266, mỗi lượt gọi agent là phiên `claude -p` mới ghi lại tiền tố system prompt).
- **Ngưỡng:** R > 2 (H0: R ≤ 2).
- **Phép kiểm:** hoán vị trên cache_write_CCoding/2 (§2.3); CI bootstrap 95 %; Cliff's delta. Phụ: báo kèm CI, không Holm, không ra quyết định.
- **Số lượt mỗi ô:** n = 6/8 (C9). **[S2]** Giả định CV 30 % cả hai nhánh: SE của log R mỗi bài = √(0,09/6 + 0,09/8) = 0,162; gộp 5 bài = 0,073; R thật 2,8 → z = ln(1,4)/0,073 = 4,6 → công suất cao. CV của cache_write chưa có số liệu; giả định.
- **Tiêu chí loại lượt:** E1–E4; N1.
- **Quy tắc dừng:** §4.3.
- **Kết quả bác bỏ:** CI 95 % của R có cận trên ≤ 2.
- **Cảnh báo cấu trúc:** so token, không so tiền; Claude Code ghi cache TTL 1 giờ, CCoding qua `claude -p` (PROCESS-REVIEW:266–267), nên 1 token ghi cache có thể không cùng đơn giá.

### H9 (mới) — B-01 làn đơn đạt chỉ tiêu ±15 % so với Claude Code Sonnet

- **Lý do thêm:** R3 yêu cầu chỉ tiêu cho B-01 (BRIEF dòng 96–100) nhưng H1–H8 chỉ kiểm làn nhanh hiện tại, không kiểm làn đơn sau triển khai. Giả thuyết này đăng ký trước để vòng benchtest sau B-01 có kế hoạch sẵn. **Chưa có dữ liệu, chưa thể chạy; chỉ chạy sau khi B-01 triển khai và hash được ghi vào §8 (bổ sung).**
- **Biến đo chính:** (a) tỉ số thời gian R_t; (b) tỉ số chi phí R_c, mỗi cái = TB bài(làn đơn) / TB bài(Sonnet) trên t1–t5; (c) Δ tỉ lệ test ẩn lỗi, như H3. **Phụ:** điểm KPI của agent (`src/kpi.ts`); số lượt gọi qua `Orchestrator.call()`; tỉ lệ nâng lên multi-agent.
- **Hướng kỳ vọng:** R_t, R_c ∈ [0,85; 1,15]; Δ < 0,02.
- **Ngưỡng:** tương đương trong ±15 % (R ∈ [0,85; 1,15]); không kém hơn 2 điểm % (như H3).
- **Phép kiểm:** TOST: CI bootstrap 90 % của R_t và của R_c đều nằm trong [0,85; 1,15] (tương đương với hai phép kiểm một phía α = 0,05); p hoán vị cho từng phía qua biến đổi §2.3; (c) như H3. Cliff's delta báo. Hợp giao (IUT) của 3 điều kiện cùng phải đạt, nên không hiệu chỉnh.
- **Số lượt mỗi ô:** **8/8** mỗi bài t1–t5, Claude Sonnet chạy cùng lúc, bản mới. **[S2]** Với CV 25 % và 8 %: SE của log R mỗi bài = √(0,0625/8 + 0,0064/8) = 0,093; gộp 5 bài = 0,0415; biên ln 1,15 = 0,140; R thật 1,0 → z = 3,4 (công suất ≈ 96 % ở z tới hạn 1,645); R thật 1,1 (ln = 0,095) → z = 1,07, công suất ≈ 28 %. Tức chỉ đủ công suất nếu làn đơn thực sự gần ngang Claude Code.
- **Tiêu chí loại lượt:** E1–E4; N1.
- **Quy tắc dừng:** §4.3.
- **Kết quả bác bỏ:** CI 90 % của R_t hoặc R_c có cận dưới > 1,15 hoặc cận trên < 0,85 (làn đơn khác Claude Code quá 15 %), hoặc H3-kiểu bị bác bỏ.
- **Chưa đăng ký:** giả thuyết cho B-02 (cổng chất lượng) sẽ thêm thành H10 sau khi có đặc tả của S3 (bằng sửa đổi có ghi vào §9, trước khi triển khai B-02).

## 4. Dữ liệu loại, kiểm soát lượt và quy tắc dừng

### 4.1 Nguyên tắc loại

- Chỉ loại theo **nguyên nhân kỹ thuật ngoài hệ đang đo**, quyết định bởi người chưa xem `wall_s`, `cost_usd`, `hidden_pass` của lượt đó (chỉ xem nhật ký lỗi và `status`). Áp dụng đối xứng cho cả hai nhánh.
- Lỗi do sản phẩm (CCoding hay Claude Code) là **kết quả**, không loại (mã N1–N3 dưới đây).
- Lượt bị loại **không bị xoá**. Ghi vào "sổ lượt bị loại" trong báo cáo (khoá, mã, bằng chứng, lệnh `--exclude-run`). Thêm lượt thay thế với `rep` mới (không dùng lại số cũ), tối đa **2 lượt thay mỗi ô**; quá mức đó, ô bị đánh dấu "thiếu dữ liệu".
- Mọi giả thuyết chính còn có **phân tích mọi lượt (không loại)** như độ nhạy (§5).

### 4.2 Tiêu chí loại lượt (định nghĩa trước dữ liệu)

Khoá lượt trong `--exclude-run`: `<vòng>/<bài>/<hệ>/<lượt>` (ví dụ `C9/t3-api/ccoding-fastlane/2`) hoặc `task_id` (cột `task_id` trong `runs.csv`, chỉ có ở CCoding), nhiều khoá cách nhau bằng dấu phẩy (`stats.mjs` dòng 70, 273).

| Mã | Loại | Cách phát hiện (từ log, `result.json`, `runs.csv`) | Loại? | Ghi chú |
|---|---|---|---|---|
| **E1** | Treo do hạ tầng | `run.status` ∈ {`failed`,`error`} kèm lỗi mạng/máy chủ (kết nối bị ngắt, 5xx, quá tải) trong `run.error` hoặc `events.jsonl`/log CLI; hoặc tiến trình bị watchdog giết; hoặc `events.jsonl` không có sự kiện nào > 300 s **và** không có lệnh công cụ nào đang chạy **và** log CLI có lỗi API/thử lại. Nghi ngờ khi `wallSecHarness − wallSec` > 60 s (chưa kiểm chứng ngưỡng này, chỉ để gọi kiểm tra tay). | Có | Phải có bằng chứng lỗi hạ tầng. "Chậm bất thường" một mình không đủ |
| **E2** | Timeout của harness | Harness huỷ CCoding khi vượt `cfg.ccodingTimeoutMin` (mặc định 60 phút; `run.mjs:160`), log "CCoding quá … phút — hủy"; Claude Code bị timer ở `run.mjs:81` giết (giá trị chưa kiểm). Chấm test ẩn hết giờ: `grade.hidden.timedOut = true` (giới hạn 20 phút, `run.mjs:209`) | **Hai trường hợp:** (i) timeout **do hạ tầng** (cùng chứng cứ với E1) → loại; (ii) timeout **do hệ không xong** (không có lỗi hạ tầng) → **giữ**, tính là lượt thất bại với giá trị `wall_s` bằng giới hạn (kiểm duyệt phải), test ẩn tính 0 đạt (N2) | Không đổi hạn chót sau khi thấy dữ liệu |
| **E3** | Lỗi đăng nhập hoặc hạn mức | Log CLI/`result.json` chứa thông báo đăng nhập hết hạn, khoá không hợp lệ, giới hạn dùng, giới hạn tốc độ, hết quota (như C2 chạm hạn mức; `export.py:19`); `run.status` = `error`; `cost_usd` = 0 hoặc thiếu | Có | Khi chạm hạn mức giữa lô: **dừng cả hai nhánh**, chờ khôi phục, rồi chạy tiếp theo thứ tự lượt còn lại |
| **E4** | Lỗi harness | Không clone được repo xuất phát; lỗi chấm (`grade` thiếu, `hidden.total` = 0 hoặc khác số test của bài, lỗi khi chạy `node --test`); `rep` trùng; nhánh sai bài/thiếu `task_id`; bản CCoding thực chạy ≠ hash đăng ký (`ccoding-task.json`/log); `audit` trong `result.json` khác rỗng (README:38 nói "chưa lượt nào có": nếu xuất hiện, **không tự loại**, đưa tay cho người quyết, ghi vào §9) | Có (trừ `audit`) | Nếu lỗi harness chạm ≥ 25 % lượt của một ô thì dừng, sửa harness, ghi §9 |
| **N1** | Lỗi sản phẩm của CCoding (hoặc Claude Code) | Treo do lệnh agent đọc stdin (C5 t3 lượt 1: 579 s, PROCESS-REVIEW:243, 260), vòng sửa/review lặp, kế hoạch sai, gộp xong lệnh kiểm tra vẫn đỏ, review dán nhãn lạ | **Không loại** | Là kết quả điều phối. Ngoại lệ lịch sử (C5 t3 loại bằng `--exclude-run T-20261102-105231-9e5`, README:60) là mô tả, không áp dụng cho C9 vì đã sửa ở `0e82b82` |
| **N2** | Test ẩn rơi hoặc hết giờ chấm | `hidden_pass` < `hidden_total` | Không loại | Tính vào H3 |
| **N3** | Chi phí/thời gian cực đoan nhưng không có lỗi hạ tầng | — | Không loại | Báo đỉnh, trung vị, và độ nhạy "bỏ lượt cực trị" ở §5 |

### 4.3 Quy tắc dừng

Quy tắc chung áp dụng cho từng giả thuyết (mỗi giả thuyết lặp lại bằng dẫn "§4.3"):
- **(a) Dừng ở n đã định**: C9 = 6/8 mỗi bài; H5, H6 = 12/12; H7 = 6/6 mỗi bài; H9 = 8/8 mỗi bài. **Không xem p, CI, hay chênh lệch** của giả thuyết xác nhận trước khi dữ liệu hoàn tất. Xem thống kê mô tả không phải chênh lệch giữa hai nhánh (phục vụ E1–E4) thì được.
- **(b) Không dừng sớm vì kết quả**, không tăng n để "đuổi" p. Nếu kết quả "Không kết luận", báo như vậy. Mở rộng chỉ qua một **nghiên cứu mới** có đăng ký mới (v2), không gộp vào xác nhận (gộp vòng là khám phá).
- **(c) Dừng vì an toàn/hạ tầng**: hết quota (E3) hoặc ≥ 25 % lượt của một ô bị E1/E4 thì dừng lô; hoặc một lượt làn nhanh có ≥ 10 % test ẩn lỗi thì **ghi tín hiệu** cho chủ dự án và tiếp tục (không dừng, vì dừng làm lệch n).
- **(d) Ngân sách**: dừng khi hết ngân sách đã duyệt cho lô; báo n thực tế, **không điều chỉnh phép kiểm**; ô thiếu dữ liệu bị đánh dấu.
- **(e) Cỡ mẫu H5, H6**: n = 12/12 là số khoá; điều chỉnh duy nhất cho phép (tăng đến 25/nhánh) phải **trước** khi chạy lượt thứ 4 của ô nào, theo công thức của H5, và ghi §9.

## 5. Phân tích chính và phân tích khám phá

**Phân tích chính (xác nhận):**
- H1, H2, H3, H5, H6 (Holm, K = 5); H7 (riêng); mỗi cái đúng một phép kiểm như §3, dữ liệu như đã nêu, sau khi áp E1–E4.
- Phụ, báo kèm CI: H4, H8. H9 (họ riêng).
- Thứ tự báo cáo: Holm → H7 → H4/H8 → H9.

**Phân tích khám phá** (không có p dùng để ra quyết định; ghi nhãn "khám phá", có CI nếu tính được):
1. Kết quả theo từng bài (R theo bài) và theo từng lượt; p theo bài ≥ 0,13 ở dữ liệu cũ (S1 dòng 33).
2. So với Claude Code **Opus** (C1–C7) và gộp nhiều vòng (hồi quy có hiệu ứng vòng, vòng như hiệu ứng cố định).
3. Độ nhạy: không loại lượt nào; loại lượt cực trị; thay `wall_s` bằng thời gian giữa lượt gọi đầu và cuối.
4. Hồi quy H4 hai độ dốc (bài độc lập so với chuỗi); hồi quy theo tín hiệu trước khi chạy (độ dài đề, số tệp bị đụng, số phần độc lập, cỡ repo) cho ngưỡng B-01.
5. Phân rã thời gian theo pha (`phases.csv`); tỉ lệ vòng sửa/review; cổng "lệnh kiểm tra đỏ sau gộp".
6. Xu hướng theo thứ tự chạy (xem §6).
7. Cho `token-analysis.md`: mọi con số T-… dẫn từ `token-analysis.mjs` và mọi thống kê theo bài × hệ.

## 6. Đe dọa tính hợp lệ

| Loại | Đe dọa | Biện pháp/ghi nhận |
|---|---|---|
| Nội tại | **Máy 2 nhân chạy hai hệ cùng lúc.** CCoding chạy tối đa 4 tiến trình `claude -p` song song (PROCESS-REVIEW:262–263) cùng một tiến trình Claude Code; tranh CPU/đĩa/mạng. Hướng sai lệch: **thổi phồng thời gian CCoding** ⇒ thiên về xác nhận H1 và H6a, chống lại H5. Bị chặn một phần vì phần lớn thời gian chờ API, chưa đo được | Báo thẳng khi diễn giải; ghi khoảng trùng `startedAt`–`finishedAt`; không có biện pháp loại bỏ trong C9. Vòng sau: chạy thêm một ô có từng nhánh chạy một mình để định lượng |
| Nội tại | **Thứ tự chạy.** C9 đã lên lịch, không đăng ký được thứ tự. Mỗi hệ tuần tự; chênh lệch thời gian giữa đầu và cuối vòng | Ghi thứ tự thực từ `startedAt`; khám phá §5.6. Vòng sau: ngẫu nhiên hoá thứ tự bài và lượt bằng hạt 20261102, xen kẽ hai hệ |
| Nội tại | **Giới hạn tốc độ và hạn mức dùng chung** (một tài khoản cho hai nhánh) | E3; dừng cả hai nhánh |
| Nội tại | **Biến động theo thời điểm của API** (t3: 155–160 s ở C5, 246–258 s ở C6; PROCESS-REVIEW:278) | Chỉ so cùng vòng cùng lúc (C9); không so chéo vòng cho xác nhận |
| Cấu trúc | `wall_s` gồm cả chờ API; `cost_usd` tính theo giá niêm yết ở thời điểm chạy; test ẩn đo một phần chất lượng | Báo thêm `phases.csv`, `calls.csv`; so tiền chỉ trong cùng vòng |
| Cấu trúc | H3 tính theo test: các test không độc lập | Đã ghi tại H3, báo kèm số lượt lỗi và cận 11,6 % |
| Ngoại tại | Chỉ 5+2+3 bài tổng hợp, JS/Node, một dự án mới mỗi lượt; tác nhân Sonnet; chỉ làn nhanh | Không khái quát sang Opus hay việc lớn hơn; H7 kiểm một phần |
| Kết luận thống kê | σ gộp thiết kế cũ nên công suất kịch bản A và B chênh nhau rất lớn; CV 25 %, 8 %, 30 % là giả định; bài lớn chưa có σ; p hoán vị xấp xỉ khi chia biên; bootstrap kém khi ô nhỏ (n = 6); 5 + 1 kiểm định chính | Ghi cả hai kịch bản; "Không kết luận" ≠ "không có hiệu ứng"; báo cả cỡ hiệu ứng và CI |
| Phiên bản | **CCoding đổi giữa các vòng** (14e2ec6 → … → c55a249). Hiệu ứng vòng lẫn hiệu ứng thiết kế | Hash từng vòng ở §8; xác nhận chỉ trên C9 (cùng hash) |
| Phiên bản | **Sửa CCoding sau C9** (B-01/B-02) làm bản chạy `l1`/`l2`, t6–t8 khác C9 | Ràng buộc H7(a): cùng hash C9; nếu H5/H6 chạy bản khác thì ghi hash và §9 |
| Rò rỉ | **t1–t5 đã dùng để tinh chỉnh CCoding (C1–C8)**, tức hiệu suất t1–t5 lạc quan so với bài mới | Kiểm bằng **H7 trên t6–t8, bài giữ lại**; không dùng t6–t8 để tinh chỉnh; mọi lần chạy ghi §9 |
| Rò rỉ | Tác giả đã thấy C1–C8, nên giả thuyết và hiệu ứng ước trước **không mù** với C1–C8 | C9 là mẫu ngoài; C1–C8 chỉ để đặt giả thuyết và định cỡ; nêu ở §8 |
| Rò rỉ | Test ẩn bị agent đọc (`audit`) | `audit` ghi trong `result.json`; chưa lượt nào có (README:38) |

## 7. Hiệu chỉnh ngưỡng nhỏ/lớn của B-01 (theo D7)

**Vai trò của H4.** Kết quả H4 (a, b) là đầu vào chính thức để hiệu chỉnh ngưỡng làn đơn/đa tác tử của B-01. Hệ số chặn a và độ dốc b chỉ được **định cỡ** trên C1–C8 (mô tả, không dùng quyết định) và **xác nhận** trên C9 cùng `l1-modules`, `l2-chain` (§3 H4).

**Công thức chọn làn** (thống nhất với S3): dùng làn đơn khi **T̂_đơn < k × a**, với T̂_đơn = thời gian ước lượng của agent đơn (giây).

**Cách cập nhật k (S2).** Với mô hình T_CC = a + b·T_đơn, CCoding nhanh hơn khi a + b·T < T, tức T > T* = a/(1 − b), nên k* = T*/a = **1/(1 − b)**. Quy tắc cập nhật, định nghĩa trước dữ liệu:
- Chỉ cập nhật k khi **CI 95 % của b nằm hoàn toàn dưới 1** (b < 1 nghĩa là điều phối có song song hoá thật) **và** H4 được xác nhận (a > 30 s). Khi đó k_mới = 1/(1 − b̂_trên), dùng **cận trên** của b (thận trọng: ưu tiên làn đơn khi chưa chắc).
- Nếu CI của b chạm 1 (hoặc ≥ 1): CCoding không có lợi về thời gian ở mọi cỡ trong khoảng đo ⇒ **không nâng k**, giữ giá trị ban đầu của S3 và ghi "chưa hiệu chỉnh".
- Nếu H4 bị bác bỏ (a ≤ 30 s): k giảm theo độ nhỏ của a, ghi lại cho vòng sau.
- Giá trị ban đầu k do S3 nêu trong `improvement-backlog.md`. Ghi chú: k tính bằng "số lần hệ số chặn", nên mọi k phải đi kèm giá trị a ước lượng; khi a đổi, T* đổi theo.
- Ngoài đường hồi quy, ngưỡng còn được kiểm bằng kết quả H5 (bài độc lập: CCoding có nhanh hơn không) và H6 (bài chuỗi: không nhanh hơn) như hai điểm đầu mút; nếu H5 và H6 cùng cho "Không kết luận" thì k giữ nguyên.

## 8. Khoá đăng ký (theo D8)

| Mục | Giá trị |
|---|---|
| Phiên bản | v1.0 |
| Soạn trên | nhánh `ccoding/t-20261102-134405-b2c--s2`, sau commit HEAD `1a7c942fabe557e3d8fd5832301bee6147273114` (ngày 2/11/2026 13:56:13 +0700) |
| Thời điểm khoá | = thời điểm commit gộp của hạng mục S2 vào nhánh nhiệm vụ (do CCoding ghi). Điền khi gộp: ______ (kiểm bằng `git log --diff-filter=A --format='%H %aI' -- docs/research/preregistration.md`) |
| Hash commit khoá | điền khi gộp: ______ |
| `src/` giữa c55a249 và HEAD khi soạn | không đổi (`git diff --stat c55a249 HEAD -- src` rỗng) ⇒ C9 chạy ở c55a249 hay HEAD ở soạn là cùng mã |
| Hash CCoding từng vòng | C1: `14e2ec6` (REPORT.md:6) · C3: sau `d767806`, `e9147d8` · C4: sau `aa6aa3a` (làn nhanh lần 1) · C5: sau `9589c2f` và `0e82b82` giữa vòng · C6: `d7600f6` · C8: `c55a249` (REPORT.md:84) · C2, C7: **chưa xác định chắc chắn từ REPORT/PROCESS-REVIEW, cần đối chiếu `ccoding-task.json`**. Nguồn: PROCESS-REVIEW:230–243, 262–263 |
| Hash C9 (cam kết) | CCoding chạy ở **c55a249 hoặc con cháu không đổi `src/`** (xác nhận lại bằng `git diff --stat c55a249 <hash C9> -- src`). Hash thực dùng điền vào đây khi nạp C9: ______. Khác với giá trị này ⇒ ghi §9 và xem C9 là thiết kế khác |
| Công cụ phân tích | `stats.mjs` ở HEAD khi soạn (hạt 20261102, 10 000 mẫu); `prereg-tests.mjs` (chưa có): hash điền khi có: ______ |
| Cam kết chưa xem C9 | `bench/vs-claude/results/` khi soạn chỉ có C1–C8 (đã liệt kê thư mục, không có C9). Tác giả **chưa xem kết quả C9**. Tác giả đã xem C1–C8 và bản tóm tắt thống kê của S1 (C7, C8) |
| Nếu có người xem C9 trước khoá | ghi vào §9 (bảng đang để trống vì không có) |
| Lệnh sẽ chạy cho xác nhận | các lệnh ở §3, §2.2 |

## 9. Sai lệch so với đăng ký

(Để trống. Mọi sửa đổi sau thời điểm khoá, mọi lần dùng phương án lùi (§2.3), mọi lượt t6–t8 chạy trước khoá, mọi thay đổi hash, ngân sách hay n phải ghi vào đây trước khi xem kết quả liên quan.)

| STT | Ngày | Giả thuyết/mục | Nội dung đã đăng ký | Thực tế | Lý do | Xem kết quả trước khi sửa? | Ảnh hưởng đến diễn giải |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## 10. Đạo đức & dữ liệu

- **Người tham gia:** không có. Không áp dụng đồng ý có hiểu biết.
- **Dữ liệu:** bài benchtest tổng hợp trong `bench/vs-claude/tasks`, nhật ký chạy và chi phí. **Phân loại: Nội bộ** (không có DLCN). Không dùng dữ liệu thật của khách hàng hay cơ quan.
- **Data Protection Gate:** không thay đổi thiết kế dữ liệu hay luồng dữ liệu; mọi lượt gọi LLM vẫn qua `Orchestrator.call()`, log ghi qua `LogStore`. Tệp này không ghi dữ liệu ra ngoài `data/` và không chứa bí mật, khoá hay token. Đánh giá bảo vệ dữ liệu bằng `docs/data-protection-assessment.md` không đổi vì gói chỉ thêm tài liệu nghiên cứu (cần chủ dự án xác nhận nếu thấy khác).
- **Lưu giữ:** `results/` giữ nguyên; lượt bị loại ở §4.1 không xoá.

## Lệnh kiểm chứng cần chạy (tôi không có quyền chạy lệnh)

Tôi chỉ đọc và ghi tệp, không chạy `node`. Các số **[S2]** là tính tay theo công thức đã ghi, chưa chạy bằng công cụ; cần kiểm:

```
node bench/vs-claude/harness/stats.mjs --baseline claude-sonnet --required-runs --sim --delta wall=30,cost=0.1
node bench/vs-claude/harness/stats.mjs --baseline claude-sonnet --required-runs --delta wall=25.7
node bench/vs-claude/harness/stats.mjs --baseline claude-sonnet --rounds C7,C8 --format md
node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md
node --test bench/vs-claude/harness/stats.test.mjs
```
