# E7b: sổ tay chạy (người điều phối)

Thiết kế khóa: `docs/research/preregistration.md` §9, khối "Đăng ký trước E7b". Phân loại dữ liệu: **Nội bộ**. Tệp này chưa chạy lượt nào; thư mục này chưa có `runs.jsonl` hay dữ liệu chạy. Dựa trên `bench/vs-claude/e7/README.md` (mục E7) và `run.mjs`.

## 1. Kiểm khả thi (đã làm, đọc mã, không sửa mã)

| Câu hỏi | Kết luận | Căn cứ |
|---|---|---|
| Đặt trần `accept` khác nhau theo arm trong **một** tiến trình? | **Không.** | `run.mjs:35`: một `--config` → `CCODING_CONFIG`; `run.mjs:92-103`: một `app` dùng chung cho mọi arm; `ARMS` ở `lib.mjs:20-24` cố định model (R1 mặc định, R2 `phaseModels.accept = opus` ở `lib.mjs:222`). |
| Đặt được bằng **hai tiến trình**, mỗi tiến trình một arm, không sửa mã? | **Được.** | `--arms R1` / `--arms R2`, `--config` riêng, `--out`/`--work`/`--ccoding-data` riêng. `src/config.ts:467-471`: cấu hình thêm được `deepMerge` lên mặc định, nên tệp chỉ có khóa `phases.toolTurns.accept` là đủ; các khóa khác của `toolTurns` giữ nguyên. |
| Hai tiến trình dùng chung danh sách chốt và cùng thứ tự? | **Được, với điều kiện sao `selected.json`.** | Bước 1 (`run.mjs:58`) tự tạo `selected.json` trong `--out` **nếu chưa có** (và chạy lại chuẩn bị, có thể thay mục). Sao nguyên `results/e7-cto/selected.json` vào `R1b/` và `R2b/` trước khi chạy thì bước 1 bị bỏ qua. Thứ tự: `sample(sel.items, …, rng(`${doc.seed}|e7|order`))` (`run.mjs:84`), chỉ phụ thuộc `items.json` (seed `20261104`) và `selected.json`, nên giống hệt giữa hai tiến trình. `--items` bắt buộc trỏ `results/e7-cto/items.json` (mặc định là `<out>/items.json`, không có). |
| Có phải sửa `src/` hoặc `bench/`? | **Không** cho phương án hai tiến trình. | Xem mục 7 cho việc Dev tùy chọn. |

Hai giới hạn thấy khi đọc mã (không chặn việc chạy, nhưng người đọc kết quả phải biết):
1. Dòng `runs.jsonl` của R1/R2 **không có** `authSource`, `capped`, `turns` (`turns` luôn 0, đã nêu ở §9 (b)). Vì thế (a) §9 (j) "mọi dòng ghi `authSource`" không thể đạt cho arm CCoding; kiểm bằng bước 3 thay thế; (b) `capped` lấy từ `calls.jsonl` trong thư mục `--ccoding-data` (script phân tích đọc được, mục 6). Phải **giữ** thư mục đó.
2. `--ccoding-data` mặc định nằm trong `--work` (thư mục tạm). Luôn đặt tường minh như dưới đây.

## 2. Tệp cấu hình và SHA256SUMS

- `config-R1b.json`: `{ "defaults": { "acceptFollowupRounds": 0 }, "phases": { "toolTurns": { "accept": 6 } } }`. `config-R2b.json`: cùng cấu trúc, `accept` = **16**.
- `acceptFollowupRounds: 0` ở **cả hai** tệp: tắt vòng bổ sung sau nghiệm thu (mặc định 1, `src/config.ts:380`). Nếu bật, khi CTO chặn mà còn tiêu chí `scope:'in'` thì Dev sửa và CTO nghiệm thu lại (`src/orchestrator.ts` khoảng 1123–1361), còn `lib.mjs` đọc kết luận CUỐI: recall bị kéo xuống giả, chặn nhầm bị che, và R1b (chặn nhiều hơn) lệch nhiều hơn R2b. E7b đo **một** lượt `accept` mỗi mục. Script phân tích dừng nếu một task có hơn một lượt `accept` trong `calls.jsonl`; ở chạy thử phải tự kiểm đúng một lượt.
- **Hai tệp chỉ khác đúng giá trị `phases.toolTurns.accept`** (6 so với 16). Không có khóa nào khác, không có khóa, token hay đường dẫn máy.
- **Model không nằm trong tệp.** Model pha `accept` do arm đặt: R1 dùng mặc định của CTO (Sonnet), R2 đặt `phaseModels.accept = 'opus'` trong `lib.mjs`. Không thêm `phases.models.accept` vào cấu hình.
- `SHA256SUMS` (kiểm bằng `sha256sum -c SHA256SUMS` trong thư mục này, hoặc `Get-FileHash -Algorithm SHA256`). Tệp JSON đã commit với LF; `.gitattributes` có `text=auto`, nếu checkout trên Windows ra CRLF thì sha sẽ lệch: dùng `git show HEAD:<đường dẫn> | sha256sum` để đối chiếu.
- Cấu hình này chồng lên `ccoding.config.json` và `ccoding.local.json` của bản ghim (giống server bench 3e: chỉ `claude-cli`, chặn web). Runner ghi `localConfigSha256` và `extraConfigSha256` ở mỗi dòng.
- Trần 6 = mặc định hiện hành (`src/config.ts:385`); R1b vẫn đặt tường minh để `extraConfigSha256` của hai arm khác nhau và truy được.

