# V4-3f: tính lại số của E8 và ảnh hưởng của `t5-logq` lên G-3

Hạng mục S4 của T-20261112-235700-08d (BRIEF-19 K1/K3). Phân loại dữ liệu: **Nội bộ** (bài tổng hợp, không dữ liệu thật). Không gọi LLM, không chạy benchmark, không sửa `bench/` và `src/`. Không mở `results/e8-parallel/`, `results/b14-step2/`; `results/e7-cto/` chỉ đọc `items.json` và `RUNLOG.md`.

## Tóm tắt

- **E8.** Dựng lại được σ_ln = 0,178, df 24 (CI χ² 95 %: [0,139; 0,247]; §9 ghi cận trên 0,248, lệch làm tròn). Làm tròn lên 10 s **không** làm σ lệch xuống đáng kể: mô phỏng ngược cho σ thật ≈ 0,19 [0,14; 0,29] so với σ quan sát 0,185 ở các arm CCoding; Sheppard cho 0,174. Sai số chủ yếu đến từ cỡ mẫu (df 19, cận trên 0,27), không phải từ làm tròn. Với 6 lượt mỗi ô, 3 bài, giảm 30 %: power 0,98 ở σ = 0,25, 0,73–0,75 ở σ = 0,4; 6 lượt hết đủ (power < 0,9) khi σ > 0,32, hết đủ cho 0,8 khi σ > 0,37.
- **G-3 không nhạy với `t5-logq`.** Giữ nguyên: 1 903/2 097 = 90,7 % [84,3; 95,9], Δ = +0,8 đ.% [−5,4; +8,8]. Bỏ `t5-logq`: 89,9 % [83,0; 96,1], Δ = +0,8 [−6,2; +9,6]. Gán lại nhãn `t5-logq` bằng bộ test đầy đủ: 90,8 % [84,4; 96,0], Δ = +0,7 [−5,5; +8,8]. Mọi trường hợp: p hoán vị 0,74–0,91, CI chứa 0, thay đổi ước lượng ≤ 1,1 đ.%.
- **Hai lỗi G-4 không tái lập** là `t5-logq__A0-sonnet__r6` (đột biến 11) và `t5-logq__B6__r9` (đột biến 1): chúng trượt ở G nhưng đạt 3/3 lần ở máy này với đủ 146 test. Cả hai đều thuộc lượt mà `hTotal` ghi ở G thiếu (111 và 115 trên 146), nhưng 27/30 lượt `t5-logq` thiếu như vậy nên **không phân biệt được** (Fisher p = 1,0). Không dựng lại được hiện tượng thiếu test trên máy này, nên cơ chế là giả thuyết chưa kiểm chứng.

## Tệp đã lưu

| Tệp | Vai trò |
|---|---|
| `docs/research/analysis/v43f-e8-t5logq.mjs` | tính E8 và G-3 (hàm thuần + CLI) |
| `docs/research/analysis/v43f-e8-t5logq.test.mjs` | 14 test |
| `docs/research/analysis/v43f-t5-relabel.mjs` | chạy lại test ẩn của một bài trên mọi đột biến đã ghi ở G |
| `docs/research/analysis/t5logq-probe.mjs` | chạy một lần test ẩn trên artifact (chép logic `hidden()` của `g-mutation.mjs`, vì tệp đó cần `typescript`) |
| `docs/research/analysis/v43f-e8-t5logq/` | `e8.json`, `g3.json`, `g3-table.txt`; `t5-relabel-reps3.jsonl` (360 đột biến × 3 lần), `t5-relabel-reps1.jsonl` (360 × 1, chạy độc lập trước); `t1-duration-…` và `t2-orders-relabel-reps1.jsonl` (mở rộng) |

