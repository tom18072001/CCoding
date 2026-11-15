# Thiết kế vòng tự cải thiện sub-agent (RQ5) — phiên bản 1.0

> Hạng mục S4, Phòng Nghiên cứu, 2/11/2026. Phân loại dữ liệu: nội bộ. **Chỉ là thiết kế và kế hoạch thí nghiệm — chưa chạy benchmark, chưa sửa `src/` hay `agents/`.**
> Mã thách thức C-xx lấy từ `docs/research/challenges.md` (S3); mã tối ưu O1–O6 và tên bảng T-a…T-f theo hợp đồng với S2 (S2 chưa bàn giao lúc viết: tên bảng cần đối chiếu lại khi có `token-analysis.md`).

## 1. Vấn đề và phạm vi

Hiện nay việc cải thiện sub-agent là **thủ công** (C-14): giám đốc bấm 👍/👎 hoặc "Nhắc agent", tối đa 5 góp ý (mỗi góp ý cắt 300 ký tự) được chèn vào cuối system prompt (`src/prompts.ts:systemFor`, nạp ở `src/orchestrator.ts` ~2652 qua `store.activeFeedback`). KPI (`src/kpi.ts:computeKpi`) sinh "việc cần sửa" (`FINDING_LABELS`) nhưng không có: nhật ký sự cố có cấu trúc, phân tích nguyên nhân gốc, bản vá có phiên bản, thử A/B, rollback.

Yêu cầu của chủ dự án: sub-agent **tự cải thiện mỗi khi có vấn đề** (ghi lại vấn đề, tự đề xuất sửa prompt). Ràng buộc đặt ra bởi chính các sự cố đã gặp: *không được tự áp dụng* thay đổi prompt khi giám đốc chưa duyệt (một prompt sai nhân lên cho mọi lượt gọi — xem C-29, C-03: một câu trong prompt đổi hành vi cả gói).

Phạm vi bản thiết kế: (a) vòng khép kín 7 bước; (b) lược đồ nhật ký sự cố; (c) cổng A/B; (d) điểm móc trong mã; (e) chính sách an toàn; (f) 4 bản vá mẫu; (g) đe dọa tính hiệu lực.

## 2. Phương án thiết kế đã cân nhắc

| Phương án | Mô tả | Ưu | Nhược | Quyết định |
|---|---|---|---|---|
| A. Chỉ góp ý thủ công (hiện trạng) | Giám đốc viết góp ý | Rẻ, an toàn | Không mở rộng; không đo hiệu quả (C-14) | Giữ làm kênh phụ |
| B. Tự sửa prompt trực tiếp (self-modifying) | Agent tự sửa hồ sơ rồi dùng ngay | Nhanh | Không kiểm soát; có thể suy giảm chất lượng hoặc lách quy tắc an toàn; không truy vết | **Loại** |
| C. Đề xuất → A/B → giám đốc duyệt → áp dụng có phiên bản | Agent/KPI chỉ *đề xuất* (bản vá `.diff`); CCoding đo; người quyết định | Truy vết, đo được, có rollback | Tốn lượt chạy; n nhỏ nên kết luận yếu | **Chọn** |

Loại thiết kế: *design science* cho artefact (vòng cải thiện), kết hợp thực nghiệm so sánh có cặp (A/B) để đánh giá từng bản vá. Tiêu chí đánh giá artefact: hữu dụng (bản vá được chấp nhận), nhất quán (không làm xấu chỉ số an toàn), hiệu năng (token/thời gian), khả năng áp dụng (chi phí lượt chạy).

## 3. Vòng 7 bước

```
(1) Phát hiện → (2) Nhật ký sự cố → (3) Nguyên nhân gốc → (4) Bản vá .diff
      → (5) Cổng A/B → (6) Giám đốc duyệt → (7) Áp dụng có phiên bản + rollback
```

### Bước 1 — Phát hiện (nguồn sự cố, đều đã có sẵn tín hiệu trong mã)

