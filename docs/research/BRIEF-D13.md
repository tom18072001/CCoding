# Phòng Dev, D13: làm nốt các việc CTO nêu ở D10b; sửa lỗi nhánh nhiệm vụ dựng từ base cũ

**Nhiệm vụ vừa, nhiều phần độc lập.** Trưởng phòng chạy song song.
- Ngân sách: 8M token.
- Nhánh `perf/vs-claude-loop`. Phân loại dữ liệu: **Nội bộ**.
- **Không đổi hành vi đang đo:** đợt 3e chạy trên server ghim (`6c454f6`, `57148de`), nên D13 không ảnh hưởng tới đợt đo. Mọi thay đổi hành vi nằm sau công tắc hoặc chỉ là sửa lỗi có test.

## Căn cứ
- **Giám đốc (3/11 19:56):** "đã là đề tài thì phải fix hết, không để đề xuất sửa".
- **CTO của D10b** (`docs/research/context/d10-implementation-2026-11-04.md`, phần đề xuất bật công tắc và ghi chú):
  - (1) phát hiện **M1** của route B-19: route ghi cứng `by: 'director'`. Đây là major, phải sửa trước khi bật `selfImprove`;
  - (2) chưa có tác vụ tự dọn `data/logs/`, nên log giữ vô thời hạn; chưa có WORM hay ký số;
  - (3) hai câu lỗi thời trong tài liệu bảo vệ dữ liệu;
  - (4) chưa có test tích hợp chạy cả vòng `Orchestrator` cho khối nguồn sự cố mới.
- **Lỗi quy trình mới (4/11):**
  - Nhiệm vụ D12 (T-20261104-123633-378) được dựng từ `e12e037`, trong khi `origin/perf/vs-claude-loop` đã ở `1a31f1f`. Lý do: workspace dùng nhánh cục bộ `perf/vs-claude-loop` đã cũ 51 commit.
  - Hệ quả: CTO thấy 4 test holdout đỏ và `--check` lệch hash, và không nghiệm thu được. Sau khi gộp vào HEAD thì cả hai đều xanh.
  - Người điều phối đã cập nhật nhánh cục bộ bằng tay.
- **BRIEF-18 K3(b)** có thể liệt kê ca lệnh ác ý còn thiếu cho `stablePrefix`. Nếu danh sách đến trước khi D13 xong thì thêm vào; nếu chưa thì tự đối chiếu với B-14 trường 7 trong `docs/research/improvement-backlog.md`.

## Hạng mục
**K1: sửa M1.**
- Route B-19 phải ghi người duyệt thật: người dùng hoặc phiên đã xác thực bằng `server.token`, không ghi cứng `director`.
- Không có danh tính thì từ chối, kèm thông báo tiếng Việt.
- Có test: CT-19 cũ vẫn xanh, cộng thêm ca không token và ca token sai.

**K2: lưu giữ log.**
- Thêm tác vụ dọn `data/logs/` theo chính sách giữ log đã có (`purgeExpired`), chạy theo lịch, mặc định **tắt**.
- **Không xóa** log làm chứng cứ chưa hết hạn: tối thiểu 6 tháng cho xử lý dữ liệu, 12 tháng cho nhật ký truy xuất, theo AGENTS.md.
- **WORM ở mức có thể làm:**
  - niêm phong tệp log đã xoay vòng bằng băm, ghi vào một sổ băm riêng;
  - kiểm lại được bằng lệnh;
  - ghi rõ cách ký số khi có khóa.
- Có test.

**K3: tài liệu bảo vệ dữ liệu.**
- Sửa hai câu lỗi thời CTO nêu.
- Cập nhật `docs/data-protection-assessment.md` theo K1, K2.

**K4: test tích hợp.**
- Chạy cả vòng `Orchestrator` bằng runtime giả cho khối nguồn sự cố mới (B-19).
- Kiểm: sự cố vào được hàng đợi đề xuất; nhiệm vụ confidential hoặc restricted bị bỏ qua và ghi `incident.skipped`; công tắc tắt thì không ghi gì.

**K5: base của nhánh nhiệm vụ.**
- Khi tạo worktree nhiệm vụ: nếu có remote thì `git fetch` trước. Nếu nhánh cục bộ `baseRef` đi sau `origin/<baseRef>` mà không đi trước, thì dùng `origin/<baseRef>`. Nếu hai bên lệch nhau theo cả hai chiều thì dừng và báo.
- Ghi base thật vào log nhiệm vụ.
- Có test với repo giả có remote.
- Không fetch được (offline) thì dùng nhánh cục bộ và cảnh báo.

**K6: ca lệnh ác ý cho `stablePrefix`.**
- Thêm test cho các ca còn thiếu theo B-14 trường 7: `; rm`, `$(...)`, heredoc, `> tệp`, `tee`, `sed -i`, `awk 'BEGIN{system(...)}'`, đọc `.env`, ở pha chỉ đọc khi bật `stablePrefix`.
- Nếu có ca lọt qua thì sửa, nhưng chỉ sửa trong hook.

## Kiểm tra
- `npm run typecheck`.
- `npm test` chạy 3 lần.
- `npm run test:bench`.
- Các lệnh kiểm của `ccoding-research` exit 0.

## Không làm
- Không chạy benchmark, không gọi `claude -p`.
- Không bật `selfImprove`, `osSandbox` hay `stablePrefix` mặc định.
- Không sửa `docs/research/paper/` hay `preregistration.md`.
