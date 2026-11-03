# Bộ chấm và cổng chất lượng như bộ phân loại: Accuracy, Precision, Recall, F1, Cohen's κ

> Phòng Nghiên cứu · vòng 4, gói 2, hạng mục S1 (@data-scientist) · 3/11/2026 · phân loại dữ liệu: **Nội bộ** (bài tổng hợp, không có DLCN). Phân tích **phụ/khám phá**, ngoài họ Holm, thêm sau khi đã bắt đầu thu dữ liệu theo yêu cầu của giám đốc ngày 3/11 (ghi vào `preregistration.md` §9 ở bước ghi bản 2.2, không thuộc hạng mục S1). Mọi bảng A-0…A-3, G-0 là đầu ra nguyên văn của `node docs/research/analysis/agreement.mjs`; kiểm bằng `--check`.
> Các mục §(c), §MAST và §Duyệt thiết kế do hạng mục sau điền (S5, S3); S1 để chỗ ở cuối tệp.

## Tóm tắt

- Đã có công cụ `agreement.mjs`: ma trận nhầm lẫn, Accuracy, Precision, Recall, F1 (macro-F1 khi nhiều lớp), Cohen's κ, prevalence, PABAK, CI bootstrap theo lượt, cảnh báo "nghịch lý κ". Có 12 test, trong đó bốn ca tính tay và hai test chứng minh bootstrap lấy lại theo lượt.
- **(a) Judge so với regex** trên 12 lượt (84 cặp lượt × mục): khớp thô 0,940, **κ = 0,255** (CI 95 % theo lượt −0,04 … 0,65), PABAK 0,881. κ thấp là **nghịch lý κ**: 95 % mục đạt ở cả hai bên, nên không đọc κ riêng lẻ. 12/14 mục checklist không có bất đồng nào; 5 cặp bất đồng tập trung ở hai mục của r1 (`ilm`, `ingest-throughput`). Đây là độ khớp, không phải độ đúng.
- **(b)** `gold-sheet.csv` (60 mục) và `gold-key.csv` đã chuẩn bị; **chưa có nhãn nên chưa có κ hay Accuracy** cho bộ nhãn vàng.

## Tệp đã lưu

| Tệp | Nội dung |
|---|---|
| `agreement.mjs` | Thư viện (`metrics`, `bootstrapCI`, `report`, `parseCsv`…), CLI, `--check`, `--make-gold`, `--gold-score`, `--pairs` |
| `agreement.test.mjs` | 12 test `node --test` |
| `agreement.md` | Tệp này |
| `gold-sheet.csv`, `gold-key.csv`, `gold-sheet-guide.md` | Bộ nhãn vàng (b): tờ gán nhãn (ẩn arm), đáp án judge/regex, hướng dẫn một trang |

## Công cụ

**Định nghĩa.** Đầu vào là các cặp (ref, pred, runId), nhãn nhị phân hoặc nhiều lớp (so theo chuỗi).

- Nhị phân: ma trận nhầm lẫn, Accuracy = po, Precision = TP/(TP+FP), Recall = TP/(TP+FN), F1 = 2TP/(2TP+FP+FN) cho lớp dương. Prevalence = tỉ lệ dương của **tham chiếu**; in thêm tỉ lệ dương dự đoán.
- Nhiều lớp: Precision, Recall là macro (TB không trọng số các lớp, lớp có mẫu số 0 tính 0); macro-F1 = TB của F1 từng lớp (không phải F1 của macro-P và macro-R). Prevalence = tỉ lệ của lớp lớn nhất.
- Cohen's κ = (po − pe)/(1 − pe) với pe = Σ (tổng hàng × tổng cột)/n²; **n/a** khi pe = 1 (một nhãn duy nhất ở cả hai bên). PABAK = (k·po − 1)/(k − 1), nhị phân 2·po − 1.
- **Bootstrap theo lượt.** Lấy lại các `runId` có hoàn lại (số lượt giữ nguyên), ghép **mọi** cặp của lượt được chọn, tính lại chỉ số. Lý do: các mục trong một lượt tương quan (cùng văn bản, cùng lần sinh), nên lấy lại từng mục sẽ thu hẹp CI giả tạo. B = 2000, seed cố định **20261103** (`SEED` trong script), CI = phân vị 2,5 %–97,5 % nội suy tuyến tính. Bản lấy mẫu mà chỉ số không xác định (κ khi pe = 1) bị bỏ và đếm (báo "B hợp lệ"). Không có `runId` thì mỗi dòng là một đơn vị (dùng cho κ MAST theo C-xx, không có cấu trúc lượt).
- **Luôn in** số dương thật (`nPositive`) và n; khi prevalence hoặc tỉ lệ dương dự đoán ngoài [0,1; 0,9] in cảnh báo **NGHỊCH LÝ κ** kèm PABAK và khớp thô.

