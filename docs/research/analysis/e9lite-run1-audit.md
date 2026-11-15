# Audit E9-lite run1: sai lệch lúc chạy và tính đúng của phân tích [Khám phá]

BRIEF-25, hạng mục K2 (@methodologist), 15/11/2026. Nhãn dữ liệu: **Nội bộ**. Chỉ đọc `runs.jsonl`, `report.md`, `e9lite.mjs`; không sửa chúng. Mọi con số dưới đây lấy từ tệp, có dẫn `tệp:dòng` hoặc tên hàm.

**Giới hạn của chính audit này (nói trước).** Trong phiên này hook của CCoding chặn `node`, `sha256sum` và vòng lặp shell. Vì vậy: (i) tôi **không chạy lại** `e9lite.mjs` và không tự băm tệp; các sha256 của `gold.json`, `labels.json`, `report.md` ở dưới là của K1 và RUNLOG, **chưa được tôi tự kiểm lại** (xem mục 6); (ii) mọi đối chiếu trên `runs.jsonl` làm bằng `Grep` (đếm dòng khớp mẫu) và `Read` từng dòng; (iii) bài tính tay ở mục 4 là tính bằng tay từ các dòng đã đọc, không dùng script.

## 1. Bảng đối chiếu §9 với thực tế

Kết luận: **Khớp** / **Khớp, có ghi chú** / **Lệch**. §9 = `docs/research/preregistration.md`; (4) và (7) là các mục trong khối "Sai lệch E9 → E9-lite" (dòng 1358–1389).

