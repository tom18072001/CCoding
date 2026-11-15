# Buoc 2 cua B-14: dung worktree ghim 0d216eb, hai cau hinh chi khac stablePrefix, chay test lenh ac y (tien dieu kien 7).
# Ghi ket qua vao ccoding-b14\b14-prerun.txt de dua vao RUNLOG truoc khoi 1. Khong goi LLM.
$ErrorActionPreference = 'Continue'
$env:DISABLE_AUTOUPDATER = '1'
$ROOT = 'C:\Users\admin\ccoding-vs-claude'
$B = "$ROOT\ccoding-b14"
$OUT = "$ROOT\ops\b14-prerun.txt"
function W([string]$m) { "$(Get-Date -Format o) $m" | Add-Content $OUT }
Set-Content $OUT ''
git -C "$ROOT\ccoding" fetch -q origin 2>&1 | Out-Null
if (-not (Test-Path $B)) { git -C "$ROOT\ccoding" worktree add --detach $B 0d216eb 2>&1 | Out-Null }
Set-Location $B
W "commit $(git rev-parse HEAD)"
W "status: $((git status --porcelain | Measure-Object -Line).Lines) dong khac (truoc khi them cau hinh)"
npm ci --no-audit --no-fund *> "$B\npm-ci.log"; W "npm ci exit $LASTEXITCODE"
npm run build *> "$B\npm-build.log"; W "npm run build exit $LASTEXITCODE"
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('$($ROOT -replace '\\','/')/ccoding-e5f/ccoding.local.json','utf8'));j.server.port=7427;fs.writeFileSync('b14-off.json',JSON.stringify(j,null,2)+'\n');j.runtimes['claude-cli'].stablePrefix=true;fs.writeFileSync('b14-on.json',JSON.stringify(j,null,2)+'\n')"
W "sha256 off $((Get-FileHash b14-off.json -Algorithm SHA256).Hash.ToLower())"
W "sha256 on  $((Get-FileHash b14-on.json -Algorithm SHA256).Hash.ToLower())"
$d = Compare-Object (Get-Content b14-off.json) (Get-Content b14-on.json) | ForEach-Object { "$($_.SideIndicator) $($_.InputObject.Trim())" }
W "diff off/on: $($d -join ' | ')"
npx tsx --test --test-reporter=tap test/claude-stable-prefix.test.ts test/claude-stable-prefix-adversarial.test.ts test/shell-policy-adversarial.test.ts *> "$B\adv-tests.log"
$sum = (Select-String -Path "$B\adv-tests.log" -Pattern '^# (tests|pass|fail) ' | ForEach-Object { $_.Line }) -join '; '
W "test lenh ac y (stablePrefix): exit $LASTEXITCODE; $sum"
W "analysis script blob $(git rev-parse HEAD:docs/research/analysis/b14-step2.mjs), commit cuoi $(git log -1 --format=%h -- docs/research/analysis/b14-step2.mjs)"
W "cli $(claude --version)"
W 'XONG setup'
