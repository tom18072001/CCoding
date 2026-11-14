# E7 và E8: cách chạy (RUNBOOK)

Thiết kế và quy tắc ở `docs/research/preregistration.md`, mục "Bản chốt E7 và E8". Hai đợt này chỉ chạy **sau bước 2 của B-14**, E7 trước rồi E8, trên máy giám đốc với `claude` đăng nhập Max. Không dùng 9router, không dùng khóa API. Không đụng server 7420.

## Chuẩn bị chung (một lần)

```powershell
cd <máy-chạy>\ccoding-vs-claude
git -C ccoding-dev fetch origin perf/vs-claude-loop
git -C ccoding-dev worktree add ..\ccoding-e78 <commit khóa>     # bản ghim, ghi hash vào RUNLOG
cd ccoding-e78; npm ci; npm run build
claude --version                                                  # phải là 2.1.318 (DISABLE_AUTOUPDATER=1)
Copy-Item ..\ccoding-3e\ccoding.local.json .\ccoding.local.json     # như server bench: chỉ claude-cli, chặn web
```

`ccoding.local.json` phải giống bản của server bench đợt 3e: `runner: process`, `runtime.order` chỉ có `claude-cli`, `extraArgs` chặn WebFetch và WebSearch. Cổng đặt bằng `CCODING_PORT`, không sửa tệp. Runner E7 tự ghi sha256 của tệp này vào mỗi dòng (`localConfigSha256`).

Ghi vào RUNLOG trước khi chạy: hash commit; sha256 của `bench/vs-claude/e7/*.mjs`, `bench/vs-claude/e8/analyze.mjs`, `results/e7-cto/items.json`; phiên bản CLI.

## E7: CTO nghiệm thu trên lỗi lọt cổng

R1 và R2 chạy CCoding **trong tiến trình** (`createApp` của bản ghim, thư mục data riêng), không cần server. R3 gọi `claude -p`.

1. **Chạy thử một mục dự phòng** (không thuộc mẫu, ghi vào thư mục riêng, không vào phân tích). Mục `067cd64cc5` là mục đúng dự phòng của `c1-iis-ecs`.
   ```powershell
   node bench/vs-claude/e7/run.mjs --smoke 067cd64cc5 --arms R1,R3 --out ..\e7-smoke --work ..\e7-work-smoke
   ```
   Kiểm trong `..\e7-smoke\runs.jsonl`: hai dòng `done`, `promptSha` của R1 bằng của R3, `tools` của R1 là `["Read","Glob","Grep","Bash"]`. Chỉ xem các trường này, không xem `verdict`.
2. **Bước 1, chốt danh sách mục** (không gọi LLM, khoảng 5 phút):
   ```powershell
   node bench/vs-claude/e7/run.mjs --out bench\vs-claude\results\e7-cto --work ..\e7-work --prepare-only
   ```
   Ghi vào RUNLOG: số mục chốt, số mục thay và lý do, đọc từ `selected.json`. Commit `selected.json` và `prep.jsonl` **trước** bước 2.
3. **Bước 2, chạy** (khoảng 390 lượt gọi). Gặp hạn mức thì runner thoát mã 3; chạy lại đúng lệnh sau khi hạn mức mở lại.
   ```powershell
   node bench/vs-claude/e7/run.mjs --out bench\vs-claude\results\e7-cto --work ..\e7-work --timeout 20
   ```
   Runner chỉ in đếm. Không mở `runs.jsonl` hay `responses/` trước khi đủ dòng `done`.
4. **Phân tích** (chỉ khi đã đủ):
   ```powershell
   node bench/vs-claude/e7/analyze.mjs --out bench\vs-claude\results\e7-cto > bench\vs-claude\results\e7-cto\report.md
   ```

Văn bản lưu lại (`responses/`, lỗi trong `runs.jsonl`, `config-*.json`) đã được thay đường dẫn máy bằng `<work>`, `<ccoding>`, `<home>`. Repo công khai: kiểm lại bằng `Select-String -CaseSensitive 'C:\\Users'` trước khi commit.

## E8: song song có worktree

Cần hai server từ cùng bản ghim. Hai server chỉ khác cấu hình `fastLane.maxParallel`.

```powershell
# server A (cấu hình mặc định, fastLane.maxParallel 4)
$env:CCODING_PORT='7428'; $env:CCODING_DATA_DIR='<máy-chạy>\ccoding-vs-claude\e8-data-a'; Remove-Item Env:CCODING_CONFIG -ErrorAction SilentlyContinue
Start-Process node -ArgumentList 'dist/cli.js','serve' -WorkingDirectory <máy-chạy>\ccoding-vs-claude\ccoding-e78
# server B (thêm cấu hình {"fastLane":{"maxParallel":1}})
Set-Content ..\e8-b.json '{"fastLane":{"maxParallel":1}}'
$env:CCODING_PORT='7429'; $env:CCODING_DATA_DIR='<máy-chạy>\ccoding-vs-claude\e8-data-b'; $env:CCODING_CONFIG='<máy-chạy>\ccoding-vs-claude\e8-b.json'
Start-Process node -ArgumentList 'dist/cli.js','serve' -WorkingDirectory <máy-chạy>\ccoding-vs-claude\ccoding-e78
```

Ghi sha256 của `e8-b.json` vào RUNLOG. Server A không có tệp cấu hình thêm.

```powershell
node bench/vs-claude/run.mjs --arms A0-sonnet,B6w4,B6w1 --tasks l1-modules,t2-orders,t3-api --repeats 6 --timeout 30 `
  --ccoding-url http://127.0.0.1:7428 --ccoding-data <máy-chạy>\ccoding-vs-claude\e8-data-a `
  --ccoding-url-alt http://127.0.0.1:7429 --ccoding-data-alt <máy-chạy>\ccoding-vs-claude\e8-data-b `
  --out bench\vs-claude\results\e8-parallel
```

- Arm có `server: "alt"` (B6w1) đi server B; các arm khác đi server A.
- Mỗi dòng CCoding có thêm `wallSecTask`, `queueSecTask` và `maxConcSubtasks` (D14 K4).
- **Kiểm cấu hình khi chạy** (không phải xem kết quả): `maxConcSubtasks` của mọi dòng B6w1 phải ≤ 1. Có dòng ≥ 2 thì dừng đợt và báo giám đốc.
- Phân tích khi đủ 54 dòng: `node bench/vs-claude/e8/analyze.mjs bench\vs-claude\results\e8-parallel`.
