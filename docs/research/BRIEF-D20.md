# Phòng Dev, gói D20: đưa các lỗi lặp lại vào lint chạy trong CI, đỏ là hỏng

**Gói lớn: 7 hạng mục. Ngân sách 14M token.** Giao 14/11/2026.

**Căn cứ:**
- Chủ dự án, 14/11 23:17: "các lỗi vẫn lặp lại dù ghi vào agent.md … đẩy các kiểm lỗi này vào lint rule trong CI, cứ fail lỗi là hỏng luôn".
- Biên bản nghiệm thu của CTO trên văn phòng phụ (14 nhiệm vụ, 12–14/11). Các lỗi lặp lại dù hồ sơ agent và đề bài đã dặn:

| Lỗi lặp | Gặp ở | Rule trong gói này |
|---|---|---|
| Tham chiếu `tệp:dòng` sai | BRIEF-22 (C2: 12/34), BRIEF-22b (C2-r: 14/24) | `research-file-line` |
| Còn đường dẫn máy trong tài liệu | BRIEF-21 tiêu chí 8 (báo đã xử lý mà vẫn còn) | `machine-path` |
| Hai giá trị cho một số; CHANGELOG ghi "không đổi số" | BRIEF-22 tiêu chí 5 | `research-facts` |
| Tệp chèn chưa gộp, bản nháp để lại | BRIEF-22 (C1), D18a (`DRAFT-paused.md`) | `stray-files` |
| Mục để trống trong bản phản biện | V4 gói 13 (T7: "pha review điền") | `placeholders` |
| Phản biện bị cắt, hai kết luận mâu thuẫn | BRIEF-22b (K4) | `review-verdict` |
| Câu vượt mức bằng chứng | BRIEF-21, BRIEF-22b ("không tốn thêm token") | `overclaim` |
| Sửa ngoài §9 của đăng ký trước | quy tắc từ v2.0, nhắc ở mọi đề bài | `prereg-lock` |
| Rule mới chỉ nối một đường chạy lệnh | D16 (`run_command` chưa nối) | `exec-boundary` |
| Số test bị bỏ qua lệch, không ai giải thích | D18a, D18c | `skip-registry` |
| Lệnh `node --test <thư mục>/` hỏng trên Windows | BRIEF-22c K3 | `test-glob` |
| Test nghiên cứu không lệnh nào chạy | lệnh kiểm tra dự án Nghiên cứu thiếu `analysis/*.test.mjs` | `orphan-tests` |
| Tên vai trong đề bài không có trong danh sách agent | BRIEF-D14 đến D16 | `brief-lint` |
| Tên chủ dự án trong bài báo | quyết định 14/11 mục 2; `paper.md` vẫn còn | `paper-anonymity` |

**Nguyên tắc:**
- Lint **không có mức cảnh báo**. Có lỗi thì exit 1. Không có biến môi trường hay cờ nào để bỏ qua.
- Ngoại lệ chỉ qua hai tệp được review:
  - `scripts/lint/allow.json`: ngoại lệ lâu dài. Mỗi mục gồm rule, tệp, neo chữ duy nhất, lý do.
  - `scripts/lint/baseline.json`: nợ cũ đang trả. Mỗi mục gồm rule, tệp, neo hoặc sha256, chủ sửa, gói sửa. Chỉ được **giảm** so với mốc.
  - Mục không còn khớp gì là lỗi (ngoại lệ cũ phải xóa).
- Rule dùng đúng mã đang chạy, không chép lại. Vd. `brief-lint` gọi `briefItems()` của `src/plan-gate.ts`.
- Lint chạy được trên Windows và Linux, Node 22 và 24, không cần mạng, không thêm phụ thuộc.

