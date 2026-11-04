# D12 N-2: rà độc lập mã thống kê (T-20261104-123633-378)

Nhãn dữ liệu: **Nội bộ**. Người viết: @qa-tester (mục 1–2: S5a; mục 3: S5b, điền sau S1b, không sửa mục 1–2).

## 1. Kỳ vọng tự suy

**Phương pháp.** Chỉ dùng `docs/research/preregistration.md` §2.4–§2.7 và §3.2 (B-01), cộng phần đầu vào (cột "Đầu vào") của F1–F12 trong thẩm định K2 mục 3.
Không đọc `stats-k2.test.mjs`, `analyze-k2.test.mjs` hay diff S1a/S1b. Không chép cột kỳ vọng hay đầu ra của thẩm định.

**Công khai một điểm lệch quy trình.** Lệnh lấy đầu vào F1–F12 cũng in luôn cột đầu ra của mục 3 và 10.2 của thẩm định.
Tôi đã thấy các cột đó và không thể nói là chưa thấy. Mọi kỳ vọng dưới đây được suy lại từ câu quy tắc đăng ký nêu ở cột "Căn cứ".
Ô nào đăng ký không có quy tắc thì ghi rõ, không lấy từ đầu ra của thẩm định.
S5b nên kiểm kỹ các ô đánh dấu (⚠) vì đó là chỗ dễ bị ảnh hưởng nhất.

**Quy ước.** B = 4000, hạt 20261102, trần ≥ 0,99, tối thiểu 3 bài. "Suy biến" là mọi Δ\* bằng nhau (dung sai 10⁻¹²) hoặc phương sai Δ\* = 0. P = `preregistration.md`.

