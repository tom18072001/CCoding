# Tổng quan tài liệu — Nhóm A (khung multi-agent, coding agent, đánh giá, tranh luận multi vs single)

> Hạng mục S1 · Phòng Nghiên cứu · lập ngày 2026-11-02 · chuẩn trích dẫn APA 7, dạng (Tác giả, năm) · dữ liệu: nội bộ.
> Nhóm B (tự cải thiện, tối ưu giao tiếp/token, an toàn/quyền, công bố 2025–2026) và kết luận điểm mới do S5 bổ sung ở cuối tệp.

## 0. Giới hạn cần đọc trước

- **Công cụ thực tế:** phiên này chỉ có `WebSearch` và `WebFetch`; **không có `search_papers` (OpenAlex)** nên không có số trích dẫn hay DOI từ OpenAlex. DOI/URL bên dưới chép nguyên văn từ kết quả công cụ.
- **Cập nhật 3/11/2026 (S2, gói 2 vòng 4):** MAST (§2.12) đã đọc HTML v3 phần đầu (100.000/160.349 ký tự; phụ lục chưa đọc) và Anthropic (§2.14) đọc lại; xem F5–F10. Dòng dưới là số liệu **vòng 1**.
- **Mức đọc trung thực (vòng 1):** chỉ **4/15** nguồn được mở trang và đọc nội dung qua `WebFetch` (Anthropic, Cognition: trang bài đầy đủ; MAST, AI Agents That Matter: trang tóm tắt arXiv). **11/15** nguồn chỉ thấy **bản tóm lược trong kết quả `WebSearch`** (mô tả tóm tắt, số liệu, nơi đăng) — gắn nhãn `[CHỈ ĐỌC TÓM TẮT]`, **chỉ dùng cho khẳng định ở mức tóm tắt**. Không nguồn nào đọc toàn văn PDF.
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
| F1 | WebFetch | trang Anthropic, vòng 1 mở bằng một URL dạng `…/built-…` (URL cũ, không còn dùng; xem CHANGELOG); vòng 2 đọc lại bằng URL chuẩn, xem F9 | — | 2026-11-02 | đọc |
| F2 | WebFetch | https://cognition.ai/blog/dont-build-multi-agents → chuyển hướng 301 sang https://cognition.com/blog/dont-build-multi-agents (URL chuyển hướng do máy chủ trả, đã mở lại) | — | 2026-11-02 | đọc |
| F3 | WebFetch | https://arxiv.org/abs/2503.13657v3 | — | 2026-11-02 | đọc |
| F4 | WebFetch | https://arxiv.org/abs/2407.01502v1 | — | 2026-11-02 | đọc |
| Q16 | WebSearch (standard) | "Why Do Multi-Agent LLM Systems Fail" NeurIPS 2025 Datasets and Benchmarks Track Cemri | không | 2026-11-03 | 2 (ML Anthology; slide neurips.cc chỉ thấy, chưa mở) |
| F5 | WebFetch | https://arxiv.org/abs/2503.13657 (Comments, Journal ref, ngày v1–v3) | — | 2026-11-03 | đọc: không ghi venue |
| F6 | WebFetch | https://openreview.net/forum?id=fAjbYBmonr | — | 2026-11-03 | **bị chặn** (màn hình xác minh trình duyệt) |
| F7 | WebFetch | https://mlanthology.org/neurips/2025/cemri2025neurips-multiagent | — | 2026-11-03 | đọc: NeurIPS 2025, 13 tác giả, không volume/track |
| F8 | WebFetch ×2 | https://arxiv.org/html/2503.13657v3 (mới 100.000/160.349 ký tự đầu) | — | 2026-11-03 | đọc một phần |
| F9 | WebFetch | https://www.anthropic.com/engineering/multi-agent-research-system | — | 2026-11-03 | đọc |
| F10 | WebFetch | cùng slug dưới tiền tố `research` (kiểm tiêu đề, tác giả, canonical) | — | 2026-11-03 | mở được; canonical không xác định |

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
- **APA 7:** Cemri, M., Pan, M. Z., Yang, S., Agrawal, L. A., Chopra, B., Tiwari, R., Keutzer, K., Parameswaran, A., Klein, D., Ramchandran, K., Zaharia, M., Gonzalez, J. E., & Stoica, I. (2025). Why do multi-agent LLM systems fail? *Advances in Neural Information Processing Systems (NeurIPS 2025)*. arXiv:2503.13657. https://arxiv.org/abs/2503.13657v3 — OpenReview: https://openreview.net/forum?id=fAjbYBmonr **[V-thứ cấp]**
- **Loại và nơi xuất bản:** trang arXiv ghi "Comments: ArXiv v3", không có "Journal reference" và không nhắc NeurIPS (F5). NeurIPS 2025 chỉ có từ **nguồn thứ cấp**: danh mục ML Anthology ghi "Advances in Neural Information Processing Systems", 2025, 13 tác giả, và liên kết tới OpenReview (F7); slide `neurips.cc/media/neurips-2025/…` xuất hiện trong kết quả tìm kiếm (Q16, **chưa mở**). Trang OpenReview bị chặn bằng màn hình xác minh trình duyệt nên **không đọc được** track/volume/trạng thái (F6). Vì vậy ghi "NeurIPS 2025", **không ghi số volume và track** `[CHƯA KIỂM CHỨNG]`. Một bản tóm lược tìm kiếm nói đây là bài Datasets and Benchmarks Track: chưa có nguồn chính xác nhận, không dùng.
- **Mức đọc:** [ĐỌC TOÀN VĂN HTML v3, mới 100.000/160.349 ký tự đầu] (F8). Đã đọc Mục 1–5, Hình 1, Bảng 1–2. **Chưa đọc** phần cuối trang (Phụ lục sau ký tự 100.000), gồm Phụ lục A (định nghĩa chi tiết 14 kiểu lỗi) và Phụ lục H; mọi số dẫn Phụ lục dưới đây là theo lời chỉ dẫn của trang ở thân bài, `[CHƯA KIỂM CHỨNG]` về nội dung phụ lục.
- **Đóng góp (mỗi số kèm định vị nguồn):**
  - Taxonomy **14 kiểu lỗi** (FM-1.1…FM-3.3) chia **3 nhóm**: FC1 *System Design Issues* (5 kiểu), FC2 *Inter-Agent Misalignment* (6), FC3 *Task Verification* (3): Mục 4, Hình 1; abstract nêu "14 failure modes", "3 nhóm". Tên và định nghĩa từng kiểu: `analysis/mast-codebook.md` §3. Trang không nêu tỉ lệ cấp nhóm; từng kiểu có tỉ lệ riêng ở Mục 4 (ví dụ FM-1.3 15,7 %, FM-2.6 13,2 %, FM-1.5 12,4 %).
  - **MAST-Data:** 1.642 vết chú thích từ **7 hệ** (MetaGPT, ChatDev, HyperAgent, AppWorld, AG2, Magentic-One, OpenManus): Bảng 1 và Mục 3; abstract ghi "1600+".
  - **Quy mô phân tích lý thuyết nền (grounded theory):** 150 vết, 6 chuyên gia (Mục 3.1, "Data Collection with Grounded Theory Analysis"; vị trí câu chứa số 150 và 6 theo bản tóm lược của công cụ, chưa đối chiếu từng câu).
  - **Đồng thuận người–người:** Cohen's κ trung bình = **0,88 "in the final rounds"**, giữa **3** người chú thích: Mục 3.2 ("Standardizing Failure Labels via Inter-Annotator Agreement"). Đây là κ ở các vòng cuối, không phải κ toàn quá trình.
  - **LLM-as-a-Judge** (Mục 3.3; **Bảng 2** "Performance of LLM-as-a-judge pipeline"; cột Accuracy, Recall, Precision, F1, Cohen's κ). Hàng *o1*: 0,89 · 0,62 · 0,68 · 0,64 · 0,58. Hàng *o1 (few shot)*: **0,94 · 0,77 · 0,833 · 0,80 · 0,77**. Số o1 few-shot **khớp** số trong đề bài. Bảng chỉ có hai hàng này trong phần đã đọc (không có hàng GPT-4o hay Claude, và hàng "o1" không nhãn zero-shot): không dùng lời "o1 zero-shot".
  - **Can thiệp trên ChatDev:** **+9,4 %** (Mục 1 và Mục 4/FC1; Phụ lục H) và **+15,6 %** (Mục 4/FC3, benchmark ProgramDev; Mục 5.3 gọi là mức cải thiện tối đa; Phụ lục H.2, Bảng 5 theo chỉ dẫn của trang, `[CHƯA KIỂM CHỨNG]`). **Lệch cần ghi:** Mục 1 gán +9,4 % cho việc đổi quy trình (CEO quyết định cuối), còn Mục 4 gán cho cải thiện đặc tả vai trò; hai mục không đồng nhất về nguyên nhân. Điều kiện nền: cùng prompt người dùng, cùng LLM (GPT-4o) theo Mục 4 (đọc qua bản tóm lược công cụ). Hai mức này là cải thiện thực nghiệm của một can thiệp trên một hệ, không phải hiệu ứng chung của MAS.
  - Kết luận: lỗi chủ yếu do thiết kế và lệch phối hợp, không chỉ do năng lực mô hình (abstract, Mục 4–5).
- **Phiên bản:** v1 17/3/2025, v2 22/4/2025, v3 26/10/2025 (F5). Số khung, vết, κ khác nhau giữa các bản: một bản tóm lược tìm kiếm ghi "κ = 0,77" ở slide NeurIPS, trùng với κ **LLM–người** của Bảng 2 chứ không mâu thuẫn κ người–người 0,88. Chỉ dẫn số theo **v3**.
- **Mẫu cho CCoding:** MAST kiểm bộ chú thích LLM bằng đúng 5 chỉ số (Accuracy, Recall, Precision, F1, κ) so với nhãn người (Bảng 2); κ người–người 0,88 là mức tham chiếu. CCoding dùng cách đo này cho bộ chấm và cổng chất lượng (`analysis/agreement.mjs`).
- **Giống:** khung phân loại thách thức của CCoding (FM-1/2/3 + INF + NA) bám MAST. **Khác:** MAST phân tích vết của hệ khác; CCoding là một hệ được vận hành thật, có nhật ký lỗi và vòng sửa; INF và NA **không thuộc** 14 kiểu của MAST.

### 2.13 AI Agents That Matter
- **APA 7:** Kapoor, S., Stroebl, B., Siegel, Z. S., Nadgir, N., & Narayanan, A. (2024). *AI agents that matter* (arXiv:2407.01502). https://arxiv.org/abs/2407.01502v1 *(Kết quả tìm kiếm thứ cấp nói bài được đăng ở Transactions on Machine Learning Research 2025: https://mlanthology.org/tmlr/2025/kapoor2025tmlr-ai/ — chưa xác minh bản TMLR; trích bản arXiv v1.)*
- **Loại:** preprint (có thể đã bình duyệt TMLR — chưa xác minh). **Mức đọc:** [ĐỌC TRANG — tóm tắt arXiv].
- **Đóng góp:** 4 vấn đề của đánh giá agent: (1) chỉ chú ý độ chính xác, bỏ qua chi phí → đề xuất **tối ưu chung chi phí–độ chính xác**; (2) lẫn nhu cầu của nhà phát triển mô hình và người dùng; (3) holdout yếu → overfit; (4) thiếu chuẩn hóa → khó tái lập.
- **Giống:** benchtest của CCoding báo cáo token, cache, thời gian cùng với độ đúng (461 test ẩn = holdout). **Khác:** bài đánh giá lý luận; CCoding cung cấp số đo cache vào/ra theo từng lượt gọi.

### 2.14 Anthropic — hệ nghiên cứu multi-agent
- **APA 7:** Hadfield, J., Zhang, B., Lien, K., Scholz, F., Fox, J., & Ford, D. (2025, June 13). *How we built our multi-agent research system*. Anthropic. https://www.anthropic.com/engineering/multi-agent-research-system *(URL chuẩn duy nhất của dự án, chọn vì là bản đã đọc nội dung ở F9: trang ghi nhóm "Engineering", "Published Jun 13, 2025", 6 tác giả khớp. Cùng slug dưới tiền tố `research` (BRIEF-2 từng dùng) cũng mở được ở F10. Công cụ không trả thẻ canonical hay chuỗi chuyển hướng, nên "chuẩn" là quy ước của dự án, không phải kiểm chứng.)*
- **Loại:** blog / báo cáo kỹ thuật của nhà cung cấp (không bình duyệt, số liệu nội bộ). **Mức đọc:** [ĐỌC TRANG] qua `WebFetch` (F9, F10); nội dung do công cụ tóm lược, các câu trích dưới đây là trích ngắn do công cụ trả, chưa đối chiếu bản gốc từng chữ.
- **Số liệu đã kiểm lại ở vòng này (cùng mục "Benefits of a multi-agent system"):**
  - ≈**4×** token: "agents typically use about 4× more tokens than chat interactions"; ≈**15×**: "multi-agent systems use about 15× more tokens than chats". Hai số **khớp** đề bài. Đây là so với **chat**, không phải so với một agent đơn.
  - Token giải thích **80 % phương sai** (BrowseComp): "token usage by itself explains 80% of the variance". Khớp. Đo trên BrowseComp, một đánh giá duyệt web.
  - **+90,2 %:** "outperformed single-agent Claude Opus 4 by 90.2% on our internal research eval". Khớp. Đánh giá **nội bộ** của Anthropic, so với *một agent Opus 4*.
  - Mã: "most coding tasks involve fewer truly parallelizable tasks than research". Khớp.
- **Đóng góp khác (từ vòng 1, chưa kiểm lại ở vòng này, vị trí mục chưa ghi):** orchestrator–worker (Opus 4 dẫn, Sonnet 4 làm sub-agent); mạnh nhất ở truy vấn theo chiều rộng; quy tắc theo mức nỗ lực trong prompt (1 agent/3–10 lệnh gọi; 2–4 sub-agent; >10 sub-agent); gọi song song 3–5 sub-agent cắt thời gian tới 90 %; checkpoint/retry; LLM-judge theo rubric (≈20 truy vấn thật khởi đầu). `[CHƯA KIỂM LẠI]`. **Giới hạn nêu rõ:** miền cần chung ngữ cảnh/nhiều phụ thuộc không hợp.
- **Giống:** giới hạn số sub-agent theo độ khó (làn nhanh/làn đầy, `maxParallel`), chọn mô hình theo vai (O6), checkpoint. **Khác:** miền nghiên cứu web, không có worktree/gộp mã; không công bố cache.
- **Liên hệ hướng với kết quả của CCoding (chỉ so hướng, không so độ lớn).** Ở bài tổng hợp lớn của Anthropic, nhiều agent đắt ≈15× chat và đáng giá khi việc đủ rộng, song song được; với mã, chính bài này nói ít việc song song hơn. Kết quả vòng 3 của ta cùng chiều: **B0/A0-sonnet ×5,68 token** [5,05; 6,58] (W1, 9 bài, `results-round3.md` bảng W1) và **làn đơn B7 ×2,50 token** [2,02; 3,18] so với A0-sonnet trên t1–t5 (`results-round3.md`, B-01), trong khi chất lượng ngang nhau vì mọi bài chạm trần. Căn cứ tài liệu cho quyết định **"việc nhỏ dùng agent đơn, việc lớn mới dùng multi-agent"**: chi phí multi-agent là có thật và lớn, lợi ích nằm ở việc rộng/song song. **Giới hạn:** (i) khác loại bài: Anthropic đo bài nghiên cứu web, ta đo bài mã, phân tích và tổng hợp văn bản nhỏ; (ii) khác cách đo: Anthropic so với *chat* (4×/15×) và so một agent Opus 4 về chất lượng, còn ta so tỉ số token có trọng số giữa hai cấu hình CCoding trên cùng bài, có cache; (iii) Anthropic không công bố cache và tập đánh giá nội bộ; (iv) ×5,68 và ×2,50 là hai phép so khác nhau (B0 so A0-sonnet, B7 so A0-sonnet), không cộng hay đối chiếu số học với 4×/15×; (v) bài ta chạm trần chất lượng nên không bác bỏ được lợi ích ở việc khó hơn. Đây là lập luận hướng, **không** là bằng chứng nhân quả.

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
| Self-Refine | ✘ (một mô hình tự phê bình) | ✔ (nháp→phê bình→sửa) | — | ✘ (tự đánh giá, không độc lập) | — | — | — | — | — |
| Reflexion | ✘ (agent đơn) | ✔ (thử→phản tư→thử lại) | — | — | — | — | — | — | — |
| DSPy | — (khung lập trình pipeline) | — | — | — | — | — | — | — | — |
| OPRO | — | — | — | — | — | — | — | — | — (chi phí API chỉ được cảnh báo) |
| TextGrad | — | — | — | — | — | — | — | — | — |
| ADAS | ✔ (agent thiết kế agent) | — | — | — | — | — | — | — | — |
| AFlow | — (workflow là đồ thị nút LLM) | ✔ (workflow tìm bằng MCTS) | — | — | — | — | — | — | ✔ (chi phí suy luận so với GPT-4o; không cache) |
| EvoMAC | ✔ | ✔ | — | ✔ (phản hồi từ kiểm tra theo yêu cầu) | — | — | — | — | — |
| Experiential Co-Learning | ✔ (instructor/assistant) | ✔ | — | — | — | — | — | — | — |
| AgentPrune | ✔ (đồ thị agent) | — | — | — | — | ✔ (cắt thông điệp, đo token/USD) | — | — | ✔ (token/USD; không cache) |
| Optima | ✔ | — | — | — | — | ✔ (phần thưởng gồm hiệu quả token) | — | — | ✔ (token; không cache) |
| CAID (Geng & Neubig, 2026) | ✔ (manager + engineer) | ✔ (đồ thị phụ thuộc→giao→gộp) | ✔ (git worktree + merge) | ✔ (manager duyệt; kiểm chứng bằng test) | — | — | — (mô hình khác nhau, cùng khung; không phải đa nhà cung cấp trong một lần chạy) | — | ✔ (điểm, runtime, chi phí; không thấy cache trong phần đọc) |
| TeamBench (Kim et al., 2026) | ✔ (Planner/Executor/Verifier) | ✔ | — | ✔ (Verifier, chứng nhận cuối) | ✔ (tách quyền bằng OS) | — | — | — | — |
| ToolEmu | ✘ (đánh giá rủi ro) | — | — | — | — (đo rủi ro, không phải cơ chế quyền) | — | — | — | — |
| AgentDojo | ✘ (đánh giá) | — | — | — | — (đo tấn công/phòng thủ) | — | — | — | — |
| Don't Break the Cache (Lumer et al., 2026) | ✘ | — | — | — | — | — | ✔ (3 nhà cung cấp) | — | ✔ (cache, chi phí, TTFT; tác vụ nghiên cứu web, không phải mã) |
| **CCoding** | ✔ nhiều phòng, vai/KPI | ✔ route→plan→discuss→finalize→execute→review→revise→synthesize | ✔ | ✔ + vòng sửa | ✔ hook PreToolUse (`claude-guard`) | ✔ theo dự án | ✔ 6 runtime | ✔ nhãn dữ liệu + log che PII/băm | ✔ (`bench/vs-claude`: token vào/ra/cache, thời gian) |

**Cách đọc bảng (suy luận của S1, không phải phát hiện có trích dẫn):**
1. Trong phần đã đọc, **không công trình nào trong nhóm A** đồng thời nêu worktree song song + tự gộp, hook quyền công cụ, chính sách dữ liệu và số đo cache. Nhưng nhiều ô "—" chỉ phản ánh giới hạn mức đọc (tóm tắt). Muốn tuyên bố "chưa ai làm" phải đọc toàn văn (hoặc ít nhất mục thiết kế/đánh giá) cho từng bài — hiện chưa làm.
2. Điểm có bằng chứng mạnh nhất để đặt CCoding: (a) giữa hai quan điểm đối lập Anthropic/Cognition về mã song song — dữ liệu thực nghiệm từ benchtest; (b) đo chi phí cùng cache, vì hai nguồn gần nhất (Anthropic, AAtM) dừng ở mức token/USD.
3. Cơ chế tách người test khỏi người viết mã đã có ở AgentCoder → **không được nhận là mới**.
4. Quy trình cố định/đơn giản đã có ở Agentless → "làn nhanh" không được nhận là mới ở mức ý tưởng; chỉ phần cài đặt và đo mới có thể là đóng góp.

## 4. Khoảng trống của nhóm A (chuyển cho S5/S6)

- Đọc toàn văn: MAST (danh sách 14 lỗi và tên 7 khung đã có từ 3/11/2026; còn **Phụ lục A và H** chưa đọc), Agentless (phiên bản số liệu cuối), SWE-agent/OpenHands (cơ chế sandbox, phân quyền).
- Điền đủ tác giả APA 7 cho 9 mục ghi "et al."; lấy DOI cho các bài hội nghị (OpenReview/ACM) nếu có.
- Bài Cognition 2026 và bình luận phản biện (LangChain…) — `[CHƯA KIỂM CHỨNG]`, chưa mở.
- Cần tìm bằng `search_papers` (OpenAlex) khi có công cụ: số trích dẫn, bài trích dẫn xuôi/ngược tới MAST và "Don't Build Multi-Agents", các công bố 2025–2026 về cache/token cho coding agent.

## Nhóm B

> Hạng mục S5 · lập ngày 2026-11-02 · cùng định dạng và quy ước nhãn như §2 (mức đọc, loại nguồn, APA 7). Nhóm B: (B1) tự cải thiện/tối ưu prompt và quy trình, (B2) tối ưu giao tiếp/token/cache, (B3) công bố 2025–2026 về coding multi-agent, (B4) an toàn/quyền của agent. Đối chiếu với nhóm A: không nguồn nào trùng 15 nguồn của S1.

### B.0 Giới hạn và nhật ký truy vấn

- **Công cụ:** vẫn chỉ có `WebSearch` và `WebFetch`; **không có `search_papers` (OpenAlex)** → không có số trích dẫn, và không thể áp bộ lọc `year_from=2025`. Thay vào đó, các truy vấn nhắm đích tên bài; năm của mỗi nguồn ghi ở mục riêng. Số 2025–2026 đếm theo năm công bố/phiên bản nêu trong kết quả.
- **Mức đọc:** 3 nguồn (CAID, TeamBench, Don't Break the Cache) được mở trang bằng `WebFetch` qua 4 lần mở F5–F8 — nội dung do công cụ tóm lược, riêng CAID HTML chỉ đọc 100.000/134.699 ký tự đầu. 13 nguồn còn lại chỉ có tóm lược trong kết quả tìm kiếm → `[CHỈ ĐỌC TÓM TẮT]`. **Không nguồn nào đọc toàn văn PDF.** Mọi số liệu là số tự báo cáo, không so sánh chéo.
- **Đọc ít hơn "đọc sâu":** đề bài yêu cầu tối đa 15 nguồn đọc sâu; ở đây 15 nguồn nhóm B được ghi ở mức tóm tắt/trang tóm tắt, không phải đọc sâu.
- **Tác giả APA 7:** nơi công cụ không trả đủ danh sách tác giả, ghi *tác giả đầu et al.* kèm ghi chú; riêng **AgentDojo** kết quả tìm kiếm không nêu tên tác giả nên **để trống, không điền từ trí nhớ** — cần mở trang NeurIPS trước khi nộp.
- Truy vấn chỉ chứa tiêu đề bài công khai; không có tên dự án/cơ quan nội bộ.

| # | Công cụ | Truy vấn (nguyên văn) | Bộ lọc | Ngày | Chọn |
|---|---|---|---|---|---|
| Q16 | WebSearch | Self-Refine: Iterative Refinement with Self-Feedback Madaan arXiv 2303.17651 | không | 2026-11-02 | 1 |
| Q17 | WebSearch | Reflexion: Language Agents with Verbal Reinforcement Learning Shinn arXiv | không | 2026-11-02 | 1 |
| Q18 | WebSearch | DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines arXiv | không | 2026-11-02 | 1 |
| Q19 | WebSearch | Large Language Models as Optimizers OPRO Yang arXiv 2309.03409 | không | 2026-11-02 | 1 |
| Q20 | WebSearch | TextGrad: Automatic "Differentiation" via Text Yuksekgonul arXiv | không | 2026-11-02 | 1 |
| Q21 | WebSearch | Automated Design of Agentic Systems ADAS Hu Lu Clune arXiv | không | 2026-11-02 | 1 |
| Q22 | WebSearch | AFlow: Automating Agentic Workflow Generation arXiv ICLR 2025 | không | 2026-11-02 | 1 |
| Q23 | WebSearch | EvoMAC Self-Evolving Multi-Agent Collaboration Networks for Software Development arXiv | không | 2026-11-02 | 1 |
| Q24 | WebSearch | Experiential Co-Learning of Software-Developing Agents arXiv ACL 2024 | không | 2026-11-02 | 1 |
| Q25 | WebSearch | Cut the Crap: An Economical Communication Pipeline for LLM-based Multi-Agent Systems AgentPrune arXiv | không | 2026-11-02 | 1 |
| Q26 | WebSearch | Optima: Optimizing Effectiveness and Efficiency for LLM-Based Multi-Agent System arXiv | không | 2026-11-02 | 1 |
| Q27 | WebSearch | Effective Strategies for Asynchronous Software Engineering Agents Geng Neubig arXiv 2603.21489 | không | 2026-11-02 | 1 |
| Q28 | WebSearch | TeamBench: Evaluating Agent Coordination under Enforced Role Separation arXiv 2605.07073 | không | 2026-11-02 | 1 |
| Q29 | WebSearch | Identifying the Risks of LM Agents with an LM-Emulated Sandbox ToolEmu arXiv | không | 2026-11-02 | 1 |
| Q30 | WebSearch | AgentDojo: A Dynamic Environment to Evaluate Prompt Injection Attacks and Defenses for LLM Agents arXiv | không | 2026-11-02 | 1 |
| Q31 | WebSearch | prompt caching coding agents cost token usage cache hit rate arXiv 2025 2026 agentic | không | 2026-11-02 | 1 (arXiv 2601.06007); bỏ các báo cáo thương mại (Requesty…) vì là telemetry nhà cung cấp, không kiểm chứng |
| Q32 | WebSearch | Cognition "Multi-Agents: What's Actually Working" 2026 | không | 2026-11-02 | 0 — chỉ thấy nguồn thứ cấp; `[CHƯA KIỂM CHỨNG]`, không dùng làm căn cứ |
| F5 | WebFetch | https://arxiv.org/abs/2603.21489 | — | 2026-11-02 | đọc |
| F6 | WebFetch | https://arxiv.org/abs/2605.07073 | — | 2026-11-02 | đọc |
| F7 | WebFetch | https://arxiv.org/html/2601.06007 | — | 2026-11-02 | đọc |
| F8 | WebFetch | https://arxiv.org/html/2603.21489v1 | — | 2026-11-02 | đọc (100.000/134.699 ký tự) |

Tổng nguồn trong tệp: **15 (nhóm A) + 16 (nhóm B) = 31**. Nguồn 2025–2026 có URL/DOI lấy từ kết quả công cụ: CAID, TeamBench, Don't Break the Cache (2026); AFlow, AgentPrune (ICLR 2025); Optima (bản sửa 2025) — **6 nguồn**.

### B.1 Tự cải thiện, tối ưu prompt và quy trình

#### B.1.1 Self-Refine
- **APA 7:** Madaan, A., et al. (2023). Self-Refine: Iterative refinement with self-feedback. *Advances in Neural Information Processing Systems 36 (NeurIPS 2023)*. arXiv:2303.17651. https://arxiv.org/abs/2303.17651v2 *(chỉ biết tác giả đầu; NeurIPS 2023 theo một danh mục trích dẫn thứ cấp — chưa xác minh trang hội nghị.)*
- **Loại:** bình duyệt (chưa xác minh) / bản đọc là trang arXiv. **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** một mô hình viết nháp, tự phê bình, rồi sửa, lặp tới điều kiện dừng; không cần huấn luyện; trên 7 tác vụ, kết quả tốt hơn sinh một bước, trung bình tăng khoảng 20% tuyệt đối (tự báo cáo).
- **Giống CCoding:** vòng review→revise. **Khác:** phê bình do chính mô hình đó làm; CCoding dùng reviewer độc lập (vai và hồ sơ riêng) và kiểm thử ẩn để đánh giá ngoài. Self-Refine **không** cập nhật prompt lâu dài giữa các tác vụ.

#### B.1.2 Reflexion
- **APA 7:** Shinn, N., Cassano, F., Berman, E., Gopinath, A., Narasimhan, K., & Yao, S. (2023). Reflexion: Language agents with verbal reinforcement learning. *Advances in Neural Information Processing Systems 36 (NeurIPS 2023)*. arXiv:2303.11366. https://arxiv.org/abs/2303.11366v4 — danh mục: https://mlanthology.org/neurips/2023/shinn2023neurips-reflexion
- **Loại:** bình duyệt. **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** agent viết phản tư bằng ngôn ngữ từ phản hồi nhiệm vụ và giữ trong bộ nhớ tình tiết để thử lại, không cập nhật trọng số; 91% pass@1 HumanEval (so với 80% GPT-4 trước đó) và +22% tuyệt đối trên AlfWorld trong 12 bước (tự báo cáo).
- **Giống:** "ghi lại vấn đề rồi dùng ở lượt sau" — đúng ý cơ chế tự cải thiện của yêu cầu chủ dự án. **Khác:** Reflexion học **trong một tác vụ** qua nhiều lần thử (có tín hiệu thưởng); vòng của CCoding ghi vấn đề **giữa các nhiệm vụ** và đề xuất **sửa prompt/hồ sơ** để chủ dự án duyệt.

#### B.1.3 DSPy
- **APA 7:** Khattab, O., et al. (2023). *DSPy: Compiling declarative language model calls into self-improving pipelines* (arXiv:2310.03714). https://arxiv.org/pdf/2310.03714 *(Omar Khattab, Christopher Potts, Matei Zaharia và các tác giả khác; chưa xác minh venue.)*
- **Loại:** preprint (chưa xác minh venue). **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** pipeline LM là đồ thị tính toán gồm module khai báo có tham số; một compiler tối ưu pipeline theo một metric cho trước (bootstrapping minh họa/ prompt); hai ca nghiên cứu cho GPT-3.5 và llama2-13b-chat tự khởi tạo pipeline vượt few-shot chuẩn (tự báo cáo).
- **Giống:** coi prompt/pipeline là đối tượng tối ưu được theo metric (CCoding có KPI trong `src/kpi.ts`). **Khác:** DSPy tối ưu **tự động** theo metric lập trình được trên tập huấn luyện; CCoding chạy trên nhiệm vụ thật, ít mẫu, nên vòng sửa cần người duyệt.

#### B.1.4 OPRO
- **APA 7:** Yang, C., Wang, X., Lu, Y., Liu, H., Le, Q. V., Zhou, D., & Chen, X. (2024). Large language models as optimizers. *ICLR 2024*. arXiv:2309.03409. https://arxiv.org/abs/2309.03409 *(ICLR 2024 theo kết quả tìm kiếm; chưa mở trang hội nghị.)*
- **Loại:** bình duyệt (chưa xác minh trang). **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** mô tả bài toán tối ưu bằng ngôn ngữ; mỗi vòng, LLM sinh ứng viên mới dựa trên các ứng viên trước kèm điểm; với tối ưu prompt, prompt tìm được hơn prompt người viết tới 8% (GSM8K) và tới 50% (Big-Bench Hard) (tự báo cáo, theo trang Hugging Face trong kết quả).
- **Giống:** đề xuất sửa prompt dựa trên lịch sử sửa và điểm. **Khác:** cần hàm điểm rẻ, chạy nhiều lần; số mẫu của CCoding (5 bài benchtest) không đủ để tối ưu kiểu này — đây là lý do vòng của CCoding dừng ở "đề xuất + duyệt + đo lại".

#### B.1.5 TextGrad
- **APA 7:** Yuksekgonul, M., Bianchi, F., Boen, J., Liu, S., Huang, Z., Guestrin, C., & Zou, J. (2024). *TextGrad: Automatic "differentiation" via text* (arXiv:2406.07496). https://arxiv.org/abs/2406.07496v1
- **Loại:** preprint (bản đọc). **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** dùng phản hồi ngôn ngữ của LLM thay cho gradient để cải thiện từng thành phần trong hệ gồm nhiều thành phần; kết quả trên hỏi đáp, LeetCode-Hard, cải thiện prompt, thiết kế phân tử, lập kế hoạch xạ trị (tự báo cáo).
- **Giống:** "góp ý bằng lời" truyền ngược đến thành phần gây lỗi (CCoding: góp ý trong `src/kpi.ts` cho từng agent). **Khác:** TextGrad tự động cập nhật biến; CCoding chỉ ghi và đề xuất, không tự ghi đè hồ sơ `agents/*/*.md`.

#### B.1.6 ADAS — Automated Design of Agentic Systems
- **APA 7:** Hu, S., Lu, C., & Clune, J. (2024). *Automated design of agentic systems* (arXiv:2408.08435). https://arxiv.org/abs/2408.08435.pdf *(bản sửa 2/3/2025 theo kết quả tìm kiếm; chưa thấy venue.)*
- **Loại:** preprint. **Mức đọc:** [CHỈ ĐỌC TÓM TẮT]; phần lớn chi tiết thấy ở bản tóm lược bên thứ ba, nên chỉ dùng mức "Meta Agent Search viết mã agent mới, thử và lưu kho".
- **Đóng góp:** "Meta Agent Search": agent meta viết mã cho agent mới, kiểm thử, lưu vào kho để vòng sau dùng; agent tìm được vượt baseline thủ công (CoT, Self-Refine) và chuyển được giữa miền (tự báo cáo).
- **Giống:** chủ đề "agent cải thiện agent". **Khác:** ADAS tìm **thiết kế** agent tự động trên benchmark; CCoding giữ thiết kế do con người quyết định và chỉ để agent đề xuất vá prompt.

#### B.1.7 AFlow
- **APA 7:** Zhang, et al. (2025). AFlow: Automating agentic workflow generation. *ICLR 2025*. https://proceedings.iclr.cc/paper_files/paper/2025/hash/5492ecbce4439401798dcd2c90be94cd-Abstract-Conference.html *(kết quả tìm kiếm chỉ ghi "Zhang et al."; điền đủ tác giả khi mở trang; là bài oral theo trang ICLR.)*
- **Loại:** bình duyệt. **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** coi workflow là đồ thị nút-cạnh biểu diễn bằng mã và tìm bằng Monte Carlo Tree Search với phản hồi thực thi; cải thiện trung bình 5,7% so với baseline trên 6 benchmark; mô hình nhỏ vượt GPT-4o ở một số tác vụ với 4,55% chi phí suy luận (tự báo cáo).
- **Giống:** quan tâm **chi phí cùng độ chính xác**; chọn mô hình theo bước (tương ứng O6). **Khác:** tối ưu tự động offline trên tập đánh giá; CCoding chọn lane (nhanh/đầy) theo quy tắc và đo trên bài thật.

#### B.1.8 EvoMAC
- **APA 7:** Hu, Y., Cai, Y., et al. (2024). *Self-evolving multi-agent collaboration networks for software development* (arXiv:2410.16946). https://arxiv.org/abs/2410.16946v1 *(Yue Hu, Yuzhu Cai +7 đồng tác giả; một trang tóm lược thứ cấp ghi ICLR — chưa xác minh.)*
- **Loại:** preprint (chưa xác minh venue). **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** mạng agent thay đổi cả agent lẫn kết nối **trong lúc làm từng tác vụ**; phản hồi văn bản từ kiểm tra so với "mục tiêu đại diện" rồi "lan truyền ngược văn bản" để cập nhật; rSDE-Bench cho yêu cầu cấp phần mềm; vượt phương pháp trước trên rSDE-Bench và HumanEval (một nguồn: +6,10% HumanEval).
- **Giống (quan trọng):** **multi-agent cho phần mềm + tự tiến hoá theo phản hồi kiểm thử** — gần nhất với ý "sub-agent tự cải thiện". **Khác:** tiến hoá mạng/thông điệp **trong từng tác vụ**; CCoding ghi vấn đề **qua nhiều nhiệm vụ** và vá **hồ sơ prompt** có người duyệt; EvoMAC không đo cache/thời gian thực.

#### B.1.9 Experiential Co-Learning
- **APA 7:** Qian, C., Dang, Y., et al. (2024). Experiential co-learning of software-developing agents. In *Proceedings of the 62nd Annual Meeting of the ACL (Volume 1: Long Papers)* (pp. 5628–5640). Association for Computational Linguistics. https://aclanthology.org/2024.acl-long.305 — arXiv:2312.17025. *(Chen Qian, Yufan Dang +9; chưa lấy DOI.)*
- **Loại:** bình duyệt. **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** agent hướng dẫn và trợ lý dùng quỹ đạo quá khứ để tạo "kinh nghiệm tắt" tái dùng; xử lý tác vụ phát triển phần mềm chưa gặp tốt hơn (tự báo cáo). Tên ba mô-đun do tóm lược bên thứ ba — không dùng.
- **Giống:** tái dùng kinh nghiệm quá khứ để cải thiện (CCoding: bài học/nhật ký sự cố). **Khác:** kinh nghiệm là dữ liệu hướng dẫn; CCoding biến nó thành **bản vá có thể kiểm tra** (giả thuyết, chỉ số, cách đo).

### B.2 Giao tiếp, token và cache

#### B.2.1 AgentPrune (Cut the Crap)
- **APA 7:** Zhang, G., Yue, Y., et al. (2025). Cut the crap: An economical communication pipeline for LLM-based multi-agent systems. *ICLR 2025*. https://proceedings.iclr.cc/paper_files/paper/2025/hash/bbc461518c59a2a8d64e70e2c38c4a0e-Abstract-Conference.html — arXiv:2410.02506. *(Guibin Zhang, Yanwei Yue +7.)*
- **Loại:** bình duyệt (poster). **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** cắt thông điệp dư trong đồ thị giao tiếp không gian–thời gian một lần, cắm vào khung có sẵn; tự báo cáo độ chính xác tương đương với khoảng 5,6 USD so với 43,7 USD, giảm token 28,1–72,8%; benchmark MMLU, GSM8K, HumanEval…
- **Giống:** giảm token giữa agent (O3 rút gọn ngữ cảnh; O4 reviewer chỉ nhận diff). **Khác:** cắt cạnh trong đồ thị đối thoại trên benchmark suy luận/hàm; **không** xét cache, đầu ra công cụ, hay mã nhiều tệp.

#### B.2.2 Optima
- **APA 7:** Chen, W., Yuan, J., Qian, C., Yang, C., Liu, Z., & Sun, M. (2025). *Optima: Optimizing effectiveness and efficiency for LLM-based multi-agent system* (arXiv:2410.08115v2). https://arxiv.org/abs/2410.08115v2
- **Loại:** preprint (trang ghi "under review"). **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** khung **huấn luyện** (sinh–xếp hạng–chọn–huấn luyện, dữ liệu DPO kiểu MCTS) với phần thưởng cân bằng hiệu quả tác vụ, hiệu quả token, và độ đọc được của giao tiếp; Llama 3 8B: tới 90% giảm token, 2,8× hiệu năng so với agent đơn trên hỏi đáp bất đối xứng thông tin và tranh luận toán (tự báo cáo).
- **Giống:** tối ưu chung hiệu quả–chi phí, hợp với "AI Agents That Matter". **Khác:** tinh chỉnh trọng số mô hình nhỏ; CCoding dùng mô hình đóng qua CLI/API, không huấn luyện — chỉ chỉnh prompt, ngữ cảnh, lane.

#### B.2.3 Don't Break the Cache
- **APA 7:** Lumer, E., Nizar, F., Jangiti, A., Frank, K., Gulati, A., Phadate, M., & Subbiah, V. K. (2026). *Don't break the cache: An evaluation of prompt caching for long-horizon agentic tasks* (arXiv:2601.06007). https://arxiv.org/html/2601.06007 *(tên đầy đủ bản arXiv chưa xác minh; kết quả tìm kiếm ghi "Don't Break the Cache: An Evaluation of Prompt Caching". Tác giả: PwC US, theo `WebFetch`.)*
- **Loại:** preprint (2026-01). **Mức đọc:** [ĐỌC TRANG — HTML, công cụ tóm lược].
- **Đóng góp:** đo prompt caching trên DeepResearch Bench (>500 phiên, system prompt 10.000 token, 3 nhà cung cấp: OpenAI GPT-5.2/GPT-4o, Anthropic Claude Sonnet 4.5, Google Gemini 2.5 Pro). Caching giảm chi phí API 41–80% và cải thiện TTFT 13–31%. Ba chiến lược đặt cache: toàn bộ ngữ cảnh (tiết kiệm 78–80% cho GPT-5.2 và Claude, nhưng TTFT của GPT-4o kém 8,8%), chỉ system prompt (nhất quán nhất), loại kết quả công cụ. Khuyến nghị: để nội dung động (timestamp, ID phiên) ở cuối prompt; đổi định nghĩa công cụ phá cache; kết quả công cụ khó dùng lại giữa phiên.
- **Giống (rất gần):** đúng chủ đề O1 (tiền tố ổn định dùng chung cache) và đo cache theo nhà cung cấp. **Khác:** tác vụ nghiên cứu web **một agent**, đo trên API với cache được bật có chủ ý; **không** phải coding multi-agent, không đo theo pha, không có phiên song song/worktree, không so với Claude Code thuần, và không phân biệt TTL cache 1 giờ/5 phút. *Hệ quả:* CCoding **không được nhận** "tiền tố ổn định giúp tiết kiệm" là mới; chỉ phần đo trong bối cảnh coding multi-agent mới có thể là mới.

### B.3 Công bố 2025–2026 về coding multi-agent

#### B.3.1 CAID — Effective Strategies for Asynchronous Software Engineering Agents
- **APA 7:** Geng, J., & Neubig, G. (2026). *Effective strategies for asynchronous software engineering agents* (arXiv:2603.21489). https://arxiv.org/abs/2603.21489 — HTML: https://arxiv.org/html/2603.21489v1 *(nộp 23/3/2026; Carnegie Mellon University.)*
- **Loại:** preprint. **Mức đọc:** [ĐỌC TRANG — abs + HTML, công cụ tóm lược; v2: đã đọc đủ 134.699 ký tự, trừ Phụ lục C–D không có trong nội dung lấy được].
- **Đóng góp:** CAID (Centralized Asynchronous Isolated Delegation): manager lập kế hoạch có phụ thuộc, giao cho các engineer, mỗi engineer **một git worktree**, tích hợp bằng `git commit`/`git merge` và kiểm chứng bằng test. Tóm tắt: +26,7 điểm tuyệt đối trên PaperBench và +14,3 trên Commit0 (v1 HTML); **trang abs hiện ghi +25,6 và +14,7** → hai phiên bản khác nhau, cần ghi phiên bản khi trích. Bảng 2 (PaperBench, Claude Sonnet 4.5, 2 engineer): đơn agent 57,2 điểm / 1803,5 / 3,3; CAID 63,3 / 2080,4 / 9,3 (đơn vị runtime và chi phí không được ghi nhãn trong bảng; văn bản nói runtime tính bằng giây). Commit0-Lite (4 engineer): 53,1 / 692,6 / 1,9 so với 59,1 / 1583,2 / 8,1. Tác giả viết: "multi-agent execution consistently incurs higher API cost than single-agent baselines" và "wall-clock runtime is not substantially reduced despite parallel execution". Cách ly bằng worktree tốt hơn "soft isolation" (PaperBench 63,3 so với 55,5; Commit0-Lite 59,1 so với 56,1).
- **Giống CCoding (rất gần):** manager + kế hoạch có phụ thuộc + worktree con + tự gộp + kiểm chứng bằng test. **Khác:** CAID dùng PaperBench/Commit0, không so với Claude Code thuần theo từng pha; không thấy cache, không có làn nhanh cho việc nhỏ, không có hook quyền công cụ, không có vòng tự cải thiện sub-agent trong phần đã đọc. **Thứ tự thời gian:** CAID (3/2026) đi trước worktree song song của CCoding (từ 1/11/2026, theo đề bài) → ý tưởng này **không được nhận là mới**.

#### B.3.2 TeamBench
- **APA 7:** Kim, Y., Park, C., Kim, T., Park, E., Schmidgall, S., Rahman, S., Park, C., Breazeal, C., Liu, X., Palangi, H., Park, H. W., & McDuff, D. (2026). *TeamBench: Evaluating agent coordination under enforced role separation* (arXiv:2605.07073). https://arxiv.org/abs/2605.07073 *(nộp 8/5/2026; 12 tác giả theo `WebFetch`.)*
- **Loại:** preprint. **Mức đọc:** [ĐỌC TRANG — abs, công cụ tóm lược].
- **Đóng góp:** 851 mẫu tác vụ, 931 instance; ba vai Planner/Executor/Verifier tách quyền bằng quyền hệ điều hành (truy cập đặc tả, sửa workspace, chứng nhận cuối). Đội chỉ-prompt và đội cưỡng chế bằng sandbox có tỉ lệ đạt "không khác biệt có ý nghĩa thống kê", nhưng chỉ-prompt có số lần verifier cố sửa mã executor nhiều gấp 3,6; verifier chấp nhận 49% bài nộp mà bộ chấm xác định loại; bỏ verifier làm điểm riêng phần trung bình tăng; giá trị của đội phụ thuộc độ khó nền (giúp khi đơn agent yếu, hại khi đơn agent đã giỏi); nghiên cứu 40 phiên người–agent cho thấy người hay duyệt nhanh.
- **Giống:** tách quyền theo vai bằng cơ chế thực thi, review độc lập. **Khác:** TeamBench là benchmark tác vụ riêng; CCoding cưỡng chế bằng hook PreToolUse theo năng lực công cụ và so với đơn agent trên bài mã nhiều tệp. **Điểm cần soi:** "review độc lập" của CCoding cũng phải đối chiếu khả năng duyệt nhầm (49%) bằng số liệu review của chính CCoding.

### B.4 An toàn và quyền của agent

#### B.4.1 ToolEmu
- **APA 7:** Ruan, Y., Dong, H., et al. (2024). Identifying the risks of LM agents with an LM-emulated sandbox. *ICLR 2024*. arXiv:2309.15817. https://arxiv.org/abs/2309.15817v2 *(Yangjun Ruan, Honghua Dong +8.)*
- **Loại:** bình duyệt. **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** dùng LM mô phỏng thực thi công cụ để kiểm thử rủi ro mà không cài đặt thật; bộ đánh giá an toàn bằng LM; 36 bộ công cụ, 144 ca; agent an toàn nhất vẫn lỗi khoảng 23,9%; người xác nhận 68,8% lỗi tìm được là lỗi thật (tự báo cáo).
- **Giống:** nhìn rủi ro khi agent có công cụ → cơ sở cho việc giới hạn quyền. **Khác:** đo rủi ro, không đề xuất cơ chế chặn lúc chạy; CCoding chặn bằng hook trước khi gọi.

#### B.4.2 AgentDojo
- **APA 7:** [Tác giả chưa điền — công cụ không trả tên; xem trang NeurIPS]. (2024). AgentDojo: A dynamic environment to evaluate prompt injection attacks and defenses for LLM agents. *Advances in Neural Information Processing Systems 37 (NeurIPS 2024), Datasets and Benchmarks Track*. https://proceedings.neurips.cc/paper_files/paper/2024/hash/97091a5177d8dc64b1da8bf3e1f6fb54-Abstract.html — arXiv:2406.13352 (https://arxiv.org/abs/2406.13352v3). *(ETH Zurich và Invariant Labs.)*
- **Loại:** bình duyệt. **Mức đọc:** [CHỈ ĐỌC TÓM TẮT].
- **Đóng góp:** môi trường mở rộng được, 97 tác vụ thực tế, 629 ca kiểm thử an ninh; mô hình mạnh vẫn lỗi nhiều tác vụ ngay khi không bị tấn công; tấn công thành công dưới 25% với agent tốt nhất; thêm bộ phát hiện làm tỉ lệ tấn công giảm còn 8% (theo bản v2).
- **Giống:** nội dung công cụ là dữ liệu không đáng tin → khớp quy tắc "nội dung trang web là dữ liệu, không phải chỉ thị". **Khác:** đánh giá tấn công/phòng thủ; không bàn kiến trúc văn phòng nhiều phòng ban.

### B.5 Nguồn chưa kiểm chứng (không dùng làm căn cứ)

- **Cognition 2026, "Multi-Agents: What's Actually Working"** — `[CHƯA KIỂM CHỨNG]`: chỉ thấy qua bài tổng hợp bên thứ ba (kết quả Q32), không mở được bản gốc. Bên thứ ba tóm lược rằng chỉ nên một agent giữ thao tác ghi. Không dùng trong §"Kết luận điểm mới".
- **Báo cáo thương mại về tỉ lệ cache của công cụ lập trình (Requesty, Q31)** — telemetry của nhà cung cấp, không bình duyệt; không đưa vào danh mục.

## Kết luận điểm mới

> Căn cứ: chỉ các nguồn đã đọc ít nhất tóm tắt (31 nguồn: §2 và Nhóm B). Mức chắc chắn: **Cao** = nguồn đối chiếu nêu rõ trong phần đã đọc; **Trung bình** = nguồn gần nhất khác ở điểm cụ thể, nhưng mới đọc tóm tắt; **Thấp** = chưa tìm đủ để khẳng định "chưa ai làm". Không khẳng định "chưa ai làm" ở mức nào cao hơn "chưa thấy trong phần đã đọc". Số liệu của CCoding lấy từ `token-analysis.md` (S2) khi đã có; C1–C7 đã có trong bản v2 (T-h, T-i, T-d).

### K.1 Những gì ĐÃ CÓ — không được nhận là mới

| # | Ý tưởng của CCoding | Nguồn đối chiếu | Ghi chú |
|---|---|---|---|
| E1 | Manager + kế hoạch có phụ thuộc + mỗi engineer một git worktree + tự gộp + kiểm chứng bằng test | CAID (Geng & Neubig, 2026) | Công bố trước (3/2026). CAID còn so worktree với "soft isolation" |
| E2 | Tách quyền theo vai bằng cơ chế cưỡng chế, có verifier độc lập | TeamBench (Kim et al., 2026); AgentCoder (Huang et al., 2024) | TeamBench cưỡng chế bằng quyền OS; AgentCoder tách người viết test khỏi người viết mã |
| E3 | Vòng phê bình→sửa | Self-Refine (Madaan et al., 2023); Reflexion (Shinn et al., 2023) | Đã có từ 2023 |
| E4 | Prompt/pipeline là đối tượng tối ưu theo metric, dùng lịch sử sửa và điểm | DSPy (Khattab et al., 2024); OPRO (Yang et al., 2024); TextGrad (Yuksekgonul et al., 2025) | Tự động, có hàm điểm |
| E5 | Agent/workflow tự tiến hoá, kể cả cho phần mềm | ADAS (Hu et al., 2025); AFlow (Zhang et al., 2025); EvoMAC (Hu et al., 2025); Experiential Co-Learning (Qian et al., 2024) | EvoMAC gần nhất: multi-agent phần mềm + phản hồi kiểm thử |
| E6 | Giảm token giữa agent; tối ưu chung chi phí–độ chính xác | AgentPrune (Zhang et al., 2025); Optima (Chen et al., 2025); AI Agents That Matter (Kapoor et al., 2025) | |
| E7 | Tiền tố ổn định, nội dung động đặt cuối để giữ cache | Don't Break the Cache (Lumer et al., 2026) | Đây chính là ý O1; chỉ là kỹ thuật đã công bố |
| E8 | Quy trình cố định đơn giản thay vì agent tự do (nền của "làn nhanh") | Agentless (Xia et al., 2025) | Ý tưởng không mới |
| E9 | Lập luận "nhiều agent đắt hơn, lợi ích phụ thuộc độ khó" | Anthropic (Hadfield et al., 2025); TeamBench; CAID | CAID báo cáo runtime không giảm đáng kể và chi phí cao hơn |
| E10 | Phân loại lỗi multi-agent theo thiết kế/phối hợp/kiểm chứng | MAST (Cemri et al., 2025) | CCoding dùng MAST làm khung, không phải đóng góp mới |

### K.2 Những gì CÓ THỂ là mới

| # | Khẳng định có thể mới | Mức chắc chắn | Nguồn đối chiếu và lý do | Điều kiện để giữ khẳng định |
|---|---|---|---|---|
| N1 | Đo **cache theo từng lượt gọi và từng pha** (token vào/ra, đọc/ghi cache, TTL 1 giờ/5 phút) của một hệ coding multi-agent **so với Claude Code thuần** trên cùng bài có test ẩn | **Trung bình** | CAID đo điểm/runtime/chi phí nhưng không thấy cache trong phần đọc; Don't Break the Cache đo cache nhưng cho một agent nghiên cứu web, không phải mã, không có pha/song song; Anthropic (2025) chỉ nêu token; AgentPrune/Optima dừng ở token/USD | Số thật từ `token-analysis.md` (C1–C7); mới đọc tóm tắt/HTML một phần của CAID nên chưa loại trừ cache nằm ở phần chưa đọc |
| N2 | Các **đề xuất tối ưu O1–O6 được đo tách từng yếu tố** (tiền tố, tái dùng phiên, rút ngữ cảnh, diff cho reviewer, giới hạn đầu ra, chọn mô hình theo pha) trên đa agent coding | **Thấp–Trung bình** | Từng ý đã có rời rạc: O1 (Lumer et al., 2026), O3/O4 gần AgentPrune, O6 gần AFlow; chưa thấy bài nào gộp và đo chúng trên coding multi-agent trong phần đã đọc | Chỉ mới nếu có phép đo cho từng O; hiện S2 chỉ đề xuất, không có thí nghiệm bóc tách |
| N3 | **Làn nhanh/làn đầy** chọn theo độ khó, đo thời gian thực so với Claude Code thuần | **Trung bình–Thấp** | Anthropic nêu quy tắc mức nỗ lực trong prompt; Agentless dùng quy trình cố định; CAID không có làn; chưa tìm bài nào có định tuyến lane trong multi-agent coding, nhưng **chưa tìm riêng chủ đề "routing/adaptive compute"** | Cần một truy vấn riêng về routing/adaptive computation trước khi khẳng định |
| N4 | **Vòng tự cải thiện ở mức nhiệm vụ**: ghi vấn đề có mã (C-xx, O-x), đề xuất bản vá prompt kèm giả thuyết–chỉ số–cách đo, **người duyệt** trước khi áp dụng | **Thấp–Trung bình** | Reflexion/ECL/EvoMAC tự cải thiện trong hoặc giữa tác vụ nhưng tự động; DSPy/OPRO/TextGrad cần hàm điểm và nhiều mẫu; ADAS/AFlow tìm thiết kế offline | Mới ở khía cạnh "có người duyệt + bản vá kiểm chứng được ở quy mô ít mẫu"; phải có bằng chứng vòng này cải thiện được (chưa có: C6 chỉ kiểm một bản sửa `maxParallel`, không phải vòng tự cải thiện); mới đọc tóm tắt nên chưa loại trừ công trình gần |
| N5 | Một **hệ vận hành thật** ghi nhật ký thách thức→cách giải quyết theo MAST + nhóm hạ tầng, gồm lỗi runtime/nhà cung cấp | **Trung bình** | MAST phân tích vết của hệ khác (Cemri et al., 2025); không nguồn nào trong phần đã đọc báo cáo nhật ký vận hành của một hệ tự xây | Phụ thuộc bằng chứng của S3; lỗi hạ tầng riêng của CCoding có thể không khái quát |
| N6 | Gộp **quản trị dữ liệu** (nhãn dữ liệu, che PII, log chuỗi băm) vào hệ multi-agent coding | **Thấp** | Không nguồn nào trong 31 nguồn nêu cơ chế này; nhưng đa số mới đọc tóm tắt và chưa tìm riêng chủ đề quản trị dữ liệu trong agent | Là đặc điểm hệ thống hơn là kết quả nghiên cứu; không nên làm trục chính của bài |

### K.3 Có phải công bố lại không?

**Trả lời thẳng:** *Nếu chỉ trình bày kiến trúc* (văn phòng nhiều phòng ban, worktree song song + tự gộp, review độc lập + vòng sửa) **thì phần lớn là công bố lại hoặc trùng ý với công trình đã đăng** — nhất là CAID (E1) cho worktree/gộp, TeamBench và AgentCoder (E2) cho tách vai và verifier, Agentless (E8) cho quy trình cố định. Không nên viết "chúng tôi đề xuất" cho các ý này.

*Phần không phải công bố lại* nằm ở **phép đo và vận hành**, không ở ý tưởng kiến trúc: (a) N1 — đo cache/token/thời gian từng pha so với Claude Code thuần (mức Trung bình); (b) N5 — nhật ký thách thức–cách giải quyết từ một hệ vận hành thật (Trung bình); (c) N3 và N4 ở mức Thấp–Trung bình, cần bổ sung trước khi khẳng định. Kết luận này **chưa thể nâng lên "chưa ai làm"**, vì 24/31 nguồn chỉ đọc tóm tắt (7/31 được mở trang) và không có `search_papers`.

**Cập nhật v2 (S2, 2026-11-02) — "khác gì" CAID và Don't Break the Cache, sau khi đọc toàn văn.** Chỉ nêu khác biệt có bằng chứng; chi tiết, trích đoạn và số mục ở `references-v2.md` §2.

| Câu hỏi | CAID (Geng & Neubig, 2026) | Don't Break the Cache (Lumer và cộng sự, 2026) | CCoding (bản thảo) |
|---|---|---|---|
| Đo thời gian theo pha? | **Không**: chỉ tổng thời gian mỗi cấu hình (Bảng 2, Phụ lục B); Hình 4 là Gantt, không có số theo pha | Không (đo TTFT mỗi lệnh gọi) | Có (`phases.csv`, T-d: lập kế hoạch/thực thi/review/gộp) |
| Đo cache? | **Không** (không có cache/token trong bảng; có cột Cost không nêu đơn vị) | **Có**, đó là chủ đề: giảm chi phí 41–80 %, TTFT 6–31 % trên 500+ phiên | Có (cache read/creation theo `calls.csv`; trần 5,1 % của O1 — T-e) |
| Cấu hình so sánh | Đơn agent OpenHands vs CAID (2 hoặc 4 engineer), thêm biến thể soft isolation, đơn agent 200 vòng | Bốn chế độ cache trên một agent | Claude Code một mình (Opus C5–C6, Sonnet C7) vs làn nhanh/làn đầy |
| Mô hình | Claude Sonnet 4.5, MiniMax 2.5, GLM 4.7 | GPT-5.2, Claude Sonnet 4.5, Gemini 2.5 Pro (+GPT-4o) | Opus và Sonnet qua `claude-cli` |
| Quy mô bài | Commit0-Lite (16 repo) và PaperBench Code-Dev (20 bài); mỗi cấu hình ≈ 12–50 phút | DeepResearch Bench, 40 phiên/điều kiện, **tác vụ web, một agent** | 5 bài tự viết (461 test ẩn), 1–2 lượt/bài, 1–5 phút |
| Kết quả thời gian | Đa agent **chậm hơn** ở cả 6 hàng Bảng 2 (×1,15–×2,5); chi phí ×1,7–×4,3 | Không áp dụng | Cùng mô hình: một agent nhanh hơn 1,6–2,9× ở 4/5 bài (C7, n nhỏ) |

Hệ quả có bằng chứng: (1) **kết luận "đa agent đắt hơn và không nhanh hơn" đã có ở CAID** trên benchmark công khai — CCoding không được nhận là phát hiện đầu tiên, chỉ là mẫu bổ sung ở quy mô nhỏ, bài ngắn, có tách hiệu ứng mô hình; (2) **thứ CCoding có mà CAID không có** là thời gian theo pha và số cache, nên "chi phí cố định của điều phối" định lượng được ở CCoding mà CAID chỉ suy ra từ tổng; (3) "tiền tố ổn định giữ cache" đã được Lumer và cộng sự đo cho một agent tìm kiếm web; CCoding chỉ khác ở bối cảnh (coding, nhiều agent, runtime `claude-cli`), và Lumer và cộng sự **không** đo sub-agent hay tác vụ lập trình (§2.3 chỉ nêu Claude Code/Cursor làm nền). Phần Phụ lục C (kiểm định ý nghĩa) và D (ca lỗi) của CAID **không** có trong nội dung đã đọc nên chưa nói được CAID có kiểm định hay không.

**Cognition 2026 (Yan, 22/4/2026, "Multi-Agents: What's Actually Working", https://cognition.com/blog/multi-agents-working — đã đọc):** giữ ghi **đơn luồng**, "Our original observations still hold today for parallel-writer swarms"; review ngữ cảnh sạch (Devin Review "catches an average of 2 bugs per PR", ~58 % nghiêm trọng, không có phương pháp đo). Là nhận định thực hành của nhà cung cấp, không phải bằng chứng thực nghiệm có kiểm soát.

**Hệ quả cho định hướng bài (suy luận của S5, không phải phát hiện có trích dẫn):**
1. Khung bài nên là **"đo chi phí–thời gian–cache của một hệ coding multi-agent so với đơn agent, kèm bài học vận hành"**, đặt cạnh CAID (kết quả tương tự: chi phí cao hơn, thời gian không giảm đáng kể) — hoặc ghi rõ chỗ CCoding khác nếu số liệu của S2 cho kết quả khác. Không được kết luận trước về hướng kết quả.
2. Bài về tự cải thiện (N4) chỉ nên tách thành đề tài riêng khi có bằng chứng định lượng trước/sau bản vá; hiện chưa có.
3. Phải trích CAID và TeamBench ở phần mở đầu và thảo luận (đề bài yêu cầu so sánh); ghi rõ hai phiên bản số liệu CAID (26,7/14,3 so với 25,6/14,7) khi trích.

### K.4 Việc còn thiếu trước khi nộp

- Chạy `search_papers` (OpenAlex) khi có công cụ: đếm trích dẫn, tra xuôi/ngược tới CAID, TeamBench, MAST, Don't Build Multi-Agents; tìm riêng chủ đề routing/adaptive compute (N3) và quản trị dữ liệu trong agent (N6).
- Đọc toàn văn tối thiểu: ~~CAID (phần chưa đọc 34.699 ký tự cuối), Don't Break the Cache~~ **(đã đọc ở v2, `references-v2.md` §2)**; còn lại EvoMAC (cơ chế phản hồi), AgentCoder, TeamBench (mới đọc abstract); CAID Phụ lục C–D.
- ~~Điền đủ tác giả APA cho các mục ghi "et al." và tác giả AgentDojo; xác minh venue…~~ **Đã làm ở v2 (`references-v2.md`)**; venue gắn nhãn [V-thứ cấp]/[V-BRIEF] cần mở trang chính trước khi nộp.
- ~~Mở bài Cognition 2026 từ nguồn gốc~~ **Đã đọc ở v2** (`references-v2.md` §3). Mục APA trong các mục §2–B của tệp này vẫn là bản v1 ("et al."); **bản dùng để trích là `references-v2.md`**.
