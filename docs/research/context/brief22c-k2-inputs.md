# Đầu vào cho K2 (BRIEF-22c): M-r1, M-r2 và số còn treo

Phân loại dữ liệu: **Nội bộ**. Tạo ở S2 (K1b) cho academic-writer (S3, chỉ đọc). Mốc mã: `ccc76cc0840110debab2a0e69f64b10bee965533`. Mọi dòng mã dưới đây đã đọc bằng `git show ccc76cc0:<tệp>`. Không có đường dẫn máy.

Quy ước gói (từ tiêu đề commit và tên nhiệm vụ; "tổ tiên của mốc" kiểm bằng `git merge-base --is-ancestor <hash> ccc76cc0`):

| Gói | Mã nhiệm vụ CCoding | Merge | Có trong mốc `ccc76cc0`? |
|---|---|---|---|
| D16b | `T-20261114-160848-5d4` | `107b8a40` | có |
| D17 | `T-20261114-155130-b13` | `2a4e19e3` | có |
| D18a | `T-20261114-205113-c45` | `398d8cfb` (ghi chú `0c891d37`) | có |
| D18b | `T-20261114-205129-d6a` | `ab179068` | có |
| D18c | `T-20261114-214523-e25` | `92095b75` | **không** (có ở HEAD của nhánh, sau mốc) |

Lưu ý quan trọng: mô tả L1–L13 trong `logic-map.md` §4 và trạng thái B-20…B-40 trong backlog viết theo hiện trạng tại `b146b87c`/lúc tạo gói. Mã ở mốc đã đổi; mọi lỗi "đã sửa" dưới đây là đã sửa **trước hoặc tại mốc** (trừ D18c).

## 1. M-r1 — lỗi trong `logic-map.md` §4 (L1–L13): dòng mã thật ở mốc và gói đã sửa

Cột "Dòng thật ở mốc" là nội dung nguyên văn (cắt ngắn) của dòng đó ở `ccc76cc0`. Cột "Đã sửa ở" chỉ ghi khi tra được commit; "—" nghĩa là không có commit sửa trong `b146b87c..ccc76cc0`.

