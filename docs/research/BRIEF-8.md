# Đề bài vòng 4, gói 2, cho Phòng Nghiên cứu: đo bộ chấm và cổng chất lượng bằng Accuracy, Precision, Recall, F1, Cohen's κ; áp MAST đầy đủ (đóng P-14)

Gói nhỏ: tối đa 3 hạng mục, ngân sách 4M token. Không sửa `src/` hay `bench/`. Phân loại dữ liệu: **Nội bộ** (bài tổng hợp, không có DLCN).

## Vì sao
- Giám đốc (3/11) hỏi bộ đo hiện có **Accuracy, Recall, Precision, F1, Cohen's κ** chưa, kèm hai tài liệu tham khảo: Anthropic, "How we built our multi-agent research system", và Cemri et al., "Why Do Multi-Agent LLM Systems Fail?" (arXiv 2503.13657, MAST).
- Hiện trạng do người giao việc rà (phòng tự kiểm lại):
  - Precision, Recall, F1 chỉ có ở bộ chấm `s1` (`bench/vs-claude/lib/grade.mjs:80-101`, điểm = F1 trên lỗi cài sẵn). `citationPrecision` của `re1` thực chất là "id hợp lệ" (SR-18).
  - Accuracy chưa có tên riêng; tỉ lệ test ẩn đạt và `pass` đóng vai trò này.
  - **Cohen's κ: chưa có ở đâu.** `paper.md` và `challenges.md` P-14 ghi rõ phân nhóm FM-1/2/3 do một người gán, MAST mới đọc tóm tắt.
  - Bộ chấm checklist (`a1`, `r1`) dùng LLM judge (Opus, từng mục có/không) khi bật `--judge`, nếu không thì dùng regex. Chưa ai đo hai cách chấm này khớp nhau đến đâu, dù `preregistration.md` đã ghi lỗi regex (`sign` khớp "design", bỏ sót "1,4 TB").
  - MAST kiểm bộ chú thích LLM bằng đúng 5 chỉ số này so với nhãn người (Bảng 2 bản v3); κ giữa người chú thích là 0,88. Đây là mẫu để CCoding làm theo.

## Hạng mục

**M1 — data-scientist (methodologist duyệt thiết kế): lớp chỉ số "bộ chấm và cổng như bộ phân loại"**
1. Viết `docs/research/analysis/agreement.mjs` và `agreement.test.mjs` (`node --test`):
   - Đầu vào: các cặp nhãn (tham chiếu, dự đoán), nhị phân hoặc nhiều lớp.
   - Đầu ra: ma trận nhầm lẫn, Accuracy, Precision, Recall, F1 (nhị phân; macro-F1 cho nhiều lớp), Cohen's κ, tỉ lệ dương (prevalence), PABAK.
   - CI bootstrap 95 % lấy mẫu lại **theo lượt chạy**, không theo mục, vì các mục trong một lượt tương quan. Seed cố định.
   - Luôn in số dương thật và số mẫu. Khi prevalence > 0,9 hoặc < 0,1, in cảnh báo "nghịch lý κ" và báo kèm PABAK, vì hầu hết ô đang chạm trần.
   - Test có ví dụ tính tay: κ = 0, κ = 1, một ca nghịch lý prevalence, một ca 3 lớp.
2. Áp vào ba phép so, **gộp mọi arm và không in điểm theo arm** (giữ quy tắc không phân tích giữa chừng, `preregistration.md` §4):
   - **(a) Judge so với regex:** chỉ dùng các dòng đã có judge trong ảnh chụp 276 dòng đã phân tích ở bước 4 (`git show 838a5f1:bench/vs-claude/results/study-cloud/runs.jsonl`, sha256 `85db4ddb…`, xem `results/study-cloud-step4/README.md`). Chấm lại bằng regex ngay trên tệp đã lưu (`results/study-cloud/artifacts/<khóa>/_FINAL.txt`, `SPEC.md`…), bằng cách import hàm của `lib/grade.mjs` mà không bật judge. Không gọi LLM. Báo ở mức từng mục checklist. Đây là độ khớp (κ), không phải độ đúng, vì không bên nào là chuẩn vàng.
   - **(b) Bộ nhãn vàng (chỉ chuẩn bị):** tạo `docs/research/analysis/gold-sheet.csv`, khoảng 60 mục checklist chọn phân tầng theo bài và mục. Ẩn arm, xáo thứ tự bằng seed, mỗi dòng có đoạn trích đủ để người đọc quyết định. Kèm hướng dẫn gán nhãn một trang. Giám đốc sẽ tự quyết có gán nhãn hay không. Khi có nhãn, cùng script cho Accuracy/P/R/F1/κ của judge và regex so với nhãn người, giống Bảng 2 của MAST.
   - **(c) Cổng chất lượng như bộ phát hiện lỗi:**
     - Dương thật: đầu ra có lỗi thật (test ẩn < 100 % hoặc lệnh kiểm tra còn đỏ).
     - Dự đoán dương: cổng chặn hoặc đẩy vào vòng sửa (B-02, B-10, nghiệm thu CTO "không đạt").
     - Dùng dữ liệu đã có: `analysis/b02m-replay.md`, C1–C9 (`results/phases.csv`, `calls.csv`), cột `byPhase` của ảnh chụp 276 dòng.
     - Ghi rõ đo được gì, không đo được gì. Nếu số dương thật < 10, ghi "recall chưa ước lượng được". Tính số lượt **bài cài lỗi** cần có để nửa độ rộng CI của recall ≤ 0,15. Ghi thành đề xuất **B-12** trong `improvement-backlog.md`, không chạy.
