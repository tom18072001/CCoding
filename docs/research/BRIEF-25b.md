# Phòng Nghiên cứu, gói 18b: sửa nhỏ sau phản biện E9-lite; bảng tuyệt đối và chi phí bằng tiền

**Gói nhỏ: 3 hạng mục. Ngân sách 4M token.** Giao 15/11/2026. Việc nối của BRIEF-25 (T-20261115-073336-258): làm tiếp trên nhánh `ccoding/t-20261115-073336-258`.

**Căn cứ:** biên bản CTO của BRIEF-25. Chưa nghiệm thu vì hai tiêu chí:

**T5 — `model-per-role.md` vượt mức bằng chứng:**
- `:46`, `:52` viết "rẻ hơn", trong khi `weighted()` không nhân giá theo model. Token có trọng số ít hơn không có nghĩa là rẻ hơn khi giá Haiku, Sonnet, Opus khác nhau.
- `:54` viết "xu hướng" cho đếm 7/2/4 mà khoảng chưa tách 0.
- Đe dọa 8 chưa ghi khả năng độ phủ ở mức trần (`covMod` hiệu 0 ở 13/13 bài).
- Chưa ghi "tệp ngoài repo chưa đếm".

**T6 — số liệu và tài liệu sai hoặc thiếu:**
- `report.md:134` ghi 4 dòng `failed` "không có `usage`", nhưng thật ra có (tổng 415 205).
- `paper.md:822` ghi sai nguồn của 415 205 / 105 551 / 309 654.
- `facts.json` chưa ghi rõ sha256 tính trên LF.
- Bản thảo chưa lên v0.8.2.
- `e9lite-run1-audit.md` mục 9 còn thay đổi chưa commit; tệp tạm `k2-tmp/a.mjs` còn sót.

**Đề xuất 2 và 3 của CTO** (không cần chạy lại planner): bảng độ phủ tuyệt đối theo arm để kiểm trần; chi phí bằng tiền theo `bench/vs-claude/lib/pricing.mjs`.

**Phạm vi:**
- **Được sửa:** `docs/research/` (`preregistration.md` chỉ **thêm** ở §9), `bench/vs-claude/results/e9lite/` (chỉ thêm tệp báo cáo; không sửa `runs.jsonl`, `gold.json`, `labels.json`; `report.md` chỉ sửa câu sai ở `:134` kèm ghi đính chính).
- **Không sửa:** `src/`, mã `bench/`.
- Không chạy lại planner, không gọi LLM để đo.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề. K3 giao cho `@peer-reviewer`, chỉ đọc.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run lint`, `npm run test:research`.

## Hạng mục

**K1 — data-scientist: bảng tuyệt đối và chi phí bằng tiền [Khám phá, sau khi thấy dữ liệu]**
- **Ghi §9 trước khi tính:** thêm khối mới mô tả hai phân tích này. Nói rõ là **sau khi thấy dữ liệu**, không thuộc đăng ký, chỉ mô tả.
- **Bảng giá trị tuyệt đối theo arm:** độ phủ tệp và module, số hạng mục, token có trọng số pha `plan`. Mỗi ô ghi trung bình theo bài, trung vị, min–max, số bài đạt 1,0.
  - Mục tiêu: trả lời độ phủ có bão hòa không.
- **Chi phí bằng tiền theo arm:**
  - dùng `bench/vs-claude/lib/pricing.mjs` (giá theo model) trên `usage` của dòng `done` được chọn;
  - hiệu O − S và H − S theo bài, bootstrap theo cách §9 (B, seed như cũ);
  - ghi rõ giá lấy từ tệp nào, ngày nào.
- **Chất lượng mã:**
  - script tách riêng, vd. `docs/research/analysis/e9lite-cost.mjs`, có test trên dữ liệu giả;
  - chạy hai lần ra đúng byte;
  - đầu ra lưu `bench/vs-claude/results/e9lite/report-cost.md`.

**K2 — academic-writer: sửa T5, T6**
- **`model-per-role.md`:**
  - đổi "rẻ hơn" thành "ít token có trọng số hơn ở khâu `plan`", rồi thêm câu theo kết quả chi phí bằng tiền của K1;
  - đổi "xu hướng" thành mô tả đếm;
  - thêm khả năng độ phủ ở mức trần vào đe dọa 8 (dùng bảng tuyệt đối của K1);
  - ghi "tệp ngoài repo chưa đếm".
- **`report.md:134`:** sửa câu sai kèm ghi đính chính; `CHANGELOG.md` ghi đính chính.
- **`paper.md`:**
  - `:822` sửa nguồn số;
  - lên v0.8.2, ghi thay đổi ở đầu;
  - §6.6 thêm một câu về chi phí bằng tiền, nhãn [Khám phá, sau khi thấy dữ liệu].
- **`facts.json`:** ghi sha256 tính trên LF; có khóa cho số mới của K1.
- Commit phần còn lại của `e9lite-run1-audit.md`; xóa `k2-tmp/`.
- Dùng Grep rà mọi câu "rẻ hơn", "đắt hơn", "tốt hơn", "xu hướng" trong các tệp E9-lite.

**K3 — peer-reviewer: phản biện (chỉ đọc)**
- Dòng đầu: `**Kết luận:** Đạt`, `Sửa nhỏ` hoặc `Chưa đạt`.
- **Xác nhận:**
  - T5, T6 đã đóng, kèm tệp:dòng;
  - kết luận về chi phí không vượt khoảng;
  - khối §9 mới ghi rõ "sau khi thấy dữ liệu".
