Mốc khóa đăng ký trước: `8941103` (commit gộp T-20261104-110942-567, BRIEF-16).
Script phân tích (tiền điều kiện (6)): docs/research/analysis/b14-step2.mjs, commit 4e546f47d2c17002971718492108c2dd330439b4, test 10/10 xanh

# Sổ chạy bước 2 của B-14: A/B `runtimes.claude-cli.stablePrefix`

Phân loại dữ liệu: **Nội bộ**. Sổ này ghi trước mọi lượt. Lúc ghi chưa có dòng dữ liệu nào.

| Mục | Giá trị |
|---|---|
| Đăng ký | `docs/research/preregistration.md` §9, "Đăng ký trước bước 2 của B-14" |
| Duyệt | Giám đốc duyệt lúc 12:50 ngày 4/11/2026 (`results/local-3e/RUNLOG.md`, commit `9e3c410`). Chạy local, sau E5′ |
| Tiền điều kiện (6) | Đã có, commit 4e546f47d2c17002971718492108c2dd330439b4, test 10/10 (script `docs/research/analysis/b14-step2.mjs`, BRIEF-18 K1) |
| Tiền điều kiện (7) | Bộ test lệnh ác ý cho chế độ `stablePrefix` (B-14 trường 7(c)) xanh trên commit ghim. Hiện có `test/claude-stable-prefix.test.ts` và `test/shell-policy-adversarial.test.ts`, xanh trong `npm test` 415/415 ở `8c6d2d1`. **Đã đối chiếu 8 ca (BRIEF-18 K3(b), 4/11/2026): 5/8 có test ở chế độ `stablePrefix`, thiếu 3 (heredoc, `awk 'BEGIN{system(...)}'`, `.env`). Kết luận: chưa đủ, chờ D13 K6** (bảng ở mục "Tiền điều kiện (7): đối chiếu ca lệnh ác ý" cuối tệp; chi tiết `docs/research/context/k3-open-points-2026-11-04.md` (b)). Chỉ thỏa khi D13 K6 thêm 3 ca và bộ test xanh trên commit ghim |
| Commit ghim server (9) | Ghi khi dựng, trước khối 1. Phải chứa B-14b. **Ghi chú 4/11 20:30 của người điều phối:** dự kiến ghim `0d216eb` (có D13, gồm sửa hook cho phase không phải chuỗi). Không ghim từ `203482e` trở về sau, vì commit đó đổi hành vi làn đơn khi chạy lần lượt: làn đơn không còn nâng cấp vì phạm vi rộng. Làm vậy sẽ đổi arm B7 so với dữ liệu σ đã dùng để tính N |
| Cấu hình hai nhánh | Ghi sha256 của hai `ccoding.local.json` và `diff` giữa chúng trước khối 1. Diff chỉ được khác đúng khóa `stablePrefix` |
| Lịch | ABBA theo khối 4 lượt: tắt, bật, bật, tắt, tắt, bật, bật, tắt. Mỗi lần đổi nhánh ghi giờ UTC và sha256 cấu hình |

## Tiền điều kiện (7): đối chiếu ca lệnh ác ý

Ghi 4/11/2026 (BRIEF-18 K3(b)), chỉ đọc tệp, không chạy test. Danh sách ca lấy từ `docs/research/improvement-backlog.md:281` (B-14 trường 7). Bộ stable = `test/claude-stable-prefix.test.ts` (`stablePrefix: true`, dòng 49-50). Bộ shell-policy = `test/shell-policy-adversarial.test.ts` (dòng 9: `shell: 'git-read'`, không bật `stablePrefix`). Hook: `src/tools/claude-guard.ts:91-97` (pha chỉ đọc chặn toàn bộ Bash/PowerShell), `:103` và `:112-125` (`.env`).

| # | Ca | Có test ở `stablePrefix`? | Test + dòng | Chế độ kiểm |
|--:|---|---|---|---|
| 1 | `; rm` | Có | stable: dòng 52 (`echo x; rm -rf src`), kiểm ở 54-59; shell-policy: 43-48 | `stablePrefix` + shell-policy chung |
| 2 | `$(...)` | Có | stable: dòng 52 (`$(rm -rf src)`, backtick); shell-policy: 49-51 | `stablePrefix` + shell-policy chung |
| 3 | heredoc | **Không** | shell-policy: 54-55, 84 | Chỉ shell-policy chung |
| 4 | `> tệp` | Có | stable: dòng 52 (`echo hi > a.txt`); shell-policy: 57-63 | `stablePrefix` + shell-policy chung |
| 5 | `tee` | Có | stable: dòng 52 (`\| tee a.txt`); shell-policy: 64 | `stablePrefix` + shell-policy chung |
| 6 | `sed -i` | Có | stable: dòng 52 (`sed -i s/a/b/ f.ts`); shell-policy: 65-66 | `stablePrefix` + shell-policy chung |
| 7 | `awk 'BEGIN{system(...)}'` | **Không** | shell-policy: 70-80 | Chỉ shell-policy chung |
| 8 | `.env` | **Không** | shell-policy: 87-91, 132; stable: không có (dòng 63 chỉ đọc `a.ts`) | Chỉ shell-policy chung |

**Ca thiếu giao D13 K6** (khung `hook(...)` ở stable dòng 49-50, pha chỉ đọc `plan`/`review`/`synthesize`/`accept`/`finalize`, `stablePrefix: true`):

