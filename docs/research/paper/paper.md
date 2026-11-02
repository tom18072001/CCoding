# Hệ thống multi-agent CCoding cho lập trình: thiết kế, giới hạn sub-agent và đo chi phí–thời gian–cache so với một coding agent đơn

> **Bản thảo v0.1 (2/11/2026) — Phòng Nghiên cứu, hạng mục S6.** Chuẩn trích dẫn APA 7, dạng (Tác giả, năm). Phân loại dữ liệu: nội bộ; dự án ứng dụng thật được ẩn danh.
> **Bản đã đối chiếu:** `docs/research/BRIEF.md`; `performance/token-analysis.md` (S2, bảng T-0…T-f); `challenges.md` (S3, C-01…C-49, L1–L15); `self-improvement/design.md` v1.0 (S4); `related-work.md` (S1 + S5, 31 nguồn, mục "Kết luận điểm mới").
> **Quy ước số liệu:** mọi số hiệu năng (thời gian, chi phí, token, cache, tỉ lệ) lấy nguyên từ bảng T-a…T-f của `token-analysis.md`; mỗi bảng dưới đây ghi tên bảng nguồn và lệnh tái lập. Số đếm thách thức và tham số cấu hình lấy từ `challenges.md` và được ghi rõ. **C6 (kiểm chứng sửa `maxParallel`): chưa có dữ liệu** — không nội suy.
> **Nhãn nguồn:** hầu hết nguồn mới chỉ đọc ở mức tóm tắt (xem mục 9); khẳng định về nguồn đó chỉ ở mức tóm tắt.

---

## 1. Tóm tắt

**Tóm tắt (VI).** Bài này mô tả CCoding — một "văn phòng" nhiều agent AI cho lập trình và nghiên cứu (nhiều phòng ban, pha route → plan → discuss → finalize → execute → review → revise → synthesize, worktree con song song có tự gộp, review độc lập, runtime nhiều nhà cung cấp) — cùng các cơ chế giới hạn sub-agent (quyền công cụ 4 mức, hook chặn lệnh/đường dẫn/nhánh, giới hạn khảo sát, ngân sách token/thời gian/vòng sửa, `maxParallel`, chính sách dữ liệu theo nhãn). Chúng tôi so sánh CCoding với Claude Code thuần trên 5 bài có 461 test ẩn. **Kết quả chính mang tính âm tính:** chất lượng gần như ngang nhau (cả hai hệ gần đạt trọn test ẩn), nhưng ở thiết kế ban đầu CCoding chậm hơn và đắt hơn khoảng gấp đôi (vòng C1: thời gian +169,4 s, chi phí +0,610 USD). Làn nhanh (C5) thu hẹp khoảng cách thời gian (chênh lệch +21,1 s, khoảng tin cậy bootstrap chứa 0) nhưng chi phí vẫn cao hơn (+21,8%). Ghi cache của CCoding gấp 3,34–6,08 lần Claude Code tùy vòng, nên khoảng "2,8–4 lần" ban đầu chỉ đúng một phần; mô hình hồi quy cho thấy tiền tố prompt cố định không phải thủ phạm chính. Chúng tôi trình bày nhật ký 49 thách thức phân theo MAST cộng nhóm hạ tầng, và một thiết kế vòng tự cải thiện sub-agent có người duyệt (chưa có số đo hiệu quả). Mỗi ô đo chỉ có 1–2 lượt, nên mọi khoảng tin cậy chỉ mang tính minh họa. Về điểm mới, phần kiến trúc phần lớn trùng với công bố đã có (đặc biệt CAID và TeamBench); đóng góp tiềm năng nằm ở phép đo cache/token/thời gian theo pha và nhật ký vận hành, ở mức chắc chắn trung bình.

**Từ khóa:** hệ đa agent; coding agent; worktree song song; prompt caching; giới hạn sub-agent; MAST; tự cải thiện prompt.

**Abstract (EN).** We describe CCoding, a multi-department "office" of LLM agents for software and research tasks: phased orchestration (route, plan, discuss, finalize, execute, review, revise, synthesize), parallel child git worktrees with automatic merging, independent review with a revision loop, and multi-provider runtimes. We also document how the project owner constrains sub-agents (four tool-permission levels, command/path/branch/stdin hooks, read-before-write limits, token/time/revision budgets, `maxParallel`, label-based data policy). On five tasks with 461 hidden tests we compare CCoding with a plain Claude Code agent. **The headline result is negative:** quality is essentially equal, but the original design (round C1) was about twice as slow and twice as expensive (+169.4 s, +0.610 USD per run). A fast lane (round C5) narrows the time gap (+21.1 s, bootstrap interval includes zero) but cost remains higher (+21.8%). CCoding's cache-write volume is 3.34–6.08× that of Claude Code depending on the round, so the earlier "2.8–4×" figure holds only partly; a regression indicates that the fixed prompt prefix is not the main cause. We also report a log of 49 challenges classified with MAST categories plus an infrastructure category, and a design for a human-approved self-improvement loop for sub-agent prompts (no effect measured yet). With only 1–2 runs per cell, all intervals are illustrative. Most architectural ideas overlap with prior work (notably CAID and TeamBench); the potentially new contribution is a per-phase cache/token/time measurement against a single-agent baseline, with medium confidence.

**Keywords:** multi-agent systems; coding agents; parallel worktrees; prompt caching; sub-agent constraints; MAST; prompt self-improvement.

---

## 2. Giới thiệu

**Bối cảnh và vấn đề.** Các hệ nhiều agent LLM được kỳ vọng chia nhỏ công việc lập trình để làm song song và kiểm tra chéo, nhưng bằng chứng về lợi ích thực tế còn tranh cãi. Anthropic báo cáo hệ nghiên cứu đa agent vượt đơn agent Opus 4 ở mức 90,2% trên đánh giá nội bộ, đồng thời thừa nhận đa agent dùng gấp khoảng 15 lần token của chat và rằng hầu hết tác vụ lập trình có ít phần song song hơn nghiên cứu (Hadfield et al., 2025). Cognition lập luận ngược lại: các hành động mang quyết định ngầm và những quyết định xung đột cho kết quả xấu, nên khuyến nghị agent tuyến tính một luồng (Yan, 2025). Kapoor et al. (2024) nhắc rằng đánh giá agent chỉ nhìn độ chính xác mà bỏ qua chi phí là chưa đủ. Cemri et al. (2025) cho thấy lỗi hệ đa agent chủ yếu đến từ thiết kế và lệch phối hợp, không chỉ từ mô hình.

**Câu hỏi nghiên cứu.** Bài trả lời năm câu hỏi (RQ6 — công bố — được xử lý ở mục 3 và mục 7.3):

- **RQ1.** Hệ CCoding được thiết kế và điều phối như thế nào?
- **RQ2.** Chủ dự án giới hạn sub-agent bằng những cơ chế nào, và có bằng chứng hiệu quả gì?
- **RQ3.** CCoding so với một coding agent đơn về thời gian, token (vào/ra) và cache; khi nào multi-agent nhanh hơn; có tối ưu nào đáng làm?
- **RQ4.** Những thách thức và lỗi nào đã gặp, giải quyết ra sao, còn gì mở?
- **RQ5.** Làm thế nào để sub-agent tự cải thiện mỗi khi có vấn đề mà vẫn an toàn?

**Đóng góp (khai báo thận trọng).** (1) Mô tả một hệ multi-agent vận hành thật cùng các cơ chế giới hạn sub-agent (mục 4). (2) Một phép đo cache, token và thời gian theo pha so với Claude Code thuần, kèm kết quả âm tính (mục 6). (3) Nhật ký 49 thách thức phân loại theo MAST và hạ tầng (mục 7.1). (4) Một thiết kế vòng tự cải thiện có người duyệt, kèm bốn bản vá prompt là giả thuyết (mục 7.2). **Chúng tôi không nhận các ý tưởng kiến trúc sau là mới:** worktree riêng cho từng engineer có tự gộp và kiểm chứng bằng test (Geng & Neubig, 2026), tách quyền theo vai kèm verifier (Kim et al., 2026; Huang et al., 2024), quy trình cố định đơn giản (Xia et al., 2025), vòng phê bình–sửa (Madaan et al., 2023; Shinn et al., 2023), và tiền tố prompt ổn định để giữ cache (Lumer et al., 2026).

