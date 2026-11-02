# Tổng quan tài liệu — Nhóm A (khung multi-agent, coding agent, đánh giá, tranh luận multi vs single)

> Hạng mục S1 · Phòng Nghiên cứu · lập ngày 2026-11-02 · chuẩn trích dẫn APA 7, dạng (Tác giả, năm) · dữ liệu: nội bộ.
> Nhóm B (tự cải thiện, tối ưu giao tiếp/token, an toàn/quyền, công bố 2025–2026) và kết luận điểm mới do S5 bổ sung ở cuối tệp.

## 0. Giới hạn cần đọc trước

- **Công cụ thực tế:** phiên này chỉ có `WebSearch` và `WebFetch`; **không có `search_papers` (OpenAlex)** nên không có số trích dẫn hay DOI từ OpenAlex. DOI/URL bên dưới chép nguyên văn từ kết quả công cụ.
- **Mức đọc trung thực:** chỉ **4/15** nguồn được mở trang và đọc nội dung qua `WebFetch` (Anthropic, Cognition: trang bài đầy đủ; MAST, AI Agents That Matter: trang tóm tắt arXiv). **11/15** nguồn chỉ thấy **bản tóm lược trong kết quả `WebSearch`** (mô tả tóm tắt, số liệu, nơi đăng) — gắn nhãn `[CHỈ ĐỌC TÓM TẮT]`, **chỉ dùng cho khẳng định ở mức tóm tắt**. Không nguồn nào đọc toàn văn PDF.
- **Danh sách tác giả:** công cụ chỉ trả tên tác giả đầu (và số đồng tác giả) cho nhiều bài, nên mục APA ghi *tác giả đầu et al.* kèm ghi chú; **cần mở trang để điền đủ tác giả (APA 7 liệt kê tới 20 tác giả)** trước khi nộp. Không tự điền từ trí nhớ.
- Số liệu hiệu năng dưới đây là **số tự báo cáo của tác giả**, từ tóm tắt; không so sánh trực tiếp giữa các bài (benchmark, mô hình, năm khác nhau).
- Truy vấn không chứa tên dự án/cơ quan nội bộ (chỉ tiêu đề bài công khai).

## 1. Nhật ký truy vấn

Công cụ: `WebSearch` (mode standard), 15 truy vấn, ngày 2026-11-02, không bộ lọc năm/venue (không hỗ trợ), mỗi truy vấn trả ≈10 liên kết; "Chọn" = số nguồn đưa vào tổng quan.

| # | Công cụ | Truy vấn (nguyên văn) | Bộ lọc | Ngày | Chọn |
|---|---|---|---|---|---|
| Q1 | WebSearch | MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework arXiv | không | 2026-11-02 | 1 |
| Q2 | WebSearch | ChatDev: Communicative Agents for Software Development arXiv | không | 2026-11-02 | 1 |
| Q3 | WebSearch | AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation arXiv | không | 2026-11-02 | 1 |
| Q4 | WebSearch | AgentVerse: Facilitating Multi-Agent Collaboration and Exploring Emergent Behaviors arXiv | không | 2026-11-02 | 1 |
| Q5 | WebSearch | CAMEL: Communicative Agents for "Mind" Exploration of Large Language Model Society arXiv | không | 2026-11-02 | 1 |
| Q6 | WebSearch | SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering arXiv | không | 2026-11-02 | 1 |
| Q7 | WebSearch | OpenHands: An Open Platform for AI Software Developers as Generalist Agents arXiv | không | 2026-11-02 | 1 |
| Q8 | WebSearch | Agentless: Demystifying LLM-based Software Engineering Agents arXiv | không | 2026-11-02 | 1 |
| Q9 | WebSearch | MapCoder: Multi-Agent Code Generation for Competitive Problem Solving ACL 2024 | không | 2026-11-02 | 1 |
| Q10 | WebSearch | AgentCoder: Multi-Agent-based Code Generation with Iterative Testing and Optimisation arXiv | không | 2026-11-02 | 1 |
| Q11 | WebSearch | Magentic-One: A Generalist Multi-Agent System for Solving Complex Tasks arXiv | không | 2026-11-02 | 1 |
| Q12 | WebSearch | Why Do Multi-Agent LLM Systems Fail? Cemri MAST arXiv 2503.13657 | không | 2026-11-02 | 1 |
| Q13 | WebSearch | AI Agents That Matter Kapoor Narayanan arXiv 2407.01502 | không | 2026-11-02 | 1 |
| Q14 | WebSearch | Anthropic "How we built our multi-agent research system" 2025 | không | 2026-11-02 | 1 |
| Q15 | WebSearch | Cognition "Don't Build Multi-Agents" Walden Yan 2025 | không | 2026-11-02 | 1 |
| F1 | WebFetch | https://www.anthropic.com/engineering/built-multi-agent-research-system | — | 2026-11-02 | đọc |
| F2 | WebFetch | https://cognition.ai/blog/dont-build-multi-agents → chuyển hướng 301 sang https://cognition.com/blog/dont-build-multi-agents (URL chuyển hướng do máy chủ trả, đã mở lại) | — | 2026-11-02 | đọc |
| F3 | WebFetch | https://arxiv.org/abs/2503.13657v3 | — | 2026-11-02 | đọc |
| F4 | WebFetch | https://arxiv.org/abs/2407.01502v1 | — | 2026-11-02 | đọc |

