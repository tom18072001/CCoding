# Khởi động CCoding Office nền bằng herdr trên Windows.
# Dùng: powershell -ExecutionPolicy Bypass -File scripts\start-windows.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Chưa có Node.js (cần >= 22): https://nodejs.org' }

if (-not (Get-Command herdr -ErrorAction SilentlyContinue)) {
  Write-Host '==> Cài herdr...' -ForegroundColor Cyan
  powershell -ExecutionPolicy Bypass -c "irm https://herdr.dev/install.ps1 | iex"
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')
}

if (-not (Test-Path node_modules) -or -not (Test-Path dist\cli.js)) {
  Write-Host '==> npm install (cài phụ thuộc + build)...' -ForegroundColor Cyan
  npm install --no-audit --no-fund
}

node dist\cli.js doctor
node dist\cli.js herdr up
Write-Host ''
Write-Host 'Mở giao diện: http://127.0.0.1:7420' -ForegroundColor Green
Write-Host 'Vào văn phòng trong terminal: herdr --session ccoding   (thoát nền: ctrl+b q)' -ForegroundColor Green
