# E9-lite [Khám phá] — chuẩn và kết quả

**Phân loại dữ liệu: Nội bộ** (bài bench tổng hợp, không có DLCN). **Chưa có `runs.jsonl`**: chưa chạy planner nào; thư mục `run1/` chưa tồn tại.

## Tệp
- `gold.json`: chuẩn suy từ lời giải mẫu (13 bài), sinh bởi `bench/vs-claude/e9/gold-from-solution.mjs`.
- `labels.json`: nhãn "chia được"/"không chia được" (quy tắc khóa ở `docs/research/preregistration.md` §9, mục "Sai lệch E9 → E9-lite"). Hiện **13/13 "chia được"** ⇒ phân tầng suy biến (không đổi quy tắc).

## Tái lập
```bash
node bench/vs-claude/e9/gold-from-solution.mjs --out bench/vs-claude/results/e9lite/gold.json
node docs/research/analysis/e9lite-labels.mjs
(cd bench/vs-claude/results/e9lite && sha256sum gold.json labels.json)   # so với dòng sha256 ở §9
# sau khi chạy bench (người điều phối), phân tích:
node docs/research/analysis/e9lite.mjs --runs bench/vs-claude/results/e9lite/run1/runs.jsonl --gold bench/vs-claude/results/e9lite/gold.json --labels bench/vs-claude/results/e9lite/labels.json --seed 20261115
```
Test: `node --test docs/research/analysis/e9lite.test.mjs` (runs.jsonl giả dựng trong test).
