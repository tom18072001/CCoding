# Công cụ workspace cho agent (đọc/ghi file, chạy lệnh)

Với runtime API có tool calling (Bifrost, 9router, OpenAI-compatible), CCoding tự chạy vòng lặp công cụ: model gọi công cụ → CCoding thực thi trong thư mục làm việc của nhiệm vụ → gửi kết quả lại → model làm tiếp → câu trả lời cuối là báo cáo bàn giao.

| Công cụ | Tên trong agent.md | Việc |
|---|---|---|
| `list_files` | Glob / LS | Liệt kê cây thư mục (bỏ qua node_modules, .git, dist…) |
| `read_file` | Read | Đọc file có số dòng; nhiều file một lần (`paths`), `offset/limit` cho file lớn |
| `search` | Grep | Tìm regex/chuỗi, lọc theo glob |
| `write_file` | Write | Tạo/ghi đè file |
| `edit_file` | Edit / MultiEdit | Thay một đoạn chính xác (chịu được CRLF) |
| `run_command` | Bash | Chạy lệnh (PowerShell trên Windows, bash trên Linux) trong gốc workspace: cài dependency, typecheck, test, migration DB dev… |
| `git_read` | *(tự cấp)* | Git **chỉ đọc** (`log`, `show`, `diff`, `blame`, `status`, `grep`, `ls-files`, `branch`/`tag` liệt kê…) cho vai trò **không có** `Bash` khi workspace là repo git — chạy `git` trực tiếp (không qua shell), chặn tùy chọn ghi tệp/đọc ngoài repo (`--output`, `--no-index`, `--contents`, `-O`…) và tệp `.env`. Tắt bằng `tools.gitRead: false` |
| `search_papers` | WebSearch | Tìm bài báo trên **OpenAlex** (chỉ mục học thuật mở, không cần khóa): tiêu đề, năm, venue, số trích dẫn, tác giả, DOI, tóm tắt; lọc `year_from/year_to/venue`, sắp theo trích dẫn |
| `web_search` | WebSearch | Tìm kiếm web chung qua **SearXNG tự dựng** (`CCODING_SEARXNG_URL`) hoặc **Brave Search API** (`BRAVE_API_KEY`, có gói miễn phí); không cấu hình thì thử DuckDuckGo (thường chặn truy vấn tự động) rồi dự phòng Wikipedia + gợi ý nguồn chính thức để `fetch_url` |
| `fetch_url` | WebFetch | Đọc trang web/PDF công khai thành chữ (đọc tiếp bằng `offset`); **chặn localhost/LAN/link-local**, tối đa 5 lần chuyển hướng |

## Ai được dùng gì

Công cụ tra cứu (`search_papers`, `web_search`, `fetch_url`) **không cần workspace** — có ở pha lập kế hoạch, thực thi, sửa, review cho agent có `WebSearch`/`WebFetch` trong hồ sơ, chỉ với dữ liệu *Công khai/Nội bộ* (truy vấn đi ra dịch vụ bên ngoài) và khi `tools.web: true`.

Quyền = giao của (1) `tools:` trong hồ sơ agent, (2) quyền của dự án, (3) pha:

| Pha | Công cụ |
|---|---|
| Định tuyến, họp | không có |
| Lập kế hoạch, chốt, tổng hợp | chỉ đọc (`list_files`, `read_file`, `search`) |
| Review | đọc + `run_command` (chạy test để xác nhận) |
| Thực thi, sửa theo review | theo quyền dự án |

Repo git: vai trò không có quyền chạy lệnh (Kiến trúc sư, BA, Trưởng phòng…) có thêm `git_read` ở mọi pha có công cụ đọc — để tra hash commit, lịch sử một tính năng, blame mà không cần giao việc "khảo cổ" cho người có shell (gói 4 ND57: giao "khảo cổ commit" cho Kiến trúc sư không có Bash → 57 lần đọc trước lần ghi đầu, 4,0M token, review không duyệt).

**Giao việc theo năng lực công cụ.** Prompt lập kế hoạch và chốt kế hoạch liệt kê với mỗi người: *chạy lệnh (test, build, migration, git)* / *đọc/ghi tệp, xem lịch sử git (chỉ đọc) — KHÔNG chạy test/build* / *chỉ đọc tệp*, kèm quy tắc: hạng mục phải chạy test/build/migration/đo hiệu năng chỉ giao cho người "chạy lệnh"; tài liệu cần số liệu đo thì giao người chạy lệnh hoặc phụ thuộc vào hạng mục đã đo.

Quyền dự án (`toolAccess`): `none` · `read` · `write` (đọc/ghi file) · `exec` (đọc/ghi + chạy lệnh). Mặc định: dự án → `tools.projectAccess` (`exec`); nhiệm vụ không thuộc dự án → `tools.defaultAccess` (`write`): **thư mục làm việc riêng** `workspaces/<task>` (không phải repo) để kiểm kê tài liệu đầu vào và **lưu sản phẩm thành tệp** (bảng/CSV số liệu, danh mục nguồn, giao thức…), không chạy lệnh. Tệp agent tạo được liệt kê trong báo cáo nhiệm vụ.