**Phạm vi:**
- **Được sửa:** `scripts/lint/` (mới), `.github/workflows/`, `package.json` (chỉ `scripts`), `tsconfig*.json`, `src/`, `test/`, `docs/` (trừ `docs/research/`), `agents/*/*.md` (chỉ thêm dòng trỏ tới lint), `AGENTS.md`.
- Trong `docs/research/` chỉ được: thêm `preregistration.lock.json`; xóa tệp mà `stray-files` bắt; bỏ chữ "(Tom)" ở `paper/paper.md`; sửa tiêu đề "(pha review điền)" ở `context/v43f-review-2026-11-12.md`. Lỗi nội dung khác ở `docs/research/` thì ghi vào `baseline.json` với chủ sửa là Phòng Nghiên cứu. **Không sửa `docs/research/scripts/`** (BRIEF-22c đang sửa), chỉ gọi.
- Không sửa `bench/vs-claude/results/`. Không chạy benchmark, không gọi `claude -p` thật. Không cài phần mềm.
- Dữ liệu: **Nội bộ**. Repo công khai: không ghi đường dẫn máy, khóa hay dữ liệu từng nhiệm vụ.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề. K1–K6 làm song song theo giao kèo rule dưới đây. K7 chạy sau cùng.

**Giao kèo rule** (K1 dựng, các hạng mục khác viết rule theo đúng mẫu này):

```js
// scripts/lint/rules/<id>.mjs
export default {
  id: 'machine-path',                  // kebab-case, duy nhất
  source: 'BRIEF-21 tiêu chí 8',       // lỗi lặp nào sinh ra rule
  needsBase: false,                    // true nếu so với mốc git
  async run(ctx) { return [{ file: 'docs/x.md', line: 12, msg: 'đường dẫn máy …' }]; },
};
// ctx: { root, files (git ls-files, dấu /), read(file), base (ref hoặc null), git(args) }
```

## Hạng mục

**K1 — senior-swe: bộ chạy lint và các rule từ `AGENTS.md`**
- **Bộ chạy `scripts/lint/run.mjs`:**
  - nạp mọi tệp trong `rules/`;
  - áp `allow.json` và `baseline.json`;
  - in theo rule (`tệp:dòng — lỗi`), tổng số, exit 1 nếu có lỗi;
  - tùy chọn `--rule <id>`, `--json`, `--base <ref>`.
  - Mốc lấy theo thứ tự: `--base`, biến `LINT_BASE`, biến `CCODING_BASE_REF`. Không có mốc thì rule `needsBase` **lỗi** (không bỏ qua), trừ khi chạy `--rule` một rule không cần mốc.
  - `npm run lint` gọi bộ chạy.
- **Rule từ `AGENTS.md`:**
  - `deps-allowlist`: `dependencies` trong `package.json` chỉ gồm `yaml`.
  - `llm-boundary`: chỉ các module trong danh sách được import `src/runtimes/*`. Danh sách lấy từ hiện trạng, mỗi mục một lý do.
  - `exec-boundary`: chỉ các module trong danh sách được import `child_process`. Mỗi module phải dùng hàm kiểm lệnh mà danh sách ghi cho nó; xác minh `run_command` đã nối sau D16.
  - `log-boundary`: ghi nối tệp (`appendFile*`, `createWriteStream`) trong `src/` chỉ ở module trong danh sách.
  - `public-no-cdn`: `public/` không nạp script hay stylesheet từ `http(s)://`.
  - `agent-format-cochange` (cần mốc): `src/registry.ts` đổi so với mốc thì `docs/AGENTS-GUIDE.md` và `test/registry.test.ts` cũng phải đổi.
- **Test cũng được kiểm kiểu:**
  - thêm `tsconfig.test.json` (`noEmit`, gồm `test/**/*.ts`);
  - `npm run typecheck` chạy cả hai cấu hình;
  - sửa hết lỗi kiểu hiện có trong `test/` (khoảng 30), không dùng `any` hay `@ts-ignore` để lách.
- Test cho bộ chạy: ngoại lệ cũ không khớp ⇒ exit 1; `baseline.json` tăng so với mốc ⇒ exit 1; thiếu mốc ⇒ exit 1.

**K2 — @devops: CI và các rule về test**
- **`package.json`:**
  - `test:research` chạy mọi test trong `docs/research/**` và `bench/vs-claude/harness/`, dạng glob có ngoặc kép.
  - `check` chạy lần lượt `typecheck`, `lint`, `test`, `test:bench`, `test:research`.