| Nguồn | Tín hiệu | Vị trí trong mã |
|---|---|---|
| Review nêu blocker/major | `review.issues` (mức `blocker`/`major`) | `src/orchestrator.ts` ~1356–1393 |
| Hồi quy lệnh kiểm tra | `checkRegressions(task)` | `src/orchestrator.ts` ~1358 |
| Reviewer không chạy lệnh | `verified === false` → log `review.unverified` | `src/orchestrator.ts` ~1377–1385 |
| KPI "việc cần sửa" tái diễn | `AgentKpi.findings`, `recurred` | `src/kpi.ts` `computeKpi`, `applyResolutions` |
| Hạng mục chạy lại/chạm trần | `attemptsAvg`, `tools.capHits`, `truncated` | `src/kpi.ts` `AgentKpi` |
| Lượt gọi hỏng do đầu ra | `failedCalls` (tách khỏi `infraFailedCalls`) | `src/kpi.ts` |
| Góp ý 👎 của giám đốc | `AgentFeedback` có `finding` | `src/store.ts` `feedback()`, `src/server.ts` ~437–447 |

Nguyên tắc: **lỗi hạ tầng (429, hạn mức, mạng) không tạo sự cố prompt** — dùng đúng cách tách của KPI (C-30), tránh "vá" prompt cho lỗi không do prompt.

### Bước 2 — Nhật ký sự cố có cấu trúc

Ghi qua `LogStore` để được che PII/bí mật (`redactDeep`) và nối chuỗi băm (kind mới `incident.*`, tệp trong `data/` — không ghi ngoài `data/`). Lược đồ (JSON Schema rút gọn, một bản ghi mỗi sự cố):

```json
{
  "$id": "ccoding/incident/v1",
  "type": "object",
  "required": ["id", "ts", "taskId", "agentId", "phase", "source", "category", "evidence", "classification", "promptVersion"],
  "properties": {
    "id": { "type": "string", "description": "INC-<yyyymmdd>-<seq>" },
    "ts": { "type": "string", "format": "date-time" },
    "taskId": { "type": "string" },
    "subtaskId": { "type": "string" },
    "agentId": { "type": "string" },
    "phase": { "enum": ["route", "plan", "discuss", "finalize", "execute", "review", "revise", "synthesize"] },
    "runtime": { "type": "string" },
    "model": { "type": "string" },
    "source": { "enum": ["review.blocker", "review.major", "check.regression", "review.unverified", "kpi.finding", "director.down", "agent.selfReport"] },
    "category": { "enum": ["FM-1", "FM-2", "FM-3", "INF"], "description": "nhóm MAST + hạ tầng như challenges.md; INF không sinh bản vá" },
    "challengeId": { "type": "string", "pattern": "^C-\\d{2}$", "description": "trùng mã đã có hoặc 'new'" },
    "evidence": {
      "type": "array", "minItems": 1,
      "items": { "type": "object", "required": ["kind", "ref"],
        "properties": { "kind": { "enum": ["callId", "logSeq", "commit", "reviewIssue", "kpiKey"] }, "ref": { "type": "string" } } }
    },
    "symptom": { "type": "string", "maxLength": 400 },
    "metrics": { "type": "object", "properties": { "tokens": { "type": "number" }, "turns": { "type": "number" }, "readsBeforeWrite": { "type": "number" }, "durationMs": { "type": "number" } } },
    "classification": { "enum": ["public", "internal", "confidential", "restricted"], "description": "bằng mức cao nhất của nhiệm vụ nguồn" },
    "promptVersion": { "type": "string", "description": "git hash của agents/<dept>/<id>.md + src/prompts.ts khi xảy ra" },
    "agentProposal": { "type": "string", "maxLength": 300, "description": "nếu source = agent.selfReport (từ mục '## Nhật ký sự cố', bản vá P4); chỉ là giả thuyết" }
  }
}
```

