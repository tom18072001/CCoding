# E7b: sổ tay chạy (người điều phối)

Thiết kế khóa: `docs/research/preregistration.md` §9, khối "Đăng ký trước E7b", Phụ lục (1) và **Phụ lục sai lệch E7b (2)**. Mã **QH1…QH36** dẫn dưới đây là bảng "Quy tắc hiệu lực" ở Phụ lục (2) (f); mã không đổi. Phân loại dữ liệu: **Nội bộ**. Tệp này chưa chạy lượt nào; thư mục này chưa có `runs.jsonl` hay dữ liệu chạy. Dựa trên `bench/vs-claude/e7/README.md` (mục E7) và `run.mjs`.

**Cách chạy (QH3): MỘT tiến trình `run.mjs`, `--arms R1,R2`, hai arm xen kẽ theo bảng Latin, mỗi arm một app CCoding nạp tệp cấu hình của chính arm.** Phương án chạy hai tiến trình đã bỏ (Phụ lục (2) (a)); không quay lại phương án đó.

**Điều kiện cứng (QH6): E7b chỉ chạy trên bản ghim chứa cả D24 và gói này (BRIEF-26b).** D24 cho harness: `--arm-config`, `--selected`, và các trường `extraConfigSha256`, `acceptCalls`, `acceptAuthSources`, `acceptTurnCapped`, `acceptToolCalls`, `acceptTurns` trên dòng R1/R2. Bản ghim thiếu D24 (không có `--arm-config`, hoặc dòng không có các trường trên) thì **E7b hoãn**; lượt thử ở mục 4 phát hiện điều này trước lệnh chính.

## 1. Kiểm khả thi (đọc mã, không sửa mã)

| Câu hỏi | Kết luận | Căn cứ |
|---|---|---|
| Đặt trần `accept` khác nhau theo arm trong **một** tiến trình? | **Được, nhờ D24.** | `--arm-config R1=<tệp>,R2=<tệp>`: mỗi arm một app riêng nạp tệp của arm, dữ liệu app ở `<--ccoding-data>\w1` (R1) và `\w2` (R2) (`ARM_DIR` ở `bench/vs-claude/e7/lib.mjs:26`). Trước D24: một `--config` mỗi tiến trình (nhánh `--config` đặt `CCODING_CONFIG`, `bench/vs-claude/e7/run.mjs:64`), không đủ. |
| Cấu hình thêm chỉ cần khóa `phases.toolTurns.accept`? | **Được.** | `src/config.ts:467-471`: cấu hình thêm được `deepMerge` lên mặc định; các khóa khác của `toolTurns` giữ nguyên. |
| Model của arm nằm ở đâu? | **Không nằm trong tệp cấu hình.** | `ARMS` ở `bench/vs-claude/e7/lib.mjs:20-24`: R1 dùng model mặc định của CTO (Sonnet), R2 đặt `phaseModels.accept = 'opus'` (`runCto`, `lib.mjs:236-237`). Lượt thử (mục 4) kiểm `models` của từng arm (QH2). |
| Danh sách chốt dùng chung, không chạy lại bước 1? | **Được, nhờ D24 `--selected`.** | `--selected <tệp>` dùng danh sách từ tệp, không chạy bước 1, không tạo `selected.json` trong `--out` (QH1). Thứ tự: `sample(sel.items, …, rng(`${doc.seed}|e7|order`))` (`bench/vs-claude/e7/run.mjs:122`, biến `order`), phụ thuộc `items.json` (seed `20261104`) và `selected.json`. `--items` bắt buộc trỏ `results\e7-cto\items.json`. |
| Có phải sửa `src/` hoặc `bench/` ở gói này? | **Không.** | Phần mã là việc của D24 (mục 7). |

**Đã đính chính ở Phụ lục (2) (c):** trần token công cụ `toolInputBudget` không áp cho E7b (chỉ runtime `api` đọc, `api.ts:378`; `claude-cli` chỉ nhận `--max-turns`, `claude-cli.ts:276`, và `capped` chỉ là `'turns'`, `claude-cli.ts:393`). Vì thế `acceptTurnCapped = true` ở E7b là chạm trần **lượt** (QH10); lượt thử không cần dò trần token.

`--ccoding-data` mặc định nằm trong `--work` (thư mục tạm). Luôn đặt tường minh như dưới đây và **giữ** nó đến hết phân tích: nguồn chính của kiểm hạ tầng là các trường trên dòng `runs.jsonl`; `calls.jsonl` trong `w1`/`w2` chỉ để đối chiếu (Phụ lục (2) (b)).