**Cấu trúc bài.** Mục 3 công trình liên quan; mục 4 hệ thống (RQ1–RQ2); mục 5 phương pháp đánh giá; mục 6 kết quả (RQ3); mục 7 thảo luận (RQ4–RQ5 và vị trí so với công bố); mục 8 đe dọa tính hiệu lực; mục 9 kết luận; mục 10 tài liệu tham khảo; cuối bài là khai báo dùng AI.

---

## 3. Công trình liên quan

Mục này tóm tắt `related-work.md` (31 nguồn). **Giới hạn mức đọc:** 7/31 nguồn được mở trang, 24/31 chỉ đọc tóm tắt, không nguồn nào đọc toàn văn; mọi số của nguồn khác là số tự báo cáo, không so sánh chéo giữa các bài.

**Khung đa agent và coding agent.** MetaGPT dùng quy trình chuẩn (SOP) làm prompt cho các agent theo vai (Hong et al., 2024); AutoGen cung cấp khung hội thoại đa agent (Wu et al., 2023). SWE-agent chứng minh thiết kế giao diện agent–máy tính là biến quan trọng (J. Yang et al., 2024); OpenHands là nền tảng mở có sandbox và tích hợp benchmark (Wang et al., 2025). Agentless thay agent tự do bằng quy trình cố định định vị → sửa, báo cáo chi phí thấp (Xia et al., 2025). AgentCoder tách người thiết kế test khỏi người viết mã (Huang et al., 2024).

**Hai công bố gần nhất (2026).** CAID (Geng & Neubig, 2026) dùng manager lập kế hoạch có phụ thuộc, mỗi engineer một git worktree, tích hợp bằng `git merge` và kiểm chứng bằng test. Tác giả báo cáo điểm cao hơn nhưng **thời gian không giảm đáng kể và chi phí cao hơn** (PaperBench, Claude Sonnet 4.5: đơn agent 57,2 điểm/1803,5/3,3; CAID 63,3/2080,4/9,3; đơn vị runtime và chi phí không được ghi nhãn trong bảng — theo văn bản, runtime tính bằng giây). *Lưu ý phiên bản:* mức tăng điểm tuyệt đối là +26,7/+14,3 ở bản HTML v1 nhưng +25,6/+14,7 ở trang tóm tắt hiện hành; chúng tôi chỉ trích số của bảng. TeamBench (Kim et al., 2026) tách Planner/Executor/Verifier bằng quyền hệ điều hành; đội chỉ-prompt và đội cưỡng chế bằng sandbox có tỉ lệ đạt không khác biệt có ý nghĩa thống kê, nhưng verifier chấp nhận khoảng 49% bài nộp mà bộ chấm xác định loại, và giá trị của đội phụ thuộc độ khó nền.

**Tranh luận multi vs single.** Hadfield et al. (2025) ủng hộ song song cho truy vấn rộng nhưng thừa nhận mã ít song song; Yan (2025) chống song song ghi. CCoding đặt giữa hai quan điểm: song song hạng mục độc lập nhưng có gộp và review. *(Bài tiếp theo của Cognition năm 2026 chỉ thấy qua nguồn thứ cấp, chưa kiểm chứng — không dùng làm căn cứ.)*

**Phân tích lỗi và đánh giá.** MAST xếp 14 kiểu lỗi hệ đa agent vào ba nhóm — đặc tả/thiết kế, lệch phối hợp, kiểm chứng/kết thúc — dựa trên hơn 1.600 vết (Cemri et al., 2025); chúng tôi chỉ dùng tên ba nhóm vì chưa đọc toàn văn. Kapoor et al. (2024) đề xuất tối ưu chung chi phí–độ chính xác và cảnh báo holdout yếu.

**Token, cache và giao tiếp.** AgentPrune cắt thông điệp dư giữa agent để giảm token (Zhang et al., 2025); Optima huấn luyện mô hình nhỏ để cân bằng hiệu quả tác vụ và token (Chen et al., 2025). Lumer et al. (2026) đo prompt caching trên tác vụ nghiên cứu web một agent ở ba nhà cung cấp (giảm chi phí API 41–80%) và khuyến nghị đặt nội dung động ở cuối prompt; đây là cùng ý với đề xuất O1 của chúng tôi, **nhưng không phải coding multi-agent**, không đo theo pha và không so với Claude Code thuần.

**Tự cải thiện prompt/agent.** Self-Refine (Madaan et al., 2023) và Reflexion (Shinn et al., 2023) cải thiện trong một tác vụ nhờ phản hồi ngôn ngữ; DSPy (Khattab et al., 2023), OPRO (C. Yang et al., 2024) và TextGrad (Yuksekgonul et al., 2024) tối ưu prompt/pipeline theo một hàm điểm; EvoMAC tiến hoá mạng agent phần mềm theo phản hồi kiểm thử trong từng tác vụ (Hu et al., 2024); Experiential Co-Learning tái dùng kinh nghiệm quá khứ (Qian et al., 2024). Các phương pháp này tự động và cần hàm điểm rẻ hoặc nhiều mẫu.

**An toàn và quyền.** ToolEmu đo rủi ro khi agent có công cụ nhưng không đề xuất cơ chế chặn lúc chạy (Ruan et al., 2024); TeamBench cưỡng chế tách quyền bằng hệ điều hành (Kim et al., 2026).

**Vị trí của bài (từ mục "Kết luận điểm mới", mức chắc chắn kèm theo).** *Đã có — không nhận là mới:* E1 worktree + gộp + test (CAID); E2 tách quyền/verifier (TeamBench, AgentCoder); E3 vòng phê bình–sửa; E7 tiền tố ổn định (Lumer et al., 2026); E8 quy trình cố định (Agentless); E10 phân loại lỗi theo MAST. *Có thể mới:* N1 đo cache/token/thời gian theo lượt gọi và pha so với Claude Code thuần (**trung bình**); N5 nhật ký thách thức từ hệ vận hành thật (**trung bình**); N3 làn nhanh/làn đầy (**trung bình–thấp**, chưa tìm riêng chủ đề routing); N2 đo tách O1–O6 (**thấp–trung bình**, hiện chỉ ước lượng); N4 vòng tự cải thiện có người duyệt (**thấp–trung bình**, chưa có số đo); N6 quản trị dữ liệu trong hệ coding (**thấp**, đặc điểm hệ thống hơn là kết quả). Các mức này nghĩa là "chưa thấy trong phần đã đọc", **không phải "chưa ai làm"**.

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
2. *Worktree con song song + tự gộp + giải xung đột.* Mỗi hạng mục có worktree con riêng tách từ nhánh nhiệm vụ; CCoding tự gộp `--no-ff`; xung đột được giải trong một worktree con mới (`tools.resolveRounds` = 2, rồi dự phòng tuần tự); phụ thuộc thư viện được cài lại khi tệp khai báo đổi (C-16 – C-19). Ý tưởng worktree-per-engineer đã có ở CAID (Geng & Neubig, 2026); chúng tôi cài đặt độc lập.
3. *Review độc lập + đo của hệ thống.* Reviewer không phải người làm; CCoding tự chạy `setupCommands`/`checkCommands` ở baseline, sau thực thi và sau mỗi vòng sửa; hồi quy so với baseline thì không duyệt dù reviewer ghi duyệt; chạy lại khi workspace đổi sau lần đo gần nhất (C-27, C-28).
4. *Làn nhanh và làn đầy.* Việc nhỏ đi làn nhanh: bỏ họp, kế hoạch được định hình lại (`shapeFastPlan`), `maxParallel` nâng bằng số hạng mục độc lập (tối đa 4) (C-12); lead dùng Sonnet thay vì Opus (T-e0, T-e). Việc lớn đi làn đầy.
5. *Chuẩn bị song song.* Lệnh chuẩn bị + baseline chạy song song với lập kế hoạch (C-10).

