# Phòng Dev, gói D22: test không ghi vào cây repo; dọn các ý còn mở của D20b

**Gói nhỏ: 3 hạng mục. Ngân sách 4M token.** Giao 15/11/2026.

**Căn cứ:**
- **CI GitHub đỏ chập chờn** (run 43646600539, ubuntu, Node 24; PR run cùng commit xanh):
  - `bench/vs-claude/test/isolation-v43f.test.mjs:55` gọi `run.mjs`, và `run.mjs` liệt kê `bench/vs-claude/tasks/`. Lỗi: `ENOENT … tasks/a2-ambiguity-new/task.json`.
  - Nguyên nhân: `bench/vs-claude/test/analyze-sr.test.mjs:231` **tạo tạm thư mục trong cây repo** (`bench/vs-claude/tasks/a2-ambiguity-new/`). Hai tệp test chạy song song nên đua nhau.
  - Kiểu lỗi này (test ghi vào repo đang chạy) còn làm hỏng worktree khi chạy test ở commit cũ: người điều phối gặp khi bisect, test tạo nhánh `ccoding/t-…` trong repo chứa.
- **Ý còn mở trong biên bản CTO của D20b:**
  - `src/diff.ts:197` so đường dẫn bằng chuỗi, chưa dùng `samePath`;
  - thư mục mô phỏng còn sót (`.ccoding/sim-a`, `.ccoding/sim-a-s4`, `scratch-2b9`) trong worktree;
  - số test bỏ qua 4 so với 3 giữa các lần chạy.
- **Đính chính:** người điều phối từng ghi D17(c) "đỏ khi không có `claude` trong PATH". Chạy lại với thư mục bin riêng không có `claude` thì vẫn xanh. Nguyên nhân thật là ngân sách, D20b đã ghim `budgetTokens`. Ghi lại ở `docs/diagnostics/`.

**Phạm vi:**
- **Được sửa:** `src/`, `test/`, `bench/vs-claude/test/`, `bench/vs-claude/run.mjs` và `bench/vs-claude/lib/` (chỉ để nhận thư mục bài qua tham số), `scripts/lint/` (rule mới), `docs/` (trừ `docs/research/`).
- **Không sửa:** `bench/vs-claude/results/`, `docs/research/`.
- Không chạy benchmark, không gọi `claude -p` thật.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:bench`, `npm run test:research`.

## Hạng mục

**K1 — senior-swe: test không ghi vào cây repo**
- `analyze-sr.test.mjs` và mọi test khác đang tạo, sửa hay xóa tệp dưới cây repo: chuyển sang thư mục tạm.
  - `run.mjs` và `analyze` nhận thư mục bài qua tham số hoặc biến môi trường; mặc định giữ như cũ.
  - Tìm bằng Grep các lệnh ghi tệp trong `test/` và `bench/vs-claude/test/` mà đường dẫn ghép từ thư mục của repo.
- **Rule lint mới `test-writes-repo`:** bắt mẫu ghi tệp (`writeFileSync`, `mkdirSync`, `rmSync`, `cpSync`…) trong tệp test với đường dẫn ghép từ `HERE`, `ROOT`, `__dirname` hay `import.meta.dirname` mà không qua thư mục tạm. Ngoại lệ có lý do thì vào `allow.json`.
- **Bằng chứng:**
  - chạy `npm run test:bench` 5 lần liền với `--test-concurrency` mặc định;
  - sau mỗi lần `git status --porcelain` rỗng;
  - không có lỗi ENOENT.

**K2 — backend-dev: `samePath` ở `diff.ts`, dọn thư mục mô phỏng, đính chính D17(c)**
- `src/diff.ts:197` và các chỗ so đường dẫn khác chưa dùng `samePath` (Grep): chuyển sang `samePath`. Có test.
- Dọn thư mục mô phỏng còn sót trong nhánh, nếu đã bị commit.
- Ghi đính chính D17(c) và giải thích số bỏ qua 4 so với 3 vào `docs/diagnostics/skipped-tests.md`. Đã có bảng đo ba môi trường ở mục "Đo lại của người điều phối".

**K3 — qa-tester: review**
- Kết luận theo mẫu JSON.
- Thử sức bắt lỗi: thêm tạm một test ghi vào cây repo, `npm run lint` phải đỏ ở `test-writes-repo`. Gỡ ra thì xanh.
- Kiểm 5 lần `test:bench` của K1 có thật (lệnh và đầu ra).
