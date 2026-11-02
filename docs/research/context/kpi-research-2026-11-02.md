# Dữ liệu đầu vào: KPI Phòng Nghiên cứu và lỗi công cụ (2/11/2026)

> Người giao việc ghi lại để Phòng Nghiên cứu phân tích. Phân loại dữ liệu: nội bộ. Đường dẫn trên máy đã thay bằng `<ws>`, `<home>` và `<proj>`; không có dữ liệu khách hàng.
> Các phần "nhận định" dưới đây là **giả thuyết của người giao việc**, chưa được kiểm. Phòng cần tự xác minh từ dữ liệu.

## 1. Nguồn
- KPI lấy từ API của CCoding:
  - `GET /api/kpi?dept=research&days=7`: cửa sổ 7 ngày, có cả một nhiệm vụ nghiên cứu ngày 28/10.
  - `GET /api/kpi?task=T-20261102-112755-181,T-20261102-121636-dd9`: chỉ hai nhiệm vụ ngày 2/11.
- Log công cụ lấy từ `GET /api/logs?task=<id>`. Chỉ giữ các sự kiện `tool.call` có `ok=false`, xuất ra `tool-failures-2026-11-02.csv` (75 dòng; cột: task, agent, phase, tool, category, command_or_path, reason).
- Cách tính KPI nằm trong `src/kpi.ts`. Trọng số: Chất lượng 40, Hiệu quả 25, Tin cậy 20, Tuân thủ 15.

## 2. Điểm KPI

| Agent | 7 ngày | Chỉ hai nhiệm vụ 2/11 | Ghi chú từ báo cáo KPI |
|---|---:|---:|---|
| Phòng (trung bình) | 68 | 82 | |
| peer-reviewer | 38 (Chất lượng 0, Hiệu quả 55, Tin cậy 90, Tuân thủ 42) | 95 | Cửa sổ 7 ngày: 1 hạng mục chạy 5/5 lần; thiếu mục "Kết luận" và "Kiểm trích dẫn & số liệu"; run_command lỗi 8/8 |
| academic-writer | 69 | 78 | Qua review lần đầu 2/5; còn major ở review cuối: số "C6 chưa có dữ liệu" cũ sót ở challenges.md và paper.md |
| data-scientist | 67 | 71 | Hiệu quả 27/44: 3,9M token mỗi hạng mục, gấp 2,2–3,7 lần trung vị phòng; dùng shell để đọc tệp (13 lần) |
| literature-researcher | 76 | 99 | Cửa sổ 7 ngày: thiếu các mục mẫu (độ phủ mẫu 69 %) |
| methodologist | 83 | 95 | Cửa sổ 7 ngày: độ phủ mẫu 68 % |
| research-lead | 83 | 92 | Phòng dùng 3 lần ngân sách (30,4M so với 10M) |

## 3. Lỗi công cụ của hai nhiệm vụ 2/11 (75 lượt)

| Loại (`category`) | Số lượt | Ý nghĩa |
|---|---:|---|
| `git-read-deny` | 44 | Vai trò không có Bash chạy lệnh shell; hook chế độ `git-read` chặn |
| `outside-path` | 10 | Hook chặn vì đường dẫn nằm ngoài worktree |
| `exit-nonzero` | 8 | Lệnh có chạy nhưng trả mã lỗi; không phải do chính sách |
| `tool-error` | 6 | Edit không tìm thấy chuỗi, URL sai |
| `read-gate-nudge` | 5 | Giới hạn khảo sát nhắc: đọc 16 lần liên tiếp mà chưa ghi |
| `policy-other` | 2 | Chặn tạo/chuyển nhánh |

**Nhận định của người giao việc (cần kiểm):**
- **N1.** Phần lớn lệnh `git-read-deny` thực chất CHỈ ĐỌC. Có hai nguyên nhân:
  - Hook tách câu lệnh và pipe theo `|` và `;` mà không xét nháy (xem `gitReadShapeReason` trong `src/tools/shell-policy.ts`). Vì vậy `grep "a\|b"` và `sed -n '1p;5p'` bị tách sai.
  - Hook không nhận `echo`, `sed -n` nhiều địa chỉ, `tail -c`, `awk` là lệnh đọc.
- **N2.** Một số lượt `outside-path` là chặn nhầm. Bash của Claude Code giữ thư mục hiện tại giữa các lệnh, nhưng hook luôn tính `../` từ gốc worktree. Một lượt khác chặn Read tệp `tool-results` mà Claude Code tự lưu khi kết quả quá lớn.
- **N3.** peer-reviewer không chạy được `token-analysis.mjs --check` và `node --test`, nên không kiểm chứng bằng công cụ được. Đây là một nguồn làm điểm Chất lượng của reviewer thấp.
  - Từ 2/11, dự án `ccoding-research` đã có `checkCommands` gồm hai lệnh trên. CCoding sẽ tự chạy chúng trước thực thi, sau thực thi và sau mỗi vòng sửa.
- **N4.** Lỗi review cuối của academic-writer là lỗi nhất quán giữa các tệp: một số liệu cũ còn sót ở tệp khác. Đề xuất có script kiểm cụm lỗi thời và số chuẩn (`facts.json`).
- **N5.** Phòng vượt ngân sách vì đề bài lớn. Người giao việc sẽ chia đề bài thành các gói nhỏ hơn.

**Đã làm ngay qua API (không sửa mã):**
- Thêm `checkCommands` cho dự án `ccoding-research`.
- Gửi góp ý KPI cho 6 agent: đọc bằng Read/Grep, đủ mục mẫu, kiểm số trên toàn bộ tệp, ít token hơn.

## 4. Bản sửa ứng viên (chờ phòng xếp hạng trong backlog)
Bản nháp đề bài cho Phòng Dev đã viết sẵn nhưng CHƯA giao. Các mục:
- **G1.** Tách câu lệnh có xét nháy.
- **G2.** Mở rộng tập lệnh chỉ đọc.
- **G3.** Dùng `cwd` có trong sự kiện hook.
- **G4.** Cho Read tệp tool-results của chính phiên.
- **G5.** Vai trò chỉ đọc chạy được đúng các lệnh `checkCommands`.
- **G6.** Thông báo chặn chỉ đúng lệnh gây chặn.
- **G7.** Script `consistency-check.mjs` cùng `facts.json`.

Các nâng cấp khác đã đề xuất ở vòng trước, cũng cần đưa vào backlog:
- "làn đơn" cho việc nhỏ: chi phí cố định của điều phối khoảng 56 % thời gian một agent;
- lệnh kiểm tra đỏ thì vào thẳng vòng sửa, reviewer nhận diff kèm kết quả lệnh (review là pha dài nhất ở C5);
- các bản vá D-01–D-03 và P1–P4.
