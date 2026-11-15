# Đề bài nghiên cứu: Xây dựng hệ thống multi-agent CCoding — từ thiết kế, giới hạn sub-agent đến kiểm thử hiệu năng (2/11/2026)

**Chủ trì: Phòng Nghiên cứu. Hỗ trợ: Phòng Phát triển** (dữ liệu benchtest, đánh giá kỹ thuật, kiểm lại số liệu, kế hoạch thí nghiệm).

## Yêu cầu của chủ dự án (nguyên ý)

Đề tài là **xây dựng hệ thống multi-agent** (CCoding). Bài phải trình bày: các kiểm thử hiệu năng, các chiến lược đã dùng, cách chủ dự án
**giới hạn sub-agent**; các phương án, lỗi, challenge gặp từ đầu tới giờ và cách giải quyết. Đưa **khuyến nghị nên công bố chủ đề nào, 1 hay
nhiều đề tài**. Phải **xem trước các công bố đã đăng**: bài của chủ dự án khác gì, hơn gì, hay chỉ là công bố lại. Reference đầy đủ, viết đúng
chuẩn nghiên cứu. Chuẩn bị nội dung để chủ dự án **trình bày với thầy hướng dẫn** (chi tiết, dễ hiểu). Thấy gì cần cải thiện thì báo.
Thêm từ đề trước: (1) sub-agent phải **tự cải thiện** mỗi khi có vấn đề (ghi lại vấn đề, tự đề xuất sửa prompt…); (2) kiểm thử hiệu năng
phải tối ưu cả **cache, token đầu vào, đầu ra**; (3) rà **còn lỗi/vấn đề gì**.

## Dữ liệu và tài liệu có sẵn (nhánh `perf/vs-claude-loop`)

- `docs/research/context/HISTORY.md` — **nhật ký thách thức → cách giải quyết** 26/10–2/11 (runtime, quản trị sub-agent, điều phối, chất
  lượng, số liệu 9 gói của "dự án A"), đã bỏ thông tin nội bộ.
- `docs/PROCESS-REVIEW.md` §1–13 (mọi đợt đánh giá và sửa), `docs/ARCHITECTURE.md`, `docs/AGENTS-GUIDE.md`, `docs/TOOLS.md`,
  `docs/RUNTIMES.md`, `docs/BENCH.md`, `docs/HERDR.md`, `docs/UI.md`, `docs/data-protection-assessment.md`; lịch sử git (`git log`).
- `bench/vs-claude/` — benchtest CCoding vs Claude Code thuần (README = phương pháp): 5 bài, 461 test ẩn; `results/REPORT.md`,
  `runs.csv`, `phases.csv`, `calls.csv` (từng lượt gọi agent: token vào/ra/đọc/ghi cache, thời gian, kích thước system/context/prompt,
  ký tự đầu ra công cụ), `claude_turns.csv` (từng lượt mô hình của Claude Code, ghi cache TTL 1 giờ/5 phút), `summary.json`.
  Vòng C1–C2 = mốc ban đầu, C3–C4 = bước trung gian, C5 = làn nhanh, C6 = kiểm chứng sửa `maxParallel` (thêm sau nếu chưa có).
- Mã: `src/orchestrator.ts` (pha route → plan → discuss → finalize → execute → review → revise → synthesize; worktree con song song;
  làn nhanh `pickLane`/`shapeFastPlan`), `src/prompts.ts`, `src/kpi.ts` (KPI + góp ý), `src/runtimes/claude-cli.ts`,
  `src/tools/claude-guard.ts` (hook PreToolUse), `src/tools/workspace.ts`, `src/dataProtection*`/`LogStore`, `agents/*/*.md`.

## Câu hỏi nghiên cứu

- **RQ1 — Thiết kế hệ thống.** Kiến trúc văn phòng nhiều phòng ban, vai trò, pha, runtime đa nhà cung cấp; chiến lược điều phối (họp, kế
  hoạch theo năng lực công cụ, worktree con song song + tự gộp + giải xung đột, review độc lập + vòng sửa, làn nhanh/làn đầy đủ).
- **RQ2 — Giới hạn và quản trị sub-agent.** Quyền công cụ 4 mức, hook chặn lệnh/đường dẫn/nhánh/stdin, giới hạn khảo sát (đọc trước khi
  ghi), ngân sách token/thời gian/hạng mục/vòng sửa, `maxParallel`, cách ly cấu hình người dùng, chính sách dữ liệu theo nhãn (Data
  Protection Gate, pháp lý VN), KPI. Đánh giá hiệu quả từng cơ chế bằng bằng chứng trong HISTORY/PROCESS-REVIEW.
