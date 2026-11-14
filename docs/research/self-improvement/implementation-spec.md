# B-19 — Đặc tả triển khai vòng tự cải thiện RQ5 (cho Phòng Dev, D10)

> Phòng Nghiên cứu · vòng 4, gói 7, hạng mục S2b (@research-lead) · 3/11/2026 · phân loại dữ liệu: **Nội bộ**.
> Đầu vào: `design.md` §3–§6 (thiết kế 1.0), `holdout-and-sample-size.md` + `holdout-lock.json` (S2a), B-03 (`src/incident.ts`, `d9-implementation-2026-11-03.md` §3.3).
> **Chỉ là đặc tả.** Chưa sửa `src/`, `bench/`, `agents/`; chưa chạy benchmark. Số dòng `tệp:dòng` đọc ở commit `2c7573a`; Dev tìm lại bằng tên hàm nếu lệch.
> Bản sửa theo review S3 (3/11/2026): tách ba vai bằng khóa `roles` và CT-09/CT-18; ghi việc dùng lại bộ giữ lại là đe dọa tính hợp lệ, ngưỡng thay bộ theo số lần xác nhận (CT-19); nêu hệ quả báo giả của luật rollback (CT-20).

## 0. Tóm tắt cho Dev

- Thêm module mới `src/selfimprove.ts` và khóa cấu hình `selfImprove` (mặc định `enabled: false`). Khi tắt, **không** có hành vi nào đổi: không sự kiện mới, không lượt LLM mới, prompt giữ nguyên byte.
- Vòng có 7 bước: (1) nhật ký sự cố → (2) gom nhóm lỗi → (3) đề xuất bản vá → (4) A/B trên bộ giữ lại → (5) giám đốc duyệt → (6) áp dụng → (7) theo dõi và rollback. Mỗi bước có một bảng 8 trường ở §3.
- **Không bước nào tự áp bản vá.** Bước 6 chỉ chạy khi có sự kiện `selfimprove.approved` do giám đốc tạo trên giao diện. Rollback cũng phải được giám đốc xác nhận.
- A/B chạy trên **bộ giữ lại 10 bài của S2a**, hash khóa trong `holdout-lock.json`. Sàng lọc dùng r = 3 (60 lượt), xác nhận dùng r = 8 (160 lượt). t1–t5 và g1–g6 **chỉ dùng để chẩn đoán** ở bước 2 (D7).

Đối chiếu tên bước với `design.md` §3: bước "Phát hiện" và "Nhật ký" của thiết kế gộp thành bước 1 ở đây. "Nguyên nhân gốc" là bước 2, "Bản vá .diff" là bước 3, "Cổng A/B" là bước 4, "Giám đốc duyệt" là bước 5. Bước 7 của thiết kế ("Áp dụng có phiên bản + rollback") được tách thành bước 6 và bước 7 ở đây.

## 1. Cấu hình (khóa mới trong `src/config.ts`)

Kiểu khai báo đặt sau khối `planner` (`src/config.ts:172`). Giá trị mặc định đặt trong `BUILTIN`, sau `planner` (`src/config.ts:335`).

```ts
selfImprove: {
  enabled: boolean;              // mặc định false — công tắc tổng; false ⇒ mọi bước dưới đây là no-op
  collect: boolean;              // mặc định true khi enabled; bước 1 (chỉ ghi sự cố, không LLM)
  cluster: { minIncidents: number; minTasks: number }; // mặc định 3 và 2 (design.md §3 bước 3 — giả định, giám đốc chỉnh được)
  budgets: { analysisTokens: number; patchTokens: number; abScreenTokens: number; abConfirmTokens: number };
  holdoutLock: string;           // 'docs/research/self-improvement/holdout-lock.json'
  ab: { screenRepeats: 3; confirmRepeats: 8; tasks: string[]; maxConfirmRunsPerLock: number }; // tasks phải trùng holdout-lock.json; maxConfirmRunsPerLock mặc định 3 (§2 điểm 5)
  roles: { analyst: string; author: string; runner: string }; // mặc định 'methodologist', 'research-lead', 'data-scientist'; phải đôi một khác nhau (§4 điểm 4)
  monitorTasks: number;          // mặc định 3 (design.md §5.5)
  baselineTasks: number;         // mặc định 5 (design.md §5.5)
}
```

- `ab.tasks` không được chứa id có tiền tố `t1`…`t5` hoặc `g1`…`g6`. `loadConfig` phải ném lỗi tiếng Việt nếu vi phạm (test CT-04).
- Ba khóa `roles` phải khác nhau từng đôi. `loadConfig` ném lỗi tiếng Việt nếu trùng (CT-18).
- Ngân sách mặc định là **giả định** cần giám đốc chốt: `analysisTokens` 300 000; `patchTokens` 400 000; `abScreenTokens` 14 000 000; `abConfirmTokens` 38 000 000. Hai số A/B là ước SS-7 của S2a (11,8 triệu và 31,4 triệu) cộng khoảng 20 % dự phòng cho lượt hỏng và nạp lại cache.
- `phases.incidentLog` của B-03 (`src/config.ts:166`, `:333`, mặc định bật) là nguồn dữ liệu cho bước 1. Nó **không** phụ thuộc `selfImprove.enabled`, và vòng này không đổi nó.

## 2. Bộ bài giữ lại, hash và cỡ mẫu (lấy nguyên từ S2a, không tính lại)