## 3. Chuẩn bị (không gọi LLM)

Đường dẫn dùng `<ghim>` = bản checkout đã build của bản ghim (một commit cho cả hai arm, chứa `src/` từ `7beb50c1` trở đi và hai tệp cấu hình này). Thay `<…>` theo máy chạy.

```powershell
cd <ghim>; npm ci; npm run build
claude --version                      # ghi vào RUNLOG; cùng phiên bản cho hai arm; DISABLE_AUTOUPDATER=1
Copy-Item <3e>\ccoding.local.json <ghim>\ccoding.local.json
Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue   # chỉ phiên đăng nhập claude.ai, không khóa API
$E = "bench\vs-claude\results\e7-cto"; $B = "bench\vs-claude\results\e7b-cto"
Get-FileHash -Algorithm SHA256 $B\config-R1b.json, $B\config-R2b.json, $E\selected.json, $E\items.json   # selected.json phải có git blob 5b3e8fcf…
git rev-parse HEAD:$E/selected.json   # 5b3e8fcf2ba3816b39fdb5ba9ef021232a4b2f5f
git diff --no-index $B\config-R1b.json $B\config-R2b.json   # chỉ khác dòng accept (diff của PowerShell là Compare-Object, không so nội dung tệp)
New-Item -ItemType Directory $B\R1b, $B\R2b -Force
Copy-Item $E\selected.json $B\R1b\selected.json; Copy-Item $E\selected.json $B\R2b\selected.json   # bỏ qua bước 1
```

Ghi vào `RUNLOG.md` (tạo mới, trước lượt đầu): hash commit bản ghim, sha256 `dist` gộp, sha256 hai cấu hình, sha256 `selected.json` và `items.json`, sha256 `bench/vs-claude/e7/*.mjs` và `docs/research/analysis/e7b-analyze.mjs`, phiên bản CLI, `localConfigSha256`.

> Bước 1 (chốt mục) **không** chạy lại: `selected.json` đã có. Nhưng `prepareItem` vẫn dựng lại từng mục ở bước 2 và mục không dựng được ghi dòng `infra` (`prep`). Theo §9 (c) mục nào không dựng lại được thì loại cặp, không thay mục.

## 4. Chạy thử (một mục dự phòng, không vào phân tích)

Mục dự phòng chọn trước: `067cd64cc5` (mục đúng dự phòng của `c1-iis-ecs`, không thuộc `selected.json`; đã kiểm: không có trong danh sách chốt). Mỗi arm bằng cấu hình của chính nó, thư mục `out` **ngoài** `e7b-cto/`.

```powershell
node bench/vs-claude/e7/run.mjs --smoke 067cd64cc5 --arms R1 --config $B\config-R1b.json --items $E\items.json --out ..\e7b-smoke-R1b --work ..\e7b-work-smoke-R1b --ccoding-data ..\e7b-data-smoke-R1b
node bench/vs-claude/e7/run.mjs --smoke 067cd64cc5 --arms R2 --config $B\config-R2b.json --items $E\items.json --out ..\e7b-smoke-R2b --work ..\e7b-work-smoke-R2b --ccoding-data ..\e7b-data-smoke-R2b
node bench/vs-claude/e7/run.mjs --smoke 067cd64cc5 --arms R3 --config $B\config-R1b.json --items $E\items.json --out ..\e7b-smoke-auth --work ..\e7b-work-smoke-auth   # chỉ để đọc authSource của claude -p
```

Kiểm thêm (nhật ký lượt gọi, không phải kết quả): trong `..\e7b-data-smoke-R1b\runs\<taskId>\calls.jsonl` và bản R2b, mỗi task có **đúng một** bản ghi `phase:'accept'` (vòng bổ sung đã tắt). Nhiều hơn một → dừng, báo cấu hình.

