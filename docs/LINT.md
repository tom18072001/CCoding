# Lint của CCoding: luật chạy trong CI, đỏ là hỏng

Tài liệu này là nguồn duy nhất cho các luật mà `scripts/lint/` kiểm. Nó dành cho người và agent sửa mã hoặc tài liệu của repo. Mỗi luật sinh ra từ một lỗi đã lặp lại dù hồ sơ agent hay đề bài đã dặn. Vì vậy luật nằm trong lint và CI chặn, không chỉ nằm trong lời nhắc.

## 1. Nguyên tắc

Lint không có mức cảnh báo. Có một lỗi thì lệnh thoát với mã 1. Không có biến môi trường hay cờ nào để bỏ qua một rule.

Cách duy nhất để một vi phạm được chấp nhận là ghi nó vào một trong hai tệp được review (mục 4). Mục ghi vào mà không còn khớp lỗi nào cũng là lỗi, nên ngoại lệ cũ phải được xóa.

Rule dùng đúng mã đang chạy thay vì chép lại. Ví dụ `brief-lint` gọi `briefItems()` và `needsCommand()` của `src/plan-gate.ts`. Lint chạy trên Windows và Linux, Node 22 và 24, không cần mạng, không thêm phụ thuộc.

## 2. Cách dùng

Mục này liệt kê lệnh chạy lint ở máy của bạn và trong CI.

| Lệnh | Tác dụng |
|---|---|
| `npm run lint` | Chạy mọi rule. |
| `npm run check` | Chạy `typecheck`, `lint`, `test`, `test:bench`, `test:research` nối nhau. Đây là lệnh phải xanh trước khi commit. |
| `npm run lint -- --rule <id>[,<id>]` | Chỉ chạy các rule nêu tên. |
| `npm run lint -- --json` | In kết quả dạng JSON (`ok`, `total`, `errors`). |
| `npm run lint -- --base <ref>` | Đặt mốc git cho rule cần so với mốc và cho kiểm "baseline chỉ giảm". |

Mốc lấy theo thứ tự, nguồn đầu tiên có giá trị thì dùng:

1. `--base <ref>`;
2. biến `LINT_BASE`;
3. biến `CCODING_BASE_REF`;
4. `git merge-base HEAD @{upstream}` (nhánh upstream của nhánh hiện tại);
5. `git merge-base HEAD origin/main`.

Mốc tường minh (1–3) mà không phân giải được thành commit thì lỗi, không chuyển sang nguồn khác. Không tìm được mốc nào thì rule cần mốc (`agent-format-cochange`) vẫn báo lỗi, không bị bỏ qua, và thông báo liệt kê các nguồn đã thử. Chạy `--rule` với một rule không cần mốc thì không đòi mốc.

Khi có mốc, bộ chạy in một dòng ở đầu đầu ra, vd. `Lint: mốc origin/main (nguồn: merge-base HEAD với origin/main (mặc định)) → abc1234` (sha ngắn của commit mốc). Chế độ `--json` thêm trường `baseSource`.

**Danh sách tệp:** mọi rule dùng danh sách tệp gồm tệp đã track (`git ls-files`) và tệp chưa track nhưng không bị ignore (`git ls-files --others --exclude-standard`), nên tệp mới chưa `git add` vẫn bị quét. `ctx.changed()` cũng tính cả tệp chưa track. Rác chưa track không nằm trong `.gitignore` có thể làm các rule duyệt mọi tệp (`stray-files`, `secrets`, `machine-path`, `orphan-tests`) đỏ; đó là hành vi đúng, hãy xóa hoặc ignore tệp đó. Các script nghiên cứu do `lib/script-rule.mjs` gọi không tự liệt kê tệp bằng git nên không đổi.

Trong CI (`.github/workflows/ci.yml`) bước đầu tính `LINT_BASE`. Pull request lấy `origin/<nhánh đích>`. Đẩy nhánh thường lấy `before` của sự kiện. Nhánh mới lấy `git merge-base origin/main HEAD`. Không tính được mốc thì bước đó đỏ. CI checkout `fetch-depth: 0` để có lịch sử.