| Mục | Giá trị (nguồn: `holdout-and-sample-size.md`) |
|---|---|
| Bộ giữ lại | c1-iis-ecs, c2-burst-alert, c3-shop-bugs, c4-audit-chain, c5-tickets-api, l1-oncall, l2-knights, l3-reconcile, l4-startup-order, s1-sec-review (10 bài) |
| Bài bị loại | t1–t5 và g1–g6 (D7); l1-modules, l2-chain (B-15); a1, r1, re1 (chấm bằng LLM-judge) |
| Hash | SHA-256 của `task.json` và của thư mục `hidden/` từng bài, ghi trong `holdout-lock.json` (bảng §2 của S2a). Quy ước: CRLF → LF; hash thư mục = sha256 các dòng `đường-dẫn<TAB>sha256` sắp theo tên |
| Sàng lọc | r = 3 lượt/nhánh/bài × 10 bài × 2 nhánh = **60 lượt**. Phát hiện B/A ≥ ×1,061 (token) và ×1,078 (thời gian) ở σ² vừa (SS-5) |
| Xác nhận | r = **8** lượt/nhánh/bài × 10 × 2 = **160 lượt**. Nâng lên r = 10 (200 lượt) nếu giám đốc muốn phủ Holm xấu nhất (SS-3) |
| Ngưỡng (D5, giả định do giám đốc chốt) | Token: cận trên 95 % của log(B/A) < log(0,95) với P1–P3, < log(1,05) với P4. An toàn: cận dưới của hiệu tỉ lệ test ẩn đạt ≥ −2 điểm phần trăm. Thời gian: cận trên của B/A < 1,05. α = 0,05 hai phía, power 0,8, Holm trên 3 chỉ số chính |
| Điều kiện trước xác nhận | Ước τ² từ pha sàng lọc. Nếu τ² ≥ 0,0005 thì **không** chạy xác nhận trên 10 bài; tính lại T theo SS-6 (quy tắc 1, §5 của S2a) |
| Nguồn phương sai | Nhánh B0, n = 37, 27 bậc tự do, `study-cloud/runs.jsonl` blob `9131f77…`, commit `e8354fa` |

**Chỗ siết chặt hơn `design.md` §5.4 (D7).** Thiết kế cho phép dùng t1–t5 để "chẩn đoán **và sàng lọc**". Đặc tả này đổi như sau:
1. t1–t5 và g1–g6 chỉ được dùng ở **bước 2** (gom nhóm lỗi và chẩn đoán). Không pha A/B nào dùng chúng.
2. **Cả hai** pha sàng lọc và xác nhận chạy trên bộ giữ lại.
3. Kết luận chỉ lấy từ các lượt của pha xác nhận. Không gộp lượt sàng lọc vào.
4. Thiết kế yêu cầu bộ giữ lại "chưa từng chạy với bất kỳ nhánh nào". Bộ của S2a đã từng chạy ở study-cloud. Phần bù: bộ này chưa từng dùng để chẩn đoán hay viết bản vá, và chưa có lượt nào chạy với prompt đã vá. Mọi sự cố sinh ra trong lượt A/B được gắn `source: ab.run` và **bị loại khỏi bước 2** (§3, bước 1), để bộ giữ lại không thành nguồn bản vá.
5. Bộ giữ lại dùng lại được cho nhiều bản vá. Đây là điểm nới so với "dùng một lần" của §5.4, nên phải ghi là **đe dọa tính hợp lệ** trong mọi báo cáo A/B. Các bài không dùng để viết bản vá (điểm 4), nhưng mỗi lần chạy xác nhận thì kết quả trên đúng 10 bài này lại được nhìn thấy. Qua nhiều vòng, việc chọn bản vá nào đi tiếp có thể dần khớp với đặc điểm riêng của bộ (tối ưu thích nghi theo bộ giữ lại), và CI của từng lần không tính tới việc đã chọn nhiều lần. Biện pháp:
   - Mọi hash phải khớp trước mỗi lần chạy (CT-12).
   - Ngưỡng xét thay bộ tính theo **số lần chạy xác nhận** trên cùng `lockSha256`, bất kể kết quả `pass` hay `fail`, không chỉ đếm bản vá đã qua. Mặc định `ab.maxConfirmRunsPerLock = 3` (giả định; giám đốc chốt). `buildAbSpec(pid, 'confirm')` đếm sự kiện `selfimprove.ab.started {phase:'confirm', lockSha256}` trong LogStore. Đủ ngưỡng thì từ chối và ghi `selfimprove.holdout.exhausted {lockSha256, confirmRuns}`, cho tới khi có bộ giữ lại mới (lock và hash mới) hoặc sự kiện `selfimprove.holdout.renewed {lockSha256, by:'director', reason}` (CT-19).
   - Lượt sàng lọc cũng làm lộ kết quả nên được đếm và in ra, nhưng không tính vào ngưỡng.
   - Phiếu đề xuất (bước 5) ghi số lần sàng lọc và xác nhận đã chạy trên bộ này.
   - Đề bài nhiệm vụ viết bản vá (bước 3) không chứa `ab-*.json` của các bản vá trước, để kết quả trên bộ giữ lại không chảy ngược vào bản vá mới.

**Hai điều kiện chặn của S2a, Dev phải xử lý trước khi chạy A/B lần đầu** (test CT-12, CT-13):
- (a) Harness đọc `tasks/<bài>/starter`, nhưng 10 bài giữ lại chỉ có `repo/`. Dev phải xác nhận hoặc sửa harness.
- (b) `claude-cli` chưa có sandbox, nên agent đọc được `hidden/` nếu biết đường dẫn. Dev phải theo dõi cờ `leak` (`harness/run.mjs`, khoảng dòng 248). Lượt nào có `leak = true` thì bị xóa theo quy tắc chung và ghi đếm cho từng nhánh. B-18 giảm rủi ro này nhưng **không** phải điều kiện tiên quyết.

## 3. Bảy bước — mỗi bước một bảng 8 trường