**Chạy lệnh song song bằng worktree con** (mặc định khi dự án là repo git và nhiệm vụ có worktree riêng): mỗi hạng mục của agent có quyền chạy lệnh (cài dependency, test, migration, git) làm trong **worktree con riêng** `wt-<task>--<S>` (nhánh `ccoding/<task>--<s>` tách từ HEAD nhánh nhiệm vụ, sau khi CCoding commit phần đã làm). Lệnh chuẩn bị của dự án (`setupCommands`) chạy riêng trong từng worktree con. Xong (hoặc tạm dừng giữa chừng) thì CCoding commit, gộp `--no-ff` vào nhánh nhiệm vụ rồi gỡ worktree + nhánh tạm; hạng mục phụ thuộc chỉ bắt đầu sau khi phần nó cần đã gộp. **Xung đột khi gộp** → hủy gộp, giữ phần đã làm ở nhánh `ccoding/<task>--<s>-xd<n>`; hạng mục được giải quyết trong **worktree con MỚI** tách từ nhánh nhiệm vụ mới nhất — CCoding gộp sẵn nhánh đó vào (worktree ở trạng thái gộp dở, có dấu xung đột), agent chỉ sửa dấu xung đột giữ phần của cả hai phía (vai trò không có quyền chạy lệnh cũng làm được); xong lượt CCoding kiểm không còn dấu `<<<<<<<`/`>>>>>>>` và nhánh cũ đã nằm trong lịch sử rồi tự hoàn tất merge và gộp như hạng mục thường. Khóa worktree chính chỉ giữ lúc tách/gộp (vài giây) nên các hạng mục khác vẫn tách/gộp trong lúc giải quyết. Gộp lại mà sạch (nhánh nhiệm vụ đã đổi) và lần trước đã xong thì không gọi agent. Báo cáo bàn giao gốc được giữ, phần "Gộp lại sau xung đột" nối vào sau. Còn dấu xung đột / agent hủy merge → không commit dấu, hạng mục không coi là xong, nhánh `-xd<n>` giữ lại, bấm Tiếp tục để giải quyết lại. Xung đột lặp quá `tools.resolveRounds` vòng (mặc định 2; `0` = như cũ) → làm lại **lần lượt** trong worktree chính, agent tự `git merge --no-ff --no-edit <nhánh cũ>`. Số hạng mục chạy đồng thời theo `maxParallel`; mỗi agent vẫn chỉ làm một hạng mục một lúc. Tắt cho một dự án bằng `parallelWorktrees: false` (hoặc toàn cục `tools.parallelWorktrees: false`).

Bổ sung sau lượt chạy thật 1/11 (`docs/PROCESS-REVIEW.md` mục 11):
- Hạng mục **chỉ ghi tệp** (tài liệu, ADR của Kiến trúc sư/BA) cũng làm trong worktree con (không chạy lệnh chuẩn bị) — trước đây làm thẳng trong worktree chính nên mỗi lần gộp hạng mục khác CCoding commit dở tệp của họ ("phần đã làm trước khi gộp …").
- Sau khi gộp, nếu tệp khai báo phụ thuộc (`package.json`, lockfile, `requirements*.txt`, `go.mod`, `Cargo.lock`, `schema.prisma`…) khác lúc chạy lệnh chuẩn bị, CCoding **chạy lại lệnh chuẩn bị trong worktree nhiệm vụ** trước lệnh kiểm tra — phụ thuộc mới được cài trong worktree con, worktree nhiệm vụ vẫn giữ bản cài cũ nên test báo "Cannot find module" giả.
- Báo cáo ghi commit HEAD + số commit trên nhánh khi mọi thay đổi vào nhánh qua gộp worktree con (trước đây ghi "commit: không có thay đổi").

**Chạy lệnh lần lượt** (khi không dùng worktree con — repo không phải git, `isolation: "none"`, hoặc đã tắt `parallelWorktrees`): repo dự án quyền `exec` dùng chung một worktree giữa các hạng mục ⇒ hạng mục chạy lệnh làm **lần lượt**; hạng mục chỉ viết tài liệu (kiến trúc, BA…) vẫn song song. Tắt bằng `tools.serializeWriters: false`.

**Review dựa trên bằng chứng**: reviewer có quyền chạy lệnh phải chạy test/typecheck liên quan và ghi `checks` (lệnh + exit code); lệnh thật sự chạy qua công cụ được ghi kèm kết luận, review không chạy lệnh nào bị gắn cờ "chưa có bằng chứng chạy thật" (log `review.unverified`).