Ghi chú sàng lọc: đây là tổng quan **nhắm đích** (danh sách 15 nguồn do đề bài chỉ định), không phải tổng quan có hệ thống PRISMA; không có bước loại trùng/sàng theo tiêu chí. Mỗi truy vấn chọn bản gốc (arXiv/nhà xuất bản/blog gốc), bỏ bản tổng hợp thứ cấp (aitopics, bohrium, fugumt…). Một số kết quả tìm thấy từ bên thứ ba về bài Cognition (follow-up "Multi-Agents: What's Actually Working", 2026-04-22) **chưa được mở** → chuyển cho S5, ghi `[CHƯA KIỂM CHỨNG]`.

## 2. Các nguồn (mỗi nguồn một mục)

Quy ước "Mức đọc": **[ĐỌC TRANG]** = đã mở trang bằng `WebFetch`; **[CHỈ ĐỌC TÓM TẮT]** = chỉ có tóm lược từ kết quả tìm kiếm.

### 2.1 MetaGPT
- **APA 7:** Hong, S., et al. (2024). MetaGPT: Meta programming for a multi-agent collaborative framework. *The Twelfth International Conference on Learning Representations (ICLR 2024)*. https://proceedings.iclr.cc/paper_files/paper/2024/hash/6507b115562bb0a305f1958ccc87355a-Abstract-Conference.html — arXiv:2308.00352 (https://arxiv.org/abs/2308.00352v5). *(Tác giả đầu: Sirui Hong, +14 đồng tác giả; điền đủ khi mở trang.)*
- **Loại nguồn:** bình duyệt (hội nghị). **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp (mức tóm tắt):** dùng quy trình chuẩn (SOP) làm prompt, các agent theo vai trò làm việc dây chuyền; báo cáo mạch lạc hơn các hệ chat đa agent trước đó; tự báo cáo Pass@1 85,9% và 87,7% trên benchmark sinh mã (số từ bản HTML, cần đối chiếu PDF).
- **Giống CCoding:** vai trò theo chức danh + quy trình có pha. **Khác:** MetaGPT mô phỏng một công ty phần mềm cho sinh dự án từ yêu cầu; CCoding có nhiều phòng ban, worktree song song, hook quyền công cụ, ngân sách token, đa runtime.

### 2.2 ChatDev
- **APA 7:** Qian, C., et al. (2024). ChatDev: Communicative agents for software development. *Proceedings of ACL 2024*. arXiv:2307.07924. https://arxiv.org/abs/2307.07924 *(Chen Qian +13 đồng tác giả; ACL 2024 theo trang arXiv trong kết quả tìm kiếm — chưa thấy URL ACL Anthology.)*
- **Loại:** bình duyệt (theo ghi chú arXiv) / bản đọc là preprint. **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** "chat chain" chia pha thiết kế–mã–kiểm thử thành tác vụ con; "communicative dehallucination" (agent hỏi lại chi tiết trước khi trả lời) giảm mã thiếu/không chạy được; báo cáo tốt hơn baseline về completeness, executability, consistency.
- **Giống:** pha tuần tự theo vai trò. **Khác:** ChatDev chủ yếu đối thoại giữa cặp agent; CCoding giao việc theo DAG có phụ thuộc, tách worktree, và review độc lập có vòng sửa.