`evidence` bắt buộc ≥ 1 mục truy được (callId/seq/commit) — cùng nguyên tắc "không để trống bằng chứng" của `challenges.md`. Dữ liệu ở `symptom` là tóm tắt do CCoding sinh từ tín hiệu, không chép nguyên văn đầu ra agent (giảm nguy cơ lọt dữ liệu cá nhân).

### Bước 3 — Nguyên nhân gốc

Gom sự cố theo `(category, challengeId, agentId, phase)`. Chỉ xét một cụm khi **tái diễn**: đề xuất ≥ 3 sự cố độc lập trong ≥ 2 nhiệm vụ khác nhau (ngưỡng đề xuất, giám đốc chỉnh được; giá trị 3 và 2 là giả định chưa kiểm chứng). Một sự cố đơn lẻ chỉ vào hàng chờ, không sinh bản vá.

Phân loại nguyên nhân (chọn một, kèm bằng chứng): (i) *prompt thiếu/mơ hồ* (vd. C-29: prompt review không biết CCoding tự commit); (ii) *prompt mâu thuẫn hoặc quá dài* (C-05); (iii) *quyền công cụ không khớp* (C-04, C-27 — sửa ở `toolsFor`/roster, không phải prompt); (iv) *hạ tầng* (loại). Chỉ (i)–(ii) tới bước 4. Phân tích do `@methodologist`/`@peer-reviewer` hoặc người dùng thực hiện trên bản tổng hợp; agent chỉ cung cấp `agentProposal` làm *giả thuyết*, không là bằng chứng.

### Bước 4 — Bản vá prompt dạng diff

Mỗi bản vá là một tệp unified diff một-mục-tiêu trong `docs/research/self-improvement/prompt-patches/` (khi vận hành: `data/self-improve/proposals/<INC>/`), phần đầu ghi **mã C-xx/O-x, giả thuyết, chỉ số, cách đo, rủi ro**. Quy tắc: một bản vá = một giả thuyết = một chỉ số chính (để quy kết được); không vá đồng thời nhiều tệp trong một lần A/B; không đụng các quy tắc an toàn/dữ liệu của `systemFor`.

Bốn bản vá mẫu (đều nhắm `src/prompts.ts`, áp bằng `git apply --unidiff-zero --ignore-whitespace`; tệp làm việc là CRLF, index là LF):

| Tệp | Mục tiêu | Giả thuyết ngắn |
|---|---|---|
| `P1-output-cap.diff` | O5; C-02, C-13 | Giới hạn độ dài mục báo cáo → ít token đầu ra và ít đầu vào ở review/synthesize |
| `P2-stop-surveying.diff` | O3; C-20 | Dừng đọc sau ~8 lần chưa ghi → ít lượt công cụ, ít đọc trùng |
| `P3-review-diff-only.diff` | O4; C-27, C-28 | Reviewer chỉ đọc diff + tệp nêu tên → ít token review, recall không giảm |
| `P4-incident-log-on-revise.diff` | C-14 (FM-3) | Lượt sửa ghi ≤ 3 dòng nhật ký sự cố → có tín hiệu cho bước 2–3 |

Lưu ý quan trọng: P1–P3 là **giả thuyết tối ưu**, chưa có số đo; chưa nên kết luận hiệu quả trước khi qua cổng §5. P4 là bản vá thu thập dữ liệu. Chưa chạy `git apply --check --unidiff-zero --ignore-whitespace` (lệnh `git apply --check` trần luôn lỗi với các bản vá này; hook chỉ cho lệnh đọc) — người có quyền chạy lệnh cần kiểm (§8).

### Bước 5 — Cổng A/B: xem §5.

### Bước 6 — Giám đốc duyệt

CCoding tạo "phiếu đề xuất" gồm: tóm tắt sự cố (số lượng, bằng chứng), bản vá, kết quả A/B (kèm khoảng tin cậy và **cảnh báo n nhỏ**), rủi ro, kích thước thay đổi (ký tự system prompt thêm → ảnh hưởng cache tiền tố, O1). Giám đốc chọn: *Duyệt / Từ chối / Thử thêm*. Không có hạn tự duyệt (không "tự duyệt sau X giờ").

