# Lint của CCoding: luật chạy trong CI, đỏ là hỏng

Tài liệu này là nguồn duy nhất cho các luật mà `scripts/lint/` kiểm. Nó dành cho người và agent sửa mã hoặc tài liệu của repo. Mỗi luật sinh ra từ một lỗi đã lặp lại dù hồ sơ agent hay đề bài đã dặn. Vì vậy luật nằm trong lint và CI chặn, không chỉ nằm trong lời nhắc.

## 1. Nguyên tắc

Lint không có mức cảnh báo. Có một lỗi thì lệnh thoát với mã 1. Không có biến môi trường hay cờ nào để bỏ qua một rule.

Cách duy nhất để một vi phạm được chấp nhận là ghi nó vào một trong hai tệp được review (mục 4). Mục ghi vào mà không còn khớp lỗi nào cũng là lỗi, nên ngoại lệ cũ phải được xóa.

Rule dùng đúng mã đang chạy thay vì chép lại. Ví dụ `brief-lint` gọi `briefItems()` và `NEEDS_CMD_RE` của `src/plan-gate.ts`. Lint chạy trên Windows và Linux, Node 22 và 24, không cần mạng, không thêm phụ thuộc.

## 2. Cách dùng

Mục này liệt kê lệnh chạy lint ở máy của bạn và trong CI.

| Lệnh | Tác dụng |
|---|---|
| `npm run lint` | Chạy mọi rule. |
| `npm run check` | Chạy `typecheck`, `lint`, `test`, `test:bench`, `test:research` nối nhau. Đây là lệnh phải xanh trước khi commit. |
| `npm run lint -- --rule <id>[,<id>]` | Chỉ chạy các rule nêu tên. |
| `npm run lint -- --json` | In kết quả dạng JSON (`ok`, `total`, `errors`). |
| `npm run lint -- --base <ref>` | Đặt mốc git cho rule cần so với mốc và cho kiểm "baseline chỉ giảm". |

Mốc lấy theo thứ tự: `--base`, biến `LINT_BASE`, biến `CCODING_BASE_REF`. Không có mốc thì rule cần mốc báo lỗi, không bị bỏ qua. Chạy `--rule` với một rule không cần mốc thì không đòi mốc. Mốc không phân giải được thành commit cũng là lỗi.

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
| `ci-integrity` | D20: CI không được làm đỏ thành xanh | `ci.yml` còn nguyên: mọi nhánh và PR, ma trận 2 hệ điều hành × Node 22/24, đủ bước, bước sạch cây ở cuối, không `continue-on-error`, `\|\| true`, `if: false` | Khôi phục workflow. |
| `stray-files` | BRIEF-22 (C1), D18a: tệp chèn chưa gộp, bản nháp để lại | Không track `*-insert.md`, `DRAFT-*`, `*.orig`, `*.rej`, `*.bak`, `*~`; `FINAL.md` và `ACCEPTANCE.md` chỉ khi được liệt kê | Xóa tệp, hoặc gộp nội dung vào đúng chỗ. |

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
| `brief-lint` | BRIEF-D14 đến D16: tên vai không có trong danh sách; BRIEF-22c lần 1: vai chỉ đọc bị đòi chạy lệnh | Đề bài qua được cổng kế hoạch: có hạng mục K, đúng một vai hợp lệ mỗi K, vai không có công cụ chạy lệnh thì không bị đòi chạy lệnh, có phạm vi, nhãn dữ liệu, ngân sách | Sửa đề bài theo thông báo. |

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

## 6. Bảo vệ nhánh GitHub

Lint trong CI chỉ báo đỏ, không tự chặn push thẳng. Chủ dự án cần bật bảo vệ nhánh `main` trên GitHub: bắt buộc PR, bắt buộc job lint và `npm run check` đạt trước khi gộp, không cho admin bỏ qua, cấm force push. Nên bật thêm secret scanning và push protection. Lý do và phạm vi nằm ở `docs/data-protection-assessment.md`.

## 7. Thêm rule mới

Rule là một tệp `scripts/lint/rules/<id>.mjs` xuất `{ id, source, needsBase, run(ctx) }`. `run` trả về danh sách `{ file, line, msg }`. Thông báo không được chép giá trị bí mật hay đường dẫn máy. Sau khi thêm, cập nhật bảng ở mục 3 sao cho mỗi rule có đúng một dòng, và viết test dưới `test/`.