Giới hạn theo pha (mỗi lượt công cụ gửi lại toàn bộ hội thoại, nên chi phí tăng theo số lượt):
- `phases.toolTurns` — số lượt tối đa: thực thi 40, sửa 16, review 10, lập kế hoạch 8, nghiệm thu (CTO) 6, tổng hợp 4, chốt 4.
- `phases.toolInputBudget` — trần token đầu vào cộng dồn của cả vòng lặp trong một lượt gọi: thực thi 800k, sửa 300k, review 200k, nghiệm thu (CTO) 120k, lập kế hoạch 100k, tổng hợp 60k, chốt 50k (nâng sau lượt chạy ND57: 400k chỉ đủ ~13 lượt trên repo cỡ vừa vì mỗi lượt gửi lại ~30k token lịch sử).
- `tools.cachedInputWeight` (0,1) — token đọc từ cache chỉ tính 10% khi so với `toolInputBudget` (giá cache đọc ~10% đầu vào thường): có cache (Claude qua Bifrost provider kiểu anthropic, Codex tự cache) thì vòng lặp đi được tới `toolTurns` thay vì dừng ở ~23 lượt rồi phải "chạy tiếp" với ngữ cảnh mới (mất cache, đọc lại tệp). Đo gói 2 ND57 28/10: S2 chạm trần 800k sau 23–24 lượt hai lần liền dù ~80% là cache.
- `tools.maxReadChars` (30.000) — hạn mức ký tự riêng của `read_file`, lớn hơn đầu ra lệnh (`maxOutputChars` 12.000) để đọc trọn schema/file nguồn cỡ vừa một lần thay vì từng đoạn.
- `phases.maxContinuations` (mặc định 2) — hạng mục thực thi chạm trần lượt/token **khi chưa xong** không bị coi là xong: model phải mở đầu câu trả lời bằng `TRẠNG THÁI: XONG` hoặc `TRẠNG THÁI: CHƯA XONG — …`; nếu chưa xong (hoặc thiếu dòng trạng thái), CCoding cho **chạy tiếp với ngữ cảnh mới** (bàn giao dở dang + `git diff --stat` của worktree, không mang lịch sử công cụ cũ nên không tốn token lặp lại). Hết số lần chạy tiếp mà vẫn chưa xong → hạng mục `failed`, hạng mục phụ thuộc bị bỏ qua (không chạy trên nền dang dở), có cảnh báo `subtask.incomplete`. Nhiệm vụ còn hạng mục lỗi/bỏ qua kết thúc ở trạng thái **lỗi** (không báo "Hoàn thành"); bấm **Tiếp tục** thì hạng mục dừng giữa chừng làm tiếp từ bàn giao dở dang + thay đổi đã có trong worktree, không làm lại từ đầu.
- Chống "khảo sát mãi không ghi" (pha thực thi/sửa có quyền ghi): đã dùng ~35% rồi ~65% lượt hoặc trần token mà chưa ghi tệp nào thì CCoding chèn lời nhắc dừng khảo sát và ghi ngay; `read_file` trùng tham số khi nội dung cũ còn nguyên trong lịch sử (chưa bị rút gọn, chưa ghi gì từ đó) chỉ trả ghi chú "đã đọc ở lượt N" thay vì gửi lại cả file. Lập kế hoạch cho repo có tệp nguồn lớn: mỗi hạng mục phải xong trong một lượt (~30 thao tác) — tách theo nhóm endpoint/màn hình.
- `read_file` tự dừng ở ranh giới dòng khi chạm `maxOutputChars` và ghi `offset=` để đọc tiếp (trước đây phần giữa file bị cắt khiến agent đọc lại mãi cùng một đoạn); các file chưa đọc kịp trong lần gọi được liệt kê để đọc ở lượt sau.

Chạm một trong hai ⇒ model được yêu cầu viết báo cáo cuối ngay (log `call.diag`). Kết quả công cụ cũ được rút gọn (giữ nguyên 4 kết quả gần nhất), nội dung file đã ghi trong lịch sử cũng được rút gọn.

## Lệnh chuẩn bị và kiểm tra của dự án (CCoding tự chạy)

Khai báo trong dự án (form *Dự án* → **Sửa**, hoặc `projects.json`):

```json
"setupCommands": ["cd app/server; npm ci"],
"checkCommands": ["cd app/server; npm test", "cd app/server; npm run check"]
```

