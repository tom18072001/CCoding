# Buoc 2 cua B-14, chay tiep sau su co han muc tuan (5/11 18:20 -> mo lai 8/11 20:00) va may khoi dong lai (12/11 00:31).
# Giong b14-run.ps1 (ABBA 8 khoi x 4 luot, arm B7, t2-orders,t3-api,t4-perf, cau hinh chi khac stablePrefix), sua mot loi:
# b14-run.ps1 sang khoi sau khi het 60 lan thu ma khoi truoc chua du (khoi 1 chi xong 1/12 luot roi sang khoi 2).
# Ban nay: khoi chi xong khi du so dong done cua khoi; gap han muc (exit 3) thi cho 30 phut va thu lai, khong gioi han so lan;
# loi khac khong tien trien 5 lan lien thi dung (STOP-B14). Khoi da du thi bo qua (chay lai duoc sau khi may khoi dong lai).
# Moi khoi ghi gio UTC, sha256 cau hinh, phien ban CLI. CLI doi giua chung thi dung (9). Khong in diem/token.
$ErrorActionPreference = 'Continue'
$env:DISABLE_AUTOUPDATER = '1'
$ROOT = 'C:\Users\admin\ccoding-vs-claude'
$R3E = "$ROOT\ccoding-3e"
$B = "$ROOT\ccoding-b14"
$LOG = "$ROOT\ops\b14-run.txt"
function Log([string]$m) { "$((Get-Date).ToUniversalTime().ToString('o')) $m" | Add-Content $LOG; "$(Get-Date -Format o) B14 $m" | Add-Content "$R3E\runlog-3e.txt" }
function Stopped { if (Test-Path "$R3E\STOP-3e") { Log 'STOP-3e co mat: dung'; return $true }; if (Test-Path "$B\STOP-B14") { Log 'STOP-B14 co mat: dung'; return $true }; return $false }
function DoneCount([string]$arm, [int]$rep) {
  $f = "$B\bench\vs-claude\results\b14-step2\$arm\runs.jsonl"
  return [int](& node -e "const fs=require('fs');const f=process.argv[1],rep=+process.argv[2];if(!fs.existsSync(f)){console.log(0);process.exit(0)}const k=new Set(fs.readFileSync(f,'utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)).filter(r=>r.status==='done'&&+String(r.key).split('__r')[1]<=rep).map(r=>r.key));console.log(k.size)" $f $rep)
}
Set-Location $B
New-Item -ItemType Directory -Force logs-b14 | Out-Null
$CLI0 = '2.1.318 (Claude Code)'
Log "chay tiep (b14-run2.ps1, pid $PID), commit $(git rev-parse HEAD), cli $(claude --version)"
if ("$(claude --version)" -ne $CLI0) { Log "CLI khong phai $CLI0 : dung theo (9)"; exit 1 }
$S = @('--runtime', 'claude-cli', '--ccoding-url', 'http://127.0.0.1:7427', '--ccoding-data', "$B\data", '--work', "$ROOT\vbb14")
$plan = @(@('off', 4), @('on', 4), @('on', 8), @('off', 8), @('off', 12), @('on', 12), @('on', 16), @('off', 16))
$srv = $null
for ($i = 0; $i -lt 8; $i++) {
  $arm = $plan[$i][0]; $rep = $plan[$i][1]; $need = 3 * $rep
  if (Stopped) { exit 0 }
  if ((DoneCount $arm $rep) -ge $need) { Log "khoi $($i+1) nhanh $arm r$($rep-3)-${rep}: da du $need dong, bo qua"; continue }
  if ($srv) { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 5 }
  Copy-Item "$B\b14-$arm.json" "$B\ccoding.local.json" -Force
  $sha = (Get-FileHash "$B\ccoding.local.json" -Algorithm SHA256).Hash.ToLower()
  $srv = Start-Process node -ArgumentList 'dist/cli.js', 'serve' -WorkingDirectory $B -WindowStyle Hidden -PassThru -RedirectStandardOutput "$B\server-b14r-$($i+1).log" -RedirectStandardError "$B\server-b14r-$($i+1).err"
  $up = $false
  for ($t = 0; $t -lt 24; $t++) { Start-Sleep -Seconds 5; try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://127.0.0.1:7427/api/health' | Out-Null; $up = $true; break } catch {} }
  if (-not $up) { Log "khoi $($i+1): server khong len: dung"; exit 1 }
  $cli = "$(claude --version)"
  Log "khoi $($i+1) nhanh $arm r$($rep-3)-${rep}: server pid $($srv.Id), cau hinh sha256 $sha, cli $cli, da co $(DoneCount $arm $rep)/$need"
  if ($cli -ne $CLI0) { Log "CLI doi ($CLI0 -> $cli): dung theo (9)"; exit 1 }
  $stall = 0; $try = 0; $rl = 0
  while ((DoneCount $arm $rep) -lt $need) {
    if (Stopped) { exit 0 }
    $try++; $before = DoneCount $arm $rep
    & node bench/vs-claude/run.mjs --arms B7 --tasks t2-orders,t3-api,t4-perf --repeats $rep --timeout 20 --out "bench\vs-claude\results\b14-step2\$arm" @S *>> "logs-b14\khoi-$($i+1).log"
    $code = $LASTEXITCODE
    $after = DoneCount $arm $rep
    if ($code -eq 3) { $rl++; if ($rl -eq 1 -or $rl % 6 -eq 0) { Log "khoi $($i+1) lan $try exit 3 (han muc, lan $rl), $after/$need; cho 30 phut" }; Start-Sleep -Seconds 1800; continue }
    if ($rl -gt 0) { Log "khoi $($i+1): han muc mo lai sau $rl lan cho" }; $rl = 0
    Log "khoi $($i+1) lan $try exit $code, $after/$need"
    if ($after -gt $before) { $stall = 0 } else { $stall++ }
    if ($stall -ge 5) { Log "khoi $($i+1): 5 lan khong tien trien (khong phai han muc): DUNG, bao giam doc"; New-Item -ItemType File "$B\STOP-B14" -Force | Out-Null; exit 1 }
  }
  Log "khoi $($i+1) xong: $(DoneCount $arm $rep)/$need"
  # dung an toan (7): nhanh bat co dau hieu ro ri (truong leak cua runner) thi dung ngay
  $leak = & node -e "const fs=require('fs');const f=process.argv[1];if(!fs.existsSync(f)){console.log(0);process.exit(0)}console.log(fs.readFileSync(f,'utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)).filter(r=>r.leak).length)" "$B\bench\vs-claude\results\b14-step2\on\runs.jsonl"
  if ([int]$leak -gt 0) { Log "nhanh bat co $leak luot leak: DUNG AN TOAN, bao Phong Dev va giam doc"; New-Item -ItemType File "$B\STOP-B14" -Force | Out-Null; exit 0 }
}
if ($srv) { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue }
Log "XONG 8 khoi; cli $(claude --version)"
