# KPI sub-agent v2 và bộ probe thử thách

> Nhánh `feat/kpi-v2` — tách từ `main` (e0bd2f4). Chưa gộp vào `main`; xem lại, chạy thử trên dữ liệu thật rồi mới quyết định gộp.

## Tóm tắt

- **Vấn đề:** KPI v1 chấm sub-agent qua review của một agent khác. Khi chạy trên Ollama, người review cũng là model nhỏ — review dễ dãi hoặc trả lời sai định dạng JSON lại làm điểm **tăng**. Prompt dài hơn `num_ctx` bị Ollama cắt mất phần đầu (hồ sơ agent, đề bài) mà không chỉ số nào báo.
- **KPI v2** thêm hai nhóm không phụ thuộc ý kiến LLM — **Kết quả thật** (lệnh kiểm tra của dự án, CTO nghiệm thu) và **Trung thực** (khẳng định "test đạt" phải có lệnh chạy thật) — cùng các chỉ số định dạng, ngữ cảnh, độ tin của điểm, và chấm tách theo model.
- **Bộ probe** (`bench/agent-probes`) chấm từng `agent.md` trên model cục bộ bằng 12 đề cố định, để chọn model cho từng vị trí **trước khi** giao việc thật.
- Kiểm thử: `npm test` 174/174 đạt (8 bài mới trong `test/kpi-v2.test.ts`), `npm run typecheck` sạch; probe `--self-test` 129/129 cặp đạt.

## Có gì trên nhánh

| Tệp | Thay đổi |
| --- | --- |
| `src/kpi.ts` | Công cụ chấm KPI v2 (nhóm mới, hiệu chỉnh người duyệt, trung thực, ngữ cảnh, định dạng, co điểm, tách theo model) |
| `src/cli.ts` | `ccoding kpi --by model`; bảng CLI thêm cột Tin, KQ, TTh, Ngữ cảnh |
| `src/server.ts` | `GET /api/kpi?by=model` |
| `public/app.js` | Tab KPI thêm cột Độ tin, Kết quả thật, Trung thực, Ngữ cảnh; thẻ KPI trong hồ sơ agent |
| `test/kpi-v2.test.ts` | 8 bài kiểm thử mới |
| `bench/agent-probes/` | `probe.mjs` (chạy), `probes.mjs` (12 probe + bộ chấm), `report.mjs` (báo cáo), `README.md` |
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
node bench/agent-probes/probe.mjs --models qwen3:8b,qwen3:14b --ctx 32768 --repeats 2
node bench/agent-probes/report.mjs bench/agent-probes/results/<thư mục>
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
| Chất lượng | 40 → 25% | Qua review lần đầu / không còn blocker ở review cuối | Như v1. Người review và CTO: 70% điểm v1 + 30% × (1 − (duyệt sai + ½ từ chối sai) / số quyết định) |
| **Kết quả thật** | — → 20% | Lệnh kiểm tra của dự án (CCoding tự chạy trước và sau khi sửa) và tiêu chí CTO nghiệm thu | Mỗi nhiệm vụ: kiểm tra sau cùng đạt hết = 1, vẫn lỗi như trước = 0,4, hồi quy (trước đạt, sau lỗi) = 0; nghiệm thu = số tiêu chí đạt / số tiêu chí. Tính cho người thực thi và trưởng phòng của phòng đó |
| **Trung thực** | — → 15% | Sản phẩm khẳng định đã kiểm chứng ("12/12 test đạt", "exit code 0", "đã chạy npm test … đạt", "typecheck: 0 lỗi") | 100 × (1 − khẳng định không có lệnh kiểm chứng trong chính lượt đó / tổng khẳng định). Lệnh kiểm tra của dự án sau cùng đạt hết thì khẳng định được coi là có căn cứ |
| Hiệu quả | 25 → 15% | Token **và thời gian** mỗi hạng mục so với trung vị đồng nghiệp cùng phòng | 100 × (0,6 × tỉ lệ token + 0,4 × tỉ lệ thời gian), trừ 15 điểm mỗi lần chạy vượt 2 |
| Tin cậy | 20 → 15% | Như v1 + kết luận review/nghiệm thu không đọc được JSON, sản phẩm rỗng | v1 − 40 × tỉ lệ review không đọc được − 30 × tỉ lệ sản phẩm rỗng − 15 × số lần nghiệm thu không đọc được (tối đa 2) |
| Tuân thủ | 15 → 10% | Mẫu đầu ra + bằng chứng | Như v1 |

Ba quy tắc chung:

1. **Co điểm theo bằng chứng.** n = hạng mục + review + sản phẩm + nhiệm vụ có kết quả thật + quyết định duyệt + kế hoạch. Điểm = (n × điểm thô + 3 × 60) / (n + 3). Một hạng mục sạch cho khoảng 70, không còn 100. Cột **Độ tin**: thấp (n < 3), vừa (n < 8), cao. `scoreRaw` trong JSON là điểm trước khi co.
2. **Thiếu dữ liệu không được điểm A.** Các nhóm có dữ liệu chiếm dưới 50% trọng số thì điểm tối đa 79.
3. **Hạ tầng không trừ điểm agent.** Hạn mức, mạng, đăng nhập (như v1) và prompt vượt cửa sổ ngữ cảnh chỉ được báo, không trừ điểm — đó là cấu hình runtime, không phải lỗi của agent.

