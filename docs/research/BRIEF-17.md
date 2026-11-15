# Đề bài vòng 4, gói 11, cho Phòng Nghiên cứu: đóng gói 10; thiết kế lại E5 sau kết quả E3; các quy tắc còn thiếu

Gói vừa: **5 hạng mục + review, ngân sách 5M token**.
- **Được sửa:**
  - `docs/research/`: `preregistration.md` §9, `improvement-backlog.md`, `context/`, `analysis/` và tài liệu đi kèm;
  - `bench/vs-claude/results/*/RUNLOG.md`.
- **Không sửa:** `src/`, mã hay cấu hình của `bench/` (gồm `arms.json`), và `paper/paper.md`. Bài báo sẽ cập nhật ở gói sau, khi D12 đã gộp.
- Không chạy benchmark, không gọi `claude -p`.
- Phân loại dữ liệu: **Nội bộ**.

## Căn cứ
- **BRIEF-16 đã gộp** (`8941103`).
  - Holdout B-19 đã khóa lại. CT-09, CT-12, CT-13, CT-19 xanh; `npm test` 415/415, chạy 3 lần trên Linux.
  - CTO chưa nghiệm thu vì K4(3): `improvement-backlog.md` chưa cập nhật B-12, B-14, B-16.
  - `context/k5-verification-2026-11-04.md` ghi trạng thái trước khi khóa lại nên đã lỗi thời.
- **E3 xong** (`bench/vs-claude/results/large-pilot/RUNLOG.md`, §9 mục "E3 xong; E5 tạm giữ" lúc 12:20).
  - Thước đo chính: B0 **không có** pha `discuss` trên cả hai bài.
    - l1-modules: `chooseLane` quy tắc 3 chọn làn nhanh.
    - l2-chain: làn đơn vì nối tiếp, rồi nâng lên làn nhanh.
    - Làn nhanh và làn đơn đều không họp (`src/orchestrator.ts`, khối "Họp thảo luận + chốt").
  - Vì vậy E5 như đăng ký cho toàn ô "thiếu dữ liệu" theo V4-3e-E5 (8).
  - E5 đang tạm giữ; E4 chạy tiếp, rồi E6.
- **D12 đang làm song song** (`BRIEF-D12.md`):
  - sửa T-1…A-7 của K2;
  - thêm giá Haiku 5.5;
  - thêm hai arm `B0F` = `{ lane: full }` và `B1F` = `{ lane: full, discussionRounds: 0 }`, có test bằng runtime giả rằng ép làn đầy đủ thì có pha `discuss`.
- **Nguồn gốc dữ liệu:** `ccodingCommit` của mỗi dòng là `git rev-parse HEAD` của **thư mục runner** (`run.mjs:77`), không phải của server. Runner và server nên cùng một worktree.

## Hạng mục

**K1 — research-lead: đóng gói 10 (N-1 của CTO BRIEF-16)**
- Cập nhật trạng thái trong `improvement-backlog.md`:
  - **B-12, B-16:** E2 xong, E4 đang chạy, N cố định.
  - **B-14:** E1 xong, đổi bộ công cụ là nguồn ghi cache; bước 2 đã đăng ký, 96 lượt, chờ giám đốc duyệt.
  - **B-15:** E3 cho thấy không đo được với B0/B1; chờ E5 mới.
  - **B-19:** đã khóa lại `84ded09`.
- Viết lại `k5-verification` theo trạng thái hiện tại. Chạy lại đủ lệnh kiểm và dán kết quả.

**K2 — methodologist (research-lead duyệt): thiết kế lại E5 cho B-15 và đăng ký trước lượt đầu**
- Ghi mục §9 **V4-3e-E5′**, đủ 9 trường như V4-3e-E5. Câu hỏi giữ nguyên V4-3e-E5 (1): đối chứng làn đầy đủ có họp, so với bỏ họp.
- **Hướng gợi ý:**
  - Arm `B0F` so với `B1F`, cùng hai bài, n = 10 mỗi ô.
  - Giữ (5) và (6) của E5. Giữ (8): lượt `B0F` không có `discuss` thì bị loại kèm cặp.
  - Nếu Phòng thấy cần thiết kế khác (bài, số lượt, thước đo) thì nêu lý do. Không đặt ngưỡng ý nghĩa sau dữ liệu.
