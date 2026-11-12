# E7 roi E8 (preregistration.md 9, "Ban chot E7 va E8"), chay sau buoc 2 cua B-14. Giam doc duyet chay 5/11 10:05;
# giao quyen tu duyet cho nguoi dieu phoi 12/11 22:57. Ban ghim: worktree ccoding-e78 (commit ghi trong log).
# Chay lai duoc (may khoi dong lai): buoc da xong thi bo qua. Gap han muc (exit 3) thi cho 30 phut, khong gioi han.
# Loi khac 5 lan lien khong tien trien thi dung (STOP-E78). Khong in diem, verdict hay token.
$ErrorActionPreference = 'Continue'
$env:DISABLE_AUTOUPDATER = '1'
$ROOT = 'C:\Users\admin\ccoding-vs-claude'
$W = "$ROOT\ccoding-e78"
$R3E = "$ROOT\ccoding-3e"
$LOG = "$ROOT\ops\e78-run.txt"
$CHK = "$ROOT\ops\e78-check.mjs"
$CLI0 = '2.1.318 (Claude Code)'
function Log([string]$m) { "$((Get-Date).ToUniversalTime().ToString('o')) $m" | Add-Content $LOG; "$(Get-Date -Format o) E78 $m" | Add-Content "$R3E\runlog-3e.txt" }
function Stopped { foreach ($f in "$R3E\STOP-3e", "$W\STOP-E78") { if (Test-Path $f) { Log "$f co mat: dung"; return $true } }; return $false }
function Halt([string]$m) { Log "$m : DUNG, bao giam doc"; New-Item -ItemType File "$W\STOP-E78" -Force | Out-Null; exit 1 }
function Sha([string]$f) { (Get-FileHash $f -Algorithm SHA256).Hash.ToLower() }
# chay lenh cho toi khi $done.Invoke() du; exit 3 -> cho 30 phut; 5 lan khong tien trien -> dung
function Loop([string]$name, [scriptblock]$run, [scriptblock]$progress) {
  $stall = 0; $rl = 0; $try = 0
  while ($true) {
    if (Stopped) { exit 0 }
    $p = & $progress; $have = [int]($p.Split(' ')[0]); $need = [int]($p.Split(' ')[1])
    if ($have -ge $need) { Log "$name xong: $have/$need"; return }
    $try++
    & $run
    $code = $LASTEXITCODE
    $after = [int]((& $progress).Split(' ')[0])
    if ($code -eq 3) { $rl++; if ($rl -eq 1 -or $rl % 6 -eq 0) { Log "$name lan $try exit 3 (han muc, lan $rl), $after/$need; cho 30 phut" }; Start-Sleep -Seconds 1800; continue }
    if ($rl -gt 0) { Log "$name : han muc mo lai sau $rl lan cho" }; $rl = 0
    Log "$name lan $try exit $code, $after/$need"
    if ($after -gt $have) { $stall = 0 } else { $stall++ }
    if ($stall -ge 5) { Halt "$name 5 lan khong tien trien (khong phai han muc)" }
  }
}
function StartServer([int]$port, [string]$data, [string]$extra, [string]$tag) {
  $env:CCODING_PORT = "$port"; $env:CCODING_DATA_DIR = $data
  if ($extra) { $env:CCODING_CONFIG = $extra } else { Remove-Item Env:CCODING_CONFIG -ErrorAction SilentlyContinue }
  $s = Start-Process node -ArgumentList 'dist/cli.js', 'serve' -WorkingDirectory $W -WindowStyle Hidden -PassThru -RedirectStandardOutput "$W\server-$tag.log" -RedirectStandardError "$W\server-$tag.err"
  Remove-Item Env:CCODING_PORT, Env:CCODING_DATA_DIR, Env:CCODING_CONFIG -ErrorAction SilentlyContinue
  for ($i = 0; $i -lt 24; $i++) { Start-Sleep -Seconds 5; try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:$port/api/health" | Out-Null; return $s } catch {} }
  return $null
}

Log "bat dau (pid $PID); cho B-14 buoc 2 xong"
while (-not (Select-String -Path "$ROOT\ops\b14-run.txt" -Pattern ' XONG 8 khoi' -CaseSensitive -Quiet)) {
  if (Stopped) { exit 0 }
  if (Test-Path "$ROOT\ccoding-b14\STOP-B14") { Log 'B-14 dung (STOP-B14): khong chay E7/E8, cho giam doc'; exit 0 }
  Start-Sleep -Seconds 300
}
Set-Location $W
if (-not (Select-String -Path "$W\npm-setup.log" -Pattern 'SETUP-OK' -Quiet)) { Halt 'npm ci/build cua ccoding-e78 chua xong' }
$cli = "$(claude --version)"; if ($cli -ne $CLI0) { Halt "CLI la $cli, khong phai $CLI0" }
$files = @('bench\vs-claude\e7\sample.mjs', 'bench\vs-claude\e7\lib.mjs', 'bench\vs-claude\e7\run.mjs', 'bench\vs-claude\e7\analyze.mjs', 'bench\vs-claude\e8\analyze.mjs', 'bench\vs-claude\results\e7-cto\items.json', 'bench\vs-claude\lib\ccoding.mjs', 'bench\vs-claude\lib\claude.mjs', 'ccoding.local.json')
Log "ban ghim $(git rev-parse HEAD), cli $cli; sha256: $(($files | ForEach-Object { "$(Split-Path $_ -Leaf)=$((Sha "$W\$_").Substring(0,12))" }) -join ' ')"

# ---------- E7 ----------
$E7 = 'bench\vs-claude\results\e7-cto'
$SMOKE = "$ROOT\e7-smoke"
Loop 'E7 chay thu' { & node bench/vs-claude/e7/run.mjs --smoke 067cd64cc5 --arms R1,R3 --out $SMOKE --work "$ROOT\vbe7s" --timeout 20 *>> "$W\e7-smoke.log" } { & node $CHK smokecount "$SMOKE\runs.jsonl" 067cd64cc5 }
$s = & node $CHK smoke "$SMOKE\runs.jsonl" 067cd64cc5
if ($s -ne 'OK') { Halt "E7 chay thu: $s" }
Log 'E7 chay thu: OK (promptSha R1 = R3, cong cu dung)'
if (-not (Test-Path "$W\$E7\selected.json")) {
  & node bench/vs-claude/e7/run.mjs --out $E7 --work "$ROOT\vbe7" --prepare-only *>> "$W\e7-prep.log"
  if (-not (Test-Path "$W\$E7\selected.json")) { Halt 'E7 buoc 1 khong tao duoc selected.json' }
}
$sel = Get-Content "$W\$E7\selected.json" -Raw | ConvertFrom-Json
Log "E7 danh sach chot: $($sel.n) muc, $($sel.skipped.Count) muc bi bo/thay; selected.json sha256 $(Sha "$W\$E7\selected.json"); prep.jsonl sha256 $(Sha "$W\$E7\prep.jsonl")"
Loop 'E7 chinh' { & node bench/vs-claude/e7/run.mjs --out $E7 --work "$ROOT\vbe7" --timeout 20 *>> "$W\e7-main.log" } { & node $CHK e7 "$W\$E7\runs.jsonl" "$W\$E7\selected.json" }

# ---------- E8 ----------
$E8 = 'bench\vs-claude\results\e8-parallel'
$BCFG = "$ROOT\e8-b.json"
if (-not (Test-Path $BCFG)) { '{"fastLane":{"maxParallel":1}}' | Set-Content -Encoding ascii $BCFG }
$sa = StartServer 7428 "$ROOT\e8-data-a" '' 'e8a'; if (-not $sa) { Halt 'E8 server A (7428) khong len' }
$sb = StartServer 7429 "$ROOT\e8-data-b" $BCFG 'e8b'; if (-not $sb) { Halt 'E8 server B (7429) khong len' }
Log "E8 server A pid $($sa.Id) (7428, khong cau hinh them), server B pid $($sb.Id) (7429, e8-b.json sha256 $(Sha $BCFG))"
$S8 = @('--runtime', 'claude-cli', '--ccoding-url', 'http://127.0.0.1:7428', '--ccoding-data', "$ROOT\e8-data-a", '--ccoding-url-alt', 'http://127.0.0.1:7429', '--ccoding-data-alt', "$ROOT\e8-data-b", '--work', "$ROOT\vbe8")
Loop 'E8' {
  & node bench/vs-claude/run.mjs --arms A0-sonnet,B6w4,B6w1 --tasks l1-modules,t2-orders,t3-api --repeats 6 --timeout 30 --out $E8 @S8 *>> "$W\e8.log"
  $rc = $LASTEXITCODE
  $c = [int](& node $CHK b6w1 "$W\$E8\runs.jsonl"); if ($c -gt 0) { Halt "E8: $c luot B6w1 chay chong (loi cau hinh)" }
  $global:LASTEXITCODE = $rc
} { & node $CHK e8 "$W\$E8\runs.jsonl" 54 }
Stop-Process -Id $sa.Id, $sb.Id -Force -ErrorAction SilentlyContinue
Log "XONG E7 E8; cli $(claude --version)"