### 4.2 Cơ chế giới hạn sub-agent (RQ2)

Chủ dự án giới hạn sub-agent theo bốn chiều: *cái gì được làm* (quyền), *bao nhiêu* (ngân sách, số hạng mục, vòng sửa), *ở đâu* (thư mục làm việc, nhánh, nhãn dữ liệu) và *khi nào dừng* (giới hạn khảo sát, thời gian). Bảng 1 tóm tắt 15 cơ chế (L1–L15 trong `challenges.md` §2, nơi có chi tiết và nguồn); cột cuối chỉ nêu bằng chứng hiệu quả đã có hay "chưa đo".

**Bảng 1.** Cơ chế giới hạn sub-agent. Nguồn: `challenges.md` §2 (không phải bảng S2); tham số theo `src/config.ts` mặc định, có thể bị cấu hình cục bộ ghi đè.

| # | Cơ chế | Giới hạn cụ thể | Bằng chứng hiệu quả |
|---|---|---|---|
| L1 | Quyền công cụ 4 mức | `none · read · write · exec` = giao của hồ sơ agent, quyền dự án và pha | Gián tiếp; chưa có đối chứng trước/sau |
| L2 | Hook `claude-guard` — lệnh | Chặn lệnh cấm, `git push`, `reset --hard`, đổi nhánh, rebase, `.env` | Một lượt thử chặn đúng một lần; số chặn đúng/nhầm toàn bộ: chưa đo |
| L3 | Hook — đường dẫn | Công cụ tệp chỉ trong thư mục làm việc; lệnh shell chặn đường dẫn tuyệt đối/`../` vượt gốc | Kiểm theo mẫu chuỗi, **không phải sandbox hệ điều hành**; chưa kiểm thử đối kháng |
| L4 | Hook — nhánh/worktree | Không tạo/chuyển/xóa nhánh; chỉ `git merge` vào nhánh hiện tại | Sự cố nhầm nhánh không ghi lại sau khi sửa; thống kê đầy đủ: chưa đo |
| L5 | Hook — stdin | Bọc lệnh Bash với `</dev/null` | Trước: một lượt treo 579 s (T-a, C5 t3 lượt 1); sau: không tái diễn ở hai bài tiếp (n nhỏ — minh họa) |
| L6 | Giới hạn khảo sát | `readsBeforeWrite` = 16 (nhắc), chặn từ 32; nhắc ở 35%/65% ngân sách công cụ | Nền: 48–70 lần đọc trước lần ghi đầu; hiệu quả sau: chưa đo |
| L7 | Ngân sách token | `budgetTokens` 1.500.000; theo hạng mục none 60k · read 120k · write 200k · exec 300k; theo vòng công cụ | Không có đối chứng; gói dài vẫn tốn nhiều token |
| L8 | Ngân sách thời gian/lượt | `timeoutMs` 30 phút; `toolTurns` 40/16/10; hủy khi treo 5 phút | Từng sự cố có bằng chứng riêng; tỉ lệ chạm trần: chưa đo |
| L9 | Số hạng mục / lần chạy | `maxContinuations` 2; cảnh báo hạng mục chạy lần 3, 5… | Chưa có thống kê |
| L10 | Vòng sửa | `maxRevisions` 1 | Dự án ứng dụng: 5/7 gói cần đúng 1 vòng (định tính) |
| L11 | `maxParallel` | Mặc định 3; làn nhanh tối đa 4; mỗi agent một hạng mục một lúc | **C6: chưa có dữ liệu** |
| L12 | Cách ly cấu hình người dùng | `--strict-mcp-config --setting-sources project,local`; bỏ biến khóa khỏi môi trường | Ngữ cảnh mỗi lượt 93k → 7,6k token (số đo đơn lẻ, chưa lặp lại) |
| L13 | Data Protection Gate | Nhãn dữ liệu quyết định runtime được phép; che PII/bí mật trong log; nhật ký chuỗi băm | Cấu hình có thật; số lần chặn đúng: chưa đo |
| L14 | KPI | 4 nhóm (Chất lượng 40 · Hiệu quả 25 · Tin cậy 20 · Tuân thủ 15); "việc cần sửa" tự sinh | Phát hiện lỗi đo KPI → sửa; tác động lên hành vi lượt sau: chưa đo |
| L15 | Review độc lập + lệnh kiểm tra tự chạy | Hồi quy ⇒ không duyệt; cờ "cần xem" khi reviewer không chạy lệnh | Bắt lỗi thật ở một dự án (định tính); tỉ lệ bắt/dương tính giả: chưa đo |

**Nhận xét.** Phần lớn cơ chế được thêm *sau* một sự cố cụ thể (cột "Thách thức liên quan" trong `challenges.md`); với đa số, chúng tôi chưa có phép đo trước/sau có đối chứng. Vì vậy mục này mô tả cơ chế và bằng chứng sự cố, **không khẳng định hiệu quả định lượng**. Hai giới hạn nên nói thẳng: hook chỉ kiểm theo mẫu chuỗi (không thay sandbox HĐH), và ngân sách token không ngăn được chi phí cao khi chuỗi phụ thuộc dài.

---

## 5. Phương pháp đánh giá

**Thiết kế.** So sánh hai hệ trên cùng đề, cùng repo xuất phát: (a) Claude Code chạy một mình (`claude -p`, mô hình Opus) và (b) CCoding (dự án mới cho mỗi lượt, quyền `exec`, worktree, `checkCommands: ["npm test"]`, runtime `claude-cli`). Cả hai chạy với cách ly cấu hình người dùng như nhau; mỗi hệ chạy **tuần tự** (hai nhiệm vụ CCoding cùng lúc làm nhiễu thời gian vì tranh agent) (`bench/vs-claude/README.md`).

**Bộ bài (5 bài, 461 test ẩn).** `t1-duration` (module theo đặc tả dày quy tắc, 149 test), `t2-orders` (sửa 6 lỗi khách báo, 60), `t3-api` (4 tính năng trên API sẵn có, 87), `t4-perf` (tối ưu hiệu năng, kết quả giống từng byte, 19), `t5-logq` (công cụ nhiều module từ đặc tả, 146). Test ẩn được chấm tự động bằng `node --test` và cả hai hệ không thấy; thời gian trung bình mỗi lượt chạy từ 91 đến 446 s (T-a), tức **không có bài nào dài hơn 15 phút**.

**Các vòng.** C1–C2 = mốc ban đầu (họp, tổng hợp bằng Opus); C3–C4 = bước trung gian; C5 = làn nhanh; **C6 = kiểm chứng sửa `maxParallel` — chưa có dữ liệu**. Hệ Claude chỉ có đối chứng cùng vòng ở C1, C2, C5.

**Số đo.** Thời gian tường, chi phí quy đổi theo giá niêm yết do Claude Code báo, token vào/ra, đọc/ghi cache (tổng cả lượt chạy — `runs.csv`, nguồn chuẩn), số test ẩn đạt. Với CCoding còn có số liệu theo từng lượt gọi agent và pha (`calls.csv`, `phases.csv`); với Claude Code, theo từng lượt mô hình (`claude_turns.csv`, ghi cache TTL 1 giờ/5 phút). Hai tệp này khác độ mịn nên chỉ so ở mức lượt chạy (T-0). Đối chiếu tổng: 29/29 lượt CCoding và 20/20 lượt Claude khớp (T-0).

