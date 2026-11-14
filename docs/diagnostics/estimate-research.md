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

## Hiệu chỉnh lại `runtimeFactor['claude-cli']` (D21 K3)

Nhãn dữ liệu: **Nội bộ**; chỉ số tổng.

**Quyết định: giữ hệ số 5, không đổi `src/config.ts`.**

- Quy tắc (BRIEF-D21): chỉ đổi khi n ≥ 5 **và** lệch hệ thống quá 1,5 lần. Hệ số chỉ nhân vào phần ước lượng theo hằng số, nên n đếm các gói dưới `claude-cli` có `basis` "theo hằng số".
- Số liệu có trong worktree: 5 hàng BRIEF-19…23 (đều `claude-cli`; chỉ BRIEF-19 theo hằng số). Thống kê tỉ số thật/ước theo hằng số: **n = 1**, trung vị = 6,11 (tỉ số trước khi có hệ số), IQR = 0 (không có ý nghĩa với n = 1). n < 5 ⇒ giữ 5.
- Với cả 5 hàng (gồm ước theo lịch sử, không chịu hệ số, chỉ để tham khảo): n = 5 (tỉ số 6,11; 1,14; 1,78; 1,69; 0,45 ⇒ trung vị 1,69; Q1 1,14; Q3 1,78; IQR 0,64), không dùng để đổi hệ số.
- **Không thêm hàng mới** vào `estimate-vs-actual.json`: số ước lượng lúc lập kế hoạch và token thật của các gói sau D18d nằm ở dữ liệu văn phòng phụ (`office-data`), hook chặn đọc từ worktree này; không bịa số.

### Thiếu số liệu (cần người điều phối bổ sung, rồi chạy lại `test/estimate-factor.test.ts`)

D18d, D19, D20, BRIEF-22c, BRIEF-22d (và gói khác xong sau D18d chưa tìm thấy). Mỗi hàng cần: `brief, department, lane, subtasks, budgetTokens, estimate{tokens,basis,at}, actual{input,output,cacheRead,cacheWrite,total,calls}, runtime`.

### Test

`test/estimate-factor.test.ts` đọc JSON, lọc hàng `claude-cli` theo hằng số, tính lại trung vị/IQR/n và khẳng định giá trị trong config khớp quy tắc đổi/giữ; khi bổ sung đủ số liệu mà lệch > 1,5 lần thì test đỏ cho tới khi hệ số được sửa.

## D21b: hiệu chỉnh lại ước lượng bằng dữ liệu thật (K1)

Nhãn dữ liệu: **Nội bộ**; chỉ số tổng. Nguồn: `bench/vs-claude/results/decisions/estimate-vs-actual.json` (17 dòng, chỉ đọc). Tỉ số = `actual.total / estimate.tokens`; phân vị nội suy tuyến tính (cùng hàm `quantile` trong test).

### Bảng từng dòng

| Brief | Phòng | Hạng mục | Basis | Ước lượng | Thật | Tỉ số |
|---|---|---|---|---|---|---|
| BRIEF-19 | research | 6 | hằng số | 2390000 | 14611271 | 6,114 |
| BRIEF-20 | research | 6 | lịch sử | 13395807 | 15302113 | 1,142 |
| BRIEF-21 | research | 7 | lịch sử | 12465604 | 22127928 | 1,775 |
| BRIEF-22 | research | 8 | lịch sử | 12687173 | 21430607 | 1,689 |
| BRIEF-23 | research | 5 | lịch sử | 11413302 | 5166310 | 0,453 |
| BRIEF-D18a | dev | 6 | lịch sử | 3817147 | 10496316 | 2,750 |
| BRIEF-D18b | dev | 5 | lịch sử | 4582528 | 3216398 | 0,702 |
| BRIEF-22b | research | 5 | lịch sử | 10130162 | 22788240 | 2,250 |
| BRIEF-D18c | dev | 5 | lịch sử | 3753263 | 6192259 | 1,650 |
| BRIEF-D18d | dev | 4 | lịch sử | 3726040 | 1808782 | 0,485 |
| BRIEF-D19 | dev | 4 | lịch sử | 3470450 | 10914942 | 3,145 |
| BRIEF-22c | research | 5 | lịch sử | 10727826 | 14153552 | 1,319 |
| BRIEF-D20 | dev | 8 | lịch sử | 4493659 | 17402382 | 3,873 |
| BRIEF-22d | research | 5 | lịch sử | 11863421 | 5286074 | 0,446 |
| BRIEF-D20b | dev | 4 | lịch sử | 4173968 | 9801138 | 2,348 |
| BRIEF-D21 | dev | 4 | lịch sử | 4144977 | 2626664 | 0,634 |
| BRIEF-24 | research | 5 | lịch sử | 11978283 | 7375069 | 0,616 |

