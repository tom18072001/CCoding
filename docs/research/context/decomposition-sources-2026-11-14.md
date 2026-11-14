# Đối chiếu tài liệu: bóc tách, đa agent, model theo vai, định tuyến, LLM làm bộ chấm (K3, BRIEF-22)

Ngày: 2026-11-14 · Phân loại dữ liệu: **Nội bộ** (chỉ nguồn công khai; truy vấn không chứa tên dự án hay số vận hành) · Nhật ký truy vấn: `decomposition-search-log-2026-11-14.csv` · Tệp điều phối viên `decomposition-literature-2026-11-14.md` không có trong repo ⇒ tự rà từ đầu.

## 1. Phương pháp và giới hạn

- Đây là **rà soát có mục tiêu** (5 nhánh), không phải tổng quan hệ thống PRISMA đầy đủ. Số bước: 9 truy vấn `web_search` (mỗi truy vấn trả 10 kết quả, 90 dòng kết quả thô, chưa loại trùng cho từng dòng) → 15 bài/ tài liệu gốc được nêu tên → 10 đọc được nội dung → 5 chỉ thấy trong kết quả tìm, **chưa đọc** `[CHƯA KIỂM CHỨNG]`.
- Tiêu chí "đã đọc": `fetch_url` trả được nội dung có số/bảng. Tiêu đề hoặc tóm tắt của trang tổng hợp thứ ba **không** tính.
- Công cụ đọc trang có trả về bản trích; với 3 bài dài chỉ đọc được 100.000 ký tự đầu (ghi ở cột "phạm vi đọc"). Một số PDF nén không đọc được, đã chuyển sang bản HTML/ar5iv.
- Không dùng truy vấn `search_papers` (OpenAlex); không có số trích dẫn.
- Các bài dưới đây đều là **preprint arXiv** trừ khi ghi khác; bản bình duyệt được ghi nếu thấy trong kết quả tìm (chưa đối chiếu nội dung bản bình duyệt với bản arXiv).

## 2. Danh mục nguồn đã đọc (10)