**Phân tích (khai báo trước khi tính, theo `token-analysis.md` §2).** (1) Baseline = Claude Code cùng vòng. (2) Đường găng theo pha từ `ts` và `duration_s` (T-d). (3) Mô hình ghi cache theo lượt gọi bằng hồi quy bình phương tối thiểu (T-e1) và giá hiệu dụng suy ra (T-e0). (4) Ước lượng định lượng sáu đề xuất tối ưu O1–O6 trên dữ liệu có sẵn, **không chạy lại hệ thống** (T-e). (5) Bootstrap phân tầng theo bài, B = 10 000, seed = 20261102 (T-f) — **chỉ minh họa** vì mỗi ô có 1–2 lượt, và không hiệu chỉnh so sánh bội. (6) Tham số giả định đặt cố định (`charsPerToken` = 3,5; O3 = 30%; O4 = 50%; O5 = 20%).

**Tái lập.** Node ≥ 22, không phụ thuộc ngoài, chạy offline, đầu ra xác định:

```bash
node docs/research/performance/scripts/token-analysis.mjs                  # toàn bộ bảng
node docs/research/performance/scripts/token-analysis.mjs --table T-b      # một bảng
node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md
```

*Chúng tôi chưa tự chạy lệnh này trong hạng mục viết bài; số liệu được chép từ `token-analysis.md`, nơi S2 báo `--check` khớp cả 9 bảng.*

---

## 6. Kết quả (RQ3)

### 6.1 Chất lượng ngang nhau; khác biệt nằm ở thời gian và chi phí

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
| C6 | – | chưa có dữ liệu | chưa có dữ liệu | chưa có dữ liệu |

*Ghi chú:* ở C5, trung bình t3 của CCoding (400 s) gồm một lượt 579 s do lỗi treo stdin và một lượt 221 s. Ở C2, hai biến thể t1 của CCoding (n = 1 mỗi biến thể) không có đối chứng Claude cùng vòng nên không đưa vào bảng. C3 và C4 không có đối chứng Claude cùng vòng (T-a, T-f).

**Chất lượng.** Cả hai hệ gần như đạt trọn test ẩn ở mọi vòng; mỗi hệ rớt đúng một test ở một số lượt (Claude 297/298 ở `t1` C1 và C5; CCoding 59/60 ở `t2` C4) (T-a). **Chất lượng không phải lợi thế đo được trong 5 bài này**, nên so sánh quy về thời gian và chi phí.

### 6.2 Kết quả âm tính: thiết kế ban đầu chậm hơn và đắt hơn khoảng gấp đôi

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
| C6 | – | – | – | chưa có dữ liệu | | | |

**Đọc kết quả.** (i) Ở C1 và C2 — thiết kế ban đầu — CCoding chậm hơn và đắt hơn ở mọi bài có đối chứng, và khoảng tin cậy không chứa 0 theo hướng đó (Bảng 2, 3). (ii) Ở C5 (làn nhanh), chênh lệch thời gian là +21,1 s với CI chứa 0, tức không phân biệt được với bằng nhau. Dòng loại ngoại lệ đổi hướng (−14,7 s) nhưng đó là **phân tích độ nhạy chọn sau khi thấy dữ liệu**, nên kết luận về thời gian ở C5 nhạy với một lượt chạy. (iii) Chi phí C5 vẫn cao hơn +21,8%; chỉ một ô (`t4`) thấp hơn Claude (0,574 so với 0,627 USD, Bảng 2). (iv) Ở C5, CCoding nhanh hơn ở t1, t4, t5 nhưng chậm hơn ở t2 (106 so với 91 s) và t3 (400 so với 158 s). **Với bài nhỏ, CCoding không có lợi thế chi phí, và lợi thế thời gian chưa được chứng minh.** Hai hệ còn khác cấu hình mô hình (Claude Code: Opus; CCoding ở C5: Sonnet), nên so sánh là của cả hệ thống, không tách hiệu ứng multi-agent khỏi hiệu ứng mô hình (`token-analysis.md` §5).

### 6.3 Song song hóa: có tác dụng nhưng chỉ ở pha execute

**Bảng 4.** Đường găng theo lượt chạy. Nguồn: **T-d** phần (2). Lệnh tái lập: `node docs/research/performance/scripts/token-analysis.mjs --table T-d`.

| Vòng | Số lượt chạy | Thời gian tường TB (s) | Σ tuần tự LLM TB (s) | Đường găng LLM TB (s) | Tiết kiệm nhờ song song TB (s) | Ngoài LLM TB (s) | Tiết kiệm / tuần tự (%) |
|---|---:|---:|---:|---:|---:|---:|---:|
| C1 | 8 | 341 | 353 | 308 | 45 | 33 | 12.9 |
| C2 | 4 | 339 | 351 | 289 | 62 | 50 | 11.6 |
| C3 | 2 | 190 | 169 | 169 | 0 | 20 | 0.0 |
| C4 | 5 | 195 | 247 | 183 | 64 | 12 | 25.0 |
| C5 | 10 | 188 | 265 | 187 | 78 | 1 | 30.5 |
| C6 | chưa có dữ liệu | | | | | | |

Theo pha (T-d phần 1), chỉ `execute` có song song; hệ số tăng từ 1.27 (C1) lên 2.02 (C5) khi làn nhanh chạy cùng lúc các hạng mục độc lập. Sau khi song song hóa, `review` (81.3 s) trở thành pha dài nhất ở C5, lớn hơn đường găng của `execute` (76.9 s). C3 chỉ có một hạng mục nên không có song song. Đây là mô tả; **tác động của sửa `maxParallel` (C6) chưa được kiểm chứng**.

*Khi nào multi-agent nhanh hơn?* Trên dữ liệu có (n nhỏ, một mô hình lead, 5 bài vài trăm giây), chỉ khi chia được hạng mục độc lập để chạy song song; điều này là *giả thuyết cần thí nghiệm*, chưa phải kết quả. Chưa loại trừ lợi ích với bài dài hơn (nhiều hạng mục, > 15 phút), vì dữ liệu hiện tại không có bài như vậy (`token-analysis.md` §4).

### 6.4 Cache và token: "gấp 2,8–4 lần" chỉ đúng một phần

**Bảng 5.** Tỉ lệ ghi cache CCoding / Claude (gộp theo vòng). Nguồn: **T-b** (hàng "GỘP"). Lệnh tái lập: `node docs/research/performance/scripts/token-analysis.mjs --table T-b`.

| Vòng | Hệ CCoding | Ghi cache CC TB | Ghi cache Claude TB | Tỉ lệ ghi cache | Tỉ lệ đọc cache | Tỉ lệ output | Tỉ lệ chi phí | Lượt gọi agent / lượt chạy |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| C1 (gộp 4 bài) | ccoding | 132 163 | 28 033 | 4.71 | 1.85 | 2.58 | 1.97 | 6.3 |
| C2 (gộp 1 bài) | ccoding | 249 170 | 40 951 | 6.08 | 2.10 | 2.71 | 2.07 | 12.5 |
| C5 (gộp 5 bài) | ccoding-fastlane | 98 282 | 29 423 | 3.34 | 1.92 | 1.81 | 1.22 | 5.0 |
| C6 | – | chưa có dữ liệu | | | | | | |

Theo từng ô có đối chứng, tỉ lệ ghi cache nằm trong 2.76–6.08 và 5/10 ô trong khoảng 2,8–4 (T-b). Với thiết kế hiện hành (C5), con số khớp (3.34×); với thiết kế ban đầu thì lệch (4.71× ở C1, 6.08× ở C2). Ghi cache của Claude Code đều là TTL 1 giờ (T-0). Cơ chế quan sát được: Claude chạy một tiến trình, còn CCoding chạy 5.0–6.3 lượt gọi mỗi lượt chạy với 19 656–21 146 token ghi cache mỗi lượt gọi (T-b), nên tổng tăng theo **số lượt gọi nhân với nội dung mỗi lượt gọi tự ghi**. Đây là liên hệ mô tả, không phải bằng chứng nhân quả.

