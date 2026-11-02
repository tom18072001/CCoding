# Kế hoạch công bố — CCoding (RQ6)

> Hạng mục S7 · Phòng Nghiên cứu · @research-lead · bản nháp 2/11/2026 · phân loại: nội bộ · chuẩn trích dẫn APA 7.
> Đầu vào: `related-work.md` (S1/S5, mục "Kết luận điểm mới" K.1–K.4), `performance/token-analysis.md` (S2, bảng T-a…T-f),
> `challenges.md` (S3, C-01…C-49, L1–L15, P-01…P-15), `self-improvement/design.md` (S4, P1–P4).
> Số liệu CCoding lấy nguyên từ các tệp trên, không tính lại. **C6: chưa có dữ liệu.** Hạn nộp và chính sách tra ngày 2/11/2026;
> mục nào chỉ thấy qua trang tổng hợp hoặc bài tóm lược thì ghi **cần kiểm chứng**.
> Đây là **bản nháp để Tom sở hữu**, do hệ đa tác tử soạn. Trước khi dùng phải đối chiếu quy định liêm chính học thuật và chính sách dùng AI
> của trường (xem §8).

## 0. Trả lời trực tiếp ba câu hỏi

| Câu hỏi | Trả lời | Mức chắc chắn |
|---|---|---|
| **1 hay nhiều bài?** | **Một bài chính cho giai đoạn này**, cộng **một bài ngắn tùy chọn** (báo cáo kinh nghiệm + taxonomy thách thức). Bài thứ ba về tự cải thiện **chỉ viết khi có số đo A/B**. Không viết bài riêng mô tả kiến trúc. Thứ tự: hoàn thiện thí nghiệm → đăng arXiv → nộp hội nghị (phương án **B rút gọn kết hợp C**, §2). | Trung bình. Phụ thuộc việc Phòng Phát triển chạy kịp thí nghiệm bổ sung (§4) |
| **Khác gì, hơn gì?** | Ý tưởng kiến trúc **không** mới: worktree song song + tự gộp + kiểm chứng bằng test đã có ở CAID (Geng & Neubig, 2026); tách quyền theo vai + verifier đã có ở TeamBench (Kim et al., 2026) và AgentCoder; vòng phê bình–sửa đã có ở Self-Refine/Reflexion (K.1, E1–E10). Phần **có thể** mới nằm ở **phép đo và vận hành**: (N1) đo cache/token/thời gian theo từng lượt gọi và từng pha, so với Claude Code thuần trên cùng bài có test ẩn; (N5) nhật ký 49 thách thức từ một hệ vận hành thật, phân loại theo MAST + nhóm hạ tầng; (N3) làn nhanh/làn đầy đo bằng thời gian thực. | N1, N5: Trung bình. N3: Thấp–Trung bình. N4 (tự cải thiện có người duyệt): Thấp–Trung bình, chưa có số đo. Mọi mức chỉ ở dạng "chưa thấy trong phần đã đọc": 24/31 nguồn chỉ đọc tóm tắt |
| **Có phải công bố lại không?** | **Nếu chỉ trình bày kiến trúc thì phần lớn là công bố lại / trùng ý** (CAID có trước, 3/2026). **Nếu trục bài là phép đo chi phí–thời gian–cache so với một coding agent đơn mạnh và bài học vận hành thì không phải công bố lại**, với điều kiện trích CAID, TeamBench và MAST ngay ở mở đầu, và không dùng chữ "chúng tôi đề xuất" cho E1–E10. | Trung bình |

Kết quả chính có thể nói (T-a, T-b, T-f; minh họa, n = 1–2 mỗi ô):
- Thiết kế ban đầu (C1, C2) chậm hơn và đắt hơn Claude Code khoảng gấp đôi: C1 +169.4 s, +0.610 USD, CI không chứa 0. Đây là **kết quả âm tính**.
- Làn nhanh (C5) có chênh thời gian +21.1 s, CI [−22.6; 64.9] chứa 0. Chi phí vẫn cao hơn +21.8% [11.5; 32.1].
- Hướng này khớp CAID: chi phí tăng, thời gian không giảm đáng kể. **Điểm khác**: CCoding đo thêm được cache và đường găng theo pha, nên chỉ ra được **chỗ** mất thời gian và tiền. Ở C5, `review` 81.3 s dài hơn đường găng `execute` 76.9 s (T-d). Ghi cache chiếm 49.4% chi phí và tiền tố cố định chỉ 2 588 token mỗi lượt gọi (T-e, T-e1).