| Mã | Dòng thật ở mốc | Đã sửa ở (gói, commit) | Ghi chú đối chiếu |
|---|---|---|---|
| L1 | `src/plan-gate.ts:250`: `export function checkBriefItems(input: Pick<PlanGateInput, 'brief' \| 'subtasks' \| 'agentRoles'>): string[] {`; `plan-gate.ts:46`: `const SOURCE_EXT = 'js\|mjs\|…'`; `plan-gate.ts:130`: `export function checkPlanCoverage(…`; `agents/research/research-lead.md:58`: `6. Không tạo hạng mục "review" chung cho `@peer-reviewer` — pha review có sẵn sau thực thi. **Ngoại lệ:** nếu đề bài gia…`; `src/orchestrator.ts:1951`: `if (!solo && !reached(run, 'executed') && !run.planReview?.approvedAt && …) await this.gatePlan(…` | D17 `39bd9fe3` (rule `brief-item`); D18a `39cf2f7c` (cắt đúng thân hạng mục, đọc nhiều vai); D18b `677fe521` (ngoại lệ reviewer trong hồ sơ `research-lead`) | Mô tả "Quy tắc A chỉ đếm tệp nguồn" vẫn đúng với `SOURCE_EXT`; mô tả "không có quy tắc vai nêu trong đề phải có hạng mục" đã lỗi thời ở mốc (có `checkBriefItems`). Phần D18c (`attention plan-brief-items`, followupScope) **chưa** có ở mốc. |
| L2 | `orchestrator.ts:2008`: `if (!canReview \|\| !reviewer) {`; `:2044`: `if (!gate.needReviewer) {`; `:1671`: `logs.write({ level: 'info', kind: 'gate.review', …` | D17 `179da24b` (đề bài đòi review thì không bỏ); D18a `8989e920` (review bị bỏ có dấu vết) | Mô tả (b) "không để lại dấu vết" đã lỗi thời ở mốc. |
| L3 | `orchestrator.ts:1109`: `await this.accept(task, project);`; `:1113`: `task.status = 'done';`; `:897`: `private waitingOn(t: Task): undefined \| 'wait' \| 'blocked' \| 'unaccepted' {` | D18a `8989e920` (nhiệm vụ `after` chờ khi nhiệm vụ trước chưa nghiệm thu) — **một phần** | `status='done'` vẫn đặt sau `accept()`; phần "after chạy tiếp" đã đổi (`'unaccepted'` ở `:897`). |
| L4 | `orchestrator.ts:1737`: `if (review.parsed \|\| !res.capped) return { res, review };`; `:125`: `const CONTINUE_PHASES = new Set<Phase>(['execute', 'revise', 'synthesize']);` | D16b `2579e012` (lấy kết luận khi review chạm trần); D18a `8989e920` (review chạm trần với `maxRevisions>0`) | `CONTINUE_PHASES` vẫn không có `review`, nhưng đường lấy kết luận riêng (`:1737`) đã có. Mô tả "không đọc `res.capped`" lỗi thời. |
| L5 | `src/tools/workspace.ts:614`: `const wv = outsideWriteDecision(command, fs.realpathSync(root));` (trong `run_command`); `workspace.ts:702`: `const why = deniedReason(command, o.denyCommands, false);` (trong `runCheckCommand`, không gọi `outsideWriteDecision`); `src/runtimes/cli-agents.ts` không có chuỗi `deniedReason`/`outsideWrite`/`shell-policy` | D16b `78ad5179` (`run_command`). D18a `ae953e07` ghi "quyết định cho `runCheckCommand`, đường cli-agents" — **tại mốc mã `runCheckCommand` và `cli-agents.ts` chưa gọi `outsideWriteDecision`** (suy từ đọc dòng, chưa đọc diff của `ae953e07`) | **Một phần.** Đừng ghi "đã sửa hết". |
| L6 | `src/planner.ts:304`: `export function readySubtasks(subtasks: Subtask[], busyAgents: Set<string>): Subtask[] {` | — | Chưa đổi. |
| L7 | `src/lane.ts:140`: `return { lane: 'single', rule: 3, why: \`${big} nhưng hạng mục chạy lệnh sẽ làm lần lượt …`; `orchestrator.ts:2941`: `if (st.mainOnly) await this.runInMainWorktree(…` | — | Chưa đổi. |
| L8 | `src/prompts.ts:314`: `Phân rã yêu cầu thành 1–${MAX_SUBTASKS} hạng mục rõ ràng, …`; `prompts.ts:449`: `- Số hạng mục tối đa là ${MAX_SUBTASKS} cho mọi làn; …`; `agents/dev/dev-lead.md:61`: `7. Hạng mục chạy lệnh trong repo dự án được làm lần lượt (dùng chung worktree) → ưu tiên ít hạng mục code lớn …` | D18b `677fe521` (số hạng mục lấy từ hằng) | Lệch "1–7" đã đóng; mâu thuẫn song song/ít hạng mục lớn còn. |
| L9 | `src/planner.ts:120`: `const who = matchAssignee(rawWho, roster, \`${title} ${description}\`) ?? lead;` | D18a `39cf2f7c` (người nhận ngoài roster được ghi lại) — **một phần** | `?? lead` còn ở mốc. |
| L10 | `src/lane.ts:56`: `let declared = 0;` (`countParts`, `:56-75`) | — | Chưa đổi. |
| L11 | `src/orchestrator.ts:2590`: `return { total: fixed + work, work, criticalPathEstimate: cp, parallelism: …` | D18a `53fb9bd3` (đường găng, FX13) | Mô tả "không có thời gian đường găng" lỗi thời. |
| L12 | `orchestrator.ts:2230`: `private finalTemplateGate(task: Task, run: DeptRun, dept: …, lead: AgentDef, text: string): …` | D18a `8989e920` (FX16) | Mô tả "FINAL không qua cổng mẫu" lỗi thời. |
| L13 | `src/logger.ts:19`: `const KEY_ENV = 'CCODING_LOG_HMAC_KEY';` | D18b `e2b72b23` (HMAC, FX21) — **một phần** | Ký có, WORM là hạ tầng, chưa thuộc mã. |

Bảng "Trạng thái L1–L13 tại `ccc76cc0`" đã có sẵn ở `logic-map.md` §4 dùng đúng các commit trên (đã kiểm khớp). Việc còn lại của K2: sửa **cột "Lỗ hổng/lệch"** của bảng L1–L13 phía trên cho khớp mã ở mốc (hoặc đánh dấu "mô tả tại `b146b87c`; đã sửa ở <gói>, commit <hash>").

## 2. M-r1 — trạng thái trong `improvement-backlog.md` (khối B-20 trở đi)

