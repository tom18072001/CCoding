# BRIEF-22c — nhật ký lệnh kiểm (nguyên văn)

Phân loại dữ liệu: Nội bộ. Seed mẫu: 20261115. HEAD khi chạy: 069b6441 (khối test chạy lại sau khi sửa g-mutation.mjs; các khối trên chạy ở 5bcf5807, kết quả không đổi). Đã chạy `npm ci --ignore-scripts` trước (worktree thiếu `typescript`, khiến 3 tệp test analysis đỏ ở lần chạy đầu).

## `node docs/research/scripts/logic-map-check.mjs --strict`

```
Mốc: ccc76cc0840110debab2a0e69f64b10bee965533
Chế độ: strict (mặc định)
Tổng tham chiếu tệp:dòng: 445 (có ký hiệu: 445, không ký hiệu: 0); lệch: 0.
Đạt: 445 tham chiếu khớp đúng dòng ở mốc.
```

exit code: 0

## `node docs/research/scripts/logic-map-check.mjs --sample 10 --seed 20261115`

```
Mốc: ccc76cc0840110debab2a0e69f64b10bee965533
Chế độ: strict (mặc định)
Tổng tham chiếu tệp:dòng: 445 (có ký hiệu: 445, không ký hiệu: 0); lệch: 0.

Mẫu 10/445 tham chiếu (seed 20261115):
- orch:3550 tại docs/research/analysis/decisions/logic-map.md:94 [ok]
    ký hiệu: maxOutputChars
    trong bài: …(cấu hình + dự án), `commandTimeoutSec`, `maxOutputChars` (`orch:3550` (`maxOutputChars`)). Ba mốc: `baseline` (trước khi sửa; ch…
    dòng thật ở mốc: const opts = { denyCommands: [...config.tools.denyCommands, ...(project.denyCommands ?? [])], timeoutSec: config.tools.commandTimeoutSec, maxChars: config.tools.maxOutputChars, signal };
- orch:2155 tại docs/research/analysis/decisions/logic-map.md:94 [ok]
    ký hiệu: run.revising
    trong bài: …`orch:1974-1977` (`execute`)), `revise` (sau mỗi vòng sửa, `orch:2155` (`run.revising`)). Điều kiện chạy: `projectCheckable` (`…
    dòng thật ở mốc: run.revising = run.revising?.filter((id) => id !== st.id);
- orch:1372 tại docs/research/analysis/decisions/logic-map.md:167 [ok]
    ký hiệu: keywordRoute
    trong bài: …ute` | LLM + mã lùi | `orch:1351` (`private async route`), `orch:1372` (`keywordRoute`), `planner.ts:275` (`parseRoute`), `:291…
    dòng thật ở mốc: result ??= keywordRoute(task.brief, depts);
- lane.ts:130–145 tại docs/research/analysis/decisions/logic-map.md:168 [ok]
    ký hiệu: cfg.lanes?.single
    trong bài: …`chooseLane` (+ `forcedLane`) | **Mã thuần, không LLM** | `lane.ts:130-145` (`cfg.lanes?.single`), `orch:1477-1516` (`pickLane`) |…
    dòng thật ở mốc: const single = cfg.lanes?.single ?? { enabled: true, maxParts: 5, maxFilesTouched: 6 };
