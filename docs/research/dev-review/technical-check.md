# Kiểm mô tả kỹ thuật trong bản thảo so với mã nguồn (D1 · S3)

> Phòng Phát triển · @solution-architect · 2/11/2026 · Phân loại: Nội bộ.
> **Trạng thái đối chiếu:** HEAD `8b52644f0e65040e8af14fdde65c487c584c686c` (nhánh `ccoding/t-20261102-112755-181--s3`, 109 commit theo `git log --oneline | wc -l`); `git status --short` lúc bắt đầu: **sạch** trong worktree con này. Lưu ý: kế hoạch chung ghi rằng worktree nhiệm vụ có thay đổi chưa commit ở `challenges.md`, `paper.md` và `token-analysis.*`. Worktree con S3 tách từ HEAD trên, nên báo cáo này kiểm **bản đã commit** của `paper.md` và `challenges.md`. Nếu bản chưa commit khác bản này, S5 cần đối chiếu lại số dòng.
> **Phạm vi:** chỉ đọc `src/`, `agents/`, `ccoding.config.json` và lịch sử git. Tôi không chạy test hay build vì vai trò này không có quyền chạy lệnh. Các tài liệu được kiểm:
> - `docs/research/paper/paper.md` §4 (Hệ thống, dòng 62–113) và §5 (Phương pháp, dòng 117–137);
> - `docs/research/challenges.md` §1–2;
> - `docs/research/self-improvement/design.md` §1 và §4.
>
> **Đánh số mục.** Đề bài S3 gọi "§3 Hệ thống, §4 Phương pháp", nhưng trong bản thảo hiện tại Hệ thống là **§4** và Phương pháp là **§5**. Báo cáo dùng số dòng thực tế.
> **Ký hiệu.** `P:n` = `paper.md` dòng n; `CH:n` = `challenges.md` dòng n; `D:n` = `design.md` dòng n. Bằng chứng dạng `tệp:dòng` lấy từ HEAD ở trên.

## 0. Phát hiện quan trọng nhất (đọc trước)

1. **Nhiều giới hạn trong Bảng 1 không có hiệu lực với runtime `claude-cli`, tức runtime dùng trong toàn bộ benchtest.** Đó là `toolTurns` (40/16/10), `toolInputBudget` (800k/300k/200k), mức nhắc ở 35 %/65 % ngân sách công cụ, và hủy khi luồng treo `idleTimeoutMs`. Các giá trị này được truyền vào `toolPolicy.maxTurns/maxInputTokens` (`src/orchestrator.ts:2673-2674`), nhưng chỉ vòng công cụ của runtime API đọc chúng (`src/runtimes/api.ts:263-264, 377-378, 514, 528`). `ClaudeCliRuntime.run` không truyền `--max-turns` hay trần token nào (`src/runtimes/claude-cli.ts:145-176`) và không trả `capped`, nên cơ chế chạy tiếp `maxContinuations` (`orchestrator.ts:1603`) cũng không kích hoạt. Commit `505a1df` cũng ghi rõ "Runtime API: hủy lượt khi luồng … treo". Với `claude-cli`, trên mỗi lượt gọi chỉ còn hiệu lực: `timeoutMs` 30 phút (trần thời gian tiến trình, `claude-cli.ts:189`), hook `claude-guard` (lệnh, đường dẫn, `readsBeforeWrite`, stdin), danh sách công cụ, và ngân sách token cấp nhiệm vụ/hạng mục kiểm *trước* mỗi lượt (`orchestrator.ts:2609-2610`). ⇒ Bài nên tách rõ "giới hạn chung" và "giới hạn chỉ cho runtime API".
2. **`perSubtask` none 60k · read 120k · write 200k · exec 300k là hằng số *ước lượng*, không phải *ngân sách*.** Chúng nằm trong `estimate.perSubtask` (`src/config.ts:312`, `ccoding.config.json:53`), được dùng để ước lượng token sau khi chốt kế hoạch (`orchestrator.ts:1750-1754`). Ngân sách hạng mục là `subtaskBudget()` (`orchestrator.ts:1685`), với `defaults.subtaskBudgetTokens = 0` (`config.ts:285`). Bảng 1 (P:103) và L7 (CH:104) đang ghi nhầm hai khái niệm này làm một.
3. **Làn nhanh không phải "lead dùng Sonnet thay vì Opus" cho mọi pha.** Trong mã, làn nhanh chỉ đổi mô hình của pha **plan** sang `fastLane.planModel = 'sonnet'` (`orchestrator.ts:1148`, `config.ts:294`). Làn nhanh **bỏ cả discuss lẫn finalize** (`orchestrator.ts:1219, 1265-1266`). Pha **synthesize không gọi LLM**: báo cáo dựng từ mẫu (`orchestrator.ts:1466-1467`, `finalReport: 'template'`). Ở mọi làn, synthesize mặc định chạy Sonnet (`config.ts:288`), không riêng làn nhanh.
4. **Mặc định `dataProtection.allowedRuntimes` ở repo là `internal: ['*']`** (`src/config.ts:324`, `ccoding.config.json:107`). Câu "Nội bộ: `local, cerebras, groq`" ở L13 (CH:110) không khớp mặc định trong repo. Có thể đó là cấu hình cục bộ, nhưng chưa kiểm được.

## 1. Bảng đối chiếu khẳng định (≥ 25)