## 1. Căn cứ điểm mới (từ S5) — dùng chung cho các phương án

| Mã | Nội dung | Có thể mới? | Bằng chứng trong repo |
|---|---|---|---|
| E1 | Manager + kế hoạch phụ thuộc + worktree + tự gộp + test | Không (CAID) | — |
| E2 | Tách quyền theo vai, verifier độc lập | Không (TeamBench, AgentCoder) | L1–L4, L15 |
| E7 | Tiền tố ổn định để giữ cache (O1) | Không (Lumer et al., 2026) | T-e: O1 trần trên 5.1% |
| E8 | Quy trình cố định thay agent tự do | Không (Agentless) | — |
| E10 | Phân loại lỗi MAS | Không (Cemri et al., 2025): chỉ dùng làm khung | challenges.md §0 |
| N1 | Cache/token/thời gian theo pha so với Claude Code thuần | Trung bình | T-a…T-f |
| N2 | O1–O6 đo tách từng yếu tố | Thấp–TB: hiện chỉ có **ước lượng** | T-e (chưa chạy lại) |
| N3 | Làn nhanh/làn đầy | Thấp–TB: chưa tra riêng "routing/adaptive compute" | T-d, T-f C5 |
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
| B2 — Thực nghiệm multi vs single: thời gian/chi phí/cache | N1 (+ N3, N2 nếu có đo) | Đặt cạnh CAID: cùng hướng kết quả, nhưng đo theo pha, tách cache đọc/ghi, so với Claude Code thuần, có làn nhanh | Có T-a…T-f nhưng n = 1–2 mỗi ô, 5 bài ngắn, C6 chưa có | **Bài chính**, sau thí nghiệm bổ sung (§4) |
| B3 — Báo cáo kinh nghiệm + taxonomy thách thức | N5 | MAST phân tích vết của hệ khác; đây là nhật ký của một hệ tự xây, có nhóm INF | Có 49 C-xx có bằng chứng; mới một người gán nhãn (P-14) | **Bài ngắn tùy chọn** (workshop/hội nghị trong nước) |
| (B4) — Tự cải thiện có người duyệt | N4 | Khác Reflexion/DSPy ở người duyệt + ít mẫu | Chưa có số đo | **Hoãn** tới khi P1–P4 qua cổng A/B |

- **Ưu:** mỗi bài có một đóng góp rõ, nên khó bị gọi là công bố lại.
- **Nhược:** B2 và B3 dùng chung bối cảnh. Phải tránh **công bố trùng lặp (salami slicing)**: mỗi bài trích bài kia, không lặp bảng số, B3 không chứa T-a…T-f.

### Phương án C — Báo cáo kỹ thuật arXiv trước, rồi hội nghị