| # | Mục | §9 yêu cầu | Thực tế (dẫn chứng) | Kết luận |
|---|---|---|---|---|
| 1 | Lệnh | `run.mjs --arms P-H,P-S,P-O --tasks <13 bài> --repeats 3 --seed e9lite-1 --out …/run1/` (§9 (4), dòng 1363–1365) | `run1/config.json:2-26` (argv): đúng 3 arm, đúng 13 bài theo đúng thứ tự §9 (dòng 1364), `--repeats 3`, `--seed e9lite-1`, `--out bench\vs-claude\results\e9lite\run1`. **Thêm** cờ môi trường `--runtime claude-cli --ccoding-url http://127.0.0.1:7441 --ccoding-data … --work … --timeout 30`. Hai chỗ cần biết: `config.json` ghi `startedAt` 2026-11-15T00:15:50Z, tức là **lần chạy thứ 3** (ghi đè các lần trước); RUNLOG (mục "Bản ghim và môi trường") chép lệnh không có `--work` còn `config.json` có | **Khớp, có ghi chú.** Lõi lệnh khớp; cờ thêm là cấu hình môi trường (§9 (4) nói "server CCoding đang chạy, runtime thật"), không đổi arm/bài/lặp/seed. `config.json` chỉ chứng minh lần 3; lần 1-2 dựa vào RUNLOG (chưa có bản `config.json` riêng) |
| 2 | `--seed e9lite-1` | seed chuỗi `e9lite-1` | `config.json` `cfg.seed` = `"e9lite-1"`; RUNLOG dòng lệnh | **Khớp** (cho lần 3 qua `config.json`; lần 1-2 qua RUNLOG) |
| 3 | Thứ tự | `--dry-run` lưu thứ tự trước lượt đầu; thứ tự do seed quyết định (§9 (4), dòng 1368) | `order-dry-run.txt` có dòng tiêu đề + 117 khóa (dòng 2-118). Đối chiếu từng vị trí: khóa thứ k của `order-dry-run.txt` (dòng k+1) = `key` ở **dòng k của `runs.jsonl`**, k = 1…117; kiểm theo từng khối bài (t5, l1, t4, t3, g6, t2, g2, g3, t1, g4, g5, g1, l2) rồi toàn chuỗi, không thấy chỗ lệch. Dòng 118-121 là bốn lượt chạy lại, theo đúng thứ tự vị trí của khóa trong dry-run: `t5-logq__P-H__r3` (vị trí 9), `t2-orders__P-O__r3` (52), `l2-chain__P-O__r3` (116), rồi `t2-orders__P-O__r3` lần 3. Mốc giờ tăng dần ở 121 dòng. Đối chiếu RUNLOG: lần 1 = dòng 1-117 (114 done, failed ở dòng 9, 52, 116) = "114/117"; lần 2 = dòng 118-120 (done, failed, done) = "116/117"; lần 3 = dòng 121 = "117/117" | **Khớp.** Hạn chế: so sánh bằng mắt trên hai danh sách đã đọc, chưa có lệnh `diff` tự động (lệnh gợi ý ở mục 6). Sha256 `order-dry-run.txt` `a6aa656f…` (RUNLOG) chưa tự băm |
| 4 | Bản ghim: commit | `fcd45f2a` | `ccodingCommit` = `fcd45f2a74abc394e4bfde667337033890fb3d1c` ở **121/121** dòng (Grep đếm dòng khớp cả `ccodingCommit` và `claudeCliVersion`) | **Khớp** |
| 5 | Bản ghim: CLI | `2.1.318` | `claudeCliVersion` = `2.1.318 (Claude Code)` ở 121/121 dòng | **Khớp** |
| 6 | `configHash` | ba arm chỉ khác nhau do `planModel`; một băm mỗi arm (§9 (4), dòng 1368) | Ba giá trị: P-O `ac85f28f691d513d`, P-S `eb387b24eda0a7ba`, P-H `fd30e80723e5485a`. Đếm dòng có đúng cặp (arm, băm) này = **121/121**. Ba băm khác nhau. Lượt chạy lại cùng băm với lượt đầu (xem mục 2) | **Khớp.** `stopFlags()` của script cũng không báo cờ dừng (script in bảng, không in "CỜ DỪNG") |
| 7 | sha256 `gold.json`, `labels.json` | `gold.json` `ee49fc5d…ed312f`; `labels.json` `40596992…694025` (§9 dòng 1479-1480) | RUNLOG (mục "Bản ghim và môi trường" và dòng đầu của "Nhật ký của script"): `gold.json=ee49fc5da243`, `labels.json=4059699277ab` (12 ký tự đầu); K1 báo `cmp`/sha256 đủ 64 ký tự khớp `report.md` dòng 127-128 | **Khớp theo RUNLOG và K1; tôi chưa tự băm lại** (hook chặn `sha256sum`). Cần người có quyền chạy kiểm (mục 6) |
| 8 | Arm/model | `planModel` = `haiku`/`sonnet`/`opus` theo arm; model thật chứa tên đó (§9 (7), dòng 1386) | 121/121 dòng có `planModel.match: true` và cặp (`arm`, `actual`) = (`haiku`, `claude-haiku-5-5`), (`sonnet`, `claude-sonnet-5-5`), (`opus`, `claude-opus-5-5`) (Grep đếm = 121). `planModel.source`: `task` ở dòng done, `null` ở dòng failed (ví dụ `runs.jsonl:52`) | **Khớp.** Không có dòng model lệch (script in "dòng model lệch bị loại: 0", `report.md:3`) |
| 9 | `authSource` | không lẫn phiên đăng nhập và khóa API trong cùng đợt (§9 (7), dòng 1389) | 117 dòng `done` có `"authSource":"none"` (Grep đếm = 117). 4 dòng `failed`: `authSource: null` (dòng 52 đọc trực tiếp). Không có giá trị chứa `key`/`api` | **Khớp.** Ghi chú: `null` ở dòng failed là dòng không đến được bước ghi nguồn xác thực; `stopFlags()` bỏ `null` (e9lite.mjs, chú thích M1), đúng với ý của (7) |
| 10 | Quy tắc chạy lại: chạy tiếp bằng đúng lệnh, cùng `--out`, `--seed` (§9 (7) dòng 1385; README dòng 231) | Khóa `done` bị bỏ qua, `failed` chạy lại | `runs.jsonl` **chỉ thêm dòng ở cuối** (không sửa dòng cũ): dòng 118-121 là lượt chạy lại. Không khóa nào có hai dòng `done` (117 khóa, 117 dòng done: 121 − 4). Khóa chạy lại: `t5-logq__P-H__r3` (done ở dòng 118), `l2-chain__P-O__r3` (done ở 120), `t2-orders__P-O__r3` (failed ở 119, done ở 121) | **Khớp** |
| 11 | Chạy lại cùng khóa và cùng cấu hình | Khóa = (bài, arm, rep): không thể khác arm hay bài | Cả 4 dòng failed và 4 dòng chạy lại cùng `key`, `task`, `arm`, `rep` (đọc dòng 52, 119, 121). `configHash` và `planModel.actual` của lượt chạy lại trùng lượt đầu: `ac85f28f691d513d`/`claude-opus-5-5` (P-O, dòng 52 so với 121), `fd30e80723e5485a`/`claude-haiku-5-5` (P-H). Kiểm 121/121 dòng có đúng băm của arm mình | **Khớp** |
| 12 | Ca "cổng kế hoạch chặn" | §9 (7) không quy định cách báo ca này; chỉ có ca model lệch và ca hạ tầng (dòng 1386-1387) | RUNLOG dòng "Bốn dòng failed": cả 4 do cổng luật B (i). `causeOf()` (e9lite.mjs:89-94) không có nhóm này | **Lệch (chưa có quy định), đã xử lý:** khối §9 mới, chỉ thêm (mục 7) |
| 13 | Số dòng | 117 khóa done + failed báo riêng | 121 dòng = 117 done + 4 failed. 117 khóa; mỗi arm 39 done (script: 117 lượt tính, `report.md:3`) | **Khớp** |
| 14 | Người điều phối không xem kế hoạch/số đo khi chạy | RUNLOG (đầu tệp) và brief | Không có trong dữ liệu để kiểm; chỉ là lời khai của RUNLOG | **Không kiểm được từ dữ liệu**; ghi nhận là lời khai |