Mã băm (để đối chiếu thứ tự và phiên bản):
- repo lúc tính: commit `c0680f48e5d47b791a21aa379fa4644fd726489c` (nhánh nhiệm vụ, sau S1).
- script gốc theo yêu cầu: `g-analyze.mjs` ở commit **`d1e8573`** có blob `5b48f55d9d02122904ec869676944331f35844a1`; bản hiện tại (S1 đã sửa) có blob `02b82a096f0162f27115311a4f9e2606a1bfff4e`. Script mới dùng **cả hai**: `analyze()` hiện tại cho số "bản S1", và `bootstrap2Legacy()` (sao đúng logic bootstrap ở `d1e8573`) cho cột "CI bản d1e8573". Chạy kịch bản "giữ nguyên" tái hiện đúng `report.md` ở RUNLOG (CI Δ [−4,7; 7,4]) và đúng số sau sửa của S1 ([−5,4; 8,8]).
- sha256: `g-mutation.jsonl` `5b752ccb…`, `gates-pilot/runs.jsonl` `9e7ce8ca…`, `b7prime/runs.jsonl` `de31f14e…`, `v43f-e8-t5logq.mjs` `730b7618…`, `v43f-t5-relabel.mjs` `8653c2bb…`, `t5logq-probe.mjs` `66f71923…`, `t5-relabel-reps3.jsonl` `2c731d4a…`.

## Dữ liệu

- E8: `wallSec` của lượt `done` ở `results/gates-pilot/runs.jsonl` (28) và `results/b7prime/runs.jsonl` (20), đều có trước E8 và là căn cứ §9 ("Bản chốt E7 và E8", mục σ_ln). 48 lượt, 24 ô (bài × arm).
- G-3: `results/g-mutation/g-mutation.jsonl` (+ `g-rebase.jsonl` rỗng). Artifact: `results/study-cloud/artifacts/` (30 thư mục `t5-logq__*`). Bộ test ẩn và starter: `bench/vs-claude/tasks/t5-logq/`.
- Chạy lại cục bộ (`v43f-t5-relabel.mjs`) trên máy hiện tại (Windows 11, 20 lõi, Node v24.14.0) trong `os.tmpdir()`; G chạy ở container Linux 2 lõi, Node v22.23.4 (`g-mutation.jsonl`, dòng `meta`). Hai môi trường khác nhau: xem Giới hạn.

## Giao thức đánh giá

**E8 (thuần số học trên dữ liệu cũ):**
1. σ_ln gộp trong ô = √(ΣSS / Σ(n−1)) trên ln `wallSec`, bỏ ô n < 2; CI theo χ² (`chi2q`).
2. Làm tròn: `wallSec` của arm CCoding = 10·⌈T/10⌉ + ε, ε ∈ [0,03; 0,36] s (38/38 lượt, không lượt nào là bội của 10 chính xác; 10 lượt `A0-sonnet` không làm tròn, ε tùy ý). Hai cách hiệu chỉnh: (a) Sheppard theo giây (var − h²/12, h = 10), đổi sang ln theo từng ô; (b) mô phỏng ngược: sinh T ~ lognormal(μ ô, σ), làm tròn lên 10 s, tính σ gộp; tìm σ sao cho kỳ vọng bằng σ quan sát (4 000 lần mô phỏng mỗi điểm, chia đôi 22 bước), μ ô = tâm hình học quan sát − 5 s.
3. Power: Δ = TB theo bài của hiệu ln trung bình hai arm; SE = √((σ₁²+σ₄²)/n/3); t với df = 3·(2n−2) = 30; đối chiếu z. Mô phỏng power bằng đúng phép kiểm của `e8/analyze.mjs` (hoán vị nhãn arm trong bài, hai phía, 499 hoán vị, 1 500 lần mô phỏng).
4. MDE và σ tối đa: nghịch đảo của power giải tích (chia đôi).

**G-3:** giữ đúng định nghĩa của `g-analyze.mjs` (recall = bị chặn / lỗi thật, bootstrap hai tầng 4 000 vòng, hoán vị 10 000, hạt giống 20261104). Ba kịch bản + một biến thể dữ liệu thuần:
1. giữ nguyên;
2. bỏ toàn bộ `t5-logq` (cả dòng base lẫn đột biến);
2b. (chỉ từ dữ liệu đã commit) chỉ giữ lượt `t5-logq` có `hTotal` = 146 ở base;
3. "chỉ test ổn định": chạy lại bộ test ẩn **đầy đủ** trên cả 360 đột biến `t5-logq`, 3 lần mỗi đột biến (dựng lại đúng vị trí như `g-repro.mjs`, 360/360 khớp vị trí), rồi đặt `real` = trượt ≥ 1 trong 3 lần (đúng quy tắc giữ mục của E7). `vRed` giữ nguyên từ G. Không có đột biến nào trượt không đều giữa 3 lần (0/360), nên "test ổn định" ở đây là cả 146 test, và kịch bản 3 gồm luôn phương án "bỏ đột biến không ổn định" (không bỏ gì).

