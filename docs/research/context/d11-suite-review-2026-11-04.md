# D11: rà soát bộ đo SR-01…SR-27 (04/11/2026)

Nhãn dữ liệu: Nội bộ. Tài liệu cho Phòng Nghiên cứu. Không sửa `docs/research/paper/`. Hash lấy bằng `git log --grep=SR-xx` rồi đối chiếu với `git log 8b0b6c3..HEAD` (khoảng thêm so với `perf/vs-claude-loop`). Mọi hash dưới đây nằm trong khoảng đó, nên đều là việc của D11.

## 1. Bảng SR → trạng thái → commit

| SR | Trạng thái | Commit / việc cần người |
| --- | --- | --- |
| SR-01 | làm trong D11 | `693e7bc` (lọc done, failReason/excluded, lượt thay), `8473607` (analyze loại excluded) |
| SR-02 | làm trong D11 | `f98b932` (costUsd/costBasis theo bảng giá có phiên bản và model từng lượt; TTL 1 giờ mặc định) |
| SR-03 | làm trong D11 | `00c23c7` (ghi trường), `8473607` (cảnh báo và `--strict` khi nhiều hash) |
| SR-04 | làm trong D11 | `b8d7487` (tost), `0a5c376` (H2, H6, B-01 dùng TOST) |
| SR-05 | làm trong D11 | `69130a8` (định nghĩa size, sizeBasis, sizeLegacy), `e3e3546` (Fisher-Yates), `1e9e3d5` (độ dốc trong coding và có điều chỉnh loại, kèm CI; size từ task.json) |
| SR-06 | làm trong D11 | `e3e3546` |
| SR-07 | làm trong D11 | `8473607`, `926d98f` |
| SR-08a | cần người | Mã đã xong (`c6273b2` giám khảo 2 và đồng thuận; `ba46870` phiếu 20 % ẩn danh). Việc cần người: giám đốc gán nhãn tay trên phiếu rồi đối chiếu nhãn người với giám khảo. Chưa có nhãn người nên chưa có số đồng thuận người–máy. |
| SR-08b | làm trong D11 | `c6273b2` |
| SR-09 | làm trong D11 | `ecc86ff` |
| SR-10 | làm trong D11 | `7d33e38` |
| SR-11 | làm trong D11 | `4ca5119` (ba bài a2/re2/s2), `717cd6a` (insufficient data khi dưới 3 bài) |
| SR-12 | làm trong D11 | `0a5c376` |
| SR-13 | làm trong D11 | `06d16b1`, `9ad70d7`, `c094c04` (grader), `d7097b1` (H8 trong analyze) |
| SR-14 | làm trong D11 | `4d1d85a` |
| SR-15 | làm trong D11 | `f1ad168` |
| SR-16 | làm trong D11 | `096e47d` (l1, l3), `19b8d8e` (grader so JSON không phụ thuộc thứ tự khóa) |
| SR-17 | làm trong D11 | `45b655f` |
| SR-18 | làm trong D11 | `92cb48d` |
| SR-19 | làm trong D11 | `00c23c7`, `693e7bc` |
| SR-20 | làm trong D11 | `b005c54` (mulberry32, fisherYates), `e3e3546` (hạt ghi vào báo cáo, `--legacy-rng`) |
| SR-21 | làm trong D11 | `372f07e` |
| SR-22 | làm trong D11 | `3c8a84f` |
| SR-23 | làm trong D11 | `1d4e90f` |
| SR-24 | làm trong D11 | `16e6ff8` |
| SR-25 | làm trong D11 | `deaf395` (permStratified), `e49c7e2` (H1′/H2′) |
| SR-26 | làm trong D11 | `f1180a0` (permTwoSample, bootP, h6Combine), `0a5c376`, `926d98f` |
| SR-27 | làm trong D11 | `3345d6a` |

Không SR nào được đánh "đã có": tôi không tìm thấy commit nào trước `8b0b6c3` mang mã SR-xx và làm xong việc. Phần B-13 ghi `model` theo pha có từ trước và SR-02 dựa vào đó, nhưng việc tính `costUsd` theo model là `f98b932`.

## 2. Bảng số cũ → mới

Chạy lại trên bản sao `runs.jsonl`, ra thư mục tạm, không ghi đè `report.md` trong `results/`. Số cũ lấy từ mốc D8 (`docs/research/context/d11-baseline/`). Số mới từ `analyze.mjs --allow-mixed-judge` ở HEAD (RNG mulberry32, `size` từ task.json). Với `study-cloud`, tôi còn chạy `--legacy-rng`: H1 và H10 trùng mốc (test `SR-26 ca 9`).