**Bảng 6.** Tỷ trọng ghi cache theo pha (CCoding). Nguồn: **T-c**. Lệnh tái lập: `node docs/research/performance/scripts/token-analysis.mjs --table T-c`.

| Vòng | plan | discuss | finalize | execute | review | revise | synthesize |
|---|---:|---:|---:|---:|---:|---:|---:|
| C1 | 13.0% | 6.3% | 3.7% | 50.1% | 16.9% | – | 9.8% |
| C5 | 14.5% | – | – | 60.0% | 24.0% | 1.4% | – |

`execute` chiếm phần lớn ghi cache; `review` chiếm 16.9% (C1) và 24.0% (C5) dù output của reviewer nhỏ, do `prompt_chars` (12 921 ký tự ở C5) và `tool_output_chars` (17 783) lớn, tức reviewer đọc nhiều (T-c). Σ retries = 0 ở mọi pha.

**Tiền tố prompt không phải thủ phạm chính.** Hồi quy cache_write ≈ F + a·(Σ *_chars/3,5) + b·output trên 170 lượt gọi cho F = 2 588 token mỗi lượt gọi (hệ số a = 1.50, b = 1.16, R² = 0.716) (**T-e1**; lệnh: `… --table T-e1`). Phần cố định nhỏ so với 19 656–21 146 token ghi mỗi lượt gọi, nên lượng ghi lớn đến từ nội dung (đầu ra và kết quả công cụ bị ghi lại ở mỗi tiến trình). Đây là tương quan, phụ thuộc giả định `charsPerToken`, và R² 0.716 nghĩa là một phần ghi cache chưa được giải thích.

### 6.5 Sáu đề xuất tối ưu: ước lượng, chưa kiểm chứng

**Bảng 7.** Ước lượng độc lập cho O1–O6. Nguồn: **T-e** (nền T-e0 giá hiệu dụng: opus 20.08 / sonnet 9.73 USD/triệu token output). Lệnh tái lập: `node docs/research/performance/scripts/token-analysis.mjs --table T-e`.

| Mã | Đề xuất | Tiết kiệm ước tính / lượt chạy (USD) | % chi phí CCoding |
|---|---|---:|---:|
| O1 | Tiền tố prompt ổn định dùng chung cache | 0.041 | 5.1 (trần trên) |
| O2 | Tái dùng phiên execute → revise | 0.006 | 0.7 (trần trên; chỉ 1 lượt revise) |
| O3 | Rút gọn ngữ cảnh 30% | 0.002 | 0.2 |
| O4 | Reviewer chỉ nhận diff + kết quả lệnh kiểm tra | 0.022 | 2.8 |
| O5 | Giới hạn đầu ra (plan/review/synthesize) | 0.014 | 1.7 |
| O6 | Mô hình theo pha: opus → sonnet ở lượt gọi lead | 0.257 | 20.7 (nền C1, không phải C5) |

Nền C5: 10 lượt chạy CCoding, chi phí Σ calls.csv = 8.042 USD; theo giá hiệu dụng, đầu ra = 38.1%, ghi cache = 49.4%, đọc cache = 10.2%. O1–O5 tính trên nền C5, O6 trên nền C1; **mỗi dòng độc lập, không cộng gộp** (O3 và O4 chồng lấn). Đây là mô hình giả định, chưa chạy lại hệ thống, và không ước lượng được tác động lên thời gian. Hàm ý: (a) O6 lớn nhất nhưng **đã được hiện thực** trong làn nhanh (C5 dùng Sonnet ở mọi pha), và chất lượng của thay đổi này chưa được đo riêng; (b) O1–O5 mỗi cái ≤ 5.1% chi phí, nên tinh chỉnh tiền tố không phải đòn bẩy chính; (c) O3 gần như vô ích vì `context_chars` nhỏ (khoảng 1 200 ký tự ở C5); (d) đòn bẩy thực nằm ở giảm số tiến trình và lượng tệp/công cụ đọc lặp. Điểm (d) là diễn giải của chúng tôi từ T-c và T-e, chưa được kiểm thử.

---

## 7. Thảo luận

### 7.1 Thách thức và lỗi (RQ4)

`challenges.md` ghi **49 thách thức** (C-01…C-49) với triệu chứng, nguyên nhân gốc, cách giải quyết, bằng chứng (hash commit hoặc mục tài liệu) và trạng thái. Phân nhóm theo ba nhóm lỗi của MAST (Cemri et al., 2025) cộng nhóm hạ tầng INF do chúng tôi thêm vì MAST không bao phủ lỗi do hạ tầng. Việc xếp từng thách thức vào nhóm là **phán đoán của một tác giả**, chưa có người thứ hai gán độc lập.

**Bảng 8.** Số thách thức theo nhóm × trạng thái. Nguồn: `challenges.md` §3 (không phải bảng S2).

| Nhóm | Đã đóng | Giảm nhẹ | Còn mở | Tổng |
|---|---:|---:|---:|---:|
| FM-1 Đặc tả/thiết kế (C-01…C-14) | 4 | 8 | 2 | 14 |
| FM-2 Lệch phối hợp (C-15…C-23) | 6 | 2 | 1 | 9 |
| FM-3 Kiểm chứng/kết thúc (C-24…C-32) | 7 | 2 | 0 | 9 |
| INF Hạ tầng/runtime/nhà cung cấp (C-33…C-49) | 9 | 7 | 1 | 17 |
| **Tổng** | **26** | **19** | **4** | **49** |

Số này là số sự cố *được ghi lại*, không phải tần suất; nhóm FM-3 có thể được ghi đầy đủ hơn vì review độc lập tạo bằng chứng. Mô tả theo nhóm (mức bằng chứng: mô tả, không suy diễn nhân quả):

- **FM-1 (thiết kế).** Ngân sách là trần cứng không có trạng thái tạm dừng (C-01); pha họp tốn token nhiều mà ít output (C-02); họp chủ yếu *thêm* phụ thuộc "cho chắc", kéo dài đường găng (C-03); giao việc cần shell cho agent không có shell (C-04); chia việc theo thứ tự làm thay vì theo giao diện/hợp đồng nên chuỗi phụ thuộc gần tuyến tính (C-09). Chính kết quả benchtest (CCoding chậm hơn và đắt hơn trên cả 5 bài, C-11) và việc `maxParallel` mặc định nhỏ hơn số hạng mục độc lập (C-12) cũng nằm ở nhóm này. Đây là nhóm có nhiều mục "giảm nhẹ" nhất, thường chỉ dựa trên mô phỏng hoặc một lượt thử.
- **FM-2 (phối hợp).** Nhiều agent dùng chung worktree đè lên nhau (C-15, C-16); xung đột khi gộp và trạng thái phụ thuộc không đi theo nhánh (C-17 – C-19); agent khảo sát mãi không ghi (C-20); tranh agent khi chạy hai nhiệm vụ cùng lúc (C-23, còn mở). Nhận xét: những lỗi này hợp với lập luận của Yan (2025) rằng hành động song song mang quyết định ngầm có thể xung đột — CCoding giảm nhẹ bằng hợp đồng trong `decisions`, worktree tách và review, nhưng **xung đột ngữ nghĩa khi gộp chưa được kiểm thử** (vấn đề P-10 trong `challenges.md`).
- **FM-3 (kiểm chứng).** Model yếu phá mã rồi báo "đã sửa" (C-24); review rỗng bị tính là duyệt (C-25); nhiệm vụ báo xong dù còn hạng mục lỗi (C-26); review dựa trên kết quả kiểm tra cũ (C-28); KPI tính lỗi hạ tầng vào điểm agent (C-30). Nhóm này được đóng gần hết (7/9). Lưu ý TeamBench báo verifier chấp nhận khoảng 49% bài nộp mà bộ chấm loại (Kim et al., 2026); CCoding **chưa đo** tỉ lệ duyệt nhầm của reviewer, và đây là điểm cần đo.
- **INF (hạ tầng).** Cổng LLM dùng chung không được phép (C-33), runtime miễn phí không dùng nổi (C-34), vòng tự tiếp tục không có trần (C-35), lỗi 429 và bọc mã lỗi (C-36, C-37), mất kết nối giữa vòng công cụ (C-38), runtime không cache (C-40 – C-42), hook chỉ kiểm theo mẫu chuỗi (C-46), lệnh treo stdin (C-47), hạn mức 5 giờ và hệ điều hành chậm (C-49). Phần cache (C-13) vẫn còn mở và là động lực của mục 6.4.

