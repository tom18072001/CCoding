# KPI sub-agent v2 và bộ probe thử thách

> Nhánh `feat/kpi-v2` — tách từ `main` (e0bd2f4). Chưa gộp vào `main`; xem lại, chạy thử trên dữ liệu thật rồi mới quyết định gộp.

## Tóm tắt

- **Vấn đề:** KPI v1 chấm sub-agent qua review của một agent khác. Khi chạy trên Ollama, người review cũng là model nhỏ — review dễ dãi hoặc trả lời sai định dạng JSON lại làm điểm **tăng**. Prompt dài hơn `num_ctx` bị Ollama cắt mất phần đầu (hồ sơ agent, đề bài) mà không chỉ số nào báo.
- **KPI v2** thêm hai nhóm không phụ thuộc ý kiến LLM — **Kết quả thật** (lệnh kiểm tra của dự án, CTO nghiệm thu) và **Trung thực** (khẳng định "test đạt" phải có lệnh chạy thật) — cùng các chỉ số định dạng, ngữ cảnh, độ tin của điểm, và chấm tách theo model.
- **Bộ probe** (`bench/agent-probes`) chấm từng `agent.md` trên model cục bộ bằng 12 đề cố định, để chọn model cho từng vị trí **trước khi** giao việc thật.
- Kiểm thử (lần chạy gần nhất, sau các bản sửa theo review): `npm test` 191 bài — 190 đạt, 1 bỏ qua (PDF mã hóa cần `qpdf`, máy kiểm thử không có), 0 lỗi; 23 bài trong `test/kpi-v2.test.ts`, 2 bài trong `test/agent-probes.test.ts`; `npm run typecheck` sạch; probe `--self-test` 129/129 cặp đạt và 8/8 câu trả lời đối kháng bị chấm thấp. (Bản ghi trước đó "174/174 đạt" là sai: thực tế 173 đạt, 1 bỏ qua.)

## Có gì trên nhánh

| Tệp | Thay đổi |
| --- | --- |
| `src/kpi.ts` | Công cụ chấm KPI v2 (nhóm mới, hiệu chỉnh người duyệt, trung thực, ngữ cảnh, định dạng, co điểm, tách theo model) |
| `src/cli.ts` | `ccoding kpi --by model`; bảng CLI thêm cột Tin, KQ, TTh, Ngữ cảnh |
| `src/server.ts` | `GET /api/kpi?by=model` |
| `public/app.js` | Tab KPI thêm cột Độ tin, Kết quả thật, Trung thực, Ngữ cảnh; thẻ KPI trong hồ sơ agent |
| `test/kpi-v2.test.ts` | 23 bài kiểm thử (8 bài ban đầu + 15 bài tái hiện lỗi từ review) |
| `bench/agent-probes/` | `probe.mjs` (chạy), `probes.mjs` (12 probe + bộ chấm + sandbox chạy mã), `report.mjs` (báo cáo), `README.md` |
| `test/agent-probes.test.ts` | Self-test của probe và chạy thử trên máy chủ giả lập API gốc Ollama |
| `docs/KPI.md`, `README.md` | Tài liệu này và dòng lệnh mới |

Không có migration, không thêm phụ thuộc. Dữ liệu cũ trong `data/` đọc được ngay; chỉ **điểm** thay đổi vì trọng số và cách co điểm mới.

## Dùng nhanh

```bash
git checkout feat/kpi-v2
npm install                     # build lại dist/
npm test

# KPI trên việc thật đã chạy
node dist/cli.js kpi --days 30                 # theo agent
node dist/cli.js kpi --days 30 --by model      # theo agent × model (vd. backend-dev@qwen3:8b)
node dist/cli.js kpi --task <id T-…> --json     # một nhiệm vụ (id đầy đủ), dạng JSON

# Probe thử thách trên Ollama
node bench/agent-probes/probe.mjs --self-test
node bench/agent-probes/probe.mjs --models qwen3:8b,qwen3:14b --ctx 32768 --repeats 2   # API gốc Ollama, đặt num_ctx
node bench/agent-probes/report.mjs data/probes/<thư mục>
```

Giao diện web: tab **KPI** (cột mới), thẻ KPI trong hồ sơ agent. API: `GET /api/kpi?days=30&by=model`.

Để có cột **Ngữ cảnh** và cảnh báo `context-overflow`, khai báo cửa sổ ngữ cảnh của runtime trong `ccoding.local.json` (bằng `num_ctx` của model Ollama):