- **RQ3 — Kiểm thử hiệu năng.** Phương pháp (test ẩn, cùng đề, baseline mạnh là một coding agent đơn), kết quả C1→C6, phân tích đường găng
  từ `events.jsonl`/`calls.csv`, **token/cache/đầu vào/đầu ra**: vì sao CCoding ghi cache gấp 2,8–4 lần (mỗi lượt gọi là một phiên
  `claude -p` mới), đề xuất tối ưu có ước lượng định lượng (tiền tố prompt ổn định dùng chung cache, tái dùng phiên cho execute → revise,
  rút gọn ngữ cảnh, reviewer nhận diff + kết quả lệnh kiểm tra, giới hạn đầu ra, mô hình theo pha). Khi nào multi-agent nhanh hơn agent đơn?
- **RQ4 — Thách thức và lỗi.** Phân loại toàn bộ thách thức (HISTORY + PROCESS-REVIEW + git log) theo một taxonomy có sẵn — vd. MAST
  (Cemri et al., 2025: lỗi đặc tả/thiết kế, lệch phối hợp giữa agent, kiểm chứng/kết thúc) + nhóm hạ tầng/runtime/nhà cung cấp; mỗi mục:
  triệu chứng, nguyên nhân gốc, cách giải quyết, bằng chứng (commit, mục tài liệu), còn mở hay không. Rà thêm lỗi còn lại trong mã/dữ liệu.
- **RQ5 — Tự cải thiện.** Thiết kế vòng: phát hiện sự cố → nhật ký sự cố có cấu trúc → nguyên nhân gốc → **đề xuất bản vá prompt dạng
  diff** → cổng A/B bằng `bench/vs-claude` + `ccoding bench` (tiêu chí thống kê, bài giữ lại chống overfit) → giám đốc duyệt → áp dụng có
  phiên bản + rollback. Điểm móc trong mã, lược đồ dữ liệu, chính sách an toàn (không tự áp khi chưa duyệt, che PII/bí mật qua `LogStore`).
- **RQ6 — Công bố.** Tổng quan công bố đã có và **điểm mới**: so với MetaGPT, ChatDev, AutoGen, AgentVerse, CAMEL, SWE-agent, OpenHands,
  Agentless, MapCoder, AgentCoder, Magentic-One, các công trình tự cải thiện/tối ưu workflow (Self-Refine, Reflexion, DSPy, OPRO, TextGrad,
  ADAS, AFlow, EvoMAC, Experiential Co-Learning), phân tích lỗi MAS (MAST), đánh giá agent có tính chi phí ("AI Agents That Matter"),
  tranh luận multi-agent vs single-agent (bài kỹ thuật của Anthropic về hệ multi-agent nghiên cứu 2025; Cognition "Don't Build
  Multi-Agents" 2025), tối ưu giao tiếp/token MAS (AgentPrune, Optima), an toàn/quyền của agent… **Tìm thêm công bố 2025–2026** (dùng
  `search_papers`/web). Bảng so sánh theo tiêu chí; nói thẳng phần nào **đã có** (không được nhận là mới), phần nào mới; bài có phải công bố
  lại không. Khuyến nghị **1 hay nhiều bài**, các phương án (vd. A: một bài hệ thống + đánh giá; B: tách 2–3 bài — hệ thống/quản trị,
  thực nghiệm multi vs single về thời gian/chi phí/cache, báo cáo kinh nghiệm + taxonomy lỗi; C: báo cáo kỹ thuật arXiv trước rồi bài hội
  nghị), nơi đăng phù hợp (trong nước và quốc tế, hội nghị/workshop/tạp chí; kiểm tra hạn nộp và chính sách khai báo dùng AI khi viết),
  điều kiện cần đủ (số lượt lặp, kiểm định thống kê, mở mã/dữ liệu, ẩn danh dự án A), rủi ro và lộ trình.

## Phân công gợi ý

