# K2a: thẩm định thống kê D11 và các phán quyết bị đảo (04/11/2026)

Nhãn dữ liệu: **Nội bộ** (chỉ dùng dữ liệu benchmark đã có, không có DLCN). Người soạn: @methodologist, hạng mục S2 của T-20261104-110942-567. **Chỉ đọc mã, không chạy gì**; mọi "đầu ra kỳ vọng" dưới đây là suy ra bằng tay từ mã và còn cần S3b chạy để xác nhận. Không sửa `preregistration.md`; đoạn §9 ở mục 6 là bản soạn sẵn cho S4.

Ký hiệu: `S` = `bench/vs-claude/lib/stats.mjs`; `A` = `bench/vs-claude/analyze.mjs`; `PT` = `docs/research/analysis/prereg-tests.mjs`; `P` = `docs/research/preregistration.md`; `D11` = `docs/research/context/d11-suite-review-2026-11-04.md`.

## 1. Kết luận ngắn

| Mục | Kết luận |
| --- | --- |
| H2 | Phán quyết mới **đúng quy tắc đăng ký** (P:169, :182 (ii)), SR-04 không tự đổi quy tắc. Nhưng nhãn nên là **"không kết luận"**, không phải "not supported"; H2 vẫn chỉ là ước lượng (P:87, :169). |
| H6 | n = 0 **đúng quy tắc** (P:105 (a), :108 (d)). Nhãn `insufficient data` hợp lý vì n = 0 thì không có cả CI 90 % để "hạ xuống ước lượng". Số "SUPPORTED" cũ là lỗi tập bài, không phải kết quả. |
| H7 | "Tỉ số SD gộp 0,00" là **số học hợp lệ nhưng suy biến do trần** và **không có quy tắc v2.1 áp dụng được** (quy tắc suy biến P:107 chỉ viết cho H6). Vậy phép kiểm SR-14 là **sai lệch đặt ra sau khi thấy dữ liệu**. Bảng 10 ghi H7 **"không xác nhận"** kèm hai cách đọc; **không** ghi SUPPORTED. |
| H3, H4, H8, H9 | Đều đúng hướng "không xác nhận" nhưng **lý do không phải lý do đã đăng ký**: do cổng SR-11 (≥ 3 bài) và SR-13 (đổi chỉ số), cả hai chưa từng đăng ký cho các giả thuyết này. Bảng 10 phải nêu lý do đăng ký, không nêu `insufficient data` như lý do. |
| Mã | 1 blocker (H6 xác nhận được trên phân phối suy biến), 7 major, 6 minor (mục 2). Blocker **không ảnh hưởng số đã công bố** (study-cloud có n = 0 ở H6) nhưng **chặn mọi phân tích xác nhận H6** (V4-3e-E6) cho tới khi sửa. |

## 2. Phát hiện theo hàm

Phân loại: **blocker** = làm sai phán quyết xác nhận/bác bỏ đã đăng ký; **major** = lệch quy tắc đăng ký hoặc lệch với `PT`, có thể đổi số/nhãn trong bài báo; **minor** = nhãn, độ chính xác, bền vững.

### 2.1 `tost` (S:47-69) — dùng cho H2, H6, B-01

| Thuộc tính | Mã |
| --- | --- |
| Thống kê | `diff`: TB theo bài của mean(b) − mean(a); `logratio`: ln(TB-qua-bài mean(b) / TB-qua-bài mean(a)) (S:49, :52) |
| Phía | Hai phía (CI 90 % phân vị, `alpha` mỗi phía 0,05; S:67); `equivalent` ⇔ CI ⊂ [−margin, +margin]. Không có p |
| Lặp, hạt | B = 4000, hạt 20261102 (S:47), bộ `mulberry32` riêng |
| Phân tầng | Hai tầng: lấy lại **bài**, rồi lấy lại **lượt** trong ô (S:58-62) |
| sd = 0 / suy biến | **Không xử lý.** Mọi mẫu bằng nhau ⇒ lo90 = hi90 = est ⇒ `equivalent = true` nếu |est| ≤ margin |
| Trần | Không xử lý trong hàm; H6 lọc trước (A:120), H2 và B-01 **không lọc** (A:165, :304) |
| n < 3 bài | Không kiểm; chỉ loại ô rỗng (S:48). `n = 0` hoặc `margin ≤ 0` ⇒ `equivalent = false` (S:51) |
| CI | Nội suy tuyến tính giữa hai thứ hạng (`quantile`, S:36-39); NaN bị bỏ im lặng (S:65) |

| # | Mức | Phát hiện | Quy tắc |
| --- | --- | --- | --- |
| T-1 | **blocker** (H6), major (H2, B-01) | Phân phối bootstrap suy biến vẫn cho `equivalent = true`. Ví dụ mọi lượt cùng 0,7 ở cả hai arm ⇒ H6 SUPPORTED (A:211 dùng `h6.equiv`, không dùng `comb.verdict`). Đây đúng là lỗi "xác nhận do suy biến" mà P:104, :107 cấm ("áp cả khi suy biến không do trần"). Với H2, Δ = 0 do trần cho hi90 = 0 ≤ 0,05 ⇒ SUPPORTED, đúng điều P:154 và P:169 cảnh báo | P:107; P:169 |
| T-2 | major | `logratio` ở S:49 lấy **tỉ số của hai trung bình qua bài**; `PT` (PT:93-94) và P:80 ("bootstrap 90 % CI theo bài trên log-tỉ số") lấy **trung bình của log-tỉ số từng bài**. Hai đại lượng khác nhau (ví dụ F12). Cùng dãy số ngẫu nhiên, nhưng số B-01 của `A` ≠ số B-01 của `PT` | P:80; PT:11-12 |
| T-3 | major | B-01(c) trong `A` không có quy tắc trần ≥ 0,99 và ngưỡng ≥ 3 bài (A:303-307), trong khi `PT` có (`tostScoreWithCeiling`, PT:123-133). Điểm chạm trần ⇒ `equivalent = true` (T-1) | PT:13-14, :130-131 |
| T-4 | minor | CI phân vị nội suy (S:36-39) so với `PT` lấy chỉ số `floor` (PT:106): số lẻ thứ 3 có thể lệch | — |
| T-5 | minor | NaN bị bỏ im lặng (S:65), `PT` coi bất kỳ NaN nào là suy biến (PT:101, :103) | PT:103 |
| T-6 | minor | B-01 không có cổng n ≥ 3 bài cho (a), (b) (A:307) | — |

