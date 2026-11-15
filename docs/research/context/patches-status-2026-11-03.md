# Trạng thái các bản vá đề xuất (cập nhật 03/11/2026)

Tài liệu này cho Phòng Nghiên cứu biết bản vá nào trong `dev-review/patches/` (D-01…D-03) và `dev-review.md` §6 (P1…P4) đã vào mã nguồn, ở đâu, và còn thiếu gì. Nhãn dữ liệu: Nội bộ. Số liệu lấy từ bàn giao của nhiệm vụ D9 và từ việc đọc `src/` ngày 03/11/2026. Không có lệnh nào được chạy riêng cho tài liệu này.

## 1. Bảng trạng thái

Cột "mặc định" cho biết bản vá có hiệu lực ngay khi cài hay phải bật công tắc. Hash đầy đủ nằm ở mục 2.

| Bản vá | Trạng thái | Commit và vị trí trong `src/` | Mặc định | Ghi chú |
|---|---|---|---|---|
| D-01 (`--max-turns` cho `claude-cli`) | Đã áp, viết lại theo mã hiện tại | `7a2dacf`; `src/runtimes/claude-cli.ts` (`buildClaudeArgs`), `src/config.ts` | Bật (`runtimes.claude-cli.maxTurns`) | Không áp nguyên diff. Trần lấy từ `phases.toolTurns`, chạm trần thì `diag` ghi "chạm trần N lượt" để KPI `capHits` đếm được. Cờ `--max-turns` chưa thử với bản `claude` đang cài. |
| D-02 (cờ "cần xem" khi review không kiểm chứng) | Đã có tương đương từ trước, không áp diff | `28d041d` (B-02); `src/orchestrator.ts:1588` và `:1998` | Bật | Mã dùng `reason: 'review'` kèm chi tiết "chưa có kiểm chứng chạy thật", không thêm lý do `'unverified'` như diff đề xuất. Chưa tìm thấy test riêng cho nhánh này. |
| D-03 (chẩn đoán chặn của hook) | Đã có tương đương, hình thức khác diff | `5fd6604` (B-06); `src/tools/claude-guard.ts:156-166`, `test/guard-block-diag.test.ts` | Bật | Sự kiện tên `guard.block` (diff đặt tên `guard.blocked`) và do hook ghi qua LogStore, không do orchestrator ghi theo từng lượt gọi. Không chứa lệnh thô. |
| P1 (giới hạn đầu ra) | Đã áp, sau công tắc | `8ec6ef3`; `src/prompts.ts` (`OUTPUT_CAP_NOTE`), `src/config.ts` | Tắt (`phases.outputCap`) | Áp cho execute và synthesize, theo đúng diff. Plan và review trả JSON nên không áp. |
| P2 (tín hiệu dừng khảo sát) | Đã áp, sau công tắc | `8ec6ef3`; `src/prompts.ts` (`STOP_SURVEY_NOTE`) | Tắt (`phases.stopSurveyHint`) | Hiệu quả chưa đo. Với `claude-cli`, đo bằng số lần đọc trước lần ghi đầu, vì `capHits` không phản ánh. |
| P3 (reviewer chỉ nhận diff và kết quả lệnh kiểm) | Có tương đương từ trước, không áp diff | `28d041d` (B-02); `src/prompts.ts:552-553` (`reviewPrompt(..., compact)`) | Tắt (`lanes.single.slim.compactTemplate`, mặc định `false` ở `src/slim.ts:19`) | Chỉ áp ở làn đơn (`src/orchestrator.ts:1441`), chưa áp cho làn đầy đủ. Chưa có A/B đo P3 (nhánh B3 của F1). Không đề xuất việc mới trong nhiệm vụ này. |
| P4 (nhật ký sự cố ở revise) | Đã áp, sau công tắc | `8ec6ef3`; `src/prompts.ts` (`INCIDENT_NOTE`), `src/incident.ts`, `src/orchestrator.ts` | Bật (`phases.incidentLog`) | Định dạng mở rộng so với diff: lỗi, nguyên nhân, cách sửa, lệnh kiểm; tối đa 3 mục. Ghi LogStore kind `revise.incident`. Bật mặc định nên prompt revise khác bản trước. |

## 2. Hash commit và cách kiểm

Mục này giúp người đọc tự truy vết. Lệnh `git show` chỉ đọc, chạy được trong worktree của dự án.

| Bản vá | Hash đầy đủ | Lệnh xem |
|---|---|---|
| D-01 | `7a2dacf` | `git show 7a2dacf --stat` |
| D-02 | `28d041d` | `git show 28d041d --stat` |
| D-03 | `5fd6604` | `git show 5fd6604 --stat` |
| P1, P2, P4 | `8ec6ef3` | `git show 8ec6ef3 --stat` |
| P3 | `28d041d` | `git log -S"compact = false" -- src/prompts.ts` |

Hash ở đây là dạng rút gọn lấy từ `git log --oneline`. Một commit `8ec6ef3` chứa cả P1, P2, P4 và B-17 vì ba tệp chung. Người gộp tách được nếu cần.

## 3. Kết quả kiểm tích hợp (S8)

Trên nhánh đã gộp S1–S6: `npm run typecheck` exit 0; `npm run build` exit 0; `npm test` có 325 test, 322 đạt, 0 lỗi, 3 bỏ qua. Công tắc mặc định của D-01, P1, P2, P4 khớp bảng trên. Với P1 và P2 tắt, băm prompt execute, revise, synthesize trùng bản trước khi sửa (`test/s3-incident-difficulty.test.ts`). Với P4 bật, prompt revise khác bản cũ do chủ ý.

## 4. Câu hỏi còn mở

- D-02: có nên thêm lý do `'unverified'` riêng cho `task.attention` không? Hiện nhánh này dùng `reason: 'review'`, giao diện không tách được hai trường hợp.
- P3: có nên mở rộng `compactTemplate` sang làn đầy đủ không? Việc này thuộc nhiệm vụ sau, cần A/B trước.
- D-03: giả định cũ "runtime API trả lỗi chính sách cùng tiền tố" vẫn chưa kiểm, vì sự kiện hiện chỉ do hook của `claude-cli` ghi.
