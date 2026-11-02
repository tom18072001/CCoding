#!/bin/bash
# validate.sh <task>: starter phải trượt test ẩn; starter + ref phải đạt 100% (test thấy được + test ẩn)
set -u
T=/home/claude/bench/tasks/$1
W=$(mktemp -d)
cp -r $T/starter/. $W/ && mkdir -p $W/test-hidden && cp -r $T/hidden/. $W/test-hidden/
cd $W
echo "== starter: hidden"; node --test "test-hidden/**/*.test.js" 2>&1 | grep -E "^# (pass|fail)"
cp -r $T/ref/. $W/
echo "== ref: visible"; node --test "test/**/*.test.js" 2>&1 | grep -E "^# (pass|fail)"
echo "== ref: hidden"; node --test "test-hidden/**/*.test.js" 2>&1 | grep -E "^# (pass|fail)|not ok|Error|expected|actual" | head -40
rm -rf $W