Khi văn phòng CCoding chạy lệnh kiểm tra của dự án, nó đặt `CCODING_BASE_REF` bằng mốc của nhiệm vụ, nên lint chạy theo diff so với mốc đó.

## 3. Bảng rule

Mỗi rule có đúng một dòng. Cột "Lỗi lặp sinh ra nó" chép từ trường `source` của rule. Cột "Cách sửa" nói việc cần làm khi rule đỏ, ngoài cách ghi ngoại lệ ở mục 4.

### 3.1. Quy ước mã nguồn (AGENTS.md)

| Rule | Lỗi lặp sinh ra nó | Điều kiểm | Cách sửa khi đỏ |
|---|---|---|---|
| `deps-allowlist` | AGENTS.md: hạn chế phụ thuộc runtime | `package.json` chỉ có phụ thuộc runtime `yaml` | Bỏ phụ thuộc mới, hoặc dùng mã Node có sẵn. |
| `llm-boundary` | AGENTS.md: mọi lượt gọi LLM qua `Orchestrator.call()` | Chỉ các module trong danh sách của rule được gọi runtime LLM | Đưa lượt gọi qua `Orchestrator.call()`. |
| `exec-boundary` | D16: rule mới chỉ nối một đường chạy lệnh | Chỉ module trong danh sách được import `child_process`, và mỗi module dùng đúng cách kiểm lệnh đã khai | Gọi đủ hàm kiểm lệnh của module, hoặc dùng module đã có. |
| `log-boundary` | AGENTS.md: log chỉ ghi qua `LogStore` | Ghi nối tệp trong `src/` chỉ nằm ở `src/logger.ts` và `src/log-retention.ts` | Ghi log qua `LogStore`. |
| `public-no-cdn` | AGENTS.md: `public/` không CDN | Không có tài nguyên tải từ địa chỉ ngoài trong `public/` | Tự host hoặc dùng tài nguyên hệ thống. |
| `agent-format-cochange` | AGENTS.md: đổi định dạng `agent.md` phải cập nhật tài liệu và test | Diff so với mốc có đổi `src/registry.ts` thì phải đổi cả `docs/AGENTS-GUIDE.md` và `test/registry.test.ts` | Cập nhật hai tệp kia trong cùng thay đổi. |

Rule `agent-format-cochange` cần mốc git. Nó khớp quy ước trong `AGENTS.md`: đổi định dạng `agent.md` thì cập nhật `docs/AGENTS-GUIDE.md` và `test/registry.test.ts`.

### 3.2. Bảo vệ dữ liệu

| Rule | Lỗi lặp sinh ra nó | Điều kiểm | Cách sửa khi đỏ |
|---|---|---|---|
| `secrets` | Đánh giá bảo vệ dữ liệu (PRE/DET cho repo công khai) | Tệp chữ đã track không chứa khóa, token hay khóa riêng theo các mẫu của rule | Xóa giá trị, xoay khóa nếu là khóa thật, đặt khóa trong `.env`. |
| `machine-path` | BRIEF-21 tiêu chí 8: báo đã xử lý mà vẫn còn | Tệp chữ đã track không chứa đường dẫn máy (tên người dùng, thư mục tạm máy cloud) | Thay bằng chỗ giữ chỗ như `<bạn>` hoặc đường dẫn tương đối. |
| `paper-anonymity` | Quyết định 14/11 mục 2: bài báo ẩn danh chủ dự án | `docs/research/paper/**` không chứa tên riêng trong danh sách của rule | Dùng tên vai thay tên riêng. |

### 3.3. Test và CI