- **`.github/workflows/ci.yml`:**
  - chạy khi push lên **mọi nhánh** và khi có PR;
  - ma trận ubuntu/windows × Node 22/24, chạy đủ năm bước trên;
  - truyền mốc cho lint: PR lấy nhánh đích; push lấy `github.event.before`, nhánh mới lấy merge-base với `main`;
  - bước cuối: `git status --porcelain` rỗng, nếu không thì fail;
  - không `continue-on-error`, không `|| true`.
- **Rule:**
  - `no-only`: không có `.only` hay `only: true`.
  - `skip-registry`: mọi chỗ bỏ qua test có lý do, và khớp `test/skips.json` (tệp, tên test, điều kiện, lý do). Có `docs/diagnostics/skipped-tests.md` (từ D18d) thì mọi mục phải được nhắc ở đó.
  - `orphan-tests`: mọi tệp `*.test.{ts,mjs,js}` đã track (trừ bài mẫu trong `bench/vs-claude/tasks/` và `results/`) phải khớp glob của một script test.
  - `test-glob`: không có `node --test <thư mục>/` trong `package.json`, `ci.yml`, `docs/**/*.md`, `README.md`.
  - `ci-integrity`: `ci.yml` có đủ năm bước và bước sạch cây; trigger gồm mọi nhánh; không có `continue-on-error`, `|| true`, `if: false`.
  - `stray-files`: không track `*-insert.md`, `DRAFT-*`, `*.orig`, `*.rej`, `*.bak`, `*~`; không có `FINAL.md`, `ACCEPTANCE.md` ngoài danh sách cho phép.

**K3 — @security: bí mật, đường dẫn máy, ẩn danh**
- `secrets`: mọi tệp chữ đã track. Mẫu gồm khóa Anthropic, token GitHub, khóa AWS, khối khóa riêng, và `CCODING_LOG_HMAC_KEY=` có giá trị. Khóa giả trong test đưa vào `allow.json` theo neo.
- `machine-path`: mọi tệp chữ đã track.
  - Bắt ổ đĩa kèm `Users` và tên người dùng cụ thể; `/home/<tên>/`; `/Users/<tên>/`; đường dẫn tạm của máy cloud.
  - Chỗ giữ chỗ (`<bạn>`, `...`, `…`, `x`) không tính.
  - Tệp hiện có trong `bench/vs-claude/results/` và tệp đầu ra thô đã ghi ngoại lệ ở `docs/research/CHANGELOG.md` gói 15 vào `baseline.json` theo sha256. Tệp sửa hoặc thêm mới thì bị kiểm.
- `paper-anonymity`: `docs/research/paper/**` không có tên riêng của chủ dự án (danh sách tên trong cấu hình rule; bài dùng vai).
- Cập nhật `docs/data-protection-assessment.md`: lint là kiểm soát phòng ngừa (PRE) và phát hiện (DET) cho repo công khai. Ghi phạm vi, điều không bắt được, và việc thật sự chặn merge cần chủ dự án bật bảo vệ nhánh trên GitHub.

**K4 — data-engineer: rule cho tài liệu Nghiên cứu và đề bài**
- **Gọi script có sẵn** (không sửa script):
  - `research-file-line`: `logic-map-check.mjs --strict`;
  - `research-facts`: `consistency-check.mjs`;
  - `research-token`: `token-analysis.mjs --check …`;
  - `research-scorecard`: `scorecard.mjs --check`.
  - Script exit khác 0 thì rule lỗi, kèm dòng cuối đầu ra.
- `prereg-lock`:
  - `docs/research/preregistration.lock.json` giữ sha256 của từng khối tiêu đề hiện có;
  - khối đã khóa đổi hoặc mất ⇒ lỗi;
  - khối mới chỉ được thêm trong §9, và phải được thêm vào tệp khóa bằng `--add-new`. Lệnh này chỉ thêm, không ghi đè mã băm cũ;
  - "Lịch sử bản" chỉ được thêm dòng.
- `overclaim`:
  - danh sách mẫu câu cấm trong `scripts/lint/overclaim.json` (mẫu, lý do, nguồn). Khởi đầu bằng các câu cấm đã ghi ở BRIEF-21, BRIEF-22b và phản biện K4 của v0.7;
  - áp cho tệp kết quả: `paper/**`, `analysis/**/report.md`, `improvement-backlog.md`, `bench/vs-claude/results/*/report.md`;
  - bỏ qua chữ trong ngoặc kép hay backtick (trích dẫn để phê bình).
