# Đợt 3e local, phần E5′ (V4-3e-E5′, preregistration.md §9; giám đốc duyệt 4/11 12:50).
# Chờ run3e-b.ps1 xong (dòng "XONG phan sau"), rồi bật server 7426 ở worktree ccoding-e5f (commit 57148de, gộp D12),
# chạy B0F, B1F × l1-modules, l2-chain: r1 (kiểm Dừng 1 + nhiễu), rồi r2…r10 (kiểm Dừng 2 sau mỗi lượt lặp).
# check-e5f.mjs chỉ đọc arm, task, rep, status, byPhase; không in điểm. Muốn dừng: tạo STOP-3e trong ccoding-3e.
$ErrorActionPreference = 'Continue'
$R3E = 'C:\Users\admin\ccoding-vs-claude\ccoding-3e'
$W = 'C:\Users\admin\ccoding-vs-claude\ccoding-e5f'
$CHECK = 'C:\Users\admin\ccoding-vs-claude\ops\check-e5f.mjs'
Set-Location $W
New-Item -ItemType Directory -Force logs-e5f | Out-Null
function Log([string]$m) { "$(Get-Date -Format o) $m" | Add-Content "$R3E\runlog-3e.txt" }
function Stopped { if (Test-Path "$R3E\STOP-3e") { Log 'E5F STOP-3e co mat: dung'; return $true }; return $false }
Log 'E5F cho run3e-b xong'
while (-not (Select-String -Path "$R3E\runlog-3e.txt" -Pattern 'XONG phan sau' -SimpleMatch -Quiet)) {
  if (Stopped) { exit 0 }
  Start-Sleep -Seconds 300
}
$srv = Start-Process node -ArgumentList 'dist/cli.js', 'serve' -WorkingDirectory $W -WindowStyle Hidden -PassThru -RedirectStandardOutput "$W\server-e5f.log" -RedirectStandardError "$W\server-e5f.err"
$up = $false
for ($i = 0; $i -lt 24; $i++) { Start-Sleep -Seconds 5; try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://127.0.0.1:7426/api/health' | Out-Null; $up = $true; break } catch {} }
if (-not $up) { Log 'E5F server 7426 khong len: dung'; exit 1 }
Log "E5F server 7426 pid $($srv.Id), commit $(git rev-parse --short HEAD), cli $(claude --version)"
$S = @('--runtime', 'claude-cli', '--ccoding-url', 'http://127.0.0.1:7426', '--ccoding-data', "$W\data", '--work', 'C:\Users\admin\ccoding-vs-claude\vbe5f')
$OUT = 'bench\vs-claude\results\b15f-main'
function RunRep([int]$k) {
  for ($try = 1; $try -le 60; $try++) {
    if (Stopped) { exit 0 }
    Log "START E5F r$k lan $try"
    & node bench/vs-claude/run.mjs --arms B0F,B1F --tasks l1-modules,l2-chain --repeats $k --timeout 40 --out $OUT @S *>> "logs-e5f\E5F.log"
    $code = $LASTEXITCODE
    Log "END E5F r$k exit $code"
    if ($code -eq 3) { Start-Sleep -Seconds 1200; continue }
    return $code
  }
  return 99
}
RunRep 1 | Out-Null
$c = & node $CHECK "$OUT\runs.jsonl" --first
Log "E5F kiem r1: $c"
if ($LASTEXITCODE -ne 0) { Log 'E5F DUNG theo (3): bao giam doc'; New-Item -ItemType File "$W\STOP-E5F" -Force | Out-Null; exit 0 }
for ($k = 2; $k -le 10; $k++) {
  RunRep $k | Out-Null
  $c = & node $CHECK "$OUT\runs.jsonl"
  Log "E5F kiem r${k}: $c"
  if ($LASTEXITCODE -ne 0) { Log 'E5F DUNG theo (3) Dung 2: bao giam doc'; New-Item -ItemType File "$W\STOP-E5F" -Force | Out-Null; exit 0 }
}
Log 'E5F XONG 10 luot moi o'