## Kết quả

### 1. E8

**Dựng lại σ.**

| Tập ô | σ_ln | df | CI χ² 95 % |
|---|---|---|---|
| Tất cả (24 ô) — khớp §9 | **0,178** | **24** | [0,139; 0,247] |
| Arm CCoding (B7cab, B7cabO, B6; 19 ô) | 0,185 | 19 | [0,140; 0,270] |
| `A0-sonnet` (5 ô) | 0,149 | 5 | [0,093; 0,365] |

Thành phần: `gates-pilot` σ = 0,131 (df 14), `b7prime` σ = 0,227 (df 10). Nhiều ô không có "σ = 0" theo nghĩa chính xác (ε khác 0), nhưng **9/19 ô CCoding có mọi lượt rơi vào cùng một vòng 10 s**.

**Ảnh hưởng của làm tròn 10 s.**

| Cách | σ_ln |
|---|---|
| Quan sát, CCoding | 0,185 |
| Quan sát, chỉ phần k·10 (bỏ ε) | 0,185 |
| Sheppard theo giây, CCoding | 0,174 |
| Sheppard, tất cả 24 ô | 0,169 |
| Kỳ vọng σ quan sát nếu σ thật = 0,10 / 0,178 / 0,25 / 0,40 (mô phỏng) | 0,101 / 0,173 / 0,236 / 0,372 |
| **σ thật suy ngược từ σ quan sát 0,185 (CI χ² 0,140–0,270)** | **0,19** [0,14; 0,29] |

Làm tròn lên 10 s làm σ quan sát thấp hơn σ thật khoảng 3–7 %. Nó không giải thích "lệch xuống": ô có σ nhỏ so với 10 s dồn về một vòng, nhưng ô ngắn lại nhận thêm nhiễu làm tròn, hai tác động ngược chiều, và mô phỏng cho hiệu ròng nhỏ ở các bài 35–165 s này. Đề xuất ghi: σ_ln = 0,178 (df 24) **không lệch xuống đáng kể vì làm tròn**; sự không chắc chắn lớn hơn nằm ở df (cận trên 0,25–0,27) và ở ngoại suy (xem Giới hạn).

**Power và MDE với 6 lượt mỗi ô, 3 bài** (t, df 30; giảm 30 % ⇒ Δ = ln 0,7 = −0,357):

| σ_ln | SE(Δ) | power, giảm 30 % | power, giảm 20 % | MDE, power 0,8 | MDE, power 0,9 |
|---|---|---|---|---|---|
| 0,178 | 0,059 | 1,00 | 0,95 | 15,8 % | 18,0 % |
| **0,25** | **0,083** | **0,98** | 0,74 | **21,4 %** | **24,4 %** |
| 0,30 | 0,100 | 0,93 | 0,57 | 25,1 % | 28,5 % |
| 0,35 | 0,117 | 0,84 | 0,45 | 28,7 % | 32,4 % |
| 0,40 | 0,133 | 0,73 | 0,36 | 32,0 % | 36,0 % |
| 0,50 | 0,167 | 0,54 | 0,24 | 38,3 % | 42,8 % |

- **Khoảng σ mà 6 lượt mỗi ô còn đủ** (giảm 30 %): power ≥ 0,9 khi σ ≤ **0,32**; ≥ 0,8 khi σ ≤ **0,37** (xấp xỉ z: 0,33 và 0,38). Trên 0,37, 6 lượt hết đủ cho 0,8.
- Mô phỏng hoán vị: σ = 0,25 → 0,983; σ = 0,35 → 0,841; σ = 0,40 → 0,747; (σ₁ = 0,25, σ₄ = 0,40) → 0,875. Sai loại I khi không có hiệu ứng: 0,060 (1 500 lần, trong sai số mô phỏng của 0,05). Khớp giải tích (t); số "≈ 0,77" ở §9 là xấp xỉ z (0,763), thận trọng hơn t cho thấy 0,73–0,75.
- Nếu hiệu ứng thật chỉ 20 %: 6 lượt chỉ đạt power 0,74 ngay ở σ = 0,25. §9 chỉ khẳng định power cho giảm 30 %.
- Dữ liệu σ đến từ bài ngắn (35–165 s, 8/48 lượt là bài của E8) và từ cả làn đơn (21 lượt) lẫn làn nhanh (17); không có lượt nào của arm một-agent-so-với-nhiều-agent giống B6w1/B6w4. Mức ngoại suy này là giả định.