| # | Khẳng định (vị trí) | Bằng chứng trong mã / git | Kết luận | Câu sửa đề xuất |
|---|---|---|---|---|
| K01 | Có 6 runtime `claude-cli, codex-cli, kimi-cli, anthropic-api, openai-api, mock` (P:66) | `src/config.ts:275`: `order` gồm thêm `bifrost` và `ollama`, hai mục này là cấu hình dạng `openai-api` (`ccoding.config.json:75-87`). Runtime `mock` có ở `src/runtimes/mock.ts` | Đúng một phần | "…6 loại runtime (`claude-cli`, `codex-cli`, `kimi-cli`, `anthropic-api`, `openai-api`, `mock`); các cổng như Ollama được cấu hình như phiên bản của `openai-api`." |
| K02 | Mọi lượt gọi LLM đi qua `Orchestrator.call()` (P:66) | Mọi pha gọi `this.call(…)` (`orchestrator.ts:1004, 1199, 1235, 1250, 1345, 1406, 1469, 1596`). `AGENTS.md` ghi ngoại lệ: `agent-exec` trong pane herdr | Đúng một phần | Thêm: "(ngoại lệ: lệnh `agent-exec` chạy trong pane herdr)". |
| K03 | Mỗi agent chỉ chạy một lượt tại một thời điểm (P:66; L11 P:107) | `busy.add(st.assignee)` / `busy.delete` (`orchestrator.ts:1540, 1554`); `hold()` khi họp (`:1223`) | Đúng | Giữ nguyên. Có thể nói thêm rằng giới hạn này áp ở cấp hạng mục trong một nhiệm vụ và giữa các nhiệm vụ qua `hold`. |
| K04 | 8 pha route → plan → discuss → finalize → execute → review → revise → synthesize (P:68-79) | `VARIANT_PHASES` (`orchestrator.ts:3154`); route `:999-1004`; plan `:1197`; discuss `:1220`; finalize `:1248`; execute `:1304`; review `:1341`; revise `:1398`; synthesize `:1459` | Đúng | Nên thêm **điều kiện chuyển pha**, vì bảng chưa nêu: bỏ họp khi `< phases.meetingMinSubtasks` (mặc định 3) hạng mục hoặc `< 2` người (`:1216-1218`); làn nhanh bỏ discuss + finalize (`:1219, 1265`); việc giao riêng (`mode = agent`) bỏ plan + discuss (`:1161-1170`); review chỉ chạy khi có reviewer khác người làm và có hạng mục xong (`:1316-1319`). |
| K05 | route: không có công cụ; discuss: không có công cụ (P:72, 74) | `cliTools`: `access === 'none' \|\| phase === 'route' \|\| 'discuss'` → `[]` (`orchestrator.ts:3142`) | Đúng | — |
| K06 | plan, finalize, synthesize: chỉ đọc (P:73, 75, 79) | `else list = list.filter(READ_ONLY_TOOLS)` (`orchestrator.ts:3148`) | Đúng | Ghi chú: khi bật `gitRead`, vai trò chỉ có Read được thêm `Bash` (hook chỉ cho git đọc) (`:3150`). |
| K07 | discuss: ≤ 120 từ mỗi người; họp ≤ 5 người, dùng Haiku (P:74; C-02 CH:26) | Tối đa 5 người tham gia **cộng thêm lead** (`.slice(0, 5)`, `orchestrator.ts:1215, 1222`); `phases.models.discuss = 'haiku'` (`config.ts:288`); `maxTokens.discuss = 700` (`config.ts:289`). Giới hạn "120 từ" nằm trong prompt, tôi chưa đọc `P.discussPrompt` | Đúng một phần | "Họp tối đa 5 thành viên + trưởng phòng; mỗi lượt phát biểu ≤ 700 token đầu ra, prompt yêu cầu ≤ 120 từ; các thành viên phát biểu song song trong một vòng (`phases.parallelDiscuss`, mặc định bật)." |
| K08 | execute: song song theo DAG tới `maxParallel` (P:76) | `slots = maxParallel - inflight.size`; `readySubtasks` (`orchestrator.ts:1524-1537`); hạng mục phụ thuộc phải **chờ hạng mục mà nó phụ thuộc được gộp xong** (`unmerged`, `:1528`) | Đúng | Thêm: "hạng mục phụ thuộc chỉ bắt đầu sau khi hạng mục tiền đề đã được gộp vào nhánh nhiệm vụ". Chi tiết này ảnh hưởng tới đường găng. |
| K09 | review: reviewer độc lập (JSON), có quyền đọc + chạy lệnh (P:77) | `phase === 'review'` → công cụ đọc + `Bash/PowerShell` (`orchestrator.ts:3147`); `parseReview` (`:1356`) | Đúng | — |
| K10 | Reviewer không phải người làm (L15 P:111; CH:112) | Mã chỉ loại trường hợp reviewer **là người làm việc giao riêng** (`reviewer.id !== solo?.id`, `orchestrator.ts:1316`). Làn nhanh chuyển hạng mục của reviewer thành "trọng tâm review" (`:1056-1064`). **Ở làn đầy, nếu kế hoạch giao hạng mục cho reviewer thì reviewer vẫn review chính hạng mục đó.** Tôi không tìm thấy kiểm tra nào chặn việc này | Đúng một phần | "Reviewer là một vai trò riêng của phòng (`dept.reviewer`); ở làn nhanh, hạng mục giao cho reviewer được chuyển thành trọng tâm review. Ở làn đầy, hệ thống chưa cấm cơ học việc giao hạng mục cho reviewer." Đây là ứng viên cải thiện. |
| K11 | revise: sửa theo vấn đề `major/blocker`, tối đa `maxRevisions` (P:78) | `severity !== 'minor'` (`orchestrator.ts:1393`); vòng `attempt ≤ maxRevisions` (`:1320, 1394`); `maxRevisions` bị kẹp trong [0; 3] (`:296`) | Đúng | Thêm: "với `maxRevisions` = 1 có tối đa 2 lượt review và 1 lượt sửa". Lượt sửa chạy **trong worktree chính, không tách worktree con**; hạng mục chạy lệnh được sửa lần lượt (`:1419-1427`). |
| K12 | Kế hoạch theo năng lực công cụ: roster ghi quyền từng người (P:83; C-04) | `capabilities()` (`orchestrator.ts:1119-1133`) ghi "chạy lệnh / đọc-ghi tệp — KHÔNG chạy test / chỉ đọc"; `rosterHints` (`:1155`); `a9b6214` | Đúng | — |
| K13 | Mỗi hạng mục có worktree con riêng tách từ nhánh nhiệm vụ; CCoding tự gộp `--no-ff` (P:84; C-16) | `addWorktree(main, wtPath, branch, 'HEAD')` sau `commitAll` (`orchestrator.ts:2147-2149`); doc-comment "gộp `--no-ff`" (`:2207`); `mergeBranch` (`:2293`); `8f92a52`. Điều kiện tách: `isolated(st)` = bật `parallelWorktrees` và hạng mục chạy lệnh hoặc ghi tệp (`:1501`) | Đúng một phần | "Mỗi hạng mục **có ghi tệp hoặc chạy lệnh** có worktree con riêng (`tools.parallelWorktrees`); hạng mục chỉ đọc chạy trong worktree chính." Cờ gộp đã xác nhận: `merge --no-ff --no-edit --no-verify` (`src/git.ts:144, 156`). `--no-verify` có nghĩa là hook git của repo **không chạy** khi gộp. |
| K14 | Xung đột được giải trong worktree con mới, `resolveRounds` = 2, rồi dự phòng tuần tự (P:84; C-17) | `MAX_RESOLVE_ROUNDS = 2` (`orchestrator.ts:3171`); `fallback = round > resolveRounds` (`:2313`); gộp sẵn nhánh `…-xd<n>` vào worktree con mới (`:2161-2181`); kiểm dấu xung đột (`:2262-2280`); `7291cec` | Đúng | Ghi chú: `tools.resolveRounds` không có trong `config.ts` mặc định; giá trị 2 là hằng số trong mã. |
| K15 | Phụ thuộc thư viện được cài lại khi tệp khai báo đổi (P:84; C-19) | `manifestFingerprint`/`manifestDiff` (`src/git.ts:188-208`; `orchestrator.ts:2489-2508`); `ba70470` | Đúng | — |
| K16 | CCoding tự chạy `setupCommands/checkCommands` ở baseline, sau thực thi và sau mỗi vòng sửa (P:85; C-27) | `runProjectChecks(…, 'baseline' \| 'execute' \| 'revise')` (`orchestrator.ts:2482`; lời gọi `:1182, 1306, 1309, 1431`) | Đúng | — |
| K17 | Hồi quy so với baseline thì không duyệt, dù reviewer ghi duyệt (P:85; L15) | `checkRegressions` → `review.approved = false` và thêm issue `blocker` nếu chưa có (`orchestrator.ts:1357-1366, 2543`) | Đúng | — |
| K18 | Chạy lại lệnh kiểm tra khi workspace đổi sau lần đo gần nhất (P:85; C-28) | `staleAt` đặt khi bắt đầu sửa (`orchestrator.ts:1403`); kiểm `latestAt < staleAt` trước review (`:1340`); `f4681f1` | Đúng | — |
| K19 | Cờ "⚠ cần xem" khi reviewer không chạy lệnh (L15 CH:112; P:111) | `verified === false` chỉ sinh cảnh báo trong tin nhắn và log `review.unverified` (`orchestrator.ts:1377-1385`), kèm ghi chú cho báo cáo tổng hợp (`:1462`). Cờ `task.attention` chỉ bật khi review **chưa duyệt** hoặc lệnh kiểm tra **còn lỗi** (`:1437-1438`). Khi dự án có `checkCommands`, `verified = true` ngay cả khi reviewer không chạy gì (`:1377`) | Đúng một phần | "Reviewer có quyền chạy lệnh mà không chạy lệnh kiểm tra nào thì bị ghi log `review.unverified` và cảnh báo trong báo cáo. Cờ 'cần xem' (`attention`) chỉ bật khi review chưa duyệt hoặc lệnh kiểm tra còn lỗi." |
| K20 | Làn nhanh bỏ họp (P:86) | `rounds > 0 && !small && task.lane !== 'fast'` (`orchestrator.ts:1219`); `:1265-1266` | Đúng | Nói rõ: bỏ cả **finalize**, nên `decisions` để rỗng. |
| K21 | Kế hoạch làn nhanh được định hình lại (`shapeFastPlan`) (P:86) | `orchestrator.ts:1054-1089`, gồm ba việc: (a) hạng mục giao cho reviewer chuyển thành `reviewFocus`; (b) hạng mục độc lập trùng người nhận được chuyển sang người cùng năng lực còn rảnh; (c) nâng `maxParallel` | Đúng một phần (mô tả thiếu) | "`shapeFastPlan` (i) chuyển hạng mục của reviewer thành trọng tâm review, (ii) đổi người nhận để các hạng mục độc lập không chờ cùng một agent, (iii) nâng `maxParallel`." |
| K22 | `maxParallel` nâng bằng số hạng mục độc lập, tối đa 4 (P:86; C-12; L11) | `want = min(roots, fastLane.maxParallel ?? 4)`; chỉ nâng khi `want > maxParallel` (`orchestrator.ts:1082-1087`); `fastLane.maxParallel: 4` (`config.ts:294`); `d7600f6` có tiêu đề "Làn nhanh: chạy cùng lúc mọi hạng mục độc lập (tối đa fastLane.maxParallel = 4)" | Đúng | Ghi chú: `ccoding.config.json` **không có khối `fastLane`**, nên giá trị 4 lấy từ mặc định trong `config.ts`. |
| K23 | Làn nhanh: lead dùng Sonnet thay vì Opus (P:86) | Chỉ pha plan dùng `fastLane.planModel = 'sonnet'` (`orchestrator.ts:1148`). Finalize bị bỏ; synthesize dùng mẫu, không gọi LLM (`:1466-1467`). `dev-lead.md` có `model: opus` (`agents/dev/dev-lead.md:8`) | Đúng một phần | "Làn nhanh lập kế hoạch bằng Sonnet (thay Opus của hồ sơ trưởng phòng), bỏ họp và chốt, và dựng báo cáo cuối từ mẫu mà không gọi LLM." |
| K24 | "Việc nhỏ đi làn nhanh" (P:86) — bài không nêu tiêu chí | `pickLane`: `fastLane.enabled`, nhiệm vụ có workspace dự án, không phải `mode` agent/joint, đề bài ≤ `maxBriefChars` 4000, repo ≤ 300 tệp và ≤ 1,5 MB theo `git ls-files` (`orchestrator.ts:1095-1116`; `config.ts:294`); có thể ép bằng `options.lane` | Đúng một phần (thiếu định nghĩa) | Thêm tiêu chí định lượng ở trên vào §4.1 để người đọc tái lập được. |
| K25 | Lệnh chuẩn bị + baseline chạy song song với lập kế hoạch (P:87; C-10) | `early = this.runProjectChecks(…'baseline')` trước plan, chờ ở `settleEarly` (`orchestrator.ts:1172-1192, 1290`); mặc định bật nếu `tools.earlyBaseline !== false` | Đúng | — |
| K26 | L1: quyền 4 mức = giao của hồ sơ agent, quyền dự án và pha; dự án mặc định `exec`, ngoài dự án mặc định `write` (P:97; CH:98) | `cliTools` (`orchestrator.ts:3141-3151`); `toolAccess` (`:1957-1960`); `projectAccess: 'exec'`, `defaultAccess: 'write'` (`config.ts:296-297`) | Đúng | — |
| K27 | L2: chặn lệnh cấm, `git push`, `reset --hard`, đổi nhánh, rebase, `.env` (P:98; CH:99) | `DEFAULT_DENY` (`src/tools/workspace.ts:245-275`); `guardDecision` (`src/tools/claude-guard.ts:57-62`); thêm chặn `git commit` khi không có nhánh riêng (`workspace.ts:279`) | Đúng | Có thể nêu rằng danh sách gồm 30 mẫu, ví dụ xóa đệ quy, `ssh/scp`, `curl … \| sh`, liệt kê biến môi trường. |
| K28 | L3: công cụ tệp chỉ trong thư mục làm việc; shell chặn đường dẫn tuyệt đối và `../` vượt gốc (P:99; CH:100) | `pathInside(cfg.root, p)` cho Read/Edit/Write/Grep/Glob (`claude-guard.ts:71-76`); `outsidePathReason` (`src/tools/shell-policy.ts:55-87`) **cho phép thư mục tạm và thư mục hệ thống** (`systemDirs()`, `:53, 56`) và theo dõi `cd` | Đúng một phần | "…chặn đường dẫn tuyệt đối ngoài thư mục làm việc, **trừ thư mục tạm và thư mục cài đặt hệ thống**, và `../` vượt gốc." Ngoại lệ này làm L3 yếu hơn mô tả hiện tại. |
| K29 | L4: không tạo/chuyển/xóa nhánh và worktree; chỉ `git merge` (P:100; CH:101) | `claude-guard.ts:61`; `workspace.ts:250-253`; `fc570f3`, `b80769b` | Đúng | — |
| K30 | L5: bọc lệnh Bash bằng `</dev/null` (P:101; C-47) | `withNullStdin` → `{ cmd\n} </dev/null` qua `updatedInput` (`claude-guard.ts:49-51, 155-166`); `0e82b82` | Đúng | Thêm "chỉ cho runtime `claude-cli`". |
| K31 | L6: `readsBeforeWrite` = 16: nhắc ở 16, chặn từ 32 (P:102; CH:103) | `readGate` (`claude-guard.ts:85-101`); `readsBeforeWrite: 16` (`config.ts:302`); chỉ bật ở pha execute/revise (`expectWrites`, `claude-cli.ts:162`; `orchestrator.ts:2681`). **Chính hạng mục này bị nhắc 2 lần khi đang chạy**, đúng như mô tả | Đúng | Thêm "chỉ ở pha thực thi/sửa". |
| K32 | L6: nhắc ghi ở 35 %/65 % ngân sách công cụ (P:102; CH:103) | `frac >= (writeNudges === 0 ? 0.35 : 0.65)` (`src/runtimes/api.ts:514-515`). Cơ chế này chỉ có trong vòng công cụ của runtime API; `claude-cli` không có | Đúng một phần | "…(chỉ runtime API)". |
| K33 | L7: ngân sách nhiệm vụ `budgetTokens` 1.500.000, chế độ `complete/pause` (P:103; CH:104) | `config.ts:285`; `ccoding.config.json:23-24`; `checkBudget` trước mỗi lượt (`orchestrator.ts:2609`) | Đúng | — |
| K34 | L7: ngân sách theo hạng mục none 60k · read 120k · write 200k · exec 300k (P:103; CH:104) | Đây là `estimate.perSubtask` (`config.ts:312`), hằng số **ước lượng** dùng ở `orchestrator.ts:1750-1754`. Ngân sách hạng mục thật là `subtaskBudget()` = `subtaskBudgetTokens` nếu > 0, ngược lại `max(100 000, 2 × budgetTokens / số hạng mục)` (`:1685-1689`). Mức này chỉ cảnh báo ở mỗi mốc 100 %, và chỉ dừng khi ở chế độ `pause` (`:1691-1699`) | **Sai** | "Ngân sách hạng mục: mặc định max(100k; 2 × ngân sách nhiệm vụ / số hạng mục), cảnh báo khi vượt và dừng nếu ở chế độ `pause`; hằng số 60k/120k/200k/300k theo mức quyền chỉ dùng để **ước lượng** token của kế hoạch, cảnh báo khi ước lượng > ngân sách × 1,2 (`estimate.warnRatio`)." |
| K35 | L7: ngân sách vòng công cụ `toolInputBudget` thực thi 800k, sửa 300k, review 200k, kế hoạch 100k (CH:104; P:103) | `config.ts:291`. Chỉ `api.ts:378` đọc giá trị này; `claude-cli.ts` không dùng | Đúng một phần | "…(chỉ runtime API; không áp cho `claude-cli`, tức runtime dùng trong benchtest)". |
| K36 | L8: `timeoutMs` 30 phút (P:104; CH:105) | `config.ts:285`; được truyền làm trần tiến trình `claude` (`orchestrator.ts:2667`; `claude-cli.ts:189`) | Đúng | — |
| K37 | L8: `toolTurns` thực thi 40, sửa 16, review 10 (P:104; CH:105) | Giá trị đúng (`config.ts:290`), nhưng chỉ `api.ts:377` dùng. `claude-cli` không truyền `--max-turns` (`claude-cli.ts:145-176`) | Đúng một phần | "…(chỉ runtime API)". Đây là điểm quan trọng vì Bảng 1 đang ngầm hiểu các trần này áp cho benchtest. |
| K38 | L8: hủy khi treo 5 phút (`idleTimeoutMs`) (P:104; CH:105) | `api.ts:263-264`; `505a1df` có tiêu đề "Runtime API: …" | Đúng một phần | "…(runtime API)". |
| K39 | L9: `maxContinuations` 2; chạy tiếp khi chạm trần mà chưa xong (P:105; C-26) | `config.ts:292`; `orchestrator.ts:1589-1609`. Điều kiện kích hoạt là `res.capped` (`:1603`). Chỉ `api.ts` đặt `capped` (`api.ts:387, 530, 595`); `ClaudeCliRuntime.run` không trả trường này (`claude-cli.ts:202-217`) | Đúng một phần | "…(chỉ áp khi runtime báo chạm trần vòng công cụ, hiện là runtime API; với `claude-cli` cơ chế chạy tiếp không kích hoạt)". Hệ quả là KPI `capHits` của `claude-cli` luôn bằng 0. |
| K40 | L9: làn nhanh 2–4 hạng mục (CH:106) | Chỉ có trong prompt lập kế hoạch: "Chia **2–4 hạng mục ĐỘC LẬP chạy cùng lúc** … người khác nhau … ≤ ~20 thao tác công cụ" (`src/prompts.ts:379`). `shapeFastPlan` không giới hạn số hạng mục (`orchestrator.ts:1054-1089`) | Đúng một phần | "Prompt làn nhanh *yêu cầu* 2–4 hạng mục độc lập (ràng buộc mềm, mã không cưỡng chế)." |
| K41 | L10: `maxRevisions` 1; giữ `reviewRound/revising` qua tạm dừng (P:106; CH:107) | `config.ts:285`; `orchestrator.ts:1320-1330`; `f4681f1` | Đúng | — |
| K42 | L11: `maxParallel` mặc định 3 (P:107; CH:108) | `config.ts:285`; `ccoding.config.json:21`; kẹp trong [1; 8] (`orchestrator.ts:295`) | Đúng | Thêm: ngoài ra còn `maxConcurrentTasks` = 2 nhiệm vụ cùng lúc trên một server (`config.ts:284`; `orchestrator.ts:696`). Giới hạn này liên quan C-23. |
| K43 | L12: `--strict-mcp-config --setting-sources project,local`; bỏ biến khóa; `--allowedTools` theo quyền (P:108; CH:109) | `claude-cli.ts:175, 186, 148, 169`; `scrubEnv` (`workspace.ts:291-303`) | Đúng | Thêm `--no-session-persistence` (`claude-cli.ts:145`), tức mỗi lượt gọi là một phiên mới. Chi tiết này giải thích C-13 (mỗi lượt tự ghi cache). |
| K44 | L12: ngữ cảnh 93k → 7,6k token (P:108; CH:109) | Con số chỉ xuất hiện **trong chú thích mã** (`claude-cli.ts:173`, "đo 28/10"), không có tệp đo trong repo | Đúng (có ghi nhận), bằng chứng yếu | Ghi nguồn là "ghi chú của nhà phát triển (`claude-cli.ts:173`), số đo đơn lẻ". |
| K45 | L13: nhãn dữ liệu quyết định runtime được phép (P:109; CH:110) | `runtimes/index.ts:315` đọc `allowedRuntimes[cls]` | Đúng | — |
| K46 | L13: Nội bộ chỉ được `local, cerebras, groq`; Bảo mật/Hạn chế chỉ Ollama (CH:110) | Mặc định repo: `internal: ['*']`, `confidential/restricted: ['local']` (`config.ts:324`; `ccoding.config.json:105-110`) | **Sai** (so với mặc định repo) | "Mặc định: Công khai/Nội bộ cho phép mọi runtime; Bảo mật/Hạn chế chỉ runtime cục bộ (`local`). Cấu hình cục bộ có thể thu hẹp thêm." |
| K47 | L13: che PII/bí mật trước khi vào log; nhật ký chuỗi băm (P:109; CH:110) | `LogStore` có `redactSecrets/redactPii/hashChain` (`src/app.ts:32`; `src/logger.ts:65-69`, sha256 cắt 32 hex); tệp prompt được `redact` trước khi ghi (`orchestrator.ts:2717`) | Đúng | Thêm cơ chế bài chưa nêu: prompt gửi ra runtime **không cục bộ** luôn được che bí mật, còn PII chỉ được che với nhãn Bảo mật/Hạn chế (`orchestrator.ts:2654-2655, 2688`). |
| K48 | L13: công cụ tra cứu chỉ với dữ liệu Công khai/Nội bộ (CH:110) | `web = … (cls === 'public' \|\| cls === 'internal')` (`orchestrator.ts:2647`) | Đúng | — |
| K49 | L14: KPI 4 nhóm 40/25/20/15; "việc cần sửa" tự sinh (P:110; CH:111) | `WEIGHTS = {quality: .4, efficiency: .25, reliability: .2, compliance: .15}` (`src/kpi.ts:128`); các finding sinh theo ngưỡng (`kpi.ts:605-609`); `36d498c` | Đúng | — |
| K50 | L14 / design D:8: góp ý của giám đốc ≤ 5 mục vào system prompt, mỗi mục cắt 300 ký tự (CH:111; D:8) | `activeFeedback(agentId, limit = 5)` (`src/store.ts:187`); `truncate(…, 300)` (`src/prompts.ts:104`); nạp ở `orchestrator.ts:2652-2653` | Đúng | — |
| K51 | C-05: hồ sơ agent rút còn 450–700 từ (CH:29) | `wc -w agents/*/*.md` cho 735–941 "từ" ở 15 tệp, gồm cả frontmatter. Tiếng Việt bị `wc` đếm theo âm tiết, nên không so trực tiếp được | Chưa kiểm chứng được | Ghi rõ đơn vị (từ hay âm tiết) và phần được đếm (có hay không có frontmatter, mục "Mẫu đầu ra"…). |
| K52 | §5 C6 = kiểm chứng `d7600f6` (P:123) | Tiêu đề `d7600f6` khớp; `git cat-file -t 5866cda` → `commit` (commit tồn tại trong repo cục bộ) | Đúng | Có thể bỏ ghi chú "nếu repo có commit đó": `5866cda` có thật trong repo. |
| K53 | C-11/C-13: "mỗi lượt gọi là một phiên `claude -p` mới" (CH:35, 37) | `-p … --no-session-persistence` (`claude-cli.ts:145`); prompt ghép thành một khối `context → VAI TRÒ → CÔNG VIỆC`, gửi qua stdin, **không dùng `--system-prompt`** (`src/runtimes/common.ts:7-13`; `claude-cli.ts:178, 188`) | Đúng | Thêm cho §6.4: tiền tố có thể dùng chung cache giữa các agent là khối `context` đứng đầu; phần hồ sơ đứng sau `context`, nên khác nhau theo agent. |

