# Phòng Nghiên cứu, vòng 4 gói 16b: đóng mọi phát hiện chặn và nên sửa của phản biện BRIEF-22; kiểm tự động tệp:dòng và đường dẫn máy

**Gói vừa: 4 hạng mục. Ngân sách 8M token.** Giao 14/11/2026.

**Căn cứ:**
- Biên bản nghiệm thu của CTO cho BRIEF-22: chưa nghiệm thu.
- Phản biện K7, bản lưu nguyên văn: `docs/research/context/k7-brief22-review-2026-11-14.md`.
  - 2 chặn: **C1** backlog và run-plan chưa chèn vào tệp đích; **C2** 12/34 `tệp:dòng` lệch.
  - 5 nên sửa: **M1–M5**.
  - 6 nhỏ: **m1–m6**.
- BRIEF-22 đã được gộp vào `perf/vs-claude-loop`; gói này sửa trên đó.

**Phạm vi:**
- **Được sửa:** `docs/research/` (`preregistration.md` chỉ **thêm** ở §9; `scripts/`) và chữ trong `bench/vs-claude/results/*/report.md`.
- **Không sửa:** `src/`, mã `bench/`.
- Không gọi LLM để đo, không chạy benchmark.
- Dữ liệu: **Nội bộ**; repo công khai, không ghi đường dẫn máy.

## Hạng mục

**K1 — academic-writer: đóng C1 và M1–M5**
- **C1:** chèn nguyên văn Khối A/B/C của `analysis/decisions/backlog-b20-insert.md` vào `improvement-backlog.md`, và `run-plan-s10-insert.md` vào `run-plan.md` §10, theo các neo đã ghi.
  - Cột xóa của `git diff --numstat` hai tệp phải bằng 0.
  - Sau đó xóa hai tệp chèn, và sửa `report.md` ở các chỗ ghi "chưa chèn".
- **M1–M5:** sửa theo đề xuất trong bản phản biện. Riêng M1 (P-1/P-2 có hai giá trị):
  - giữ cả hai số, mỗi số kèm định nghĩa và mẫu số (42/54 là lượt có ≥ 2 hạng mục; 42/56 là mọi lượt phòng; 27,5 % gộp phút so với 29,2 % nghịch đảo trung vị);
  - dùng nhất quán trong bài, `facts.json`, `CHANGELOG.md`;
  - sửa dòng "Số đổi giá trị: không có".
- **Thêm:** câu "song song gần như giảm nửa thời gian mà không tốn thêm token" ở `analysis/decisions/report.md` §2 vượt mức bằng chứng: token của E8 là thước đo phụ, chỉ mô tả, CI [0,942; 1,075]. Sửa ở mọi chỗ còn câu tương tự (dùng Grep).
- m1–m6: sửa nếu không đổi số đo; không sửa thì ghi lý do.

**K2 — data-scientist: đóng C2; làm FX19 và FX20 (phạm vi Phòng Nghiên cứu)**
- **Mốc mới cho mọi `tệp:dòng`** trong `logic-map.md`, `report.md` và backlog:
  - mốc = commit `HEAD` lúc bắt đầu gói (`src/` đã đổi sau `b146b87c` vì D16, D16b, D17 đã gộp);
  - ghi hash mốc ở đầu `logic-map.md`;
  - cập nhật **mọi** tham chiếu theo mốc mới, không chỉ 12 điểm mẫu.
- **FX19:** script `docs/research/scripts/logic-map-check.mjs`.
  - Mỗi tham chiếu `tệp:dòng` kèm ký hiệu trong ngoặc: kiểm dòng đó ở commit mốc có chứa ký hiệu.
  - Báo số tham chiếu lệch; exit 1 khi lệch.
  - Test: chạy trên mốc ra exit 0; một bản sao cố ý lệch một dòng ra exit 1.
- **FX20:** thêm vào `consistency-check.mjs` mục quét đường dẫn máy.
  - Mẫu: ổ đĩa Windows kèm `Users`, thư mục home tuyệt đối, đường dẫn tạm của máy cloud.
  - Phạm vi: `docs/research/**/*.md` (trừ tệp dữ liệu thô đã ghi ngoại lệ trong `CHANGELOG.md` gói 15).
  - Có đường dẫn ⇒ exit 1. Test bằng tệp tạm.

**K3 — data-scientist: bảng điểm đủ 20/20 agent**
- `scorecard.md` và `scorecard.mjs` thêm dòng cho 6 agent không có trong `kpi-office.json`: điều phối viên, `solution-architect`, `frontend-dev`, `data-engineer`, `business-analyst`, `ba-presales`.
- Ghi "không có dữ liệu trong 30 ngày", không cho điểm.
- Riêng điều phối viên: thêm chi phí khâu route từ bench.
- `scorecard.mjs --check` kiểm đủ 20 dòng.

**K4 — peer-reviewer: phản biện lại**
- Xác nhận C1, C2, M1–M5 đã đóng (bảng: phát hiện → tệp:dòng sau sửa).
- `logic-map-check.mjs` và `consistency-check.mjs` exit 0.
- Kết luận theo mẫu **Đạt** hoặc **Sửa nhỏ**. Còn chặn thì nêu rõ để vòng bổ sung sửa.
- Chạy "🧪 Lệnh kiểm tra của dự án"; `git status` sạch.