**Cơ chế bảo đảm B6w1 không chạy chồng (chỉ đọc `bench/` và `src/`).**

1. **Cấu hình arm** (`bench/vs-claude/arms.json:174–182`): B6w1 đặt `options.maxParallel = 1`, `server: "alt"`, `isolation: "worktree"`. Harness chọn server theo `server: "alt"` (`bench/vs-claude/run.mjs:36–38`, `93–98`).
2. **Chặn nâng trần** (`src/orchestrator.ts:329`): `maxParallel` của nhiệm vụ = `clamp(o.maxParallel ?? defaults.maxParallel, 1, 8)` = 1. Ở làn nhanh, `src/orchestrator.ts:1359–1365` nâng `options.maxParallel` lên `min(số hạng mục gốc, fastLane.maxParallel ?? 4)` nếu lớn hơn. Vì thế B6w1 cần server riêng có `fastLane.maxParallel = 1` (`src/config.ts:405` đặt mặc định 4): khi đó `want ≤ 1` và điều kiện `want > task.options.maxParallel` không thỏa, trần giữ 1. Nếu cấu hình alt thiếu khóa này, B6w1 bị nâng lên bằng B6w4.
3. **Bộ lập lịch** (`src/orchestrator.ts:2104–2108`): `slots = task.options.maxParallel − inflight.size`; chỉ lấy tối đa `slots` hạng mục sẵn sàng (`readySubtasks`, `src/planner.ts:288–298`, đồng thời loại hạng mục cùng người nhận đang bận). Với `slots` = 1, tối đa một hạng mục chạy tại một thời điểm. Các hạng mục chạy lệnh dùng chung worktree còn bị tuần tự hóa thêm (`exclusive`, `writing`, ngay sau dòng 2108).
4. **Kiểm sau khi chạy, không phải ngăn chặn** (`bench/vs-claude/lib/ccoding.mjs:104–114`, `taskTimes`; `bench/vs-claude/e8/analyze.mjs:66–67`): `maxConcSubtasks` là số hạng mục chồng nhau tối đa suy từ mốc `startedAt`/`finishedAt` từng hạng mục; `configCheck.b6w1Overlapping` đếm lượt B6w1 có `maxConc ≥ 2`; `overlapB6w4` đếm lượt B6w4 có `maxConc ≥ 2`. Quy tắc dừng "B6w1 `maxConc ≥ 2` ⇒ dừng đợt" ở §9 do `e78-run.ps1` thực thi; tôi không mở tệp đó nên **không xác nhận** (như S3 đã ghi).
5. **Chỗ hở:** (i) bảo đảm là kết hợp cấu hình (server B) + bộ lập lịch, không có khẳng định (assertion) tại lúc chạy; nếu server B chạy nhầm cấu hình thì chỉ lộ ra sau, qua `maxConc`; (ii) `maxConc` chỉ đo hạng mục ở pha thực thi, không đo pha khác; (iii) `maxConc` = 1 không chứng minh B6w4 đã chạy song song (cần `overlapB6w4`, và kế hoạch phải có ≥ 2 hạng mục gốc).

### 2. G-3 và `t5-logq`

**Số test ẩn ghi ở G.** Dòng `base` của `g-mutation.jsonl` (cùng artifact lúc chạy, `hTotal`): `t5-logq` 30 lượt, **96–146** (18 giá trị khác nhau), chỉ **3/30 đạt 146**, mọi dòng base có `hPass` = true. Cùng hiện tượng ở `t1-duration` (76–149, 29/30 dưới mức cao nhất) và `t2-orders` (20–60, 29/30 dưới mức cao nhất); các bài khác hằng số (`t3-api` 87, `c*` 6–9). Chạy lại trên máy này (3 lần × 360 đột biến): mọi lần đều đủ 146 test (ngoại lệ: 14 đột biến làm module không nạp được, tổng 0 hoặc 1, đều trượt đúng). Không dựng lại được hiện tượng thiếu test, kể cả khi chạy 40 tiến trình song song trên 20 lõi (40/40 đủ 146). Khoảng 123–146 "cùng mã" ở `e7-cto/RUNLOG.md` cũng đến từ container Linux; tôi không có dữ liệu thô của lần đó.