| Rule | Lỗi lặp sinh ra nó | Điều kiểm | Cách sửa khi đỏ |
|---|---|---|---|
| `no-only` | Test khóa bằng `.only` vẫn xanh | Không có `.only(` hay `only: true` trong tệp test | Bỏ `.only`. |
| `skip-registry` | D18a, D18c: số test bỏ qua lệch, không ai giải thích | Mọi chỗ bỏ qua test có lý do và khớp `test/skips.json` | Thêm mục vào `test/skips.json` kèm lý do, hoặc bỏ lệnh bỏ qua. |
| `orphan-tests` | Test nghiên cứu không lệnh nào chạy | Mọi `*.test.{ts,mjs,js}` đã track khớp glob của một script test trong `package.json` | Đổi tên hoặc thêm glob vào script test. |
| `test-glob` | BRIEF-22c: `node --test <thư mục>/` hỏng trên Windows | Không có `node --test` truyền thư mục trần trong `package.json`, `README.md`, workflow, `docs/` | Dùng glob trong ngoặc kép. |
| `ci-integrity` | D20: CI không được làm đỏ thành xanh | `ci.yml` còn nguyên: mọi nhánh và PR, ma trận 2 hệ điều hành × Node 22/24, đủ bước, bước sạch cây ở cuối, không `continue-on-error`, `\|\| true`, `if: false`; job `test` phải có `timeout-minutes` là số nguyên dương ≤ 120 (D28) | Khôi phục workflow. |
| `test-writes-repo` | D22: `analyze-sr.test.mjs` tạo bài tạm trong `bench/vs-claude/tasks/`, đua với `isolation-v43f.test.mjs` ⇒ ENOENT chập chờn; test còn làm bẩn worktree | Trong `*.test.{ts,mjs}`, lệnh ghi (`writeFileSync`, `mkdirSync`, `rmSync`, `cpSync`, `renameSync`…; với `cpSync`/`copyFileSync` là đối số đích) không có đường dẫn ghép từ `HERE`, `ROOT`, `__dirname`, `import.meta.dirname` (hay biến một lần khai báo suy từ chúng bằng `path.join/resolve`) mà không qua `mkdtemp`/`os.tmpdir()`. Chỉ ĐỌC từ repo thì được | Ghi vào `fs.mkdtempSync(path.join(os.tmpdir(), …))`; `run.mjs`/`analyze.mjs` nhận thư mục bài qua `--tasks-dir` hoặc `VSC_TASKS_DIR`. Ngoại lệ có lý do: `scripts/lint/allow.json` (rule `test-writes-repo`, neo = đoạn dòng). |
| `stray-files` | BRIEF-22 (C1), D18a: tệp chèn chưa gộp, bản nháp để lại; BRIEF-25 (`k2-tmp/a.mjs` bị sót), BRIEF-26b (`_ed.py` ở gốc repo) | Không track `*-insert.md`, `DRAFT-*`, `*.orig`, `*.rej`, `*.bak`, `*~`; `FINAL.md`/`ACCEPTANCE.md` chỉ khi được liệt kê. Tệp (đã track hoặc chưa track không bị ignore) khớp mẫu trong `.ccoding/scratch.json` (so bằng `matchScratch` của `src/scratch.ts`, mẫu `!…` là loại trừ) bị báo. Tệp ở gốc repo phải nằm trong `ROOT_ALLOW` của luật (`.gitattributes`, `.gitignore`, `.npmrc`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `ccoding.config.json`, `ccoding.local.example.json`, `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.test.json`) | Chuyển tệp nháp vào `.scratch/` (đã git exclude) hoặc xóa; gộp nội dung vào đúng chỗ. Tệp gốc hợp lệ mới: thêm vào `ROOT_ALLOW` (cần review). Ngoại lệ từng tệp: `scripts/lint/allow.json` (anchor là đoạn trong thông báo). Mẫu nháp mới: sửa `.ccoding/scratch.json`, không sửa luật. |

**Giới hạn thời gian test (D27, D28).** Cách chạy: `npm test`, `npm run test:bench`, `npm run test:research`. Cả ba script đều có `--test-timeout=300000`; `--test-force-exit` chỉ bật ở `test:research` (xem `package.json`). Ngày 15/11 có 33 tiến trình mồ côi (11 bộ `test:bench` treo từ 14/11 22:53 đến 15/11 03:15) vì trước D27 không có giới hạn nào.

