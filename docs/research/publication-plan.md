# Kế hoạch công bố — CCoding (RQ6)

> Hạng mục S7 · Phòng Nghiên cứu · @research-lead · bản nháp 2/11/2026; **v2 (vòng 2, S5 · @methodologist) cập nhật theo C6–C7 và hạn hội nghị** · phân loại: nội bộ · chuẩn trích dẫn APA 7.
> Đầu vào: `related-work.md` (S1/S5, mục "Kết luận điểm mới" K.1–K.4), `performance/token-analysis.md` (bảng T-a…T-i; T-h, T-i và T-d (3) mới ở v2),
> `references-v2.md` (tác giả đủ, venue), `challenges.md` (C-01…C-49, L1–L15, P-01…P-15), `self-improvement/design.md` (P1–P4).
> Số liệu CCoding lấy nguyên từ các tệp trên, không tính lại. **Dữ liệu có C1–C7.** C6 = 4 lượt làn nhanh so với 4 lượt Opus (chỉ t3, t5). C7 = Claude Code bằng Sonnet (2 lượt mỗi bài) chạy cùng lúc với làn nhanh (1 lượt mỗi bài). Mọi kết quả là **minh họa** (n nhỏ, p hoán vị bị chặn bởi số hoán vị).
> Hạn nộp và chính sách tra ngày 2/11/2026; mục nào chỉ thấy qua trang tổng hợp hoặc bài tóm lược thì ghi **cần kiểm chứng**.
> Đây là **bản nháp để Tom sở hữu**, do hệ đa tác tử soạn. Trước khi dùng phải đối chiếu quy định liêm chính học thuật và chính sách dùng AI
> của trường (xem §8).

## 0. Trả lời trực tiếp ba câu hỏi

| Câu hỏi | Trả lời | Mức chắc chắn |
|---|---|---|
| **1 hay nhiều bài?** | **Một bài chính cho giai đoạn này**, cộng **một bài ngắn tùy chọn** (báo cáo kinh nghiệm + taxonomy thách thức). Bài thứ ba về tự cải thiện **chỉ viết khi có số đo A/B**. Không viết bài riêng mô tả kiến trúc. Thứ tự: hoàn thiện thí nghiệm → đăng arXiv → nộp hội nghị (phương án **B rút gọn kết hợp C**, §2). | Trung bình. Phụ thuộc việc Phòng Phát triển chạy kịp thí nghiệm bổ sung (§4) |
| **Khác gì, hơn gì?** | Ý tưởng kiến trúc **không** mới: worktree song song + tự gộp + kiểm chứng bằng test đã có ở CAID (Geng & Neubig, 2026); tách quyền theo vai + verifier đã có ở TeamBench (Kim và cộng sự, 2026) và AgentCoder; vòng phê bình–sửa đã có ở Self-Refine/Reflexion (K.1, E1–E10). Phần **có thể** mới nằm ở **phép đo và vận hành**: (N1) đo cache/token/thời gian theo từng lượt gọi và từng pha, so với Claude Code thuần trên cùng bài có test ẩn. Đã đọc toàn văn CAID: bài này chỉ có tổng thời gian, không có thời gian theo pha và không đo cache (`references-v2.md` §2.1); (N5) nhật ký 49 thách thức từ một hệ vận hành thật, phân loại theo MAST + nhóm hạ tầng; (N3) làn nhanh/làn đầy, nay đo cả với một agent Sonnet chạy cùng lúc (C7, T-h, T-i). | N1, N5: Trung bình. N3: Thấp–Trung bình (kết quả âm tính, mục §0 bên dưới). N4 (tự cải thiện có người duyệt): Thấp–Trung bình, chưa có số đo. Mọi mức chỉ ở dạng "chưa thấy trong phần đã đọc": chỉ CAID, Don't Break the Cache và Cognition 2026 được đọc toàn văn (`references-v2.md` §5), phần còn lại mới đọc tóm tắt |
| **Có phải công bố lại không?** | **Nếu chỉ trình bày kiến trúc thì phần lớn là công bố lại / trùng ý** (CAID có trước, 3/2026). **Nếu trục bài là phép đo chi phí–thời gian–cache so với một coding agent đơn mạnh và bài học vận hành thì không phải công bố lại**, với điều kiện trích CAID, TeamBench và MAST ngay ở mở đầu, và không dùng chữ "chúng tôi đề xuất" cho E1–E10. | Trung bình |

**Kết luận RQ3 (v2, thay kết luận v1 chưa tách hiệu ứng mô hình).** Khi cùng mô hình Sonnet và cùng thời điểm (C7), một agent nhanh hơn làn nhanh 1,6–2,9× ở 4/5 bài (làn nhanh gộp C5–C7; 1,7–2,5× nếu chỉ dùng lượt C7). Làn nhanh chỉ hòa ở t5, bài có nhiều module độc lập (T-h). Chênh lệch trung bình +38,0 s, p hoán vị 0,0329 (T-i). Lợi thế của làn nhanh so với Opus chủ yếu đến từ mô hình: Sonnet đơn nhanh hơn Opus 90,8 s, còn làn nhanh chỉ nhanh hơn Opus 28–35 s (T-i). Chi phí của làn nhanh bằng 2,5–3,8× Sonnet đơn, p hoán vị 0,0041 (T-h, T-i). Chi phí cố định của điều phối (kế hoạch, review, gộp) bằng 55,8% thời gian Sonnet đơn cần cho 5 bài ở C7 (72,8% khi gộp C5–C7), và ở t2, t4 đã gần bằng hoặc vượt thời gian một agent làm xong cả bài (94,9% và 113,1%) (T-d (3)). **Đây là minh họa:** C7 chỉ có 1 lượt làn nhanh và 2 lượt Sonnet mỗi bài; p nhỏ nhất bị chặn ở 1/243; 8 phép kiểm định, không hiệu chỉnh so sánh bội, nên các p ≈ 0,03 không vững nếu hiệu chỉnh; CI bootstrap của hàng C7 hẹp giả tạo nên không trích.

