# Mốc đối chiếu D8 (trước khi sửa `analyze.mjs`)

Đầu ra của `analyze.mjs` ở commit `1673529` (chưa có SR của S6), chạy trên **bản sao** `runs.jsonl` ở thư mục tạm
(không ghi đè `report.md` trong `results/`). Mỗi thư mục: `report.md`, `summary.csv`, `pareto.csv`, `stdout.txt`.

- `study-cloud/` (448 dòng), `b7prime/` (20 dòng): có mốc.
- `study-cloud-final/`: **không có mốc** — thư mục này không có `runs.jsonl` (chỉ có báo cáo `analyze-*.md`, `final-extra.*`), nên `analyze.mjs` không chạy được (exit 1, ENOENT).