- **Nội dung:** đăng báo cáo kỹ thuật đầy đủ (A) lên arXiv để có mốc thời gian, sau đó rút gọn thành bài hội nghị.
- **Khác gì/hơn gì:** như A. arXiv **không** xác lập ưu tiên với CAID, vì CAID đăng từ 3/2026.
- **Ưu:** công khai sớm, nhận góp ý, mở được mã/dữ liệu.
- **Nhược:**
  - arXiv cảnh báo về nội dung LLM không kiểm: từ 5/2026 có tin về lệnh cấm một năm (**cần kiểm chứng** trạng thái chính thức, §8). Một bản do hệ đa tác tử soạn mà đăng vội là **rủi ro cao**.
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
| MSR 2027 Industry Track | Hội nghị, track công nghiệp | 18/12/2026 AoE (theo kết quả tra cứu, **cần kiểm chứng** trên trang track) | B2 (nếu khung là "khai thác log vận hành") | https://2027.msrconf.org/track/msr-2027-industry-track |
| LLM4Code 2027 (workshop ICSE) | Workshop | 13/11/2026 (chỉ thấy qua bài LinkedIn, **cần kiểm chứng**) | B3 dạng position | https://conf.researchr.org/home/llm4code-2027 · **Không kịp** đủ điều kiện |
| AGENT'27 (workshop ICSE, Dublin) | Workshop: research/experience/tool/benchmark; 8 trang hoặc 5 trang; IEEE; single-anonymous | Hạn chung workshop ICSE 2027 là 27/11/2026 (**cần kiểm chứng** hạn riêng) | **B3** (experience paper) | https://conf.researchr.org/home/icse-2027/agent-2027 · https://conf.researchr.org/track/icse-2027/icse-2027-workshops |
| FSE 2027 Industry Papers (Thâm Quyến, 12–16/7/2027) | Hội nghị, track công nghiệp; ngắn 5+1 trang, dài 10+2 trang | **23/1/2027 AoE** | **B2: mục tiêu chính** | https://conf.researchr.org/track/fse-2027/fse-2027-industry-papers |
| SANER 2027 Agentic AI4SE Track | Hội nghị, double-anonymous | **cần kiểm chứng** | B2/B3 | https://conf.researchr.org/track/saner-2027/saner-2027-agentic-ai4se-track |
| arXiv (cs.SE) | Preprint | Không có hạn | B2 trước khi nộp FSE | https://blog.arxiv.org/2023/01/31/arxiv-announces-new-policy-on-chatgpt-and-similar-tools |
| RIVF 2026 (Hà Nội, 18–20/12/2026) | Hội nghị quốc tế tại VN | 31/8/2026: **đã qua**. RIVF 2027 chưa thấy thông báo | B3 (kỳ 2027) | Theo bài LinkedIn của ban tổ chức (https://vn.linkedin.com/in/leduydung), **cần kiểm chứng** |
| SoICT 2026 (TP.HCM, 4/12/2026) | Hội nghị quốc tế tại VN | ~9/9/2026: **đã qua** (trang tổng hợp, **cần kiểm chứng**) | B3 (kỳ 2027) | https://www.myhuiban.com/conference/2728?lang=en-us |
| FAIR (Hội nghị quốc gia Nghiên cứu cơ bản và ứng dụng CNTT) | Hội nghị quốc gia | FAIR'2026 họp 8–9/10/2026: đã qua. FAIR 2027 **cần kiểm chứng** | B3 bản tiếng Việt | https://easychair.org/cfp/FAIR2026 |
| KSE 2026 | Hội nghị quốc tế tại VN | Không tìm thấy thông báo: **cần kiểm chứng** | — | — |
| Tạp chí trong nước (vd. tạp chí CNTT&TT; VNU JCSCE) | Tạp chí | Chưa tra: **cần kiểm chứng** | B3 mở rộng | Hỏi thầy về danh mục tạp chí được tính điểm |

**Lựa chọn đề xuất:**
- B2: arXiv khoảng giữa 1/2027, rồi **FSE 2027 Industry (23/1/2027)**. Phương án dự phòng là MSR 2027 Industry (18/12/2026, sớm hơn nên rủi ro cao).
- B3: **AGENT'27 (≈ 27/11/2026)** nếu xong P-13/P-14 trong 3 tuần. Nếu không kịp thì chuyển sang hội nghị trong nước 2027.

## 4. Điều kiện cần và đủ trước khi nộp

| # | Điều kiện | Mức | Hiện trạng | Ai làm |
|---|---|---|---|---|
| D1 | **Số lượt lặp:** ≥ 5 lượt mỗi ô (bài × hệ) cho phép so chính. design.md §5.3 đề xuất 5 bài × 6 lượt × 2 nhánh cho pha xác nhận (chưa tính công suất) | Cần | n = 1–2 (T-a) | Phòng Phát triển (`dev-review.md`) |
| D2 | **Cùng mô hình hoặc tách hiệu ứng mô hình:** C5 so Claude Code (opus) với CCoding (sonnet), nên không tách được hiệu ứng multi-agent (token-analysis §5) | Cần | Chưa | Phòng Phát triển |
| D3 | **Kiểm định khai báo trước:** bootstrap/hoán vị phân tầng theo bài hoặc mô hình hỗn hợp; báo kích thước hiệu ứng + CI; không dùng Wilcoxon trên 5 cặp (design.md §5.3); phân tích độ nhạy (vd. bỏ t3 lượt treo stdin) ghi rõ là hậu nghiệm | Cần | Mới có bootstrap minh họa (T-f) | @data-scientist + Phát triển |
| D4 | **Bài lớn hơn:** ≥ 3 bài > 15 phút và/hoặc tập con SWE-bench. Đây là nơi giả thuyết "multi-agent nhanh hơn" còn mở (token-analysis §4.5) | Cần cho kết luận "khi nào nhanh hơn" | Chưa có | Phòng Phát triển |
| D5 | **C6** (`maxParallel`) và ít nhất một runtime khác | Nên | Chưa có dữ liệu | Phòng Phát triển |
| D6 | **Mở mã/dữ liệu:** `bench/vs-claude` (bài, test ẩn, CSV), script `token-analysis.mjs`. Dữ liệu benchtest đã là tổng hợp, nhãn Công khai | Cần (artifact) | Đã có trong repo, chưa đóng gói | Phát triển |
| D7 | **Ẩn danh dự án A:** rà PROCESS-REVIEW, TOOLS, data-protection-assessment, thông điệp commit (P-13). Nếu nơi đăng ẩn danh hai chiều thì ẩn cả tên hệ và repo (dùng kho ẩn danh) | Cần | Chưa xong | Nghiên cứu + Phát triển |
| D8 | **Đọc toàn văn** CAID, TeamBench, MAST, Lumer et al. và tra riêng "routing/adaptive compute" (K.4) | Cần trước khi viết "khác gì" | 24/31 nguồn chỉ đọc tóm tắt | @literature-researcher |
| D9 | **Gán nhãn MAST độc lập** bởi người thứ hai, báo độ đồng thuận (vd. Cohen's κ) | Cần cho B3 | Một người gán (P-14) | Nghiên cứu |
| D10 | **Khai báo dùng AI** theo nơi đăng và theo trường (§8) | Cần | Chưa soạn | Tom |
| D11 | **Kiểm lại số và mô tả kỹ thuật** so với mã (`dev-review.md`) và phản biện nội bộ (`review.md`) | Cần | Chưa có | Phát triển / @peer-reviewer |

## 5. Rủi ro

| Rủi ro | Khả năng | Ảnh hưởng | Giảm thiểu |
|---|---|---|---|
| Bị đánh giá là công bố lại CAID | Cao nếu trục là kiến trúc | Bị loại | Trục bài là phép đo (N1). Trích CAID ở mở đầu. Bảng "đã có/có thể mới" |
| Kết quả âm tính (CCoding đắt hơn) bị coi là "không có đóng góp" | Trung bình | Bị loại ở track nghiên cứu | Chọn track công nghiệp/kinh nghiệm. Trình bày đây là bằng chứng độc lập cùng chiều CAID, và chỉ ra pha gây tốn |
| Thí nghiệm bổ sung tốn hạn mức, không kịp 23/1/2027 | Trung bình | Lùi hạn | Ước lượng từ T-a: một lượt CCoding C5 ≈ 0.54–1.14 USD, ≈ 107–400 s. Lập lịch sớm; dự phòng nơi đăng 2027 |
| Nhiễu thời gian (tải nhà cung cấp, Windows chậm 2–3×, C-49) | Cao | CI rộng | Xen kẽ thứ tự hệ, chạy trên cùng máy/khung giờ, ghi môi trường |
| Rò rỉ thông tin nội bộ | Trung bình | Vi phạm ẩn danh / Data Protection Gate | D7. Không trích nguyên văn tài liệu nguồn chưa rà |
| Nội dung do AI soạn có lỗi trích dẫn/số | Trung bình | Liêm chính, lệnh cấm arXiv | D8, D11. Tom tự kiểm mọi trích dẫn và mọi số |
| Overfit vào 5 bài t1–t5 | Cao với N2/N4 | Kết luận không khái quát | Bộ bài giữ lại t6–t8 (design.md §5.4) |
| Salami slicing giữa B2 và B3 | Thấp | Đạo đức công bố | Mỗi bài một câu hỏi, trích chéo, không lặp bảng |

## 6. Lộ trình (đề xuất, tính từ 2/11/2026)

| Mốc | Việc | Đầu ra |
|---|---|---|
| 2/11–9/11 | Tom trình thầy (presentation-notes.md); chốt khung B2 + B3; chốt nơi đăng | Quyết định |
| 3/11–16/11 | Phòng Phát triển: `dev-review.md` (kiểm số, kế hoạch thí nghiệm, ước lượng hạn mức); rà ẩn danh P-13 | dev-review.md |
| 3/11–20/11 | (B3) Gán nhãn MAST lần hai, đo κ; rút gọn challenges.md thành bài 5–8 trang | Bản thảo B3 |
| ≈ 27/11 | (B3) Nộp AGENT'27 **nếu** D7, D9 xong. Nếu không thì để cho kỳ hội nghị trong nước 2027 | — |
| 17/11–31/12 | Chạy thí nghiệm bổ sung: D1, D2, D4, D5 | CSV mới, tái lập bằng script |
| 1/1–15/1/2027 | Phân tích lại (D3), cập nhật paper.md, review nội bộ, đọc toàn văn (D8) | Bản thảo B2 |
| ≈ 16/1/2027 | arXiv (B2) sau khi Tom duyệt khai báo AI | Preprint |
| 23/1/2027 | Nộp FSE 2027 Industry | — |
| Sau 3/2027 | B4 (tự cải thiện) nếu P1–P4 qua cổng A/B | Đề tài riêng |

## 7. Đề xuất cải thiện hệ thống theo ưu tiên (dựa trên S2–S4)

Ưu tiên tính theo hai tiêu chí: tác động đo được hoặc ước lượng được, và mức cần thiết cho việc công bố.

| Ưu tiên | Đề xuất | Căn cứ | Mã |
|---|---|---|---|
| 1 | **Thí nghiệm đủ chuẩn**: tăng n, cùng mô hình, bài > 15 phút, chạy C6 | n = 1–2. Chênh thời gian C5 nhạy với một lượt chạy (T-f) | P-07, P-09, C-12 |
| 2 | **Rút ngắn pha review trên đường găng**: reviewer nhận diff + kết quả lệnh kiểm tra; review theo hạng mục khi gộp xong | `review` 81.3 s > `execute` 76.9 s ở C5 (T-d). Review chiếm 24.0% ghi cache (T-c). O4 ước lượng −2.8% chi phí (T-e) | O4, P3, P-05, C-32 |
| 3 | **Giảm số tiến trình và đọc tệp lặp**, thay vì tinh chỉnh tiền tố: tái dùng phiên giữa các lượt cùng agent (mở rộng O2), chuyển kết quả khảo sát đã có cho lượt sau | Ghi cache = 49.4% chi phí. F chỉ 2 588 token mỗi lượt gọi (T-e1). 5.0 lượt gọi mỗi lượt chạy ở C5 (T-b) | O2, P2, C-13, C-20 |
| 4 | **Bật nhật ký sự cố (P4)** trước các bản vá tối ưu, để vòng tự cải thiện có dữ liệu | C-14 còn mở. P4 là bản vá thu thập dữ liệu | C-14, P4 |
| 5 | **Kiểm thử đối kháng hook / chạy bằng tài khoản ít quyền**: hook kiểm theo chuỗi, chưa phải sandbox HĐH | L3 "chưa kiểm thử đối kháng" | P-03, C-46 |
| 6 | **Kiểm tra cơ học hợp đồng song song**: hạng mục độc lập không được ghi cùng tệp; bài benchtest có xung đột ngữ nghĩa | Ràng buộc hiện chỉ nằm trong prompt | P-15, P-10, C-03, C-09 |
| 7 | **Giới hạn đầu ra (P1)** cho plan/review/synthesize | O5 ước lượng −1.7% | O5, P1 |
| 8 | **"Ghế" ≤ 2 hạng mục mỗi vai** khi chạy nhiều nhiệm vụ | Chờ 34 s ở C4 | C-23, P-04 |
| 9 | **Đo tách nguyên nhân Windows chậm** (khởi động `claude`, git, npm, hook) | Chậm 2–3×, chưa tách | C-49, P-06 |
| 10 | **Tiền tố ổn định (O1)**: làm nếu rẻ, nhưng không kỳ vọng nhiều | Trần trên 5.1%, thực tế thấp hơn (T-e) | O1 |
| — | **Không ưu tiên** rút gọn ngữ cảnh (O3) | 0.2% (T-e). `context_chars` ≈ 1 200 | O3 |
| — | O6 (lead opus → sonnet) **đã áp dụng** ở C5. Chưa đo chất lượng riêng. sonnet → haiku chưa định giá được | T-e | O6 |

**Lỗi/không nhất quán phát hiện khi tổng hợp (báo để sửa ở vòng revise):**
1. `challenges.md` C-13 ghi nguyên nhân gốc là "ghi lại tiền tố system prompt + định nghĩa công cụ", còn T-e1 cho thấy tiền tố **không** phải nguyên nhân chính (F = 2 588 token so với ≈ 19 656 token ghi cache mỗi lượt gọi). Cần sửa C-13 theo S2.
2. `challenges.md` P-01 vẫn ghi "gấp 2,8–4,0×". T-b chỉ ra con số này chỉ đúng một phần (C1 4.71×, C2 6.08×, C5 3.34×). Đề bài và mọi bản thảo phải dùng số của T-b.
3. So sánh C5 lẫn hiệu ứng mô hình (opus so với sonnet). Mọi câu "CCoding nhanh hơn/ngang" phải kèm điều kiện này.

## 8. Liêm chính và chính sách dùng AI

- **Trường:** Tom phải đối chiếu quy định liêm chính học thuật và quy định dùng công cụ AI của trường/khoa trước khi nộp hoặc trình bày. Phòng chưa tra quy định của trường: **cần kiểm chứng**. Toàn bộ tài liệu trong `docs/research/` do hệ đa tác tử CCoding soạn (mô hình Claude qua `claude-cli`). Đó là bản nháp. Tom chịu trách nhiệm về nội dung, phải tự kiểm mọi trích dẫn và số liệu, và tự viết lại phần lập luận.
- **ACM** (FSE, MSR, ICSE thuộc ACM/IEEE): công cụ AI không được đứng tên tác giả. Nội dung do AI tạo phải khai báo (sửa chính tả/ngữ pháp cơ bản thì không cần). Khai ở mục Acknowledgements, nêu phần nào, công cụ nào, phiên bản nào (ACM FAQ: https://www.acm.org/publications/policies/frequently-asked-questions; diễn giải thứ cấp, **cần kiểm chứng** văn bản gốc tại acm.org/publications/policies).
- **IEEE** (AGENT'27 xuất bản qua IEEE): nội dung do AI tạo (văn bản, hình, mã) phải khai ở mục acknowledgments, nêu hệ thống AI và các phần liên quan (https://open.ieee.org/author-guidelines-for-artificial-intelligence-ai-generated-text/; **cần kiểm chứng** trên IEEE Author Center).
- **arXiv:** từ 2023, AI không được là tác giả, phải khai báo việc dùng đáng kể, và tác giả chịu trách nhiệm (https://blog.arxiv.org/2023/01/31/arxiv-announces-new-policy-on-chatgpt-and-similar-tools). Thông tin về lệnh cấm một năm với nội dung LLM không kiểm (5/2026) mới thấy qua nguồn thứ cấp (https://casrai.org/news/arxiv-one-year-ban-unchecked-ai-content), **cần kiểm chứng** trên trang chính sách arXiv.
- **Gợi ý khai báo:** bài B2/B3 *nghiên cứu chính* một hệ đa tác tử dùng LLM. Nên khai báo tách bạch hai việc: (a) LLM là **đối tượng nghiên cứu**, mô tả ở mục Phương pháp; (b) LLM được dùng để **soạn nháp/phân tích**, ghi ở Acknowledgements và công cụ.

## 9. Một trang tóm tắt cho thầy hướng dẫn

> **Đề tài:** CCoding là hệ multi-agent lập trình theo mô hình "văn phòng nhiều phòng ban", tự xây và vận hành từ 26/10/2026. Câu hỏi: hệ này tốn bao nhiêu thời gian, token và cache so với một coding agent đơn mạnh (Claude Code), và gặp những lỗi gì khi vận hành thật?
>
> **Đã làm:**
> - Benchtest 5 bài, 461 test ẩn, vòng C1–C5 (C6 chưa có).
> - Script tái lập mọi bảng số (T-a…T-f).
> - 49 thách thức có bằng chứng, phân loại theo MAST + hạ tầng.
> - 15 cơ chế giới hạn sub-agent.
> - Thiết kế vòng tự cải thiện kèm 4 bản vá prompt (chưa đo).
>
> **Kết quả (minh họa, n = 1–2):**
> - Thiết kế ban đầu chậm và đắt gấp khoảng 2 lần.
> - Làn nhanh: thời gian không phân biệt được với Claude Code (+21.1 s, CI chứa 0), chi phí vẫn +21.8%.
> - Chất lượng hai bên ngang nhau, gần như đạt trọn test.
> - Ghi cache gấp 3.34–6.08 lần, do nhiều tiến trình đọc lại nội dung chứ không do tiền tố prompt.
> - Sau khi song song hóa, pha review thành nút cổ chai.
>
> **Điểm mới, nói thật:**
> - Kiến trúc (worktree song song, tự gộp, verifier) **đã có** ở CAID (CMU, 3/2026) và TeamBench (5/2026), nên không nhận là mới.
> - Phần có thể mới, mức trung bình: phép đo cache/token/thời gian theo pha so với agent đơn, và nhật ký lỗi vận hành của một hệ thật.
> - Kết quả cùng chiều CAID: multi-agent đắt hơn, không nhanh hơn rõ rệt.
>
> **Khuyến nghị:**
> - Một bài chính (thực nghiệm multi vs single), mục tiêu FSE 2027 Industry (hạn 23/1/2027), đăng arXiv trước khi nộp.
> - Một bài ngắn tùy chọn (kinh nghiệm + taxonomy), mục tiêu workshop AGENT'27 (≈ 27/11/2026) hoặc hội nghị trong nước 2027.
> - Tự cải thiện để thành đề tài sau.
> - Không phải công bố lại, nếu trục là phép đo chứ không phải kiến trúc.
>
> **Cần thầy góp ý:**
> 1. Track công nghiệp hay track nghiên cứu?
> 2. Tối thiểu bao nhiêu lượt lặp và bài lớn thì đủ?
> 3. Có cần bài trong nước để tính điểm không?
> 4. Quy định khai báo AI của trường.
>
> **Giới hạn:** n nhỏ; 5 bài ngắn; một runtime; C5 lẫn hiệu ứng mô hình (opus so với sonnet); 24/31 nguồn mới đọc tóm tắt.

## Tài liệu tham khảo (APA 7)

Cemri, M., Pan, M. Z., Yang, S., Agrawal, L. A., Chopra, B., Tiwari, R., Keutzer, K., Parameswaran, A., Klein, D., Ramchandran, K., Zaharia, M., Gonzalez, J. E., & Stoica, I. (2025). *Why do multi-agent LLM systems fail?* (arXiv:2503.13657v3). https://arxiv.org/abs/2503.13657v3 [CHỈ ĐỌC TÓM TẮT]

Geng, J., & Neubig, G. (2026). *Effective strategies for asynchronous software engineering agents* (arXiv:2603.21489). https://arxiv.org/abs/2603.21489

Hadfield, J., Zhang, B., Lien, K., Scholz, F., Fox, J., & Ford, D. (2025, June 13). *How we built our multi-agent research system*. Anthropic Engineering. https://www.anthropic.com/engineering/built-multi-agent-research-system

Kapoor, S., Stroebl, B., Siegel, Z. S., Nadgir, N., & Narayanan, A. (2024). *AI agents that matter* (arXiv:2407.01502). https://arxiv.org/abs/2407.01502v1

Kim, Y., Park, C., Kim, T., Park, E., Schmidgall, S., Rahman, S., Park, C., Breazeal, C., Liu, X., Palangi, H., Park, H. W., & McDuff, D. (2026). *TeamBench: Evaluating agent coordination under enforced role separation* (arXiv:2605.07073). https://arxiv.org/abs/2605.07073

Lumer, E., Nizar, F., Jangiti, A., Frank, K., Gulati, A., Phadate, M., & Subbiah, V. K. (2026). *Don't break the cache: An evaluation of prompt caching for long-horizon agentic tasks* (arXiv:2601.06007). https://arxiv.org/html/2601.06007

Xia, C. S., Deng, Y., Dunn, S., & Zhang, L. (2025). Demystifying LLM-based software engineering agents. *Proceedings of the ACM on Software Engineering (FSE 2025)*. https://arxiv.org/abs/2407.01489v2

Yan, W. (2025, June 12). *Don't build multi-agents*. Cognition. https://cognition.com/blog/dont-build-multi-agents

Chính sách và nơi đăng (trang web, truy cập 2/11/2026): URL ghi tại §3 và §8.

Nguồn nội bộ: `docs/research/related-work.md`, `performance/token-analysis.md`, `challenges.md`, `self-improvement/design.md`.