| ID | Kỳ vọng tự suy | Căn cứ (P) |
| --- | --- | --- |
| **F1** 3 bài, mọi lượt 0,7 | Điểm 0,7 < 0,99 nên bài **được giữ** (không trần). Mọi mẫu Δ\* = 0 nên suy biến. `bootP`: p = NA, nhãn "Không kết luận (trần/suy biến)", nA1 = 3, `ceilingTasks` rỗng, CI 90 % = [0; 0]. `tost` (margin 0,05): est = 0, CI = [0; 0], **equivalent = false**, p = NA. H6 không SUPPORTED. | §2.5 (c): "phương sai của Δ\* bằng 0 hoặc mọi Δ\* bằng nhau … thì **p = NA**; **tuyệt đối không ghi p = 1/(B + 1)**". Cùng mục: "Quy tắc áp cả khi suy biến không do trần (ví dụ mọi lượt cùng 0,7): bootstrap không phân biệt được tương đương thật với không có biến thiên". Nhãn: "ngược lại 'Không kết luận (trần/suy biến)'". Việc áp cho `tost` suy từ chữ "không phân biệt được tương đương thật"; P không nêu tên `tost`. |
| **F2** 4 bài, a = b = [1; 1; 1] | Cả 4 bài vào `ceilingTasks`. nA1 = 0 < 3 nên H6 hạ xuống **ước lượng** (nhãn `estimate`). Không còn bài nên không CI, p = NA. | §2.5 (b): trần khi mọi lượt hai arm ≥ 0,99. §2.5 (d): "min(n_A1, n_A2) < 3 thì H6 hạ xuống ước lượng … (không p, không Holm)"; "Luôn báo n_A1, n_A2 và danh sách bài bị loại kèm nhãn trần". §2.7: "kèm 'trần: không có bằng chứng điểm' khi n bài = 0". |
| **F3** ngưỡng 0,99 | (i) a = [0,99 ×3], b = [0,99; 1; 1]: **trần** (dấu bằng tính là trần). (ii) a = [1;1;1], b = [1;1;0,998]: **trần** (đúng ví dụ ghi trước). (iii) b có 0,98: **giữ**. (iv) b có 0,9899999: **giữ** (< 0,99). Quy tắc cơ học, không phụ thuộc hướng hiệu. | §2.5 (b): "mọi lượt của cả hai arm trong cặp đó … có `score` ≥ **0,99**"; "Chạm trần một phía (một arm có ít nhất một lượt < 0,99) thì **giữ bài**"; "Ví dụ ghi trước: A1 = 1 mọi lượt, B0 = [1; 1; 0,998] ⇒ … bài bị loại"; "Quy tắc áp cơ học". |
| **F4** n = 0 | `cells` rỗng, và 3 bài ngoài tập khai báo: n = 0, nA1 = 0, nhãn `estimate`, p = NA, không CI. Bài ngoài tập khai báo không vào H6. | §2.5 (a): "H6 không chạy trên bài khác". §2.5 (d) (< 3 ⇒ ước lượng). §2.7: "kèm 'trần: không có bằng chứng điểm' khi n bài = 0". ⚠ P không nói "CI của tập rỗng"; chọn không có CI là suy luận, không phải câu chữ. |
| **F5** n = 1, 2, 3 (a = [0,5; 0,6; 0,7], b = [0,6; 0,6; 0,8]) | n = 1, 2: `estimate`, **có CI 90 % theo bài** (hai số hữu hạn), p = NA, không vào Holm. n = 3: đủ ngưỡng nên có p; không suy biến vì lấy lại lượt trong ô cho Δ\* biến thiên. Δ quan sát ≈ +0,067 > biên 0,05 nên p_trên lớn (không ≤ 0,0125): **không SUPPORTED**. `tost` với n = 1, 2: đăng ký không có cổng bài cho `tost` ngoài H6, nên không suy `equivalent`. | §2.5 (d): "min(n_A1, n_A2) < 3 thì H6 hạ xuống **ước lượng kèm CI 90 %** theo bài"; "Ngưỡng 3 … trùng ngưỡng ≥ 3 bài của H7". §2.5 H6: p_trên = P\*(Δ\* ≥ +0,05). |
| **F6** 3 bài, a = [0,5; 0,5], b = [0,6; 0,6] | Δ\* ≡ +0,10, suy biến. p = NA. Vì \|Δ\*\| ≥ 0,05 ở mọi mẫu, nhãn **"Bác bỏ"**. CI 90 % ≈ [0,10; 0,10]. | §2.5 (c): "Khi p = NA, phán quyết vẫn theo CI của §2.4: nếu \|Δ\*\| ≥ 0,05 ở mọi mẫu (CI nằm hẳn ngoài biên, ví dụ Δ\* cố định +0,10) thì 'Bác bỏ'". §2.4 (Bác bỏ). |
| **F7** NaN (3 bài, a = [NaN], b = [0,5]) | **Không được** ra p = 1/4001. ⚠ P không có câu riêng về NaN. Suy: nếu giữ lượt NaN thì Δ\* không hữu hạn, không có biến thiên hữu hạn ⇒ suy biến ⇒ p = NA, "Không kết luận (trần/suy biến)". Nếu lọc NaN trước thì cả ba bài mất arm a, n = 0 < 3 nên `estimate`, p = NA. Cả hai nhánh cho **p = NA**; CI không phải số hữu hạn. | §2.5 (c) ("p = NA; tuyệt đối không ghi p = 1/(B + 1)"). §2.5 (d) "có đủ lượt cả hai arm". Việc coi NaN là suy biến là chỉ thị của đề D12, không phải câu P. |
| **F8** `h6Combine` | (a) hai `bootP([])`: p = NA, `estimate`, nA1 = nA2 = 0, không CI, k = NA cả hai; H6 ra khỏi Holm. (b) `estimate` + `p`: H6 `estimate` (một cặp n < 3 thì min < 3). (c) 'Bác bỏ' + `p`: p = NA (một cặp NA thì p(H6) = NA); nhãn **'Bác bỏ'** (⚠ suy luận: P không viết quy tắc gộp nhãn hai cặp; H6 là hợp giao, một cặp CI hẳn ngoài biên thì H6 không tương đương). (d) 'Không kết luận' + `p`: p = NA, "Không kết luận (trần/suy biến)". (e) p = 0,01 và 0,03: p(H6) = max = **0,03**, nhãn `p`; 0,03 > 0,025 nên **không xác nhận** theo Holm. | §2.5: "p(H6) = max p(A1), p(A2), và = NA nếu một trong hai là NA"; (c): "Chỉ cần **một cặp** … có p = NA thì p(H6) = NA (không lấy max với cặp kia)"; (d) cho (a), (b); Holm: ngưỡng 0,0125 rồi 0,025. |
| **F9** `permTwoSample` H3 | Quy ước (⚠ đăng ký không gán a/b cho hàm): TREAT = b, BASE = a. a = b = 10 × 1,0, `greater`. **Recall** (shift −0,15): TREAT′ = 0,85 ×10, T\_obs = −0,15 là nhỏ nhất, mọi phép gán có T\* ≥ T\_obs ⇒ N = C(20,10) = 184 756, **p = 1**, p_min = 1/184 756. **Precision** (shift +0,05): T\_obs = +0,05 là lớn nhất, chỉ 1 phép gán đạt ⇒ **p = 1/184 756**. p(H3) = max = **1** (không bác bỏ). Điều khoản dự phòng s1 (mọi arm ≥ 0,99) ⇒ H3 hạ xuống mô tả. b rỗng hoặc toàn NaN: **không có quy tắc đăng ký** (P chỉ nói lượt NaN bị bỏ); bảo thủ: p = NA. a = [0; 0], b = [1; 1], `greater`, shift 0: N = C(4,2) = 6, T\_obs lớn nhất, p = **1/6**. Phía `two`: **không có quy tắc đăng ký** (H3 chỉ định một phía "greater"). | §2.5 "Nguồn p": "N = C(r_a + r_b, r_b)"; "trừ 0,15 khỏi recall của TREAT (b′ = b − 0,15) rồi hoán vị một phía 'greater'"; "cộng 0,05 … (b′ = b + 0,05)"; "p = #{T\* ≥ T_obs}/N; p(H3) = max hai p"; "Lượt precision NaN bị bỏ". §2.7 điều khoản dự phòng s1. |
| **F10** `permStratified` cơ bản | (i) `[]`: n = 0, p = NA (**không có quy tắc đăng ký** cho tập rỗng; bảo thủ NA). (ii) 1 bài a = [0], b = [1], `greater`, margin 0: N = C(2,1) = 2, T\_obs = 1 (lớn nhất), **p = 1/2**, p_min = 1/2. (iii) bài x chỉ có a, bài y như (ii): x thiếu arm nên **bị bỏ** (⚠ suy từ §2.5 (d) "đủ lượt cả hai arm"; §2.6 không nói riêng), n = 1, p = 1/2. (iv) 2 bài a = b = [1; 1]: ∏ C(4,2) = 36, T\_obs = 0, mọi phép gán T\* = 0 ≥ T\_obs ⇒ **p = 1**, p_min = 1/36 (theo chữ §2.6). Nếu áp thêm §2.7 (bài trần không là bằng chứng điểm; cách S-1 bảo thủ của D12) thì cả hai bài bị loại, n = 0, p = NA. Cả hai cách đều **không xác nhận**. (v) như (iv) với `maxExact = 1`: ∏ C = 36 > 1 nên Monte Carlo M = 10 000, hạt 20261102, p = (k + 1)/(M + 1); T\* ≡ 0 nên k = M, p = **1**; chạy lại cho cùng kết quả. | §2.6 "Phép kiểm": "T = trung bình theo bài của (TB điểm B0 − TB điểm A0)"; "p = tỉ lệ cách gán có T\* ≥ T_quan sát (sai số 1e-12)"; "Liệt kê đủ khi ∏ C(2r_b, r_b) ≤ 10⁶, ngược lại … Monte Carlo 10 000 lần với p = (k + 1)/(M + 1). Hạt 20261102"; "p_min = 1 / ∏ C(2r_b, r_b)". Nhánh bài trần: §2.7 "không được dùng làm bằng chứng điểm". |
| **F11** H2′, 1 bài trần a = b = [1; 1], `less`, margin 0,05 | Dịch B0 đi 0,05: T = TB(B0) − TB(A0) − 0,05; T\_obs = −0,05 là nhỏ nhất. r = 2: N = C(4,2) = 6, **p = 1/6** (= p_min). r = 5: N = C(10,5) = 252, **p = 1/252 ≈ 0,0040** theo công thức. Nhưng bài mọi lượt ≥ 0,99 ở cả hai arm nên theo §2.7 **không là bằng chứng điểm**; p nhỏ chỉ vì trần. Kỳ vọng đúng: **không `confirmable`/không SUPPORTED**; có thể báo p thô như số mô tả, không được dùng để khóa H2′. Cách cài chính xác (loại bài trần rồi kiểm suy biến, p = NA) **không có quy tắc đăng ký** cho `permStratified`, chờ Phòng Nghiên cứu. | §2.6: "H2′ dùng hoán vị sau khi dịch điểm B0 đi biên … `alt = 'less'` … thống kê T − margin"; N = ∏ C(2r_b, r_b); bảng p_min cho r = 5 một bài ⇒ 0,0040. §2.7: "Δ = 0 do trần **không** là bằng chứng 'B0 không hơn' (trần che mất khác biệt); báo kèm nhãn trần". §2.6: "Bài có hiệu bằng 0 ở mọi lượt (trần) … vẫn tăng tích, nên p_min chỉ là cận thuận lợi nhất". |
| **F12** B-01 `logratio` | Bài 1: a = [1], b = [2]; bài 2: a = [100], b = [100]. Log-tỉ số theo bài: ln 2 và 0. Thống kê B-01 = TB theo bài của log-tỉ số = (ln 2 + 0)/2 = **0,3466**, R = exp = **√2 ≈ 1,414**. Công thức "tỉ số các trung bình gộp" cho ln(102/101) ≈ 0,0099 và **sai** so với đăng ký. Biên ln 1,15 ≈ 0,1398; est nằm ngoài. Mỗi ô một lượt nên bootstrap trong ô cho Δ\* không đổi (= 0,3466): suy biến, CI hẳn ngoài [ln 0,85; ln 1,15] ⇒ nhãn "Bác bỏ", p = NA, `equivalent = false`. ⚠ Phần suy biến cho `tost` B-01 theo chỉ thị D12, không phải câu P. Cổng ≥ 3 bài (ở đây n = 2): **không có quy tắc đăng ký** trong §3.2 B-01. | §3.2 B-01 "Ngưỡng": "Tỉ số tính bằng trung bình theo bài của log-tỉ số rồi lấy mũ". "Kết quả bác bỏ": "CI 90 % của bất kỳ R nào có cận dưới > 1,15 hoặc cận trên < 0,85". "Phép kiểm": bootstrap 90 % CI theo bài, lấy lại lượt trong ô, hạt 20261102. |