*Tổng: 53 khẳng định. Kết quả: **34 đúng · 16 đúng một phần · 2 sai (K34, K46) · 1 chưa kiểm chứng được (K51)**. Cách đếm: đếm theo cột "Kết luận". K44 tính là đúng, kèm ghi chú bằng chứng yếu.*

## 2. Cơ chế có trong mã nhưng bài chưa nhắc

| Cơ chế | Bằng chứng | Vì sao nên nhắc |
|---|---|---|
| Hạng mục phụ thuộc chờ tiền đề được **gộp** xong rồi mới chạy | `orchestrator.ts:1528` (`unmerged`) | Ảnh hưởng đường găng (T-d) |
| Vòng sửa chạy trong worktree chính; hạng mục chạy lệnh được sửa **lần lượt** | `orchestrator.ts:1419-1427` | Giải thích phần thời gian 0,5–8 phút của C-32 |
| `shapeFastPlan` đổi người nhận và chuyển hạng mục của reviewer thành trọng tâm review | `orchestrator.ts:1056-1080` | Là một chiến lược điều phối riêng của làn nhanh |
| Báo cáo cuối làn nhanh dựng từ mẫu, không gọi LLM | `orchestrator.ts:1466-1467` | Giải thích phần tiết kiệm thời gian/chi phí ở C5–C6 |
| Tiêu chí chọn làn (`pickLane`: 4000 ký tự / 300 tệp / 1,5 MB) | `orchestrator.ts:1095-1116`; `config.ts:294` | Cần để tái lập |
| `maxConcurrentTasks` = 2 nhiệm vụ cùng lúc | `config.ts:284`; `orchestrator.ts:696` | Liên quan C-23 (tranh agent) |
| Che bí mật trong prompt gửi ra runtime không cục bộ; che PII theo nhãn | `orchestrator.ts:2654-2655, 2688` | Lớp bảo vệ dữ liệu "trên đường đi", khác với che trong log |
| Chờ model nhanh thay vì chạy model chậm ở pha nặng (`slowModels`, `waitForFastMs`) | `orchestrator.ts:2622-2645`; `config.ts:279-281` | Bài chỉ nhắc ở C-24, chưa đưa vào L8 |
| Failover runtime: tối đa `maxFailover` 6 ứng viên, xếp sau model vừa bị 429 | `orchestrator.ts:2614-2630`; `config.ts:277-278` | Cơ chế tin cậy (C-36/37), chưa có trong Bảng 1 |
| Hook **chặn khi không đọc được cấu hình/sự kiện** (fail-closed) | `claude-guard.ts:127-141` | Điểm mạnh an toàn đáng nêu ở L2–L4 |
| Vai trò không có Bash nhưng có `git_read` được cấp Bash giới hạn lệnh git chỉ đọc; danh sách 26 lệnh con và tùy chọn cấm | `orchestrator.ts:3150`; `shell-policy.ts:92-98` | Chi tiết của L1/C-48 |
| `variantOptions` (`variant`, `lane`, `phaseModels`, `repoMapMode`, `bashMaxOutput`) cho benchtest | `orchestrator.ts:3157-3168` | Cơ sở tái lập C5/C6; design.md có thể dùng lại (xem mục 4) |
| Cổng duyệt kế hoạch của giám đốc (`planApproval`) | `orchestrator.ts:1273-1300, 1780` | Cơ chế con người trong vòng lặp, liên quan RQ2 |
| Kẹp tham số: `maxParallel` ∈ [1; 8], `maxRevisions` ∈ [0; 3] | `orchestrator.ts:295-296` | Giới hạn cứng phía trên cấu hình |

