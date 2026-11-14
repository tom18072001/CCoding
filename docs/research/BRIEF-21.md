# Phòng Nghiên cứu, vòng 4 gói 15: phản biện bài báo v0.7 (K4 còn thiếu của BRIEF-20), đọc quy định chung về thông báo vi phạm, sửa hết phát hiện

**Gói vừa: 4 hạng mục. Ngân sách 8M token.** Giao 14/11/2026.

**Căn cứ:** nghiệm thu của CTO cho BRIEF-20, 3/9 tiêu chí chưa đạt hoặc chưa kiểm được:
- (6) chưa có review phản biện, chỉ có cổng tự động;
- (5) mẫu KPI chưa được giám đốc duyệt;
- (9) mới rà vài chỗ về mức nhãn.

Giám đốc 12/11: "cần chuẩn công bố khoa học"; "đã là đề tài thì phải fix hết, không để đề xuất sửa".

- **Được sửa:**
  - `docs/research/` (`paper/`, `facts.json`, `CHANGELOG.md`, `context/`, `analysis/`, `improvement-backlog.md`, `run-plan.md`; `preregistration.md` chỉ **thêm** dòng ở §9);
  - chữ trong `bench/vs-claude/results/*/report.md` và `RUNLOG.md`, không đổi số đo.
- **Không sửa:** `src/`, mã và cấu hình của `bench/`.
- Không chạy benchmark, không gọi `claude -p`.
- Phân loại dữ liệu: **Nội bộ**. Repo công khai: không đưa tệp từng lượt của P, không ghi đường dẫn máy, giữ ẩn danh "dự án A".

## Đã làm sau BRIEF-20 (người điều phối, 14/11)

- Đọc được toàn văn Nghị định 356/2025/NĐ-CP trên Cơ sở dữ liệu quốc gia về văn bản pháp luật; số điều trong `paper.md` §6.3.2 đã đối chiếu (`context/nd356-2025-note.md` §0).
- `results/e8-parallel/report.md`: sửa câu "Không thấy tốn thêm token". Token của E8 là thước đo phụ, chỉ mô tả, không có phép kiểm tương đương.

## Hạng mục

**K1 — peer-reviewer: review phản biện `paper/paper.md` v0.7 (bản trên nhánh hiện tại)**
- Đối chiếu **mỗi số** trong Tóm tắt, §2, §6.3, §6.4, §8.3, §9 và Bảng 16–19 với nguồn ghi bên cạnh (tệp:dòng) hoặc tái lập bằng lệnh. Báo bảng: số, vị trí trong bài, nguồn, khớp/lệch.
- Riêng số của P chỉ đối chiếu với `results/p-parallel/RUNLOG.md`, vì tệp từng lượt không nằm trong repo.
- Rà **mức nhãn** trên toàn bài, không lấy mẫu. Không câu nào vượt [Xác nhận]/[Mô tả]/[Khám phá], và đối chiếu với danh sách câu cấm trong `paper/v07-axes-threats-draft.md`. Kiểm riêng:
  - E7: p chỉ mô tả;
  - B-14: viết "không phân biệt được", không viết "không có hiệu ứng";
  - E8: token là thước đo phụ, không viết "không tốn thêm token" hay "token không đổi";
  - trục 2 (b): không viết "chặn X % tấn công".
- Rà ẩn danh và đường dẫn máy trong mọi tệp đã đổi từ BRIEF-20 tới nay.
- Kết quả: `context/k4-v07-review-2026-11-14.md`. Mỗi phát hiện có mức **chặn / nên sửa / ghi chú** và chỗ sửa đề nghị.

**K2 — literature-researcher: quy định chung về thông báo vi phạm dữ liệu cá nhân trong Luật Bảo vệ dữ liệu cá nhân 2025**
- Xác nhận số hiệu Luật (kết quả tìm kiếm trước đây ghi Luật số 91/2025/QH15, chưa mở văn bản) và ngày hiệu lực.
- Đọc điều về thông báo vi phạm từ văn bản chính thức: Cơ sở dữ liệu quốc gia về văn bản pháp luật, Công báo hoặc cổng Chính phủ. Ghi:
  - số điều;
  - thời hạn;
  - ai phải thông báo, thông báo cho ai;
  - có hay không mốc 72 giờ áp cho mọi vi phạm.
- Thêm một mục vào `context/nd356-2025-note.md`. Không đọc được bản chính thức thì ghi [CHƯA KIỂM CHỨNG] và nêu nguồn đã thử.

**K3 — academic-writer (data-scientist kiểm số): sửa hết phát hiện**
- Sửa **mọi** phát hiện mức "chặn" và "nên sửa" của K1, trong `paper.md` và trong tệp nguồn có lỗi chữ. Phát hiện "ghi chú": sửa nếu không đổi số đo; nếu không sửa thì ghi lý do vào tệp review.
- Số trong bài lệch nguồn thì sửa theo nguồn và ghi vào `CHANGELOG.md`. Không tính lại số đo.
- Đoạn khung pháp lý (§6.3.2) theo K2:
  - Luật có mốc chung thì ghi kèm điều;
  - không có thì giữ câu "không khẳng định mốc 72 giờ chung".
- KPI: ghi rõ mẫu KPI đang dùng là giả định của phòng, chờ giám đốc duyệt. Không viết như đã duyệt.
- `facts.json` và `CHANGELOG.md` đồng bộ; `consistency-check` đạt.

**K4 — methodologist: review K3**
- Xác nhận từng phát hiện "chặn" và "nên sửa" của K1 đã được xử lý (bảng: phát hiện → commit/dòng).
- Chạy "🧪 Lệnh kiểm tra của dự án"; `git status` sạch.

## Không làm

- Không đo lại trục 2 phần (b). Phòng Dev đang vá chỗ hở của bộ kiểm ở tầng `full` (BRIEF-D16); đo lại là gói sau.
- Trục 2 phần (a): chờ giám đốc chỉ định hai người gán nhãn.
