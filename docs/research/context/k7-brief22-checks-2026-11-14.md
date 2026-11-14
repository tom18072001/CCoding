# K7a — Nhật ký lệnh kiểm tra gói BRIEF-22 (14/11/2026)

Phân loại dữ liệu: Nội bộ. Chạy trên nhánh `ccoding/t-20261114-162216-35d--k7a`, HEAD `bb91a27e`. Không sửa nội dung lập luận; chỉ hai lỗi máy móc (mục 3).

## 1. Kết quả lệnh

| # | Lệnh | Lần chạy đầu | Sau sửa |
|---|---|---|---|
| 1 | `node docs/research/scripts/consistency-check.mjs` | exit 1 — `docs/research/paper/paper.md:831 — c1c8-single-labeller — cụm lỗi thời`; "1 lỗi (c1c8-single-labeller=1) trong 59 tệp." | exit 0 — "Đạt: 59 tệp, không lệch số liệu." |
| 2 | `node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md` | exit 0 — "OK: 12 bảng trong docs/research/performance/token-analysis.md trùng đầu ra script." | không đổi |
| 3 | `node --test bench/vs-claude/harness/stats.test.mjs` | exit 0 — tests 12, pass 12, fail 0 | không đổi |
| 4 | `node docs/research/analysis/decisions/scorecard.mjs --check` | exit 1 — 18 dòng "thiếu khối …", "Lỗi: 18 vấn đề" | exit 0 — "OK: đủ 14/14 agent của kpi-office.json; 18 khối bảng trong scorecard.md và effectiveness.md trùng đầu ra script; 358 khóa brief22.*" |

## 2. Kiểm khác

- **preregistration.md:** `git diff faf514f8 HEAD -- docs/research/preregistration.md` (faf514f8 = commit cuối trước gói này) cho 62 dòng `+`, 0 dòng `-`, 1 tệp. Chỉ thêm. (So với `main` không dùng được vì `main` chưa có tệp này; diff ra 1336 dòng `+`.) Chưa đối chiếu bằng máy rằng khối thêm nằm trong §9; không thuộc phạm vi K7a, để K7 xem.
- **Đường dẫn máy:** tìm `C:\Users`, `/home/`, `/Users/` trong `paper/paper.md`, `facts.json`, `CHANGELOG.md`, `analysis/decisions/*`, `context/decomposition-*`, `improvement-backlog.md`, `run-plan.md`, `BRIEF-22.md` → 0 kết quả. Lệnh grep trực tiếp qua shell bị hook chặn, nên dùng công cụ Grep.
- **Tên dự án thật:** **chưa kiểm được.** K7a không có danh sách tên thật để tìm, và không được đọc dữ liệu vận hành. K7 hoặc người điều phối cần cung cấp danh sách từ khóa nếu muốn kiểm.
- **Khóa `brief22.*`:** `facts.json` (khóa gốc `brief22`) so với khối `facts` của `scorecard.md` và `effectiveness.md`: 358 khóa ở mỗi bên, thiếu 0, thừa 0, lệch giá trị 0 (chuẩn hóa dấu phẩy thập phân → dấu chấm). Mục `_note` không tính. Đối chiếu bằng script ad hoc chạy một lần, không lưu vào repo.
- **`git status` cuối:** chỉ có hai tệp sửa (mục 3) và tệp nhật ký này.

## 3. Lỗi máy móc đã sửa

1. **`docs/research/analysis/decisions/scorecard.mjs:21`** — `readText` không xử lý CRLF. Tệp `.md` trong worktree có CRLF (`core.autocrlf=true`), nên regex khối `<!-- BEGIN:… -->\n…` không khớp và `--check` báo thiếu cả 18 khối. Thêm `.replace(/\r\n/g, '\n')`. Hành vi `--write` không đổi về nội dung.
2. **`docs/research/facts.json:88-90`** — ngoại lệ `c1c8-single-labeller` còn trỏ dòng 667. Câu trích dẫn cũ nay ở `paper.md:831` vì K5 chèn §4.4 và §6.5. Đổi thành 831 và nối chuỗi dời dòng vào `reason`. Câu trong bài vẫn là trích dẫn để ghi nhận đã sửa, không phải khẳng định.

## 4. Lỗi còn lại

- Không có lệnh nào còn đỏ.
- **Việc chưa làm, ngoài phạm vi K7a:** K6 báo `improvement-backlog.md` và `run-plan.md` chỉ có phần chèn ở `backlog-b20-insert.md` và `run-plan-s10-insert.md`; git cho thấy hai tệp đích có đổi so với `faf514f8`, nhưng K7a không kiểm phần đó có khớp danh sách FX/TN hay không. K7 cần xem.
- Ngoại lệ dòng trong `facts.json` sẽ lệch lại nếu `paper.md` đổi tiếp trước dòng 831.