**Kiểm tra.** Test tính tay (đối chiếu với `agreement.test.mjs`):

| Ca | Số tay | Kết quả |
|---|---|---|
| κ = 0 | ref 1,1,0,0 · pred 1,0,1,0 → po = pe = 0,5 | κ = 0, Acc = P = R = F1 = 0,5 |
| κ = 1 | khớp hoàn toàn | κ = PABAK = Acc = F1 = 1 |
| Nghịch lý | TP 90, FN 5, FP 5, TN 0: po = 0,90, pe = 0,905 | κ = −1/19 ≈ −0,053, PABAK = 0,8, P = R = F1 = 90/95, cảnh báo |
| 3 lớp | ma trận [4,1,0; 1,3,1; 1,1,2], n = 14: po = 9/14, pe = 67/196 | κ = 59/129 ≈ 0,457, macro-F1 = 731/1155 ≈ 0,633, PABAK = 13/28 |
| Bootstrap | lượt X 3 cặp, lượt Y 1 cặp, lấy 2 lượt | cỡ mẫu chỉ ∈ {2, 4, 6}; CI của cỡ mẫu [2; 6] (lấy theo mục sẽ luôn cho 4) |

**Dùng cho bước sau.** `--pairs tệp.csv` (cột `ref,pred[,runId]`) cho báo cáo như trên, dùng cho κ MAST ở S5; `--gold-score` cho bộ nhãn vàng.

## (a) Judge so với regex (gộp mọi arm)

**Phạm vi và quy tắc.** Chỉ các dòng a1/r1 đã có judge (opus) trong ảnh chụp 276 dòng ở `838a5f1` (sha256 ở A-0, khớp `results/study-cloud-step4/README.md`). Không đọc dòng nào sau ảnh chụp. Chấm lại bằng `gradeChecklist` của `lib/grade.mjs` **không truyền judge** (regex), trên artifact đã lưu; không gọi LLM. Khóa lượt chứa tên arm nên chỉ dùng nội bộ làm `runId` của bootstrap; **không bảng, tệp nào có cột arm** và không có điểm theo arm (giữ `preregistration.md` §4).

**Đọc kết quả.** Ref = judge, pred = regex. Đây là **độ khớp**, không phải độ đúng: không bên nào là chuẩn vàng (xem (b)). Accuracy, κ, PABAK đối xứng; Precision và Recall phụ thuộc bên nào đặt làm ref.

### A-0. Nhận dạng dữ liệu và số dòng bị loại

Ảnh chụp: `bench/vs-claude/results/study-cloud/runs.jsonl` ở commit `838a5f1`. Artifact chấm lại: `bench/vs-claude/results/study-cloud/artifacts/<khóa>/`. Không gọi LLM, không truyền judge cho `gradeChecklist`.

| Mục | Giá trị |
|---|---|
| sha256 ảnh chụp (byte thô, `git show`) | `85db4ddbb65e12482cc7acb57e31154192ce22655d298061c9a437edce9b5d39` |
| Số dòng ảnh chụp | 276 |
| Loại: không phải bài checklist (không có `details.verdicts`) | 258 |
| Loại: bài checklist nhưng đã chấm bằng regex, không có judge | 6 |
| Loại: status ≠ done | 0 |
| Loại: thiếu artifact | 0 |
| **Giữ lại: dòng có judge (opus)** | **12** |
| Số cặp (lượt × mục) trong phép so | 84 |
| Kiểm artifact: độ dài văn bản chấm lại = `chars` lúc judge chấm | 12/12 |
| Kiểm artifact: regex chấm lại = verdict regex đã lưu, trên các dòng regex bị loại | 6/6 |