3. Ghi các phân tích này vào `preregistration.md` bản 2.2 dưới dạng **phân tích phụ/khám phá**, ngoài họ Holm. Thêm một dòng vào bảng §9 "Sai lệch so với đăng ký": thêm sau khi đã bắt đầu thu dữ liệu, lý do là yêu cầu của giám đốc ngày 3/11. Kết quả ghi vào `docs/research/analysis/agreement.md`, kèm hash dữ liệu.

**M2 — literature-researcher (đọc nguồn); methodologist và research-lead (hai người gán nhãn độc lập): áp MAST đầy đủ, đóng P-14**
1. Đọc **toàn văn** MAST v3 (`https://arxiv.org/html/2503.13657v3`) và bài Anthropic. Cập nhật `related-work.md` §2.12 và mục Anthropic, mỗi số kèm mục hoặc bảng của nguồn. Người giao việc đọc được các số sau; phòng phải tự kiểm lại:
   - **MAST:**
     - 14 kiểu lỗi FM-1.1…FM-3.3, 3 nhóm.
     - κ người–người 0,88.
     - Bộ chú thích LLM o1 few-shot: Accuracy 0,94; Recall 0,77; Precision 0,833; F1 0,80; κ 0,77.
     - Can thiệp ChatDev: +9,4 % (đặc tả vai trò) và +15,6 % (thêm bước kiểm chứng).
   - **Anthropic:**
     - Agent dùng khoảng 4 lần token so với chat; hệ đa agent khoảng 15 lần.
     - Riêng lượng token giải thích 80 % phương sai hiệu năng BrowseComp.
     - Hệ đa agent hơn agent đơn 90,2 % trên bộ đánh giá nội bộ.
     - Phần lớn bài coding có ít việc con song song được.
   - Liên hệ với kết quả của ta: B0/A0-sonnet ×5,68 token, làn đơn B7 ×2,50. Chỉ so hướng, vì khác loại bài và cách đo. Đây là căn cứ tài liệu cho quyết định "việc nhỏ dùng agent đơn, việc lớn mới dùng multi-agent".
2. **Sửa trích dẫn không nhất quán**, ghi vào `CHANGELOG.md`:
   - Nơi xuất bản của MAST: `references-v2.md` và `paper.md` ghi NeurIPS, trang arXiv v3 không ghi. Kiểm và thống nhất.
   - URL bài Anthropic: `/engineering/built-multi-agent-research-system` và `/research/multi-agent-research-system` đang dùng lẫn. Chọn URL chuẩn.
   - Tệp cần sửa: `related-work.md`, `references-v2.md`, `paper.md` (chỉ phần trích dẫn), `challenges.md`.
3. **Gán nhãn MAST cho 49 thách thức C-01…C-49** của `challenges.md`. Nhãn là một trong 14 mã FM, `INF` (hạ tầng) hoặc `NA` (ngoài MAST).
   - Methodologist ghi vào `docs/research/analysis/mast-labels-A.csv`, research-lead ghi vào `mast-labels-B.csv`. Hai hạng mục con chạy độc lập: **không đọc tệp của người kia trước khi cả hai xong**, và không thảo luận nhãn trong pha họp.
   - Sau đó data-scientist dùng `agreement.mjs` tính κ ở hai mức: 14 kiểu lỗi và 3 nhóm + INF.
   - Phân xử chỗ lệch. Ghi nhãn cuối vào `challenges.md` (thêm cột FM chi tiết) và kết quả vào `agreement.md`.
   - Ghi giới hạn: hai người gán là hai agent cùng họ mô hình, nên κ này không phải κ người–người. So với mốc của MAST (người–người 0,88; LLM–người 0,77) chỉ để định vị.

**M3 — peer-reviewer: review M1, M2**
- Mỗi số trong `related-work.md` có truy được về mục hoặc bảng của nguồn không?
- `agreement.mjs` có test tính tay không?
- (a) và (c) có thật sự gộp arm, không lộ điểm theo arm không?
- κ có kèm prevalence/PABAK khi gần trần không?
- Hai tệp nhãn có thật sự độc lập không? Kiểm bằng thứ tự commit và nội dung pha họp.
- Kiểm bằng kết quả "🧪 Lệnh kiểm tra của dự án" do CCoding tự chạy.

## Không làm ở gói này
- Không gọi LLM judge mới. Không đọc hay phân tích các dòng `study-cloud` sau ảnh chụp 276 dòng (W3 trở đi), vì nghiên cứu đang chạy.
- Không viết lại paper hay slide, ngoài phần trích dẫn ở M2.2.
- Không gán nhãn vàng thay giám đốc.