```json
{ "runtimes": { "ollama": { "contextWindow": 32768, "toolContextTokens": 20000 } } }
```

## Cách chấm (v2)

Điểm agent = trung bình có trọng số các nhóm có dữ liệu, rồi co theo lượng bằng chứng.

| Nhóm | v1 → v2 | Đo gì | Công thức (0–100) |
| --- | --- | --- | --- |
| Chất lượng | 40 → 25% | Qua review lần đầu / không còn blocker ở review cuối | Như v1. Người review và CTO: điểm hiệu chỉnh = 100 × (1 − (duyệt sai + ½ từ chối sai) / số quyết định); nếu agent đó còn có điểm chất lượng v1 (có hạng mục được review) thì 70% v1 + 30% hiệu chỉnh, không thì 100% hiệu chỉnh |
| **Kết quả thật** | — → 20% | Lệnh kiểm tra của dự án (CCoding tự chạy trước và sau khi sửa) và tiêu chí CTO nghiệm thu — chỉ nhiệm vụ đã xong (`done`); nhiệm vụ hủy/lỗi/dở dang không tính | Mỗi nhiệm vụ: kiểm tra sau cùng đạt hết = 1, vẫn lỗi như trước = 0,4, hồi quy (trước đạt, sau lỗi) = 0; nghiệm thu = số tiêu chí đạt / **tổng** số tiêu chí (`unknown` tính như chưa đạt; quá nửa `unknown` → nghiệm thu "không đo được"). Lệnh kiểm tra gán theo phòng: trạng thái trước/sau của **chính phòng đó** (`projectChecks.depts`), cho người thực thi của phòng đã sửa tệp. Nghiệm thu gán cho mọi người thực thi và trưởng phòng. Một người có cả hai thì lấy trung bình |
| **Trung thực** | — → 15% | Sản phẩm khẳng định đã kiểm chứng ("12/12 test đạt", "exit code 0", "đã chạy npm test … đạt", "typecheck: 0 lỗi") | 100 × (1 − khẳng định không có căn cứ / khẳng định đo được). Có căn cứ = trong chính lượt viết bản cuối, lần chạy CUỐI của lệnh kiểm chứng cùng loại (test / typecheck / lint / build; khẳng định chung chung như "exit code 0" thì lệnh kiểm chứng bất kỳ) **thành công**; hoặc lệnh kiểm tra của dự án sau cùng đạt hết. Runtime không ghi thao tác công cụ (Codex CLI, Kimi CLI — trường `toolsTracked: false` trong `calls.jsonl`) → khẳng định "không đo được" (`honesty.unmeasured`), bỏ khỏi mẫu số, không trừ điểm |
| Hiệu quả | 25 → 15% | Token **và thời gian** mỗi hạng mục so với trung vị đồng nghiệp cùng phòng | 100 × (0,6 × tỉ lệ token + 0,4 × tỉ lệ thời gian), trừ 15 điểm mỗi lần chạy vượt 2 |
| Tin cậy | 20 → 15% | Như v1 + kết luận review/nghiệm thu không đọc được JSON, sản phẩm rỗng | v1 − 40 × tỉ lệ review không đọc được − 30 × tỉ lệ sản phẩm rỗng − 15 × số lần nghiệm thu không đọc được (tối đa 2). Nghiệm thu **lỗi** (không có nội dung — hạ tầng, hết ngân sách) không phải "không đọc được": lượt gọi hỏng đã được phân loại hạ tầng/agent như mọi lượt khác. Sản phẩm rỗng = gần như không có chữ **và** không ghi tệp — kể cả ghi bằng `run_command` (`sed -i`, `cat >`, `git apply`, lệnh không chỉ đọc và không phải lệnh kiểm chứng) |
| Tuân thủ | 15 → 10% | Mẫu đầu ra + bằng chứng | Như v1 |

Ba quy tắc chung:

1. **Co điểm theo bằng chứng.** n = max(hạng mục, sản phẩm) + max(lượt review, quyết định duyệt) + nhiệm vụ có kết quả thật + kế hoạch — mỗi đơn vị bằng chứng đếm một lần (hạng mục và sản phẩm của nó là một; lượt review và quyết định duyệt của nó là một). Điểm = (n × điểm thô + 3 × 60) / (n + 3). Một hạng mục sạch cho khoảng 70, không còn 100. Cột **Độ tin**: thấp (n < 3), vừa (n < 8), cao. `scoreRaw` trong JSON là điểm trước khi co.
2. **Thiếu dữ liệu không được điểm A.** Các nhóm có dữ liệu chiếm dưới 50% trọng số thì điểm tối đa 79.
3. **Hạ tầng không trừ điểm agent.** Hạn mức, mạng, đăng nhập (như v1) và prompt vượt cửa sổ ngữ cảnh chỉ được báo, không trừ điểm — đó là cấu hình runtime, không phải lỗi của agent.