### 2.3 AutoGen
- **APA 7:** Wu, Q., et al. (2023). *AutoGen: Enabling next-gen LLM applications via multi-agent conversation* (arXiv:2308.08155). https://arxiv.org/abs/2308.08155v2 *(Qingyun Wu +13 đồng tác giả; có bản ICLR 2024 Workshop LLM Agents theo Microsoft Research: https://www.microsoft.com/en-us/research/publication/autogen-enabling-next-gen-llm-applications/)*
- **Loại:** preprint (có bản workshop). **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** khung lập trình agent hội thoại, trộn LLM/người/công cụ; mẫu hội thoại định nghĩa bằng ngôn ngữ tự nhiên và mã.
- **Giống:** đa vai, có người trong vòng lặp (Tom duyệt kế hoạch). **Khác:** AutoGen là thư viện tổng quát; CCoding là ứng dụng cụ thể có quy trình, sổ cái token, nhật ký băm và chính sách dữ liệu tích hợp sẵn.

### 2.4 AgentVerse
- **APA 7:** Chen, W., et al. (2024). AgentVerse: Facilitating multi-agent collaboration and exploring emergent behaviors. *ICLR 2024*. https://proceedings.iclr.cc/paper_files/paper/2024/hash/578e65cdee35d00c708d4c64bce32971-Abstract-Conference.html — arXiv:2308.10848 (https://arxiv.org/abs/2308.10848). *(Weize Chen +12.)*
- **Loại:** bình duyệt. **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** khung mô phỏng nhóm người, thêm/đổi thành viên động theo tiến độ; nhóm đa agent vượt đơn agent ở hiểu văn bản, suy luận, mã, dùng công cụ, embodied; mô tả hành vi "nổi lên" (có lợi và có rủi ro).
- **Giống:** thành phần nhóm thay đổi theo nhiệm vụ (chọn agent tham gia theo dự án). **Khác:** AgentVerse tập trung hành vi tập thể; CCoding đo chi phí/cache và giới hạn số sub-agent.

### 2.5 CAMEL
- **APA 7:** Li, G., et al. (2023). CAMEL: Communicative agents for "mind" exploration of large language model society. *Advances in Neural Information Processing Systems 36 (NeurIPS 2023)*. https://proceedings.neurips.cc/paper/2023/hash/a3621ee907def47c1b952ade25c67698-Abstract-Conference.html — arXiv:2303.17760. *(Li, Hammoud, Itani, Khizbullin, Ghanem.)*
- **Loại:** bình duyệt. **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** "role-playing" + inception prompting để hai agent tự hợp tác với ít can thiệp người; bộ dữ liệu hội thoại AI Society và Code; ghi nhận lỗi role flipping và vòng lặp vô hạn, xử lý bằng điều kiện dừng.
- **Giống:** nhận diện lỗi vòng lặp/đổi vai (CCoding có khóa theo agent, giới hạn lượt, hủy). **Khác:** CAMEL nghiên cứu hợp tác tự trị; CCoding đặt người chủ dự án ở vị trí giám sát và giới hạn quyền.

### 2.6 SWE-agent
- **APA 7:** Yang, J., Jimenez, C. E., Wettig, A., Lieret, K., Yao, S., Narasimhan, K., & Press, O. (2024). SWE-agent: Agent-computer interfaces enable automated software engineering. *Advances in Neural Information Processing Systems 37 (NeurIPS 2024)*. https://papers.neurips.cc/paper_files/paper/2024/hash/5a7c947568c1b1328ccc5230172e1e7c-Abstract-Conference.html — arXiv:2405.15793.
- **Loại:** bình duyệt. **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** giao diện agent–máy tính (ACI) thiết kế riêng cho LM giúp tạo/sửa tệp, duyệt repo, chạy test tốt hơn; đánh giá trên SWE-bench và HumanEvalFix.
- **Giống:** coi **thiết kế công cụ** là biến quan trọng (CCoding: bộ công cụ theo năng lực, hook PreToolUse). **Khác:** SWE-agent là một agent đơn; không có điều phối nhiều người, review độc lập.

