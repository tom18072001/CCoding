#!/usr/bin/env sh
# Khởi động CCoding Office nền bằng herdr (macOS/Linux).
set -eu
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo "Chưa có Node.js (>= 22)"; exit 1; }
if ! command -v herdr >/dev/null; then
  echo "==> Cài herdr..."
  curl -fsSL https://herdr.dev/install.sh | sh
  PATH="$HOME/.local/bin:$PATH"
fi
[ -d node_modules ] && [ -f dist/cli.js ] || npm install --no-audit --no-fund
node dist/cli.js doctor
node dist/cli.js herdr up
echo
echo "Mở giao diện: http://127.0.0.1:7420"
echo "Vào văn phòng: herdr --session ccoding   (thoát nền: ctrl+b q)"