Quy ước chung:
- "Orchestrator.call()" là `Orchestrator.call` riêng tư ở `src/orchestrator.ts:3391`. Mọi lượt LLM của vòng phải đi qua nó, theo AGENTS.md. Cách làm là chạy lượt đó thành **một nhiệm vụ CCoding thường**, vì nhiệm vụ đi qua `call()` nên có log, đếm token và chính sách dữ liệu. `src/selfimprove.ts` **không** import runtime nào.
- Mọi sự kiện ghi bằng `LogStore.write` (`src/logger.ts:44`). Hàm này che bí mật và PII bằng `redactDeep`, rồi nối chuỗi băm (`append`, `:64–77`).
- Mọi tệp chỉ nằm dưới `data/self-improve/`, theo quy tắc "không ghi ngoài `data/`".

### Bước 1 — Nhật ký sự cố

| Trường | Đặc tả |
|---|---|
| Đầu vào | Có sáu nguồn. (i) Sự kiện `revise.incident` của B-03 (`src/orchestrator.ts:1968–1973`), payload `{taskId, subtaskId, round, items[{error,cause,fix,verifyCmd}], b02, parsed}`. (ii) Issue `blocker`/`major` sau `parseReview` (`:1904`). (iii) Hồi quy lệnh kiểm tra `regressed` (`:1910`). (iv) `review.unverified` (`:1937`). (v) `guard.block` (`src/tools/claude-guard.ts:156–166`). (vi) Góp ý 👎 `agent.feedback` (`src/server.ts:520`) và KPI `findings`/`recurred` (`src/kpi.ts:463` `computeKpi`) |
| Đầu ra | Bản ghi `ccoding/incident/v1` theo lược đồ `design.md` §3 bước 2, thêm hai giá trị `source`: `guard.block` và `ab.run`. `classification` lấy từ `task.classification`, **không** do agent khai. `promptVersion` = `git rev-parse HEAD:src/prompts.ts` cộng hash của `agents/<dept>/<id>.md`. `agentProposal` lấy từ `items[].fix` của B-03, cắt còn 300 ký tự |
| Tệp và module | Mới: `src/selfimprove.ts` với `toIncident(entry, task): Incident \| null`. Hàm này thuần và lọc lỗi hạ tầng, giống cách KPI tách `infraFailedCalls`, nên `category: 'INF'` không đi tiếp. Móc: một dòng `if (cfg.selfImprove.enabled) selfImprove.onLog(entry)` đặt sau `this.d.logs.write` ở `src/orchestrator.ts:1937` và `:1972`, cùng ở nhánh issue/regressed `:1910–1918`. Cách khác tốt hơn: đăng ký listener trên `EventBus` (`bus.publish({type:'log'})`, `src/logger.ts:54`) để không sửa vòng review |
| Công tắc | `selfImprove.enabled` (mặc định false) và `selfImprove.collect`. B-03 vẫn ghi `revise.incident` độc lập theo `phases.incidentLog` |
| Lượt LLM qua Orchestrator.call() | **Không có.** Ngân sách bằng 0. `symptom` do CCoding sinh từ tín hiệu, không chép nguyên văn đầu ra agent |
| Người duyệt | Không cần duyệt từng bản ghi. Dữ liệu được kiểm bằng test CT-01…CT-03 |
| Điều kiện rollback | Tắt `selfImprove.collect`. Bản ghi đã ghi không bị xóa vì log bất biến. Muốn vô hiệu hóa một bản ghi thì ghi thêm `incident.retracted {id, lý do}` |
| Sự kiện LogStore | `incident.recorded` (data là bản ghi v1, ghi cả vào `data/self-improve/incidents.jsonl` qua `logs.append`). `incident.skipped {reason: 'infra' \| 'classification' \| 'ab-run' \| 'no-evidence'}` |

Luật lọc bắt buộc ở bước 1:
- `classification ∈ {confidential, restricted}`: ghi `incident.skipped {reason:'classification'}` chỉ với `taskId` và `kind`, **không** ghi `symptom`/`agentProposal`, và không bao giờ đưa sang bước 2.
- `evidence` rỗng (không có callId, logSeq hay commit) thì loại.
- Lượt A/B (task có `options.variant` bắt đầu bằng `selfimprove/`) ghi `source: ab.run` và bị bước 2 loại.

### Bước 2 — Gom nhóm lỗi (nguyên nhân gốc)