### 2.7 OpenHands
- **APA 7:** Wang, X., et al. (2025). OpenHands: An open platform for AI software developers as generalist agents. *ICLR 2025*. https://proceedings.iclr.cc/paper_files/paper/2025/hash/a4b6ad6b48850c0c331d1259fc66a69c-Abstract-Conference.html — arXiv:2407.16741 (https://arxiv.org/abs/2407.16741). *(Xingyao Wang, Graham Neubig +22 khác; 24 tác giả.)*
- **Loại:** bình duyệt. **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** nền tảng mở: tạo agent, chạy mã trong sandbox, điều phối nhiều agent, gắn benchmark; đánh giá trên 15 tác vụ (SWE-Bench, WebArena…).
- **Giống:** sandbox/workspace cô lập, tích hợp benchmark. **Khác:** OpenHands giải bài toán nền tảng agent tổng quát; CCoding bổ sung quản trị văn phòng (phòng ban, KPI, chính sách dữ liệu, nhật ký chuỗi băm).

### 2.8 Agentless
- **APA 7:** Xia, C. S., Deng, Y., Dunn, S., & Zhang, L. (2025). Demystifying LLM-based software engineering agents. *Proceedings of the ACM on Software Engineering (FSE 2025)*. arXiv:2407.01489. https://arxiv.org/abs/2407.01489v2 — trang hội nghị: https://conf.researchr.org/details/fse-2025/fse-2025-research-papers/85/Demystifying-LLM-based-Software-Engineering-Agents *(tên công cụ "Agentless"; tên bài ở bản FSE có thể khác bản arXiv — cần đối chiếu; chưa thấy DOI trong kết quả).*
- **Loại:** bình duyệt (FSE 2025) / bản đọc là trang arXiv. **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** quy trình cố định định vị → sửa, không để LLM quyết định hành động kế tiếp; v1 tự báo cáo 27,33% với chi phí 0,34 USD trên SWE-bench Lite; bản sau tóm lược cho 32,00% và 0,70 USD (**hai bản khác nhau, chưa xác minh bản nào là cuối**). Lập SWE-bench Lite-S loại các bài có vấn đề.
- **Giống:** quy trình cố định có pha (route→plan→…) và **làn nhanh** cho việc nhỏ cũng là quy trình ít tự do hơn. **Khác:** Agentless bỏ hẳn agent; CCoding giữ agent nhưng khóa hình dạng kế hoạch (`shapeFastPlan`). Đây là lập luận ủng hộ "đơn giản + chi phí" — gần với "AI Agents That Matter".

### 2.9 MapCoder
- **APA 7:** Islam, M. A., Ali, M. E., & Parvez, M. R. (2024). MapCoder: Multi-agent code generation for competitive problem solving. In *Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)* (pp. 4912–4944). Association for Computational Linguistics. https://doi.org/10.18653/v1/2024.acl-long.269 *(DOI từ bản ghi HBKU trong kết quả tìm kiếm; PDF: https://aclanthology.org/2024.acl-long.269.pdf)*
- **Loại:** bình duyệt. **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** 4 agent (truy hồi ví dụ, lập kế hoạch, viết mã, gỡ lỗi) mô phỏng chu trình lập trình; tự báo cáo pass@1: HumanEval 93,9%, MBPP 83,1%, APPS 22,0%, CodeContests 28,5%, xCodeEval 45,3%.
- **Giống:** pha plan→code→debug. **Khác:** bài toán thi đấu hàm đơn, không có repo/worktree; không báo cáo chi phí token ở mức tóm tắt đã đọc.

### 2.10 AgentCoder
- **APA 7:** Huang, D., et al. (2024). *AgentCoder: Multi-agent-based code generation with iterative testing and optimisation* (arXiv:2312.13010). https://arxiv.org/abs/2312.13010 *(Dong Huang +; số tác giả chưa rõ.)*
- **Loại:** preprint (chưa thấy venue). **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** 3 agent: lập trình, **thiết kế test độc lập với mã**, thực thi test và phản hồi lỗi; tự báo cáo 77,4% và 89,1% pass@1 trên HumanEval-ET/MBPP-ET so với 69,5%/63,0% của baseline mạnh nhất. Số mô hình/phương pháp so sánh khác giữa v1 (9/12) và v2 (12/13).
- **Giống (quan trọng):** **tách người viết test khỏi người viết mã** — tương đồng reviewer độc lập và "hạng mục kiểm thử riêng của người review" trong CCoding. **Khác:** AgentCoder đo trên benchmark hàm; CCoding đo trên bài nhiều tệp với 461 test ẩn và có phần chi phí.

