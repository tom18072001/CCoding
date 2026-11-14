# BRIEF-22c — nhật ký lệnh kiểm (nguyên văn)

Phân loại dữ liệu: Nội bộ. Seed mẫu: 20261115. HEAD khi chạy: 5bcf5807. Đã chạy `npm ci --ignore-scripts` trước (worktree thiếu `typescript`, khiến 3 tệp test analysis đỏ ở lần chạy đầu).

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
✔ κ = 0: khớp đúng bằng mức ngẫu nhiên (3.6617ms)
✔ κ = 1: khớp hoàn toàn (0.4078ms)
✔ nghịch lý prevalence: khớp thô 0,90, κ âm nhỏ, PABAK 0,8, có cảnh báo (0.9627ms)
✔ prevalence thấp (< 0,1) cũng cảnh báo; ở 0,5 thì không (0.661ms)
✔ κ không xác định khi chỉ một nhãn (pe = 1); không lỗi, PABAK vẫn tính được (0.3603ms)
✔ 3 lớp: ma trận nhầm lẫn, macro-F1, κ, PABAK (0.8105ms)
✔ bootstrap lấy lại THEO LƯỢT: tổng cỡ mẫu chỉ có thể là tổng cỡ của các lượt (7.3177ms)
✔ bootstrap: mọi mục của một lượt đi cùng nhau (không tách được) (2.623ms)
✔ bootstrap: seed cố định cho kết quả giống hệt; đổi seed thì khác (86.1202ms)
✔ bootstrap: bản lấy mẫu mà κ không xác định bị bỏ và đếm (8.8883ms)
✔ report: CI gồm đủ chỉ số và chứa ước lượng điểm của Accuracy (37.0751ms)
✔ CSV: vòng khứ hồi với dấu phẩy, ngoặc kép, xuống dòng; bỏ BOM và dòng chú thích (0.7549ms)
✔ đa lớp: cảnh báo nghịch lý chỉ khi lớp lớn nhất > 0,9; lớp nhỏ < 0,1 thì không (preregistration §5.1) (0.642ms)
✔ PABAK đa lớp dùng k cố định (kFixed) khi lấy lại mẫu có ít lớp hơn mẫu gốc (0.4438ms)
✔ Clopper–Pearson: giá trị tính tay/đã biết (1.8722ms)
✔ minPositives: nửa độ rộng CP ≤ 0,15 tại kết quả; recall gần 0,5 cần nhiều dương hơn gần 1 (119.6706ms)
✔ 1. hai nhánh y hệt nhau → không phân biệt được (148.8742ms)
✔ 2. nhánh bật nhân 0,8 → giảm, R̂ ≈ 0,8 (±0,03), cận trên CI < 1 (127.3785ms)
✔ 3. nhánh bật thiếu r13–16 → chỉ dùng cặp đủ, n = 72, nhãn chưa đủ N (77.3494ms)
✔ 4. status ≠ done và excluded bị loại, không vào T, đếm theo lý do (155.4223ms)
✔ 5. permStratified gọi đúng một lần với đúng { alt, margin, M, seed }, không thêm khóa (84.3066ms)
✔ 6. lượt thay rep 17 nhận cặp của lượt bị loại; lượt thay thứ 3 làm ô thiếu dữ liệu (185.9472ms)
✔ 7. dòng thiếu weighted được tính theo input + 1,25·cacheWrite + 0,1·cacheRead + 5·out (160.2076ms)
✔ 8. deps mặc định là chính permStratified của bench/vs-claude/lib/stats.mjs, không từ vendor/ (184.2327ms)
✔ 9. CLI khi thiếu tệp: exit ≠ 0, thông báo tiếng Việt (152.9301ms)
✔ CLI với dữ liệu giả ghi vào thư mục tạm: in bảng và --json có permArgs (671.2295ms)
✔ 10. collapseRetries: dòng infra trước lượt done không chặn quan sát; failed rồi done = lượt thay cùng khóa (218.6881ms)
✔ 11. lượt thay cùng khóa tính vào trần 2 mỗi ô; quá trần → ô thiếu dữ liệu (132.1917ms)
✔ 12. opts.exclude bỏ đúng một lượt (độ nhạy), không đổi tham số phép kiểm (84.5049ms)
✔ đủ 12 ca F1–F12, mỗi ca có kết quả so với S2 (3.0523ms)
✔ các ca lệch đăng ký đã biết: F1 (T-1), F7 (B-1), F11 (S-1), F12 (T-2); ca khác khớp (0.3061ms)
✔ e5f: R̂ đúng khi B1F tốn bằng nửa B0F; quy tắc (8) loại cả cặp khi B0F không họp (108.639ms)
✔ h6-sensitivity: Δ_i theo bài, bỏ t2-orders và t4-perf ở (i) (57.5022ms)
✔ e4: q̂, recall chưa ước lượng được khi < 10 dương, b10 theo bài, lượt sạch, B-16 (9.4116ms)
✔ D-G2: g-analyze.mjs không import g-mutation.mjs (chạy được khi chưa cài typescript) và rng trùng dãy với bản gốc (24.4037ms)
✔ D-G1: deltaStat nhóm theo lần rút `_c` nên bài rút hai lần giữ bội số 2 (0.7953ms)
✔ D-G1: bootstrap2 mỗi lần rút bài là một cụm; cụm chỉ chứa lượt của một bài; số cụm = số bài (12.1688ms)
✔ cp vẫn khớp giá trị đã biết (0/239 cận trên ≈ 1,5 %) (0.477ms)
✔ mutationSites: đủ các toán tử và áp đúng vị trí (15.8131ms)
✔ rng và sample: cùng hạt giống cho cùng mẫu, khác hạt giống thì khác (1.6578ms)
✔ productFiles: chỉ tệp nguồn thuộc deliverable, bỏ tệp test (12.6456ms)
✖ evalRun trên bài giả: base đúng, đột biến được phân loại thật/không thật và chặn/không chặn (926.191ms)
✔ cp: Clopper–Pearson khớp giá trị đã biết (1.6275ms)
✔ analyze: hai nhóm như nhau → Δ = 0, p lớn; nhóm C bắt nhiều hơn 30 điểm → Δ ≈ 0,3, p nhỏ (134.4765ms)
✔ analyze: G-1/G-2 đếm đúng; lượt không có package.json không tính (0.9574ms)
✔ deltaStat/permDelta: bài thiếu một nhóm bị bỏ (0.8551ms)
✔ overlayStarter (G-b): chép tệp starter còn thiếu, không ghi đè tệp đã có (14.4917ms)
✔ đọc nhãn từ kinds (2.0301ms)
✔ (1) b02 chặn rồi sửa xong: decision → rounds cặp pred=1; run → 1 cặp (1.6682ms)
✔ b02 không chặn → 1 cặp pred=0; rounds thiếu mà blocked → 1 cặp (0.3318ms)
✔ (2) b10 null ở làn đơn: không có dòng b10, stderr đếm đúng (0.8916ms)
✔ (3) CTO không đạt trên g5/g6 → ref=1, pred=1; đạt → pred=0 (0.35ms)
✔ (4) lượt sạch → ref=0 cho mọi cổng; cổng khác kind cũng ref=0 (0.5123ms)
✔ (5) CSV đọc đúng bằng parseCsv và report; main --out + --positive 1 (40.281ms)
✔ (6) --gate lọc đúng; thiếu --unit → mã 2 (10.7603ms)
✔ (7) bài g1 với --gate cto: mặc định bỏ khỏi mẫu (không thành chặn nhầm); negatives=cross giữ ref=0 (0.4889ms)
✔ (8) stderr tách cổng null, bài loại khác và dòng infra/error theo status; --negatives sai → mã 2 (9.1522ms)
✔ (9) --label gate: b02 ref theo checksRed > 0 / = 0, bất kể nhãn theo bài (0.4584ms)
✔ (10) thiếu một phần checksRed: lùi về nhãn theo bài; stderr và dòng tổng hợp có số dòng lùi (8.7236ms)
✔ (11) thiếu toàn bộ checksRed: vẫn exit 0, dòng tổng hợp ghi "task (lùi)", nhãn = nhãn theo bài (4.6922ms)
✔ (12) --label task cho đầu ra CSV giống --negatives/hành vi cũ, bỏ qua checksRed (57.3268ms)
✔ (13) --label sai → mã 2; b10 giữ nhãn theo bài, cto thiếu pass lùi về nhãn theo bài ở --label gate (6.8526ms)
✔ (14) cto + --label gate: ref theo pass của dòng (false → 1, true → 0), bài sạch ref = 0, thiếu pass lùi (13.3361ms)
✔ (15) cto: mọi dòng g5/g6 thiếu pass → nhãn hiệu lực task (lùi) (9.3389ms)
✔ unionMs / maxConcurrent (1.6958ms)
✔ criticalPathMs theo phụ thuộc (2.1821ms)
✔ runRows + summarize: lượt song song và lượt lần lượt (2.596ms)
✔ independentPairs tính phụ thuộc bắc cầu: chuỗi S1→S2→S3 không có cặp độc lập (0.5796ms)
✔ D-P1: lệnh đỏ lúc kết thúc đếm theo nhiệm vụ, không theo lượt phòng; CP và theo phòng có trong báo cáo (6.2927ms)
✔ tỉ số 1,00 phương sai nhỏ → tương đương (xác nhận) (85.7282ms)
✔ tỉ số 1,30 → không tương đương (bác bỏ), cận dưới > 1,15 (93.9053ms)
✔ tỉ số 0,70 → bác bỏ ở phía dưới (46.3276ms)
✔ CI cắt biên → không kết luận (tỉ số 1,10 phương sai lớn) (49.113ms)
✔ trần: mọi lượt ≥ 0,99 ở cả hai arm → (c) không kết luận dù CI = [1, 1] (47.4676ms)
✔ trần một phần: chỉ còn 2 bài không trần (< 3) → không kết luận; còn 3 bài → tính được (44.4028ms)
✔ trần: một arm có lượt < 0,99 thì giữ bài (chạm trần một phía) (44.5301ms)
✔ IUT: một phép trượt thì B-01 trượt (0.2939ms)
✔ cùng hạt cho cùng kết quả; khác hạt cho CI khác (177.7436ms)
✔ TB = 0 (log không xác định) → không kết luận, không giả CI (21.9926ms)
✔ loại lượt: Q, L, T hạ tầng, E4; giữ T-giữ, N1 và lượt done (2.0611ms)
✔ H5: ghép theo bài, đếm bài đạt 3× token và 1,5× thời gian (47.2915ms)
✔ cửa sổ gán theo thời điểm ghi dòng (0.2628ms)
✔ phân vị chuẩn, χ², t khớp bảng (9.5191ms)
✔ σ_ln gộp: ví dụ tay, bỏ ô n < 2 (0.5668ms)
✔ CI của σ theo χ²: σ = 0,178, df 24 → cận trên ≈ 0,247 (§9 ghi 0,248) (0.5703ms)
✔ vòng 10 s: wallSec = 10k + ε (0.2762ms)
✔ Sheppard: phương sai nhỏ hơn h²/12 bị hiệu chỉnh về 0 (0.4111ms)
✔ mô phỏng làm tròn: σ thật 0 ⇒ σ quan sát 0; σ lớn ⇒ ≈ σ thật; đơn điệu (102.6ms)
✔ SE của Δ = σ/3 với 3 bài × 6 lượt mỗi ô; power σ = 0,25 giảm 30 % > 0,9; σ = 0,4 ≈ 0,76 (1.7487ms)
✔ MDE và σ tối đa là nghịch đảo của power (47.1716ms)
✔ power mô phỏng (hoán vị) gần giải tích và mức sai loại I gần 0,05 (529.6798ms)
✔ Fisher chính xác hai phía (0.6883ms)
✔ relabel chỉ đổi nhãn real của bài được chỉ định, giữ vRed (1.7463ms)
✔ bootstrap2Legacy tất định theo hạt giống và cho CI chứa ước lượng ở dữ liệu cân (19.5608ms)
✔ scenario: số đếm khớp tay trên dữ liệu nhỏ (8.8581ms)
✔ dữ liệu đã commit: σ_ln gộp của gates-pilot + b7prime = 0,178, df 24 (khớp §9) (6.4351ms)
✔ không có đường dẫn máy → exit 0 (221.5216ms)
✔ có đường dẫn máy (windows) → exit 1, in tệp:dòng (216.3605ms)
✔ có đường dẫn máy (windows /) → exit 1, in tệp:dòng (186.4092ms)
✔ có đường dẫn máy (mac) → exit 1, in tệp:dòng (229.2709ms)
✔ có đường dẫn máy (linux home) → exit 1, in tệp:dòng (145.7114ms)
✔ có đường dẫn máy (tmp) → exit 1, in tệp:dòng (196.9476ms)
✔ có đường dẫn máy (var/folders) → exit 1, in tệp:dòng (225.2295ms)
✔ có đường dẫn máy (AppData Temp) → exit 1, in tệp:dòng (163.497ms)
✔ preregistration.md được miễn quét đường dẫn máy (129.6702ms)
✔ ngoại lệ dạng line vẫn hoạt động (351.0559ms)
✔ ngoại lệ dạng anchor: khớp duy nhất → bỏ qua đúng dòng, không phụ thuộc số dòng (172.8898ms)
✔ anchor chỉ miễn đúng dòng chứa nó; dòng khác vẫn lỗi (130.5822ms)
✔ anchor không tìm thấy → lỗi (exit 2) (152.5747ms)
✔ anchor xuất hiện hơn một lần → lỗi (exit 2) (159.8388ms)
warning: in the working copy of 'src/alpha.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/alpha.ts', LF will be replaced by CRLF the next time Git touches it
✔ tham chiếu đúng ở mốc → exit 0 (1343.8718ms)
✔ bản sao lệch một dòng → exit 1 và in tham chiếu lệch (461.7113ms)
✔ thiếu mốc → exit 2 (174.5907ms)
✔ đọc mốc từ dòng "Mốc:" của logic-map.md (410.6677ms)
✔ agents/*.md: dòng đúng kèm cụm trích → exit 0; lệch một dòng → exit 1 (751.7012ms)
✔ agents/*.md: thiếu cụm trích → exit 1 (277.6887ms)
✔ .md ngoài agents/ không bị quét (294.5345ms)
✔ ký hiệu ngắn/chung: --no-strict cảnh báo (exit 0), strict mặc định ⇒ exit 1 (798.6702ms)
✔ danh sách quét mặc định gồm model-per-role.md và scorecard.md (710.8824ms)
✔ C2-r ca 1: tham chiếu sai phải đỏ, dạng đúng phải xanh (710.4067ms)
✔ C2-r ca 2: tham chiếu sai phải đỏ, dạng đúng phải xanh (676.8981ms)
✔ C2-r ca 3: tham chiếu sai phải đỏ, dạng đúng phải xanh (673.7748ms)
✔ C2-r ca 4: tham chiếu sai phải đỏ, dạng đúng phải xanh (821.2636ms)
✔ C2-r ca 5: tham chiếu sai phải đỏ, dạng đúng phải xanh (777.5489ms)
✔ C2-r ca 6: tham chiếu sai phải đỏ, dạng đúng phải xanh (757.6775ms)
✔ C2-r ca 7: tham chiếu sai phải đỏ, dạng đúng phải xanh (746.0557ms)
✔ C2-r ca 8: tham chiếu sai phải đỏ, dạng đúng phải xanh (737.6094ms)
✔ C2-r ca 9: tham chiếu sai phải đỏ, dạng đúng phải xanh (891.43ms)
✔ C2-r ca 10: tham chiếu sai phải đỏ, dạng đúng phải xanh (756.2736ms)
✔ C2-r ca 11: tham chiếu sai phải đỏ, dạng đúng phải xanh (720.6601ms)
✔ C2-r ca 12: tham chiếu sai phải đỏ, dạng đúng phải xanh (757.2698ms)
✔ C2-r ca 13: tham chiếu sai phải đỏ, dạng đúng phải xanh (767.3213ms)
✔ C2-r ca 14: tham chiếu sai phải đỏ, dạng đúng phải xanh (745.1489ms)
✔ C2-r: đủ 14 ca (0.1694ms)
✔ khớp đúng dòng: ký hiệu ở giữa dải không đủ; ở đầu hoặc cuối dải thì đạt (696.1688ms)
✔ lệch cố ý đúng một dòng ⇒ exit 1 (ở cả hai phía) (666.6339ms)
✔ ký hiệu ngắn/chung bị từ chối dù có trên đúng dòng; --no-strict chỉ cảnh báo (741.0501ms)
✔ khớp theo ranh giới từ: ký hiệu chỉ là chuỗi con của từ trên dòng đích ⇒ lệch (342.4326ms)
✔ phủ bench/**: dòng đúng xanh, dòng kế bên đỏ (439.5726ms)
✔ --sample/--seed: cùng seed cho cùng mẫu; khác seed khác mẫu; in đủ các trường (1091.3618ms)
✔ --sample không đổi mã thoát; tham số sai ⇒ exit 2 (533.3826ms)
✔ phạm vi mặc định: backlog từ khối B-20, paper.md chỉ §4.4 (507.4296ms)
ℹ tests 142
ℹ suites 0
ℹ pass 141
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 21339.2443

✖ failing tests:

test at docs\research\analysis\g-mutation.test.mjs:37:1
✖ evalRun trên bài giả: base đúng, đột biến được phân loại thật/không thật và chặn/không chặn (926.191ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  true !== false
  
      at TestContext.<anonymous> (<repo>/docs/research/analysis/g-mutation.test.mjs:49:10)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1125:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:787:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }
```

exit code: 1

## `git status --short`

```
?? docs/research/context/brief22c-checks-2026-11-14.md
```

exit code: 0

## Ghi chú

- Lệnh test glob exit 1 chỉ vì 1 ca: `g-mutation.test.mjs` (`evalRun trên bài giả…`, assert tại dòng 49: `base.vRed` thật, kỳ vọng sai). Ca này đỏ từ baseline (baseline có 3 tệp đỏ; 2 tệp kia do thiếu `typescript`, hết sau `npm ci`). Ngoài phạm vi K3 và không điều tra thêm; chưa rõ là lỗi mã hay môi trường (Node 24 Windows). Đường dẫn máy trong đầu ra đã thay bằng `<repo>`.
- Khối `git status --short` ở trên chạy khi tệp nhật ký này chưa được commit nên chỉ liệt kê chính nó. Sau commit, `git status --short` rỗng (đã kiểm lại).