## 2. Chỗ đăng ký chưa có quy tắc

1. NaN trong H6/B-01 (F7): đăng ký không nêu; đề D12 coi là suy biến.
2. Gộp nhãn hai cặp A1/A2 khi một cặp 'Bác bỏ' (F8c).
3. `permTwoSample` với mẫu rỗng và phía `two` (F9).
4. Tập bài rỗng, bài thiếu arm trong `permStratified` (F10 i, iii).
5. Bài trần trong `permStratified` có margin (F11): chờ đăng ký, trùng danh sách "chờ" của kế hoạch D12.
6. Cổng ≥ 3 bài và quy tắc trần cho B-01 (c) (F12, F5 phần `tost`): §3.2 không nêu; §2.7 chỉ nêu H1, H10.

## 3. So với test và diff (S5b, @qa-tester)

**Phạm vi và cách làm.** Đọc `git diff e12e037 -- bench/vs-claude/lib/stats.mjs bench/vs-claude/analyze.mjs` và hai tệp `stats-k2.test.mjs`, `analyze-k2.test.mjs`, sau khi mục 1 đã được commit (`ce9cd13`, trước mọi commit của S1a/S1b: `18a2387`, `9c3136c`, `0fe233b`, `005d7af`). **Mục 1 không bị sửa.** Ngoài đọc, tôi dựng lại F1, F6, F7, F10, F11, F12 bằng một script tạm gọi thẳng `stats.mjs` (đã xóa, không nằm trong diff) để lấy đầu ra thật thay vì tin lời test.