### Tổng hợp

| Nhóm | n | Trung vị | Q1 | Q3 | IQR |
|---|---|---|---|---|---|
| Hằng số | 1 | 6,114 | 6,114 | 6,114 | 0 |
| Lịch sử (cả nhóm) | 16 | **1,485** | 0,629 | 2,274 | 1,645 |
| Lịch sử, Dev | 8 | 1,999 | 0,685 | 2,849 | 2,164 |
| Lịch sử, Nghiên cứu | 8 | 1,231 | 0,575 | 1,711 | 1,136 |
| Lịch sử, ≤ 5 hạng mục | 11 | 0,702 | 0,551 | 1,950 | 1,399 |
| Lịch sử, > 5 hạng mục | 5 | 1,775 | 1,689 | 2,750 | 1,061 |

- Làn: mọi 17 dòng đều `full` ⇒ **không tách được theo làn**.
- Tỉ số thật/`work` (10 dòng có `work`, cả hai basis): trung vị 1,605, cho thấy cũng lệch lên, tương tự tỉ số thật/ước lượng.
- Độ phân tán rất lớn (IQR 1,6; tỉ số từ 0,45 tới 3,87): trung vị gần ngưỡng nhưng từng gói lệch cả hai phía.

### Quyết định

Quy tắc khóa ở D21: chỉ đổi khi n ≥ 5 **và** trung vị > 1,5 hoặc < 1/1,5.
- **Hằng số:** n = 1 < 5 ⇒ **giữ** `runtimeFactor['claude-cli'] = 5` (vẫn chỉ một điểm, BRIEF-19, 6,11).
- **Lịch sử:** n = 16 ≥ 5 nhưng trung vị = 1,485 < 1,5 (và > 0,667) ⇒ **không đạt** ⇒ **giữ**, không thêm hệ số lịch sử.
- Nhóm con Dev (1,999) vượt 1,5 nhưng là phát hiện sau khi đã xem dữ liệu (nhiều so sánh, n = 8, IQR 2,2) ⇒ không áp hệ số theo phòng trong gói này.

### Đề xuất bước sau (không làm ở D21b)

1. Ước lượng chỉ lấy run đầu còn số thật gồm mọi run (`note2`): thử tính cả vòng bổ sung và review vào lịch sử vai, rồi so lại.
2. Ghi `department`/số hạng mục lúc lập ước lượng để kiểm lệch theo phòng (Dev ≈ 2,0) và theo cỡ (> 5 hạng mục ≈ 1,78).
3. Kiểm lại khi có thêm ≥ 5 dòng mới ở nhóm hằng số, hoặc nhóm lịch sử có trung vị vượt 1,5; test `test/estimate-factor.test.ts` sẽ đỏ nếu điều kiện đạt mà cấu hình chưa chỉnh.
- Test: `test/estimate-factor.test.ts` kiểm n = 1 và 16 (tổng 17), cấu hình giữ nguyên, và bắt buộc có cách chỉnh nếu nhóm lịch sử đạt điều kiện.
