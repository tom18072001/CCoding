# RUNLOG — trục 2 phần (b): chặn đúng trên RedCode-Exec (14/11/2026)

Phân loại dữ liệu: **Nội bộ** (bộ công khai CC BY 4.0, không có DLCN). Đăng ký trước: `docs/research/preregistration.md` §9 "Đăng ký trước trục 2" (b), dòng 1210–1217, đe dọa dòng 1219–1229. Phần (a) **không làm**: chờ giám đốc chỉ định hai người gán nhãn; chặn nhầm trên lệnh thật chưa đo.

## Bước 1 — kiểm giấy phép và dữ liệu (14/11/2026)
- Nguồn: `github.com/AI-secure/RedCode`, `git clone --depth 1` vào `data/axis2/redcode/` (thư mục bị gitignore), commit nguồn `664e4793dc7309f98b8271baed5bbc04d6ef4c39`.
- `LICENSE` (gốc kho): MIT, "Copyright (c) 2024 RedCode Authors" — đã đọc tệp.
- `README.md` dòng 105–107: mã MIT; "RedCode benchmark dataset under dataset/ is licensed under … CC BY 4.0" — đã đọc.
- `dataset/LICENSE`: "licensed under the Creative Commons Attribution 4.0 International License (CC BY 4.0), except where otherwise noted", kèm toàn văn — đã đọc. Giấy phép dữ liệu **xác nhận từ tệp LICENSE của chính thư mục dataset/**. Điều kiện: ghi nguồn (cột `source` của cases-normalized.jsonl).
- `dataset/RedCode-Exec/bash2text_dataset_json/`: 20 tệp × 30 mục = 600 mục Bash (trường Code, Text_summary, Text_details; chỉ dùng Code). Không chạy gì trong thư mục tải về; script nằm ở `docs/research/analysis/axis2/`, đường dẫn truyền bằng tham số.
- Kết luận: giấy phép và dữ liệu xác nhận được → phép đo (b) chạy.

## Bước 2 — quy ca (quy tắc cố định 1–7, không LLM, chưa chạy guardDecision)
Lệnh: `node docs/research/analysis/axis2/normalize-cases.mjs --redcode data/axis2/redcode/dataset/RedCode-Exec/bash2text_dataset_json --repo . --out bench/vs-claude/results/axis2-guard`

| Bước | n |
|---|---|
| Công bố: mục Bash | 600 |
| Quy tắc 1: đúng một dòng lệnh (bỏ shebang, chú thích, dòng trống; nhiều dòng loại) | 82 |
| Quy tắc 2: loại Python/PowerShell | 82 |
| Quy tắc 4a: khử trùng trong bộ | 82 |
| Quy tắc 4b: khử trùng với tập tự viết (ALLOWED 23 + DENIED 60 + claude-guard.test 7 = 89 chuỗi duy nhất) | 82 (loại 0) |
| Quy tắc 4c: giữa hai bộ | 82 (không tải bộ dự phòng) |
| Quy tắc 6: rút mẫu nếu > 500 | không cần (82) |
| **n đo** | **82** (nhóm RedCode Index 2: 30, 4: 2, 8: 20, 9: 30) |

Quyết định về bộ dự phòng (chốt trước khi thấy kết quả chặn): điều kiện kích hoạt "quy được < 30 ca độc lập" được đọc theo nghĩa đã đăng ký ở quy tắc 4 (ca duy nhất sau chuẩn hóa) → 82 ≥ 30 nên **không tải** `ole-tail/agentic-execution-guardrail-eval`. Cảnh báo: 82 ca chỉ thuộc 4 nhóm Index và 30 ca nhóm 2 chỉ khác tên tệp trong URL; nếu đọc "độc lập" là theo nhóm thì chưa đủ 30. Ghi ở đe dọa 7 của report.

## Bước 3 — KHÓA danh sách (trước khi chạy guardDecision)
- Tệp: `bench/vs-claude/results/axis2-guard/cases-normalized.jsonl` (82 dòng)
- **sha256: e811c37fc53fe8770b2b4f8db89cca4f4148820b9801542f4fa1fe4e217ee784**
- Mã commit của bước khóa: ghi bên dưới ngay sau khi commit (không squash commit này khi gộp).
- Mã commit của bước khóa: **`74f11d99d62e433883c608ceb6b420311a07bf18`** (RUNLOG, cases-normalized.jsonl, normalize-cases.mjs). `git show 74f11d99:bench/vs-claude/results/axis2-guard/cases-normalized.jsonl | sha256sum` trùng hash trên (đã kiểm). Không squash khi gộp.

## Bước 4 — chạy guardDecision (sau commit khóa)
- `npm ci` trong worktree (chưa có node_modules) để có `tsx`.
- Lệnh: `node --import tsx docs/research/analysis/axis2/replay-axis2.mjs --cases bench/vs-claude/results/axis2-guard/cases-normalized.jsonl --out bench/vs-claude/results/axis2-guard/results.json --expect-sha256 e811c37fc53fe8770b2b4f8db89cca4f4148820b9801542f4fa1fe4e217ee784` (script kiểm sha trước khi chạy).
- `replay-axis2.mjs` sao chép từ `scripts/replay-guard-deny.mjs` (bản cũ không sửa); thêm `guardBlock` để lấy `rule` và Clopper–Pearson.
- Kết quả: git-read 82/82 [95,6; 100] %; full 30/82 = 36,6 % [26,2; 48,0] %; kiểm n = 72: cận trên 0/72 = 4,994 %. Chi tiết: `report.md`, `results.json`.
- Sai lệch/làm rõ: preregistration.md §9 dưới dòng 1238 (14/11/2026).
- Commit kết quả: đứng sau commit khóa trong `git log`.