### 3.1 Đầu ra `npm run test:bench` (chạy lại ở S5b, exit 0)

```
ℹ tests 245
ℹ suites 0
ℹ pass 245
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 19697.4069
```

Các dòng cuối (SR-25 ca 1–9, SR-15, SR-05, SR-11, SR-16) đều `✔`. `npm test` toàn bộ không chạy lại: baseline đã đỏ từ trước và S5b không đổi `src/`.

### 3.2 Bảng so khớp F1–F12

Cột "test" ghi nơi đặt kỳ vọng: **S** = `stats-k2.test.mjs`, **A** = `analyze-k2.test.mjs`. "Đo" = đầu ra tôi tự chạy ở S5b.

| F | Kỳ vọng tự suy (mục 1) | Căn cứ § | Kỳ vọng trong test | Khớp? |
| --- | --- | --- | --- | --- |
| F1 | 3 bài mọi lượt 0,7: bài được giữ, suy biến; `bootP` p = NA, nA1 = 3, `ceilingTasks` rỗng, CI [0; 0]; `tost` equivalent = false, p = NA; H6 không SUPPORTED | P §2.5 (c) | S: `bootP` p = null, `tost` không equivalent. A: H6 không SUPPORTED, nhãn "không kết luận (suy biến)", không có p = 2,50e-4, Holm "H6: p=NA". Đo: `tost` est 0, CI [0;0], p null, equivalent false; `bootP` nA1 = 3, `ceilingTasks` [], ci90 [0;0] | **Khớp** |
| F2 | 4 bài a = b = [1;1;1]: cả 4 vào `ceilingTasks`, nA1 = 0, hạ xuống ước lượng, p = NA, không CI | P §2.5 (b), (d) | S: 4 bài trần, nA1 = 0, verdict `estimate`, ci90 null. A: H6 "insufficient data", liệt kê 5 bài "bỏ trần", Holm "họ rỗng/K=0" | **Khớp** (A gọi `estimate` là "insufficient data") |
| F3 | (i) a = [0,99×3], b = [0,99;1;1] trần; (ii) b = [1;1;0,998] trần; (iii) có 0,98 giữ; (iv) 0,9899999 giữ | P §2.5 (b) | S: nA1 = 0, 0, 1, 1 đúng thứ tự (i)–(iv). A: "A1: n=3, bỏ trần [l1-modules, t1-duration]" | **Khớp** |
| F4 | `cells` rỗng và 3 bài ngoài tập khai báo: n = 0, nA1 = 0, `estimate`, p = NA, không CI | P §2.5 (a), (d) (⚠ phần "không CI" là suy luận) | S: nA1 = 0, ci90 null; bài `q` ngoài `taskSet` nA1 = 0. A: H6 "insufficient data", "A1: n=0" | **Khớp** |
| F5 | n = 1, 2: `estimate`, CI 90 % hữu hạn, p = NA. n = 3: có p, không suy biến, Δ quan sát +0,067 nên **không SUPPORTED** | P §2.5 (d) | S: n = 1, 2 verdict `estimate`, p null, ci90 hữu hạn; n = 3 verdict `p`, p ∈ [1/4001; 1]. A: n = 1, 2 "insufficient data"; n = 3 có "H6: p=0.\d+" | **Khớp một phần**: mọi vế của n = 1, 2 và "có p" ở n = 3 khớp; test **không khẳng định** "n = 3 không SUPPORTED" (xem m-2) |
| F6 | Δ\* ≡ +0,10: suy biến, p = NA, nhãn "Bác bỏ", CI ≈ [0,10; 0,10] | P §2.5 (c), §2.4 | S: p = null, nhãn "Bác bỏ". A: không SUPPORTED, "not supported — bác bỏ", Holm "H6: p=NA". Đo: `bootP` p null, label và verdict "Bác bỏ", ci90 [0,1; 0,1]; `tost` p null, equivalent false, "Bác bỏ" | **Khớp** |
| F7 | NaN: không được ra p = 1/4001; p = NA, "không kết luận (trần/suy biến)" ở cả hai nhánh suy luận | P §2.5 (c) (⚠ NaN là chỉ thị D12) | S: `bootP` p = null, degenerate; `tost` NaN suy biến, không equivalent. A: không SUPPORTED, không có 2,50e-4, "H6: p=NA". Đo: `bootP` p null, degenerate true, label "không kết luận (suy biến)"; `tost` p null, equivalent false, degenerate true | **Khớp** |
| F8 | (a) hai `bootP([])`: p = NA, `estimate`, nA = 0, k = NA. (b) `estimate` + p ⇒ `estimate`. (c) 'Bác bỏ' + p ⇒ p = NA, 'Bác bỏ'. (d) 'Không kết luận' + p ⇒ p = NA. (e) p = 0,01 và 0,03 ⇒ p = max = 0,03, **không xác nhận theo Holm** | P §2.5 (c), (d); Holm 0,0125 và 0,025 | S: (a) p null, `estimate`, nA = 0, ci90 và k null; (b) `estimate`; (c) p null, 'Bác bỏ', supported false; (d) p null, label suy biến; (e) p = 0,03, verdict `p`, **`supported = true`**, degenerate false. A: (a) "insufficient data/ngoài họ Holm"; (e) "H6: p=0.\d+" | **Khớp (a)–(d)**. **(e) khớp ở p = 0,03** nhưng test đặt `supported = true` ở mức `h6Combine`, còn tôi kỳ vọng "không xác nhận" (mức Holm). Hai kỳ vọng ở hai tầng nên không mâu thuẫn trực tiếp; test A không kiểm Holm cho (e). Xem M-1 |
| F9 | `permTwoSample` H3: recall p = 1, N = 184 756, p_min = 1/184 756; precision p = 1/184 756; p(H3) = 1; mẫu rỗng p = NA; a = [0;0], b = [1;1] ⇒ 1/6; phía `two` không có quy tắc đăng ký | P §2.5 "Nguồn p" | S: N = 184 756, p = 1, pMin đúng, exact; precision p = 1/184 756; max = 1; rỗng p null, N = 0; 1/6. A: "recall p=1.0000 (N=184756)", không SUPPORTED, "không có giả thuyết xác nhận". Thêm: `two` ⇒ 2/6 | **Khớp**. Dòng `two` = 2/6 là phần bổ sung S-2, đăng ký chưa có quy tắc (đúng như mục 2 mục 3) |
| F10 | (i) `[]` p = NA; (ii) 1 bài ⇒ p = 1/2; (iii) bài thiếu arm bị bỏ, n = 1, p = 1/2; (iv) hai bài a = b = [1;1], margin 0 ⇒ p = 1, p_min = 1/36; (v) `maxExact = 1` ⇒ Monte Carlo, p = 1, tái lập | P §2.6 | S: "F10 cơ bản (margin 0 giữ hành vi cũ)". A: không bài ⇒ "chưa có bài nào đủ lượt cả hai arm"; (iv) "T=+0.0 pp, p=1.0000, p_min=0.0278", "dự kiến, chưa khóa". Đo: (ii) n = 1, p = 0,5; (iii) skipped [x], n = 1, p = 0,5; (iv) n = 2, p = 1, pMin = 0,02778; (v) p = 1, exact false, nPerm 10 000 | **Khớp** (nhánh "theo chữ §2.6" của tôi cho (iv)) |
| F11 | H2′ 1 bài trần, `less`, margin 0,05: p thô = 1/6 (r = 2), 1/252 (r = 5) nhưng bài trần **không là bằng chứng điểm**; không `confirmable`. Cách cài chính xác chờ đăng ký | P §2.6, §2.7 | S: bài trần có margin ⇒ p = null, degenerate, `ceilingTasks`, không còn 1/6, 1/252. A: không còn p ≤ 0,00x, không `confirmable=có`, có "chờ đăng ký (S-1)". Đo r = 2 và r = 5: n = 0, p null, degenerate true, `ceilingTasks` [x] | **Khớp** (test chọn p = NA; tôi chỉ yêu cầu "không khóa H2′", nên NA thỏa) |
| F12 | B-01 `logratio`: R = √2 ≈ 1,414 (không phải ln(102/101)). **Tôi kỳ vọng thêm** bootstrap "suy biến" vì mỗi ô một lượt, CI hẳn ngoài biên ⇒ "Bác bỏ", p = NA | P §3.2 B-01 | S: est = ln 2 / 2 (sai số 1e-12), cách xa ln(51/50,5) hơn 0,3. A: dùng dữ liệu khác (3 bài, tỉ số 2, 1, 1): R = 1,260, không phải 1,005. Đo ca của tôi: R = 1,4142, CI [1; 2], p = 0,75, equivalent false, degenerate false, nhãn "Không kết luận" | **Khớp ở R / est** (điểm chính của T-2). **Lệch ở phần suy biến/Bác bỏ: kỳ vọng của tôi sai.** Lấy lại *bài* cũng nằm trong bootstrap hai tầng nên Δ\* biến thiên (ln 2 hoặc 0); tôi chỉ nghĩ đến lấy lại lượt trong ô. Code đúng, kỳ vọng S5a sai. Xem m-1 |

