#!/usr/bin/env bash
# D12/S4: chạy analyze.mjs trước D12 (e12e037, giải nén bằng git archive vào thư mục tạm) và sau D12 (HEAD)
# trên bản sao runs.jsonl. Không ghi vào results/. Dùng: bash docs/research/analysis/d12-before-after.sh [OUT]
# (chạy từ gốc worktree; OUT mặc định là thư mục tạm).
set -u
ROOT=$(pwd); OUT=${1:-$(mktemp -d)}; OLD=$(mktemp -d)
git archive e12e037 bench/vs-claude package.json | tar -x -C "$OLD" || exit 2
run() { # tag verRoot dataset treatment subdir extra...
  local tag=$1 vr=$2 ds=$3 tr=$4 sub=$5; shift 5
  local d="$OUT/$tag/$sub"; mkdir -p "$d"; cp "$ROOT/bench/vs-claude/results/$ds/runs.jsonl" "$d/"
  node "$vr/bench/vs-claude/analyze.mjs" "$d" --baseline A0-sonnet --treatment "$tr" "$@" > "$d/stdout.txt" 2>&1
  echo "exit $?" >> "$d/stdout.txt"
}
for v in before:"$OLD" after:"$ROOT"; do
  tag=${v%%:*}; vr=${v#*:}
  for t in B0 B5 B6 B7 A1 A2; do run $tag "$vr" study-cloud $t "study-cloud-$t" --allow-mixed-judge; done
  run $tag "$vr" study-cloud B0 study-cloud-B0.b01B7 --allow-mixed-judge --b01-arm B7
  run $tag "$vr" study-cloud B0 study-cloud-B0.b01B6 --allow-mixed-judge --b01-arm B6
  run $tag "$vr" b7prime B7cab b7prime-B7cab --allow-mixed-judge
done
rm -rf "$OLD"
echo "$OUT"
