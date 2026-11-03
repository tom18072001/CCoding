# Đề bài vòng 4, gói 4, cho Phòng Nghiên cứu: đưa kết quả nghiên cứu đăng ký trước W1–W5 và vòng 4 vào báo cáo khoa học

Gói vừa: **tối đa 3 hạng mục + review, ngân sách 6M token**. Chỉ sửa `docs/research/paper/paper.md`, `facts.json`, `CHANGELOG.md`. Không sửa `src/` hay `bench/`. Phân loại dữ liệu: **Nội bộ**. Đọc tệp theo đoạn, không đọc lại nguyên tệp lớn.

## Vì sao
- Giám đốc hỏi (3/11 14:59): kết quả mới đã vào báo cáo khoa học chưa? **Chưa.**
  - `paper.md` vẫn là bản ngày 2/11, kết quả lấy từ bộ cũ C1–C8.
  - Ngày 3/11 chỉ sửa trích dẫn.
- Nghiên cứu đăng ký trước W1–W5 đã xong: 440 khóa, 7 arm, không lượt nào chạm hạn mức. Phân tích cuối nằm ở `bench/vs-claude/results/study-cloud-final/`.

## Hạng mục

**P1 — academic-writer (data-scientist kiểm số): viết lại §5 Phương pháp và §6 Kết quả**
- **§5:**
  - Mô tả nghiên cứu đăng ký trước:
    - bộ bài của giám đốc: R13 và T5;
    - các arm A0-sonnet, A1, A2, B0, B5, B6, B7;
    - cửa sổ W1–W5 và hai server (`main e0bd2f4` cho B0/B5, nhánh `7fb18ba` cho B6/B7), cùng ba neo B0;
    - thước đo token có trọng số theo công thức của giám đốc;
    - TOST ±15 %, quy tắc trần §2.7, tiêu chí loại lượt, quarantine.
  - Các vòng C1–C8 cũ hạ thành **"vòng thăm dò"**.
- **§6, mục mới "Nghiên cứu đăng ký trước W1–W5", nguồn:**
  - `study-cloud-final/README.md`, `final-extra.md`, `prereg-tests-448.md`;
  - `analysis/b7-cost-decomposition.md` (T-4, T-5, T-7);
  - `analysis/variance-decomposition.md`;
  - `analysis/cache-sensitivity.md` (C-1…C-5);
  - `analysis/agreement.md`: judge so với regex, cổng B-02 1/1 và 0/50, κ MAST.
- **Phải có:**
  - bảng chi phí 6 arm so với A0-sonnet trên R13, kèm CI 90 %;
  - B-01 bị bác bỏ cho B7 và B6;
  - H3–H7 và họ Holm rỗng, ghi đúng trạng thái "chưa đủ N / suy biến", không tô hồng;
  - phân rã chi phí;
  - độ nhạy hệ số đọc cache 0,05, ghi là phân tích phụ;
  - chỉ số độ khớp (Accuracy, P, R, F1, κ, PABAK).
- **B7′ (B-11):** thêm mục giữ chỗ "đang đo", chưa có số.
- **Mỗi con số trích kèm tệp và bảng.** `consistency-check.mjs` phải xanh; số chuẩn mới ghi vào `facts.json`.

**P2 — research-lead: viết lại Tóm tắt VI/EN, §7 Thảo luận, §8 Đe dọa tính hiệu lực, §9 Kết luận**
- **§7:**
  - Liên hệ với Anthropic: hệ đa agent tốn khoảng 15 lần token so với chat; coding ít việc con song song được.
  - Liên hệ với MAST (kiểm chứng) và Debate or Vote.
  - Ghi hàm ý thiết kế: việc nhỏ dùng agent đơn, việc lớn mới dùng multi-agent. Chi phí cố định của CTO và mẫu đầu ra dẫn tới B-11 và B-13…B-17 (`analysis/acceleration-crosscheck.md`).
- **§8:**
  - cửa sổ và server khác nhau;
  - điểm chạm trần;
  - κ đo giữa hai agent cùng họ mô hình;
  - người chạy đã thấy điểm 2 lượt (V3-09);
  - H6 lệch giữa `run-plan` và đăng ký trước;
  - `costUsd` của arm CCoding bằng 0.
- **Ẩn danh:** không tên người thật, không tên khách hàng hay dự án nội bộ; "dự án A" giữ nguyên. Không mật khẩu, không đường dẫn dữ liệu thật.

**P3 — peer-reviewer: review P1, P2**
- Mỗi con số có truy được về tệp và bảng không?
- Kết luận âm tính có được nêu thẳng không?
- Bài có tách rõ xác nhận với mô tả không?
- Ẩn danh có đạt không?
- Kiểm bằng "🧪 Lệnh kiểm tra của dự án".

## Không làm
- Không sửa §4 "Hệ thống" ở gói này. Phòng Dev đang gộp `main` mới (KPI v2, lộ trình REA…) vào nhánh; §4 sẽ cập nhật ở gói sau, theo `docs/research/context/merge-main-2026-11-03.md` do Phòng Dev viết.
- Không làm slide. Người điều phối cập nhật slide từ bản bài báo này.
- Không đọc `results/b7prime`.
