# E9-lite [Khám phá] — chuẩn và kết quả

**Phân loại dữ liệu: Nội bộ** (bài bench tổng hợp, không có DLCN). **Chưa có `runs.jsonl`**: chưa chạy planner nào; thư mục `run1/` chưa tồn tại.

## Tệp
- `gold.json`: chuẩn suy từ lời giải mẫu (13 bài), sinh bởi `bench/vs-claude/e9/gold-from-solution.mjs`.
- `labels.json`: nhãn "chia được"/"không chia được" (quy tắc khóa ở `docs/research/preregistration.md` §9, mục "Sai lệch E9 → E9-lite"). Chỉ tính tệp `added`/`modified` (tệp `deleted` bị bỏ, sửa S1 ở §9). Số thật do script sinh (BRIEF-24b): **3 "chia được" / 10 "không chia được"**, phân tầng không suy biến; độ nhạy `mod2Of`: 4 / 9. Kết quả "mọi bài đều chia được" của bản nhãn đầu **đã hết hiệu lực** (sinh từ chuẩn lỗi). Mã băm hiệu lực nằm ở khối "Mã băm khóa chuẩn E9-lite — bản thay thế (BRIEF-24b, K1…)" (`preregistration.md:1474`): `gold.json` `ee49fc5d…ed312f`, `labels.json` `40596992…694025` (đầy đủ ở `docs/research/facts.json`).

## Tái lập
```bash
node bench/vs-claude/e9/gold-from-solution.mjs --out bench/vs-claude/results/e9lite/gold.json
node docs/research/analysis/e9lite-labels.mjs
(cd bench/vs-claude/results/e9lite && sha256sum gold.json labels.json)   # so với khối thay thế BRIEF-24b ở §9 (preregistration.md:1474)
git show HEAD:bench/vs-claude/results/e9lite/labels.json | sha256sum      # byte của blob đã commit (tránh lệch EOL)
# sau khi chạy bench (người điều phối), phân tích:
node docs/research/analysis/e9lite.mjs --runs bench/vs-claude/results/e9lite/run1/runs.jsonl --gold bench/vs-claude/results/e9lite/gold.json --labels bench/vs-claude/results/e9lite/labels.json --seed 20261115
```
Test: `node --test docs/research/analysis/e9lite.test.mjs` (runs.jsonl giả dựng trong test).