Phân vùng: 258 + 6 + 0 + 0 + 12 = 276 dòng. Các dòng regex bị loại chỉ dùng kiểm artifact còn nguyên, không đưa vào phép so nào. Blob git là LF nhưng cây làm việc Windows có thể là CRLF (autocrlf): script chuẩn hóa về LF trước khi chấm, nếu không độ dài lệch `chars` và cửa sổ `.{0,300}` của regex lệch.

### A-1. Judge so với regex theo từng mục checklist (gộp mọi arm)

Tham chiếu = judge (opus), dự đoán = regex; lớp dương = "mục đạt". Đây là **độ khớp**, không phải độ đúng: không bên nào là chuẩn vàng. Cột "TP/FN/FP/TN" = judge có & regex có / judge có & regex không / judge không & regex có / cả hai không. Mỗi mục chỉ có n lượt, nên κ từng mục thô; không tính CI từng mục (n quá nhỏ cho bootstrap theo lượt). "n/a" = κ không xác định (cả hai bên cùng một nhãn ở mọi lượt, pe = 1). ⚠ = prevalence hoặc tỉ lệ dương dự đoán ngoài [0,1; 0,9] (nghịch lý κ).

| Bài | Mục | n lượt | Judge dương | Regex dương | TP/FN/FP/TN | Khớp thô | κ | PABAK | Prevalence | Cảnh báo |
|---|---|---|---|---|---|---|---|---|---|---|
| r1-elk-design | daily-volume | 6 | 6 | 6 | 6/0/0/0 | 1,00 | n/a | 1,00 | 1,00 | ⚠ |
| r1-elk-design | yearly-volume | 6 | 6 | 6 | 6/0/0/0 | 1,00 | n/a | 1,00 | 1,00 | ⚠ |
| r1-elk-design | replicas | 6 | 6 | 6 | 6/0/0/0 | 1,00 | n/a | 1,00 | 1,00 | ⚠ |
| r1-elk-design | license-conflict | 6 | 6 | 6 | 6/0/0/0 | 1,00 | n/a | 1,00 | 1,00 | ⚠ |
| r1-elk-design | integrity | 6 | 6 | 6 | 6/0/0/0 | 1,00 | n/a | 1,00 | 1,00 | ⚠ |
| r1-elk-design | masking | 6 | 6 | 6 | 6/0/0/0 | 1,00 | n/a | 1,00 | 1,00 | ⚠ |
| r1-elk-design | ilm | 6 | 3 | 6 | 3/0/3/0 | 0,50 | 0,00 | 0,00 | 0,50 | ⚠ |
| r1-elk-design | ingest-throughput | 6 | 5 | 3 | 3/2/0/1 | 0,67 | 0,33 | 0,33 | 0,83 |  |
| a1-ambiguous-spec | pii-contradiction | 6 | 6 | 6 | 6/0/0/0 | 1,00 | n/a | 1,00 | 1,00 | ⚠ |
| a1-ambiguous-spec | last-month | 6 | 6 | 6 | 6/0/0/0 | 1,00 | n/a | 1,00 | 1,00 | ⚠ |
| a1-ambiguous-spec | perf-vs-volume | 6 | 6 | 6 | 6/0/0/0 | 1,00 | n/a | 1,00 | 1,00 | ⚠ |
| a1-ambiguous-spec | team-definition | 6 | 6 | 6 | 6/0/0/0 | 1,00 | n/a | 1,00 | 1,00 | ⚠ |
| a1-ambiguous-spec | retention-conflict | 6 | 6 | 6 | 6/0/0/0 | 1,00 | n/a | 1,00 | 1,00 | ⚠ |
| a1-ambiguous-spec | old-format | 6 | 6 | 6 | 6/0/0/0 | 1,00 | n/a | 1,00 | 1,00 | ⚠ |