## 3. Điều bài mô tả mà không có mã (hoặc không có hiệu lực ở runtime được đo)

| Mô tả | Vị trí | Thực trạng |
|---|---|---|
| Ngân sách token theo hạng mục 60k/120k/200k/300k | P:103, CH:104 | Đây là hằng số ước lượng, không phải ngân sách (K34) |
| `toolTurns`, `toolInputBudget`, nhắc 35/65 %, `idleTimeoutMs` như giới hạn sub-agent chung | P:102-104, CH:103-105 | Chỉ có ở runtime API; không hiệu lực với `claude-cli` (K32, K35, K37, K38) |
| Nội bộ chỉ được `local, cerebras, groq` | CH:110 | Không có trong cấu hình repo (K46) |
| Lead làn nhanh dùng Sonnet (hiểu là cho mọi lượt của lead) | P:86 | Chỉ pha plan; finalize bị bỏ, synthesize không gọi LLM (K23) |
| Cờ "cần xem" khi reviewer không chạy lệnh | CH:112, P:111 | Chỉ có log và cảnh báo, không bật `attention` (K19) |
| Làn nhanh giới hạn 2–4 hạng mục | CH:106 | Chỉ là yêu cầu trong prompt (`prompts.ts:379`); mã không cưỡng chế (K40) |
| Kiểm tra cơ học "hạng mục độc lập không ghi cùng tệp" | CH:146 (P-15, đề xuất) | Chưa có; bài ghi đúng là đề xuất |
| "Ghế" ≤ 2 hạng mục/vai trò | CH:52 (C-23) | Chưa có; bài ghi đúng là chưa làm |
| Review theo từng hạng mục khi gộp | CH:66 (C-32) | Chưa có; bài ghi đúng là chưa làm |

