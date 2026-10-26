# Sinh key ảo ngẫu nhiên cho từng phòng ban và lưu vào biến môi trường người dùng (Windows).
# Không in giá trị ra màn hình. Bifrost đọc qua env.BIFROST_VK_* trong config.json; CCoding đọc qua env:BIFROST_VK_*.
# Chạy lại với -Force để xoay (đổi) key.
param([switch]$Force)
$names = @('BIFROST_VK_DEV', 'BIFROST_VK_RESEARCH', 'BIFROST_VK_OFFICE')
foreach ($n in $names) {
  if (-not $Force -and [Environment]::GetEnvironmentVariable($n, 'User')) { Write-Host "= $n đã có (giữ nguyên)"; continue }
  $bytes = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $val = 'sk-bf-ccoding-' + (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
  [Environment]::SetEnvironmentVariable($n, $val, 'User')
  Remove-Variable val
  Write-Host "+ Đã tạo $n"
}
Write-Host 'Khởi động lại Bifrost và server CCoding để áp dụng.'