Cột "Trạng thái hiện có" là nguyên văn dòng `| **Trạng thái** |`/tiêu đề trong backlog (số dòng ở HEAD của nhánh này). FX lấy từ tiêu đề commit/mục backlog; ô có dấu † là suy từ **tiêu đề commit**, chưa đọc diff.

| Mục | Dòng backlog | Trạng thái hiện có | Đã sửa ở (gói, commit) theo `git log b146b87c..ccc76cc0` |
|---|---|---|---|
| B-20 (FX1, L1) | 804, 812 | "đang sửa (D17 K1, D16b K4)"; "`4b0437c8` chỉ thêm đề bài D17, chưa có commit mã" | D17 `39bd9fe3`; D18a `39cf2f7c`; D16b K4 `7f52136b` (test `brief-item`, †) |
| B-21 (FX2, L1) | 814, 822 | "chưa giao; D17 chỉ sửa mã" | D18b `677fe521` |
| B-22 (FX3, L2a) | 824, 832 | "đang sửa (D17 K2)"; "Chưa có commit mã" | D17 `179da24b` |
| B-23 (FX4, L2b) | 834, 842 | "chưa giao" | D18a `8989e920` (tiêu đề commit nêu FX4) |
| B-24 (FX5, L3) | 844, 852 | "đang sửa một phần (D17 K3)"; "(a) đang sửa (D17); (b) chưa giao" | D18a `8989e920` (tiêu đề commit nêu FX5); D17 K3 `5914f97e`, `6ee72e43` (vòng bổ sung, †). Phần (b): chưa tra |
| B-25 (FX6, L4) | 854, 862 | "đang sửa (D16b K2)"; "Chưa có commit mã" | D16b `2579e012`; D18a `8989e920` (`maxRevisions>0`) |
| B-26 (FX7, L5) | 864, 872 | "đang sửa một phần (D16b K1, K3)"; "`run_command` đang sửa (D16b); `runCheckCommand` và `cli-agents` chưa giao" | D16b `78ad5179` (`run_command`). `ae953e07` (D18a) có đề cập `runCheckCommand`/cli-agents nhưng ở mốc mã chưa gọi `outsideWriteDecision` (xem L5) |
| B-27 (FX8) | 874, 882 | "chưa giao; chẩn đoán trước" | D18b `b6c08171` († tiêu đề: chẩn đoán và sửa cờ 'đầu ra bị cắt'); `ab179068` nêu "tách truncated/turnCapped" |
| B-28 (FX9) | 884, 892 | "chưa giao" | D18b `93b9b252` († hồ sơ FX9) |
| B-29 (FX10) | 894, 902 | "chưa giao" | D18b `93b9b252` († hồ sơ FX10) |
| B-30 (FX11) | 904, 912 | "chưa giao" | D18b `b6c08171` (miễn `no-sources` trong `kpi.ts`), `93b9b252` |
| B-31 (FX12) | 914, 922 | "chưa giao" | D18b `677fe521` († cỡ gói của research-lead), `93b9b252` (test kiểm ước lượng ở bước plan) |
| B-32 (FX13, L11) | 924, 932 | "chưa giao" | D18a `53fb9bd3` |
| B-33 (FX14, L8) | 934, 942 | "chưa giao; lỗi vặt" | D18b `677fe521` (số hạng mục lấy từ hằng) |
| B-34 (FX15, L9) | 944, 952 | "chưa giao" | D18a `39cf2f7c` |
| B-35 (FX16, L12) | 954, 962 | "chưa giao; lỗi vặt" | D18a `8989e920` |
| B-36 (FX17) | 964, 972 | "chưa giao" | D18a `53fb9bd3` |
| B-37 (FX18) | 974, 982 | "chưa giao; lỗi vặt" | D18b `677fe521` († "model theo làn") |
| B-38 (FX19) | 984, 992 | "chưa giao (Phòng Nghiên cứu)" | Gói này: `48a9cdce` (S1, làm cứng `logic-map-check.mjs`), S2 sửa tham chiếu |
| B-39 (FX20) | 994, 1002 | "chưa giao (Phòng Nghiên cứu)" | Chưa có commit |
| B-40 (FX21, L13) | 1004, 1012 | "chưa giao; một phần cần giám đốc" | D18b `e2b72b23` (HMAC); WORM còn là hạ tầng |

