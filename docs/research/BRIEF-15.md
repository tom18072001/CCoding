# Đề bài vòng 4, gói 9, cho Phòng Nghiên cứu: chốt mọi điểm [CẦN XÁC NHẬN] của đăng ký trước đợt 3e trước lượt E2 đầu tiên

Gói nhỏ: **2 hạng mục + review, ngân sách 3M token**.
- Chỉ sửa:
  - `docs/research/preregistration.md` §9, mục "Đăng ký trước vòng 4 gói 8";
  - `docs/research/run-plan.md` §5.4;
  - `docs/research/analysis/gates-pairs.mjs`, test và README.
- Không sửa `src/` hay `bench/`. Không chạy benchmark. Phân loại dữ liệu: **Nội bộ**.

## Vì sao
- CTO chưa nghiệm thu BRIEF-14 (T-20261103-214630-c4e) vì hai lý do:
  - `preregistration.md:457` chưa khớp script: chưa nói bài cài lỗi thuộc cổng khác bị loại khỏi mẫu (`--negatives clean`);
  - các điểm [CẦN XÁC NHẬN] chưa chốt.
- Giám đốc yêu cầu không để việc ở dạng đề xuất. Mọi điểm phải chốt **trước lượt đầu của E2**, và chốt khi chưa có dữ liệu nào của đợt 3e.

## Hạng mục

**Q1 — research-lead quyết (methodologist soạn): chốt từng [CẦN XÁC NHẬN]**

Dưới đây là đề xuất của người điều phối. Research-lead **chấp nhận hoặc bác bỏ, ghi lý do**. Bác bỏ thì ghi phương án thay thế.

1. **Câu ở dòng 457:** sửa cho khớp `gates-pairs.mjs`. Bài cài lỗi thuộc cổng khác bị loại khỏi mẫu của cổng đang xét (`--negatives clean`, mặc định). Báo số dòng bị loại.
2. **Nhãn tại thời điểm cổng (B-12 trường 7(b)).**
   - **cto:** ở làn đơn, nghiệm thu là pha cuối. Vì vậy trạng thái test ẩn cuối lượt đúng bằng trạng thái CTO đã thấy. Dùng nhãn cuối lượt làm nhãn tại thời điểm cổng, và ghi lập luận này. Cần kiểm trong mã: sau khi CTO "không đạt" thì còn vòng sửa nào không.
   - **b02:** Phòng Dev đang thêm `gates.b02.checksRed` (D10 mục C), là số lệnh kiểm đỏ tại thời điểm cổng. Nhãn "lỗi còn nguyên tại cổng" = `checksRed > 0`. Ghi rõ rằng b02 đọc chính lệnh kiểm nên recall b02 gần như theo định nghĩa. Đại lượng có thông tin là q̂, tức lỗi có sống tới cổng không.
   - Cập nhật `gates-pairs.mjs`: thêm `--label gate|task`, mặc định `gate` khi có trường, và test.
3. **E3:** giữ phiên bản BRIEF-14 (A0-sonnet, B0, B1 × l1, l2 × 1), thay cho CD 2.3. Lý do: vừa kiểm được pha `discuss`, vừa có điểm đầu tiên A0 so với B0 trên bài lớn. Đó là câu hỏi chính còn mở của bài báo.
4. **b10:**
   - Bỏ g3, g4 khỏi B7cab và B7cabO ở E4, vì làn đơn không có pha plan.
   - Thêm **B6 × g3, g4** vào E4, chạy local nên không tốn USD. Số lượt tính theo khối (a) cho riêng b10.
5. **Gộp arm:**
   - **Recall B-12:** gộp hai arm, theo B-12 trường 6.
   - **So sánh B-16:** từng arm, dùng McNemar ghép cặp. Tính N cho recall gộp.
   - **Bỏ chặn [50; 92]:** đó là ước lượng chi phí cloud của người điều phối, không phải ngưỡng, và E4 chạy local. Thay bằng trần thời gian máy do research-lead chọn, ví dụ ≤ 3 cửa sổ 5 giờ. Ghi trước.
6. **m và ρ:**
   - m lấy theo thiết kế bài: số phần tử của `plantedFaults` trong `tasks/g*/task.json`.
   - m = 1 thì DEFF = 1 và không cần ρ̂.
   - m > 1 thì dùng ICC(1) một chiều theo ANOVA, kèm công thức.
7. **r = 0,8:** giữ làm giả định đăng ký (giá trị giữa của AG C-3). Không ước lượng lại từ E2.
8. **E5:** CI 90 %, theo phương án A của `variance-decomposition.md`.
9. **E6:**
   - Chỉ ghép A với B0 trong cùng cửa sổ và cùng server (V3-02). Khóa cũ trên server khác chỉ dùng mô tả.
   - Kiểm số lượt B0 cần chạy mới, rồi ghi lại số lượt.
   - Nguồn p: Phòng Dev đang làm SR-26 ở D11. Chưa merge trước E6 thì theo phương án lùi (ước lượng, K = 0).
10. **Lượt sạch:** lượt CCoding có bản ghi cổng trên bài không thuộc g1–g6 (E3, E5, E6) được tính là lượt sạch cho b02. Báo n thực và cận trên CP thực. Không tuyên bố ≤ 5 % nếu n < 72.

**Q2 — research-lead: đồng bộ**
- Cập nhật `run-plan.md` §5.4 theo các quyết định ở Q1: lệnh E4 mới, B6 × g3, g4.
- Ghi bảng "điểm → quyết định → lý do" ở đầu mục §9 của gói 8.

**Q3 — peer-reviewer: review Q1, Q2**
- Còn [CẦN XÁC NHẬN] nào không?
- Có quyết định nào dựa trên dữ liệu đợt 3e không? Không được có.
- `gates-pairs.mjs` có khớp trường thật không? Lưu ý `checksRed` có thể chưa có nếu D10 chưa gộp: script phải lùi về nhãn theo bài và báo rõ.
- Kiểm bằng "🧪 Lệnh kiểm tra của dự án".

## Không làm
- Không chạy benchmark.
- Không sửa `paper.md`.