Nghiên cứu: tổng quan tài liệu + điểm mới (Literature Researcher), phương pháp/đe dọa hiệu lực/thiết kế thí nghiệm bổ sung
(Methodologist), phân tích số liệu + script (Data Scientist), viết bài (Academic Writer), phản biện (Peer Reviewer).
**Phát triển (sau Nghiên cứu, nhận kết quả của Nghiên cứu làm đầu vào)**: kiểm lại mọi mô tả kỹ thuật và con số trong bài so với mã/dữ liệu
(ghi lệch nếu có); chạy script phân tích; hoàn thiện công cụ benchtest nếu cần (vd. script thống kê khoảng tin cậy/kiểm định cho
`bench/vs-claude`, chế độ n lượt) — **không chạy vòng benchmark mới**; lập **kế hoạch thí nghiệm bổ sung** đủ chuẩn công bố (số lượt, bài
lớn > 15 phút, tập con SWE-bench, nhiều runtime) kèm ước lượng thời gian/token; danh sách đề xuất cải thiện hệ thống theo ưu tiên.

## Ràng buộc

- Không sửa `src/`, `agents/`, `ccoding.config.json`: đề xuất thay đổi là tệp `.diff`. Phát triển được thêm/sửa trong `bench/vs-claude/`
  và `docs/research/`.
- **Không chạy benchmark mới** (tốn hạn mức) — dùng dữ liệu có sẵn; thí nghiệm bổ sung chỉ lập kế hoạch.
- Script chạy offline bằng **Node ≥ 22 không phụ thuộc ngoài** (máy chạy chưa chắc có Python); mọi con số tái lập được từ CSV. Không bịa số.
- **Tài liệu tham khảo phải có thật**: tác giả, năm, tên, nơi đăng, arXiv/DOI/URL lấy nguyên văn từ kết quả tra cứu; chưa kiểm chứng được thì
  ghi "cần kiểm chứng". Không trích nguồn chưa đọc được tóm tắt.
- **Ẩn danh dự án A** trong mọi bản thảo công bố (không tên cơ quan/khách hàng/dự án nội bộ). Dữ liệu benchtest là tổng hợp, nhãn Công khai.
- Tiếng Việt có dấu (bản thảo có thể kèm tóm tắt tiếng Anh).

## Sản phẩm bàn giao (`docs/research/`)

1. `related-work.md` — tổng quan tài liệu (mỗi mục: trích dẫn đầy đủ, đóng góp, liên quan/khác CCoding) + bảng so sánh tiêu chí + kết luận
   điểm mới/không mới.
2. `publication-plan.md` — khuyến nghị 1 hay nhiều bài, các phương án, nơi đăng, điều kiện, rủi ro, lộ trình; **tóm tắt cho thầy hướng dẫn**
   (1 trang).
3. `challenges.md` — bảng thách thức → nguyên nhân → cách giải quyết → bằng chứng → trạng thái, phân loại theo taxonomy (RQ4).
4. `paper/paper.md` — bản thảo bài chính theo IMRaD (Tóm tắt, Giới thiệu, Công trình liên quan, Hệ thống, Phương pháp đánh giá, Kết quả,
   Thảo luận, Đe dọa tính hiệu lực, Kết luận, Tài liệu tham khảo) với số liệu thật; nếu khuyến nghị nhiều bài: `paper-<n>/outline.md`.
5. `performance/token-analysis.md` + `performance/scripts/token-analysis.mjs` (RQ3) — script in mọi bảng số dùng trong bài.
6. `self-improvement/design.md` + `self-improvement/prompt-patches/*.diff` (≥ 3, mỗi bản vá kèm giả thuyết, chỉ số, cách đo) (RQ5).
7. `presentation-notes.md` — dàn ý trình bày với thầy: thông điệp chính, 12–18 ý slide kèm hình/bảng nên có, câu hỏi thầy có thể hỏi + trả lời.
8. `review.md` — phản biện nội bộ (Peer Reviewer: kiểm ngẫu nhiên ≥ 5 trích dẫn, ≥ 5 con số) + trả lời/sửa.
9. (Phát triển) `dev-review.md` — kiểm lại kỹ thuật + số liệu, kế hoạch thí nghiệm bổ sung, đề xuất cải thiện theo ưu tiên.

Tiêu chí hoàn thành: mọi bảng số tái lập bằng `node docs/research/performance/scripts/token-analysis.mjs`; mọi trích dẫn có nguồn; mỗi
thách thức có bằng chứng; khuyến nghị công bố trả lời rõ "1 hay nhiều bài", "khác gì/hơn gì", "có phải công bố lại không".