**Vấn đề còn tồn tại** (P-01…P-15, `challenges.md` §4), theo mức ảnh hưởng do tác giả đánh giá, gồm: chi phí cache chưa có biện pháp đã kiểm chứng (P-01); tự cải thiện còn thủ công (P-02); hook không phải sandbox (P-03); benchtest nhỏ (P-09); C6 chưa có (P-07); phân nhóm do một người gán (P-14); và ẩn danh chưa đủ ở một số tài liệu nguồn nội bộ (P-13) — nên các tệp đó không được trích nguyên văn khi công bố.

### 7.2 Thiết kế tự cải thiện sub-agent (RQ5)

**Hiện trạng.** Cải thiện sub-agent hoàn toàn thủ công: giám đốc chấm 👍/👎 hoặc nhắc agent, tối đa 5 góp ý được chèn vào cuối system prompt; KPI sinh "việc cần sửa" nhưng không có nhật ký sự cố có cấu trúc, A/B hay rollback (C-14; `design.md` §1).

**Phương án đã cân nhắc.** (A) chỉ góp ý thủ công — giữ làm kênh phụ; (B) agent tự sửa prompt rồi dùng ngay — **loại** vì không kiểm soát, không truy vết, có thể lách quy tắc an toàn; (C) đề xuất → A/B → giám đốc duyệt → áp dụng có phiên bản — **chọn** (`design.md` §2).

**Vòng 7 bước** (`design.md` §3): (1) phát hiện từ các tín hiệu đã có trong mã (review `blocker/major`, hồi quy lệnh kiểm tra, reviewer không chạy lệnh, KPI tái diễn, hạng mục chạm trần, 👎 của giám đốc; lỗi hạ tầng không tạo sự cố prompt); (2) nhật ký sự cố có cấu trúc ghi qua `LogStore` (che PII/bí mật, chuỗi băm), bằng chứng ≥ 1 mục truy được, gắn mã C-xx; (3) nguyên nhân gốc, chỉ xét cụm *tái diễn* (đề xuất ≥ 3 sự cố trong ≥ 2 nhiệm vụ — ngưỡng giả định chưa kiểm chứng) và chỉ giữ nguyên nhân thuộc prompt; (4) bản vá dạng unified diff một-mục-tiêu, ghi mã C-xx/O-x, giả thuyết, chỉ số, cách đo; (5) cổng A/B; (6) giám đốc duyệt, không có hạn tự duyệt; (7) áp dụng bằng commit riêng có thẻ phiên bản, rollback bằng `git revert`.

**Cổng A/B** (`design.md` §5): so sánh có cặp A = prompt hiện hành, B = A + một bản vá; chỉ số chính là token quy đổi mỗi lượt chạy và số test ẩn đạt; pha thăm dò 5 bài × 3 lượt × 2 nhánh (chỉ để loại), pha xác nhận 5 bài × 6 lượt × 2 nhánh; kiểm định hoán vị phân tầng hoặc mô hình hỗn hợp theo bài, Holm cho ba chỉ số chính; ngưỡng khai báo trước; **bộ bài giữ lại** (≥ 3 bài mới, dùng một lần) để chống overfit vì sự cố được rút ra từ chính t1–t5. Số lượt là kế hoạch cần xác nhận, chưa tính công suất.

**Bốn bản vá mẫu** (nhắm `src/prompts.ts`): P1 giới hạn độ dài báo cáo bàn giao (O5; C-02, C-13), P2 dừng khảo sát sau khoảng 8 lần đọc chưa ghi (O3; C-20), P3 reviewer chỉ đọc diff và tệp nêu tên (O4; C-27, C-28), P4 lượt sửa ghi ≤ 3 dòng nhật ký sự cố (thu dữ liệu). **P1–P3 là giả thuyết tối ưu, chưa có số đo; P4 là bản vá thu dữ liệu. Chưa có bản vá nào được áp dụng hay đo.** Chưa chạy kiểm tra áp dụng (`git apply --check`), nên cần người có quyền chạy lệnh xác nhận.

**An toàn.** Mặc định tắt; không tự áp khi chưa duyệt; agent không ghi vào `agents/`, `src/` hay cấu hình, chỉ phát đề xuất dạng văn bản, coi là dữ liệu không đáng tin; bản vá không được nới quy tắc dữ liệu/an toàn hay tăng quyền công cụ; reviewer không đánh giá bản vá của chính mình.

**Vị trí so với công trình đã đăng.** Phê bình–sửa trong một tác vụ đã có (Madaan et al., 2023; Shinn et al., 2023); tối ưu prompt tự động theo hàm điểm đã có (Khattab et al., 2023; C. Yang et al., 2024; Yuksekgonul et al., 2024); tiến hoá multi-agent phần mềm theo phản hồi kiểm thử đã có (Hu et al., 2024); tái dùng kinh nghiệm quá khứ đã có (Qian et al., 2024). Khác biệt chúng tôi chủ trương là *giữa các nhiệm vụ*, *bản vá kiểm chứng được ở quy mô ít mẫu* và *có người duyệt*. Vì **chưa có bằng chứng định lượng trước/sau**, đây chỉ là một thiết kế; chúng tôi không đề xuất coi nó là đóng góp thực nghiệm của bài này.

### 7.3 So với công bố đã có: khác gì, hơn gì, hay công bố lại?

- **CAID** (Geng & Neubig, 2026): cùng ý manager + đồ thị phụ thuộc + worktree + gộp + kiểm chứng bằng test; công bố trước (3/2026) nên ý này **không nhận là mới**. Kết quả của CAID — chi phí cao hơn và thời gian không giảm đáng kể — **nhất quán với kết quả C1/C2 của chúng tôi** và chỉ ở C5 chúng tôi thấy chênh lệch thời gian không phân biệt được với 0 (chưa phải nhanh hơn có ý nghĩa). Khác biệt có thể có: CCoding có làn nhanh cho việc nhỏ, so với Claude Code thuần trên bài có test ẩn và báo cáo cache/token theo pha; trong phần CAID đã đọc không thấy cache, làn nhanh hay hook quyền công cụ (chưa đọc toàn văn).
- **TeamBench** (Kim et al., 2026): tách quyền bằng hệ điều hành trên benchmark riêng; CCoding tách bằng hook theo mẫu chuỗi (yếu hơn, mục 4.2) và so với đơn agent trên bài mã nhiều tệp. Không nhận tách vai là mới.
- **Anthropic / Cognition:** kết quả của chúng tôi cung cấp một điểm dữ liệu thực nghiệm giữa hai quan điểm: song song hạng mục độc lập cho hệ số song song 2.02 ở `execute` (T-d) nhưng không đủ để rẻ hơn (Bảng 3, 5). Một điểm dữ liệu từ 5 bài nhỏ không đủ để phân xử.
- **Phần có thể mới** (mức chắc chắn trung bình): phép đo cache/token/thời gian theo pha so với Claude Code thuần (N1) và nhật ký vận hành (N5). Các mức này là "chưa thấy trong phần đã đọc", chưa phải "chưa ai làm". Nếu chỉ trình bày kiến trúc thì **phần lớn là công bố lại**.

**Hàm ý khung bài.** Nên viết bài như "đo chi phí–thời gian–cache của một hệ coding multi-agent so với đơn agent, kèm bài học vận hành", đặt cạnh CAID, không phải như "đề xuất kiến trúc mới". Việc chọn một hay nhiều bài, nơi đăng và lộ trình thuộc kế hoạch công bố (hạng mục S7).