Những phần của D18c (`92095b75`, không có ở mốc): kế hoạch vòng bổ sung kiểm theo tiêu chí, lời nhắc nêu mã hạng mục và vai, `attention plan-brief-items`, `chainChecker` bắt buộc ký, `turnCapped`/`stopReason` trong bản ghi lượt. Bằng chứng: `git merge-base --is-ancestor 92095b75 ccc76cc0` → không; `git diff --stat ccc76cc0 92095b75 -- src` có 9 tệp đổi (`plan-gate.ts`, `prompts.ts`, `runtimes/api.ts`, `runtimes/claude-cli.ts`, `types.ts`, …). Ghi "đã sửa ở D18c, commit `236b19d6`/`92095b75`, sau mốc" cho những gì thuộc phần này; không ghi là đúng ở mốc.

### 2a. Hai chỗ mô tả B-10 đã lỗi thời so với mã ở mốc (S2 đã sửa số dòng, chưa viết lại nội dung)

- `improvement-backlog.md` dòng 487 (B-10 trường 6) nói phán quyết H8 chỉ dựa vào `formatMiss` và `gradeCode` không trả `formatMiss`. Ở mốc: `bench/vs-claude/lib/grade.mjs:146` có `formatMiss: missing.length > 0` khi truyền `task`; `bench/vs-claude/analyze.mjs:262` là `const fmOf = (x) => …formatMiss…` (chỉ số phụ) và H8 ở `analyze.mjs:272` dùng `dR` (SR-13: `untouchedFileFailures`, `redAtEnd`). S2 đã thêm chú thích "[tại thời điểm viết … xem M-r1]". K2 nên viết lại câu cho khớp.
- Cụm "failed hidden-test share" `analyze.mjs:98` không còn ở mốc (grep không thấy); S2 đã bỏ số dòng đó.

## 3. M-r2 — khóa `facts.json` và nguồn

`docs/research/facts.json` (số dòng ở HEAD của nhánh):

| Khóa | Dòng | `value` | `pattern` (tệp bài) | Giá trị ở nguồn |
|---|---|---|---|---|
| `brief22-p1-a-ratio` | 480 | `42/54` | `^\| P-1 [^\|]*\| (42/54) = 77,8 %` | `docs/research/paper/paper.md:675`: "P-1 … \| 42/54 = 77,8 % [64,4; 88,0], mẫu số 54 là lượt có ≥ 2 hạng mục đủ mốc giờ (cùng tử số 42, trên mọi 56 lượt phòng là 42/56 = 75,0 % …". Nguồn gốc: `bench/vs-claude/results/p-parallel/RUNLOG.md:26`: "P-1: lượt có ≥ 2 hạng mục chạy cùng lúc \| **42/54 = 77,8 %** (Clopper–Pearson 95 % [64,4; 88,0])". Số B: `docs/research/analysis/decisions/effectiveness.md:23`: "42/56 = 75,0 % [61,6; 85,6]". |
| `brief22-p1-a-pct` | 490 | `77,8` | `^\| P-1 [^\|]*\| 42/54 = (77,8) %` | Cùng `paper.md:675` và `RUNLOG.md:26` (42/54 = 0,7778 → 77,8 %). |
| `brief22-p2-a-pct` | 500 | `27,5` | `^\| P-2 [^\|]*\| Tối đa 375 phút = (27,5) %` | `paper.md:676`: "Tối đa 375 phút = 27,5 % (**cận trên**; tính gộp phút: (1366 − 990)/1366; khác 29,2 % ở §6.5 là nghịch đảo của work/cp trung vị 1,41 trên 56 lượt)". Nguồn gốc: `RUNLOG.md:28`: "1366 phút làm việc trong 990 phút thực: **375 phút, 27,5 %**". Phép tính lại: (1366 − 990) = 376, 376/1366 = 27,53 %; 375 so với 376 do làm tròn phút từng lượt (`docs/research/analysis/v43f-rerun.md:59`). Tỉ lệ 27,5 % khớp. |

Đã tra: ba khóa khớp giá trị ở `paper.md` và `RUNLOG.md`. Chênh 375/376 phút đã có lời giải thích ở `v43f-rerun.md:59`.

## 4. Số treo: "5/5 lượt Opus ở khâu plan"

### 4a. Câu hiện có