**Tóm lại:** 12 ca: 9 khớp hoàn toàn (F1, F2, F3, F4, F6, F7, F9, F10, F11); 2 khớp một phần (F5, F8: các vế (a)–(d) khớp, vế (e) khác tầng); 1 ca (F12) khớp ở R nhưng phần suy biến trong kỳ vọng S5a sai. Không ca nào lộ lỗi của mã.

### 3.3 Đánh giá T-1, B-1, C-2

- **T-1: Đạt.** `tost`: suy biến (kể cả NaN) ⇒ `p = null`, `equivalent = false`, `degenerate = true`, nhãn `không kết luận (suy biến)`; chỉ khi CI hẳn ngoài biên mới "Bác bỏ" (`stats.mjs` khối `tost`). Đo F1: est 0, CI [0; 0], equivalent false. `analyze.mjs` lan sang H2 (`degenerate` vào `verdict()`), B-01 và H6; test A `T-1 (H2, B-01)` kiểm H2 trần Δ = 0 và B-01 hằng, hai ca trước đây SUPPORTED.
- **B-1: Đạt.** `bootP`: `deltas.every(Number.isFinite)` sai ⇒ `p = null`, `degenerate = true`; cũng áp cho nhánh `n < minTasks`. Đo F7: p null, degenerate true. Không còn đường nào ra 1/(B + 1) khi NaN. `h6Combine` coi `degenerate` là NA kể cả khi `p` bị điền (kiểm `pA1.degenerate || pA2.degenerate`).
- **C-2: Đạt.** `analyze.mjs:143-150`: nhãn H6 lấy `comb.supported`/`comb.label`/`comb.degenerate` từ `h6Combine`, kết hợp `tost.equivalent` của cả hai arm; suy biến ở `bootP` **hoặc** `tost` ⇒ không SUPPORTED (`supported = comb.supported && equiv && !degenerate`). `h6.equiv` không còn quyết định một mình. Còn lưu ý M-1 về Holm, không thuộc phạm vi C-2.