- **`--test-timeout=300000`:** mỗi `test()` quá 5 phút thì bị đánh đỏ. Bắt test treo không còn handle (`await` Promise không bao giờ xong). Không tự làm tiến trình thoát nếu còn handle mở.
- **`--test-force-exit`:** ép tiến trình `node --test` thoát khi test xong dù còn handle (timer, socket, tiến trình con). Bắt lỗi "test đỏ rồi mà lệnh vẫn không thoát". Chỉ bật ở `test:research` (xanh 3 lần liên tiếp). Chưa bật ở `test` (trên Windows libuv sập ngẫu nhiên ~1/3 lần chạy cả bộ: `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src/win/async.c, line 76`, còn nhiều tệp dùng `srv.close()` trần) và `test:bench` (đỏ 1 lần chưa rõ nguyên nhân; để S2 dò `e7.test.mjs`). `test/force-exit.test.ts` đọc cờ trực tiếp từ `package.json` và kiểm tra tệp treo giữ handle thì lệnh thoát mã ≠ 0 trong thời hạn.
- **`timeout-minutes` ở CI:** job `test` trong `.github/workflows/ci.yml` đặt `timeout-minutes: 20`. Công thức `max(20, ceil(thời gian dài nhất × 2))`; mức sàn 20 chi phối. Nguồn số liệu: không có số CI thật (`gh` không dùng được ở S2), chỉ có số đo cục bộ: `npm test` ≈ 103–107 giây, `test:bench` ≈ 59–62 giây, `test:research` ≈ 41–57 giây; chưa đo `npm ci`. Thời gian thật của runner Windows/Node 22 chưa biết: cần đối chiếu bằng `gh run view` rồi tăng nếu job gần 10 phút. Luật `ci-integrity` bắt buộc khóa này là số nguyên dương ≤ 120 (hằng `MAX_TIMEOUT_MIN` trong `scripts/lint/rules/ci-integrity.mjs`; test: `test/lint-ci-integrity.test.ts`).
- **Số đo test dài nhất** (D27, Windows, Node 24, một lần chạy): `npm test` ≈ 21,7 giây, `test:bench` ≈ 20,0 giây, `test:research` ≈ 4,3 giây. 300 giây ≥ 13× test dài nhất.
- **Giả định A1 đã kiểm:** `tsx --test` chuyển `--test-timeout` sang `node --test` (`test/test-timeout.test.ts`).
- **Kết quả K1 (S1):** 3 lệnh × 3 lần liên tiếp trên máy văn phòng (Node v24.14.0): `npm test` 3/3 xanh (945 pass); `test:research` 3/3 xanh (241 pass); `test:bench` lần 3 đỏ 2 test (R3 chạm `--max-turns`; 4 test `prepareItem`/`runCto` báo "không phải gốc repo git riêng"), nguyên nhân chưa rõ, chạy lại 3 lần đều xanh (294 pass). Đã đóng handle trong `after` của `web.test.ts`, `ux3.test.ts`, `ux4.test.ts`, `selfimprove-route.test.ts`; không sửa `src/`. Bàn giao S1 chưa có bảng 12 lần chạy riêng từng tệp và chưa có danh sách handle theo `tệp:dòng`: chưa ghi ở đây.
- **Kết quả dò `e7.test.mjs` (S2):** 5 lần chạy riêng, đều exit 0, 12 pass / 0 fail, 51–54 giây, không có tiến trình sót. **Không tái hiện được** việc treo (chỉ Windows, Node 24; chưa thử Node 22). Điểm yếu duy nhất tìm thấy: vòng `waitFor` không hạn ở dòng 360, nay bọc hạn 20 giây.
- **Giới hạn còn lại:**
  - Treo ở cấp tệp: timeout tính cho từng `test()`; vòng lặp hay `await` ở top-level ngoài `test()` không bị cắt (chỉ `timeout-minutes` ở CI chặn được).
  - Tiến trình cháu (`claude`, `git`…) không chắc bị kill khi tiến trình cha bị ép thoát, nhất là trên Windows; S2 không thấy tiến trình sót sau e7 nhưng chưa chứng minh cho mọi trường hợp.
  - Trên Windows, `--test-force-exit` ở `test` có thể sập libuv (`UV_HANDLE_CLOSING`, ~1/3 lần chạy cả bộ) nên chưa bật; cần đóng đúng cách các tệp dùng `srv.close()` trần trước.
  - `--test-force-exit` có thể che rò rỉ handle; vì vậy handle phải được đóng trong test (K1), đừng dựa vào cờ.
  - Lần đỏ ngẫu nhiên của `test:bench` ở S1 chưa giải thích được; cờ `--test-force-exit` đã không bật ở `test:bench` (xem trên); chỉ bật lại sau khi dò rõ nguyên nhân và xanh 3 lần liên tiếp.