**`study-cloud-final`: không chạy lại được.** Thư mục không có `runs.jsonl` (chỉ có `analyze-A1.md`, `analyze-A2.md`, `README.md`), nên không có số cũ hay số mới. Mốc D8 cũng thiếu vì lý do này.

### study-cloud (440 lượt, 8 dòng infra bị loại)

| Chỉ số | Số cũ | Số mới | Lý do |
| --- | --- | --- | --- |
| H1 | +2,4 pp [0,0; +7,7], tasks=7, not supported | +2,8 pp [0,0; +9,0], tasks=6, not supported | SR-05: `size` mới làm một bài rơi khỏi nhóm size ≥ 3. CI đổi thêm do SR-20 (RNG). Phán quyết không đổi. |
| H2 | +2,8 pp, tasks=4, **SUPPORTED** | cùng ước lượng; TOST90 [0,0; +8,3 pp]; **not supported** | SR-04: phán theo cận trên CI 90 % ≤ +5 pp, không theo ước lượng điểm. **Phán quyết đảo.** |
| H3 | recall +0,0 / precision +0,0 pp, not supported | cùng ước lượng, kèm CI; chỉ 1 bài review nên **insufficient data**; B2 vắng nên tên đổi, không cô lập hiệu ứng review | SR-10, SR-11, SR-26 |
| H4 | +1,5 pp, tasks=1, not supported | cùng ước lượng, **insufficient data** | SR-11 (1 bài) |
| H5 | tokens ×6,2, thời gian ×9,1, 100 %, SUPPORTED | giống hệt | SR-06 không đổi số ở dữ liệu này |
| H6 | B0−A1 +0,7 [0,0; +2,6]; B0−A2 +0,5 [0,0; +1,9]; **SUPPORTED** | B0−A1 +0,7 [0,0; +2,2]; B0−A2 +0,5 [0,0; +1,9]; tập khai báo n=0 ở cả A1 và A2; **insufficient data** | SR-04, SR-12, SR-26: phán theo tập bài khai báo (§2.5 (a)) và cả A1, A2 phải nằm trong ±5 pp. **Nguyên nhân đã kiểm:** A1/A2 trong `study-cloud/runs.jsonl` chạy trên bộ bài khác (c1–c5, l1-oncall, l2-knights, l3-reconcile, l4-startup-order, r1-elk-design, re1-lit-synthesis, a1-ambiguous-spec, s1-sec-review), không trùng bài nào trong tập khai báo `H6_TASKS` (l1-modules, l2-chain, t1…t5). Không phải lỗi khớp tên hay thiếu lượt; tập khai báo cố định theo §2.5 (a) nên n=0 là kết quả đúng, và phán quyết cũ dựa trên tập bài không khai báo. **Phán quyết đảo.** |
| H7 | trung vị tỉ số SD 1,00 trên 18 bài, not supported | tỉ số SD gộp 0,00 [0,00; 1,00] trên 13 bài (10 bài sd(A0)=0 vẫn tính), **SUPPORTED**; trung vị cũ vẫn 1,00 | SR-14. Tỉ số 0,00 nghĩa là sd gộp của B0 bằng 0; điểm B0 gần như luôn 1,0 (trần), nên đây là hiệu ứng trần, không nên đọc là B0 ổn định hơn. **Phán quyết đảo.** |
| H8 | tỉ lệ thiếu sản phẩm 0 % vs 0 %, not supported | **insufficient data** | SR-13: dòng cũ không có `untouchedFileFailures`/`redAtEnd` (S5 mới ghi). `formatMiss` còn là chỉ số phụ. |
| H9 | +0,0 pp, not supported | **insufficient data** | SR-11 (dưới 3 bài research) |
| H10 | độ dốc −0,1 pp/phần, p=0,927, tasks=18 | độ dốc +1,1 pp/phần, p=0,129, tasks=18, not supported | SR-05: `size` mới (D7) và Fisher-Yates. Với `--legacy-rng`, `size` ghi trong dòng chạy được giữ nên ra số cũ. |
| H10-coding (mới) | không có | −0,0 pp [−0,0; +0,0], tasks=10, not supported | SR-05 (i, ii) |
| H10-adj (mới) | không có | −0,1 pp [−0,6; +0,0], tasks=18, not supported | SR-05 (i, ii) |
| Bảng điểm theo loại | cột Overall | thêm cột "Overall theo loại": B0 1,00; A0-sonnet 0,97 (Overall theo lượt 0,99) | SR-22 |
| Holm {H3, H6}, H1′, H2′, B-01a–c | không có | họ rỗng (K=0); H1′ T=+0,0 pp, p=0,9167; H2′ và B-01 thiếu dữ liệu | SR-25, SR-26, SR-04 (S6) |