- **Chuẩn bị** (`setupCommands`, ≤ 20 lệnh) chạy một lần cho mỗi worktree trước thực thi; lỗi ⇒ cảnh báo `checks.setup`.
- **Kiểm tra** (`checkCommands`, ≤ 20 lệnh) chạy **3 thời điểm**: *baseline* (trước khi agent sửa), *sau thực thi*, *sau mỗi vòng sửa theo review*. Lệnh chuẩn bị + baseline của worktree nhiệm vụ chạy **song song với lập kế hoạch/họp** (các pha đó chỉ đọc repo) thay vì sau khi chốt kế hoạch — bớt ~0,5–1 phút trên đường găng mỗi nhiệm vụ; tắt bằng `tools.earlyBaseline: false`. Mỗi kết quả lưu `task.projectChecks` (exit code, thời gian, dòng tóm tắt kiểu `tests 12 pass 12 fail 0`, phần cuối đầu ra) và log `checks.run`.
- Chạy bằng CCoding (không qua agent/model) trong worktree, cùng sandbox với `run_command`: lệnh cấm (`tools.denyCommands` + `denyCommands` của dự án) bị chặn từ lúc lưu dự án (API trả 400) và lúc chạy (`⛔`), biến môi trường chứa khóa bị loại, giới hạn `tools.commandTimeoutSec`.
- Review nhận bảng kết quả làm **bằng chứng độc lập**: lệnh *đạt ở baseline nhưng lỗi sau khi sửa* (hồi quy) ⇒ review **không được duyệt** dù reviewer ghi duyệt (thêm vấn đề `blocker`), cảnh báo `checks.regression`. Lỗi đã có từ baseline không tính cho nhiệm vụ.
- Review cuối chưa duyệt / còn hồi quy ⇒ nhiệm vụ vẫn *Hoàn thành* nhưng gắn cờ **⚠ cần xem** (`task.attention`) và cảnh báo `task.attention`; báo cáo có bảng "Lệnh kiểm tra" và mục "Cần xem lại".
- Agent thực thi thấy kết quả baseline trong prompt ⇒ không tốn lượt đo lại; chỉ chạy lại đúng các lệnh đó để kiểm chứng phần của mình.

## Đọc tệp qua công cụ, không qua shell

Agent đã có `read_file`/`search` thì `run_command` **chặn** lệnh chỉ để đọc/tìm tệp (`Get-Content`, `cat`, `type`, `head/tail`, `Select-String -Path`, `rg`/`grep` trên tệp, `[IO.File]::ReadAll…`) và trả lời hướng dẫn dùng `read_file`/`search` (đọc theo `offset`, có số dòng, được tính hạn mức, không trùng lặp). Lọc đầu ra của lệnh khác (vd. `npm test | Select-String fail`) vẫn được. Lý do: lượt ND57 27/10 có 62/196 thao tác là đọc tệp qua shell — mỗi lần trả tối đa 12k ký tự không số dòng và đọc lại nhiều lần.

## Khảo sát mãi không ghi (`tools.readsBeforeWrite`)

Pha thực thi/sửa có công cụ ghi: đếm lần `read_file`/`search`/`list_files` **liên tiếp** kể từ lần ghi gần nhất. Tới N (mặc định 16) thì nhắc ghi một lần; tới 2N thì công cụ đọc **từ chối** ("ghi xong sẽ được đọc tiếp") cho tới khi agent `write_file`/`edit_file` thành công — đọc lại nội dung còn nguyên trong lịch sử không bị tính. Lý do: gói 2 ND57 có hạng mục đọc 48–70 lần trước lần ghi đầu (QA 70, frontend 65, backend 48), 40–66% là đọc lại. `0` = tắt.

## Kế hoạch và lịch sử dự án trong `.ccoding/<task>/`

- `PLAN.md`: kế hoạch đầy đủ (mô tả mọi hạng mục). Prompt thực thi chỉ gửi mỗi hạng mục một dòng (mã, tên, người làm, phụ thuộc) + mô tả đầy đủ hạng mục của chính agent — phần nền này đi kèm mọi lượt công cụ.
- `inputs/PROJECT-HISTORY.md` (P8): các nhiệm vụ trước của cùng dự án (mới nhất trước) — tóm tắt, nhánh/commit, kết quả lệnh kiểm tra sau cùng, cờ "cần xem", việc còn mở. Bản rút gọn (≤ 4.500 ký tự, 3 nhiệm vụ — `phases.projectHistory`, `0` = tắt) vào prompt **lập kế hoạch**; chỉ lấy nhiệm vụ có phân loại dữ liệu ≤ nhiệm vụ hiện tại.

## Bản đồ repo

Mỗi nhiệm vụ trên repo, CCoding dựng `.ccoding/<task>/repo-map.md` (làm mới trước mỗi hạng mục; tắt bằng `tools.repoMap: false`): cây thư mục (≤ 80 thư mục, bỏ `node_modules`, `dist`, `.git`…), **tệp lớn** (≥ 800 dòng — phải đọc theo đoạn), route Express (`router.get('/x')` kèm `tệp:dòng`), model Prisma, định nghĩa hàm/lớp cấp trên kèm số dòng. Bản đồ được đưa vào prompt lập kế hoạch và thực thi ⇒ agent nhảy thẳng tới `read_file path offset` thay vì `list_files`/`search` rộng; lập kế hoạch thấy tệp lớn nên phải tách hạng mục theo nhóm endpoint/màn hình.