- Khi một test hợp lệ cần quá 5 phút thì tăng giá trị trong `package.json` và ghi lý do ở đây, đừng bỏ cờ.

**`test-writes-repo` — phạm vi nhận diện và giới hạn còn lại (D23).** Rule phân tích văn bản, không phải trình phân tích cú pháp.

- Đã nhận: lời gọi ghi nằm trong chuỗi, template, comment hoặc **regex literal** (kể cả `/'/`, `/"/`, lớp `[...]`, ký tự thoát) thì không tính và không làm lệch trạng thái các lời gọi phía sau; `a / b / c` là phép chia (xét token đứng trước dấu `/`). Biến khai báo đúng một lần, gán từ `HERE`/`ROOT`/`__dirname`/`import.meta.dirname`/`import.meta.url` (trực tiếp, hoặc qua `path.join/resolve/dirname`, `fileURLToPath(…)`, hoặc gán thẳng từ biến đã nhiễm) bị coi là đường dẫn repo; biến gán từ `mkdtemp`/`os.tmpdir()` thì không.
- **Chưa nhận** (vẫn phải tự giữ quy ước thư mục tạm): (1) đường dẫn repo truyền qua **tham số hàm** (`function w(d) { fs.rmSync(d) }` rồi `w(HERE)`); (2) **thuộc tính đối tượng** và destructuring (`o.dir = HERE; fs.mkdirSync(o.dir)`); (3) giá trị **import từ tệp khác** (`import { repoDir } from './x.mjs'`); (4) tên biến khai báo nhiều lần trong tệp bị bỏ qua; (5) regex đứng ngay sau `)` hoặc `}` bị coi là phép chia. Các ca này có test ghi nhận trong `test/lint-test-writes-repo.test.ts`.

### 3.4. Tài liệu Nghiên cứu và đề bài

| Rule | Lỗi lặp sinh ra nó | Điều kiểm | Cách sửa khi đỏ |
|---|---|---|---|
| `research-file-line` | BRIEF-22 (C2), BRIEF-22b (C2-r): tham chiếu `tệp:dòng` sai | Tham chiếu `tệp:dòng` trong tài liệu Nghiên cứu đúng ở mốc đã ghi (`logic-map-check.mjs --strict`) | Sửa số dòng hoặc mốc trong tài liệu. |
| `research-facts` | BRIEF-22 tiêu chí 5: hai giá trị cho một số | Mỗi số chỉ một giá trị, không cụm lỗi thời, không đường dẫn máy (`consistency-check.mjs`) | Thống nhất giá trị và sửa mọi chỗ nhắc. |
| `research-token` | BRIEF-3, BRIEF-4b, BRIEF-4c: bảng token lệch khỏi script | Bảng trong `performance/token-analysis.md` trùng đầu ra script (`token-analysis.mjs --check`) | Chạy lại script và cập nhật bảng. |
| `research-scorecard` | BRIEF-22b: bảng điểm thiếu dòng agent | Bảng điểm đủ dòng và trùng đầu ra script (`scorecard.mjs --check`) | Chạy lại script và cập nhật bảng. |
| `prereg-lock` | Quy tắc đăng ký trước từ v2.0: chỉ thêm ở §9 | Khối đã khóa của `preregistration.md` không đổi; "Lịch sử bản" chỉ được thêm dòng | Hoàn tác phần đã sửa; khối mới thì khóa bằng `node scripts/lint/prereg-lock.mjs --add-new`. |
| `overclaim` | BRIEF-21, BRIEF-22b, phản biện K4 v0.7: câu vượt mức bằng chứng | Tệp kết quả không chứa mẫu trong `scripts/lint/overclaim.json` (chữ trong ngoặc kép, backtick và khối mã được bỏ qua) | Viết lại câu theo đúng mức bằng chứng. |
| `placeholders` | V4 gói 13 (T7): mục để trống "pha review điền" | Tài liệu Nghiên cứu không còn "(pha review điền)", "chưa điền", TBD, TODO và chỗ giữ tương tự | Điền nội dung hoặc bỏ mục. |
| `review-verdict` | BRIEF-22b (K4): phản biện bị cắt, hai kết luận mâu thuẫn | Tệp phản biện có đúng một dòng `**Kết luận:** Đạt\|Sửa nhỏ\|Chưa đạt` trong 40 dòng đầu và không có dấu hiệu bị cắt | Chạy lại phản biện cho đủ, giữ một kết luận. |
| `brief-lint` | BRIEF-D14 đến D16: tên vai không có trong danh sách; BRIEF-22c lần 1: vai chỉ đọc bị đòi chạy lệnh | Đề bài qua được cổng kế hoạch: có hạng mục K, đúng một vai hợp lệ mỗi K, vai không có công cụ chạy lệnh thì không bị đòi chạy lệnh (`needsCommand()` có xét phủ định "không cần chạy lệnh", "chưa được phép chạy script"; giới hạn: không hiểu phủ định kép, phủ định sau động từ, "không ai được chạy…", hay phủ định qua dấu `. ; : ,` và xuống dòng), có phạm vi, nhãn dữ liệu, ngân sách | Sửa đề bài theo thông báo. |