Kết quả chính có thể nói (T-a, T-b, T-d, T-f, T-h, T-i; minh họa, n = 1–5 mỗi ô):
- Thiết kế ban đầu (C1, C2) chậm hơn và đắt hơn Claude Code khoảng gấp đôi: C1 +169.4 s, +0.610 USD, CI không chứa 0 (T-f). Đây là **kết quả âm tính**.
- Làn nhanh (C5) có chênh thời gian +21.1 s, CI [−22.6; 64.9] chứa 0. Chi phí vẫn cao hơn +21.8% [11.5; 32.1] (T-f).
- Làn nhanh (C6, chỉ t3 và t5, 4 lượt mỗi hệ) nhanh hơn Opus 72.8 s, CI [−105.3; −40.3], **p hoán vị 0,0556** (36 hoán vị, p nhỏ nhất có thể 2/36), chi phí +0.136 USD [−0.016; 0.287], p 0,3889 (T-f). Hiệu ứng này lẫn mô hình nên không chứng minh lợi ích của điều phối.
- **Tách hiệu ứng mô hình (C7, T-h, T-i):** làn nhanh − Sonnet đơn = +38,0 s (+44,3%), p hoán vị 0,0329; chi phí +0,441 USD, p 0,0041. Sonnet đơn − Opus = −90,8 s, nhưng hàng này khác thời điểm. Chất lượng: Sonnet đơn đạt trọn test ẩn 10/10 lượt, làn nhanh 17/18 (T-h).
- **Điều kiện có thể có lợi, chỉ là giả thuyết:** việc chia được thành phần độc lập và đủ lớn; bài đủ dài. Gợi ý: t5, phần `execute` song song của làn nhanh 79,4 s so với 165,5 s của Sonnet đơn (T-d (3)); phần cố định ở C7 chỉ 38,5–58,6 s dù Sonnet đơn cần 41,5–165,5 s. Bài dài nhất trong dữ liệu là t5 của Opus, 259 s (~4 phút), nên cần bài > 15 phút (D4) để kiểm.
- Hướng này khớp CAID: chi phí tăng, thời gian không giảm đáng kể (Geng & Neubig, 2026). **Điểm khác**: CCoding đo thêm được cache và đường găng theo pha, nên chỉ ra được **chỗ** mất thời gian và tiền. Ở C5, `review` 81.3 s dài hơn đường găng `execute` 76.9 s (T-d). Ghi cache chiếm 49.6% chi phí và tiền tố cố định chỉ 2 350 token mỗi lượt gọi (T-e, T-e1).
- **Lượt C7 t2 (52/60) cần đọc đúng.** Sáu test hỏng của #3 (mua X tặng Y) và hai test của #4 (hạn mã theo UTC). Dữ liệu cho thấy reviewer **đã bắt được** (`approved: false`, nêu đúng `freeUnits` và `checkValidity`), nhưng hạng mục sở hữu `src/promotions.js` không chạy và không có pha revise (T-h, mục kiểm lượt C7 t2). Vì vậy lượt này **không** dùng làm bằng chứng "verifier LLM bỏ sót" để đối chiếu TeamBench; đọc hợp lý là một điểm yếu của điều phối (hạng mục bị rơi, tín hiệu review không kích hoạt vòng sửa). Chỉ 1 lượt. *(Lệch so với BRIEF-2 và quyết định kế hoạch: theo số liệu S1.)*

## 1. Căn cứ điểm mới (từ S5) — dùng chung cho các phương án

| Mã | Nội dung | Có thể mới? | Bằng chứng trong repo |
|---|---|---|---|
| E1 | Manager + kế hoạch phụ thuộc + worktree + tự gộp + test | Không (CAID) | — |
| E2 | Tách quyền theo vai, verifier độc lập | Không (TeamBench, AgentCoder) | L1–L4, L15 |
| E7 | Tiền tố ổn định để giữ cache (O1) | Không (Lumer và cộng sự, 2026; chỉ đo một agent tìm kiếm web, `references-v2.md` §2.2) | T-e: O1 trần trên 4.6% |
| E8 | Quy trình cố định thay agent tự do | Không (Agentless) | — |
| E10 | Phân loại lỗi MAS | Không (Cemri và cộng sự, 2025): chỉ dùng làm khung | challenges.md §0 |
| N1 | Cache/token/thời gian theo pha so với Claude Code thuần | Trung bình (CAID không có thời gian theo pha, không đo cache) | T-a…T-f, T-h, T-i |
| N2 | O1–O6 đo tách từng yếu tố | Thấp–TB: hiện chỉ có **ước lượng** | T-e (chưa chạy lại) |
| N3 | Làn nhanh/làn đầy, đo cùng mô hình và cùng thời điểm với một agent Sonnet (D2 mới có một phần) | Thấp–TB: chưa tra riêng "routing/adaptive compute". **Kết quả âm tính:** làn nhanh chậm hơn Sonnet đơn +38,0 s (p hoán vị 0,0329) và đắt 2,5–3,8×; chỉ hòa ở t5. Chi phí cố định điều phối bằng 55,8% thời gian Sonnet đơn. Minh họa, 1 lượt làn nhanh mỗi bài ở C7 | T-d (3), T-h, T-i |
| N4 | Tự cải thiện có người duyệt + cổng A/B | Thấp–TB: chưa có số đo | design.md |
| N5 | Nhật ký thách thức của hệ vận hành thật | Trung bình | C-01…C-49 |
| N6 | Quản trị dữ liệu trong MAS coding | Thấp: là đặc điểm hệ thống | L13 |

## 2. Ba phương án

### Phương án A — Một bài "hệ thống + đánh giá"

- **Nội dung:** kiến trúc văn phòng (RQ1), giới hạn sub-agent (RQ2), benchtest (RQ3), thách thức (RQ4), tự cải thiện (RQ5) trong cùng một bài.
- **Khác gì/hơn gì:** khác CAID ở chỗ có làn nhanh, hook quyền, cache theo pha và nhật ký vận hành (N1, N3, N5). Phần "hệ thống" lại trùng E1, E2, E8.
- **Ưu:** chỉ một lần viết, một lần ẩn danh, câu chuyện liền mạch.
- **Nhược:** phản biện sẽ đọc phần lớn bài như công bố lại kiến trúc của CAID. Năm câu hỏi nghiên cứu dàn trải, mỗi câu mỏng. Phần N4 không có số đo làm yếu cả bài. Bài vượt giới hạn 10 trang của hội nghị SE.
- **Đánh giá:** **không khuyến nghị**.