### Bước 7 — Áp dụng có phiên bản + rollback

- Phiên bản: mỗi lần áp dụng là **một commit riêng** chỉ chứa thay đổi prompt, thông điệp có mã `INC-…`/`C-xx`, gắn thẻ `prompts-vN`; `promptVersion` trong mọi sự cố sau đó ghi hash này.
- Rollback: `git revert <hash>` (không `reset --hard`/force). Tự động đề xuất rollback khi *giám sát sau áp dụng* thấy chỉ số an toàn xấu đi (ngưỡng §5.5) trong 3 nhiệm vụ đầu; việc rollback vẫn do giám đốc xác nhận.
- Ghi vào `LogStore` các sự kiện `selfimprove.proposed|ab.done|approved|rejected|applied|rolledback` (chuỗi băm, bất biến theo AGENTS.md; lưu ≥ 6 tháng như nhật ký xử lý dữ liệu cốt lõi).

## 4. Điểm móc trong mã (đề xuất; chưa viết)

| Điểm móc | Vị trí | Việc |
|---|---|---|
| Thu sự cố từ review | `src/orchestrator.ts` sau `parseReview`/`checkRegressions` (~1356–1366) | Phát `incident.*` cho mỗi issue blocker/major và hồi quy |
| Thu sự cố `review.unverified` | ~1385 (đã có `logs.write`) | Gắn thêm `incident` có `challengeId: C-27` |
| Parse mục "## Nhật ký sự cố" | sau `revisePrompt` trong vòng sửa (~1399–1410) | Regex trích tối đa 3 dòng → `agentProposal` (dùng chung kiểu `ISSUE_RE` của `src/kpi.ts:129`; hiện **chưa export**, cần export `ISSUE_RE` để dùng chung) |
| Tổng hợp theo cụm | module mới `src/selfimprove.ts` (đề xuất) — hàm `clusterIncidents`, `proposalTicket` | Đọc `LogStore`, không đọc tệp ngoài `data/` |
| Nguồn KPI | `src/kpi.ts` `computeKpi` → `findingKeys`, `recurred` | Dùng làm `source: kpi.finding` |
| Chèn bản vá thử | `src/prompts.ts` `systemFor` / `executePrompt`… | Chọn phiên bản bằng `TaskOptions.variant` sẵn có (`orchestrator.ts:3165`, qua `variantOptions`) thay vì tạo khóa cấu hình `selfImprove.variant` mới (A/B) — mặc định tắt |
| Chạy A/B | `src/bench.ts` `COMMON_KEYS` (`bench.ts:125`, 11 khóa, chưa có `variant`/`lane`) + `bench/vs-claude/harness/run.mjs` | Thêm `variant` vào `COMMON_KEYS`;  ghi `variant` vào `runs.csv` (cần kiểm cú pháp `ccoding bench`) |
| Kênh duyệt | `src/server.ts` (tuyến feedback ~437) + `public/` | Màn hình "Đề xuất cải thiện": Duyệt/Từ chối |
| Lưu phiên bản | `src/ship.ts`/`src/git.ts` | Commit riêng, thẻ `prompts-vN` |

Không điểm móc nào gọi LLM ngoài `Orchestrator.call()` (quy ước AGENTS.md). Bước 3 nếu dùng LLM để phân tích cụm cũng đi qua `Orchestrator.call()` và tính vào ngân sách.

## 5. Cổng A/B

### 5.1 Thiết kế

So sánh có cặp: cùng bài, cùng runtime/mô hình, nhánh **A = prompt hiện hành**, nhánh **B = A + một bản vá**. Công cụ: `bench/vs-claude` (5 bài, 461 test ẩn; đo thời gian, token, cache) và `ccoding bench` (`src/bench.ts`, phù hợp khi so các cấu hình `COMMON_KEYS`; cần kiểm cú pháp lệnh trước khi lập kịch bản).