Bản **gọn** (`tools.repoMapMode: "compact"` hoặc tùy chọn nhiệm vụ `repoMapMode`; mặc định vẫn bản đầy đủ cho tới khi benchtest chứng minh — xem [BENCH.md](BENCH.md)): bản đồ ≤ 6k ký tự (thư mục xếp theo số dòng, tệp lớn, tệp có route/schema) + chỉ mục `.ccoding/<task>/repo-index.md` một ký hiệu một dòng `tệp:dòng  loại  tên` (route, schema, hàm của tệp lớn trước) — agent tra bằng `search` thay vì đọc cả bản đồ, nên phần bị gửi lại ở các lượt sau nhỏ hơn.

## Cách ly bằng git worktree

> **Ranh giới package:** CCoding là gói ESM (`"type": "module"`). Worktree/thư mục làm việc nằm dưới `workspaces/` nên CCoding tự đặt `workspaces/package.json` trung tính — nếu không, thư mục nào của dự án không có package.json riêng (vd. `app/web/*.js` dạng UMD của ND57) bị Node nạp thành ESM, mất `module.exports`, và test của dự án đỏ dù trên máy dự án vẫn xanh (lỗi "baseline đỏ" giả ở lượt chạy ND57 27/10).

Dự án có `workspace` là repo git và `isolation: "worktree"` (mặc định): mỗi nhiệm vụ có worktree riêng `workspaces/<dự án>/wt-<task>` trên nhánh `ccoding/<task>` tạo từ HEAD hiện tại — hoặc từ `baseRef` của dự án (vd. `"baseRef": "origin/main"`, CCoding `git fetch` nhánh đó trước) khi thư mục đang đứng ở nhánh khác mà nhiệm vụ cần làm trên nhánh chính. Agent chỉ sửa trong worktree; nhánh đang làm việc của bạn không bị đụng tới. Các file chưa track cần để chạy (mặc định `.env`, `.env.local`, `.env.development`, `.env.test`…) được **chép** sang worktree (agent không đọc được nội dung). Xong nhiệm vụ, CCoding commit thay đổi trên nhánh đó (không push) và ghi vào báo cáo cách xem/gộp:

```bash
git diff <commit-gốc>..ccoding/<task>     # xem thay đổi
git merge ccoding/<task>                  # gộp sau khi review
git worktree remove workspaces/<dự án>/wt-<task>
```

Tài liệu đầu vào (yêu cầu đầy đủ, chữ trích từ tệp đính kèm) và sản phẩm các hạng mục nằm trong `<workspace>/.ccoding/<task>/` (có `.gitignore` riêng nên không bị commit).

## An toàn (sandbox theo quy ước)

- Mọi đường dẫn bị giới hạn trong gốc workspace (chặn `..`, đường dẫn tuyệt đối, symlink trỏ ra ngoài).
- Không đọc: `.env*` (trừ `.env.example/.sample/.template`), khóa (`*.pem`, `*.key`, `id_rsa`…), `.npmrc`, `.git-credentials`, nội dung `.git/`. Không ghi vào `.git/`, `node_modules/`.
- Lệnh bị chặn: `git push`, `git reset --hard`, `git clean -f`, đổi sang main/master, viết lại lịch sử, `git commit` khi không ở nhánh riêng, xóa đệ quy (`rm -r`, `Remove-Item -Recurse`, `rd /s`), format/đĩa, tắt máy, `npm publish`, `docker system prune`, `kubectl delete`, tải-và-chạy script (`curl … | sh`, `iex`), `DROP DATABASE`, `prisma migrate reset`, `--accept-data-loss`, đổi cấu hình hệ thống (`setx`, `reg add`…), `ssh/scp`, in biến môi trường. Thêm quy tắc riêng: `tools.denyCommands` (regex).
- Biến môi trường chứa khóa (`*_API_KEY`, `*TOKEN*`, `*SECRET*`, `BIFROST_*`, `NINEROUTER*`, `ANTHROPIC_*`, `OPENAI_*`…) bị loại khỏi môi trường của lệnh.
- Kết quả công cụ gửi tới runtime bên ngoài được che bí mật (và PII với dữ liệu *Bảo mật/Hạn chế* — vốn chỉ chạy runtime cục bộ).
- Mỗi thao tác được ghi log `tool.call` (tên, tham số tóm tắt — không ghi nội dung file, thời gian, kết quả).

**Giới hạn:** đây không phải cô lập ở mức hệ điều hành — `run_command` chạy dưới tài khoản Windows đang chạy CCoding. Chỉ bật `exec` cho repo dev; với dự án nhạy cảm dùng `write`/`read` hoặc chạy CCoding dưới tài khoản ít quyền / máy ảo. Xem `docs/data-protection-assessment.md`.

## Runtime CLI (claude/codex/kimi)

Các CLI agent tự có công cụ riêng; CCoding truyền danh sách công cụ kiểu Claude Code (`Read`, `Write`, `Bash`…) đã lọc theo pha và quyền dự án, và chạy CLI trong cùng thư mục làm việc.