## 4. Điểm móc của `design.md`: có tồn tại không

| Điểm móc (dòng) | Vị trí ghi trong design | Có trong mã? | Ghi chú |
|---|---|---|---|
| D:8 `systemFor`, nạp góp ý ~2652 qua `store.activeFeedback` | `prompts.ts`, `orchestrator.ts` | **Có**: `prompts.ts:86`, `orchestrator.ts:2652`, `store.ts:187` | Số dòng chính xác |
| D:8 `computeKpi`, `FINDING_LABELS` | `kpi.ts` | **Có**: `computeKpi` (`kpi.ts:199`), `FINDING_LABELS` (`kpi.ts:100`, được export và dùng ở `server.ts:9, 406, 444`) | — |
| D:35 `review.issues` blocker/major ~1356–1393 | `orchestrator.ts` | **Có**: `:1356-1393` | — |
| D:36 `checkRegressions(task)` ~1358 | `orchestrator.ts` | **Có**: lời gọi `:1358`, định nghĩa `:2543` | — |
| D:37 `verified === false` → `review.unverified` ~1377–1385 | `orchestrator.ts` | **Có**: `:1377-1385` | — |
| D:38 `AgentKpi.findings`, `recurred`, `applyResolutions` | `kpi.ts` | `recurred` **có** (`kpi.ts:92, 524`); `applyResolutions` **có** (`:498`); `findings` **có** (`kpi.ts:88`) | — |
| D:39 `attemptsAvg`, `tools.capHits`, `truncated` | `kpi.ts` | **Có**: `kpi.ts:75, 281-282, 428` | Lưu ý: `capHits` lấy từ `diag` "chạm trần", mà chỉ runtime API sinh ra. Với `claude-cli`, `capHits` luôn bằng 0, nên không dùng được làm tín hiệu sự cố cho benchtest |
| D:40 `failedCalls` / `infraFailedCalls` | `kpi.ts` | **Có**: `kpi.ts:62, 64, 271-272` | — |
| D:41 `store.feedback()`, `server.ts` ~437–447 | `store.ts`, `server.ts` | **Có**: `store.ts:156`, `server.ts:437-445` | — |
| D:119 Thu sự cố sau `parseReview`/`checkRegressions` ~1356–1366 | `orchestrator.ts` | **Có** | Điểm chèn hợp lý |
| D:121 Parse "Nhật ký sự cố" sau `revisePrompt` ~1399–1410; dùng kiểu `ISSUE_RE` | `orchestrator.ts`, `kpi.ts` | **Có**: `revisePrompt` gọi ở `:1406`; `ISSUE_RE` ở `kpi.ts:129` (không export) | Muốn dùng chung thì phải export `ISSUE_RE` |
| D:122 `src/selfimprove.ts` | mới | **Không có**, design ghi đúng là đề xuất | — |
| D:123 `computeKpi` → `findingKeys`, `recurred` | `kpi.ts` | **Có**: `findingKeys` (`kpi.ts:90, 457`), `recurred` (`:92, 524`) | — |
| D:124 `systemFor`/`executePrompt`; cờ `selfImprove.variant` | `prompts.ts`, cấu hình | `systemFor` có; khóa `selfImprove` **không có** (đề xuất). Đã có sẵn `TaskOptions.variant` (`orchestrator.ts:3165`) | Đề xuất dùng lại `variant` thay vì tạo khóa mới |
| D:125 `bench.ts COMMON_KEYS` + `harness/run.mjs` | `bench.ts`, `bench/vs-claude/harness/` | **Có**: `bench.ts:125` (11 khóa, **không có** `variant`/`lane`); `bench/vs-claude/harness/run.mjs` tồn tại | Phải thêm `variant` vào `COMMON_KEYS` nếu muốn A/B qua `ccoding bench` |
| D:126 `server.ts` tuyến feedback ~437 + `public/` | `server.ts` | **Có** | — |
| D:127 `src/ship.ts` / `src/git.ts` | | **Có** cả hai tệp (repo-map: 266 và 211 dòng) | — |
| D:129 Không gọi LLM ngoài `Orchestrator.call()` | | Đúng với quy ước `AGENTS.md` | — |