### 3.4 Kiểm không đổi biên, ngưỡng, B = 4000, hạt 20261102

Lọc `+/-` của diff `stats.mjs` + `analyze.mjs` theo `4000|20261102|0.99|0.05|0.0125|0.025|1.15|0.85|1e6|10000|1e-12|margin`:

- **Không đổi:** biên H6 `0.05` (`H6_MARGIN`, dòng ngữ cảnh), biên B-01 `Math.log(1.15)` và `[0,85; 1,15]`, `HOLM_ALPHA = 0.025` (dòng ngữ cảnh), `EPS = 1e-12`, `B = 4000` ở `tost`/`bootP`, `seed = 20261102` ở mọi hàm, `ceil = 0.99` ở `bootP`, `MIN_TASKS = 3`.
- **Thêm có chủ ý, đúng đề:** `H7_MIN_RUNS = 5` (P:174); `permTwoSample` thêm `maxExact = 1e6`, `M = 10000`, `seed = 20261102` (P-2); `permStratified` thêm `ceil = 0.99` (S-1, cùng trần với H6); B-01 truyền `minTasks: MIN_TASKS` và `ceil: 0.99` (T-3, T-6).
- **`--legacy-rng`** vẫn có `SEED = 12345` và LCG (dòng 66-69), có sẵn trước D12, chỉ để tái lập nhãn cũ.
- Kết luận: **không đổi biên, ngưỡng, B hay hạt đã đăng ký.** Các hằng thêm mới đều bắt nguồn từ đề D12 hoặc P:174.

