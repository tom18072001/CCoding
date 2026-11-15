# Phòng Dev, D8: gộp `main` mới vào nhánh `perf/vs-claude-loop`; tạo `task.json` cho hai bài lớn; chạy chẩn đoán cache B-14

Ngân sách 6M token. Chỉ làm trên nhánh `perf/vs-claude-loop`, **không đẩy lên `main`**. Phân loại dữ liệu: **Nội bộ**. Data Protection Gate theo AGENTS.md.

## Căn cứ
- `main` có 16 commit mới kể từ `e0bd2f4`, đến `9e6079b`:
  - KPI v2 và bộ probe;
  - giao diện v2;
  - lộ trình REA: KPI cạnh agent, Kanban, ngân sách dự án/agent, agent ngoài;
  - đổi người phụ trách/dự án tại chỗ.
- Nhánh này có các nâng cấp theo nghiên cứu chưa lên `main`: B-01, B-02, B-04, B-05, B-06, B-10, B-11, cùng hook claude-guard.
- Báo cáo khoa học (§4) và các lần đo local sau này cần mô tả và đo đúng CCoding hiện hành.
- `docs/research/improvement-backlog.md` B-14, B-15; `docs/research/analysis/cache-diagnostic-spec.md`.

## Hạng mục
1. **Gộp `origin/main` vào nhánh.**
   - Giải xung đột theo nguyên tắc: giữ đủ tính năng của `main`, đồng thời giữ mọi công tắc B-xx với **giá trị mặc định như trên nhánh**.
   - `npm run typecheck` và `npm test` phải xanh. Test EPERM chập chờn trên Windows thì ghi rõ.
   - Viết `docs/research/context/merge-main-2026-11-03.md`, gồm:
     - danh sách xung đột và cách giải;
     - **mọi thay đổi hành vi của `main` có thể ảnh hưởng tới benchmark**: pha, model mặc định, KPI, ngân sách/trần token, prompt, hook;
     - các thay đổi của `main` mà Phòng Nghiên cứu cần mô tả ở §4 bài báo.
2. **`task.json` cho `l1-modules` và `l2-chain`** (mở khóa B-15, H5, H6).
   - Chuyển từ `bench/vs-claude/harness/` sang định dạng của `bench/vs-claude/tasks/*/task.json`: trường `size`, `hypotheses` và bộ chấm như các bài khác.
   - `node bench/vs-claude/run.mjs --arms oracle,null --tasks l1-modules,l2-chain --repeats 1 --out <thư mục tạm>` phải cho oracle 1,00 và null thấp.
3. **B-14, chẩn đoán cache claude-cli.**
   - Làm đúng `cache-diagnostic-spec.md` Phần 1: 3 cặp gọi, tối đa 8 lượt `claude -p`, dựng đúng cờ của `src/runtimes/claude-cli.ts`.
   - Ghi cacheWrite và cacheRead của từng lượt vào `docs/research/analysis/cache-diagnostic-result.md`, kèm lệnh đã chạy, phiên bản `claude` và giờ chạy.
   - Chạy bằng phiên đăng nhập Max của máy này. Không dùng 9router, không dùng API key ngoài.
   - Nếu hook chặn lệnh `claude`, ghi lại và dừng. Không nới hook.

## Không làm
- Không đổi giá trị mặc định của công tắc B-xx.
- Không bật (a-brief) hay (b) mặc định.
- Không chạy benchmark ngoài lệnh oracle/null ở mục 2.
- Commit ghi mã B-xx tương ứng (B-14, B-15).
