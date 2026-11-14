# Nghiên cứu CCoding: lệnh kiểm tra

Phân loại dữ liệu: Nội bộ. Chạy từ thư mục gốc repo.

```bash
node docs/research/scripts/logic-map-check.mjs --strict
node docs/research/scripts/consistency-check.mjs
node docs/research/analysis/decisions/scorecard.mjs --check
node --test "docs/research/scripts/*.test.mjs" "docs/research/analysis/*.test.mjs"
```

Ghi chú:
- Dùng dạng glob có dấu nháy cho `node --test`. Dạng `node --test docs/research/scripts/` (truyền thư mục) cho exit 1 trên Node 24 Windows.
- `logic-map-check.mjs` mặc định `--strict`; `--no-strict` chỉ để chẩn đoán; `--sample N --seed S` kiểm ngẫu nhiên tất định.