### 5.2 Chỉ số

| Vai trò | Chỉ số | Nguồn dữ liệu |
|---|---|---|
| Chính (hiệu năng) | Tổng token quy đổi mỗi lượt chạy = đầu vào + đầu ra + cache ghi + 0,1 × cache đọc (`cachedInputWeight`) | `calls.csv`; bảng T-e của S2 (mã O-x tương ứng) |
| Chính (an toàn) | Số test ẩn đạt / 461 (và theo bài) | `runs.csv` |
| Phụ | Thời gian thực (wall-clock) cả lượt và theo pha; token đầu ra theo pha; số lượt vòng công cụ; cache ghi/đọc | `phases.csv`, `calls.csv`; bảng T-c của S2 |
| Phụ (chất lượng quy trình) | Tỉ lệ review duyệt ở vòng đầu (`firstPassOk`); số vòng sửa; `templateCoverage` | `src/kpi.ts` |
| Chỉ cho P3 | Recall/dương tính giả trên bài có lỗi gieo (§5.4) | bộ lỗi gieo |

Chỉ số chính có tính ba (token, test đạt, thời gian); hiệu chỉnh so sánh bội bằng Holm trên ba chỉ số này.

### 5.3 Số lượt tối thiểu, kiểm định, ngưỡng

Số lượt đề xuất là **kế hoạch, cần giám đốc/`@data-scientist` xác nhận**; chưa tính công suất vì chưa có ước lượng phương sai từ dữ liệu (C1–C5 chỉ n = 1–2 mỗi ô; xem S2). Đề xuất khởi điểm:

- **Pha thăm dò (sàng lọc)**: 5 bài × 3 lượt × 2 nhánh = 30 lượt. Chỉ để loại bản vá rõ ràng xấu hơn (dừng sớm), **không** để kết luận có hiệu quả.
- **Pha xác nhận**: 5 bài × 6 lượt × 2 nhánh = 60 lượt. Lượt tính là đơn vị lặp; bài là khối (block).
- **Kiểm định**: hiệu có cặp trong từng bài (log-tỉ số token B/A); hợp nhất qua bài bằng mô hình tuyến tính hỗn hợp (bài = hiệu ứng ngẫu nhiên) hoặc kiểm định hoán vị phân tầng theo bài; khoảng tin cậy 95 % bằng bootstrap phân tầng. Không dùng Wilcoxon signed-rank trên 5 cặp bài: với n = 5 giá trị p hai phía nhỏ nhất là 0,0625, không bao giờ đạt 0,05. Cần kiểm lại lựa chọn mô hình với `@data-scientist` (không bịa công thức công suất).
- **Ngưỡng chấp nhận (đề xuất, giám đốc chốt trước khi chạy — khai báo trước)**:
  1. *Không thua kém về an toàn*: cận dưới 95 % của hiệu tỉ lệ test đạt (B − A) ≥ −2 điểm phần trăm (biên −2 là giả định), và không có bài nào giảm ≥ 10 test đạt ở cả hai lượt.
  2. *Có lợi*: cận trên 95 % của log-tỉ số token B/A < log(0,95) với bản vá tối ưu (P1–P3); với P4 chỉ cần không xấu đi (cận trên < log(1,05)).
  3. Thời gian: không tăng quá 5 % (cận trên 95 %).
- Báo kích thước hiệu ứng (tỉ số trung vị + khoảng tin cậy), không chỉ p.

### 5.4 Bộ bài giữ lại (chống overfit)

`t1–t5` hiện là các bài công khai trong repo, và các sự cố/bản vá được rút ra từ chính các lượt chạy trên đó — nếu tối ưu và đánh giá cùng bộ thì *overfit* và rò rỉ. Quy tắc:

- **Bộ phát triển** = t1–t5 (có thể dùng để chẩn đoán và sàng lọc).
- **Bộ giữ lại (held-out)**: ≥ 3 bài mới (t6–t8), viết *sau khi chốt bản vá*, test ẩn không đưa vào repo agent truy cập được, chưa từng chạy với bất kỳ nhánh nào; chỉ dùng **một lần** cho quyết định cuối. Bộ đề xuất bổ sung: tập con SWE-bench (kế hoạch thuộc `dev-review.md`).
- **Bài có lỗi gieo (cho P3)**: một số bài có lỗi cài sẵn *ngoài* diff nhưng liên quan (vd. nơi gọi hàm đã đổi chữ ký), để đo recall review; thiết lập và gán nhãn do người thứ hai thực hiện, độc lập với người viết bản vá.
- Một bản vá thắng trên bộ phát triển nhưng không giữ được trên held-out thì **bị từ chối**.

### 5.5 Giám sát sau áp dụng và ngưỡng dừng

3 nhiệm vụ thật đầu sau áp dụng theo dõi: tỉ lệ test/lệnh kiểm tra đạt, `firstPassOk`, số vòng sửa. Có hồi quy so với 5 nhiệm vụ gần nhất trước áp dụng → phiếu đề nghị rollback.

## 6. Chính sách an toàn

1. **Không tự áp dụng** bất kỳ thay đổi prompt/`agents/*.md` nào khi chưa có xác nhận của giám đốc; mặc định tính năng *tắt* (`selfImprove.enabled: false`).
2. Agent không được ghi vào `agents/`, `src/` hay cấu hình; chỉ phát *đề xuất* dạng văn bản qua kênh log. `agentProposal` coi là dữ liệu không đáng tin (có thể chứa nội dung tiêm lệnh): không thực thi, không đưa lại vào prompt trước khi giám đốc duyệt.
3. Bản vá không được: gỡ/nới quy tắc dữ liệu hay an toàn (`CLASSIFICATION_RULE`, mục "Quy tắc chung"), tăng quyền công cụ, đổi chính sách `claude-guard`. Kiểm bằng danh sách cấm trong bước tạo phiếu (diff chạm các chuỗi này ⇒ loại tự động).
4. **Dữ liệu**: nhật ký chỉ ghi qua `LogStore`; mức phân loại của sự cố = mức cao nhất của nhiệm vụ; không dùng dữ liệu thật trên DEV/UAT; sự cố từ nhiệm vụ `confidential/restricted` không dùng làm bộ A/B chung. Lưu ≥ 6 tháng, bất biến (chuỗi băm). Cần cập nhật `docs/data-protection-assessment.md` khi hiện thực hóa (theo AGENTS.md); bản thiết kế này chưa thay đổi dữ liệu nên chưa chạy lại đánh giá 25 năng lực.
5. **Ngân sách**: A/B có trần token riêng và không chạy khi runtime báo gần hạn mức (C-36, C-49). Mỗi lượt A/B gọi qua `Orchestrator.call()`.
6. **Chống tự củng cố**: reviewer không đánh giá bản vá của chính mình; người viết bản vá, người chạy A/B và người gán nhãn lỗi gieo nên khác nhau.

## 7. Đe dọa tính hiệu lực