### 3.5 Quy tắc suy hạt A-5

`streamFor(hypId, baseSeed = 20261102) = mulberry32((baseSeed ^ fnv1a32(hypId)) >>> 0)`. **Hạt gốc 20261102 được giữ làm gốc**: `analyze.mjs:67` `SEED = 20261102` (không legacy) rồi `rngFor(id) = streamFor(id, SEED)`. Ngoài `compare()` và hoán vị H10, các hàm có hạt riêng (`tost`, `bootP`, `permStratified`, `permTwoSample`) vẫn dùng thẳng 20261102 cho mỗi lần gọi (không chia sẻ trạng thái nên không phụ thuộc thứ tự). Mã (`stats.mjs` trên `streamFor`) và báo cáo (test A-5 kiểm câu `mulberry32(20261102 ^ fnv1a32(mã giả thuyết))` và "chờ đăng ký") đều ghi đây là quy tắc **chờ Phòng Nghiên cứu đăng ký**, kèm dòng độ nhạy "luồng chung cũ" và test A-5 chứng minh thêm giả thuyết khác không đổi H1/H4. Nhận xét: một số giả thuyết dùng luồng xor-băm, số khác dùng thẳng hạt gốc; không sai nhưng nên nêu rõ trong đăng ký (m-4).

### 3.6 Phát hiện

