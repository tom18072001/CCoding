# FX8 — "Đầu ra bị cắt": chẩn đoán nguồn cờ theo pha

Dữ liệu: `bench/vs-claude/results/decisions/calls-limits.json` (146 lượt `claude-cli`, chỉ đọc) và mã `src/kpi.ts`, `src/runtimes/*`, `src/orchestrator.ts`. Mức dữ liệu: Nội bộ.

## Nguồn cờ (từ mã)

- KPI cũ tính "bị cắt" khi `r.truncated` **hoặc** (`output ≥ 0,98 × maxTokens`, không công cụ, pha ≠ plan).
- `r.truncated` do runtime đặt: `api.ts` (`finish_reason`/`stop_reason` = max_tokens / length). **`claude-cli.ts` không bao giờ đặt `truncated`** và không truyền `max_tokens` (CLI không có cờ này); chạm `--max-turns` chỉ trả `capped: 'turns'` + `diag` "chạm trần … lượt".
- `output` của `claude-cli` là **tổng mọi vòng công cụ** (cộng dồn), nên tỉ số output/maxTokens không phải "độ dài một câu trả lời".
- Nhánh suy từ tỉ số là thủ phạm của 27/112 lượt: với `claude-cli`, trần `maxTokens` của pha (`config.ts:378`) chỉ là con số so sánh, không ai áp nó.

## Bảng theo pha

| Pha | Lượt | maxTokens | Lượt tỉ số > 1 | Nguồn cờ | Kết luận |
| --- | ---: | ---: | ---: | --- | --- |
| route | — (không có trong mẫu) | 800 | — | không có dữ liệu | Không kết luận |
| plan | 15 | 8000 | 4 | tỉ số; KPI vốn bỏ qua pha plan, nhưng output cộng dồn qua vòng công cụ (12/15 có công cụ) | output cộng dồn |
| discuss | 38 | 700 | 29 (q50 1,31; max 1,77) | tỉ số; không công cụ; `claude-cli` không áp 700 | output cộng dồn (không có cờ cắt thật từ runtime; 700 chỉ là gợi ý độ dài với CLI) |
| execute | 52 | 32000 | 14 (q90 1,92; max 4,84) | tỉ số; 50/52 có công cụ → nhánh KPI cũ không đếm, nhưng số lớn nhất do cộng mọi vòng | output cộng dồn; trường hợp chạm `--max-turns` ghi riêng bằng `diag` → chạm trần lượt |
| review | 6 | 6000 | 1 (max 1,44) | tỉ số; 6/6 có công cụ | output cộng dồn |
| revise | 7 | 32000 | 0 | — | không có cờ |
| synthesize | 10 | 10000 | 0 | — | không có cờ |

(finalize 9 lượt và accept 9 lượt cũng có tỉ số > 1 ở finalize 4/9; cùng kết luận: output cộng dồn.) Số "cắt thật" trong mẫu này: **0** — không bản ghi nào mang `truncated: true` từ runtime; mẫu không chứa `stop_reason`, nên "0" là suy ra từ mã (CLI không đặt cờ), không phải đo trực tiếp.

## Sửa

- `src/kpi.ts`: tách `truncated` (chỉ cắt thật: cờ runtime, hoặc — với bản ghi cũ không có cờ — tỉ số trên lượt **một vòng, không công cụ, không phải claude-cli**) và `turnCapped` (`r.turnCapped` hoặc `diag` "chạm trần"). `findings` có hai khóa riêng `truncated` / `turn-capped` với lời khuyên khác nhau.
- Không đổi `maxTokens`/`toolTurns` ở `config.ts`: không có bằng chứng giới hạn thật ở pha nào trong mẫu; thêm lời nhắc "ghi tệp sớm" cũng không cần vì khóa `cap-hits` sẵn có đã nhắc.
- Việc còn mở: orchestrator chưa ghi `turnCapped` vào bản ghi lượt (ngoài phạm vi D18b); hiện KPI dựa vào `diag`.
