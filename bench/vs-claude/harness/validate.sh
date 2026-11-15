#!/bin/bash
# validate.sh <bài>: starter phải trượt test ẩn; starter + ref phải đạt 100% (test thấy được + test ẩn)
set -u
T="$(cd "$(dirname "$0")/../tasks" && pwd)/$1"
[ -d "$T" ] || { echo "Không có bài: $1"; exit 2; }
W="$(mktemp -d)"
cp -r "$T/starter/." "$W/" && mkdir -p "$W/test-hidden" && cp -r "$T/hidden/." "$W/test-hidden/"
cd "$W" || exit 2
echo "== starter: visible"; node --test --test-reporter=tap "test/**/*.test.js" 2>&1 | grep -E "^# (pass|fail)"
echo "== starter: hidden"; node --test --test-reporter=tap "test-hidden/**/*.test.js" 2>&1 | grep -E "^# (pass|fail)"
cp -r "$T/ref/." "$W/"
echo "== ref: visible"; node --test --test-reporter=tap "test/**/*.test.js" 2>&1 | grep -E "^# (pass|fail)"
echo "== ref: hidden"; node --test --test-reporter=tap "test-hidden/**/*.test.js" 2>&1 | grep -E "^# (pass|fail)|not ok|Error|expected|actual" | head -40
cd / && rm -rf "$W"
