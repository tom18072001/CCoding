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

Quyền dự án (`toolAccess`): `none` · `read` · `write` (đọc/ghi file) · `exec` (đọc/ghi + chạy lệnh). Mặc định: dự án → `tools.projectAccess` (`exec`); nhiệm vụ không thuộc dự án → `tools.defaultAccess` (`write`): **thư mục làm việc riêng** `workspaces/<task>` (không phải repo) để kiểm kê tài liệu đầu vào và **lưu sản phẩm thành tệp** (bảng/CSV số liệu, danh mục nguồn, giao thức…), không chạy lệnh. Tệp agent tạo được liệt kê trong báo cáo nhiệm vụ.

**Chạy lệnh lần lượt**: repo dự án quyền `exec` dùng chung một worktree giữa các hạng mục ⇒ hạng mục của agent có quyền chạy lệnh (cài dependency, test, migration, git) làm **lần lượt**; hạng mục chỉ viết tài liệu (kiến trúc, BA…) vẫn song song. Tắt bằng `tools.serializeWriters: false`.

**Review dựa trên bằng chứng**: reviewer có quyền chạy lệnh phải chạy test/typecheck liên quan và ghi `checks` (lệnh + exit code); lệnh thật sự chạy qua công cụ được ghi kèm kết luận, review không chạy lệnh nào bị gắn cờ "chưa có bằng chứng chạy thật" (log `review.unverified`).

Giới hạn theo pha (mỗi lượt công cụ gửi lại toàn bộ hội thoại, nên chi phí tăng theo số lượt):
- `phases.toolTurns` — số lượt tối đa: thực thi 40, sửa 16, review 10, lập kế hoạch 8, tổng hợp 4, chốt 4.
- `phases.toolInputBudget` — trần token đầu vào cộng dồn của cả vòng lặp trong một lượt gọi: thực thi 800k, sửa 300k, review 200k, lập kế hoạch 100k, tổng hợp 60k, chốt 50k (nâng sau lượt chạy ND57: 400k chỉ đủ ~13 lượt trên repo cỡ vừa vì mỗi lượt gửi lại ~30k token lịch sử).
- `tools.maxReadChars` (30.000) — hạn mức ký tự riêng của `read_file`, lớn hơn đầu ra lệnh (`maxOutputChars` 12.000) để đọc trọn schema/file nguồn cỡ vừa một lần thay vì từng đoạn.
- `phases.maxContinuations` (mặc định 2) — hạng mục thực thi chạm trần lượt/token **khi chưa xong** không bị coi là xong: model phải mở đầu câu trả lời bằng `TRẠNG THÁI: XONG` hoặc `TRẠNG THÁI: CHƯA XONG — …`; nếu chưa xong (hoặc thiếu dòng trạng thái), CCoding cho **chạy tiếp với ngữ cảnh mới** (bàn giao dở dang + `git diff --stat` của worktree, không mang lịch sử công cụ cũ nên không tốn token lặp lại). Hết số lần chạy tiếp mà vẫn chưa xong → hạng mục `failed`, hạng mục phụ thuộc bị bỏ qua (không chạy trên nền dang dở), có cảnh báo `subtask.incomplete`. Nhiệm vụ còn hạng mục lỗi/bỏ qua kết thúc ở trạng thái **lỗi** (không báo "Hoàn thành"); bấm **Tiếp tục** thì hạng mục dừng giữa chừng làm tiếp từ bàn giao dở dang + thay đổi đã có trong worktree, không làm lại từ đầu.
- Chống "khảo sát mãi không ghi" (pha thực thi/sửa có quyền ghi): đã dùng ~35% rồi ~65% lượt hoặc trần token mà chưa ghi tệp nào thì CCoding chèn lời nhắc dừng khảo sát và ghi ngay; `read_file` trùng tham số khi nội dung cũ còn nguyên trong lịch sử (chưa bị rút gọn, chưa ghi gì từ đó) chỉ trả ghi chú "đã đọc ở lượt N" thay vì gửi lại cả file. Lập kế hoạch cho repo có tệp nguồn lớn: mỗi hạng mục phải xong trong một lượt (~30 thao tác) — tách theo nhóm endpoint/màn hình.
- `read_file` tự dừng ở ranh giới dòng khi chạm `maxOutputChars` và ghi `offset=` để đọc tiếp (trước đây phần giữa file bị cắt khiến agent đọc lại mãi cùng một đoạn); các file chưa đọc kịp trong lần gọi được liệt kê để đọc ở lượt sau.

Chạm một trong hai ⇒ model được yêu cầu viết báo cáo cuối ngay (log `call.diag`). Kết quả công cụ cũ được rút gọn (giữ nguyên 4 kết quả gần nhất), nội dung file đã ghi trong lịch sử cũng được rút gọn.

## Cách ly bằng git worktree

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
