# Dàn ý trình bày với thầy hướng dẫn — CCoding

> Hạng mục S7 · @research-lead · bản nháp 2/11/2026 · phân loại: nội bộ. Thời lượng gợi ý 20–25 phút + 15 phút hỏi đáp.
> Số liệu lấy nguyên từ `performance/token-analysis.md` (bảng T-a…T-f), bảng thách thức từ `challenges.md`, điểm mới từ
> `related-work.md` (K.1–K.3), khuyến nghị từ `publication-plan.md`. **C6: chưa có dữ liệu.** Mọi CI là **minh họa** (n = 1–2 mỗi ô).
> **Liêm chính:** đây là bản nháp do hệ đa tác tử soạn. Tom cần nói rõ với thầy phần nào do AI hỗ trợ, đối chiếu quy định liêm chính và
> chính sách dùng AI của trường, và tự kiểm mọi số liệu, trích dẫn trước khi trình bày (xem `publication-plan.md` §8).

## Thông điệp chính (nói ở slide 1, lặp ở slide cuối)

1. Xây và vận hành được một hệ multi-agent lập trình có quản trị sub-agent chặt: quyền 4 mức, hook, ngân sách, nhãn dữ liệu.
2. **Đo thật cho thấy multi-agent không tự nhiên nhanh hơn hay rẻ hơn.** Thiết kế ban đầu chậm và đắt gấp khoảng 2 lần. Làn nhanh đưa thời gian về ngang Claude Code, nhưng chi phí vẫn +21.8%.
3. Đóng góp nằm ở **phép đo và bài học vận hành**, không nằm ở kiến trúc. Kiến trúc đã có ở CAID và TeamBench, nên bài không phải công bố lại nếu đặt đúng trục.
4. Khuyến nghị: **một bài chính** (thực nghiệm), **một bài ngắn tùy chọn** (taxonomy lỗi), tự cải thiện để thành đề tài sau.

## Dàn ý slide (16 slide)

| # | Tiêu đề | Ý chính (nói) | Hình/bảng nên dùng |
|---|---|---|---|
| 1 | Đề tài và thông điệp | 4 thông điệp ở trên | Một câu kết luận + logo/sơ đồ nhỏ |
| 2 | Bối cảnh và câu hỏi | Tranh luận multi- và single-agent (Hadfield et al., 2025; Yan, 2025); RQ1–RQ6 gói thành 3 câu: hệ thế nào, tốn bao nhiêu, lỗi gì | Danh sách RQ rút gọn |
| 3 | Công trình gần nhất | CAID (Geng & Neubig, 2026): worktree + gộp + test, điểm tăng nhưng thời gian và chi phí cũng tăng (PaperBench 1803.5 → 2080.4; 3.3 → 9.3). TeamBench (Kim et al., 2026): tách quyền, verifier duyệt 49% bài lẽ ra bị loại | Bảng K.1 (E1–E10) rút gọn còn 5 dòng |
| 4 | Kiến trúc CCoding | Văn phòng nhiều phòng ban; pha route → plan → (discuss → finalize) → execute → review → revise → synthesize; worktree con song song; làn nhanh và làn đầy | Sơ đồ pha (vẽ từ `docs/ARCHITECTURE.md`) |
| 5 | Giới hạn sub-agent | Quyền `none/read/write/exec`; hook chặn lệnh, đường dẫn, nhánh, stdin; ngân sách token, thời gian, vòng; `maxParallel`; Data Protection Gate; KPI | Bảng L1–L15 (`challenges.md` §2), chỉ giữ cột "Cơ chế" và "Bằng chứng hiệu quả". Tô màu các ô "chưa đo" |
| 6 | Phương pháp benchtest | 5 bài, 461 test ẩn, cùng đề, baseline Claude Code thuần; vòng C1–C5; đo token vào/ra, cache đọc/ghi, thời gian theo lượt gọi | Sơ đồ quy trình + bảng T-0 (đơn vị, đối chiếu) |
| 7 | Chất lượng ngang nhau | Hai hệ gần như đạt trọn test ở mọi vòng, nên phép so quy về thời gian và chi phí | Cột "Test ẩn đạt/tổng" của **T-a** |
| 8 | Kết quả âm tính ở thiết kế ban đầu | C1: +169.4 s [117.1; 223.1], +0.610 USD [0.440; 0.784] | **T-f** dòng C1, C2 (biểu đồ thanh có CI) |
| 9 | Làn nhanh (C5) | Thời gian +21.1 s, CI chứa 0. Nhanh hơn ở t1, t4, t5 và chậm hơn ở t2, t3 (t3 có lượt treo stdin 579 s). Chi phí +21.8% [11.5; 32.1] | **T-a** (các dòng C5) + **T-f** dòng C5 và dòng độ nhạy. Nói rõ phân tích độ nhạy là hậu nghiệm |
| 10 | Vì sao ghi cache nhiều | Gấp 4.71× (C1), 6.08× (C2), 3.34× (C5); con số "2,8–4×" chỉ đúng một phần. Mỗi lượt gọi là một tiến trình mới; tiền tố cố định chỉ 2 588 token mỗi lượt gọi. Nội dung đọc lại mới là phần lớn | **T-b** (dòng GỘP) + **T-e1** |
| 11 | Thời gian đi đâu | `execute` song song đạt hệ số 2.02 ở C5 (1.27 ở C1). Tiết kiệm nhờ song song 30.5%. `review` 81.3 s thành pha dài nhất | **T-d** (1) và (2), biểu đồ Gantt theo pha C1 so với C5 |
| 12 | Tối ưu nào đáng làm | O6 (opus → sonnet) lớn nhất, đã áp dụng. O1–O5 mỗi cái ≤ 5.1%. Chi phí C5: ghi cache 49.4%, đầu ra 38.1%. Đòn bẩy thật là giảm số tiến trình và đọc lặp | **T-e** + **T-c** (tỷ trọng ghi cache theo pha) |
| 13 | Thách thức khi vận hành | 49 thách thức: 26 đã đóng, 19 giảm nhẹ, 4 còn mở (C-13, C-14, C-23, C-49). Ví dụ: treo stdin (C-47), cách ly cấu hình đưa ngữ cảnh 93k → 7,6k token (L12) | Bảng đếm nhóm × trạng thái (`challenges.md` §3) + 3–4 dòng tiêu biểu từ bảng 1.1–1.4 |
| 14 | Tự cải thiện sub-agent | Vòng 7 bước; bản vá P1–P4 dạng diff; cổng A/B có bộ bài giữ lại; giám đốc duyệt; rollback. **Chưa có số đo** | Sơ đồ vòng (`self-improvement/design.md` §3) + bảng P1–P4 |
| 15 | Điểm mới và công bố | Đã có (E1–E10) và có thể mới (N1, N5 Trung bình; N3, N4 Thấp–TB). Phương án A/B/C và khuyến nghị | Bảng §0 và §2 của `publication-plan.md` |
| 16 | Giới hạn, lộ trình, xin ý kiến | n nhỏ; bài ngắn; một runtime; C5 lẫn hiệu ứng mô hình; 24/31 nguồn chỉ đọc tóm tắt. Lộ trình tới FSE 2027 Industry (23/1/2027). Bốn câu xin ý kiến thầy | Bảng lộ trình (§6) + danh sách câu hỏi |

