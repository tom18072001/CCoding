# BRIEF-24b · K1 — bàn giao khóa chuẩn, gateFirst, cờ dừng M1/M2, lint (15/11/2026, @data-scientist)

Phân loại: Nội bộ. Không chạy planner, không gọi LLM.

## 1. Lệnh đã chạy
1. `node bench/vs-claude/e9/gold-from-solution.mjs --out bench/vs-claude/results/e9lite/gold.json` → exit 0
2. `node docs/research/analysis/e9lite-labels.mjs` → exit 0, in `nhãn: chia_duoc=3, khong_chia_duoc=10`
3. `node scripts/lint/prereg-lock.mjs --add-new` (đúng một lần, sau khi mọi khối §9 đã có) → exit 0, "Đã thêm 5 khối mới và 0 dòng lịch sử"
4. `npm run lint`, `npm run test:research`, `node docs/research/scripts/consistency-check.mjs`, `git diff -U0 -- docs/research/preregistration.md` (kết quả ở mục 6).

## 2. gold.json / labels.json
Sinh lại cho **đúng cùng byte** với bản đã commit (`git status` sạch sau khi sinh) ⇒ không có gì để commit. `labels.json` đã đúng từ commit `c6f979f3`; chỉ dòng sha256 ở §9 là lỗi thời.

| Tệp | sha256 bản làm việc (`sha256sum`) | sha256 blob đã commit (`git show HEAD:<path> \| sha256sum`) |
|---|---|---|
| `bench/vs-claude/results/e9lite/gold.json` | `ee49fc5da243b1b656c3e2f8fcc9d395c39c3f5a30f325b0f8e1ea7406ed312f` | trùng |
| `bench/vs-claude/results/e9lite/labels.json` | `4059699277ab7df1b6b55dec5876b81feaea6352b59350a1b2807ef543694025` | trùng |

Trường `sha256` nội bộ của `gold.json` = `a33c08865a433ac2d2b53e0a7eb2001556ae0a782bcb0eedfa666ca6a6c3251d` (không đổi).

**Số nhãn thật:** nhãn chính 3 "chia được" / 10 "không chia được" (không suy biến); độ nhạy (mod2Of) 4 / 9. Khớp 3/10 dự kiến. Dòng "13/13" ở README, paper.md, facts.json là của K3.

## 3. gateFirst (`docs/research/analysis/e9lite.mjs`)
Cài đúng đặc tả K2 (không đổi công thức): `planGate` không phải đối tượng ⇒ 0; `replanned === true` ⇒ 0; còn lại 1 ⇔ `replanCount === 0`; không bao giờ `null`. Thêm `gateCounters` (`nGateNull`, `nReplanCountMissing`, `nReplanned`), in trong `format`. Test: 8 ví dụ K2 trong `e9lite.test.mjs` ("token có trọng số, cổng đạt lần đầu"). Đặc tả cài được, không có điểm dừng.

## 4. M1/M2 và các lệch mã khác
- `stopFlags` M2: tập giá trị của `ccodingCommit`/`claudeCliVersion` tính cả null; > 1 ⇒ cờ dừng (exit 3).
- `stopWarnings` (mới, xuất ra): M1 `authSource` null ở dòng `done` không phải runtime giả (`planModel.actual` không bắt đầu `mock-`) ⇒ cảnh báo, exit vẫn 0; toàn null ở commit/CLI ⇒ cảnh báo "không ghi phiên bản". `analyze` trả `warnings`, `format` in "CẢNH BÁO: …".
- `format` in thêm câu "theo bố cục thư mục của lời giải mẫu, không kết luận về chất lượng bóc tách" và nhãn "[Khám phá]" (có sẵn).
- Fixture `runs.jsonl` giả: `docs/research/analysis/fixtures/e9lite/` (`runs-m1-null-auth`, `runs-m2-commit-differs`, `runs-m2-cli-differs`, `runs-uniform` + `gold.json`, `labels.json` giả của một bài). Test 4 ca (a)–(d) ở cuối `e9lite.test.mjs`, chạy cả hàm lẫn CLI (exit 0/3).
- **Chưa làm (báo lại, không tự nới):** mục 3 checklist K2 — đếm riêng "tệp ngoài repo" (`/…`, `X:/`, `..`). Mã vẫn xử lý các đường dẫn đó như đường dẫn thường (không khớp tệp chuẩn nên không tính vào độ phủ), nhưng chưa có bộ đếm và test riêng. Cần quyết định có thêm không trước lượt chạy đầu.
- Giả định M1 "runtime thật" suy từ `planModel.actual` (theo K2), chưa kiểm trên dòng thật.

## 5. Khối §9 mới và lint
- Các khối §9 trong `docs/research/preregistration.md` (sau khi thêm): `:1336` (BRIEF-24 K1), `:1408` (sửa chuẩn), `:1447` (Đính chính gateFirst, K2), `:1470` (Đặc tả bàn giao cho mã, K2), **`:1474` — "Mã băm khóa chuẩn E9-lite — bản thay thế (BRIEF-24b, K1; ghi trước lượt chạy đầu)" (khối của K1; nói rõ dòng sha256 cũ quanh `:1406` lỗi thời)**. §10 giờ ở `:1483`. Diff so với HEAD: 1 hunk `@@ -1473,0 +1474,9 @@`, chỉ dòng '+', trong §9.
- `docs/research/preregistration.lock.json`: +5 khối (+20 dòng), chỉ qua `--add-new`.
- `scripts/lint/allow.json`: thêm 1 mục `machine-path` cho `docs/research/preregistration.md`, neo "Đường dẫn máy cloud trong tạo phẩm C9", lý do "câu nhắc tới đường dẫn để cấm chép, nằm trong khối đã khóa (§10), không sửa chữ".
- `scripts/lint/baseline.json`: xóa mục `machine-path` lỗi thời của `preregistration.md` (không thêm mục mới).
- Tên khóa `facts.json`: **không đổi** (K1 không đổi tên khóa nào trong mã).

## 6. Đầu ra thật
`LINT_BASE=main npm run lint` → exit 0:
```
> node scripts/lint/run.mjs
Lint: 24 rule, 0 lỗi.
```
`npm run lint` (không đặt mốc) → exit 1, chỉ vì `agent-format-cochange` cần mốc git (môi trường, không do thay đổi này):
```
[agent-format-cochange] 1 lỗi ... (mốc) — rule cần mốc git nhưng không có: truyền --base <ref> hoặc đặt LINT_BASE / CCODING_BASE_REF
Lint: 1 lỗi ở 1 rule — HỎNG.
```
`npm run test:research` → exit 0: `ℹ tests 194 · ℹ pass 194 · ℹ fail 0 · ℹ skipped 0` (trước đó 190; +4 ca K1).
`node docs/research/scripts/consistency-check.mjs` → exit 0: `Đạt: 60 tệp, không lệch số liệu.`
`git diff main... -U0 -- docs/research/preregistration.md | grep -c '^-[^-]'` → 0 dòng '-'. Lưu ý: so với `main` tệp hiện là 1502 dòng '+' (cả tệp), nên K4 nên đối chiếu thêm với commit nhánh nhiệm vụ để thấy hunk nhỏ; không có hunk nào xóa hay sửa §10.