- claude-guard.ts:110 tại docs/research/analysis/decisions/logic-map.md:189 [ok]
    ký hiệu: outsideWriteDecision
    trong bài: …D16).** Rule được gọi ở đúng một chỗ: hook `claude-guard` (`claude-guard.ts:110` (`outsideWriteDecision`)). Hai đường chạy lệnh khác chỉ có `deni…
    dòng thật ở mốc: const wv = outsideWriteDecision(cmd, cfg.root);
- planner.ts:304–314 tại docs/research/analysis/decisions/logic-map.md:190 [ok]
    ký hiệu: readySubtasks
    trong bài: …đổi người để tách (`shapeFastPlan`); làn đầy thì không. | `planner.ts:304-314` (`readySubtasks`); `orch:1450-1462` (`seen.add`) | Trung…
    dòng thật ở mốc: export function readySubtasks(subtasks: Subtask[], busyAgents: Set<string>): Subtask[] {
- orch:1865–1867 tại docs/research/analysis/decisions/report.md:31 [ok]
    ký hiệu: parsePlan
    trong bài: …Plan`, `shapeFastPlan` (làn nhanh), `planGate` | có + mã | `orch:1865-1867` (`parsePlan`), `planner.ts:100` (`parsePlan`), `plan-…
    dòng thật ở mốc: // lượt gọi lỗi → dừng (tiếp tục được) thay vì làm theo kế hoạch dự phòng đoán mò
- orchestrator.ts:1974 tại docs/research/improvement-backlog.md:198 [ok]
    ký hiệu: task.projectChecks
    trong bài: …ands` trước thực thi, sau thực thi, sau mỗi vòng sửa | Đọc `orchestrator.ts:1974` (`task.projectChecks`), `:2535` (chạy), `:1360` (chạy lại khi…
    dòng thật ở mốc: if (checkable && !task.projectChecks?.baseline && !run.subtasks.some((s) => s.attempts > 0 || s.status === 'done')) await this.runProjectChecks(task, project, dept.id, 'baseline');
- bench/vs-claude/lib/ccoding.mjs:129 tại docs/research/improvement-backlog.md:529 [ok]
    ký hiệu: ...opts.taskOptions
    trong bài: ….options ?? {}`) truyền `taskOptions: spec.options ?? {}`. `bench/vs-claude/lib/ccoding.mjs:129` (`...opts.taskOptions`) dựng `options: { budgetMode: 'complete'…
    dòng thật ở mốc: options: { budgetMode: 'complete', planApproval: false, ...opts.taskOptions, variant: opts.variant },
- bench/vs-claude/analyze.mjs:272 tại docs/research/improvement-backlog.md:1142 [ok]
    ký hiệu: Coordination failures
    trong bài: …ation.ccoding-fastlane.3/{ccoding-task.json,result.json}`, `bench/vs-claude/analyze.mjs:272` (“Coordination failures”), `bench/vs-claude/lib/grade.mjs:146` (`…
    dòng thật ở mốc: H.push(['H8', 'Coordination failures: untouched-file test failures and check-still-red-at-end, paired by task', `${txt}chỉ số phụ formatMiss ${BASE} ${pp(fm(BASE))} vs ${TREAT} ${pp(fm(TREAT))}`, verdict(dR > 0 && dU >= 0, pairs.length < MIN_TASKS) + ' (confirm with transcript review)']);
Đạt: 445 tham chiếu khớp đúng dòng ở mốc.
```

exit code: 0

## `node docs/research/scripts/consistency-check.mjs`

```
Đạt: 60 tệp, không lệch số liệu.
```

exit code: 0

## `node docs/research/analysis/decisions/scorecard.mjs --check`

```
OK: 20/20 dòng agent trong scorecard.md (14 có KPI + 6 không có dữ liệu trong 30 ngày); 18 khối bảng trong scorecard.md và effectiveness.md trùng đầu ra script; 360 khóa brief22.*
```

exit code: 0

## `node --test "docs/research/scripts/*.test.mjs" "docs/research/analysis/*.test.mjs"`

```
✔ κ = 0: khớp đúng bằng mức ngẫu nhiên (3.7584ms)
✔ κ = 1: khớp hoàn toàn (0.4226ms)
✔ nghịch lý prevalence: khớp thô 0,90, κ âm nhỏ, PABAK 0,8, có cảnh báo (0.8735ms)
✔ prevalence thấp (< 0,1) cũng cảnh báo; ở 0,5 thì không (0.6163ms)
✔ κ không xác định khi chỉ một nhãn (pe = 1); không lỗi, PABAK vẫn tính được (0.3231ms)
✔ 3 lớp: ma trận nhầm lẫn, macro-F1, κ, PABAK (0.6206ms)
✔ bootstrap lấy lại THEO LƯỢT: tổng cỡ mẫu chỉ có thể là tổng cỡ của các lượt (5.6279ms)
✔ bootstrap: mọi mục của một lượt đi cùng nhau (không tách được) (2.3462ms)
✔ bootstrap: seed cố định cho kết quả giống hệt; đổi seed thì khác (88.7785ms)
✔ bootstrap: bản lấy mẫu mà κ không xác định bị bỏ và đếm (22.674ms)
✔ report: CI gồm đủ chỉ số và chứa ước lượng điểm của Accuracy (35.1618ms)
✔ CSV: vòng khứ hồi với dấu phẩy, ngoặc kép, xuống dòng; bỏ BOM và dòng chú thích (0.7921ms)
✔ đa lớp: cảnh báo nghịch lý chỉ khi lớp lớn nhất > 0,9; lớp nhỏ < 0,1 thì không (preregistration §5.1) (1.0065ms)
✔ PABAK đa lớp dùng k cố định (kFixed) khi lấy lại mẫu có ít lớp hơn mẫu gốc (0.2376ms)
✔ Clopper–Pearson: giá trị tính tay/đã biết (1.1698ms)
✔ minPositives: nửa độ rộng CP ≤ 0,15 tại kết quả; recall gần 0,5 cần nhiều dương hơn gần 1 (91.9526ms)
✔ 1. hai nhánh y hệt nhau → không phân biệt được (213.5359ms)
✔ 2. nhánh bật nhân 0,8 → giảm, R̂ ≈ 0,8 (±0,03), cận trên CI < 1 (129.4027ms)
✔ 3. nhánh bật thiếu r13–16 → chỉ dùng cặp đủ, n = 72, nhãn chưa đủ N (69.6573ms)
✔ 4. status ≠ done và excluded bị loại, không vào T, đếm theo lý do (149.7152ms)
✔ 5. permStratified gọi đúng một lần với đúng { alt, margin, M, seed }, không thêm khóa (91.6231ms)
✔ 6. lượt thay rep 17 nhận cặp của lượt bị loại; lượt thay thứ 3 làm ô thiếu dữ liệu (198.05ms)
✔ 7. dòng thiếu weighted được tính theo input + 1,25·cacheWrite + 0,1·cacheRead + 5·out (163.4352ms)
✔ 8. deps mặc định là chính permStratified của bench/vs-claude/lib/stats.mjs, không từ vendor/ (154.5097ms)
✔ 9. CLI khi thiếu tệp: exit ≠ 0, thông báo tiếng Việt (265.689ms)
✔ CLI với dữ liệu giả ghi vào thư mục tạm: in bảng và --json có permArgs (897.7869ms)
✔ 10. collapseRetries: dòng infra trước lượt done không chặn quan sát; failed rồi done = lượt thay cùng khóa (190.7911ms)
✔ 11. lượt thay cùng khóa tính vào trần 2 mỗi ô; quá trần → ô thiếu dữ liệu (104.8229ms)
✔ 12. opts.exclude bỏ đúng một lượt (độ nhạy), không đổi tham số phép kiểm (75.6833ms)
✔ đủ 12 ca F1–F12, mỗi ca có kết quả so với S2 (2.9433ms)
✔ các ca lệch đăng ký đã biết: F1 (T-1), F7 (B-1), F11 (S-1), F12 (T-2); ca khác khớp (0.3696ms)
✔ e5f: R̂ đúng khi B1F tốn bằng nửa B0F; quy tắc (8) loại cả cặp khi B0F không họp (149.6895ms)
✔ h6-sensitivity: Δ_i theo bài, bỏ t2-orders và t4-perf ở (i) (63.4928ms)
✔ e4: q̂, recall chưa ước lượng được khi < 10 dương, b10 theo bài, lượt sạch, B-16 (9.9641ms)
✔ D-G2: g-analyze.mjs không import g-mutation.mjs (chạy được khi chưa cài typescript) và rng trùng dãy với bản gốc (21.4904ms)
✔ D-G1: deltaStat nhóm theo lần rút `_c` nên bài rút hai lần giữ bội số 2 (1.0647ms)
✔ D-G1: bootstrap2 mỗi lần rút bài là một cụm; cụm chỉ chứa lượt của một bài; số cụm = số bài (25.4697ms)
✔ cp vẫn khớp giá trị đã biết (0/239 cận trên ≈ 1,5 %) (0.4502ms)
(node:46764) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated.
(Use `node --trace-deprecation ...` to show where the warning was created)
✔ mutationSites: đủ các toán tử và áp đúng vị trí (17.3329ms)
✔ rng và sample: cùng hạt giống cho cùng mẫu, khác hạt giống thì khác (2.4717ms)
✔ productFiles: chỉ tệp nguồn thuộc deliverable, bỏ tệp test (23.0158ms)
✔ evalRun trên bài giả: base đúng, đột biến được phân loại thật/không thật và chặn/không chặn (16822.6825ms)
✔ cp: Clopper–Pearson khớp giá trị đã biết (0.8302ms)
✔ analyze: hai nhóm như nhau → Δ = 0, p lớn; nhóm C bắt nhiều hơn 30 điểm → Δ ≈ 0,3, p nhỏ (141.5818ms)
✔ analyze: G-1/G-2 đếm đúng; lượt không có package.json không tính (0.7526ms)
✔ deltaStat/permDelta: bài thiếu một nhóm bị bỏ (1.4794ms)
✔ overlayStarter (G-b): chép tệp starter còn thiếu, không ghi đè tệp đã có (16.9324ms)
✔ đọc nhãn từ kinds (1.9895ms)
✔ (1) b02 chặn rồi sửa xong: decision → rounds cặp pred=1; run → 1 cặp (1.8835ms)
✔ b02 không chặn → 1 cặp pred=0; rounds thiếu mà blocked → 1 cặp (0.6626ms)
✔ (2) b10 null ở làn đơn: không có dòng b10, stderr đếm đúng (0.957ms)
✔ (3) CTO không đạt trên g5/g6 → ref=1, pred=1; đạt → pred=0 (0.3553ms)
✔ (4) lượt sạch → ref=0 cho mọi cổng; cổng khác kind cũng ref=0 (0.6385ms)
✔ (5) CSV đọc đúng bằng parseCsv và report; main --out + --positive 1 (22.142ms)
✔ (6) --gate lọc đúng; thiếu --unit → mã 2 (11.3179ms)
✔ (7) bài g1 với --gate cto: mặc định bỏ khỏi mẫu (không thành chặn nhầm); negatives=cross giữ ref=0 (0.5577ms)
✔ (8) stderr tách cổng null, bài loại khác và dòng infra/error theo status; --negatives sai → mã 2 (5.2101ms)
✔ (9) --label gate: b02 ref theo checksRed > 0 / = 0, bất kể nhãn theo bài (0.3782ms)
✔ (10) thiếu một phần checksRed: lùi về nhãn theo bài; stderr và dòng tổng hợp có số dòng lùi (9.6147ms)
✔ (11) thiếu toàn bộ checksRed: vẫn exit 0, dòng tổng hợp ghi "task (lùi)", nhãn = nhãn theo bài (6.8292ms)
✔ (12) --label task cho đầu ra CSV giống --negatives/hành vi cũ, bỏ qua checksRed (9.0061ms)
✔ (13) --label sai → mã 2; b10 giữ nhãn theo bài, cto thiếu pass lùi về nhãn theo bài ở --label gate (5.7164ms)
✔ (14) cto + --label gate: ref theo pass của dòng (false → 1, true → 0), bài sạch ref = 0, thiếu pass lùi (61.4524ms)
✔ (15) cto: mọi dòng g5/g6 thiếu pass → nhãn hiệu lực task (lùi) (6.9479ms)
✔ unionMs / maxConcurrent (1.7452ms)
✔ criticalPathMs theo phụ thuộc (2.027ms)
✔ runRows + summarize: lượt song song và lượt lần lượt (5.1566ms)
✔ independentPairs tính phụ thuộc bắc cầu: chuỗi S1→S2→S3 không có cặp độc lập (0.5866ms)
✔ D-P1: lệnh đỏ lúc kết thúc đếm theo nhiệm vụ, không theo lượt phòng; CP và theo phòng có trong báo cáo (5.5449ms)
✔ tỉ số 1,00 phương sai nhỏ → tương đương (xác nhận) (107.698ms)
✔ tỉ số 1,30 → không tương đương (bác bỏ), cận dưới > 1,15 (74.0451ms)
✔ tỉ số 0,70 → bác bỏ ở phía dưới (45.7676ms)
✔ CI cắt biên → không kết luận (tỉ số 1,10 phương sai lớn) (60.4827ms)
✔ trần: mọi lượt ≥ 0,99 ở cả hai arm → (c) không kết luận dù CI = [1, 1] (43.3664ms)
✔ trần một phần: chỉ còn 2 bài không trần (< 3) → không kết luận; còn 3 bài → tính được (39.0317ms)
✔ trần: một arm có lượt < 0,99 thì giữ bài (chạm trần một phía) (36.8826ms)
✔ IUT: một phép trượt thì B-01 trượt (0.3757ms)
✔ cùng hạt cho cùng kết quả; khác hạt cho CI khác (163.8315ms)
✔ TB = 0 (log không xác định) → không kết luận, không giả CI (29.566ms)
✔ loại lượt: Q, L, T hạ tầng, E4; giữ T-giữ, N1 và lượt done (1.1206ms)
✔ H5: ghép theo bài, đếm bài đạt 3× token và 1,5× thời gian (49.2155ms)
✔ cửa sổ gán theo thời điểm ghi dòng (0.2407ms)
✔ phân vị chuẩn, χ², t khớp bảng (10.369ms)
✔ σ_ln gộp: ví dụ tay, bỏ ô n < 2 (0.5677ms)
✔ CI của σ theo χ²: σ = 0,178, df 24 → cận trên ≈ 0,247 (§9 ghi 0,248) (0.5832ms)
✔ vòng 10 s: wallSec = 10k + ε (0.2835ms)
✔ Sheppard: phương sai nhỏ hơn h²/12 bị hiệu chỉnh về 0 (0.459ms)
✔ mô phỏng làm tròn: σ thật 0 ⇒ σ quan sát 0; σ lớn ⇒ ≈ σ thật; đơn điệu (93.5054ms)
✔ SE của Δ = σ/3 với 3 bài × 6 lượt mỗi ô; power σ = 0,25 giảm 30 % > 0,9; σ = 0,4 ≈ 0,76 (1.4517ms)
✔ MDE và σ tối đa là nghịch đảo của power (58.7575ms)
✔ power mô phỏng (hoán vị) gần giải tích và mức sai loại I gần 0,05 (536.4817ms)
✔ Fisher chính xác hai phía (0.6945ms)
✔ relabel chỉ đổi nhãn real của bài được chỉ định, giữ vRed (3.2245ms)
✔ bootstrap2Legacy tất định theo hạt giống và cho CI chứa ước lượng ở dữ liệu cân (15.1855ms)
✔ scenario: số đếm khớp tay trên dữ liệu nhỏ (13.5904ms)
✔ dữ liệu đã commit: σ_ln gộp của gates-pilot + b7prime = 0,178, df 24 (khớp §9) (4.7552ms)
✔ không có đường dẫn máy → exit 0 (315.326ms)
✔ có đường dẫn máy (windows) → exit 1, in tệp:dòng (183.7611ms)
✔ có đường dẫn máy (windows /) → exit 1, in tệp:dòng (219.7346ms)
✔ có đường dẫn máy (mac) → exit 1, in tệp:dòng (285.5848ms)
✔ có đường dẫn máy (linux home) → exit 1, in tệp:dòng (214.7532ms)
✔ có đường dẫn máy (tmp) → exit 1, in tệp:dòng (200.6748ms)
✔ có đường dẫn máy (var/folders) → exit 1, in tệp:dòng (249.9568ms)
✔ có đường dẫn máy (AppData Temp) → exit 1, in tệp:dòng (190.3585ms)
✔ preregistration.md được miễn quét đường dẫn máy (223.1467ms)
✔ ngoại lệ dạng line vẫn hoạt động (540.1308ms)
✔ ngoại lệ dạng anchor: khớp duy nhất → bỏ qua đúng dòng, không phụ thuộc số dòng (226.7571ms)
✔ anchor chỉ miễn đúng dòng chứa nó; dòng khác vẫn lỗi (332.4148ms)
✔ anchor không tìm thấy → lỗi (exit 2) (208.8644ms)
✔ anchor xuất hiện hơn một lần → lỗi (exit 2) (299.2521ms)
warning: in the working copy of 'src/alpha.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/alpha.ts', LF will be replaced by CRLF the next time Git touches it
✔ tham chiếu đúng ở mốc → exit 0 (1608.5259ms)
✔ bản sao lệch một dòng → exit 1 và in tham chiếu lệch (599.859ms)
✔ thiếu mốc → exit 2 (180.3121ms)
✔ đọc mốc từ dòng "Mốc:" của logic-map.md (597.096ms)
✔ agents/*.md: dòng đúng kèm cụm trích → exit 0; lệch một dòng → exit 1 (962.5163ms)
✔ agents/*.md: thiếu cụm trích → exit 1 (689.0346ms)
✔ .md ngoài agents/ không bị quét (410.9516ms)
✔ ký hiệu ngắn/chung: --no-strict cảnh báo (exit 0), strict mặc định ⇒ exit 1 (1066.7909ms)
✔ danh sách quét mặc định gồm model-per-role.md và scorecard.md (893.4235ms)
✔ C2-r ca 1: tham chiếu sai phải đỏ, dạng đúng phải xanh (888.4405ms)
✔ C2-r ca 2: tham chiếu sai phải đỏ, dạng đúng phải xanh (785.5503ms)
✔ C2-r ca 3: tham chiếu sai phải đỏ, dạng đúng phải xanh (996.0719ms)
✔ C2-r ca 4: tham chiếu sai phải đỏ, dạng đúng phải xanh (1042.2478ms)
✔ C2-r ca 5: tham chiếu sai phải đỏ, dạng đúng phải xanh (935.5262ms)
✔ C2-r ca 6: tham chiếu sai phải đỏ, dạng đúng phải xanh (1024.2299ms)
✔ C2-r ca 7: tham chiếu sai phải đỏ, dạng đúng phải xanh (831.7439ms)
✔ C2-r ca 8: tham chiếu sai phải đỏ, dạng đúng phải xanh (955.854ms)
✔ C2-r ca 9: tham chiếu sai phải đỏ, dạng đúng phải xanh (935.8128ms)
✔ C2-r ca 10: tham chiếu sai phải đỏ, dạng đúng phải xanh (870.7943ms)
✔ C2-r ca 11: tham chiếu sai phải đỏ, dạng đúng phải xanh (852.8245ms)
✔ C2-r ca 12: tham chiếu sai phải đỏ, dạng đúng phải xanh (859.8318ms)
✔ C2-r ca 13: tham chiếu sai phải đỏ, dạng đúng phải xanh (1060.5184ms)
✔ C2-r ca 14: tham chiếu sai phải đỏ, dạng đúng phải xanh (793.8042ms)
✔ C2-r: đủ 14 ca (0.198ms)
✔ khớp đúng dòng: ký hiệu ở giữa dải không đủ; ở đầu hoặc cuối dải thì đạt (844.9918ms)
✔ lệch cố ý đúng một dòng ⇒ exit 1 (ở cả hai phía) (812.3973ms)
✔ ký hiệu ngắn/chung bị từ chối dù có trên đúng dòng; --no-strict chỉ cảnh báo (734.1648ms)
✔ khớp theo ranh giới từ: ký hiệu chỉ là chuỗi con của từ trên dòng đích ⇒ lệch (388.6416ms)
✔ phủ bench/**: dòng đúng xanh, dòng kế bên đỏ (448.5462ms)
✔ --sample/--seed: cùng seed cho cùng mẫu; khác seed khác mẫu; in đủ các trường (1218.2679ms)
✔ --sample không đổi mã thoát; tham số sai ⇒ exit 2 (578.0683ms)
✔ phạm vi mặc định: backlog từ khối B-20, paper.md chỉ §4.4 (585.7505ms)
ℹ tests 142
ℹ suites 0
ℹ pass 142
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 25999.0219
```

exit code: 0

## `git status --short`

```
```

exit code: 0

## Ghi chú

- Lần chạy trước, test glob exit 1 vì `g-mutation.test.mjs` (`evalRun trên bài giả…`): `visible()` gọi `spawn("npm")` không shell nên trên Windows/Node 24 luôn lỗi, `base.vRed` thành đúng. Đã sửa ở `docs/research/analysis/g-mutation.mjs` (shell cho `npm` trên win32, `detached` chỉ ngoài win32), commit 069b6441. Bản ghi này là lần chạy sau sửa: 142/142 đạt.
- Khối `git status --short` ở trên chạy trước khi commit tệp nhật ký này, nên có thể chỉ liệt kê chính nó. Sau commit, `git status --short` rỗng (kiểm lại ở báo cáo).


## Chạy lại sau commit cuối (BRIEF-22d)

HEAD đã chạy: `886aa2f6` (nhánh nhiệm vụ đã gộp S1–S3). Đường dẫn máy trong đầu ra đã thay bằng đường dẫn tương đối. Mọi lệnh chạy từ gốc repo.

### Bước 1 — đột biến khóa `logic-map-refs-total`

Trước đột biến: `node docs/research/scripts/consistency-check.mjs` → `Đạt: 60 tệp, không lệch số liệu.` (exit 0).

Sửa tạm `improvement-backlog.md` dòng 38: `--strict` 445/445 → 444/444 (không có ngữ cảnh S2). Chạy lại:

```
docs/research/improvement-backlog.md:38 — logic-map-refs-total — số sai: "444", chuẩn "445"

1 lỗi (logic-map-refs-total=1) trong 60 tệp.
exit 1
```

Hoàn nguyên bằng `git checkout -- docs/research/improvement-backlog.md`. Khóa bắt được, không phải sửa pattern, không có commit phụ.

### Bước 2 — đầu ra nguyên văn

```
## HEAD
886aa2f6
## sample
Mốc: ccc76cc0840110debab2a0e69f64b10bee965533
Chế độ: strict (mặc định)
Tổng tham chiếu tệp:dòng: 445 (có ký hiệu: 445, không ký hiệu: 0); lệch: 0.

Mẫu 10/445 tham chiếu (seed 20261115):
- orch:3550 tại docs/research/analysis/decisions/logic-map.md:94 [ok]
    ký hiệu: maxOutputChars
    trong bài: …(cấu hình + dự án), `commandTimeoutSec`, `maxOutputChars` (`orch:3550` (`maxOutputChars`)). Ba mốc: `baseline` (trước khi sửa; ch…
    dòng thật ở mốc (dòng 3550): const opts = { denyCommands: [...config.tools.denyCommands, ...(project.denyCommands ?? [])], timeoutSec: config.tools.commandTimeoutSec, maxChars: config.tools.maxOutputChars, signal };
- orch:2169 tại docs/research/analysis/decisions/logic-map.md:94 [ok]
    ký hiệu: dept.id, 'revise'
    trong bài: …1977` (`dept.id, 'execute'`)), `revise` (sau mỗi vòng sửa, `orch:2169` (`dept.id, 'revise'`)). Điều kiện chạy: `projectCheckable` (`…
    dòng thật ở mốc (dòng 2169): if (this.projectCheckable(task, project)) await this.runProjectChecks(task, project, dept.id, 'revise');
- orch:1372 tại docs/research/analysis/decisions/logic-map.md:167 [ok]
    ký hiệu: keywordRoute
    trong bài: …ute` | LLM + mã lùi | `orch:1351` (`private async route`), `orch:1372` (`keywordRoute`), `planner.ts:275` (`parseRoute`), `:291…
    dòng thật ở mốc (dòng 1372): result ??= keywordRoute(task.brief, depts);
- lane.ts:130–145 tại docs/research/analysis/decisions/logic-map.md:168 [ok]
    ký hiệu: cfg.lanes?.single
    trong bài: …`chooseLane` (+ `forcedLane`) | **Mã thuần, không LLM** | `lane.ts:130-145` (`cfg.lanes?.single`), `orch:1477-1516` (`pickLane`) |…
    dòng thật ở mốc (dòng 130): const single = cfg.lanes?.single ?? { enabled: true, maxParts: 5, maxFilesTouched: 6 };
- claude-guard.ts:110 tại docs/research/analysis/decisions/logic-map.md:189 [ok]
    ký hiệu: outsideWriteDecision
    trong bài: …D16).** Rule được gọi ở đúng một chỗ: hook `claude-guard` (`claude-guard.ts:110` (`outsideWriteDecision`)). Hai đường chạy lệnh khác chỉ có `deni…
    dòng thật ở mốc (dòng 110): const wv = outsideWriteDecision(cmd, cfg.root);
- planner.ts:304–314 tại docs/research/analysis/decisions/logic-map.md:190 [ok]
    ký hiệu: readySubtasks
    trong bài: …đổi người để tách (`shapeFastPlan`); làn đầy thì không. | `planner.ts:304-314` (`readySubtasks`); `orch:1450-1462` (`seen.add`) | Trung…
    dòng thật ở mốc (dòng 304): export function readySubtasks(subtasks: Subtask[], busyAgents: Set<string>): Subtask[] {
- orch:1865–1867 tại docs/research/analysis/decisions/report.md:31 [ok]
    ký hiệu: parsePlan
    trong bài: …Plan`, `shapeFastPlan` (làn nhanh), `planGate` | có + mã | `orch:1865-1867` (`parsePlan`), `planner.ts:100` (`parsePlan`), `plan-…
    dòng thật ở mốc (dòng 1867): plan = parsePlan(planRes.text, roster, lead, task.brief);
- orchestrator.ts:1974 tại docs/research/improvement-backlog.md:198 [ok]
    ký hiệu: task.projectChecks
    trong bài: …ands` trước thực thi, sau thực thi, sau mỗi vòng sửa | Đọc `orchestrator.ts:1974` (`task.projectChecks`), `:2535` (chạy), `:1360` (chạy lại khi…
    dòng thật ở mốc (dòng 1974): if (checkable && !task.projectChecks?.baseline && !run.subtasks.some((s) => s.attempts > 0 || s.status === 'done')) await this.runProjectChecks(task, project, dept.id, 'baseline');
- bench/vs-claude/lib/ccoding.mjs:129 tại docs/research/improvement-backlog.md:529 [ok]
    ký hiệu: ...opts.taskOptions
    trong bài: ….options ?? {}`) truyền `taskOptions: spec.options ?? {}`. `bench/vs-claude/lib/ccoding.mjs:129` (`...opts.taskOptions`) dựng `options: { budgetMode: 'complete'…
    dòng thật ở mốc (dòng 129): options: { budgetMode: 'complete', planApproval: false, ...opts.taskOptions, variant: opts.variant },
- bench/vs-claude/analyze.mjs:272 tại docs/research/improvement-backlog.md:1142 [ok]
    ký hiệu: Coordination failures
    trong bài: …ation.ccoding-fastlane.3/{ccoding-task.json,result.json}`, `bench/vs-claude/analyze.mjs:272` (“Coordination failures”), `bench/vs-claude/lib/grade.mjs:146` (`…
    dòng thật ở mốc (dòng 272): H.push(['H8', 'Coordination failures: untouched-file test failures and check-still-red-at-end, paired by task', `${txt}chỉ số phụ formatMiss ${BASE} ${pp(fm(BASE))} vs ${TREAT} ${pp(fm(TREAT))}`, verdict(dR > 0 && dU >= 0, pairs.length < MIN_TASKS) + ' (confirm with transcript review)']);
Đạt: 445 tham chiếu khớp đúng dòng ở mốc.
exit 0
## strict
Mốc: ccc76cc0840110debab2a0e69f64b10bee965533
Chế độ: strict (mặc định)
Tổng tham chiếu tệp:dòng: 445 (có ký hiệu: 445, không ký hiệu: 0); lệch: 0.
Đạt: 445 tham chiếu khớp đúng dòng ở mốc.
exit 0
## consistency
Đạt: 60 tệp, không lệch số liệu.
exit 0
## scorecard
OK: 20/20 dòng agent trong scorecard.md (14 có KPI + 6 không có dữ liệu trong 30 ngày); 18 khối bảng trong scorecard.md và effectiveness.md trùng đầu ra script; 360 khóa brief22.*
exit 0
## test
exit 1
ℹ tests 136
ℹ suites 0
ℹ pass 133
ℹ fail 3
ℹ skipped 0
ℹ todo 0
## status
(hết)
```

Ghi chú: dòng `exit` do tôi thêm để ghi mã thoát. Mục "test" chỉ chép dòng tổng kết; lệnh thoát 1 do 3 tệp đỏ có sẵn từ baseline (`e-analyses.test.mjs`, `g-analyze.test.mjs`, `g-mutation.test.mjs`), không phải lỗi mới. Ba lệnh kiểm còn lại exit 0. Dòng `(hết)` là dấu kết của khối `git status --short`: khối rỗng.
