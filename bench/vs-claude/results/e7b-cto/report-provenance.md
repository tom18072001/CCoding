# Nguồn gốc report.md / report.json (E7b, BRIEF-27 K1)

- Shell: Git Bash (stdout chuyển hướng bằng `>`, UTF-8 đúng byte, không qua PowerShell). Node v24.14.0.
- Mã commit lúc chạy: 596c389981b0963a64adeab0419f1f75058e000e (script `e7b-analyze.mjs` không sửa).
- Lệnh nguyên văn (từ gốc repo):
  - `node docs/research/analysis/e7b-analyze.mjs --runs bench/vs-claude/results/e7b-cto/run/runs.jsonl --data bench/vs-claude/results/e7b-cto/calls-accept > bench/vs-claude/results/e7b-cto/report.md`
  - `node docs/research/analysis/e7b-analyze.mjs --runs bench/vs-claude/results/e7b-cto/run/runs.jsonl --data bench/vs-claude/results/e7b-cto/calls-accept --json > bench/vs-claude/results/e7b-cto/report.json`
- Không dùng `--final` (RUNLOG: 0 cặp thiếu). RUNBOOK mục 6 ghi `--data ..\e7b-data`; lần chạy dùng `calls-accept/` (bản rút gọn).
- Mã thoát: 0 và 0 (không dừng ở kiểm hạ tầng).
- sha256:
  - report.md   `1ea7deea30c9c0ddb818a5a288c9e9122bc71e8b9b4c70984d1fa7fa5630694e` (6085 byte)
  - report.json `cc51ec64da0f0bfa7f06fc9360f63ed4b891e9eb59912444e51a093f086c0984` (11264 byte)
- Kiểm tái lập: chạy lần hai (cùng lệnh) ra `.scratch/`, `cmp` với lần một: trùng byte cả hai tệp.
- Kết quả script in: P1 `chưa phân biệt được`; P2 `chưa kết luận`; nhánh (h) = **F** ở cả năm cách tính (chính, S1, S2, S3a, S3b). Đối chiếu calls.jsonl: không lệch.