### 2.11 Magentic-One
- **APA 7:** Fourney, A., et al. (2024). *Magentic-One: A generalist multi-agent system for solving complex tasks* (arXiv:2411.04468). https://arxiv.org/abs/2411.04468v1 *(Adam Fourney +18.)*
- **Loại:** preprint / báo cáo kỹ thuật. **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** Orchestrator chính lập kế hoạch, theo dõi tiến độ, **lập lại kế hoạch khi lỗi**, giao cho 4 agent chuyên (Coder, Computer Terminal, File Surfer, Web Surfer); 38% GAIA, 32,8% WebArena, 27,7% AssistantBench; thêm/bớt agent không đổi quy trình; công bố AutoGenBench.
- **Giống:** orchestrator + agent chuyên, tái lập kế hoạch. **Khác:** hướng tác vụ web/tệp tổng quát; CCoding hướng dự án mã với worktree song song và gộp/giải xung đột.

### 2.12 MAST — Why Do Multi-Agent LLM Systems Fail?
- **APA 7:** Cemri, M., Pan, M. Z., Yang, S., Agrawal, L. A., Chopra, B., Tiwari, R., Keutzer, K., Parameswaran, A., Klein, D., Ramchandran, K., Zaharia, M., Gonzalez, J. E., & Stoica, I. (2025). *Why do multi-agent LLM systems fail?* (arXiv:2503.13657v3). https://arxiv.org/abs/2503.13657v3
- **Loại:** preprint (trang arXiv không ghi venue). **Mức đọc:** [ĐỌC TRANG — tóm tắt arXiv]; chưa đọc toàn văn.
- **Đóng góp:** MAST — 14 kiểu lỗi, 3 nhóm (thiết kế/đặc tả hệ thống, lệch phối hợp giữa agent, kiểm chứng/kết thúc tác vụ), xây từ phân tích 150 vết và xác nhận với người chú thích (κ = 0,88); MAST-Data > 1.600 vết từ 7 khung; quy trình LLM-as-a-Judge. Kết luận: lỗi chủ yếu do thiết kế và lệch phối hợp, không chỉ do mô hình. *Danh sách 14 kiểu lỗi chưa đọc được từ trang — S3 phải mở toàn văn trước khi dán nhãn từng lỗi.* Số khung/vết khác nhau giữa các phiên bản (v1–v3).
- **Giống:** khung phân loại thách thức của CCoding (FM-1/2/3 + INF) bám MAST. **Khác:** MAST phân tích vết của hệ khác; CCoding là một hệ được vận hành thật, có nhật ký lỗi và vòng sửa.

### 2.13 AI Agents That Matter
- **APA 7:** Kapoor, S., Stroebl, B., Siegel, Z. S., Nadgir, N., & Narayanan, A. (2024). *AI agents that matter* (arXiv:2407.01502). https://arxiv.org/abs/2407.01502v1 *(Kết quả tìm kiếm thứ cấp nói bài được đăng ở Transactions on Machine Learning Research 2025: https://mlanthology.org/tmlr/2025/kapoor2025tmlr-ai/ — chưa xác minh bản TMLR; trích bản arXiv v1.)*
- **Loại:** preprint (có thể đã bình duyệt TMLR — chưa xác minh). **Mức đọc:** [ĐỌC TRANG — tóm tắt arXiv].
- **Đóng góp:** 4 vấn đề của đánh giá agent: (1) chỉ chú ý độ chính xác, bỏ qua chi phí → đề xuất **tối ưu chung chi phí–độ chính xác**; (2) lẫn nhu cầu của nhà phát triển mô hình và người dùng; (3) holdout yếu → overfit; (4) thiếu chuẩn hóa → khó tái lập.
- **Giống:** benchtest của CCoding báo cáo token, cache, thời gian cùng với độ đúng (461 test ẩn = holdout). **Khác:** bài đánh giá lý luận; CCoding cung cấp số đo cache vào/ra theo từng lượt gọi.