Số mục có cảnh báo nghịch lý κ: 13/14. Ở các mục này κ không dùng được để so; đọc "Khớp thô" và PABAK.

### A-2. Judge so với regex, gộp theo bài và toàn bộ (CI 95 % bootstrap theo lượt)

Ref = judge, pred = regex (Precision = trong số mục regex cho đạt, tỉ lệ judge cũng cho đạt; Recall = trong số mục judge cho đạt, tỉ lệ regex cũng cho đạt). Accuracy, κ, PABAK đối xứng giữa hai bên. Ô: ước lượng [CI 95 %]; CI lấy lại **lượt** (không lấy lại mục), B = 2000, seed 20261103; ô "n/a" nghĩa là thống kê không xác định ở phần lớn mẫu. "Dương thật" = số mục judge cho đạt, "dự đoán dương" = số mục regex cho đạt.

| Phạm vi | Số lượt | n cặp | Dương judge/regex | Accuracy | Precision | Recall | F1 | κ | PABAK | Prevalence judge / regex |
|---|---|---|---|---|---|---|---|---|---|---|
| r1-elk-design | 6 | 48 | 44/45 | 0,896 [0,83; 0,96] | 0,933 [0,88; 0,98] | 0,955 [0,90; 1,00] | 0,944 [0,90; 0,98] | 0,231 [-0,08; 0,55] | 0,792 [0,67; 0,92] | 0,92 / 0,94 |
| a1-ambiguous-spec | 6 | 36 | 36/36 | 1,000 [1,00; 1,00] | 1,000 [1,00; 1,00] | 1,000 [1,00; 1,00] | 1,000 [1,00; 1,00] | n/a | 1,000 [1,00; 1,00] | 1,00 / 1,00 |
| Gộp | 12 | 84 | 80/81 | 0,940 [0,89; 0,99] | 0,963 [0,93; 1,00] | 0,975 [0,94; 1,00] | 0,969 [0,94; 0,99] | 0,255 [-0,04; 0,65] | 0,881 [0,77; 0,98] | 0,95 / 0,96 |

⚠ NGHỊCH LÝ κ: prevalence (tham chiếu) = 0,952, tỉ lệ dương dự đoán = 0,964 nằm ngoài [0,1; 0,9], hầu hết ô chạm trần; κ = 0,255 có thể thấp dù khớp thô = 0,940. Đọc kèm PABAK = 0,881 (không phụ thuộc phân bố lớp).

Công thức của ô "Gộp": ma trận nhầm lẫn 78/2/3/1 (TP/FN/FP/TN), po = 0,940, pe = 0,920.

### A-3. Đối chiếu hai lỗi regex đã biết (chẩn đoán sau, không sửa bộ chấm)

Chẩn đoán trên 12 văn bản đã giữ ở A-0, gộp arm. Không sửa `checklist.json` hay `grade.mjs`; chỉ chạy lại biểu thức đã biết lỗi với một biến thể sửa để đếm. Trường hợp "không khớp judge" chưa chắc là lỗi regex: judge cũng có thể sai.

| Lỗi đã biết | Phạm vi | Số lượt bị ảnh hưởng | Judge |
|---|---|---|---|
| `sign` khớp "design" (mục `integrity`) | 6 lượt regex cho đạt | 0 lượt chỉ đạt nhờ "sign" trong từ khác (khi đổi thành `\bsign`) | judge cũng cho đạt: 0/0 |
| bỏ sót "1,4 TB" một chữ số thập phân (mục `daily-volume`) | 0 lượt regex không cho đạt | 0 lượt có "1,2–1,5 TB/TiB" một chữ số thập phân mà regex bỏ sót | judge cho đạt: 0/0 |

Cả hai lỗi đã biết **không xảy ra** trong 12 văn bản này (số 0 ở cột 3); không suy ra tần suất của chúng ở bài khác. Tổng số cặp bất đồng judge ≠ regex: 5/84.

