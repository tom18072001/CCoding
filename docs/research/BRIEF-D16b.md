# Phòng Dev, gói D16b: đóng các tiêu chí CTO chưa nghiệm thu của D16

**Gói vừa: 4 hạng mục + review. Ngân sách 8M token.** Giao 14/11/2026, chạy sau D17.

**Căn cứ:** biên bản nghiệm thu của CTO cho D16 (14/11), chưa nghiệm thu. D16 đã được gộp vào `perf/vs-claude-loop`; typecheck và `npm test` xanh.
- **Được sửa:** `src/`, `test/`, `docs/` (trừ `docs/research/`).
- **Không sửa:** `bench/`, `docs/research/`.
- Không chạy benchmark, không gọi `claude -p` thật.
- Phân loại dữ liệu: **Nội bộ**.
- Tên agent dùng trong gói này là id thật trong roster của phòng Dev: `backend-dev`, `security`, `qa-tester` (vai reviewer).

## Hạng mục

**K1 — backend-dev: nối rule `outside-root-write` vào đường chạy lệnh `run_command`**
- Hiện rule chỉ áp qua hook của `claude-cli` (`src/tools/claude-guard.ts`); công cụ `run_command` trong `src/tools/workspace.ts` chưa áp. Đây là đường ghi ra ngoài còn mở, CTO xếp mức **cao**.
- Hai đường phải cho cùng quyết định trên cùng lệnh.
- Test chạy một bảng lệnh qua **cả hai** đường; mọi ca cũ của hai đường vẫn đúng.

**K2 — backend-dev: review chạm trần lượt mà chưa ra kết luận thì phải lấy được kết luận**
- **Ca thật (D16):** reviewer dùng 12 lượt công cụ để thử lệnh như đề bài yêu cầu, rồi dừng ở câu mở đầu, không có JSON kết luận. CCoding ghi "Không đọc được kết luận review dạng JSON — chưa coi là đã duyệt" và đi tiếp tới nghiệm thu mà không review lại.
- **Kỳ vọng:**
  - review không đọc được kết luận và lượt gọi chạm trần ⇒ một lượt tiếp nối chỉ để trả kết luận theo mẫu JSON, dựa trên những gì đã kiểm. Dùng cơ chế tiếp tục lượt chạm trần đã có (B-07) nếu áp được;
  - vẫn không đọc được ⇒ chạy lại review một lần với trần lượt cao hơn;
  - vẫn không ⇒ attention rõ ràng, nói review chưa có kết luận. Không im lặng đi tiếp.
- Test cho ba nhánh. Ca review bình thường không đổi.

**K3 — qa-tester: kiểm chặn nhầm độc lập của `outside-root-write`**
- Người làm D16 không làm hạng mục này.
- Chạy ít nhất **20** lệnh dev thường gặp qua cả hai đường của K1, gồm cả Bash lẫn PowerShell. Ví dụ:
  - `npm test`, `npm run build`, `node --test`, `npx tsc --noEmit`;
  - `git diff`, `git status`, `git log`, `git add -A`;
  - `cat package.json`, `ls node_modules/.bin`, `mkdir -p dist`, `rm -rf dist`, `cp a.txt b.txt`, `mv x y`;
  - `echo x > out.txt`, `echo x > /dev/null`, `tee log.txt`;
  - `curl -o vendor/x.js https://…`, `wget -O vendor/x.js https://…`;
  - ghi vào thư mục tạm, `Get-ChildItem`, `Set-Content out.txt x`, `Remove-Item dist -Recurse`.
- Tất cả phải được cho qua.
- Ghi bảng kết quả thành test (`test/`) và một bảng trong `docs/TOOLS.md`.
- Có chặn nhầm ⇒ `backend-dev` sửa trong gói này.

**K4 — backend-dev: dọn hai điểm nhỏ CTO nêu, và ràng buộc vai cho quy tắc hạng mục đề bài của D17**
- Khi nhiệm vụ `paused` vì hết hạn mức, không ghi `FINAL.md` tạm như báo cáo đã xong. Nếu cần lưu bản tạm thì dùng tên khác và ghi rõ là bản tạm.
- Mỗi test bị bỏ qua có lý do trong mã (nền tảng nào, vì sao), để số skipped trên Windows và Linux giải thích được.
- Quy tắc `brief-item` của D17, nếu đã gộp: chỉ ràng vai khi tên trong đề bài khớp **id agent có trong roster của phòng**. Vai chung `code-reviewer`/`reviewer` khớp agent có `role: reviewer` của phòng. Tên không khớp roster ⇒ không chặn, chỉ ghi cảnh báo trong log. Test cho cả ba trường hợp.

**K5 — qa-tester: review K1, K2, K4**
- Kết luận theo mẫu JSON.
- 🧪 Lệnh kiểm tra của dự án: `npm run typecheck`, `npm test` phải xanh.

## Không làm

- **Bật sandbox hệ điều hành (B-18) để chặn đường lách bằng `node -e`, biến, `eval`:** cần đăng nhập WSL trên máy chạy. Đây là việc của giám đốc, ghi vào báo cáo.
- **Đo lại RedCode sau khi vá:** gói Nghiên cứu riêng.