| Trường | Đặc tả |
|---|---|
| Đầu vào | `data/self-improve/incidents.jsonl` (bước 1), chỉ lấy bản ghi `classification ∈ {public, internal}` và `source ≠ ab.run`. Lượt chạy trên t1–t5 và g1–g6 **được dùng ở đây** để chẩn đoán (D7) |
| Đầu ra | `data/self-improve/clusters/<CL-yyyymmdd-seq>.json`: `{key:(category, challengeId, agentId, phase), incidents[], tasks[], cause:'prompt-missing'\|'prompt-conflict'\|'tool-perm'\|'infra', evidence[], labeledBy[]}`. Cụm chỉ "mở" khi có ≥ `minIncidents` sự cố (3) trong ≥ `minTasks` nhiệm vụ khác nhau (2). Cụm `tool-perm` hoặc `infra` bị đóng và **không** sinh bản vá: `tool-perm` phải sửa thủ công ở `toolsFor` (`src/tools/workspace.ts:51`), ngoài vòng này |
| Tệp và module | `src/selfimprove.ts`: `clusterIncidents(incidents, cfg): Cluster[]` (thuần, tất định) và `openAnalysisTask(cluster)`. Hàm sau tạo một nhiệm vụ CCoding giao `selfImprove.roles.analyst` (mặc định `@methodologist`), đề bài là bản tổng hợp của cụm (đã che, không có nguyên văn `agentProposal`). Nút "Phân tích cụm" trên màn hình "Đề xuất cải thiện" (`src/server.ts`, tuyến mới `POST /api/selfimprove/clusters/:id/analyze`) |
| Công tắc | `selfImprove.enabled`. Nhiệm vụ phân tích chỉ được tạo khi giám đốc bấm nút, không tự tạo |
| Lượt LLM qua Orchestrator.call() | Gom nhóm không gọi LLM. Phân tích nguyên nhân là một nhiệm vụ CCoding (route, plan, execute, review), nên mọi lượt đi qua `call()`. `budgetTokens = selfImprove.budgets.analysisTokens` (300 000, giả định) và `budgetMode: 'complete'` |
| Người duyệt | Người gán nhãn `cause` và FM là `roles.analyst` (mặc định `@methodologist`), ghi vào `labeledBy[]`. Một mẫu nhỏ được người thứ hai gán độc lập (design.md §7, P-14), ví dụ `@literature-researcher`; người này cũng ghi vào `labeledBy[]` và không được trùng `roles.author` hay `roles.runner`. `@peer-reviewer` review ở pha review sẵn có |
| Điều kiện rollback | Cụm sai thì giám đốc bấm "Đóng cụm", ghi `selfimprove.cluster.closed {reason}`. Không có gì cần hoàn tác vì bước này không đổi prompt |
| Sự kiện LogStore | `selfimprove.cluster.opened`, `selfimprove.cluster.analyzed {clusterId, taskId, cause, labeledBy}`, `selfimprove.cluster.closed` |

### Bước 3 — Đề xuất bản vá prompt hoặc hồ sơ agent

| Trường | Đặc tả |
|---|---|
| Đầu vào | Một cụm đã phân tích, có `cause ∈ {prompt-missing, prompt-conflict}`. Có thể kèm bản vá mẫu P1–P4 (`docs/research/self-improvement/prompt-patches/`). **Không** kèm `ab-*.json` của bản vá trước (§2 điểm 5) |
| Đầu ra | `data/self-improve/proposals/<PID>/patch.diff` (unified diff **một mục tiêu**, chỉ chạm **một** tệp `src/prompts.ts` hoặc `agents/<dept>/<id>.md`) và `meta.json` `{pid, clusterId, target, hypothesis, primaryMetric, kind:'optimize'\|'collect', author, labeledBy[], sizeChars}` (`labeledBy[]` chép từ cụm). `kind` quyết định ngưỡng token: `optimize` dùng 0,95, `collect` (kiểu P4) dùng 1,05 |
| Tệp và module | `src/selfimprove.ts`: `openPatchTask(cluster)` tạo nhiệm vụ giao `selfImprove.roles.author` (mặc định `@research-lead`) hoặc agent giám đốc chỉ định. Hàm **từ chối** nếu người nhận nằm trong `cluster.labeledBy[]` hoặc trùng `roles.runner` (CT-18). Agent **chỉ viết** diff dưới dạng văn bản trong báo cáo, rồi CCoding trích ra `patch.diff`, vì agent không có quyền ghi `src/` hay `agents/`. `screenPatch(diff): {ok, violations[]}` chạy danh sách cấm (§4). `git apply --check --unidiff-zero --ignore-whitespace` (design.md §3 bước 4) chạy trên worktree nháp |
| Công tắc | `selfImprove.enabled`. Nhiệm vụ viết bản vá chỉ được tạo khi giám đốc bấm "Đề xuất bản vá" |
| Lượt LLM qua Orchestrator.call() | Nhiệm vụ CCoding, mọi lượt qua `call()`. `budgetTokens = budgets.patchTokens` (400 000, giả định). `screenPatch` không gọi LLM |
| Người duyệt | Người viết là `roles.author` (mặc định `@research-lead`, hoặc agent được giao), khác người gán nhãn cụm ở bước 2 và người chạy A/B ở bước 4. Reviewer là `@peer-reviewer` ở pha review sẵn có, và **không** được là người viết. `screenPatch` loại tự động trước khi có người xem |
| Điều kiện rollback | Diff vi phạm danh sách cấm, `git apply --check` lỗi, hoặc chạm hơn một tệp: trạng thái `rejected-auto` và không sang bước 4. Chưa có thay đổi nào nên không cần hoàn tác |
| Sự kiện LogStore | `selfimprove.proposed {pid, clusterId, target, sizeChars, author, sha256(patch)}` và `selfimprove.rejected {pid, by:'auto', violations[]}` |

### Bước 4 — A/B trên bộ bài giữ lại