### 2.2 `bootP` (S:108-136) — p cho từng cặp A/B0 của H6

| Thuộc tính | Mã |
| --- | --- |
| Thống kê | Δ* = TB theo bài của (mean(b*) − mean(a*)); `a` = B0, `b` = A1 hoặc A2 (A:118) |
| Phía | Hai phía hợp giao: k = max(#Δ* ≤ −0,05, #Δ* ≥ +0,05); p = (k + 1)/(B + 1) = max hai p (S:133-135). **Khớp** P:93 |
| Lặp, hạt | B = 4000, hạt 20261102 |
| Phân tầng | **Chỉ lấy lại lượt trong từng ô**, bài cố định (S:119-122). **Khớp** P:93 ("lấy lại lượt trong từng ô"). Khác `tost` (hai tầng), xem B-4 |
| sd = 0 | `degenerate` ⇔ max − min ≤ 10⁻¹² (S:128). **Khớp** P:107; p = null, "Bác bỏ" nếu mọi |Δ*| ≥ 0,05, ngược lại "Không kết luận (trần/suy biến)" (S:129-131) |
| Trần | Bỏ bài khi **mọi** lượt của **cả hai** arm ≥ 0,99; một phía thì giữ (S:112). **Khớp** P:106 (ví dụ [1; 1; 0,998] bị loại) |
| n < 3 | n < `minTasks` ⇒ `verdict = 'estimate'`, kèm `ci90` (null nếu n = 0), không p (S:127). **Khớp** P:108 |
| Tập bài | Chỉ `taskSet` (S:109). **Khớp** P:105 |

| # | Mức | Phát hiện |
| --- | --- | --- |
| B-1 | major (tiềm ẩn) | Điểm không hữu hạn (NaN) không bị lọc (khác `permTwoSample`, S:84). Mọi Δ* = NaN ⇒ `degenerate` sai (NaN ≤ EPS là false), k = 0 ⇒ **p = 1/4001** — đúng điều P:107 cấm tuyệt đối. Xem F7 |
| B-2 | minor | Nhãn chỉ có 'p' / 'Bác bỏ' / 'Không kết luận (trần/suy biến)' / 'estimate'. Ca không suy biến mà CI hoàn toàn ngoài biên (đáng gọi "Bác bỏ", P:85) chỉ cho p lớn, và `A` dịch thành `not supported` |
| B-3 | minor | `ci90` (S:126) lấy từ bootstrap một tầng (chỉ lượt). P:108 gọi là "CI 90 % theo bài", nhưng khi n < 3 nó **không phản ánh biến thiên giữa bài**. Cần ghi chú khi báo ước lượng |
| B-4 | minor | `bootP` (một tầng) và `tost` (hai tầng) có thể bất đồng cho cùng cặp (p nói tương đương, CI nói không). P:173 lấy **CI 90 % làm kết luận chính**; Bảng 10 phải theo CI và gọi p là phụ |

### 2.3 `h6Combine` (S:139-150)

| Thuộc tính | Mã |
| --- | --- |
| Gộp | p = max(p(A1), p(A2)) (S:149). **Khớp** P:92 |
| Một cặp NA | p = null; "Bác bỏ" nếu có cặp nào "Bác bỏ", ngược lại "Không kết luận (trần/suy biến)" (S:145-147). **Khớp** P:107; chọn "Bác bỏ" khi một cặp bị bác bỏ là hợp lý, P:107 chỉ viết cho một cặp |
| Một cặp `estimate` | Cả H6 thành `estimate` (S:144). **Khớp** P:108 (min(n_A1, n_A2) < 3) |
| n = 0 hai cặp | `out(null, 'estimate')`; `ci90 = {A1: null, A2: null}`, `k = {null, null}`; **không ngoại lệ** |

| # | Mức | Phát hiện |
| --- | --- | --- |
| C-1 | minor | `nA1`/`nA2` lấy từ `pA1.nA1`, `pA2.nA2` (S:141). Gọi `bootP` không truyền `arm` đúng thì n bị `null` mà không báo lỗi. `A` truyền đúng (A:119) |
| C-2 | minor | Trong `A`, H6 `verdict` (A:211) chỉ dùng `equiv`/`nOk`; nhãn "Bác bỏ" và "Không kết luận" của `h6Combine` chỉ in ra chữ (A:209). Hệ quả: `not supported` lẫn hai nghĩa (xem T-1 cho trường hợp tệ hơn) |

### 2.4 `permTwoSample` (S:83-98) — H3

| Thuộc tính | Mã |
| --- | --- |
| Thống kê | T = mean(b + shift) − mean(a) |
| Phía | `greater` mặc định; `less`, `two` có sẵn. H3 gọi `greater` với shift −0,15 (recall) và +0,05 (precision) (A:133-134). **Khớp** P:93 |
| Lặp | Liệt kê đủ C(r_a + r_b, r_b), không hạt. s1: C(20, 10) = 184 756. **Khớp** P:93 |
| Phân tầng | Không (một bài s1) — **khớp** P:93, đăng ký chỉ s1 |
| sd = 0 / trần | Không xử lý đặc biệt; p chính xác nên không có p_min giả, nhưng phép dịch biên làm trần thành p = 1 hoặc p = p_min (F9). Điều khoản P:158 xử lý riêng |
| NaN | Bỏ (S:84). **Khớp** P:93 |
| n < 3 bài | Không áp ở hàm; **`A:136` thêm cổng ≥ 3 bài review** |

| # | Mức | Phát hiện |
| --- | --- | --- |
| P-1 | major | `A:136` (`nTasks >= MIN_TASKS`) áp SR-11 cho H3, nhưng H3 **đăng ký đúng 1 bài** (P:100, :170 "A0-sonnet, B0 × s1", p_min "đạt"). Cổng ≥ 3 bài chỉ đăng ký cho H6 (P:108) và H7 (P:174). Nhãn đổi từ "suy biến/mô tả" (P:158) sang `insufficient data` |
| P-2 | minor | Không có chặn kích thước: r_a = r_b = 20 ⇒ C(40, 20) ≈ 1,4·10¹¹ phép gán, treo. Cần guard hoặc chuyển sang Monte Carlo khi N lớn |

### 2.5 `permStratified` (S:162-208) — H1′/H2′ (dự kiến, chưa khóa)

| Thuộc tính | Mã |
| --- | --- |
| Thống kê | T = TB theo bài của (mean(b − margin) − mean(a)) |
| Phía | `greater` / `less` / `two`. H1′ `greater`, margin 0; H2′ `less`, margin 0,05 (A:291-292). **Khớp** P:127 |
| Lặp, hạt | Đủ nếu ∏ C ≤ 10⁶, ngược lại Monte Carlo M = 10 000, hạt 20261102, p = (k + 1)/(M + 1). **Khớp** P:128 |
| Phân tầng | Theo bài, hoán vị nhãn trong từng bài |
| Bài thiếu một nhánh | Vào `skipped`, không tính (S:166-167). n = 0 ⇒ p = null |
| sd = 0 / trần | **Không xử lý.** Ví dụ F11 |
| n < 3 bài | Không áp (H2′ là một bài theo thiết kế) |

| # | Mức | Phát hiện |
| --- | --- | --- |
| S-1 | major (chưa khóa) | Với H2′ (margin 0,05, `less`), bài chạm trần ở cả hai arm cho p = p_min (F11: 1 bài, r = 2 ⇒ p = 1/6; r = 5 ⇒ 1/252 ≈ 0,0040 ≤ 0,0125 ⇒ `confirmable`). Lý do: b − 0,05 làm B0 "kém hơn" A0 ở mọi lượt một cách giả tạo. Đây là cùng cơ chế "p_min xuất hiện chỉ vì trần" mà P:104 sửa cho H6. P:140 nói "bài trần không đóng góp vào T" — đúng với margin 0, **sai với margin > 0**. Trước khi khóa H1′/H2′ cần quy tắc trần/suy biến cho họ này |
| S-2 | minor | Không có test cho ca `alt = 'two'` kèm margin; chưa dùng ở đâu |

### 2.6 Phần nối vào `analyze.mjs` (không thuộc bốn hàm nhưng quyết định nhãn)

| # | Mức | Phát hiện |
| --- | --- | --- |
| A-1 | major | H7 (A:213-227): xem mục 4. Cổng r ≥ 5 không có (A:215 chỉ đòi > 1 lượt), phép kiểm thay đổi sau dữ liệu, quy ước 0/0 := 1 (A:217) |
| A-2 | major | H1 (A:158-161) lọc theo loại + `size ≥ 3` từ `task.json` (SR-05). P:181 **đăng ký cố định danh sách c3, c4, c5, r1** để chống chính việc đổi `size` sau dữ liệu; D11 ghi số bài H1 đổi 7 → 6 vì SR-05. Ngoài ra H1 và H10 không loại các bài chạm trần pilot (P:154-155) |
| A-3 | major | H9 (A:246) chỉ đọc `citationPrecision`, grader mới chỉ ghi `citationValidity` (`lib/grade.mjs:255`, alias đọc ở `citationValidityOf`, :228 chưa được `A` dùng). Dữ liệu mới + ≥ 3 bài research ⇒ dP = NaN, nhãn rơi về `not supported` im lặng |
| A-4 | minor | `verdict()` (A:106) chỉ ba nhãn, `not supported` gồm cả "bác bỏ" lẫn "không kết luận". Bảng 10 và bài báo không được đọc nó là "bác bỏ" |
| A-5 | minor | `compare` dùng chung `rnd` (A:63, :65, :93): p/CI phụ thuộc thứ tự gọi. Chỉ `--legacy-rng` hay thêm giả thuyết mới đổi số; ghi hạt trong báo cáo đã có (A:333) |
| A-6 | minor | CI 95 % lấy `sorted[floor(0,975·n)]` (A:94, :180, :273), tức phân vị 97,525 %; lệch vài phần nghìn |
| A-7 | minor | Mọi số mới của D11 chạy với `--allow-mixed-judge` (D11 §2), cờ mà chính mã gọi là "chỉ để đối chiếu dữ liệu cũ, không dùng cho phân tích chính" (A:4, :37). Bảng 10 phải ghi đây là số đối chiếu |

## 3. Đặc tả ca biên (fixture) cho S3b

Quy ước: `cells = [{task, a: B0[], b: A[]}]`; B = 4000, hạt mặc định, `minTasks = 3`, `ceil = 0,99`. "Mã" là đầu ra suy từ mã; "Đăng ký" là đầu ra đúng quy tắc, chỉ ghi khi hai bên khác nhau (khác nhau ⇒ test đỏ có chủ đích, báo Dev, không sửa ở hạng mục này).

| ID | Đầu vào | Đầu ra kỳ vọng (mã) | Đăng ký / ghi chú |
| --- | --- | --- | --- |
| **F1** suy biến không do trần | `bootP`: 3 bài, mỗi bài a = [0,7; 0,7; 0,7], b = [0,7; 0,7; 0,7]. Sau đó `tost(kept, {margin: 0,05})` | `bootP`: `p = null`, `verdict = 'Không kết luận (trần/suy biến)'`, `ci90 = [0, 0]`, `nA1 = 3`, `ceilingTasks = []`. `tost`: est = 0, lo90 = hi90 = 0, `equivalent = true` | **T-1:** đăng ký đòi không xác nhận (P:107). `A:211` ⇒ H6 **SUPPORTED** (sai) |
| **F2** trần mọi bài, cả hai phía | 4 bài, a = b = [1, 1, 1] | `ceilingTasks` = 4 bài, `nA1 = 0`, `verdict = 'estimate'`, `p = null`, `ci90 = null`, `k = null` | Khớp P:108. `A`: `nOk = false` ⇒ `insufficient data` |
| **F3** ngưỡng 0,99 và trần một phía | (i) a = [0,99; 0,99; 0,99], b = [0,99; 1; 1]; (ii) a = [1; 1; 1], b = [1; 1; 0,998] (ví dụ P:106); (iii) a = [1; 1; 1], b = [1; 1; 0,98]; (iv) a = [1; 1; 1], b = [1; 1; 0,9899999] | (i), (ii) vào `ceilingTasks`; (iii), (iv) vào `kept` | (i) kiểm dấu `≥` đúng tại 0,99. Cả bốn khớp P:106 |
| **F4** n = 0 | `cells = []`; và 3 bài ngoài `taskSet` | `n = 0`, `nA1 = 0`, `verdict = 'estimate'`, `ci90 = null`, `p = null` | Khớp P:108; không có "CI 90 %" để báo, Bảng 10 ghi "không có ước lượng" |
| **F5** n = 1, 2, 3 | 1, 2 và 3 bài không chạm trần, a = [0,5; 0,6; 0,7], b = [0,6; 0,6; 0,8] khác nhau để không suy biến | n = 1, 2: `verdict = 'estimate'`, `ci90` là mảng hai số hữu hạn, `p = null`. n = 3: `verdict = 'p'`, `p` ∈ [1/4001, 1] | Khớp P:108 (biên đúng ở 3). `tost` với n = 1, 2 vẫn có thể `equivalent = true` (T-6) |
| **F6** suy biến bị bác bỏ | 3 bài, a = [0,5; 0,5], b = [0,6; 0,6] | `p = null`, `verdict = 'Bác bỏ'`, `ci90 ≈ [0,1; 0,1]`, `k = null` | Khớp P:107 ("Δ\* cố định +0,10") |
| **F7** NaN | 3 bài, a = [NaN], b = [0,5] | `p = 1/4001 = 0,00025`, `verdict = 'p'`, `ci90 = [NaN, NaN]` | **B-1:** đăng ký đòi `p = null`. Lỗi, không phải chỗ lệch có chủ đích |
| **F8** `h6Combine` | (a) `bootP([], {arm:'A1'})` + `bootP([], {arm:'A2'})`; (b) `estimate` + `p`; (c) 'Bác bỏ' + `p`; (d) 'Không kết luận' + `p`; (e) `p` + `p` (0,01; 0,03) | (a) `p = null`, `'estimate'`, `nA1 = 0`, `nA2 = 0`, `ci90 = {A1: null, A2: null}`, `k = {A1: null, A2: null}`; (b) `'estimate'`; (c) `p = null`, `'Bác bỏ'`; (d) `p = null`, `'Không kết luận (trần/suy biến)'`; (e) `p = 0,03`, `'p'` | Khớp P:92, :107, :108. (a) ⇒ trong `A`, H6 `insufficient data`, ra khỏi họ Holm |
| **F9** `permTwoSample` suy biến (H3) | a = 10 × 1,0, b = 10 × 1,0. recall `shift = −0,15`; precision `shift = +0,05`; `alt = 'greater'`. Thêm: b rỗng hoặc toàn NaN; a = [0, 0], b = [1, 1] với `two` | recall: `N = 184756`, `p = 1`, `pMin = 1/184756`; precision: `p = 1/184756`; `p(H3) = max = 1`. b rỗng: `p = null`, `N = 0`. a = [0, 0], b = [1, 1]: `greater` p = 1/6; `two` p = 2/6 | Khớp P:93. Kết quả p(H3) = 1 là "không bác bỏ", khớp điều khoản P:158 (suy biến ⇒ mô tả) |
| **F10** `permStratified` cơ bản | (i) `[]`; (ii) 1 bài a = [0], b = [1], `greater`, margin 0; (iii) bài x: a = [1], b = [], bài y: a = [0], b = [1]; (iv) 2 bài a = b = [1, 1], margin 0, `greater`; (v) như (iv) với `maxExact = 1`, M = 10 000 | (i) `n = 0`, `nPerm = 0`, `p = null`, `tObs = NaN`; (ii) `N = 2`, `tObs = 1`, `p = 0,5`, `pMin = 0,5`; (iii) `n = 1`, `skipped = ['x']`, `p = 0,5`; (iv) `N = 36`, `tObs = 0`, `p = 1`, `pMin = 1/36`; (v) `exact = false`, `nPerm = 10000`, `p = (k + 1)/10001`, lặp lại cho cùng kết quả | Khớp P:128 |
| **F11** `permStratified` trần có margin (H2′) | 1 bài a = [1, 1], b = [1, 1], `alt = 'less'`, margin 0,05; lặp với r = 5 | r = 2: `N = 6`, `tObs = −0,05`, `p = 1/6 = pMin`; r = 5: `N = 252`, `p = 1/252 ≈ 0,0040` (`confirmable` với ngưỡng 0,0125) | **S-1:** p nhỏ chỉ vì trần. Dùng làm test chặn khóa H2′ |
| **F12** B-01 log-tỉ số | `tost` `logratio`: bài 1 a = [1], b = [2]; bài 2 a = [100], b = [100]; `margin = ln 1,15` | `est = ln(51/50,5) ≈ 0,0099` (tức R ≈ 1,010). `PT` (`bootstrapRatio`): `est` = TB(ln 2, ln 1) ≈ 0,3466 (R ≈ 1,414) | **T-2:** hai thống kê khác nhau trên cùng dữ liệu |

Kiểm đề nghị thêm, mức `analyze.mjs` (không phải fixture hàm): **V1** — trên bản sao `study-cloud`, đếm số mẫu bootstrap có tỉ số H7 đúng bằng 1 (nhánh `b === 0 ? 1`, A:217). Dự đoán: ≈ (10/13)¹³ ≈ 3,3 % > 2,5 %, nên cận trên "1,00" của CI [0,00; 1,00] đến từ quy ước 0/0 := 1 chứ không từ dữ liệu. Nếu đúng thì đây là bằng chứng cho mục 4.

## 4. H7 "tỉ số SD gộp 0,00"

### 4.1 Đăng ký nói gì

- Định nghĩa: SD(B0)/SD(A0) ≤ 0,7, "trung vị tỉ số SD theo bài ≤ 0,7 và ≥ 3 bài" (P:174), r = 5 mỗi ô; kiểm riêng, α = 0,025 một phía (P:119, :68).
- Ghi chú đăng ký: bài có sd(A0) = 0 gây thiên lệch chọn; A0-sonnet có sd = 0 ở cả 5 bài t1–t5, nên H7 "có thể là thiếu dữ liệu bất kể N"; phải báo số bài hợp lệ (P:187).
- SR-14 (P1) là đổi phép kiểm: P:407 quy định nếu làm **trước khi chạy** thì ghi v2.1 và **giữ phép kiểm cũ làm độ nhạy**.
- Quy tắc suy biến và trần v2.1: P:104-108 viết cho **H6**; §2.7 (P:152) cho **H1 và H10** (và ngoại lệ H6). **Không có điều khoản nào áp cho H7.**

### 4.2 Phán

1. **Số học hợp lệ.** Tỉ số gộp 0,00 nghĩa là sd gộp của B0 bằng 0, tức B0 có điểm đồng nhất trong mọi ô (điểm gần như luôn 1,0, D11 §2). Mã tính đúng.
2. **Nhưng không phải bằng chứng ổn định.** sd = 0 do trần che hết biến thiên. Đây là cùng cơ chế P:104 (trần "kéo về 0, co phương sai"). 10/13 bài có sd(A0) = 0: các bài này đóng góp 0 vào cả tử lẫn mẫu, tức chỉ 3 bài mang thông tin.
3. **Ba cách đọc cho cùng dữ liệu:**
   - (A) Nhãn điểm ước lượng của giám đốc (`est ≤ 0,7`, A:226): 0,00 ≤ 0,7 ⇒ "SUPPORTED (mô tả)".
   - (B) Theo đăng ký suy diễn (α = 0,025 một phía ⇒ cận trên CI 95 %): 1,00 > 0,7 ⇒ không xác nhận. Cận 1,00 còn do quy ước 0/0 := 1 (kiểm V1).
   - (C) Phép kiểm đã đăng ký (trung vị tỉ số theo bài, r ≥ 5, ≥ 3 bài): trung vị cũ 1,00 trên 18 bài (D11 §2) ⇒ not supported; áp cổng r ≥ 5 thì chỉ 2 bài (`PT` §5, PT:356, :361) ⇒ **chưa đủ N**.
4. **Quyết định.** Vì (i) không có quy tắc v2.1 cho sd gộp B0 = 0, (ii) phép kiểm SR-14 chạy sau khi thấy dữ liệu, (iii) hai trong ba cách đọc không xác nhận, **H7 là "không xác nhận"** trong Bảng 10 (kết hợp "suy biến / chưa đủ N"). **Không ghi SUPPORTED xác nhận**, kể cả "SUPPORTED (mô tả)" trong ô chính. Nếu cần nhắc hướng của điểm ước lượng, đặt ở chú thích. Đây là kết luận của methodologist; research-lead duyệt ở S4.
5. **Không đặt quy tắc mới sau dữ liệu** để "cứu" kết quả. Quy tắc cho H7 trong tương lai (đề xuất, áp từ lần đăng ký sau, **không hồi tố**): loại bài mà mọi lượt cả hai arm ≥ 0,99 khỏi phương sai gộp; sd gộp mẫu số = 0 thì không báo tỉ số; cận trên CI quyết định; r ≥ 5 và ≥ 3 bài còn lại.

### 4.3 Đoạn Bảng 10 cho H7

> **H7 (SD B0/A0 ≤ 0,7):** *không xác nhận.* Theo đăng ký, chỉ 2 bài có r ≥ 5 ở cả hai arm (chưa đủ N). Phép kiểm tỉ số SD gộp (SR-14) được thêm sau khi thấy dữ liệu và cho 0,00 [0,00; 1,00] trên 13 bài vì điểm B0 luôn chạm trần (sd gộp B0 = 0); đây là suy biến do trần, không phải ổn định hơn. Hai cách đọc (điểm ước lượng ≤ 0,7; cận trên CI 1,00 > 0,7) không cho cùng nhãn nên không xác nhận.

## 5. Xác nhận H2, H6 và H3, H4, H8, H9

| H | Phán quyết mới | Khớp quy tắc? | Dòng quy tắc | Ghi chú / sai lệch |
| --- | --- | --- | --- | --- |
| **H2** | SUPPORTED ⇒ not supported (TOST90 [0,0; +8,3 pp], cận trên > +5 pp) | **Khớp**, SR-04 **không đổi quy tắc** | P:169 ("cận trên CI 90 % của Δ ≤ +0,05 … khi SR-04 xong, vẫn ở mức mô tả"); P:182 (ii) | Bản cũ chỉ dùng chiều (i) `est ≤ 0,05` (+2,8 pp). Đăng ký hai chiều và SR-04 làm chiều (ii) thành nhãn duy nhất. Lệch nhỏ: nhãn. Đúng nhãn là **"không kết luận"**: lo90 = 0,0 không vượt +0,05 nên không "Bác bỏ" (P:85). H2 vẫn là ước lượng (P:87), nên Bảng 10 viết số, không viết SUPPORTED/not supported. Chưa lọc trần, báo kèm nhãn trần (P:154, :169): 2 trong 4 bài logic từng chạm trần ở pilot (l2-knights, l4-startup-order) |
| **H6** | SUPPORTED ⇒ insufficient data (n_A1 = n_A2 = 0) | **Khớp** | P:105 (a) tập khai báo; P:108 (d) min(n) < 3 ⇒ ước lượng, ra khỏi Holm; P:92 | A1/A2 trong study-cloud chạy trên bộ bài khác (D11 §2), không thuộc 7 bài khai báo; số "+0,7 [0,0; +2,2]" là `compare` trên mọi bài, chỉ để mô tả. Nhãn: P:108 nói "ước lượng kèm CI 90 %"; với n = 0 không có CI, nên `insufficient data` là cách đọc đúng. Bảng 10 viết "chưa đủ N" (đồng nhất với v0.4) |
| **H3** | not supported ⇒ insufficient data | **Lệch lý do** | P:100, :170 (1 bài s1, r = 10); P:158 (s1 trần ⇒ mô tả, ra Holm) | Lý do đăng ký là **suy biến do trần s1** (mọi lượt recall = precision = 1,0, nguồn `PT` §5, bài báo v0.4), không phải thiếu bài. Cổng ≥ 3 bài (A:136) là mới (P-1). Bảng 10 theo P:158 |
| **H4** | not supported ⇒ insufficient data | **Lệch lý do, kết quả chấp nhận được** | P:88 ("tối đa mô tả"); P:119, :184 (1 bài a1) | Đăng ký đã coi H4 là mô tả trên 1 bài. SR-11 (A:192) thêm cổng 3 bài, chưa từng đăng ký, nhưng không đổi kết luận (Δ ≈ +1,5 pp, xa ngưỡng +20 pp). Bảng 10 giữ "mô tả, không có phép kiểm" như v0.4 |
| **H8** | not supported ⇒ insufficient data | **Lệch phép đo** | P:175 (`formatMiss`); P:407 (SR-13 P1 ⇒ ghi v2.1, giữ cũ làm độ nhạy); P:119 (mô tả) | SR-13 đổi thước đo sang `untouchedFileFailures`/`redAtEnd` sau khi thấy dữ liệu; dòng cũ thiếu trường nên rỗng. `formatMiss` cũ (0 % vs 0 %) giữ làm độ nhạy theo P:407. H8 là mô tả nên không ảnh hưởng kết luận |
| **H9** | not supported ⇒ insufficient data | **Lệch lý do; có lỗi tiềm ẩn** | P:119, :189 ("chỉ mô tả", 1 bài re1) | Cổng ≥ 3 bài của SR-11 chưa đăng ký. Lỗi A-3 (`citationPrecision`) phải sửa trước khi có ≥ 3 bài research, nếu không dP = NaN |

## 6. Đoạn §9 soạn sẵn (cho S4; thêm sau mục khóa lại của S1)

Tiêu đề đề xuất: `### Sai lệch vòng 4 gói 10 (thẩm định thống kê D11; ghi 4/11/2026)`. Cột như bảng §9 hiện có: số, ngày, mục, đã đăng ký, thực hiện, lý do, có thấy dữ liệu bộ mới?, hệ quả.

| # | Ngày | Mục | Đã đăng ký | Thực hiện | Lý do | Đã thấy dữ liệu? | Hệ quả |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V4-K2-1 | 4/11/2026 | H7, §3.1 (P:174, :187), P:407 | Trung vị tỉ số SD theo bài ≤ 0,7, r ≥ 5, ≥ 3 bài; phép đổi (SR-14) phải làm **trước khi chạy** và giữ phép cũ làm độ nhạy | `analyze.mjs` thay bằng tỉ số SD gộp theo phương sai gộp, bài có > 1 lượt, 0/0 := 1; chạy lại trên study-cloud sau khi dữ liệu đã có (D11 §2): 0,00 [0,00; 1,00], 13 bài | Sửa thiên lệch bỏ bài sd(A0) = 0 (P:187) | **Có** (study-cloud đã xem) | v2.1 **không có quy tắc suy biến cho sd gộp = 0** (P:107 chỉ cho H6). H7 báo **"không xác nhận"** (chưa đủ N theo đăng ký: 2 bài có r ≥ 5; hai cách đọc điểm ước lượng và cận trên không đồng ý). Trung vị cũ (1,00, 18 bài) giữ làm độ nhạy. Không SUPPORTED |
| V4-K2-2 | 4/11/2026 | H2 (P:169, :182) | Hai chiều: (i) `est ≤ 0,05`; (ii) cận trên CI 90 % ≤ +0,05; vẫn ước lượng | Nhãn của `analyze.mjs` chỉ theo (ii) (SR-04) | Thực hiện chiều (ii) đã đăng ký | Có | Không đổi quy tắc. H2 báo số: +2,8 pp, TOST90 [0,0; +8,3]; **"không kết luận"**, không "bác bỏ" |
| V4-K2-3 | 4/11/2026 | H6 (P:105, :108) | Tập khai báo 7 bài; min(n_A1, n_A2) < 3 ⇒ ước lượng | Chạy lại: n_A1 = n_A2 = 0 vì A1/A2 chưa chạy các bài khai báo | Tuân thủ (a), (d) | Có | Không sai lệch. Số "SUPPORTED" cũ đến từ bài ngoài tập khai báo, rút lại. Bảng 10: chưa đủ N |
| V4-K2-4 | 4/11/2026 | H3, H4, H9 (P:100, :158, :184, :189) | H3 trên 1 bài s1; H4, H9 trên 1 bài, mô tả | SR-11 thêm cổng ≥ 3 bài (`analyze.mjs:136, :192, :248`) | Quy tắc chung SR-11 | Có | Nhãn thành `insufficient data` thay cho "suy biến" (H3) hoặc "mô tả" (H4, H9). Bảng 10 theo nhãn đăng ký; không đổi kết luận |
| V4-K2-5 | 4/11/2026 | H8 (P:175, :407) | Thước đo `formatMiss` | SR-13 đổi sang `untouchedFileFailures`/`redAtEnd` | Cải tiến thước đo | Có | Dòng cũ thiếu trường ⇒ `insufficient data`; `formatMiss` giữ làm độ nhạy |
| V4-K2-6 | 4/11/2026 | H1, H10 (P:154-155, :181) | Danh sách bài cố định (H1: c3, c4, c5, r1); H1, H10 bỏ bài chạm trần pilot | `size` mới (SR-05) và lọc theo loại; không loại bài trần pilot | Định nghĩa lại `size` | Có | H1: 7 → 6 bài, +2,8 pp [0,0; +9,0]; chỉ **ước lượng/mô tả** (P:87-88), không nêu "xác nhận" |
| V4-K2-7 | 4/11/2026 | B-01 (P:80, PT:93-94) | Log-tỉ số theo bài; trần ≥ 0,99 và ≥ 3 bài cho (c) | `analyze.mjs` tính log của tỉ số hai trung bình qua bài; (c) không có trần | Lệch cài đặt | Có | **Số B-01 chính thức lấy từ `prereg-tests.mjs`**, không từ `analyze.mjs` |

Ghi thêm trong §9 hoặc backlog (Dev, không sửa ở hạng mục này): T-1 (suy biến ⇒ `equivalent`), B-1 (NaN), A-3 (`citationValidity`), S-1 (trần của H2′) và P-2 (kích thước hoán vị). **T-1 phải sửa trước V4-3e-E6.**

## 7. So sánh `analyze.mjs` với `prereg-tests.mjs` và nguồn chính thức

`PT` chỉ có B-01, H5 và ước lượng mô tả H3 (+ bảng N cho H3, H6, H7); **không** có H1, H2, H4, H8, H9, H10, p của H3 và H6. Quy tắc chọn nguồn: theo đăng ký gần nhất (§2.4–§2.7, v2.1), mỗi ô Bảng 10 một nguồn. Cờ chạy: `PT` chạy bằng `node prereg-tests.mjs` không cờ (PT:3-5). Cờ `analyze.mjs` đã dùng cho bài báo v0.4 **chưa tra được trong hạng mục này** (data-scientist ghi nguyên văn từ RUNLOG); trước đó coi là giả định, không tự đặt cờ.

| H | `analyze.mjs` (HEAD) | `prereg-tests.mjs` | Chỗ lệch | **Nguồn chính thức** | Lý do |
| --- | --- | --- | --- | --- | --- |
| H1 | `compare`: CI 95 % hai tầng + p đổi dấu; lọc coding/design `size ≥ 3` (A:159); nhãn `est ≥ 0,1 && lo > 0` | Không có | Danh sách bài cố định (A-2); không loại bài trần | `analyze.mjs` (D11 §2), **ước lượng** | P:87-88, :168. Báo kèm: 6 bài, gồm bài trần pilot; chạy cờ `--allow-mixed-judge` |
| H2 | `compare` + `tost` margin 0,05 (A:163-166) | Không có | Nhãn theo (ii); không lọc trần; T-1 | `analyze.mjs`, **ước lượng, không kết luận** | P:169, :182 (ii) |
| H3 | `permTwoSample` s1, shift −0,15/+0,05; cổng ≥ 3 bài (A:128-140) | Ước lượng mô tả CI 90 %, N (PT:359, :366-377) | Cổng SR-11 (P-1) | `prereg-tests.mjs` §5 (**suy biến, mô tả**) | P:158 (trần s1); PT có hash trong §8; p do `analyze.mjs` = 1 theo F9, không đổi nhãn |
| H4 | `compare` `requirements`; cổng 3 bài (A:190-193) | Không có | Cổng SR-11 | `SCF/final-extra.md` mục H4 (v0.4, n = 11, TB 0,985 vs 1,000), **mô tả** | P:88, :119, :184 |
| H5 | Tỉ số trung vị theo bài, gộp mọi cửa sổ, đã ghép theo bài (SR-06; A:194-202) | Cặp **cùng cửa sổ**, CI 95 % hai tầng, hai công thức (PT:160-186, :280-305) | Gộp cửa sổ vs cùng cửa sổ (B0 ở `main`, B6/B7 ở nhánh `7fb18ba`) | `prereg-tests.mjs` §3 | Tránh so chéo server (PT:282); mô tả (P:119) |
| H6 | `bootP` + `h6Combine` + `tost` trên tập khai báo (A:113-127, :203-212) | Chỉ ghi "chưa đủ N" (PT:360) | Không lệch kết luận; T-1 tiềm ẩn | `analyze.mjs` (n = 0) ⇒ **chưa đủ N** | P:105 (a), :108 (d) |
| H7 | Tỉ số SD gộp, > 1 lượt (A:213-227) | Chỉ đếm bài r ≥ 5 (PT:356, :361) | Cổng r ≥ 5, phép kiểm đổi (A-1) | `prereg-tests.mjs` §5 (**chưa đủ N**, 2 bài) | P:174, :187; mục 4. Số 0,00 chỉ ở chú thích |
| H8 | Cặp theo bài `untouchedFileFailures`/`redAtEnd` (A:228-242) | Không có | Đổi thước đo (SR-13) | `analyze.mjs` (`insufficient data`; `formatMiss` phụ) | P:119, :175. Mô tả |
| H9 | `citationPrecision`, cổng 3 bài (A:243-249) | Không có | A-3 | `analyze.mjs` (`insufficient data`), **mô tả** | P:119, :189 |
| H10 | Độ dốc OLS + hoán vị 5000 Fisher-Yates; thêm `H10-coding`, `H10-adj` (A:250-282) | Không có | `size` mới; không loại bài trần | `analyze.mjs` (D11 §2), **thăm dò** | P:119, :190. Không dùng hiệu chỉnh ngưỡng khác |
| B-01 | `tost` logratio, `--b01-arm` (A:299-309) | Log-tỉ số theo bài, IUT, trần (c) (PT:89-140) | T-2, T-3; tên arm (`SL` vs B7) | `prereg-tests.mjs` | P:80, :120 |
| Holm | Họ {H3, H6}: K = 0 (A:141-156) | K = 0 (PT:363) | Khớp (lý do khác nhau, mục 5) | Cả hai cùng K = 0 ⇒ lấy `prereg-tests.mjs` §5 | P:92, :158 |

## 8. Bảng 10 đề xuất (một nguồn mỗi ô)

| Giả thuyết | Cần (§3.1) | Hiện có | Trạng thái |
| --- | --- | --- | --- |
| H2 (logic, không tốt hơn) | ước lượng, 4 bài | 4 bài; +2,8 pp | **Không kết luận** (ước lượng): TOST90 [0,0; +8,3 pp], cận trên vượt +5 pp; chưa lọc trần. Nguồn `analyze.mjs` (đối chiếu, dữ liệu chấm hỗn hợp) |
| H3 (review, s1) | r = 10 mỗi arm | 10 / 10 | **Suy biến (trần s1)**: recall 0,0 pp [0,0; 0,0], precision 0,0 pp [0,0; 0,0]; mọi lượt đạt 1,0; ra khỏi họ Holm. Nguồn `PT` §5, `SCF/README.md` |
| H4 (a1, `--judge`) | mô tả | n = 11 mỗi arm | **Mô tả, không có phép kiểm**: A0-sonnet TB 0,985, B0 1,000; Δ ≈ +1,5 pp, xa ngưỡng +20 pp. Nguồn `SCF/final-extra.md` |
| H5 (chi phí B0/A0) | mô tả cùng cửa sổ | mục (1) | Mô tả kèm CI. Nguồn `PT` §3 |
| H6 (A1/A2 ≈ B0) | tập khai báo 7 bài | n_A1 = n_A2 = 0 | **Chưa đủ N**, không có ước lượng (A1/A2 chưa chạy các bài khai báo); số "SUPPORTED" cũ rút lại. Nguồn `analyze.mjs` |
| H7 (SD B0/A0 ≤ 0,7) | r = 5, ≥ 3 bài | 2 bài có r ≥ 5 | **Không xác nhận** (chưa đủ N); tỉ số SD gộp 0,00 [0,00; 1,00] là suy biến do trần (sd gộp B0 = 0). Chú thích hai cách đọc (mục 4.3). Nguồn `PT` §5 |
| H8, H9 | mô tả | dòng cũ / 1 bài | **Mô tả**; H8 `formatMiss` 0 % vs 0 %; H9 chỉ re1. Nguồn `analyze.mjs` |
| Họ Holm {H3, H6} | — | — | **Rỗng (K = 0)**. Nguồn `PT` §5 |

Chú thích cho bài báo: mọi số `analyze.mjs` trên study-cloud chạy với `--allow-mixed-judge` (A-7), nên là **số đối chiếu**.

## 9. Việc chưa làm và lệnh cần chạy

- Chưa chạy gì (theo yêu cầu). S3b chạy fixture F1–F12 và kiểm V1; mọi ô "Mã" ở mục 3 là suy bằng tay, có thể sai ở số lẻ.
- Cần kiểm trước khi bài báo dùng: (i) `SCF/README.md` có đúng "mọi lượt recall = precision = 1,0" cho s1; (ii) cờ chạy `analyze.mjs` của v0.4 (S1/S3b ghi); (iii) hai bài logic nào chạm trần trong study-cloud (không phải pilot).
- Lệnh kiểm của dự án (CCoding tự chạy): `node --test bench/vs-claude/harness/stats.test.mjs`, `node docs/research/scripts/consistency-check.mjs`, `node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md`. Tôi chỉ thêm một tệp `.md`; `consistency-check` có thể quét tệp mới, chưa kiểm.