### Phương án B — Tách 2–3 bài

| Bài | Trục | Khác gì/hơn gì (S5) | Trạng thái dữ liệu | Khuyến nghị |
|---|---|---|---|---|
| B1 — Hệ thống/quản trị sub-agent | Kiến trúc, quyền 4 mức, hook, ngân sách, Data Protection Gate | Chủ yếu E1, E2, N6 (Thấp) | L1–L15 phần lớn ghi "chưa đo" | **Không viết riêng.** Đưa thành mục "Hệ thống" của B2 |
| B2 — Thực nghiệm multi vs single: thời gian/chi phí/cache | N1 (+ N3, N2 nếu có đo) | Đặt cạnh CAID: cùng hướng kết quả, nhưng đo theo pha, tách cache đọc/ghi, so với Claude Code thuần, có làn nhanh | Có T-a…T-i (C1–C7) nhưng n = 1–5 mỗi ô, C7 chỉ 1 lượt làn nhanh và 2 lượt Sonnet mỗi bài, 5 bài ngắn (≤ ~4 phút), một mô hình ở C7 | **Bài chính**, sau thí nghiệm bổ sung (§4). Trục bài: kết quả âm tính khi tách hiệu ứng mô hình + chi phí cố định của điều phối |
| B3 — Báo cáo kinh nghiệm + taxonomy thách thức | N5 | MAST phân tích vết của hệ khác; đây là nhật ký của một hệ tự xây, có nhóm INF | Có 49 C-xx có bằng chứng; mới một người gán nhãn (P-14) | **Bài ngắn tùy chọn** (workshop/hội nghị trong nước) |
| (B4) — Tự cải thiện có người duyệt | N4 | Khác Reflexion/DSPy ở người duyệt + ít mẫu | Chưa có số đo | **Hoãn** tới khi P1–P4 qua cổng A/B |

- **Ưu:** mỗi bài có một đóng góp rõ, nên khó bị gọi là công bố lại.
- **Nhược:** B2 và B3 dùng chung bối cảnh. Phải tránh **công bố trùng lặp (salami slicing)**: mỗi bài trích bài kia, không lặp bảng số, B3 không chứa T-a…T-f.

### Phương án C — Báo cáo kỹ thuật arXiv trước, rồi hội nghị

- **Nội dung:** đăng báo cáo kỹ thuật đầy đủ (A) lên arXiv để có mốc thời gian, sau đó rút gọn thành bài hội nghị.
- **Khác gì/hơn gì:** như A. arXiv **không** xác lập ưu tiên với CAID, vì CAID đăng từ 3/2026.
- **Ưu:** công khai sớm, nhận góp ý, mở được mã/dữ liệu.
- **Nhược:**
  - arXiv yêu cầu tác giả chịu trách nhiệm về nội dung và khai báo việc dùng công cụ AI đáng kể (§8). Một bản do hệ đa tác tử soạn mà đăng vội, chưa kiểm số và trích dẫn, là **rủi ro cao**. (Đã bỏ tin về "lệnh cấm một năm" của v1 vì không tìm được nguồn chính thức: `references-v2.md` §4.)
  - Hội nghị ẩn danh hai chiều có thể có quy định riêng về preprint (**cần kiểm chứng** theo từng nơi).
  - Người đăng arXiv lần đầu có thể cần endorsement (**cần kiểm chứng**).
- **Đánh giá:** chỉ dùng **sau khi** B2 có số liệu đủ điều kiện §4, không đăng bản hiện tại.

### Khuyến nghị: B rút gọn + C có điều kiện

1. **B2 là bài chính**, gồm phần hệ thống ngắn và phần giới hạn sub-agent làm bối cảnh. Đăng arXiv khi đủ điều kiện §4, rồi nộp hội nghị.
2. **B3 là bài ngắn tùy chọn**, chỉ nộp nếu có người gán nhãn thứ hai và đã ẩn danh xong (P-13, P-14).
3. B4 tách thành đề tài sau. B1 không viết riêng.

## 3. Nơi đăng (tra 2/11/2026)