**claude-cli — hook `claude-guard` (PreToolUse)** áp cùng chính sách với vòng công cụ của CCoding:
- lệnh cấm mặc định + `denyCommands` của dự án; không tạo/chuyển nhánh, rebase, reset --hard, push; không `.env` (kể cả `git show HEAD:…/.env`);
- `Read/Edit/Write/Grep/Glob` chỉ trong thư mục làm việc của lượt gọi (worktree hoặc worktree con);
- **lệnh shell cũng bị giữ trong thư mục làm việc** (từ 1/11/2026): đường dẫn ổ đĩa `C:\…`/`C:/…`, MSYS `/c/…`, UNC, `~/`, `$HOME`, `$env:USERPROFILE` và `../` vượt gốc (tính theo `cd` trong lệnh) đều bị chặn — trừ thư mục tạm và thư mục cài đặt hệ thống/Node. Trước đây `cat /c/Users/<người dùng>/<thư mục khác>/…` qua Bash không bị chặn dù `Read` thì có. Cùng quy tắc áp cho `run_command` của CCoding;
- vai trò chỉ có **git chỉ đọc**: CCoding thêm `Bash` vào `--tools`, hook chỉ cho lệnh CHỈ ĐỌC trong worktree — `git <lệnh đọc>` và đọc tệp (`cat`, `head`, `tail`, `ls`, `grep`, `find` không `-exec/-delete`, `sed -n 'a,bp'`…), nối bằng `&&`, `||`, `;` hoặc `|` (chi tiết ở mục *Chế độ shell chỉ đọc của hook*); chặn chuyển hướng, `$(…)`, ghi tệp qua shell — test/build/lệnh khác bị chặn kèm hướng dẫn ghi lệnh vào bàn giao. Lệnh Bash chỉ xem git được ghi log/KPI là `git_read` (không tính "chạy lệnh");
- **giới hạn khảo sát** (`tools.readsBeforeWrite`, pha thực thi/sửa): đếm `Read/Grep/Glob` và lệnh shell chỉ đọc (`cat`, `sed -n`, `grep`, `ls`, `git log`…) liên tiếp; ghi tệp hoặc chạy lệnh khác (test, build) đặt lại bộ đếm. Ở N lần: chặn đúng lần đọc đó với lời nhắc ghi dần (lần sau được đọc); từ 2N: chặn đọc cho tới khi ghi. Bộ đếm nằm ở `data/runs/<task>/guard/<lượt gọi>.json`, xóa khi lượt gọi xong. Trước đây giới hạn này chỉ có trong vòng công cụ của CCoding.

## Chế độ shell chỉ đọc của hook (B-04)

Mục này mô tả cách hook `claude-guard` quyết định một lệnh Bash có phải lệnh chỉ đọc hay không, với vai trò chỉ có git chỉ đọc. Mã nguồn nằm ở `src/tools/shell-policy.ts` (`shellParse`, `gitReadViolation`) và được hook gọi trong `src/tools/claude-guard.ts`. Phần này chỉ nới quyền đọc trong workspace. Chặn đọc `.env` và chặn đường dẫn ngoài workspace vẫn áp như cũ.

**Tách lệnh có xét nháy.** `shellParse` tách lệnh thành các câu con. Các toán tử `&&`, `||`, `;`, xuống dòng và `|` chỉ có nghĩa khi nằm ngoài nháy đơn hoặc nháy kép. Ký tự `<` và `>` trong nháy không phải chuyển hướng, nên `grep "a > b" tệp` được qua. Hai dạng `2>&1` và `>/dev/null` (kể cả `2>/dev/null`) được bỏ qua. Dấu `\"` trong nháy kép được hiểu đúng (`splitArgs`).

**Các lệnh được nới.**

| Lệnh | Điều kiện |
|---|---|
| `echo`, `printf` | Không chuyển hướng |
| `pwd`, `true` | Không có |
| `sed -n` | Nhiều địa chỉ dạng `Np`, `N,Mp`, `N,$p`, cách nhau bằng `;`, ví dụ `sed -n '271p;480p;524p' tệp` |
| `awk` | Chương trình không chứa `system`, `getline`, `close`, `ENVIRON`, `fflush`, `>`, `\|`, `@include`, `@load`; không dùng `-f`, `-i`, `-E`, `-l`, `-W`, `--file`, `--source` |
| `cat`, `sed -n`, `awk` an toàn | Được làm bộ lọc sau dấu `\|` |
| `\|\|` | Chỉ giữa các lệnh chỉ đọc |

**Các ca vẫn bị chặn.**

| Dạng | Mã quy tắc |
|---|---|
| `; rm …` và mọi lệnh không phải chỉ đọc, `sed -i`, `tee`, `sort -o`, `tree -o` | `not-read-only` |
| `python`, `node` và các trình thông dịch khác, `awk 'BEGIN{system(…)}'` | `interpreter` hoặc `not-read-only` |
| `> tệp`, `>> tệp`, `<` | `redirect` |
| `$(…)` và dấu backtick, kể cả trong nháy kép (bash vẫn chạy chúng) | `subst` |
| Heredoc | `heredoc` |
| `for`, `while` | `loop` |
| Đọc tệp `.env`, kể cả dạng nối nháy như `.e""nv` | `env-file` |
| Đường dẫn ngoài thư mục làm việc | `outside-root` |
| Ghi, xóa, đổi quyền vào đường dẫn POSIX tuyệt đối hoặc thư mục hệ thống Windows | `outside-root-write` |