**Tóm tắt mục 4:** 16/18 điểm móc trỏ đúng mã hiện có (số dòng khớp ±2). D:124 khớp một phần: `systemFor` có, còn khóa `selfImprove.*` chưa có. D:122 (`src/selfimprove.ts`) chưa có. Với cả hai điểm này, design đã ghi đúng là đề xuất. Có 2 điểm cần sửa trong design: (a) `ISSUE_RE` chưa được export, nên muốn dùng chung thì phải export; (b) nên dùng lại `TaskOptions.variant` sẵn có và thêm `variant` vào `COMMON_KEYS` (`bench.ts:125`), thay vì tạo cờ mới. Ngoài ra, mọi tín hiệu "chạm trần" (`capHits`, `truncated` theo diag) đều bằng 0 với `claude-cli`. Vì vậy vòng tự cải thiện nên lấy sự cố chủ yếu từ review, hồi quy và chặn của hook. Hiện **hook chặn không được log riêng thành sự kiện**: hook chỉ trả lỗi cho Claude, còn CCoding thấy lỗi qua `tool_result is_error` (`claude-cli.ts:100-103`). Đây là điểm móc nên thêm.

## 5. Gợi ý cho S5 (ứng viên cải thiện hệ thống, chưa chấm điểm)

1. Cấp trần lượt cho `claude-cli` (`--max-turns` theo `phases.toolTurns`), hoặc nói rõ trong bài rằng trần này không áp cho `claude-cli`. Liên quan K37, K39.
2. Ở làn đầy, cấm giao hạng mục cho reviewer, hoặc tự chuyển hạng mục đó như `shapeFastPlan` (K10).
3. Bật `attention` khi `verified === false` để khớp với mô tả L15 (K19).
4. Ghi sự kiện `guard.blocked`, phục vụ L2–L4 ("số chặn đúng/nhầm: chưa đo") và vòng tự cải thiện.
5. Cân nhắc bỏ `--no-verify` khi gộp, hoặc ghi rõ lý do giữ (K13).

## 6. Lệnh kiểm chứng cần người có quyền chạy

```bash
git rev-parse HEAD && git status --short             # xác nhận trạng thái đối chiếu
npm run typecheck && npm test                        # gồm test/claude-guard.test.ts (hành vi hook)
git grep -n "max-turns" -- src/                      # kỳ vọng: 0 kết quả (xác nhận K37)
git grep -n "capped" -- src/runtimes/                # kỳ vọng: chỉ api.ts (xác nhận K39)
git show d7600f6 --stat                              # phạm vi thay đổi của bản sửa maxParallel
```