Chỉ đọc các trường hạ tầng, **không đọc `verdict`**. Mỗi tệp `runs.jsonl` của chạy thử phải có đúng một dòng `done` với:
- `maxTurns` = **6** (R1b) và **16** (R2b). Khác thì dừng, báo cấu hình (§9 (j));
- `models` = Sonnet (R1b), Opus (R2b); `promptSha` hai arm giống nhau; `tools` = `["Read","Glob","Grep","Bash"]`;
- `extraConfigSha256` bằng sha256 của đúng tệp cấu hình tương ứng; `ccodingCommit` giống nhau.

**Kiểm `authSource` và 403.** Arm CCoding không ghi `authSource` (mục 1), nên: (a) dòng R3 của lượt `--out ..\e7b-smoke-auth` phải có `authSource = none` (phiên đăng nhập claude.ai, không khóa API; `lib/claude.mjs:11` đã bỏ các biến khóa cho `claude -p`; môi trường chạy CCoding trong tiến trình phải cũng không có `ANTHROPIC_API_KEY`, đã gỡ ở mục 3); (b) tìm lỗi 403:
```powershell
Select-String -Path ..\e7b-smoke-*\runs.jsonl -Pattern '403|Failed to authenticate|Cloudflare'
```
Có khớp, hoặc dòng `done` mà văn bản nghiệm thu là thông báo lỗi → **dừng**, báo người điều phối (không phân loại lại sau khi xem kết quả). Chạy thử này không vào `e7b-cto/`.

## 5. Chạy chính: hai tiến trình **cùng lúc**

Mở hai cửa sổ, bấm chạy cùng thời điểm (ghi giờ bắt đầu vào RUNLOG). **Không xen kẽ**: gọi đúng là "hai tiến trình song song" (§9 (k)). Cùng thứ tự mục. Hạn thời gian thật: `--timeout 20` (phút) **chỉ áp cho arm R3**; R1/R2 dùng `waitTimeoutMs` của `run.mjs` và `timeoutMsByPhase` của cấu hình, không khác nhau giữa hai tệp. `--timeout` ở hai lệnh dưới không có tác dụng với R1/R2; không đặt giá trị khác nhau theo arm.

```powershell
# cửa sổ 1 — R1b
node bench/vs-claude/e7/run.mjs --arms R1 --config $B\config-R1b.json --items $E\items.json --out $B\R1b --work ..\e7b-work-R1b --ccoding-data ..\e7b-data-R1b --timeout 20
# cửa sổ 2 — R2b
node bench/vs-claude/e7/run.mjs --arms R2 --config $B\config-R2b.json --items $E\items.json --out $B\R2b --work ..\e7b-work-R2b --ccoding-data ..\e7b-data-R2b --timeout 20
```

- Giữ `..\e7b-data-R1b`, `..\e7b-data-R2b` đến hết phân tích (nhật ký lượt gọi để tính `capped`). Chúng chưa được che PII; nằm **ngoài** repo, không commit.
- Hết hạn mức: runner thoát mã 3. Dừng **cả hai** tiến trình, chờ hạn mức mở, chạy lại **đúng lệnh cũ cho cả hai cùng lúc**. Cặp `done` được bỏ qua; dòng `infra` chạy lại; cặp lỗi hạ tầng 3 lần thì ghi thiếu.
- Dừng và ghi khối "Sai lệch" (không loại lặng lẽ) khi: có `authSource` khác phiên claude.ai (arm R3 không chạy ở đây; ở đây là phát hiện khóa API), nhiều lượt liên tiếp 403, `maxTurns` của dòng không phải 6/16, hai tệp cấu hình khác nhau ngoài `accept`.
- **Không mở `runs.jsonl` hay `responses/`** trước khi đủ. Không chạy lại vì kết quả. Chỉ in đếm.
- **Không chạy R3** (§9 (d)).
- Ước lượng: 128 lượt gọi mỗi arm. Ngân sách của gói là 6M token (phía người điều phối).

## 6. Kiểm sau khi chạy, rồi phân tích