- **Thí điểm:** có cần lượt thí điểm xác nhận `B0F` thật sự có `discuss` trên hai bài không, hay dùng lượt đầu của E5′ làm kiểm tra (dừng nếu không có)? Ghi quy tắc dừng.
- **Nơi chạy và commit:**
  - Local, gói Max, sau E6.
  - Worktree và server **mới** ở commit gộp D12, vì arm mới chỉ có từ D12 và `ccodingCommit` lấy từ runner. Cổng khác 7420 và 7425.
  - Ghi vì sao commit khác E6 không làm trộn dữ liệu: E5′ không gộp với phần nào khác, theo `run-plan.md` §5.4.
- **Ước lượng chi phí và thời gian:** làn đầy đủ có họp đắt hơn làn nhanh. Dựa trên token của E3 (B0 làn nhanh khoảng 0,77 M token có trọng số mỗi lượt) và tỉ lệ pha họp ở dữ liệu cũ có `discuss`, ví dụ `r1-elk-design` trong `study-cloud`. Ghi đây là ước lượng.
- **Giám đốc duyệt** E5′ trước lượt đầu; người điều phối sẽ hỏi. Mục §9 phải xong trước khi hỏi.

**K3 — methodologist: các quy tắc mà K2 nói "đăng ký chưa có"**
- **S-1:** trần có margin ở H1′, H2′. D12 làm bảo thủ: loại bài trần rồi kiểm suy biến. Đăng ký quy tắc này trong §9 trước khi khóa H1′, H2′, hoặc ghi quy tắc khác kèm lý do.
- **SS-1…SS-3 của `l3-reconcile`:** cỡ mẫu đo trên prompt cũ, vì `brief` đã đổi ở D11. Ghi hệ quả, và nếu cần thì quy tắc tính lại trước khi dùng.
- **Bước 2 của B-14:**
  - Mức tiết kiệm 10 % là giả định.
  - Bài được chọn dựa trên dữ liệu B7 đã có.
  - Ghi đây là giới hạn, kèm phân tích độ nhạy đã đăng ký, trước lượt đầu.

**K4 — academic-writer: phương án ẩn danh khi nộp bài (N-5)**
- Bài báo còn tên CCoding, mã B-xx và đường dẫn `src/`.
- Soạn `docs/research/context/anonymization-options-2026-11-04.md` với 2–3 mức. Ví dụ:
  - (a) giữ tên công cụ, bỏ mã nội bộ;
  - (b) ẩn danh kiểu double-blind;
  - (c) giữ nguyên, kèm kho mã.
- Mỗi mức ghi: thay những gì, ảnh hưởng tới khả năng tái lập, và việc cần làm.
- **Không sửa `paper.md`.** Giám đốc chọn.

**K5 — peer-reviewer: review K1–K4**
- Mục §9 của E5′ có ghi **trước** mọi lượt E5′ không? Có chỗ nào dựa vào điểm của E3 không? Phải không có: chỉ được dựa vào `lane`, `byPhase`, token và thời gian.
- Mọi quy tắc mới có ghi rõ là đặt trước hay sau dữ liệu không?
- Kiểm bằng "🧪 Lệnh kiểm tra của dự án". `git status` sạch.

## Không làm
- Không chạy benchmark, không gọi `claude -p`.
- Không xem điểm của E3 hay E4. Điểm E3 chỉ đọc khi phân tích chính thức, theo V4-3e-E3 (6).
- Không sửa `src/`, `bench/` (trừ `RUNLOG.md`), `paper/paper.md`.