**Kết luận (a), mô tả, không suy diễn.**

1. Khớp thô 94,0 % (79/84 cặp trùng nhãn; 5 bất đồng), nhưng **κ chỉ 0,255 và CI 95 % chứa 0** (−0,04 … 0,65). Nguyên nhân là nghịch lý κ: judge cho đạt 80/84 và regex 81/84, nên pe = 0,920 gần trần, κ bị phạt nặng bởi hai ô chéo hiếm. Không kết luận "hai bộ chấm không đồng thuận"; PABAK 0,881 ([0,77; 0,98]) và khớp thô cho thấy phần lớn là khớp.
2. **12/14 mục** không có bất đồng nào (cả hai cùng cho đạt ở cả 6 lượt), nên κ từng mục là n/a và không thông tin; 13/14 mục có cảnh báo nghịch lý κ (A-1). Toàn bộ 5 bất đồng nằm ở r1: `ilm` (regex đạt, judge không, 3 lượt) và `ingest-throughput` (judge đạt, regex không, 2 lượt). Bài a1: khớp hoàn toàn 36/36.
3. Giả thuyết (chưa kiểm từng văn bản): regex của `ilm` là `ILM|index lifecycle`, chỉ cần nhắc tên là đạt, trong khi câu hỏi đòi chính sách có rollover và các pha khớp 30 ngày nóng/12 tháng; regex của `ingest-throughput` đòi "20.000/20k" cách ≤ 300 ký tự trước "logstash/ingest node/bulk/EPS per", dễ bỏ sót cách diễn đạt khác. Đây là giải thích khả dĩ cho hướng bất đồng (regex dễ cho đạt thừa ở `ilm`, bỏ sót ở `ingest-throughput`); cần nhãn người (b) để biết bên nào sai.
4. **Hai lỗi regex đã ghi ở `preregistration.md` không xảy ra** trong 12 văn bản này (A-3, cả hai số bằng 0): `sign` khớp "design" không làm đổi kết quả của `integrity`; mọi văn bản đã khớp `daily-volume` (không có "1,4 TB" bị bỏ sót). Kết quả này không nói gì về tần suất của chúng ở bài khác.
5. **Giới hạn.** 12 lượt, 2 bài, một họ mô hình sinh văn bản; judge đã dùng prompt cứng ("vague, implied or incorrect coverage is false") và regex được viết bởi cùng nhóm nên có thể chung thiên lệch. 12 lượt giữ lại là tập do cấu hình (`--judge` chỉ chạy ở một cửa sổ, `preregistration.md` §9 SR-07), không phải mẫu ngẫu nhiên của 276 dòng; vì gộp mọi arm, κ phản ánh cả việc arm nào có nhiều lượt có judge hơn (thêm ở bước duyệt thiết kế, S3). Prevalence 0,95 nghĩa là **không đo được** khả năng bắt mục *không đạt* (chỉ 4 mục judge cho không đạt trong 84). κ n/a ở bài a1 vì cả hai bên đạt mọi mục. Cây làm việc Windows là CRLF còn blob git là LF; script chuẩn hóa LF và kiểm `chars` khớp 12/12.

## (b) Bộ nhãn vàng (chỉ chuẩn bị)

### G-0. Chuẩn bị bộ nhãn vàng (b): chỉ nhận dạng, không có κ

| Mục | Giá trị |
|---|---|
| Seed (chọn mục, mã lượt, xáo thứ tự) | 20261103 |
| Số mục chọn / số cặp có sẵn | 60/84 |
| Số ô bài×mục; số mục mỗi ô | 14; 4–5 (4 mỗi ô, 4 ô thêm 1 do seed) |
| sha256 `gold-sheet.csv` bản trắng (chưa có nhãn) | `ec0a0f7ea68b2e5be13e685876fe69782d24e8cddaabc9185bae060fe876142d` |
| sha256 `gold-key.csv` | `332cfdec9f07eedeee9edfdd3c14a6fa42ec673e252790c340925ab6c82e2679` |
| Số nhãn người đã có | 0 (chưa gán; script không tính κ hay Accuracy cho bộ nhãn vàng khi chưa có nhãn) |