**Hai lỗi G-4 không tái lập.** Chạy lại 360 đột biến × 3 lần: 358/360 nhãn `real` khớp G (lần chạy 1 lần độc lập cũng 358/360, cùng hai đột biến). Hai đột biến lệch **đều là lỗi lọt cổng (G-4)** và đúng là hai mục lỗi `t5-logq` của E7:

| Đột biến | Mục E7 | `hTotal` base ở G | Nhãn ở G | Nay (3 lần, 146 test) |
|---|---|---|---|---|
| `t5-logq__A0-sonnet__r6` #11, `src/query.js:27` ROR `>=` | `563af1e6d7` | 111 | lỗi thật, `npm test` xanh | trượt 0/3 |
| `t5-logq__B6__r9` #1, `src/parse.js:90` LCR `&&` | `fb0117bb43` | 115 | lỗi thật, `npm test` xanh | trượt 0/3 |

- **Có rơi vào phần test dao động không?** Cả hai thuộc lượt có base thiếu test (111 và 115 trên 146). Nhưng 324/360 đột biến đến từ lượt như vậy, và cả hai lệch đều ở nhóm này: 2/324 so với 0/36, Fisher hai phía p = 1,0. Không kết luận được. Số liệu không chỉ ra test nào dao động, vì `g-mutation.jsonl` chỉ giữ tổng, không giữ tên test.
- **Hướng sai ở đây:** nhãn ở G "trượt" nhưng nay đạt trên đủ 146 test, nghĩa là sai là **lỗi thật giả** (bộ test ít hơn mà vẫn trượt), không phải lỗi bị che. Điều này loại giả thuyết đơn giản "thiếu test nên lỗi thật bị ghi là không thật": ở chiều đó có **0 lệch** (49 đột biến "không phải lỗi thật" ở G đều đạt 3/3). `tapScore` tính cả `cancelled` là trượt (`bench/vs-claude/lib/grade.mjs:38`), nên một test bị hủy do hạn giờ khi máy tải nặng có thể gây trượt giả: **giả thuyết, chưa kiểm chứng**, vì không tái hiện được.
- **Mục dự phòng.** Theo `items.json`, mục dự phòng duy nhất của `t5-logq` là đột biến `t5-logq__A0-sonnet__r7` #3; ở đây trượt 3/3. RUNLOG của E7 nói dự phòng "cũng không đạt" trên máy cloud. Hai điều này khớp với việc có thêm nhiễu nhãn trên cloud mà máy này không tái hiện. [CẦN KIỂM] khi có `selected.json`.
- **Lan sang bài khác?** Chạy lại `t1-duration` (252 đột biến) và `t2-orders` (300), 1 lần mỗi đột biến: 252/252 và 300/300 khớp nhãn; 4/4 và 57/57 lỗi lọt cổng vẫn là lỗi thật. Chỉ `t5-logq` có nhãn lệch.

**G-3 trong các trường hợp** (CI hai tầng 4 000 vòng; Δ = TB theo bài, nhóm C − nhóm A; p hoán vị hai phía 10 000):

| Trường hợp | G-3 recall | Nhóm A · nhóm C | G-3Δ (CI bản S1) | CI bản `d1e8573` | p | G-4 lọt cổng |
|---|---|---|---|---|---|---|
| 1. Giữ nguyên | 1 903/2 097 = **90,7 %** [84,3; 95,9] | 91,5 % · 91,4 % | **+0,8** đ.% [−5,4; +8,8] | [−4,7; +7,4] | 0,741 | 194 |
| 2. Bỏ `t5-logq` | 1 605/1 786 = 89,9 % [83,0; 96,1] | 90,6 % · 90,5 % | +0,8 [−6,2; +9,6] | [−5,6; +8,3] | 0,755 | 181 |
| 2b. Chỉ lượt `t5-logq` đủ 146 test ở base | 1 635/1 818 = 89,9 % [83,0; 96,0] | 90,8 % · 90,5 % | −0,3 [−6,9; +8,6] | [−6,4; +7,1] | 0,909 | 183 |
| 3. Gán lại nhãn `t5-logq` bằng 146 test (ổn định) | 1 903/2 095 = 90,8 % [84,4; 96,0] | 91,7 % · 91,5 % | +0,7 [−5,5; +8,8] | [−4,8; +7,5] | 0,755 | 192 |

