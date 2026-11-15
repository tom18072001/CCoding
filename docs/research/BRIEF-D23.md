# Phòng Dev, gói D23: lint dùng được khi chạy tay và quét cả tệp chưa track; dọn ý nhỏ còn lại của D21b, D22

**Gói nhỏ: 3 hạng mục. Ngân sách 4M token.** Giao 15/11/2026.

**Căn cứ:** biên bản CTO của D21b, D22 và các review đi kèm.
- **Chạy tay `npm run lint` không có mốc thì đỏ.** Rule `agent-format-cochange` cần mốc git, nên người hay agent chạy tay đều gặp. CTO D21b đề xuất tự tìm mốc bằng `git merge-base`.
- **Lint chỉ quét tệp `git ls-files` trả về** (`scripts/lint/run.mjs`). Tệp test mới chưa `git add` thì rule `test-writes-repo` và các rule khác không thấy. Review D22 đã thử: tệp vi phạm chưa track thì exit 0, sau `git add -N` thì exit 1.
- **`test-writes-repo` không nhận ra regex literal** trong `stringMask`. Vd. `/'/` làm lệch trạng thái và bỏ sót lời gọi ghi phía sau. Đường dẫn repo truyền qua hàm hay đối tượng cũng không bị bắt.
- **`pairwise.mjs` và `e7/*.mjs` vẫn ghép cứng `tasks/`**, chưa nhận `--tasks-dir`/`VSC_TASKS_DIR` như `run.mjs` và `analyze.mjs` (D22).
- **`docs/diagnostics/skipped-tests.md`:** review D22 nêu còn 2 lỗi nhỏ chưa sửa. Đối chiếu tài liệu với mục "Đo lại của người điều phối" (bảng ba môi trường) và với `test/skips.json`; sửa mọi chỗ lệch.

**Phạm vi:**
- **Được sửa:** `scripts/lint/`, `src/`, `test/`, `bench/vs-claude/pairwise.mjs`, `bench/vs-claude/e7/`, `bench/vs-claude/test/`, `docs/` (trừ `docs/research/`).
- **Không sửa:** `bench/vs-claude/results/`, `docs/research/`.
- Không chạy benchmark, không gọi `claude -p` thật.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:bench`, `npm run test:research`.

## Hạng mục

**K1 — senior-swe: bộ chạy lint**
- **Mốc tự tìm khi không truyền:**
  - thứ tự: `--base`, `LINT_BASE`, `CCODING_BASE_REF`, rồi `git merge-base HEAD` với nhánh upstream của nhánh hiện tại (`@{upstream}`), rồi `origin/main`;
  - in rõ mốc đã dùng và nguồn của nó;
  - không tìm được mốc thì rule cần mốc vẫn **lỗi** như cũ (không bỏ qua).
- **Quét cả tệp chưa track nhưng không bị ignore** (`git ls-files --others --exclude-standard`), ở mọi rule dùng danh sách tệp.
- **Test:**
  - không truyền mốc trong repo có upstream ⇒ chạy được;
  - repo không có upstream và không có `origin/main` ⇒ lỗi rõ;
  - tệp vi phạm chưa track ⇒ exit 1.
- Cập nhật `docs/LINT.md`.

**K2 — backend-dev: `test-writes-repo`, thư mục bài, `skipped-tests.md`**
- **`stringMask`:** nhận regex literal. Thêm ca dương và ca âm, gồm `/'/` và đường dẫn repo truyền qua biến trung gian trong cùng tệp. Ghi rõ giới hạn còn lại.
- **`pairwise.mjs` và `bench/vs-claude/e7/*.mjs`:** nhận `--tasks-dir`/`VSC_TASKS_DIR`, mặc định như cũ; có test dùng thư mục tạm.
- **`skipped-tests.md`:** đối chiếu và sửa như ở phần căn cứ.

**K3 — qa-tester: review**
- Kết luận theo mẫu JSON. Khối JSON đặt **cuối** câu trả lời, đúng mẫu, để hệ thống đọc được (D19, D21b từng không ra JSON đọc được).
- **Thử sức bắt lỗi:**
  - tệp test vi phạm chưa track ⇒ `npm run lint` đỏ;
  - regex literal `/'/` đứng trước một lời ghi vào repo ⇒ đỏ;
  - gỡ ra ⇒ xanh.
- Chạy tay `npm run lint` không đặt biến mốc ⇒ exit 0 trên nhánh sạch.