- `gold-sheet.csv`: 60 mục chọn **phân tầng theo bài × mục** (14 ô, mỗi ô 4 mục, 4 ô thêm 1 mục do seed), thứ tự xáo bằng seed 20261103 (ghi ở dòng cuối của tệp). Cột: `id`, `bài`, `mục`, `câu_hỏi`, `đoạn_trích`, `nhãn_người` (trống), `ghi_chú`. Đoạn trích: tối đa 3 đoạn văn có nhiều từ khóa trùng **câu hỏi** nhất (không dựa vào regex hay judge), đã qua `blind()` của `lib/judge.mjs`. Arm bị ẩn: bảng chỉ có bài và mục.
- `gold-key.csv`: `id`, `bài`, `mục`, `lượt` (mã L01…L12 xáo bằng seed, không phải khóa lượt thật), `judge`, `regex`. **Không có arm.** Mã lượt tính lại được bằng script từ ảnh chụp, không lưu ánh xạ.
- `gold-sheet-guide.md`: hướng dẫn một trang (nhãn 1/0/?, quy tắc, giới hạn).
- Kiểm tra ẩn arm: `grep -nE "\bB0\b|\bA0\b|A0-sonnet" gold-sheet.csv gold-key.csv` không ra kết quả; tên arm và khóa lượt không có trong hai tệp, `gold-key.csv` không có `B6`, `B7`. Grep thô `B6`/`B7` **có** khớp ở `gold-sheet.csv` (dòng `G49` và `G56`), nhưng đó là **mã câu của đề a1** ("Ref | Brief sentence": B1…B8) mà văn bản `SPEC.md` trích lại, không phải arm. Tương tự `A1`, `A2` là mã giả định trong bảng của tài liệu r1. Giữ nguyên để đoạn trích đúng nguồn; không sửa chữ của tài liệu chỉ để qua grep.
- **Chưa có nhãn người, nên chưa có κ, Accuracy, Precision, Recall hay F1 cho bộ nhãn vàng.** Giám đốc tự quyết có gán nhãn không; khi có, `node docs/research/analysis/agreement.mjs --gold-score` cho các chỉ số của judge và regex so với nhãn người (kèm CI theo lượt và cảnh báo nghịch lý κ), giống Bảng 2 của MAST.
- Giới hạn của mẫu (đã nêu trong hướng dẫn): phân tầng theo ô không oversample chỗ bất đồng, nên 60 mục có thể chỉ chứa khoảng 3–4 trong 5 cặp bất đồng; không đo được khả năng bắt mục không đạt khi chỉ có ~4 ví dụ không đạt.

## (c) Cổng chất lượng như bộ phát hiện lỗi

_Chưa làm. Hạng mục S5 điền._

## MAST: κ giữa hai người gán nhãn C-01…C-49

_Chưa làm. Hạng mục S5 điền sau khi S3, S4 xong._

## Duyệt thiết kế (methodologist)

> Hạng mục S3 (@methodologist), 3/11/2026. **Phạm vi và giới hạn của việc duyệt:** tôi đọc `agreement.mjs` (`metrics`, `bootstrapCI`, `groupByRun`, ngưỡng cảnh báo), `agreement.md` §(a), §(b), đầu và cuối `gold-sheet.csv`, `gold-sheet-guide.md`. Tôi **không chạy được lệnh** (công cụ chỉ đọc) nên không chạy lại test, `--check` hay `--gold-score`; các con số dưới đây là tính tay lại từ bảng đã in. Tôi chưa mở dòng dữ liệu nào ngoài những gì `agreement.md` đã in. Quyết định: **Đạt** (giữ nguyên), **Đạt kèm ghi chú** (giữ, có điều kiện cho bước sau) hoặc **Sửa** (có việc phải làm, nêu người làm).