- `placeholders`: `docs/research/**/*.md` không có "(pha review điền)", "chưa điền", `TBD`, `TODO`, `<điền`, `XX %`.
- `review-verdict`: tệp phản biện (`docs/research/**/*review*.md`) có đúng **một** dòng `**Kết luận:** Đạt|Sửa nhỏ|Chưa đạt` trong 40 dòng đầu, và không có dấu hiệu bị cắt ("hết lượt công cụ"). Tệp cũ vào `baseline.json`.
- `brief-lint`, cho `docs/research/BRIEF-*.md` mới. Đề bài cũ là bản ghi lịch sử, giữ nguyên văn, vào `allow.json`.
  - Có ít nhất một hạng mục K theo `briefItems()`.
  - Mỗi K ghi đúng một vai có trong `agents/<phòng>/` của phòng ghi ở tiêu đề. Vai phải được `briefItems()` nhận ra; vai một từ (vd. `devops`) chỉ được nhận khi viết `@devops`, nên K không nhận ra vai là lỗi.
  - Có `**Phạm vi:**`, dòng "Dữ liệu:" với một nhãn (Công khai, Nội bộ, Bảo mật, Hạn chế), và dòng ngân sách.

**K5 — backend-dev: văn phòng coi kiểm tra đỏ là hỏng**
- **Tùy chọn dự án `strictChecks: true`:**
  - mọi lệnh kiểm tra đỏ ở lần cuối đều chặn, kể cả khi đã đỏ từ mốc (`red-unrelated` thành `red-required` trong `classifyChecks`);
  - hết vòng sửa mà còn đỏ thì nhiệm vụ không được `done` và không gọi CTO nghiệm thu. Ghi biên bản "Chưa nghiệm thu: còn đỏ <lệnh>" kèm đầu ra cuối của lệnh.
- Khi chạy lệnh kiểm tra, đặt biến `CCODING_BASE_REF` bằng mốc của nhiệm vụ.
- Diff chạm `scripts/lint/allow.json`, `baseline.json`, `overclaim.json`, `.github/workflows/` hoặc `preregistration.lock.json` ⇒ bắt buộc reviewer, và CTO phải nêu thay đổi này trong biên bản.
- Ghi vào `docs/ARCHITECTURE.md`. Test bằng runtime giả: đỏ từ mốc, `strictChecks` bật ⇒ không `done`; tắt ⇒ hành vi cũ.

**K6 — tech-writer: một nguồn cho luật**
- `docs/LINT.md`: bảng rule → lỗi lặp sinh ra nó → điều kiểm → cách sửa khi đỏ → cách thêm ngoại lệ (và ai review).
- `AGENTS.md` mục "Kiểm tra trước khi commit": thay bằng `npm run check`.
- Thêm một dòng vào `agents/dev/dev-lead.md`, `agents/dev/qa-tester.md`, `agents/research/research-lead.md`, `agents/research/peer-reviewer.md`: "Chạy `npm run lint` trước khi báo xong; lint đỏ là chưa xong (xem `docs/LINT.md`)." Không xóa quy tắc cũ trong hồ sơ.

**K7 — qa-tester: review và thử sức bắt lỗi**
- Kết luận theo mẫu JSON.
- **Với từng rule:** tạo một vi phạm mẫu (tệp tạm hoặc bản sao), chạy `npm run lint`, ghi exit code. Mọi rule phải ra 1. Ghi bảng rule → vi phạm → exit.
- Thử thêm một mục vào `baseline.json` ⇒ exit 1 khi có mốc. Thử xóa nội dung mà ngoại lệ trỏ tới ⇒ exit 1.
- 🧪 `npm run check` phải xanh, **trừ** `research-file-line` nếu nó đỏ chỉ vì các tham chiếu BRIEF-22c đang sửa. Khi đó ghi số lỗi; người điều phối gộp D20 sau BRIEF-22c.
- `git status` sạch.