## 2. Bốn dòng `failed` và hai cách đếm (kiểm lại từ `runs.jsonl`)

Mỗi dòng: `status: "failed"`, `planRaw`/`planFinal`/`planGate`/`replanCount` đều `null`, **không có trường `error`**, `authSource: null`, `planModel.source: null`.

| Dòng | Khóa | Giờ UTC | wallSec | Token có trọng số | Nguyên nhân (nhãn tay, theo RUNLOG) | Nhãn `causeOf()` | Kết cục khóa |
|---|---|---|---|---|---|---|---|
| 9 | `t5-logq__P-H__r3` | 23:04:19 | 60,3 | 105 551 | cổng kế hoạch chặn | `failed` | dòng 118 `done` |
| 52 | `t2-orders__P-O__r3` | 23:37:22 | 100,2 | 109 014 | cổng kế hoạch chặn | `failed` | dòng 119 `failed`, dòng 121 `done` |
| 116 | `l2-chain__P-O__r3` | 00:12:06 | 90,2 | 110 264 | cổng kế hoạch chặn | `failed` | dòng 120 `done` |
| 119 | `t2-orders__P-O__r3` | 00:14:49 | 80,2 | 90 376 | cổng kế hoạch chặn | `failed` | dòng 121 `done` |

- **Hiệu chỉnh một câu của K1.** K1 viết bốn dòng "không có `usage`". **Sai:** cả bốn dòng có `usage.tokens` (ví dụ `runs.jsonl:52`: `weighted` 109 014, pha `plan` 99 031). Lượt bị chặn đã tiêu token: tổng **415 205** (P-H 105 551; P-O 309 654). Không ảnh hưởng số chính, vì `selectRuns()` chỉ giữ dòng `done`. Đã ghi vào khối §9 mới mục (c) như số mô tả.
- **Nhãn `causeOf()`.** Không dòng nào có `error`, nên chuỗi `e` rỗng và hàm trả `r.status` = `failed` (e9lite.mjs:89-94: `return e ? 'lỗi-khác' : (r.status ?? 'không-rõ')`). Regex hạ tầng `/403|rate|hạn mức|quota|ngắt|ECONN|infra/i` chạy trên chuỗi rỗng nên **không bị chuỗi con `rate` gán nhầm**. Dòng in ở `report.md:4`: `{"P-H":{"failed":1},"P-O":{"failed":3}}` đúng với dữ liệu. Nhưng nhãn `failed` **không phân biệt** cổng chặn và hạ tầng; nhãn "cổng kế hoạch chặn" chỉ là lời khai RUNLOG (người điều phối đọc `attention.reason` trong `task.json` giữ trên máy chạy). `runs.jsonl` không có `error`/`planGate` để tự kiểm. Đây là điểm yếu bằng chứng, đã nêu trong khối §9 (d).
- **Hai mẫu số (khớp `report.md:148-153`):**
  - (a) số dòng không `done`: P-H 1, P-S 0, P-O 3, tổng 4;
  - (b) khóa có lượt đầu không `done` trên 39 khóa mỗi arm: P-H 1/39, P-S 0/39, P-O 2/39 (3 dòng trên 2 khóa), tổng 3/117. Khóa không `done` sau cùng: 0.
- `selectRuns()` (e9lite.mjs:75-88) đẩy **mọi** dòng không `done` vào `firstFail`, nên `report.md:4` đếm 4 dòng. Tên biến `firstFail` dễ gây nhầm (không chỉ lượt đầu); chỉ là tên, kết quả đúng.

## 3. Xác nhận định nghĩa §9 cho các số chính của `report.md`

Đọc mã `e9lite.mjs` (dòng theo hàm; số dòng gần đúng khi chỉ ghi hàm) và so từng thước với §9.