| # | Điểm duyệt | Quyết định | Căn cứ và việc cần làm |
|---|---|---|---|
| 1 | Bootstrap lấy lại theo `runId` cho (a) | **Đạt** | `groupByRun` gom mọi cặp của một lượt, `bootstrapSample` lấy lại nhóm có hoàn lại với số nhóm giữ nguyên, nên cỡ mẫu biến thiên (test đã chứng minh {2, 4, 6}). Đúng với thiết kế vì tám hoặc sáu mục cùng một văn bản tương quan. Seed 20261103, B = 2000, bản lấy mẫu có κ không xác định bị bỏ và đếm (B hợp lệ): đạt. Tính lại tay ô "Gộp": 78/2/3/1, po = 79/84 = 0,940, pe = (80·81 + 4·3)/84² = 0,920, κ = 0,255, khớp bảng A-2. Giới hạn cần giữ trong báo cáo: chỉ 12 lượt nên CI phân vị là **xấp xỉ**, và 12 lượt thuộc 2 bài nên phụ thuộc cấp bài không xử lý được (2 cụm). |
| 2 | Bootstrap theo `runId` cho (c) | **Đạt kèm ghi chú** | Đồng ý áp theo `runId` vì các lần cổng quyết định trong một lượt cùng nhãn thật và cùng văn bản. Ba điều kiện cho S5, đã ghi vào `preregistration.md` §5.1: (i) mọi cặp mang `runId`; (ii) số dương thật cho ngưỡng "chưa ước lượng được" đếm theo **lượt**, không theo lần quyết định (10 lần quyết định từ 2 lượt không phải 10 dương); (iii) in kèm bảng độ nhạy ở mức một cặp mỗi lượt. Nguy cơ cấu trúc cần S5 nêu: cổng có thể kích hoạt vòng sửa, nên nhãn "test ẩn < 100 %" đo ở **cuối** lượt đã bị chính cổng can thiệp, làm precision thấp giả (cổng đúng nhưng vòng sửa đã chữa). Coi precision của (c) là cận dưới. |
| 3 | Ngưỡng nghịch lý κ 0,1 / 0,9 | **Đạt cho nhị phân; Sửa cho đa lớp (giao S5)** | Nhị phân: điều kiện `x > 0,9 \|\| x < 0,1` (chặt) khớp đề, luôn in PABAK và khớp thô; cảnh báo mở rộng sang tỉ lệ dương **dự đoán** là hợp lý (κ cũng sụp khi một bên chạm trần) và đã ghi rõ trong A-1/A-2. Ngưỡng là **quy ước, không phải định lý**; prereg ghi như vậy. **Sửa:** với đa lớp, `metrics` đặt prevalence = tỉ lệ lớp lớn nhất rồi áp cả cận dưới 0,1 (`agreement.mjs:79-82`). Với 16-17 nhãn và n = 49, lớp lớn nhất rất dễ dưới 0,1 mà không có hiện tượng "chạm trần" nào, nên κ MAST sẽ nhận cảnh báo giả. Quy tắc đã đăng ký (prereg §5.1): đa lớp chỉ cảnh báo khi lớp lớn nhất của tham chiếu hoặc của dự đoán > 0,9. S5 sửa `metrics` kèm một test đa lớp trước khi tính κ MAST; nếu không kịp thì báo tay và ghi vào §9. |
| 4 | Phân tầng gold-sheet (b) | **Đạt kèm ghi chú** | 14 ô bài × mục, mỗi ô 4-5 mục trên 6 cặp có sẵn (xác suất chọn 0,67-0,83, gần đều), seed cố định, **không** chọn theo kết quả judge/regex: đúng, vì oversample chỗ bất đồng sẽ làm lệch Accuracy và κ. Đoạn trích chọn bằng từ khóa của câu hỏi, không dùng regex hay judge: đúng. Ba ghi chú: (i) 60/84 = 71 % cặp, nên **gán nốt 24 dòng còn lại** (khoảng 20 phút) là cách rẻ nhất để bỏ hẳn sai số lấy mẫu và phủ cả 5 cặp bất đồng; đề nghị giám đốc cân nhắc, không bắt buộc; (ii) nhãn `?` bị loại sẽ gây chệch chọn lọc, nên `--gold-score` khi có nhãn cần in số `?` và ít nhất một độ nhạy (coi `?` là 0); (iii) Accuracy toàn cục dùng trọng số ô, hoặc báo theo ô, vì ô khác cỡ chọn. Prevalence ~ 0,95 nghĩa là bộ này **không đo được** khả năng bắt mục không đạt (~4 ví dụ không đạt): hướng dẫn đã nói, giữ. |
| 5 | (a) không lộ arm; có báo số dòng bị loại | **Đạt kèm một câu bổ sung** | Không bảng nào có cột arm; khóa lượt (chứa tên arm) chỉ làm `runId` nội bộ. A-0 báo đủ phân vùng, cộng đúng: 258 + 6 + 0 + 0 + 12 = 276, kèm lý do từng nhóm loại và hai kiểm artifact (12/12 độ dài, 6/6 regex). Việc loại 258 dòng không phải bài checklist và 6 dòng regex không có judge được nêu, không giấu. **Bổ sung:** 12 dòng giữ lại là tập do cấu hình (`--judge` chỉ ở cửa sổ W2a, `preregistration.md` §9 SR-07), không phải mẫu ngẫu nhiên của 276; gộp arm nghĩa là κ phản ánh arm nào có judge nhiều hơn. Tôi đã thêm câu này vào Kết luận (a) mục 5. |
| 6 | (b) không báo κ | **Đạt** | G-0 ghi số nhãn người = 0; `agreement.md` không có κ, Accuracy, Precision, Recall hay F1 nào cho bộ vàng; hướng dẫn nói rõ giám đốc tự quyết gán hay không và nhóm không gán thay. `gold-key.csv` tách khỏi tờ gán và không có arm (cột `lượt` là mã L01-L12). Tôi chưa chạy `--gold-score` với tờ trống để xem nó từ chối ra sao: **cần kiểm** (lệnh ở cuối). |
| 7 | Vị thế phân tích (ngoài họ Holm) | **Đạt** | Đã đăng ký ở `preregistration.md` 2.2 §5.1 và §9 V4-02: phân tích phụ/khám phá, không p, không Holm, thêm sau khi đã thu dữ liệu. |

