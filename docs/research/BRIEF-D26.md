# Phòng Dev, gói D26: tệp nháp không vào commit; lint chặn tệp nháp; test đầu-cuối `turns`; ghi cách tính KPI mới

**Gói vừa: 3 hạng mục. Ngân sách 5M token.** Giao 15/11/2026.

**Căn cứ:**
- **Tệp nháp của agent bị commit lặp lại:**
  - BRIEF-25 để sót `k2-tmp/a.mjs` (biên bản CTO 25b, T6);
  - BRIEF-26b commit `_ed.py` ở gốc repo, do vai biên tập tạo để sửa tệp (T-20261115-105245-bbd).
  - `commitAll` (`src/git.ts`, khoảng dòng 130) chạy `git add -A` nên mọi tệp agent tạo trong worktree đều vào commit.
  - Vai chỉ có quyền git đọc (vd. `academic-writer`) không xóa được tệp nó đã tạo. Hook chặn `git rm`, nên phòng không tự sửa được và nhiệm vụ không nghiệm thu.
- **Chủ dự án (14/11):** lỗi lặp phải thành luật lint trong CI, đỏ là hỏng (quyết định 7).
- **CTO D24 còn mở hai việc:**
  - Chưa có test đầu-cuối `turns` từ orchestrator tới `calls.jsonl`; mới có test của runtime.
  - KPI đổi cách tính độ đầy ngữ cảnh cho lượt `claude-cli` khi có `turns` (`src/kpi.ts`, khoảng dòng 602–624). Trước đây dùng prompt cộng dồn mọi vòng (phóng đại); nay dùng prompt chia số vòng. `avgTurns`/`maxTurns` có số. Điều này chưa ghi ở `docs/KPI.md` (`docs/research/decisions-2026-11-14.md`, quyết định 10).

**Phạm vi:**
- **Được sửa:** `src/git.ts`, `src/orchestrator.ts` (chỉ chỗ dựng worktree và chỗ gọi `commitAll`), `src/prompts.ts`, `src/types.ts`, `scripts/lint/`, `test/`, `docs/` (trừ `docs/research/`), `.gitignore`.
- **Không sửa:** `bench/`, `docs/research/`, `src/kpi.ts` (chỉ ghi tài liệu, không đổi cách tính).
- Không chạy benchmark, không gọi `claude -p` thật.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:bench`, `npm run test:research`.

## Hạng mục

**K1 — senior-swe: thư mục nháp `.scratch/` của worktree; tệp nháp không vào commit**
- **Khi CCoding dựng worktree của nhiệm vụ,** thêm `.scratch/` vào tệp exclude của git cho worktree (`git rev-parse --git-path info/exclude`). Áp cho mọi dự án, không sửa `.gitignore` của repo người dùng. Ghi một lần, chạy lại không ghi trùng.
- **Lời nhắc chung cho agent có quyền ghi tệp** (`src/prompts.ts`): tệp nháp, script tạm, bản thử đặt trong `.scratch/` của thư mục làm việc; không đặt ở chỗ khác trong repo. Một câu, không lặp ở nhiều chỗ.
- **`commitAll`, trước khi commit:**
  - tệp **mới** (chưa có ở commit gốc của nhiệm vụ) khớp mẫu nháp thì **chuyển vào `.scratch/`**, giữ đường dẫn tương đối, không commit;
  - mẫu nháp đọc từ tệp `.ccoding/scratch.json` của repo, dạng `{ "patterns": ["…"] }`, glob theo đường dẫn tương đối. Repo không có tệp này ⇒ hành vi như cũ;
  - tệp đã có từ trước không bao giờ bị chuyển;
  - ghi sự kiện nhật ký liệt kê tệp đã chuyển, chỉ đường dẫn tương đối;
  - nếu không chuyển được thì để nguyên, không commit tệp đó, và ghi lỗi.
- **Tạo `.ccoding/scratch.json` cho repo này.** Mẫu tối thiểu: tệp ở gốc repo bắt đầu bằng `_`; thư mục tên `*-tmp` hay `tmp_*` ở mọi cấp; đuôi `.tmp`, `.bak`, `.orig`, `.rej`. Loại trừ `bench/vs-claude/results/**` và `bench/vs-claude/tasks/**` (dữ liệu đo có `_FINAL.txt`, `tmp_old/`).
- Thêm `.scratch/` vào `.gitignore` của repo này.
- **Test** (repo git tạm):
  - tệp mới `_ed.py` ở gốc và `docs/k2-tmp/a.mjs` ⇒ không có trong commit, có trong `.scratch/`, có sự kiện;
  - tệp đã track trùng mẫu ⇒ vẫn commit thay đổi bình thường;
  - repo không có `.ccoding/scratch.json` ⇒ commit như cũ;
  - `info/exclude` có `.scratch/` đúng một lần sau hai lần dựng.

**K2 — backend-dev: luật lint `stray-files`; test đầu-cuối `turns`; tài liệu KPI**
- **Luật `stray-files`** trong `scripts/lint/`:
  - dùng chung mẫu của `.ccoding/scratch.json` (không chép);
  - quét tệp đã track và tệp chưa track không bị ignore; khớp mẫu ⇒ lỗi;
  - tệp **mới** ở gốc repo không có trong danh sách cho phép ⇒ lỗi. Danh sách cho phép đặt trong luật, gồm các tệp gốc hiện có;
  - ngoại lệ qua `allow.json` như các luật khác;
  - test có ca dương và ca âm, gồm `_ed.py` ở gốc (đỏ) và `bench/vs-claude/results/**/_FINAL.txt` (xanh);
  - cập nhật `docs/LINT.md`, kèm căn cứ (BRIEF-25, BRIEF-26b).
- **Test đầu-cuối `turns`:** dựng orchestrator với runtime giả trả `turns: 3`, chạy một lượt ⇒ bản ghi `calls.jsonl` có `turns: 3`. Runtime giả không trả `turns` ⇒ bản ghi không có khóa `turns`.
- **`docs/KPI.md`:** ghi cách tính độ đầy ngữ cảnh khi bản ghi có và không có `turns`, cách tính `avgTurns`/`maxTurns`, và từ đợt nào lượt `claude-cli` có `turns` (D24). Ghi rằng so độ đầy ngữ cảnh giữa đợt cũ và đợt mới phải nêu khác cách tính. Không đổi `src/kpi.ts`.

**K3 — qa-tester: review**
- Kết luận theo mẫu JSON. Khối JSON đặt **cuối** câu trả lời, đúng mẫu, để hệ thống đọc được.
- **Thử sức bắt lỗi:**
  - tạo `_x.py` ở gốc repo (chưa track) ⇒ `npm run lint` đỏ; xóa ⇒ xanh;
  - tạm bỏ bước chuyển tệp nháp trong `commitAll` ⇒ test của K1 đỏ.
- Xác nhận dự án không có `.ccoding/scratch.json` thì `commitAll` không đổi hành vi (test cũ của git và orchestrator vẫn xanh, không sửa kỳ vọng).