- Riêng `t5-logq`: 298/311 = 95,8 % (cao hơn trung bình), nên bỏ bài này hạ recall chung 0,8 đ.%; nhóm A/C đều hạ như nhau, Δ không đổi (+0,8).
- **Mức thay đổi so với "giữ nguyên"** (đ.%): recall −0,8 (bỏ t5) / +0,1 (gán lại); Δ 0,0 (bỏ t5) / −0,1 (gán lại); độ rộng CI recall 11,6 → 13,1 / 11,6; độ rộng CI Δ (bản S1) 14,2 → 15,8 / 14,3.
- **Kết luận: G-3 và G-3Δ không nhạy với `t5-logq`.** Mọi thay đổi nằm trong sai số bootstrap; Δ không phân biệt được với 0 ở cả bốn trường hợp. Kho lỗi G-4 đổi 194 → 192 (nhãn) hoặc 181 (bỏ bài), nên kho cho E7 giảm 2 mục `t5-logq`, đúng với E7.
- Bản CI của S1 rộng hơn bản `d1e8573` khoảng 2 đ.% (1,9–2,1) ở mọi trường hợp (hiệu ứng đã ghi ở `v43f-rerun.md`); thứ tự giữa các trường hợp không đổi.

## Phân tích lỗi

- Sự không chắc chắn của `hTotal` (thiếu test ở G) là **chưa được giải thích** và nằm ngoài khả năng tái hiện ở đây; không dùng để suy ngược sửa G-3.
- Giới hạn của kịch bản 3: nó đo nhãn lúc **test đầy đủ**, không đo nhãn đã được dùng ở G. Hai cách đọc cho cùng kết luận (độ nhạy ≤ 1,1 đ.%).
- Thang đo: một lỗi nhãn ở 2/311 = 0,6 % lỗi thật của `t5-logq`; nếu tỉ lệ này đúng cho cả 2 097 lỗi thật, ảnh hưởng tối đa ≈ 0,1 đ.% lên recall.

## Tái lập

```bash
node --test docs/research/analysis/v43f-e8-t5logq.test.mjs
node docs/research/analysis/v43f-e8-t5logq.mjs e8 --json     # → v43f-e8-t5logq/e8.json
node docs/research/analysis/v43f-e8-t5logq.mjs g3 --json     # → v43f-e8-t5logq/g3.json
node docs/research/analysis/v43f-e8-t5logq.mjs g3            # bảng ở trên
# nhãn đầy đủ (cần npm ci để có typescript; ~8 phút ở 8 tiến trình)
node docs/research/analysis/v43f-t5-relabel.mjs --out docs/research/analysis/v43f-e8-t5logq/t5-relabel-reps3.jsonl --reps 3 --jobs 8 --task t5-logq
```

Hạt giống 20261104, B = 4000, M = 10000, `--sims` 4000, `--powsims` 1500. Node v24.14.0.

## Giới hạn

- Máy chạy lại khác máy chạy G (Windows/Node 24.14/20 lõi so với Linux/Node 22.23/2 lõi). Hiện tượng thiếu test không tái hiện, nên kết luận về nhãn là "ở điều kiện test đầy đủ".
- E8: σ ước từ bài ngắn và từ arm một agent, ngoại suy sang B6w1/B6w4 là giả định (đã ghi ở §9 điều kiện 4). Power giả định σ chung giữa hai arm và giữa ba bài; ở σ khác nhau theo arm xem dòng (0,25; 0,40) → 0,875.
- E8: mô phỏng ngược dùng giả thiết lognormal và μ ô = tâm quan sát − 5 s.
- G-3: bốn trường hợp chỉ xử lý nhiễu của `t5-logq`; `t4-perf` đã bị loại từ G (không có đột biến); `t3-api` không có lượt đủ điều kiện (sai lệch G-b).
- Đây là dữ liệu quan sát cho nhãn đột biến, không phải đo năng lực CTO hay con người; G-3 đo bộ test.