| Mức | Vị trí | Bằng chứng | Đề xuất | Người nhận |
| --- | --- | --- | --- | --- |
| **M-1 major** (có điều kiện, không phải hồi quy D12) | `analyze.mjs:149`, `:238`; `stats.mjs` `h6Combine` (`supported`) | P §2.4: "Xác nhận: qua phép kiểm (mức Holm) **và** CI vượt biên". Nhãn H6 dùng `verdict(h6.supported…)` = CI một tầng ∧ CI hai tầng ∧ ¬suy biến, **không** đòi `holm.byId.H6.confirmed`; bản `e12e037` cũng dùng `h6.equiv` không Holm. F8(e): `h6Combine` trả `supported = true` với p = 0,03 > 0,025. Tìm ngẫu nhiên 400 mẫu không dựng được ca CI trong biên mà p > 0,025, nên chưa chứng minh khả năng xảy ra | S6 hoặc Phòng Nghiên cứu quyết: hoặc ghép `confirmed` vào nhãn H6 (kèm test), hoặc ghi vào đăng ký rằng nhãn H6 là CI, còn Holm là hàng riêng. Ít nhất đổi tên/ghi chú `supported` | @senior-swe (S6), Phòng Nghiên cứu |
| **m-1 minor** | `analyze-k2.test.mjs` F12; `stats-k2.test.mjs:136` | Test F12 chỉ kiểm est (S) và R = 1,260 (A). Không kiểm nhãn/CI của B-01 theo ca hai bài. Kỳ vọng sai của S5a về "suy biến" cho thấy ca này dễ hiểu nhầm | Thêm khẳng định: ca [1]/[2] + [100]/[100] **không** degenerate, CI [1; 2], equivalent false | @senior-swe |
| **m-2 minor** | `analyze-k2.test.mjs` F5, F8 | F5 n = 3 chỉ kiểm có "p=0.\d+", không kiểm "không SUPPORTED"; F8(e) mức analyze không kiểm Holm | Thêm `assert.ok(!isSupported(h6))` và dòng Holm "không xác nhận" | @senior-swe |
| **m-3 minor** | bằng chứng "test từng đỏ" cho `stats-k2.test.mjs` | Tôi chạy `stats-k2.test.mjs` với `stats.mjs` bản `e12e037`: cả tệp lỗi nạp (`SyntaxError: ... does not provide an export named 'fnv1a32'`), 1 test fail, nên **không chứng minh từng ca đỏ rồi xanh**. S1b chỉ báo đột biến ở `analyze.mjs` (13/23 đỏ). Các ca F ở mức analyze mà S1b ghi vẫn xanh với bản cũ (F2–F5, F7–F10, F12) chỉ là lưới hồi quy | S6 ghi rõ trong tài liệu D12; nếu cần, đột biến từng điều kiện trong `tost`/`bootP` (bỏ kiểm `isFinite`, bỏ `degenerate`) rồi chạy lại | @senior-swe (S6) |
| **m-4 minor** | `stats.mjs` `streamFor`, `analyze.mjs:70-72` | Luồng riêng chỉ cho `compare()`/H10; `tost`/`bootP`/hoán vị dùng thẳng hạt gốc | Khi Phòng Nghiên cứu đăng ký A-5, ghi cả hai loại luồng | Phòng Nghiên cứu |
| **m-5 minor** (tự phê bình S5a) | mục 1, dòng F12 | Kỳ vọng "suy biến, Bác bỏ" sai (xem F12) | Giữ nguyên mục 1 theo quy trình; mục 3 này đính chính | @qa-tester |

**Không có blocker.** Không phát hiện lỗi của mã nào làm sai T-1/B-1/C-2.

### 3.7 Kết luận chung

**Đạt có điều kiện.** `npm run test:bench` xanh 245/245; đầu ra tôi tự đo cho F1, F6, F7, F10, F11 và F12 khớp kỳ vọng độc lập (trừ phần suy biến của F12 mà kỳ vọng S5a sai, mã đúng); T-1, B-1 và C-2 **đạt**; biên, ngưỡng, B = 4000 và hạt 20261102 không đổi; quy tắc suy hạt A-5 giữ hạt gốc và đã gắn nhãn "chờ đăng ký". Điều kiện: M-1 cần có người quyết (S6 hoặc Phòng Nghiên cứu) trước khi khóa H6, vì nhãn H6 chưa đòi mức Holm theo §2.4; các mục minor m-1…m-3 nên xử lý ở S6. Về E6: sửa T-1/B-1/T-5 nằm ở commit `860118b` (S1a, đã có trong lịch sử `stats.mjs` của nhánh này); hash để chép vào RUNLOG vẫn là hash S6 ghi sau kiểm cuối, không dùng hash trung gian.

**Lệnh đã chạy ở S5b:** `git diff e12e037 -- …`, `npm run test:bench` (exit 0, 245/245), script tạm gọi `stats.mjs` (F1, F6, F7, F10, F11, F12; đã xóa), `analyze.mjs` trên dữ liệu giả (đã xóa), chạy `stats-k2.test.mjs` với `stats.mjs` cũ (lỗi nạp module, xem m-3). `npm run typecheck` và `npm test` không chạy lại ở S5b.
