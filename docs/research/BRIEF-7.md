# Đề bài vòng 4, gói 1b, cho Phòng Nghiên cứu: sửa 2 major của B-11, chạy bootstrap tách phương sai, khóa kế hoạch đo B7′

Gói nhỏ: tối đa 2 hạng mục, ngân sách 1,5M token. Không sửa `src/` hay `bench/`.

**N1 — methodologist: sửa `docs/research/improvement-backlog.md` B-11 theo review**
- **B-11(d):** lượt định tuyến LLM nằm ở `route()`, không ở `pickLane`/`chooseLane`. Lượt này đã bị bỏ khi ép làn đơn (`src/orchestrator.ts`, khoảng dòng 1083–1084, có từ `7fb18ba`). Ghi "(d) đã có, đóng". Kiểm thêm: cấu hình arm B7 có thật sự ép `single` không, đọc `bench/vs-claude/arms.json` và `lib/ccoding.mjs`.
- **B-11.5:** thêm mục "kết quả dự kiến" và **điểm quyết định chạy tiếp/dừng**. Ví dụ: sau 20 lượt đầu, nếu R ước lượng > 1,6 thì dừng và báo. Kế hoạch phải nằm trong trần thời gian §4.4(d).
- Sửa các minor:
  - lịch ghi "≈ 3,5 giờ";
  - V4-01 ghi "(chỉ báo thô, xem B-11.3)";
  - T-6: ghi rõ đó là Δ gộp;
  - `b02m-replay`: thử đọc `finalPath`.
- **Bối cảnh mới:** Phòng Dev đang làm B-11 sau các công tắc, gồm các arm B7c (chỉ (c)), B7cb ((c)+(b)) và B7cab ((c)+(b)+(a) `brief`, CTO chỉ trả bảng tiêu chí ngắn). Giám đốc chưa duyệt (a) và (b).
  - Cập nhật B-11.5 để đo được từng arm theo mức duyệt.
  - Phương án (a) `brief` không bỏ CTO, chỉ rút báo cáo nghiệm thu. Xem lại có còn "bị chặn" như (a) `skip` không.

**N2 — data-scientist: bootstrap tách phương sai** (điều kiện cứng của B-11.5)
- Trên `runs.jsonl` hiện có (B7a, A0), tách phương sai log(tỉ số) thành hai phần: giữa bài và giữa lượt trong bài.
- Tính độ rộng CI 90 % dự kiến cho các phương án cỡ mẫu: 10 lượt × 5 bài, và 5 lượt × 10 bài (gồm bài B7b).
- Chọn phương án theo quy tắc phân bổ ở B-11.5. Lưu đầu ra vào `docs/research/analysis/` kèm hash `runs.jsonl`.
- `b7-cost-decomposition.md --check` đang lệch vì `runs.jsonl` đã có thêm dòng B7b. Ghim script vào đúng hash dữ liệu đã phân tích, hoặc sinh lại và ghi hash mới.
