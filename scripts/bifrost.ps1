# Chạy gateway Bifrost cho CCoding (Windows).
# - Nạp lại biến môi trường người dùng (đặt bằng setx) để Bifrost đọc được env.* trong config.json
# - Dữ liệu/cấu hình ở data\bifrost (đã .gitignore)
# - Lần đầu tải bản Bifrost mới nhất qua npx (~130 MB) rồi giữ lại ở data\bifrost\bin để lần sau khởi động ngay.
#   Cập nhật Bifrost: xóa data\bifrost\bin\bifrost-http.exe rồi chạy lại.
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
$bin = Join-Path (Resolve-Path $AppDir) 'bin\bifrost-http.exe'
Write-Host "==> Bifrost: http://${HostAddr}:${Port}  (app-dir: $AppDir)" -ForegroundColor Green
if (Test-Path $bin) {
  & $bin -app-dir $AppDir -host $HostAddr -port $Port -log-style pretty
  exit $LASTEXITCODE
}

# Chưa có bản lưu sẵn: chạy qua npx, đồng thời sao lưu binary khi tiến trình xuất hiện
New-Item -ItemType Directory -Force (Split-Path $bin) | Out-Null
Start-Job -ArgumentList $bin -ScriptBlock {
  param($dest)
  for ($i = 0; $i -lt 1800; $i++) {
    $p = Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'bifrost-http*' -and $_.ExecutablePath -like '*bifrost-npx-*' } | Select-Object -First 1
    if ($p) { Start-Sleep 3; Copy-Item $p.ExecutablePath $dest -Force; break }
    Start-Sleep 2
  }
} | Out-Null
npx -y @maximhq/bifrost -app-dir $AppDir -host $HostAddr -port $Port -log-style pretty