## 4. Ngoại lệ: `allow.json` và `baseline.json`

Có hai nơi ghi ngoại lệ. Cả hai nằm trong `scripts/lint/` và mọi diff chạm vào chúng đều phải qua review.

`allow.json` giữ ngoại lệ lâu dài. Mỗi mục gồm `rule`, `file`, `anchor` (neo chữ duy nhất trong dòng lỗi hoặc thông báo), `reason` và `by`.

`baseline.json` giữ nợ cũ đang trả. Mỗi mục gồm `rule`, `file`, `anchor` hoặc `sha256` (băm nội dung tệp), `owner` (chủ sửa), `fixIn` (gói sửa) và `by`. Số mục chỉ được giảm so với mốc (chi tiết ở 4.1). Thêm mục khi có mốc thì lint đỏ.

Cả hai tệp chỉ chứa neo chữ đã làm sạch hoặc `sha256`. Không ghi đường dẫn máy hay khóa vào đó, kể cả khóa giả đầy đủ. Mục không còn khớp lỗi nào là lỗi, nên khi nợ được trả hoặc nội dung được đổi, xóa mục tương ứng.

Ai review: khi diff chạm một trong năm tệp ngoại lệ hoặc khóa của lint-CI thì văn phòng bắt buộc gọi reviewer, và CTO phải nêu việc đó trong biên bản. Năm tệp là `scripts/lint/allow.json`, `scripts/lint/baseline.json`, `scripts/lint/overclaim.json`, `.github/workflows/` và `docs/research/preregistration.lock.json`.

### 4.1. Băm chuẩn hóa xuống dòng và kiểm "baseline chỉ được giảm"

**Băm.** Mọi chỗ băm trong `scripts/lint/` đi qua `scripts/lint/lib/hash.mjs` (`sha256Norm`): đổi `\r\n` thành `\n` rồi mới sha256 (`\r` đơn không đổi). Lý do: máy chạy văn phòng có `core.autocrlf=true` nên tệp ở cây làm việc là CRLF, còn Linux và CI ubuntu là LF. Băm byte thô cho hai mã khác nhau, nên mục `sha256` của baseline không khớp trên Linux (lỗi `machine-path` hiện ra, mục cũ báo "không còn khớp"). Áp dụng cho `run.mjs` (mục baseline), `lib/prereg.mjs` (khối đăng ký trước) và `rules/review-verdict.mjs` (thẻ `băm:`). Test: `test/lint-hash-baseline.test.ts`.