| Trường | Đặc tả |
|---|---|
| Đầu vào | `proposals/<PID>/patch.diff` đã qua `screenPatch`; `holdout-lock.json`; cấu hình `selfImprove.ab` |
| Đầu ra | `data/self-improve/proposals/<PID>/ab-screen.json` và `ab-confirm.json`: theo từng chỉ số chính, gồm tỉ số trung vị B/A, CI 95 %, p đã chỉnh Holm, n lượt mỗi nhánh, số lượt bị xóa mỗi nhánh (429, `leak`), τ² ước từ sàng lọc, số lần sàng lọc và xác nhận đã chạy trên `lockSha256` này, quyết định `pass`/`fail`/`need-more-tasks`. Kèm `runs.csv` gốc, có cột `variant` |
| Tệp và module | `src/selfimprove.ts` gồm `verifyHoldout(lock)`, `buildAbSpec(pid, phase)` và `decide(results, kind)`. **Nhánh A** = server CCoding hiện hành. **Nhánh B** = git worktree nháp `selfimprove/<PID>`, áp `patch.diff` rồi build, chạy server riêng với cổng và `dataDir` riêng (`data/self-improve/ab/<PID>/B`). Không commit lên nhánh chính. Harness: `bench/vs-claude/harness/run.mjs` với arm CCoding (`lib/ccoding.mjs` gọi REST theo `baseUrl`), mỗi nhánh một `baseUrl`. `variant` truyền qua `TaskOptions.variant` (`src/types.ts:355`, `variantOptions` ở `src/orchestrator.ts:3970`; `ccoding bench` đã gán `variant` ở `src/bench.ts:224`). Phân tích thống kê dùng `requiredRuns`/`zInv` của `bench/vs-claude/harness/stats.mjs` và bootstrap phân tầng theo bài. `buildAbSpec` kiểm tách vai (CT-09) và ngưỡng `maxConfirmRunsPerLock` (CT-19) trước khi dựng đặc tả |
| Công tắc | `selfImprove.enabled`. A/B chỉ chạy khi giám đốc bấm "Chạy sàng lọc", sau đó "Chạy xác nhận" |
| Lượt LLM qua Orchestrator.call() | Mỗi lượt A/B là một nhiệm vụ của **chính CCoding** (nhánh A hoặc B), nên mọi lượt LLM đi qua `call()` của server tương ứng. Chấm điểm bằng `grader: code/exact` tất định, không có LLM-judge (đó là lý do S2a loại a1/r1/re1). Trần: `abScreenTokens` 14 triệu (ước SS-7: 11,8 triệu, 2,8 giờ) và `abConfirmTokens` 38 triệu (ước 31,4 triệu, 7,5 giờ, chia nhiều cửa sổ 5 giờ). Không chạy khi runtime báo gần hạn mức (design.md §6.5). Chạm trần thì dừng và ghi `selfimprove.ab.aborted` |
| Người duyệt | Người chạy A/B là `roles.runner` (mặc định `@data-scientist`), khác người viết bản vá và mọi người trong `labeledBy[]` (CT-09). Kết quả đi kèm cảnh báo n nhỏ và số lần đã chạy xác nhận trên bộ giữ lại (§2 điểm 5) |
| Điều kiện rollback | Có bảy điều kiện dừng. (1) `verifyHoldout` lệch hash: dừng, exit 1, không chạy. (2) Sàng lọc thấy B xấu rõ (ngưỡng SS-5): `fail`, dừng. (3) τ² ≥ 0,0005: `need-more-tasks`, không chạy xác nhận trên 10 bài. (4) Xác nhận không đạt cả ba ngưỡng D5 sau Holm: `fail`. (5) Một bài giảm ≥ 10 test đạt ở cả hai lượt (design.md §5.3.1): `fail`. (6) Chạm trần token: `aborted`. (7) Đã đủ `maxConfirmRunsPerLock` lần xác nhận trên bộ này mà chưa có `holdout.renewed` của giám đốc: không chạy xác nhận. Mọi trường hợp đều xóa worktree nháp, còn kết quả và log được giữ |
| Sự kiện LogStore | `selfimprove.ab.started {pid, phase, lockSha256, tasks, repeats, runner}`, `selfimprove.ab.done {pid, phase, decision, metrics}`, `selfimprove.ab.aborted {pid, reason}`, `selfimprove.holdout.exhausted {lockSha256, confirmRuns}`, `selfimprove.holdout.renewed {lockSha256, by:'director', reason}` |

Thứ tự chạy: xen kẽ ngẫu nhiên có khối theo bài (A/B/B/A…), chạy tuần tự từng hệ, ghim mô hình và phiên bản CLI, ghi giờ bắt đầu (design.md §7). Seed xáo trộn ghi trong `ab.started`.

### Bước 5 — Giám đốc duyệt

| Trường | Đặc tả |
|---|---|
| Đầu vào | Kết quả bước 4 với `ab-confirm.json.decision = pass`; `meta.json`; tóm tắt cụm |
| Đầu ra | Phiếu đề xuất `data/self-improve/proposals/<PID>/ticket.json`, gồm: số sự cố và bằng chứng; diff; CI 95 % của ba chỉ số; cảnh báo n nhỏ; số lần sàng lọc và xác nhận đã chạy trên bộ giữ lại (đe dọa tính hợp lệ, §2 điểm 5); kích thước ký tự thêm vào system prompt (ảnh hưởng cache tiền tố, O1); rủi ro. Quyết định là `approved`, `rejected` hoặc `more` (thử thêm) |
| Tệp và module | `src/selfimprove.ts` có `proposalTicket(pid)` (thuần). `src/server.ts` thêm tuyến `GET /api/selfimprove/proposals` và `POST /api/selfimprove/proposals/:pid/decision`. Tuyến này chỉ nhận từ phiên giám đốc (cùng cơ chế với tuyến góp ý `src/server.ts:~510–520`). `public/` thêm màn "Đề xuất cải thiện" |
| Công tắc | `selfImprove.enabled`. **Không có hạn tự duyệt**: khác `defaults.planApprovalMinutes`, khóa này không có giá trị tự duyệt sau X phút |
| Lượt LLM qua Orchestrator.call() | Không có. Ngân sách bằng 0 |
| Người duyệt | **Giám đốc (Tom)**, và chỉ giám đốc. Agent không có công cụ hay tuyến nào để gửi `decision` |
| Điều kiện rollback | `rejected` đóng đề xuất. `more` quay lại bước 4 với bộ bài mở rộng. Chưa áp gì nên không cần hoàn tác |
| Sự kiện LogStore | `selfimprove.approved {pid, by:'director'}`, `selfimprove.rejected {pid, by:'director', reason}`, `selfimprove.more {pid}` |

### Bước 6 — Áp dụng có phiên bản