**Việc còn lại sau duyệt.** (1) S5 sửa cảnh báo đa lớp (điểm 3) và thêm test trước khi tính κ MAST. (2) S5 ghi tên trường dùng cho (c) (test ẩn, lệnh kiểm tra, B-02/B-10/CTO) vào `agreement.md` §(c) **trước** khi mở dữ liệu để định nghĩa không trôi theo kết quả. (3) Người có quyền chạy lệnh chạy lại các lệnh ở mục Tái lập, và `node docs/research/analysis/agreement.mjs --gold-score` trên tờ trống để xác nhận nó từ chối thay vì in số.

## Tái lập

```bash
node --test docs/research/analysis/agreement.test.mjs
node docs/research/analysis/agreement.mjs                       # in mọi bảng
node docs/research/analysis/agreement.mjs --check docs/research/analysis/agreement.md
node docs/research/analysis/agreement.mjs --make-gold           # sinh lại gold-sheet.csv, gold-key.csv
```

- Dữ liệu: `git show 838a5f1:bench/vs-claude/results/study-cloud/runs.jsonl`, sha256 `85db4ddbb65e12482cc7acb57e31154192ce22655d298061c9a437edce9b5d39` (script từ chối chạy nếu hash lệch), 276 dòng. Artifact: `bench/vs-claude/results/study-cloud/artifacts/<khóa>/`.
- Môi trường: Node ≥ 22 (chạy với v24.14.0), không gói ngoài, offline, không gọi LLM. `bench/` và `src/` không bị sửa. Seed 20261103; B = 2000.
- `--check` kiểm: các bảng trùng từng ký tự, hash ảnh chụp, `gold-key.csv` trùng bản sinh lại, các cột không phải nhãn của `gold-sheet.csv` trùng bản sinh lại (nên vẫn đạt khi đã điền nhãn).
