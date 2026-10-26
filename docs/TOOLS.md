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

## Ai được dùng gì

Quyền = giao của (1) `tools:` trong hồ sơ agent, (2) quyền của dự án, (3) pha:

| Pha | Công cụ |
|---|---|
| Định tuyến, họp | không có |
| Lập kế hoạch, chốt, tổng hợp | chỉ đọc (`list_files`, `read_file`, `search`) |
| Review | đọc + `run_command` (chạy test để xác nhận) |
| Thực thi, sửa theo review | theo quyền dự án |

Quyền dự án (`toolAccess`): `none` · `read` · `write` (đọc/ghi file) · `exec` (đọc/ghi + chạy lệnh). Mặc định: dự án → `tools.projectAccess` (`exec`); nhiệm vụ không thuộc dự án → `tools.defaultAccess` (`write`, trong `workspaces/<task>`).

Số lượt công cụ tối đa theo pha: `phases.toolTurns` (thực thi 40, sửa 25, review 14, lập kế hoạch 12). Hết lượt ⇒ model được yêu cầu viết báo cáo cuối ngay.

## Cách ly bằng git worktree

Dự án có `workspace` là repo git và `isolation: "worktree"` (mặc định): mỗi nhiệm vụ có worktree riêng `workspaces/<dự án>/wt-<task>` trên nhánh `ccoding/<task>` tạo từ HEAD hiện tại. Agent chỉ sửa trong worktree; nhánh đang làm việc của bạn không bị đụng tới. Các file chưa track cần để chạy (mặc định `.env`, `.env.local`, `.env.development`, `.env.test`…) được **chép** sang worktree (agent không đọc được nội dung). Xong nhiệm vụ, CCoding commit thay đổi trên nhánh đó (không push) và ghi vào báo cáo cách xem/gộp:

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