Trước khi phân tích (đây không phải kết luận, chỉ trường hạ tầng):
```powershell
node -e "const fs=require('fs');const j=f=>fs.readFileSync(f,'utf8').split('\n').filter(Boolean).map(JSON.parse);const b=process.argv[1];const S=new Set;for(const a of ['R1b','R2b']){const r=j(b+'/'+a+'/runs.jsonl');const d=r.filter(x=>x.status==='done');console.log(a,'done',d.length,'infra',r.filter(x=>x.status==='infra').length,'commit',[...new Set(r.map(x=>x.ccodingCommit))],'cfg',[...new Set(r.map(x=>x.extraConfigSha256))],'maxTurns',[...new Set(d.map(x=>x.maxTurns))],'models',[...new Set(d.flatMap(x=>x.models))],'costBasis',[...new Set(d.map(x=>x.costBasis))])}" $B
Get-Content $B\SHA256SUMS | ForEach-Object { $h, $f = $_ -split ' \*'; "$f " + ((Get-FileHash -Algorithm SHA256 "$B\$f").Hash.ToLower() -eq $h) }   # phải in True cho cả hai tệp cấu hình
```
Phải thấy: `ccodingCommit` giống nhau và đúng **một** giá trị mỗi arm; `cfg` mỗi arm một giá trị, **khác nhau** giữa hai arm, và khớp `SHA256SUMS`; `maxTurns` 6 / 16; `costBasis` một giá trị. Không khớp → dừng, ghi sai lệch.

Phân tích (chỉ khi đã đủ; chưa có `runs.jsonl` thì script báo "chưa có dữ liệu" và không in số):
```powershell
node docs/research/analysis/e7b-analyze.mjs --r1b $B\R1b --r2b $B\R2b --data-r1b ..\e7b-data-R1b --data-r2b ..\e7b-data-R2b > $B\report.md
node docs/research/analysis/e7b-analyze.mjs --r1b $B\R1b --r2b $B\R2b --data-r1b ..\e7b-data-R1b --data-r2b ..\e7b-data-R2b --json > $B\report.json
```
- Có `--data-*` thì `capped` lấy từ cờ `turnCapped` (hoặc diag "chạm trần") của lượt `accept` ở `calls.jsonl` (nhãn "ghi"); thiếu bất kỳ tệp nào của một dòng có `taskId` thì quay về "suy ra" = `unread` và nhãn đó hiện ở bảng. Không có cờ `--data-*` thì luôn "suy ra". Script từ chối in số khi còn cặp chưa có dòng `done` ở cả hai arm, trừ khi thêm `--final` (chỉ khi đã dừng chủ định, ghi lý do vào RUNLOG); script dừng (mã 2) nếu một task có hơn một lượt `accept`.
- Script áp: quy tắc chính (`unread` = không chặn), độ nhạy S1 (`unread` = chặn) và S2 (bỏ cặp có `unread`), McNemar chính xác P1 (recall) và P2 (chặn nhầm), Holm hai phép, bootstrap hai tầng theo bài (B = 4000, seed `20261104`), nhãn "khác nhau / chưa phân biệt được / chưa kết luận", nhánh D→E→A→B→C→F phải trùng ở cả ba cách tính, USD theo `lib/pricing.mjs` (đọc `costUsd` đã ghi từng dòng), Youden J (mô tả), bảng theo bài, bảng E7 cạnh E7b ghi "khác bản mã".
- Cảnh báo cấu hình in ở đầu báo cáo nếu `maxTurns`, `ccodingCommit`, `extraConfigSha256` hay `authSource` sai.
- Không sửa script sau khi thấy số.

## 7. Việc Dev cần làm (tùy chọn, **không chặn** E7b theo phương án chính)

Không cần cho phương án hai tiến trình; chỉ cần nếu muốn quay về một tiến trình xen kẽ (§9 (c), phương án thay thế; phải ghi khối "Sai lệch" trước lượt đầu):
1. **Trần `accept` theo arm** trong `run.mjs`/`lib.mjs`: ví dụ trường `toolTurns` trong `ARMS` và truyền qua override trần theo lượt (xem `src/orchestrator.ts:182`) hoặc `phases.toolTurns` của `options` từng nhiệm vụ. Hiện `ARMS` chỉ có `model`.
2. **Ghi `capped`, `authSource`, `turns` vào dòng R1/R2** (`runCto` ở `lib.mjs`, từ `calls[]`: `capped`, và số lượt thật). Hiện `turns` luôn 0 và không có `capped`/`authSource`, nên phải suy từ `calls.jsonl`.
3. **Cờ `--selected <tệp>`** để không phải sao `selected.json` vào mỗi `--out`.
4. `e7/analyze.mjs` cố định cặp R1/R3; E7b dùng `docs/research/analysis/e7b-analyze.mjs` (mới) và chỉ import hàm của nó.

## 8. Hạn chế đã biết của phương án này

- Hai tiến trình chung hạn mức và tải máy; tốc độ và tỉ lệ `infra` có thể lệch giữa arm (§9 (l)). Ghi giờ từng dòng (`at`) và `infra` theo arm.
- R1b và R2b khác nhau ở cả model lẫn trần; không tách được tác động của model.
- Lượt `capped` của CCoding arm chỉ biết chắc khi giữ `--ccoding-data`; nếu mất thì "suy ra".