**Khóa prereg không đổi.** `splitBlocks` đã chuẩn hóa xuống dòng trước khi băm nên mã băm trong `docs/research/preregistration.lock.json` giữ nguyên; test so tệp thật (bản LF và bản CRLF) với khóa đã commit. Vì vậy khóa này không cần đường chuyển đổi.

**Baseline chỉ được giảm, theo khóa** (không còn so số mục). Mốc là ref lint nhận vào (`--base`, `LINT_BASE`, `CCODING_BASE_REF`); ở CI là base của PR hoặc commit trước lần đẩy. Mỗi mục baseline ở HEAD phải có ở mốc, so theo (`rule`, `file`, `anchor` hoặc `sha256` chuẩn hóa). Ba ca, đều có test:

1. Mốc chưa có `baseline.json`: đạt (tệp được lập lần đầu).
2. Mốc có `baseline.json`: mục HEAD không có ở mốc thì lỗi "baseline tăng"; mục giữ nguyên hoặc bị xóa thì đạt. Lỗi mới phải sửa tận gốc, không thêm mục.
3. Chuyển tiếp (đổi cách băm): mục HEAD có `sha256` mà mốc có mục cùng (`rule`, `file`) và `sha256` đó bằng băm chuẩn hóa của `git show <mốc>:<tệp>` thì đạt. Tệp đã đổi nội dung sau mốc thì không phải chuyển tiếp. Ca này cần khi mốc là `f6f5b7f2` (baseline ghi băm byte thô); `node scripts/lint/run.mjs --base f6f5b7f2` phải exit 0.

## 5. Văn phòng coi kiểm tra đỏ là hỏng (`strictChecks`)

Dự án đặt `strictChecks: true` thì mọi lệnh kiểm tra còn đỏ đều bị coi là bắt buộc phải xanh, kể cả lệnh đỏ từ mốc mà đề bài không nhắc. Hết vòng sửa mà còn đỏ thì nhiệm vụ ở trạng thái `failed`, CTO không được gọi, và biên bản ghi "Chưa nghiệm thu: còn đỏ <lệnh>" kèm đầu ra cuối của lệnh. Chi tiết nằm ở `docs/ARCHITECTURE.md`, mục "Kiểm tra đỏ là hỏng".

### 5.1. Chạy lint ngoài CCoding

Chạy tay `npm run lint` không cần biến môi trường: bộ chạy tự tìm mốc (`@{upstream}`, rồi `origin/main`). Chỉ khi nhánh không có upstream và kho không có `origin/main` thì `agent-format-cochange` đỏ (có `needsBase`, thiếu mốc là lỗi có chủ đích) kèm danh sách nguồn đã thử; khi đó đặt mốc tường minh:

```bash
LINT_BASE=$(git merge-base main HEAD) npm run lint
```

```powershell
$env:LINT_BASE = git merge-base main HEAD; npm run lint
```

Hoặc truyền `--base <ref>` cho `node scripts/lint/run.mjs`. `test/lint-runner.test.ts` khóa: có upstream ⇒ tự tìm được mốc; không có nguồn nào ⇒ exit 1; tệp vi phạm chưa track ⇒ exit 1. Kết quả mong đợi: "25 rule, 0 lỗi".

## 6. Bảo vệ nhánh GitHub

Lint trong CI chỉ báo đỏ, không tự chặn push thẳng. Chủ dự án cần bật bảo vệ nhánh `main` trên GitHub: bắt buộc PR, bắt buộc job lint và `npm run check` đạt trước khi gộp, không cho admin bỏ qua, cấm force push. Nên bật thêm secret scanning và push protection. Lý do và phạm vi nằm ở `docs/data-protection-assessment.md`.

## 7. Thêm rule mới

Rule là một tệp `scripts/lint/rules/<id>.mjs` xuất `{ id, source, needsBase, run(ctx) }`. `run` trả về danh sách `{ file, line, msg }`. Thông báo không được chép giá trị bí mật hay đường dẫn máy. Sau khi thêm, cập nhật bảng ở mục 3 sao cho mỗi rule có đúng một dòng, và viết test dưới `test/`.