| Trường | Đặc tả |
|---|---|
| Đầu vào | Sự kiện `selfimprove.approved {pid}` **còn hiệu lực**: chưa có `rejected` hay `rolledback` sau đó, và `sha256(patch)` trùng `selfimprove.proposed`. Hàm áp dụng phải đọc lại LogStore để kiểm, không tin tham số truyền vào |
| Đầu ra | Một commit **riêng** chỉ chứa diff đó, thông điệp `selfimprove: <PID> <C-xx> <giả thuyết>`, thẻ `prompts-vN`. `promptVersion` của sự cố về sau ghi hash này |
| Tệp và module | `src/selfimprove.ts` có `applyApproved(pid)`. Hàm gọi `screenPatch` lần nữa (phòng diff bị đổi), rồi commit qua `src/git.ts` và `src/ship.ts`. Không `reset --hard`, không force. Không push tự động |
| Công tắc | `selfImprove.enabled`. Giám đốc bấm "Áp dụng" sau khi duyệt, nên đây là hai thao tác tách nhau |
| Lượt LLM qua Orchestrator.call() | Không có. Ngân sách bằng 0 |
| Người duyệt | Giám đốc (thao tác áp dụng). Không có agent nào được gọi `applyApproved` |
| Điều kiện rollback | `git apply` hoặc typecheck/test (`npm run typecheck`, `npm test`) lỗi trên worktree áp dụng: hủy, không commit, ghi `selfimprove.apply.failed`. Commit đã có nhưng cần lùi: theo bước 7 |
| Sự kiện LogStore | `selfimprove.applied {pid, commit, tag}`, `selfimprove.apply.failed {pid, reason}` |

### Bước 7 — Theo dõi và rollback

| Trường | Đặc tả |
|---|---|
| Đầu vào | `selfimprove.applied`; KPI của `monitorTasks` = 3 nhiệm vụ thật đầu tiên sau áp dụng, so với `baselineTasks` = 5 nhiệm vụ gần nhất trước đó (design.md §5.5). Chỉ số: tỉ lệ lệnh kiểm tra đạt, `firstPassOk`, số vòng sửa (`src/kpi.ts` `computeKpi`) |
| Đầu ra | `data/self-improve/proposals/<PID>/monitor.json`. Khi có hồi quy thì sinh phiếu đề nghị rollback kèm mức `severity` |
| Tệp và module | `src/selfimprove.ts` có `monitorApplied(pid)`, gọi khi nhiệm vụ kết thúc (listener `task.done` trên EventBus) và `rollback(pid)`. `rollback` chạy `git revert <commit>`, tạo commit mới và thẻ `prompts-vN+1` |
| Công tắc | `selfImprove.enabled`. Theo dõi tự chạy, không cần LLM. Rollback cần giám đốc bấm |
| Lượt LLM qua Orchestrator.call() | Không có. Ngân sách bằng 0 |
| Người duyệt | Giám đốc xác nhận rollback. Hệ thống chỉ **đề xuất**, giống quy tắc "không tự áp" |
| Điều kiện rollback | Có ba trường hợp đề xuất rollback. (1) Tỉ lệ lệnh kiểm tra đạt, hoặc `firstPassOk`, của 3 nhiệm vụ sau thấp hơn trung bình 5 nhiệm vụ trước. (2) Có `check.regression` mới thuộc agent bị vá. (3) Giám đốc yêu cầu. Ngưỡng định lượng chính xác là **giả định** cần giám đốc chốt; mặc định đề xuất là "thấp hơn bất kỳ" vì n = 3 không đủ kiểm định. **Hệ quả của mặc định này: báo động giả nhiều.** Nếu bản vá thật ra không đổi gì, trung bình 3 nhiệm vụ sau thấp hơn trung bình 5 nhiệm vụ trước khoảng một nửa số lần cho mỗi chỉ số (lập luận đối xứng, giả định các nhiệm vụ độc lập cùng phân phối; chỉ số rời rạc có hòa thì dưới 0,5; chưa đo). Với hai chỉ số và luật "bất kỳ", tỉ lệ báo giả nằm giữa khoảng 0,5 (hai chỉ số luôn cùng chiều) và 0,75 (độc lập). Vì vậy trường hợp (1) chỉ sinh phiếu mức **cảnh báo sớm** (`severity:'early'`), ghi rõ "n = 3, tỉ lệ báo giả cao" và gợi ý kéo dài theo dõi (`monitorTasks` lên 5–10) trước khi rollback. Trường hợp (2) và (3) sinh phiếu `severity:'strong'`. Mức nào cũng cần giám đốc xác nhận (CT-16, CT-20) |
| Sự kiện LogStore | `selfimprove.monitor {pid, n, metrics}`, `selfimprove.rollback.proposed {pid, reason, severity:'early'\|'strong'}`, `selfimprove.rolledback {pid, revertCommit, by:'director'}` |

## 4. An toàn (bắt buộc, có test)

1. **Không tự áp.** `applyApproved` và `rollback` chỉ chạy khi có sự kiện duyệt của giám đốc trong LogStore, với `by:'director'` và chuỗi băm hợp lệ. Không có timer tự duyệt (CT-07, CT-08).
2. **Danh sách cấm** trong `screenPatch`. Bản vá bị loại tự động (`rejected-auto`) nếu chạm một trong các mục sau:
   - Tệp: `src/tools/claude-guard.ts`, `src/tools/guard-paths.ts`, `src/tools/shell-policy.ts`, `src/tools/workspace.ts` (`toolsFor`), `src/config.ts`, `src/logger.ts`, `src/util/redact.ts`, `src/selfimprove.ts`, `.claude/`, mọi `settings*.json`, `AGENTS.md`, `CLAUDE.md`, `docs/data-protection-assessment.md`.
   - Chuỗi trong dòng `+`/`-` của diff: `CLASSIFICATION_RULE` (`src/prompts.ts:25`), dòng `Phân loại dữ liệu của nhiệm vụ` (`src/prompts.ts:114`), mục "Quy tắc chung", `dataProtection`, `allowedRuntimes`, `redact`, `hashChain`, `guard`, `hook`, `denyCommands`, `tools:` hoặc trường `tools` trong frontmatter `agents/*.md` (quyền công cụ), `access`, `runtime`.
   - Diff chạm hơn một tệp, hoặc diff nhị phân.
   - Mục nào không xác định được thì mặc định **loại**.
