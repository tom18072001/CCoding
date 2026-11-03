# Hệ thống multi-agent CCoding cho lập trình: thiết kế, giới hạn sub-agent và đo chi phí–thời gian–cache so với một coding agent đơn

> **Bản thảo v0.4 (3/11/2026) — Phòng Nghiên cứu, nhiệm vụ T-20261103-150407-7a3 (vòng 4 gói 4: đưa nghiên cứu đăng ký trước W1–W5 vào §5–§9 và Tóm tắt; bản trước v0.3 ngày 2/11/2026 chỉ có vòng thăm dò C1–C8).** Chuẩn trích dẫn APA 7, dạng (Tác giả, năm). Phân loại dữ liệu: nội bộ; dự án ứng dụng thật được ẩn danh.
> **Bản đã đối chiếu:** `bench/vs-claude/results/study-cloud-final/` và `docs/research/analysis/` (nghiên cứu đăng ký trước, §5.1, §6.1); `docs/research/BRIEF-2.md`; `performance/token-analysis.md` (bảng T-0…T-i, 12 bảng; dữ liệu `bench/vs-claude/results/` C1–C7 lấy từ nhánh `perf/vs-claude-loop`, commit thêm C7 là `7fa6305`; hash nguồn ghi ở đầu `token-analysis.md`); `references-v2.md` (S2); `challenges.md` (C-01…C-49, L1–L15); `self-improvement/design.md` v1.0; `related-work.md` (mục K.3 đã cập nhật v2, mục "Kết luận điểm mới").
> **Quy ước số liệu:** §6.1 là nghiên cứu đăng ký trước W1–W5; mỗi số ghi kèm tệp và bảng nguồn, cùng nhãn **[Xác nhận]** (phép thử đăng ký trước) hoặc **[Mô tả]**/**[Phân tích phụ]** (không có kiểm định giả thuyết). Số hiệu năng của vòng thăm dò C1–C7 (§6.2: thời gian, chi phí, token, cache, tỉ lệ, p hoán vị) lấy nguyên từ bảng T-a…T-i của `token-analysis.md`; mỗi bảng ghi tên bảng nguồn (T-x) và lệnh tái lập. Số đếm thách thức và tham số cấu hình lấy từ `challenges.md`. **Chỉ các số hiệu năng của vòng thăm dò C1–C8 là minh họa** (n nhỏ, không hiệu chỉnh so sánh bội).
> **Nhãn nguồn:** CAID, *Don't Break the Cache* và Cognition 2026 đã đọc toàn văn trang lấy được (`references-v2.md` §2–§3); phần lớn nguồn còn lại chỉ đọc tóm tắt (xem mục 3); khẳng định về nguồn đó chỉ ở mức tóm tắt.

---

## 1. Tóm tắt

**Tóm tắt (VI).** **Kết luận chính là âm tính.** Trong nghiên cứu đăng ký trước W1–W5 (440 khóa hoàn tất, 7 arm, không lượt nào chạm hạn mức), giả thuyết tương đương B-01 (biên ±15 % so với Claude Code chạy một mình bằng Sonnet, gọi là A0-sonnet) **bị bác bỏ cho cả làn đơn B7 và làn nhanh B6** của CCoding. Trên 5 bài T5, B7 tốn token có trọng số bằng 2,498 lần A0-sonnet (CI 90 % [2,02; 3,18]) và thời gian bằng 2,566 lần [2,09; 3,25]. B6 tốn 3,921 lần [3,49; 4,43] và 4,047 lần [3,45; 4,76]. Bảy phép, gồm phép chính và các phép độ nhạy, cho cùng kết luận. Họ Holm của các giả thuyết thứ cấp rỗng (K = 0): H3 đủ N nhưng suy biến, H6 và H7 chưa đủ N, nên không giả thuyết nào được xác nhận. Ở mức mô tả trên 13 bài R13, với các arm chạy khác cửa sổ, mọi arm CCoding đắt hơn A0-sonnet, từ ×1,61 token (một agent `senior-swe`, B5) đến ×6,58 (đủ phòng, B0). Claude Code kèm prompt lập kế hoạch và tự review (A1) không khác A0-sonnet về token (×0,96 [0,83; 1,10]). Điểm chất lượng gần như chạm trần: A0-sonnet 0,979, các arm CCoding 0,984–1,000. Vì vậy bộ đo chủ yếu phân biệt chi phí và thời gian, không phải chất lượng. Phân tích phụ cho thấy pha nghiệm thu (accept) chiếm 47,7 % phần chênh token của làn đơn trên T5; cận dưới là 14,5 % khi đổi thứ tự quy phần. Token đầu ra là thành phần lớn nhất. Đổi hệ số đọc cache từ 0,1 sang 0,05 chỉ làm tỉ số thay đổi ≤ 4,0 %. Judge LLM và regex khớp nhau với Accuracy 0,940 nhưng κ chỉ 0,255; đây là nghịch lý κ, PABAK là 0,881. Cổng chất lượng B-02 chặn đúng 1/1 lượt lỗi và không chặn nhầm lượt nào trong 50 lượt không lỗi, nhưng **recall chưa ước lượng được**. Bài cũng mô tả kiến trúc CCoding (pha route → plan → discuss → finalize → execute → review → revise → synthesize, worktree con song song có tự gộp, review độc lập, nhiều runtime) và 15 cơ chế giới hạn sub-agent. Bài trình bày nhật ký 49 thách thức phân theo MAST; κ giữa hai agent gán nhãn cùng họ mô hình là 0,673, không phải κ người–người. Cuối cùng là một thiết kế tự cải thiện có người duyệt, chưa đo hiệu quả. Các vòng C1–C8 trước đăng ký chỉ là vòng thăm dò. Hàm ý thiết kế: việc nhỏ nên dùng agent đơn. Lợi ích của multi-agent ở việc lớn vẫn là giả thuyết, vì hai bài lớn (l1-modules, l2-chain) đã có `task.json` từ 3/11 nhưng chưa được đo. Hướng kết quả trùng với CAID. Đóng góp có thể bảo vệ là phép đo đăng ký trước về chi phí, thời gian và cache, phân rã theo pha, ở mức chắc chắn trung bình.

**Từ khóa:** hệ đa agent; coding agent; nghiên cứu đăng ký trước; kiểm định tương đương (TOST); worktree song song; prompt caching; giới hạn sub-agent; MAST.

**Abstract (EN).** **The main result is negative.** In a preregistered study over windows W1–W5 (440 completed keys, 7 arms, no run hit a rate limit), the equivalence hypothesis B-01 (±15 % margin against Claude Code running alone with Sonnet, called A0-sonnet) **was rejected for both CCoding's single lane B7 and its fast lane B6**. On the 5 tasks of T5, B7 used 2.498 times A0-sonnet's weighted tokens (90 % CI [2.02; 3.18]) and 2.566 times its wall time [2.09; 3.25]. B6 used 3.921 times [3.49; 4.43] and 4.047 times [3.45; 4.76]. All seven tests, the primary test and the sensitivity tests, gave the same verdict. The Holm family of secondary hypotheses is empty (K = 0): H3 reached its N but is degenerate, and H6 and H7 lack N, so no hypothesis is confirmed. Descriptively, on the 13 tasks of R13 with arms run in different windows, every CCoding arm cost more than A0-sonnet, from ×1.61 tokens (one `senior-swe` agent, B5) to ×6.58 (full office, B0). Claude Code with a planning and self-review prompt (A1) did not differ from A0-sonnet in tokens (×0.96 [0.83; 1.10]). Quality scores were almost at ceiling: A0-sonnet 0.979, CCoding arms 0.984–1.000. The study therefore discriminates mainly on cost and time, not quality. Secondary analyses show that the acceptance phase accounts for 47.7 % of the single lane's token gap on T5; the lower bound is 14.5 % when the attribution order is changed. Output tokens are the largest component. Changing the cache-read weight from 0.1 to 0.05 changes the ratios by ≤ 4.0 %. An LLM judge and a regex grader agree with accuracy 0.940 but κ only 0.255; this is the kappa paradox, and PABAK is 0.881. The B-02 quality gate blocked 1/1 faulty run and wrongly blocked none of 50 non-faulty runs, but **its recall cannot yet be estimated**. We also describe CCoding's architecture (route → plan → discuss → finalize → execute → review → revise → synthesize phases, parallel child worktrees with automatic merging, independent review, multiple runtimes) and 15 mechanisms that constrain sub-agents. We report a log of 49 challenges classified with MAST; κ between two labelling agents from the same model family is 0.673, which is not a human–human κ. Last is a design for a human-approved self-improvement loop, with no effect measured. Rounds C1–C8, which predate the preregistration, are exploratory only. Design implication: small tasks should use a single agent. Any benefit of multi-agent orchestration on large tasks remains a hypothesis, because the task set has no large tasks yet. The direction of the result matches CAID. The defensible contribution is a preregistered measurement of cost, time and cache, decomposed by phase, with medium confidence.

**Keywords:** multi-agent systems; coding agents; preregistration; equivalence testing (TOST); parallel worktrees; prompt caching; sub-agent constraints; MAST.

---

## 2. Giới thiệu

**Bối cảnh và vấn đề.** Các hệ nhiều agent LLM được kỳ vọng chia nhỏ công việc lập trình để làm song song và kiểm tra chéo, nhưng bằng chứng về lợi ích thực tế còn tranh cãi. Anthropic báo cáo hệ nghiên cứu đa agent vượt đơn agent Opus 4 ở mức 90,2% trên đánh giá nội bộ, đồng thời thừa nhận đa agent dùng gấp khoảng 15 lần token của chat và rằng hầu hết tác vụ lập trình có ít phần song song hơn nghiên cứu (Hadfield et al., 2025). Cognition lập luận ngược lại: các hành động mang quyết định ngầm và những quyết định xung đột cho kết quả xấu, nên khuyến nghị agent tuyến tính một luồng (Yan, 2025). Kapoor et al. (2025) nhắc rằng đánh giá agent chỉ nhìn độ chính xác mà bỏ qua chi phí là chưa đủ. Cemri et al. (2025) cho thấy lỗi hệ đa agent chủ yếu đến từ thiết kế và lệch phối hợp, không chỉ từ mô hình.

**Câu hỏi nghiên cứu.** Bài trả lời năm câu hỏi (RQ6 — công bố — được xử lý ở mục 3 và mục 7.3):

- **RQ1.** Hệ CCoding được thiết kế và điều phối như thế nào?
- **RQ2.** Chủ dự án giới hạn sub-agent bằng những cơ chế nào, và có bằng chứng hiệu quả gì?
- **RQ3.** CCoding so với một coding agent đơn về thời gian, token (vào/ra) và cache; khi nào multi-agent nhanh hơn; có tối ưu nào đáng làm?
- **RQ4.** Những thách thức và lỗi nào đã gặp, giải quyết ra sao, còn gì mở?
- **RQ5.** Làm thế nào để sub-agent tự cải thiện mỗi khi có vấn đề mà vẫn an toàn?

**Đóng góp (khai báo thận trọng).** (1) Mô tả một hệ multi-agent vận hành thật cùng các cơ chế giới hạn sub-agent (mục 4). (2) Một phép đo cache, token và thời gian theo pha so với Claude Code thuần, kèm kết quả âm tính và một vòng đối chứng cùng mô hình (C7) tách hiệu ứng mô hình khỏi hiệu ứng điều phối (mục 6). (3) Nhật ký 49 thách thức phân loại theo MAST và hạ tầng (mục 7.1). (4) Một thiết kế vòng tự cải thiện có người duyệt, kèm bốn bản vá prompt là giả thuyết (mục 7.2). **Chúng tôi không nhận các ý tưởng kiến trúc sau là mới:** worktree riêng cho từng engineer có tự gộp và kiểm chứng bằng test (Geng & Neubig, 2026), tách quyền theo vai kèm verifier (Kim et al., 2026; Huang et al., 2024), quy trình cố định đơn giản (Xia et al., 2025), vòng phê bình–sửa (Madaan et al., 2023; Shinn et al., 2023), và tiền tố prompt ổn định để giữ cache (Lumer et al., 2026). Kết quả cốt lõi của bài về chi phí và thời gian cũng **không mới về hướng**: CAID đã báo đa agent đắt hơn và thời gian không giảm đáng kể (Geng & Neubig, 2026); phần bài thêm là phép tách mô hình và số đo chi phí cố định theo pha.

**Cấu trúc bài.** Mục 3 công trình liên quan; mục 4 hệ thống (RQ1–RQ2); mục 5 phương pháp đánh giá; mục 6 kết quả (RQ3); mục 7 thảo luận (RQ4–RQ5 và vị trí so với công bố); mục 8 đe dọa tính hiệu lực; mục 9 kết luận; mục 10 tài liệu tham khảo; cuối bài là khai báo dùng AI.

---

## 3. Công trình liên quan

Mục này tóm tắt `related-work.md` (31 nguồn, K.3 đã cập nhật v2). **Giới hạn mức đọc (cập nhật v2):** CAID, *Don't Break the Cache* và Cognition 2026 đã đọc toàn văn trang lấy được (CAID: không có Phụ lục C và D trong nội dung trang; `references-v2.md` §2–§3); các nguồn còn lại giữ mức đọc của v1, đa số chỉ đọc tóm tắt. Mọi số của nguồn khác là số tự báo cáo, không so sánh chéo giữa các bài.

**Khung đa agent và coding agent.** MetaGPT dùng quy trình chuẩn (SOP) làm prompt cho các agent theo vai (Hong et al., 2024); AutoGen cung cấp khung hội thoại đa agent (Wu et al., 2024). SWE-agent chứng minh thiết kế giao diện agent–máy tính là biến quan trọng (J. Yang et al., 2024); OpenHands là nền tảng mở có sandbox và tích hợp benchmark (Wang et al., 2025). Agentless thay agent tự do bằng quy trình cố định định vị → sửa, báo cáo chi phí thấp (Xia et al., 2025). AgentCoder tách người thiết kế test khỏi người viết mã (Huang et al., 2024).

**Hai công bố gần nhất (2026).** CAID (Geng & Neubig, 2026) dùng manager lập kế hoạch có phụ thuộc, mỗi engineer một git worktree, tích hợp bằng `git merge` và kiểm chứng bằng test. Tác giả báo cáo điểm cao hơn nhưng **thời gian không giảm đáng kể và chi phí cao hơn** (PaperBench, Claude Sonnet 4.5: đơn agent 57,2 điểm/1803,5/3,3; CAID 63,3/2080,4/9,3; đơn vị runtime và chi phí không được ghi nhãn trong bảng — theo văn bản, runtime tính bằng giây). Sau khi đọc toàn văn (`references-v2.md` §2.1): ở cả 6 hàng của Bảng 2 (3 mô hình × 2 benchmark) CAID chậm hơn và đắt hơn đơn agent; CAID chỉ báo tổng thời gian chứ không theo pha, và không đo cache hay token. *Lưu ý phiên bản:* mức tăng điểm tuyệt đối là +26,7/+14,3 ở bản HTML v1 nhưng +25,6/+14,7 ở trang tóm tắt hiện hành; chúng tôi chỉ trích số của bảng. TeamBench (Kim et al., 2026) tách Planner/Executor/Verifier bằng quyền hệ điều hành; đội chỉ-prompt và đội cưỡng chế bằng sandbox có tỉ lệ đạt không khác biệt có ý nghĩa thống kê, nhưng verifier chấp nhận khoảng 49% bài nộp mà bộ chấm xác định loại, và giá trị của đội phụ thuộc độ khó nền.

**Tranh luận multi vs single.** Hadfield et al. (2025) ủng hộ song song cho truy vấn rộng nhưng thừa nhận mã ít song song; Yan (2025) chống song song ghi. CCoding đặt giữa hai quan điểm: song song hạng mục độc lập nhưng có gộp và review. Bài tiếp theo của Cognition (Yan, 2026) nêu rằng quan sát ban đầu về nhóm agent cùng ghi song song vẫn đúng, cấu hình hiệu quả giữ ghi đơn luồng, và review với ngữ cảnh sạch bắt lỗi tốt hơn; bài không nêu phương pháp đo, nên chúng tôi chỉ dùng như ý kiến thực hành, không như bằng chứng thực nghiệm (`references-v2.md` §3).

**Phân tích lỗi và đánh giá.** MAST xếp 14 kiểu lỗi hệ đa agent vào ba nhóm — đặc tả/thiết kế, lệch phối hợp, kiểm chứng/kết thúc — dựa trên hơn 1.600 vết (Cemri et al., 2025); chúng tôi dùng tên 14 kiểu lỗi theo bản v3 (Mục 4) và gán nhãn theo sổ mã `analysis/mast-codebook.md`. Kapoor et al. (2025) đề xuất tối ưu chung chi phí–độ chính xác và cảnh báo holdout yếu.

**Token, cache và giao tiếp.** AgentPrune cắt thông điệp dư giữa agent để giảm token (Zhang et al., 2025); Optima huấn luyện mô hình nhỏ để cân bằng hiệu quả tác vụ và token (Chen et al., 2025). Lumer et al. (2026) đo prompt caching trên tác vụ nghiên cứu web một agent ở ba nhà cung cấp (giảm chi phí API 41–80%) và khuyến nghị đặt nội dung động ở cuối prompt; đây là cùng ý với đề xuất O1 của chúng tôi, **nhưng không phải coding multi-agent**: bài chỉ đo một agent nghiên cứu web, không có sub-agent, không có tác vụ lập trình, không đo theo pha và không so với Claude Code thuần (`references-v2.md` §2.2).

**Tự cải thiện prompt/agent.** Self-Refine (Madaan et al., 2023) và Reflexion (Shinn et al., 2023) cải thiện trong một tác vụ nhờ phản hồi ngôn ngữ; DSPy (Khattab et al., 2024), OPRO (C. Yang et al., 2024) và TextGrad (Yuksekgonul et al., 2025) tối ưu prompt/pipeline theo một hàm điểm; EvoMAC tiến hoá mạng agent phần mềm theo phản hồi kiểm thử trong từng tác vụ (Hu et al., 2025); Experiential Co-Learning tái dùng kinh nghiệm quá khứ (Qian et al., 2024). Các phương pháp này tự động và cần hàm điểm rẻ hoặc nhiều mẫu.

**An toàn và quyền.** ToolEmu đo rủi ro khi agent có công cụ nhưng không đề xuất cơ chế chặn lúc chạy (Ruan et al., 2024); TeamBench cưỡng chế tách quyền bằng hệ điều hành (Kim et al., 2026).

**Vị trí của bài (từ mục "Kết luận điểm mới", mức chắc chắn kèm theo).** *Đã có — không nhận là mới:* E1 worktree + gộp + test (CAID); E2 tách quyền/verifier (TeamBench, AgentCoder); E3 vòng phê bình–sửa; E7 tiền tố ổn định (Lumer et al., 2026); E8 quy trình cố định (Agentless); E10 phân loại lỗi theo MAST. *Có thể mới:* N1 đo cache/token/thời gian theo lượt gọi và pha so với Claude Code thuần (**trung bình**); N5 nhật ký thách thức từ hệ vận hành thật (**trung bình**); N3 làn nhanh/làn đầy (**trung bình–thấp**, chưa tìm riêng chủ đề routing; và C7 cho thấy làn nhanh chưa nhanh hơn một agent cùng mô hình, mục 6.2.3, nên N3 là mô tả thiết kế chứ chưa phải lợi ích đã chứng minh); N2 đo tách O1–O6 (**thấp–trung bình**, hiện chỉ ước lượng); N4 vòng tự cải thiện có người duyệt (**thấp–trung bình**, chưa có số đo); N6 quản trị dữ liệu trong hệ coding (**thấp**, đặc điểm hệ thống hơn là kết quả). Các mức này nghĩa là "chưa thấy trong phần đã đọc", **không phải "chưa ai làm"**.

---

## 4. Hệ thống (RQ1–RQ2)

### 4.1 Kiến trúc và pha điều phối (RQ1)

CCoding là ứng dụng TypeScript/Node có máy chủ REST + SSE cục bộ, giao diện web thuần và nhiều runtime (`claude-cli`, `codex-cli`, `kimi-cli`, `anthropic-api`, `openai-api`, `mock`) (`docs/ARCHITECTURE.md`). Tổ chức theo phòng ban (ví dụ Phòng Phát triển, Phòng Nghiên cứu); mỗi agent có hồ sơ vị trí (`agents/<phòng>/<id>.md`) gồm sứ mệnh, trách nhiệm, quy trình và giới hạn. Mỗi agent chỉ chạy một lượt tại một thời điểm. Mọi lượt gọi LLM đi qua một điểm duy nhất (`Orchestrator.call()`) để ghi log, đếm token và áp chính sách dữ liệu.

Vòng đời một nhiệm vụ (đầy đủ — "làn đầy"):

| Pha | Việc | Công cụ cho agent |
|---|---|---|
| route | Chọn phòng ban/liên phòng (JSON) | không |
| plan | Trưởng phòng lập kế hoạch: hạng mục, người nhận, phụ thuộc (DAG) | chỉ đọc |
| discuss | Họp ngắn (≤ 120 từ mỗi người) | không |
| finalize | Chốt kế hoạch và quyết định (hợp đồng giữa các hạng mục) | chỉ đọc |
| execute | Thành viên thực thi hạng mục, song song theo DAG tới `maxParallel` | theo quyền dự án |
| review | Reviewer độc lập (JSON duyệt/vấn đề); CCoding tự chạy lệnh kiểm tra | đọc + chạy lệnh |
| revise | Sửa theo vấn đề `major/blocker` (tối đa `maxRevisions`) | theo quyền dự án |
| synthesize | Trưởng phòng tổng hợp báo cáo | chỉ đọc |

**Chiến lược điều phối chính.**

1. *Kế hoạch theo năng lực công cụ.* Trưởng phòng thấy roster ghi quyền công cụ của từng người và quy tắc giao theo năng lực, sau sự cố giao việc cần shell cho người chỉ có công cụ đọc (thách thức C-04 trong `challenges.md`).
2. *Worktree con song song + tự gộp + giải xung đột.* Mỗi hạng mục có ghi tệp hoặc chạy lệnh có worktree con riêng tách từ nhánh nhiệm vụ (hạng mục chỉ đọc chạy trong worktree chính; `tools.parallelWorktrees`); CCoding tự gộp `--no-ff` (kèm `--no-verify`, nên hook git của repo không chạy khi gộp); xung đột được giải trong một worktree con mới (`tools.resolveRounds` = 2, rồi dự phòng tuần tự); phụ thuộc thư viện được cài lại khi tệp khai báo đổi (C-16 – C-19). Ý tưởng worktree-per-engineer đã có ở CAID (Geng & Neubig, 2026); chúng tôi cài đặt độc lập.
3. *Review độc lập + đo của hệ thống.* Reviewer là một vai trò riêng của phòng (`dept.reviewer`); ở làn nhanh, hạng mục giao cho reviewer được chuyển thành trọng tâm review, còn ở làn đầy hệ thống chưa cấm cơ học việc giao hạng mục cho reviewer; CCoding tự chạy `setupCommands`/`checkCommands` ở baseline, sau thực thi và sau mỗi vòng sửa; hồi quy so với baseline thì không duyệt dù reviewer ghi duyệt; chạy lại khi workspace đổi sau lần đo gần nhất (C-27, C-28).
4. *Làn nhanh và làn đầy.* Việc nhỏ đi làn nhanh: bỏ họp, kế hoạch được định hình lại (`shapeFastPlan`), `maxParallel` nâng bằng số hạng mục độc lập (tối đa 4) (C-12); làn nhanh lập kế hoạch bằng Sonnet (thay Opus của hồ sơ trưởng phòng), bỏ họp và chốt (không có discuss, finalize), và dựng báo cáo cuối từ mẫu mà không gọi LLM (T-e0, T-e). Việc lớn đi làn đầy.
5. *Chuẩn bị song song.* Lệnh chuẩn bị + baseline chạy song song với lập kế hoạch (C-10).

### 4.2 Cơ chế giới hạn sub-agent (RQ2)

Chủ dự án giới hạn sub-agent theo bốn chiều: *cái gì được làm* (quyền), *bao nhiêu* (ngân sách, số hạng mục, vòng sửa), *ở đâu* (thư mục làm việc, nhánh, nhãn dữ liệu) và *khi nào dừng* (giới hạn khảo sát, thời gian). Bảng 1 tóm tắt 15 cơ chế (L1–L15 trong `challenges.md` §2, nơi có chi tiết và nguồn); cột "Áp cho runtime" nói giới hạn có hiệu lực với runtime nào (kiểm theo mã, `dev-review/technical-check.md`), và cột cuối chỉ nêu bằng chứng hiệu quả đã có hay "chưa đo". **Lưu ý cho đọc kết quả benchtest:** toàn bộ benchtest chạy trên runtime `claude-cli`; trần vòng công cụ (`toolTurns`), ngân sách đầu vào công cụ (`toolInputBudget`), nhắc ghi ở 35%/65%, hủy khi treo (`idleTimeoutMs`) và chạy tiếp `maxContinuations` **không áp cho `claude-cli`** (chỉ vòng công cụ của runtime API đọc chúng; `claude-cli` không truyền `--max-turns` và không báo chạm trần). Với `claude-cli`, mỗi lượt gọi chỉ chịu `timeoutMs`, hook `claude-guard`, danh sách công cụ và kiểm ngân sách token cấp nhiệm vụ/hạng mục trước lượt gọi; KPI `capHits` luôn bằng 0.

**Bảng 1.** Cơ chế giới hạn sub-agent. Nguồn: `challenges.md` §2 (không phải bảng S2), đối chiếu `technical-check.md`; tham số theo `src/config.ts` mặc định, có thể bị cấu hình cục bộ ghi đè.

| # | Cơ chế | Giới hạn cụ thể | Áp cho runtime | Bằng chứng hiệu quả |
|---|---|---|---|---|
| L1 | Quyền công cụ 4 mức | `none · read · write · exec` = giao của hồ sơ agent, quyền dự án và pha | Mọi runtime (qua `cliTools`; `claude-cli` có `--allowedTools`) | Gián tiếp; chưa có đối chứng trước/sau |
| L2 | Hook `claude-guard` — lệnh | Chặn lệnh cấm (30 mẫu), `git push`, `reset --hard`, đổi nhánh, rebase, `.env` | `claude-cli` (hook) | Một lượt thử chặn đúng một lần; số chặn đúng/nhầm toàn bộ: chưa đo |
| L3 | Hook — đường dẫn | Công cụ tệp chỉ trong thư mục làm việc; lệnh shell chặn đường dẫn tuyệt đối ngoài thư mục làm việc **trừ thư mục tạm và thư mục cài đặt hệ thống**, và `../` vượt gốc | `claude-cli` (hook) | Kiểm theo mẫu chuỗi, **không phải sandbox hệ điều hành**; chưa kiểm thử đối kháng |
| L4 | Hook — nhánh/worktree | Không tạo/chuyển/xóa nhánh; chỉ `git merge` vào nhánh hiện tại | `claude-cli` (hook) | Sự cố nhầm nhánh không ghi lại sau khi sửa; thống kê đầy đủ: chưa đo |
| L5 | Hook — stdin | Bọc lệnh Bash với `</dev/null` | Chỉ `claude-cli` | Trước: một lượt treo 579 s (T-a, C5 t3 lượt 1); sau: không tái diễn ở hai bài tiếp (n nhỏ — minh họa) |
| L6 | Giới hạn khảo sát | `readsBeforeWrite` = 16 (nhắc), chặn từ 32, chỉ ở pha thực thi/sửa; nhắc ghi ở 35%/65% ngân sách công cụ | `readsBeforeWrite`: `claude-cli` (hook); nhắc 35%/65%: **chỉ runtime API, không áp cho `claude-cli`** | Nền: 48–70 lần đọc trước lần ghi đầu; hiệu quả sau: chưa đo |
| L7 | Ngân sách token | `budgetTokens` 1.500.000 (kiểm trước mỗi lượt gọi); ngân sách hạng mục mặc định max(100k; 2 × ngân sách nhiệm vụ / số hạng mục), cảnh báo khi vượt và dừng nếu ở chế độ `pause`; ngân sách đầu vào theo vòng công cụ (`toolInputBudget`) thực thi 800k · sửa 300k · review 200k · kế hoạch 100k. Các hằng số 60k/120k/200k/300k theo mức quyền (none/read/write/exec) chỉ dùng để **ước lượng** token của kế hoạch (`estimate.perSubtask`), không phải ngân sách | Ngân sách nhiệm vụ/hạng mục: mọi runtime; `toolInputBudget`: **chỉ runtime API, không áp cho `claude-cli`** | Không có đối chứng; gói dài vẫn tốn nhiều token |
| L8 | Ngân sách thời gian/lượt | `timeoutMs` 30 phút; `toolTurns` 40/16/10; hủy khi treo 5 phút (`idleTimeoutMs`) | `timeoutMs`: mọi runtime (với `claude-cli` là trần tiến trình); `toolTurns`, `idleTimeoutMs`: **chỉ runtime API, không áp cho `claude-cli`** | Từng sự cố có bằng chứng riêng; tỉ lệ chạm trần: chưa đo (với `claude-cli` không đo được vì không có trần) |
| L9 | Số hạng mục / lần chạy | `maxContinuations` 2 (chạy tiếp khi runtime báo chạm trần vòng công cụ); cảnh báo hạng mục chạy lần 3, 5…; prompt làn nhanh *yêu cầu* 2–4 hạng mục độc lập (ràng buộc mềm, mã không cưỡng chế) | `maxContinuations`: **chỉ runtime API; với `claude-cli` cơ chế không kích hoạt** | Chưa có thống kê |
| L10 | Vòng sửa | `maxRevisions` 1 | Mọi runtime | Dự án ứng dụng: 5/7 gói cần đúng 1 vòng (định tính) |
| L11 | `maxParallel` | Mặc định 3; làn nhanh tối đa 4; mỗi agent một hạng mục một lúc | Mọi runtime (điều phối) | Sau sửa (`d7600f6`, C6, n = 2 mỗi ô): thời gian TB CCoding / Claude Code Opus = 0,76 (t3), 0,67 (t5); 87/87 và 146/146 test ẩn mọi lượt; chi phí +5,6% / +21,1% (Bảng 3b; hai hệ chạy cùng lúc, mô hình khác nhau; chưa có đối chứng trước/sau cùng bài). Khi so với Claude Code cùng Sonnet (C7), t5 chỉ hòa (tỉ lệ 1,00 gộp C5–C7; Bảng 3c) |
| L12 | Cách ly cấu hình người dùng | `--strict-mcp-config --setting-sources project,local`; `--no-session-persistence`; bỏ biến khóa khỏi môi trường | Chỉ `claude-cli` | Ngữ cảnh mỗi lượt 93k → 7,6k token (ghi chú của nhà phát triển trong mã, số đo đơn lẻ, chưa lặp lại) |
| L13 | Data Protection Gate | Nhãn dữ liệu quyết định runtime được phép (mặc định: Công khai/Nội bộ mọi runtime; Bảo mật/Hạn chế chỉ `local`); che PII/bí mật trong log; nhật ký chuỗi băm | Mọi runtime | Cấu hình có thật; số lần chặn đúng: chưa đo |
| L14 | KPI | 4 nhóm (Chất lượng 40 · Hiệu quả 25 · Tin cậy 20 · Tuân thủ 15); "việc cần sửa" tự sinh | Mọi runtime (`capHits` chỉ có nghĩa với runtime API) | Phát hiện lỗi đo KPI → sửa; tác động lên hành vi lượt sau: chưa đo |
| L15 | Review độc lập + lệnh kiểm tra tự chạy | Hồi quy ⇒ không duyệt; reviewer có quyền chạy lệnh mà không chạy lệnh kiểm tra nào thì bị ghi log `review.unverified` và cảnh báo trong báo cáo (cờ "cần xem" chỉ bật khi review chưa duyệt hoặc lệnh kiểm tra còn lỗi) | Mọi runtime | Bắt lỗi thật ở một dự án (định tính); tỉ lệ bắt/dương tính giả: chưa đo |

**Nhận xét.** Phần lớn cơ chế được thêm *sau* một sự cố cụ thể (cột "Thách thức liên quan" trong `challenges.md`); với đa số, chúng tôi chưa có phép đo trước/sau có đối chứng. Vì vậy mục này mô tả cơ chế và bằng chứng sự cố, **không khẳng định hiệu quả định lượng**. Hai giới hạn nên nói thẳng: hook chỉ kiểm theo mẫu chuỗi (không thay sandbox HĐH), và ngân sách token không ngăn được chi phí cao khi chuỗi phụ thuộc dài.

### 4.3 Trạng thái hiện hành sau khi gộp `main`

Mục 4.1–4.2 mô tả luồng điều phối và cơ chế giới hạn như các máy chủ đo đã chạy. Mục này mô tả CCoding sau khi nhánh nghiên cứu nhận 16 commit mới của `main` (khoảng `e0bd2f4..9e6079b`) bằng một merge commit `37f88b6`, không rebase, không đẩy lên `main` (`merge-main-2026-11-03.md` §1, Phụ lục A). Mọi ý dưới đây trích về mục của tài liệu đó.

**(a) Phần có trên `main` (mới so với bản mô tả trước).**

1. *KPI v2 và bộ probe* (§3.2, §3.6). KPI v2 thêm `computeKpi`, `verificationClaim`, `checksOutcome`, `checksByDept`, `runtimeLimits`. Chỉ số Trung thực chỉ tính khẳng định có lệnh kiểm chứng thành công; hiệu chỉnh reviewer theo kết luận gốc `run.review.reviewerApproved`; bỏ dòng ma `agent@?` và không đếm trùng bằng chứng. Các hàm này chỉ đọc dữ liệu đã có, không đổi token hay kết quả nhiệm vụ; số KPI từ lần chạy cũ khác khi tính lại bằng v2, nên không so trực tiếp trước và sau gộp. Bộ probe (`bench/agent-probes/`) chạy mã do model sinh trong sandbox trên Ollama, nằm ngoài đường chạy của `bench/vs-claude/`.
2. *Thứ tự ghi `reviewerApproved`* (§2, §4 mục 6). Nhánh nghiên cứu ép `review.approved=false` khi còn vấn đề lạc hướng; `main` ghi `reviewerApproved` từ kết luận gốc. Merge giữ cả hai phía và đặt `reviewerApproved` trước khối ép, vì nếu đặt sau thì KPI đọc giá trị đã bị ép và chấm sai reviewer.
3. *Lộ trình REA* (Phụ lục A): KPI cạnh agent, Kanban, ngân sách, agent ngoài. Kèm backlog, kéo thả Kanban và đổi người phụ trách, dự án, ưu tiên, tiêu đề tại chỗ khi nhiệm vụ chưa chạy; không bao giờ hạ nhãn dữ liệu (§3.5).
4. *Ngân sách và trần token theo dự án/agent* (§3.3). Lớp chính sách cộng dồn nhiều nhiệm vụ trong một kỳ (ngày, tháng, toàn bộ), có ngưỡng mềm (cảnh báo) và trần cứng (tạm dừng, `pause.reason='budget'`), lưu ở `data/budgets.json`, kiểm trước mỗi lượt gọi model. Lớp này tách khỏi ngân sách từng nhiệm vụ (`budgetTokens` mặc định 1.500.000, `toolInputBudget`), vốn không đổi. Mặc định không có chính sách; nếu tệp còn chính sách cũ, lượt đo có thể bị dừng giữa chừng, nên cần xác nhận tệp rỗng trước mỗi lần đo.
5. *Agent ngoài* (§3.4). Runtime `external` chạy qua tiến trình (stdin/stdout JSON) hoặc HTTP, chỉ được tạo khi cấu hình khai báo; `api.ts` ghi thêm `maxPromptTokens` và `cli-agents.ts` đặt `toolsTracked: false` cho Codex CLI và Kimi CLI. Tác động của sửa đổi trong `api.ts` tới vòng gọi công cụ **chưa rõ** (chưa có lần chạy xác nhận).
6. *Giao diện v2* (§3.6): Kanban và KPI cạnh agent trong `public/*`, không nằm trên đường chạy của `bench/vs-claude/`.

Theo diff, `main` không sửa pha, model mặc định, prompt, hook và cờ của `claude -p` (§3.1), nên luồng điều phối của 4.1–4.2 giữ nguyên. Đây là kết luận từ diff, chưa có lần đo sau gộp xác nhận (§4, đoạn cuối). Kiểm tra sau gộp, do người gộp báo cáo: `npm run typecheck` và `npm run build` xanh; `npm test` 285/285 trên Linux (lần chạy đầu của người gộp ghi 282 đạt, 0 lỗi, 3 bỏ qua sau khi build lại `dist/`; nguồn: `merge-main-2026-11-03.md` §6 và bàn giao của phòng Phát triển cho số 285/285).

**(b) Phần chỉ có trên nhánh thử nghiệm.** Bảy công tắc dưới đây có trong nhánh nghiên cứu, **chưa triển khai và chờ giám đốc duyệt**; `main` không có chúng. Mặc định sau gộp theo `merge-main-2026-11-03.md` §5 (các tệp nguồn không nằm trong diff của merge nên trùng mặc định trước gộp; không công tắc nào bị đổi hay bật thêm).

**Bảng 1b.** Tách `main` và nhánh thử nghiệm. Nguồn: `merge-main-2026-11-03.md` §3, §5.

| Nhóm | Mã | Nội dung | Mặc định sau gộp |
|---|---|---|---|
| Đã có trên `main` | — | KPI v2 và bộ probe; ngân sách dự án/agent; agent ngoài; backlog, Kanban, đổi thuộc tính; giao diện v2 | Ngân sách: không có chính sách; agent ngoài: chỉ tạo khi khai báo |
| Chỉ trên nhánh | B-01 | Làn đơn `lanes.single` và làn nhanh `fastLane` | `lanes.single = { enabled: true, maxParts: 5, maxFilesTouched: 6 }`, thứ tự `options.lane` > `ProjectDef.lane` > tự động; `fastLane = { enabled: true, maxBriefChars: 4000, maxRepoFiles: 300, maxRepoBytes: 1.500.000, planModel: 'sonnet', finalReport: 'template', maxParallel: 4 }` |
| Chỉ trên nhánh | B-02 | Vòng sửa của cổng kiểm tra | `gate.maxFixRounds = 2` |
| Chỉ trên nhánh | B-04 | Bộ tách lệnh shell có xét nháy | Luôn bật |
| Chỉ trên nhánh | B-05 | — | Không có công tắc cấu hình riêng (giả định: mới grep `config.ts`, `types.ts`, chưa đọc nơi triển khai; chờ người nắm B-05 xác nhận) |
| Chỉ trên nhánh | B-06 | Chẩn đoán chặn, sự kiện `guard.block` | Luôn bật |
| Chỉ trên nhánh | B-10 | Cổng phủ kế hoạch `planGate`, không gọi LLM | Chạy khi không ở chế độ solo |
| Chỉ trên nhánh | B-11 | Làn đơn gọn `lanes.single.slim` | `{ accept: 'full', compactTemplate: false, promptDiet: true }` |

Việc nhánh nghiên cứu có `main` hay không không đổi trạng thái "chưa triển khai" của bảy mã này: chúng chỉ nằm trong mã của nhánh.

**(c) Các số đo W1–W5 và B7′ được đo trước khi gộp.** Mọi số đo của bài chạy trên mã **chưa chứa** 16 commit của `main`: máy chủ 7424 ở `origin/main` `e0bd2f4` (A0-sonnet, B0, B5) và máy chủ 7425 ở nhánh `7fb18ba` (B6, B7) trong W1–W5 (`study-cloud/RUNLOG.md` dòng 5, 56); máy chủ 7425 ở `1333eef` cho B7′ (`b7prime/RUNLOG.md` dòng 5), với Claude Code CLI 2.1.317 thay cho 2.1.316 của W1–W5 (dòng 7). Kiểm bằng `git log`: `9e6079b` không nằm trong lịch sử của `1333eef`, còn `1333eef` và `7fb18ba` đều nằm trong lịch sử của nhánh trước và sau merge `37f88b6`. Cần phân biệt hai nghĩa của "trước": theo *nội dung mã* máy chủ, cả ba đợt đều trước gộp; theo *đồng hồ*, W1–W5 trước merge (cam kết ngày 02/11), còn các lượt B7′ được cam kết kết quả lúc 09:11–09:25 UTC ngày 03/11, sau dấu thời gian của merge (15:12 +07, tức 08:12 UTC), nhưng máy chủ vẫn chạy worktree `1333eef` không có `main`. **Hành vi của CCoding sau gộp chưa được đo**; mục 4.3(a) về việc luồng điều phối không đổi chỉ dựa trên diff.

---

## 5. Phương pháp đánh giá

Phần này gồm hai bộ dữ liệu có địa vị khác nhau. **§5.1 là nghiên cứu đăng ký trước W1–W5**, nguồn của mọi phép thử xác nhận ở §6.1. **§5.2 là các vòng thăm dò C1–C8** (bộ cũ 5 bài), không thuộc phép thử xác nhận nào. Quy ước nguồn: `SCF` = `bench/vs-claude/results/study-cloud-final`; `AN` = `docs/research/analysis`; `PT` = `SCF/prereg-tests-448.md`.

### 5.1 Nghiên cứu đăng ký trước W1–W5

**(a) Bộ bài.** Bộ bài của giám đốc gồm hai tập: **R13** (13 bài, gồm cả bài phi lập trình như đánh giá bảo mật, tổng quan tài liệu và thiết kế hệ thống; `SCF/final-extra.md`, đầu tệp) và **T5** (năm bài t1–t5, cùng 5 bài ở §5.2; B-01 chỉ tính trên T5; `PT` §2). Mỗi ô (bài × arm) chạy lượt r1–r3 trên R13; trên T5 chạy đến r9 cho B6/B7 và A0-sonnet (`PT` §2, cỡ ô 9/9/9/9/9).

**(b) Bảy arm.** A0-sonnet (Claude Code một mình bằng Sonnet; đối chứng chung), A1 (Claude Code kèm prompt lập kế hoạch và tự review), A2 (best-of-3), B0 (CCoding đủ phòng), B5 (CCoding với một agent `senior-swe`), B6 (làn nhanh) và B7 (làn đơn; bản đăng ký trước gọi là "SL", `bench/vs-claude/RUNBOOK-cloud-session.md:75`). Tên và cấu hình theo `SCF/README.md` (bảng "Kết quả chính", mục 3).

**(c) Cửa sổ và máy chủ.** Năm cửa sổ W1–W5 chạy ngày 2–3/11/2026 (`SCF/README.md`, đầu tệp và mục "Giới hạn"). Hai máy chủ khác mã: `main` ở `e0bd2f4` cho B0 và B5; nhánh `7fb18ba` cho B6 và B7 (`SCF/README.md`, mục "Giới hạn"). **Các arm không chạy cùng cửa sổ** (A0-sonnet: W1/W2a; B5, B6: W3; A1: W4–W5; A2: W5; B7: B7b; `SCF/final-extra.md`, đầu tệp), nên so sánh chéo arm ở bảng chi phí là mô tả. Để kiểm độ trôi giữa cửa sổ, ba lượt neo B0 × `l4` ở W3, W4, W5 lệch ≤ 5 % so với W1 về token và thời gian; **đó là chỉ báo thô, k = 2, không phải bằng chứng tương đương giữa các cửa sổ** (`SCF/README.md`, mục "Giới hạn").

**(d) Thước đo.** Chi phí đo bằng token có trọng số: `weighted = input + 1,25·cacheWrite + 0,1·cacheRead + 5·output` (`docs/research/preregistration.md:46`; cài ở `bench/vs-claude/lib/claude.mjs:15-17`). **`weighted` khác USD** và không suy ra tương đương USD (`preregistration.md:343`); trường `costUsd` của các arm CCoding bằng 0, chỉ A0-sonnet có `costUsd` > 0 (`AN/cache-sensitivity.md`, C-5, bảng "USD theo arm"). Thời gian là `wallSec` của cả lượt. Điểm là tỉ lệ test ẩn hoặc mục checklist đạt.

**(e) Phép thử.**
- *Tương đương TOST ±15 %:* B-01 kiểm B6 và B7 so với A0-sonnet trên T5 bằng ba phép (token, thời gian, điểm), biên [0,85; 1,15], CI 90 % phân vị; kết luận "tương đương" chỉ khi cả ba phép (IUT) đạt (`PT` §0, §2).
- *Quy tắc trần §2.7:* bài mà mọi lượt của cả hai arm có điểm ≥ 0,99 bị bỏ khỏi phép về điểm; còn dưới 3 bài thì phép về điểm "không kết luận" (`PT` §2, dòng (c)).
- *Tiêu chí loại lượt:* `classifyRows` loại theo cờ Q, L, T, E1, E4 tính tự động từ `status`, `leak`, `error`, `_FINAL.txt` và `wallSec` so với hạn 20 phút, không dùng điểm. Đọc 448 dòng; **loại 16, giữ 432** (`PT` §0, §1). Bảng của `SCF/final-extra.md` dùng bộ lọc khác (bỏ `infra` và `leak`) nên giữ 440 dòng; hai con số thuộc hai bộ lọc, `PT` §1 không liệt kê riêng cờ của từng dòng bị loại nên bài này không quy 16 − 8 dòng chênh vào nguyên nhân cụ thể.
- *Quarantine:* không có dòng `failed`; 8 dòng `infra` (lỗi socket keep-alive ở W3, không có lượt gọi LLM) bị mọi script bỏ qua, không chuyển dòng nào (`SCF/README.md`, mục "Dữ liệu"). 0 leak, không lượt nào chạm hạn mức.
- *Ước lượng khoảng:* tỉ số = mũ của trung bình theo bài của log(TB arm / TB A0-sonnet); bootstrap **hai tầng** (lấy lại bài, rồi lấy lại lượt trong ô), B = 4000, hạt 20261102 (`PT` §0; `SCF/final-extra.md`, đầu tệp). p bootstrap chỉ là xấp xỉ; phán quyết dùng CI (`PT` §2, §6).
- *Họ Holm:* H3 và H6 chỉ vào họ Holm khi đủ N và có mã kiểm định; ngược lại hạ xuống ước lượng kèm CI (`PT` §5).
- *Phân tích phụ, ngoài họ Holm:* phân rã chi phí, tách phương sai, độ nhạy hệ số đọc cache 0,05 và độ khớp giữa các bộ chấm (§6.1, mục 4–6). Các phân tích này chạy trên **ảnh chụp `runs.jsonl` cũ hơn 448 dòng** (221, 240 hoặc 276 dòng; số dòng nêu ở từng mục).
- *Ghi nhận sai lệch:* `PT` §6 ghi rằng quy tắc trần được áp trên dữ liệu xác nhận vì không có pilot cho T5 (khác chữ §2.7, "chỉ bằng pilot"), và A0-sonnet cùng cửa sổ B7a chỉ có 6 lượt mỗi ô (đăng ký 9).

**(f) Vòng thăm dò.** Các vòng C1–C8 (§5.2) có trước đăng ký, dùng bộ cũ 5 bài, vài lượt mỗi ô và không hiệu chỉnh so sánh bội. Bài này gọi chúng là **"vòng thăm dò"**: chúng sinh giả thuyết và mô tả, **không thuộc phép thử xác nhận nào**.

### 5.2 Vòng thăm dò C1–C8 (bộ cũ)

**Thiết kế.** So sánh hai hệ trên cùng đề, cùng repo xuất phát: (a) Claude Code chạy một mình (`claude -p`, mô hình Opus) và (b) CCoding (dự án mới cho mỗi lượt, quyền `exec`, worktree, `checkCommands: ["npm test"]`, runtime `claude-cli`). Từ C7 có thêm (c) Claude Code chạy một mình bằng Sonnet (hệ `claude-sonnet`), để tách hiệu ứng mô hình (làn nhanh của CCoding cũng dùng Sonnet). Các hệ chạy với cách ly cấu hình người dùng như nhau; mỗi hệ chạy **tuần tự** (hai nhiệm vụ CCoding cùng lúc làm nhiễu thời gian vì tranh agent) (`bench/vs-claude/README.md`).

**Bộ bài (5 bài, 461 test ẩn).** `t1-duration` (module theo đặc tả dày quy tắc, 149 test), `t2-orders` (sửa 6 lỗi khách báo, 60), `t3-api` (4 tính năng trên API sẵn có, 87), `t4-perf` (tối ưu hiệu năng, kết quả giống từng byte, 19), `t5-logq` (công cụ nhiều module từ đặc tả, 146). Test ẩn được chấm tự động bằng `node --test` và cả hai hệ không thấy; thời gian trung bình mỗi lượt chạy từ 91 đến 446 s (T-a), tức **không có bài nào dài hơn 15 phút**.

**Các vòng.** C1–C2 = mốc ban đầu (họp, tổng hợp bằng Opus); C3–C4 = bước trung gian; C5 = làn nhanh; **C6 = kiểm chứng sửa `maxParallel` (`d7600f6`: làn nhanh chạy cùng lúc tối đa 4 hạng mục độc lập), chỉ t3 và t5, 2 lượt mỗi hệ; như C5, hai tiến trình (một mỗi hệ) chạy cùng lúc, mỗi hệ tuần tự trong tiến trình của mình** (cùng chịu tải nhà cung cấp, nhưng có thể tranh tài nguyên máy; theo `docs/PROCESS-REVIEW.md` §13 ở `5866cda`). **C7 = Claude Code một mình bằng Sonnet (hệ `claude-sonnet`, 2 lượt mỗi bài, cả 5 bài) chạy cùng lúc với làn nhanh của CCoding (1 lượt mỗi bài)** — đúng điều kiện đối chứng cùng mô hình, cùng thời điểm. Hệ Claude (Opus) có đối chứng cùng vòng ở C1, C2, C5, C6; hệ Sonnet chỉ có ở C7. C6 và C7 có trong `token-analysis.md` (T-a…T-i).

**Số đo.** Thời gian tường, chi phí quy đổi theo giá niêm yết do Claude Code báo, token vào/ra, đọc/ghi cache (tổng cả lượt chạy — `runs.csv`, nguồn chuẩn), số test ẩn đạt. Với CCoding còn có số liệu theo từng lượt gọi agent và pha (`calls.csv`, `phases.csv`); với Claude Code, theo từng lượt mô hình (`claude_turns.csv`, ghi cache TTL 1 giờ/5 phút). Hai tệp này khác độ mịn nên chỉ so ở mức lượt chạy (T-0). Đối chiếu tổng: 38/38 lượt CCoding và 34/34 lượt Claude (gồm hệ Sonnet) khớp (T-0).

**Phân tích (khai báo trước khi tính, theo `token-analysis.md` §2).** (1) Baseline = Claude Code cùng vòng (Opus ở C1–C6; Sonnet ở C7). Ba hệ so sánh theo bài ở T-h; làn nhanh gộp C5–C7 bỏ một lượt treo stdin (C5 t3 lượt 1, 579 s). (2) Đường găng theo pha từ `ts` và `duration_s` (T-d), kể cả chi phí cố định của điều phối so với thời gian Sonnet đơn (T-d phần 3: kế hoạch + review/revise + phần dư; phần dư gồm tạo/gộp worktree, chạy kiểm tra, chờ). (3) Mô hình ghi cache theo lượt gọi bằng hồi quy bình phương tối thiểu (T-e1) và giá hiệu dụng suy ra (T-e0). (4) Ước lượng định lượng sáu đề xuất tối ưu O1–O6 trên dữ liệu có sẵn, **không chạy lại hệ thống** (T-e). (5) Bootstrap phân tầng theo bài, B = 10 000, seed = 20261102 (T-f, T-i) và kiểm định hoán vị hai phía phân tầng theo bài, liệt kê đủ mọi hoán vị (T-f, T-i; thống kê = TB 5 bài của chênh lệch TB hai hệ) — **chỉ minh họa** vì mỗi ô có 1–5 lượt, và không hiệu chỉnh so sánh bội (T-i có 8 phép kiểm định; nếu hiệu chỉnh, các p ≈ 0,03 không còn vững). Với ô chỉ có 1 lượt (làn nhanh C7), CI bootstrap hẹp giả tạo, nên bài này nêu p hoán vị và số theo bài thay vì dựa vào CI. Bốn cặp ở T-i: làn nhanh − Sonnet (C7, cùng thời điểm; kết quả chính), làn nhanh − Opus (C5–C6, và C5–C7 khớp T-h) và Sonnet − Opus (khác thời điểm, trộn hiệu ứng mô hình với thời điểm). (6) Tham số giả định đặt cố định (`charsPerToken` = 3,5; O3 = 30%; O4 = 50%; O5 = 20%).

**Tái lập.** Node ≥ 22, không phụ thuộc ngoài, chạy offline, đầu ra xác định:

```bash
node docs/research/performance/scripts/token-analysis.mjs                  # toàn bộ bảng
node docs/research/performance/scripts/token-analysis.mjs --table T-b      # một bảng
node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md
```

*Chúng tôi chưa tự chạy lệnh này trong hạng mục viết bài; số liệu được chép từ `token-analysis.md`, nơi hạng mục S1 (vòng 2) báo `--check` thoát với mã 0 và khớp cả 12 bảng (gồm T-h và T-i). Dữ liệu C1–C7 lấy từ nhánh `perf/vs-claude-loop` (commit thêm C7 `7fa6305`); script không còn đọc `c6-extract/`.*

---

## 6. Kết quả (RQ3)

**Kết luận trước.** Trong nghiên cứu đăng ký trước W1–W5 (440 khóa `done`, 7 arm, không lượt nào chạm hạn mức), **giả thuyết tương đương B-01 bị bác bỏ cho cả B7 (làn đơn) và B6 (làn nhanh)**: CI 90 % của tỉ số token và thời gian nằm hoàn toàn trên biên 1,15 (Bảng 9). Họ Holm rỗng; không giả thuyết nào được gọi "xác nhận" theo §2.5 (Bảng 10). Điểm chất lượng hầu như chạm trần ở mọi arm nên bộ đo này chủ yếu phân biệt về chi phí và thời gian (Bảng 8). Các vòng C1–C8 ở §6.2 là vòng thăm dò. Nhãn dùng trong mục này: **[Xác nhận]** = phép thử đăng ký trước; **[Mô tả]** và **[Phân tích phụ]** = không có kiểm định giả thuyết, ngoài họ Holm.

### 6.1 Nghiên cứu đăng ký trước W1–W5

**Dữ liệu.** `study-cloud/runs.jsonl` ở `78cc7b6`: 448 dòng = 440 khóa `done` + 8 dòng `infra` (`SCF/README.md`, mục "Dữ liệu"). Phép thử xác nhận đọc 448 dòng, giữ 432 (`PT` §0–§1). Bảng chi phí giữ 440 (`SCF/final-extra.md`, đầu tệp).

**(1) Chi phí 6 arm so với A0-sonnet trên R13 [Mô tả].**

**Bảng 8.** Tỉ số chi phí so với A0-sonnet, 13 bài, lượt r1–3; trung bình hình học theo bài, CI 90 % bootstrap hai tầng (B = 4000, hạt 20261102). **Mô tả: các arm chạy ở cửa sổ khác nhau (xem §5.1(c)); chỉ B0 và A0-sonnet cùng cửa sổ.** Nguồn: `SCF/final-extra.md`, bảng đầu; cột "Điểm TB" khớp `SCF/README.md`, mục "Kết quả chính" 3.

| Arm | Máy chủ | Token ×A0 (CI 90 %) | Thời gian ×A0 (CI 90 %) | Điểm TB (A0-sonnet: 0,979) |
|---|---|---|---|---:|
| B0 (đủ phòng) | `main` `e0bd2f4` | ×6,58 [5,67; 7,70] | ×9,76 [7,93; 12,19] | 1,000 |
| B5 (một agent `senior-swe`) | `main` `e0bd2f4` | ×1,61 [1,41; 1,87] | ×2,59 [2,15; 3,15] | 0,984 |
| B6 (làn nhanh) | nhánh `7fb18ba` | ×4,23 [3,59; 5,05] | ×6,29 [5,00; 8,05] | 0,996 |
| B7 (làn đơn) | nhánh `7fb18ba` | ×2,61 [2,13; 3,23] | ×3,96 [3,11; 5,23] | 1,000 |
| A1 (Claude + prompt lập kế hoạch/tự review) | — | ×0,96 [0,83; 1,10] | ×1,28 [1,14; 1,44] | 0,993 |
| A2 (best-of-3) | — | ×2,23 [1,94; 2,60] | ×2,55 [2,30; 2,88] | 0,995 |

Chỉ A1 có CI token chứa 1 (0,96 [0,83; 1,10]); mọi arm CCoding đắt hơn A0-sonnet cả về token lẫn thời gian. Chất lượng hầu như chạm trần: chỉ 3 bài có ô dưới 0,99 (c3-shop-bugs, l1-oncall, r1-elk-design), chênh tối đa 1 lượt trên 3 (`SCF/final-extra.md`, bảng "Bài có điểm dưới trần"; `SCF/README.md`, kết quả 3). Trong bảng đó A0-sonnet có điểm TB 0,889 ở l1-oncall và 0,833 ở r1-elk-design; B0 đạt 1,000 ở cả hai. Mô tả cùng cửa sổ [Mô tả] (`PT` §3, hàng W1): B0/A0-sonnet có token trung vị theo bài ×5,68 [5,05; 6,58] và thời gian ×9,60 [6,71; 12,80] (CI 95 %), 9/9 bài đạt cả hai ngưỡng 3× và 1,5×; W2a: ×9,54 [5,96; 13,96] và ×11,71 [4,70; 23,71], 4/4 bài; W2c (chỉ s1): ×9,32 và ×11,05, 1/1 bài. B7 trên 13 bài ngoài T5 (B7b) là mô tả khác cửa sổ và khác máy chủ: token ×2,607 [2,13; 3,23], thời gian ×3,965 [3,11; 5,23] (`SCF/step4-extra-448.md`, §3). Hai tệp ghi thời gian ×3,96 (`final-extra.md`) và ×3,965 (`step4-extra-448.md`) cho cùng cặp B7/A0-sonnet trên 13 bài; chúng tôi giữ cả hai như nguồn ghi, sai khác chỉ ở làm tròn.

**(2) B-01 bị bác bỏ cho B7 và B6 [Xác nhận].**

**Bảng 9.** B-01 (IUT ba phép, biên [0,85; 1,15], CI 90 %) trên T5. R = tỉ số tập trung bình hình học theo bài, B7 hoặc B6 so với A0-sonnet. Nguồn: B7, `PT` §2 (bảng "Chính" và hai bảng "Độ nhạy"), và `SCF/step4-extra-448.md` §2 (hàng "A0 r1–11"); B6, `SCF/step4-extra-448.md` §1 (ba bảng).

| Arm; phép so | Cỡ ô A0 / arm theo bài | Token R [CI 90 %] | Thời gian R [CI 90 %] | Điểm (phép c) | Kết luận |
|---|---|---|---|---|---|
| B7; **chính**: A0 cùng cửa sổ r4–9 so với B7 r1–9 | 6 / 9 | 2,498 [2,02; 3,18] | 2,566 [2,09; 3,25] | n/a: không kết luận (0 bài không chạm trần) | **bác bỏ** |
| B7; độ nhạy 1: A0 gộp r1–9 | 9 / 9 | 2,511 [2,05; 3,20] | 2,563 [2,09; 3,27] | n/a | bác bỏ |
| B7; độ nhạy 2: chỉ r4–9 cả hai arm | 6 / 6 | 2,534 [2,04; 3,22] | 2,609 [2,12; 3,31] | n/a | bác bỏ |
| B7; độ nhạy 3: A0 r1–11 (có 2 lượt neo) | 11 / 9 | 2,519 [2,05; 3,13] | 2,580 [2,10; 3,25] | n/a | bác bỏ |
| B6; **chính**: A0 r1–9 so với B6 r1–9 | 9 / 9 | 3,921 [3,49; 4,43] | 4,047 [3,45; 4,76] | 0,987 [0,98; 0,99]: không kết luận (còn 1 bài không chạm trần, < 3) | **bác bỏ** |
| B6; độ nhạy: chỉ cùng cửa sổ W2b (r1–3) | 3 / 3 | 3,886 [3,42; 4,43] | 3,756 [3,17; 4,51] | 0,994 [0,99; 1,00]: không kết luận | bác bỏ |
| B6; độ nhạy: A0 r1–11 so với B6 r1–9 | 11 / 9 | 3,934 [3,51; 4,39] | 4,074 [3,47; 4,75] | 0,987 [0,98; 0,99]: không kết luận | bác bỏ |

Cả bảy phép cho cùng kết luận. Ở phép chính của B7, cận dưới CI 90 % của token (2,02) và thời gian (2,09) đều cao hơn nhiều so với biên trên 1,15, nên không thể tuyên bố tương đương trong ±15 %. p bootstrap = 1,0000 chỉ là xấp xỉ kèm theo; phán quyết dùng CI (`PT` §2). Phép về điểm không kết luận vì T5 chạm trần; chênh điểm tuyệt đối B7 − A0 là −0,04 pp (phép chính) và 0,00 pp (độ nhạy 2; `PT` §2). Số ×2,50 [2,02; 3,18] và ×2,57 ở `SCF/README.md` (kết quả 1) là làm tròn của 2,498 và 2,566. Số 2,519 (A0 r1–11, `step4-extra-448.md`) và 2,498 (A0 r4–9, `PT`) là hai **phép so khác nhau** của cùng cặp, không phải mâu thuẫn. Mô tả thêm [Mô tả], khác cửa sổ cùng máy chủ: B7/B6 token 0,65 [0,55; 0,77], thời gian 0,68 [0,58; 0,79] (`PT` §4.2); B0 không chạy T5 nên không có so sánh B0 với B6/B7 trên cùng bài.

**(3) H3–H7 và họ Holm [Xác nhận, trạng thái của từng giả thuyết].**

**Bảng 10.** Trạng thái các giả thuyết thứ cấp. Nguồn: `PT` §5, bổ sung từ `SCF/README.md` (kết quả 4–9).

| Giả thuyết | Cần (§3.1) | Hiện có | Trạng thái |
|---|---|---|---|
| H3 (review, s1) | r = 10 mỗi arm (A0-sonnet, B0) | 10 / 10 | **Đủ N nhưng không tính p** (SR-26 chưa có mã); hạ xuống ước lượng: recall 0,0 pp [0,0; 0,0], precision 0,0 pp [0,0; 0,0] (n 10/10). `SCF/README.md`: mọi lượt đạt 1,0, **suy biến** |
| H4 (a1, `--judge`) | mô tả | n = 11 mỗi arm | **Mô tả, không có phép kiểm**: A0-sonnet TB 0,985 (sd 0,050; nhỏ nhất 0,833), B0 1,000; Δ ≈ +1,5 pp, xa ngưỡng +20 pp của H4 (`SCF/final-extra.md`, mục H4) |
| H5 (chi phí B0/A0) | mô tả cùng cửa sổ | xem mục (1) | Mô tả kèm CI (`PT` §3): W1 9/9, W2a 4/4, W2c 1/1 bài đạt ngưỡng; họ Holm chỉ gồm {H3, H6} |
| H6 (A1/A2 ≈ B0) | A1 r = 3, A2 r = 2 trên l1-modules, l2-chain, t1–t5 | A1, A2 chưa chạy t1–t5; l1-modules, l2-chain đã có `task.json` từ 3/11 (D8 `3ff7df3`, oracle 1,00, null ≤ 0,01) nhưng chưa đo A1/A2 | **Chưa đủ N**, không tính p |
| H7 (SD B0/A0 ≤ 0,7) | r = 5 mỗi ô, ≥ 3 bài | chỉ 2 bài (a1-ambiguous-spec, s1-sec-review) | **Chưa đủ N**, không tính p |
| Họ Holm {H3, H6} | — | — | **Rỗng (K = 0)**: không giả thuyết nào được "xác nhận" |

Ba điểm cần đọc kèm. (i) **H6 lệch giữa `run-plan.md` và đăng ký trước**: `analyze.mjs` báo |Δ| ≤ 5 pp giữa B0 và A1/A2 trên 13 bài vì `run-plan.md` §5.2 chạy A1/A2 trên R13; nhưng đăng ký trước v2.1 (§9 dòng 6) chỉ tính H6 trên l1-modules, l2-chain và t1–t5, nên H6 vẫn "chưa đủ N" (`SCF/README.md`, kết quả 7). Số 5 pp đó không được dùng như kết quả H6. (ii) Cột "Hiện có" của H6 trong `PT` §5 ghi "không có A1, A2" vì bảng dùng nhãn cửa sổ cố định của vòng 3; A1, A2 có mặt trong `final-extra.md` (`SCF/README.md`, mục "Giới hạn"). (iii) Nhãn "SUPPORTED"/"not supported" của `analyze.mjs` không dùng làm kết luận (`preregistration.md` §2.4, §9 V3-06; `SCF/README.md`, mục "Đọc `analyze.mjs` thế nào").

**(4) Phân rã chi phí và tách phương sai [Mô tả / phân tích phụ].** Không có kiểm định; chạy trên ảnh chụp 221 dòng đầu của `runs.jsonl` (phân rã) và 240 dòng (tách phương sai), không phải 448 dòng (`AN/b7-cost-decomposition.md`, ghi chú vòng 4 gói 1b; `AN/variance-decomposition.md`, V-0).

**Bảng 11.** Phần chênh weighted B7 − A0-sonnet theo thành phần (T-4) và theo thứ tự quy phần cố định (T-5). Nguồn: `AN/b7-cost-decomposition.md`, T-4 và T-5. Δ tính từ trung vị theo bài; k token weighted mỗi bài.

| Bộ | Tách | Phần | % của Δ |
|---|---|---|---:|
| T5 (45 lượt B7, 45 lượt A0) | T-4, theo thành phần | out 50,4 % · cacheWrite 36,8 % · cacheRead 12,8 % · input 0,0 % | Δ = 101,5k/bài |
| T5 | T-5, theo thứ tự | (i) pha accept 47,7 % (48,4k) · (ii) out vượt A0 43,6 % (44,3k) · (iii) cacheWrite vượt A0 8,7 % (8,9k) · (iv) còn lại 0,0 % | 100 % |
| B7b, 13 bài (24 lượt B7, 46 lượt A0) | T-4 | out 56,1 % · cacheWrite 38,0 % · cacheRead 5,9 % · input 0,0 % | Δ = 61,9k/bài |
| B7b | T-5 | accept 46,8 % (29,0k) · out 45,4 % (28,1k) · cacheWrite 7,8 % (4,9k) · còn lại 0,0 % | 100 % |

Đọc kết quả, đúng mức bằng chứng. (a) Chỉ pha **accept** là đo trực tiếp qua `byPhase` (47,7 % trên T5; 46,8 % trên B7b, T-5). Nếu đổi thứ tự quy phần (quy accept sau cùng), accept chỉ còn 14,5 % (T5) và 6,0 % (B7b), vì out và cacheWrite của cả lượt trùng một phần với chính token của accept; hai con số là hai đầu của một khoảng (T-5, bảng độ nhạy; T-7). (b) `byPhase` không có out, cacheWrite hay giây theo pha, nên **không tách được** "out của execute", "mẫu đầu ra so với báo cáo bàn giao", và **thời gian không tách được theo pha nào** (T-6); các phần (ii)–(iv) là cận phụ thuộc thứ tự, không phải phân rã nhân quả. (c) Ước lượng điểm kiểu đăng ký trước tái lập ×2,51 token và ×2,56 thời gian trên T5, ×2,64 và ×3,97 trên B7b (T-7); ba cách tính tỉ số cho ba con số khác nhau (×3,03 trung vị gộp mọi lượt, T-1; ×2,51 trung bình hình học, T-7; ×1,96 trung vị tỉ số theo bài, T-3) và chỉ cách thứ hai tương ứng với B-01 (T-1). (d) Thời gian của B7 tương quan rất mạnh với out (Spearman 0,97 ở B7, 0,98 ở A0 trên T5; T-6), một tương quan chứ không phải phân rã. (e) Hàm ý thô cho B7′: bỏ hẳn accept (giả định cổng B-02 cho phép) chỉ đưa tỉ số từ khoảng ×2,5 xuống khoảng ×1,79, phép nhân tỉ lệ chưa kiểm bằng dữ liệu; chưa đủ cho mục tiêu ×1,3 (`AN/b7-cost-decomposition.md`, mục "Hàm ý cho S3 (B-11)"). B7b có thêm sai lệch cửa sổ vì A0 và B7 khác cửa sổ và khác máy chủ (cùng tệp, "Phân tích lỗi").

**Bảng 12.** Tách phương sai log(B7/A0-sonnet). Nguồn: `AN/variance-decomposition.md`, V-1 (CI 90 %, bootstrap hai mức, 4000 vòng, hạt 20261104) và V-2 (nửa độ rộng CI 90 % dự kiến cho B7′ ở R thật = 1,3, thang log, mô phỏng).

| Đại lượng | Bộ bài | σ²_task [CI 90 %] | σ²_run [CI 90 %] |
|---|---|---|---|
| token có trọng số | T5 (5 bài) | 0,0974 [0,0000; 0,1883] | 0,0873 [0,0359; 0,1354] |
| token có trọng số | B7b (13 bài) | 0,2138 [0,0691; 0,3478] | 0,0310 [0,0070; 0,0391] |
| thời gian thực | T5 | 0,0994 [0,0000; 0,1902] | 0,0809 [0,0360; 0,1151] |
| thời gian thực | B7b | 0,3257 [0,1206; 0,5321] | 0,0583 [0,0194; 0,0662] |

Trên T5, phương sai giữa bài và giữa lượt cùng bậc, và CI 90 % của σ²_task chạm 0, nên "giữa bài lớn hơn giữa lượt" là chưa chắc (V-1; tóm tắt của tệp). σ²_task của B7b gồm cả hiệu ứng cửa sổ và máy chủ, không tách được (mục "Phân tích lỗi" của tệp). Nửa độ rộng CI dự kiến của B7′ (V-2, mô phỏng): phương án A (10 lượt × 5 bài) 0,218 cho cả token và thời gian; phương án B (5 lượt × 10 bài) 0,170 (K1, giả định B7b đồng nhất với T5, chưa kiểm), 0,196 / 0,224 (K2, theo ước lượng riêng của B7b) và 0,245 / 0,291 (K3, B7b nhiễu gấp đôi). Phương án A được chọn (V-3). Cả hai phương án cho cận trên CI khoảng R̂ × 1,2–1,3, nên kết luận "đạt ≤ ×1,3" chỉ có khi R thật ≲ 1,05 (tóm tắt của tệp).

**(5) Độ nhạy hệ số đọc cache 0,05 [Phân tích phụ, ngoài họ Holm].** Hệ số 0,1 vẫn là thước đo chính; hệ số 0,05 (giá đọc cache bằng 0,05× giá đầu vào theo trang giá, `AN/cache-sensitivity.md`, C-4 và C-5) chỉ là độ nhạy, không có p, không đổi K. Dữ liệu là ảnh chụp 276 dòng (`838a5f1`), không phải 448 dòng (C-0).

**Bảng 13.** Đổi hệ số cacheRead từ 0,1 sang 0,05. Nguồn: `AN/cache-sensitivity.md`, C-4.

| Tỉ số (ước lượng điểm kiểu đăng ký trước) | Số bài | Hệ số 0,1 (chính) | Hệ số 0,05 | Đổi |
|---|---:|---:|---:|---:|
| B7/A0, T5 | 5 | ×2,52 | ×2,55 | 1,3 % |
| B7/A0, mọi bài có cả hai arm | 18 | ×2,63 | ×2,73 | 4,0 % |
| B6/A0, mọi bài có cả hai arm | 5 | ×3,93 | ×4,03 | 2,5 % |

Kết luận không đổi: hệ số này gần như không ảnh hưởng tỉ số (C-4). Các bảng còn lại của tệp, đều mô tả: C-1, ở B7 1,25·cacheWrite chiếm 34,8 %, 0,1·cacheRead 12,9 %, 5·out 52,3 %, input ~0 %; C-2, tỉ lệ trúng cache gộp 87,0 % (A0-sonnet), 76,5 % (B0), 80,5 % (B6), 82,2 % (B7), tập bài của các arm khác nhau nên không kiểm định; C-3, con số "ghi cache ≈ 68 % chi phí" của tài liệu tham chiếu **không được dữ liệu ủng hộ như đặc điểm chung** (tối đa theo lượt: B7 53,8 %, B0 54,2 %; chỉ 1/101 lượt A0-sonnet ≥ 68 %), còn "cache là thành phần lớn thứ hai sau out" thì phù hợp (cacheWrite + cacheRead khoảng 44–52 % tùy mẫu số); C-5, USD theo bảng giá, ảnh chụp không có trường `model` nên chỉ có hai kịch bản cận (toàn Sonnet 5.5 hoặc toàn Opus 5.5), tỉ số USD B7/A0 ×2,73 (18 bài) và B6/A0 ×4,03 (5 bài), còn tổng `costUsd` đã ghi của A0-sonnet $14,43 khớp giá ghi cache 1 giờ chứ không phải 5 phút ($12,06), và chưa kiểm cho B0, B6, B7 vì `costUsd` = 0. Phần chênh B7 − A0 trên T5 tính lại ở C-3 (cacheWrite 36,5 %, cacheRead 12,5 %, out 51,0 %) khớp T-4 (36,8 / 12,8 / 50,4 %) trong vài điểm phần trăm vì khác ảnh chụp (276 so với 221 dòng).

**(6) Độ khớp giữa các bộ chấm và cổng chất lượng [Mô tả / phân tích phụ].** Coi bộ chấm và cổng như bộ phân loại (`AN/agreement.md`, đầu tệp). **Đây là độ khớp, không phải độ đúng**: không bên nào là chuẩn vàng; bộ nhãn vàng 60 mục đã chuẩn bị nhưng chưa có nhãn người, nên chưa có κ hay Accuracy cho chuẩn vàng (mục (b) của tệp, G-0).

**Bảng 14.** Chỉ số độ khớp. CI 95 % bootstrap lấy lại theo lượt (B = 2000, hạt 20261103) trừ khi ghi khác. Nguồn: `AN/agreement.md`, A-2 (judge so với regex), C-1 và C-2 (cổng), M-1 (MAST).

| Phép đo | n | Accuracy | Precision | Recall | F1 | κ | PABAK |
|---|---|---|---|---|---|---|---|
| Judge (ref) so với regex (pred), gộp: r1 + a1 | 12 lượt; 84 cặp | 0,940 [0,89; 0,99] | 0,963 [0,93; 1,00] | 0,975 [0,94; 1,00] | 0,969 [0,94; 0,99] | 0,255 [−0,04; 0,65] | 0,881 [0,77; 0,98] |
| — riêng r1-elk-design | 6 lượt; 48 cặp | 0,896 [0,83; 0,96] | 0,933 [0,88; 0,98] | 0,955 [0,90; 1,00] | 0,944 [0,90; 0,98] | 0,231 [−0,08; 0,55] | 0,792 [0,67; 0,92] |
| — riêng a1-ambiguous-spec | 6 lượt; 36 cặp | 1,000 | 1,000 | 1,000 | 1,000 | n/a | 1,000 |
| Cổng B-02 chặn so với lượt lỗi thật, C1–C9 | 54 lượt; 4 lỗi thật | 0,944 [0,87; 1,00] | 1,000 (1/1) | **chưa ước lượng được** (4 < 10) | chưa tính | 0,382 [0,00; 1,00] | 0,889 [0,74; 1,00] |
| "Vào vòng sửa" so với lượt lỗi thật, C1–C9 (đại diện) | 54; 4 lỗi thật | 0,796 [0,69; 0,91] | 0,111 [0,00; 0,33] | chưa ước lượng được | chưa tính | 0,057 [−0,14; 0,35] | 0,593 [0,37; 0,81] |
| "Vào vòng sửa" so với test ẩn < 100 %, ảnh chụp 276 dòng | 120; 7 lỗi thật | 0,942 [0,90; 0,98] | n/a (0 dự đoán dương) | chưa ước lượng được (7 < 10) | chưa tính | 0,000 | 0,883 [0,80; 0,97] |
| MAST, mức chi tiết (14 FM + INF + NA), hai người gán A và B | 49 thách thức | 0,735 [0,61; 0,86] | 0,618 (macro) | 0,615 (macro) | 0,592 (macro) [0,46; 0,77] | 0,673 [0,52; 0,82] | 0,708 [0,57; 0,84] |
| MAST, mức nhóm (FM-1/2/3, INF, NA) | 49 | 0,755 [0,63; 0,88] | 0,815 (macro) | 0,827 (macro) | 0,780 (macro) [0,64; 0,87] | 0,677 [0,52; 0,83] | 0,694 [0,54; 0,85] |

*Judge so với regex.* Khớp thô 0,940 (79/84 cặp trùng nhãn, 5 bất đồng) nhưng κ chỉ 0,255 và CI 95 % chứa 0. Đó là **nghịch lý κ**: judge cho đạt 80/84 và regex 81/84, nên κ bị phạt nặng bởi hai ô chéo hiếm; đọc PABAK 0,881 và khớp thô, không đọc κ riêng lẻ (A-2). 12/14 mục checklist không có bất đồng nào; cả 5 bất đồng nằm ở r1 (`ilm`, `ingest-throughput`); 13/14 mục có cảnh báo nghịch lý κ (A-1). Giả thuyết giải thích hướng bất đồng chưa kiểm từng văn bản (kết luận (a), điểm 3). Hai lỗi regex đã biết (`sign` khớp "design"; bỏ sót "1,4 TB") không xảy ra trong 12 văn bản này (A-3). 12 lượt này do cấu hình `--judge` chọn, không phải mẫu ngẫu nhiên của 276 dòng.

*Cổng B-02.* Trên C1–C9 cổng chặn **1 lượt và đó là lượt lỗi thật (1/1)**, và **chặn nhầm 0 trong 50 lượt không lỗi** (cận trên Clopper–Pearson 95 % là 7,1 %; C-1 và "Đọc kết quả" (c), điểm 1). Precision 1/1 có CP 95 % [2,5 %; 100 %], tức không thông tin. **Recall chưa ước lượng được**: chỉ có 4 lượt lỗi thật (và 7 ở ảnh chụp), dưới ngưỡng 10 nên tệp không in Recall và F1. Ba trong bốn lỗi thật là lượt có test ẩn hỏng nhưng lệnh kiểm tra xanh, loại lỗi B-02 không thể thấy theo thiết kế (đọc `projectChecks.latest`), nên đây là giới hạn của phép đo chứ chưa phải thất bại của cổng. Nhãn lỗi đo ở cuối lượt, sau cổng và vòng sửa, nên precision là cận dưới. B-10 và CTO không đo được vì không có trường ghi quyết định. Cần khoảng 25–46 lượt bài cài lỗi (recall kỳ vọng 0,8, q = 0,7) để nửa CI 95 % của recall ≤ 0,15 (C-3 của tệp; B-12: D9 → sau đó cần đo, chưa chạy).

*MAST.* κ = 0,673 (mức chi tiết) và 0,677 (mức nhóm) giữa hai người gán A và B (trùng chi tiết 36/49, trùng nhóm 37/49). Nguồn lệch chủ yếu là nhãn NA: 10 trong 12 thách thức lệch nhóm có NA ở một bên, vì sổ mã chưa nói cách xử lý thách thức chỉ tốn chi phí hoặc độ trễ. Khi bỏ cặp có NA, κ = 0,869 [0,71; 1,00] (n = 35), nhưng đó là chọn mẫu theo nhãn nên **không dùng làm κ chính** (M-1, "Đọc kết quả" 2). **Hai bên gán nhãn là hai agent cùng họ mô hình, không phải κ người–người**; các mốc MAST 0,88 (người–người) và 0,77 (LLM–người) chỉ để định vị, không so trực tiếp được (M-1, điểm 4).

**(7) B7′ (B-11): dừng vô ích ở giai đoạn 1 (GĐ1). [Mô tả]** Phép đo B7′ (hạng mục B-11 của `improvement-backlog.md`, mục B-11.5; bối cảnh ở `AN/b7-cost-decomposition.md`, mục "Hàm ý cho S3 (B-11)") đã chạy GĐ1 với arm B7cab (ba công tắc B-11 bật cùng lúc) so với A0-sonnet: 5 bài T5, n = 2 lượt mỗi ô, 10 lượt mỗi arm, server `1333eef`, Claude Code CLI 2.1.317 (W1–W5 dùng 2.1.316). Tỉ số trung bình hình học theo bài R̂ của token có trọng số là **×2,04** (CI 90 % [1,45; 2,99]) và của thời gian thực là **×2,16** ([1,53; 3,21]); bootstrap 4000 vòng, hạt 20261102. Cả hai > 1,6, nên quy tắc dừng vô ích của B-11.5 dừng phép đo: không chạy GĐ2, và arm B7c bị hủy trước khi có dòng nào, nên B7c và B7cb không có dữ liệu. Đây là điểm dừng vô ích, **không phải kết luận** và không phải phép kiểm TOST của B-01; n = 2 mỗi ô nên CI rất rộng. Nguồn: `bench/vs-claude/results/b7prime/RUNLOG.md`, `runs.jsonl`; tính lại ở `improvement-backlog.md` B-11.5, "Kết quả GĐ1". Về mô tả, R̂ của B7cab (×2,04 / ×2,16) thấp hơn số của B7 (×2,498 / ×2,566) nhưng vẫn cao hơn ×1,3; hai phép đo khác cửa sổ đo, khác server (`7fb18ba` so với `1333eef`), khác phiên bản CLI và n = 2 mỗi ô, nên **không suy ra hiệu ứng của ba công tắc** từ hiệu hai số này. Sai lệch thực thi được ghi ở `preregistration.md` §9, V4-04. Mục này không được suy rộng từ mô phỏng ở Bảng 12 hoặc từ hàm ý ×1,79 ở Bảng 11.

### 6.2 Vòng thăm dò C1–C8 (bộ cũ, không thuộc phép thử xác nhận)

Các mục 6.2.1–6.2.6 dưới đây giữ kết quả của vòng thăm dò trên bộ cũ 5 bài (n = 1–5 lượt mỗi ô, không hiệu chỉnh so sánh bội). Chúng sinh giả thuyết và mô tả cơ chế; mọi CI và p ở đây là **minh họa**. Khi hai nguồn lệch nhau, nghiên cứu đăng ký trước (§6.1) được ưu tiên.

### 6.2.1 Chất lượng ngang nhau; khác biệt nằm ở thời gian và chi phí

**Bảng 2.** Thời gian, chi phí và test ẩn theo bài (trung bình các lượt lặp; n = 2 mỗi ô, trừ ghi chú). Nguồn: **T-a**. Lệnh tái lập: `node docs/research/performance/scripts/token-analysis.mjs --table T-a`.

| Vòng | Bài | Thời gian CCoding / Claude (s) | Chi phí CCoding / Claude (USD) | Test ẩn đạt CCoding / Claude |
|---|---|---:|---:|---:|
| C1 | t1-duration | 330 / 132 | 1.142 / 0.510 | 298/298 / 297/298 |
| C1 | t2-orders | 143 / 94 | 0.783 / 0.417 | 120/120 / 120/120 |
| C1 | t3-api | 446 / 212 | 1.808 / 0.874 | 174/174 / 174/174 |
| C1 | t4-perf | 446 / 250 | 1.233 / 0.724 | 38/38 / 38/38 |
| C2 | t5-logq | 413 / 245 | 2.077 / 1.005 | 292/292 / 292/292 |
| C5 | t1-duration | 107 / 126 | 0.542 / 0.513 | 298/298 / 297/298 |
| C5 | t2-orders | 106 / 91 | 0.690 / 0.436 | 120/120 / 120/120 |
| C5 | t3-api | 400 / 158 | 1.139 / 0.713 | 174/174 / 174/174 |
| C5 | t4-perf | 153 / 203 | 0.574 / 0.627 | 38/38 / 38/38 |
| C5 | t5-logq | 175 / 259 | 1.077 / 1.015 | 292/292 / 292/292 |

*Ghi chú:* T-a có thêm hai hàng C6 (t3, t5; 2 lượt mỗi ô; trích ở Bảng 3b). Ở C5, trung bình t3 của CCoding (400 s) gồm một lượt 579 s do lỗi treo stdin và một lượt 221 s. Ở C2, hai biến thể t1 của CCoding (n = 1 mỗi biến thể) không có đối chứng Claude cùng vòng nên không đưa vào bảng. C3 và C4 không có đối chứng Claude cùng vòng (T-a, T-f).

**Chất lượng.** Cả hai hệ gần như đạt trọn test ẩn ở mọi vòng; mỗi hệ rớt đúng một test ở một số lượt (Claude 297/298 ở `t1` C1 và C5; CCoding 59/60 ở `t2` C4) (T-a). **Chất lượng không phải lợi thế đo được trong 5 bài này**, nên so sánh quy về thời gian và chi phí.

### 6.2.2 Kết quả âm tính: thiết kế ban đầu chậm hơn và đắt hơn khoảng gấp đôi

**Bảng 3.** Chênh lệch CCoding − Claude Code, bootstrap 95%. **MINH HỌA, n nhỏ — không đủ lực thống kê để khái quát**; CI chỉ mô phỏng nhiễu trong ô nên hẹp hơn thực tế. Nguồn: **T-f**. Lệnh tái lập: `node docs/research/performance/scripts/token-analysis.mjs --table T-f`.

| Vòng | Tập con | Chỉ số | Cỡ mẫu | Chênh lệch | CI 95% | Tương đối so với Claude [CI] | Nhận xét |
|---|---|---|---|---:|---:|---:|---|
| C1 | tất cả lượt | Thời gian (s) | 4 bài; 8 CC / 8 Claude | 169.4 | [117.1; 223.1] | 98.7% [61.1; 147.4] | CC > Claude |
| C1 | tất cả lượt | Chi phí (USD) | 4 bài; 8 / 8 | 0.610 | [0.440; 0.784] | 96.6% [67.0; 130.3] | CC > Claude |
| C2 | tất cả lượt | Thời gian (s) | 1 bài; 2 / 2 | 168.5 | [160.0; 177.0] | 68.9% [65.3; 72.5] | CC > Claude |
| C2 | tất cả lượt | Chi phí (USD) | 1 bài; 2 / 2 | 1.072 | [0.879; 1.265] | 106.6% [86.8; 126.8] | CC > Claude |
| C5 | tất cả lượt | Thời gian (s) | 5 bài; 10 / 10 | 21.1 | [-22.6; 64.9] | 12.6% [-13.4; 39.5] | CI chứa 0 |
| C5 | tất cả lượt | Chi phí (USD) | 5 bài; 10 / 10 | 0.144 | [0.077; 0.210] | 21.8% [11.5; 32.1] | CC > Claude |
| C5 | loại t3 lượt 1 (treo stdin, 579 s) — độ nhạy | Thời gian (s) | 5 bài; 9 / 10 | -14.7 | [-26.7; -2.5] | -8.8% [-15.7; -1.5] | CC < Claude |
| C5 | loại t3 lượt 1 — độ nhạy | Chi phí (USD) | 5 bài; 9 / 10 | 0.156 | [0.093; 0.220] | 23.7% [14.0; 33.7] | CC > Claude |
| C6 | tất cả lượt | Thời gian (s) | 2 bài; 4 CC / 4 Claude | -72.8 | [-105.3; -40.3] | -28.4% [-40.0; -15.9] | CC < Claude; **p hoán vị = 0,0556** (chính xác, 36 tổ hợp; không đạt 0,05) |
| C6 | tất cả lượt | Chi phí (USD) | 2 bài; 4 CC / 4 Claude | 0.136 | [-0.016; 0.287] | 13.2% [-1.4; 30.2] | CI chứa 0; p hoán vị = 0,3889 |

*C6 nằm trong T-f (hai dòng cuối). Với 2 lượt mỗi ô, kiểm định hoán vị chính xác có p nhỏ nhất đạt được là 2/36 = 0,0556, nên thời gian C6 tách hoàn toàn giữa hai hệ nhưng không đạt 0,05 dù CI bootstrap không chứa 0; cả hai chỉ là minh họa (p hoán vị: `dev-review/stats-report.md`, `dev-review.md` §2).*

**Đọc kết quả C1–C5.** (i) Ở C1 và C2 — thiết kế ban đầu — CCoding chậm hơn và đắt hơn ở mọi bài có đối chứng, và khoảng tin cậy không chứa 0 theo hướng đó (Bảng 2, 3). (ii) Ở C5 (làn nhanh), chênh lệch thời gian là +21,1 s với CI chứa 0, tức không phân biệt được với bằng nhau. Dòng loại ngoại lệ đổi hướng (−14,7 s) nhưng đó là **phân tích độ nhạy chọn sau khi thấy dữ liệu**, nên kết luận về thời gian ở C5 nhạy với một lượt chạy. (iii) Chi phí C5 vẫn cao hơn +21,8%; chỉ một ô (`t4`) thấp hơn Claude (0,574 so với 0,627 USD, Bảng 2). (iv) Ở C5, CCoding nhanh hơn ở t1, t4, t5 nhưng chậm hơn ở t2 (106 so với 91 s) và t3 (400 so với 158 s). **Với bài nhỏ, CCoding không có lợi thế chi phí, và lợi thế thời gian chưa được chứng minh.** Hai hệ còn khác cấu hình mô hình (Claude Code: Opus; CCoding ở C5: Sonnet), nên so sánh là của cả hệ thống, không tách hiệu ứng multi-agent khỏi hiệu ứng mô hình; vòng C7 (mục 6.2.3) được thêm để tách hiệu ứng đó (`token-analysis.md` §5).

**Bảng 3b. C6 — kiểm chứng sửa `maxParallel` (`d7600f6`).** Nguồn: **T-a** (thời gian, chi phí, test ẩn), **T-b** (ghi cache), **T-f** (CI, p hoán vị) và **T-g** (tỉ lệ). Lệnh tái lập: `node docs/research/performance/scripts/token-analysis.mjs --table T-a` (tương tự `--table T-b`, `T-f`, `T-g`); dữ liệu gốc: `git show 5866cda:bench/vs-claude/results/runs.csv | grep "^C6"`. **Hai hệ chạy cùng lúc (như C5); Claude Code dùng Opus, CCoding làn nhanh dùng Sonnet; n = 2 mỗi ô; CI và p hoán vị ở Bảng 3 chỉ là minh họa.**

| Bài | Thời gian Claude Code (s): từng lượt → TB | Thời gian CCoding làn nhanh (s) → TB | Tỉ lệ thời gian | Chi phí Claude / CCoding (USD, TB) | Tỉ lệ chi phí | Ghi cache TB Claude / CCoding | Test ẩn đạt (mọi lượt) |
|---|---|---|--:|---|--:|---|---|
| t3-api | 246, 258 → 252 | 211, 173 → 192 | 0,76 | 1,044 / 1,103 | 1,06 | 42 120 / 129 942 (3,1×) | 87/87 cả hai hệ |
| t5-logq | 283, 236 → 259,5 | 134, 214 → 174 | 0,67 | 1,009 / 1,222 | 1,21 | 40 615 / 148 805 (3,7×) | 146/146 cả hai hệ |

**Đọc C6.** (i) Chất lượng không đổi (100% test ẩn, 8/8 lượt). (ii) Thời gian: CCoding nhanh hơn ở cả hai bài (TB 0,76 và 0,67), và khoảng min–max của hai hệ không chồng nhau (t3: CCoding 173–211 s, Claude Code 246–258 s; t5: CCoding 134–214 s, Claude Code 236–283 s), nhưng với n = 2 mỗi ô đó chỉ là dấu hiệu, không phải kiểm định. Hướng này khớp giả thuyết rằng bài **nhiều module có hạng mục độc lập** hưởng lợi từ làn nhanh chạy cùng lúc tối đa 4 hạng mục — nhưng lợi thế so với Opus này phần lớn là hiệu ứng mô hình (mục 6.2.3). (iii) **Chi phí không theo hướng đó**: CCoding đắt hơn ở TB (+5,6% t3, +21,1% t5), và ghi cache vẫn gấp 3,1–3,7 lần Claude Code, cùng cỡ với C5 (3,34×, Bảng 5). Ở t3 lượt 2, CCoding rẻ hơn Claude Code (0,946 so với 1,104 USD), nên không có hướng chi phí nhất quán trong 2 lượt. (iv) **Không chứng minh được sửa `maxParallel` là nguyên nhân**: C6 không có nhánh đối chứng "trước sửa" chạy cùng thời điểm (C5 chạy trước, ở thời điểm khác và có lượt treo stdin), và hai hệ khác mô hình. Chúng tôi chỉ ghi nhận rằng sau sửa, hai bài có nhiều hạng mục độc lập không còn lượt chậm như C5 t3 (400 s TB). Bản ghi PROCESS-REVIEW §13 còn báo tỉ lệ gộp C5 + C6 (bỏ lượt treo stdin) với t3 ≈ 0,99 — nghĩa là ở t3, lợi thế thời gian khi gộp mẫu nhỏ hơn con số C6 riêng lẻ; T-g xác nhận 0,98 khi bỏ lượt treo (giá trị thực 0,985) và 1,45 khi giữ lượt treo. Với C6 riêng, chênh lệch thời gian −72,8 s, CI bootstrap [−105,3; −40,3] nhưng p hoán vị = 0,0556 (T-f, Bảng 3).

### 6.2.3 Cùng mô hình: một agent nhanh hơn làn nhanh (C7)

**Kết luận RQ3 (số lấy từ T-h, T-i, T-d).** Khi cùng mô hình Sonnet và cùng thời điểm (C7), một agent nhanh hơn làn nhanh 1,7–2,5× ở 4/5 bài (chỉ lượt C7; gộp làn nhanh C5–C7 cho 1,6–2,9×, trộn lượt khác thời điểm), và làn nhanh chỉ hòa ở t5, bài có nhiều module độc lập (tỉ lệ 1,00; 0,77× với một lượt C7). Chênh lệch trung bình là +38,0 s, p hoán vị 0,0329. Lợi thế của làn nhanh so với Opus chủ yếu đến từ mô hình: Sonnet đơn nhanh hơn Opus 90,8 s, còn làn nhanh chỉ nhanh hơn Opus 28–35 s. Chi phí của làn nhanh bằng 2,5–3,8× Sonnet đơn (p hoán vị 0,0041). **Đây là minh họa, không phải kết luận khái quát:** C7 chỉ có 1 lượt làn nhanh và 2 lượt Sonnet mỗi bài; 8 phép kiểm định ở T-i không hiệu chỉnh so sánh bội; p nhỏ nhất của dòng C7 bị chặn ở 1/243.

**Bảng 3c. Ba hệ theo bài (thời gian TB, s; tỉ lệ so với Sonnet đơn).** Nguồn: **T-h**. Lệnh tái lập: `node docs/research/performance/scripts/token-analysis.mjs --table T-h`. Opus = Claude Code mặc định (C5–C6); Sonnet = hệ `claude-sonnet` (C7, 2 lượt mỗi bài, chạy cùng lúc với làn nhanh C7); làn nhanh = `ccoding-fastlane` gộp C5–C7, bỏ C5 t3 lượt 1 (treo stdin 579 s). **Mẫu rất nhỏ — minh họa.**

| Bài | Opus (n) | Sonnet (n = 2) | Làn nhanh C5–C7 (n) | Làn nhanh / Sonnet (thời gian) | Chỉ lượt C7 của làn nhanh: s → tỉ lệ | Chi phí làn nhanh / Sonnet (gộp → chỉ C7) |
|---|---:|---:|---:|---:|---:|---:|
| t1-duration | 126 (2) | 66 | 108 (3) | 1,64 | 109 → 1,66 | 2,47 → 1,99 |
| t2-orders | 91 (2) | 42 | 94 (3) | 2,27 | 71 → 1,71 | 3,79 → 2,53 |
| t3-api | 205 (4) | 108 | 199 (4) | 1,85 | 192 → 1,79 | 3,32 → 3,30 |
| t4-perf | 203 (2) | 49 | 142 (3) | 2,90 | 120 → 2,45 | 3,74 → 3,56 |
| t5-logq | 259 (4) | 166 | 165 (5) | 1,00 | 127 → 0,77 | 2,57 → 2,36 |
| TB 5 bài (không trọng số) | 177 | 86 | 142 | 1,93 | 124 → 1,68 | 3,18 → 2,75 |

*Ghi chú:* ở t5, hai lượt Sonnet chạy 159 s và 172 s, còn lượt làn nhanh C7 chạy 127 s; với một lượt làn nhanh chỉ nói được là hòa hoặc nhanh hơn nhẹ (T-h). Số lượt đạt trọn test ẩn: Sonnet 10/10, Opus 13/14, làn nhanh 17/18 (T-h) — không hệ nào có lợi thế chất lượng đo được.

**Bảng 3d. Chênh lệch giữa các hệ: bootstrap và p hoán vị hai phía.** Nguồn: **T-i** (hàng 1–4). Lệnh tái lập: `node docs/research/performance/scripts/token-analysis.mjs --table T-i`. **CI ở hàng 1 hẹp giả tạo** vì ô làn nhanh chỉ có 1 lượt; nên đọc p hoán vị và số theo bài (Bảng 3c), không đọc CI.

| Cặp (A − B), tập | Thời gian (s) [CI 95%]; p hoán vị (số hoán vị) | Chi phí (USD) [CI 95%]; p hoán vị |
|---|---|---|
| Làn nhanh − Sonnet đơn, C7 (cùng thời điểm, cùng mô hình) | +38,0 (+44,3%) [35,0; 41,0]; **p = 0,0329** (243) | +0,441 (+171,6%) [0,432; 0,450]; **p = 0,0041** |
| Làn nhanh − Opus, C5–C6 (bỏ lượt treo) | −28,2 [−44,4; −11,4]; p = 0,0317 (529 200) | +0,125 [0,047; 0,204]; p = 0,0310 |
| Làn nhanh C5–C7 − Opus C5–C6 | −34,9 [−50,7; −18,9]; p = 0,0053 (8 820 000) | +0,088 [0,018; 0,162]; **p = 0,0944** |
| Sonnet đơn (C7) − Opus (C5–C6) — khác thời điểm | −90,8 (−51,4%) [−102,5; −79,3]; p < 0,0001 (48 600) | −0,436 (−62,9%) [−0,477; −0,396]; p < 0,0001 |

*Đọc:* hàng 1 là phép so sánh cùng thời điểm và cùng mô hình nên là kết quả chính; hàng 2–3 trộn hiệu ứng mô hình với hiệu ứng điều phối; hàng 4 đo phần do mô hình (và thời điểm) và lớn hơn nhiều so với mọi chênh lệch giữa làn nhanh và Opus. Các hiệu ứng này không cộng được. Chi phí C5–C7 gộp so với Opus không đạt 0,05 (p = 0,0944). Không hiệu chỉnh so sánh bội cho 8 phép kiểm định; nếu hiệu chỉnh, các p ≈ 0,03 không còn vững (T-i).

**Chi phí cố định của điều phối so với thời gian một agent cần.** Ta chia thời gian tường của làn nhanh thành kế hoạch, review/revise, phần dư (gộp, tạo worktree, chạy kiểm tra, chờ) và execute; "cố định" là phần một agent đơn không phải trả (kế hoạch + review + phần dư), so với thời gian Sonnet đơn làm xong cả bài.

**Bảng 3e. Chi phí cố định của làn nhanh ở C7 (s).** Nguồn: **T-d** phần (3). Lệnh tái lập: `node docs/research/performance/scripts/token-analysis.mjs --table T-d`. Mỗi bài 1 lượt làn nhanh; mẫu số = TB 2 lượt Sonnet đơn cùng vòng.

| Bài | Kế hoạch | Review | Phần dư (gộp + ngoài LLM) | **Cố định** | Execute | Thời gian tường | Sonnet đơn | Cố định / Sonnet đơn (%) | Execute / Sonnet đơn (%) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| t1-duration | 14,9 | 22,9 | 0,7 | 38,5 | 70,5 | 109,0 | 65,5 | 58,8 | 107,6 |
| t2-orders | 15,6 | 22,7 | 1,1 | 39,4 | 31,6 | 71,0 | 41,5 | 94,9 | 76,1 |
| t3-api | 34,3 | 22,4 | 1,9 | 58,6 | 133,4 | 192,0 | 107,5 | 54,5 | 124,1 |
| t4-perf | 23,3 | 30,6 | 1,5 | 55,4 | 64,6 | 120,0 | 49,0 | 113,1 | 131,8 |
| t5-logq | 27,5 | 18,2 | 1,9 | 47,6 | 79,4 | 127,0 | 165,5 | 28,8 | 48,0 |
| Σ 5 bài | 115,6 | 116,8 | 7,1 | **239,5** | 379,5 | 619,0 | 429,0 | **55,8** | 88,5 |

Gộp C5–C7 (bỏ lượt treo), phần cố định bằng 312,1 s so với 429,0 s, tức 72,8% (T-d phần 3). Ba nhận xét, mức bằng chứng là mô tả: (i) phần cố định gần như hoàn toàn là kế hoạch (14,9–34,3 s) và review (18,2–30,6 s); phần dư chỉ 0,7–1,9 s mỗi bài, nên chi phí gộp worktree không đáng kể ở quy mô này; (ii) ở t2 và t4, riêng phần cố định đã bằng hoặc vượt thời gian một agent làm xong cả bài (94,9% và 113,1%); (iii) ở t1, t3 và t4, riêng pha execute của làn nhanh đã dài hơn thời gian một agent làm xong cả bài (107,6–131,8%), nên song song hóa không đủ bù khi hạng mục không chia đều được hoặc agent đơn đã làm nhanh. Ngoại lệ duy nhất là t5: execute 79,4 s so với 165,5 s (48,0%), kéo tổng về 127 s so với 165,5 s của Sonnet (gộp C5–C7: 164,8 s so với 165,5 s, tức hòa). Số "cố định" dùng thời gian tường làm mẫu số của Sonnet đơn ở C7 nên không kiểm soát được khác biệt giữa các lượt.

**Lượt C7 t2 (52/60): lỗi ở điều phối, không phải bằng chứng verifier bỏ sót.** Lượt duy nhất của làn nhanh ở t2 trong C7 chỉ đạt 52/60 test ẩn, trong khi hai lượt Sonnet đơn đều đạt trọn (120/120 gộp hai lượt, T-h). Tám test hỏng thuộc đúng hai lỗi trong đề: #3 (mua X tặng Y: 6 test) và #4 (hạn mã tính theo UTC: 2 test). Điều này **không** khớp cách đọc "reviewer bỏ sót": theo `calls.csv` và `result.json` của lượt này, lượt `review` đã trả `approved: false` với vấn đề `major`, nêu đúng hai chỗ sai (`freeUnits` tính bằng `Math.floor(qty/buy)*free` thay vì chia cho `buy + free`; `checkValidity` so `now < new Date(endsAt)` nên mã hết hạn ngày 2026-11-30 bị từ chối lúc 10:00Z) kèm cách sửa và ca biên. Lỗi còn lại vì quy trình: kế hoạch chia 3 hạng mục, nhưng hạng mục sở hữu `src/promotions.js` không chạy (chỉ có plan, 2 execute và review trong `calls.csv`), không có pha revise (`reviewRound` = 0 dù `maxRevisions` = 1), và harness vẫn ghi `done` kèm cờ `attention: review` (T-h, mục kiểm lượt t2). Không có `events.jsonl` nên chưa xác định vì sao hạng mục thứ ba không chạy. Đối chiếu TeamBench: Kim et al. (2026) báo verifier chấp nhận khoảng 49% bài nộp mà bộ chấm loại; lượt của chúng tôi **không** là một ví dụ như vậy (reviewer đã không duyệt), và trong 19 lượt làn nhanh C5–C7 chỉ 2 lượt có `approved: false` (C7 t2 và C5 t3 lượt 1, lượt này vẫn đạt 87/87), nên tỉ lệ duyệt nhầm của reviewer CCoding vẫn **chưa đo được**. Bằng chứng ở đây là về điểm yếu của điều phối: tín hiệu từ reviewer không kích hoạt vòng sửa, làm làn nhanh đạt thấp hơn một agent đơn trong cùng điều kiện. Đây là 1 lượt: minh họa.

**Điều kiện có thể có lợi: giả thuyết, chưa được kiểm.** (a) Việc chia được thành phần độc lập và đủ lớn để phần song song bù phần cố định: gợi ý bởi t5 (execute 79,4 s so với 165,5 s Sonnet đơn); (b) bài đủ dài: phần cố định ở C7 chỉ 38,5–58,6 s dù Sonnet đơn cần 41,5–165,5 s, nên tỉ lệ cố định có thể giảm khi bài dài hơn. Bài dài nhất trong dữ liệu là Opus t5, 259 s (khoảng 4 phút); muốn kiểm cần bài > 15 phút có nhiều hạng mục độc lập, cùng mô hình và cùng thời điểm, với nhiều lượt hơn mỗi ô. Dữ liệu hiện có chỉ cho một gợi ý yếu về (a) (t5, một lượt làn nhanh C7) và không có gì để kiểm (b).

### 6.2.4 Song song hóa: có tác dụng nhưng chỉ ở pha execute

**Bảng 4.** Đường găng theo lượt chạy. Nguồn: **T-d** phần (2). Lệnh tái lập: `node docs/research/performance/scripts/token-analysis.mjs --table T-d`.

| Vòng | Số lượt chạy | Thời gian tường TB (s) | Σ tuần tự LLM TB (s) | Đường găng LLM TB (s) | Tiết kiệm nhờ song song TB (s) | Ngoài LLM TB (s) | Tiết kiệm / tuần tự (%) |
|---|---:|---:|---:|---:|---:|---:|---:|
| C1 | 8 | 341 | 353 | 308 | 45 | 33 | 12.9 |
| C2 | 4 | 339 | 351 | 289 | 62 | 50 | 11.6 |
| C3 | 2 | 190 | 169 | 169 | 0 | 20 | 0.0 |
| C4 | 5 | 195 | 247 | 183 | 64 | 12 | 25.0 |
| C5 | 10 | 188 | 265 | 187 | 78 | 1 | 30.5 |
| C6 | 4 | 183 | 318 | 181 | 137 | 2 | 42.9 |
| C7 | 5 | 124 | 189 | 122 | 67 | 1 | 28.7 |

*C6 có trong T-d (4 lượt chạy CCoding): pha `execute` có hệ số song song 2,26 và đường găng 108,4 s, dài hơn `review` (34,0 s). C7 (5 lượt chạy làn nhanh): `execute` có hệ số 1,88 và đường găng 75,9 s, dài hơn `plan` (23,1 s) và `review` (23,4 s) (T-d phần 1).*

Theo pha (T-d phần 1), chỉ `execute` có song song; hệ số tăng từ 1.27 (C1) lên 2.02 (C5) khi làn nhanh chạy cùng lúc các hạng mục độc lập. Sau khi song song hóa, `review` (81.3 s) trở thành pha dài nhất ở C5, lớn hơn đường găng của `execute` (76.9 s). C3 chỉ có một hạng mục nên không có song song. Đây là mô tả. Về sửa `maxParallel`, C6 (Bảng 3b) cho thời gian tường TB của CCoding thấp hơn Claude Code ở cả hai bài nhiều module (0,76 và 0,67), và T-d cho thấy `execute` (đường găng 108,4 s) thay `review` làm pha dài nhất, nhưng không có đối chứng "trước sửa" cùng thời điểm, nên **chưa quy được cải thiện cho riêng `maxParallel`**.

*Khi nào multi-agent nhanh hơn?* Trên dữ liệu có (n nhỏ, 5 bài, dài nhất khoảng 4 phút), **không có bài nào làn nhanh nhanh hơn một agent cùng mô hình một cách phân biệt được**: ở C7 một agent nhanh hơn ở t1–t4 và chỉ hòa ở t5 (Bảng 3c; T-h), dù song song hóa có tác dụng trong pha `execute` (hệ số 1,88 ở C7, T-d). Điều kiện có thể có lợi — việc chia được thành hạng mục độc lập và bài đủ dài để phần song song bù phần cố định 38,5–58,6 s (Bảng 3e) — **chỉ là giả thuyết cần thí nghiệm**, không phải kết quả: muốn kiểm cần bài > 15 phút, nhiều hạng mục độc lập, cùng mô hình, cùng thời điểm (`token-analysis.md` §4). C6 (t3, t5; Bảng 3b) nhất quán với hướng thời gian nhưng so với Opus, nên lẫn hiệu ứng mô hình.

### 6.2.5 Cache và token: "gấp 2,8–4 lần" chỉ đúng một phần

**Bảng 5.** Tỉ lệ ghi cache CCoding / Claude (gộp theo vòng). Nguồn: **T-b** (hàng "GỘP"). Lệnh tái lập: `node docs/research/performance/scripts/token-analysis.mjs --table T-b`.

| Vòng | Hệ CCoding | Ghi cache CC TB | Ghi cache Claude TB | Tỉ lệ ghi cache | Tỉ lệ đọc cache | Tỉ lệ output | Tỉ lệ chi phí | Lượt gọi agent / lượt chạy |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| C1 (gộp 4 bài) | ccoding | 132 163 | 28 033 | 4.71 | 1.85 | 2.58 | 1.97 | 6.3 |
| C2 (gộp 1 bài) | ccoding | 249 170 | 40 951 | 6.08 | 2.10 | 2.71 | 2.07 | 12.5 |
| C5 (gộp 5 bài) | ccoding-fastlane | 98 282 | 29 423 | 3.34 | 1.92 | 1.81 | 1.22 | 5.0 |
| C6 (gộp 2 bài) | ccoding-fastlane | 139 374 | 41 367 | 3.37 | 1.35 | 1.83 | 1.13 | 6.3 |

*C6 theo bài (T-b): t3 3,09×, t5 3,66× (Bảng 3b).*

Theo từng ô có đối chứng, tỉ lệ ghi cache nằm trong 2.76–6.08 và 7/12 ô trong khoảng 2,8–4 (T-b). Với thiết kế hiện hành (C5, C6), con số khớp (3.34× và 3.37×); với thiết kế ban đầu thì lệch (4.71× ở C1, 6.08× ở C2). Ghi cache của Claude Code đều là TTL 1 giờ (T-0). Cơ chế quan sát được: Claude chạy một tiến trình, còn CCoding chạy 5.0–6.3 lượt gọi mỗi lượt chạy với 19 656–21 146 token ghi cache mỗi lượt gọi (T-b), nên tổng tăng theo **số lượt gọi nhân với nội dung mỗi lượt gọi tự ghi**. Đây là liên hệ mô tả, không phải bằng chứng nhân quả.

**Bảng 6.** Tỷ trọng ghi cache theo pha (CCoding). Nguồn: **T-c**. Lệnh tái lập: `node docs/research/performance/scripts/token-analysis.mjs --table T-c`.

| Vòng | plan | discuss | finalize | execute | review | revise | synthesize |
|---|---:|---:|---:|---:|---:|---:|---:|
| C1 | 13.0% | 6.3% | 3.7% | 50.1% | 16.9% | – | 9.8% |
| C5 | 14.5% | – | – | 60.0% | 24.0% | 1.4% | – |

`execute` chiếm phần lớn ghi cache; `review` chiếm 16.9% (C1) và 24.0% (C5) dù output của reviewer nhỏ, do `prompt_chars` (12 921 ký tự ở C5) và `tool_output_chars` (17 783) lớn, tức reviewer đọc nhiều (T-c). Σ retries = 0 ở mọi pha.

**Tiền tố prompt không phải thủ phạm chính.** Hồi quy cache_write ≈ F + a·(Σ *_chars/3,5) + b·output trên 170 lượt gọi cho F = 2 588 token mỗi lượt gọi (hệ số a = 1.50, b = 1.16, R² = 0.716) (**T-e1**; lệnh: `… --table T-e1`). Phần cố định nhỏ so với 19 656–21 146 token ghi mỗi lượt gọi, nên lượng ghi lớn đến từ nội dung (đầu ra và kết quả công cụ bị ghi lại ở mỗi tiến trình). Đây là tương quan, phụ thuộc giả định `charsPerToken`, và R² 0.716 nghĩa là một phần ghi cache chưa được giải thích.

### 6.2.6 Sáu đề xuất tối ưu: ước lượng, chưa kiểm chứng

**Bảng 7.** Ước lượng độc lập cho O1–O6. Nguồn: **T-e** (nền T-e0 giá hiệu dụng: opus 20.08 / sonnet 9.73 USD/triệu token output). Lệnh tái lập: `node docs/research/performance/scripts/token-analysis.mjs --table T-e`.

| Mã | Đề xuất | Tiết kiệm ước tính / lượt chạy (USD) | % chi phí CCoding |
|---|---|---:|---:|
| O1 | Tiền tố prompt ổn định dùng chung cache | 0.037 | 4.6 (trần trên) |
| O2 | Tái dùng phiên execute → revise | 0.006 | 0.7 (trần trên; chỉ 1 lượt revise) |
| O3 | Rút gọn ngữ cảnh 30% | 0.002 | 0.2 |
| O4 | Reviewer chỉ nhận diff + kết quả lệnh kiểm tra | 0.022 | 2.8 |
| O5 | Giới hạn đầu ra (plan/review/synthesize) | 0.014 | 1.7 |
| O6 | Mô hình theo pha: opus → sonnet ở lượt gọi lead | 0.257 | 20.7 (nền C1, không phải C5) |

Nền C5: 10 lượt chạy CCoding, chi phí Σ calls.csv = 8.042 USD; theo giá hiệu dụng, đầu ra = 38.4%, ghi cache = 49.6%, đọc cache = 9.7%. O1–O5 tính trên nền C5, O6 trên nền C1; **mỗi dòng độc lập, không cộng gộp** (O3 và O4 chồng lấn). Đây là mô hình giả định, chưa chạy lại hệ thống, và không ước lượng được tác động lên thời gian. Hàm ý: (a) O6 lớn nhất nhưng **đã được hiện thực** trong làn nhanh (C5 dùng Sonnet ở mọi pha), và chất lượng của thay đổi này chưa được đo riêng (C7 gợi ý mức lớn của hiệu ứng mô hình: một agent Sonnet rẻ hơn Opus 0,436 USD mỗi lượt chạy TB, T-i, khác thời điểm; Bảng 3d); (b) O1–O5 mỗi cái ≤ 4.6% chi phí, nên tinh chỉnh tiền tố không phải đòn bẩy chính; (c) O3 gần như vô ích vì `context_chars` nhỏ (khoảng 1 200 ký tự ở C5); (d) đòn bẩy thực nằm ở giảm số tiến trình và lượng tệp/công cụ đọc lặp. Điểm (d) là diễn giải của chúng tôi từ T-c và T-e, chưa được kiểm thử.

---

## 7. Thảo luận

**Đọc kết quả chính.** Nghiên cứu đăng ký trước cho câu trả lời âm tính rõ hơn vòng thăm dò. Trên T5, cả làn đơn B7 lẫn làn nhanh B6 đều tốn hơn Claude Code một mình bằng Sonnet ở mức nằm ngoài biên ±15 %. Về token, B7 là 2,498 [2,02; 3,18] và B6 là 3,921 [3,49; 4,43]; về thời gian, B7 là 2,566 [2,09; 3,25] và B6 là 4,047 [3,45; 4,76] (Bảng 9). Điểm chất lượng chạm trần nên không có lợi thế chất lượng nào để bù cho chi phí (Bảng 8, Bảng 10). Mục 7.1–7.2 rút gọn phần RQ4–RQ5 của bản trước. Mục 7.3 đặt kết quả cạnh các công bố đã có, gồm Anthropic, Cognition, MAST, Debate or Vote, CAID và TeamBench. Mục 7.4 nêu hàm ý thiết kế.

### 7.1 Thách thức và lỗi (RQ4)

`challenges.md` ghi **49 thách thức** (C-01…C-49). Mỗi thách thức có triệu chứng, nguyên nhân gốc, cách giải quyết, bằng chứng (hash commit hoặc mục tài liệu) và trạng thái. Có hai cách xếp nhóm theo MAST (Cemri et al., 2025), cộng nhóm hạ tầng INF do chúng tôi thêm, vì MAST không bao phủ lỗi hạ tầng. **(a) Nhóm gốc** là các tiêu đề mục 1.1–1.4 của `challenges.md`, xếp theo khoảng mã. Một tác giả xếp nhóm này trước khi có sổ mã, và Bảng 15 dùng nhóm này để đếm trạng thái. **(b) Nhãn cuối** theo sổ mã `analysis/mast-codebook.md`: hai agent A và B gán độc lập, rồi một bên thứ ba phân xử 13 chỗ lệch (`AN/agreement.md`, M-3). κ 0,673 ở mức chi tiết và 0,677 ở mức nhóm (Bảng 14) là **độ khớp giữa A và B theo sổ mã, không xác nhận nhóm gốc**. Nhóm gốc chỉ trùng nhãn cuối ở 27/49 thách thức (khớp thô 0,551, κ 0,412). κ này chỉ mang tính mô tả, vì nhãn cuối có thêm lớp NA và do chính bên phân xử chốt (M-4). Nói cách khác, nhóm gốc **không tái hiện được** khi áp sổ mã. Cả A và B là agent cùng họ mô hình, không phải hai người (mục 8.1, đe dọa 3).

**Bảng 15.** Số thách thức theo nhóm gốc × trạng thái, kèm số theo nhãn cuối. Nguồn: `challenges.md` §3 (nhóm gốc, trạng thái); `AN/agreement.md` M-3 (nhãn cuối) và M-4 (đối chiếu). Trạng thái chỉ đếm theo nhóm gốc.

| Nhóm gốc (khoảng mã) | Đã đóng | Giảm nhẹ | Còn mở | Tổng (gốc) | Nhãn cuối theo sổ mã (M-3) | Trùng nhóm gốc (M-4) |
|---|---:|---:|---:|---:|---:|---:|
| FM-1 Đặc tả/thiết kế (C-01…C-14) | 4 | 8 | 2 | 14 | 13 | 7 |
| FM-2 Lệch phối hợp (C-15…C-23) | 6 | 2 | 1 | 9 | 2 | 1 |
| FM-3 Kiểm chứng/kết thúc (C-24…C-32) | 7 | 2 | 0 | 9 | 7 | 7 |
| INF Hạ tầng/runtime/nhà cung cấp (C-33…C-49) | 9 | 7 | 1 | 17 | 18 | 12 |
| **Tổng** | **26** | **19** | **4** | **49** | **49** (gồm NA 9) | **27** |

Số này là số sự cố *được ghi lại*, không phải tần suất. Các gạch dưới đây theo nhóm gốc; chỗ nhãn cuối khác được ghi trong từng gạch (M-4). Mức mô tả, không suy diễn nhân quả:

- **FM-1 (thiết kế).** Ngân sách là trần cứng (C-01). Họp tốn token mà ít output, và chủ yếu thêm phụ thuộc "cho chắc" (C-02, C-03). Việc cần shell bị giao cho agent không có shell (C-04). Việc được chia theo thứ tự làm, nên chuỗi phụ thuộc gần tuyến tính (C-09). CCoding chậm hơn và đắt hơn trên benchtest (C-11), và `maxParallel` nhỏ (C-12). Nghiên cứu đăng ký trước cho thấy C-11 vẫn còn trên bộ bài mới: mọi arm CCoding đắt hơn A0-sonnet (Bảng 8), và B-01 bị bác bỏ (Bảng 9). Theo nhãn cuối, 7/14 mục giữ FM-1 và 5 mục thành NA (thách thức chỉ tốn chi phí hoặc độ trễ).
- **FM-2 (phối hợp).** Nhiều agent dùng chung worktree đè lên nhau (C-15, C-16). Có xung đột khi gộp (C-17 – C-19), agent khảo sát mãi không ghi (C-20), và tranh agent khi hai nhiệm vụ chạy cùng lúc (C-23, còn mở). Xung đột ngữ nghĩa khi gộp chưa được kiểm thử (P-10). **Theo nhãn cuối, chỉ 2/49 mục là FM-2** (C-04, C-22). 5/9 mục dưới tiêu đề này thành INF (worktree, gộp, `node_modules`, tranh agent) và 3 mục thành FM-1. Với 2 mục, bài không nói được gì về FM-2 (`AN/agreement.md`, mục "Giới hạn", điểm 4).
- **FM-3 (kiểm chứng).** Model yếu phá mã rồi báo "đã sửa" (C-24). Review rỗng bị tính là duyệt (C-25). Nhiệm vụ báo xong dù còn hạng mục lỗi (C-26). Review dựa trên kết quả kiểm tra cũ (C-28). KPI tính lỗi hạ tầng vào điểm agent (C-30). Theo nhãn cuối, 7/9 mục giữ FM-3 và 2 mục thành NA. Nghiên cứu đăng ký trước đo thêm cổng B-02: chặn đúng 1/1, chặn nhầm 0/50, nhưng recall chưa ước lượng được (Bảng 14). Vì vậy câu hỏi "verifier có duyệt nhầm không" vẫn mở.
- **INF (hạ tầng).** Nhóm này gồm: cổng LLM dùng chung không được phép (C-33), runtime không cache (C-40 – C-42), hook chỉ kiểm theo mẫu chuỗi (C-46), lệnh treo stdin (C-47), và hạn mức 5 giờ cùng hệ điều hành chậm (C-49). Theo nhãn cuối, 12/17 mục giữ INF, 3 thành FM-1 và 2 thành NA; INF là nhóm lớn nhất (18/49). Chi phí cache (C-13) vẫn còn mở. Tỉ lệ trúng cache gộp đã ở mức 76,5–87,0 % (§6.1 mục (5), C-2). Do đó phần chi phí cache khó quy cho việc không đọc lại cache. Cách giải thích "số lượt gọi nhân với nội dung mỗi lượt gọi tự ghi" (mục 6.2.5) vẫn chỉ là tương quan.

**Vấn đề còn tồn tại** (P-01…P-15, `challenges.md` §4) gồm: chi phí cache chưa có biện pháp đã kiểm chứng (P-01); tự cải thiện còn thủ công (P-02); hook không phải sandbox (P-03); bài lớn nhiều hạng mục độc lập đã có `task.json` (l1-modules, l2-chain, 3/11) nhưng chưa đo (P-09; Bảng 10, H6); nhãn cuối mới có hai agent gán và một bên phân xử, chưa có người gán độc lập, còn nhóm gốc chưa được sắp lại theo nhãn cuối (P-14); và ẩn danh chưa đủ ở một số tài liệu nguồn nội bộ (P-13). Vì lý do cuối, các tệp đó không được trích nguyên văn khi công bố.

### 7.2 Thiết kế tự cải thiện sub-agent (RQ5)

Cải thiện sub-agent hiện hoàn toàn thủ công: giám đốc chấm 👍/👎 hoặc nhắc agent; không có nhật ký sự cố có cấu trúc, A/B hay rollback (C-14; `design.md` §1). Phương án được chọn là đề xuất → A/B → giám đốc duyệt → áp dụng có phiên bản. Phương án agent tự sửa prompt rồi dùng ngay bị loại, vì không kiểm soát và không truy vết được (`design.md` §2). Vòng gồm 7 bước (`design.md` §3). (1) Phát hiện từ tín hiệu sẵn có. (2) Ghi nhật ký sự cố qua `LogStore`. (3) Tìm nguyên nhân gốc, chỉ trên cụm tái diễn; ngưỡng ≥ 3 sự cố trong ≥ 2 nhiệm vụ là giả định. (4) Viết bản vá một mục tiêu. (5) Qua cổng A/B có bộ bài giữ lại. (6) Giám đốc duyệt. (7) Commit có phiên bản; rollback bằng `git revert`. Bốn bản vá mẫu P1–P4 nhắm `src/prompts.ts`. P1–P3 là giả thuyết tối ưu, P4 là bản vá thu dữ liệu. **Chưa bản vá nào được áp dụng hay đo.** Về an toàn: vòng mặc định tắt; agent chỉ phát đề xuất dạng văn bản; bản vá không được nới quy tắc dữ liệu hay tăng quyền công cụ.

Nghiên cứu đăng ký trước có hai hàm ý cho cổng A/B, cả hai **chưa kiểm**. (a) Điểm chạm trần (Bảng 8, Bảng 10), nên chỉ số "test ẩn đạt" khó phân biệt bản vá. Chỉ số chính thực tế sẽ là token có trọng số và thời gian, còn cỡ mẫu nên tính theo phương sai đã đo (Bảng 12), không theo giả định. (b) P1 (giới hạn độ dài báo cáo bàn giao) cùng hướng với B-11, vì đầu ra là thành phần lớn nhất của phần chênh (Bảng 11). Về vị trí so với công bố: phê bình–sửa trong một tác vụ (Madaan et al., 2023; Shinn et al., 2023), tối ưu prompt theo hàm điểm (Khattab et al., 2024; C. Yang et al., 2024; Yuksekgonul et al., 2025), tiến hoá agent theo phản hồi kiểm thử (Hu et al., 2025) và tái dùng kinh nghiệm (Qian et al., 2024) đều đã có. Khác biệt chúng tôi chủ trương là cải thiện *giữa các nhiệm vụ*, với *ít mẫu* và *có người duyệt*. Vì chưa có số đo trước/sau, đây chỉ là một thiết kế, không phải đóng góp thực nghiệm.

### 7.3 So với công bố đã có: khác gì, hơn gì, hay công bố lại?

- **(i) Anthropic và Cognition.** Hadfield et al. (2025) báo hệ nghiên cứu đa agent dùng khoảng 15 lần token so với chat. Họ cũng thừa nhận hầu hết tác vụ lập trình có ít phần song song hơn nghiên cứu. Kết quả của chúng tôi **cùng hướng nhưng không cùng thang đo**: mốc so là một coding agent đơn chứ không phải chat, và thước đo là token có trọng số chứ không phải token thô. Trên R13, CCoding đủ phòng tốn ×6,58 [5,67; 7,70] và làn nhanh ×4,23 [3,59; 5,05] so với agent đơn (Bảng 8; mô tả, khác cửa sổ). Ngay cả làn đơn, vốn đã bỏ kế hoạch và họp, vẫn tốn 2,498 lần trên T5 (Bảng 9). Về phần song song, vòng thăm dò cho thấy chỉ pha `execute` có song song (mục 6.2.4), và một agent cùng mô hình nhanh hơn làn nhanh ở 4/5 bài (mục 6.2.3). Nghiên cứu đăng ký trước chưa đo bài lớn nhiều phần độc lập: l1-modules và l2-chain đã có `task.json` từ 3/11 (`3ff7df3`) nhưng A1/A2 chưa chạy trên chúng (Bảng 10, H6). Vì vậy bài **không kiểm được** liệu việc lớn có đủ phần song song để bù chi phí hay không. Kết quả cũng nhất quán với khuyến nghị giữ ghi đơn luồng của Cognition ở việc nhỏ (Yan, 2025, 2026). Tuy nhiên bài không phân xử được ở việc lớn, và bài 2026 của Cognition không nêu phương pháp đo, nên chỉ là ý kiến thực hành.
- **(ii) MAST và Debate or Vote.** Chúng tôi dùng MAST (Cemri et al., 2025) theo hai cách. *Phân loại:* 49 thách thức được gán theo sổ mã, với κ 0,673 (chi tiết) và 0,677 (nhóm) giữa hai agent. Các mốc của MAST, 0,88 người–người và 0,77 LLM–người, chỉ dùng để định vị, không so trực tiếp được (Bảng 14, M-1). Nguồn lệch chính là nhãn NA. Lý do là sổ mã chưa nói cách xếp thách thức chỉ tốn chi phí hoặc độ trễ, trong khi đó lại là loại thách thức trung tâm của bài này. Áp sổ mã cũng đổi phân bố nhóm: nhóm gốc theo tiêu đề chỉ trùng nhãn cuối 27/49, và phần lớn mục "lệch phối hợp" chuyển sang hạ tầng INF (Bảng 15, M-4). Đây là gợi ý mở rộng sổ mã, chưa kiểm. *Kiểm chứng (nhóm FM-3):* lỗi FM-3 quan sát được ở CCoding không phải là verifier bỏ sót. Ở mục 6.2.3, tín hiệu review đã có nhưng không kích hoạt vòng sửa. Ở Bảng 14, ba trong bốn lỗi thật thuộc loại "lệnh kiểm tra xanh nhưng test ẩn hỏng", loại cổng B-02 không thấy được theo thiết kế. Recall của cổng chưa ước lượng được (4 < 10), nên chưa đối chiếu được với tỉ lệ duyệt nhầm khoảng 49 % mà TeamBench báo (Kim et al., 2026). *Debate or Vote* (Choi et al., 2025; mới đọc trang tóm tắt arXiv) cho rằng phần lớn lợi ích thường gán cho tranh luận đa agent đến từ bỏ phiếu đa số, và tranh luận tự nó không làm tăng kỳ vọng độ đúng. Pha họp (discuss) của CCoding là một dạng tranh luận. Arm B1 (`discussionRounds: 0`) chưa chạy, nên chúng tôi chưa có số đo nào về giá trị của họp (B-15; `AN/acceleration-crosscheck.md` §1 dòng 3, §2.2). A2 (best-of-3) là arm gần nhất với họ phương pháp lấy nhiều mẫu. A2 tốn ×2,23 token và đạt điểm 0,995, so với 0,979 của A0-sonnet (Bảng 8). Vì trần điểm, chênh lệch này không đọc được thành lợi ích chất lượng.
- **CAID** (Geng & Neubig, 2026) có cùng ý: manager, đồ thị phụ thuộc, worktree, gộp và kiểm chứng bằng test. CAID công bố trước (3/2026), nên chúng tôi **không nhận ý này là mới**. Kết quả của CAID **nhất quán với kết quả của chúng tôi**: ở cả 6 hàng Bảng 2 của CAID, đa agent chậm hơn và đắt hơn. Ở bài này, B-01 bị bác bỏ và mọi arm CCoding đắt hơn agent đơn (Bảng 8, Bảng 9). Phần CCoding thêm là phân rã chi phí theo pha (Bảng 11), cache và token theo pha (Bảng 6, Bảng 13), và một phép thử tương đương đăng ký trước có quy tắc trần. Đó không phải ưu thế về kết quả, vì hướng kết quả trùng CAID.
- **TeamBench** (Kim et al., 2026) tách quyền bằng hệ điều hành trên benchmark riêng. CCoding tách quyền bằng hook theo mẫu chuỗi, yếu hơn (mục 4.2). Chúng tôi không nhận tách vai là mới.
- **Phần có thể mới** (mức chắc chắn trung bình): phép đo chi phí, thời gian và cache theo pha so với agent đơn, có đăng ký trước và kết luận âm tính nêu thẳng (N1); và nhật ký vận hành (N5). Các mức này là "chưa thấy trong phần đã đọc", chưa phải "chưa ai làm". Nếu chỉ trình bày kiến trúc thì **phần lớn là công bố lại**.

**Hàm ý khung bài.** Nên viết bài như "đo chi phí, thời gian và cache của một hệ coding multi-agent so với đơn agent, có đăng ký trước, kèm bài học vận hành", đặt cạnh CAID, chứ không như "đề xuất kiến trúc mới". Việc chọn nơi đăng và lộ trình thuộc `publication-plan.md`.

### 7.4 Hàm ý thiết kế

**Việc nhỏ dùng agent đơn; việc lớn mới dùng multi-agent, và vế sau vẫn là giả thuyết.** Trên R13 và T5, không cấu hình CCoding nào rẻ hơn hay nhanh hơn agent đơn. Trần điểm cho thấy không có thêm chất lượng để đổi lấy chi phí đó (Bảng 8–10). Ngay cả B5, một agent `senior-swe` chạy trong CCoding, vẫn tốn ×1,61 [1,41; 1,87] token. Điều này gợi ý khung điều phối có chi phí riêng ngoài số agent; đây là diễn giải, chưa tách được bằng dữ liệu. Đề xuất cho Phòng Phát triển: mặc định định tuyến việc nhỏ sang agent đơn, và chỉ mở multi-agent khi kế hoạch có nhiều hạng mục độc lập và bài đủ dài. Ngưỡng cho cả hai điều kiện chưa có dữ liệu. Muốn có cần đo H6 đủ N trên bài lớn (l1-modules, l2-chain; hai bài đã có `task.json`).

**Chi phí cố định của CTO và mẫu đầu ra.** Phần chênh của làn đơn so với A0-sonnet có hai nguồn chính (Bảng 11). Theo thứ tự quy phần chính, pha accept (CTO nghiệm thu) chiếm 47,7 % trên T5 và 46,8 % trên B7b. Nếu quy accept sau cùng, con số chỉ còn 14,5 % và 6,0 %. Theo thành phần, token đầu ra (out) chiếm 50,4 % và 56,1 %. Hai nguồn trùng nhau ở token đầu ra của chính lượt accept. Cách đọc đúng mức là: chi phí cố định nằm ở một lượt nghiệm thu dài, và ở lượng chữ mà mẫu đầu ra bắt agent viết. Bỏ hẳn accept chỉ đưa tỉ số về khoảng ×1,79. Đây là phép nhân tỉ lệ chưa kiểm, và vẫn chưa đạt mục tiêu ×1,3. Từ đó có các hạng mục backlog sau (`AN/acceleration-crosscheck.md` §1, §2.3, §4). Chưa hạng mục nào có số đo hiệu quả:

- **B-11 (B7′):** rút đầu ra của accept, CTO trả bảng tiêu chí ngắn ("a-brief"). GĐ1 của phép đo đã **dừng vô ích** (R̂ token ×2,04, thời gian ×2,16, đều > 1,6; n = 2 mỗi ô; [Mô tả], chưa phải kết luận; §6.1 mục (7)). Theo mô phỏng ở Bảng 12, kết luận "≤ ×1,3" chỉ đạt được khi R thật ≲ 1,05.
- **B-13:** ghi `model` và `byPhase` đủ bốn thành phần (input, cacheRead, cacheWrite, output), kèm chỉ số trúng cache trên trang Token. Hiện không tách được out, cacheWrite hay thời gian theo pha (Bảng 11, đoạn (b)).
- **B-14:** chẩn đoán cache của `claude-cli`: tiền tố có ổn định không, và TTL thật là bao lâu.
- **B-15:** đo giá trị của họp (arm B1) trước khi đổi cấu hình. Bài lớn đã có `task.json` (`3ff7df3`), nên hạng mục chỉ còn đo arm B1 trên l1/l2.
- **B-16:** thí điểm "CTO Opus + a-brief": arm `B7cabO` đã có (D9); giám đốc đã duyệt (a-brief) để đo (3/11); còn cần đo bằng bộ bài cài lỗi B-12. Nếu chỉ đổi riêng accept sang Opus thì USD của pha accept tăng khi token không đổi. Token có trọng số cũng không so trực tiếp được giữa hai model khác giá.
- **B-17:** chọn model lập kế hoạch theo độ khó. Hạng mục hoãn tới khi B-13 ghi model theo pha.

**Trạng thái trước khi công bố** (ba nhóm; nguồn đối chiếu: `docs/research/BRIEF-D9.md`, commit `90cd913`):

- **(a) Đã sửa** (đã kiểm bằng `git show --stat` / `git grep -n`):
  - bài lớn l1-modules, l2-chain có `task.json`, oracle 1,00, null ≤ 0,01: `3ff7df3` (D8; `bench/vs-claude/tasks/l1-modules/task.json`, `l2-chain/task.json`);
  - lỗi review `major` không trỏ đúng hạng mục vẫn vào vòng sửa: `c55a249` (`src/orchestrator.ts`, `src/planner.ts`, `test/fast-lane.test.ts`; gán hạng mục gần nhất bằng `assignStrayIssues`);
  - lệnh kiểm tra đỏ thì vào vòng sửa (`gate.maxFixRounds = 2`), B-02: `28d041d`, gộp ở `6b84363`;
  - reviewer nhận diff kèm kết quả lệnh kiểm (P3, B-02): `src/prompts.ts:543`;
  - cờ "cần xem" khi duyệt mà không có kiểm chứng máy (D-02): `src/orchestrator.ts:633`, `:1083`, `:1981`, `src/history.ts:56`, `src/bench.ts:612`.
- **(b) Đang làm ở D9** (`BRIEF-D9.md`): B-03, B-07, B-08, B-09, B-12, B-13, B-14, B-16, B-17. Sửa xong thì mới đo; không phải đề xuất chờ duyệt.
- **(c) Cần đo** (chạy benchmark, không phải sửa):
  - B-14: chạy chẩn đoán cache (D9 → sau đó cần đo; sau khi gộp D9);
  - B-12: đo recall của cổng bằng bộ bài cài lỗi, khoảng 25–46 lượt (Bảng 14; D9 → sau đó cần đo; sau khi gộp D9);
  - B-15: chỉ còn đo arm B1 trên l1/l2;
  - H6 với A1/A2 trên T5, l1-modules, l2-chain;
  - B-16: thí điểm "CTO Opus + a-brief" (D9 → sau đó cần đo; sau khi gộp D9);
  - nhãn người cho bộ vàng 60 mục và cho phân nhóm thách thức (κ ở P-14);
  - việc khác: phép độ nhạy V3-09; đọc toàn văn Debate or Vote và phụ lục MAST; rà ẩn danh (P-13).

---

## 8. Đe dọa tính hiệu lực

### 8.1 Nghiên cứu đăng ký trước W1–W5

**(1) Cửa sổ và máy chủ khác nhau (nội tại).** Các arm chạy ở các cửa sổ khác nhau: A0-sonnet ở W1/W2a; B5 và B6 ở W3; A1 ở W4–W5; A2 ở W5; B7 ở B7b. Các arm cũng chạy trên hai máy chủ: `main` `e0bd2f4` cho B0 và B5, nhánh `7fb18ba` cho B6 và B7 (§5.1(c)). Vì vậy so sánh chéo arm ở Bảng 8 trộn hiệu ứng arm với cửa sổ và máy chủ. Trong B7b, σ²_task cũng gồm cả hiệu ứng cửa sổ và máy chủ (Bảng 12). *Giảm nhẹ:* phép chính B-01 của B7 dùng A0-sonnet chạy cùng cửa sổ (r4–9). B6 có phép độ nhạy chỉ trong cửa sổ W2b. Mọi phép độ nhạy cho cùng kết luận (Bảng 9). Ba lượt neo B0 × `l4` ở W3–W5 lệch ≤ 5 % so với W1, nhưng **đó chỉ là chỉ báo thô, k = 2**, không phải bằng chứng tương đương giữa các cửa sổ. Bài **không so chéo hai máy chủ**: B0 không chạy T5, nên không có so sánh B0 với B6/B7 trên cùng bài. *Còn lại:* chưa xử lý cho Bảng 8. Bảng này chỉ đọc như mô tả.

**(2) Điểm chạm trần (cấu trúc).** Trên R13, chỉ 3 bài có ô dưới 0,99 (Bảng 8). Trên T5, phép điểm của B-01 không kết luận được: B7 có 0 bài không chạm trần, B6 có 1 bài (< 3). H3 suy biến vì mọi lượt đạt 1,0. H4 có Δ ≈ +1,5 pp, xa ngưỡng +20 pp (Bảng 9, Bảng 10). Vì vậy bài **không nói được** CCoding ngang hay tốt hơn về chất lượng, chỉ nói được rằng chất lượng không phân biệt được trên bộ bài này. Có một sai lệch đã ghi nhận: quy tắc trần được áp trên dữ liệu xác nhận vì T5 không có pilot, khác chữ của §2.7 (§5.1(e)). *Giảm nhẹ:* quy tắc §2.7 đăng ký trước, không chọn sau khi thấy dữ liệu. Phép điểm ghi "không kết luận", không ghi "tương đương". *Còn lại:* chưa xử lý. Cần bài khó hơn (l1-modules, l2-chain) hoặc thang chấm mịn hơn.

**(3) κ đo giữa hai agent cùng họ mô hình (đo lường).** Bản trước ghi rằng việc phân nhóm thách thức do một người gán; câu đó chỉ đúng cho nhóm gốc theo khoảng mã của Bảng 15, và nhóm này chỉ trùng nhãn cuối 27/49 (κ 0,412, M-4). Hai bên gán A và B ở Bảng 14 là **hai agent cùng họ mô hình**. Lỗi của hai bên có thể tương quan, nên κ 0,673/0,677 có thể cao hơn độ tin cậy thật, và không phải κ người–người. Nhãn cuối do một bên phân xử đã đọc cả A lẫn B chốt, chưa có người thứ hai kiểm (M-3). Judge so với regex cũng có một bên là LLM. *Giảm nhẹ:* báo κ kèm PABAK và khớp thô. Không so trực tiếp với các mốc 0,88 và 0,77 của MAST. Không dùng κ 0,869 (sau khi bỏ cặp có NA) làm κ chính. *Còn lại:* chưa xử lý. Bộ vàng 60 mục chưa có nhãn người (§6.1 mục (6)).

**(4) Người chạy đã thấy điểm của 2 lượt (V3-09).** Trong cửa sổ B7a, người chạy thấy điểm của 2 lượt t1-duration r8 khi xem đuôi log. Chưa biết hai lượt đó thuộc arm nào và điểm ra sao. Từ đó dòng "tác giả chưa xem kết quả W1–W5 nào" không còn đúng cho bộ sau B7a (`preregistration.md` §9 V3-09). *Giảm nhẹ:* các lần xem sau đã lọc cột điểm. Hai lượt không bị loại, vì điều kiện loại chỉ dựa trên nguyên nhân kỹ thuật. Với B7, phép điểm đã bỏ cả 5 bài T5 vì chạm trần, gồm t1-duration (Bảng 9). Phán quyết B-01 của B7 và B6 đến từ phép token và thời gian, hai phép không dùng điểm. *Còn lại:* chưa xử lý. V3-09 yêu cầu phép độ nhạy B-01(c) bỏ 2 lượt t1 r8 và bỏ cả bài t1, nhưng phép này chưa có bảng riêng trong các tệp nguồn của §6.

**(5) H6 lệch giữa `run-plan.md` và đăng ký trước (giao thức).** `run-plan.md` §5.2 chạy A1/A2 trên R13, nên `analyze.mjs` báo |Δ| ≤ 5 pp. Nhưng đăng ký trước v2.1 (§9 dòng 6) chỉ tính H6 trên l1-modules, l2-chain và t1–t5 (§6.1 mục (3), điểm (i)). *Giảm nhẹ:* bài theo đăng ký trước. Số 5 pp không được dùng làm kết quả H6. H6 ghi "chưa đủ N", và họ Holm rỗng. *Còn lại:* chưa xử lý. A1 và A2 chưa chạy t1–t5, l1-modules, l2-chain; hai bài lớn đã có `task.json` từ 3/11 (`3ff7df3`), phần còn thiếu là phép đo chứ không phải bài. Ngay khi đủ N, TOST ±5 pp của H6 cũng chưa đạt công suất (`preregistration.md` §3.1).

**(6) `costUsd` của arm CCoding bằng 0, và `weighted` khác USD (cấu trúc).** Chỉ A0-sonnet có `costUsd` > 0 (§5.1(d)). Mọi kết luận chi phí của bài dùng token có trọng số theo công thức đăng ký trước, và **không suy ra tương đương USD**. *Giảm nhẹ:* USD chỉ xuất hiện ở phân tích phụ C-5, với hai kịch bản cận (toàn Sonnet 5.5 hoặc toàn Opus 5.5): B7/A0 ×2,73 và B6/A0 ×4,03. `costUsd` của A0-sonnet ($14,43) khớp giá ghi cache 1 giờ (§6.1 mục (5)). *Còn lại:* chưa kiểm USD cho B0, B6, B7. Ảnh chụp không có trường `model`, nên token có trọng số không so được giữa các model khác giá. B-13 nhắm khoảng trống này.

**Các đe dọa khác của nghiên cứu đăng ký trước.** (a) Hai bộ lọc khác nhau giữ 432 dòng (`PT`) và 440 dòng (`final-extra.md`). Bài không quy nguyên nhân cho 8 dòng chênh (§5.1(e)). (b) Phân rã chi phí, tách phương sai, độ nhạy cache và độ khớp chạy trên ảnh chụp 221, 240 hoặc 276 dòng, không phải 448 dòng (§6.1 mục (4)–(6)). (c) Chỉ có một runtime (`claude-cli`) và một nhà cung cấp. Với runtime này, trần vòng công cụ không áp dụng (mục 4.2). (d) Các phép mô tả H5 chưa hiệu chỉnh so sánh bội và nằm ngoài họ Holm.

### 8.2 Vòng thăm dò C1–C8 và phần mô tả hệ thống

| Loại | Đe dọa | Mức độ / cách xử lý |
|---|---|---|
| Kết luận thống kê | **Vòng thăm dò có n rất nhỏ**: 1–2 lượt mỗi ô mỗi vòng (ô gộp nhiều vòng ≤ 5 lượt), 5 bài; **C7 chỉ có 1 lượt làn nhanh và 2 lượt Sonnet mỗi bài**, nên p hoán vị nhỏ nhất của dòng C7 bị chặn ở 1/243; **8 phép kiểm định ở T-i không hiệu chỉnh so sánh bội** | Bootstrap và p hoán vị chỉ minh họa; C1–C8 không thuộc phép thử xác nhận (§5.1(f)); không khái quát (T-f, T-i, `token-analysis.md` §5) |
| Kết luận | **Nhạy với một lượt chạy**: loại một lượt treo stdin đổi hướng chênh lệch thời gian C5 từ +21,1 s sang −14,7 s | Báo cả hai; phân tích độ nhạy chọn sau khi thấy dữ liệu (T-f) |
| Ngoại tại | **Bài nhỏ ở bộ cũ (< 15 phút; dài nhất khoảng 4 phút)**: chi phí cố định của điều phối ở C7 là 38,5–58,6 s mỗi bài (Bảng 3e) | Không suy rộng cho nhiệm vụ lớn; điều kiện có lợi chỉ là giả thuyết |
| Nội tại | **Mô hình khác nhau giữa hai hệ ở C1–C6** (Claude Code dùng Opus, làn nhanh dùng Sonnet); **C7 chạy cùng lúc hai hệ** | C7 tách hiệu ứng mô hình nhưng hàng "Sonnet − Opus" (T-i hàng 4) trộn mô hình với thời điểm; tranh tài nguyên máy chưa kiểm soát |
| Nội tại | **Một lượt hỏng quyết định kết luận chất lượng ở t2 của C7**; nguyên nhân hạng mục thứ ba không chạy chưa xác định (không có `events.jsonl`) | Báo như minh họa về điều phối; không suy ra tỉ lệ duyệt nhầm |
| Nội tại | **Thiên lệch sống sót** ở vòng thăm dò: lượt hỏng do hạn mức bị xóa và chạy lại | Nghiên cứu đăng ký trước không có lượt chạm hạn mức (§5.1(e)); vòng thăm dò chưa báo số lượt xóa |
| Cấu trúc | **Giá hiệu dụng** suy ra bằng hồi quy; `charsPerToken` = 3,5 chưa hiệu chỉnh; hồi quy T-e1 có R² 0.716 | Chỉ dùng quy đổi tương đối; O1–O6 là giả định |
| Cấu trúc | **Dữ liệu vòng thăm dò**: `claude_turns.csv` không có cột system; không có `events.jsonl`; đường găng giả định các pha nối tiếp | Nêu rõ trong `token-analysis.md` §5 |
| Cấu trúc | **Rò rỉ/overfit**: các sự cố và bản vá rút ra từ chính t1–t5 | Dùng bộ giữ lại nếu thực hiện RQ5 (`design.md` §5.4) |
| Phân loại | **Nhóm FM-1/2/3 của Bảng 15 là nhóm gốc theo khoảng mã**, một tác giả xếp trước khi có sổ mã; nhóm này chỉ trùng nhãn cuối 27/49 (κ 0,412, M-4), nhất là FM-2 (9 mục gốc, 2 mục theo nhãn cuối). Nhãn cuối theo sổ mã có hai bên gán là agent cùng họ mô hình (κ 0,673 và 0,677, Bảng 14) và một bên phân xử, chưa có người gán; MAST đã đọc thân bài bản v3 (Mục 1–5; chưa đọc phụ lục; `related-work.md` §2.12) | Báo cả nhóm gốc lẫn nhãn cuối (Bảng 15); trạng thái chỉ đếm theo nhóm gốc; xem 8.1(3); còn thiếu nhãn người (P-14) và phụ lục MAST |
| Tổng quan tài liệu | **Chỉ CAID, *Don't Break the Cache* và Cognition 2026 đã đọc toàn văn trang lấy được**; đa số nguồn còn lại chỉ đọc tóm tắt, kể cả Debate or Vote | Mọi nhận định về "điểm mới" chỉ ở mức "chưa thấy trong phần đã đọc"; mở lại trang chính các venue trước khi nộp |
| Bằng chứng nhật ký | Nhiều số trong `challenges.md` lấy từ tài liệu nội bộ, chưa tính lại từ log thô | Không dùng làm bằng chứng nhân quả (P-11) |
| Ẩn danh | Một số tài liệu nguồn nội bộ còn chuỗi nhận diện | Không trích nguyên văn; rà trước khi công bố (P-13) |
| Hiệu lực mô tả | **Hệ thống được mô tả ở §4.3 (sau gộp `main`) khác hệ thống đã đo**: W1–W5 và B7′ chạy trên mã `e0bd2f4`, `7fb18ba`, `1333eef`, chưa có 16 commit của `main`; hành vi sau gộp chỉ suy từ diff | Không áp số đo vào hệ thống sau gộp; cần đo lại trước khi khái quát (§4.3(c)) |

---

## 9. Kết luận

**Kết luận chung (âm tính).** Trong nghiên cứu đăng ký trước W1–W5 (440 khóa, 7 arm), B-01 bị bác bỏ cho cả làn đơn B7 và làn nhanh B6. Trên T5, B7 tốn 2,498 lần token [2,02; 3,18] và 2,566 lần thời gian [2,09; 3,25] so với A0-sonnet. B6 tốn 3,921 lần [3,49; 4,43] và 4,047 lần [3,45; 4,76]. Bảy phép cho cùng kết luận (Bảng 9). Họ Holm rỗng (K = 0): không giả thuyết thứ cấp nào được xác nhận (Bảng 10). Kết luận theo từng RQ:

| RQ | Kết luận | Mức chắc chắn | Bằng chứng |
|---|---|---|---|
| RQ1 — thiết kế, điều phối | CCoding điều phối theo pha, có worktree con song song tự gộp, review độc lập, làn nhanh, làn đầy và làn đơn | Cao (mô tả hệ thống) | Mục 4.1 |
| RQ2 — giới hạn sub-agent | Liệt kê được 15 cơ chế theo bốn chiều. **Hiệu quả của từng cơ chế: chưa trả lời được**, vì chưa có phép đo trước/sau có đối chứng; nhiều cơ chế không áp cho `claude-cli` | Cơ chế: cao. Hiệu quả: chưa trả lời được | Mục 4.2, Bảng 1 |
| RQ3a — chi phí, thời gian so với agent đơn | Trên bộ bài này, CCoding **đắt hơn và chậm hơn** agent đơn. Ở phép xác nhận, cận dưới CI 90 % (token 2,02 cho B7; 3,49 cho B6) cao hơn nhiều so với biên 1,15. Ở mức mô tả, mọi arm CCoding đắt hơn, từ ×1,61 (B5) đến ×6,58 (B0). Chất lượng chạm trần nên không phân biệt được | Cao trong phạm vi đo (T5, `claude-cli`, cửa sổ 2–3/11/2026). Khái quát sang bài lớn, runtime khác: thấp | Bảng 8, Bảng 9; mục 8.1(1), (2) |
| RQ3b — khi nào multi-agent nhanh hơn | **Chưa trả lời được.** Nghiên cứu đăng ký trước chưa đo bài lớn nhiều hạng mục độc lập (H6 chưa đủ N; l1-modules, l2-chain đã có `task.json` từ 3/11, `3ff7df3`, nhưng chưa đo). Vòng thăm dò chỉ cho gợi ý yếu (t5, một lượt) | — | Bảng 10; mục 6.2.3 |
| RQ3c — tối ưu đáng làm | Hướng tối ưu là pha accept và đầu ra: accept chiếm 47,7 % phần chênh trên T5 (cận dưới 14,5 %). Bỏ accept chỉ đưa tỉ số về khoảng ×1,79, chưa đạt ×1,3. Hệ số đọc cache không đổi kết luận (≤ 4,0 %). **Hiệu quả của B-11 (B7′): chưa kết luận; GĐ1 dừng vô ích, R̂ B7cab ×2,04 (token) và ×2,16 (thời gian), n = 2 mỗi ô, [Mô tả]** | Hướng: trung bình (phân tích phụ, ảnh chụp cũ). Hiệu quả: chưa trả lời được | Bảng 11, Bảng 13; §6.1 mục (7) |
| RQ4 — thách thức, lỗi | 49 thách thức: 26 đã đóng, 19 giảm nhẹ, 4 còn mở (đếm theo nhóm gốc). Theo nhãn cuối của sổ mã: INF 18, FM-1 13, FM-3 7, FM-2 2, NA 9. Nhóm gốc chỉ trùng nhãn cuối 27/49 (κ 0,412), nên không tái hiện được khi áp sổ mã. Lỗi kiểm chứng quan sát được nằm ở điều phối (tín hiệu review không kích hoạt sửa). Recall của cổng B-02 chưa ước lượng được | Số đếm và trạng thái: trung bình (mô tả). Phân nhóm: thấp (κ 0,673 là độ khớp A–B giữa hai agent cùng họ mô hình; nhãn cuối chưa có người kiểm) | Bảng 15 (`AN/agreement.md` M-3, M-4), Bảng 14 |
| RQ5 — tự cải thiện an toàn | Có thiết kế 7 bước, có người duyệt, mặc định tắt. **Hiệu quả: chưa trả lời được**, vì chưa bản vá nào được áp dụng hay đo | Thiết kế: trung bình. Hiệu quả: chưa trả lời được | Mục 7.2 |
| RQ6 — công bố | Kiến trúc phần lớn trùng CAID, TeamBench và các công trình khác; hướng kết quả trùng CAID. Đóng góp có thể bảo vệ là phép đo đăng ký trước về chi phí, thời gian và cache theo pha, kèm kết luận âm tính, cùng nhật ký vận hành | Trung bình ("chưa thấy trong phần đã đọc") | Mục 3, mục 7.3 |

**Hàm ý.** Việc nhỏ nên dùng agent đơn. Multi-agent cho việc lớn vẫn là giả thuyết cần bài lớn để kiểm (mục 7.4). **Trước khi công bố** (đã có GĐ1 của B7′, dừng vô ích, chưa phải kết luận; muốn trả lời ×1,3 cần phép đo sau D9 hoặc cắt phần cố định). Chi tiết ở §7.4; tóm tắt ba nhóm:
- **(a) Đã sửa:** l1-modules, l2-chain có `task.json` (`3ff7df3`); lỗi review không trỏ đúng hạng mục vẫn vào vòng sửa (`c55a249`); lệnh kiểm tra đỏ vào vòng sửa, B-02 (`28d041d`, gộp `6b84363`); reviewer nhận diff kèm kết quả lệnh kiểm (`src/prompts.ts:543`); cờ "cần xem", D-02 (`src/orchestrator.ts:633`, `:1083`, `src/history.ts:56`, `src/bench.ts:612`).
- **(b) Đang làm ở D9** (`BRIEF-D9.md`): B-03, B-07, B-08, B-09, B-12, B-13, B-14, B-16, B-17.
- **(c) Cần đo:** B-14 chạy chẩn đoán, B-12 đo recall (25–46 lượt), B-16 thí điểm (cả ba: D9 → sau đó cần đo, sau khi gộp D9); B-15 chỉ còn đo arm B1 trên l1/l2; H6 với A1/A2 trên T5, l1-modules, l2-chain; nhãn người cho bộ vàng và phân nhóm thách thức (P-14); việc khác: phép độ nhạy V3-09, đọc toàn văn Debate or Vote và phụ lục MAST, rà ẩn danh.

---

## 10. Tài liệu tham khảo

Chuẩn APA 7, theo `references-v2.md` (S2, vòng 2); danh mục chỉ gồm các nguồn được trích trong bài (khớp 1–1 với trích dẫn ở mục 2, 3, 4.1, 7), các nguồn khác của `references-v2.md` (ChatDev, AgentVerse, CAMEL, MapCoder, Magentic-One, ADAS, AFlow, AgentDojo) không được trích trong bài này nên không đưa vào. Liệt kê đủ tác giả (tối đa 20; OpenHands có 24 tác giả nên ghi 19 đầu, dấu "…", tác giả cuối). Nhãn kiểm chứng venue: **[V-chính]** = đã mở trang proceedings/nhà xuất bản; **[V-thứ cấp]** = venue lấy từ trang danh mục, trang tác giả hoặc trường `comment` của arXiv, chưa mở trang chính thức; **[V-BRIEF]** = venue và DOI theo BRIEF-2, chưa tự mở được trang chính. **Mở lại trang chính các mục [V-thứ cấp] và [V-BRIEF] trước khi nộp.** Chưa nguồn nào ngoài CAID, *Don't Break the Cache*, Cognition 2026, Anthropic và Cognition 2025 được đọc toàn văn.

Cemri, M., Pan, M. Z., Yang, S., Agrawal, L. A., Chopra, B., Tiwari, R., Keutzer, K., Parameswaran, A., Klein, D., Ramchandran, K., Zaharia, M., Gonzalez, J. E., & Stoica, I. (2025). Why do multi-agent LLM systems fail? *Advances in Neural Information Processing Systems (NeurIPS 2025)*. arXiv:2503.13657. https://arxiv.org/abs/2503.13657v3 **[V-thứ cấp: venue theo ML Anthology; trang arXiv không ghi venue; OpenReview https://openreview.net/forum?id=fAjbYBmonr chưa mở được]**

Chen, W., Yuan, J., Qian, C., Yang, C., Liu, Z., & Sun, M. (2025). Optima: Optimizing effectiveness and efficiency for LLM-based multi-agent system. In *Findings of the Association for Computational Linguistics: ACL 2025* (pp. 11534–11557). Association for Computational Linguistics. https://doi.org/10.18653/v1/2025.findings-acl.601 **[V-chính]**

Choi, H. K., Zhu, X., & Li, S. (2025). Debate or vote: Which yields better decisions in multi-agent large language models? *Advances in Neural Information Processing Systems (NeurIPS 2025)*. arXiv:2508.17536. https://arxiv.org/abs/2508.17536 **[V-thứ cấp: venue theo trường `comment` của arXiv ("NeurIPS 2025 Spotlight"); mới đọc trang tóm tắt arXiv (v2, 23/10/2025), kiểm ngày 3/11/2026]**

Geng, J., & Neubig, G. (2026). *Effective strategies for asynchronous software engineering agents* (arXiv:2603.21489) [Preprint]. https://arxiv.org/abs/2603.21489 **[đã đọc HTML 134.699 ký tự, thiếu Phụ lục C và D]**

Hadfield, J., Zhang, B., Lien, K., Scholz, F., Fox, J., & Ford, D. (2025, June 13). *How we built our multi-agent research system*. Anthropic. https://www.anthropic.com/engineering/multi-agent-research-system **[blog kỹ thuật, số liệu nội bộ]**

Hong, S., Zhuge, M., Chen, J., Zheng, X., Cheng, Y., Zhang, C., Wang, J., Wang, Z., Yau, S. K. S., Lin, Z., Zhou, L., Ran, C., Xiao, L., Wu, C., & Schmidhuber, J. (2024). MetaGPT: Meta programming for a multi-agent collaborative framework. *The Twelfth International Conference on Learning Representations (ICLR 2024)*. https://proceedings.iclr.cc/paper_files/paper/2024/hash/6507b115562bb0a305f1958ccc87355a-Abstract-Conference.html **[V-thứ cấp]**

Hu, Y., Cai, Y., Du, Y., Zhu, X., Liu, X., Yu, Z., Hou, Y., Tang, S., & Chen, S. (2025). Self-evolving multi-agent collaboration networks for software development. *The Thirteenth International Conference on Learning Representations (ICLR 2025)*. arXiv:2410.16946. https://proceedings.iclr.cc/paper_files/paper/2025/hash/39af4f2f9399122a14ccf95e2d2e7122-Abstract-Conference.html **[V-chính theo kết quả tìm kiếm; chưa mở trang]**

Huang, D., Zhang, J. M., Luck, M., Bu, Q., Qing, Y., & Cui, H. (2024). *AgentCoder: Multi-agent-based code generation with iterative testing and optimisation* (arXiv:2312.13010v3) [Preprint]. https://arxiv.org/abs/2312.13010

Kapoor, S., Stroebl, B., Siegel, Z. S., Nadgir, N., & Narayanan, A. (2025). AI agents that matter. *Transactions on Machine Learning Research*. https://openreview.net/forum?id=Zy4uFzMviZ **[V-thứ cấp]**

Khattab, O., Singhvi, A., Maheshwari, P., Zhang, Z., Santhanam, K., Vardhamanan, S., Haq, S., Sharma, A., Joshi, T. T., Moazam, H., Miller, H., Zaharia, M., & Potts, C. (2024). DSPy: Compiling declarative language model calls into state-of-the-art pipelines. *The Twelfth International Conference on Learning Representations (ICLR 2024)*. https://proceedings.iclr.cc/paper_files/paper/2024/hash/f1cf02ce09757f57c3b93c0db83181e0-Abstract-Conference.html **[V-chính theo kết quả tìm kiếm; bản arXiv dùng tên "…Self-Improving Pipelines"]**

Kim, Y., Park, C., Kim, T., Park, E., Schmidgall, S., Rahman, S., Park, C., Breazeal, C., Liu, X., Palangi, H., Park, H. W., & McDuff, D. (2026). *TeamBench: Evaluating agent coordination under enforced role separation* (arXiv:2605.07073) [Preprint]. https://arxiv.org/abs/2605.07073 **[mới đọc trang tóm tắt]**

Lumer, E., Nizar, F., Jangiti, A., Frank, K., Gulati, A., Phadate, M., & Subbiah, V. K. (2026). *Don't break the cache: An evaluation of prompt caching for long-horizon agentic tasks* (arXiv:2601.06007) [Preprint]. https://arxiv.org/abs/2601.06007 **[đã đọc HTML]**

Madaan, A., Tandon, N., Gupta, P., Hallinan, S., Gao, L., Wiegreffe, S., Alon, U., Dziri, N., Prabhumoye, S., Yang, Y., Gupta, S., Majumder, B. P., Hermann, K., Welleck, S., Yazdanbakhsh, A., & Clark, P. (2023). Self-Refine: Iterative refinement with self-feedback. *Advances in Neural Information Processing Systems 36 (NeurIPS 2023)*. arXiv:2303.17651. https://proceedings.neurips.cc/paper_files/paper/2023/hash/91edff07232fb1b55a505a9e9f6c0ff3-Abstract.html **[V-chính theo kết quả tìm kiếm; chưa mở trang]**

Qian, C., Dang, Y., Li, J., Liu, W., Xie, Z., Wang, Y., Chen, W., Yang, C., Cong, X., Che, X., Liu, Z., & Sun, M. (2024). Experiential co-learning of software-developing agents. In *Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)* (pp. 5628–5640). Association for Computational Linguistics. https://doi.org/10.18653/v1/2024.acl-long.305 **[V-chính]**

Ruan, Y., Dong, H., Wang, A., Pitis, S., Zhou, Y., Ba, J., Dubois, Y., Maddison, C. J., & Hashimoto, T. (2024). Identifying the risks of LM agents with an LM-emulated sandbox. *The Twelfth International Conference on Learning Representations (ICLR 2024)*. arXiv:2309.15817. https://arxiv.org/abs/2309.15817 **[V-thứ cấp]**

Shinn, N., Cassano, F., Berman, E., Gopinath, A., Narasimhan, K., & Yao, S. (2023). Reflexion: Language agents with verbal reinforcement learning. *Advances in Neural Information Processing Systems 36 (NeurIPS 2023)*. arXiv:2303.11366. https://mlanthology.org/neurips/2023/shinn2023neurips-reflexion

Wang, X., Li, B., Song, Y., Xu, F. F., Tang, X., Zhuge, M., Pan, J., Song, Y., Li, B., Singh, J., Tran, H. H., Li, F., Ma, R., Zheng, M., Qian, B., Shao, Y., Muennighoff, N., Zhang, Y., Hui, B., … Neubig, G. (2025). OpenHands: An open platform for AI software developers as generalist agents. *The Thirteenth International Conference on Learning Representations (ICLR 2025)*. arXiv:2407.16741. https://proceedings.iclr.cc/paper_files/paper/2025/hash/a4b6ad6b48850c0c331d1259fc66a69c-Abstract-Conference.html

Wu, Q., Bansal, G., Zhang, J., Wu, Y., Li, B., Zhu, E., Jiang, L., Zhang, X., Zhang, S., Liu, J., Awadallah, A. H., White, R. W., Burger, D., & Wang, C. (2024). AutoGen: Enabling next-gen LLM applications via multi-agent conversation. *First Conference on Language Modeling (COLM 2024)*. arXiv:2308.08155. https://arxiv.org/abs/2308.08155 **[V-thứ cấp; trang Microsoft Research liệt kê 13 tác giả, arXiv liệt kê 14 — dùng 14]**

Xia, C. S., Deng, Y., Dunn, S., & Zhang, L. (2025). Demystifying LLM-based software engineering agents. *Proceedings of the ACM on Software Engineering, 2*(FSE). https://doi.org/10.1145/3715754 **[V-BRIEF; chưa mở được DOI; tên bản arXiv:2407.01489 là "Agentless: Demystifying LLM-based software engineering agents"]**

Yan, W. (2025, June 12). *Don't build multi-agents*. Cognition. https://cognition.com/blog/dont-build-multi-agents **[blog ý kiến kỹ sư]**

Yan, W. (2026, April 22). *Multi-agents: What's actually working*. Cognition. https://cognition.com/blog/multi-agents-working **[đã mở và đọc; URL thử theo mẫu slug, tìm kiếm không trả URL gốc — mở lại xác nhận]**

Yang, C., Wang, X., Lu, Y., Liu, H., Le, Q. V., Zhou, D., & Chen, X. (2024). Large language models as optimizers. *The Twelfth International Conference on Learning Representations (ICLR 2024)*. arXiv:2309.03409. https://arxiv.org/abs/2309.03409 **[V-thứ cấp]**

Yang, J., Jimenez, C. E., Wettig, A., Lieret, K., Yao, S., Narasimhan, K., & Press, O. (2024). SWE-agent: Agent-computer interfaces enable automated software engineering. *Advances in Neural Information Processing Systems 37 (NeurIPS 2024)*. arXiv:2405.15793. https://papers.neurips.cc/paper_files/paper/2024/hash/5a7c947568c1b1328ccc5230172e1e7c-Abstract-Conference.html

Yuksekgonul, M., Bianchi, F., Boen, J., Liu, S., Lu, P., Huang, Z., Guestrin, C., & Zou, J. (2025). Optimizing generative AI by backpropagating language model feedback. *Nature, 639*(8055), 609–616. https://doi.org/10.1038/s41586-025-08661-4 **[V-BRIEF; chưa tự mở trang Nature; bản tiền in arXiv:2406.07496 mang tên "TextGrad: Automatic 'differentiation' via text", 7 tác giả, không có Pan Lu]**

Zhang, G., Yue, Y., Li, Z., Yun, S., Wan, G., Wang, K., Cheng, D., Yu, J. X., & Chen, T. (2025). Cut the crap: An economical communication pipeline for LLM-based multi-agent systems. *The Thirteenth International Conference on Learning Representations (ICLR 2025)*. arXiv:2410.02506. https://proceedings.iclr.cc/paper_files/paper/2025/hash/bbc461518c59a2a8d64e70e2c38c4a0e-Abstract-Conference.html

**Nguồn nội bộ (không phải tài liệu công bố; không trích nguyên văn khi công bố vì chưa ẩn danh hoàn toàn):** `docs/research/context/HISTORY.md`, `docs/PROCESS-REVIEW.md`, `docs/ARCHITECTURE.md`, `docs/TOOLS.md`, `docs/RUNTIMES.md`, `bench/vs-claude/README.md`, `docs/research/performance/token-analysis.md`, `docs/research/challenges.md`, `docs/research/self-improvement/design.md`. Dữ liệu: `bench/vs-claude/results/{runs,phases,calls,claude_turns}.csv` (C1–C7).

---

## Khai báo sử dụng AI

Bản thảo này được soạn với sự hỗ trợ của một trợ lý AI (mô hình Claude của Anthropic, chạy qua hệ CCoding — chính đối tượng được mô tả trong bài): AI tổng hợp bản nháp từ các tệp đầu vào do các hạng mục trước tạo ra (tổng quan tài liệu, báo cáo phân tích số liệu, bảng thách thức, thiết kế tự cải thiện), và chép số liệu từ các bảng đó. Tổng quan tài liệu cũng do AI thực hiện với công cụ tìm kiếm web; phần lớn nguồn chỉ được đọc ở mức tóm tắt. Ở vòng 2 (v0.3), AI viết lại phần kết quả theo bảng T-h, T-i, T-d do hạng mục phân tích số liệu cung cấp và thay danh mục tham khảo theo `references-v2.md`. Ở vòng 4 (v0.4), AI viết lại §5–§9 và phần Tóm tắt theo các tệp của `bench/vs-claude/results/study-cloud-final/` và `docs/research/analysis/`. AI **không** chạy benchmark mới và không tự chạy lại script phân tích trong hạng mục này. Tác giả (Tom) chịu trách nhiệm về nội dung: cần tự kiểm lại trích dẫn với bản gốc, đối chiếu số liệu với dữ liệu và mã, và đọc quy định liêm chính học thuật cũng như chính sách khai báo dùng AI của trường/hội nghị nơi nộp trước khi gửi. Đây là bản nháp, không phải bản công bố.