- Ca 3: `Bash` ``cat <<'EOF' > a.txt\nx\nEOF`` và ``cat <<EOF\nx\nEOF`` → bị chặn, khớp `/chỉ đọc/`.
- Ca 7: `Bash` `awk 'BEGIN{system("rm -rf src")}'` (thêm `awk 'BEGIN{"id" | getline x; print x}'`, `awk -f prog.awk f`) → bị chặn, khớp `/chỉ đọc/`.
- Ca 8: `Bash` `cat .env`, `grep KEY app/.env.local` → bị chặn (`/chỉ đọc/` ở pha chỉ đọc; `env-file` ở `execute`). `Read` `${root}/.env`, `Grep`/`Glob` `${root}/.env.local` ở `plan` → bị chặn bởi `env-file`, thông báo khớp `/\.env/`; đối chứng `.env.example` không bị chặn.

**Kết luận (7): chưa đủ, chờ D13 K6.** 5/8 ca có test đúng chế độ, 3/8 thiếu. Thỏa khi D13 K6 thêm 3 ca trên và bộ test xanh trên commit ghim. Chi tiết: `docs/research/context/k3-open-points-2026-11-04.md`.

## Dựng trước khối 1 (5/11/2026, người điều phối)

Đầu ra nguyên văn ở `setup/b14-prerun.txt`. Kịch bản là `setup/b14-setup.ps1` và `setup/b14-run.ps1`.

| Mục | Giá trị |
|---|---|
| Commit ghim server và runner (9) | `0d216eb63c0be1ff3c085f5e1f6a5fd881d78049`, worktree `C:\Users\admin\ccoding-vs-claude\ccoding-b14`, detached, `git status` sạch. Có B-14b (`STABLE_TOOLS`, hook `stablePrefix`) và D13 (sửa hook cho phase không phải chuỗi). **Chưa có** `203482e` (luật làn mới) |
| Build | `npm ci` exit 0, `npm run build` exit 0, lúc 10:15 giờ VN |
| Server | Cổng 7427, thư mục dữ liệu `ccoding-b14\data`, thư mục làm việc `vbb14`. Không đụng 7420, 7425, 7426 |
| Cấu hình nhánh tắt | `b14-off.json` (chép từ `ccoding-e5f`, chỉ đổi cổng sang 7427), sha256 `4bc56eafa042a8eb52a26e257af23d0e1d4beef45800d4e73e4856a57739cff0` |
| Cấu hình nhánh bật | `b14-on.json`, sha256 `3899ac695583ba72409bc1a40be50cef11d9f996faa34101b702f96949a56798` |
| Diff hai cấu hình | Chỉ thêm `"stablePrefix": true` vào `runtimes.claude-cli`, kèm dấu phẩy của dòng trước (đã so bằng JSON sắp khóa) |
| Tiền điều kiện (7) | `npx tsx --test test/claude-stable-prefix.test.ts test/claude-stable-prefix-adversarial.test.ts test/shell-policy-adversarial.test.ts` trên commit ghim: **23/23 đạt**, exit 0 (`setup/adv-tests.log`). Có 3 ca D13 K6 thêm vào (heredoc, `awk 'BEGIN{system(...)}'`, `.env`). **Đã thỏa** |
| Tiền điều kiện (6) | Script `docs/research/analysis/b14-step2.mjs`, blob `ae5afb9effbbea0f220ddad39cb8860b95df3bf9`, commit cuối `4e546f4` |
| Claude Code CLI | `2.1.318`, ghim bằng `DISABLE_AUTOUPDATER=1`. Kịch bản dừng nếu CLI đổi giữa các khối (9) |
| Chạy | `b14-run.ps1` chờ dòng "E5F XONG 10 luot moi o" trong `runlog-3e.txt`. Mỗi khối: chép cấu hình, khởi động lại server, ghi giờ UTC, sha256 và CLI vào `ops\b14-run.txt`. Sau mỗi khối kiểm `leak` của nhánh bật (dừng an toàn (7)) |

## Sự cố trước khối 1 (5/11/2026 10:16–10:18 giờ VN)

- **Diễn biến:**
  - Bản đầu của `b14-run.ps1` lỗi cú pháp và thoát ngay.
  - Bản sửa thì **không chờ E5′**. Điều kiện chờ tìm chuỗi `E5F XONG` (không phân biệt hoa thường) trong `runlog-3e.txt`, mà chính dòng log đầu của kịch bản lại ghi "B14 cho E5F xong" vào tệp đó.
  - Vì vậy khối 1 (nhánh tắt) bắt đầu lúc **10:16:18**, trong khi E5′ r2 đang chạy.
- **Xử lý:**
  - Người điều phối thấy ngay và dừng runner, server 7427 cùng tiến trình `claude` của B-14, khoảng 10:17–10:18.
  - Lượt chạy dở **chưa ghi dòng nào** vào `runs.jsonl`. Thư mục `b14-step2/off` đã xóa (chỉ có `config.json`).
- **Sửa:**
  - Dòng log đổi thành "doi E5-phay ket thuc".
  - Điều kiện chờ thành regex phân biệt hoa thường `^\S+ E5F XONG 10 luot moi o`.
  - Đã kiểm hai điều: điều kiện trả `False` khi E5′ chưa xong, và kịch bản đang chờ (pid 44828).
- **Ảnh hưởng:**
  - B-14: không có dữ liệu nào bị ảnh hưởng.
  - E5′ r2: chạy chồng khoảng 1–2 phút với một phiên `claude` của B-14 (tranh hạn mức và CPU). Ghi ở `b15f-main/RUNLOG.md`.
