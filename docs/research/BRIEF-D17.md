# Phòng Dev, gói D17: kế hoạch không được bỏ hạng mục của đề bài; đề bài đòi review thì phải review; CTO chưa nghiệm thu thì tự làm tiếp một vòng bổ sung

**Gói vừa: 3 hạng mục + review. Ngân sách 8M token.** Giao 14/11/2026. Giám đốc 14/11: "nếu CTO tốt đã phải đánh giá được và hoàn thiện được các việc này".
- **Được sửa:** `src/`, `test/`, `docs/` (trừ `docs/research/`).
- **Không sửa:** `bench/`, `docs/research/`.
- Không chạy benchmark, không gọi `claude -p` thật.
- Phân loại dữ liệu: **Nội bộ**.

## Hiện tượng (vận hành thật, văn phòng phụ, gói Nghiên cứu BRIEF-20, 14/11/2026)

1. **Đề bài có bốn hạng mục K1–K4.** K4 là "peer-reviewer: review K1–K3". Kế hoạch của trưởng phòng có 6 hạng mục, **không hạng mục nào giao cho peer-reviewer** và không hạng mục nào là review phản biện. Cổng phủ kế hoạch vẫn đạt, vì nó chỉ kiểm tệp, không kiểm hạng mục của đề bài.
2. **Cổng chất lượng bỏ khâu review.** Lý do ghi: "không thuộc diện bắt buộc review", trong khi đề bài đòi review rõ ràng.
3. **CTO nghiệm thu đúng nhưng không ai làm tiếp.** CTO kết luận chưa nghiệm thu (3/9 tiêu chí) và nêu đúng các việc còn thiếu: chưa có review phản biện, điều khoản nghị định chưa đối chiếu, chỗ hở của bộ kiểm lệnh. Dù vậy nhiệm vụ vẫn đóng ở trạng thái "Hoàn thành … cần xem". "Việc tiếp theo" chỉ là đề xuất, phải có người giao lại bằng tay.

## Hạng mục

**K1 — dev-backend: cổng phủ kế hoạch kiểm cả hạng mục của đề bài**
- Nhận diện hạng mục được đánh mã trong đề bài: dòng hoặc tiêu đề dạng `**K1 — …**`, `K2 —`, `K3:`…
- Nếu dòng có vai (vd. `K4 — peer-reviewer:`, `@peer-reviewer`, `code-reviewer`), ghi nhận vai đó.
- **Quy tắc mới:**
  - mỗi mã hạng mục phải có ít nhất một hạng mục kế hoạch nhắc tới mã đó trong tiêu đề hoặc mô tả;
  - nếu đề bài nêu vai thì ít nhất một hạng mục như vậy phải giao cho agent có id hoặc vai đó;
  - khi đề bài nói một hạng mục **không làm** hay **chờ** (vd. "Phần (a): không làm"), hạng mục đó được miễn.
- Trượt quy tắc thì đi đường "sửa kế hoạch" đã có của cổng; vẫn trượt thì dừng kèm attention như hiện nay.
- `rule` mới có tên riêng (vd. `brief-item`) để log tách được.
- Test:
  - đề bài mẫu kiểu trên, kế hoạch bỏ K4 ⇒ chặn;
  - kế hoạch có K4 giao đúng vai ⇒ đạt;
  - đề bài không có mã hạng mục ⇒ không đổi hành vi.

**K2 — dev-backend: đề bài đòi review thì không được bỏ review**
- Nếu đề bài có hạng mục review (vai `peer-reviewer`, `code-reviewer`, `qa-tester` hoặc chữ "review"/"phản biện" trong dòng hạng mục), cổng chất lượng **không** được bỏ khâu review.
- Ghi lý do quyết định vào log.
- Test cho cả hai nhánh.

**K3 — dev-backend: CTO chưa nghiệm thu thì tự làm một vòng bổ sung trong phạm vi đề bài**
- Lời nhắc nghiệm thu: CTO phân mỗi tiêu chí chưa đạt hoặc chưa kiểm được thành:
  - **trong phạm vi**: phòng làm được với quyền và đề bài hiện có;
  - **cần quyết định**: cần giám đốc, người ngoài, quyền mới, hoặc đề bài cấm.
- `parseAcceptance` đọc được phân loại này. Thiếu phân loại thì coi là "cần quyết định" (an toàn).
- Có ít nhất một tiêu chí "trong phạm vi" ⇒ CCoding tự mở **vòng bổ sung**:
  - trưởng phòng lập kế hoạch bổ sung **chỉ** cho các tiêu chí đó; đầu vào là bảng tiêu chí của CTO;
  - chạy, gộp, kiểm như vòng thường (cổng phủ kế hoạch áp lên kế hoạch bổ sung);
  - review, rồi CTO nghiệm thu lại toàn bộ.
- Mặc định tối đa **1** vòng bổ sung (cấu hình được, 0 = tắt), và chỉ khi ngân sách còn lại đủ theo ước lượng hiện có.
- Hết vòng mà vẫn chưa đạt, hoặc chỉ còn tiêu chí "cần quyết định" ⇒ attention như hiện nay, nêu rõ tiêu chí nào cần giám đốc.
- Sự kiện log riêng (vd. `accept.followup`), kèm số tiêu chí và vòng thứ mấy. Giao diện hiện vòng bổ sung như một vòng của phòng.
- Test:
  - CTO trả 2 tiêu chí "trong phạm vi" ⇒ có vòng bổ sung, rồi nghiệm thu lại;
  - chỉ có "cần quyết định" ⇒ không mở vòng;
  - đã hết vòng ⇒ không mở thêm;
  - lỗi lượt gọi ở nghiệm thu ⇒ không mở vòng (giữ hành vi của D15).
- Cập nhật `docs/` mô tả luồng nghiệm thu.

**K4 — code-reviewer**
- Review K1–K3. Kiểm riêng: vòng bổ sung không lặp vô hạn; không chạy khi task bị hủy hoặc tạm dừng; không vượt ngân sách.
- 🧪 Lệnh kiểm tra của dự án: `npm run typecheck`, `npm test` phải xanh.

## Ghi chú phối hợp

Gói D16 chạy song song và cũng sửa `src/orchestrator.ts` (tạm dừng khi hết hạn mức). Giữ thay đổi gọn theo vùng để gộp dễ.