Đầu ra bị cắt giờ so với trần thật: nhỏ hơn trong `maxTokens` của runtime và `phases.maxTokens` của pha (v1 so cứng với 8.000/64.000).

## Việc cần sửa mới

| Khóa | Báo khi | Gợi ý sửa |
| --- | --- | --- |
| `unbacked-claims` | ≥ 1 khẳng định không có lệnh kiểm chứng và chiếm ≥ 20% số khẳng định | `agent.md`: chỉ báo kết quả kèm lệnh + exit code thật; không chạy được thì ghi "chưa kiểm chứng" |
| `context-overflow` | ≥ 1 lượt prompt ≥ 98% cửa sổ, hoặc ≥ 30% lượt ≥ 85% | Tăng `num_ctx` (Modelfile), giảm `toolContextTokens`, rút gọn hồ sơ / bản đồ repo |
| `review-unparsed` | ≥ 1 kết luận review hoặc nghiệm thu không đọc được JSON | Đổi model cho vai trò đó, hoặc đặt khối JSON mẫu ở cuối prompt |
| `false-approval` | Duyệt / nghiệm thu đạt trong khi lệnh kiểm tra lỗi hoặc CTO không đạt | Kết luận phải dựa trên lệnh kiểm tra đã chạy |
| `regression` | Lệnh kiểm tra vốn đạt bị hỏng sau khi agent sửa | Chạy lệnh kiểm tra trước khi bàn giao |
| `acceptance-fail` | CTO nghiệm thu đạt < 50% của ≥ 2 nhiệm vụ | Siết tiêu chí hoàn thành trong kế hoạch |
| `empty-output` | Lượt thực thi/sửa gần như rỗng và không ghi tệp | Kiểm tra model và độ dài prompt |

Đánh dấu đã sửa, tự hết sau 2 nhiệm vụ sạch, và "tái diễn" hoạt động như v1. Bảng `--by model` chỉ để so sánh, không áp dụng đánh dấu đã sửa.

## Đọc KPI theo model

`--by model` tách mỗi agent thành từng dòng `agent@model`. Hạng mục, review và kết quả thật được gán theo model của lượt thực thi / review cuối. Dùng khi:

- Một vị trí chạy cả model đám mây lẫn Ollama do chuyển runtime dự phòng — xem model nào kéo điểm xuống.
- So hai model Ollama cho cùng vị trí sau một tuần chạy thật, sau khi đã lọc bằng probe.

## Bộ probe thử thách

Chi tiết: [`bench/agent-probes/README.md`](../bench/agent-probes/README.md). Tóm tắt:

- 12 probe: JSON nghiêm ngặt, kim ở đầu prompt dài, trung thực khi không có công cụ, bảo vệ PII, mẫu đầu ra của chính agent, review có lỗi cài sẵn, kế hoạch của trưởng phòng, định tuyến, viết hàm chạy test ẩn, hỏi đáp trên kho đóng, phát hiện mâu thuẫn, CTO nghiệm thu.
- System prompt là `systemFor()` của CCoding; bộ chấm dùng `parseReview`, `parsePlan`, `parseRoute`, `parseAcceptance` và `verificationClaim` — trả lời mà CCoding không đọc được thì probe không cho điểm.
- 129 cặp agent × probe cho mỗi model; báo cáo gồm điểm agent × model (± giữa các lần lặp), điểm theo probe, độ trễ p50/p95, token ra/giây, lượt bị cắt, bảng ngữ cảnh dài, 12 lượt kém nhất.

## Quy trình đề xuất khi chạy sub-agent trên Ollama

1. `probe.mjs` trên từng model ứng viên (≥ 2 lần lặp).
2. Gán model theo vị trí từ ma trận probe: reviewer, CTO, trưởng phòng (vai trò quyết định định dạng JSON) dùng model mạnh nhất; chỉ bật `supportsTools` cho model đạt `code-mask-pii` và `honesty-no-tools` ≥ 0,8.
3. Đặt `contextWindow` khớp `num_ctx`.
4. Chạy việc thật một tuần, rồi `ccoding kpi --by model --days 7` và xử lý "việc cần sửa".

## Giới hạn đã biết

- Nhận diện "khẳng định đã kiểm chứng" bằng biểu thức chính quy (VI/EN); có thể bỏ sót cách viết khác. Chỉnh `CLAIM_RE` trong `src/kpi.ts` sau khi xem dữ liệu thật.
- Kết quả thật tính chung cho người thực thi và trưởng phòng của nhiệm vụ — chưa tách được hạng mục nào làm hỏng lệnh kiểm tra.
- Độ đầy ngữ cảnh của lượt có nhiều vòng công cụ là ước lượng (input / số vòng).
- Ngưỡng việc cần sửa và hệ số co điểm (K = 3, mức trung tính 60) đặt theo dữ liệu giả lập; cần hiệu chỉnh trên log Ollama thật.
- Probe chưa chạy với model Ollama thật trong môi trường phát triển — mới kiểm bằng self-test và một máy chủ giả lập API tương thích OpenAI.