## 2. Tệp cấu hình và SHA256SUMS (QH2, QH4, QH6)

- `config-R1b.json`: `{ "defaults": { "acceptFollowupRounds": 0 }, "phases": { "toolTurns": { "accept": 6 } } }`. `config-R2b.json`: cùng cấu trúc, `accept` = **16**.
- `acceptFollowupRounds: 0` ở **cả hai** tệp (QH4): tắt vòng bổ sung sau nghiệm thu (mặc định 1, `acceptFollowupRounds`, `src/config.ts:380`). E7b đo kết luận nghiệm thu **đầu tiên**, tức đúng một lượt `accept` mỗi mục. Kiểm bằng dữ liệu: dòng `done` phải có `acceptCalls` = 1 (QH5); khác 1 là lỗi kiểm. Thiếu khóa này trong tệp thì dừng, không chạy.
- **Hai tệp chỉ khác đúng giá trị `phases.toolTurns.accept`** (6 so với 16). Không có khóa nào khác, không có khóa API, token hay đường dẫn máy.
- `SHA256SUMS` (tính trên blob git, LF): R1b `91cc507d…`, R2b `3f62d742…`. Kiểm bằng `Get-FileHash -Algorithm SHA256` ở mục 3. Tệp JSON đã commit với LF; nếu checkout trên Windows ra CRLF thì sha lệch: dùng `git show HEAD:<đường dẫn>` để đối chiếu.
- Cấu hình chồng lên `ccoding.config.json` và `ccoding.local.json` của bản ghim (giống server bench 3e: chỉ `claude-cli`, chặn web). Runner ghi `localConfigSha256` và `extraConfigSha256` ở mỗi dòng; `extraConfigSha256` là sha256 tệp của **chính arm** (QH6).
- Trần 6 = mặc định hiện hành (`toolTurns.accept`, `src/config.ts:385`); R1b vẫn đặt tường minh để `extraConfigSha256` của hai arm khác nhau và truy được.

## 3. Chuẩn bị (không gọi LLM)

`<ghim>` = bản checkout đã build của bản ghim: một commit cho cả hai arm, chứa `src/` từ `7beb50c1` trở đi (D23), **D24**, hai tệp cấu hình này, `docs/research/analysis/e7b-analyze.mjs` và RUNBOOK này (QH6). Thay `<…>` theo máy chạy.

```powershell
cd <ghim>; npm ci; npm run build
git log --oneline -1                  # ghi hash bản ghim vào RUNLOG
git grep -n "arm-config" -- bench/vs-claude/e7/run.mjs   # phải có kết quả; không có = bản ghim thiếu D24 ⇒ dừng, hoãn E7b
claude --version                      # ghi vào RUNLOG; cùng phiên bản cho hai arm; DISABLE_AUTOUPDATER=1
Copy-Item <3e>\ccoding.local.json <ghim>\ccoding.local.json
Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue   # chỉ phiên đăng nhập claude.ai, không khóa API (QH11)
$E = "bench\vs-claude\results\e7-cto"; $B = "bench\vs-claude\results\e7b-cto"
Get-Content $B\SHA256SUMS | ForEach-Object { $h, $f = $_ -split ' \*'; "$f " + ((Get-FileHash -Algorithm SHA256 "$B\$f").Hash.ToLower() -eq $h) }   # phải in True cho cả hai tệp cấu hình
git rev-parse HEAD:$E/selected.json   # 5b3e8fcf2ba3816b39fdb5ba9ef021232a4b2f5f (QH1)
Get-FileHash -Algorithm SHA256 $E\selected.json, $E\items.json
git diff --no-index $B\config-R1b.json $B\config-R2b.json   # chỉ khác dòng accept (diff của PowerShell là Compare-Object, không so nội dung tệp)
```

Ghi vào `RUNLOG.md` (tạo mới, trước lượt đầu): hash commit bản ghim, sha256 `dist` gộp, sha256 hai cấu hình, sha256 `selected.json` và `items.json`, sha256 `bench/vs-claude/e7/*.mjs` và `docs/research/analysis/e7b-analyze.mjs`, phiên bản CLI, `localConfigSha256`. Không cần tạo thư mục cho từng arm và không sao `selected.json` (D24 `--selected`).

