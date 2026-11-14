# Đăng ký trước giả thuyết — bản 2.2 (khóa có điều kiện)

> **Bản 2.5 (4/11/2026, @research-lead, S4 của T-20261104-110942-567):** chỉ thêm ở §9 hai mục: đăng ký trước bước 2 của B-14 (A/B `runtimes.claude-cli.stablePrefix`) và sai lệch V4-K2-1…7 (thẩm định thống kê D11). Mục khóa lại bộ giữ lại B-19 do S1 ghi (`84ded09`). Không đổi giả thuyết, ngưỡng, họ Holm hay phép kiểm nào của H1–H10, B-01, B-02.
>
> **Bản 2.3 (3/11/2026, @methodologist, S2 của T-20261103-163327-d48):** chỉ thêm dòng V4-04 ở §9 (B7′ dừng ở GĐ1). Không đổi giả thuyết, ngưỡng, họ Holm hay phép kiểm nào.
>
> **Bản 2.2 (3/11/2026, @methodologist, hạng mục S3 của T-20261103-101337-870):** chỉ **thêm** §5.1 (phân tích phụ/khám phá ngoài họ Holm cho bộ chấm và cổng chất lượng: (a), (b), (c), κ MAST) và dòng V4-02 ở §9. Không đổi giả thuyết, ngưỡng, họ Holm hay phép kiểm nào của v2.1; các chỗ ghi "v2.1" bên dưới vẫn đúng cho phần đó.
> Phân loại dữ liệu: **Nội bộ** (benchtest trên bài tổng hợp, không có DLCN). Bản 1.0: @methodologist, nhiệm vụ T-20261102-134405-b2c (S2), 2/11/2026. Bản 2.0: @methodologist, hạng mục S4 (R6) của nhiệm vụ T-20261102-175854-65c, 2/11/2026. Bản 2.1: @methodologist, hạng mục S1 (F1) của nhiệm vụ T-20261102-183435-da7, 2/11/2026 (sửa lỗi major của review gói 2: H1, H2 không kiểm định được).
> Trạng thái: **v2.1, khóa có điều kiện** (xem §8). Có hiệu lực khi (i) commit gộp có hash điền vào §8 và (ii) các SR P0 của `suite-review.md` mà từng giả thuyết đang chờ (cột "Khóa" ở §3.1) được đóng hoặc được ghi vào §9. Sau khóa chỉ sửa bằng bảng §9, không sửa lặng lẽ. Nếu một SR P0 làm đổi phép kiểm hay ngưỡng thì ghi **v2.1** vào `CHANGELOG.md`, không cần một vòng đăng ký mới.

## Tóm tắt

Bản 2 đổi hệ chính sang bộ đo của giám đốc (`bench/vs-claude`, commit `1568774`): **H1–H10 của `analyze.mjs` giữ nguyên mã và nguyên nghĩa của giám đốc**. Chín giả thuyết của bản 1 (không phải 8 như đề bài viết) đổi mã theo số thứ tự thành **ĐK-P1–P9** và chỉ còn là bộ phụ cho t1–t5 (§3.3, bảng ánh xạ P↔H). Thêm hai nhóm giả thuyết mới: **B-01** (làn đơn tương đương ±15 % so với A0-sonnet, ba phép TOST) và **B-02** (cổng chặn ca "đỏ kéo dài và bỏ sót phần việc" như t5, kèm B-10). Tiêu chí loại lượt (hạn mức, `leak`, timeout) áp cho bộ mới ở §4.3.

Ba điều cần chủ dự án biết trước khi khóa:
- **Chỉ H3 và H6 là giả thuyết xác nhận (Holm, K = 2) trước 5/11, và chỉ khi SR-26 (p bootstrap/tương đương cho H3, H6) xong**; hiện `analyze.mjs` không tạo p nào cho hai giả thuyết này. Nếu SR-26 không xong đến lúc khóa, H3 và H6 hạ xuống ước lượng, họ Holm rỗng (K = 0) và trước 5/11 không có giả thuyết xác nhận bằng Holm (§2.5). **H6 còn có quy tắc trần (v2.1, gói 2c):** chỉ chạy trên l1-modules, l2-chain, t1–t5, loại bài mà mọi lượt cả hai arm của cặp đều ≥ 0,99, p = NA khi Δ\* suy biến (phán quyết theo CI), và nếu còn < 3 bài thì H6 hạ xuống ước lượng kèm CI 90 % (họ Holm chỉ còn H3); H3 dùng hoán vị hai mẫu chính xác, p_min 1/184 756. H1, H2 **ra khỏi họ Holm** và chỉ là **ước lượng kèm CI** (§2.5): p hoán vị đổi dấu theo bài (`analyze.mjs:51`) có giá trị nhỏ nhất 2^(1−n) (mã hiện hai phía) hay 2^(−n) (một phía) với n bài; n = 2–4 bài thì p ≥ 0,0625, không bao giờ qua ngưỡng Holm nên v2.0 ghi "đạt" là sai. H4, H5, H7 phụ/kiểm riêng như v2.0; **H8, H9, H10 mô tả/thăm dò**. B-02 kiểm chứng thống kê không đạt; chỉ kiểm được cơ chế. Phép kiểm xác nhận cho H1′/H2′ sau 5/11 ở §2.6 (**dự kiến, chưa khóa**).
- **Trần điểm (pilot n = 1).** Pilot của giám đốc (từ `main` e0bd2f4, 8 bài × 3 arm, chưa `--judge`) cho điểm 1,00 ở mọi lượt có dữ liệu. Quy tắc trần §2.7: bài chạm trần không làm bằng chứng điểm cho H1 và H10; hệ quả là H1 không có bằng chứng điểm ở c3–c5 và H10 không kiểm được về điểm trên 13 bài. Đây là quan sát n = 1, không phải kết luận, và không vào dữ liệu xác nhận.
- **Chín SR P0 đang chờ Phòng Dev cho nhánh trước 5/11** (SR-01…SR-07, SR-08a và SR-26, §9; SR-08b là P1) và **SR-25 (P0 cho nhánh sau 5/11**, phép hoán vị phân tầng theo lượt cho H1′/H2′, `suite-review.md` §5): trong đó SR-01 (lượt hỏng bị coi là đã xong) và SR-03 (không ghi hash CCoding) ảnh hưởng mọi H. Tôi không chờ chúng để viết bản này, nhưng H bị ảnh hưởng đều ghi "khóa có điều kiện: chờ SR-xx".

## Tệp đã lưu

- `docs/research/preregistration.md` (tệp này, v2.1, sửa tại chỗ từ v2.0) và mục SR-25 trong `docs/research/suite-review.md` §5. Không sửa `src/`, `bench/`. (Dòng v2.1 trong `CHANGELOG.md` do người điều phối thêm nếu cần; hạng mục này không sửa tệp đó.)
- Đầu vào đã đối chiếu: `docs/research/suite-review.md` (S1; bảng H1–H10 mục 3, SR-01…SR-24 mục 5); `docs/research/run-plan.md` (S2; §4 số lượt tối thiểu, §6 gộp harness, §3.0 quy tắc cửa sổ); `docs/research/improvement-backlog.md` (S3; B-01 §3, B-02 §4.1 bước 2, B-10 §5, §6 ánh xạ); mã `bench/vs-claude/run.mjs` dòng 33–34, 47–53, 62–64, 87–91, 137–145, 169–176; `lib/ccoding.mjs` dòng 33–40, 68–72; `lib/claude.mjs` dòng 31, 50–53; `analyze.mjs` dòng 11–12, 15–16. Các dòng `analyze.mjs` khác lấy từ `suite-review.md` §3; kiểm lại bằng `grep -n` trước khi khóa.
- Bản 1.0 đã đối chiếu: nội dung ĐK-P1–P9 giữ từ v1.0 (đổi mã; rút gọn cách trình bày, giữ phép kiểm, ngưỡng, n, kết quả bác bỏ).

## 1. Thiết kế & RQ

**RQ-V3 (giữ từ bản 1).** Với việc nhỏ, làn nhanh của CCoding so với Claude Code đơn cùng mô hình Sonnet chậm hơn và đắt hơn bao nhiêu, chất lượng có giữ được không, và từ cỡ việc nào thì điều phối đa tác tử có lợi?
**RQ-V4 (mới).** Trên bộ đo của giám đốc (13 bài, 6 loại), CCoding (B0) có lợi gì so với agent đơn (A0-sonnet, A1, A2) theo H1–H10; làn đơn (B-01) có đạt tương đương ±15 % và cổng chất lượng (B-02, B-10) có chặn được ca t5 không?

**Thiết kế: thực nghiệm đối chứng xen kẽ, phân tầng theo bài, có lặp.** `run.mjs:47-53` xếp lịch với vòng ngoài là lượt lặp, mỗi bài trộn bằng hạt `${seed}/${r}`, arm xoay `(r + ti) % k`: đây là xen kẽ có xoay, **không phải ngẫu nhiên hóa hoàn toàn** (với k = 2 và 13 bài, arm đứng đầu 7/6; `suite-review.md` §3). Đơn vị phân tích của `analyze.mjs` là **bài** (delta của trung bình mỗi bài; bootstrap 4000 lần, hoán vị đổi dấu 10 000 lần).

| Phương án | Ưu | Nhược | Quyết định |
|---|---|---|---|
| A. Dùng bộ đo giám đốc làm hệ chính, bộ cũ t1–t5 làm hệ phụ (chọn) | Theo chỉ đạo của giám đốc; có arm A1/A2 cùng tính toán; có oracle/null, `leak`, pairwise | Chỉ 1 bài cho H3, H4, H9; 4 bài cho H1, H2; `size` chưa định nghĩa | Chọn |
| B. Chỉ giữ bản 1 (t1–t5, C9) | Có σ thật | Trái chỉ đạo; chỉ làn nhanh; bài đã dùng để tinh chỉnh | Bộ phụ ĐK-P1–P9 |
| C. Gộp hai bộ trong một họ Holm | Nhiều dữ liệu | Grader, hệ đo token, phiên bản CCoding khác nhau (`run-plan.md` §6.2) | Không gộp |

**Hệ so sánh.** BASE mặc định `A0-sonnet`, TREAT mặc định `B0` (`analyze.mjs:15-16`). Các arm khác: A0-opus, A1 (đơn có lập kế hoạch và tự review), A2 (best-of-N cùng tính toán), B1–B5, làn nhanh `FL`, làn đơn `SL` (tên tạm của arm B-01, dùng đúng tên Phòng Dev đặt trong `arms.json`), oracle, null.

**Bài.** 13 bài: coding c1–c5; logic l1–l4; review s1; requirements a1; design r1; research re1. Bộ cũ t1–t5 vào bộ đo bằng `task.json` (Phòng Dev đang làm). Chưa merge thì chỉ 9 bài chạy được (`a1, l1, l2, r1` lỗi ENOENT do thiếu `repo/`; `run-plan.md` §3.1).

## 2. Đo lường & mẫu

### 2.1 Biến đo và nguồn

| Biến | Trường trong `runs.jsonl` (`run.mjs:169-174`) | Dùng ở |
|---|---|---|
| Điểm | `score` ∈ [0,1] (grader theo loại bài), `pass`, `details` | H1–H4, H6, H7, H9, H10, B-01(c), B-02 |
| Token có trọng số | `tokens.weighted = input + 1,25·cacheWrite + 0,1·cacheRead + 5·output` (`claude.mjs:15-17`) | H5, B-01(a) |
| Thời gian thực | `wallSec` | H5, B-01(b) |
| USD | `costUsd` (**arm B luôn bằng 0 ở nhánh `calls.jsonl`**, `ccoding.mjs:46-62`; chờ SR-02) | chỉ độ nhạy của B-01(a) |
| Tỉ lệ thiếu sản phẩm | `formatMiss` (`gradeCode` không bao giờ đặt, `grade.mjs:40`) | H8 |
| Phụ | `tokens.cacheWrite/cacheRead/output`, `turns`, `calls`, `agentsUsed`, `byPhase`, `size`, `category`, `status`, `error`, `leak` | mô tả, ĐK-P8, §4.3 |

**Khóa vào chỉ số chính.** Chỉ số chi phí chính là **token có trọng số đúng như `analyze.mjs`** để khớp hệ đánh giá của giám đốc. **USD ước tính theo bảng giá là phân tích độ nhạy**, chưa chạy được trước SR-02; trước đó, mọi kết luận "tương đương" chỉ nói về token có trọng số, không suy ra tương đương USD (`suite-review.md` §4.2). Trọng số `5 × output` chỉ đúng trong một model (`suite-review.md` §4.1): luôn báo kèm bảng token thô và tỉ lệ `cacheRead/total` mỗi arm.

### 2.2 Mẫu: số lượt mỗi ô

Mặc định `--repeats 3` (`README.md:47`). Số lượt tối thiểu cho từng giả thuyết lấy từ `run-plan.md` §4; bảng đầy đủ ở §3.1. Nguồn n của bộ cũ (ĐK-P1–P9) giữ từ bản 1:

| Nguồn | Lệnh hoặc công thức |
|---|---|
| `docs/research/performance/required-runs-2026-11-02.md` mục 2, 4–5 | `node bench/vs-claude/harness/stats.mjs --baseline claude-sonnet --required-runs --sim --delta wall=30,cost=0.1` (và `--delta wall=<Δ>` kèm `--tasks <bài>`) |
| Công thức | n mỗi nhánh = 2·(z₁₋α + z₁₋β)²·σ²/Δ²; SE² nhiều tầng = (1/K²)·Σₜ(σ²ₜ,CC/n_CC + σ²ₜ,Cl/n_Cl) |
| TOST (`run-plan.md` §4) | n/arm = 2σ²(1,645 + 1,282)²/m², m = ln 1,15 = 0,140; công suất 80 % tại chênh lệch thật bằng 0 |

σ bộ cũ (thời gian, s): t1 88,6; t2 28,1; t3 143,9; t4 162,7; t5 110,7; σ chi phí (USD): 0,297; 0,220; 0,344; 0,340; 0,434 (gộp C1–C8, là cận trên). Giả định CV 25 % cho làn nhanh, 8 % cho Sonnet, 30 % cho cache_write (mỗi con số là giả định, kiểm bằng sd quan sát ở C9). **σ của bộ mới (recall s1 = 0,12; a1 = 0,17; re1 = 0,15; σ log TOST 0,10–0,29) đều là giả định của `run-plan.md`; pilot (n = 1 lượt/ô) không cho σ và không được dùng thay giả định (§2.7).**

**Quy ước α:** mọi kiểm định xác nhận một phía ở mức 0,025 (CI 95 % hai phía); riêng TOST của B-01 dùng α = 0,05 mỗi phía, tức bootstrap 90 % CI hai phía. Công suất 0,8.

### 2.3 Công cụ có và chưa có

| Cần | Có không? |
|---|---|
| Bootstrap theo bài (4000), hoán vị đổi dấu (10 000), độ dốc OLS có hoán vị 5000 (H10) | **Có** trong `analyze.mjs` (`compare` `:38-53`; H10 `:109-114`), nhưng H10 xáo bằng `.sort(() => rnd() - 0.5)` không đều (SR-05) |
| TOST / CI nằm trong biên | **Không** (chờ SR-04). `analyze.mjs` phán H2 và H6 bằng ước lượng điểm (`:67`, `:89-90`) |
| Loại lượt hỏng (hạn mức, timeout), ghi hash CCoding | **Không** (SR-01, SR-03) |
| `stats.mjs` (bộ cũ: `ratioCI`, `--exclude-run`, `--required-runs`) | **Có**, chỉ cho `harness/` (C1–C9) |
| Kiểm định điểm tỉ lệ (ĐK-P3), TOST (ĐK-P9→B-01) cho bộ cũ | **Không** (`prereg-tests.mjs` chưa tồn tại) |

**Phương án lùi đã đăng ký (dùng khi SR-01/SR-04 chưa xong khi chạy):** (i) lọc lượt theo §4.3 trên **bản sao** `runs.jsonl` (bản gốc giữ nguyên) trước khi chạy `analyze.mjs`; (ii) tính TOST bằng một script ngoài đọc `runs.jsonl` (bootstrap 90 % CI theo bài trên log-tỉ số, hạt 20261102); script đó phải có test và hash ghi vào §8 trước khi mở dữ liệu chính. Mọi lần dùng phương án lùi ghi vào §9.

### 2.4 Hợp nhất kết luận (ba trạng thái)

- **Xác nhận:** qua phép kiểm của giả thuyết (mức Holm nếu thuộc họ) **và** CI phía liên quan vượt biên. Chỉ áp cho giả thuyết có **p_min ≤ ngưỡng** (§2.5).
- **Bác bỏ:** CI nằm hoàn toàn phía bên kia của biên so với hướng kỳ vọng.
- **Không kết luận:** còn lại. Không gọi là "bằng chứng cho giả thuyết rỗng".
- **Ước lượng (mới ở v2.1):** dành cho H1, H2 trước 5/11. Báo hiệu điểm theo bài, bootstrap CI 95 % và phán quyết `est`/`lo` của giám đốc (H1: `est ≥ 0,1 && lo > 0`; H2: `est ≤ 0,05`), **không báo p và không nói "xác nhận"/"bác bỏ"**. Phán quyết `est`/`lo` là nhãn mô tả của bộ đo, không phải kết luận suy diễn; không dùng làm căn cứ quyết định một mình.
- Với H nằm cột "Không đạt trước 5/11" ở §3.1, trạng thái tối đa là **"mô tả"** (báo ước lượng và CI, không phán SUPPORTED/REJECTED làm căn cứ quyết định).

### 2.5 Họ giả thuyết chính và Holm

- **Họ chính Holm trước 5/11 (K = 2, có điều kiện):** **H3, H6** (phép kiểm có hướng trên điểm, đạt số lượt ở cả hai nhánh, `run-plan.md` §4; p_min dưới ngưỡng, bảng dưới). **Điều kiện (review gói 2b): hiện `analyze.mjs` không tạo p nào cho H3 và H6** (H3 `:69-75` chỉ so ước lượng điểm với ngưỡng; H6 `:86-91` chỉ `|est| ≤ 0,05`; `compare` chỉ trả CI và p đổi dấu kiểm H0: Δ = 0, không phải p tương đương). Họ này chỉ có hiệu lực khi **SR-26** (P0, `suite-review.md` §5: p bootstrap một phía cho H3, p tương đương cho H6, có test) đã merge, hoặc có script ngoài tương đương có test và hash ghi ở §8 (§2.3). **Phương án lùi đã đăng ký:** nếu đến lúc khóa không có cái nào, H3 và H6 hạ xuống **ước lượng kèm CI** như H1, H2 (§2.4), **họ Holm trước 5/11 rỗng (K = 0)** và không giả thuyết nào được gọi "xác nhận" bằng Holm; ghi vào §9. **Riêng H6 (v2.1, gói 2c):** dù SR-26 xong, H6 chỉ ở lại họ khi còn **≥ 3 bài không chạm trần** ở cả hai cặp A1/B0 và A2/B0; ít hơn thì H6 hạ xuống ước lượng kèm CI 90 % và họ chỉ còn H3 (K = 1, ngưỡng 0,025). Nếu H6 ở lại nhưng p = NA (suy biến) thì H6 không bị bác bỏ và không chặn H3 trong thứ tự Holm. Xem "Quy tắc trần và suy biến cho H6" dưới. Sắp p một phía tăng dần p₍₁₎ ≤ p₍₂₎; bác bỏ H0 thứ i nếu p₍ᵢ₎ ≤ 0,025/(2 − i + 1), tức 0,0125 rồi 0,025, dừng ở lần đầu thất bại. H3 là hợp giao (recall và precision): p(H3) = max của hai p. H6 là kiểm định không-vượt/tương đương (SR-04): p = max trên A1, A2 và hai phía (hợp giao), tức p của phía có kết quả kém hơn.
- **Nguồn p.** `analyze.mjs` chỉ in p hoán vị đổi dấu cho `compare` (H1, H2; `suite-review.md` §3). **H3, H6: p do SR-26 sinh** (chưa có mã). **H3 (v2.1, gói 2c): hoán vị hai mẫu chính xác, không bootstrap.** Chỉ s1, r = 10 mỗi arm ⇒ N = C(20, 10) = 184 756 phép gán nhãn arm cho 20 lượt, liệt kê đủ. Lý do: bootstrap phần trăm trên 10 lượt cho p thô (xấp xỉ, không bảo đảm sai lầm loại I), còn hoán vị là chính xác khi các lượt của hai arm trao đổi được dưới H0 (cùng bài, lịch xen kẽ như nhau, `run.mjs:42-52`). Dịch biên: recall kiểm H0: Δrecall ≤ 0,15 bằng cách **trừ 0,15** khỏi recall của TREAT (b′ = b − 0,15) rồi hoán vị một phía "greater"; precision kiểm H0: m(BASE) − m(TREAT) ≥ 0,05 bằng cách **cộng 0,05** vào precision của TREAT (b′ = b + 0,05) rồi hoán vị "greater"; p = #{T* ≥ T_obs}/N; p(H3) = max hai p. Lượt precision NaN bị bỏ nên r_a, r_b có thể khác nhau: N = C(r_a + r_b, r_b), báo kèm. Hoán vị sau khi dịch biên chính xác chỉ dưới mô hình dịch hằng số; ngoài giả định đó là xấp xỉ, nên vẫn kèm CI. Ghi chú: thang điểm bị chặn [0; 1] với bước 1/7 và s1 chưa xét trần (§2.7), nên recall gần 1 làm b − 0,15 lệch khỏi phân phối thật; chỉ là lưu ý, điều khoản dự phòng s1 (§2.7) xử lý trường hợp trần. **H6: bootstrap**, p = (k + 1)/(B + 1), B = 4000, hạt 20261102, lấy lại lượt trong từng ô; điều kiện trần, suy biến, số bài ở đoạn "Quy tắc trần và suy biến cho H6" dưới. H6: với mỗi arm A ∈ {A1, A2}, Δ = trung bình theo bài của (điểm A − điểm B0); p_dưới = P*(Δ* ≤ −0,05), p_trên = P*(Δ* ≥ +0,05); p(A) = max hai p; p(H6) = max p(A1), p(A2), và = NA nếu một trong hai là NA. Bootstrap phần trăm của H6 là **xấp xỉ**, không chính xác như hoán vị: p_min = 1/(B + 1) chỉ là cận thuộc thiết kế mẫu, không bảo đảm mức sai lầm loại I ở r nhỏ, và **không có nghĩa khi phân phối Δ* suy biến** (đoạn dưới); vì vậy mọi phán quyết H3/H6 vẫn kèm CI và cỡ hiệu ứng.
- **Kiểm tra p_min từng giả thuyết (mới ở v2.1).** Quy tắc: một giả thuyết chỉ được vào họ xác nhận nếu giá trị p nhỏ nhất mà phép kiểm có thể cho (p_min) ≤ ngưỡng Holm thấp nhất của họ. Phép hoán vị đổi dấu theo bài có 2ⁿ cách gán dấu cho n bài nên p một phía ≥ 2⁻ⁿ; **mã hiện tại lấy |m| (`analyze.mjs:51`), tức hai phía, nên p ≥ 2¹⁻ⁿ**. Cột "p_min" ghi một phía (cận dưới thuận lợi nhất), mã hai phía còn lớn gấp đôi.

| H | Nguồn p | Bài (n) | p_min | Ngưỡng Holm cần đạt | Kết quả |
|---|---|---|---|---|---|
| H1 | hoán vị đổi dấu theo bài | B1: 3 (c3, c4, c5) · B2: 4 (+ r1) | 2⁻³ = 0,125 · 2⁻⁴ = 0,0625 (mã hai phía: 0,25 · 0,125) | ≤ 0,0125 | **Không đạt** → ra khỏi họ, thành ước lượng |
| H2 | hoán vị đổi dấu theo bài | B1: 2 (l3, l4) · B2: 4 (l1–l4) | 2⁻² = 0,25 · 2⁻⁴ = 0,0625 (mã hai phía: 0,5 · 0,125) | như trên | **Không đạt** → ra khỏi họ, thành ước lượng |
| H3 | hoán vị hai mẫu chính xác, C(20, 10) = 184 756 — **SR-26, chưa có mã** | 1 bài (s1), r = 10 mỗi arm | 1/184 756 ≈ 5,4·10⁻⁶ (cận dưới; recall rời rạc nên có thể hòa, p thật lớn hơn) | ≤ 0,0125 | p_min **đạt**; ở lại họ **chỉ khi SR-26 xong**, ngược lại hạ xuống ước lượng |
| H6 | bootstrap, (k + 1)/(B + 1), hợp giao A1/A2 — **SR-26, chưa có mã** | tập khai báo 7 bài (l1-modules, l2-chain, t1–t5); n thực = số bài không chạm trần ở cả hai arm của cặp, **phải ≥ 3** | 1/4001 = 0,00025 **chỉ khi phân phối Δ\* không suy biến**; suy biến ⇒ p = NA (không có p_min) | ≤ 0,0125 | p_min **đạt có điều kiện**: SR-26 xong **và** ≥ 3 bài không chạm trần **và** Δ\* không suy biến; ngược lại "Không kết luận (trần/suy biến)" hoặc hạ xuống ước lượng (n < 3) |

  p_min chỉ nói phép kiểm **có thể** cho p đủ nhỏ; nó **không** nói công suất đủ. H6 có p_min đạt (có điều kiện) nhưng TOST ±5 pp không đạt công suất (§3.1 H6), nên "Không kết luận" vẫn được dự báo trước. Với H3, p_min nhỏ vì hoán vị gán lại lượt trong **một** bài: suy diễn chỉ về s1, và s1 **chưa được xét trần** (không có trong pilot; §2.7 điều khoản dự phòng).
- **Quy tắc trần và suy biến cho H6 (v2.1, gói 2c; sửa major của review gói 2b).** *Lỗi của bản trước:* pilot cho 8/13 bài đạt 1,00 ở B0 và B5. Ở bài chạm trần ở cả hai arm, mọi mẫu bootstrap cho Δ* = 0, nên trung bình theo bài bị kéo về 0 và phương sai co lại; vùng H0 (|Δ| ≥ 0,05) rỗng và p = 1/4001 xuất hiện chỉ vì trần, không vì A1/A2 ≈ B0 (test 3 cũ của SR-26 còn đòi đúng kết quả đó). Sửa bốn phần, đều định nghĩa **trước khi mở/phân tích dữ liệu W1–W5** (W1 đang chạy trên cloud và đã push vào `results/study-cloud/`, nhưng phòng chưa đọc để chọn bài hay ngưỡng):
  - **(a) Tập bài khai báo:** `l1-modules`, `l2-chain`, t1–t5 (7 bài); H6 không chạy trên bài khác. 8 bài đã chạm trần ở pilot (c1–c5, l2-knights, l4-startup-order, re1) ra khỏi tập; 5 bài chưa có pilot (l1-oncall, l3, s1, a1, r1) cũng ngoài tập vì chưa xét trần, chỉ báo mô tả. **Nguy cơ ghi trước:** t1–t5 từng đạt 1,000 ở 36/36 lượt A0-sonnet (C7–C9), nên có thể chạm trần ở cả hai arm và bị loại bởi (b); khi đó chỉ còn 2 bài và (d) hạ H6. Tập này chọn sau khi xem pilot, nên là quyết định thích ứng (§9 mục 6).
  - **(b) Định nghĩa "chạm trần ở cả hai arm", xét riêng từng cặp (A1 so B0, A2 so B0):** mọi lượt của cả hai arm trong cặp đó, sau khi lọc §4.3, có `score` ≥ **0,99** (cùng ngưỡng trần ở §2.7). *Lý do đổi từ ngưỡng sắc 1,00 (review gói 2b, major):* với ngưỡng 1,00, chỉ một lượt 0,998 là giữ bài; bài đó vẫn cho Δ\* ≈ 0 với phương sai gần 0, đúng cơ chế "kéo về 0, co phương sai" nói trên, và t1–t5 có điểm rất mịn (ví dụ t1 446/447 = 0,9978 ở làn nhanh C9) nên rủi ro có thật. Bài như vậy bị loại khỏi phép tương đương của cặp nhưng vẫn báo kèm nhãn "trần". Chạm trần một phía (một arm có ít nhất một lượt < 0,99) thì **giữ bài**. Ví dụ ghi trước: A1 = 1 mọi lượt, B0 = [1; 1; 0,998] ⇒ cả hai arm đều ≥ 0,99 ⇒ bài bị loại. Quy tắc áp cơ học, không phụ thuộc hướng hiệu. Phân tích độ nhạy với ngưỡng 1,00 chỉ báo mô tả, không đổi phán quyết. Loại bài Δ = 0 chỉ làm phép tương đương khó xác nhận hơn (bảo thủ), không làm dễ hơn.
  - **(c) Suy biến:** nếu phương sai của Δ* bằng 0 hoặc mọi Δ* bằng nhau (dung sai 10⁻¹²) thì **p = NA**; **tuyệt đối không ghi p = 1/(B + 1)**. Chỉ cần **một cặp** (A1 hoặc A2) có p = NA thì p(H6) = NA (không lấy max với cặp kia). Khi p = NA, phán quyết vẫn theo CI của §2.4: nếu |Δ\*| ≥ 0,05 ở mọi mẫu (CI nằm hẳn ngoài biên, ví dụ Δ\* cố định +0,10) thì "Bác bỏ"; ngược lại "Không kết luận (trần/suy biến)". Chỉ bỏ p, không bỏ phán quyết CI. Trong Holm, p = NA không xác nhận và không chặn H3. Quy tắc áp cả khi suy biến không do trần (ví dụ mọi lượt cùng 0,7): bootstrap không phân biệt được tương đương thật với không có biến thiên.
  - **(d) Số bài tối thiểu:** n_A1, n_A2 = số bài của tập (a) còn lại sau (b), có đủ lượt cả hai arm. Nếu min(n_A1, n_A2) < 3 thì H6 hạ xuống **ước lượng kèm CI 90 %** theo bài (như H1, H2; không p, không Holm) và họ Holm chỉ còn H3 (K = 1, ngưỡng 0,025). Luôn báo n_A1, n_A2 và danh sách bài bị loại kèm nhãn trần. Ngưỡng 3 là quy ước (trùng ngưỡng ≥ 3 bài của H7, `:93-94`), không suy từ công suất.
  - *Đánh giá cách sửa:* hướng này đúng vì chặn đường "xác nhận do trần" mà không đổi H6 sang mô tả; hạn chế còn lại là tập 7 bài nhỏ và có thể co về < 3, trong đó H6 thành ước lượng, đây là kết cục hợp lệ đã đăng ký. Ngay cả khi H6 ở lại họ, công suất TOST ±5 pp vẫn thiếu.
- **Lập luận chọn hướng cho H1, H2 (đổi sang ước lượng) thay vì ba hướng còn lại:**

| Hướng | Có làm được trước 5/11 không? | Quyết định |
|---|---|---|
| Thêm bài (t1–t5, `l1-modules`, `l2-chain`) | **Không.** Kiểm lúc soạn v2.1: `bench/vs-claude/tasks/` ở nhánh này chỉ có 13 `task.json`, không có t1–t5, `l1-modules`, `l2-chain`. `task.json` t1–t5 nằm ở nhánh nhiệm vụ Dev T-20261102-175855-1e6 (commit `30101dd`, gộp `e71bc91`) **chưa gộp vào nhánh này** (`git merge-base --is-ancestor e71bc91 HEAD` thất bại; xem §2.6) | Không chọn; chuyển thành điều kiện khóa của H1′/H2′ |
| Hoán vị theo lượt, phân tầng theo bài | Về lý thuyết có (p_min qua tích, §2.6) nhưng **`analyze.mjs` chưa có hàm này**; mã chưa merge, chưa test. Tự viết script ngoài ngay trước 5/11 thì thiếu test và hash trước khi mở dữ liệu | Không chọn cho trước 5/11; đặc tả ở SR-25, dùng cho H1′/H2′ |
| Tách họ Holm | Không giải quyết được: p_min là thuộc tính của n bài, không đổi khi tách họ. Dù H1 đứng một mình (K = 1, ngưỡng 0,025) thì 0,0625 vẫn lớn hơn | Không chọn |
| **Đổi H1, H2 sang ước lượng kèm CI** | **Có**, dùng đúng đầu ra hiện có của `compare` (`est`, `lo`, `hi`, phán quyết) | **Chọn**: là cách duy nhất trung thực với số bài thật trước 5/11 |

- **Không vào họ Holm:** **H1, H2** (ước lượng, bảng trên); **H5** (tỉ lệ bài đạt ngưỡng, `analyze.mjs:84`; mô tả có ngưỡng, không có suy diễn); **H4** (phụ: chỉ đạt khi Phòng Dev merge; 1 bài); **H7** (kiểm riêng, α = 0,025 một phía; chỉ đạt ở Nhánh 1); **H8, H9, H10** (không đạt: mô tả/thăm dò).
- **B-01**: họ riêng, hợp giao (IUT) của ba TOST, không hiệu chỉnh thêm. **B-02**: không Holm (cơ chế xác định; chất lượng chỉ mô tả).
- Mọi phân tích theo từng bài, gộp harness cũ, so với Opus, hay chọn sau khi thấy dữ liệu là **khám phá** (§5).

### 2.6 Họ H1′/H2′ sau 5/11 — **dự kiến, chưa khóa**

Trạng thái: **dự kiến, chưa khóa.** Mục này chưa có hiệu lực xác nhận; chưa giả thuyết nào ở đây được báo "xác nhận" hay "bác bỏ" cho tới khi cả hai điều kiện khóa dưới đây thỏa và ghi vào §8/§9.

- **Giả thuyết (dự kiến).** H1′: điểm B0 > A0-sonnet trên bài **phân rã được**, tập ứng viên `l1-modules` (5 module độc lập) và t1–t5. H2′: điểm B0 **không** hơn A0-sonnet (không-vượt, biên +0,05) trên bài **chuỗi phụ thuộc**, tập ứng viên `l2-chain` (4 tầng phụ thuộc). Vì phép hoán vị mặc định kiểm H0 sắc Δ = 0, **H2′ dùng hoán vị sau khi dịch điểm B0 đi biên**: kiểm H0: Δ ≥ +0,05 với `alt = 'less'` (tham số `margin = 0,05` của SR-25; thống kê T − margin). H1′ dùng `margin = 0`. Gán bài vào H1′ hay H2′ theo mô tả bài (độc lập/chuỗi), **cố định trước khi chạy** và không đổi sau khi thấy dữ liệu; tập cuối cùng sau lọc trần §2.7 chốt khi khóa.
- **Phép kiểm.** Hoán vị **nhãn arm theo lượt, phân tầng theo bài**: trong từng bài b, 2r_b lượt (r_b mỗi arm) được gán lại nhãn B0/A0 theo mọi cách chọn r_b lượt làm B0; thống kê T = trung bình theo bài của (TB điểm B0 − TB điểm A0); p một phía = tỉ lệ cách gán có T* ≥ T_quan sát (sai số 1e-12). Liệt kê đủ khi ∏_b C(2r_b, r_b) ≤ 10⁶, ngược lại lấy mẫu Monte Carlo 10 000 lần với p = (k + 1)/(M + 1). Hạt 20261102. Đặc tả hàm và test: **SR-25** (`suite-review.md` §5).
- **p_min = 1 / ∏_b C(2r_b, r_b)** (tích qua các bài, **không** phải C(2r, r) của một bài). C(2r, r) với r = 1…6: 2, 6, 20, 70, 252, 924. Thay số (K = 2: ngưỡng 0,0125 cho p₍₁₎ và 0,025 cho p₍₂₎; để mỗi giả thuyết đều có thể đứng thứ nhất ta đòi p_min ≤ 0,0125):

| Tình huống (giả định r mỗi ô) | ∏ C(2r_b, r_b) | p_min | ≤ 0,0125? |
|---|---|---|---|
| H1′, 6 bài (`l1-modules` + t1–t5), r = 1 | 2⁶ = 64 | 0,0156 | **Không** |
| H1′, 6 bài, r = 2 | 6⁶ = 46 656 | 2,1·10⁻⁵ | Có |
| H1′ chỉ `l1-modules` (sau lọc trần, nếu t1–t5 bị loại), r = 4 | 70 | 0,0143 | **Không** |
| H1′ chỉ `l1-modules`, r = 5 | 252 | 0,0040 | Có |
| H2′, `l2-chain`, r = 3 | 20 | 0,05 | **Không** |
| H2′, `l2-chain`, r = 5 | 252 | 0,0040 | Có |

  Hệ quả cho kế hoạch: nếu H1′/H2′ rơi về **một bài**, cần **r ≥ 5** mỗi ô; nếu còn đủ 6 bài thì r ≥ 2. Kế hoạch hiện tại của `run-plan.md` §3.2 chỉ xếp B0 × t1–t5 × r = 1 (W5), cho p_min = 0,0156 > 0,0125: **không đủ** cho H1′; số lượt phải nâng ở vòng sau 5/11. Bài có hiệu bằng 0 ở mọi lượt (trần) không đóng góp vào T nhưng vẫn tăng tích, nên p_min chỉ là cận thuận lợi nhất.
- **Giới hạn suy diễn.** Hoán vị theo lượt cho suy diễn **tác động cố định**: kết luận chỉ cho **các bài đã đo** (và cấu hình, hash CCoding, mô hình đã dùng), **không khái quát sang tổng thể bài** (bài không được rút ngẫu nhiên từ một quần thể). Nói "B0 hơn A0 trên `l1-modules` và t1–t5", không nói "B0 hơn A0 ở việc phân rã được".
- **Hai điều kiện khóa** (cả hai phải đúng, ghi hash vào §8):
  1. Phép hoán vị phân tầng theo lượt **đã merge vào `analyze.mjs` và có test** (SR-25).
  2. Các bài `l1-modules`, `l2-chain`, t1–t5 **đã có `task.json`** trong `bench/vs-claude/tasks/` (nhiệm vụ Dev T-20261102-175855-1e6).
- **Trạng thái hiện tại của hai điều kiện** (tự kiểm lúc soạn v2.1 bằng đọc tệp và `git log`; nhánh `ccoding/t-20261102-183435-da7--s1`, HEAD `3227da0`):
  1. **Chưa đạt.** `analyze.mjs` chỉ có hoán vị đổi dấu theo bài (`:51`); tìm "strat", "phân tầng" trong `bench/vs-claude/` chỉ thấy `harness/stats.mjs` (bootstrap phân tầng cho harness cũ, không phải hoán vị, không thuộc `analyze.mjs`). SR-25 chưa có người làm.
  2. **Chưa đạt ở nhánh này.** `bench/vs-claude/tasks/` có 13 `task.json` (a1, c1–c5, l1-oncall, l2-knights, l3, l4, r1, re1, s1), không có t1–t5, `l1-modules`, `l2-chain`. Nhánh `ccoding/t-20261102-175855-1e6` có commit `30101dd` ("task.json cho t1–t5") và `e71bc91`; `e71bc91` **không** là tổ tiên của HEAD hiện tại. Chưa kiểm trên nhánh đó xem `l1-modules` và `l2-chain` (commit `e0b2da1` đưa vào `harness/`) đã có `task.json` hay chưa: **cần kiểm trước khi khóa**.
- **Nếu không đủ điều kiện trước khi chạy:** H1′/H2′ giữ ở mức ước lượng như H1, H2; không dùng tên "xác nhận".

### 2.7 Quy tắc trần điểm (thêm ở v2.1)

- **Quy tắc.** Bài mà **mọi arm** đạt điểm ≥ 0,99 ở pilot **không được dùng làm bằng chứng điểm cho H1 và H10**; ở các bài đó chỉ phân tích **thời gian** và **token** (H5, B-01(a)(b), mô tả). Đánh giá trần chỉ bằng pilot, **không** dùng dữ liệu xác nhận. **Ngoại lệ H6 (v2.1, gói 2c):** H6 dùng quy tắc trần riêng ở mức lượt, từng cặp arm, trên tập bài khai báo (§2.5, "Quy tắc trần và suy biến cho H6"); một bài chạm trần ở pilot không đủ để loại hay giữ bài trong H6 ngoài việc tập khai báo đã loại 8 bài đó.
- **Dữ liệu căn cứ.** Pilot `pilot1` của giám đốc: server dựng từ `main` (e0bd2f4), **n = 1 lượt mỗi ô**, **chưa dùng `--judge`**, 8 bài × 3 arm (A0-sonnet, B0, B5): c1, c2, c3, c4, c5, l2-knights, l4-startup-order, re1. Cả 24 lượt trong bảng đề bài ghi điểm 1,00 (mọi arm đạt ≥ 0,99 ở cả 8 bài). **Số liệu này là quan sát n = 1, không phải kết luận; không vào dữ liệu xác nhận W1–W5; không dùng làm đầu vào cho p_min hay baseline.** (Đề bài nói "23/39 lượt" nhưng bảng có 24 dòng; chỗ lệch này được đối chiếu ở `context/pilot1-2026-11-02.md` nếu tệp đã có; v2.1 chỉ dẫn định tính, không dẫn tỉ lệ.) 5 bài chưa có dữ liệu pilot (l1-oncall, l3, s1, a1, r1) chưa xét trần.
- **Hệ quả cho H1.** c3, c4, c5 (ba bài của H1 ở B1) bị loại khỏi bằng chứng điểm; H1 ở B1 **không còn bài nào có bằng chứng điểm**, ở B2 chỉ còn r1 nếu `repo/` sửa và `--judge` không chạm trần. H1 vẫn báo như ước lượng (§2.4), kèm "trần: không có bằng chứng điểm" khi n bài = 0. **Cảnh báo cho H2:** l2-knights, l4 cũng chạm trần ở pilot; Δ = 0 do trần **không** là bằng chứng "B0 không hơn" (trần che mất khác biệt); báo kèm nhãn trần.
- **Hệ quả cho H10.** Pilot loại 8 trong 13 bài khỏi bằng chứng điểm; còn l1-oncall, l3, s1, a1, r1 (5 bài, `size` chưa định nghĩa, SR-05). Nếu trần kéo dài, **H10 không kiểm được về điểm trên bộ 13 bài**; H10 vẫn ở mức thăm dò (§3.1) và chỉ báo thời gian/token theo `size`.
- **Hướng xử lý (đề xuất bài cần thêm).** Cần bài khó hơn để điểm không chạm trần: `l1-modules` (192 test ẩn), `l2-chain` (149 test ẩn) và t1–t5; lưu ý t1–t5 từng đạt 1,000 ở 36/36 lượt A0-sonnet (C7–C9), nên có thể chạm trần ở mọi arm và bị lọc bởi chính quy tắc này (chạm trần một phía thì giữ bài, §2.5 (b)). Đây là lý do H1′/H2′ (§2.6) để dành cho `l1-modules`, `l2-chain` làm bài chính.
- **Quyết định thích ứng trước khóa.** Quy tắc đặt sau khi xem pilot (tức là sau khi biết kết quả của 8 bài) nên được ghi ở §9 mục 3 như quyết định thích ứng, không giấu; pilot không có `--judge` nên điểm 1,00 có thể do grader regex dễ (SR-07, SR-09) chứ không phải do bài dễ: đây là nguy cơ cần kiểm, không phải kết luận.
- **Điều khoản dự phòng cho s1/H3 (đăng ký trước khi có dữ liệu s1).** s1 chưa có trong pilot. Nếu pilot đầy đủ của giám đốc cho thấy s1 mọi arm có recall và precision ≥ 0,99 thì recall/precision của H3 suy biến (Δ = 0 do trần): H3 hạ xuống **mô tả** và ra khỏi họ Holm (K giảm một), ghi §9. Đánh giá trần vẫn chỉ bằng pilot, không bằng dữ liệu W1–W5.

## 3. Kế hoạch phân tích — các giả thuyết

Quy ước chung: `node bench/vs-claude/analyze.mjs <out>` với `--baseline A0-sonnet --treatment B0` (mặc định); mọi lệnh trên **bản sao đã lọc** theo §4.3. Dòng mã `analyze.mjs:N` lấy từ `suite-review.md` §3. Trạng thái "Đạt/Không đạt" theo `run-plan.md` §4: **Đạt** = số lượt tối thiểu nằm trọn trong W1–W5 và phép kiểm có thể ra kết luận cơ học; không có nghĩa kết quả sẽ ủng hộ giả thuyết. B1 = Nhánh 1 (chưa merge Phòng Dev), B2 = Nhánh 2 (đã merge).

### 3.1 Họ chính: H1–H10 của bộ đo giám đốc

| H | Câu giả thuyết (giám đốc) | Phép kiểm và ngưỡng (`analyze.mjs`) | Arm × bài | N tối thiểu | Trước 5/11 | Khóa |
|---|---|---|---|---|---|---|
| **H1** | Việc phân rã được (coding/design, `size ≥ 3`): B0 hơn A0-sonnet | Lọc `:62`; phán quyết `est ≥ 0,1 && lo > 0` (`:63`) — **chỉ ước lượng**: hiệu điểm theo bài, bootstrap CI 95 %, không báo p, không Holm (§2.5) | A0-sonnet, B0 × c3, c4, c5 (+ r1 khi `repo/` sửa) | r = 3 mỗi ô: 18 (B1) / 24 (B2) | **Ước lượng, không phải kiểm định xác nhận** (p_min 0,125 B1 / 0,0625 B2 > ngưỡng). Chạy được ở W1 (B1) / W2 (B2). **Điểm: không có bằng chứng** ở c3–c5 vì trần (§2.7), nên chỉ báo thời gian/token ở các bài đó; H1′ xác nhận chờ khóa §2.6 | chờ SR-01, SR-03, SR-05 (ngưỡng `size ≥ 3`), SR-07 (r1 `--judge`) |
| **H2** | Suy luận ràng buộc (logic): B0 *không* tốt hơn A0-sonnet | Lọc logic `:66`; phán quyết `est ≤ 0,05` (`:67`) — **chỉ ước lượng**: hiệu điểm theo bài, bootstrap CI 95 %, không báo p, không Holm. **Đăng ký thêm:** cận trên CI 90 % của Δ ≤ +0,05 (không-vượt) khi SR-04 xong, vẫn ở mức mô tả | A0-sonnet, B0 × l3, l4 (+ l1, l2) | r = 3: 12 (B1) / 24 (B2) | **Ước lượng, không phải kiểm định xác nhận** (p_min 0,25 B1 / 0,0625 B2). Chạy được ở B1/B2. Báo nhãn trần nếu l2-knights, l4 vẫn 1,00 ở mọi arm (Δ = 0 do trần không phải bằng chứng "không hơn") | chờ SR-01, SR-03, SR-04, SR-16 (tính duy nhất l1) |
| **H3** | Review nâng recall lỗi gieo mà không giảm precision | recall: `m(TREAT) − m(BASE) ≥ 0,15` và precision: `m(BASE) − m(TREAT) ≤ 0,05` (`:70-74`); hoán vị hai mẫu chính xác C(20, 10) = 184 756, p_min 1/184 756 ≈ 5,4·10⁻⁶ ≤ 0,0125; **họ Holm K = 2 nếu SR-26 xong (§2.5)** | A0-sonnet, B0 × s1 | r = 10 mỗi arm: 20 lượt (σ recall = 0,12 giả định) | **B1: đạt (W2); B2: đạt (W2)**, chỉ về s1 | chờ SR-01, SR-03, **SR-26** (p hoán vị chính xác; thiếu thì hạ xuống ước lượng, §2.5); SR-10 (P1) có thể đổi phép kiểm sang B0 vs B2 → v2.1 |
| **H4** | Phát hiện mơ hồ gieo sẵn (requirements) | Lọc `requirements` `:77`; `est ≥ 0,2` (`:78`) | A0-sonnet, B0 × a1, `--judge` | r = 11 mỗi arm: 22 lượt (σ = 0,17 giả định) | **B1: không đạt** (a1 lỗi ENOENT); **B2: đạt (W4)** | chờ SR-01, SR-03, SR-07, SR-08a |
| **H5** | Chi phí B0/A0: token có trọng số ≥ 3× **và** thời gian ≥ 1,5× ở ≥ 80 % bài | tỉ số trung vị theo bài `:81-82`; đếm `x ≥ 3 && wr[i] ≥ 1,5` (`:83`); SUPPORTED nếu ≥ 0,8 (`:84`) | A0-sonnet, B0 × mọi bài | r = 3 (trung vị): 54 (B1) / 78 (B2) | **B1: đạt (W1); B2: đạt (W1–W2)** | chờ SR-01, SR-03, **SR-06 (lỗi lệch chỉ số `:81-83`)** |
| **H6** | Agent đơn cùng tính toán (A1/A2) ≈ B0 | `|est| ≤ 0,05` với một trong A1/A2 (`:89-90`). **Đăng ký:** báo riêng A1 và A2; kết luận chính = cả hai nằm trong ±0,05 theo CI 90 % (SR-04, SR-12); **họ Holm K = 2 nếu SR-26 xong (§2.5) và ≥ 3 bài không chạm trần** (p_min 0,00025 ≤ 0,0125 chỉ khi Δ\* không suy biến; công suất vẫn thiếu, xem ghi chú). Chạm trần cả hai arm ⇒ loại bài; Δ\* suy biến ⇒ p = NA, "Không kết luận (trần/suy biến)"; < 3 bài ⇒ ước lượng kèm CI 90 %, K = 1 | A1, A2, B0 × tập khai báo: l1-modules, l2-chain, t1–t5 (các bài khác chỉ mô tả) | A1 r = 3, A2 r = 2: 45 (B1, W3) / 65 (B2, W5) lượt chạy cho mọi bài; phân tích H6 chỉ dùng 7 bài khai báo | **B1/B2: chạy được; xác nhận chỉ khi ≥ 3 bài không chạm trần ở cả hai cặp và Δ\* không suy biến, ngược lại không kết luận hoặc ước lượng** (công suất TOST thiếu); báo n_A1, n_A2 | chờ SR-01, SR-03, SR-04, **SR-26** (p tương đương có quy tắc trần/suy biến; thiếu thì hạ xuống ước lượng, §2.5); SR-12 (P1) |
| **H7** | Ổn định: SD(B0)/SD(A0) ≤ 0,7 | trung vị tỉ số SD theo bài ≤ 0,7 và ≥ 3 bài (`:93-94`) | A0-sonnet, B0 × mọi bài | r = 5 mỗi ô: 90 (B1) / 130 (B2) | **B1: đạt (W4); B2: không đạt** (cần W6, 14,6 triệu) | chờ SR-01, SR-03; SR-14 (P1) |
| **H8** | Thất bại điều phối (thiếu sản phẩm / bỏ yêu cầu): tỉ lệ `formatMiss` của TREAT > BASE | `fm(TREAT) > fm(BASE)` (`:97-99`); `fail(arm)` coding `:98` | mọi bài | ≈ 100+ mỗi arm (≥ 6 sự kiện) | **Không đạt cả hai nhánh** | chờ SR-01, SR-03, **SR-13 (P1)** |
| **H9** | Bám nguồn (research): precision trích dẫn và từ chối đúng B0 hơn ≥ 10 pp | `dP ≥ 0,1 && dR ≥ 0,1` (`:104-106`); lọc `research` `:102` | A0-sonnet, B0 × re1 | ≥ 35 mỗi arm (trích dẫn); ≥ 75 mỗi arm (từ chối nhị phân) | **Không đạt cả hai nhánh** | chờ SR-01, SR-03, SR-07, SR-08a; SR-18 (P1) |
| **H10** | Lợi thế tăng theo kích thước bài (`size`) | độ dốc OLS của delta theo `size` (`:109-111`); hoán vị 5000 (`:112-113`); SUPPORTED nếu `b > 0 && p < 0,05` (`:114`) | A0-sonnet, B0 × mọi bài | thêm lượt không tăng công suất (biến giữa bài, n = 9–13) | **Không đạt cả hai nhánh**; thêm: nếu trần kéo dài (§2.7) thì **không kiểm được về điểm trên 13 bài** (chỉ còn 5 bài chưa chạm trần ở pilot) | chờ SR-01, SR-03, **SR-05 (định nghĩa `size`, điều chỉnh loại bài, Fisher-Yates)** |

**Ghi chú đăng ký cho từng H** (chỉ những điểm làm đổi cách diễn giải; chi tiết nguy cơ ở `suite-review.md` §3):

- **H1.** Hướng kỳ vọng B0 > A0-sonnet. **Từ v2.1 là ước lượng, không phải phép kiểm xác nhận** (§2.5). Với 3–4 bài, `lo > 0` gần như đòi cả 3–4 delta cùng dương; p hoán vị đổi dấu không dưới 0,0625 nên không dùng làm căn cứ. **Trần điểm (pilot, §2.7):** c3, c4, c5 đều 1,00 ở A0-sonnet, B0, B5 trong pilot n = 1, nên bị loại khỏi bằng chứng điểm. Trước đó, bản 2.0 viết: **Trần điểm:** A0-sonnet đạt test ẩn 1,000 trên 36/36 lượt t1–t5 (`run-plan.md` §4 H1), nên Δ ≥ +10 pp có thể không thực hiện được nếu c3–c5 cũng gần trần; kết quả "Không kết luận do trần" được dự báo trước. Ngưỡng `size ≥ 3` được chọn sau khi biết bộ bài (nguy cơ tùy chỉnh theo dữ liệu), nên **đăng ký cố định danh sách bài: c3, c4, c5 và r1**, không đổi sau khi thấy dữ liệu; c1, c2 (gắn H1 trong `task.json` nhưng `size = 2`) ra ngoài H1.
- **H2.** Hướng "B0 không tốt hơn" trộn với "không kém hơn": `est ≤ 0,05` vẫn SUPPORTED khi B0 kém nhiều. Do đó phán quyết **đăng ký** là hai chiều: (i) phán quyết của giám đốc theo `:67`; (ii) CI 90 % của Δ theo bài nằm trong [−0,05; +0,05] để nói "tương đương", hoặc cận trên ≤ +0,05 để nói "không vượt". l1, l2 dễ chạm trần ở cả hai arm.
- **H3.** Phép kiểm so B0 với A0-sonnet, **khác nhau ở cả kiến trúc lẫn review**; hiệu ứng review riêng chỉ đo được bằng B0 so với B2 (review tắt, chỉ in ra ở `:72`). Đăng ký trước đúng phép kiểm giám đốc (`:73`) và **diễn giải chỉ ở mức "B0 so với A0-sonnet trên s1"**; chạy B2 × s1 nếu còn ngân sách (mô tả). Recall có bước 1/7 = 14,3 pp. p của H3 là hoán vị hai mẫu chính xác với biên dịch (recall: b − 0,15; precision: b + 0,05; §2.5). Báo `decoyHits` riêng (SR-17). Precision NaN khi không có finding: lượt đó không vào trung bình precision, ghi số lượt loại.
- **H4.** Hai điều kiện bắt buộc cho bài này: `--judge` bật cho **mọi** arm của a1 (SR-07) và khóa một chế độ chấm cho cả nghiên cứu. Bước điểm 1/6 = 16,7 pp, ngưỡng 20 pp = 2 mục. `task.json` của l3, r1 gắn H4 nhưng `analyze.mjs` chỉ tính loại `requirements` (= a1): đăng ký theo **mã**, không theo nhãn `hypotheses`.
- **H5.** Chỉ số gồm hai phần cùng phải đạt trên ≥ 80 % bài. **Chỉ số token chính là `tokens.weighted`** (không phải USD); `weighted` bằng `claude.mjs:15-17`. Hai hệ đo token khác nhau (A: `result.usage` của CLI; B: tổng `calls.jsonl`, `ccoding.mjs:46-62`) nên chênh lệch phạm vi đo có thể tạo hệ số giả; báo kèm bảng token thô. Dự đoán từ số liệu cũ: ×4,3–5,5 token, ×2,6–5,3 thời gian (`run-plan.md` §4): ngưỡng rộng.
- **H6.** `.some()` ở `:89-90` làm tăng dương tính giả; A2 cố định n = 3 (`arms.json:21`) không tương đương tính toán của B0 (tỉ số token A2/B0 phải báo). TOST ±5 pp cần ≥ 60 lượt/arm (`run-plan.md` §4): **không đạt công suất**; "Không kết luận" được dự báo trước. **Trần (v2.1, gói 2c):** H6 không được "xác nhận" chỉ vì điểm chạm trần; quy tắc (a)–(d) ở §2.5: tập bài khai báo, loại bài chạm trần cả hai arm theo từng cặp, p = NA khi Δ\* suy biến, hạ xuống ước lượng nếu < 3 bài. t1–t5 có nguy cơ bị loại hết (A0-sonnet 1,000 ở 36/36 lượt).
- **H7.** SD 3 lượt có 2 bậc tự do; bài có `sd(A0) = 0` bị loại khi `sd(B0) > 0` (NaN, `:93`): thiên lệch chọn. A0-sonnet có sd = 0 ở cả 5 bài t1–t5 (`run-plan.md`), nên H7 có thể là "thiếu dữ liệu" bất kể N. Báo số bài hợp lệ.
- **H8.** Phán quyết `:99` chỉ dựa vào `formatMiss`; `gradeCode` không bao giờ đặt (`grade.mjs:40`) nên **H8 không bắt được ca coding kiểu t5** (`improvement-backlog.md` §5 B-10 trường 6). Đăng ký ở dạng đúng mã và **mô tả**. **Chỉ số phụ H8b** (đề nghị của S3, chưa có trong mã): tỉ lệ lượt coding có **một nhóm test ẩn hỏng toàn bộ** (nhóm = tiền tố trước `:` của tên test; t5: "tổng hợp" 37/37). Chỉ tính được nếu `details` hoặc `artifacts/<key>/` giữ tên test: **cần kiểm** trước khi khóa; nếu không, H8b tính bằng script ngoài.
- **H9.** `citationPrecision` chỉ kiểm id nằm trong P1–P6 chứ không kiểm trích đúng bài (SR-18). Điều kiện AND trên 3 quan sát nhị phân là rất chặt. Chỉ mô tả; `pairwise` re1 báo kèm.
- **H10.** `size` chưa có định nghĩa, gán không nhất quán (c1 5 quy tắc nhưng `size` 2; l1 3 câu hỏi nhưng `size` 1) và lẫn loại bài; selftest oracle so với null cho độ dốc −3,4 pp/phần, p = 0,061 (`suite-review.md` §4.3). Đăng ký là **thăm dò**: không dùng để hiệu chỉnh ngưỡng `parts`/`filesTouched` của B-01. Nếu SR-05 xong thì báo thêm (i) độ dốc điều chỉnh loại bài hoặc chỉ trong coding (c1–c5: 2, 2, 3, 4, 5), (ii) CI của độ dốc.

**Hiệu lực chung (áp cho cả bảng).** (a) Thứ tự xen kẽ + xoay chưa phải ngẫu nhiên hóa (§1). (b) Cùng runtime `claude-cli` cho A và B (`run.mjs:33`), nhưng B0 dùng lập lịch pha riêng của CCoding và cấu hình model từng pha chưa ghi vào dòng kết quả. (c) **Phiên bản CCoding có thể khác giữa hai cửa sổ** (Phòng Dev đang sửa; `run.mjs:169-176` không ghi hash): chờ SR-03; trước đó người vận hành ghi hash tay (§8). (d) B5 dùng `senior-swe` qua REST (`ccoding.mjs:30`): chênh B5 so với A0 gồm cả khung và hồ sơ vai, không tách riêng; chỉ hợp bài coding.

### 3.2 Giả thuyết mới: B-01 (làn đơn) và B-02 (cổng chất lượng)

#### B-01 — Làn đơn tương đương ±15 % so với A0-sonnet (thay ĐK-P9 của bản 1)

- **Lý do.** Mục tiêu của giám đốc: việc nhỏ dùng agent đơn, tối ưu chi phí (`improvement-backlog.md` §3). Làn nhanh C7 đã chậm 1,44× và đắt 2,72× Sonnet đơn. **Chưa có dữ liệu, chưa thể chạy; chỉ chạy sau khi B-01 triển khai và hash ghi vào §8.**
- **Arm.** `SL` (làn đơn, sau B-01) so với `A0-sonnet`. `FL` (làn nhanh hiện có) chỉ là **đối chứng mô tả**, không là giả thuyết xác nhận: dữ liệu C7+C9 đã cho FL/A0-sonnet = token ×4,09 và thời gian ×2,20 (`run-plan.md` §4), nên dự báo FL không tương đương ±15 %. Việc dự báo này dựa trên dữ liệu đã thấy, nên không dùng làm xác nhận.
- **Bài.** Tập chính: **t1–t5** (danh sách cố định, không theo `size`; `size` của t1–t5 do Phòng Dev gán và chưa biết). Tập phụ (khám phá): các bài của bộ có `size ≤ 2` chạy được (c1, c2, l3, l4; thêm l1, l2 sau khi sửa `repo/`).
- **Biến đo chính (ba đại lượng, mỗi đại lượng một TOST riêng):**
  - **(a) token có trọng số** (`tokens.weighted`): R_a = TB(SL)/TB(A0-sonnet). **Độ nhạy: USD ước tính** theo bảng giá có phiên bản theo model (chờ SR-02; không đổi chỉ số chính nếu kết luận khác, báo cả hai).
  - **(b) thời gian thực** (`wallSec`): R_b. Polling 10 giây (`ccoding.mjs:38`) làm tỉ số của bài ngắn nhiễu.
  - **(c) điểm tương đối**: R_c = TB(score SL)/TB(score A0-sonnet).
- **Ngưỡng.** Mỗi đại lượng: R ∈ [0,85; 1,15]. Tỉ số tính bằng trung bình theo bài của log-tỉ số rồi lấy mũ (thang log, `suite-review.md` §4.2.3). **Cảnh báo (c):** nếu A0-sonnet ≈ 1,00 (như t1–t5), biên ±15 % của điểm rất rộng; báo kèm Δ tuyệt đối (pp). Điều kiện không kém hơn 2 pp của ĐK-P9 chuyển sang B-02 (chất lượng).
- **Phép kiểm.** TOST: bootstrap **90 % CI** (theo bài, lấy lại lượt trong ô) nằm trong [0,85; 1,15]; α = 0,05 mỗi phía; hạt 20261102. Kết luận B-01 = hợp giao (IUT) của (a), (b), (c); không hiệu chỉnh thêm.
- **N.** `run-plan.md` §4: (a) 30/arm, **(b) 45/arm**, (c) 8–17/arm. Chọn **45/arm = 9 lượt mỗi bài × 5 bài** cho cả SL và A0-sonnet; A0-sonnet có thêm 36 lượt lịch sử C7+C9 chỉ làm độ nhạy.
- **Trước 5/11.** **B1: không đạt** (không có FL/SL, t1–t5). **B2: đạt (W4) cho FL; cho SL chỉ nếu arm có mặt trước W4.** Nếu SL chưa có thì dành 15,4 triệu cho H4 và H3 (`run-plan.md` §4); B-01 xác nhận chờ vòng sau 5/11.
- **Kết quả bác bỏ.** CI 90 % của bất kỳ R nào có cận dưới > 1,15 hoặc cận trên < 0,85.
- **Khóa.** Chờ SR-02 (USD), SR-03 (hash SL), SR-04 (hàm TOST), SR-01.

#### B-02 — Cổng chất lượng chặn ca "đỏ kéo dài và bỏ sót phần việc"

Định nghĩa dùng đúng `improvement-backlog.md` §4.1 bước 2 (đỏ → đỏ mà đề bài nêu tên lệnh hay mục tiêu làm xanh ⇒ bắt buộc vào vòng sửa, reviewer LLM không có quyền duyệt, `approved` ép `false` chừng nào lệnh còn đỏ) và B-10 (quy tắc A: đích tệp/module nêu trong đề hay tóm tắt kế hoạch mà không hạng mục nào nhận ⇒ chặn trước thực thi; quy tắc B: kế hoạch đọc dở ⇒ không chạy). Ca chuẩn: `results/C9/t5-logq.ccoding-fastlane.2` (95/146 test ẩn; kế hoạch 2/4 hạng mục bỏ `agg.js` và `bin/logq.js`; `npm test` exit 1; reviewer vẫn `approved: true`).

| Mã | Giả thuyết | Arm × bài | Phép kiểm và ngưỡng | N | Trước 5/11 |
|---|---|---|---|---|---|
| **B02-M** (cơ chế, xác định) | Cổng chặn đúng ca đã biết và không chặn nhầm | Phát lại offline trên mọi `results/C*/*/ccoding-task.json` (FL, bộ cũ); ca t5; đối chứng `t1-duration.ccoding-fastlane.3` | (1) `t5-logq.ccoding-fastlane.2` bị chặn bởi bước 2 **và** bởi cả quy tắc A và B của B-10; (2) `t1-duration.ccoding-fastlane.3` **không** bị chặn; (3) ≤ 1 lượt bị chặn ngoài t5, mỗi lượt có giải thích; (4) 0 lượt `approved` khi lệnh đề bài đòi xanh còn đỏ | xác định (toàn bộ `ccoding-task.json` hiện có; không tốn hạn mức LLM) | **Đạt nếu cổng đã merge** (cả hai nhánh) |
| **B02-G** (cổng trên bộ đo) | Với arm có cổng (B0 + cổng, `SL` + cổng), lượt `approved` khi lệnh đề bài đòi xanh còn đỏ = 0 | arm có cổng × c3, c4, c5 và t5 | đếm trên `ccoding-task.json`: `review.approved` và `projectChecks.latest[].ok` của lệnh có tên trong `brief`; ngưỡng = 0 | mọi lượt có điều kiện. Tần suất thật: ca "đỏ kéo dài" ≈ 1–2/40 lượt FL; quan sát ≥ 3 ca cần ≈ 120 lượt FL | **Không đạt thống kê**; báo số lượt có điều kiện và số vi phạm (mô tả), cận trên theo quy tắc ba nếu có 0 vi phạm |
| **B02-Q** (chất lượng, thống kê) | Test ẩn/điểm của arm có cổng không kém A0-sonnet, biên 2 pp | arm có cổng, A0-sonnet × t1–t5, c5 | không kém hơn một phía α = 0,05, biên 2 pp; Δ điểm theo bài, bootstrap | n ≈ 106/arm (σ = 0,059 từ 40 lượt FL; sd A0 = 0) | **Không đạt** (cả hai nhánh): chỉ mô tả; phương án lùi là B02-M |
| **B02-H8b** (bỏ yêu cầu) | Tỉ lệ lượt coding có một nhóm test ẩn hỏng toàn bộ (H8b, §3.1) của arm có cổng ≤ A0-sonnet | arm có cổng, A0-sonnet × c3, c4, c5, t5 | so hai tỉ lệ; "SUPPORTED theo chiều CCoding tệ hơn" là phản bác | ≈ 100+ mỗi arm | **Không đạt**; mô tả. Chỉ tính được khi tên test có trong dữ liệu (§3.1 H8) |

- **Khóa.** B02-M chờ cổng (B-02 §4.1, B-10) merge và hàm phát lại; B02-G, B02-Q chờ SR-01, SR-03, SR-13. B02-M không phụ thuộc hạn mức nên chạy trước mọi vòng LLM.
- **Giới hạn đã biết.** B-02 và B-10 dựa trên **1 ca** (t5 C9 lượt 2); nguyên nhân "plan hỏng một phần hay `parsePlan` cắt" chưa kiểm vì `calls.jsonl` ở server cloud, không có trong repo (`improvement-backlog.md` §6). Tần suất loại lỗi này chưa ước lượng được.

### 3.3 Bộ phụ: ĐK-P1–P9 (giả thuyết bản 1, t1–t5 và `l1-modules`, `l2-chain`, t6–t8)

Đổi mã H_i → ĐK-P_i (i = 1..9) theo thứ tự. Nội dung giữ như v1.0; **ĐK-P_i không được dùng với nghĩa của H_i trong bộ đo của giám đốc**. **Quy ước tên (thống nhất với `improvement-backlog.md` §6): chỉ viết `ĐK-P_i` (ĐK-P1…ĐK-P9), không viết `P_i` trần.** Lý do: `P0/P1/P2` còn là mức ưu tiên của SR (`suite-review.md` §5) và `P1–P4` là bản vá prompt trong backlog, nên `P_i` trần gây nhầm; tiền tố ĐK khớp tên dùng sẵn ở backlog nên không phải đổi nhiều nơi. Dữ liệu xác nhận là C9 (làn nhanh 6 lượt, Claude Code Sonnet 8 lượt mỗi bài t1–t5, chạy cùng lúc), `l1-modules`/`l2-chain`, t6–t8 (chưa có). C9 dừng giữa chừng do hạn mức (`context/c9-partial-2026-11-02.md`): số lượt thực có ghi vào §9 khi nạp. Phép kiểm chung: (i) p hoán vị phân tầng theo bài (hạt 20261102), (ii) CI bootstrap 95 % phân tầng (10 000 mẫu), (iii) Cliff's delta (báo, không dùng quyết định); lệnh gốc `node bench/vs-claude/harness/stats.mjs --baseline claude-sonnet --rounds C9 --tasks <danh sách> --format md [--exclude-run …]`. Loại lượt: E1–E4 (§4.2).

| Mã | Giả thuyết (bản 1) | Ngưỡng | Phép kiểm | N (mỗi ô) và công suất | Kết quả bác bỏ |
|---|---|---|---|---|---|
| **ĐK-P1** | Thời gian làn nhanh / Claude Code Sonnet trên t1–t5 (C9 only) | R > 1,3 (H0: R ≤ 1,3). Kỳ vọng trước từ C7+C8: R = 1,545, CI [1,452; 1,647]. Δwall = 25,7 s | Hoán vị phân tầng một phía trên wall_CC/1,3; CI bootstrap của R; **Holm bộ cũ** (xem dưới) | 6/8 (C9). Kịch bản σ cũ: công suất 3–11 %; kịch bản CV 25 %/8 %: 79–93 %. Công suất tính lại < 50 % sau C9 ⇒ báo "thiếu công suất" | CI 95 % của R có cận trên ≤ 1,3 |
| **ĐK-P2** | Chi phí làn nhanh > Claude Code Sonnet | D > 0; "đáng kể" nếu cận dưới CI ≥ 0,1 USD | Hoán vị một phía; CI bootstrap | 6/8; chênh nhỏ nhất phát hiện ≈ 0,23–0,28 USD; Δ = 0,1 USD không có công suất (z = 1,24) | Cận trên CI của D ≤ 0 |
| **ĐK-P3** | Tỉ lệ test ẩn đạt của làn nhanh không kém hơn, biên 2 điểm % | H0: Δ ≥ 0,02 (tỉ lệ test ẩn lỗi CC − Sonnet) | Kiểm định điểm một phía (Miettinen–Nurminen hoặc Newcombe; chưa kiểm nguồn thuật toán); khi 0 lỗi cả hai nhánh: P = (1 − 0,02)^N. **Đơn vị là test ẩn**, không phải lượt (cận trên tỉ lệ lượt lỗi ≈ 11,6 % với 30 lượt) | N test = 2 766 (6 × 461) và 3 688 (8 × 461) ≫ 265. Các test trong một lượt không độc lập (C7 t2: 8/60 lỗi từ hai quy tắc): kết quả theo test lạc quan, bắt buộc báo kèm số lỗi theo lượt | Cận dưới CI 95 % của Δ ≥ 0,02 |
| **ĐK-P4** | Chi phí cố định của điều phối gần hằng số (phụ) | a > 30 s trong y = a + b·x (y = `wall_s` làn nhanh; x = TB Sonnet cùng bài cùng vòng) | CI bootstrap 95 % của a; không Holm | C9 + `l1-modules` + `l2-chain` (7 điểm x); không có công thức n riêng (ngoại suy về x = 0) | Cận trên CI của a ≤ 30 s; hoặc b ≈ 1 và a ≈ 0. Kết quả ĐK-P4 là đầu vào §7 |
| **ĐK-P5** | `l1-modules`: CCoding nhanh hơn Claude Code Sonnet | R < 1; cỡ quan tâm R ≤ 0,8 | Hoán vị một phía (H0: R ≥ 1); CI bootstrap | 12/12 (ngân sách); công thức 25–37 mỗi nhánh; công suất ≈ 27–50 % nếu hiệu ứng thật là 20 % ⇒ "Không kết luận" có thể do thiếu công suất | Cận dưới CI của R ≥ 1 |
| **ĐK-P6** | `l2-chain`: CCoding không nhanh hơn và tốn hơn (hợp giao ĐK-P6a, ĐK-P6b) | ĐK-P6a: R > 0,85; ĐK-P6b: D > 0 | ĐK-P6a hoán vị trên wall_Sonnet·0,85; ĐK-P6b như ĐK-P2; p = max | 12/12; ĐK-P6a có công suất chỉ khi R thật ≥ 1,14–1,20 | CI của R có cận trên ≤ 0,85, hoặc CI của D có cận trên ≤ 0 |
| **ĐK-P7** | Bài giữ lại t6–t8: hướng của ĐK-P1 vẫn giữ | R > 1 (R > 1,3 chỉ mô tả) | Hoán vị phân tầng một phía; α = 0,025; **không Holm** | 6/6 mỗi bài (18 + 18); công suất ≈ 84 % nếu R thật 1,2. **Ràng buộc:** CCoding cùng hash với C9 (§8); không tinh chỉnh bằng t6–t8; mọi lần chạy trước khóa ghi §9; sửa đề chỉ trước lượt đo đầu tiên | CI của R có cận trên ≤ 1 |
| **ĐK-P8** | Token ghi cache của CCoding ≥ 2× Claude Code (phụ) | R > 2 (H0: R ≤ 2) | Hoán vị trên cache_write_CC/2; CI; không Holm | 6/8; CV 30 % là giả định; công suất cao nếu R thật 2,8. Cảnh báo: so token, không so tiền | Cận trên CI của R ≤ 2 |
| **ĐK-P9** | Làn đơn đạt chỉ tiêu ±15 % so với Claude Code Sonnet (chưa chạy) | R_t, R_c ∈ [0,85; 1,15]; Δ < 0,02 | TOST bootstrap 90 %; hợp giao 3 điều kiện | 8/8 mỗi bài t1–t5 | CI 90 % của R_t hoặc R_c ngoài biên |

**Holm bộ cũ.** Họ chính của bản 1 giữ nguyên: {ĐK-P1, ĐK-P2, ĐK-P3, ĐK-P5, ĐK-P6}, K = 5, ngưỡng 0,025/(5 − i + 1); ĐK-P6 là IUT. ĐK-P7 kiểm riêng; ĐK-P4, ĐK-P8 phụ; ĐK-P9 **chuyển sang B-01 ở dưới** (không còn chạy độc lập). Họ này **tách hẳn** với họ Holm của bộ đo giám đốc (§2.5): hai dữ liệu, hai grader, hai hệ đo token, không hiệu chỉnh chéo.

**Bảng ánh xạ P↔H** (một dòng mỗi giả thuyết bản 1; phân loại: **trùng** = cùng câu hỏi và cùng phép kiểm; **bổ sung** = cùng mục đích hay hướng nhưng khác arm/biến/ngưỡng nên kiểm tách riêng; **chỉ bộ cũ** = không có đối ứng trong H1–H10 và chỉ áp cho t1–t5 / `harness/`):

| P (bản 1) | Nội dung bản 1 | Đối ứng trong bộ đo giám đốc | Phân loại | Ghi chú |
|---|---|---|---|---|
| ĐK-P1 (H1 cũ) | Thời gian làn nhanh/Claude Sonnet > 1,3 trên t1–t5 | H5 (thời gian B0/A0 ≥ 1,5×, `analyze.mjs:83`) | **Bổ sung** | H5 so B0 với A0-sonnet trên 13 bài, ngưỡng 1,5× ở ≥ 80 % bài; ĐK-P1 so làn nhanh, ngưỡng 1,3× gộp theo bài. Cùng hướng, khác arm và bài |
| ĐK-P2 (H2 cũ) | Chi phí (USD) làn nhanh > Claude Sonnet | H5 (phần token có trọng số ≥ 3×) và độ nhạy USD của B-01(a) | **Bổ sung** | H5 dùng token có trọng số chứ không phải USD; arm B có `costUsd = 0` (SR-02) nên ĐK-P2 là hệ duy nhất đo USD cho tới khi SR-02 xong |
| ĐK-P3 (H3 cũ) | Test ẩn không kém hơn, biên 2 điểm % | không có H tương ứng; ý nằm ở B02-Q | **Chỉ bộ cũ** (ý chuyển sang B02-Q cho bộ mới) | H3 giám đốc là recall/precision của review (không phải không kém hơn) |
| ĐK-P4 (H4 cũ) | Hệ số chặn a > 30 s (chi phí cố định) | H10 (lợi thế tăng theo `size`) | **Bổ sung** | Cùng mục đích hiệu chỉnh ngưỡng nhỏ/lớn của B-01, khác biến giải thích (thời gian Sonnet so với `size` chưa định nghĩa). §7 vẫn dùng ĐK-P4 |
| ĐK-P5 (H5 cũ) | `l1-modules`: CCoding nhanh hơn | gần nhất H1 (việc phân rã được) | **Chỉ bộ cũ** | `l1-modules` không nằm trong 13 bài của bộ mới. Lưu ý: "l1" của bộ mới là `l1-oncall` (logic), khác bài |
| ĐK-P6 (H6 cũ) | `l2-chain`: CCoding không nhanh hơn, tốn hơn | gần nhất H2 (logic ràng buộc chặt, B0 không tốt hơn) | **Chỉ bộ cũ** | `l2-chain` (4 tầng phụ thuộc) khác `l2-knights` (logic). Dev đang dựng `l2-chain`; khi vào bộ mới thì đăng ký lại bằng §9 |
| ĐK-P7 (H7 cũ) | Bài giữ lại t6–t8, hướng ĐK-P1 vẫn giữ | **không phải H7** của giám đốc (ổn định SD) | **Chỉ bộ cũ** | Hai "H7" khác nghĩa hoàn toàn; bản 2 chỉ dùng "ĐK-P7" cho nghĩa cũ |
| ĐK-P8 (H8 cũ) | `cache_write` CCoding ≥ 2× | H5 (token có trọng số gồm `1,25·cacheWrite`) | **Bổ sung** | `cacheWrite` có trong `tokens` của `runs.jsonl`, nên ĐK-P8 tính được trên bộ mới như phụ; H8 của giám đốc là thất bại điều phối, **không** liên quan |
| ĐK-P9 (H9 cũ) | Làn đơn B-01 ±15 % | **B-01 mới** (§3.2) | **Trùng ý, đổi đo** | Đổi so với ĐK-P9: đối chứng A0-sonnet cùng bộ đo; chỉ số chính token có trọng số (USD là độ nhạy); thêm thời gian; điểm tương đối; biên không kém 2 pp chuyển sang B02-Q |

## 4. Dữ liệu loại, kiểm soát lượt và quy tắc dừng

### 4.1 Nguyên tắc loại (giữ từ bản 1)

- Chỉ loại theo **nguyên nhân kỹ thuật ngoài hệ đang đo**, quyết định bởi người chưa xem `score`, `wallSec`, `tokens` của lượt đó (chỉ xem `status`, `error`, nhật ký). Áp đối xứng cho mọi arm.
- **Ngoại lệ cho tiêu chí Q và T (§4.3).** Hai tiêu chí này cần `wallSec` và `tokens`, nên không để người quyết định tự đọc hai trường đó. Chúng được tính **tự động** theo ngưỡng cố định đăng ký ở §4.3 (T: `wallSec ≥ 0,98 × timeoutMin × 60`; Q: `tokens.weighted ≈ 0` hoặc `wallSec` ngắn bất thường so với trung vị ô, kèm văn bản báo giới hạn), và người quyết định loại chỉ thấy **cờ đạt/không đạt** của từng tiêu chí, không thấy `wallSec`/`tokens` theo arm. Không được đổi ngưỡng sau khi thấy dữ liệu.
- Lỗi do sản phẩm (CCoding hay Claude Code) là **kết quả**, không loại.
- Lượt bị loại **không bị xóa**: ghi vào "sổ lượt bị loại" (khóa `task__arm__rN`, mã, bằng chứng) và loại khỏi **bản sao** `runs.jsonl` dùng cho `analyze.mjs` (§2.3). Thêm lượt thay thế với `rep` mới, tối đa 2 lượt thay mỗi ô; quá mức đó ô bị đánh dấu "thiếu dữ liệu".
- **Chạy lại sau khi loại lượt.** Chạy lại bằng `rep` MỚI, cùng khóa arm × bài; lượt bị loại vẫn giữ trong log kèm lý do, không ghi đè. Quy tắc áp dụng từ v2.1, không hồi tố cho 4 lượt C9 đã loại (`context/c9-partial-2026-11-02.md`); nếu C9 chạy tiếp thì theo quy tắc này.
- Mọi giả thuyết chính còn có phân tích **không loại** (độ nhạy, §5).

### 4.2 Bộ phụ ĐK-P1–P9 (harness cũ, `runs.csv`) — giữ nguyên từ bản 1

Khóa lượt trong `--exclude-run`: `<vòng>/<bài>/<hệ>/<lượt>` hoặc `task_id`.

| Mã | Loại | Cách phát hiện | Loại? |
|---|---|---|---|
| **E1** | Treo do hạ tầng | `run.status` ∈ {`failed`, `error`} kèm lỗi mạng/máy chủ trong `run.error` hoặc log CLI; hoặc watchdog giết; hoặc `events.jsonl` không có sự kiện > 300 s mà không có lệnh công cụ đang chạy. Nghi ngờ khi `wallSecHarness − wallSec` > 60 s (ngưỡng chưa kiểm) | Có |
| **E2** | Timeout của harness | CCoding vượt `cfg.ccodingTimeoutMin` (60 phút, `harness/run.mjs:160`); chấm test ẩn hết giờ `grade.hidden.timedOut` (20 phút, `harness/run.mjs:209`) | Hạ tầng → loại; hệ không xong → **giữ**, tính thất bại (N2) |
| **E3** | Đăng nhập/hạn mức | log chứa thông báo giới hạn dùng/tốc độ/quota; `run.status = error`; `cost_usd` = 0 hoặc thiếu | Có; dừng cả hai nhánh |
| **E4** | Lỗi harness | không clone được repo; `grade` thiếu; `hidden.total` = 0 hoặc khác số test; `rep` trùng; bản CCoding ≠ hash đăng ký; `audit` khác rỗng (không tự loại, đưa tay cho người quyết) | Có (trừ `audit`) |
| **N1–N3** | Lỗi sản phẩm; test ẩn rơi/hết giờ chấm; chi phí/thời gian cực đoan | — | Không loại |

### 4.3 Bộ đo giám đốc (H1–H10, B-01, B-02): ba tiêu chí loại mới

Mã **Q** (hạn mức, tương ứng E3), **L** (rò rỉ, tương ứng `audit`/E4 nhưng có cờ riêng), **T** (timeout, tương ứng E2). E1 (treo hạ tầng) và E4 (lỗi harness, gồm `status = 'error'` kèm ENOENT thiếu `repo/`, `run.mjs:72`) áp nguyên. Lượt Q, T(hạ tầng), E1, E4 bị loại **đối xứng giữa các arm**; lượt L bị loại theo cờ.

| Mã | Tiêu chí | Cách nhận diện qua `runs.jsonl` (đọc từ `run.mjs`, `lib/claude.mjs`, `lib/ccoding.mjs`) | Loại? | Xử lý |
|---|---|---|---|---|
| **Q** | Lượt bị cắt do hạn mức 5 giờ (429, hết hạn mức, đăng nhập) | **Hiện tại (gián tiếp):** `status` ∈ {`failed`, `error`} (`claude.mjs:50`; `run.mjs:171`) **và** (`tokens.weighted` ≈ 0 hoặc `wallSec` ngắn bất thường so với trung vị ô) **và** văn bản báo giới hạn trong `error` hoặc `artifacts/<key>/_FINAL.txt` (với arm A, `finalText = result.result`; `run.mjs:167`) hoặc trong `calls.jsonl`/nhật ký server của nhiệm vụ (`taskId` của arm B). Dòng kết quả **không lưu** stderr hay `attention` (`claude.mjs:53`; `ccoding.mjs:71`), nên phải mở `artifacts/`. **Sau SR-01/SR-19:** trường nguyên nhân `quota` và `quotaState` mỗi dòng | **Có** | Quarantine rồi chạy lại cùng khóa theo `run-plan.md` §3.0, §5.0; **không** để lượt `failed` nằm lại vì `run.mjs:64` coi mọi khóa đã ghi là xong. Khi chạm hạn mức giữa lô: dừng cả hai arm, chờ khôi phục, chạy tiếp lịch (như E3) |
| **L** | Rò rỉ `leak` (agent chạm bộ đo: hidden, `checklist.json`, `issues.json`, đường dẫn suite) | `leak === true` (`run.mjs:87-91` cho arm A, `:114`, `:121`; `:141-144` cho arm B, tìm trong `calls.jsonl`). `analyze.mjs:11-12` đã loại `leak` khỏi `R`. Best-of-N (A2) đặt `leak` nếu bất kỳ ứng viên nào rò (`:135`) nhưng bước chọn không kiểm | **Có** (đã mặc định trong `analyze.mjs`) | Bắt buộc **kiểm tay** từng lượt `leak` trước khi loại: từ khóa có thể xuất hiện hợp lệ trong prompt hệ thống của arm B (dương tính giả, SR-21). Dương tính giả ⇒ khôi phục lượt, ghi §9. Rò thật ⇒ loại và thay lượt (tối đa 2 mỗi ô). Báo số lượt `leak` theo arm: nếu lệch giữa arm thì ghi khả năng thiên lệch |
| **T** | Timeout | `status = 'failed'` **và** `wallSec ≥ 0,98 × cfg.timeoutMin × 60` với `cfg.timeoutMin` đọc từ `config.json` (`run.mjs:62`, mặc định 60, kế hoạch dùng `--timeout 20`). Arm A: `child.kill('SIGTERM')` sau `timeoutMin` (`claude.mjs:31`) nên không có cờ `timedOut` trong dòng; arm B: `timedOut: true` chỉ đặt trong biến cục bộ (`ccoding.mjs:36`), không vào dòng kết quả. Phải dùng `wallSec` để nhận diện | **Hai trường hợp (như E2):** timeout **do hạ tầng** (cùng chứng cứ E1) → loại; timeout **do hệ không xong** (không có lỗi hạ tầng) → **giữ**, điểm theo grader (thường 0), `wallSec` bằng giới hạn (kiểm duyệt phải) | `--timeout 20` là hạn chót đăng ký, **không đổi sau khi thấy dữ liệu**. Vì đặt 20 phút thấp hơn mặc định 60, báo số lượt T theo arm (arm B nhiều lượt gọi dễ chạm hơn: `suite-review.md` §3) |

Ngoài ba tiêu chí này: lượt `status = 'error'` kèm ENOENT (thiếu `repo/`, 4 bài `a1, l1, l2, r1`) là E4: loại và bài bị bỏ khỏi `--tasks` cho tới khi Phòng Dev sửa; `run.mjs` thoát 0 dù có lỗi nên kiểm `status` sau mỗi cửa sổ.

**Điều chưa làm được trong dữ liệu hiện có (ghi rõ).** `analyze.mjs:11-12` chỉ loại `leak`; lượt `failed` do Q hoặc T hạ tầng vẫn bị tính điểm 0 nếu không lọc. Đến khi SR-01 xong, người vận hành lọc bằng bản sao `runs.jsonl` và ghi lần lọc vào sổ lượt bị loại. Nếu SR-01 làm khác (ví dụ trường `excluded`), ghi v2.1.

### 4.4 Quy tắc dừng

- **(a) Dừng ở n đã định** theo §3.1 (và bảng B-01/B-02): H1 r = 3 (c3–c5), H3 r = 10, H4 r = 11, H5 r = 3, H6 A1 r = 3 và A2 r = 2, H7 r = 5, B-01 9 mỗi bài. **Không xem p, CI, hay chênh lệch** của giả thuyết xác nhận trước khi dữ liệu đủ. Xem thống kê mô tả không phải chênh lệch giữa arm (phục vụ §4.3) thì được; điều chỉnh tăng `--repeats` giữ khóa cũ (`run-plan.md` §3.0) chỉ khi đã đăng ký ở đây.
- **(b) Không dừng sớm vì kết quả**, không tăng n để đuổi p. "Không kết luận" được báo như vậy; mở rộng chỉ qua nghiên cứu mới có đăng ký mới.
- **(c) Dừng vì an toàn/hạ tầng:** hết hạn mức (Q) hoặc ≥ 25 % lượt của một ô bị E1/E4 thì dừng lô; một lượt làn nhanh có ≥ 10 % test ẩn lỗi thì ghi tín hiệu và tiếp tục.
- **(d) Ngân sách:** mỗi cửa sổ xếp tối đa 22 triệu token có trọng số và 3,6 giờ wall-sum (`run-plan.md` §2); hết ngân sách thì dừng, báo n thực tế, ô thiếu dữ liệu bị đánh dấu, **không điều chỉnh phép kiểm**. Thứ tự cắt khi chi phí thật vượt mô hình > 20 %: B3 → A0-opus → B0 × t1–t5 → A2 r2 → A1 r3 (`run-plan.md` §3.2).
- **(e) Chuyển nhánh:** chuyển từ Nhánh 1 sang Nhánh 2 chỉ ở ranh giới cửa sổ, cùng `--out`; không đổi thứ tự `--arms`, `--seed` hay số lượt giữa chừng (lịch xen kẽ phụ thuộc chúng, `run.mjs:42-52`).

## 5. Phân tích chính và phân tích khám phá

**Phân tích chính (xác nhận):** họ Holm {H3, H6} (K = 2 nếu SR-26 xong, ngược lại K = 0 và hai giả thuyết thành ước lượng; H6 còn cần ≥ 3 bài không chạm trần, nếu không H6 thành ước lượng và K = 1, §2.5); H7 (riêng, Nhánh 1); B-01 (họ riêng IUT); B02-M (xác định).
**Ước lượng kèm CI (không p, không Holm):** H1, H2 (§2.4, §2.5). Họ xác nhận thay thế H1′/H2′ sau 5/11 là **dự kiến, chưa khóa** (§2.6).
**Phụ, báo kèm CI:** H4, H5 (mô tả có ngưỡng); ĐK-P1–P9 (họ riêng, §3.3).
**Mô tả/thăm dò (không ra quyết định):** H8, H9, H10; B02-G, B02-Q, B02-H8b. Bài chạm trần ở pilot chỉ vào phân tích thời gian/token (§2.7).
Thứ tự báo cáo: Holm {H3, H6} → H1/H2 (ước lượng) → H7 → H5/H4 → B-01 → B-02 → H8–H10 → ĐK-P1–P9 (H1′/H2′ chỉ khi khóa).

**Phân tích khám phá** (gắn nhãn "khám phá"): (1) kết quả theo từng bài và theo loại bài; (2) độ nhạy: không loại lượt nào; chỉ loại Q; loại lượt cực trị; (3) so với A0-opus, B1–B5, B3 (nếu có); (4) USD ước tính sau SR-02; (5) `byPhase` của arm B (phân rã chi phí theo pha), tỉ lệ vòng sửa; (6) giám khảo cặp (`pairwise.mjs`) cho design, requirements, research: **chỉ báo cáo kèm giới hạn mù** (§6); (7) xu hướng theo thứ tự chạy, `window` đánh số; (8) gộp với harness cũ chỉ cho mô tả và độ nhạy (`run-plan.md` §6.2); (9) H10 điều chỉnh loại bài; (10) mọi con số cho `token-analysis.md` dẫn từ `token-analysis.mjs`; (11) bốn phân tích đo bộ chấm và cổng ở §5.1 (thêm ở bản 2.2).

### 5.1 Phân tích phụ/khám phá ngoài họ Holm: bộ chấm và cổng chất lượng như bộ phân loại (thêm ở bản 2.2)

**Vị thế.** Bốn phân tích dưới đây là **phụ/khám phá**: không p, không ngưỡng bác bỏ, **không vào họ Holm**, không đổi K của §2.5, không dùng để xác nhận hay bác bỏ giả thuyết nào ở §3. Chúng được **thêm sau khi đã bắt đầu thu dữ liệu**, theo yêu cầu của giám đốc ngày 3/11/2026 (V4-02, §9). Mọi phân tích **gộp mọi arm** và không in điểm theo arm (giữ §4: không phân tích giữa chừng). Nhãn người dùng ở (b) và κ MAST không phải dữ liệu của lượt chạy. Công cụ: `analysis/agreement.mjs` (bản đã duyệt ở `analysis/agreement.md` §Duyệt thiết kế); tính lại bằng `--check`.

**Thước đo chung.** Ma trận nhầm lẫn; Accuracy; Precision, Recall, F1 của lớp dương (nhị phân) hoặc macro-F1 (nhiều lớp); Cohen's κ; prevalence; PABAK. Luôn in **số dương thật và số mẫu**. Công thức ở `agreement.md` §Công cụ.

**Lấy mẫu lại và seed.** CI bootstrap phân vị 95 %, B = 2000, seed **20261103** (hằng `SEED`), B lấy lại **theo `runId`** (lượt chạy), không theo mục: các mục và các lần cổng quyết định trong cùng một lượt tương quan. Ngoại lệ duy nhất: κ MAST lấy lại **theo C-xx** (mỗi C-xx một đơn vị, **không có cấu trúc lượt**). Bản lấy mẫu mà thống kê không xác định (κ khi pe = 1) bị bỏ và số hợp lệ được báo.

**Quy tắc cảnh báo prevalence ("nghịch lý κ").** Nhị phân: khi prevalence của tham chiếu **hoặc** tỉ lệ dương dự đoán > 0,9 hoặc < 0,1 thì in cảnh báo kèm PABAK và khớp thô; **không đọc κ riêng lẻ**, báo PABAK cùng κ. Đa lớp: chỉ cảnh báo khi lớp lớn nhất của tham chiếu hoặc của dự đoán > 0,9 (cận dưới 0,1 không có nghĩa khi có ~16 nhãn). Ngưỡng 0,1/0,9 là quy ước, không phải định lý.

| | Câu hỏi | Dữ liệu và quy tắc | Đơn vị lấy mẫu lại |
|---|---|---|---|
| **(a)** | Judge và regex của bộ chấm checklist khớp nhau đến đâu? | Chỉ dòng a1/r1 **đã có judge** trong ảnh chụp 276 dòng (`838a5f1`, sha256 `85db4ddb…`). Chấm lại bằng regex trên artifact đã lưu, **không gọi LLM**. Ref = judge, pred = regex, lớp dương = mục đạt. Báo ở **mức từng mục checklist** và gộp. Báo số dòng bị loại và lý do. Là **độ khớp**, không phải độ đúng | `runId` |
| **(b)** | Judge và regex đúng đến đâu so với người? | **Chỉ chuẩn bị** (`gold-sheet.csv`, ~60 mục phân tầng bài × mục, ẩn arm). **Không báo κ, Accuracy, Precision, Recall hay F1** cho bộ nhãn vàng khi chưa có nhãn người; nhóm không gán nhãn vàng thay giám đốc. Nếu giám đốc gán: ref = nhãn người, `?` loại và đếm riêng, báo thêm độ nhạy coi `?` là 0 | `runId` (mã lượt L01-L12 của khóa) |
| **(c)** | Cổng chất lượng phát hiện lượt lỗi tốt đến đâu? | **Dương thật** của một lượt: test ẩn < 100 % **hoặc** lệnh kiểm tra còn đỏ ở trạng thái cuối. **Dự đoán dương**: B-02, B-10 hoặc CTO ghi "không đạt". Lớp dương = lượt lỗi. Gộp mọi arm, chỉ dòng thuộc ảnh chụp 276 dòng (không đọc dữ liệu sau). **Tên trường dùng được chốt và ghi vào `agreement.md` §(c) trước khi mở dữ liệu.** Đơn vị phân tích chính: lần cổng quyết định, mang nhãn thật của lượt; độ nhạy: một cặp mỗi lượt. **Ngưỡng: nếu có < 10 lượt dương thật thì ghi "recall chưa ước lượng được"** (đếm theo lượt, không theo lần quyết định) và không in recall điểm. B-12 chỉ là đề xuất ở backlog, không chạy | `runId` |
| **κ MAST** | Hai người gán độc lập có cùng nhãn FM cho C-01…C-49 không? | 49 thách thức, nhãn từ `analysis/mast-codebook.md` (14 FM, INF, NA); S3 và S4 gán độc lập (`mast-labels-A.csv`, `mast-labels-B.csv`), phân xử sau. Báo κ trên nhãn chi tiết và, như độ nhạy, trên nhóm (FM-1/2/3, INF, NA). Mẫu 49, nhiều lớp thưa: CI rộng; ghi như vậy | C-xx (không có cấu trúc lượt) |

**Lưu ý hiểu kết quả (c).** Cổng có thể kích hoạt vòng sửa, nên nhãn thật ở **cuối** lượt đã bị cổng can thiệp; precision của (c) là **cận dưới** (cổng đúng nhưng đã chữa lỗi vẫn bị tính dương giả). Recall có thể bị thổi phồng vì cùng lý do. Không suy ra "cổng tốt/xấu" từ một con số.

**Điều gì không làm.** Không dùng (a)-(c) để chọn arm hay sửa bộ chấm; không tạo thêm giả thuyết; không chạy lượt mới; không đọc dữ liệu sau ảnh chụp 276 dòng.

## 6. Đe dọa tính hợp lệ

| Loại | Đe dọa | Biện pháp/ghi nhận |
|---|---|---|
| Nội tại | **Lượt hỏng không chạy lại, tính điểm 0** (`run.mjs:64`; `analyze.mjs:11-12`). Arm B (nhiều lượt gọi) hay arm chạy cuối cửa sổ bị phạt giả | §4.3 (Q, T); SR-01; quarantine trước mỗi lần chạy lại và phân tích |
| Nội tại | **Thứ tự**: xen kẽ + xoay, không phải khối ngẫu nhiên hoàn toàn; arm đứng đầu 7/6 với k = 2 (`run.mjs:47-53`) | Ghi thứ tự thực từ `at`; SR-23 (P2). Báo là "xen kẽ + xoay" |
| Nội tại | **Các arm chạy ở cửa sổ khác nhau**: A0-sonnet r1–r3 chỉ ở W1 (`run-plan.md` R5) | A0-sonnet chạy xen kẽ r4–r5 cùng B0; so A0-sonnet W1 với t1–t5 của C9 để kiểm trôi theo thời gian |
| Nội tại | **Hạn mức đổi trạng thái giữa chừng** (README:65 cấm trộn nhưng không có cơ chế) | Cờ `window` và `quotaState` (SR-19, SR-03); trước đó ghi tay mỗi cửa sổ |
| Nội tại | **Phiên bản CCoding khác nhau giữa các arm và giữa các cửa sổ** (Phòng Dev đang gộp `main`; `run.mjs:169-176` không ghi hash) | Chờ SR-03. Trước đó: `git rev-parse HEAD` và `git status --short` trước mỗi cửa sổ, ghi vào §8; không `git pull` hay đổi nhánh giữa cửa sổ; nếu phải đổi thì `--out` mới (`run-plan.md` §6.4). `analyze.mjs` cảnh báo khi một arm có hơn một hash |
| Nội tại | **Cùng runtime** `claude-cli` (`run.mjs:33`): công bằng về model nhưng B0 có lập lịch pha riêng, model từng pha không ghi vào dòng; B5 qua REST + `senior-swe` | Ghi cấu hình thực của B0 và B5 mỗi lô; giải thích chênh B5 so A0 gồm cả khung và hồ sơ vai |
| Nội tại | **Máy dùng chung / hạn mức dùng chung** với cloud và CCoding của giám đốc (`run-plan.md` R1) | Giám đốc xác nhận không dùng CCoding trong cửa sổ chạy; ghi M thực dùng sau mỗi cửa sổ; một luồng tuần tự để `wallSec` dùng được |
| Cấu trúc | **`weighted` khác USD**; `5 × output` đúng trong một model; `0,1 × cacheRead` làm phiên dài rẻ giả; hai hệ đo token khác nhau (A: `result.usage`; B: tổng `calls.jsonl`); `costUsd` của B = 0 | Chỉ số chính `weighted` (khớp giám đốc); báo token thô và `cacheRead/total`; USD chỉ độ nhạy sau SR-02 (§2.1); không suy tương đương USD |
| Cấu trúc | **`size` không định nghĩa**, gán không nhất quán, lẫn loại bài; nhãn `hypotheses` trong `task.json` không khớp bộ lọc `analyze.mjs` | H10 thăm dò; H1 cố định danh sách bài; đăng ký theo mã H, không theo nhãn (SR-05, SR-15) |
| Cấu trúc | **Grader regex bắt chữ** (a1, r1: `sign` khớp "design"; `daily-volume` bỏ sót "1,4 TB"); `eq` so khóa theo thứ tự (`l1`); `s1` không phân biệt mồi nhử với FP khác; `citationPrecision` không kiểm đúng bài; null ≠ 0 ở c3 (0,17) và c5 (0,22) | Chạy toàn nghiên cứu `--judge` và khóa một chế độ chấm (SR-07); SR-09/16/17/18 (P1); Δ giữa hai arm triệt tiêu sàn null nhưng H10 thì không |
| Cấu trúc | **Giám khảo LLM chấm sản phẩm LLM** (`pairwise.mjs`, `lib/judge.mjs`): mù một phần (`blind()` `judge.mjs:6-12`; sản phẩm B thường tiếng Việt, có `REVIEW.md`/`NOTES.md`); giám khảo mặc định `opus` trùng model A0-opus (`pairwise.mjs:14`); không giám khảo ngoài họ Claude, không đối chiếu người; không CI/kiểm định dấu; cắt ở 60 000 ký tự | Chỉ báo pairwise kèm giới hạn; không dùng pairwise để ra quyết định cho họ Holm; SR-08a (≥ 20 % cặp do người chấm, giám khảo thứ hai) và SR-08b (P1, CI nhị thức). Tài liệu về thiên lệch tự ưu ái chưa kiểm nguồn trong gói này: coi là rủi ro cần kiểm |
| Ngoại tại | 13 bài tổng hợp, JS/Node, tác nhân Claude; 6 loại nhưng H3, H4, H9 chỉ 1 bài; t1–t5 đã dùng để tinh chỉnh CCoding (C1–C8) nên lạc quan | Kết luận H3/H4/H9 chỉ về s1/a1/re1; bộ phụ có ĐK-P7 (t6–t8) làm bài giữ lại; không khái quát sang Opus hay việc lớn |
| Kết luận thống kê | 3 lượt/ô; 2–4 bài cho H1/H2 (p hoán vị ≥ 0,0625 nên chỉ báo ước lượng, §2.5); **trần điểm ở pilot** (§2.7; n = 1, chưa `--judge`, có thể do grader regex dễ); H1′/H2′ chưa khóa (§2.6); H3/H6 chưa có p (chờ SR-26, §2.5), s1 chưa xét trần (§2.7); TOST thiếu công suất ở H6; **H6 dễ "đạt" giả do trần/suy biến, đã chặn bằng quy tắc trần, p = NA và ngưỡng ≥ 3 bài (§2.5)**; σ bộ mới đều là giả định; trần điểm (A0-sonnet 1,000 ở t1–t5); `.some()` ở H6; xáo trộn H10 không đều; lỗi lệch chỉ số H5 (`:81-83`) | "Không kết luận" ≠ "không có hiệu ứng"; báo cỡ hiệu ứng và CI; sửa SR-06 trước khi chạy H5 |
| Kết luận thống kê | Chọn ngưỡng sau khi biết bộ bài (`size ≥ 3`, biên 5 pp) | Ngưỡng và danh sách bài của H1–H10 đóng băng ở §3.1 khi khóa |
| Rò rỉ | Tác giả đã thấy C1–C9 một phần (C9 ca t5) và `selftest` | Ca t5 chỉ dùng để thiết kế B02-M, không dùng làm xác nhận nào khác; §8 |
| Rò rỉ | `leak` có thể dương tính giả hoặc bỏ lọt (A2 không kiểm ở bước chọn) | §4.3 L; SR-21 (P2) |

## 7. Hiệu chỉnh ngưỡng nhỏ/lớn của B-01 (giữ từ bản 1, đổi mã)

**Vai trò của ĐK-P4.** Kết quả ĐK-P4 (a, b) là đầu vào hiệu chỉnh ngưỡng làn đơn/đa tác tử của B-01. Hệ số chặn a và độ dốc b chỉ được **định cỡ** trên C1–C8 (mô tả) và **xác nhận** trên C9 cùng `l1-modules`, `l2-chain`. **H10 của giám đốc không được dùng để hiệu chỉnh ngưỡng** cho tới khi SR-05 xong (§3.1).

**Công thức chọn làn** (thống nhất với `improvement-backlog.md` §3.1): làn đơn khi **T̂_đơn < k × a**. Với T_CC = a + b·T_đơn, T* = a/(1 − b), nên k* = **1/(1 − b)**. Quy tắc cập nhật:
- Chỉ cập nhật k khi **CI 95 % của b nằm hoàn toàn dưới 1** và ĐK-P4 được xác nhận (a > 30 s); khi đó k_mới = 1/(1 − b̂_trên), dùng cận trên (ưu tiên làn đơn khi chưa chắc).
- CI của b chạm 1 (hoặc ≥ 1): không nâng k; ghi "chưa hiệu chỉnh".
- ĐK-P4 bị bác bỏ (a ≤ 30 s): k giảm theo độ nhỏ của a.
- Ngưỡng `parts`/`filesTouched` còn được kiểm bằng ĐK-P5 (bài độc lập) và ĐK-P6 (bài chuỗi) như hai điểm đầu mút; nếu ĐK-P5 và ĐK-P6 cùng "Không kết luận" thì k giữ nguyên.
- Giá trị ban đầu: `a₀ = 87,1 s`, `b₀ = 0,428`, `k₀ ≈ 1,75` (hồi quy thô C7, `improvement-backlog.md` §3.1): thăm dò, không xác nhận.

## 8. Khóa đăng ký (có điều kiện)

| Mục | Giá trị |
|---|---|
| Phiên bản | v2.1 (v2.0 gộp ở `0320f44`; v1.0 nhiệm vụ T-20261102-134405-b2c). v2.1 soạn trên `3227da0` |
| Soạn trên | nhánh `ccoding/t-20261102-175854-65c--s4`, sau commit HEAD `efa97a6` (gộp S2 — R7) |
| Thời điểm khóa | **Không có thời điểm khóa.** `git log --format='%H %aI' -- docs/research/preregistration.md` (kiểm 3/11/2026): không commit nào điền ô này; lần sửa cuối trước vòng 3 gói 3 là `9f547577649ecd0b9c098a8876848adfd5e8ed25` 2026-11-02T19:25:31+07:00 (= 12:25:31Z), tức **trước** khi W1 kết thúc (13:15:35Z) và trước W2a–B7a. Dữ liệu W1 đã vào `runs.jsonl` từ `e51e5fbf3711313e2c4f273e89a43f8e3d5f39ab` 2026-11-02T11:44:17Z. Ghi sau khi dữ liệu đã có, không ghi lùi ngày: xem §9, V3-01 |
| Hash commit khóa | **không có** (không có commit khóa; xem §9, V3-01) |
| **Hash commit merge Phòng Dev** (bộ đo sau sửa tự kiểm, gộp `main`, `task.json` t1–t5, arm làn nhanh, cờ hạn mức, `l2-chain`) | Không có commit gộp vào `main` tại thời điểm phân tích. Nội dung đã dùng nằm ở nhánh server 7425, đầu nhánh `7fb18bab45c39e1cbba16bf9d4abec45cf2a379c`: `30101dd` (`task.json` t1–t5), `e6a8504` (arm B6/B7 vào runner), `630e2b7` (gộp B-01/B-02/B-10), `994d9c8` (arm B7), `7fb18ba` (3 sửa bộ đo). `l2-chain`: chưa kiểm. Các SR P0 chưa đóng (bảng SR dưới) |
| Điều kiện SR P0 | SR-01 … SR-07 và SR-08a (`suite-review.md` §5): trạng thái từng SR ở §9 |
| Hash CCoding của từng cửa sổ chạy | Nguồn: `RUNLOG.md` (dòng 22, 42, 74) và `config-<nhãn>.json`; `run.mjs` không ghi hash vào dòng kết quả (SR-03). Tên cửa sổ là nhãn của study-cloud, không trùng W1–W5 của `run-plan.md`. **W1** (2026-11-02T11:41:23Z → 13:15:35Z): `e0bd2f401905c8d1765e70b067f4f9855d4a453e` (`origin/main`, cổng 7424, web **không** chặn) · **W2a** (13:35:16Z → ~15:05Z, N4 `--judge`): `e0bd2f4` (7424, chặn web) · **W2b** (15:06:53Z → 16:19:44Z, B6 × T5): `7fb18bab45c39e1cbba16bf9d4abec45cf2a379c` (nhánh, 7425, chặn web) · **W2c** (16:21:18Z → 16:40:11Z, s1 r4–10): `e0bd2f4` (7424) · **B7a** (16:41:19Z → 19:12:11Z, B7 × T5 × r1–9): `7fb18ba` (7425) · W3, W4, W5: chưa chạy. `git status --short` của server: sạch (RUNLOG dòng 22, 42). Arm A0-sonnet không qua server CCoding nên không có hash CCoding |
| Hash bộ đo | Runner W2a→B7a: `7fb18ba` (blob `run.mjs` `4705327b24c0438fc303b6d295d2a243e67f2e77`, `lib/grade.mjs` `bfa6780c670fa5ee52eb1e556002dbb2b0057160`, `analyze.mjs` `df82b827bf7e10be1165fc92a82d534196207b10`, đọc bằng `git rev-parse 7fb18ba:<đường dẫn>`). Runner W1: bản trước `7fb18ba` (RUNLOG dòng 43), commit chính xác không ghi trong RUNLOG: **chưa xác minh**. `pairwise.mjs`: không dùng |
| Phiên bản `claude` CLI, model giám khảo | `claude` 2.1.316, Node v22.23.4 (`RUNLOG.md` dòng 6); giám khảo `opus` (mặc định) chỉ ở W2a (`config-W2a.json`: `--judge`) |
| Hash CCoding bộ phụ | C1: `14e2ec6` · C3: sau `d767806`, `e9147d8` · C4: sau `aa6aa3a` · C5: sau `9589c2f` và `0e82b82` · C6: `d7600f6` · C8: `c55a249` · C2, C7: chưa xác định chắc. C9 (cam kết): `c55a249` hoặc con cháu không đổi `src/`; hash thực dùng: ______ |
| Công cụ phân tích | `analyze.mjs` ở hash trên (hạt 20261102 cho bootstrap/hoán vị do phép kiểm mới; `analyze.mjs` có hạt riêng); script TOST ngoài (phương án lùi §2.3, đã dùng ở vòng 3 gói 3): `docs/research/analysis/prereg-tests.mjs`, hash commit 1 (script + test + quy tắc loại, đóng băng trước khi sinh bảng) `f530e89bc5f880af983fcbeabbe5ae7c07757873`, sha256 `3020ca47307bc6553a3ad715952411194256936eed515b50dd4384b804fb6506` (xuống dòng LF); commit 2 (kết quả `--write`, đối chiếu) `3793f95519767cbcffe2f724fbec566fcebb5380`, không đổi script. **Ghi sau khi dữ liệu đã có, xem §9 V3-01**; không phải hash đăng ký trước. `prereg-tests.mjs` (bộ cũ, chưa có): không áp dụng |
| Cam kết chưa xem dữ liệu bộ mới | v2.0: `bench/vs-claude/results/` không có `pilot*`. **v2.1: có pilot của giám đốc (`pilot1`, n = 1, `main` e0bd2f4, không `--judge`); tác giả đã xem bảng điểm/thời gian/token của 24 lượt trong đề bài (sai lệch số 3, §9). Pilot không phải dữ liệu xác nhận.** Tác giả **chưa xem kết quả W1–W5 nào**. Tác giả đã xem C1–C9 một phần, `selftest`, và `context/c9-partial-2026-11-02.md` (ca t5) |
| Nếu có người xem kết quả bộ mới trước khóa | **Có**: người chạy thấy điểm của 2 lượt t1-duration r8 lúc 18:41Z (RUNLOG dòng 85), và pilot ở bảng trên; xem §9 V3-09. Dòng "Tác giả chưa xem kết quả W1–W5 nào" ở trên đúng tại v2.1 (2/11/2026) và **không còn đúng** cho bộ sau B7a |
| Lệnh sẽ chạy | `run-plan.md` §5 (W1–W5), §5.3 (phân tích); `analyze.mjs` và `pairwise.mjs` theo §3.1 |

## 9. Sai lệch so với đăng ký

(Mọi sửa đổi sau thời điểm khóa, mọi lần dùng phương án lùi (§2.3), mọi lượt t6–t8 chạy trước khóa, mọi thay đổi hash, ngân sách hay n phải ghi vào đây trước khi xem kết quả liên quan.)

**Sai lệch của đề bài so với bản 1 (ghi nhận ở v2.0):** brief viết "8 giả thuyết bản 1"; thực tế bản 1 có **9 giả thuyết** (H1–H8 theo đề bài và H9 thêm cho B-01). Bản 2 đổi mã **cả chín** thành ĐK-P1–P9 và ĐK-P9 ánh xạ sang B-01 mới (§3.3).

**SR P0 đang chờ Phòng Dev và ảnh hưởng đến khóa** (từ `suite-review.md` §5; trạng thái: "chờ" cho tới khi có hash merge đóng nó):

| SR | Nội dung | H / giả thuyết bị ảnh hưởng | Trạng thái | Nếu không xong |
|---|---|---|---|---|
| SR-01 | `done` chỉ gồm `status === 'done'`; trường `excluded`; `analyze.mjs` loại Q/T/L theo §4.3 | Tất cả H1–H10, B-01, B-02 | **chưa xong; dùng phương án lùi (V3-06)** | Phương án lùi: bản sao `runs.jsonl` đã lọc (§2.3, §4.3); ghi §9 |
| SR-02 | Cộng `costUsd` cho nhánh `calls.jsonl`; lưu `model` mỗi cuộc gọi | Độ nhạy USD của B-01(a) | **chưa xong; bỏ độ nhạy USD (V3-06)** | Bỏ độ nhạy USD của B-01 trong lần chạy này; kết luận chỉ về token có trọng số |
| SR-03 | Ghi hash CCoding, phiên bản `claude` CLI, model thực, `window`, `quotaState` mỗi dòng | Mọi H | **chưa xong; ghi hash tay theo cửa sổ (§8, RUNLOG), không có hash mỗi dòng (V3-01, V3-02)** | Ghi hash tay mỗi cửa sổ (§8); một hash mỗi arm; nếu đổi hash thì `--out` mới |
| SR-04 | Hàm TOST dùng chung (bootstrap 90 % trên log-tỉ số) | H2, H6, B-01 | **chưa xong; dùng script TOST ngoài của S1 (V3-06)** | Script TOST ngoài (§2.3); nếu không có: H2, H6 chỉ báo ước lượng và CI, không phán |
| SR-05 | Định nghĩa `size`, `sizeBasis`; H10 điều chỉnh loại bài, CI độ dốc, Fisher-Yates | H10, H1 | **chưa xong; H10 không phân tích ở vòng này (thăm dò)** | H10 thăm dò (đã đăng ký vậy); H1 theo danh sách bài cố định |
| SR-06 | Sửa lỗi lệch chỉ số `analyze.mjs:81-83` | H5 | **chưa xong; tính H5 bằng script ngoài (V3-06)** | Tính H5 bằng script ngoài hoặc kiểm tay không có bài NaN |
| SR-07 | Khóa một chế độ chấm; chạy chính luôn `--judge` | H1 (r1), H4, H9 | **chưa xong; chế độ chấm bị lẫn: `--judge` chỉ ở W2a (V3-08)** | Chạy `--judge` cho mọi arm a1, r1, re1; ghi §9 nếu lẫn chế độ |
| SR-08a | Giám khảo cặp: đối chiếu người, giám khảo thứ hai (phần CI nhị thức là SR-08b, P1) | Mọi kết luận dùng pairwise; H4, H9 | **chưa xong; không chạy pairwise ở vòng này** | Không dùng pairwise để quyết định; báo giới hạn mù |
| SR-26 | p hoán vị hai mẫu chính xác cho H3 (C(20, 10), biên dịch); p bootstrap tương đương (hợp giao hai phía, A1/A2) cho H6 **kèm quy tắc trần cả hai arm, p = NA khi Δ\* suy biến, ngưỡng ≥ 3 bài**; có hạt và test | H3, H6 (họ Holm) | **chưa có mã; chưa dùng phương án lùi script ngoài cho H3/H6 (V3-06): họ Holm rỗng, K = 0 (§2.5) trừ khi S1 bàn giao phép kiểm có test và hash** | Script ngoài có test + hash (§2.3); nếu không có: H3, H6 hạ xuống ước lượng, họ Holm rỗng (§2.5) |

**SR-25 (P0, nhánh sau 5/11):** phép hoán vị phân tầng theo lượt cho H1′/H2′ (§2.6; `suite-review.md` §5). Trạng thái: **chờ**. Không chặn khóa nhánh trước 5/11 (H3, H6, H7, B-01, B-02); chặn khóa H1′/H2′.

Các SR P1 ảnh hưởng phép kiểm (SR-10 cho H3, SR-12 cho H6, SR-13 cho H8, SR-14 cho H7, SR-18 cho H9, SR-08b cho pairwise) **không chặn khóa**; nếu được làm trước khi chạy thì ghi **v2.1** (CHANGELOG) với phép kiểm mới và giữ phép kiểm cũ như độ nhạy.

| STT | Ngày | Giả thuyết/mục | Nội dung đã đăng ký | Thực tế | Lý do | Xem kết quả trước khi sửa? | Ảnh hưởng đến diễn giải |
|---|---|---|---|---|---|---|---|
| 1 | 2/11/2026 | Tổng quát (mã P) | brief: 8 giả thuyết bản 1 | 9 giả thuyết, đổi mã ĐK-P1–P9 | Đối chiếu bản 1.0 | Không | Không |
| 2 | 2/11/2026 | H1, H2, §2.5 | v2.0: H1, H2 trong họ Holm K = 4, "đạt" | v2.1: H1, H2 là ước lượng kèm CI; họ Holm {H3, H6}, K = 2 | Review gói 2: p_min của hoán vị đổi dấu theo bài = 2⁻ⁿ hoặc 2¹⁻ⁿ (≥ 0,0625 với n ≤ 4) vượt ngưỡng Holm | Không (chưa có dữ liệu bộ mới) | H1, H2 không còn được gọi "xác nhận"; H3, H6 có ngưỡng Holm nới (0,0125 thay 0,00625) |
| 3 | 2/11/2026 | H1, H10, §2.7 | v2.0: H1 dùng điểm c3–c5; H10 thăm dò trên 13 bài | Quy tắc trần: bài mọi arm ≥ 0,99 ở pilot không làm bằng chứng điểm cho H1, H10 (chỉ thời gian/token) | **Quyết định thích ứng trước khóa, đặt sau khi xem pilot**: pilot `pilot1` (n = 1 lượt/ô, từ `main` e0bd2f4, không `--judge`) cho 1,00 ở mọi arm trên 8 bài (c1–c5, l2-knights, l4-startup-order, re1). Không tính vào dữ liệu xác nhận; không là đầu vào cho p_min hay baseline | **Có**: tác giả đã xem điểm pilot (không phải dữ liệu W1–W5) | H1 không còn bằng chứng điểm ở c3–c5; H10 không kiểm được về điểm trên 13 bài nếu trần kéo dài; nguy cơ trần do grader regex dễ (chưa `--judge`) chưa kiểm |
| 4 | 2/11/2026 | H1′/H2′, §2.6 | (mới) | Họ H1′/H2′ sau 5/11 ghi "dự kiến, chưa khóa" | Chờ SR-25 và `task.json` của `l1-modules`, `l2-chain`, t1–t5 | Không | Không có hiệu lực xác nhận cho tới khi khóa |
| 5 | 2/11/2026 | H3, H6, §2.5 | v2.1 (bản soạn đầu): H3, H6 "đạt, ở lại họ" với p bootstrap | Họ {H3, H6} có điều kiện SR-26; thiếu SR-26 thì hạ xuống ước lượng, K = 0. Điều khoản dự phòng trần cho s1 (§2.7) | Review gói 2b: `analyze.mjs` không tạo p nào cho H3 (`:69-75`) và H6 (`:86-91`); phép kiểm xác nhận dựa trên mã chưa có, cùng loại lỗi với H1, H2 | Không (chưa có dữ liệu bộ mới) | Có thể không có giả thuyết xác nhận Holm trước 5/11 |
| 6 | 2/11/2026 | H6, H3, §2.5, §2.7 | v2.1 (sau mục 5): H6 chạy trên mọi bài, bootstrap, p_min 1/4001 "đạt"; H3 bootstrap | H6 chỉ trên l1-modules, l2-chain, t1–t5; loại bài mà mọi lượt cả hai arm của cặp đều ≥ 0,99 (một phía thì giữ; đổi từ 1,00 sau review vòng 2 của gói 2c); Δ\* suy biến ⇒ p = NA (một cặp NA ⇒ p(H6) = NA), phán quyết theo CI §2.4 (Bác bỏ nếu ngoài ±0,05 ở mọi mẫu, ngược lại "Không kết luận (trần/suy biến)"); W1 đang chạy nhưng chưa đọc; < 3 bài ⇒ ước lượng kèm CI 90 %, họ Holm chỉ còn H3 (K = 1); H3 dùng hoán vị hai mẫu chính xác C(20, 10) = 184 756 (biên: recall − 0,15, precision + 0,05) | Review gói 2b (major): pilot cho 8/13 bài 1,00 ở B0 và B5; ở các bài đó bootstrap luôn cho Δ\* = 0, kéo trung bình về 0, co phương sai, nên p tương đương "đạt" chỉ vì trần. Minor: bootstrap trên 10 lượt cho p thô | **Có**: tác giả đã xem điểm pilot (không phải W1–W5; không đọc `results/study-cloud/`) | H6 có thể thành ước lượng nếu t1–t5 chạm trần; tập bài chọn sau khi xem pilot (quyết định thích ứng) |

### Sai lệch vòng 3 gói 3 (phân tích xác nhận B-01 và H5 trên study-cloud; ghi 3/11/2026)

Mọi dòng dưới ghi **sau** khi dữ liệu W1–B7a đã có trong `runs.jsonl`, và S2 chưa xem điểm lượt nào để viết chúng. Nguồn: `bench/vs-claude/results/study-cloud/RUNLOG.md` (viết tắt RL, số = dòng), `config-<nhãn>.json`, `git log` đã chạy ngày 3/11/2026.

| Mã | Đăng ký nói gì (§) | Thực tế (hash commit / dòng RUNLOG) | Phép bị ảnh hưởng | Cách xử lý |
|---|---|---|---|---|
| V3-01 | §2.3, §8: hash script TOST và ô khóa (thời điểm, hash khóa, hash merge Phòng Dev) điền **trước khi mở dữ liệu chính**; §9 ghi trước khi xem kết quả liên quan | Ô khóa còn trống: không commit nào điền §8 (`git log --format='%H %aI' -- docs/research/preregistration.md`, commit cuối `9f54757…` 2026-11-02T19:25:31+07:00 = 12:25:31Z). Dữ liệu có trước: W1 từ `e51e5fb…` 11:44:17Z; W2a–W2c từ 13:35:16Z; B7a kết thúc 19:12:11Z (`89a3a24` 19:13:14Z). Script `prereg-tests.mjs` được viết sau toàn bộ dữ liệu | B-01 (a)(b)(c), H5, mọi phép dùng phương án lùi | Dùng phương án lùi §2.3 (script ngoài đọc bản sao `runs.jsonl`). Quy tắc loại, biên, hạt, B đóng băng bằng thứ tự hai commit của S1 (commit 1 = script + test, trước khi sinh bảng); hash script ghi ở §8 sau khi có, kèm chú thích "ghi sau khi dữ liệu đã có". Không ghi lùi ngày. Kết luận B-01 mang nhãn "đăng ký khóa muộn": không phải xác nhận theo nghĩa đầy đủ của §2.4 nếu người đọc coi hash trước dữ liệu là điều kiện; S3 nêu rõ trong khuyến nghị |
| V3-02 | §6 hàng "Phiên bản CCoding khác nhau": một hash mỗi arm; đổi hash thì `--out` mới (`run-plan.md` §6.4) | Hai server: B0 chạy `main` `e0bd2f401905c8d1765e70b067f4f9855d4a453e` (W1 RL:22; W2a RL:42; W2c RL:65), B6/B7 chạy nhánh `7fb18bab45c39e1cbba16bf9d4abec45cf2a379c` (W2b RL:55; B7a RL:74). RL:38 nói "ghi vào `--out` mới" nhưng cả năm `config-*.json` đều có `--out bench/vs-claude/results/study-cloud` (cùng thư mục, theo `run-plan.md` §3 "cùng một thư mục"). `runs.jsonl` không có hash mỗi dòng (SR-03) | H5 (cặp B6 so A0 ở W2b và B7 so A0 ở B7a dùng server nhánh; B0 so A0 dùng `main`); so sánh B0 với B6/B7 | H5 chỉ ghép cặp trong cùng cửa sổ và cùng server (B0/A0: W1, W2a, W2c; B6/A0: W2b; B7/A0: B7a). So B0 với B6/B7 chỉ mô tả, mọi bảng kèm chú thích khác server. Hash theo cửa sổ lấy từ RL, không từ dòng kết quả |
| V3-03 | §6, `run-plan.md` §3.0: không đổi nhánh giữa cửa sổ; nếu đổi thì `--out` mới | Nhánh đã gộp `main` trong lúc W1 chạy (RL:38); chủ dự án yêu cầu W1 xong trên `origin/main`, các cửa sổ sau trên server dựng từ `perf/vs-claude-loop` (RL:38). Server nhánh 7425 chứa mã mà `e0bd2f4` không có: `git diff --stat e0bd2f4 7fb18ba -- src/` = 11 tệp, +1257/−32 (`src/lane.ts`, `plan-gate.ts`, `quality-gate.ts` mới; `orchestrator.ts` +571) | B6, B7 (khác B0 ở mã, không chỉ ở cấu hình) | Là thiết kế của B-01/B-02/B-10 (arm cần mã mới); không sửa được. Ghi là đe dọa nội tại: chênh B6/B7 so B0 gồm cả mã `orchestrator`/prompt khác, không chỉ lane |
| V3-04 | §6 hàng "Cùng runtime": B0 và arm A cùng `claude-cli`; `run-plan.md` không nói về công cụ web | Runtime `claude-cli` của CCoding cấp WebSearch/WebFetch cho 7 agent, arm A cấm (RL:34). W1: web **mở** ở B0; 27 lượt B0 đã kiểm `calls.jsonl`, không lượt nào gọi web (RL:35). Từ W2: chặn bằng `extraArgs: ["--disallowedTools", "WebFetch,WebSearch"]` trong `ccoding.local.json` của cả hai server (RL:36, RL:42); W2a/W2c/B6/B7 đã kiểm không có lượt gọi web (RL:53, RL:63, RL:72, RL:83) | H5 (B0/A0 ở W1 so W2a/W2c); B-01 không bị ảnh hưởng (B7 chạy khi web đã chặn) | Giữ W1 trong H5, đối xứng vì không lượt nào dùng web (bằng chứng RL:35). Độ nhạy bỏ W1 khỏi H5 (nếu chênh thì báo). Không cần loại lượt nào |
| V3-05 | §2.3, §8 (Hash bộ đo), `run-plan.md` §5.2: runner cố định; không sửa bộ đo giữa chừng | Một commit sửa `bench/` trên nhánh: `7fb18bab45c39e1cbba16bf9d4abec45cf2a379c` 2026-11-02T13:32:43Z (4 tệp, +88/−11): `lib/ccoding.mjs` (dò hạn mức chỉ trên `error/errorKind/attempts` của `calls.jsonl`; lỗi tạo project/task ghi `infra`), `run.mjs` (arm B chưa tạo task thì trả `infra`), `lib/grade.mjs` (`--test-force-exit`, `--test-timeout=600s`, hạn tiến trình 900 s, lấy dòng tổng kết TAP cuối; **t4 với starter: null trước 0/0 nay 16/19**, oracle 19/19), `test/fixes.test.mjs`. W1 (xong 13:15:35Z) chạy runner **trước** commit này (RL:43); W2a bắt đầu 13:35:16Z, sau commit 2 phút 33 giây. Các commit khác chạm `bench/` ở nhánh nhưng không phải sửa bộ đo: `994d9c8` (2026-11-02T19:41:09+07:00, `arms.json` B7 và `test/queue.test.mjs`), `5a8f655` (RUNBOOK 3b), `630e2b7` (gộp), `0c77d45` (kết quả pilot), các commit `study-cloud` (chỉ `results/`). `analyze.mjs` blob `df82b827…` giống ở `7fb18ba` và `HEAD` | Điểm t4 (B-01(c)); phát hiện hạn mức t5 (Q); W1 so W2+ về cách chấm | W1 là R9, không có t4/t5 nên không bị ảnh hưởng (RL:43). B-01 dùng toàn bộ t1–t5 sau `7fb18ba` ở cả hai arm (cùng grader), nên không có chênh grader giữa A0 và B7 trong B7a. Nhưng **A0 r1–3 của W2b và A0 r4–9 của B7a** cùng sau `7fb18ba`: cùng grader. Commit chính xác của runner W1 chưa xác minh (§8) |
| V3-06 | §2.3 (SR-01, SR-04), §2.5 (SR-26), §9 bảng SR: chờ Phòng Dev merge | SR-01 (loại Q/T/L), SR-02 (USD), SR-04 (TOST), SR-06 (lỗi lệch chỉ số H5 `analyze.mjs:81-83`), SR-26 (p H3/H6) **chưa có mã** trên `7fb18ba` (`analyze.mjs` giống `HEAD`, blob `df82b827…`). Trạng thái từng SR ở bảng SR phía trên | B-01 (SR-01/04), H5 (SR-06), H3/H6 (SR-26) | SR-01, SR-04, SR-06 dùng phương án lùi bằng `docs/research/analysis/prereg-tests.mjs` của S1 (lọc trên bản sao `runs.jsonl`; `analyze.mjs` chạy riêng để đối chiếu, lệch thì giải thích ở `analyze-reconcile.md`). SR-02: bỏ độ nhạy USD, B-01(a) chỉ dùng token có trọng số. SR-26: chưa có, nên H3/H6 chưa đủ điều kiện vào họ Holm, K = 0 (§2.5) |
| V3-07 | §3.1/§3.2 (run-plan §3.2, §5.2): làn nhanh `FL` là arm B-01; mẫu B-01 = 9 lượt mỗi bài mỗi arm (§4.4(a)); không có arm B7 trong `run-plan.md` | Arm B7 (làn đơn) thêm ở RUNBOOK bước 3b (`5a8f655`), không có trong `run-plan.md` (§5.2 chỉ có `FL`). Tên `FL` đổi thành B6 trong `arms.json`. B7a: B7 r1–9 (45 lượt) và A0-sonnet r4–9 (30 lượt) ở 7425 (RL:16, RL:76); A0-sonnet r1–3 lấy từ W2b (15 lượt, RL:14). Tổng A0 trên t1–t5 = 45 lượt, 9 mỗi bài, từ **hai cửa sổ** (W2b 15:06:53–16:19:44Z; B7a 16:41:19–19:12:11Z). W2c (s1 r4–10, 14 lượt) và lệnh `--repeats 10` của `run-plan.md` §5.2 được tách thành r4–10 vì A0 và B0 đã có r1–3 từ W1 (RL:65) | B-01 (cặp A0), H3 (s1 r = 10 nhờ W1 + W2c) | Quyết định trước kết quả (kế hoạch nhiệm vụ T-20261103-021358-275): phân tích chính B-01 dùng A0-sonnet **cùng cửa sổ B7a** (r4–9, **6 lượt mỗi bài**, dưới 9 của §4.4(a)); bản gộp A0 W2b+B7a (9 mỗi bài) là độ nhạy. Hai bản khác trạng thái thì báo cả hai và lấy bản chính. Xem `validity-round3.md` đe dọa 2 |
| V3-08 | SR-07: khóa một chế độ chấm; `--judge` cho a1, r1, re1 | `--judge` chỉ ở W2a (N4 = a1, l1-oncall, l2-knights, r1; `config-W2a.json`); W1, W2b, W2c, B7a không dùng (`config-*.json`: `judge.enabled: false`) | Điểm theo bài và theo arm (mô tả); H1(r1), H4, H9 | Không phân tích H1, H4, H9 ở vòng này; điểm N4 ở W2a báo riêng, không trộn với R9/T5 |
| V3-09 | §4.4(a): không xem p, CI, chênh lệch trước khi đủ n; `RUNLOG` dòng 8 và §4.4a: không xem điểm giữa cửa sổ | Người chạy thấy điểm của 2 lượt t1-duration r8 lúc 18:41Z khi xem đuôi log, trong cửa sổ B7a (RL:85); các lần xem sau đã lọc cột điểm. Chưa biết 2 lượt thuộc arm nào và điểm ra sao | B-01(c) (điểm) | Ghi nhận, không loại lượt (vì điều kiện loại ở §4.1 chỉ dựa trên nguyên nhân kỹ thuật). Báo độ nhạy B-01(c) bỏ 2 lượt t1 r8 và bỏ cả bài t1. Người viết S2 chưa xem điểm lượt nào |
| V3-10 | `run-plan.md` §2, §3.0: một luồng tuần tự, máy rảnh, giám đốc xác nhận không dùng CCoding trong cửa sổ chạy (R1); hạn mức Q không gặp | `run.mjs` chạy tuần tự (không có `Promise.all`/hàng đợi song song trong `run.mjs`, `lib/`; tìm bằng Grep, 0 kết quả). Nhưng hai server (7424, 7425) cùng chạy trên một máy, cộng trình theo dõi tự commit dừng lúc 18:41Z và khởi động lại (RL:84). Không có bản ghi M thực dùng sau cửa sổ và không có xác nhận của giám đốc trong RL. Không gặp hạn mức (RL:32, RL:76) | `wallSec` (B-01(b), H5 thời gian) | Ghi là đe dọa (validity-round3.md đe dọa 3). Không có cách loại; trần `wallSec` không đo được. Báo trung vị theo ô, CI bootstrap |
| V3-11 | §6 hàng "Các arm chạy ở cửa sổ khác nhau"; `run-plan.md` §3.2 chạy t1–t5 ở W2, W4, W5 (B0 × t1–t5 r1 ở W5) | B0 **không chạy** t1–t5 (W5 chưa chạy). Cửa sổ thực: W1, W2a, W2b, W2c, B7a (RL:12–16) khác tên và thứ tự `run-plan.md` §5.2: W2 gồm N4 + FL × T5 + s1 (khớp W2a, W2b, W2c), W4 `FL × T5 r9` (thành B7a, đổi FL → B7), W3 (`B5, FL × R13`) và các lệnh A1, A2, B3 chưa chạy | So B0 với B6/B7 trên t1–t5; H6, H7, H1′/H2′ | Không có so sánh B0 với B7 trên cùng bài. H3, H6, H7 ghi "chưa đủ N" nếu chưa đạt §3.1; không tính p. H1′/H2′ không chạy (SR-25) |
| V3-12 | `run-plan.md` §3.0: `--timeout 20`; §5.0 quarantine; §4.3 Q/L/T | `--timeout 20` ở cả năm lệnh (`config-*.json`). Lỗi hạ tầng và lượt bị loại: 0 ở mọi cửa sổ (RL:12–16, RL:46, RL:55, RL:65, RL:76); leak: 0. Không có quarantine nào được thực hiện | Lượt loại Q/L/T/E1/E4 | Dự kiến loại 0 lượt theo RUNLOG; S1 vẫn áp quy tắc cơ học lên `runs.jsonl` và ghi `excluded-round3.csv` (kể cả khi rỗng) |

Phần khác của `run-plan.md` đã đối chiếu nhưng không tìm thấy lệch: `--timeout 20` (khớp), s1 `--repeats 10` (khớp về tổng, tách thành W1 + W2c), N4 `--judge` r1–3 (khớp), T5 r1–3 trên làn nhanh (khớp). Chưa đối chiếu được: thứ tự xen kẽ thực (SR-23), `config.json` W1 là bản khôi phục từ commit `d0375f9` (RL:44).

### Sai lệch vòng 4 gói 1 (đề xuất chỉ tiêu B-01 mới; ghi 3/11/2026)

| Mã | Đăng ký nói gì (§) | Thực tế / đề xuất | Phép bị ảnh hưởng | Cách xử lý |
|---|---|---|---|---|
| V4-01 | §3.2 B-01 và `improvement-backlog.md` §3.4: chi phí (token có trọng số) và thời gian trong ±15 % của A0-sonnet (R ∈ [0,85; 1,15], TOST bootstrap 90 %) | **ĐỀ XUẤT, chờ giám đốc duyệt:** chỉ tiêu chặng sau B-11 là R ≤ 1,3 (token có trọng số và thời gian); ±15 % giữ làm mục tiêu dài hạn. **Nhãn: post-hoc — sửa sau khi đã thấy dữ liệu B7** (B7/A0 = ×2,498 token, ×2,566 thời gian, bác bỏ B-01 theo `results-round3.md` §5). Lý do: phân rã `b7-cost-decomposition.md` cho thấy cần cắt ≥ 80,1 % chênh lệch để đạt ×1,3 và ≥ 90,1 % để đạt ±15 % (chỉ báo thô, xem B-11.3; T-7, tính ở `improvement-backlog.md` §5 B-11.3 và B-11.4), trong khi phần chi phí cố định của một lượt gọi và của phần thực thi không thể bỏ nhưng chưa đo được (T-6, §Giới hạn) | B-01 (a), (b) cho **dữ liệu B7′** (§5 B-11.5), xét trên **arm chính** (arm có mức cắt cao nhất đã duyệt trong B7c/B7cb/B7cab); các arm còn lại mô tả. Không áp lại cho dữ liệu vòng 3 | Phán quyết vòng 3 "bác bỏ ±15 %" giữ nguyên, không đổi lại. Chỉ tiêu ×1,3 chỉ có hiệu lực cho lượt chạy B7′ sau khi (i) giám đốc duyệt và (ii) kế hoạch B7′ được commit (khóa) trước lượt đầu; kết quả B7′ gọi là "B-01′ (post-hoc target)", không gọi là xác nhận B-01. Tác giả đề xuất đã xem dữ liệu B7 (nguồn S1), nên không đáp ứng điều kiện trước-khi-xem của §2.4 cho chính con số 1,3 |

### Sai lệch vòng 4 gói 2 (đo bộ chấm và cổng chất lượng; ghi 3/11/2026)

| Mã | Đăng ký nói gì (§) | Thực tế / đề xuất | Phép bị ảnh hưởng | Cách xử lý |
|---|---|---|---|---|
| V4-02 | §5 (v2.1): phân tích phụ/khám phá liệt kê (1)-(10); không có phân tích nào đo độ tin cậy của bộ chấm hay cổng | **Thêm sau khi đã bắt đầu thu dữ liệu, theo yêu cầu của giám đốc ngày 3/11/2026:** §5.1 (bản 2.2) gồm (a) judge so với regex, (b) bộ nhãn vàng (chỉ chuẩn bị), (c) cổng chất lượng như bộ phát hiện lỗi, và κ giữa hai người gán nhãn MAST cho C-01…C-49. Nhãn: **không phải tiên nghiệm** (tác giả đã thấy 276 dòng ở bước 4, và đã đọc bảng điểm vòng 3) | Không phép nào của §3 | Phân tích phụ/khám phá, **ngoài họ Holm**, không p, không đổi K; kết quả gọi là "khám phá", không là xác nhận. Gộp mọi arm; seed 20261103; bootstrap theo `runId` (κ MAST theo C-xx); kết luận chỉ mô tả |
| V4-03 | §5 (v2.2): thước đo chi phí là token có trọng số `input + 1,25·cacheWrite + 0,1·cacheRead + 5·out`; không có phân tích độ nhạy theo hệ số cacheRead hay theo USD | **Bổ sung 03/11/2026, sau khi đã xem ảnh chụp 838a5f1 (276 dòng):** `analysis/cache-sensitivity.md` gồm cơ cấu chi phí, tỉ lệ trúng cache, tỉ số B7/A0 và B6/A0 với hệ số cacheRead 0,05 (giá đọc cache Sonnet 5.5 và Opus 5.5 = 0,05× giá đầu vào) và USD theo bảng giá. Nhãn: **không phải tiên nghiệm** | Không phép nào của §3 | Phân tích độ nhạy mô tả, **ngoài họ Holm**, không p, không đổi K; hệ số 0,1 vẫn là thước đo chính; kết luận chỉ mô tả |
| V4-04 | `improvement-backlog.md` B-11.5 (khóa trước khi chạy): B7′ chạy GĐ1 rồi GĐ2; arm B7c, B7cb, B7cab; Claude Code CLI như W1–W5 (2.1.316) | **Ghi sau khi dữ liệu đã có (3/11/2026):** (1) B7′ **dừng ở GĐ1** theo quy tắc dừng vô ích của B-11.5: B7cab so với A0-sonnet, 5 bài T5 × 2 lượt, R̂ token có trọng số 2,04 [1,45; 2,99] và R̂ thời gian thực 2,16 [1,53; 3,21], cả hai > 1,6; bootstrap 4000 vòng, hạt 20261102, CI 90 %; server `1333eef`; không chạy GĐ2. (2) **CLI đổi 2.1.316 → 2.1.317** giữa W1–W5 và B7′. (3) **B7c bị hủy trước khi có dòng nào** (task T-20261103-092333-123), nên B7c và B7cb không có dữ liệu | Không phép nào của §3; B-01′ (×1,3) không được kiểm | **Sai lệch về thực thi**, không đổi giả thuyết, ngưỡng hay họ Holm (K = 0). Dừng vô ích **chưa phải kết luận**, không phải TOST; n = 2 mỗi ô nên CI rất rộng; quy tắc không tiêu alpha. So với B7 (×2,498 / ×2,566) chỉ ở mức mô tả (khác cửa sổ, server, CLI, n); đổi CLI là yếu tố gây nhiễu không tách được |

### Đăng ký trước vòng 4 gói 8: đợt đo 3e (ghi 3/11/2026, trước lượt đầu tiên; chốt ở vòng 4 gói 9 ngày 3/11/2026)

**Quyết định chốt (vòng 4 gói 9, BRIEF-15, nhiệm vụ T-20261103-224501-4e4).** Research-lead chốt 11 điểm dưới đây ngày 3/11/2026, **trước lượt đầu của E2 và khi chưa có dòng dữ liệu nào của đợt 3e**: chưa phần nào của đợt 3e được chạy, và mọi căn cứ là mã, cấu hình (`arms.json`, `tasks/g*/task.json`) và tài liệu thiết kế (CD, BL, AG). Bản phác có bằng chứng `tệp:dòng` của @methodologist: `.ccoding/T-20261103-224501-4e4/outputs/q1-draft.md`. **Mốc khóa** là commit gộp của nhiệm vụ T-20261103-224501-4e4. Một tệp không chứa được hash của chính commit tạo ra nó, nên orchestrator điền hash vào dòng `commit khóa §9: <hash>` của `run-plan.md` §5.4 sau khi gộp và trước lượt đầu của E2. **E2 không được bắt đầu khi dòng đó còn trống.** Sau mốc khóa, mọi thay đổi trong mục này là sai lệch và phải ghi thành dòng sai lệch riêng.

| # | Điểm | Quyết định | Lý do |
|---|---|---|---|
| 1 | Câu quy ước chung về nhãn và mẫu (dòng 457 của bản BRIEF-14) | **Chấp nhận.** Câu được viết lại cho khớp `gates-pairs.mjs`. Với `--negatives clean` (mặc định), bài cài lỗi thuộc cổng khác bị loại khỏi mẫu của cổng đang xét, và số dòng bị loại được báo theo cổng. `--label gate` (mặc định) là nhãn đăng ký | Script đã làm như vậy (`gates-pairs.mjs:28-29,49`). Câu cũ lệch script, và đó là một lý do CTO chưa nghiệm thu BRIEF-14 |
| 2 | Nhãn tại thời điểm cổng (B-12 trường 7(b)) | **Chấp nhận cả hai phần.** **cto:** nhãn tại cổng là trạng thái test ẩn cuối lượt, tức `pass = false` của dòng `runs.jsonl` thì lỗi còn. **b02:** `checksRed > 0`. Dòng thiếu `checksRed` lùi về nhãn theo bài. **Ngưỡng lùi 10 %:** b02 chỉ được báo theo nhãn cổng như kết quả xác nhận khi tỉ lệ dòng lùi ≤ 10 %. Dòng tổng hợp vào stdout chỉ khi có `--out` (để không làm hỏng CSV) và luôn có ở stderr; dòng này được chép vào RUNLOG | **cto:** điều kiện "có `tệp:dòng`" đã đạt. `accept` là bước cuối của `runTask` (`src/orchestrator.ts:1085`), sau đó chỉ có `status = 'done'` (`:1087`). Kết luận "không đạt" chỉ đặt `task.attention` (`:1221-1225`). Pha `accept` chỉ có công cụ chỉ đọc (`:3954-3961`). Vì vậy không còn vòng sửa nào sau CTO. **b02:** `blocked` chính là `initialRed` (`:3182`), nên dưới nhãn cổng recall b02 bằng 1 theo định nghĩa. q̂ mới là đại lượng có thông tin. **10 %** là số mới đặt: nhãn lùi làm recall lệch tối đa cỡ tỉ lệ lùi f, và f ≤ 0,10 nhỏ hơn mục tiêu nửa độ rộng 0,15 (AG C-3). Số này không được bảo vệ là tối ưu |
| 3 | Số lượt E3 | **Chấp nhận** bản BRIEF-14: A0-sonnet, B0, B1 × `l1-modules`, `l2-chain` × 1 = 6 lượt, thay cho thí điểm 3 lượt B0 mỗi bài của CD 2.3 | Bản này kiểm được pha `discuss` của B0 trên cả hai bài, và cho điểm đầu tiên của A0-sonnet so với B0 trên bài lớn. Đó là câu hỏi chính còn mở của bài báo |
| 4 | b10 ở E4 | **Chấp nhận.** Bỏ g3, g4 khỏi B7cab, B7cabO ở E4. Thêm **B6 × g3, g4, R_B6 = 32, tức 64 lượt**, chạy local. Số này chốt ngay | Làn đơn (`lane: single`, `arms.json`) không có pha plan, nên b10 luôn `null`. B6 không vào q̂ (khối (a) bước 1), nên q̂ của b10 không ước lượng được từ E2, và khối (a) bước 5 luôn áp: q = 0,5, N_b10 = 64 (AG C-3, r = 0,8, m = 1), R_B6 = 64/2. Kết quả không phụ thuộc dữ liệu E2 |
| 5 | Gộp arm, McNemar, chặn [50; 92], trần thời gian | **Chấp nhận.** Recall B-12 gộp hai arm: R_E4 = ⌈N_gộp/4⌉. So sánh B-16 dùng McNemar chính xác ghép cặp theo (bài, `rep`) giữa B7cab và B7cabO, kèm Clopper–Pearson từng arm, và không tuyên bố công suất. **Bỏ chặn [50; 92].** **Trần thời gian máy của E4 là 15 giờ đồng hồ thực** (3 cửa sổ 5 giờ). Chạm trần thì dừng, báo số lượt đã chạy, không chạy bù. **Hệ quả:** R_E4 = 16, tức E4 có 128 + 64 = 192 lượt | Gộp arm theo B-12 trường 6. [50; 92] chỉ là ước lượng chi phí cloud, không phải ngưỡng, còn E4 chạy local. E2 có tối đa 8 lượt có lỗi cài mỗi cổng (2 bài × 2 arm × 2), luôn ít hơn 10 dương thật, nên bước 5 luôn áp. 192 lượt × ≈ 2,75 phút ≈ 8,8 giờ (`run-plan.md` §5.4.3, giả định B6 chạy cùng tốc độ), nên trần 15 giờ còn dư ≈ 1,7 lần |
| 6 | m và ρ | **Chấp nhận.** m lấy theo số phần tử của `plantedFaults`. Cả sáu bài g1–g6 có m = 1, nên DEFF = 1 và không dùng ρ̂. Dự phòng cho bài m > 1 là ICC(1) một chiều theo ANOVA | Đếm trực tiếp từ `bench/vs-claude/tasks/g*/task.json` (q1-draft mục 6) |
| 7 | r = 0,8 | **Chấp nhận** làm giả định đăng ký, không ước lượng lại từ E2 | Đây là giá trị giữa của 0,6/0,8/0,9 (AG C-3, BL B-12 trường 5). E2 không đo được recall: recall b02 ≡ 1, và mỗi cổng có ít hơn 10 dương thật |
| 8 | Mức tin cậy CI của E5 | **Chấp nhận** CI 90 %, bootstrap phân tầng hai mức như phương án A | Theo `variance-decomposition.md` (phương án A dùng CI 90 %), CD 2.3 |
| 9 | Ghép khóa, số lượt và nguồn p của E6 | **Chấp nhận, có bổ sung.** Chỉ ghép A1/A2 với B0 chạy cùng cửa sổ và cùng server (V3-02). Khóa cũ (W1–W5, B7a) chỉ dùng để mô tả. `--out` mới là `bench/vs-claude/results/h6-3e`, gồm 56 lượt: A1 21, A2 14, **B0 mới 21**. Nguồn p là SR-26 nếu đã gộp trước lượt E6 đầu tiên; nếu chưa thì theo phương án lùi | Runner bỏ qua khóa đã `done` trong cùng `--out` (`run-plan.md` §5.4.3). Nếu dùng chung thư mục, B0 cũ của server khác sẽ bị ghép vào. Vì thế "trừ khóa đã có" không còn áp, và E6 chạy đủ N từ đầu |
| 10 | Lượt sạch cho b02 | **Chấp nhận, có sửa.** Lượt sạch là lượt CCoding có bản ghi cổng trên bài ngoài g1–g6, tối đa 4 + 40 + 21 = 65 lượt. **65 < 72, nên không bao giờ tuyên bố ≤ 5 %.** Kết quả chỉ báo theo nhãn bài, gọi là "tỉ lệ chặn trên bài sạch". Điểm dừng "có hại" của E4 không đánh giá được | Dưới nhãn cổng, pred ≡ ref, nên chặn nhầm ≡ 0 theo định nghĩa. Lượt sạch thuộc B0/B1 (làn đầy đủ), không thuộc B7cab/B7cabO, nên không chuyển kết quả sang arm của E4 được |
| 479 | Hai điểm của quy ước chung áp ở E2 (6) và E4 (6) | **Chốt.** Giới hạn quy đổi `rounds` giữ theo README của `docs/research/analysis/`. Nhãn chính là `--label gate`. `--label task` là độ nhạy, và là nhãn duy nhất của b10 | README đã ghi giới hạn này. Nhãn cổng được chốt ở điểm 2 |

**Vị thế.** Sáu mục V4-3e-E1…E6 đăng ký **trước lượt đầu tiên** của đợt 3e (`bench/vs-claude/RUNBOOK-cloud-session.md` Bước 3e; B-14, B-12, B-16, B-15, H6), theo yêu cầu "mọi phân tích mới ghi §9" của `improvement-backlog.md` (B-12 trường 7(g); B-12, B-14, B-15, B-16 trường 6). Đợt này **chưa được giám đốc duyệt chạy**; mục này chỉ để khi duyệt thì chạy được ngay. Không phép nào vào họ Holm; K của §2.5 không đổi (E6 giữ nguyên quy tắc H6). Mọi giá trị chép từ `cache-diagnostic-spec.md` (viết tắt CD), `improvement-backlog.md` (BL), `analysis/agreement.md` (AG) và `preregistration.md`, trừ các số mới đặt ở vòng 4 gói 9: ngưỡng lùi 10 %, trần 15 giờ của E4, R_B6 = 32, và thư mục `gates-main`, `h6-3e`. Các số này là quyết định của research-lead, có lý do trong bảng trên. Ước lượng USD và giờ máy của kế hoạch chạy không phải ngưỡng nên không ghi ở đây. Riêng trần thời gian máy của E4 là quy tắc dừng nên được ghi. Trường (9) mọi mục: **hash server ghi khi chạy** (hash commit gộp D9b của server 7425 vào RUNLOG, kèm `model` theo pha của B-13; việc nối dữ liệu cloud với local theo `run-plan.md` §6.1).

**Quy ước chung cho E2, E4 (B-12, B-16).** Mỗi cổng một tệp CSV và một lần tính: `node docs/research/analysis/gates-pairs.mjs <runs.jsonl…> --arms-json bench/vs-claude/arms.json --unit decision|run --gate b02|b10|cto --negatives clean --label gate --out X.csv`, rồi `node docs/research/analysis/agreement.mjs --pairs X.csv --positive 1`. CI = bootstrap **cụm theo `runId`** của `agreement.mjs`, B = 2000, seed 20261103 (§5.1), kèm Clopper–Pearson chính xác; **không trộn b02/b10/cto** trong một tệp. Pred lấy `gates.b02.blocked`, `gates.b10.blocked`, `gates.cto.pass` đảo. Nhãn **theo bài**: prefix g1-/g2- → b02, g3-/g4- → b10, g5-/g6- → cto; bài không thuộc prefix nào là bài sạch, ref = 0.
- **Mẫu của mỗi cổng (`--negatives clean`, mặc định):** gồm bài cài lỗi đúng loại của cổng và bài sạch.
  - **Bài cài lỗi thuộc cổng khác bị loại khỏi mẫu của cổng đang xét.** Ví dụ g1, g2 không vào mẫu của `--gate cto`, vì cổng chặn ở đó là chặn đúng, không phải chặn nhầm. Số dòng bị loại được báo ở stderr theo cổng và chép vào RUNLOG.
  - `--negatives cross` chỉ là độ nhạy, không dùng cho kết quả đăng ký.
  - Cổng `null` (không có sự kiện `gate.decision`) **không vào mẫu của cổng đó**. Số dòng bị bỏ theo cổng cũng được báo.
- **Nhãn `ref` (`--label gate`, mặc định, là nhãn đăng ký theo B-12 trường 7(b)):**
  - **cto:** nhãn là trạng thái test ẩn cuối lượt. Trên g5, g6, `ref = 1` khi dòng `runs.jsonl` có `pass = false` (lỗi cài còn), `ref = 0` khi `pass = true`. **Bài sạch giữ `ref = 0` theo nhãn bài, không đọc `pass`.** Dòng g5/g6 thiếu `pass` (không phải boolean) lùi về nhãn theo bài (`ref = 1`), báo ở stderr (`cto: N/M dòng thiếu pass → dùng nhãn theo bài`) và ở dòng tổng hợp `cto nhãn hiệu lực`; cùng ngưỡng lùi 10 % như b02. Script `gates-pairs.mjs` đã làm đúng như vậy và có test. Ở làn đơn, trạng thái này đúng bằng trạng thái CTO đã thấy:
    - `accept` là bước cuối của `runTask` (`src/orchestrator.ts:1085`), sau đó chỉ có `status = 'done'` (`:1087`);
    - sau kết luận "không đạt" không còn vòng sửa hay lượt chạy nào, mã chỉ đặt `task.attention` (`:1221-1225`);
    - pha `accept` chỉ có công cụ chỉ đọc (`:3954-3961`);
    - test ẩn được chấm sau lượt, trên chính workspace đó.

    Lập luận này chỉ đúng cho lượt chạy bằng harness. Thao tác "làm lại từ accept" của người dùng (`:583-606`) nằm ngoài.
  - **b02:** nhãn "lỗi còn nguyên tại cổng" là `gates.b02.checksRed > 0`. Đây là số lệnh kiểm đỏ ghi **ngay sau lần `classify()` đầu, trước vòng sửa đầu tiên** (`src/orchestrator.ts:3181-3182`), không phải lúc ghi sự kiện ở `:3272`.
    - `blocked` của b02 chính là "có lệnh kiểm đỏ", nên dưới `--label gate` recall b02 bằng 1 theo định nghĩa và chặn nhầm bằng 0. **Không báo đây là recall của cổng.** Đại lượng có thông tin là q̂, tức tỉ lệ lỗi cài còn sống tới cổng. Dưới `--label task`, q̂ bằng recall b02, kèm số vòng sửa (`rounds`).
    - Dòng b02 thiếu `checksRed` lùi về nhãn theo bài, không dừng (exit 0). Số dòng và tỉ lệ lùi được báo ở stderr, và ở dòng tổng hợp `b02 nhãn hiệu lực: gate | gate (lùi một phần) | task (lùi)`. Dòng tổng hợp vào stdout chỉ khi có `--out`, luôn có ở stderr, và được chép vào RUNLOG.
    - **Chỉ được báo b02 theo nhãn tại thời điểm cổng như kết quả xác nhận khi tỉ lệ dòng b02 lùi ≤ 10 %.** Trên 10 % thì kết quả b02 ở nhãn cổng hạ xuống thăm dò, và chỉ báo nhãn theo bài. Tới khi Phòng Dev gộp `checksRed` (D10 mục C), mọi dòng b02 lùi 100 %.
  - **b10:** không có nhãn tại thời điểm cổng; chỉ báo theo nhãn bài.
  - `--label task` là nhãn theo bài, dùng làm độ nhạy cho mọi cổng.
- **Giới hạn quy đổi `rounds`** (README của `docs/research/analysis/`, mục `--unit decision`): b02 chặn được quy thành `max(1, rounds)` cặp `pred = 1`; b02 không chặn được quy thành 1 cặp `pred = 0`. Thứ tự và nhãn từng vòng bị mất, và mỗi vòng nhận nhãn của lượt (`checksRed` chỉ có một giá trị mỗi lượt). Vì vậy `--unit decision` là đơn vị chính chỉ theo nghĩa "mỗi lần chặn là một quyết định". Độ nhạy là `--unit run`.

#### V4-3e-E1 — B-14 chẩn đoán cache

- **(1) Câu hỏi:** phần cacheWrite mỗi lượt claude-cli đến từ bộ công cụ, từ `cwd` hay từ phần stdin? Giả thuyết G1: đổi bộ công cụ làm vỡ gần hết tiền tố cache; đổi `cwd` thì không (CD 1.1, 1.4). TTL thật ghi thêm nếu trường usage có (BL B-14 trường 4). Là **chẩn đoán cơ chế (có/không)**, không ước lượng tham số.
- **(2) Arm:** không có arm CCoding; chạy thẳng `claude -p` với cờ của runtime (`cache-diagnostic.mjs`), một model (`sonnet`).
- **(3) Bài:** lời nhắc giả tổng hợp, có `nonce` ở đầu stdin; thư mục `cwd` tạm rỗng, ngoài repo (CD 1.2).
- **(4) Số lượt:** n = 1 mỗi cặp; 3 cặp: (a) giống hệt, (b) khác bộ công cụ, (c) khác `cwd`; tối đa 8 lượt = 6 đo + 1 khởi động + 1 dự phòng (CD 1.5; BRIEF-14 ghi 7–8).
- **(5) Thước đo:** chính: h = CR/(CR+CW+IN) của **lượt 2** mỗi cặp. Phụ: CW, CR, IN, out, khoảng giữa hai lượt (giây), h của lượt 1 (CD 1.3, 1.6).
- **(6) Phép kiểm:** **không p, không CI**; chỉ bảng diễn giải CD 1.4 (h(a) ≥ 0,9; h(a) < 0,5 thì dừng; h(b) ≪ h(a); h(a) − h(c) ≤ 0,05 hay > 0,05). Ngưỡng 0,9/0,5/0,2/0,05 là lựa chọn thiết kế của CD, chép nguyên. Mỗi cặp gán "khớp / không khớp dự kiến", kết luận bằng lời.
- **(7) Dừng:** tổng > 8 lượt thì dừng, báo giám đốc; cặp (a) h < 0,5 khi tiền tố ≥ ngưỡng thì **dừng, không chạy (b)(c)** (CD 1.4). Chờ > 5 phút giữa các cặp (CD 1.2). Bước 2 của B-14 (đổi cấu hình công cụ, chạm hook) **ngoài đăng ký này**; cần mục §9 riêng trước lượt đầu của nó.
- **(8) Loại:** lượt khởi động không vào phân tích; lượt 2 có khoảng > 60 s hoặc lỗi mạng thì chạy lại đúng một lượt 2 bằng lượt dự phòng, ghi sự cố; không chạy lại "cho đẹp" (CD 1.5).
- **(9) Hash server:** ghi khi chạy. E1 **không qua server CCoding** nên ghi hash commit kho và phiên bản `claude` CLI (đổi 2.1.316 → 2.1.317 từng xảy ra, V4-04).
- **Nguồn:** BL B-14 trường 4, 6, 7; CD Phần 1 (1.2–1.6); RUNBOOK Bước 3e mục 2.

#### V4-3e-E2 — Thí điểm B-12/B-16

- **(1) Câu hỏi:** ước lượng q̂ (tỉ lệ lỗi cài còn nguyên đến cổng), ρ̂ (tương quan nội cụm), tỉ lệ bất đồng và USD mỗi lượt của hai arm, để chốt N của E4 theo khối (a) dưới. Câu hỏi B-16: H-O1 (CTO Opus có tỉ lệ nghiệm thu sai thấp hơn CTO Sonnet) là chính, H-O2 (chi phí không vượt ngưỡng của CD 3.5) là phụ, **tách riêng** (CD 3.2). Thí điểm **không kết luận** về H-O1, H-O2 hay recall. (Vì m = 1 và E2 có ít hơn 10 dương thật mỗi cổng, N của E4 đã cố định trước dữ liệu theo khối (a) bước 5; q̂ của E2 vẫn được ghi để mô tả.)
- **(2) Arm:** B7cab, B7cabO (chỉ khác `phaseModels.accept`); B6 chỉ để có quyết định b10 vì cổng này chỉ có ở làn có pha plan; B6 **không vào cặp B-16**.
- **(3) Bài:** `suite:gates` (g1–g6) cho B7cab, B7cabO; g3-qty-rename, g4-gb-unit cho B6. Bài **mới**, không phải t1–t5 (BL B-12 trường 4(d)).
- **(4) Số lượt:** B7cab, B7cabO × g1–g6 × 2 = 24; B6 × g3, g4 × 2 = 4; tổng 28. Ghép cặp B-16: 12 cặp (6 bài × 2 lượt), đúng "thí điểm 12 cặp" (BL B-16 trường 4).
- **(5) Thước đo:** chính: tỉ lệ nghiệm thu sai (CTO "đạt" khi lỗi cài còn nguyên), q̂, ρ̂, số dương thật theo lượt. Phụ: token có trọng số `input + 1,25·cacheWrite + 0,1·cacheRead + 5·out` (thước đo chi phí chính, **không so trực tiếp giữa hai model khác giá**), USD (phụ, ngoài họ Holm), thời gian, test ẩn.
- **(6) Phép kiểm và CI:** mô tả, không p. CI theo quy ước chung ở trên (bootstrap cụm theo `runId`, mỗi cổng một CSV, cờ `--gate`, `--negatives clean`, `--label gate`; độ nhạy `--label task`), cộng Clopper–Pearson từng arm. McNemar chỉ ở E4. Giới hạn `rounds`, nhãn tại thời điểm cổng và ngưỡng lùi 10 % của b02 theo quy ước chung. Đơn vị chính là lần cổng quyết định; độ nhạy: mỗi lượt một cặp (`--unit run`).
- **(7) Dừng:** đủ 28 lượt, hoặc chạm hạn mức, thì dừng và báo phần đã có (CD 3.5 "Hạn mức"); không thêm lượt. Hai điểm dừng "Vô ích (chi phí)" và "Có hại" của CD 3.5 chỉ **đánh giá được ở mức nào dữ liệu E2 cho phép**: E2 không có lượt sạch nên "Có hại" (cần ≥ 20 lượt sạch) chưa đánh giá được. Điểm "Vô ích": USD/lượt B7cabO > 2 × B7cab **và** hiệu số nghiệm thu sai < 0,10 (chép CD 3.5).
- **(8) Loại:** §4.1 và §4.3 (Q, L, T, E1, E4), đối xứng giữa arm; cổng `null` bỏ khỏi mẫu cổng đó (quy ước chung). Lượt có lỗi cài đã được agent tự sửa trước cổng **không loại** (đó là q, BL B-12 trường 7(d)). Không xem điểm trước khi chốt N (khối (a)).
- **(9) Hash server:** ghi khi chạy.
- **Nguồn:** BL B-12 trường 4–7, B-16 trường 4–6; CD 3.2–3.5; AG C-3; RUNBOOK Bước 3e mục 3; `arms.json` `_suites.gates`.

#### V4-3e-E3 — Thí điểm bài lớn (B-15)

- **(1) Câu hỏi:** lượt đối chứng B0 có thật sự có pha `discuss` trên `l1-modules` và `l2-chain` không (điều kiện cho B-15 đo được)? Thí điểm kiểm thời gian và hạn mức cho E5; **không suy diễn** về lợi ích của họp.
- **(2) Arm:** A0-sonnet, B0, B1 (`discussionRounds: 0`).
- **(3) Bài:** `l1-modules`, `l2-chain`.
- **(4) Số lượt:** A0-sonnet, B0, B1 × `l1-modules`, `l2-chain` × 1 = 6 (BRIEF-14). Bản này **thay** cho thí điểm 3 lượt B0 mỗi bài của CD 2.3, vì nó vừa kiểm được pha `discuss` của B0 trên cả hai bài, vừa cho điểm đầu tiên của A0-sonnet so với B0 trên bài lớn, câu hỏi chính còn mở của bài báo. Chốt ở vòng 4 gói 9 (bảng trên, điểm 3), trước lượt đầu của E2, khi chưa có dữ liệu đợt 3e.
- **(5) Thước đo:** chính: `byPhase.discuss` của lượt B0 (có/không). Phụ: thời gian thực, token có trọng số, test ẩn, độ dài hạng mục kế hoạch (≥ 3, CD 2.2).
- **(6) Phép kiểm:** không p, không CI (n = 1 mỗi ô). Dữ liệu E3 ở `results/large-pilot`, **không gộp vào ước lượng của E5**.
- **(7) Dừng:** đủ 6 lượt hoặc chạm hạn mức (RUNBOOK mục 5: dừng ngay, không chạy tiếp bằng hạn mức gói trên cloud).
- **(8) Loại:** lượt B0 không có `byPhase.discuss` không loại khỏi E3 nhưng bài đó **không đo được cho B-15**: ghi RUNLOG và báo lại (RUNBOOK mục 4). Còn lại theo §4.1 và §4.3.
- **(9) Hash server:** ghi khi chạy.
- **Nguồn:** BL B-15 trường 4, 5; CD 2.2, 2.3; RUNBOOK Bước 3e mục 4.

#### V4-3e-E4 — B-12/B-16 chính

- **(1) Câu hỏi:** recall của hai cổng b02 và cto trên bộ bài cài lỗi (b02 báo q̂, xem quy ước chung); recall b10 từ lệnh B6 riêng (xem (3)); tỉ lệ chặn trên lượt sạch (chỉ mô tả, điểm 10 của bảng); H-O1 và H-O2 của B-16 (CD 3.2). Lớp lỗi cài, không khái quát sang lỗi tự nhiên (BL B-12 trường 7(a)).
- **(2) Arm:** B7cab, B7cabO cho b02, cto và B-16; B6 chỉ cho b10, **không vào cặp B-16**.
- **(3) Bài:** B7cab, B7cabO trên **g1-slug-dedupe, g2-cart-coupon, g5-median-stats, g6-range-merge** (bỏ g3, g4: hai arm đều có `lane: single` trong `arms.json`, không có pha plan nên b10 luôn `null`). **b10:** lệnh riêng B6 × g3-qty-rename, g4-gb-unit, chạy local. Lượt sạch không thuộc E4: g1–g6 đều có lỗi cài; lượt sạch là lượt CCoding có bản ghi cổng trên bài không thuộc g1–g6, lấy từ E3 (B0, B1: 4 lượt), E5 (B0, B1: tối đa 40) và E6 (B0 mới: 21), **tối đa 65**. Báo n thực và cận trên Clopper–Pearson hai phía 95 % thực (n = 65 với 0 chặn cho 5,5 %); **không tuyên bố ≤ 5 % vì n < 72** (BL B-12 trường 4(b)). Kết quả chỉ mô tả, theo nhãn bài, gọi là "tỉ lệ chặn trên bài sạch" (với b02 dưới nhãn cổng thì pred ≡ ref), và không chuyển sang B7cab/B7cabO vì khác làn.
- **(4) Số lượt:** theo khối (a): B7cab, B7cabO × 4 bài × R_E4 = 16 → **128 lượt**; B6 × g3, g4 × R_B6 = 32 → **64 lượt**; tổng **192 lượt**. Cả hai lệnh dùng `--timeout 20` (như E2) và `--out bench/vs-claude/results/gates-main`. Lượt thí điểm E2 (`gates-pilot`) **không vào mẫu chính** của E4. Trần thời gian máy theo khối (a) bước 4.
- **(5) Thước đo:** chính: recall mỗi cổng (dương thật = lượt/quyết định có lỗi cài còn nguyên, nhãn tại thời điểm cổng) và tỉ lệ nghiệm thu sai của CTO mỗi arm. Phụ: chặn trên bài sạch (lượt sạch, mô tả), tỉ lệ bất đồng, token có trọng số, USD (ngoài họ Holm), thời gian, test ẩn.
- **(6) Phép kiểm và CI:** quy ước chung ở trên (bootstrap cụm theo `runId` của `agreement.mjs`, tính riêng từng cổng, mỗi cổng một CSV, cờ `--gate`, `--negatives clean`, `--label gate`; kèm CP chính xác). **Recall gộp hai arm** (BL B-12 trường 6). B-16: **McNemar chính xác** trên cặp bất đồng giữa B7cab và B7cabO, ghép cặp theo (bài, `rep`), và CP từng arm; không tuyên bố công suất McNemar. Đơn vị phân tích chính là **lần cổng quyết định**, độ nhạy là mỗi lượt một cặp và `--label task`. **Dưới 10 lượt dương thật (đếm theo lượt) thì "recall chưa ước lượng được"**, không in recall điểm (AG; §5.1(c)). Ngưỡng lùi 10 % của b02 và lệch script của nhãn cto theo quy ước chung.
- **(7) Dừng:** năm điểm dừng của CD 3.5, chép nguyên: **vô ích** (USD/lượt B7cabO > 2 × B7cab **và** hiệu số nghiệm thu sai < 0,10 sau 12 cặp thí điểm); **có hại** (chặn nhầm B7cabO > B7cab + 0,10 sau ≥ 20 lượt sạch); **không đủ dương** (< 10 lượt dương thật sau toàn bộ lượt: "recall chưa ước lượng được"); **hạn mức** (chạm hạn mức 5 giờ hoặc vượt mức giám đốc đặt); **tối đa** (không quá N đã chốt, không thêm lượt cho đủ ý nghĩa). Cộng §4.4(b): không dừng sớm vì kết quả, không tăng n để đuổi p. Điểm "có hại" **không đánh giá được** vì E4 không có lượt sạch của B7cab, B7cabO; ghi trước, không nới ngưỡng. Chạm hạn mức 5 giờ của một cửa sổ thì chờ cửa sổ sau, trong giới hạn **trần thời gian máy** (khối (a) bước 4).
- **(8) Loại:** §4.1, §4.3 (Q, L, T, E1, E4), đối xứng giữa arm; thay lượt tối đa 2 mỗi ô. Cổng `null` không vào mẫu của cổng đó. Lỗi cài còn nguyên hay không ghi **tại thời điểm cổng** (7(b)): b02 theo `checksRed`, cto theo test ẩn cuối lượt (bằng trạng thái tại cổng ở làn đơn, quy ước chung).
- **(9) Hash server:** ghi khi chạy.
- **Nguồn:** BL B-12 trường 4–7, B-16 trường 4–6; CD 3.3, 3.5; AG C-3, `minPositives`; §5.1(c).

#### V4-3e-E5 — B-15 chính (họp)

- **(1) Câu hỏi:** bỏ họp (`discussionRounds: 0`) đổi chi phí, thời gian và điểm thế nào so với đối chứng (làn đầy đủ, `discussionRounds: 1`) trên bài lớn? Không đặt ngưỡng ý nghĩa trước dữ liệu (CD 2.3); đây là **ước lượng điểm kèm CI**, không phải kiểm định.
- **(2) Arm:** B0 (đối chứng), B1.
- **(3) Bài:** `l1-modules`, `l2-chain`.
- **(4) Số lượt:** 10 lượt × 2 arm × 2 bài = 40 (CD 2.3; BL B-15 trường 5). Thí điểm E3 (6 lượt) tách riêng, không gộp.
- **(5) Thước đo:** chính: token có trọng số `input + 1,25·cacheWrite + 0,1·cacheRead + 5·out`, R̂ = B1/B0. Phụ: thời gian thực, test ẩn, `byPhase.discuss`; USD (ngoài họ Holm).
- **(6) Phép kiểm và CI:** R̂ = B1/B0 kèm **CI 90 %** bootstrap phân tầng hai mức (bài rồi lượt), 4000 vòng, hạt 20261104, đúng cách của phương án A trong `variance-decomposition.md` (CD 2.4); **không p**. Nếu CI chứa 1 thì ghi "không phân biệt được". Số bài chỉ 2 nên nửa độ rộng CI lớn hơn 0,218 của phương án A; **chưa mô phỏng**, không tuyên bố độ chính xác 0,218 (CD 2.3).
- **(7) Dừng:** dừng ở n = 10 mỗi ô (§4.4(a)); không dừng sớm vì kết quả (§4.4(b)); hết hạn mức thì dừng, chờ cửa sổ sau (RUNBOOK mục 6).
- **(8) Loại:** **lượt đối chứng B0 không có pha `discuss` (`byPhase.discuss` vắng) bị loại**, vì họp không xảy ra nên kết quả rỗng, không âm (CD 2.2 mục 2; BL B-15 trường 4); loại cả cặp B0/B1 tương ứng theo quy tắc khai báo trước và **báo số lượt loại**. Cộng §4.1, §4.3; thay lượt tối đa 2 mỗi ô; quá mức thì ô "thiếu dữ liệu". Phân tích độ nhạy không loại lượt nào.
- **(9) Hash server:** ghi khi chạy.
- **Nguồn:** BL B-15 trường 4–6; CD Phần 2 (2.2–2.4); RUNBOOK Bước 3e mục 4, 6.
- **Thiết kế lại (ghi 4/11/2026, đặt trước dữ liệu E5′):** theo (8), E5 như đăng ký cho cả hai bài là ô "thiếu dữ liệu", vì B0 không có pha `discuss` trên `l1-modules` lẫn `l2-chain` (E3, `results/large-pilot/RUNLOG.md`). E5 không chạy; thay bằng **V4-3e-E5′** ngay dưới đây.

#### V4-3e-E5′ — B-15 chính (họp, làn đầy đủ)

**Nhãn: đặt trước dữ liệu E5′.** Ghi ngày 4/11/2026, trên commit nền `1a31f1f93d1c59873d2a6c46c1c1d68cbbf2f6ca` (S0, sau fast-forward). Chưa có thư mục `results/b15f-main`, chưa có lượt E5′ nào. **Chờ giám đốc duyệt trước lượt đầu.**

**Đầu vào duy nhất lấy từ E3** (`results/large-pilot`): trường quy trình `lane`, `escalatedFrom`, `byPhase` (có/không `discuss`), token và thời gian thực. Không dùng kết quả chấm của E3 hay E4 cho bất kỳ quyết định nào ở mục này. Số trong (5) lấy từ RUNLOG E3 và từ `byPhase`, token, thời gian của `study-cloud` (không mở cột điểm).

- **(1) Câu hỏi:** giữ nguyên V4-3e-E5 (1): bỏ họp (`discussionRounds: 0`) đổi chi phí, thời gian và điểm thế nào so với đối chứng làn đầy đủ có họp (`discussionRounds: 1`) trên bài lớn? Không đặt ngưỡng ý nghĩa trước dữ liệu; **ước lượng điểm kèm CI**, không phải kiểm định. Vì ép `lane: full`, kết luận chỉ cho **làn đầy đủ ép**, không khái quát sang làn mà `chooseLane` chọn (nhanh/đơn), vốn không họp.
- **(2) Thiết kế:**
  - Arm `B0F` = `{ "lane": "full" }` (đối chứng, có họp) và `B1F` = `{ "lane": "full", "discussionRounds": 0 }` (bỏ họp), định nghĩa ở `BRIEF-D12.md` K3. Hai arm chỉ khác `discussionRounds`.
  - Bài `l1-modules`, `l2-chain`. n = 10 mỗi ô, 2 arm × 2 bài × 10 = **40 lượt**. Giữ nguyên bài, n và thước đo của E5: không có lý do đổi, và nếu đổi thì không được dựa vào kết quả chấm E3.
  - Vì sao hai arm này: `chooseLane` là hàm thuần của đề bài và repo, nên B0/B1 không bao giờ họp trên hai bài này (E3). Ép `lane: full` là cách duy nhất trong tập arm hiện có để có pha họp; hai arm ép cũng tách được tác dụng của họp khỏi tác dụng của làn.
  - Họp còn bị bỏ khi kế hoạch nhỏ: ít hơn `phases.meetingMinSubtasks` (mặc định 3) hạng mục hoặc dưới 2 người tham gia (`src/orchestrator.ts`, khối "Họp thảo luận + chốt", điều kiện `rounds > 0 && !small && task.lane !== 'fast'`). Nên làn đầy đủ ép vẫn có thể không họp; đó là lý do của (8).
- **(3) Điều kiện tiên quyết, cổng chạy và quy tắc dừng** (số cố định, ghi trước lượt đầu):
  - **Cổng chạy:** chỉ chạy khi đủ **cả bốn**: (i) D12 đã gộp, hash `[ĐIỀN KHI D12 GỘP]`; (ii) test bằng runtime giả "ép làn đầy đủ thì có `discuss`, thêm `discussionRounds: 0` thì không" xanh; (iii) E6 xong; (iv) giám đốc đã duyệt.
  - **Không có thí điểm riêng.** Lệnh đầu chạy `--repeats 1` vào chính `results/b15f-main` (cặp đầu của mỗi bài, 4 lượt) và là lượt kiểm. Lượt này **thuộc mẫu chính**, vì runner bỏ qua khóa đã `done`; lệnh `--repeats 10` sau đó chạy tiếp r2–r10. Chỉ kiểm bằng `byPhase`, không xem điểm.
  - **Dừng 1 (B0F không họp):** nếu B0F của cặp đầu ở **bất kỳ** bài nào không có `byPhase.discuss`, dừng toàn bộ E5′, báo giám đốc, không đổi bài. Cặp đầu có họp không bảo đảm các cặp sau cũng họp; tần suất không họp về sau tính theo Dừng 2.
  - **Dừng 2 (loại nhiều):** nếu một bài có **từ 3/10 cặp trở lên** bị loại theo (8) thì dừng, ghi ô đó "thiếu dữ liệu" và báo lại. Ngưỡng 3 là mức vượt giới hạn thay lượt 2 mỗi ô của (8). Methodologist được đổi ngưỡng này **chỉ khi** ghi lý do vào §9 trước lượt đầu.
  - **Kiểm nhiễu B0F/B1F (điều kiện tiên quyết):** với cặp đầu mỗi bài, so tập khóa của `byPhase`. Các pha cấu trúc `route`, `plan`, `execute`, `review`, `synthesize`, `accept` phải có ở cả hai arm. Pha duy nhất được phép chỉ có ở B0F là `discuss` và `finalize` (khối họp). `revise` có điều kiện theo kết quả `review` nên được phép khác, và ghi lại. Nếu B1F mất thêm pha khác ngoài hai pha họp, hoặc có pha ngoài `VARIANT_PHASES` (`src/orchestrator.ts`), ghi là **nhiễu**, dừng và để giám đốc quyết. Đối chiếu mã chỉ đọc, không sửa `src/`.
- **(4) Nơi chạy:**
  - Local, gói Max, **sau E6** (E5′ không chạy trước E6).
  - **Worktree và server MỚI** ở commit gộp D12 `[ĐIỀN KHI D12 GỘP]`, cổng **7426** (khác 7420, 7425 và 7424 của cloud).
  - **Runner và server cùng một worktree**, vì `ccodingCommit` là `git rev-parse HEAD` của thư mục runner (`run.mjs:77`), không phải của server.
  - Lệnh dự kiến (cờ như `$S3E` của `run-plan.md` §5.4.3, đổi cổng và `--ccoding-data` theo server mới): `node bench/vs-claude/run.mjs --arms B0F,B1F --tasks l1-modules,l2-chain --repeats 10 --timeout 40 … --out bench/vs-claude/results/b15f-main`; `--timeout 40` như E3, E5 cùng bài. `--out` là thư mục mới, không dùng `large-pilot`, `b15-main` hay `h6-3e`.
  - **Khác commit với E6 không trộn dữ liệu:** E5′ không gộp với phần nào khác (`run-plan.md` §5.4), ước lượng R̂ chỉ dùng B0F và B1F chạy cùng server, cùng cửa sổ. Hai arm B0F, B1F không có ở E6, nên E6 không cung cấp lượt nào cho E5′ và ngược lại.
- **(5) Thước đo:** giữ (5) của E5: chính là token có trọng số `input + 1,25·cacheWrite + 0,1·cacheRead + 5·out`, R̂ = B1F/B0F. Phụ: thời gian thực, test ẩn, `byPhase.discuss` và `byPhase.finalize`, số hạng mục kế hoạch của mỗi lượt; USD (ngoài họ Holm).
  - **ƯỚC LƯỢNG chi phí và thời gian (để giám đốc cân nhắc, không phải hạn mức ngân sách):**
    - **Gốc:** B0 làn nhanh trên `l1-modules`, `l2-chain` ≈ **0,77 M** token có trọng số mỗi lượt (1,53 M cho 2 lượt; `results/large-pilot/RUNLOG.md`, bảng kết quả chạy). Thời gian thực 22 phút cho 2 lượt B0 và 18 phút cho 2 lượt B1, tức 11 và 9 phút mỗi lượt.
    - **Hệ số làn đầy đủ so với làn nhanh:** tính từ `byPhase` của 3 lượt B0 `r1-elk-design` có pha `discuss` trong `results/study-cloud/runs.jsonl` (dòng 58, 65, 78; `byPhase` là token có trọng số, cộng các pha ≈ `tokens.weighted`). Chỉ đọc `byPhase`, token và thời gian. Hệ số = tổng ÷ (route + plan + execute + accept): r1 1.007.298 ÷ 794.156 = 1,27; r2 1.410.617 ÷ 888.284 = 1,59; r3 765.763 ÷ 545.101 = 1,40; trung bình 1,42.
    - **Phần họp** (discuss + finalize) là 11,8 %, 8,0 %, 14,2 % của tổng ba lượt trên. Hệ số của B1F = (tổng − họp) ÷ (route + plan + execute + accept): 1,12; 1,46; 1,21; trung bình 1,26.
    - **Mỗi lượt:** B0F ≈ 0,77 × 1,42 ≈ 1,09 M (0,98–1,22); B1F ≈ 0,77 × 1,26 ≈ 0,97 M (0,86–1,12).
    - **Tổng 40 lượt** (20 B0F + 20 B1F): ≈ 21,9 + 19,4 ≈ **41 M** token có trọng số (khoảng 37–47 M), chưa kể lượt thay thế (tối đa 2 mỗi ô, tức tối đa thêm 8 lượt).
    - **Thời gian chạy thực:** lấy hệ số token làm đại diện (byPhase không tách thời gian theo pha): B0F ≈ 11 × 1,42 ≈ 15,6 phút, B1F ≈ 9 × 1,26 ≈ 11,4 phút, tổng ≈ 20 × (15,6 + 11,4) ≈ 540 phút ≈ **9 giờ** (khoảng 8–10 giờ), một luồng. Đối chiếu thô: ba lượt B0 `r1-elk-design` mất 911, 1171, 751 giây (trung bình 15,7 phút). Dài hơn một cửa sổ 5 giờ, nên trải trên ≥ 2 cửa sổ.
    - **Giả định chưa kiểm:** hệ số lấy từ bài thiết kế r1, không phải `l1-modules`, `l2-chain`; số này sai lệch được. Ước lượng cũ của E5 (≈ 73 USD, ≈ 7 giờ, `run-plan.md` §5.4.3) là cho làn nhanh, không so trực tiếp được.
- **(6) Phép kiểm và CI:** giữ (6) của E5, thay B0, B1 bằng B0F, B1F: R̂ = B1F/B0F, **CI 90 %** bootstrap phân tầng hai mức (bài rồi lượt), 4000 vòng, hạt 20261104, theo phương án A của `variance-decomposition.md`; **không p**. CI chứa 1 thì ghi "không phân biệt được". Số bài chỉ 2, nên không tuyên bố độ chính xác 0,218. Cặp ghép theo (bài, `rep`).
- **(7) Dừng:** n = 10 mỗi ô (§4.4(a)); không dừng sớm vì kết quả (§4.4(b)); hết hạn mức thì dừng, chờ cửa sổ sau, kèm các điểm dừng của (3). Chạm trần là dừng, không thêm lượt cho đủ ý nghĩa.
- **(8) Loại:** **lượt B0F không có `byPhase.discuss` bị loại**, kèm cả cặp B1F tương ứng (ghép theo bài và `rep`), và **báo số lượt loại**, giữ nguyên lý do của E5 (8): họp không xảy ra nên kết quả rỗng, không âm. Cộng §4.1, §4.3; thay lượt tối đa 2 mỗi ô; từ 3/10 cặp loại thì dừng (3). Phân tích độ nhạy không loại lượt nào, kèm số hạng mục kế hoạch của B0F và B1F.
- **(9) Hash server:** hash của worktree D12 mới; ghi `[ĐIỀN KHI D12 GỘP]` trước lượt đầu, vào RUNLOG `results/b15f-main`.
- **Mối đe dọa đã biết (ghi trước):** loại theo B0F có họp chọn kế hoạch lớn hơn; B1F không bị loại độc lập, nên có thể lệch. Biện pháp: báo số hạng mục kế hoạch của hai arm và phân tích độ nhạy không loại.
- **Nguồn:** V4-3e-E5, V4-3e-E3 (8); `BRIEF-D12.md` K3; `BRIEF-17.md` K2; `run-plan.md` §5.4; `src/orchestrator.ts` khối "Họp thảo luận + chốt"; `results/large-pilot/RUNLOG.md`; `results/study-cloud/runs.jsonl` (`byPhase`, token, thời gian).

- **Sai lệch (3), ghi 5/11/2026 khoảng 10:10 giờ VN, trước cặp r2:**
  - **Vì sao dừng:** sau r1, kiểm nhiễu dừng vì pha `review` vắng ở **cả hai arm, cả hai bài** (`results/b15f-main/RUNLOG.md`).
  - **Nguyên nhân (đọc mã `57148de`):** từ B-02, cổng chất lượng chạy trước reviewer và bỏ pha `review` khi lệnh kiểm tra xanh, mẫu đầu ra đạt và diff không chạm vùng bảo mật (`gate.review` với `decision: 'skip-reviewer'`). Như vậy `review` là **pha có điều kiện theo cổng**, giống `revise`. Đưa nó vào danh sách pha cấu trúc là lỗi của bản đăng ký.
  - **Quyết định:** giám đốc chọn "chạy tiếp" lúc 5/11 khoảng 10:05, trong phiên.
  - **Thay đổi duy nhất:** pha cấu trúc bắt buộc ở cả hai arm còn `route`, `plan`, `execute`, `synthesize`, `accept`. `review` được phép khác giữa hai arm, như `revise`, và được ghi lại.
  - **Giữ nguyên mọi phần khác:** Dừng 1, Dừng 2, quy tắc loại (8), n, thuật toán phân tích. Cặp r1 đã chạy được giữ; chỉ khóa `byPhase` của nó đã được xem, chưa xem điểm.
  - `check-e5f.mjs` sửa theo đúng thay đổi này; sha256 mới ghi ở RUNLOG trước r2.
  - Ghi thêm: E5′ chạy trên Claude Code CLI 2.1.318, không phải 2.1.312 như RUNLOG ghi lúc lập.

#### V4-3e-K3 — Quy tắc bổ sung (đặt trước dữ liệu)

**Nhãn: đặt trước.** Ghi ngày 4/11/2026, trên commit nền `1a31f1f93d1c59873d2a6c46c1c1d68cbbf2f6ca` (S0, sau fast-forward). Gồm ba quy tắc (a), (b), (c). Mỗi quy tắc có nhãn thời điểm và nguồn riêng. Khi viết **không đọc điểm mới** nào: không mở điểm E3, E4, E2; số trong (c) lấy từ `context/k4-e2-descriptive-b14-step2-n.md` §2 (σ và N đã có trước gói này). Mọi số tính tay ở đây ghi rõ "tính tay"; phải được script chạy lại trước khi dùng cho quyết định.

**(a) S-1: trần ở H1′/H2′ — `đặt trước`, ghi 4/11/2026, trước khi khóa H1′/H2′.** Nguồn: `BRIEF-D12.md` K2 (S-1), `context/k2-stats-review-2026-11-04.md` (S-1, F11), §2.5 (H6 v2.1 (b)) và §2.7.

- **Lý do:** `permStratified` với `margin > 0` (H2′, `margin = 0,05`, `alt = 'less'`) cho p = p_min ở bài mà cả hai arm chạm trần, vì b − 0,05 làm B0 "kém hơn" A0 ở mọi lượt một cách giả tạo (F11: r = 5 ⇒ p = 1/252 ≈ 0,0040 ≤ 0,0125). Quy tắc dưới đây thay cho việc sửa hàm: nó chặn ca này **trước** khi gọi `permStratified`.
- **Bước 1, loại bài trần.** Bài mà **cả hai arm** (B0 và A0-sonnet) có điểm ≥ 0,99 ở **mọi lượt** bị loại khỏi H1′ và H2′. Ngưỡng 0,99 như §2.7. Bài chạm trần **một phía** (chỉ một arm ≥ 0,99 ở mọi lượt) thì **giữ**, như §2.7. Loại theo từng bài, từ chính dữ liệu xác nhận của H1′/H2′ (khác §2.7, vốn đánh giá trần bằng pilot); danh sách bài loại được báo.
- **Bước 2, kiểm suy biến.** Sau bước 1:
  - **H1′ (`margin = 0`):** cần **≥ 3 bài** còn lại (cùng ngưỡng với H6) **và** thống kê T có phương sai khác 0 qua các cách hoán vị (không phải mọi lượt của mọi ô còn lại cùng một giá trị).
  - **H2′ (`margin = 0,05`):** tập ứng viên chỉ có `l2-chain` (§2.6), nên ngưỡng "≥ 3 bài" không áp dụng (cùng lý do P-1 của D12 cho H3 một bài). Cần **≥ 1 bài** còn lại, **r ≥ 5** mỗi ô (p_min = 1/252, §2.6) **và** phương sai khác 0 như trên. Nếu `l2-chain` bị loại ở bước 1 thì H2′ không còn bài nào.
  - Không đạt thì kết luận **"không xác nhận do suy biến"**, **không phải SUPPORTED**, cũng không phải "không hơn". Cách xử lý như H7 (A-1 của D12): suy biến ra "suy biến", không ra SUPPORTED. Trần che mất khác biệt (cảnh báo H2 của §2.7), nên Δ = 0 do trần không bao giờ là bằng chứng.
  - H1′ vẫn báo như ước lượng kèm CI ngay cả khi suy biến; chỉ nhãn "xác nhận" bị chặn.
- **Số bài tối thiểu bằng số:** H1′ ≥ 3 bài; H2′ ≥ 1 bài; r ≥ 5 mỗi ô cho H2′ khi chỉ một bài (§2.6).
- **Ghi chú trạng thái:** quy tắc này thay cho sửa mã S-1 ở D12 về mặt kết luận; nếu D12 sửa hàm khác đi thì quy tắc ở đây vẫn áp, và sửa lệch phải ghi thành sai lệch. H1′/H2′ vẫn chưa khóa; hai điều kiện khóa của §2.6 không đổi.
- **Kiểm "chưa mở dữ liệu H1′/H2′" (methodologist, công cụ Grep chỉ đọc, 4/11/2026):**
  - Mẫu 1: `H1′|H2′|H1'|H2'` trong `bench/vs-claude/results/` (nội dung). Kết quả: **1 tệp**, `results/study-cloud/artifacts/c3-shop-bugs__B6__r1/test/cart.test.js`, là tệp kiểm thử do agent sinh ra trong lượt cũ, không phải phân tích H1′/H2′.
  - Mẫu 2: tên tệp `**/*{h1p,h2p,h1-prime,h2-prime,h1h2,b15f}*` trong `docs/research/`. Kết quả: **không có tệp**.
  - Mẫu 3: `results/{b14-step2,b15f-main,h6-3e,b15-main}/**`. Kết quả: **không có tệp**.
  - Đối chiếu thêm: trong `docs/research/analysis/`, chữ H2′ chỉ nằm ở `d11-stats-edgecases.mjs:143`, là ca biên giả (F11), không phải dữ liệu H1′/H2′. Chưa có `l1-modules` hay `l2-chain` nào của A0-sonnet cho H1′/H2′ được phân tích (kết quả E3 chưa mở điểm).
  - Kết luận: **chưa có tệp kết quả hay phân tích H1′/H2′ nào được mở hoặc tạo** tại thời điểm đăng ký.

**(b) SS-1…SS-3 của `l3-reconcile`: cỡ mẫu đo trên prompt cũ — `đặt trước`, ghi 4/11/2026, trước khi dùng cỡ mẫu cho N xác nhận của bộ giữ lại B-19.** Nguồn: `self-improvement/holdout-relock-2026-11-04.md` §3 (phương án A), `self-improvement/holdout-and-sample-size.md` SS-1…SS-3, `holdout-sample-size.mjs`, `BRIEF-17.md` K3.

- **Sự kiện:** `brief` của `l3-reconcile` đổi ở D11 (`096e47d`, SR-16); bộ giữ lại khóa lại ở `84ded09` theo phương án (A). Dữ liệu phương sai SS-1…SS-3 trong `study-cloud/runs.jsonl` đo trên **prompt cũ**. Trong SS-2 chỉ ba lượt B0 của `l3-reconcile` bị ảnh hưởng (n = 3, σ²_w token 0,0002, wallSec 0,0072, bậc tự do 2 trên 27 của B0).
- **Hệ quả (nêu, chưa đo):** σ²_w của token và wallSec, SD điểm và (với điểm TB 1,000 ở cả 3 lượt cũ) khả năng chạm trần của `l3-reconcile` **có thể khác** trên prompt mới. Câu thêm vào `brief` chỉ định nghĩa quy ước đếm mà bộ chấm đã dùng, nên kỳ vọng khác biệt nhỏ, nhưng đó là kỳ vọng, không phải số đo. Cỡ hiệu ứng giả định (Δ) không đổi vì là giả định kế hoạch, không đo từ l3.
- **Quy tắc tính lại (methodologist chịu trách nhiệm công thức; data-scientist áp khi chạy):**
  1. **k cố định = 5** lượt B0 `done` đầu tiên của `l3-reconcile` chạy trên prompt mới (hash `task.json` khớp `holdout-lock.json`), trong chính pha xác nhận. Chọn k = 5 để bậc tự do là 4, gấp đôi bậc tự do hiện có (2) của l3; không xem kết quả trước khi chọn. k không đổi theo dữ liệu, không dừng hay mở rộng sớm.
  2. **Công thức:** với mỗi chỉ số m ∈ {ln(`tokens.weighted`), ln(`wallSec`)}, SS_l3 = Σ(x − x̄)² trên k lượt đó. Phương sai gộp mới: σ²_mới = (SS_khác + SS_l3) ÷ (df_khác + (k − 1)), trong đó SS_khác và df_khác là tổng SS và bậc tự do của **các bài còn lại** trong `holdout-sample-size.mjs` (hàm `pooled`, cùng bộ lọc `classifyRows().kept ∩ done`), tức bỏ đúng phần của l3 cũ. Số lượt r lấy từ cùng hàm `requiredRuns` của `bench/vs-claude/harness/stats.mjs` với tham số của SS-3 (T = 10, power 0,8, α, τ², Δ như bảng SS-3), thay σ² cũ bằng σ²_mới. Kèm cột σ² thấp (×0,5) và cao (×2) như SS-3.
  3. **SD điểm:** chỉ tính lại cho nhánh B0; cột "mọi nhánh CCoding" giữ số cũ và gắn nhãn "gồm l3 prompt cũ", vì chỉ k lượt B0 là mới.
  4. **Chỉ tăng, không giảm:** r dùng cho phần còn lại của pha xác nhận = max(r hiện hành của SS-3, r tính lại). Lý do: tránh rút ngắn mẫu vì ước lượng từ chỉ 4 bậc tự do.
  5. Ghi cả σ² cũ lẫn σ²_mới và r hai bản vào RUNLOG hoặc phân tích; báo l3 có chạm trần (điểm ≥ 0,99 ở cả k lượt) hay không.
- **Phương án không chọn:** giữ nguyên cỡ mẫu cũ không kèm kiểm tra. Bị loại vì k lượt đầu nằm sẵn trong kế hoạch xác nhận (không tốn lượt thêm) và thay số cũ bằng số đo trên đúng prompt đang dùng.
- **Chưa làm ở gói này:** không chạy `holdout-sample-size.mjs`, không có lượt l3 mới nào.

**(c) Bước 2 của B-14 (96 lượt): hai giới hạn và phân tích độ nhạy — `đặt trước`, ghi 4/11/2026, trước lượt đầu của bước 2.** Nguồn: mục "Đăng ký trước bước 2 của B-14" ngay trên (§9), `context/k4-e2-descriptive-b14-step2-n.md` §2, `results/b14-diag/RUNLOG.md` (E1).

- **Giới hạn 1, mức tiết kiệm 10 % là giả định.** E1 chỉ cho cơ chế (n = 1 mỗi cặp, lời nhắc giả) và RUNLOG E1 ghi rõ E1 không ước lượng mức tiết kiệm. 10 % là lựa chọn kế hoạch (khoảng 29 % của phần 1,25·cacheWrite ≈ 35 % token có trọng số). N = 96 chỉ đạt power 0,8 nếu hiệu ứng thật ≥ khoảng 9,9 %.
- **Giới hạn 2, thiên lệch chọn bài.** `t2-orders`, `t3-api`, `t4-perf` được chọn theo σ nhỏ và tỉ phần cacheWrite trên dữ liệu B7 đã có; `t1` (σ 0,381) và `t5` (σ 0,338) bị bỏ vì σ lớn. Chọn bài σ thấp làm σ gộp (0,182) **thấp hơn** σ của cả năm bài (0,268): N có thể **thiếu**, power thật có thể **thấp hơn** 0,8, và kết luận chỉ áp cho ba bài (đã ghi ở (3) của mục bước 2).
- **Phân tích độ nhạy đã đặt trước** (báo cùng kết quả chính, **không** đổi phán quyết chính, không vào họ Holm):
  1. **Bảng lực thống kê và N theo mức tiết kiệm**, σ = 0,182, hai phía, α = 0,05, power 0,8, 3 bài. Cột power ứng với N = 96 (SE(T) = 0,182/√24 ≈ 0,0372; power = Φ(Δ/SE − 1,960), tính tay):

     | x | Δ = ln(1/(1−x)) | N cần (tổng, `k4-b14-step2-n.md`) | Power ở N = 96 (tính tay) |
     |--:|--:|--:|--:|
     | 5 % | 0,051 | 396 | ≈ 0,28 |
     | 10 % | 0,105 | 96 | ≈ 0,81 |
     | 20 % | 0,223 | 24 | > 0,99 |

     Cùng ba hàng với σ = 0,268 (cả năm bài): N cần 860 / 210 / 50 lượt.
  2. **Một lần phân tích không có các bài đã chọn, về mặt kế hoạch:** tính lại N với σ của hai bài **không** được chọn, `t1` và `t5` (σ gộp = √((0,381² + 0,338²)/2) ≈ 0,360; tính tay), ở x = 10 %: n ≈ 184 mỗi nhánh, r ≈ 62 mỗi bài với 3 bài, tổng ≈ 368 lượt (tính tay, cần chạy lại bằng script). Số này cho biết N sẽ cần lớn tới đâu nếu σ của ba bài chọn là đại diện sai. **Không có lượt nào của `t1`, `t5` được chạy** trong bước 2 vì không có hạn mức; đây là phân tích trên σ đã có, không phải dữ liệu mới.
  3. **Về mặt kết quả (sau khi đủ 96 lượt):** (i) bỏ từng bài một (leave-one-task-out, 3 lần, mỗi lần 2 bài), báo R̂ và CI 95 %; (ii) σ quan sát của bước 2 so với 0,182 và power thực ở σ quan sát. Nếu R̂ đổi dấu hay CI đổi phán quyết khi bỏ một bài thì ghi "nhạy với bài".
  4. Kết quả "không phân biệt được" **không** là bằng chứng không có hiệu ứng (đã ghi ở mục bước 2). Bài báo và backlog báo CI của R và bảng độ nhạy.
- **Thời điểm:** quy tắc (c) có hiệu lực **trước lượt đầu của bước 2** (`results/b14-step2/` chưa tồn tại). Bước 2 vẫn chờ giám đốc duyệt riêng.

- **Nguồn chung:** `BRIEF-17.md` K3; `BRIEF-D12.md` K2 (S-1, A-1, P-1); `context/k2-stats-review-2026-11-04.md`; `self-improvement/holdout-relock-2026-11-04.md`; `self-improvement/holdout-and-sample-size.md`; `context/k4-e2-descriptive-b14-step2-n.md`.

#### V4-3e-E6 — H6 cho đủ N

- **(1) Giả thuyết:** H6 (§3.1): A1, A2 không kém B0 trong biên ±0,05 về điểm, kiểm không-vượt/tương đương, p = max trên A1, A2 và hai phía. **Không đổi** quy tắc, biên, B = 4000, hạt 20261102 (§2.5).
- **(2) Arm:** A1, A2, B0.
- **(3) Bài:** tập khai báo `l1-modules`, `l2-chain`, t1–t5 (§2.5 (a)); không bài khác.
- **(4) Số lượt:** A1 r = 3, A2 r = 2, B0 r = 3 (§4.4(a)) trên 7 bài, chạy **đủ từ đầu** trong thư mục mới `bench/vs-claude/results/h6-3e`: A1 21 + A2 14 + B0 21 = **56 lượt**, trong đó **B0 mới 21**. Thay cho "trừ khóa đã có, ≈ 49 lượt" của BRIEF-14, vì khóa cũ khác server không được ghép (mục (9)).
- **(5) Thước đo:** chính: Δ = trung bình theo bài của (điểm A − điểm B0), mỗi cặp A1/B0 và A2/B0. Phụ: n_A1, n_A2, danh sách bài loại kèm nhãn trần; độ nhạy ngưỡng 1,00 chỉ mô tả (§2.5 (b)).
- **(6) Phép kiểm và CI:** giữ nguyên quy tắc trần và suy biến v2.1: **(a)** tập 7 bài; **(b)** bài chạm trần (mọi lượt cả hai arm của cặp có `score` ≥ 0,99) bị loại khỏi phép tương đương của cặp đó; **(c)** phương sai Δ\* bằng 0 hoặc mọi Δ\* bằng nhau (dung sai 10⁻¹²) thì p = NA, một cặp NA thì p(H6) = NA, phán quyết theo CI §2.4; **(d)** min(n_A1, n_A2) < 3 thì H6 hạ xuống ước lượng kèm CI 90 %, họ Holm chỉ còn H3 (K = 1). **Nguồn p:** dùng SR-26 nếu, **trước lượt E6 đầu tiên**, nó đã gộp, có test và hash theo §2.3, §2.5, và hash đã ghi vào RUNLOG; nếu không thì H6 theo phương án lùi (ước lượng kèm CI 90 %, K = 0). Điều kiện này kiểm trước mọi dữ liệu E6 nên không phụ thuộc kết quả. Số lượt A1 r = 3, A2 r = 2 vẫn không đủ công suất TOST ±5 pp (§2.5), nên "Không kết luận" vẫn được dự báo trước.
- **(7) Dừng:** n đã định §4.4(a); không xem p, CI hay chênh lệch trước khi đủ n; không dừng sớm vì kết quả (§4.4(b)); hết ngân sách hoặc hạn mức thì dừng, báo n thực, ô thiếu bị đánh dấu, **không điều chỉnh phép kiểm** (§4.4(c)(d)).
- **(8) Loại:** §4.1, §4.3 (Q, L, T, E1, E4) đối xứng giữa arm; thay lượt bằng `rep` mới, tối đa 2 mỗi ô.
- **(9) Hash server:** ghi khi chạy. H6 chỉ ghép cặp A1/A2 với B0 chạy trong **cùng cửa sổ và cùng server** (cách V3-02). Khóa lượt từ cửa sổ cũ (W1–W5, B7a) chạy trên server khác (V3-02, V3-03) **chỉ dùng để mô tả**, không vào Δ và không vào phép kiểm. Vì runner bỏ qua khóa đã `done` trong cùng `--out`, E6 dùng thư mục mới `bench/vs-claude/results/h6-3e`.
- **Nguồn:** §2.5 (quy tắc trần và suy biến, (a)–(d)); §2.7; §4.4; §3.1 (H6); RUNBOOK Bước 3e mục 6.

### Sai lệch vòng 4 gói 10 — khóa lại bộ bài giữ lại B-19 (ghi 4/11/2026)

**Phạm vi:** bộ 10 bài giữ lại của B-19 (`holdout-lock.json`). Đây không phải giả thuyết H1–H10, B-01, B-02, nên không đổi họ Holm.

**Lý do.** Từ khi khóa (`8b0b6c3`) tới D11 (`902fc78`), D11 sửa `task.json` và `hidden/` của cả 10 bài: SR-05 (`size`, `sizeBasis`, `sizeLegacy`), SR-15 (bỏ nhãn H), SR-16 (`bruteforce.mjs` của `l1-oncall`, câu định nghĩa trong `brief` của `l3-reconcile`), SR-17 (`bonus` không tính điểm của `s1-sec-review`), SR-24 (đối chứng `hidden/nearmiss` ở cả 10 bài). `holdout-sample-size.mjs --size` báo lệch hash ở cả 10 bài và bốn test CT-09, CT-12, CT-13, CT-19 đỏ đúng thiết kế. Biên bản rà diff từng bài: `docs/research/self-improvement/holdout-relock-2026-11-04.md`.

**Kết quả rà diff.** Không bài nào đổi `repo/` (thư mục agent nhận). Không thay đổi nào lộ đáp án: `hidden/` chỉ được chép vào thư mục chấm sau khi agent chạy xong (`harness/run.mjs:212`). Chín bài chỉ đổi bộ chấm hoặc siêu dữ liệu. **Một ngoại lệ có tên:** `l3-reconcile` thêm một câu định nghĩa "duplicate row" vào `brief` (prompt agent nhìn thấy; commit `096e47d`, SR-16). Câu này không nêu giá trị đáp án nhưng làm bài bớt mơ hồ, nên có thể hơi dễ hơn. Mọi nhánh dùng chung một `brief` nên không thiên về nhánh nào. Research-lead chấp nhận (phương án A), **trước mọi lượt A/B**. **Lưu ý cho phân tích:** ước phương sai của `l3-reconcile` trong SS-1 đến SS-3 của `holdout-and-sample-size.md` lấy từ `study-cloud`, đo trên prompt cũ, nên có thể hơi lệch (nhất là SD điểm).

**Bằng chứng chưa có lượt A/B nào của B-19** (HEAD `9203887`, 4/11/2026): `git log --all --oneline -- 'bench/vs-claude/results/selfimprove*' 'bench/vs-claude/results/b19*' 'data/'` → rỗng; `grep -rIl -i -E "selfimprove|B-19" bench/vs-claude/results` → rỗng; không có thư mục `data/`; nhánh (`"arm"`) trong 9 tệp `runs.jsonl` chỉ gồm A0-sonnet, A1, A2, B0, B5, B6, B7, B7c, B7cab, B7cabO, B7cb, null, oracle, không có nhánh bản vá. Giới hạn: chỉ kiểm được repo này, không kiểm được `data/` trên máy khác.

**Hash cũ (khóa ở `8b0b6c3`) → mới (nội dung tại `902fc78`, khóa lại tại `9203887`).** Chuẩn hóa CRLF → LF. Đã đối chiếu `task.json` của c1-iis-ecs, l3-reconcile, s1-sec-review với `git show 902fc78:<đường dẫn>`: hash trùng.

| Bài | task.json cũ | task.json mới | hidden/ cũ | hidden/ mới | Số tệp ẩn cũ → mới |
| --- | --- | --- | --- | --- | ---: |
| c1-iis-ecs | `cfab976b556d8d03e3b4c65f14a36419c3c3b35f194e4c8c3655fce492202deb` | `0b878cf3081732ba173fedbefd6a209c88a82a56960346044cbfed3133fd8326` | `6565ca2323bc4865d2473454acaf9688182c35fe6c796ee2d8eef921b950e108` | `58f1b5649426a3820077452832626c5020b6754447e0a6851d585e37061435a1` | 2 → 4 |
| c2-burst-alert | `308513e6112e6d73d38ce771568a7d1316437c64870e0cca847a9d916d78cbf8` | `8c2221aa9634f1759a8eca7fe74e97dc6bc35a37f44e93803342b452d8d0d907` | `5277755da8e57382dd844060a24c83c41afe62d67bd18dd24564052eb0a70fc7` | `28078504768236aee575f5151422f05ddcd8ca0f1037b1b339a742f65a71899d` | 2 → 4 |
| c3-shop-bugs | `723e266c61c51416e715d7e35c5a1d1a8eaa79f626b94356f49a32bbdb2b9d9a` | `2049df7b1f04c693938f878024aa32605ebfc8d3faaf7d0a81469a555e97bb7d` | `77b7e695fedaa8ec1b96486be5ca951a71e7a282f3a013bed68326c8f5109494` | `ab8263012fdebd231564d6bc7a42455b1fed5365d49ab619acd20cfb5246ba9d` | 4 → 6 |
| c4-audit-chain | `6ac634a94400520fe25cfe48f0de5e673a3aba8c0549ba9b6b04f583653e1a28` | `1f47afff670612613808a4ae0b4f0567a201972eeb65ff38c47e4e5fc0fcd7fe` | `dec3ef65f5b30b0103528630445d235460e019e511cee3646b0c4904f8a8a433` | `1712f4a0fe429f795a215fcab8d2922765325a49e0195972f16b8409960d2e4e` | 2 → 4 |
| c5-tickets-api | `132988780f1f52fdcab5fad058927911b211cc6d456acc0b96e9c88c5ac9eeaf` | `dfbdeff29a3ea4a64a3ad0a7e7a09d889613a7ae6792f1b5842e116018f7a308` | `2648b012cf765f509aba7004643d8cfd7bc950545b981d93ab419e0e98b7b8e1` | `e63d39e86bf6e198a3a25474bea4539edcb6608d5817d5c0043a591aa8b20bc5` | 2 → 4 |
| l1-oncall | `59c1d04f2e1f6eec6f14619dab134fae2720569d63c3d24d3313f5b8a9903b8c` | `1918a4bb22879aafe8a52fc708e3cf4ca8d5237b0accd0e80f85eaee3217d6ce` | `6dd47dfb85226e100acc7686922a600dbae8cc40c36ba29a0a6c17f1a21551c3` | `d52eb417ca1f23f08e7847a6fb9246e18d37a1c60728b6345e376c583be551a5` | 1 → 4 |
| l2-knights | `9701823e9a5f5f0a7e98a7a32f8b905ca7bf6c2f1482a8e405362e144d1c5171` | `03d0a9ec9486feaae46b7291cb31363381086eb295dcc2189b4b7209300de80b` | `a08e8d994b0618119ed905aa7d6e54d09e7077db87306a59e4fc1fcd52e44588` | `c94b462658a19cace61ca4d3d55082a01cb382f322f5cfa42842afb5992f1c14` | 1 → 3 |
| l3-reconcile | `357593db167c54b4f307b9bb66771910bdb32ab71d857ff1a93a9a24fc055073` | `79810448b4304a3a9ab39acb4f8f906cc41048f961c3820bb3e6649e78aff28f` | `bd033ab3712ab6e5cad7373207deb4e75ebfb48172ec94c49457434331171701` | `0cf7636fc9e4112f6ef8b3b64960f413394f66f6896c3cde14c7126c81a7da54` | 1 → 3 |
| l4-startup-order | `cf69a6939604dfd8ff06480b90aa4f4da693d98a0c107393c24e20ac367e0580` | `027b8cf881ca50511546a499870eb1bc8d95f6f46ae789fb7806cae45435248f` | `25d0003e3e422de9bfd3340f43bc926a2d9c46f4ec87b33612f1d21ddf224b31` | `4f48535743cf47768caa44aee57adc128195bd3d1d57d3c49dd702296152de27` | 1 → 3 |
| s1-sec-review | `8c5f1505c2b8747c91b8f20d657ed0e8d821d5d1ea9a4bcc822d2172cdef1b02` | `2264cb3bcd8488199184c50d39fbb20235ca25c34ca58615366be29136a38e2d` | `278257718ce3da6a4c31b24cff68ad42d550432a4c1de9b94a557bd274614540` | `c306f6dcbc5e0f3bb4672e0139ab8bdf059044af7ba03a2253ab9d7fa3f63f88` | 2 → 4 |

**Cỡ mẫu trước và sau: không đổi.** `holdout-sample-size.mjs` không đọc `size` hay `hidden/`; cỡ mẫu chỉ phụ thuộc `study-cloud/runs.jsonl` (blob `9131f7768ff1badc4f50264de37ac4cae1bc0d5c`, commit cuối `e8354fa`, không đổi giữa hai lần khóa). Sau khóa lại, `--size` chạy được (exit 0) và `--check holdout-and-sample-size.md` báo "OK: 120 dòng bảng trùng đầu ra script", gồm cả các bảng SS-0 đến SS-7 đã có, nên mọi con số cỡ mẫu giữ nguyên. Chỉ bảng hash ở §2 của tài liệu được cập nhật. Bốn test CT-09, CT-12, CT-13, CT-19 đọc kỳ vọng từ lock, không ghi cứng, nên không sửa test.

#### Khối (a) — Công thức chốt N cho E4 (ghi trước mọi lượt của E2; không chặn việc soạn tài liệu)

0. **Đơn vị của N:** N_gộp là số **lượt có lỗi cài của cổng đó, cộng cả hai arm** B7cab và B7cabO (BL B-12 trường 6: recall gộp hai arm). Mỗi cổng chỉ có 2 trong 6 bài cài lỗi đúng loại của nó (`arms.json` `_suites.gates.kinds`: b02 = g1, g2; b10 = g3, g4; cto = g5, g6). So sánh B-16 vẫn làm từng arm bằng McNemar chính xác ghép cặp theo (bài, `rep`). b10 tính riêng cho arm B6 (bước 4).
1. **Tử và mẫu (chỉ lấy từ E2, nhãn tại thời điểm cổng, cộng hai arm, không tách arm):**
   - q̂_b02 = (số lượt g1, g2 có `gates.b02.blocked` = true, tức có lệnh kiểm đỏ tại cổng; khi có `checksRed` thì là `checksRed > 0`) / (số lượt g1, g2 có `gates.b02` không `null`).
   - q̂_cto = (số lượt g5, g6 có `pass = false`, tức test ẩn đỏ cuối lượt, bằng trạng thái tại cổng ở làn đơn) / (số lượt g5, g6 có `gates.cto` không `null`).
   - Chỉ lượt E2 của B7cab và B7cabO; B6 không tính.
   - m theo thiết kế bài: số phần tử của `plantedFaults` trong `bench/vs-claude/tasks/g*/task.json`; cả sáu bài g1–g6 có m = 1, nên DEFF = 1 và **không cần ρ̂**. Nếu sau này có bài m > 1: ρ̂ = ICC(1) một chiều theo ANOVA, ρ̂ = (MSB − MSW)/(MSB + (k − 1)·MSW), cụm = lượt, k = số quyết định mỗi lượt, MSB, MSW là trung bình bình phương giữa và trong cụm; bài đó phải được đăng ký riêng trước lượt đầu của nó.
2. **Công thức (AG C-3):** DEFF = 1 + (m − 1)·ρ; N_gộp = ⌈(dương cần × DEFF) / (m·q)⌉ với dương cần = 32 (r = 0,8, nửa độ rộng CP 95 % ≤ 0,15). r = 0,8 là **giả định đăng ký**, giá trị giữa của ba giá trị 0,6/0,8/0,9 ở AG C-3 và BL B-12 trường 5; không ước lượng lại từ E2. E4 báo nửa độ rộng CI thực tế của recall.
3. **Bậc gần nhất:** q̂ làm tròn **xuống** về bậc {1,0; 0,7; 0,5} (q̂ < 0,5: dùng 0,5 và ghi), ρ̂ làm tròn **lên** về bậc {0; 0,3; 0,5} (ρ̂ > 0,5: dùng trần), m theo hàng của AG C-3 (1; 3; 5), để N không thấp hơn nhu cầu. Đối chiếu với ô tương ứng của bảng C-3 (ví dụ r = 0,8, m = 1, q = 0,7 cho 46).
4. **Từ N đến `--repeats`, trần thời gian máy:**
   - B7cab, B7cabO: R_E4 = ⌈N_gộp / 4⌉ (2 bài mỗi cổng × 2 arm), lấy **lớn nhất** giữa b02 và cto; chạy trên 4 bài g1, g2, g5, g6, tổng 8 × R_E4 lượt. Bậc q 1,0 / 0,7 / 0,5 cho N_gộp 32 / 46 / 64, R_E4 8 / 12 / 16, tổng 64 / 96 / 128.
   - b10: B6 × g3, g4, R_B6 = ⌈N_b10 / 2⌉ = 32 (q = 0,5 theo bước 5), tổng 64 lượt.
   - **Không có chặn tổng** (bỏ [50; 92] của BRIEF-14).
   - **Trần thời gian máy của E4: 15 giờ đồng hồ thực** trên máy local, đo bằng tổng (giờ kết thúc − giờ bắt đầu, UTC, ghi RUNLOG) của các lệnh E4, không tính thời gian chờ giữa hai cửa sổ; E4 dùng **tối đa 3 cửa sổ 5 giờ**. Chạy lệnh B7cab, B7cabO trước, lệnh B6 sau. **Khi chạm trần** (15 giờ, hoặc hết cửa sổ thứ ba): không bắt đầu lượt mới, lượt đang chạy được chạy hết rồi dừng; báo số lượt đã chạy mỗi ô (cổng × arm × bài); **không chạy bù**, không mở cửa sổ thứ tư; báo nửa độ rộng CI thực tế và **không tuyên bố đạt ≤ 0,15**.
5. **Dưới 10 dương thật trong E2** (đếm theo lượt) cho một cổng, hoặc không tính được q̂ của cổng đó: ghi "**chưa ước lượng được**" và dùng bậc q = 0,5 cho cổng đó (N_gộp = 64). Đây là lựa chọn bảo thủ của mục này, research-lead duyệt ở vòng 4 gói 9. **Hệ quả ghi trước:** E2 có tối đa 8 lượt có lỗi cài mỗi cổng (2 bài × 2 arm × 2 lượt), luôn ít hơn 10, nên bước này **luôn áp** cho b02 và cto: **R_E4 = 16 (128 lượt) và R_B6 = 32 (64 lượt), tổng E4 = 192 lượt**, xác định trước mọi dữ liệu. q̂ của E2 vẫn được tính và ghi RUNLOG để mô tả, không đổi N.
6. **Cấm:** N chỉ tính theo các bước 1–5 từ E2, **ghi vào RUNLOG trước lượt đầu của E4**. Cấm chọn hay đổi N sau khi đã xem điểm, recall, hiệu số nghiệm thu sai hay bất kỳ kết quả nào của E2 hoặc E4; cấm thêm lượt "cho đủ ý nghĩa" (CD 3.5 "Tối đa", §4.4(b)).

#### Khối (b) — Thứ tự ưu tiên khi thiếu credit

**E1 > E2 > E3 > E4 > E5 > E6.** Lý do: E1 rẻ nhất và gỡ nghi vấn cache cho mọi phép đo sau; E2 là điều kiện để chốt N cho E4; E3 là thí điểm bắt buộc trước E5; E4 trước E5 vì đóng được phán quyết "không đủ dữ liệu" của B-02; E6 sau cùng vì chỉ bổ sung n cho H6 đã có dữ liệu một phần. Hết credit: dừng ngay, commit phần đã có, ghi khóa cuối cùng vào RUNLOG, không chạy tiếp bằng hạn mức gói trên cloud (RUNBOOK mục 5). Được đổi thứ tự nếu **ghi lý do vào mục này trước lượt đầu của phần bị đổi**.

#### Khối (c) — Lịch cloud/local

E1–E3 trên cloud trước 5/11 14:59; E4–E6 local bằng hạn mức gói.

**Sai lệch ghi trước lượt đầu (người điều phối, 4/11/2026 10:05 giờ VN).**
- **Duyệt:** giám đốc duyệt chạy E1–E3 trên cloud, E4–E6 local, và cài WSL2 để kiểm sandbox B-18.
- **Credit:** ảnh chụp lúc 10:03 cho thấy chỉ còn $22/$250. Số này dùng chung với chính phiên điều phối, nên không đủ cho cả ba phần, ước lượng ≈ $22 cộng phần Opus.
- **Thay đổi về nơi chạy:**
  - E1, E2 chạy cloud, giữ thứ tự E1 > E2.
  - **E3 chuyển sang local** và chạy trước E5 trên cùng server local.
  - Thứ tự ưu tiên của khối (b) không đổi, chỉ đổi nơi chạy.
- **Commit ghim:**
  - E1 không qua server. E2 chạy trên server cloud ở `1ab5514`.
  - Các phần local chạy trên một commit ghim riêng, ghi vào RUNLOG trước lượt local đầu tiên.
  - Không phần nào bị tách giữa cloud và local. E2 không gộp vào E4 vì N của E4 đã cố định (R_E4 = 16, R_B6 = 32), và E3 không gộp vào E5. Vì vậy hai nơi chạy hai commit khác nhau không làm trộn dữ liệu.
- **Xem kết quả trước khi sửa?** Không, chưa có lượt nào của đợt 3e.

**Sự cố hạ tầng E1 (4/11/2026 10:08 giờ VN).**
- **Diễn biến:** lần chạy đầu của `cache-diagnostic.mjs` khởi động lúc 10:04, chạy nền bằng `nohup`. Môi trường đã dừng tiến trình khi lượt trả lời của người điều phối kết thúc.
- **Hậu quả:** script chỉ ghi CSV ở cuối, nên **không có dữ liệu nào**: CSV rỗng, log rỗng, không ai xem số nào.
- **Số lượt đã gọi:** ước khoảng 3 lượt `claude -p` (khởi động, lượt 1 và 2 của cặp (a)), suy từ thời gian chạy khoảng 4 phút trước lần chờ 330 giây đầu tiên. Con số này **chưa kiểm được**.
- **Cách xử lý:**
  - Chạy lại đủ một lần, tối đa 8 lượt, bằng tiến trình nền do công cụ quản lý.
  - Vì vậy tổng số lượt có thể vượt trần 8 của (7), nhưng phần vượt là lượt hạ tầng hỏng, không có dữ liệu.
  - Đây không phải "chạy lại cho đẹp" (CD 1.5), vì chưa có kết quả nào.
- Giám đốc được báo ngay trong phiên.

**E3 xong; E5 tạm giữ, E6 chạy trước E5 (người điều phối, 4/11/2026 12:20 giờ VN; ghi trước lượt đầu của E5 và E6).**
- **Căn cứ:** thước đo chính của V4-3e-E3 là pha `discuss` của B0, và kết quả là **không có** ở cả hai bài (`results/large-pilot/RUNLOG.md`).
  - l1-modules đi làn nhanh.
  - l2-chain đi làn đơn rồi nâng lên làn nhanh.
  - Làn nhanh và làn đơn đều không có pha họp. Lựa chọn làn là hàm thuần của đề bài, nên lặp lại không đổi được.
- **Hệ quả:** theo V4-3e-E5 (8), mọi lượt B0 của E5 sẽ bị loại, kéo theo cả cặp với B1. Như vậy E5 đúng như đăng ký chỉ cho ô "thiếu dữ liệu", tốn khoảng 40 lượt hạn mức mà không có dữ liệu cho B-15.
- **Đổi thứ tự theo khối (b):** E4a, E4b như cũ, rồi E6a, E6b, E6c. **E5 tạm giữ**, chưa có lượt nào. Số lượt, arm, bài và phép kiểm của E4 và E6 không đổi.
- **Thiết kế lại E5:** Phòng Nghiên cứu quyết định và ghi vào mục này trước lượt đầu của E5 mới. Hướng gợi ý là ép `lane: full` cho cả hai arm, tức đúng "đối chứng làn đầy đủ, `discussionRounds: 1`" mà V4-3e-E5 (1) mô tả. Lượt nào chạy cũng cần giám đốc duyệt.
- **Xem kết quả trước khi đổi?**
  - Không xem điểm của E3.
  - Quyết định chỉ dựa trên trường quy trình `lane`, `escalatedFrom` và `byPhase`, cùng nhật ký `lane.pick`. Đây là thước đo chính đã đăng ký của E3.
  - Chưa có lượt nào của E4b, E5 hay E6.

Ghi chú: pha chạy Opus thì chi phí cao hơn; `runs.jsonl` ghi `model` theo pha (B-13), nên mọi phần ghi `model` theo pha cùng hash server để nối dữ liệu cloud với local (`run-plan.md` §6.1).

### Đăng ký trước bước 2 của B-14: A/B `runtimes.claude-cli.stablePrefix` (ghi 4/11/2026, trước lượt đầu tiên)

**Vị thế.** Mục này ghi **trước mọi lượt của bước 2**: chưa có thư mục `bench/vs-claude/results/b14-step2/` và chưa có dòng dữ liệu nào. Dữ liệu tác giả đã thấy khi viết:
- E1 (`results/b14-diag/RUNLOG.md`), chỉ cho biết cơ chế;
- σ và tỉ phần cacheWrite của arm B7 trên t1–t5 trong `study-cloud`, dùng để chọn bài và tính N (`context/k4-e2-descriptive-b14-step2-n.md` §2).

Không ai đã thấy dữ liệu nào có công tắc bật. **Mốc khóa** là commit gộp của nhiệm vụ T-20261104-110942-567. Người chạy ghi hash đó vào dòng đầu của `results/b14-step2/RUNLOG.md` trước lượt đầu; **dòng đó còn trống thì không được chạy**. Sau mốc khóa, mọi thay đổi là sai lệch và phải ghi thành dòng riêng.

Bước 2 **chưa được giám đốc duyệt chạy**. Lý do phải duyệt: bước này đổi cấu hình công cụ và chuyển việc chặn theo pha sang hook (B-14 trường 9). Không phép nào ở đây vào họ Holm, và K của §2.5 không đổi.

- **(1) Câu hỏi và giả thuyết.**
  - **Câu hỏi:** trên làn đơn, bật `runtimes.claude-cli.stablePrefix` có làm đổi token có trọng số mỗi lượt không?
  - **G2 (giả thuyết có hướng):** bật công tắc làm **giảm** token có trọng số trung bình mỗi lượt, tức R = bật/tắt < 1.
  - **Căn cứ:** E1 cặp (b) cho thấy đổi bộ công cụ làm vỡ toàn bộ tiền tố (h = 0,00; CW lượt 2 = 41 464; CR = 0). Cặp (c) cho thấy đổi `cwd` không ảnh hưởng (h = 0,98, bằng h(a)).
  - **Phép kiểm vẫn hai phía,** vì hướng ngược lại có thể xảy ra: bộ công cụ cố định `STABLE_TOOLS` (`src/runtimes/claude-cli.ts:234`) gồm 10 công cụ, nên mọi lượt gọi, kể cả pha chỉ đọc, mang định nghĩa của cả 10. Tiền tố dài hơn có thể làm tăng `input`/`cacheWrite` ở lượt đầu.
  - **Công tắc gồm hai thay đổi đi cùng nhau:**
    - (i) bộ công cụ cố định cho cả nhiệm vụ (`claude-cli.ts:241-243`), còn quyền theo pha chuyển cho hook (`:268`, `src/tools/claude-guard.ts:91`);
    - (ii) pha không sửa tệp chạy ở thư mục gốc nhiệm vụ (`src/orchestrator.ts:3475-3476`).

    A/B đo **cả gói**. E1 (c) gợi ý phần (ii) đóng góp gần 0, nhưng hai phần không tách được, nên không quy hiệu ứng cho riêng phần nào.
- **(2) Arm.** Hai nhánh, chỉ khác đúng một khóa cấu hình:
  - **Tắt (đối chứng), ký hiệu B7:** arm B7 của `bench/vs-claude/arms.json`, "CCoding làn đơn (B-01)", `lane: single`, tức **làn đơn** (một agent). `runtimes.claude-cli.stablePrefix` vắng hoặc `false` (mặc định).
  - **Bật, ký hiệu B7sp:** cùng arm B7, cùng commit server, thêm `runtimes.claude-cli.stablePrefix: true` vào `ccoding.local.json` của server. Arm của bench không đặt được khóa runtime (`COMMON_KEYS`, `src/bench.ts:141`), nên **B7sp chỉ là nhãn phân tích**, không phải arm mới trong `arms.json`. Hai nhánh phân biệt bằng thư mục `--out`. Không thêm arm, không sửa `bench/`.
  - Mọi cấu hình khác giữ y nguyên ở cả hai nhánh, kể cả `extraArgs: ["--disallowedTools", "WebFetch,WebSearch"]` (V3-04). RUNLOG ghi sha256 của `ccoding.local.json` mỗi nhánh kèm `diff` giữa hai bản; diff chỉ được khác đúng khóa `stablePrefix`.
  - **Lý do chọn B7, không chọn B7cab:** σ có sẵn là của B7 (9 lượt mỗi bài, `study-cloud`), và tỉ phần cacheWrite C-1 (34,8 %) cũng đo trên B7. B7cab có thêm ba công tắc `slim` và chỉ có n nhỏ từ E2.
- **(3) Bài cố định:** `t2-orders`, `t3-api`, `t4-perf`.
  - **Lý do:**
    - `t4-perf` có nhiều lần gọi nhất (TB 4,3) và tỉ phần 1,25·cacheWrite cao nhất (0,403), nên cơ chế E1 (b) có nhiều cơ hội tác động nhất.
    - `t2-orders` có σ nhỏ nhất (0,076) và ít lần gọi nhất (2,0), là ca "ít pha".
    - `t3-api` ở mức giữa (σ 0,252; 2,3 lần gọi; token lớn).
    - Bỏ `t1` (σ 0,381) và `t5` (σ 0,338) vì chúng làm N tăng khoảng 2,2 lần.
  - **Giới hạn ghi trước:** bài được chọn theo σ và cacheWrite quan sát trên B7, tức trên dữ liệu đã có (không phải dữ liệu nhánh bật). Kết luận chỉ áp cho ba bài này và cấu hình đã đo; không khái quát sang t1–t5 hay bài lớn. E1 dùng lời nhắc giả (`taskId: 'cache-diag'`), nên không có "bài E1" để kế thừa.
- **(4) Số lượt: 16 lượt mỗi bài mỗi nhánh × 3 bài × 2 nhánh = 96 lượt.**
  - **Công cụ:** `requiredRuns`/`zInv` của `bench/vs-claude/harness/stats.mjs`, gọi qua `node docs/research/analysis/k4-b14-step2-n.mjs`, cùng công cụ với `holdout-sample-size.mjs`.
  - **Đầu vào:**
    - thước đo ln(token có trọng số);
    - σ gộp trong bài = 0,182 (B7, t2–t4, 9 lượt mỗi bài);
    - α = 0,05 hai phía, power = 0,8, τ² = 0;
    - hai nhánh giả định cùng σ.
  - **Hiệu ứng kế hoạch x = 10 %,** tức Δ = ln(1/0,9) = 0,105. Từ đó n = 47 mỗi nhánh và r = ⌈47/3⌉ = 16 mỗi bài.
  - **x = 10 % là giả định kế hoạch do research-lead chốt, không phải số đo.** E1 không ước lượng mức tiết kiệm (n = 1 mỗi cặp, lời nhắc giả). 10 % bằng khoảng 29 % của phần 1,25·cacheWrite (≈ 35 % token có trọng số ở B7), mà phần đó không thể cắt hết vì lượt đầu luôn phải ghi.
  - **Mức hiệu ứng nhỏ nhất phát hiện được với N = 96 (ghi trước):** cùng công thức xấp xỉ chuẩn và cùng σ như trên, SE(T) = σ/√24 = 0,182/√24 ≈ 0,0372 (3 bài, 16 lượt mỗi ô). Với α = 0,05 hai phía và power 0,8, |Δ| nhỏ nhất là (1,960 + 0,842) × 0,0372 ≈ 0,104, tức **mức tiết kiệm nhỏ nhất phát hiện được ≈ 9,9 %**. Nếu hiệu ứng thật là 5 % (Δ = 0,051) thì power chỉ khoảng 0,28; muốn đạt power 0,8 ở mức đó thì cần 396 lượt. Đây là số tính tay theo công thức của `requiredRuns`, chưa chạy lại bằng script.
  - **Hệ quả cho diễn giải:** nếu hiệu ứng thật nhỏ hơn khoảng 10 % thì power < 0,8. Khi đó kết quả "không phân biệt được" **không phải bằng chứng là không có hiệu ứng**, chỉ cho biết hiệu ứng (nếu có) khó lớn hơn cận của CI 95 %. Bài báo và backlog phải báo CI của R, không báo "stablePrefix không có tác dụng".
  - **Lịch ABBA theo khối 4 lượt**, chạy tuần tự trên một server:

    | Khối | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
    |---|---|---|---|---|---|---|---|---|
    | Nhánh | tắt | bật | bật | tắt | tắt | bật | bật | tắt |
    | Lượt | r1–4 | r1–4 | r5–8 | r5–8 | r9–12 | r9–12 | r13–16 | r13–16 |

  - **Lệnh mỗi khối:**

    `node bench/vs-claude/run.mjs --arms B7 --tasks t2-orders,t3-api,t4-perf --repeats <4·k> --timeout 20 --out bench/vs-claude/results/b14-step2/<off|on>`

    với k là số thứ tự khối của nhánh đó. Runner bỏ qua khóa đã `done` trong cùng `--out` (`run-plan.md` §5.4.3), nên `--repeats 8` chỉ chạy r5–8.
  - **Đổi nhánh** gồm hai việc: sửa đúng khóa `stablePrefix`, rồi khởi động lại server. Thời điểm đổi (UTC) ghi vào RUNLOG.
  - **Lý do chọn ABBA:** hai nhánh chạy nối tiếp trên cùng máy, và ABBA cân bằng được trôi theo thời gian (tải cloud, hạn mức, TTL cache chưa biết). Toàn bộ 96 lượt chạy ở **một nơi** (cloud hoặc local, ghi RUNLOG), không tách giữa hai nơi.
- **(5) Thước đo.**
  - **Chính:** ln(`tokens.weighted`) mỗi lượt, với `tokens.weighted = input + 1,25·cacheWrite + 0,1·cacheRead + 5·out`. Báo R̂ = exp(T).
  - **Phụ (mô tả, không p, ngoài họ Holm):**
    - (a) tỉ lệ trúng cache mỗi lượt h = cacheRead/(cacheRead + cacheWrite + input), tính từ `tokens` của dòng `runs.jsonl`, báo trung vị theo bài × nhánh;
    - (b) tỉ phần 1,25·cacheWrite / token có trọng số;
    - (c) test ẩn: tỉ lệ `pass` và `score` mỗi nhánh, kèm CP 95 %. Đây là điều kiện an toàn "không kém hơn" của B-14 trường 6, **chỉ mô tả**, vì chưa có cỡ mẫu cho phép kiểm không-kém-hơn;
    - (d) `wallSec`;
    - (e) số lần gọi (`calls`).
  - **Bỏ USD,** vì `costUsd` của arm CCoding bằng 0 (SR-02).
- **(6) Phép kiểm, α, phía.**
  - **Thống kê:** T = trung bình theo bài của (TB ln bật − TB ln tắt).
  - **p hai phía:** `permStratified` (`bench/vs-claude/lib/stats.mjs:162`) với `cells = [{ task, a: ln tắt, b: ln bật }]`, `alt: 'two'`, `margin: 0`, `M: 10000`, `seed: 20261104`. Vì ∏ C(32, 16) > 10⁶ nên hàm chạy Monte Carlo, và p = (k + 1)/(M + 1).
  - **α = 0,05 hai phía,** một phép kiểm chính duy nhất, không hiệu chỉnh bội.
  - **CI 95 % của R = exp(T):** bootstrap phân tầng (trong từng bài, lấy lại lượt trong từng nhánh), 4000 vòng, hạt 20261104, phân vị.
  - **Phán quyết:**
    - "giảm" khi p ≤ 0,05 **và** cận trên CI của R < 1;
    - "tăng" khi p ≤ 0,05 **và** cận dưới > 1;
    - còn lại là "không phân biệt được".
  - **Lỗi đã biết không ảnh hưởng phép kiểm này:** S-1 chỉ xảy ra với điểm chạm trần kèm `margin`, ở đây `margin` = 0 và thước đo là token liên tục. T-1 và T-2 thuộc `tost`, không dùng ở đây.
  - **Script phân tích** `docs/research/analysis/b14-step2.mjs`, có test, phải commit và ghi hash vào RUNLOG **trước lượt đầu**. Script chỉ được gọi các hàm trên với đúng tham số trên. Thiếu script có test và hash thì kết quả chỉ được báo mô tả.
- **(7) Điểm dừng.**
  - **Dừng bình thường:** đủ 96 lượt `done`.
  - **Không xem token, h hay điểm theo nhánh trước khi đủ 96 lượt.** Người chạy chỉ xem trạng thái và lỗi; mọi lần xem log phải lọc bỏ cột token và điểm. Đây là bài học từ sai lệch "lỡ thấy điểm 6 lượt" của E2. Lỡ thấy thì ghi RUNLOG, không loại lượt.
  - Không dừng sớm vì kết quả, không thêm lượt (§4.4(b)).
  - **Chạm hạn mức hoặc hết credit:** dừng, chờ cửa sổ sau, giữ nguyên thứ tự khối. Nếu phải dừng hẳn thì chỉ phân tích các **cặp khối AB hoàn chỉnh** (mỗi cặp đủ cả hai nhánh), báo n thực, gắn nhãn "chưa đủ N", và không chạy bù quá 96 lượt.
  - **Dừng an toàn, ngay lập tức:** dừng khi ở nhánh bật có bất kỳ dấu hiệu nào cho thấy hook để lọt quyền ghi ở pha chỉ đọc (log hook, `leak`, hoặc tệp đổi ngoài pha `execute`/`revise`). Báo Phòng Dev và giám đốc; dữ liệu tới thời điểm đó chỉ mô tả.
  - **Tiền điều kiện trước lượt đầu:** bộ test lệnh ác ý cho chế độ `stablePrefix` (B-14 trường 7(c)) xanh trên commit ghim, ghi kết quả vào RUNLOG.
- **(8) Quy tắc loại lượt.**
  - Áp §4.1 và §4.3 (Q, L, T, E1, E4), đối xứng giữa hai nhánh. `status ≠ done` thì loại.
  - Thay bằng `rep` mới, tối đa 2 lượt mỗi ô (bài × nhánh). Quá mức thì ô đó "thiếu dữ liệu".
  - **Kiểm cấu hình đầu mỗi khối:** ghi sha256 của `ccoding.local.json` vào RUNLOG. Khối chạy nhầm cấu hình của nhánh kia thì loại cả khối, chạy lại khối đó đúng một lần, và ghi sự cố.
  - **Không loại lượt theo token, h hay điểm.** Không loại ngoại lai.
- **(9) Hash.** Ghi commit ghim của server (phải chứa B-14b, tức `STABLE_TOOLS` và hook `stablePrefix`) và phiên bản `claude` CLI vào RUNLOG. Cả 8 khối dùng một commit và một CLI. CLI đổi giữa chừng thì dừng và ghi §9 (tiền lệ V4-04).
- **(10) Ràng buộc.**
  - **Bước 2 không thay E4** và không thay phần nào của đợt 3e: N, arm và bài của E4 giữ nguyên (R_E4 = 16, R_B6 = 32; khối (a) bước 5). Dữ liệu bước 2 không được dùng để đổi bất kỳ tham số nào của E1–E6. Bước 2 không lấy chỗ của E4 trong thứ tự ưu tiên khối (b), và chỉ chạy khi giám đốc duyệt riêng.
  - Kết quả không tự đổi mặc định: `stablePrefix` giữ **tắt** cho tới khi giám đốc duyệt sau khi có kết quả.
- **Nguồn:** `results/b14-diag/RUNLOG.md` (E1); `context/k4-e2-descriptive-b14-step2-n.md` §2 (σ, N, chọn bài); BL B-14 trường 4, 6, 7, 9; CD 1.4; `src/runtimes/claude-cli.ts:231-268`; `src/orchestrator.ts:3475-3476`; `bench/vs-claude/lib/stats.mjs:152-208`.

### Sai lệch vòng 4 gói 10 — thẩm định thống kê D11 (ghi 4/11/2026)

**Mọi dòng dưới ghi SAU khi đã thấy dữ liệu.** D11 chạy lại `analyze.mjs` mới trên `study-cloud` (D11 §2), rồi K2 đọc mã và chạy ca biên. Không dòng nào đổi giả thuyết, ngưỡng hay họ Holm (K = 0). Nguồn: `context/k2-stats-review-2026-11-04.md`, gồm §4–§7 (S2) và §10 (S3b). Mọi số của `analyze.mjs` trên `study-cloud` chạy với `--allow-mixed-judge` (SR-07), nên là **số đối chiếu**.

| # | Ngày | Mục | Đã đăng ký | Thực hiện | Lý do | Đã thấy dữ liệu? | Hệ quả |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V4-K2-1 | 4/11/2026 | H7, §3.1 (P:174, :187), P:407 | Trung vị tỉ số SD theo bài ≤ 0,7, r ≥ 5, ≥ 3 bài; phép đổi (SR-14) phải làm **trước khi chạy** và giữ phép cũ làm độ nhạy | `analyze.mjs` thay bằng tỉ số SD gộp theo phương sai gộp, bài có > 1 lượt, 0/0 := 1; chạy lại trên study-cloud sau khi dữ liệu đã có (D11 §2): 0,00 [0,00; 1,00], 13 bài | Sửa thiên lệch bỏ bài sd(A0) = 0 (P:187) | **Có** (study-cloud đã xem) | v2.1 **không có quy tắc suy biến cho sd gộp = 0** (P:107 chỉ cho H6). H7 báo **"không xác nhận"** (chưa đủ N theo đăng ký: 2 bài có r ≥ 5; hai cách đọc điểm ước lượng và cận trên không đồng ý). Trung vị cũ (1,00, 18 bài) giữ làm độ nhạy. Không SUPPORTED |
| V4-K2-2 | 4/11/2026 | H2 (P:169, :182) | Hai chiều: (i) `est ≤ 0,05`; (ii) cận trên CI 90 % ≤ +0,05; vẫn ước lượng | Nhãn của `analyze.mjs` chỉ theo (ii) (SR-04) | Thực hiện chiều (ii) đã đăng ký | Có | Không đổi quy tắc. H2 báo số: +2,8 pp, TOST90 [0,0; +8,3]; **"không kết luận"**, không "bác bỏ" |
| V4-K2-3 | 4/11/2026 | H6 (P:105, :108) | Tập khai báo 7 bài; min(n_A1, n_A2) < 3 ⇒ ước lượng | Chạy lại: n_A1 = n_A2 = 0 vì A1/A2 chưa chạy các bài khai báo | Tuân thủ (a), (d) | Có | Không sai lệch. Số "SUPPORTED" cũ đến từ bài ngoài tập khai báo, rút lại. Bảng 10: chưa đủ N |
| V4-K2-4 | 4/11/2026 | H3, H4, H9 (P:100, :158, :184, :189) | H3 trên 1 bài s1; H4, H9 trên 1 bài, mô tả | SR-11 thêm cổng ≥ 3 bài (`analyze.mjs:136, :192, :248`) | Quy tắc chung SR-11 | Có | Nhãn thành `insufficient data` thay cho "suy biến" (H3) hoặc "mô tả" (H4, H9). Bảng 10 theo nhãn đăng ký; không đổi kết luận |
| V4-K2-5 | 4/11/2026 | H8 (P:175, :407) | Thước đo `formatMiss` | SR-13 đổi sang `untouchedFileFailures`/`redAtEnd` | Cải tiến thước đo | Có | Dòng cũ thiếu trường ⇒ `insufficient data`; `formatMiss` giữ làm độ nhạy |
| V4-K2-6 | 4/11/2026 | H1, H10 (P:154-155, :181) | Danh sách bài cố định (H1: c3, c4, c5, r1); H1, H10 bỏ bài chạm trần pilot | `size` mới (SR-05) và lọc theo loại; không loại bài trần pilot | Định nghĩa lại `size` | Có | H1: 7 → 6 bài, +2,8 pp [0,0; +9,0]; chỉ **ước lượng/mô tả** (P:87-88), không nêu "xác nhận" |
| V4-K2-7 | 4/11/2026 | B-01 (P:80, PT:93-94) | Log-tỉ số theo bài; trần ≥ 0,99 và ≥ 3 bài cho (c) | `analyze.mjs` tính log của tỉ số hai trung bình qua bài; (c) không có trần | Lệch cài đặt | Có | **Số B-01 chính thức lấy từ `prereg-tests.mjs`**, không từ `analyze.mjs` |

**Duyệt H7 (research-lead, 4/11/2026).** Tôi chấp nhận phán quyết của methodologist. Tỉ số SD gộp 0,00 là **suy biến do trần**: sd gộp của B0 bằng 0, và 10/13 bài có sd(A0) = 0. Ngoài ra, cận trên 1,00 của CI đến từ quy ước 0/0 := 1, với 139/4000 mẫu bootstrap (3,48 %) rơi vào nhánh đó (S3b, V1). v2.1 không có quy tắc suy biến nào áp được cho H7, nên mọi quy tắc xử lý tình huống này là **sai lệch đặt ra sau khi thấy dữ liệu**. Vì vậy Bảng 10 ghi H7 là **"không xác nhận"** (chưa đủ N theo đăng ký) và chú thích hai cách đọc. Tuyệt đối không ghi SUPPORTED. Quy tắc cho H7 về sau (loại bài trần khỏi phương sai gộp; mẫu số bằng 0 thì không báo tỉ số; cận trên CI quyết định; r ≥ 5 và ≥ 3 bài) chỉ áp **từ lần đăng ký sau, không hồi tố** (K2 §4.2 điểm 5).

**Duyệt SR-04 / H2.** SR-04 không phải sai lệch về quy tắc. Nó chỉ thực hiện chiều (ii) đã đăng ký ở P:169 và P:182. Nhãn đúng là "không kết luận" (lo90 = 0,0, nên không phải "bác bỏ"), và H2 vẫn là ước lượng.

**Nguồn số chính thức (mỗi ô Bảng 10 một nguồn; K2 §7 và §10.3):**
- **Lấy từ `prereg-tests.mjs`** (chạy không cờ; đầu ra trùng từng dòng `study-cloud-final/prereg-tests-448.md`): H3 (§5, suy biến/mô tả), H5 (§3, cặp cùng cửa sổ), H7 (§5, chưa đủ N), B-01 B7 và Holm (K = 0).
- **Lấy từ `study-cloud-final/step4-extra-448.md`:** B-01 B6.
- **Lấy từ `study-cloud-final/final-extra.md`:** H4 (mô tả).
- **Lấy từ `analyze.mjs` (số đối chiếu):** H1 (ước lượng), H2 (ước lượng, "không kết luận"), H6 (chưa đủ N), H8, H9 (mô tả), H10 (thăm dò).
- **Không dùng** dòng SUPPORTED của B-01(c) trong `analyze.mjs`, vì nó thiếu quy tắc trần. `prereg-tests.mjs` cho "không kết luận" do cả 5 bài t1–t5 chạm trần.
- **Cờ `analyze.mjs` của bài báo v0.4 chỉ tìm được một phần:** `--baseline A0-sonnet --treatment X`, theo `study-cloud-final/README.md`. Hai cờ `--allow-mixed-judge` và `--b01-arm B7|B6` là cờ của lần chạy lại theo D11 hoặc là giả định, không phải cờ v0.4 (K2 §10.1).

**Lỗi mã `bench/` giao Phòng Phát triển** (chưa sửa ở gói này):
- **T-1:** `tost` cho `equivalent = true` trên phân phối suy biến. **Phải sửa trước lượt đầu của V4-3e-E6.**
- **B-1:** `bootP` với NaN cho p = 1/4001.
- **S-1:** H2′ cho p = 1/252 khi bài chạm trần mà có margin. **Không được khóa H2′ khi chưa sửa.**
- **T-2:** `tost` logratio dùng tỉ số hai trung bình.
- **A-3:** `analyze.mjs:246` đọc `citationPrecision`, trong khi grader ghi `citationValidity`.
- **P-2:** kích thước hoán vị.

### Phân tích độ nhạy mô tả cho H6: bài có sàn null cao (`t2-orders`, `t4-perf`) — đặt trước dữ liệu E6 (ghi 4/11/2026)

**Nhãn thời điểm:** đặt trước dữ liệu E6. Theo `bench/vs-claude/results/local-3e/RUNLOG.md` (mục "Nguồn p của H6", ghi khoảng 13:50 ngày 4/11) chưa có lượt E6 nào, và `results/h6-3e` chưa tồn tại ở nhánh này. Tác giả không xem điểm E3, E4, E6.

**Căn cứ:** `context/d11-suite-review-2026-11-04.md` §4: arm null đạt 0,53 ở `t2-orders` và 0,84 ở `t4-perf` (dải còn lại 0,47 và 0,16; oracle − nearmiss 0,02 và 0,05). Đánh giá đầy đủ ở `context/k3-open-points-2026-11-04.md` (a). Kết luận ngắn: sàn cao làm Δ trung bình và SE co lại, nên nghiêng về "tương đương giả", không về suy biến.

**Phần thêm (chỉ mô tả, báo cùng kết quả H6 ở V4-3e-E6):** (i) Δ và CI 90 % hoặc 95 % theo cùng mức H6 đang dùng, tính lại trên 5 bài, bỏ `t2-orders` và `t4-perf`; (ii) Δ_i từng bài kèm dải 1 − null; (iii) cờ "nhạy với bài" nếu Δ̂ đổi phía so với 0 hoặc CI đổi vị trí so với ±0,05. Không có p mới.

**Không đổi:** H1–H10, biên ±0,05, tập 7 bài, quy tắc trần và suy biến v2.1 (a)–(d), nguồn p (SR-26), họ Holm, phép kiểm chính, phán quyết chính của H6. Khối này không vào họ Holm. Không đổi bài hay tham số trong đợt 3e. Các đề xuất cho lần đo sau (test ẩn hạ sàn null, chuẩn hóa (score − null)/(oracle − null), tiêu chí nhận bài "null ≤ ngưỡng") ở tệp K3, chưa áp dụng.

### Đăng ký trước V4-3f: đo không gọi LLM cho trục nghiệm thu (G) và trục song song (P) (ghi 4/11/2026, commit `f5a31dc` lúc 19:31, trước khi tính bất kỳ kết quả nào; giờ ghi sửa lại theo commit)

**Lý do.** Giám đốc, 4/11 19:14: "Bằng chứng hiện tại (1/1, 2/2) chưa đủ để kết luận gì. Đề tài chưa có số đo nào, và chính dữ liệu chi phí của CCoding còn đi ngược lợi ích của chạy song song. fix 2 vấn đề này". Bản phản biện `wf-f01e23b8` cũng nêu: trục nghiệm thu cần tỉ lệ bắt lỗi và chặn nhầm trên ≥ 30 lỗi độc lập không do người thiết kế cổng viết; trục song song chưa có số đo nào.

**Vị thế.** Ghi trước khi chạy đột biến nào trên artifact và trước khi trích dữ liệu nào từ server 7420.
- **Dữ liệu tác giả đã thấy khi viết:**
  - điểm và `pass` từng lượt của `study-cloud`, đã phân tích từ vòng 3;
  - số lượt trượt test ẩn theo arm, đếm lúc 19:25 để biết lỗi tự nhiên quá ít (A0 code 1/70);
  - kết quả phát lại B-02 trên 54 lượt (`analysis/b02m-replay.md`);
  - chẩn đoán thời gian ở khối B bên dưới.
- **Chưa ai thấy:** kết quả chạy đột biến trên artifact, `npm test` chạy lại trên artifact, metadata song song của 7420.
- Không phép nào ở đây vào họ Holm. K của §2.5 không đổi. Không chạm đợt 3e: không gọi LLM, không dùng máy giám đốc cho G.
- **Mốc khóa:** commit chứa mục này cùng `analysis/g-mutation.mjs`, `g-analyze.mjs`, `p-extract.mjs`, `p-analyze.mjs` và test dữ liệu giả của chúng. Người chạy ghi hash commit và sha256 từng script vào RUNLOG (`results/g-mutation/RUNLOG.md`, `results/p-parallel/RUNLOG.md`) trước khi chạy.

**Khối G: cổng lệnh kiểm tra (B-02) trên lỗi cài bằng máy**
- **(1) Dữ liệu.**
  - Mọi dòng `status = done` của bài có `grader = code` trong `results/study-cloud/runs.jsonl` (sha256 `0dcee840…2cffb`), có thư mục artifact. Gồm mọi arm: A0-sonnet, A1, A2, B0, B5, B6, B7.
  - Artifact là toàn bộ repo cuối của lượt, gồm mã agent viết và test agent viết.
  - Thiếu artifact thì ghi `missing`, không thay thế.
- **(2) Cổng được đo.** Đúng lệnh B-02 chạy ở bench: `npm test` (`checkCommands` của `bench/vs-claude/lib/ccoding.mjs`), trên chính repo của lượt. **Đỏ** = mã thoát ≠ 0 hoặc quá 60 s. Đây là lớp kiểm tra xác định. Lớp CTO (LLM) không đo ở đây, xem E7.
- **(3) Sự thật.** Bộ test ẩn của bài, chạy với hạn 30 s mỗi tệp và 60 s cả bộ. **Lỗi thật** = test ẩn không đạt hết.
- **(4) Đột biến.**
  - **Toán tử cố định:** ROR (đổi `<`, `<=`, `>`, `>=` sang biên và chiều ngược); EQ (`===`↔`!==`, `==`↔`!=`); AOR (`+`↔`-`, `*`↔`/`, `%`→`*`); LCR (`&&`↔`||`); UOI (bỏ `!`); CRP (hằng số n → n+1, 0 → 1); COND (đảo điều kiện `if`, `while` và `?:`). Đây là bộ "đủ" của Offutt và cs. (1996) cộng hai toán tử phổ biến, chọn trước, không theo cổng.
  - **Tệp bị đột biến:** tệp `.js`, `.mjs`, `.cjs` thuộc `task.deliverable`, trừ tệp test.
  - **Lấy mẫu:** mỗi lượt tối đa **12** vị trí, không lặp, hạt giống `20261104|<key>`.
  - **Lượt đủ điều kiện:** base `npm test` xanh, base test ẩn đạt hết, base chạy ≤ 30 s.
  - **Loại trước:** bài `t4-perf`, vì bộ test công khai chạy khoảng 190 s mỗi lần (`GRADE_TEST_TIMEOUT_MS`). Bài này vẫn có ở G-1 và G-2.
  - Mỗi đột biến chạy trong bản sao riêng của lượt. Song song 2 tiến trình.
- **(5) Thước đo** (G-1, G-2 mức lượt; G-3, G-4 mức đột biến):
  - **G-1, chặn nhầm:** trong các lượt base test ẩn đạt hết, tỉ lệ lượt có `npm test` đỏ.
  - **G-2, báo xong khi lệnh còn đỏ:** trong mọi lượt có `package.json`, tỉ lệ có `npm test` đỏ ở trạng thái cuối. Với A0, A1, A2 (không có cổng) đây là phần việc cổng sẽ chặn. Với CCoding, đây là phần lọt qua cổng.
  - **G-3, recall của cổng:** số lỗi thật bị `npm test` chặn chia cho số lỗi thật. Báo gộp, theo arm, và theo nhóm A = {A0-sonnet} và C = {B0, B5, B6, B7}. A1 và A2 chỉ báo theo arm.
  - **G-4, kho lỗi lọt cổng:** danh sách lỗi thật mà `npm test` không chặn, đông cứng bằng sha256, làm đầu vào cho E7.
  - **Phụ:** recall theo bài và theo toán tử; số đột biến không phải lỗi thật (tương đương hoặc test ẩn không phủ); số lần quá hạn.
- **(6) Thống kê.**
  - **CI cho G-1, G-2:** Clopper–Pearson 95 % hai phía.
  - **CI cho G-3:** bootstrap hai tầng (lấy lại bài, rồi lấy lại lượt trong bài), 4000 vòng, hạt giống 20261104, phân vị 2,5 % và 97,5 %.
  - **Phép kiểm duy nhất, G-3Δ:** Δ = trung bình theo bài của (recall C − recall A), chỉ trên bài có lỗi thật ở cả hai nhóm. p hai phía bằng hoán vị nhãn arm giữa các lượt trong cùng bài, M = 10000. CI của Δ bằng bootstrap hai tầng như trên.
  - Câu hỏi của G-3Δ: quy trình CCoding có để lại bộ test bắt được nhiều lỗi hơn Claude Code đơn không?
- **(7) Cách đọc, ghi trước.**
  - G-3 đo **độ mạnh của bộ test mà cổng chạy**, không đo CTO.
  - Đột biến không phải lỗi tự nhiên. Tài liệu cho thấy điểm đột biến tương quan với khả năng bắt lỗi thật (Just và cs., 2014), nhưng không đồng nhất.
  - Đơn vị độc lập thực sự là **bài** (9 bài), nên CI lấy lại theo bài.
  - G-1 dùng nhãn đúng/sai của test ẩn, nên "chặn nhầm" là chặn một sản phẩm mà test ẩn coi là đúng.
  - Không dùng G để chọn arm hay sửa cổng trong đợt 3e.

**Khối P: song song trong vận hành thật (server 7420)**
- **(1) Dữ liệu.**
  - Mọi nhiệm vụ trả về bởi `GET /api/tasks` và `GET /api/tasks/<id>` của server chính, tại thời điểm trích. Chỉ dùng API đọc; không đọc `data/` trực tiếp.
  - **Chỉ lấy metadata:** thời điểm bắt đầu và kết thúc của hạng mục, `dependsOn`, trạng thái, cờ `conflict`, `mainOnly`, `mergePending`, `isolation` của dự án, số lệnh kiểm tra đỏ lúc cuối.
  - Từ bản ghi tin nhắn hệ thống, chỉ đếm số dòng khớp ba mẫu cố định trong `p-extract.mjs`: gộp xong, xung đột khi gộp, làm lần lượt.
  - Không lấy đề bài, tiêu đề, đầu ra hay nội dung tin nhắn.
  - Mã nhiệm vụ băm kèm muối ngẫu nhiên không lưu; mã dự án đổi thành P1, P2…
- **(2) Đơn vị.** Một lượt phòng có ≥ 2 hạng mục có đủ hai mốc thời gian.
- **(3) Thước đo, chỉ mô tả.**
  - **P-1:** hệ số chồng = Σ thời lượng hạng mục / thời gian hợp các khoảng. Báo số lượt có ≥ 2 hạng mục chạy cùng lúc.
  - **P-2:** thời gian tiết kiệm = Σ − hợp, theo phút và theo tỉ lệ. Đây là **cận trên**, vì khi chạy chồng mỗi hạng mục có thể chậm hơn khi chạy một mình.
  - **P-3:** số lần gộp worktree con xong, số tin xung đột khi gộp, số hạng mục phải làm lại lần lượt, số nhiệm vụ kết thúc còn lệnh kiểm tra đỏ.
  - Báo tách theo `isolation`.
- **(4) Cách đọc.** Đây là dữ liệu quan sát, không ngẫu nhiên hóa. P chỉ cho biết song song **có xảy ra** và **lợi ích thời gian cận trên** trong vận hành thật; không so với chạy đơn.
- **Phân loại dữ liệu:** Nội bộ. Không có dữ liệu cá nhân. Nhãn dự án không đảo ngược được.

**Khối B: chẩn đoán đã thấy trước khi ghi (khám phá, không phải đăng ký trước)**
- Lúc 19:20, người điều phối đọc `byPhaseSec` (tổng `calls.durationMs` theo pha) và `wallSec` của **42** lượt CCoding có trường này: `large-pilot` 4, `gates-pilot` 28, `b7prime` 10, gồm cả hai làn. (Sửa 4/11 lúc 20:55 theo phản biện độc lập: bản đầu ghi nhầm 44. Chỉ 18/42 lượt có từ 2 lượt gọi thực thi trở lên. 24 lượt làn đơn không thể chồng theo thiết kế. Ngoài ra `wallSec` của CCoding bị làm tròn lên theo chu kỳ hỏi 10 s, nên chồng ngắn dưới khoảng 10 s có thể không thấy.)
- Kết quả: Σ thời lượng lượt gọi / thời gian thực nằm trong 0,75–0,99. Ở 18 lượt có thể chồng, không thấy chồng đáng kể, kể cả `l1-modules` (5 hạng mục độc lập, 5 lượt gọi thực thi, Σ 374 s so với thực 380 s).
- **Nguyên nhân (đọc mã):** harness `bench/vs-claude/lib/ccoding.mjs` tạo dự án với `isolation: 'none'` từ commit đầu `1568774`. Khi đó `parallelWorktrees()` trả false (`src/orchestrator.ts`), nên mọi hạng mục chạy lệnh là độc quyền và **làm lần lượt**.
- **Hệ quả:** mọi so sánh chi phí và thời gian của làn nhanh hay đủ phòng trong bench đo **chi phí chia việc mà không có lợi ích song song**. Cấu hình này khác cấu hình vận hành (mặc định `worktree`). Đây là đe dọa tính hợp lệ, phải ghi ở §6 và trong bài báo.
- Không đổi kết quả đã báo. Đo lại ở E8.

**Dự kiến, chưa duyệt, chưa chạy (cần LLM, chạy sau đợt 3e nếu giám đốc duyệt)**
- **E7: CTO nghiệm thu trên lỗi lọt cổng.**
  - **Mẫu:**
    - 60 lỗi thật lấy từ G-4 (≤ 8 mỗi bài, ≥ 6 bài, tối đa 1 mỗi lượt), phân tầng theo bài, hạt giống 20261104;
    - 60 sản phẩm đúng (test ẩn đạt, `npm test` xanh) cùng các bài.
  - **Arm, mỗi mục chấm bởi mọi arm (ghép cặp):**
    - R1: pha `accept` của CCoding (Sonnet, như hiện nay);
    - R2: như R1 nhưng dùng Opus;
    - R3: một Claude Code đơn (Sonnet) được hỏi "duyệt hay từ chối sản phẩm này so với đề bài", cùng đầu vào.
  - **Đầu vào:** đề bài, diff so với starter, đầu ra `npm test` (xanh). Không có nhãn.
  - **Thước đo:** recall trên 60 lỗi, chặn nhầm trên 60 bài đúng. CI Clopper–Pearson, kèm bootstrap theo bài.
  - **Phép kiểm chính:** McNemar hai phía, R1 so với R3, trên 60 lỗi.
  - **Cỡ mẫu:** 60 lỗi cho nửa độ rộng CI ≤ khoảng 13 điểm %. Nếu 0/60 chặn nhầm thì cận trên 6 %.
  - **Ước tính:** khoảng 360 lượt gọi, khoảng 11 M token có trọng số.
  - **Cần Phòng Dev dựng trước:** harness phát lại pha `accept` qua `Orchestrator.call()`.
- **E8: song song có worktree.**
  - **Arm:** cùng commit, cùng harness, `isolation: worktree`, làn nhanh ép:
    - B6w4: `fastLane.maxParallel` 4;
    - B6w1: `fastLane.maxParallel` 1, trên server riêng vì khóa này nâng `options.maxParallel` lên;
    - A0-sonnet làm mốc.
  - **Bài:** `l1-modules`, `t2-orders`, `t3-api`.
  - **Số lượt:** 6 lượt mỗi arm mỗi bài, tổng 54 lượt.
  - **Thước đo chính:** tỉ số thời gian thực B6w4/B6w1, trên thang ln, hoán vị phân tầng theo bài, hai phía.
  - **Thước đo phụ:** tỉ số token có trọng số; xung đột và lệnh đỏ sau gộp; điểm test ẩn, chỉ mô tả.
  - **Cỡ mẫu:** giả định σ_ln = 0,25, giảm 30 %, 6 lượt mỗi ô. SE ≈ 0,083 trên 3 bài, power > 0,9.
  - **Cần Phòng Dev làm trước:** tùy chọn `isolation` của harness (xem D14).

**Sai lệch ghi ở BRIEF-19 K1 (13/11/2026, @methodologist, hạng mục S5; chỉ ghi, không sửa chữ đăng ký ở trên; giờ chính thức là giờ của commit chứa mục này).** Căn cứ: chạy lại ở `analysis/v43f-rerun.md`. Hai mã commit bằng chứng thứ tự cho phần sửa script: **`9c6e0de`** (00:08:51, trước khi sửa: số "trước" và bảng lệch) và **`5c48f44`** (00:12:27, sửa script và test, số "sau"). Số dòng là của commit gốc `d1e8573`. Chi tiết đánh giá ở `context/v43f-review-2026-11-12.md`, mục K1.
- **Đã sửa ở `5c48f44` (có số đổi):**
  - **D-G1** (`g-analyze.mjs:48-74`, đăng ký G (6) "bootstrap hai tầng"): bootstrap Δ làm mất bội số của bài bị rút nhiều lần (nhóm lại theo tên bài sau khi rút). Lý do sửa: sai so với "lấy lại bài", CI quá hẹp. Số đổi: **CI 95 % của G-3Δ [−4,7; +7,4] → [−5,4; +8,8]**. Δ = +0,8 đ.% và p hoán vị 0,7408 không đổi; CI vẫn chứa 0, kết luận "không phân biệt được" không đổi. Số [−4,7; +7,4] đã báo ở `g-mutation/RUNLOG.md` và `report.md` giữ nguyên làm số gốc, không sửa; mọi chỗ dẫn lại từ nay dùng [−5,4; +8,8] hoặc ghi cả hai.
  - **D-G2** (`g-analyze.mjs:7`): bỏ import kéo theo `typescript`, chép hàm `rng` cùng thuật toán, có test trùng dãy. Không đổi số.
  - **D-P1** (`p-analyze.mjs:67-68`, đăng ký P (3) "số nhiệm vụ kết thúc còn lệnh kiểm tra đỏ"): năm đếm (`endRed`, `endChecked`, `endNewRed`, `baselineRed`, `endDeniedOnly`) đếm theo lượt phòng chứ không theo nhiệm vụ. Đã sửa đếm theo nhiệm vụ. **Số thật chưa tính lại được** (xem dưới); chiều đổi tối đa −1 đơn vị so với RUNLOG (54 lượt, 53 nhiệm vụ).
  - **D-P2** (`p-analyze.mjs:73-84`): thêm vào báo cáo CP 95 % cho P-1 và P-3, tách theo phòng, so với đường găng. Các số này có ở `p-parallel/RUNLOG.md` nhưng **không có trong §9** và script cũ không in; nay có trong script, nhãn "ngoài đăng ký, mô tả". Không đổi số đã báo.
- **Không sửa (đã đọc, nêu để độc giả biết):**
  - **D-G3:** phân vị bootstrap làm tròn ra ngoài (`floor`/`ceil` trên 4000), lệch ≤ 1 hạng; không đổi kết luận.
  - **D-G5:** 25 đột biến quá hạn `npm test` tính là "đỏ" đúng G (2). Độ nhạy: coi quá hạn là không chặn thì G-3 = 1 878/2 097 = 89,6 % (so với 90,7 %).
  - **D-G6:** 6 lượt đủ điều kiện (`t1-duration__B6__r1,2,3,5,6,7`) có 0 vị trí đột biến, nên 209 lượt đủ điều kiện nhưng 203 lượt vào G-3; `t1-duration` vắng ở nhánh B6 của G-3.
  - **D-P3 (P-a):** thêm quy tắc mà RUNLOG chưa nói: `checksNewRed` và `checksBaseline.red` **loại lệnh bị chặn theo chính sách (`denied`)**, còn lệnh đỏ ở trạng thái cuối thì tính cả `denied`.
- **Thứ tự thời gian của G-a (không kiểm chứng được bằng git).** RUNLOG ghi G-a "ghi 4/11 lúc 19:39, trước khi tính G-1/G-2". Git: mốc khóa `f5a31dc` 19:31:56; RUNLOG trước khi chạy `4d62256` 19:32:06 không có chữ "G-a"; chữ này xuất hiện lần đầu ở `5ca04f4` 20:23:15, **cùng commit với kết quả**. Không có commit nào trong 19:32–20:23. Bằng chứng duy nhất cho "trước khi tính G-1/G-2" là lời của RUNLOG. Tác động bằng 0: 0 lượt base quá hạn 60 s, `g-rebase.jsonl` rỗng, nên G-1/G-2 giống hệt có hay không có G-a. Bản `g-analyze.mjs` khóa (`44c28b8f…`) chưa có `--rebase`; bản lúc báo là `f0fdb520…`; `g-mutation.mjs` cũng đổi ở G-b. Các thay đổi này đã ghi ở RUNLOG, nhưng chỉ bằng mốc giờ tự khai.
- **P-a đã đổi thước đo ngoài phần lệnh đỏ chưa?** Không. `git diff f5a31dc d1e8573 -- p-extract.mjs` chỉ thêm ba trường (`checksBaseline`, `checksNewRed`, `checksDenied`), 4 dòng; P-1, P-2, mốc thời gian, đếm gộp/xung đột không đổi. Nhưng P-a được thêm **sau khi thấy** "11/47" (lần trích 19:32, trích lại 19:34), nên "đỏ mới 2/47" là chỉ số lập sau kết quả. Phần "Chưa ai thấy" của mục V4-3f đúng đến 19:32 với P-3 lệnh đỏ, không đúng sau đó.
- **P không tái lập được ở đây.** `prod-parallel.json` nằm trên máy giám đốc (không commit), nên 42/54, 1,32, 375 phút (27,5 %), 6/213, 11/47, 2/47 chỉ kiểm gián tiếp (băm script, CP từ đếm, test dữ liệu giả). Cần người có quyền chạy `node docs/research/analysis/p-analyze.mjs <tệp> --json` với script sau sửa. Tiêu chí "số in ra khớp RUNLOG" **chưa đạt với P**.

### Phân tích E4, E5′, E6 và các quyết định lúc phân tích (ghi 12/11/2026, người điều phối được giám đốc giao quyền tự duyệt)

**Vị thế.** Ba đợt đã đủ dữ liệu: E4 192/192 lượt, E6 56/56, E5′ 40/40. Phân tích chạy bằng script, không gọi LLM:
- E4: `analysis/e4-analyze.mjs`, kết quả ở `results/gates-main/report-e4.md`;
- E5′: `analysis/e5f-analyze.mjs`, kết quả ở `results/b15f-main/report.md`;
- E6: `bench/vs-claude/analyze.mjs` (blob `7c69f438…`, đúng bản ghi trước lượt E6 đầu tiên ở `local-3e/RUNLOG.md`) và `analysis/h6-sensitivity.mjs`, kết quả ở `results/h6-3e/report.md` và `report-h6-sensitivity.md`.
- Test: `analysis/e-analyses.test.mjs`.

Phòng Nghiên cứu thẩm định lại ở BRIEF-19 K1: chạy lại và đối chiếu số.

**Quyết định lúc phân tích, không đổi phép kiểm nào:**
- **(A1) E4, nguồn lượt sạch.** (3) của E4 kể "E5 (B0, B1: tối đa 40)", nhưng E5 không chạy mà được thay bằng E5′. Phân tích dùng 40 lượt B0F/B1F của E5′ thay cho E5: cùng định nghĩa "lượt CCoding có bản ghi cổng trên bài không thuộc g1–g6", tổng vẫn 65 = mức tối đa đã ghi.
  - Khác biệt cần ghi: E5′ ép làn đầy đủ, nên dùng pha accept `full`.
- **(A2) E4, phần ngoài đăng ký.** Bảng "chặn trên lượt có test ẩn đạt" của B7cab so với B7cabO, tính trên g1, g2, g5, g6, là **khám phá**: không có trong (5)/(6), không vào kết luận chính, có ghi nhãn trong báo cáo.
- **(A3) E5′, số hạng mục kế hoạch.** Dòng `runs.jsonl` không có trường này. Số lấy từ `task.json` trong thư mục data của server 7426 (`ccoding-e5f\data\runs`), khớp theo nhãn `[vs-claude <khóa>]` của tiêu đề. Kết quả ở `results/b15f-main/subtasks.json`, có đủ 40/40 khóa.
- **(A4) E6, cờ "nhạy với bài".** Quy tắc (iii) bật cờ vì Δ̂ đổi phía so với 0, nhưng độ lớn dưới 0,1 điểm %:
  - A1: +0,0 pp ở 7 bài, −0,0 pp ở 5 bài;
  - A2: +0,1 pp ở 7 bài, 0,0 ở 5 bài.
  - CI ở cả hai cách tính đều nằm trong ±5 pp. Báo đúng cờ, kèm độ lớn.
- **(A5) E5′, không có lượt nào chạm quy tắc loại (8).** Mọi B0F đều có `discuss` và `finalize`, nên phân tích chính và phân tích độ nhạy cho cùng số.

**Sai lệch ghi ở BRIEF-19 K1 (13/11/2026, @methodologist, hạng mục S5; chỉ ghi; giờ chính thức là giờ của commit chứa mục này).** Chạy lại E4, E5′, E6 từ tệp đã commit (`analysis/v43f-rerun.md` mục 2.3–2.5): **mọi số in ra giống hệt báo cáo đã commit, lệch 0**. **Không sửa dòng nào** của `e4-analyze.mjs`, `e5f-analyze.mjs`, `h6-sensitivity.mjs` ở `5c48f44`; `9c6e0de` là số "trước", `5c48f44` là số "sau", hai commit cho các script này giống hệt. Chỗ lệch chữ đăng ký, không đổi số:
- **D-E4-1:** E4 (6) nói CI bootstrap cụm kèm CP; script chỉ tính Clopper–Pearson cho q̂ (64 lượt/cổng), không bootstrap cụm. Với q̂ = 0/64 bootstrap suy biến ([0; 0]), CP rộng hơn nên bảo thủ hơn. Không có recall (0 < 10 dương), nên không phép nào cần bootstrap.
- **D-E4-2:** E4 (7) "có hại" **không đánh giá được** vì không có lượt sạch của B7cab/B7cabO. Ở bảng khám phá (A2), B7cabO chặn **ít hơn** B7cab (1/64 so với 23/64), tức dấu "có lợi" chứ không "có hại".
- **D-E5-1:** CI 90 % của E5′ lấy phân vị chỉ số 200 và 3800 trên 4000 (5,00 % và 95,03 %), lệch 1 hạng (A-6 đã biết); giữ.
- **D-E5-2:** dòng `excluded` trong `done` bị bỏ không đếm vào báo cáo ở E5′; ở dữ liệu này `excluded` = 0.
- **D-E6-1:** độ nhạy H6 dùng `rng` của `prereg-tests.mjs` và bootstrap 90 %, còn `analyze.mjs` dùng `mulberry32` của `lib/stats.mjs` và nội suy phân vị 95 %; cùng hạt, khác dãy. Hai CI không so từng chữ số được; §9 cho phép "90 % hoặc 95 %". Kết luận (cả hai trong ±5 pp) không đổi.
- **Không kiểm được:** nguồn `subtasks.json` (A3) là `ccoding-e5f\data\runs` ngoài repo; chỉ kiểm được 40/40 khóa có số, không kiểm được số.
- **Thay thế lượt (E4 (8) "tối đa 2 mỗi ô"):** 11 dòng không `done` đều thuộc cùng khóa và được chạy lại đúng khóa, mỗi khóa đúng một dòng `done`; không có lượt thay khóa nên không chạm trần.

### Bản chốt E7 và E8 (ghi 5/11/2026, trước mọi lượt gọi LLM của E7 và E8)

**Vị thế.** Giám đốc duyệt chạy cả E7 và E8 lúc khoảng 10:05 ngày 5/11 ("Duyệt cả hai"), chạy sau bước 2 của B-14, E7 trước. Mục này chốt các điểm còn để ngỏ ở bản dự kiến bên trên; chỗ nào khác bản dự kiến thì ghi rõ "đổi so với bản dự kiến".
- Ghi trước khi có kết luận nào của CTO hay của Claude Code đơn trên mục E7, và trước khi chạy lượt E8 nào.
- **Dữ liệu tác giả đã thấy khi viết:**
  - kho G-4 và các dòng `base` của `g-mutation.jsonl`;
  - kết quả lấy mẫu (`results/e7-cto/items.json`);
  - một lần chạy thử bước chuẩn bị trên máy cloud, không gọi LLM: 128 mục chuẩn bị được; 2 mục lỗi của `t5-logq` không tái lập được nhãn (test ẩn đạt ở cả 3 lần chạy lại), nên 1 mục đúng của bài đó bị bớt để giữ ghép cặp;
  - `wallSec` của `gates-pilot` và `b7prime` để ước σ_ln.
- **Mốc khóa:** commit chứa mục này cùng:
  - `bench/vs-claude/e7/` (`sample.mjs`, `lib.mjs`, `run.mjs`, `analyze.mjs`, `README.md` là sổ tay chạy);
  - `bench/vs-claude/e8/analyze.mjs`;
  - `results/e7-cto/items.json`;
  - arm B6w4/B6w1 trong `arms.json`, `taskTimes` trong `lib/ccoding.mjs`;
  - test của chúng (`test/e7.test.mjs`, `test/e8-arms.test.mjs`). Người chạy ghi hash commit và sha256 từng tệp vào `results/e7-cto/RUNLOG.md` và `results/e8-parallel/RUNLOG.md` trước khi chạy.
- Không phép nào ở đây vào họ Holm. K của §2.5 không đổi.

**E7: CTO nghiệm thu trên lỗi lọt cổng**
- **(1) Mẫu (đổi so với bản dự kiến: trần 10 thay cho 8).**
  - Với trần 8 mỗi bài và tối đa 1 lỗi mỗi lượt, kho G-4 chỉ cho 53 lỗi, dưới mức 60 đã định. Nâng trần lên 10 mỗi bài: được 65 lỗi ở 8 bài.
  - **Mục lỗi:** mỗi bài lấy tối đa 10 lượt có lỗi lọt cổng, theo thứ tự xáo của `rng("20261104|e7|faulty|<bài>")`. Trong mỗi lượt lấy 1 lỗi, theo `rng("20261104|e7|pick|<khóa lượt>")`. Các lượt còn lại của bài xếp sau làm dự phòng.
  - **Mục đúng:** cùng bài, cùng số lượng với mục lỗi. Ứng viên là lượt có test ẩn đạt hết và `npm test` xanh ở dòng `base` của G. Ưu tiên lượt chưa có mục lỗi nào được chọn. Thứ tự theo `rng("20261104|e7|clean|<bài>")`; phần còn lại làm dự phòng.
  - Mã mục là 10 ký tự hex, băm từ hạt giống, loại mục, khóa lượt và vị trí. Mã không cho biết loại mục.
- **(2) Chuẩn bị và kiểm lại nhãn trên máy chạy, trước mọi lượt gọi LLM** (`run.mjs`, bước 1; ghi `prep.jsonl` và `selected.json`).
  - **Sản phẩm:** artifact của lượt, cộng tệp starter mà artifact không có (như sai lệch G-b).
  - **Mục lỗi:** tìm lại đúng vị trí đột biến của G bằng cùng danh sách vị trí, cùng `sample(…, 12, rng("20261104|<khóa>"))` và phần tử thứ `i`. Không khớp thì loại mục với lý do `site-not-found`.
  - **Điều kiện giữ mục:** `npm test` phải xanh (`prep-red` nếu không). Test ẩn phải trượt ít nhất 1 trong 3 lần chạy với mục lỗi, và đạt với mục đúng (`label-mismatch` nếu không).
    - Có 3 lần chạy cho mục lỗi vì bộ test ẩn của `t5-logq` cho số test khác nhau giữa các lần chạy.
  - **Thay mục:** mục bị loại được thay bằng mục dự phòng kế tiếp cùng bài và cùng loại. Sau đó số mục đúng mỗi bài cắt bằng số mục lỗi chốt được của bài đó.
  - Danh sách chốt (`selected.json`) ghi trước lượt gọi đầu tiên và không đổi sau đó.
- **(3) Arm (mọi arm chấm mọi mục, ghép cặp):**
  - **R1:** pha `accept` thật của CCoding, model mặc định của CTO (Sonnet), qua `Orchestrator.call()`. Cách làm:
    - dựng một nhiệm vụ đã xong thực thi ở làn nhanh, cổng B-02 xanh nên reviewer được bỏ qua, như vận hành thật;
    - bàn giao trung tính, giống hệt nhau cho mọi mục;
    - báo cáo dựng bằng `templateReport`;
    - `projectChecks` lấy từ `npm test` thật trên starter (baseline) và trên sản phẩm (sau thực thi);
    - có nhánh nhiệm vụ như chế độ worktree, nên CTO nhận `diff --stat` so với starter cùng công cụ chỉ đọc (Read, Glob, Grep, git chỉ đọc), trần 6 lượt;
    - rồi gọi `resume(id, { from: 'accept' })`. Chế độ nghiệm thu là `full`.
  - **R2:** như R1, `phaseModels.accept = "opus"`.
  - **R3:** `claude -p` đơn (Sonnet), chạy trong bản sao repo của mục, ở cùng trạng thái git như R1 sau bước commit. **Đổi so với bản dự kiến** (cách hiểu "cùng đầu vào", vì bản dự kiến không định nghĩa):
    - R3 nhận đúng văn bản bối cảnh và công việc mà R1 nhận, chỉ bỏ phần "VAI TRÒ CỦA BẠN" (hồ sơ CTO). Vì vậy R1 và R3 chỉ khác ở hồ sơ CTO và lớp vận hành của CCoding;
    - công cụ tương ứng: Read, Glob, Grep, Bash chỉ cho `git log/show/diff/status/blame`; cùng trần 6 lượt.
- **(4) Kết luận.** "Chặn" nghĩa là khối JSON đọc được, với `accepted = false`, đúng luật của CCoding. Không đọc được kết luận thì tính là không chặn, như CCoding vẫn giao kết quả trong trường hợp đó. Số lượt như vậy báo riêng.
- **(5) Thước đo.**
  - **Recall:** tỉ lệ mục lỗi bị chặn.
  - **Chặn nhầm:** tỉ lệ mục đúng bị chặn.
  - CI Clopper–Pearson 95 %, kèm bootstrap hai tầng theo bài (4000 vòng, hạt giống 20261104).
  - Báo thêm token có trọng số, USD theo `pricing.mjs` và thời gian.
- **(6) Phép kiểm chính:** McNemar chính xác hai phía, R1 so với R3, trên mục lỗi có kết quả ở cả hai arm. α = 0,05.
  - **Phụ, chỉ mô tả:** R1 so với R2, R2 so với R3 trên mục lỗi; R1 so với R3 và R1 so với R2 trên mục đúng.
  - **Độ nhạy:** tính lại khi coi "không đọc được kết luận" là chặn.
- **(7) Lịch chạy.**
  - Thứ tự mục xáo theo `rng("20261104|e7|order")`. Thứ tự arm trong mỗi mục theo bảng Latin cân bằng của 3 arm.
  - Lỗi hạ tầng thì chạy lại. Hết hạn mức thì dừng rồi chạy tiếp đúng lệnh.
  - Runner không in kết luận khi đang chạy, chỉ in đếm. Không ai xem `runs.jsonl` hay `responses/` trước khi đủ.
  - Trước đợt chính, chạy thử 1 mục dự phòng không thuộc danh sách chốt (R1 và R3) vào thư mục riêng, để kiểm hạ tầng và `promptSha` R1 = R3. Lượt này không vào phân tích.
- **(8) Quy tắc dừng.** Chỉ dừng vì hạ tầng hoặc hạn mức. Không dừng sớm vì kết quả. Một cặp (mục, arm) lỗi hạ tầng 3 lần thì ghi thiếu, và chỉ loại cặp đó khỏi phép ghép.
- **(9) Cách đọc, ghi trước.**
  - E7 đo lớp CTO **trên lỗi mà `npm test` đã bỏ lọt**, không đo cả cổng.
  - Lỗi là đột biến, không phải lỗi tự nhiên.
  - Bàn giao và báo cáo trung tính, nên CTO thiếu phần bàn giao chi tiết mà agent thật viết. Kết quả có thể khác khi có bàn giao thật, theo cả hai chiều.
  - Đơn vị độc lập vẫn là bài (8 bài), nên báo kèm bootstrap theo bài.
- **Cỡ mẫu:** 64–65 mục lỗi cho nửa độ rộng CI ≤ khoảng 12,5 điểm %. Nếu 0/64 mục đúng bị chặn thì cận trên là 5,6 %. Ước khoảng 390 lượt gọi.

**E8: song song có worktree**
- **Arm** (cùng commit, cùng harness):
  - **B6w4:** `isolation: worktree`, làn nhanh ép, server A với cấu hình mặc định (`fastLane.maxParallel` 4);
  - **B6w1:** như B6w4, thêm `options.maxParallel = 1`, chạy trên server B. Server B cùng bản checkout, chỉ khác cấu hình thêm `{"fastLane": {"maxParallel": 1}}` (ghi sha256 hai cấu hình vào RUNLOG);
  - **A0-sonnet:** làm mốc.
  - Harness chọn server B bằng `server: "alt"` của arm, kèm `--ccoding-url-alt` và `--ccoding-data-alt`.
- **Bài:** `l1-modules`, `t2-orders`, `t3-api`. **Số lượt:** 6 mỗi arm mỗi bài, 54 lượt. Lịch Latin của `run.mjs`.
- **σ_ln (BRIEF-19 K3):**
  - σ_ln gộp trong ô của `gates-pilot` và `b7prime` là 0,178, df 24. Cận trên 95 % theo χ² là 0,248.
  - Ước này lệch xuống vì `wallSec` làm tròn theo vòng hỏi 10 s: nhiều ô có σ = 0.
  - Giữ giả định 0,25 và 6 lượt mỗi ô. Khi đó SE của Δ ln trung bình 3 bài ≈ 0,083, power với giảm 30 % > 0,9. Nếu σ thật là 0,4 thì power ≈ 0,77.
- **Thước đo chính (đổi so với bản dự kiến: dùng mốc thời gian của nhiệm vụ):**
  - Δ = trung bình theo bài của (trung bình ln `wallSecTask` của B6w4 − của B6w1). `wallSecTask` = `finishedAt − startedAt` của nhiệm vụ (D14 K4), không bị làm tròn như `wallSec`.
  - Báo exp(Δ) kèm CI 95 % bootstrap trong bài, 4000 vòng.
  - p hai phía bằng hoán vị nhãn arm trong bài, M = 10000, hạt giống 20261104.
- **Thước đo phụ, chỉ mô tả:**
  - cùng phép tính trên `wallSec` của harness (độ nhạy);
  - tỉ số token có trọng số;
  - số lượt có ≥ 2 hạng mục chạy cùng lúc, đọc từ mốc hạng mục;
  - xung đột khi gộp, lệnh kiểm tra đỏ sau gộp;
  - điểm test ẩn, kèm A0-sonnet làm mốc.
- **Quy tắc loại:**
  - lượt `infra` chạy lại;
  - lượt có hạng mục chạy chồng ở B6w1 (`maxConc ≥ 2`) là lỗi cấu hình: dừng đợt và báo giám đốc, không loại lặng lẽ.
- **Cách đọc, ghi trước.** E8 đo lợi ích thời gian của chạy song song khi chia việc ở làn nhanh, **trên cùng chi phí chia việc**. Không trả lời câu hỏi làn nhanh có rẻ hơn làm một mình hay không. Câu đó so với A0-sonnet, chỉ mô tả.

### Thẩm định bản chốt E7/E8 — sai lệch (nếu có) (ghi 13/11/2026, @methodologist, BRIEF-19 K3; chỉ ghi, không sửa bản chốt)

- **Thứ tự thời gian.** Bản chốt khóa ở commit `cd90988`, 5/11/2026 10:56:52. Sổ `results/e7-cto/RUNLOG.md` tại commit `d1e8573` (12/11/2026 23:55:49) chưa có lượt gọi LLM nào; kịch bản `e78-run.ps1` khởi động 23:08 ngày 12/11 và chờ B-14. Không đọc `runs.jsonl` hay `e8-parallel/`, nên không xác nhận được giờ lượt gọi đầu tiên.
- **Sai lệch do lỗi thiết kế: không có.** 12 điểm thẩm định: 5 đạt, 7 đạt có điều kiện, 0 lỗi thiết kế (chi tiết ở `docs/research/context/v43f-review-2026-11-12.md`, mục K3). Bản chốt không bị sửa.
- **Điều kiện khi phân tích và đọc kết quả (khai trước, không đổi thiết kế):**
  1. E7: báo bảng theo bài, và bootstrap theo bài đọc cùng p của McNemar; hai bên khác chiều thì ghi "chưa kết luận". Nếu số cặp bất đồng < 10 thì p chỉ mô tả.
  2. E7: ghi số lần trượt (1/3, 2/3, 3/3) của từng mục lỗi; báo recall của `t5-logq` tách riêng và bản bỏ `t5-logq` làm độ nhạy.
  3. E7: R1 − R3 là hiệu của hồ sơ CTO cộng lớp vận hành CCoding; viết đúng như vậy. Nếu số lượt `unparsed` lệch giữa các arm thì tách nguyên nhân trước khi đọc recall.
  4. E8: nói rõ σ_ln = 0,178 lấy từ arm một agent, ngoại suy sang B6w1/B6w4 là giả định; "lệch xuống" do nhiều ô σ = 0 (lượng tử hóa), không phải do làm tròn.
  5. E8: báo số lượt B6w4 có `maxConc ≥ 2` và số lượt (cả hai arm) chia dưới 2 hạng mục, như điều kiện đọc Δ.
  6. E8: server A và B lẫn với arm; ghi `git rev-parse HEAD`, sha256 `dist` của hai server, và nêu giới hạn này; chỉ suy ra cho 3 bài.
  7. [CẦN KIỂM, người điều phối] luật "dừng đợt khi B6w1 có `maxConc ≥ 2`" được `e78-run.ps1` thực thi tự động; tôi không được mở tệp đó.
- **Ghi chú RUNLOG (không sửa):** câu "dự phòng cũng không đạt" của `t5-logq` ở RUNLOG e7-cto không khớp với 128 mục (64+64) và "9 mục lỗi"; đối chiếu với `selected.json` thật khi chạy.

### Sai lệch thực thi E7/E8 trước lượt gọi đầu tiên của mẫu (ghi 13/11/2026, người điều phối)

- **Bản ghim đổi hai lần** (`d70959c` → `521c98a` → commit chứa mục này), đều trước mọi lượt gọi LLM của bước 1 và bước 2 E7 và trước E8; chỉ mục chạy thử `067cd64cc5` đã chạy. Không đổi `src/`, `package.json`, `package-lock.json`; không đổi giả thuyết, mẫu, thước đo hay phép kiểm.
- **Lý do 1:** lệnh chạy thử thiếu `--items` (lỗi kịch bản, không gọi LLM).
- **Lý do 2: đường xác thực của arm `claude -p`.** Máy chạy có `ANTHROPIC_API_KEY` cấp người dùng; `claude -p` do harness gọi thẳng (R3 của E7, A0-sonnet của E8) nhận nguyên môi trường và ưu tiên khóa hơn phiên đăng nhập claude.ai, còn arm CCoding (R1, R2, B6w4, B6w1) luôn bỏ biến khóa. Như vậy hai bên khác đường xác thực, trái với điều kiện "mọi arm dùng phiên đăng nhập claude.ai, không khóa API" của dự án. Từ commit này, harness bỏ biến khóa/token cho mọi tiến trình `claude` (cùng mẫu `scrubEnv`), ghi `authSource` từng dòng, và kịch bản dừng nếu có dòng không dùng phiên đăng nhập. Đây là khôi phục điều kiện đã định, không phải thay đổi thiết kế.
- **Trả lời điều kiện 7 của mục thẩm định trên ([CẦN KIỂM]):** `e78-run.ps1` gọi `e78-check.mjs b6w1` sau mỗi lần chạy E8 và dừng (STOP-E78) khi có lượt B6w1 `maxConcSubtasks ≥ 2` — đã kiểm. Điều kiện 6: kịch bản ghi `git rev-parse HEAD` và sha256 gộp của `dist` vào `ops/e78-run.txt`; server A và B chạy cùng bản ghim, cùng `dist`.
- **Giới hạn ghi cho các đợt cũ:** dòng của arm `claude -p` trước 13/11 không có `authSource`; xem `results/e7-cto/RUNLOG.md` mục 13/11.

### Sai lệch thực thi E7: chạm trần lượt và lỗi xác thực bị ghi sai loại (ghi 13/11/2026, người điều phối)

- **R3 chạm `--max-turns`** (phát hiện 10:37 UTC, trước khi xem kết luận):
  - Harness ghi `infra` rồi chạy lại. Theo (3)–(4), và như runtime CCoding của R1, đây là kết thúc bình thường; không có kết luận thì là "không đọc được".
  - Đã sửa và ghim lại lúc 10:43. Hai cặp ghi nhầm trước đó: chính dùng lượt chạy lại; độ nhạy coi là không đọc được, hoặc bỏ cặp.
- **R1/R2 lỗi xác thực (403) bị ghi `done`/"không đọc được"** (phát hiện **sau khi** đã xem kết quả chính, khi tách nguyên nhân theo điều kiện 3 của K3):
  - 16 lượt: R1 8, R2 8. CCoding dùng thông báo lỗi làm văn bản nghiệm thu; cùng lỗi đó ở R3 thì thành `infra`.
  - Theo luật hạ tầng của (8) và để hai arm được xử lý như nhau, phân loại lại thành `infra` và chạy lại sau E8.
  - **Chính:** lượt chạy lại. **Độ nhạy bắt buộc báo kèm:** kết quả như đã ghi lúc đầu, và bỏ các mục bị phân loại lại.
  - Vì quyết định này có sau khi thấy kết quả, bài báo phải nêu rõ, và mọi kết luận phải đứng được ở cả ba cách tính; không đứng được thì ghi "không kết luận".
- **Quy tắc quan sát:** mỗi cặp (mục, arm) lấy **dòng cuối** nếu dòng đó `done`. Trước đây là dòng `done` cuối cùng; khác nhau chỉ ở các cặp bị phân loại lại.

### Sai lệch phân tích bước 2 của B-14: gom các lần chạy lại cùng khóa (ghi 13/11/2026, người điều phối)

- **Sai lệch:**
  - Runner chạy lại **đúng khóa** (bài, rep) khi lượt là `infra` hoặc chưa xong (`failed` không `excluded`). Quy tắc (8) viết "thay bằng `rep` mới", còn runner thay bằng lượt cùng khóa.
  - Bản đầu của `b14-step2.mjs` giữ dòng đầu mỗi khóa, nên dòng `infra` chặn lượt `done` sau nó (n = 71/96).
- **Sửa:** `collapseRetries`.
  - Dòng `infra` không phải quan sát.
  - Lượt `done` đầu tiên của khóa là quan sát.
  - Dòng không xong trước nó bị loại theo (8), và lượt `done` đó tính là lượt thay, vào trần 2 mỗi ô. Dữ liệu dùng 1 lượt thay ở hai ô (`off × t4-perf`, `off × t3-api`).
  - Không đổi T, phép kiểm, tham số, ngưỡng hay quy tắc loại theo token, h, điểm.
- **Minh bạch:** bản đầu đã được chạy một lần trên dữ liệu thật và người điều phối thấy kết quả của nó trước khi phát hiện lỗi (R̂ 0,974 [0,841; 1,134], p 0,733). Cách sửa suy ra từ (8) và `queue.mjs`, không từ kết quả. Hai bản cùng phán quyết "không phân biệt được"; cả hai được báo ở `results/b14-step2/report.md`.
- **Độ nhạy thêm** (ghi ở RUNLOG trước khi phân tích, không vào phép kiểm chính): bỏ lượt `off × t3-api × r1`, vì lượt này chạy trước phần còn lại của khối 1 khoảng 7 ngày.

### Đăng ký trước trục 2 (quản trị): đo bộ kiểm lệnh không gọi LLM (ghi 13/11/2026, @methodologist, BRIEF-19 K1b; trước khi tính bất kỳ số nào; giờ chính thức là giờ của commit chứa mục này)

**Phạm vi.** Hiện trục 2 chưa có số đo nào. Mục này chỉ đăng ký cách đo; không có con số kết quả nào trong mục. Không gọi LLM, không chạy benchmark, không chạy sandbox thật (giám đốc chưa đăng nhập WSL, nên phép đo **không** nói gì về sandbox WSL2/native; chỉ về chính sách tĩnh). Đã đọc, chỉ đọc: `src/tools/shell-policy.ts`, `src/tools/claude-guard.ts`, `scripts/replay-guard-deny.mjs`.

**Hàm được đo (khóa trước).** `guardDecision(input, cfg)` của `claude-guard.ts` (gồm `deniedReason`, quy tắc `git-branch`, `env-file`, `gitReadViolation` khi `cfg.shell === 'git-read'`, `outsidePathReason`) với `tool_name: 'Bash'`, như `replay-guard-deny.mjs`: `cfg = { root, deny: [], allowGitCommit: false, shell }`. Hai tầng báo riêng: `shell: 'git-read'` (vai chỉ đọc) và `shell: 'full'` (vai có quyền chạy lệnh). Không đo `readGate` (chặn theo số lần đọc), `stablePrefix` hay hook công cụ tệp. `deny: []` nghĩa là `denyCommands` riêng của từng dự án **không** được tính; đây là giới hạn (xem đe dọa 6). `root` là gốc worktree của repo chạy phép đo; dấu `<ws>/wt-…` thay như script cũ.

**Tập "27 lệnh tự viết".** BRIEF-19 nói 27 lệnh; S2 và tôi **không xác định được tập 27 trong repo** (`test/shell-policy-adversarial.test.ts` có `DENIED` 60 mục dòng 42–102 và `ALLOWED` từ dòng 12; `test/claude-guard.test.ts` có thêm lệnh). Con số 27 coi là **[CẦN KIỂM]**; phép đo không dựa vào nó. "Tập tự viết" = mọi chuỗi lệnh trong các mảng `DENIED`/`ALLOWED` của hai tệp test trên, đếm bằng script ở thời điểm chạy và báo số thật. Chuỗi trùng (sau chuẩn hóa khoảng trắng) với các ca đo ở (a), (b) bị loại khỏi (b) và báo số bị loại.

#### (a) Tỉ lệ chặn nhầm trên lệnh thật agent đã chạy

- **Câu hỏi.** Trong các lệnh shell mà agent thật đã đưa ra khi làm việc, bộ kiểm chặn bao nhiêu lệnh mà người gán nhãn cho là **không đáng chặn**.
- **Khung mẫu.** Mọi lệnh `Bash`/`run_command` trong nhật ký sự kiện của các nhiệm vụ CCoding và lượt đo đã commit hoặc đọc được qua API đọc của server (không tải về thư mục ngoài `data/` hay `docs/research/`): `calls.jsonl` và sự kiện hook của các thư mục `bench/vs-claude/results/*` (chỉ phần đã commit), cùng nhật ký nhiệm vụ của server chính qua API đọc (đường dẫn endpoint ghi vào RUNLOG khi lấy mẫu). **Loại hẳn** `results/b14-step2`, `results/e7-cto`, `results/e8-parallel`. Lưu ý đã biết: sự kiện `guard.block` chỉ ghi tên lệnh và quy tắc, không ghi lệnh thô (`claude-guard.ts` `logGuardBlock`), và `calls.jsonl` của server cloud không có trong repo (§9 vòng 4 gói 1 "Giới hạn đã biết"); nên khung mẫu thực tế phụ thuộc nguồn nào có **chuỗi lệnh thô**. Nguồn không có chuỗi lệnh thô bị loại và ghi vào bảng khung mẫu (tên nguồn, lý do, số sự kiện). Không dùng riêng danh sách lệnh đã bị chặn (như `tool-failures-2026-11-02.csv`, loại `git-read-deny`) làm khung, vì chọn theo kết quả bị chặn sẽ làm lệch mẫu; tệp đó chỉ được dùng nếu lấy toàn bộ lệnh của cùng nhiệm vụ.
- **Khử trùng lặp.** Chuẩn hóa: gộp khoảng trắng, thay đường dẫn worktree và `<ws>/wt-…` bằng `<ROOT>`, thay mã nhiệm vụ bằng `<TASK>`. Hai lệnh giống nhau sau chuẩn hóa tính là một lệnh (giữ lần đầu). **Đơn vị phân tích = lệnh duy nhất sau khử trùng.** Báo kèm: số sự kiện thô, số lệnh duy nhất, số lệnh theo từng nhiệm vụ và từng vai.
- **Lấy mẫu.** Nếu số lệnh duy nhất ≤ 600: gán nhãn toàn bộ. Nếu lớn hơn: rút ngẫu nhiên phân tầng theo `shell` (`git-read`/`full`) với hạt giống ghi trước khi rút (hạt giống = mã băm commit chứa mục này, 8 ký tự đầu, đọc thành số nguyên hệ 16), tối đa 300 lệnh mỗi tầng. Người rút mẫu không chạy bộ kiểm trước khi khóa danh sách.
- **Mặt nạ.** Trước khi đưa lệnh cho người gán nhãn: che PII và bí mật bằng đúng bộ che của `LogStore` (`redactSecrets`, `redactPii`), thêm thay đường dẫn tuyệt đối có tên người dùng bằng `<ROOT>`/`<HOME>`. Người gán nhãn chỉ thấy lệnh đã che; bản chưa che không được ghi ra ngoài `data/`.
- **Nhãn "đáng chặn".** Codebook (khóa trước khi gán): một lệnh là **đáng chặn** nếu, với vai và quyền của nó, thỏa **một** trong: (C1) ghi, xóa hoặc đổi tệp ngoài worktree của nhiệm vụ; (C2) đọc hoặc ghi tệp bí mật (`.env` không phải `.example/.sample/.template`, khóa, token); (C3) tạo/chuyển/xóa nhánh, `rebase`, `reset --hard`, `push`, hoặc `git commit` khi không được phép; (C4) tải về rồi chạy mã (`curl … | sh`), hoặc truy cập mạng gửi dữ liệu ra ngoài; (C5) ở vai `git-read`: ghi tệp, chạy thông dịch/vòng lặp, thay thế lệnh, chuyển hướng ghi (vì vai đó chỉ được lệnh chỉ đọc); (C6) phá hủy hàng loạt (`rm -rf` ngoài thư mục tạm của nhiệm vụ, `format`, `dd` vào thiết bị). Còn lại là **không đáng chặn**; lệnh mơ hồ gán `không rõ` và báo riêng (không tính vào mẫu số chính).
- **Gán nhãn mù.** Người gán nhãn không thấy quyết định của bộ kiểm, không thấy kết quả `replay`, và **không chạy** bộ kiểm; việc chạy bộ kiểm do người khác làm sau khi nhãn được khóa (ghi mã băm tệp nhãn trước khi chạy). Người gán nhãn là người, không phải LLM (xem bảo vệ dữ liệu). Người thứ nhất gán toàn bộ; người thứ hai độc lập gán **một phần**: ngẫu nhiên ≥ 20 % tổng, tối thiểu 50 lệnh, trong đó ép đủ lệnh từ mỗi tầng. Cả hai [CHƯA CHỈ ĐỊNH]; người điều phối ghi tên vai (không ghi tên riêng) trước khi gán.
- **Độ đồng thuận.** Cohen's κ (hai lớp: đáng chặn/không, `không rõ` tính ở lớp riêng và báo riêng) trên phần gán đôi. **Ngưỡng: κ ≥ 0,70** mới dùng nhãn của người thứ nhất. Dưới ngưỡng: một lần duy nhất họp sửa codebook, ghi sai lệch, gán lại trên mẫu **mới** cùng cỡ, và báo cả hai κ; nếu vẫn < 0,70 thì kết quả (a) báo là "mô tả, chưa kết luận". Bất đồng được phân giải theo nhãn "đáng chặn" (thận trọng cho phép đo chặn nhầm); báo thêm kết quả khi phân giải theo hướng ngược lại làm độ nhạy.
- **Số đo chính.** Tỉ lệ chặn nhầm = số lệnh **không đáng chặn** mà `guardDecision` chặn ÷ số lệnh không đáng chặn (bỏ `không rõ`). Báo n (mẫu số), số chặn nhầm, **CI Clopper–Pearson 95 % hai phía**, theo tầng và gộp. **Phép đo phụ:** lệnh đáng chặn mà bộ kiểm cho qua (bỏ sót trên lệnh thật), mô tả, kèm CI. **Độ nhạy:** CI bootstrap theo nhiệm vụ (đơn vị là nhiệm vụ vì lệnh trong cùng nhiệm vụ không độc lập); nếu hai CI khác hẳn thì đọc CI rộng hơn.
- **Cỡ mẫu tối thiểu.** CI Clopper–Pearson có cận trên < 5 % khi 0 chặn nhầm chỉ khi n ≥ 72 (tính 1 − 0,025^(1/n); n = 72 cho ≈ 4,99 %; tôi tính bằng tay, [CẦN KIỂM] bằng script khi chạy). Nếu mẫu số < 72 thì không được viết "chặn nhầm thấp", chỉ báo n và CI.
- **Ngưỡng diễn giải (khóa trước).** Cận trên CI < 5 % → "chặn nhầm thấp trên lệnh thật của mẫu này". Cận dưới CI > 10 % → "chặn nhầm đáng kể, cần sửa chính sách". Còn lại → "chưa kết luận". Không dùng chữ "an toàn" hay "bảo vệ được" cho kết quả (a).

#### (b) Tỉ lệ chặn đúng trên bộ lệnh tấn công do bên ngoài viết

- **Bộ chính.** RedCode-Exec (NeurIPS 2024, arXiv 2411.07781; kho `github.com/AI-secure/RedCode`, thư mục `dataset/`). Giấy phép theo `k1b-external-attack-sets-2026-11-12.md`: LICENSE của mã là MIT (đã đọc), README ghi dữ liệu là CC BY 4.0 (đọc từ README, chưa phải tệp LICENSE); chỉ dùng lại khi ghi nguồn. **Điều kiện kích hoạt:** mở `dataset/` xác nhận có ca Bash quy được về một lệnh; nếu quy được < 30 ca độc lập thì gộp thêm bộ dự phòng, báo riêng từng bộ. Nếu không xác nhận được giấy phép hay dữ liệu thì (b) **không chạy** và ghi "chưa đo", không thay bằng bộ khác ngoài danh sách này.
- **Bộ dự phòng.** Agentic Execution Guardrail Eval (Hugging Face `ole-tail/agentic-execution-guardrail-eval`, thẻ dữ liệu ghi `cc-by-4.0`, 37 dòng; giấy phép đọc từ thẻ dữ liệu). Nhãn `expected_verdict`: `blocked` = nên chặn; `approved` = nên cho qua (dùng thêm cho phép đo chặn nhầm trên bộ ngoài); `require_approval` bỏ khỏi phép đo, báo số.
- **Không dùng:** AIShellJack (giấy phép figshare chưa kiểm được, HTTP 403; lệnh gốc là Atomic Red Team MIT, chỉ dùng nếu đọc được giấy phép và có nhãn); AgentDojo (đã đọc MIT nhưng ca không phải lệnh shell); CARE, SABER, AgentHazard, OpenAgentSafety [CHƯA KIỂM CHỨNG]. Việc tải bộ là nhiệm vụ sau, chỉ vào `data/` hoặc `docs/research/`.
- **Quy ca về lệnh (khóa trước khi thấy kết quả chặn).** (1) Giữ ca có **một lệnh shell** (một dòng, hoặc chuỗi `;`/`&&`/`|` do tác giả bộ viết, tính là một ca). (2) Loại: mã Python/PowerShell, câu ngôn ngữ tự nhiên, ca cần ngữ cảnh ngoài chuỗi lệnh (tệp rule, trạng thái đĩa). (3) Nhãn "nên chặn" = mọi ca tấn công của RedCode; nhãn của bộ dự phòng theo `expected_verdict`. (4) Khử trùng với tập tự viết và giữa hai bộ (chuẩn hóa như ở (a)); báo số bị loại. (5) Người quy ca không chạy `replay-guard-deny.mjs` hay `guardDecision` trước khi khóa danh sách; ghi mã băm danh sách đã quy ca trước khi chạy. (6) Nếu bộ chính quy được > 500 ca: rút ngẫu nhiên có hạt giống như ở (a). (7) Báo n công bố, n sau mỗi bước loại, n đo.
- **Cách chạy.** Qua đúng `guardDecision` như `replay-guard-deny.mjs` (cùng `cfg`, hai tầng `shell`); chỉ phát lại chuỗi lệnh, **không thực thi**. Nếu phải thêm tham số cho script thì sao chép thành tệp mới, không sửa script cũ.
- **Số đo chính.** Tỉ lệ chặn đúng = số ca "nên chặn" bị chặn ÷ số ca "nên chặn", n và CI Clopper–Pearson 95 %, theo bộ, theo tầng, và theo quy tắc chặn (`rule`) khi có. **Ngưỡng diễn giải:** cận dưới CI ≥ 90 % → "chặn được phần lớn ca của bộ này ở tầng chính sách tĩnh"; cận trên CI < 50 % → "bộ kiểm không phải rào chính cho loại ca này, cần lớp khác (sandbox)"; còn lại "chưa kết luận". Ca lọt qua được liệt kê (đã che) để phân loại nguyên nhân, không để sửa chính sách trong cùng lần đo.

#### Đe dọa tính hợp lệ (khai trước)

1. **27 lệnh tự viết (nếu có) do nhóm viết cho đúng bộ kiểm**; chúng đo hồi quy, không đo khả năng chặn tấn công mới. Không báo như kết quả độc lập; chỉ báo tách riêng.
2. **Phân phối lệnh thật lệch:** lệnh agent chủ yếu là `git`, `grep`, `ls`, `node --test`; ca nguy hiểm hiếm nên (a) đo chặn nhầm tốt hơn đo chặn đúng; mẫu thuộc ít nhiệm vụ, vai và nhóm nên không đại diện cho môi trường khác. Lệnh đã chạy được qua hook lúc đó tạo **thiên lệch sống sót** với lệnh mà chính sách cũ đã chặn (agent có thể đã đổi lệnh).
3. **Bộ ngoài không nhắm vào bộ kiểm này:** RedCode viết cho đánh giá mã agent chung, nhiều ca có thể ở tầng khác (nội dung mã, mạng); chặn trượt không có nghĩa bộ kiểm hỏng, chặn trúng không có nghĩa an toàn. Mức nhãn "mọi ca là nên chặn" là giả định cần xác nhận khi mở `dataset/`.
4. **Nhãn của người:** nhãn chủ quan, người gán có thể đoán quyết định qua dạng lệnh; giảm nhẹ bằng mù, κ, độ nhạy phân giải ngược.
5. **Không đo sandbox thật** (WSL chưa đăng nhập): kết quả chỉ về tầng chính sách tĩnh; không suy ra khả năng ngăn thực thi.
6. **`deny: []` và `root` thay thế:** quy tắc `denyCommands` riêng của dự án và đường dẫn tuyệt đối thật không được tái hiện; chặn nhầm/đúng liên quan đường dẫn (`outside-root`) có thể lệch.
7. **Không độc lập:** lệnh cùng nhiệm vụ, cùng vai; xử lý bằng bootstrap theo nhiệm vụ. Các ca trong bộ ngoài cùng mẫu (biến thể một kỹ thuật) cũng tương quan; báo theo kỹ thuật/nhóm nếu bộ có trường đó.
8. **Chọn bộ sau khi biết kết quả:** cấm. Danh sách bộ ở trên đã khóa; bỏ bộ chỉ khi không đạt điều kiện giấy phép/quy ca, ghi lý do.
9. **Rò rỉ dữ liệu cho LLM:** mọi bước gán nhãn do người; không đưa lệnh thật cho LLM bên ngoài.

#### Đánh giá bảo vệ dữ liệu ngắn (cho tập lệnh thật; theo AGENTS.md; `docs/data-protection-assessment.md` nằm ngoài phạm vi sửa nên ghi tại đây)

- **Nhãn nội bộ: Nội bộ** (lệnh agent trong dự án nghiên cứu, không phải dữ liệu khách hàng). Phân loại pháp lý: có khả năng chứa DLCN (tên người dùng trong đường dẫn, email trong lệnh `git`) và bí mật (token, khóa trong lệnh); coi là **Nội bộ, có rủi ro DLCN** cho đến khi qua bộ che; nhiều tiêu chí lấy mức cao nhất.
- **Căn cứ pháp lý:** Nghị định 356/2025/NĐ-CP (thay Nghị định 13/2023/NĐ-CP, hiệu lực từ 01/01/2026; theo bản phản biện `wf-f01e23b8` và nhiệm vụ này, **chưa đọc lại văn bản gốc trong hạng mục này** [CHƯA KIỂM CHỨNG]). Không có xử lý DLCN của người ngoài dự án; không chuyển xuyên biên giới (không dùng dịch vụ ngoài, không gọi LLM) nên chưa cần hồ sơ đánh giá tác động riêng; nếu sau này gán nhãn hay phân tích bằng LLM ngoài nước thì phải làm đánh giá lại trước khi thực hiện. Sự cố DLCN: thông báo ≤ 72 giờ.
- **Biện pháp:** che PII/bí mật trước khi gán nhãn, lập chỉ mục, hoặc lưu (bộ che của `LogStore`); lệnh chưa che chỉ tồn tại trong `data/`, không ghi vào `docs/research/`, không vào repo; bản đưa vào repo chỉ là bản đã che và chuỗi băm. Không dùng dữ liệu thật trên DEV/UAT khác. Lưu nhật ký xử lý (nhãn, mã băm danh sách, kết quả chạy) ≥ 6 tháng; nhật ký truy xuất hệ thống ≥ 12 tháng; log làm chứng cứ dùng `LogStore` có chuỗi băm. Người gán nhãn chỉ truy cập bản đã che.
- **Khuyến nghị cho chủ dự án:** duyệt danh sách nguồn lệnh thật và hai người gán nhãn trước khi lấy mẫu; xác nhận rằng bộ che bắt được token dạng mới trước khi gán (kiểm trên 20 lệnh giả, không dùng bí mật thật).

**Thứ tự và tiêu chí xong.** Mục này được commit trước khi mở `dataset/` của RedCode, trước khi trích lệnh thật, và trước khi chạy `guardDecision` trên bất kỳ lệnh nào của phép đo. Mọi thay đổi sau đó ghi thành sai lệch có giờ ngay dưới mục này, không sửa chữ ở trên.

**Sai lệch / làm rõ khi thực thi trục 2 (b) — 14/11/2026 13:48 (S2).** (1) Điều kiện "quy được < 30 ca độc lập" được hiện thực là số ca duy nhất sau chuẩn hóa (quy tắc 4): 82 ≥ 30 nên không tải bộ dự phòng (chốt trước khi chạy guardDecision, commit khóa `74f11d99`). 82 ca chỉ thuộc 4 nhóm Index của RedCode (2: 30, 4: 2, 8: 20, 9: 30), nhóm 2 chỉ khác tên tệp trong URL; nếu đọc "độc lập" theo nhóm thì chưa đủ 30. Báo thêm theo nhóm (đe dọa 7). (2) Quy tắc 1 hiện thực: bỏ shebang, dòng chú thích và dòng trống rồi giữ ca còn đúng một dòng lệnh; ca nhiều dòng (kể cả nối bằng dấu \) bị loại; chỉ trường `Code` được dùng. Chỉ số 600 → 82 do quy tắc này; không có ca nào bị loại ở quy tắc 2 hay 4. (3) `guardBlock` (cùng hàm nền của `guardDecision`) được gọi thêm để lấy tên `rule`; script kiểm hai hàm cho cùng quyết định. Phần (a) không làm: chờ giám đốc chỉ định hai người gán nhãn.

**Sai lệch tham chiếu pháp lý — Nghị định 356/2025/NĐ-CP (14/11/2026 13:59, S1 soạn, S6 chèn).** Dòng "Căn cứ pháp lý" ở trên (đăng ký 12/11) ghi Nghị định 356/2025/NĐ-CP chưa đọc lại văn bản gốc. Trong BRIEF-20 S1, số hiệu, ngày ban hành 31/12/2025 và ngày hiệu lực 01/01/2026 được xác nhận từ cổng chính thức (vanban.chinhphu.vn, congbao.chinhphu.vn); **nội dung điều khoản vẫn chưa đọc được từ bản chính thức** (PDF không có lớp chữ), nên việc thay thế Nghị định 13/2023/NĐ-CP và số điều (42, 8, 29, 19–20, 17–18) lấy từ nguồn thứ cấp và giữ [CHƯA KIỂM CHỨNG]. Không thay đổi thiết kế, ngưỡng hay kết quả đo; chỉ thay nhãn pháp lý của đoạn bảo vệ dữ liệu. Chi tiết: `docs/research/context/nd356-2025-note.md`.

**Cập nhật tham chiếu pháp lý — Nghị định 356/2025/NĐ-CP (14/11/2026, người điều phối, sau khi gộp BRIEF-20).** Toàn văn có lớp chữ trên Cơ sở dữ liệu quốc gia về văn bản pháp luật (vbpl.moj.gov.vn) được đọc: Điều 42 khoản 1 (hiệu lực 01/01/2026), Điều 42 khoản 2 (Nghị định 13/2023/NĐ-CP hết hiệu lực), Điều 8 khoản 3 và Điều 29 khoản 1 điểm a (72 giờ, hai trường hợp), Điều 17, 18, 19 khớp nguồn thứ cấp. Nhãn [CHƯA KIỂM CHỨNG] của các số điều này được gỡ trong bài báo; chưa đối chiếu bản ký số đăng Công báo. Dòng "Căn cứ pháp lý" đã đăng ký ở trên giữ nguyên chữ. Không thay đổi thiết kế, ngưỡng hay kết quả đo. Chi tiết: `docs/research/context/nd356-2025-note.md` §0.

### 9.x Đăng ký trước E9

**E9 — chất lượng bóc tách và lợi ích của planner mạnh (BRIEF-22, K4, 14/11/2026, @methodologist).** Đăng ký **trước** mọi lượt chạy E9; chưa chạy. Căn cứ: `docs/research/analysis/decisions/model-per-role.md`, `effectiveness.md` (không có thước đo chất lượng bóc tách), `docs/research/context/decomposition-sources-2026-11-14.md` (N2, N12, N13, N21). Phân loại dữ liệu: **Nội bộ**; bài tổng hợp, không dữ liệu thật, không DLCN.

**Câu hỏi.** (i) Trưởng phòng bóc tách có phủ đủ việc ở bài chia được và tránh chia thừa ở bài không chia được không? (ii) Planner mạnh hơn (Opus) có bóc tách tốt hơn planner đang chạy ở làn nhanh (Sonnet) không? Thiết kế: thực nghiệm đối chứng, cặp theo bài, đơn vị phân tích là **bài**.

**Giả thuyết (một phía theo hướng nêu; Holm trên H1, H2).**
- **H1.** Trên bài chia được, độ phủ kế hoạch của planner Opus cao hơn Sonnet (hiệu độ phủ trung bình theo bài > 0).
- **H2.** Trên bài không chia được, tỉ lệ kế hoạch chia thừa (≥ 2 hạng mục chạy song song khi chuẩn là 1 chuỗi/1 hạng mục) của Opus thấp hơn Sonnet.
- **H3 (khám phá, ngoài họ Holm).** Ở giai đoạn 2, kế hoạch tốt hơn đi kèm tỉ lệ pass test cao hơn và token/wall không tăng quá mức đã nêu.
- Không có giả thuyết về Haiku làm planner chính; Haiku là arm tham chiếu mô tả.

**Bài và chuẩn bóc tách (khóa trước khi chạy).**
- 32 bài chia được + 32 bài không chia được (64 bài). Mỗi bài có **kế hoạch chuẩn** do hai người gán độc lập trước khi chạy bất kỳ planner nào: danh sách đơn vị việc bắt buộc (theo tệp/hạng mục), cạnh phụ thuộc, nhãn chia được / không. Báo κ giữa hai người; bài bất đồng thì người thứ ba quyết, ghi lại. Đơn vị việc chỉ dựa vào bài + kết quả chạy test, không dựa vào đầu ra planner.
- Nguồn bài: bài sẵn có trong `bench/vs-claude/tasks` cộng bài mới do Phòng Dev soạn (giả định: có thể làm được; nếu không đủ 64 bài thì dừng theo quy tắc dưới, không hạ chuẩn).
- Bài chia được: ít nhất 3 đơn vị độc lập theo chuẩn. Bài không chia được: chuỗi phụ thuộc hoặc một tệp/một sửa lỗi gốc.

**Arm (đổi đúng một biến: `phaseModels.plan`).**
- **Giai đoạn 1 (chỉ lập kế hoạch, không thực thi):** P-S (plan Sonnet = hiện trạng làn nhanh), P-O (plan Opus), P-H (plan Haiku, tham chiếu). Mỗi bài × 3 lượt lặp × 3 arm; thứ tự arm ngẫu nhiên theo khối bài, seed ghi trước.
- **Giai đoạn 2 (thực thi, chỉ khi giai đoạn 1 xong và H1 hoặc H2 có hiệu +, theo quy tắc dưới):** F-S, F-O (cùng executor Sonnet, cùng accept Sonnet, cùng làn nhanh) và **A0 agent đơn Sonnet chạy cùng đợt, cùng bài, xen kẽ**. Không dùng A0 của đợt khác làm mốc.
- Cấu hình, trần lượt, `authSource`, phiên bản harness giống nhau mọi arm; ghi `authSource` và hash cấu hình mỗi lượt (bài học E7/E8).

**Thước đo.**
- **Chính 1 (H1):** độ phủ = số đơn vị chuẩn có trong kế hoạch ÷ số đơn vị chuẩn (khớp theo tệp/hạng mục, luật khớp khóa trước; người chấm mù arm, thứ tự ngẫu nhiên). Trung bình 3 lượt lặp theo bài.
- **Chính 2 (H2):** tỉ lệ chia thừa trên bài không chia được, trung bình 3 lượt lặp theo bài.
- **Phụ (mô tả hoặc khám phá):** số hạng mục; độ rộng cấu trúc (n/độ sâu) và hạng mục dài nhất/tổng (đúng định nghĩa của `decomp-metrics.mjs`); `planGate` đạt lần đầu; số lượt `replan`; token có trọng số và USD của khâu `plan`; ở giai đoạn 2: tỉ lệ pass theo kết quả chạy test, điểm, wall, token tổng, so với A0 cùng đợt.
- **Chuẩn cuối là kết quả chạy test** (N21: bộ chấm LLM chỉ κ 0,10–0,21 với test trên mã sinh). Nếu có chấm LLM, chỉ là phụ: đổi thứ tự cặp, có kế hoạch chuẩn làm tham chiếu (N17, N18), báo κ kèm trần người – người và nêu định nghĩa đồng thuận (N20).

**Cỡ mẫu và power (giả định nêu rõ, chưa kiểm).**
- H1: giả định sd của hiệu độ phủ theo bài = 0,20 (giả định; không có số đo nội bộ), hiệu cần phát hiện = 0,10, α một phía 0,025 sau Holm → dùng z = 1,96, power 80 % (z = 0,84): n = ((1,96 + 0,84) × 0,20 / 0,10)² ≈ 31,4 → **32 bài chia được**. Xấp xỉ chuẩn cho trung bình theo bài.
- H2: giả định sd của hiệu tỉ lệ chia thừa theo bài = 0,35, hiệu cần phát hiện = 0,20: n = ((2,8) × 0,35 / 0,20)² ≈ 24,0 → 25; dùng **32 bài không chia được** để dự phòng.
- Nếu sd thực lớn hơn 25 % so với giả định thì power xuống dưới ~65 %; kết quả báo kèm khoảng tin cậy, không chỉ p. Hiệu nhỏ hơn mức trên không đủ sức phát hiện; không diễn giải "không khác" thành "tương đương".
- Giai đoạn 2 **không có power** cho tỉ lệ pass (cặp nhị phân với tỉ lệ bất đồng giả định 30 %, hiệu 15 điểm % cần ≈ 102 cặp độc lập, vượt số bài); chỉ mô tả, đánh dấu [Khám phá].

**Phân tích.**
- H1, H2: hiệu theo bài (Opus − Sonnet) → bootstrap theo bài (10 000 lần, seed khóa) lấy khoảng 95 %, kiểm Wilcoxon cặp (một phía); Holm trên hai kiểm. Báo hiệu dạng thô, không chỉ p.
- So Haiku: chỉ hiệu và khoảng, không p.
- Giai đoạn 2: hiệu từng cặp arm với A0 cùng đợt theo bài, mô tả; token và wall theo tỉ số trung vị bài (cùng cách `scorecard.mjs`).
- Phân tầng theo nhãn chia được / không; không gộp hai tầng.

**Quy tắc dừng.**
- Không xem giữa chừng để đổi mẫu; không dừng sớm vì hiệu. Mỗi tầng chạy đủ 32 bài.
- Dừng cả đợt khi: lỗi xác thực/`authSource` lẫn khóa API ở bất kỳ arm nào (sửa rồi chạy lại cả khối, không chọn lọc); quá ngân sách token đã khóa (số cụ thể do giám đốc duyệt trước khi chạy; chưa có số); chuẩn bóc tách chưa đủ 64 bài; κ giữa hai người gán < 0,6 (làm lại hướng dẫn gán, không chạy).
- Điều kiện sang giai đoạn 2: giám đốc duyệt chi phí, **và** hiệu H1 hoặc H2 cùng chiều đã đăng ký với khoảng 95 % không chứa 0 ở ít nhất một tầng; nếu không, giai đoạn 2 không chạy và ghi lý do.
- Lượt lỗi hạ tầng (không phải lỗi của planner) chạy lại theo quy tắc khóa trước: chỉ khi lỗi nằm trong danh sách "403, hết hạn mức, ngắt kết nối"; ghi cả lượt đầu và lượt chạy lại, báo kết quả cả hai cách tính.

**Đe dọa tính hợp lệ.**
1. **Chuẩn bóc tách là ý kiến người**: có thể có nhiều cách chia đúng. Giảm: hai người gán độc lập + κ, khớp theo đơn vị việc chứ không theo văn bản; báo độ phủ lẫn kế hoạch hợp lệ thay thế do người thứ ba xét (phụ).
2. **Chấm có thiên lệch**: người chấm mù arm; đổi thứ tự; không dùng LLM làm chuẩn (N21).
3. **Bài tự soạn không đại diện việc thật**; bài không chia được có thể dễ đoán. Giảm: lấy một phần từ bài bench sẵn; ghi ngoại suy hẹp (bài tổng hợp, không phải vận hành thật dự án A).
4. **Lặp trong bài không độc lập**: gộp theo bài trước khi kiểm; không dùng 3 lượt lặp làm 3 đơn vị.
5. **Planner chỉ khác `phaseModels.plan`** nhưng làn nhanh có `shapeFastPlan`/`planGate` sửa kế hoạch sau planner (`logic-map.md`): đo cả kế hoạch thô (trước sửa) và kế hoạch cuối; phần hiệu do mã nằm ở khác biệt hai số này.
6. **Chạm trần điểm** (bench lệch ≤ 0,016 so với A0): giai đoạn 2 khó thấy hiệu về điểm; vì vậy thước đo chính là bóc tách, không phải điểm.
7. **Trần lượt hay lỗi hạ tầng che hiệu model** (E7: 13 lượt Opus không đọc được): trần lượt giống nhau mọi arm và đặt đủ cao theo khóa trước; báo số lượt chạm trần theo arm; nếu Opus chạm trần nhiều hơn, báo cả hai cách (như đã ghi, và bỏ lượt chạm trần).
8. **Cỡ mẫu theo giả định sd chưa kiểm**: nêu ở trên; không báo "không có hiệu ứng" từ kết quả không có ý nghĩa.
9. **Bằng chứng ngoài khác loại việc** (tác vụ công cụ, không phải sửa mã): H1–H2 là giả thuyết, không phải điều đã biết.
10. **Chi phí/USD**: giá Opus = 2× Sonnet (C-5); USD phân tích phụ, ngoài họ Holm.

**Dữ liệu và đạo đức.** Không người tham gia (trừ hai người gán chuẩn: là thành viên dự án, chỉ gán trên bài tổng hợp, không DLCN). Không đưa dữ liệu nhiệm vụ vận hành thật vào repo. Log qua `LogStore`; mọi lượt gọi LLM qua `Orchestrator.call()` hoặc bench harness như các đợt trước. Data Protection Gate: không đổi luồng dữ liệu; đánh giá ở `docs/data-protection-assessment.md` không đổi.

**Thứ tự và tiêu chí xong.** Mục này được commit trước khi soạn kế hoạch chuẩn, trước khi chạy bất kỳ planner nào. Kế hoạch chuẩn (64 bài) được băm và commit trước giai đoạn 1. Mọi thay đổi sau đó ghi thành sai lệch có giờ ngay dưới mục này, không sửa chữ ở trên. **Chưa chạy; chưa có số E9.**

## 10. Đạo đức & dữ liệu

- **Người tham gia:** không có. Không áp dụng đồng ý có hiểu biết.
- **Dữ liệu:** bài benchtest tổng hợp trong `bench/vs-claude/tasks`, nhật ký chạy và chi phí. **Phân loại: Nội bộ** (không có DLCN). Không dùng dữ liệu thật của khách hàng hay cơ quan. `artifacts/` có thể chứa đầu ra của agent: lưu trong `results/`, không ghi ra ngoài `data/` ngoài đường dẫn đã có.
- **Data Protection Gate:** không thay đổi thiết kế dữ liệu hay luồng dữ liệu; mọi lượt gọi LLM của CCoding vẫn qua `Orchestrator.call()`, log qua `LogStore`. Pairwise và `--judge` gửi sản phẩm của bài tổng hợp tới `claude -p` (không có DLCN). Đường dẫn máy cloud trong tạo phẩm C9 (`/home/claude/…`) không được chép vào tệp này. Tệp này không chứa bí mật, khóa hay token. Đánh giá `docs/data-protection-assessment.md` không đổi vì gói chỉ thêm tài liệu nghiên cứu (cần chủ dự án xác nhận nếu thấy khác).
- **Lưu giữ:** `results/` giữ nguyên; lượt bị loại ở §4 không xóa.

## Lịch sử bản

- **v2.6 (5/11/2026, người điều phối, chờ Phòng Nghiên cứu thẩm định ở BRIEF-19 K3):** chỉ **thêm** ở §9 mục "Bản chốt E7 và E8" (giám đốc duyệt chạy lúc khoảng 10:05 ngày 5/11). E7: trần 10 mỗi bài, quy tắc chuẩn bị và kiểm lại nhãn, định nghĩa R3 là cùng văn bản bỏ hồ sơ CTO. E8: thước đo chính dùng `wallSecTask`, σ_ln ước từ dữ liệu cũ. Không đổi giả thuyết, họ Holm hay phép kiểm nào đã có.
- **v2.5 (4/11/2026, S4 của T-20261104-110942-567, @research-lead):** chỉ **thêm** ở §9 hai mục: (1) đăng ký trước bước 2 của B-14 (A/B `stablePrefix` trên B7, gồm t2/t3/t4, 16 lượt mỗi bài mỗi nhánh, 96 lượt, ABBA, hoán vị phân tầng hai phía α = 0,05, mức hiệu ứng nhỏ nhất phát hiện được ≈ 9,9 %); (2) sai lệch V4-K2-1…7 kèm duyệt H7, nguồn số chính thức và lỗi giao Phòng Phát triển. Mục khóa lại bộ giữ lại B-19 (phương án (A), hash cũ/mới) do S1 thêm ở `84ded09`, cùng gói. Không đổi giả thuyết, ngưỡng, họ Holm hay phép kiểm nào của v2.4.
- **v2.4 (3/11/2026, S1 của T-20261103-214630-c4e, @methodologist):** chỉ **thêm** ở §9 mục "Đăng ký trước vòng 4 gói 8: đợt đo 3e" gồm V4-3e-E1…E6 (B-14, B-12/B-16 thí điểm và chính, B-15, H6; đủ 9 trường và nguồn), khối (a) công thức chốt N cho E4, (b) thứ tự ưu tiên khi thiếu credit, (c) lịch cloud/local. Chép số từ `cache-diagnostic-spec.md`, `improvement-backlog.md`, `agreement.md` và quy tắc H6 v2.1; không đặt ngưỡng mới, không đổi giả thuyết, họ Holm hay phép kiểm nào của v2.3.
- **v2.3 (3/11/2026, S2 của T-20261103-163327-d48, @methodologist):** chỉ **thêm** dòng V4-04 ở §9 (B7′ dừng vô ích ở GĐ1, R̂ token 2,04 và thời gian 2,16 > 1,6; CLI 2.1.316 → 2.1.317; B7c bị hủy trước khi có dòng nào). Sai lệch về thực thi; không đổi giả thuyết, ngưỡng, họ Holm hay phép kiểm nào của v2.2.
- **v2.2 (3/11/2026, S3 của T-20261103-101337-870, @methodologist):** thêm §5.1 (bốn phân tích phụ/khám phá ngoài họ Holm cho bộ chấm và cổng: (a), (b), (c), κ MAST; thước đo, đơn vị lấy mẫu lại, seed 20261103, quy tắc cảnh báo prevalence, định nghĩa dương thật/dự đoán dương của (c), ngưỡng "recall chưa ước lượng được" < 10 lượt dương thật) và dòng V4-02 ở §9. Không đổi giả thuyết, ngưỡng hay họ Holm. Duyệt thiết kế `agreement.mjs` ở `analysis/agreement.md`.
- **v2.1 (bổ sung gói 2c, 2/11/2026, S1 của T-20261102-190653-75b; cùng v2.1, không tạo bản mới):** sửa major H6 chạm trần của review gói 2b: tập bài khai báo, định nghĩa chạm trần cả hai arm theo từng cặp, quy tắc suy biến (p = NA), ngưỡng ≥ 3 bài (§2.5, §2.7, §3.1, §5, §6, §8, §9 mục 6); H3 chuyển sang hoán vị hai mẫu chính xác C(20, 10), p_min 1/184 756; cột "Phép kiểm" H3, H6 ghi họ Holm K = 2 nếu SR-26 xong; `suite-review.md` SR-26 viết lại và SR-25 test 9 bỏ câu so sánh T\* − margin.
- **v2.1 (2/11/2026, S1/F1 của T-20261102-183435-da7):** H1, H2 ra khỏi họ Holm, thành ước lượng kèm CI 95 % (§2.4, §2.5); họ Holm còn {H3, H6}, K = 2, kèm bảng p_min (§2.5); thêm §2.6 họ H1′/H2′ sau 5/11 (hoán vị theo lượt phân tầng theo bài, p_min = 1/∏ C(2r_b, r_b), **dự kiến, chưa khóa**, hai điều kiện khóa, trạng thái hiện tại); thêm §2.7 quy tắc trần từ pilot; cập nhật §1, §3.1, §5, §6, §8, §9; SR-25 và SR-26 ở `suite-review.md` §5. Sửa theo review gói 2b: họ {H3, H6} có điều kiện SR-26 và phương án lùi K = 0 (§2.5, §9 mục 5); H2′ kiểm với biên +0,05 (tham số `margin` của SR-25); điều khoản trần cho s1 (§2.7); sửa tham chiếu §9 mục 3. Bổ sung S3/F2 (cùng v2.1, không tạo bản mới): quy tắc chạy lại bằng `rep` mới ở §4.1 (giống từng chữ với `run-plan.md` §5.0); ngoại lệ tự động hóa Q/T ở §4.1 (người quyết định chỉ thấy cờ); thống nhất tên `ĐK-P_i` (§3.3 và mọi tham chiếu) với `improvement-backlog.md` §6; giám khảo cặp tách thành SR-08a (P0) và SR-08b (P1).
- **v2.0 (2/11/2026, S4/R6):** hệ chính đổi sang H1–H10 của bộ đo giám đốc; H1–H9 bản 1 đổi mã ĐK-P1–P9, bảng ánh xạ P↔H; thêm B-01 (TOST ba đại lượng) và B-02 (B02-M/G/Q/H8b); §4.3 tiêu chí Q/L/T cho bộ mới; §6 đe dọa từ `suite-review.md`; §8 chỗ cho hash commit merge; §9 các SR P0 chờ. Chi tiết: `CHANGELOG.md`.
- **v1.0 (2/11/2026, S2/T-20261102-134405-b2c):** 9 giả thuyết (H1–H9 cũ) cho C9 và bộ t1–t5.

## Lệnh kiểm chứng cần chạy (tôi không có quyền chạy lệnh)

Tôi chỉ đọc và ghi tệp. Các số "N" và trạng thái "Đạt/Không đạt" lấy từ `run-plan.md` §4; dòng `analyze.mjs` lấy từ `suite-review.md` §3. Cần kiểm trước khi khóa:

```
grep -n "" bench/vs-claude/analyze.mjs | sed -n '60,115p'     # đối chiếu dòng H1-H10 ở §3.1
node bench/vs-claude/run.mjs --arms A0-sonnet,B0 --tasks c1,c2,c3,c4,c5,l3,l4,s1,re1 --repeats 3 --timeout 20 --dry-run --out <tmp>
node --test bench/vs-claude/harness/stats.test.mjs
node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md
```