### 2.14 Anthropic — hệ nghiên cứu multi-agent
- **APA 7:** Hadfield, J., Zhang, B., Lien, K., Scholz, F., Fox, J., & Ford, D. (2025, June 13). *How we built our multi-agent research system*. Anthropic Engineering. https://www.anthropic.com/engineering/built-multi-agent-research-system
- **Loại:** blog / báo cáo kỹ thuật của nhà cung cấp (không bình duyệt, số liệu nội bộ). **Mức đọc:** [ĐỌC TRANG] (qua `WebFetch`, nội dung do công cụ tóm lược).
- **Đóng góp:** orchestrator–worker (Opus 4 dẫn, Sonnet 4 làm sub-agent); đa agent hơn đơn agent Opus 4 **90,2%** trên đánh giá nghiên cứu **nội bộ**, mạnh nhất ở truy vấn theo chiều rộng; agent dùng ≈4× token của chat, đa agent ≈15×; trên BrowseComp, lượng token giải thích ≈80% phương sai hiệu năng; quy tắc theo mức nỗ lực trong prompt (1 agent/3–10 lệnh gọi; 2–4 sub-agent; >10 sub-agent); gọi song song 3–5 sub-agent cắt thời gian tới 90%; checkpoint/retry; LLM-judge theo rubric (≈20 truy vấn thật khởi đầu). **Giới hạn nêu rõ:** miền cần chung ngữ cảnh/nhiều phụ thuộc, và "hầu hết tác vụ lập trình có ít phần song song hơn nghiên cứu", không hợp.
- **Giống:** giới hạn số sub-agent theo độ khó (làn nhanh/làn đầy, `maxParallel`), chọn mô hình theo vai (O6), checkpoint. **Khác:** miền nghiên cứu web, không có worktree/gộp mã; không công bố cache.

### 2.15 Cognition — Don't Build Multi-Agents
- **APA 7:** Yan, W. (2025, June 12). *Don't build multi-agents*. Cognition. https://cognition.com/blog/dont-build-multi-agents *(URL cũ cognition.ai chuyển hướng 301 sang URL này.)*
- **Loại:** blog / ý kiến kỹ sư. **Mức đọc:** [ĐỌC TRANG] (qua `WebFetch`, tóm lược bằng công cụ).
- **Đóng góp:** hai nguyên tắc — (1) chia sẻ ngữ cảnh đầy đủ (cả vết agent, không chỉ tin nhắn); (2) "hành động mang quyết định ngầm, và các quyết định xung đột cho kết quả xấu" (*"Actions carry implicit decisions, and conflicting decisions carry bad results."*). Ví dụ Flappy Bird: hai sub-agent làm hai phần không khớp phong cách. Khuyến nghị: agent tuyến tính một luồng + mô hình nén ngữ cảnh; sub-agent kiểu Claude Code chủ yếu trả lời câu hỏi rõ ràng, không viết mã song song.
- **Mâu thuẫn với 2.14:** Cognition chống song song ghi; Anthropic ủng hộ song song cho truy vấn rộng nhưng thừa nhận mã ít song song. **CCoding nằm giữa:** worktree con song song cho hạng mục độc lập + tự gộp/giải xung đột + review độc lập — đây chính là phép thử thực nghiệm của lập luận "quyết định xung đột". *Ghi chú:* kết quả tìm kiếm thứ cấp cho biết tác giả có bài tiếp theo (2026-04-22) nới quan điểm — **chưa mở, `[CHƯA KIỂM CHỨNG]`, chuyển S5.**

## 3. Bảng so sánh theo tiêu chí

Ký hiệu: ✔ = nguồn (phần đã đọc) nêu rõ; ✘ = nguồn nêu rõ là không có/không phù hợp; **—** = *không thấy trong phần đã đọc* (không có nghĩa là hệ thống không có; chưa xác minh toàn văn). Cột CCoding theo `docs/ARCHITECTURE.md` và `docs/research/BRIEF.md`.

