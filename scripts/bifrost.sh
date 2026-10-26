#!/usr/bin/env sh
# Chạy gateway Bifrost cho CCoding (macOS/Linux). Dữ liệu ở data/bifrost (đã .gitignore).
set -eu
cd "$(dirname "$0")/.."
APP_DIR="${1:-data/bifrost}"
mkdir -p "$APP_DIR"
[ -f "$APP_DIR/config.json" ] || cp docs/bifrost.config.example.json "$APP_DIR/config.json"
echo "==> Bifrost: http://127.0.0.1:8080 (app-dir: $APP_DIR)"
exec npx -y @maximhq/bifrost -app-dir "$APP_DIR" -host 127.0.0.1 -port 8080