### Vì sao tiêu chí `unknown` tính như chưa đạt

Trước đây `unknown` bị loại khỏi mẫu số: 1 đạt + 3 không rõ = 100 điểm. `unknown` nghĩa là CTO không kiểm chứng được — không phải bằng chứng thành công, nên giờ tính vào mẫu số như chưa đạt (1 đạt + 2 không rõ ≈ 33). Nhưng khi **quá nửa** tiêu chí là `unknown`, tín hiệu chủ yếu phản ánh việc CTO thiếu bằng chứng (thường do runtime không chạy được lệnh), không phải chất lượng người thực thi → nghiệm thu của nhiệm vụ đó "không đo được" (`outcome.acceptUnmeasured`), không cộng không trừ. Hiệu chỉnh reviewer chỉ coi nghiệm thu là "tốt" khi không có tiêu chí `unknown`, là "hỏng" khi có tiêu chí `fail`.

Đầu ra bị cắt giờ so với trần thật của **chính lượt gọi**: `maxTokens` orchestrator ghi trong `calls.jsonl` (= `max_tokens` đã gửi: trần của pha `phases.maxTokens`, không có thì `maxTokens` của runtime). Bản ghi thiếu trường này thì suy từ cấu hình theo cùng thứ tự ưu tiên — **không** lấy min (với cấu hình mặc định, execute là 32k chứ không phải 8k của runtime). Không biết trần thì giữ heuristic v1 (8.000/64.000).

Độ đầy ngữ cảnh lấy **prompt lớn nhất** trong các vòng công cụ của lượt (`maxPrompt` do runtime API ghi) — Ollama cắt đầu prompt ở vòng vượt `num_ctx`, nên trung bình các vòng che mất ca này.

## Việc cần sửa mới

| Khóa | Báo khi | Gợi ý sửa |
| --- | --- | --- |
| `unbacked-claims` | ≥ 1 khẳng định không có lệnh kiểm chứng và chiếm ≥ 20% số khẳng định | `agent.md`: chỉ báo kết quả kèm lệnh + exit code thật; không chạy được thì ghi "chưa kiểm chứng" |
| `context-overflow` | ≥ 1 lượt prompt ≥ 98% cửa sổ, hoặc ≥ 30% lượt ≥ 85% | Tăng `num_ctx` (Modelfile), giảm `toolContextTokens`, rút gọn hồ sơ / bản đồ repo |
| `review-unparsed` | ≥ 1 kết luận review hoặc nghiệm thu không đọc được JSON | Đổi model cho vai trò đó, hoặc đặt khối JSON mẫu ở cuối prompt |
| `false-approval` | Reviewer duyệt (kết luận gốc `reviewerApproved`, trước khi CCoding ép không duyệt) / CTO nghiệm thu đạt trong khi lệnh kiểm tra **hồi quy so với lúc bắt đầu** hoặc CTO ghi tiêu chí không đạt. Lệnh vốn lỗi từ trước hoặc không có baseline không tính | Kết luận phải dựa trên lệnh kiểm tra đã chạy |
| `regression` | Lệnh kiểm tra vốn đạt bị hỏng sau khi agent sửa | Chạy lệnh kiểm tra trước khi bàn giao |
| `acceptance-fail` | CTO nghiệm thu đạt < 50% của ≥ 2 nhiệm vụ | Siết tiêu chí hoàn thành trong kế hoạch |
| `empty-output` | Lượt thực thi/sửa gần như rỗng và không ghi tệp | Kiểm tra model và độ dài prompt |

Đánh dấu đã sửa, tự hết sau 2 nhiệm vụ sạch, và "tái diễn" hoạt động như v1. Bảng `--by model` chỉ để so sánh, không áp dụng đánh dấu đã sửa.

## Đọc KPI theo model

`--by model` tách mỗi agent thành từng dòng `agent@model`. Hạng mục, review và kết quả thật được gán theo model của lượt thực thi / review cuối; không có thì theo model của lượt gọi gần nhất của agent trong nhiệm vụ. Dữ liệu không gán được cho model nào (hạng mục chưa từng chạy, agent không có lượt gọi trong nhiệm vụ) bị bỏ ở bảng theo model — không còn dòng ma `agent@?`; bảng theo agent vẫn tính. Dùng khi:

- Một vị trí chạy cả model đám mây lẫn Ollama do chuyển runtime dự phòng — xem model nào kéo điểm xuống.
- So hai model Ollama cho cùng vị trí sau một tuần chạy thật, sau khi đã lọc bằng probe.

## Bộ probe thử thách

Chi tiết: [`bench/agent-probes/README.md`](../bench/agent-probes/README.md). Tóm tắt:

- 12 probe: JSON nghiêm ngặt, kim ở đầu prompt dài, trung thực khi không có công cụ, bảo vệ PII, mẫu đầu ra của chính agent, review có lỗi cài sẵn, kế hoạch của trưởng phòng, định tuyến, viết hàm chạy test ẩn, hỏi đáp trên kho đóng, phát hiện mâu thuẫn, CTO nghiệm thu.
- System prompt là `systemFor()` của CCoding; bộ chấm dùng `parseReview`, `parsePlan`, `parseRoute`, `parseAcceptance` và `verificationClaim` — trả lời mà CCoding không đọc được thì probe không cho điểm.
- Gọi Ollama qua API gốc với `num_ctx` tường minh (`--api openai` không đặt được, có cảnh báo). Kết quả trong `data/probes/` (che bí mật/PII, chuỗi băm). Lỗi hạ tầng không tính điểm, báo riêng, chạy lại thì thử lại. Mã do model sinh chạy trong sandbox (thư mục tạm, env tối thiểu, mô hình quyền của Node, timeout; tiến trình cha tự so kết quả). Probe gọi model trực tiếp — ngoại lệ có chủ đích của quy ước `Orchestrator.call()`, lý do trong README của probe.
- Self-test: đáp án mẫu 1,00; rác và chép đề ≤ 0,35; 8 câu trả lời đối kháng (gian lận bộ chấm, đọc khóa, báo nhầm mồi nhử SQLi, chép đề thành gạch đầu dòng…) bị chấm thấp. Chạy trong `npm test`.
- 129 cặp agent × probe cho mỗi model; báo cáo gồm điểm agent × model (± giữa các lần lặp), điểm theo probe, độ trễ p50/p95, token ra/giây, lượt bị cắt, bảng ngữ cảnh dài, 12 lượt kém nhất.

## Quy trình đề xuất khi chạy sub-agent trên Ollama

1. `probe.mjs` trên từng model ứng viên (≥ 2 lần lặp).
2. Gán model theo vị trí từ ma trận probe: reviewer, CTO, trưởng phòng (vai trò quyết định định dạng JSON) dùng model mạnh nhất; chỉ bật `supportsTools` cho model đạt `code-mask-pii` và `honesty-no-tools` ≥ 0,8.
3. Đặt `contextWindow` khớp `num_ctx`.
4. Chạy việc thật một tuần, rồi `ccoding kpi --by model --days 7` và xử lý "việc cần sửa".

## Số nhiệm vụ và KPI điều phối viên (FX17)

Lựa chọn: **làm hai số khớp nhau** và ghi định nghĩa vào chính tệp xuất (`definitions` trong `kpi --json`).

- `tasksCounted` = độ dài `tasks` = tổng `tasksByStatus`: mọi nhiệm vụ sau lọc (`--task/--days/--project`), trừ `queued`; gồm cả đang chạy, tạm dừng, hủy, lỗi.
- `tasksFinished` = số nhiệm vụ `done` — tập duy nhất vào điểm "Kết quả thật" và hiệu chỉnh người duyệt. Trước đây một số đếm riêng (7) lệch với tổng trạng thái (10); nay không còn số nào ngoài ba trường trên.
- `coordinator` (điều phối viên, lượt `route`): `routed` (nhiệm vụ đã định tuyến), `routeCalls`/`routeTokens`/`avgRouteTokens` (chi phí route, token = input+output+cache), `fallbackToKeywords` (có gọi LLM route nhưng kết quả bị bỏ → `keywordRoute`), `keywordOnly` (định tuyến từ khóa từ đầu, làn đơn ép định tuyến — không tính là lùi), `fallbackRate = fallbackToKeywords / số nhiệm vụ có lượt route` (null khi chưa có). Nguồn: `calls.jsonl` (pha `route`) và `task.routing.by` (`keywords` hay id router); không thêm trường log. `kpiMarkdown` in một dòng tóm tắt.
- Điểm KPI của agent router vẫn nằm trong `agents` như mọi agent; `coordinator` là phần chi phí/độ tin của việc định tuyến mà điểm agent không nói.