| Nơi | Loại | Hạn nộp | Phù hợp | Ghi chú / nguồn |
|---|---|---|---|---|
| ICSE 2027 SEIP | Hội nghị SE, track thực tiễn | 23/10/2026: **đã qua** | B2 | https://conf.researchr.org/track/icse-2027/icse-2027-seip |
| MSR 2027 Technical | Hội nghị | 23/10/2026: **đã qua** | — | https://conf.researchr.org/dates/msr-2027 |
| MSR 2027 Industry Track | Hội nghị, track công nghiệp | **18/12/2026 AoE (đã xác nhận ở vòng 2)** | **B2: đề xuất kênh chính (chờ Tom chốt)**, khung "khai thác log vận hành" | https://2027.msrconf.org/track/msr-2027-industry-track |
| LLM4Code 2027 (workshop ICSE) | Workshop | **Cần kiểm chứng.** Bản v1 ghi 13/11/2026 qua bài LinkedIn; hạn AGENT'27 nay cũng là 13/11/2026 nên có thể bị lẫn (suy luận, chưa kiểm) | B3 dạng position | https://conf.researchr.org/home/llm4code-2027 · **Không kịp** đủ điều kiện |
| AGENT'27 (workshop ICSE, Dublin) | Workshop: research/experience/tool/benchmark; 8 trang hoặc 5 trang; IEEE; single-anonymous | **13/11/2026** (còn 11 ngày tính từ 2/11/2026; v1 ghi nhầm hạn chung của workshop ICSE) | B3 (experience paper) chỉ nếu kịp (xem "Phương án dự phòng") | https://conf.researchr.org/home/icse-2027/agent-2027 · https://conf.researchr.org/track/icse-2027/icse-2027-workshops |
| FSE 2027 Industry Papers (Thâm Quyến, 12–16/7/2027) | Hội nghị, track công nghiệp; ngắn 5+1 trang, dài 10+2 trang | **23/1/2027 AoE** | **B2: mục tiêu chính** | https://conf.researchr.org/track/fse-2027/fse-2027-industry-papers |
| SANER 2027 Agentic AI4SE Track | Hội nghị, double-anonymous | 23/10/2026: **đã qua** (xác nhận ở vòng 2) | — | https://conf.researchr.org/track/saner-2027/saner-2027-agentic-ai4se-track |
| arXiv (cs.SE) | Preprint | Không có hạn | B2 trước khi nộp FSE | https://blog.arxiv.org/2023/01/31/arxiv-announces-new-policy-on-chatgpt-and-similar-tools |
| RIVF 2026 (Hà Nội, 18–20/12/2026) | Hội nghị quốc tế tại VN | 31/8/2026: **đã qua**. RIVF 2027 chưa thấy thông báo | B3 (kỳ 2027) | Theo bài LinkedIn của ban tổ chức (https://vn.linkedin.com/in/leduydung), **cần kiểm chứng** |
| SoICT 2026 (TP.HCM, 4/12/2026) | Hội nghị quốc tế tại VN | ~9/9/2026: **đã qua** (trang tổng hợp, **cần kiểm chứng**) | B3 (kỳ 2027) | https://www.myhuiban.com/conference/2728?lang=en-us |
| FAIR (Hội nghị quốc gia Nghiên cứu cơ bản và ứng dụng CNTT) | Hội nghị quốc gia | FAIR'2026 họp 8–9/10/2026: đã qua. FAIR 2027 **cần kiểm chứng** | B3 bản tiếng Việt | https://easychair.org/cfp/FAIR2026 |
| KSE 2026 | Hội nghị quốc tế tại VN | Không tìm thấy thông báo: **cần kiểm chứng** | — | — |
| Tạp chí trong nước (vd. tạp chí CNTT&TT; VNU JCSCE) | Tạp chí | Chưa tra: **cần kiểm chứng** | B3 mở rộng | Hỏi thầy về danh mục tạp chí được tính điểm |

**Lựa chọn đề xuất (v2, chờ Tom chốt — kênh chính do Tom quyết):**
- B2: **kênh chính đề xuất là MSR 2027 Industry (18/12/2026 AoE)**; FSE 2027 Industry (23/1/2027) là kênh thay thế nếu chưa đủ điều kiện ở mục "Phương án dự phòng". Đăng arXiv khi Tom duyệt khai báo AI. Lý do chọn MSR trước: kết quả hiện có là phép đo từ log vận hành và bài benchmark, hợp khung khai thác dữ liệu; hạn sớm hơn FSE 36 ngày nên rủi ro thiếu thí nghiệm cao hơn (xem dưới).
- B3: AGENT'27 (13/11/2026) **gần như không kịp**: cần xong P-13, P-14 (ẩn danh, người gán nhãn thứ hai) và rút gọn bài trong 11 ngày. Chỉ nộp nếu có bản rút gọn trước hạn mà không cần thêm thí nghiệm. Nếu không kịp thì chuyển sang hội nghị trong nước 2027 hoặc gộp phần taxonomy vào mục thách thức của B2.

### Phương án dự phòng (chờ Tom chốt)

| Kênh | Hạn cụ thể | Vai trò | Điều tối thiểu cần có trước hạn | Trạng thái |
|---|---|---|---|---|
| **MSR 2027 Industry** | 18/12/2026 AoE (đã xác nhận) | **Chính (đề xuất)** cho B2 | (a) D3 làm xong trên dữ liệu C1–C7: bootstrap + hoán vị khai báo trước, ghi p hoán vị cạnh mọi CI; (b) D1 một phần: bổ sung lượt C7 để mỗi ô làn nhanh có ≥ 3 lượt cùng thời điểm với Sonnet đơn (hiện 1 lượt); (c) D7 ẩn danh dự án A; (d) D10 khai báo AI; (e) D11 kiểm số với mã. **Không bắt buộc** D4 nếu bài đóng khung là "kết quả âm tính trên bài ngắn, giả thuyết bài dài để lại" | Chờ Tom chốt |
| FSE 2027 Industry | 23/1/2027 AoE | Thay thế nếu MSR không kịp, hoặc nộp tiếp bản mở rộng nếu MSR không nhận (kiểm quy định nộp song song/đăng trùng của từng nơi, **cần kiểm chứng**) | Như trên, cộng D4 (≥ 3 bài > 15 phút, cùng mô hình, cùng thời điểm) và D5 phần runtime khác | Chờ Tom chốt |
| AGENT'27 (workshop ICSE) | 13/11/2026 (còn 11 ngày) | Chỉ cho B3, tùy chọn | Bản rút gọn 5 trang (experience paper) đã ẩn danh, D10, không cần thí nghiệm mới | Gần như không kịp; chờ Tom chốt |
| SANER 2027 Agentic AI4SE | 23/10/2026 | — | — | Đã hết hạn |
| Hội nghị/tạp chí trong nước 2027 | Chưa có thông báo (**cần kiểm chứng**) | B3 | D9 (người gán nhãn thứ hai) | Dự phòng cuối |

Ghi chú rủi ro: từ 2/11 đến 18/12/2026 còn 46 ngày. Nếu D1 và D3 chưa xong ở mốc 1/12/2026 thì chuyển B2 sang FSE 2027 Industry thay vì nộp bản yếu. D2 mới có một phần (C7); phần còn lại cần gói A của `dev-review.md` §5.

## 4. Điều kiện cần và đủ trước khi nộp

| # | Điều kiện | Mức | Hiện trạng | Ai làm |
|---|---|---|---|---|
| D1 | **Số lượt lặp:** ≥ 5 lượt mỗi ô (bài × hệ) cho phép so chính. design.md §5.3 đề xuất 5 bài × 6 lượt × 2 nhánh cho pha xác nhận (chưa tính công suất) | Cần | n = 1–5 mỗi ô (T-a, T-h); C7: 1 lượt làn nhanh, 2 lượt Sonnet mỗi bài | Phòng Phát triển (`dev-review.md`) |
| D2 | **Cùng mô hình hoặc tách hiệu ứng mô hình:** C5–C6 so Claude Code (opus) với CCoding (sonnet), nên không tách được hiệu ứng multi-agent (token-analysis §5) | Cần | **Có một phần:** C7 có Sonnet đơn chạy cùng lúc (T-h, T-i). Còn thiếu: ≥ 3 lượt làn nhanh cùng thời điểm, hệ Opus + CCoding dùng opus, và gói A của `dev-review.md` §5 | Phòng Phát triển |
| D3 | **Kiểm định khai báo trước:** bootstrap/hoán vị phân tầng theo bài hoặc mô hình hỗn hợp; báo kích thước hiệu ứng + CI; không dùng Wilcoxon trên 5 cặp (design.md §5.3); phân tích độ nhạy (vd. bỏ t3 lượt treo stdin) ghi rõ là hậu nghiệm; hiệu chỉnh so sánh bội | Cần | Có bootstrap + hoán vị minh họa (T-f, T-i); 8 phép kiểm định ở T-i **chưa** hiệu chỉnh bội, nên p ≈ 0,03 không vững | @data-scientist + Phát triển |
| D4 | **Bài lớn hơn:** ≥ 3 bài > 15 phút và/hoặc tập con SWE-bench. Đây là nơi giả thuyết "multi-agent nhanh hơn" còn mở (token-analysis §4); bài dài nhất hiện có ~4 phút (t5 Opus 259 s) | Cần cho kết luận "khi nào nhanh hơn" | Chưa có | Phòng Phát triển |
| D5 | **C6** (`maxParallel`) và ít nhất một runtime khác | Nên | C6 có (4 lượt mỗi hệ, chỉ t3, t5; p hoán vị 0,0556, T-f). Runtime khác chưa có | Phòng Phát triển |
| D6 | **Mở mã/dữ liệu:** `bench/vs-claude` (bài, test ẩn, CSV), script `token-analysis.mjs`. Dữ liệu benchtest đã là tổng hợp, nhãn Công khai | Cần (artifact) | Đã có trong repo, chưa đóng gói | Phát triển |
| D7 | **Ẩn danh dự án A:** rà PROCESS-REVIEW, TOOLS, data-protection-assessment, thông điệp commit (P-13). Nếu nơi đăng ẩn danh hai chiều thì ẩn cả tên hệ và repo (dùng kho ẩn danh) | Cần | Chưa xong | Nghiên cứu + Phát triển |
| D8 | **Đọc toàn văn** TeamBench, MAST và tra riêng "routing/adaptive compute" (K.4) | Cần trước khi viết "khác gì" | CAID, Don't Break the Cache (Lumer và cộng sự, 2026) và Cognition 2026 **đã đọc toàn văn** (`references-v2.md` §2–3). Còn lại mới đọc tóm tắt; venue nhiều mục chưa mở trang chính (`references-v2.md` §5) | @literature-researcher |
| D9 | **Gán nhãn MAST độc lập** bởi người thứ hai, báo độ đồng thuận (vd. Cohen's κ) | Cần cho B3 | Một người gán (P-14) | Nghiên cứu |
| D10 | **Khai báo dùng AI** theo nơi đăng và theo trường (§8) | Cần | Chưa soạn | Tom |
| D11 | **Kiểm lại số và mô tả kỹ thuật** so với mã (`dev-review.md`) và phản biện nội bộ (`review.md`) | Cần | Chưa có | Phát triển / @peer-reviewer |

## 5. Rủi ro

| Rủi ro | Khả năng | Ảnh hưởng | Giảm thiểu |
|---|---|---|---|
| Bị đánh giá là công bố lại CAID | Cao nếu trục là kiến trúc | Bị loại | Trục bài là phép đo (N1). Trích CAID ở mở đầu. Bảng "đã có/có thể mới" |
| Kết quả âm tính (CCoding đắt hơn, chậm hơn Sonnet đơn) bị coi là "không có đóng góp" | **Cao hơn v1**: C7 làm âm tính rõ hơn khi tách hiệu ứng mô hình (T-i) | Bị loại ở track nghiên cứu | Chọn track công nghiệp/kinh nghiệm. Trình bày đây là bằng chứng độc lập cùng chiều CAID, chỉ ra pha gây tốn (chi phí cố định điều phối 55,8% thời gian Sonnet đơn, T-d (3)) và nêu điều kiện có thể có lợi như giả thuyết cần bài > 15 phút |
| Thí nghiệm bổ sung tốn hạn mức, không kịp 18/12/2026 (MSR) hoặc 23/1/2027 (FSE) | Trung bình–Cao với MSR (còn 46 ngày) | Lùi hạn | Ước lượng từ T-a: một lượt CCoding C5 ≈ 0.54–1.14 USD, ≈ 107–400 s. Lập lịch sớm; mốc kiểm 1/12/2026; "Phương án dự phòng" ở §3 |
| Nhiễu thời gian (tải nhà cung cấp, Windows chậm 2–3×, C-49) | Cao | CI rộng | Xen kẽ thứ tự hệ, chạy trên cùng máy/khung giờ, ghi môi trường |
| **n quá nhỏ ở C7 (đe dọa tính hợp lệ kết luận thống kê):** 1 lượt làn nhanh và 2 lượt Sonnet mỗi bài; 243 hoán vị nên p ≥ 1/243; CI bootstrap hẹp giả tạo | Cao | p và CI của hàng C7 (T-i) không khái quát được | Chỉ trích p hoán vị và chênh lệch theo bài (T-h); tăng lên ≥ 3 lượt làn nhanh mỗi bài (D1); gọi kết quả là minh họa |
| **Chạy đồng thời hai hệ ở C7 (nội tại):** làn nhanh và Sonnet đơn chia sẻ máy, hạn mức, tải nhà cung cấp; một hệ có thể làm chậm hệ kia | Trung bình | Có thể làm tăng hoặc giảm chênh lệch +38,0 s theo hướng chưa biết | Ghi rõ trong phương pháp; lần sau xen kẽ thứ tự và chạy lặp ở khung giờ khác; ưu điểm là cả hai chịu cùng tải (so với C5–C6 khác thời điểm) |
| **Cùng mô hình chỉ ở C7 (cấu trúc):** hàng Sonnet − Opus (T-i) trộn mô hình với thời điểm; các hiệu ứng không cộng được. Chưa có CCoding chạy toàn Opus | Trung bình | "Lợi thế do mô hình" là suy luận từ ba hệ, không phải phép tách hiệu ứng đầy đủ | Nói "chủ yếu do mô hình" kèm điều kiện; thêm hệ ccoding-opus (D2, gói A) |
| **Nhiều phép kiểm định (kết luận thống kê):** 8 phép ở T-i, không hiệu chỉnh bội | Cao | p ≈ 0,03 không vững nếu hiệu chỉnh | Khai báo trước 1 phép chính (làn nhanh − Sonnet, C7), còn lại là mô tả (D3) |
| **Bài ngắn (ngoại tại):** dài nhất ~4 phút (t5 Opus 259 s); điều kiện có lợi (bài song song hóa được, đủ dài) chưa kiểm | Cao | Kết luận không áp cho bài > 15 phút | Ghi là giả thuyết; D4 |
| **Một lượt lỗi chất lượng:** C7 t2 52/60 là 1 lượt, nguyên nhân hạng mục thứ ba không chạy chưa xác định (không có `events.jsonl`) | Trung bình | Dễ bị đọc quá mức | Không dùng làm bằng chứng "verifier bỏ sót"; ghi là điểm yếu điều phối, 1 lượt |
| Rò rỉ thông tin nội bộ | Trung bình | Vi phạm ẩn danh / Data Protection Gate | D7. Không trích nguyên văn tài liệu nguồn chưa rà |
| Nội dung do AI soạn có lỗi trích dẫn/số | Trung bình | Liêm chính, chính sách arXiv/nơi đăng | D8, D11. Tom tự kiểm mọi trích dẫn và mọi số |
| Overfit vào 5 bài t1–t5 | Cao với N2/N4 | Kết luận không khái quát | Bộ bài giữ lại t6–t8 (design.md §5.4) |
| Salami slicing giữa B2 và B3 | Thấp | Đạo đức công bố | Mỗi bài một câu hỏi, trích chéo, không lặp bảng |

## 6. Lộ trình (đề xuất, tính từ 2/11/2026)

| Mốc | Việc | Đầu ra |
|---|---|---|
| 2/11–9/11 | Tom trình thầy (presentation-notes.md); **chốt kênh chính (đề xuất MSR 2027 Industry)**; chốt khung B2 + B3 | Quyết định |
| 3/11–16/11 | Phòng Phát triển: `dev-review.md` (kiểm số, kế hoạch thí nghiệm, ước lượng hạn mức); rà ẩn danh P-13 | dev-review.md |
| 3/11–13/11 | (B3, tùy chọn) Gán nhãn MAST lần hai, đo κ; rút gọn thành bản 5 trang | Bản thảo B3 |
| **13/11/2026** | (B3) hạn AGENT'27. Gần như không kịp; nộp **chỉ nếu** D7, D9, D10 xong và không cần thí nghiệm mới | — |
| 9/11–30/11 | Chạy thí nghiệm bổ sung cho MSR: D1 (≥ 3 lượt làn nhanh mỗi bài cùng thời điểm với Sonnet đơn), gói A của `dev-review.md` §5; D4/D5 chỉ nếu còn hạn mức | CSV mới, tái lập bằng script |
| **1/12/2026** | Mốc quyết định: D1 và D3 đủ thì nộp MSR; chưa đủ thì chuyển B2 sang FSE | Quyết định |
| 1/12–15/12 | Phân tích lại (D3), cập nhật paper.md, review nội bộ, đọc toàn văn TeamBench/MAST (D8), khai báo AI (D10) | Bản thảo B2 |
| ≈ 14/12/2026 | arXiv (B2) sau khi Tom duyệt khai báo AI | Preprint |
| **18/12/2026** | Nộp **MSR 2027 Industry** (AoE; chờ Tom chốt) | — |
| 18/12–15/1/2027 | Nếu chuyển sang FSE: chạy D4 (bài > 15 phút), D5 | Bản mở rộng |
| 23/1/2027 | Hạn FSE 2027 Industry (thay thế) | — |
| Sau 3/2027 | B4 (tự cải thiện) nếu P1–P4 qua cổng A/B | Đề tài riêng |

## 7. Đề xuất cải thiện hệ thống theo ưu tiên (dựa trên S2–S4)

Ưu tiên tính theo hai tiêu chí: tác động đo được hoặc ước lượng được, và mức cần thiết cho việc công bố.

| Ưu tiên | Đề xuất | Căn cứ | Mã |
|---|---|---|---|
| 1 | **Thí nghiệm đủ chuẩn**: tăng n, cùng mô hình, bài > 15 phút, chạy C6 | n = 1–5 mỗi ô. Chênh thời gian C5 nhạy với một lượt chạy (T-f); C7 chỉ 1 lượt làn nhanh mỗi bài (T-i) | P-07, P-09, C-12 |
| 2 | **Rút ngắn pha review trên đường găng**: reviewer nhận diff + kết quả lệnh kiểm tra; review theo hạng mục khi gộp xong | `review` 81.3 s > `execute` 76.9 s ở C5 (T-d). Review chiếm 24.0% ghi cache (T-c). O4 ước lượng −2.8% chi phí (T-e) | O4, P3, P-05, C-32 |
| 3 | **Giảm số tiến trình và đọc tệp lặp**, thay vì tinh chỉnh tiền tố: tái dùng phiên giữa các lượt cùng agent (mở rộng O2), chuyển kết quả khảo sát đã có cho lượt sau | Ghi cache = 49.6% chi phí. F chỉ 2 350 token mỗi lượt gọi (T-e1). 5.0 lượt gọi mỗi lượt chạy ở C5 (T-b) | O2, P2, C-13, C-20 |
| 4 | **Bật nhật ký sự cố (P4)** trước các bản vá tối ưu, để vòng tự cải thiện có dữ liệu | C-14 còn mở. P4 là bản vá thu thập dữ liệu | C-14, P4 |
| 5 | **Kiểm thử đối kháng hook / chạy bằng tài khoản ít quyền**: hook kiểm theo chuỗi, chưa phải sandbox HĐH | L3 "chưa kiểm thử đối kháng" | P-03, C-46 |
| 6 | **Kiểm tra cơ học hợp đồng song song**: hạng mục độc lập không được ghi cùng tệp; bài benchtest có xung đột ngữ nghĩa | Ràng buộc hiện chỉ nằm trong prompt | P-15, P-10, C-03, C-09 |
| 7 | **Giới hạn đầu ra (P1)** cho plan/review/synthesize | O5 ước lượng −1.7% | O5, P1 |
| 8 | **"Ghế" ≤ 2 hạng mục mỗi vai** khi chạy nhiều nhiệm vụ | Chờ 34 s ở C4 | C-23, P-04 |
| 9 | **Đo tách nguyên nhân Windows chậm** (khởi động `claude`, git, npm, hook) | Chậm 2–3×, chưa tách | C-49, P-06 |
| 10 | **Tiền tố ổn định (O1)**: làm nếu rẻ, nhưng không kỳ vọng nhiều | Trần trên 4.6%, thực tế thấp hơn (T-e) | O1 |
| — | **Không ưu tiên** rút gọn ngữ cảnh (O3) | 0.2% (T-e). `context_chars` ≈ 1 200 | O3 |
| — | O6 (lead opus → sonnet) **đã áp dụng** ở C5. Chưa đo chất lượng riêng. sonnet → haiku chưa định giá được | T-e | O6 |

**Lỗi/không nhất quán phát hiện khi tổng hợp (báo để sửa ở vòng revise):**
1. `challenges.md` C-13 ghi nguyên nhân gốc là "ghi lại tiền tố system prompt + định nghĩa công cụ", còn T-e1 cho thấy tiền tố **không** phải nguyên nhân chính (F = 2 350 token so với ≈ 19 656 token ghi cache mỗi lượt gọi). Cần sửa C-13 theo S2.
2. `challenges.md` P-01 vẫn ghi "gấp 2,8–4,0×". T-b chỉ ra con số này chỉ đúng một phần (C1 4.71×, C2 6.08×, C5 3.34×). Đề bài và mọi bản thảo phải dùng số của T-b.
3. So sánh C5–C6 lẫn hiệu ứng mô hình (opus so với sonnet). Từ C7 đã tách một phần (T-i hàng 1 và 4); mọi câu "CCoding nhanh hơn/ngang Claude Code (Opus)" phải kèm điều kiện này.

## 8. Liêm chính và chính sách dùng AI

- **Trường:** Tom phải đối chiếu quy định liêm chính học thuật và quy định dùng công cụ AI của trường/khoa trước khi nộp hoặc trình bày. Phòng chưa tra quy định của trường: **cần kiểm chứng**. Toàn bộ tài liệu trong `docs/research/` do hệ đa tác tử CCoding soạn (mô hình Claude qua `claude-cli`). Đó là bản nháp. Tom chịu trách nhiệm về nội dung, phải tự kiểm mọi trích dẫn và số liệu, và tự viết lại phần lập luận.
- **ACM** (FSE, MSR, ICSE thuộc ACM/IEEE): công cụ AI không được đứng tên tác giả. Nội dung do AI tạo phải khai báo (sửa chính tả/ngữ pháp cơ bản thì không cần). Khai ở mục Acknowledgements, nêu phần nào, công cụ nào, phiên bản nào (ACM FAQ: https://www.acm.org/publications/policies/frequently-asked-questions; diễn giải thứ cấp, **cần kiểm chứng** văn bản gốc tại acm.org/publications/policies).
- **IEEE** (AGENT'27 xuất bản qua IEEE): nội dung do AI tạo (văn bản, hình, mã) phải khai ở mục acknowledgments, nêu hệ thống AI và các phần liên quan (https://open.ieee.org/author-guidelines-for-artificial-intelligence-ai-generated-text/; **cần kiểm chứng** trên IEEE Author Center).
- **arXiv:** từ 2023, AI không được là tác giả, phải khai báo việc dùng đáng kể, và tác giả chịu trách nhiệm (https://blog.arxiv.org/2023/01/31/arxiv-announces-new-policy-on-chatgpt-and-similar-tools).- **Gợi ý khai báo:** bài B2/B3 *nghiên cứu chính* một hệ đa tác tử dùng LLM. Nên khai báo tách bạch hai việc: (a) LLM là **đối tượng nghiên cứu**, mô tả ở mục Phương pháp; (b) LLM được dùng để **soạn nháp/phân tích**, ghi ở Acknowledgements và công cụ.

## 9. Một trang tóm tắt cho thầy hướng dẫn

> **Đề tài:** CCoding là hệ multi-agent lập trình theo mô hình "văn phòng nhiều phòng ban", tự xây và vận hành từ 26/10/2026. Câu hỏi: hệ này tốn bao nhiêu thời gian, token và cache so với một coding agent đơn mạnh (Claude Code), và gặp những lỗi gì khi vận hành thật?
>
> **Đã làm:**
> - Benchtest 5 bài, vòng C1–C7: C5–C6 là làn nhanh so với Claude Code (Opus); C7 thêm Claude Code bằng Sonnet chạy cùng lúc để tách hiệu ứng mô hình.
> - Script tái lập mọi bảng số (T-a…T-i), có chế độ `--check`.
> - 49 thách thức có bằng chứng, phân loại theo MAST + hạ tầng.
> - 15 cơ chế giới hạn sub-agent.
> - Thiết kế vòng tự cải thiện kèm 4 bản vá prompt (chưa đo).
>
> **Kết quả (minh họa; n = 1–5 mỗi ô, C7 chỉ 1 lượt làn nhanh và 2 lượt Sonnet mỗi bài):**
> - Thiết kế ban đầu chậm và đắt gấp khoảng 2 lần (T-f).
> - **Khi cùng mô hình Sonnet và cùng thời điểm (C7), một agent nhanh hơn làn nhanh 1,6–2,9× ở 4/5 bài; làn nhanh chỉ hòa ở t5, bài có nhiều module độc lập.** Chênh lệch trung bình +38,0 s, p hoán vị 0,0329 (T-h, T-i).
> - Lợi thế của làn nhanh so với Opus chủ yếu đến từ mô hình: Sonnet đơn nhanh hơn Opus 90,8 s, làn nhanh chỉ nhanh hơn 28–35 s (T-i). Ở C6, làn nhanh nhanh hơn Opus 72,8 s, p hoán vị 0,0556 (T-f); hiệu ứng này lẫn mô hình.
> - Chi phí của làn nhanh bằng 2,5–3,8× Sonnet đơn, p hoán vị 0,0041 (T-h, T-i).
> - Chi phí cố định của điều phối (kế hoạch, review, gộp) bằng 55,8% thời gian Sonnet đơn cần cho 5 bài (T-d (3)); ở t2 và t4 gần bằng hoặc vượt thời gian một agent làm xong cả bài.
> - Chất lượng: Sonnet đơn đạt trọn test ẩn 10/10 lượt, làn nhanh 17/18 (T-h). Lượt hỏng duy nhất (C7 t2, 52/60) là reviewer bắt được nhưng quy trình không sửa, không phải review bỏ sót.
> - Ghi cache gấp 3.34–6.08 lần, do nhiều tiến trình đọc lại nội dung chứ không do tiền tố prompt (T-b, T-e1).
> - Điều kiện có thể có lợi (việc song song hóa được, bài đủ dài) **mới là giả thuyết**; cần bài > 15 phút để kiểm.
>
> **Điểm mới, nói thật:**
> - Kiến trúc (worktree song song, tự gộp, verifier) **đã có** ở CAID (Geng & Neubig, 2026) và TeamBench (Kim và cộng sự, 2026), nên không nhận là mới.
> - Phần có thể mới, mức trung bình: phép đo cache/token/thời gian theo pha so với agent đơn (CAID chỉ có tổng thời gian, không đo cache), và nhật ký lỗi vận hành của một hệ thật.
> - Kết quả cùng chiều CAID, và rõ hơn khi tách hiệu ứng mô hình: multi-agent đắt hơn và, với bài ngắn, không nhanh hơn một agent cùng mô hình.
>
> **Khuyến nghị (chờ Tom chốt):**
> - Một bài chính (thực nghiệm multi vs single, kết quả âm tính + chi phí điều phối), **kênh chính đề xuất MSR 2027 Industry (hạn 18/12/2026)**; thay thế FSE 2027 Industry (23/1/2027); đăng arXiv trước khi nộp.
> - Một bài ngắn tùy chọn (kinh nghiệm + taxonomy): AGENT'27 (hạn 13/11/2026) gần như không kịp; nếu không thì hội nghị trong nước 2027. SANER 2027 Agentic AI4SE đã hết hạn 23/10/2026.
> - Tự cải thiện để thành đề tài sau.
> - Không phải công bố lại, nếu trục là phép đo chứ không phải kiến trúc.
>
> **Cần thầy góp ý:**
> 1. Track công nghiệp hay track nghiên cứu? Kết quả âm tính có đủ cho MSR Industry không?
> 2. Tối thiểu bao nhiêu lượt lặp và bài lớn thì đủ?
> 3. Có cần bài trong nước để tính điểm không?
> 4. Quy định khai báo AI của trường.
>
> **Giới hạn:** n nhỏ (C7: 1 lượt làn nhanh, 2 lượt Sonnet mỗi bài); chạy đồng thời hai hệ; 8 phép kiểm định không hiệu chỉnh bội; 5 bài ngắn (≤ ~4 phút); một runtime; mô hình chỉ tách ở C7; chỉ CAID, Don't Break the Cache và Cognition 2026 được đọc toàn văn, phần còn lại mới đọc tóm tắt.

## Tài liệu tham khảo (APA 7)

Danh mục lấy từ `references-v2.md` (S2); nhãn kiểm chứng venue xem tệp đó.

Cemri, M., Pan, M. Z., Yang, S., Agrawal, L. A., Chopra, B., Tiwari, R., Keutzer, K., Parameswaran, A., Klein, D., Ramchandran, K., Zaharia, M., Gonzalez, J. E., & Stoica, I. (2025). Why do multi-agent LLM systems fail? *Advances in Neural Information Processing Systems 38 (NeurIPS 2025)*. arXiv:2503.13657. https://openreview.net/forum?id=fAjbYBmonr [venue: nguồn thứ cấp; chỉ đọc tóm tắt]

Geng, J., & Neubig, G. (2026). *Effective strategies for asynchronous software engineering agents* (arXiv:2603.21489) [Preprint]. https://arxiv.org/abs/2603.21489

Hadfield, J., Zhang, B., Lien, K., Scholz, F., Fox, J., & Ford, D. (2025, June 13). *How we built our multi-agent research system*. Anthropic. https://www.anthropic.com/research/multi-agent-research-system

Kapoor, S., Stroebl, B., Siegel, Z. S., Nadgir, N., & Narayanan, A. (2025). AI agents that matter. *Transactions on Machine Learning Research*. https://openreview.net/forum?id=Zy4uFzMviZ — arXiv:2407.01502

Kim, Y., Park, C., Kim, T., Park, E., Schmidgall, S., Rahman, S., Park, C., Breazeal, C., Liu, X., Palangi, H., Park, H. W., & McDuff, D. (2026). *TeamBench: Evaluating agent coordination under enforced role separation* (arXiv:2605.07073) [Preprint]. https://arxiv.org/abs/2605.07073

Lumer, E., Nizar, F., Jangiti, A., Frank, K., Gulati, A., Phadate, M., & Subbiah, V. K. (2026). *Don't break the cache: An evaluation of prompt caching for long-horizon agentic tasks* (arXiv:2601.06007) [Preprint]. https://arxiv.org/abs/2601.06007

Xia, C. S., Deng, Y., Dunn, S., & Zhang, L. (2025). Demystifying LLM-based software engineering agents. *Proceedings of the ACM on Software Engineering, 2*(FSE). https://doi.org/10.1145/3715754 [DOI chưa tự mở: ACM trả 403]

Yan, W. (2025, June 12). *Don't build multi-agents*. Cognition. https://cognition.com/blog/dont-build-multi-agents

Yan, W. (2026, April 22). *Multi-agents: What's actually working*. Cognition. https://cognition.com/blog/multi-agents-working

Chính sách và nơi đăng (trang web, truy cập 2/11/2026): URL ghi tại §3 và §8.

Nguồn nội bộ: `docs/research/related-work.md`, `performance/token-analysis.md`, `challenges.md`, `self-improvement/design.md`.