Dự phòng (phụ lục, chỉ mở khi được hỏi): bảng T-c đầy đủ của C1; bảng thách thức đầy đủ; danh sách 15 vấn đề còn tồn tại P-01…P-15; điều kiện D1–D11.

## Câu thầy có thể hỏi và câu trả lời gợi ý

1. **"Cái này khác CAID ở đâu? Có phải làm lại không?"**
   Về kiến trúc thì không khác nhiều, và em không nhận là mới. CAID đăng từ 3/2026. Phần khác là phép đo: em tách cache đọc và ghi, đo thời gian theo từng pha và từng lượt gọi, và so với Claude Code thuần trên cùng bài có test ẩn. Hệ của em còn có làn nhanh và hook quyền. Kết quả cùng chiều CAID (đắt hơn, không nhanh hơn rõ), nên có giá trị như một bằng chứng độc lập, và chỉ ra được pha nào gây tốn. Em cũng mới đọc một phần CAID nên chưa loại trừ được việc họ có đo cache ở phần chưa đọc (D8).

2. **"n = 2 thì kết luận được gì?"**
   Chưa kết luận khái quát được. Em chỉ dùng CI bootstrap để minh họa độ bất định, và CI này còn hẹp giả tạo. Trước khi nộp em cần ít nhất 5–6 lượt mỗi ô, kiểm định khai báo trước theo mô hình hỗn hợp hoặc hoán vị phân tầng theo bài, kèm bài dài hơn 15 phút (D1, D3, D4).

3. **"So sánh có công bằng không, khi hai bên dùng mô hình khác nhau?"**
   Chưa công bằng hoàn toàn. Ở C5 Claude Code dùng opus còn CCoding dùng sonnet, nên đây là so sánh **cả hệ thống**, chưa tách được hiệu ứng multi-agent. Thí nghiệm bổ sung sẽ chạy cùng mô hình, hoặc thêm nhánh đơn agent dùng sonnet (D2).