### b7prime (20 lượt, chỉ arm A0-sonnet nên baseline = treatment)

| Chỉ số | Số cũ | Số mới | Lý do |
| --- | --- | --- | --- |
| H1, H5, H10 | +0,0 pp; 0 %; +0,0 pp | không đổi | |
| H2, H4, H9, H6 | insufficient data | insufficient data | |
| H3 | insufficient data | insufficient data (thêm CI, nhãn B2 vắng) | SR-10 |
| H7 | trung vị 1,00 trên 5 bài, not supported | tỉ số gộp 1,00 [1,00; 1,00], 5 bài sd(A0)=0 vẫn tính, not supported | SR-14 |
| H8 | not supported | insufficient data | SR-13 |
| H10-coding, H10-adj (mới) | không có | +0,0 pp, tasks=5, not supported | SR-05 |

## 3. Trường mới (hợp đồng D1, D2)

`runs.jsonl` (D1). Dòng cũ thiếu trường: `excluded` coi là null, các trường khác coi là không biết, không điền mặc định giả.

| Trường | Giá trị |
| --- | --- |
| `status` | `done` hoặc trạng thái lỗi; analyze chỉ tính `done` |
| `excluded` | `'quota'`, `'leak'`, `'timeout'` hoặc null |
| `failReason` | `'quota'`, `'timeout'`, `'error'` hoặc null |
| `ccodingCommit` | hash CCoding |
| `claudeCliVersion` | chuỗi hoặc null |
| `models` | pha → model |
| `window`, `quotaState` | chuỗi hoặc null |
| `timeoutMin` | số |
| `costUsd`, `costBasis` | `pricing@<ver>/<ttl>` hoặc `unknown-model` |

`details` của grader (D2): `formatMiss`, `untouchedFileFailures`, `redAtEnd`, `decoyHits`, `citationValidity` (đọc alias `citationPrecision` cho dữ liệu cũ), `judge`, `judge2`, `judgeAgreement`.

`task.json`: `size`, `sizeBasis`, `sizeLegacy`, `set` (`exploratory` cho a2/re2/s2). Cờ `analyze.mjs`: `--allow-mixed-judge`, `--strict`, `--legacy-rng`, `--b01-arm`.

## 4. Oracle, null, nearmiss (S4), `run.mjs --repeats 1`

| Bài | oracle | null | nearmiss |
| --- | --- | --- | --- |
| a1-ambiguous-spec | 1.00 | 0.00 | 0.83 |
| a2-oncall-sms | 1.00 | 0.00 | 0.83 |
| c1-iis-ecs | 1.00 | 0.00 | 0.50 |
| c2-burst-alert | 1.00 | 0.00 | 0.86 |
| c3-shop-bugs | 1.00 | 0.17 | 0.83 |
| c4-audit-chain | 1.00 | 0.00 | 0.86 |
| c5-tickets-api | 1.00 | 0.22 | 0.89 |
| g1-slug-dedupe | 1.00 | 0.22 | 0.67 |
| g2-cart-coupon | 1.00 | 0.11 | 0.89 |
| g3-qty-rename | 1.00 | 0.13 | 0.75 |
| g4-gb-unit | 1.00 | 0.00 | 0.88 |
| g5-median-stats | 1.00 | 0.11 | 0.67 |
| g6-range-merge | 1.00 | 0.11 | 0.89 |
| l1-modules | 1.00 | 0.00 | 0.97 |
| l1-oncall | 1.00 | 0.00 | 0.67 |
| l2-chain | 1.00 | 0.01 | 0.95 |
| l2-knights | 1.00 | 0.00 | 0.67 |
| l3-reconcile | 1.00 | 0.00 | 0.75 |
| l4-startup-order | 1.00 | 0.00 | 0.67 |
| r1-elk-design | 1.00 | 0.00 | 0.88 |
| re1-lit-synthesis | 1.00 | 0.00 | 0.86 |
| re2-stream-synthesis | 1.00 | 0.00 | 0.86 |
| s1-sec-review | 1.00 | 0.00 | 0.86 |
| s2-support-review | 1.00 | 0.00 | 0.83 |
| t1-duration | 1.00 | 0.00 | 0.94 |
| t2-orders | 1.00 | 0.53 | 0.98 |
| t3-api | 1.00 | 0.13 | 0.99 |
| t4-perf | 1.00 | 0.84 | 0.95 |
| t5-logq | 1.00 | 0.01 | 0.97 |