| # | Nguồn | URL (đã thấy trong kết quả công cụ) | Loại | Nhánh | Phạm vi đọc |
|---|---|---|---|---|---|
| S1 | Kim và cs., *Towards a Science of Scaling Agent Systems* (arXiv 2512.08296, Google) | https://arxiv.org/html/2512.08296v1 | Preprint (chưa thấy bản bình duyệt) | 1, 2 | 0–100.000/157.347 ký tự (bản v1) |
| S2 | Anthropic, *How we built our multi-agent research system* | https://www.anthropic.com/engineering/multi-agent-research-system | Blog nhà cung cấp, số tự báo cáo, không tái lập được | 1, 3 | Toàn bài |
| S3 | Cemri và cs., *Why Do Multi-Agent LLM Systems Fail?* (MAST; NeurIPS 2025 theo trang https://neurips.cc/virtual/2025/poster/121528) | https://arxiv.org/html/2503.13657v3 | Bình duyệt (NeurIPS 2025, theo trang poster) / arXiv v3 | 1, 2, 5 | 0–100.000/160.349 |
| S4 | Prasad và cs., *ADaPT* (Findings NAACL 2024) | https://ar5iv.labs.arxiv.org/html/2311.05772 | Bình duyệt (Findings NAACL 2024, theo kết quả tìm) | 2, 3 | 0–100.000/140.660 |
| S5 | Dong và cs., *PEAR: Planner-Executor Agent Robustness Benchmark* (arXiv 2510.07505) | https://arxiv.org/abs/2510.07505 ; https://arxiv.org/html/2510.07505v4 | Preprint | 3 | Tóm tắt + 0–100.000/121.846; PDF không đọc được |
| S6 | Ong và cs., *RouteLLM* (ICLR 2025) | https://arxiv.org/html/2406.18665v3 | Bình duyệt (ICLR 2025, https://iclr.cc/virtual/2025/poster/30737) | 4 | Toàn bản v3 |
| S7 | Ding và cs., *Hybrid LLM: Cost-Efficient and Quality-Aware Query Routing* (ICLR 2024) | https://arxiv.org/html/2404.14618v1 | Bình duyệt (ICLR 2024, https://proceedings.iclr.cc/paper_files/paper/2024/hash/b47d93c99fa22ac0b377578af0a1f63a-Abstract-Conference.html) | 4 | Toàn bản v1 |
| S8 | Zheng và cs., *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena* (NeurIPS 2023) | https://arxiv.org/html/2306.05685v4 | Bình duyệt (NeurIPS 2023, https://neurips.cc/virtual/2023/poster/73434) | 5 | Toàn bản v4 |
| S9 | Wang và cs., *Large Language Models are not Fair Evaluators* (ACL 2024) | https://ar5iv.labs.arxiv.org/html/2305.17926 | Bình duyệt (ACL 2024, https://aclanthology.org/2024.acl-long.511.pdf) | 5 | Toàn bài (bản ar5iv) |
| S10 | Crupi và cs., *On the Effectiveness of LLM-as-a-judge for Code Generation and Summarization* (arXiv 2507.16587) | https://arxiv.org/html/2507.16587v1 | Preprint | 5 | 0–100.000/119.485 |

Phủ nhánh: 1 = S1, S2, S3; 2 = S1, S3, S4; 3 = S2, S4, S5; 4 = S6, S7; 5 = S8, S9, S10 (+ S3 có κ của bộ chấm LLM). Đủ 5 nhánh, ≥ 8 nguồn.

**Thấy trong kết quả tìm nhưng chưa đọc `[CHƯA KIỂM CHỨNG]`** (không dùng làm căn cứ số): arXiv 2508.15310 (IPIGuard), 2506.11578 (COPE, *Efficient LLM Collaboration via Planning*), 2605.29927 (biểu diễn kế hoạch cho web agent), 2604.27727 (LLM-judge cho đồng sáng tạo mã), 2511.10865 (khung human-in-the-loop). Chỉ có số do trang tìm kiếm tóm tắt; không chép vào bảng §4.

## 3. Phát hiện theo nhánh (có trích dẫn) và suy luận tách riêng

### Nhánh 1 — Một agent hay nhiều agent
**Phát hiện.**
- S1 (§4.2, Hình 2): 180 cấu hình, 4 bộ benchmark, 3 họ LLM. Thay đổi so với agent đơn: Finance-Agent (tách song song được) tốt nhất **+80,9%** (Centralized); PlanCraft (tuần tự, phụ thuộc trạng thái) "every multi-agent variant … degraded performance by 39–70%"; trung bình toàn bộ **−3,5%** (CI 95% −18,6% đến +25,7%).
- S1 (§4.3, bảng 4): khi baseline agent đơn vượt khoảng **45%**, phối hợp cho lợi suất giảm hoặc âm (β = −0,408, p < 0,001). Mô hình dự đoán chọn đúng kiến trúc cho **87%** cấu hình giữ lại (ngẫu nhiên 20%, chỉ-theo-năng-lực 54%).
- S1 (bảng 5): khuếch đại lỗi: đơn 1,0×; Independent 17,2×; Decentralized 7,8×; Hybrid 5,1×; Centralized 4,4×. Chi phí: thành công trên 1K token: đơn 67,7 so với Centralized 21,5; chi phí thêm Centralized 285%, Hybrid 515%. Tác giả gán chênh lệch cho khâu kiểm tra của bộ điều phối.
- S2: lead Opus 4 + subagent Sonnet 4 hơn Opus 4 đơn **90,2%** trên eval nghiên cứu nội bộ của hãng; dùng khoảng **15×** token so với chat (agent đơn ~4×); trên BrowseComp, token riêng giải thích **80%** phương sai. Hãng nêu rõ không hợp: ngữ cảnh chung, nhiều phụ thuộc, "most coding tasks".
- S3 (§3, §4): 1.642 vết, 14 kiểu hỏng, 3 nhóm. Cộng theo kiểu: thiết kế hệ thống ≈ 44,2%, lệch giữa các agent ≈ 32,4%, xác minh nhiệm vụ ≈ 23,5% (tổng này **do bài trích tự cộng**, bài không nêu). Kiểu xác minh: kết thúc sớm 6,2%, xác minh thiếu 8,2%, xác minh sai 9,1%. Can thiệp trên ChatDev: +9,4% (đổi vai/quy trình), +15,6% (thêm bước xác minh mục tiêu cấp cao).

**Suy luận (cho CCoding, chưa kiểm).** Lợi ích đa agent phụ thuộc vào **mức tách song song được** của việc; việc tuần tự mà vẫn chia thì lỗ. Điều này khớp với việc đo "song song cho phép" trong kế hoạch, và gợi ý chỉ số hiệu quả nên nhìn chi phí token và độ tuần tự, không chỉ điểm. Cẩn trọng: S1 và S2 không cùng chuẩn đo, S2 là blog tự báo cáo, các tác vụ nghiên cứu/tài chính khác công việc sửa mã.

### Nhánh 2 — Chất lượng bóc tách và lập kế hoạch
**Phát hiện.**
- S4 (Bảng 1, ALFWorld, GPT-3.5): Plan-and-Execute (bóc tách tĩnh một lần) **43,3** = ReAct 43,3; ADaPT (bóc tách khi executor thất bại, đệ quy) **71,6**. WebShop (Bảng 2): Plan-and-Execute **17,0** thấp hơn ReAct 32,0; ADaPT 44,0. TextCraft: 27,0 so với ADaPT 52,0. Bài mô tả Plan-and-Execute "không xử lý được lỗi trung gian"; **không** có phân tích lỗi riêng cho nó.
- S4 (Bảng 3, §6.3): độ sâu công thức 3 thì ReAct 1,8 so với ADaPT 38,7; độ sâu bóc tách tăng theo độ khó nhiệm vụ.
- S4 (Bảng 6, phụ lục C): với executor mạnh hơn, Plan-and-Execute lên 63,4 (so với ReAct 56,7), tức bóc tách tĩnh phụ thuộc năng lực executor.
- S3: lỗi đặc tả/vai và kết thúc/xác minh là hai nhóm lớn (xem nhánh 1).

**Suy luận.** Kế hoạch tĩnh ban đầu mà không có vòng sửa dễ hỏng khi bước giữa thất bại; thước đo chất lượng bóc tách nên gồm "kế hoạch có được chỉnh khi bước thất bại hay không", không chỉ "kế hoạch có phủ yêu cầu". Chưa có nguồn nào đã đọc đo trực tiếp "chất lượng bản kế hoạch" cho tác vụ mã (khoảng trống).

### Nhánh 3 — Model cho planner/verifier và executor
**Phát hiện.**
- S5 (tóm tắt): "a weak planner degrades overall clean task performance more severely than a weak executor". S5 Bảng 2 (§4.3): GPT-5 planner + GPT-5-mini executor **85,22 ± 1,82**; + GPT-5-nano **86,55 ± 3,94** (executor rẻ hơn không giảm khi planner mạnh); Gemini-2.5-pro tự làm cả hai 54,82 ± 2,37, planner pro + executor flash 67,59 ± 6,57 (có độ lệch lớn, khoảng tin cậy chồng nhau). Các con số "~50%" và "~30%" trong chữ của §4.3 (Gemini-2.0-flash) **không thấy trong phần đã đọc** `[CHƯA KIỂM CHỨNG]`; benchmark là nhiệm vụ công cụ (Banking, Slack, Travel, Workspace), không phải mã.
- S4 (Bảng 4, ALFWorld dev): executor LLaMA-2-70B không planner 20,4 → có planner GPT-3.5 **43,3**; executor GPT-3.5 38,4 → 58,3 với planner GPT-3.5.
- S2: lead mạnh (Opus 4) + subagent rẻ hơn (Sonnet 4); không công bố so sánh phân vai theo model.

**Suy luận.** Chiều chung: đặt model mạnh vào lập kế hoạch/phối hợp, model rẻ vào thực thi là hợp lý, nhưng bằng chứng đến từ tác vụ không phải mã, một số khoảng tin cậy rộng, và không nguồn nào đã đọc kiểm riêng vai **nghiệm thu/verifier**. Với CCoding điều này chỉ là giả thuyết cho E9, không phải kết luận.

### Nhánh 4 — Định tuyến theo độ khó
**Phát hiện.**
- S6 (Bảng 1, MT-Bench): để đạt 50% khoảng cách hiệu năng, router matrix factorization (Arena + dữ liệu chấm) chỉ gọi model mạnh **13,40%** so với **49,03%** ngẫu nhiên, tức **3,66×** rẻ hơn ở mức 95% chất lượng GPT-4 (Bảng 6). MMLU: 1,41× (92% chất lượng); GSM8K: 1,49× (87% chất lượng). Đổi cặp model không huấn luyện lại (Bảng 5): 30,48% so với 47,23% ngẫu nhiên ở CPT(50%). Bài có chỗ chữ và bảng lệch ("up to 30% less" so với bảng ~46%).
- S6: khi bổ sung nhãn do LLM chấm, router tốt hơn rõ (Bảng 1 so Arena một mình: BERT 78,09% → 19,58%); tức **router phụ thuộc vào bộ chấm LLM**.
- S7 (Bảng 1, §4.2): giảm gọi model lớn tới **40%**; nhưng "không giảm chất lượng" chỉ với cặp chênh lệch nhỏ (Llama-2 7b/13b: giảm 0,2%). Cặp trung bình ở mức 40%: giảm 2,9–3,5%; cặp lệch lớn: 10,3–13,8%. Trên tập kiểm (Bảng 3, ngưỡng đặt trên 500 mẫu, ≤1% giảm) lợi chi phí chỉ 15,15% (cặp trung bình), 5,05% (cặp lệch lớn).

**Suy luận.** Định tuyến theo độ khó có lợi khi (a) có nhãn độ khó đủ tin và (b) model rẻ không quá yếu. Cả hai nguồn định tuyến cho **một câu hỏi/một phản hồi**, không cho kế hoạch nhiều bước hay sửa mã; áp dụng cho chọn làn của CCoding chỉ mang tính tương tự. Điểm cần đối chiếu: ngưỡng đặt trên tập kiểm khác ngưỡng đặt trên tập dev làm lợi giảm mạnh (S7 Bảng 3).

### Nhánh 5 — LLM làm bộ chấm (ưu tiên số đo đồng thuận với người)
**Phát hiện.**
- S8 (Bảng 5, MT-bench): GPT-4 – người **66%** (cách tính có hòa) và **85%** (cách tính bỏ hòa); người – người **63%** và **81%** (lượt 1). Ngẫu nhiên: 33% / 50%. Thiên lệch vị trí (Bảng 2): nhất quán GPT-4 65,0%, GPT-3.5 46,2%, Claude-v1 23,8%. Tấn công danh sách lặp (Bảng 3): Claude-v1 và GPT-3.5 sai 91,3%, GPT-4 8,7%. Tự ưu ái: GPT-4 +10%, Claude-v1 +25% win rate, nhưng tác giả "cannot determine" do ít dữ liệu. Chấm toán (Bảng 4, 20 lượt): mặc định sai 14/20, CoT 6/20, có đáp án tham chiếu **3/20**. Giảm thiểu: gọi 2 lần đổi thứ tự, chỉ coi thắng khi thắng cả hai.
- S9 (Bảng 2, §2.2): ChatGPT làm bộ chấm: tỉ lệ mâu thuẫn khi đổi thứ tự **66/80 (82,5%)**; GPT-4: 37/80 (46,3%). Độ chính xác so với nhãn đa số của người (Bảng 4): GPT-4 chấm thẳng **52,7%** (κ 0,24), ChatGPT **44,4%** (κ 0,06); sau MEC+BPC (k=3): 62,5% (κ 0,37) và 58,7% (κ 0,31); thêm người xem lại 20% ca khó: 73,8% (κ 0,56) và 71,3% (κ 0,52). Người chấm đơn lẻ so với đa số: trung bình 71,7% (κ 0,54). Chi phí gán nhãn giảm 39% (ChatGPT, 20% người hỗ trợ).
- S10 (Bảng II, §III-A): bộ chấm LLM so với kết quả chạy test cho mã sinh: κ GPT-4-turbo **0,21** (Java), **0,10** (Python); GPT-3.5-turbo 0,16 / 0,09; DeepSeek Coder 1,3B 0,03 / −0,04. GPT-4-turbo xếp nhầm 50% bản Java sai là đúng; 35% bản Python sai là đúng. Kết luận tác giả: ngay cả chấm tốt nhất "frequently misjudges". Tóm tắt mã (Bảng V, α Krippendorff so với người): GPT-4 nội dung 0,58 (Java), 0,63 (Python); người – người 0,81 / 0,69. Model nhỏ (CodeLlama, DeepSeek Coder) không đáng tin.
- S3 (§3.2–3.4, Bảng 2): bộ chú thích LLM (o1, few-shot) so với chuyên gia người: độ chính xác **94%**, κ **0,77**; trên hệ thống/benchmark chưa thấy κ 0,79; người – người κ **0,88**.

**Suy luận cho E9.** (i) Đồng thuận bộ chấm LLM với người rất khác nhau theo nhiệm vụ: 85% (đối thoại, bỏ hòa) và κ 0,77 (nhãn lỗi đa agent, có rubric) đến κ ≈ 0,10–0,21 (đúng/sai mã so với test). Với mã, **kết quả chạy test là chuẩn tham chiếu**, bộ chấm LLM chỉ là phụ trợ. (ii) Mọi so sánh bộ chấm cần kèm mức đồng thuận người – người làm trần (S8 81%, S3 κ 0,88, S9 κ 0,54) và nêu rõ dung sai/weighted nếu có. (iii) Dùng giảm thiểu đã có số: đổi thứ tự, đáp án tham chiếu, bộ chấm khác họ model với model được chấm (tự ưu ái chưa kết luận được trong S8; S10 báo ảnh hưởng không đáng kể). Các nguồn không cùng định nghĩa đồng thuận (tỉ lệ khớp, κ, α), không cộng/gộp số.

## 4. Bảng "số dùng được cho K4/K6"

Cột "Mức tin": **Cao** = số đọc trực tiếp ở bảng/mục và nhất quán nội bộ; **Vừa** = đọc được nhưng bài có lệch chữ/bảng, hoặc nguồn tự báo cáo; **Thấp** = một phần chưa đọc được.

| Mã | Đại lượng | Giá trị | Nguồn · mục/bảng | Mức tin | Dùng cho |
|---|---|---|---|---|---|
| N1 | Đa agent so với đơn, tác vụ tách được (Finance-Agent), tốt nhất | +80,9% | S1 §4.2 | Cao | K6: điều kiện có lợi |
| N2 | Đa agent so với đơn, tác vụ tuần tự (PlanCraft) | −39% đến −70% | S1 §4.2, Hình 2 | Cao | K6: điều kiện lỗ |
| N3 | Đổi trung bình mọi kiến trúc/benchmark | −3,5% (CI −18,6…+25,7) | S1 §4.2 | Cao | K6 |
| N4 | Ngưỡng baseline agent đơn mà trên đó phối hợp hết lợi | ≈ 45% | S1 §4.3, bảng 4 | Vừa (mô hình hồi quy) | K4/K6 |
| N5 | Khuếch đại lỗi: đơn / có bộ điều phối kiểm / không kiểm | 1,0× / 4,4× / 17,2× | S1 bảng 5 | Cao | K6: vai nghiệm thu |
| N6 | Chi phí thêm của đa agent (Centralized / Hybrid) | +285% / +515% | S1 bảng 5 | Cao | K4/K6 |
| N7 | Token đa agent so với chat | ~15× (agent đơn ~4×) | S2 | Vừa (blog) | K6 |
| N8 | Token giải thích phương sai kết quả (BrowseComp) | 80% | S2 | Vừa (blog) | K6: nhắc kiểm soát token khi so sánh |
| N9 | Nhóm lỗi hệ đa agent: thiết kế / lệch agent / xác minh | ≈ 44,2% / 32,4% / 23,5% | S3 §4 (tự cộng từ bảng kiểu lỗi) | Vừa | K6 |
| N10 | Thêm bước xác minh mục tiêu cấp cao (ChatDev) | +15,6% thành công | S3 §4–5.3 | Vừa | K6: vai nghiệm thu |
| N11 | Bóc tách tĩnh một lần so với tự điều chỉnh (ALFWorld, WebShop) | 43,3→71,6; 17,0→44,0 | S4 Bảng 1, 2 | Cao | K1/K6: thiết kế bóc tách |
| N12 | Planner tạo lợi cho executor yếu (ALFWorld dev) | 20,4→43,3 | S4 Bảng 4 | Cao | K4 |
| N13 | Planner mạnh + executor nhỏ so với executor mạnh hơn | 86,55 (nano) so với 85,22 (mini) | S5 Bảng 2 | Vừa (tác vụ công cụ, sd lớn) | K4 (E9) |
| N14 | Chi phí gọi model mạnh khi định tuyến, giữ 95% chất lượng | 3,66× rẻ hơn (MT-Bench) | S6 Bảng 6 | Vừa | K4: kỳ vọng tối đa của định tuyến |
| N15 | Định tuyến: giảm chất lượng tại 40% tiết kiệm theo chênh lệch cặp model | 0,0–0,2% / 2,9–3,5% / 10,3–13,8% | S7 Bảng 1 | Cao | K4 |
| N16 | Bộ chấm LLM – người, đối thoại (bỏ hòa) so với người – người | 85% so với 81% | S8 Bảng 5 | Cao | K4/E9 |
| N17 | Thiên lệch vị trí: nhất quán GPT-4 / ChatGPT / Claude-v1 | 65,0% / 46,2% / 23,8% | S8 Bảng 2 | Cao | K4/E9: cần đổi thứ tự |
| N18 | Chấm toán: sai khi mặc định / có đáp án tham chiếu | 14/20 → 3/20 | S8 Bảng 4 | Vừa (n=20) | K4/E9 |
| N19 | Đồng thuận với nhãn người (vanilla → hiệu chỉnh → +người 20%) | GPT-4 κ 0,24→0,37→0,56 | S9 Bảng 4 | Cao | K4/E9 |
| N20 | Đồng thuận người – người (làm trần) | κ 0,54 (S9); κ 0,88 (S3); 81% (S8) | S9, S3, S8 | Cao (khác định nghĩa) | K4/E9 |
| N21 | Bộ chấm LLM so với test, mã sinh: κ GPT-4-turbo | 0,21 (Java) / 0,10 (Python) | S10 Bảng II | Cao | K4/E9: test là chuẩn |
| N22 | Bộ chú thích LLM so với chuyên gia (nhãn lỗi, rubric rõ) | acc 94%, κ 0,77 | S3 §3.3, Bảng 2 | Cao | K4/E9 |
| N23 | Planner yếu so với executor yếu | planner yếu hại hơn (định tính) | S5 tóm tắt §4.3 | Vừa (số "~30%/~50%" chưa kiểm) | K4 |

Không chép số vận hành của CCoding vào bảng này; đối chiếu với số đo của dự án do K2/K4/K6 làm.

## 5. Mâu thuẫn và khoảng trống

**Mâu thuẫn / lệch cần ghi.**
- S1 (không lợi, trung bình −3,5%) với S2 (+90,2%): không mâu thuẫn thật; khác loại tác vụ (tài chính/nghiên cứu tách song song được và bài nghiên cứu nội bộ), khác chuẩn đo; S2 tự báo cáo và tiêu tốn token ~15×.
- S6: chữ nói "up to 30% less" nhưng bảng cho ~46% ít hơn (cùng cặp, matrix factorization). S3: số hệ thống ở phần mở đầu (7 hệ, 41%–86,7% hỏng) khác Hình 5 (6 hệ). S5: số trong chữ và bảng khác họ model (Gemini-2.0 so với 2.5).
- S8 coi tự ưu ái "chưa kết luận được", S10 coi không đáng kể với mã, trong khi vẫn thấy mọi bộ chấm đánh thấp mã người viết (−0,37): chưa có kết luận chung.

**Khoảng trống.**
1. Chưa nguồn đã đọc nào đo **chất lượng kế hoạch bóc tách cho việc sửa mã** (chia theo tệp/hạng mục, độ phủ, phụ thuộc). Có thể có ở các bài chưa đọc (§2) hoặc không có; cần một vòng tìm riêng.
2. Chưa nguồn nào đo riêng **model nghiệm thu/verifier** (mạnh so với rẻ) trên tác vụ mã; chỉ có suy ra từ S1 bảng 5, S3 (xác minh yếu).
3. Định tuyến (S6, S7) là theo từng câu hỏi; không có nguồn đã đọc về định tuyến lên **số agent/số hạng mục** theo độ khó (ngoài quy tắc tự đặt của S2).
4. Phần sau 100.000 ký tự của S1, S3, S4, S5, S10 chưa đọc; số có thể bổ sung (ví dụ phụ lục).
5. Không có số trích dẫn, không đối chiếu bản bình duyệt với bản arXiv đã đọc.

## 6. Gợi ý hướng quyết định (cho K4, K6; chưa phải kết luận của CCoding)

1. Báo cáo hiệu quả chia việc phải nêu cả **độ tách song song của việc** (N1–N3) và **chi phí token** (N6–N8), không chỉ điểm hay thời gian.
2. Vai nghiệm thu: các nguồn nhất quán rằng kiểm tra yếu/thiếu là nguồn lỗi lớn (N5, N9, N10); đây là lập luận cho một cổng bắt buộc, không phải dẫn chứng đã kiểm cho CTO/peer-reviewer của CCoding.
3. E9 (model theo vai): đăng ký trước cặp planner mạnh/executor rẻ (N12, N13, N23), kèm quy tắc chấm: **ưu tiên kết quả chạy test**, bộ chấm LLM chỉ phụ (N21), đổi thứ tự + đáp án tham chiếu (N17, N18), báo κ kèm trần người – người (N20) và nêu định nghĩa đồng thuận.
4. Cảnh báo cho K6: các số trên đến từ tác vụ không phải sửa mã trong repo; không dùng làm chứng cứ "đã chứng minh".

## 7. Tài liệu tham khảo (một chuẩn; URL đã thấy trong kết quả công cụ)

- Kim, Y. và cs. *Towards a Science of Scaling Agent Systems.* arXiv:2512.08296 (preprint; trang liệt kê v3 tháng 4/2026, bản đã đọc là v1). https://arxiv.org/html/2512.08296v1
- Anthropic. *How we built our multi-agent research system.* Blog kỹ thuật. https://www.anthropic.com/engineering/multi-agent-research-system
- Cemri, M., Pan, M. Z. và cs. *Why Do Multi-Agent LLM Systems Fail?* arXiv:2503.13657 (v3); NeurIPS 2025. https://arxiv.org/html/2503.13657v3
- Prasad, A. và cs. *ADaPT: As-Needed Decomposition and Planning with Language Models.* Findings NAACL 2024; arXiv:2311.05772. https://ar5iv.labs.arxiv.org/html/2311.05772
- Dong, S. và cs. *PEAR: Planner-Executor Agent Robustness Benchmark.* arXiv:2510.07505 (preprint). https://arxiv.org/abs/2510.07505
- Ong, I. và cs. *RouteLLM: Learning to Route LLMs with Preference Data.* ICLR 2025; arXiv:2406.18665. https://arxiv.org/html/2406.18665v3
- Ding, D. và cs. *Hybrid LLM: Cost-Efficient and Quality-Aware Query Routing.* ICLR 2024; arXiv:2404.14618. https://arxiv.org/html/2404.14618v1
- Zheng, L. và cs. *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena.* NeurIPS 2023; arXiv:2306.05685. https://arxiv.org/html/2306.05685v4
- Wang, P. và cs. *Large Language Models are not Fair Evaluators.* ACL 2024; arXiv:2305.17926. https://ar5iv.labs.arxiv.org/html/2305.17926
- Crupi, G. và cs. *On the Effectiveness of LLM-as-a-judge for Code Generation and Summarization.* arXiv:2507.16587 (preprint). https://arxiv.org/html/2507.16587v1

Tên tác giả lấy từ kết quả tìm hoặc trang bài; phần "và cs." chưa đối chiếu danh sách đầy đủ `[CHƯA KIỂM CHỨNG]`.
