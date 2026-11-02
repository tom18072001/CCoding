# KPI sub-agent (v2)

`ccoding kpi` · `GET /api/kpi` · tab **KPI** — chấm từng sub-agent trên log việc thật (`data/runs/<task>/calls.jsonl`, `task.json`, `transcript.jsonl`). Mã: `src/kpi.ts`. Kiểm thử: `test/kpi-v2.test.ts`.

## Vì sao có v2

v1 chấm *cách làm* (review, token, công cụ, mẫu đầu ra) nhưng không chấm *kết quả đúng hay sai*. Khi sub-agent chạy trên Ollama, model nhỏ đồng thời là người review: review dễ dãi hoặc không đọc được JSON làm điểm Chất lượng **tăng** khi model **kém** đi; prompt vượt `num_ctx` bị cắt mất đầu mà không chỉ số nào báo.

## Nhóm điểm

| Nhóm | Trọng số | Đo gì |
| --- | --- | --- |
| Chất lượng | 25% | Qua review lần đầu / không còn blocker ở review cuối; người review và CTO thêm độ đúng của kết luận so với kết quả thật (duyệt sai, từ chối sai) |
| Kết quả thật | 20% | Lệnh kiểm tra của dự án sau cùng (đạt 1 · vẫn lỗi 0,4 · hồi quy 0) và tỉ lệ tiêu chí CTO nghiệm thu đạt — chia cho người thực thi và trưởng phòng |
| Trung thực | 15% | Sản phẩm khẳng định "test/typecheck/build đạt" phải có lệnh kiểm chứng trong chính lượt đó, hoặc lệnh kiểm tra của dự án đạt |
| Hiệu quả | 15% | Token (60%) và thời gian (40%) mỗi hạng mục so với trung vị phòng; trừ 15 điểm mỗi lần chạy vượt 2 |
| Tin cậy | 15% | Lượt hỏng do agent, công cụ lỗi, chạm trần, đầu ra bị cắt (theo trần thật `maxTokens` của runtime/pha), kết luận review/nghiệm thu không đọc được, sản phẩm rỗng |
| Tuân thủ | 10% | Mẫu đầu ra + bằng chứng (như v1) |

- Nhóm không có dữ liệu bỏ qua và chia lại trọng số; nhóm có dữ liệu chiếm < 50% trọng số thì điểm tối đa 79.
- **Co điểm theo bằng chứng**: n = hạng mục + review + sản phẩm + nhiệm vụ có kết quả thật + quyết định duyệt + kế hoạch; điểm = (n·thô + 3·60)/(n + 3). Cột **Độ tin**: thấp (n < 3), vừa (< 8), cao.
- Lỗi hạ tầng (hạn mức, mạng) và prompt vượt cửa sổ ngữ cảnh **không trừ điểm** agent — chỉ báo trong "việc cần sửa".

## Việc cần sửa mới

`unbacked-claims` · `context-overflow` · `review-unparsed` · `false-approval` · `regression` · `acceptance-fail` · `empty-output` (xem `FINDING_LABELS`). Cơ chế đánh dấu đã sửa / tự hết / tái diễn giữ nguyên như v1.

## Tách theo model

`ccoding kpi --by model` (API `?by=model`) chấm theo cặp `agent@model` — một agent chạy cả model đám mây lẫn Ollama do chuyển runtime dự phòng thì thấy riêng từng model. Bảng tách theo model không áp dụng đánh dấu đã sửa.

## Cửa sổ ngữ cảnh

Đặt `contextWindow` (= `num_ctx` của Ollama) cho runtime trong `ccoding.local.json`; KPI đếm lượt có prompt ≥ 85% và ≥ 98% cửa sổ, cột **Ngữ cảnh** hiện mức đầy nhất. Không đặt thì bỏ qua chỉ số này.

## Probe thử thách

Chấm hồ sơ agent trên đề cố định trước khi gán model: [bench/agent-probes/README.md](../bench/agent-probes/README.md).
