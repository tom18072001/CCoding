# Dot 3e local, phan chay tiep sau quyet dinh cua giam doc 5/11 10:05 (preregistration.md 9, V4-3e-E5' "Sai lech (3)").
# 1) Ghim Claude Code CLI: DISABLE_AUTOUPDATER=1 cho moi tien trinh con; khoi dong lai server 7425 va 7426 de nhan bien nay.
# 2) Chay lai 1 khoa thieu cua E6 (t2-orders__B0__r3, 4.1) tren 7425: runner bo qua khoa da xong.
# 3) E5' tren 7426: r1 (da xong, bo qua) -> kiem --first (check-e5f.mjs ban sua) -> r2..r10, kiem Dung 2 sau moi luot.
# Khong in diem. Muon dung: tao STOP-3e trong ccoding-3e.
$ErrorActionPreference = 'Continue'
$env:DISABLE_AUTOUPDATER = '1'
$R3E = 'C:\Users\admin\ccoding-vs-claude\ccoding-3e'
$W = 'C:\Users\admin\ccoding-vs-claude\ccoding-e5f'
$CHECK = 'C:\Users\admin\ccoding-vs-claude\ops\check-e5f.mjs'
function Log([string]$m) { "$(Get-Date -Format o) $m" | Add-Content "$R3E\runlog-3e.txt" }
function Stopped { if (Test-Path "$R3E\STOP-3e") { Log 'D STOP-3e co mat: dung'; return $true }; return $false }
function StartServer([string]$dir, [int]$port, [string]$tag) {
  $s = Start-Process node -ArgumentList 'dist/cli.js', 'serve' -WorkingDirectory $dir -WindowStyle Hidden -PassThru -RedirectStandardOutput "$dir\server-$tag.log" -RedirectStandardError "$dir\server-$tag.err"
  for ($i = 0; $i -lt 24; $i++) { Start-Sleep -Seconds 5; try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:$port/api/health" | Out-Null; return $s } catch {} }
  return $null
}
Log "D bat dau: DISABLE_AUTOUPDATER=$env:DISABLE_AUTOUPDATER, cli $(claude --version)"
foreach ($old in 44532, 12988) { Stop-Process -Id $old -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 5
$s1 = StartServer $R3E 7425 '3e-d'
if (-not $s1) { Log 'D server 7425 khong len: dung'; exit 1 }
$s2 = StartServer $W 7426 'e5f-d'
if (-not $s2) { Log 'D server 7426 khong len: dung'; exit 1 }
Log "D server 7425 pid $($s1.Id) (6c454f6), 7426 pid $($s2.Id) (57148de)"
Remove-Item "$W\STOP-E5F" -Force -ErrorAction SilentlyContinue
# --- 2) khoa thieu cua E6
Set-Location $R3E
$S3 = @('--runtime', 'claude-cli', '--ccoding-url', 'http://127.0.0.1:7425', '--ccoding-data', "$R3E\data", '--work', 'C:\Users\admin\ccoding-vs-claude\vb3e')
$T7 = 'l1-modules,l2-chain,t1-duration,t2-orders,t3-api,t4-perf,t5-logq'
for ($try = 1; $try -le 30; $try++) {
  if (Stopped) { exit 0 }
  Log "D START E6c-bu lan $try"
  & node bench/vs-claude/run.mjs --arms B0 --tasks $T7 --repeats 3 --timeout 40 --out bench\vs-claude\results\h6-3e @S3 *>> "logs-3e\E6c-bu.log"
  $code = $LASTEXITCODE
  Log "D END E6c-bu exit $code"
  if ($code -eq 3) { Start-Sleep -Seconds 1200; continue }
  break
}
# --- 3) E5'
Set-Location $W
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
Log "E5F kiem r1 (check sua 5/11): $c"
if ($LASTEXITCODE -ne 0) { Log 'E5F DUNG theo (3): bao giam doc'; New-Item -ItemType File "$W\STOP-E5F" -Force | Out-Null; exit 0 }
for ($k = 2; $k -le 10; $k++) {
  RunRep $k | Out-Null
  $c = & node $CHECK "$OUT\runs.jsonl"
  Log "E5F kiem r${k}: $c"
  if ($LASTEXITCODE -ne 0) { Log 'E5F DUNG theo (3) Dung 2: bao giam doc'; New-Item -ItemType File "$W\STOP-E5F" -Force | Out-Null; exit 0 }
}
Log "E5F XONG 10 luot moi o; cli $(claude --version)"