| Hệ thống | Vai trò/phòng ban | Pha | Worktree song song + tự gộp | Review độc lập | Quyền công cụ/hook | Ngân sách token | Đa runtime | Chính sách dữ liệu | Đánh giá có chi phí/cache |
|---|---|---|---|---|---|---|---|---|---|
| MetaGPT | ✔ (vai theo SOP) | ✔ (dây chuyền) | — | — | — | — | — | — | — |
| ChatDev | ✔ | ✔ (chat chain: thiết kế–mã–test) | — | — | — | — | — | — | — |
| AutoGen | ✔ (agent tùy biến) | — (tùy mẫu hội thoại) | — | — | — | — | ✔ (trộn LLM/người/công cụ) | — | — |
| AgentVerse | ✔ (nhóm động) | ✔ | — | — | — | — | — | — | — |
| CAMEL | ✔ (cặp vai) | — | — | — | — | — | — | — | — |
| SWE-agent | ✘ (agent đơn) | — | — | — | ✔ (thiết kế ACI) | — | — | — | — |
| OpenHands | ✔ (đa agent là một tính năng) | — | — | — | ✔ (sandbox) | — | ✔ (nhiều LLM, theo mô tả nền tảng) | — | — |
| Agentless | ✘ | ✔ (định vị→sửa cố định) | — | — | — | — | — | — | ✔ (báo cáo chi phí USD, mức tóm tắt) |
| MapCoder | ✔ (4 agent) | ✔ | — | — | — | — | — | — | — |
| AgentCoder | ✔ (3 agent) | ✔ | — | ✔ (test độc lập với mã) | — | — | — | — | — |
| Magentic-One | ✔ (orchestrator + 4) | ✔ (lập/ghi/tái lập kế hoạch) | — | — | — | — | — | — | — |
| MAST (phân tích) | — (đối tượng phân tích) | — | — | — | — | — | — | — | — |
| AI Agents That Matter (đánh giá) | — | — | — | — | — | — | — | — | ✔ (chi phí là chuẩn đánh giá; không đo cache) |
| Anthropic 2025 | ✔ (lead + sub-agent) | ✔ | ✘ (không phù hợp mã; không gộp mã) | ✔ (CitationAgent, LLM-judge) | — | ✔ (đo/lập luận theo token; quy tắc nỗ lực) | — (Opus/Sonnet cùng họ) | — | ✔ (token; không công bố cache) |
| Cognition 2025 | ✘ (khuyên tuyến tính) | — | ✘ (khuyên không ghi song song) | — | — | — | — | — | — |
| **CCoding** | ✔ nhiều phòng, vai/KPI | ✔ route→plan→discuss→finalize→execute→review→revise→synthesize | ✔ | ✔ + vòng sửa | ✔ hook PreToolUse (`claude-guard`) | ✔ theo dự án | ✔ 6 runtime | ✔ nhãn dữ liệu + log che PII/băm | ✔ (`bench/vs-claude`: token vào/ra/cache, thời gian) |

**Cách đọc bảng (suy luận của S1, không phải phát hiện có trích dẫn):**
1. Trong phần đã đọc, **không công trình nào trong nhóm A** đồng thời nêu worktree song song + tự gộp, hook quyền công cụ, chính sách dữ liệu và số đo cache. Nhưng nhiều ô "—" chỉ phản ánh giới hạn mức đọc (tóm tắt). Muốn tuyên bố "chưa ai làm" phải đọc toàn văn (hoặc ít nhất mục thiết kế/đánh giá) cho từng bài — hiện chưa làm.
2. Điểm có bằng chứng mạnh nhất để đặt CCoding: (a) giữa hai quan điểm đối lập Anthropic/Cognition về mã song song — dữ liệu thực nghiệm từ benchtest; (b) đo chi phí cùng cache, vì hai nguồn gần nhất (Anthropic, AAtM) dừng ở mức token/USD.
3. Cơ chế tách người test khỏi người viết mã đã có ở AgentCoder → **không được nhận là mới**.
4. Quy trình cố định/đơn giản đã có ở Agentless → "làn nhanh" không được nhận là mới ở mức ý tưởng; chỉ phần cài đặt và đo mới có thể là đóng góp.

## 4. Khoảng trống của nhóm A (chuyển cho S5/S6)

- Đọc toàn văn: MAST (danh sách 14 lỗi, tên 7 khung), Agentless (phiên bản số liệu cuối), SWE-agent/OpenHands (cơ chế sandbox, phân quyền).
- Điền đủ tác giả APA 7 cho 9 mục ghi "et al."; lấy DOI cho các bài hội nghị (OpenReview/ACM) nếu có.
- Bài Cognition 2026 và bình luận phản biện (LangChain…) — `[CHƯA KIỂM CHỨNG]`, chưa mở.
- Cần tìm bằng `search_papers` (OpenAlex) khi có công cụ: số trích dẫn, bài trích dẫn xuôi/ngược tới MAST và "Don't Build Multi-Agents", các công bố 2025–2026 về cache/token cho coding agent.

## Nhóm B

<!-- S5 điền -->

## Kết luận điểm mới

<!-- S5 điền -->