### Chặn ghi ngoài thư mục làm việc (`outside-root-write`)

Áp cho mọi tầng shell (kể cả `full`), sau kiểm tra `outside-root`. Mã: `outsideWriteViolation` trong `src/tools/shell-policy.ts`, hook gọi ở `guardBlock`. Mỗi câu con được phân tích riêng (tách theo `; && || | &`, ngoài nháy). Đích ghi nằm ngoài thư mục làm việc ở dạng đường dẫn POSIX tuyệt đối (`/etc/…`, `/opt/…`) hoặc trong thư mục hệ thống Windows (`SystemRoot`, `ProgramFiles`, thư mục cài Node) thì bị chặn. Ổ đĩa hay thư mục khác trên Windows vẫn do `outside-root` chặn.

| Dạng được phân tích | Ví dụ (Bash / PowerShell) |
|---|---|
| Xóa: `rm`, `del`, `rmdir`, `Remove-Item` | `rm /etc/x` / `Remove-Item /etc/x` |
| Đích của `cp`, `mv`, `Copy-Item`, `Move-Item` (đối số cuối, `-t`, `-Destination`) | `cp a /opt/a` / `Copy-Item a -Destination /opt/a` |
| Chuyển hướng `>`, `>>` ngoài nháy; `tee` | `echo x > /etc/x` |
| Tải về: `wget -O`, `--output-document`, `curl -o`, `--output`, `Invoke-WebRequest`/`iwr -OutFile` | `curl -o /opt/x URL` / `iwr URL -OutFile /opt/x` |
| Đổi quyền, liên kết: `chmod`, `chown`, `icacls`, `takeown`, `ln`, `dd of=` | `chmod 777 /etc/x` |

Ngoại lệ vẫn được ghi: `/dev/null`, `$null`, `/tmp`, `/var/tmp` và thư mục tạm của hệ điều hành. Vẫn được qua: đọc và chạy từ thư mục hệ thống (`ls /usr/bin`, `cat /etc/os-release`, `/usr/bin/env node x.js`, gọi `node`/`git` bằng đường dẫn tuyệt đối) và mọi thao tác trong thư mục làm việc, kể cả `wget -O vendor/x.js URL`, `curl -o vendor/x.js URL`, `iwr URL -OutFile vendor\x.js`. Không đổi tầng `git-read` và `denyCommands`.

**Giới hạn (quan trọng).** Đây là lớp phân tích chuỗi lệnh, chặn các dạng ghi ra ngoài phổ biến; nó không phải ranh giới bảo mật. Các dạng sau vẫn ghi được ra ngoài và không bị phân tích: `node -e "…"` và các trình thông dịch khác, script npm, biến (`$X`), `eval`, lệnh lồng (`$(…)`, backtick), `xargs`, `find -exec`/`-delete`. Lớp bảo vệ chính là sandbox hệ điều hành (B-18). Trạng thái B-18 trong cấu hình/tài liệu hiện có: chưa xác minh được trong phạm vi hạng mục này (không tự bật); việc bật B-18 không chặn việc đóng K3. Test: `test/shell-policy-write-outside.test.ts`.

Lệnh gộp có `cd` sang thư mục khác cũng có thể bị chặn. Hook không nhớ thư mục hiện tại giữa các lượt Bash, nên `cd ../paper` từ gốc workspace bị coi là đi ra ngoài.

**Kết quả phát lại.** Script `scripts/replay-guard-deny.mjs` phát lại 44 lệnh `git-read-deny` của `docs/research/context/tool-failures-2026-11-02.csv` qua hàm thật. Trước khi sửa, 0 trên 44 lệnh qua. Sau khi sửa, 33 lệnh qua và 11 lệnh vẫn bị chặn. Trong 11 lệnh đó có 8 lệnh ghi hoặc chạy mã, đúng như dự kiến, và 3 lệnh chỉ đọc không nới được (một lệnh dùng `$(…)`, một lệnh `cd ..` ra ngoài, một lệnh bị CSV cắt cụt). Mốc 36 trên 44 của đề bài chưa đạt, và quyết định chấp nhận 33 trên 44 chờ giám đốc. Nhãn đọc, ghi, chạy mã trong CSV là nhãn suy từ nội dung lệnh. Để chạy lại:

```bash
node --import tsx scripts/replay-guard-deny.mjs
```

Bộ test ác ý nằm ở `test/shell-policy-adversarial.test.ts`.

## Thông báo chẩn đoán khi hook chặn (B-06)