| Thước | Định nghĩa §9 | Mã | Kết luận |
|---|---|---|---|
| Luật khớp tệp | §9 (5) dòng 1371: đổi `\`→`/`; bỏ `./` đầu; cắt tiền tố `<repoDir>/` hoặc `<id>/<repoDir>/`; khớp chính xác, phân biệt hoa thường | `normPath()` (e9lite.mjs:18-25): đổi `\`, `while startsWith('./')`, thử `${taskId}/${repoDir}/` rồi `${repoDir}/`; khớp bằng `Set.has` (chính xác). `repoDir` đọc từ `task.json` (main, dòng 273-274) | **Khớp** |
| Chuẩn `G_f`, `G_m` | §9 (S1): `change` ∈ {added, modified}; `G_m` suy từ `G_f` bằng `modOf` | `rowMetrics()`: `changedFiles(gold)` (nhập từ `e9lite-labels.mjs`); `gm` = module của `cf`; `gm2` = `mod2Of` | **Khớp** (hàm lọc nằm ở `e9lite-labels.mjs`, tôi không đọc thân hàm; kết quả tay ở mục 4 khớp `labels.json`: g1 1 tệp, t2-orders 4 tệp, t5-logq 4 tệp) |
| Độ phủ tệp, module | §9 (5) dòng 1372: \|G∩P\|/\|G\|; `G_f` rỗng → NA | `coverage()` (e9lite.mjs:36-40): rỗng → `null`; còn lại n/\|G\|. Tính riêng cho `raw` và `final` (vòng `for [name, plan]`); `covMod`, `covMod2` | **Khớp** |
| Chia thừa | §9 (5) dòng 1373: chỉ bài "không chia được"; \|plan\| > 1 | `if (label === 'khong_chia_duoc') m[name.overSplit] = arr.length > 1 ? 1 : 0`; và `analyze()` bỏ `overSplit` ngoài tầng không chia được (dòng 212) | **Khớp**. `report.md` chỉ có `overSplit` ở tầng `khong_chia_duoc` (dòng 69, 73, 82, 86, 112-113, 116-117) |
| Số hạng mục, `replanCount` | §9 (5) dòng 1374 | `m['…items'] = arr.length`; `replanCount` = số nếu `typeof === 'number'` | **Khớp** |
| `gateFirst` | Khối đính chính BRIEF-24b (§9 dòng 1455-1462): `planGate` null/không phải đối tượng → 0; `replanned === true` → 0; còn lại 1 ⇔ `replanCount === 0` | `gateFirst()` (≈ e9lite.mjs:46-51): ba nhánh y hệt; không đọc `ok`. `gateCounters()` đếm `nGateNull`, `nReplanCountMissing`, `nReplanned` (đếm `replanned === true` **chỉ khi `planGate` là đối tượng**, nhánh `else if`) | **Khớp.** Hiệu chỉnh nhỏ: `report.md:5` in bằng chữ ("planGate null…: 0; replanCount thiếu: 0; dòng replanned: 8"), không in tên `nGateNull`/`nReplanCountMissing` như §9 (dòng 1466); số tương đương |
| Kiểm chéo `replanned` | — | Dòng `done` có `replanCount > 0` = 8 theo K1 (P-O 3, P-H 2, P-S 3); khớp `report.md:5`. Tôi tìm thấy tay `replanned: true` ở `runs.jsonl:1`, `:7`, `:8` (P-O t5-logq, 3 lượt) và `:105` (P-S g1-slug-dedupe r3), phù hợp | **Khớp** (kiểm chéo từng phần, không đếm đủ 8 từ đầu) |
| Token có trọng số | §9 (5) dòng 1375: `input + 1,25·cacheWrite + 0,1·cacheRead + 5·output` | `weighted()` (e9lite.mjs:42): đúng công thức, làm tròn. Thử trên dữ liệu: `runs.jsonl:1`: 12 + 1,25·36403 + 0,1·68550 + 5·9252 = 98 630,75 → 98 631 = trường `weighted` lưu trong dòng. `runs.jsonl:52`: 16 + 51 077,5 + 10 300,6 + 47 620 = 109 014,1 → 109 014 = lưu | **Khớp** (hai điểm kiểm tay) |
| Bootstrap | §9 (S3) dòng 1435: `mulberry32` hạt 20261115, khởi tạo lại mỗi (thước, cặp, tầng); bài xếp theo `id`; B = 4000; cận `floor(0,025·B)` và `ceil(0,975·B) − 1`; không nội suy | `bootstrapMean()`: `mulberry32(seed)` trong **mỗi lần gọi** (tức mỗi thước, cặp, tầng); `Math.floor(rnd() * n)` theo thứ tự; sắp tăng; `means[floor(0.025*B)]`, `means[ceil(0.975*B)-1]`. `analyze()` dòng 203: `tasks = Object.keys(goldById).sort()` (bài theo `id` tăng dần). Lệnh dùng `--seed 20261115 --boot 4000` | **Khớp** |
| Mã `mulberry32` | §9 (S3) dòng 1439-1440 | Thân hàm trùng chữ (khác định dạng, `0x6d2b79f5` chữ thường) | **Khớp** |
| Ngưỡng n | §9 (6): tầng n < 3 chỉ liệt kê | `contrast()`: `d.length >= 3` thì bootstrap, ngược lại `listOnly`. Tầng chia được n = 3 vẫn bootstrap (`report.md:35-59`) | **Khớp**; nhưng bootstrap trên n = 3 chỉ có 27 tổ hợp có thể có: khoảng rất thô (mục 5, ghi chú G5) |
| Chọn dòng | §9 (7) dòng 1388: dòng `done` cuối; model lệch loại | `selectRuns()` (75-88): `dones[dones.length - 1]`, điều kiện `planModel?.match !== false` | **Khớp** |
| Độ nhạy `mod2Of` | §9 (S2) dòng 1417-1418: báo song song, gắn "độ nhạy", không thay nhãn chính | `analyze()` dòng 217-230, tiêu đề "Độ nhạy…" (`report.md:7, 91-117`); nhãn độ nhạy lấy `labels.sensitivity.label`: 4 chia được / 9 không chia được (`report.md:7`) khớp `labels.json:11-14` | **Khớp** |
| Số bài >0/=0/<0 | §9 (6) dòng 1381 | `contrast()`: đếm bằng so sánh chính xác `x > 0`, `x === 0`, `x < 0` | **Khớp về định nghĩa.** Rủi ro số học nhỏ: so sánh `=== 0` trên số thực (G4, mục 5) |

**Kết luận mục 3:** mọi thước chính của `report.md` đúng định nghĩa §9. Các điểm script **không in** hoặc in khác dạng được liệt kê ở mục 5 (G1-G6); không có chỗ nào làm sai một số đã in.

## 4. Tính tay độ phủ trên `planFinal`, arm P-O, ba bài

Cách làm: lấy `G_f` từ `gold.json` (các tệp `change` ∈ {added, modified}), lấy `files[]` của từng hạng mục trong `planFinal` của **dòng `done` cuối** mỗi khóa, hợp lại, chuẩn hóa (không có tiền tố `./`, `starter/`, ở các dòng này nên giữ nguyên), rồi đếm giao. Module = thư mục cấp một (không có `/` → `.`); `mod2Of` = hai đoạn đầu khi đoạn đầu là `src` và có ≥ 3 đoạn, còn lại như `modOf`.

Report **không in giá trị theo bài**; nó chỉ in hiệu trung bình, khoảng bootstrap và đếm >0/=0/<0. Nên đối chiếu với report là gián tiếp: (1) đếm dấu; (2) các cận của khoảng bootstrap trên tầng n = 3 chính là giá trị nhỏ nhất và lớn nhất của hiệu theo bài. Để có hiệu O − S, tôi tính thêm P-S cho cùng ba bài (cũng bằng tay, cùng cách).

### 4.1 `t5-logq` — nhãn **chia được** (`labels.json:217-233`)

`G_f` = {`bin/logq.js`, `src/agg.js`, `src/parse.js`, `src/query.js`} (`gold.json:874-913`; `SPEC.md`, `package.json`, `test/smoke.test.js` là `deleted`, bị loại). `G_m` = {`bin`, `src`}; `G_m2` = {`bin`, `src`} (`src/x.js` chỉ 2 đoạn nên về `src`).

| Lượt (dòng done cuối) | Tệp trong `planFinal` thuộc `G_f` | covFile | Module của kế hoạch | covMod | covMod2 | Số hạng mục | `replanCount` | `gateFirst` | Token |
|---|---|---|---|---|---|---|---|---|---|
| r1 (dòng 1) | `src/parse.js`, `src/query.js`, `src/agg.js`, `bin/logq.js` = 4 (thêm `SPEC.md`, `src/index.js`, các test) | 4/4 = 1 | `.`, `src`, `test`, `bin` | 2/2 = 1 | 1 | 4 | 1 | 0 (`replanned: true`) | 98 631 |
| r2 (dòng 8) | 4 (có `smoke.test.js` trần: module `.`; không thuộc `G_f`) | 1 | `.`, `src`, `test`, `bin` | 1 | 1 | 4 | 1 | 0 | 96 897 |
| r3 (dòng 7) | 4 | 1 | `src`, `test`, `bin`, `.` | 1 | 1 | 4 | 1 | 0 | 99 226 |
| **Trung bình P-O** | | **1** | | **1** | **1** | **4** | **1** | **0** | 98 251,333 |

P-S (dòng 5, 2, 3): `planFinal` có `src/parse.js`, `src/query.js`, `src/agg.js`, `bin/logq.js` và `../src/index.js` (chứa `..`, không khớp phần tử chuẩn nào). covFile = covMod = 1 ở cả ba lượt, số hạng mục 4, `replanCount` 0, `gateFirst` 1, token 48 759 / 46 105 / 46 707 → TB 47 190,333.

Hiệu **O − S** của t5-logq: covFile 0; covMod 0; số hạng mục 0; `replanCount` +1; `gateFirst` −1; token +51 061,000.

**So với report** (tầng `chia_duoc`, n = 3, `report.md:38-48`):
- covFile/covMod Opus − Sonnet = 0,000 [0,000; 0,000], 0/3/0: khớp (t5 góp một "=0").
- `replanCount` Opus − Sonnet: cận trên **1,000** = giá trị lớn nhất theo bài = +1 của t5-logq: khớp.
- `gateFirst`: cận dưới **−1,000** = −1 của t5-logq: khớp.
- token Opus − Sonnet: cận trên **51 061,000** = +51 061,000 của t5-logq (đúng đến đơn vị): khớp.

### 4.2 `g1-slug-dedupe` — nhãn **không chia được** (`labels.json:16-31`)

`G_f` = {`src/slug.js`} (`gold.json:32-33`; `SPEC.md`, `package.json`, `test/slug.test.js` là `deleted`). `G_m` = {`src`}; `G_m2` = {`src`}.

| Lượt (dòng) | `planFinal` có `src/slug.js`? | covFile | covMod | covMod2 | Số hạng mục | Chia thừa (>1 hạng mục) | `replanCount` | `gateFirst` | Token |
|---|---|---|---|---|---|---|---|---|---|
| r1 (108) | có (S1) | 1 | 1 | 1 | 2 | 1 | 0 | 1 | 39 912 |
| r2 (107) | có | 1 | 1 | 1 | 2 | 1 | 0 | 1 | 37 650 |
| r3 (104) | có | 1 | 1 | 1 | 2 | 1 | 0 | 1 | 39 265 |
| **Trung bình P-O** | | **1** | **1** | **1** | **2** | **1,000** | **0** | **1** | 38 942,333 |

P-S (dòng 100, 106, 105): covFile = 1 cả ba (r3 `planFinal` có `SPEC.md`, `src/slug.js`); hạng mục 2/2/2; chia thừa 1; `replanCount` 0/0/1 (r3 `replanned: true`) → 0,333; `gateFirst` 1/1/0 → 0,667; token 34 219 / 34 497 / 51 421 → 40 045,667.

Hiệu **O − S**: covFile 0; hạng mục 0; chia thừa 0; `replanCount` −0,333; `gateFirst` +0,333; token −1 103,333.

**So với report** (tầng `khong_chia_duoc`, n = 10): covFile `final` 1/9/0 và covMod 0/10/0: g1 góp "=0": khớp. `final.overSplit` O − S: g1 = 0 (cùng 1,0 ở hai arm): không phải một trong 4 bài dương: khớp mặc định, không phản ví dụ. `replanCount` O − S: report 0/8/2 (hai bài âm), mean −0,067, cận dưới −0,167: g1 (−0,333) là một bài âm có thể có: khớp. `gateFirst`: report 2/8/0 (hai bài dương, mean 0,067): g1 (+0,333) là một bài dương: khớp. Token O − S: g1 âm (−1 103), nằm trong 2 bài âm của 8/0/2: không mâu thuẫn.

### 4.3 `t2-orders` — nhãn **không chia được**, khóa `t2-orders__P-O__r3` từng `failed` hai lần (`labels.json:166-181`)

`G_f` = {`src/cart.js`, `src/checkout.js`, `src/money.js`, `src/promotions.js`} (`gold.json:579-634`; `ISSUES.md`, `package.json`, `src/catalog.js`, `src/index.js`, `src/inventory.js`, `src/tax.js`, `test/*.test.js` là `deleted`). `G_m` = {`src`}; `G_m2` = {`src`}.

Chọn dòng cho từng khóa (đây là phép thử quy tắc "dòng done cuối"):

| Khóa | Dòng của khóa | Dòng được tính |
|---|---|---|
| `t2-orders__P-O__r1` | 51 (done) | 51 |
| `t2-orders__P-O__r2` | 50 (done) | 50 |
| `t2-orders__P-O__r3` | 52 (failed), 119 (failed), 121 (done) | **121**; dòng 52 và 119 bị loại (`planFinal: null`, token của hai dòng này **không** vào số chính) |

| Lượt (dòng) | Tệp thuộc `G_f` trong `planFinal` | covFile | covMod | covMod2 | Số hạng mục | Chia thừa | `replanCount` | `gateFirst` | Token |
|---|---|---|---|---|---|---|---|---|---|
| r1 (51) | `src/money.js` (S1), `src/promotions.js` (S2), `src/cart.js` (S3), `src/checkout.js` (S4) = 4 | 1 | 1 | 1 | 4 | 1 | 0 | 1 | 64 483 |
| r2 (50) | `src/money.js`, `src/checkout.js` (S1), `src/promotions.js` (S2), `src/cart.js` (S3) = 4 (`promotions.js`, `cart.js` trần không khớp, nhưng bản `src/…` có) | 1 | 1 | 1 | 3 | 1 | 0 | 1 | 63 254 |
| r3 (121) | `src/money.js`, `src/checkout.js` (S1), `src/promotions.js` (S2), `src/cart.js` (S3) = 4 | 1 | 1 | 1 | 3 | 1 | 0 | 1 | 59 184 |
| **Trung bình P-O** | | **1** | **1** | **1** | **3,333** | **1,000** | **0** | **1** | 62 307,000 |

(Tổng token 64 483 + 63 254 + 59 184 = 186 921; /3 = 62 307,000.)

P-S (dòng 49, 54, 53): covFile 1 cả ba (đều có đủ 4 tệp `src/…`); hạng mục 4/4/4 → 4; chia thừa 1; `replanCount` 0; `gateFirst` 1; token 40 618 / 44 469 / 39 822 → 41 636,333.

Hiệu **O − S**: covFile 0; hạng mục −0,667; chia thừa 0; `replanCount` 0; `gateFirst` 0; token +20 670,667.

**So với report:** covFile/covMod/covMod2 `final` O − S đều "=0" ở bài này: khớp với 12/13 (covFile) và 13/13 (covMod, covMod2) "=0" (bài duy nhất dương ở covFile `final`, hiệu 0,5, không nằm trong ba bài này). Số hạng mục `final` O − S: report 4/4/2 ở tầng không chia được; t2-orders (−0,667) là một trong hai bài âm có thể có: không mâu thuẫn. Token O − S dương (+20 671): nằm trong 8 bài dương: không mâu thuẫn.

### 4.4 Kết luận mục 4

- Cả 3 bài (9 lượt P-O + 9 lượt P-S cho đối chiếu) cho độ phủ tệp và module `planFinal` **khớp** logic của script và **không mâu thuẫn** với bất kỳ số đếm nào trong `report.md`. Có **ba đối chiếu cận khoảng bootstrap khớp đến từng chữ số** (replanCount 1,000, gateFirst −1,000, token 51 061,000 ở tầng `chia_duoc`), vì ở n = 3 cận dưới/trên chính là hiệu nhỏ nhất/lớn nhất theo bài.
- **Hạn chế thật:** report không in ô theo bài nên không so được từng ô một. Số đối chiếu trực tiếp chỉ có ba cận nêu trên; phần còn lại là kiểm không-mâu-thuẫn. Tôi đã nêu cách bổ sung ở G1 (mục 5).
- Phép thử khóa từng failed (t2-orders r3): quy tắc "dòng done cuối" chọn đúng dòng 121; hai dòng failed không vào số.
- Cả ba bài đều có covFile = 1 ở P-O. Nhắc đúng giới hạn của §9 (9): độ phủ không phạt tệp thừa (r1 của t2-orders có thêm `src/index.js`, `src/tax.js`, `src/inventory.js`, vẫn phủ 1).

## 5. Điểm chưa khớp §9 hoặc brief, và rủi ro (cho K3, K4)

Không điểm nào làm sai một số đã in; đây là chỗ **thiếu** hoặc **cần ghi chú** khi viết bài.

| Mã | Điểm | Mức | Xử lý đề xuất |
|---|---|---|---|
| G1 | **Không có bảng "theo arm" với giá trị tuyệt đối** (trung bình từng arm: độ phủ, hạng mục, `replanCount`, `gateFirst`, token). Brief K1 liệt kê "theo arm"; §9 (6) chỉ bắt buộc "một giá trị/bài/arm/thước" làm đầu vào cho hiệu, nên đây là lệch với **brief**, không lệch §9. Script chỉ in hiệu O − S và H − S | Trung bình | K3 **không** tự suy trung bình tuyệt đối; chỉ dùng số trong `report.md` và nói rõ bảng này không có. Nếu cần, giao việc bổ sung (gọi hàm đã `export` `perTask`, không sửa mã) ở gói sau |
| G2 | Token pha `plan` từ `usage.byPhase` (§9 (S3), dòng 1444: "báo thêm, mô tả") không có trong đầu ra | Thấp | Ghi "chưa báo" trong bài; dữ liệu có sẵn ở `runs.jsonl` (ví dụ `byPhase.plan` ở dòng 1: 89 073) |
| G3 | "Tệp ngoài repo" (đường dẫn tuyệt đối hoặc chứa `..`, §9 (S3) dòng 1445) không được đếm riêng. Dữ liệu có: ít nhất 6 dòng chứa `"../` (P-S t5-logq `../src/index.js`, ví dụ dòng 2, 3, 5) và Grep thấy 8 dòng có chuỗi dạng đường dẫn tuyệt đối trong `files`; chưa tách theo dòng done/failed hay theo arm. Vì chuẩn chỉ chứa đường dẫn tương đối nên các tệp này không thể khớp: **không làm sai độ phủ**, chỉ là chưa báo đếm | Thấp | Ghi trong bài là "chưa đếm riêng"; hai con số Grep là sơ bộ, cần kiểm |
| G4 | **`-0,000` và so sánh thực**: `report.md:30, 82, 116` có "−0,000" (ví dụ Haiku − Sonnet `final.items` KTC `[-0,000; 0,821]`; `raw.overSplit` hiệu TB `-0,000`). Đó là số rất nhỏ âm do sai số dấu phẩy động, hiển thị `toFixed(3)`; không phải âm thật. Đếm >0/=0/<0 dùng so sánh chính xác (`x === 0`): với thước nhận giá trị nguyên (hạng mục, `replanCount`, `gateFirst`, chia thừa), trung bình 3 lượt của hai arm cùng tổng nguyên nên bằng nhau chính xác; với độ phủ và token có thể có sai số cuối, nhưng các ô `=0` đọc được (độ phủ 13/13 hay 12/13) khớp bài tính tay | Thấp | Khi trích: viết "−0,000" thành "0,000" kèm chú thích làm tròn, hoặc giữ nguyên chữ; khoảng có cận dưới "−0,000" vẫn **chứa 0** nên đọc là "chưa phân biệt được". Không kiểm được hết bằng tay vì không chạy script |
| G5 | **Tầng n = 3 (`chia_duoc`):** bootstrap chỉ có 27 tổ hợp có thể có, cận trùng giá trị nhỏ nhất/lớn nhất theo bài (đã dùng ở mục 4). Khoảng này không nên đọc như khoảng tin cậy thông thường | Cao với diễn giải | K3: với tầng này chỉ nêu giá trị theo bài và "n = 3"; không diễn giải khoảng |
| G6 | Tên `firstFail` trong mã đếm mọi dòng không done, không chỉ lượt đầu | Thấp | Chỉ đặt tên; kết quả đúng |
| G7 | Nhãn nguyên nhân "cổng kế hoạch chặn" chỉ dựa lời khai RUNLOG (mục 2) | Trung bình | K3 ghi "theo RUNLOG"; không viết như đã tự kiểm |
| G8 | Dữ liệu K1 đưa K3: câu "không có `usage`" của K1 sai (mục 2) | Thấp | Dùng số trong khối §9 mới (415 205) |

## 6. Lệnh cần chạy để người có quyền kiểm lại (tôi không chạy được)

```bash
# Thứ tự: khóa k của order-dry-run.txt = key ở dòng k của runs.jsonl (k = 1..117)
cd bench/vs-claude/results/e9lite/run1
diff <(tail -n +2 order-dry-run.txt | head -117) <(head -117 runs.jsonl | grep -o '"key":"[^"]*"' | cut -d'"' -f4) && echo TRUNG
# Băm (bản làm việc và blob đã commit; runs.jsonl có CRLF ở bản checkout Windows nên dùng blob)
cd .. && sha256sum gold.json labels.json && git show HEAD:bench/vs-claude/results/e9lite/run1/runs.jsonl | sha256sum
# Tái lập: chạy lại script (lệnh ở report.md dòng 126), so với 117 dòng đầu của report.md
```

Kỳ vọng: `TRUNG`; `ee49fc5d…ed312f`, `40596992…694025`, `bb004f1f…b436fc`.

## 7. Khối §9 mới (đã thêm)

Đã thêm ở **cuối §9**, ngay trước `## 10. Đạo đức & dữ liệu` của `docs/research/preregistration.md`: mục "Sai lệch được báo minh bạch: lượt `failed` do cổng kế hoạch chặn, rồi chạy lại cùng khóa (BRIEF-25, K2)". Gồm: (a) mô tả ca; (b) phép tính chính không đổi; (c) cách báo, hai mẫu số tách bạch (c1: số dòng không done theo arm: 1/0/3; c2: khóa có lượt đầu không done trên 39 khóa mỗi arm: 1/39, 0/39, 2/39), cùng token của dòng bị chặn (415 205); (d) `causeOf()` không có nhóm này nên nơi phân loại là phụ lục K1 và audit này, kèm hạn chế bằng chứng; (e) ngưỡng diễn giải chỉ mô tả, đe dọa thiên lệch chọn lọc nặng nhất với Opus, không dùng để chỉnh số. Khối nói thẳng là viết **sau khi chạy**, sau khi thấy RUNLOG và phụ lục K1. Chỉ thêm: `git diff --numstat` phải cho 0 dòng xóa (kết quả ghi ở bàn giao).

## 8. Kết luận về tính đúng

1. Bản chạy **khớp §9**: lệnh (lõi), seed, thứ tự, bản ghim (commit, CLI, `configHash`), arm/model, `authSource`, quy tắc chạy lại. Sai lệch thật duy nhất: ca "cổng kế hoạch chặn" chưa được §9 quy định; đã báo bằng khối §9 mới.
2. Các số chính trong `report.md` **đúng định nghĩa §9** (độ phủ, chia thừa, `gateFirst` theo BRIEF-24b, token có trọng số, bootstrap B = 4000, seed 20261115). Tính tay 3 bài (t5-logq chia được, g1-slug-dedupe và t2-orders không chia được, cả hai arm P-O và P-S) **không phát hiện lệch**, ba cận bootstrap khớp đến từng chữ số.
3. Điểm yếu cần mang sang bài viết: bảng theo arm tuyệt đối chưa có (G1), tầng n = 3 (G5), nhãn nguyên nhân dựa lời khai (G7), chuẩn tệp chỉ là một lời giải (§9 (9)). Mọi kết luận về model chỉ là gợi ý hướng [Khám phá], n = 13, không báo p.
4. **Chưa kiểm** (cần người có quyền chạy lệnh): sha256 tệp, `diff` thứ tự tự động, chạy lại script (mục 6).
