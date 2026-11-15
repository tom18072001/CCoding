# Buoc 2 cua B-14 (preregistration.md 9, giam doc duyet 4/11 12:50): ABBA 8 khoi x 4 luot, arm B7, bai t2-orders,t3-api,t4-perf.
# Cho E5' xong ("E5F XONG" trong runlog-3e.txt). Doi nhanh = chep dung cau hinh roi khoi dong lai server 7427.
# Moi khoi ghi gio UTC, sha256 cau hinh, phien ban CLI vao b14-run.txt. CLI doi giua chung thi dung (9). Khong in diem/token.
$ErrorActionPreference = 'Continue'
$env:DISABLE_AUTOUPDATER = '1'
$ROOT = 'C:\Users\admin\ccoding-vs-claude'
$R3E = "$ROOT\ccoding-3e"
$B = "$ROOT\ccoding-b14"
$LOG = "$ROOT\ops\b14-run.txt"
function Log([string]$m) { "$((Get-Date).ToUniversalTime().ToString('o')) $m" | Add-Content $LOG; "$(Get-Date -Format o) B14 $m" | Add-Content "$R3E\runlog-3e.txt" }
function Stopped { if (Test-Path "$R3E\STOP-3e") { Log 'STOP-3e co mat: dung'; return $true }; if (Test-Path "$B\STOP-B14") { Log 'STOP-B14 co mat: dung'; return $true }; return $false }
Log 'doi E5-phay ket thuc'
while (-not (Select-String -Path "$R3E\runlog-3e.txt" -Pattern '^\S+ E5F XONG 10 luot moi o' -CaseSensitive -Quiet)) {
  if (Stopped) { exit 0 }
  if (Test-Path "$ROOT\ccoding-e5f\STOP-E5F") { Log 'E5F dung (STOP-E5F): khong chay B-14, cho giam doc'; exit 0 }
  Start-Sleep -Seconds 300
}
Set-Location $B
New-Item -ItemType Directory -Force logs-b14 | Out-Null
$CLI0 = "$(claude --version)"
Log "bat dau, commit $(git rev-parse HEAD), cli $CLI0"
$S = @('--runtime', 'claude-cli', '--ccoding-url', 'http://127.0.0.1:7427', '--ccoding-data', "$B\data", '--work', "$ROOT\vbb14")
$plan = @(@('off', 4), @('on', 4), @('on', 8), @('off', 8), @('off', 12), @('on', 12), @('on', 16), @('off', 16))
$srv = $null
for ($i = 0; $i -lt 8; $i++) {
  $arm = $plan[$i][0]; $rep = $plan[$i][1]
  if (Stopped) { exit 0 }
  if ($srv) { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 5 }
  Copy-Item "$B\b14-$arm.json" "$B\ccoding.local.json" -Force
  $sha = (Get-FileHash "$B\ccoding.local.json" -Algorithm SHA256).Hash.ToLower()
  $srv = Start-Process node -ArgumentList 'dist/cli.js', 'serve' -WorkingDirectory $B -WindowStyle Hidden -PassThru -RedirectStandardOutput "$B\server-b14-$($i+1).log" -RedirectStandardError "$B\server-b14-$($i+1).err"
  $up = $false
  for ($t = 0; $t -lt 24; $t++) { Start-Sleep -Seconds 5; try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://127.0.0.1:7427/api/health' | Out-Null; $up = $true; break } catch {} }
  if (-not $up) { Log "khoi $($i+1): server khong len: dung"; exit 1 }
  $cli = "$(claude --version)"
  Log "khoi $($i+1) nhanh $arm r$($rep-3)-${rep}: server pid $($srv.Id), cau hinh sha256 $sha, cli $cli"
  if ($cli -ne $CLI0) { Log "CLI doi ($CLI0 -> $cli): dung theo (9)"; exit 1 }
  for ($try = 1; $try -le 60; $try++) {
    if (Stopped) { exit 0 }
    & node bench/vs-claude/run.mjs --arms B7 --tasks t2-orders,t3-api,t4-perf --repeats $rep --timeout 20 --out "bench\vs-claude\results\b14-step2\$arm" @S *>> "logs-b14\khoi-$($i+1).log"
    $code = $LASTEXITCODE
    Log "khoi $($i+1) lan $try exit $code"
    if ($code -eq 3) { Start-Sleep -Seconds 1200; continue }
    break
  }
  # dung an toan (7): nhanh bat co dau hieu ro ri (truong leak cua runner) thi dung ngay
  $leak = & node -e "const fs=require('fs');const f=process.argv[1];if(!fs.existsSync(f)){console.log(0);process.exit(0)}console.log(fs.readFileSync(f,'utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)).filter(r=>r.leak).length)" "$B\bench\vs-claude\results\b14-step2\on\runs.jsonl"
  if ([int]$leak -gt 0) { Log "nhanh bat co $leak luot leak: DUNG AN TOAN, bao Phong Dev va giam doc"; New-Item -ItemType File "$B\STOP-B14" -Force | Out-Null; exit 0 }
}
if ($srv) { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue }
Log "XONG 8 khoi; cli $(claude --version)"