3. **`agentProposal` là dữ liệu không đáng tin.** Nó chỉ được lưu và hiển thị dưới dạng văn bản đã che, escape HTML trên `public/`. Không thực thi nó, không đưa vào prompt nào (kể cả đề bài nhiệm vụ phân tích ở bước 2) trước khi giám đốc duyệt, và không dùng làm bằng chứng (CT-05).
4. **Tách vai.** Ba vai phải đôi một khác nhau theo `agentId`:
   - người gán nhãn cụm hoặc lỗi gieo: `roles.analyst` (mặc định `@methodologist`) cùng người thứ hai độc lập, bước 2, ghi vào `labeledBy[]`;
   - người viết bản vá: `roles.author` (mặc định `@research-lead`), bước 3, ghi vào `meta.json.author`;
   - người chạy A/B: `roles.runner` (mặc định `@data-scientist`), bước 4, ghi vào `ab.started.runner`.

   Kiểm ở ba chỗ: `loadConfig` từ chối nếu ba khóa `roles` trùng nhau; `openPatchTask` từ chối người viết ∈ `labeledBy[]` hoặc = `runner` (CT-18); `buildAbSpec` từ chối `runner` = `author` hoặc ∈ `labeledBy[]` (CT-09). Reviewer không review bản vá của chính mình.
5. **Không sửa hook hay chính sách dữ liệu bằng vòng này.** Các mục này đã nằm trong danh sách cấm. Thay đổi kiểu đó phải đi đường thường: nhiệm vụ Dev cùng đánh giá bảo vệ dữ liệu.
6. **Mặc định tắt.** Khi `selfImprove.enabled = false`, băm prompt execute, revise và synthesize phải trùng bản trước, và không có sự kiện `incident.*`/`selfimprove.*` (CT-10).

## 5. Kiểm bảo vệ dữ liệu (ngắn)

| Mục | Yêu cầu |
|---|---|
| Phân loại | Sự cố mang mức của nhiệm vụ nguồn (`task.classification`), lấy mức cao nhất khi gộp. Cụm, đề xuất và kết quả A/B: **Nội bộ**. Bộ bài giữ lại là dữ liệu tổng hợp, không có DLCN thật |
| Nguồn bị cấm | Sự cố từ nhiệm vụ `confidential` hoặc `restricted` **không** vào cụm, đề xuất hay A/B. Chúng chỉ được đếm qua `incident.skipped {reason:'classification'}`, không có nội dung |
| Che PII/bí mật | Mọi bản ghi đi qua `LogStore.write`/`append` (`redactDeep`). `symptom` do CCoding sinh. `agentProposal` cắt còn 300 ký tự và đã che. Không chép prompt hay đầu ra nguyên văn |
| Lưu giữ | ≥ 6 tháng cho nhật ký xử lý (`incident.*`, `selfimprove.*`). Hiện `dataProtection.retentionDays = 400` (`src/config.ts:373`), tức ≥ 12 tháng. Dev phải xác nhận việc dọn log theo `retentionDays` không xóa `data/self-improve/` sớm hơn mức này (CT-11) |
| Bất biến | Nối chuỗi băm (`hashChain: true`, `src/logger.ts:66–72`). Kiểm bằng hàm verify sẵn có của LogStore (`src/logger.ts:~143`). Không sửa hay xóa bản ghi; muốn vô hiệu hóa thì ghi thêm `*.retracted` |
| Vị trí | Chỉ dùng `data/self-improve/` và `data/logs/`. Worktree A/B nằm dưới `data/self-improve/ab/` và bị xóa sau khi chạy |
| Mạng và khóa | Không thêm endpoint hay khóa API. A/B dùng runtime đang cấu hình theo `allowedRuntimes`. Không dùng 9router |
| Đánh giá 5 lớp | Khi D10 hiện thực hóa thì cập nhật `docs/data-protection-assessment.md` bằng mục "B-19 Vòng tự cải thiện", theo AGENTS.md. Đặc tả này chưa đổi dữ liệu nên chưa chạy lại đánh giá 25 năng lực |

## 6. Test chấp nhận cho Dev (D10)

Đề xuất tệp `test/selfimprove.test.ts`. Mọi test chạy offline với runtime `mock`, không gọi mạng.