4. **"Kết quả âm tính thì đăng ở đâu?"**
   Track công nghiệp/kinh nghiệm, như FSE 2027 Industry, chấp nhận bài kiểu này. Câu hỏi "khi nào multi-agent đáng tiền" đang được tranh luận (Hadfield et al., 2025; Yan, 2025; Kapoor et al., 2024), nên kết quả âm tính có đo đạc kỹ vẫn có ích. Em không khẳng định trước là bài sẽ được nhận.

5. **"Vì sao không cộng các tối ưu O1–O5 lại?"**
   Đó là ước lượng độc lập trên dữ liệu có sẵn, chưa chạy lại hệ thống. O3 và O4 còn chồng lấn nhau. Cộng lại sẽ thành khẳng định chưa đo. Ước lượng cho thấy mỗi tối ưu nhỏ (≤ 5.1%), nên em ưu tiên giảm số tiến trình và rút ngắn pha review.

6. **"Phân loại MAST có đáng tin không?"**
   Hiện mới một người gán nhãn và em mới đọc tóm tắt MAST, nên chỉ dùng tên 3 nhóm. Trước khi nộp bài taxonomy cần người thứ hai gán độc lập, báo độ đồng thuận (κ) và đọc toàn văn MAST (D9, P-14). Số thách thức là số sự cố được ghi lại, không phải tần suất thật.

7. **"Sub-agent bị giới hạn thật chưa, hay chỉ trong prompt?"**
   Một phần được cưỡng chế bằng mã: quyền công cụ theo pha, hook PreToolUse chặn lệnh, đường dẫn, nhánh và stdin. Một phần vẫn là ràng buộc mềm, ví dụ hợp đồng song song (P-15). Hook kiểm theo mẫu chuỗi, chưa phải sandbox hệ điều hành, và chưa kiểm thử đối kháng (P-03). Đa số cơ chế chưa có số đo hiệu quả trước/sau.

8. **"Tự cải thiện có tự sửa prompt không? Có an toàn không?"**
   Không tự áp dụng. Agent ghi sự cố và đề xuất bản vá dạng diff. Bản vá phải qua cổng A/B có bộ bài giữ lại, rồi giám đốc duyệt, và có phiên bản để rollback. Dữ liệu đi qua `LogStore` để che PII. Hiện mới có thiết kế và 4 bản vá chưa đo, nên phần này em để thành đề tài sau.

9. **"Dữ liệu của dự án thật có lộ ra không?"**
   Dự án A được ẩn danh trong bản thảo. Dữ liệu benchtest là tổng hợp, nhãn Công khai. Một số tài liệu nguồn vẫn còn chuỗi nội bộ (P-13), nên em không trích nguyên văn chúng và sẽ rà trước khi mở mã/dữ liệu (D7).

10. **"Một bài hay mấy bài? Có bị coi là cắt nhỏ không?"**
    Một bài chính về thực nghiệm, cộng một bài ngắn tùy chọn về taxonomy. Hai bài trả lời hai câu hỏi khác nhau, trích lẫn nhau và không lặp bảng số. Không viết bài riêng về kiến trúc vì trùng CAID.

11. **"Em dùng AI viết những gì? Có vi phạm quy định không?"**
    Các bản nháp, script phân tích và tổng quan được hệ CCoding soạn. Em chịu trách nhiệm kiểm và viết lại. Em sẽ khai báo theo quy định của ACM/IEEE/arXiv: AI không đứng tên, khai ở Acknowledgements. Em xin thầy hướng dẫn thêm về quy định của trường. Một điểm cần khai tách bạch: LLM vừa là đối tượng nghiên cứu, vừa là công cụ soạn thảo.

12. **"Khi nào multi-agent nhanh hơn?"**
    Với dữ liệu hiện có, chỉ khi chia được các hạng mục độc lập để chạy song song: hệ số 2.02 ở C5, nhanh hơn ở t1, t4, t5. Với bài dài và nhiều hạng mục thì có thể lợi hơn, nhưng đây mới là giả thuyết, vì em chưa có bài nào dài hơn 15 phút.

## Câu xin ý kiến thầy (slide 16)

1. Nên nhắm track công nghiệp (FSE Industry) hay track nghiên cứu?
2. Cần tối thiểu bao nhiêu lượt lặp, bài lớn hoặc SWE-bench thì đủ thuyết phục?
3. Có cần một bài hội nghị hoặc tạp chí trong nước để tính điểm/chương trình không?
4. Quy định khai báo dùng AI của trường áp dụng thế nào cho đề tài mà AI vừa là đối tượng vừa là công cụ?

## Tài liệu tham khảo

Xem danh mục APA 7 ở cuối `publication-plan.md` (Cemri et al., 2025; Geng & Neubig, 2026; Hadfield et al., 2025; Kapoor et al., 2024; Kim et al., 2026; Lumer et al., 2026; Yan, 2025).