Khi chặn, hook nêu câu lệnh con vi phạm và quy tắc bị vi phạm, thay cho một thông báo chung. Mã nguồn: `blockMessage` và `safeCmdName` trong `src/tools/shell-policy.ts`, `guardBlock` trong `src/tools/claude-guard.ts`.

Thông báo có dạng `CCoding chặn câu N: \`lệnh\` <quy tắc> — <gợi ý>` và dài tối đa 300 ký tự. Ví dụ, khi câu thứ 2 là `python3`: "CCoding chặn câu 2: `python3` không phải lệnh chỉ đọc (chạy mã) — đọc/tìm bằng Read/Grep/Glob…". Thông báo chỉ giữ tên lệnh hoặc toán tử. Tên dài hơn 24 ký tự, có ký tự lạ hoặc giống khóa, token thì được thay bằng `?`, nên không lộ tham số hay bí mật.

Các mã quy tắc: `not-read-only`, `redirect`, `subst`, `heredoc`, `loop`, `interpreter`, `env-file`, `outside-root`, `outside-root-write`, `deny-list`, `git-branch`, `read-limit`. Lệnh khớp danh sách cấm mặc định (ví dụ `rm -r`) bị chặn trước khi tách câu, nên sự kiện của chúng có `rule: deny-list` và `clause: 1`.

**Sự kiện `guard.block`.** Mỗi lần chặn, hook ghi một sự kiện mức `warn` qua `LogStore` (che PII và bí mật, có chuỗi băm).

| Trường trong `data` | Nội dung |
|---|---|
| `tool` | Công cụ bị chặn |
| `clause` | Số thứ tự câu, bắt đầu từ 1 |
| `rule` | Mã quy tắc ở trên |
| `cmd` | Chỉ tên lệnh hoặc toán tử, không có lệnh thô |

Sự kiện nằm ở `<data>/logs/system.jsonl` và, khi biết nhiệm vụ, ở `<data>/runs/<task>/events.jsonl`. Hook tìm thư mục `data/` theo thứ tự: trường `dataDir` trong cấu hình `CCODING_GUARD`, biến môi trường `CCODING_DATA_DIR`, rồi suy từ đường dẫn bộ đếm `<data>/runs/<task>/guard/<lượt>.json`. Không tìm được thì bỏ qua việc ghi log. Lỗi khi ghi log không đổi quyết định chặn hay cho qua. Mỗi lần chặn mở một `LogStore` mới, nên khi nhiều hook chạy song song chuỗi băm có thể rẽ nhánh. Đây là log chẩn đoán, không dùng làm chứng cứ. Kiểm thử: `test/guard-block-diag.test.ts`.

**Hiệu lực.** Hook chạy theo bản `dist/` đã cài, không chạy theo `src/`. Cả hai thay đổi trên (B-04 và B-06) chỉ có hiệu lực sau khi build và cài lại `dist/`. Cách kiểm: chạy một lệnh bị chặn rồi tìm dòng `guard.block` trong `data/logs/system.jsonl`.

## Kiểm tra nhất quán số liệu nghiên cứu (B-05)

Script kiểm tra tài liệu nghiên cứu để phát hiện cụm đã lỗi thời và số liệu lệch so với giá trị chuẩn. Script là Node thuần, không thêm phụ thuộc, chỉ đọc và không ghi gì ra đĩa. Mã nguồn: `docs/research/scripts/consistency-check.mjs`. Dữ liệu chuẩn: `docs/research/facts.json`.

Script quét các tệp `.md` trong `docs/research/**` và `docs/PROCESS-REVIEW.md`, bỏ qua `CHANGELOG.md` và thư mục `context/`. Mỗi dòng được chuẩn hóa NFC rồi so khớp với `facts.json`. Tệp này có hai nhóm:

- `stale`: cụm đã lỗi thời, mỗi mục có thể giới hạn theo `files` và có `exceptions`.
- `numbers`: số chuẩn. Mỗi mục có `value`, `reason` (ghi nguồn của số), `pattern`, `files`, `exceptions`. Nhóm bắt đầu đầu tiên của `pattern` (hoặc cả đoạn khớp) phải bằng `value`.

Mỗi ngoại lệ có dạng `{file, line?, reason}`. Ngoại lệ thiếu `reason` thì script dừng với exit 2.

```bash
node docs/research/scripts/consistency-check.mjs            # in lỗi dạng tệp:dòng — id — mô tả
node docs/research/scripts/consistency-check.mjs --json     # in mảng JSON {file,line,id,kind,message}
node docs/research/scripts/consistency-check.mjs <thư-mục-gốc> --facts <tệp-facts.json>
```

Có lỗi thì exit 1, sạch thì exit 0. Test nằm ở `test/consistency-check.test.ts` và chạy trong `npm test`. Khi chạy trên repo thật, script báo một lỗi ở `docs/research/BRIEF-2.md:6` (dòng nói lượt C7 t2 "review không bắt", lệch so với `token-analysis.md`). Việc sửa dòng này chưa làm.
