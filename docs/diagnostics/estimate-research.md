# Đối chiếu ước lượng `estimatePlan` với token thật của Nghiên cứu (D18d K1)

Nhãn dữ liệu: **Nội bộ**. Chỉ dùng số tổng; không chạy benchmark, không gọi LLM. Nguồn: `bench/vs-claude/results/decisions/estimate-vs-actual.json` (5 gói BRIEF-19…23, văn phòng phụ, `lane: full`, `budgetTokens` 6.000.000). Thay cho bản D18c (trước đây "chưa đối chiếu được").

## Bảng đối chiếu

`Thật` = `actual.total` = input + output + cacheRead + cacheWrite. `Thật−cache` = `total − cacheRead`.

| BRIEF | Hạng mục | Basis | Ước lượng | Budget lúc ước lượng | budgetTokens | Thật (total) | Thật − cacheRead | Thật/ước (total) | Thật−cache/ước | Ước > budget? |
|---|---|---|---|---|---|---|---|---|---|---|
| BRIEF-19 | 6 | hằng số (chưa đủ lịch sử) | 2.390.000 | 5.822.029 | 6.000.000 | 14.611.271 | 1.047.058 | **6,11** | 0,44 | Không |
| BRIEF-20 | 6 | lịch sử (@data-scientist ~5,80M ×2 mẫu; @methodologist ~513,8k ×3) | 13.395.807 | 5.660.148 | 6.000.000 | 15.302.113 | 1.388.964 | **1,14** | 0,10 | Có (2,4×) |
| BRIEF-21 | 7 | lịch sử (@data-scientist ~3,51M ×4; @literature-researcher ~365,3k ×2; @methodologist ~670,3k ×4) | 12.465.604 | 5.817.189 | 6.000.000 | 22.127.928 | 1.242.709 | **1,78** | 0,10 | Có (2,1×) |
| BRIEF-22 | 8 | lịch sử (4 vai, @academic-writer ~5,08M ×2 mẫu) | 12.687.173 | 5.685.803 | 6.000.000 | 21.430.607 | 1.576.870 | **1,69** | 0,12 | Có (2,2×) |
| BRIEF-23 | 5 | lịch sử (@academic-writer ~4,61M ×3; @data-scientist ~1,97M ×8) | 11.413.302 | 5.689.959 | 6.000.000 | 5.166.310 | 547.301 | **0,45** | 0,05 | Có (2,0×) |

Tỉ số tính lại khớp đề bài (≈ 6,1; 1,14; 1,78; 1,69; 0,45), không có chênh lệch cần giải thích. Cột "Thật − cacheRead" chỉ để cho thấy cacheRead chiếm 90–95% tổng; nó **không** phải đơn vị mà ước lượng dùng.

## Đơn vị

- Lịch sử theo vai: `subtaskHistory` (`src/estimate.ts`, dòng `const tokens = totalTokens(s.usage)`) lấy `totalTokens` = input + output + cacheRead + cacheWrite (`src/types.ts` `totalTokens`). **Gồm cacheRead/cacheWrite** ⇒ cùng đơn vị với `actual.total`.
- Hằng số (`estimate.base/perReview/perSubtask/web` trong `src/config.ts`) được hiệu chỉnh từ các lượt không cache: mỗi hạng mục `exec` 300k (+100k web). Dưới `claude-cli`, mỗi lượt đọc lại ngữ cảnh từ cache nên thật cao hơn nhiều lần: BRIEF-19 thật/hạng mục ≈ 2,4M so với hằng số ≈ 0,4M. Nếu bỏ cacheRead thì thật chỉ ≈ 175k/hạng mục, đúng bậc hằng số (tỉ số 0,44).
- **Kết luận:** ước lượng theo lịch sử so được trực tiếp với `actual.total`. Ước lượng theo hằng số **không** cùng đơn vị khi runtime đọc cache nhiều (thiếu ≈ 5–6 lần). `budget`/`totalTokens(task.usage)` (dùng để tính ngân sách còn lại) cũng gồm cacheRead nên ngân sách cùng đơn vị với `total`.

## Hiệu chỉnh

- Lịch sử (4 gói): tỉ số 1,14; 1,78; 1,69; 0,45 — trung vị 1,42, trung bình nhân ≈ 1,1 ⇒ **không lệch hệ thống quá 1,5 lần**; sai số là phân tán theo gói (BRIEF-23 có 5 hạng mục, ước theo trung vị của @academic-writer ~4,6M nên thừa), không phải thiên lệch một chiều. Không đổi cách gom (dùng trung vị, `maxSamples` 8 có sẵn); trường hợp ngoại lai nhỏ mẫu (@data-scientist ~5,80M với 2 mẫu) vẫn cho ước lượng 1,14× ở BRIEF-20, nên chưa có bằng chứng cần chặn.
- Hằng số (1 gói, BRIEF-19): thiếu 6,11 lần ⇒ vượt ngưỡng 1,5. Đã thêm `estimate.runtimeFactor` (`src/config.ts`; mặc định `{ 'claude-cli': 5 }`), nhân vào **phần hằng số** (base, review, perSubtask, web) trong `estimatePlanDetail` (`src/orchestrator.ts`); phần lấy từ lịch sử không nhân. Runtime khác (mock, không cache) giữ hệ số 1. Với BRIEF-19: ước ≈ 11,95M so với thật 14,61M ⇒ 1,22×.
- Hạn chế: hệ số 5 dựa trên **một** gói (n = 1), cần kiểm lại khi có thêm số liệu hằng số dưới claude-cli. Hệ số cũng làm gói đầu tiên của Nghiên cứu dễ vượt cảnh báo ngân sách hơn (đúng với thực tế: 14,6M ≫ 6M).
- Test (`test/estimate-check.test.ts`, fixture tổng hợp, chỉ dùng số): BRIEF-19 (hằng số, claude-cli) và BRIEF-20 (lịch sử, 2×@data-scientist 5,80M + 4×@methodologist 513,8k) đều nằm trong ±1,5 lần số thật; kiểm thêm lịch sử không bị nhân hệ số và mock giữ hằng số gốc.

## budgetMode: complete

Hành vi hiện tại, **không đổi** (không có lỗi):
- `checkEstimate` (`src/orchestrator.ts`) ghi `run.estimate`, log `plan.estimate`; nếu `est > remaining × warnRatio` (1,2) thì ghi log `budget.estimate` (warn), nhắn vào cuộc trò chuyện, tạo alert `budget.estimate`. Chỉ khi `mode === 'pause'` mới `throw PauseSignal('budget')`. Ở `complete` (mặc định) chỉ **cảnh báo**, nhiệm vụ chạy tiếp ⇒ đó là lý do 4/5 gói (ước lượng 2–2,4× budget) vẫn chạy. Chặn thật chỉ đến từ `checkBudget` khi dùng thực tế chạm trần ở chính sách `hard`.
- Ngoại lệ: vòng bổ sung (`run.followupOf`) vượt phần còn lại thì luôn dừng (log `accept.followup`, `overBudget: true`), kể cả `complete`.
- Test: `checkEstimate … chế độ complete chỉ cảnh báo` và `budgetMode complete: …` (mới) trong `test/estimate-check.test.ts`; `pause` được kiểm ở 4 test `checkEstimate (…)` cùng tệp.
- Lưu ý: BRIEF-19 có ước lượng (2,39M) **dưới** budget nên không cảnh báo, nhưng thật 14,6M — chính là ca hằng số bị sửa ở trên.