> Bước 1 (chốt mục) **không** chạy lại (`--selected`). Nhưng `prepareItem` vẫn dựng lại từng mục ở bước 2 và mục không dựng được ghi dòng `infra` (`prep`). Mục nào không dựng lại được thì loại cả cặp, báo số, không thay mục (QH23).

## 4. Chạy thử (một mục dự phòng, mỗi arm một lượt, không vào phân tích; QH34)

Mục dự phòng chọn trước: `067cd64cc5` (mục đúng dự phòng của `c1-iis-ecs`, không thuộc `selected.json`). **Không có lượt R3** (Phụ lục (2) (a), (P3)): lượt đó không có trong §9 và không kiểm lượt gọi trong tiến trình CCoding. `authSource` đọc từ chính lượt thử của hai arm (`acceptAuthSources`).

Lượt thử đi qua **một** tiến trình với `--arms R1,R2` và `--arm-config`, ghi ra thư mục **ngoài** `e7b-cto\`:

```powershell
node bench/vs-claude/e7/run.mjs --smoke 067cd64cc5 --arms R1,R2 --arm-config R1=$B\config-R1b.json,R2=$B\config-R2b.json --items $E\items.json --out ..\e7b-smoke --work ..\e7b-work-smoke --ccoding-data ..\e7b-data-smoke
node docs/research/analysis/e7b-analyze.mjs --smoke ..\e7b-smoke\runs.jsonl
```

Lệnh thứ hai chỉ đọc trường hạ tầng, **không đọc `verdict`**, in từng dòng `OK`/`LỖI` kèm mã QH và thoát mã 2 nếu có lỗi. Phải thấy `OK` cho:
- `extraConfigSha256` của **từng arm** bằng sha256 đúng tệp cấu hình của arm và khớp `SHA256SUMS` (QH6). Thiếu trường, hoặc hai arm cùng một giá trị = bản ghim thiếu D24 ⇒ **hoãn E7b**;
- `maxTurns` = **6** (R1) và **16** (R2) (QH12);
- `acceptCalls` = **1** (QH5: vòng bổ sung đã tắt);
- `acceptAuthSources` = `["none"]` (QH11: phiên đăng nhập claude.ai, không khóa API);
- `acceptTurnCapped` là boolean (QH10; thiếu thì dòng chính chỉ "suy ra");
- `models` = Sonnet (R1), Opus (R2) (QH2); `promptSha` hai arm giống nhau; `ccodingCommit` giống nhau.

Đối chiếu (không quyết định): trong `..\e7b-data-smoke\w1\runs\<taskId>\calls.jsonl` và `\w2\…`, mỗi task có đúng một bản ghi `phase:'accept'`, `authSource` = `none`.

**Kiểm 403 (QH31).** Tìm lỗi xác thực:
```powershell
Select-String -Path ..\e7b-smoke\runs.jsonl -Pattern '403|Failed to authenticate|Cloudflare'
```
Có khớp, hoặc dòng `done` mà văn bản nghiệm thu là thông báo lỗi → **dừng**, báo người điều phối (không phân loại lại sau khi xem kết quả). Lượt thử không vào `e7b-cto\`.

Một lỗi `LỖI` bất kỳ → dừng, ghi khối "Sai lệch", không chạy lệnh chính.

## 5. Chạy chính: MỘT tiến trình (QH3)

Một lệnh, hai arm xen kẽ theo bảng Latin, thứ tự mục theo `rng("20261104|e7|order")`. Ghi giờ bắt đầu vào RUNLOG. Không đặt `--timeout` (chỉ áp cho arm R3, không chạy ở đây); R1/R2 dùng `waitTimeoutMs` là giá trị mặc định của `runCto` (90 phút, `runCto`, `bench/vs-claude/e7/lib.mjs:230`; `run.mjs` không truyền giá trị này) và `timeoutMsByPhase` của cấu hình.

```powershell
node bench/vs-claude/e7/run.mjs --arms R1,R2 --arm-config R1=$B\config-R1b.json,R2=$B\config-R2b.json --selected bench\vs-claude\results\e7-cto\selected.json --items $E\items.json --out $B\run --work ..\e7b-work --ccoding-data ..\e7b-data
```

- Giữ `..\e7b-data` (có `w1`, `w2`) đến hết phân tích. Chưa được che PII; nằm **ngoài** repo, không commit.
- **Hết hạn mức (QH32):** runner thoát mã 3. Dừng tiến trình, chờ hạn mức mở, chạy lại **đúng lệnh cũ**. Cặp `done` được bỏ qua; dòng `infra` chạy lại; cặp lỗi hạ tầng 3 lần thì ghi thiếu (QH7). Không chuyển sang chạy tuần tự từng arm.
- **Dừng và ghi khối "Sai lệch"** (không loại lặng lẽ) khi: `acceptAuthSources` khác `["none"]` (QH11), nhiều lượt liên tiếp 403 (QH31), `maxTurns` của dòng không phải 6/16 (QH12), `acceptCalls` ≠ 1 (QH5), `extraConfigSha256` không khớp `SHA256SUMS` (QH6), hai tệp cấu hình khác nhau ngoài `accept`.
- **Không mở `runs.jsonl` hay `responses/`** trước khi đủ. **Không chạy lại vì kết quả**: chỉ dừng vì hạ tầng, hạn mức, `authSource`, lỗi cấu hình hay kiểm (QH33). Chỉ in đếm.
- **Không chạy R3** (§9 (d)).
- Ước lượng: 128 lượt gọi mỗi arm. Ngân sách của gói là 6M token (phía người điều phối).

## 6. Kiểm sau khi chạy, rồi phân tích

Kiểm hạ tầng (đây không phải kết luận). Script phân tích chạy các kiểm này **trước mọi tính toán**; có kiểm nào sai thì chỉ in lỗi kiểm, thoát mã 2, **không in nhãn, nhánh, tỉ lệ hay p** (QH35):
- `selected.json` đúng blob `5b3e8fcf…` (QH1): kiểm **đầu tiên**, trước khi gọi bộ phân tích; blob sai thì chỉ in lỗi QH1 và không phân tích gì;
- số mục của `--selected` = 128 (QH1);
- `acceptAuthSources` không có giá trị lạ (ngoài `["none"]`) ở **mọi dòng của arm, kể cả `infra`**; riêng dòng `done` thiếu trường cũng là lỗi (QH11);
- `maxTurns` = 6 (R1) / 16 (R2) ở dòng `done` (QH12);
- `acceptCalls` = 1 ở mọi dòng `done` (QH5);
- `extraConfigSha256` mỗi arm đúng một giá trị, khớp `SHA256SUMS` (QH6); `ccodingCommit` một giá trị chung (QH6);
- không có arm ngoài R1/R2 (QH34); không có dòng `done` mang văn bản 403 (QH31).

**Quy tắc thi hành ngoài bộ phân tích** (script không kiểm; người điều phối thi hành, chỗ thi hành như sau):
- **QH3** (một tiến trình, `--arms R1,R2`, `--arm-config`, bảng Latin): lệnh chính ở mục 5; thứ tự mục và bảng Latin ở `bench/vs-claude/e7/run.mjs:122-123` (`rng(`${doc.seed}|e7|order`)`, `latinOrders`); `--arm-config` thuộc D24, kiểm bằng `git grep` ở mục 3 và lượt thử ở mục 4.
- **QH4** (`acceptFollowupRounds = 0` ở cả hai tệp): mục 2 (thiếu khóa thì dừng); test `QH2/QH4/QH6` trong `docs/research/analysis/e7b-analyze.test.mjs`. Trên dữ liệu chỉ kiểm được hệ quả `acceptCalls` = 1 (QH5).
- **QH32** (hết hạn mức: dừng, chạy lại đúng lệnh cũ): `bench/vs-claude/e7/run.mjs:173` (`EXIT_RATE_LIMIT`, thoát mã 3; nhập ở `run.mjs:18`) và mục 5.
- **QH33** (không dừng/chạy lại vì kết quả, runner không in kết luận): `bench/vs-claude/e7/run.mjs:172` (chỉ in giây và wtok hoặc "HẠ TẦNG") và mục 5 ("Chỉ in đếm").

Thiếu `acceptTurnCapped` **không** là lỗi kiểm: `capped` chuyển sang "suy ra" = `unread` và nhãn đó hiện ở bảng (QH10).

Phân tích (chỉ khi đã đủ; chưa có `runs.jsonl` thì script báo "chưa có dữ liệu" và không in số). Chỉ một `runs.jsonl` và một `--data` (không còn cờ riêng cho từng arm):
```powershell
node docs/research/analysis/e7b-analyze.mjs --runs $B\run\runs.jsonl --data ..\e7b-data > $B\report.md
node docs/research/analysis/e7b-analyze.mjs --runs $B\run\runs.jsonl --data ..\e7b-data --json > $B\report.json
```
- `--data` là tùy chọn, chỉ để đối chiếu `calls.jsonl` (số lượt `accept`, `authSource`, `turnCapped`); lệch thì ghi vào báo cáo, không chọn nguồn theo kết quả. Không có `--data` thì bỏ phần đối chiếu.
- Script từ chối in số khi còn cặp (mục, arm) chưa có dòng `done` và chưa đủ 3 lần `infra`, trừ khi thêm `--final` (chỉ khi đã dừng chủ định, ghi lý do vào RUNLOG).
- Script áp: cách chính (`unread` = không chặn), S1 (`unread` = chặn), S2 (bỏ cặp có `unread`), **S3a/S3b** (cặp thiếu do hết giờ giữ lại như `unread`; QH15, QH30); McNemar chính xác P1 (recall) và P2 (chặn nhầm), Holm hai phép, bootstrap hai tầng theo bài (B = 4000, seed `20261104`; QH17, QH18); nhãn ba giá trị gồm **"chưa kết luận" khi hai phép khác chiều** (QH19); **cặp thiếu theo arm: một arm > 3 cặp thiếu hoặc chênh ≥ 3 ⇒ nhánh F** (QH21, QH22); nhánh D→E→A→B→C→F phải trùng ở cả năm cách tính (QH16, QH24–QH28); USD, Youden J, phân bố `acceptTurns` và `acceptToolCalls`, bảng theo bài, bảng E7 cạnh E7b ghi "khác bản mã" (chỉ mô tả, QH29).
- Luật "hết giờ" (QH30), trên dòng `infra` của cặp thiếu: `error` khớp `^quá hạn chờ \d+s` (harness `runCto`); `error` chứa `Hết thời gian (` (runtime `claude-cli`); `error` bắt đầu `timeout:` (chuỗi `<errorKind>: <error>` do `runCto` ghép qua `callErrors`). Dòng infra có `error` **rỗng** thì **không tính** (Phụ lục (2) (d)); `errorKind` của `calls.jsonl` chỉ để đối chiếu, script không dùng nó để quyết định. **Thứ tự xét: điều kiện 1, rồi 2, rồi 3**; dòng khớp nhiều điều kiện tính vào điều kiện đứng trước (ví dụ `timeout: Hết thời gian (…)` tính điều kiện 2). Chọn "mọi dòng infra của cặp" đều thỏa một điều kiện; báo riêng số cặp và số dòng infra theo từng điều kiện 1/2/3 (bảng "Cặp thiếu" của báo cáo).
- Câu cấm (QH36): chỉ nói đúng nhãn và nhánh; không "đã chứng minh", "xác nhận", "tái lập"; không viết hiệu của riêng model (R1b và R2b khác nhau cả model lẫn trần).
- Không sửa script sau khi thấy số.

## 7. Việc Dev

**Đã giao D24** (harness nhận cấu hình theo arm, `--selected`, trường lượt `accept` trên dòng R1/R2; BRIEF-D24). Giao diện cố định:
- `run.mjs --arm-config R1=<tệp>,R2=<tệp>`: mỗi arm CCoding một app riêng nạp tệp của arm, dữ liệu ở `<--ccoding-data>\w1` và `\w2`; hai arm xen kẽ bảng Latin trong **một** tiến trình; `extraConfigSha256` là sha256 tệp của chính arm.
- `run.mjs --selected <tệp>`: dùng danh sách chốt từ tệp, không chạy bước 1, không tạo `selected.json` trong `--out`.
- Trường trên dòng R1/R2: `acceptCalls`, `acceptAuthSources`, `acceptTurnCapped`, `acceptToolCalls`, `acceptTurns` (`null` nếu có lượt thiếu).

Người chạy kiểm D24 đã gộp vào bản ghim bằng lượt thử (mục 4) trước lệnh chính. Gói này **không** đòi thêm việc Dev; nếu lượt thử cho thấy thiếu trường, ghi đề xuất cho phụ lục sau và hoãn E7b.

## 8. Hạn chế đã biết

- Hai app trong một tiến trình vẫn chung đăng nhập và hạn mức; biện pháp là bảng Latin (thứ tự arm trong mục cân bằng) (Phụ lục (2) (a)).
- R1b và R2b khác nhau ở cả model lẫn trần; không tách được tác động của model (QH2, QH36).
- `capped` biết chắc chỉ khi dòng có `acceptTurnCapped`; thiếu thì "suy ra" (QH10).
- Đề xuất cho phụ lục sau (không thêm vào mã hay test): xem báo cáo K2 của BRIEF-26b.