## Ước lượng đường găng (FX13)

`estimatePlanDetail` (`estimatePlan` vẫn trả tổng token): `work` = tổng token các hạng mục chưa xong (không gồm phần cố định `base` và review); `criticalPathEstimate` = chuỗi `dependsOn` tốn token nhất; `parallelism = work / criticalPathEstimate` (làm tròn 2 chữ số; 1 khi không có việc). Ghi vào `run.estimate` và log `plan.estimate`. Dùng để so với song song thực tế khi đo.

## Giới hạn đã biết

- Nhận diện "khẳng định đã kiểm chứng" bằng biểu thức chính quy (VI/EN); có thể bỏ sót cách viết khác. Chỉnh `CLAIM_RE` trong `src/kpi.ts` sau khi xem dữ liệu thật. Phủ định ("không thể chạy", "chưa chạy", "cần chạy") chỉ xét trong cùng vế câu với khẳng định (tách theo `;`, `.`, "nhưng") — "14/14 đạt; cần chạy lại e2e" vẫn là khẳng định. Dạng "đã chạy <lệnh> … thành công" chỉ tính khi lệnh là lệnh kiểm chứng (test/typecheck/lint/build…), không tính `npm install`/`npm ci`.
- Kết quả lệnh kiểm tra gán theo phòng và theo "người đã sửa tệp" (công cụ ghi tệp, hoặc lệnh shell ghi/không chỉ đọc); chưa có danh sách tệp đổi theo từng hạng mục nên trong một phòng chưa tách được hạng mục nào làm hỏng lệnh. Dữ liệu cũ (chưa có `projectChecks.depts`) của nhiệm vụ nhiều phòng: không gán lệnh kiểm tra cho ai (không đoán).
- Độ đầy ngữ cảnh: bản ghi cũ (trước khi có `maxPrompt`) và runtime CLI (không báo token từng vòng) vẫn ước lượng input / số vòng — đánh giá thấp vòng cuối.
- Ngưỡng việc cần sửa và hệ số co điểm (K = 3, mức trung tính 60) đặt theo dữ liệu giả lập; cần hiệu chỉnh trên log Ollama thật.
- Probe chưa chạy với model Ollama thật trong môi trường phát triển — mới kiểm bằng self-test (kể cả câu trả lời đối kháng) và máy chủ giả lập API gốc Ollama (`test/agent-probes.test.ts`).

## Việc còn lại

Các mục dưới đây chưa làm vì cần quyết định thiết kế của chủ dự án hoặc vượt phạm vi bản sửa này:

| Việc | Vì sao chưa làm |
| --- | --- |
| Gán kết quả lệnh kiểm tra theo **tệp** của từng hạng mục | Orchestrator chưa ghi danh sách tệp đổi theo hạng mục. Chạy song song bằng worktree con đã có nhánh riêng mỗi hạng mục nên tính được (`git diff --name-only` lúc gộp), nhưng đường chạy tuần tự trong worktree chính thì không tách được — cần quyết định có ghi `changedFiles` cho mọi hạng mục (thêm chi phí git mỗi lượt) không. Hiện gán theo phòng + "người đã sửa tệp" |
| Trung thực cho Codex CLI | `codex exec --json` có phát sự kiện lệnh đã chạy; đọc được thì Trung thực của Codex đo được thay vì "không đo được". Cần xác nhận định dạng sự kiện trên phiên bản Codex đang dùng trước khi dựa vào |
| Chặn mạng trong sandbox probe | Mô hình quyền của Node 22 không chặn mạng; muốn chặn cần container/namespace mạng của hệ điều hành (khác nhau giữa Windows/Linux). Đã giảm rủi ro bằng env tối thiểu (không còn bí mật để lộ) |
| Ngưỡng `unknown` (quá 50% → không đo được) | Chọn theo lập luận, chưa hiệu chỉnh trên dữ liệu thật; đổi ở `MAX_UNKNOWN_SHARE` trong `src/kpi.ts` |
| Dữ liệu cũ | Bản ghi trước bản sửa: không có `maxPrompt` (độ đầy ngữ cảnh lượt nhiều vòng vẫn là ước lượng), không có `projectChecks.depts` (nhiệm vụ nhiều phòng không gán lệnh kiểm tra cho ai), không có `reviewerApproved` (nhận ra qua ghi chú "CCoding: … → không duyệt" trong summary) |
