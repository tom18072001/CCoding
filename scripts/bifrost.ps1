# Chạy gateway Bifrost cho CCoding (Windows).
# - Nạp lại biến môi trường người dùng (đặt bằng setx) để Bifrost đọc được env.* trong config.json
# - Dữ liệu/cấu hình ở data\bifrost (đã .gitignore)
# Dùng trong herdr: "herdr": { "services": [ { "label": "bifrost", "command": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\bifrost.ps1" } ] }
param(
  [string]$AppDir = 'data\bifrost',
  [string]$HostAddr = '127.0.0.1',
  [int]$Port = 8080
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

foreach ($name in @('NINEROUTER_API_KEY', 'BIFROST_SETUP_TOKEN', 'BIFROST_VK_DEV', 'BIFROST_VK_RESEARCH', 'BIFROST_VK_OFFICE', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY')) {
  $v = [Environment]::GetEnvironmentVariable($name, 'User')
  if ($v) { Set-Item -Path "Env:$name" -Value $v }
}

New-Item -ItemType Directory -Force $AppDir | Out-Null
if (-not (Test-Path (Join-Path $AppDir 'config.json'))) {
  Copy-Item 'docs\bifrost.config.example.json' (Join-Path $AppDir 'config.json')
  Write-Host "==> Tạo $AppDir\config.json từ mẫu docs\bifrost.config.example.json" -ForegroundColor Cyan
}
Write-Host "==> Bifrost: http://${HostAddr}:${Port}  (app-dir: $AppDir)" -ForegroundColor Green
npx -y @maximhq/bifrost -app-dir $AppDir -host $HostAddr -port $Port