| Loại | Đe dọa | Biện pháp / thừa nhận |
|---|---|---|
| Kết luận thống kê | **n nhỏ**: dữ liệu hiện có chỉ 1–2 lượt mỗi ô (C5 n = 2), phương sai lớn → CI rộng, dễ dương/âm tính giả | Khai báo trước ngưỡng; pha thăm dò chỉ để loại; báo CI và nói rõ "minh họa" khi n < 6; Holm; không kết luận từ một bài |
| Ngoại tại | **Bài nhỏ dưới 15 phút** (t1–t5): ưu thế/thiệt của điều phối và cache có thể khác với việc dài, nhiều tệp, nhiều vòng sửa | Thêm ≥ 1 bài > 15 phút và tập con SWE-bench trong kế hoạch bổ sung; không suy rộng cho nhiệm vụ lớn |
| Ngoại tại | **Một runtime** (claude-cli/Claude Code; hook `claude-guard` và cache TTL riêng): kết quả P2 phụ thuộc hook đếm đọc; cache khác ở runtime khác (C-40, C-41) | Ghi rõ runtime; thử tối thiểu một runtime khác (API kiểu anthropic) trước khi khái quát |
| Nội tại | **Thứ tự chạy**: chạy A trước B thì ảnh hưởng của cache nóng, hạn mức 5 giờ, tải máy (Windows chậm 2–3×, C-49) | Xen kẽ ngẫu nhiên có khối theo bài (A/B/B/A…), chạy tuần tự từng hệ (tránh tranh agent, C-23), ghi giờ bắt đầu và nạp lại cache TTL như một biến |
| Nội tại | **Hạn mức/ngân sách**: lượt hỏng do 429 bị xóa → thiên lệch sống sót nếu hỏng không ngẫu nhiên | Báo số lượt xóa mỗi nhánh; xóa theo quy tắc chung, không theo kết quả |
| Nội tại | Phi tất định của LLM (cùng prompt, kết quả khác nhau); mô hình/phiên bản CLI thay đổi giữa các ngày | Ghim mô hình/phiên bản; chạy A và B xen kẽ trong cùng cửa sổ thời gian |
| Cấu trúc | Chỉ số token quy đổi (0,1 × cache đọc) là giả định về giá; thời gian wall-clock phụ thuộc máy | Báo cả token thô theo từng loại; tham chiếu T-c/T-e của S2 |
| Cấu trúc | Test ẩn chỉ đo đúng-chức năng, không đo chất lượng đọc code hay lỗi ngoài test | Bổ sung firstPassOk, recall lỗi gieo; thừa nhận giới hạn |
| Kết luận | **Overfit** vào t1–t5 vì sự cố sinh từ chính các bài này | Bộ giữ lại §5.4 dùng một lần |
| Kết luận | Gán nhóm FM-1/2/3 là phán đoán của một người (P-14 trong `challenges.md`) | Người thứ hai gán độc lập một mẫu; báo độ nhất quán (cần kiểm) |
| Kết luận | Phân tích nguyên nhân gốc có thể sai; `agentProposal` có thể bịa | Chỉ là giả thuyết; thử A/B mới là bằng chứng |

## 8. Việc cần người có quyền chạy lệnh (chưa thực hiện)

1. `git apply --unidiff-zero --ignore-whitespace --check docs/research/self-improvement/prompt-patches/P1-output-cap.diff` (lặp cho P2–P4) — kỳ vọng exit 0.
2. `npm run typecheck` và `npm test` sau khi áp dụng *thử* trên nhánh nháp (test prompt có thể so chuỗi — cần kiểm `test/*.test.ts`).
3. Không chạy benchmark ở hạng mục này; lịch chạy A/B thuộc kế hoạch bổ sung của `dev-review.md`.

## 9. Ghi chú trung thực

- Đã có số đo C6 và `docs/research/performance/token-analysis.md` (S2), nhưng các số của thiết kế này (ngưỡng cụm sự cố, mốc cổng §5) không rút ra từ chúng: mọi ngưỡng ở trên là đề xuất, không rút ra từ dữ liệu.
- Ràng buộc từ `dev-review/technical-check.md` §4: với runtime `claude-cli`, `tools.capHits` và `truncated` theo diag luôn bằng 0 (chỉ runtime API sinh sự cố "chạm trần"), nên không dùng làm tín hiệu sự cố cho benchtest; sự cố nên thu chủ yếu từ review, hồi quy và chặn của hook (hook chặn hiện chưa được log riêng thành sự kiện — điểm móc nên thêm).
- Hiệu quả của P1–P4 hoàn toàn là giả thuyết. Không có khẳng định nào trong tệp này về mức tiết kiệm.
- Chưa đối chiếu công trình đã công bố về tự cải thiện prompt/agent; phần so sánh thuộc nhóm B của S5 (tổng quan). Không dùng nguồn nào trong tệp này.