### 7.4 Điều cần cải thiện (tóm tắt)

Theo thứ tự ưu tiên rút từ kết quả: (1) tăng số lượt và thêm bài > 15 phút, nhiều runtime, tập con SWE-bench để kết luận không dừng ở minh họa; (2) chạy C6; (3) đo thực nghiệm O4 và O5/O1 thay vì chỉ ước lượng; (4) đo tỉ lệ duyệt nhầm của reviewer; (5) kiểm thử đối kháng cho hook và chuyển sang sandbox cấp hệ điều hành cho dữ liệu nhạy cảm; (6) tách nguyên nhân chậm trên Windows. Kế hoạch chi tiết thuộc hạng mục S7 và `dev-review.md`.

---

## 8. Đe dọa tính hiệu lực

| Loại | Đe dọa | Mức độ / cách xử lý |
|---|---|---|
| Kết luận thống kê | **n rất nhỏ**: 1–2 lượt mỗi ô, 5 bài, tối đa 10 lượt CCoding mỗi vòng; không kiểm định giả thuyết chính thức, không hiệu chỉnh so sánh bội | Bootstrap chỉ minh họa; CI hẹp giả tạo vì chỉ lấy lại mẫu nhiễu trong ô; không khái quát (T-f, `token-analysis.md` §5) |
| Kết luận | **Nhạy với một lượt chạy**: loại một lượt treo stdin đổi hướng chênh lệch thời gian C5 từ +21,1 s sang −14,7 s | Báo cả hai; phân tích độ nhạy chọn sau khi thấy dữ liệu (T-f) |
| Ngoại tại | **Bài nhỏ (< 15 phút)**; chi phí cố định của điều phối có thể nhỏ hơn so với phần song song ở bài dài | Không suy rộng cho nhiệm vụ lớn; ghi như giả thuyết |
| Ngoại tại | **Một runtime** (`claude-cli`/Claude Code), một nhà cung cấp; TTL cache và hook riêng | Chưa khái quát sang runtime khác |
| Nội tại | **Mô hình khác nhau giữa hai hệ**: Claude Code dùng Opus, CCoding C5 dùng Sonnet | So sánh là của cả hệ thống, không tách hiệu ứng multi-agent khỏi hiệu ứng mô hình |
| Nội tại | **Nhiễu thời gian**: tải nhà cung cấp, vòng chạy khác thời điểm (1/11 và 2/11), hạn mức; C4 chạy hai nhiệm vụ CCoding đồng thời | C5 chạy mỗi hệ tuần tự; không kiểm soát được tải nhà cung cấp |
| Nội tại | **Thiên lệch sống sót**: lượt hỏng do hạn mức bị xóa và chạy lại | Cần báo số lượt xóa theo quy tắc chung (chưa báo trong dữ liệu hiện có) |
| Cấu trúc | **Giá hiệu dụng** suy ra bằng hồi quy (R² mô hình sonnet 0.970), nhãn mô hình trộn haiku; `charsPerToken` = 3,5 chưa hiệu chỉnh; hồi quy T-e1 có R² 0.716 | Chỉ dùng quy đổi tương đối; O1–O6 là giả định |
| Cấu trúc | **Dữ liệu**: `claude_turns.csv` không có cột system, không có ở C3/C4; `output_partial` không dùng được; `calls.csv` không tách TTL của CCoding; không có `events.jsonl`; đường găng giả định các pha nối tiếp | Nêu rõ trong `token-analysis.md` §5 |
| Cấu trúc | **Chất lượng chỉ đo bằng test ẩn đúng chức năng**; trần chất lượng (hầu hết đạt trọn) nên không phân biệt được hai hệ | Không kết luận về chất lượng mã, khả năng đọc hay lỗi ngoài test |
| Cấu trúc | **Rò rỉ/overfit**: các sự cố và bản vá rút ra từ chính t1–t5 | Dùng bộ giữ lại nếu thực hiện RQ5 (`design.md` §5.4) |
| Phân loại | **Gán nhóm FM-1/2/3 do một người**; MAST mới đọc tóm tắt | Cần hai người gán độc lập và đọc toàn văn MAST (P-14) |
| Tổng quan tài liệu | **24/31 nguồn chỉ đọc tóm tắt, không nguồn nào toàn văn**; không có công cụ OpenAlex nên không đếm trích dẫn; chưa tìm riêng routing/adaptive compute và quản trị dữ liệu trong agent | Mọi nhận định về "điểm mới" chỉ ở mức "chưa thấy trong phần đã đọc" |
| Bằng chứng nhật ký | Nhiều số trong `challenges.md` lấy từ tài liệu nội bộ, chưa tính lại từ log thô; mỗi sự cố là một quan sát, không phải thí nghiệm | Không dùng làm bằng chứng nhân quả (P-11) |
| Ẩn danh | Một số tài liệu nguồn nội bộ còn chuỗi nhận diện | Không trích nguyên văn; rà trước khi công bố (P-13) |

---

## 9. Kết luận

CCoding là một hệ multi-agent vận hành thật với điều phối theo pha, worktree con song song có tự gộp, review độc lập và nhiều lớp giới hạn sub-agent. Trên 5 bài nhỏ, chất lượng ngang Claude Code thuần, nhưng **thiết kế ban đầu chậm hơn và đắt hơn khoảng gấp đôi**; làn nhanh thu hẹp khoảng cách thời gian về mức không phân biệt được với 0, song chi phí vẫn cao hơn khoảng 22%. Chênh lệch ghi cache (3,34–6,08 lần) đến chủ yếu từ nội dung chứ không từ tiền tố prompt cố định. Sáu đề xuất tối ưu mới được ước lượng; đáng kể nhất (đổi mô hình lead sang Sonnet) đã được áp dụng trong làn nhanh. Chúng tôi ghi nhận 49 thách thức (26 đã đóng, 19 giảm nhẹ, 4 còn mở) và đề xuất một vòng tự cải thiện có người duyệt nhưng chưa đo hiệu quả. Về công bố, kiến trúc phần lớn trùng với CAID, TeamBench và các công trình khác; đóng góp có thể bảo vệ là **phép đo cache/token/thời gian theo pha và nhật ký vận hành**, với mức chắc chắn trung bình. Trước khi công bố cần: nhiều lượt hơn và bài dài hơn, dữ liệu C6, đọc toàn văn các nguồn gần nhất, và rà ẩn danh.

---

## 10. Tài liệu tham khảo

Chuẩn APA 7. Mọi mục dưới đây có trong `related-work.md`, URL/DOI chép nguyên văn từ kết quả công cụ. **[ĐT]** = đã mở trang; **[TT]** = chỉ đọc tóm tắt; mục có "et al." cần điền đủ tác giả (tối đa 20) trước khi nộp; chưa nguồn nào đọc toàn văn.

Cemri, M., Pan, M. Z., Yang, S., Agrawal, L. A., Chopra, B., Tiwari, R., Keutzer, K., Parameswaran, A., Klein, D., Ramchandran, K., Zaharia, M., Gonzalez, J. E., & Stoica, I. (2025). *Why do multi-agent LLM systems fail?* (arXiv:2503.13657v3). https://arxiv.org/abs/2503.13657v3 **[ĐT — tóm tắt arXiv]**

Chen, W., Yuan, J., Qian, C., Yang, C., Liu, Z., & Sun, M. (2025). *Optima: Optimizing effectiveness and efficiency for LLM-based multi-agent system* (arXiv:2410.08115v2). https://arxiv.org/abs/2410.08115v2 **[TT]**

Geng, J., & Neubig, G. (2026). *Effective strategies for asynchronous software engineering agents* (arXiv:2603.21489). https://arxiv.org/abs/2603.21489 **[ĐT — tóm tắt và HTML 100.000/134.699 ký tự]**