- `docs/research/paper/paper.md:768` (§6.5, đoạn "Model theo vai và E9 (K4)"): "… Ở văn phòng phụ thì khác: khâu `plan` chạy Opus ở 5/5 lượt phòng."
- `docs/research/analysis/decisions/model-per-role.md:27` (mục 1): "… ở văn phòng phụ thì khác, khâu `plan` chạy Opus ở 5/5 lượt phòng (`paper.md` §6.5). E9 dùng chính chỗ này làm biến: chỉ đổi `phaseModels.plan`."
- Số này sinh từ `docs/research/analysis/decisions/scorecard.md:78`: "Model của lượt `plan` \| claude-opus-5-5 ×5", từ `scorecard.mjs:171`, từ `decomp-agg.json` → `office.planModels`.

### 4b. Nguồn theo yêu cầu: `kpi-office.json` và `calls-limits.json` (nguyên văn)

`bench/vs-claude/results/decisions/calls-limits.json` (`byPhase.plan`, **không tách theo model**; ghi chú đầu tệp: "146 lượt gọi claude-cli của 10 nhiệm vụ tới 14/11/2026 ~17:45 +07"):

```json
"plan": { "n": 15, "maxTokens": [8000], "ratio_q50": 0.814, "ratio_q90": 1.14, "ratio_max": 1.182, "over1": 4, "turns_q50": null, "turns_max": null, "withTools": 12, "errors": 1 }
```

`bench/vs-claude/results/decisions/kpi-office.json` (7 nhiệm vụ đếm; `tasksCounted: 7`). Chỉ hai agent có pha `plan`; `models` là số lượt theo model **của cả agent, không tách theo pha**:

- `dev-lead` (dòng 442–): `"models": {"claude-opus-5-5": 12, "claude-sonnet-5-5": 3, "<synthetic>": 1}`, `"calls": 16`, `"phases": {"plan": 8, "finalize": 4, "synthesize": 4}`.
- `research-lead` (dòng 988–): `"models": {"claude-opus-5-5": 10, "claude-sonnet-5-5": 3, "<synthetic>": 1}`, `"calls": 14`, `"phases": {"plan": 6, "finalize": 4, "synthesize": 3, "execute": 1}`.

Tổng lượt `plan` theo `kpi-office.json`: 8 + 6 = **14**; theo `calls-limits.json`: **15** (cửa sổ và tập nhiệm vụ khác nhau: 7 nhiệm vụ so với 10 nhiệm vụ).

### 4c. Kết luận kiểm tra (để K2 viết, không tự sửa số)

1. `kpi-office.json` và `calls-limits.json` **không** tách lượt theo (pha × model), nên hai tệp này không đủ để kiểm "5/5 lượt Opus ở khâu plan". Không kết luận được chỉ từ hai tệp (dev-lead có 12 lượt Opus trên 8 lượt plan, nhưng không biết 8 lượt plan ấy là lượt nào).
2. "5/5" không phải số lượt gọi: đó là **5 lượt phòng** (`decomp-agg.json` → `office.runs: 5`) và `office.planModels: {"claude-opus-5-5": 5}` (dòng 668–672). Nguồn tính: `docs/research/analysis/decisions/decomp-metrics.mjs:133`: `const planModels = [...new Set(calls.filter((c) => c.phase === 'plan').map((c) => c.model))];`, rồi `:182` cộng theo lượt phòng. Tức mỗi lượt đóng góp mỗi model **khác nhau** có ở các lượt `plan` của nó; tổng bằng 5 với đúng một khóa Opus nghĩa là cả 5 lượt chỉ có lượt `plan` dùng Opus (không lượt nào trộn Sonnet). Phép tính chỉ lấy nhiệm vụ `status === 'done'` (`decomp-metrics.mjs:127-128`) và đọc `calls.jsonl` của từng nhiệm vụ; đây là tập khác 7 nhiệm vụ của `kpi-office.json` và 10 của `calls-limits.json`. [CHƯA KIỂM CHỨNG] `runs: 5` có đúng bằng 5 nhiệm vụ hay 5 lượt phòng: chưa đọc `decomp-metrics.mjs:134-182` đến hết.
3. Đề xuất sửa câu cho đúng nguồn: "khâu `plan` chạy Opus ở 5/5 lượt phòng có `calls.jsonl` (`decomp-agg.json` → `office.planModels`; 5 lượt phòng, không phải 5 lượt gọi); `kpi-office.json` (14 lượt `plan`) và `calls-limits.json` (15 lượt `plan`) không tách theo model nên không xác nhận được". Nếu K2 muốn giữ "5/5" thì phải dẫn `decomp-agg.json`, không dẫn hai tệp kia.

Chưa kiểm: nội dung `calls.jsonl` gốc (không có trong repo; chỉ có số tổng hợp).
