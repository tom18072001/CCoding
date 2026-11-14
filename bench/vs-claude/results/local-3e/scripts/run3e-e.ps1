# Dot 3e local, chay tiep E5' sau su co 5/11 khoang 11:10: ung dung Claude desktop khoi dong lai, giet ca cay tien trinh
# (run3e-d.ps1, b14-run.ps1, server 7425/7426) giua luot r3. Khoi bang WMI (Win32_Process.Create) de khong nam trong cay cua ung dung.
# E5' tren 7426: r3..r10 (runner bo qua khoa da xong; khoa dang chay do khi bi giet chua co dong nao nen chay lai theo 4.1),
# kiem Dung 2 sau moi luot nhu run3e-d.ps1. Khong in diem. Muon dung: tao STOP-3e trong ccoding-3e.
$ErrorActionPreference = 'Continue'
$env:DISABLE_AUTOUPDATER = '1'
$R3E = 'C:\Users\admin\ccoding-vs-claude\ccoding-3e'
$W = 'C:\Users\admin\ccoding-vs-claude\ccoding-e5f'
$CHECK = 'C:\Users\admin\ccoding-vs-claude\ops\check-e5f.mjs'
function Log([string]$m) { "$(Get-Date -Format o) $m" | Add-Content "$R3E\runlog-3e.txt" }
function Stopped { if (Test-Path "$R3E\STOP-3e") { Log 'E STOP-3e co mat: dung'; return $true }; return $false }
function StartServer([string]$dir, [int]$port, [string]$tag) {
  $s = Start-Process node -ArgumentList 'dist/cli.js', 'serve' -WorkingDirectory $dir -WindowStyle Hidden -PassThru -RedirectStandardOutput "$dir\server-$tag.log" -RedirectStandardError "$dir\server-$tag.err"
  for ($i = 0; $i -lt 24; $i++) { Start-Sleep -Seconds 5; try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:$port/api/health" | Out-Null; return $s } catch {} }
  return $null
}
Log "E bat dau (sau su co 11:10): DISABLE_AUTOUPDATER=$env:DISABLE_AUTOUPDATER, cli $(claude --version), pid $PID"
$s2 = StartServer $W 7426 'e5f-e'
if (-not $s2) { Log 'E server 7426 khong len: dung'; exit 1 }
Log "E server 7426 pid $($s2.Id) ($(git -C $W rev-parse --short HEAD))"
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
for ($k = 3; $k -le 10; $k++) {
  RunRep $k | Out-Null
  $c = & node $CHECK "$OUT\runs.jsonl"
  Log "E5F kiem r${k}: $c"
  if ($LASTEXITCODE -ne 0) { Log 'E5F DUNG theo (3) Dung 2: bao giam doc'; New-Item -ItemType File "$W\STOP-E5F" -Force | Out-Null; exit 0 }
}
if ($s2) { Stop-Process -Id $s2.Id -Force -ErrorAction SilentlyContinue }
Log "E5F XONG 10 luot moi o; cli $(claude --version)"