Oracle đạt 1,00 ở 29/29 bài. Nearmiss < 1,00 ở mọi bài (cao nhất 0,99). Null ≤ 0,25 ở 27/29 bài; hai ngoại lệ có từ trước: `t2-orders` 0,53 và `t4-perf` 0,84.

## 5. checkCommands của `ccoding-research` (D10)

**Không đọc được cấu hình.** Lý do: hook `claude-guard` chặn đọc đường dẫn ngoài worktree (lệnh tìm trong `/c/Users/admin/CCoding/projects` bị từ chối), và worktree không chứa bản sao cấu hình dự án `ccoding-research` (tìm `checkCommands` chỉ ra mã nguồn và tài liệu, không có giá trị cấu hình). Tôi không đoán lệnh, nên **ba lệnh `checkCommands` chưa chạy**. Hạng mục này đánh **cần người**: người có quyền đọc cấu hình dán nội dung `checkCommands` vào đây rồi chạy ba lệnh.

## 6. Kiểm tổng

| Lệnh | Exit | Kết quả |
| --- | --- | --- |
| `npm run typecheck` | 0 | sạch |
| `npm test` ×3 | 0, 0, 0 | mỗi lần 331 test, 328 pass, 0 fail, 3 skipped |
| `node --test bench/vs-claude/test/` | **1** | Node 24 không nhận thư mục: `test at bench\vs-claude\test:1:1 ✖ 'test failed'`, 0 test chạy. Lỗi dạng lệnh, không phải lỗi test. |
| `node --test "bench/vs-claude/test/*.test.mjs"` | 0 | 181 test, 181 pass, 0 fail |
| `run.mjs --arms oracle,null --repeats 1` | 0 | oracle 1,00 ở 29/29 bài |
| `git diff --stat perf/vs-claude-loop...HEAD -- docs/research/paper` | 0 | rỗng |
| `git diff perf/vs-claude-loop...HEAD -- bench/vs-claude/lib/ccoding.mjs` | 0 | không có dòng nào chứa `gateDecisions`; `ccoding.mjs`, `claude-cli.ts`, `selfimprove.ts` không đổi |

## 7. Kiểm đột biến (D9) cho phần S7

Mỗi SR có test trong `bench/vs-claude/test/analyze-sr.test.mjs`. Mỗi đột biến làm đúng test tương ứng đỏ, rồi mã được khôi phục:

| SR | Đột biến | Test đỏ |
| --- | --- | --- |
| SR-11 | `MIN_TASKS = 0` | `SR-11: dưới 3 bài ⇒ insufficient data…` |
| SR-10 | H3 luôn so với `BASE`, không dùng B2 | `SR-10: có B2 ⇒ H3 so B0 với B2…` |
| SR-13 | verdict H8 quay lại theo `formatMiss` | `SR-13: H8 cặp theo bài…` |
| SR-14 | lọc bỏ bài sd(A0)=0 | `SR-14: H7 dùng phương sai gộp…` |
| SR-22 | cột "Overall theo loại" tính theo lượt | `SR-22: cột Overall theo loại…` |
| SR-05 | `sizeOf` quay về `r.size` | `SR-05: H1 và H10 dùng size mới…` |
| SR-05 | H10-adj dùng OLS thường | `SR-05: H10-coding và H10-adj…` |

Có một sửa ngoài SR: `hRow` trong test tách dòng theo `/\r?\n/`, vì `report.md` mốc D8 có CRLF khiến test SR-26 ca 9 đỏ (S4 đã báo).


## 6. Lệnh test của bench

`node --test bench/vs-claude/test/` **không dùng được** trên Node 24 (coi thư mục là module, chạy 0 test, exit 1). Dùng `npm run test:bench` (= `node --test "bench/vs-claude/test/*.test.mjs"`), thêm trong D11 ở S7-fix. Đây là sai lệch có chủ đích so với tiêu chí gốc.