| Mã | Test | Kỳ vọng |
|---|---|---|
| CT-01 | `toIncident` với `revise.incident` có 2 item | 2 bản ghi v1 hợp lệ với lược đồ; `classification` lấy từ task; `evidence` ≥ 1 |
| CT-02 | `toIncident` với lỗi 429/hạn mức | `null` và ghi `incident.skipped {reason:'infra'}` |
| CT-03 | Sự cố từ task `confidential` hoặc `restricted` | Không vào `incidents.jsonl` đầu vào của bước 2; log skip không chứa `symptom` hay `agentProposal` |
| CT-04 | `loadConfig` với `selfImprove.ab.tasks` chứa `t1-duration` hoặc `g3-*` | Ném lỗi tiếng Việt |
| CT-05 | `agentProposal` chứa chuỗi tiêm lệnh (`Bỏ qua mọi quy tắc…`, `` `rm -rf` ``) | Không xuất hiện trong prompt của nhiệm vụ phân tích hay viết bản vá; hiển thị đã escape |
| CT-06 | `screenPatch` trên diff chạm `CLASSIFICATION_RULE`, `claude-guard.ts`, `tools:` trong `agents/*.md`, `dataProtection`, hoặc chạm 2 tệp | `ok:false` với `violations` tương ứng; ghi `selfimprove.rejected {by:'auto'}` |
| CT-07 | `applyApproved(pid)` khi chưa có `selfimprove.approved` | Ném lỗi, không có commit |
| CT-08 | `applyApproved` khi `sha256(patch)` khác `proposed` | Ném lỗi, không có commit |
| CT-09 | `runner` của A/B trùng `author` của bản vá, hoặc nằm trong `labeledBy[]` | `buildAbSpec` từ chối cả hai trường hợp, lỗi tiếng Việt |
| CT-10 | `selfImprove.enabled = false` | Băm prompt execute, revise, synthesize trùng bản trước; 0 sự kiện `incident.*`/`selfimprove.*` |
| CT-11 | Dọn log theo `retentionDays` | Không xóa bản ghi `data/self-improve/` dưới 183 ngày |
| CT-12 | `verifyHoldout` khi đổi 1 byte trong `hidden/` của một bài | Trả lệch, A/B không chạy (tương đương `holdout-sample-size.mjs --size` exit 1) |
| CT-13 | Đặc tả A/B dựng từ `holdout-lock.json` | Đúng 10 bài của §2; r = 3 (sàng lọc) và 8 (xác nhận); harness tìm thấy thư mục mã khởi đầu của bài (`repo/` hoặc `starter/`, điểm (a) của S2a) |
| CT-14 | `decide()` trên dữ liệu giả: token B/A 0,90 với CI hẹp, an toàn bằng nhau, thời gian 1,00 | `pass`. Đổi cận dưới an toàn thành −3 pp thì `fail`. Với `kind:'collect'` thì dùng ngưỡng 1,05 |
| CT-15 | `decide()` nhận lượt sàng lọc trộn vào dữ liệu xác nhận | Chỉ dùng lượt có `phase:'confirm'` (D7) |
| CT-16 | `rollback(pid)` khi chưa có xác nhận của giám đốc | Chỉ ghi `rollback.proposed`, không revert |
| CT-17 | Chuỗi băm sau một vòng đủ 7 bước (mock) | Verify LogStore không báo `broken` |
| CT-18 | (a) `openPatchTask` với người viết ∈ `cluster.labeledBy[]` (ví dụ `methodologist`) hoặc = `roles.runner`; (b) `loadConfig` với hai khóa `roles` trùng nhau | (a) Từ chối, không tạo nhiệm vụ; (b) ném lỗi tiếng Việt. Với mặc định (`methodologist`, `research-lead`, `data-scientist`) thì tạo được |
| CT-19 | `buildAbSpec(pid, 'confirm')` khi LogStore đã có `maxConfirmRunsPerLock` (3) sự kiện `ab.started {phase:'confirm'}` cùng `lockSha256`, gồm cả lần `fail` | Từ chối, ghi `selfimprove.holdout.exhausted`. Có `holdout.renewed {by:'director'}` sau đó thì chạy được; `renewed` không có `by:'director'` thì vẫn từ chối |
| CT-20 | `monitorApplied`: 3 nhiệm vụ sau thấp hơn trung bình nhưng không có `check.regression` mới | Ghi `rollback.proposed {severity:'early'}`, không revert. Có `check.regression` mới thuộc agent bị vá thì `severity:'strong'` |

Lệnh kiểm tra trước khi gộp: `npm run typecheck` và `npm test` (theo AGENTS.md).

## 7. Giới hạn và giả định

- Mọi ngân sách, ngưỡng cụm (3/2), ngưỡng D5, ngưỡng theo dõi và `maxConfirmRunsPerLock` (3) đều là **giả định** do giám đốc chốt, không rút ra từ dữ liệu.
- Cỡ mẫu dựa trên τ² = 0 và σ² của B0 với n = 37 (độ tin cậy thấp, S2a). Ở pha xác nhận phải tính lại khi có τ² thật.
- Bộ giữ lại gần trần (B0 đạt 1,000 trên 10/10 bài), nên chỉ số an toàn chỉ phát hiện hồi quy, không đo được cải thiện chất lượng.
- Dùng lại bộ giữ lại cho nhiều bản vá là đe dọa tính hợp lệ (tối ưu thích nghi theo bộ, §2 điểm 5). Ngưỡng 3 lần xác nhận chỉ giới hạn mức lộ, không loại bỏ nó; CI của từng lần A/B không hiệu chỉnh cho việc đã chọn qua nhiều lần.
- Luật rollback mặc định ở bước 7 có tỉ lệ báo giả ước khoảng 0,5–0,75 khi bản vá không có tác dụng (lập luận đối xứng, chưa đo), nên trường hợp (1) chỉ là cảnh báo sớm.
- Cơ chế nhánh B dùng server và worktree riêng là đề xuất. Dev cần kiểm harness có hỗ trợ `baseUrl` riêng cho từng arm hay không (`lib/ccoding.mjs` đã nhận `opts.baseUrl`; chưa kiểm cấu hình arm trong `run.mjs`).
- Số dòng `tệp:dòng` đọc ở commit `2c7573a` và có thể lệch. `design.md` ghi `ISSUE_RE` ở `kpi.ts:129` và `COMMON_KEYS` ở `bench.ts:125`, nhưng hiện chúng ở `src/kpi.ts:302` và `src/bench.ts:141`.