Hadfield, J., Zhang, B., Lien, K., Scholz, F., Fox, J., & Ford, D. (2025, June 13). *How we built our multi-agent research system*. Anthropic Engineering. https://www.anthropic.com/engineering/built-multi-agent-research-system **[ĐT; blog kỹ thuật, số liệu nội bộ]**

Hong, S., et al. (2024). MetaGPT: Meta programming for a multi-agent collaborative framework. *The Twelfth International Conference on Learning Representations (ICLR 2024)*. https://proceedings.iclr.cc/paper_files/paper/2024/hash/6507b115562bb0a305f1958ccc87355a-Abstract-Conference.html **[TT]**

Hu, Y., Cai, Y., et al. (2024). *Self-evolving multi-agent collaboration networks for software development* (arXiv:2410.16946). https://arxiv.org/abs/2410.16946v1 **[TT; venue chưa xác minh]**

Huang, D., et al. (2024). *AgentCoder: Multi-agent-based code generation with iterative testing and optimisation* (arXiv:2312.13010). https://arxiv.org/abs/2312.13010 **[TT; preprint]**

Kapoor, S., Stroebl, B., Siegel, Z. S., Nadgir, N., & Narayanan, A. (2024). *AI agents that matter* (arXiv:2407.01502). https://arxiv.org/abs/2407.01502v1 **[ĐT — tóm tắt arXiv; bản TMLR 2025 chưa xác minh]**

Khattab, O., et al. (2023). *DSPy: Compiling declarative language model calls into self-improving pipelines* (arXiv:2310.03714). https://arxiv.org/pdf/2310.03714 **[TT; venue chưa xác minh]**

Kim, Y., Park, C., Kim, T., Park, E., Schmidgall, S., Rahman, S., Park, C., Breazeal, C., Liu, X., Palangi, H., Park, H. W., & McDuff, D. (2026). *TeamBench: Evaluating agent coordination under enforced role separation* (arXiv:2605.07073). https://arxiv.org/abs/2605.07073 **[ĐT — tóm tắt arXiv]**

Lumer, E., Nizar, F., Jangiti, A., Frank, K., Gulati, A., Phadate, M., & Subbiah, V. K. (2026). *Don't break the cache: An evaluation of prompt caching for long-horizon agentic tasks* (arXiv:2601.06007). https://arxiv.org/html/2601.06007 **[ĐT — HTML; tên đầy đủ bản arXiv chưa xác minh]**

Madaan, A., et al. (2023). Self-Refine: Iterative refinement with self-feedback. *Advances in Neural Information Processing Systems 36 (NeurIPS 2023)*. arXiv:2303.17651. https://arxiv.org/abs/2303.17651v2 **[TT; NeurIPS chưa xác minh trang hội nghị]**

Qian, C., Dang, Y., et al. (2024). Experiential co-learning of software-developing agents. In *Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)* (pp. 5628–5640). Association for Computational Linguistics. https://aclanthology.org/2024.acl-long.305 **[TT]**

Ruan, Y., Dong, H., et al. (2024). Identifying the risks of LM agents with an LM-emulated sandbox. *ICLR 2024*. arXiv:2309.15817. https://arxiv.org/abs/2309.15817v2 **[TT]**

Shinn, N., Cassano, F., Berman, E., Gopinath, A., Narasimhan, K., & Yao, S. (2023). Reflexion: Language agents with verbal reinforcement learning. *Advances in Neural Information Processing Systems 36 (NeurIPS 2023)*. arXiv:2303.11366. https://arxiv.org/abs/2303.11366v4 **[TT]**

Wang, X., et al. (2025). OpenHands: An open platform for AI software developers as generalist agents. *ICLR 2025*. https://proceedings.iclr.cc/paper_files/paper/2025/hash/a4b6ad6b48850c0c331d1259fc66a69c-Abstract-Conference.html **[TT]**

Wu, Q., et al. (2023). *AutoGen: Enabling next-gen LLM applications via multi-agent conversation* (arXiv:2308.08155). https://arxiv.org/abs/2308.08155v2 **[TT; preprint, có bản workshop]**

Xia, C. S., Deng, Y., Dunn, S., & Zhang, L. (2025). Demystifying LLM-based software engineering agents. *Proceedings of the ACM on Software Engineering (FSE 2025)*. arXiv:2407.01489. https://arxiv.org/abs/2407.01489v2 **[TT; tên bài ở bản FSE có thể khác bản arXiv — cần đối chiếu]**

Yan, W. (2025, June 12). *Don't build multi-agents*. Cognition. https://cognition.com/blog/dont-build-multi-agents **[ĐT; blog ý kiến kỹ sư]**

Yang, C., Wang, X., Lu, Y., Liu, H., Le, Q. V., Zhou, D., & Chen, X. (2024). Large language models as optimizers. *ICLR 2024*. arXiv:2309.03409. https://arxiv.org/abs/2309.03409 **[TT; chưa mở trang hội nghị]**

Yang, J., Jimenez, C. E., Wettig, A., Lieret, K., Yao, S., Narasimhan, K., & Press, O. (2024). SWE-agent: Agent-computer interfaces enable automated software engineering. *Advances in Neural Information Processing Systems 37 (NeurIPS 2024)*. https://papers.neurips.cc/paper_files/paper/2024/hash/5a7c947568c1b1328ccc5230172e1e7c-Abstract-Conference.html **[TT]**

Yuksekgonul, M., Bianchi, F., Boen, J., Liu, S., Huang, Z., Guestrin, C., & Zou, J. (2024). *TextGrad: Automatic "differentiation" via text* (arXiv:2406.07496). https://arxiv.org/abs/2406.07496v1 **[TT]**

Zhang, G., Yue, Y., et al. (2025). Cut the crap: An economical communication pipeline for LLM-based multi-agent systems. *ICLR 2025*. https://proceedings.iclr.cc/paper_files/paper/2025/hash/bbc461518c59a2a8d64e70e2c38c4a0e-Abstract-Conference.html **[TT]**

**Nguồn nội bộ (không phải tài liệu công bố; không trích nguyên văn khi công bố vì chưa ẩn danh hoàn toàn):** `docs/research/context/HISTORY.md`, `docs/PROCESS-REVIEW.md`, `docs/ARCHITECTURE.md`, `docs/TOOLS.md`, `docs/RUNTIMES.md`, `bench/vs-claude/README.md`, `docs/research/performance/token-analysis.md`, `docs/research/challenges.md`, `docs/research/self-improvement/design.md`. Dữ liệu: `bench/vs-claude/results/{runs,phases,calls,claude_turns}.csv`.

**Còn thiếu:** Cognition (2026, "Multi-Agents: What's Actually Working") — `[CHƯA KIỂM CHỨNG]`, không dùng làm căn cứ; không có trong danh mục.

---

## Khai báo sử dụng AI

Bản thảo này được soạn với sự hỗ trợ của một trợ lý AI (mô hình Claude của Anthropic, chạy qua hệ CCoding — chính đối tượng được mô tả trong bài): AI tổng hợp bản nháp từ các tệp đầu vào do các hạng mục trước tạo ra (tổng quan tài liệu, báo cáo phân tích số liệu, bảng thách thức, thiết kế tự cải thiện), và chép số liệu từ các bảng đó. Tổng quan tài liệu cũng do AI thực hiện với công cụ tìm kiếm web; phần lớn nguồn chỉ được đọc ở mức tóm tắt. AI **không** chạy benchmark mới và không tự chạy lại script phân tích trong hạng mục này. Tác giả (Tom) chịu trách nhiệm về nội dung: cần tự kiểm lại trích dẫn với bản gốc, đối chiếu số liệu với dữ liệu và mã, và đọc quy định liêm chính học thuật cũng như chính sách khai báo dùng AI của trường/hội nghị nơi nộp trước khi gửi. Đây là bản nháp, không phải bản công bố.
