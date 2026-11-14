# Bộ chấm và cổng chất lượng như bộ phân loại: Accuracy, Precision, Recall, F1, Cohen's κ

> Phòng Nghiên cứu · vòng 4, gói 2, hạng mục S1 (@data-scientist) · 3/11/2026 · phân loại dữ liệu: **Nội bộ** (bài tổng hợp, không có DLCN). Phân tích **phụ/khám phá**, ngoài họ Holm, thêm sau khi đã bắt đầu thu dữ liệu theo yêu cầu của giám đốc ngày 3/11 (ghi vào `preregistration.md` §9 ở bước ghi bản 2.2, không thuộc hạng mục S1). Mọi bảng A-0…A-3, G-0 là đầu ra nguyên văn của `node docs/research/analysis/agreement.mjs`; kiểm bằng `--check`.
> §(a), §(b) do S1 viết; §Duyệt thiết kế do S3; §(c) và §MAST do S5 (@data-scientist) hoàn tất cùng ngày. Bảng C-0…C-3 và M-0…M-4 cũng là đầu ra nguyên văn của script (điền bằng `--fill`, kiểm bằng `--check`).

## Tóm tắt

- Đã có công cụ `agreement.mjs`: ma trận nhầm lẫn, Accuracy, Precision, Recall, F1 (macro-F1 khi nhiều lớp), Cohen's κ, prevalence, PABAK, CI bootstrap theo lượt, cảnh báo "nghịch lý κ". Có 16 test, trong đó bốn ca tính tay, hai test chứng minh bootstrap lấy lại theo lượt, một test cảnh báo đa lớp (sửa theo mục duyệt thiết kế điểm 3) và test Clopper–Pearson/cỡ mẫu.
- **(a) Judge so với regex** trên 12 lượt (84 cặp lượt × mục): khớp thô 0,940, **κ = 0,255** (CI 95 % theo lượt −0,04 … 0,65), PABAK 0,881. κ thấp là **nghịch lý κ**: 95 % mục đạt ở cả hai bên, nên không đọc κ riêng lẻ. 12/14 mục checklist không có bất đồng nào; 5 cặp bất đồng tập trung ở hai mục của r1 (`ilm`, `ingest-throughput`). Đây là độ khớp, không phải độ đúng.
- **(b)** `gold-sheet.csv` (60 mục) và `gold-key.csv` đã chuẩn bị; **chưa có nhãn nên chưa có κ hay Accuracy** cho bộ nhãn vàng.
- **(c) Cổng như bộ phát hiện lỗi:** trên C1–C9 (54 lượt) B-02 chặn 1 lượt, đúng là lượt lỗi, và không chặn nhầm lượt nào trong 50 lượt không lỗi (cận trên CP 7,1 %); nhưng chỉ có 4 lượt lỗi thật (3 lượt B-02 không thể thấy vì lệnh kiểm tra xanh), nên **recall chưa ước lượng được**. Ở ảnh chụp 276 dòng, 120 lượt có cả pha điều phối và test ẩn, 7 lượt lỗi, và đại diện "vào vòng sửa" không bắt lượt nào. B-10 và CTO không đo được (không có trường ghi quyết định). Cần khoảng 25–46 lượt bài cài lỗi để nửa CI 95 % của recall ≤ 0,15 (r = 0,8, q = 0,7); đề xuất B-12, không chạy.
- **κ MAST** (A so với B, 49 thách thức): mức chi tiết κ = 0,673 (CI 0,52 … 0,82), mức nhóm κ = 0,677 (0,52 … 0,83). Lệch chủ yếu do nhãn NA (10/12 lệch nhóm), vì sổ mã chưa nói cách xử lý thách thức chỉ tốn chi phí/độ trễ. Hai người gán cùng họ mô hình nên **không phải κ người–người**; mốc MAST 0,88 và 0,77 chỉ để định vị. Nhãn cuối ở `mast-labels-final.csv`.

## Tệp đã lưu

| Tệp | Nội dung |
|---|---|
| `agreement.mjs` | Thư viện (`metrics`, `bootstrapCI`, `report`, `parseCsv`…), CLI, `--check`, `--make-gold`, `--gold-score`, `--pairs`, `--fill` (điền bảng vào `{{ID}}`); thêm `clopperPearson`, `minPositives`, các bảng C-0…C-3, M-0…M-4 |
| `agreement.test.mjs` | 16 test `node --test` |
| `agreement.md` | Tệp này |
| `gold-sheet.csv`, `gold-key.csv`, `gold-sheet-guide.md` | Bộ nhãn vàng (b): tờ gán nhãn (ẩn arm), đáp án judge/regex, hướng dẫn một trang |
| `mast-labels-A.csv`, `mast-labels-B.csv` | Nhãn FM của hai người gán độc lập (S3, S4); đầu vào của κ MAST |
| `mast-labels-final.csv` | Nhãn cuối sau phân xử (S5): 49 dòng, cột `fm`, `fm_A`, `fm_B`, `nhom`, `ly_do` |

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

> Hạng mục S5 (@data-scientist), 3/11/2026. Phân tích phụ/khám phá, ngoài họ Holm (`preregistration.md` §5.1).

### Định nghĩa chốt trước khi tính (viết trước khi chạy bất kỳ chỉ số nào của (c))

**Những gì tôi đã thấy trước khi chốt.** Chỉ tên cột/trường của `runs.jsonl` (ảnh chụp 276 dòng), `runs.csv`, `phases.csv`, `calls.csv`; số dòng có `byPhase` theo tên pha (không theo arm); số dòng có `details.passed/total`; và `b02m-replay.md` đã công bố (1 ca dương trong 54 lượt). Tôi **chưa** xem nhãn thật (test ẩn < 100 %) hay `revise` theo từng dòng của ảnh chụp.

**Dương thật (lớp "lượt lỗi").** Test ẩn < 100 % (`hidden_pass < hidden_total` ở `runs.csv`; `details.passed < details.total` ở ảnh chụp) **hoặc** lệnh kiểm tra còn đỏ ở trạng thái cuối (cột "sau (latest)" của `b02m-replay.md`, chỉ có ở C1–C9). Ảnh chụp 276 dòng **không có** trạng thái lệnh kiểm tra, nên ở đó nhãn chỉ là test ẩn.

**Dự đoán dương (cổng ghi "không đạt") và nguồn đo được:**

| Cơ chế | Đo được? | Trường |
|---|---|---|
| B-02 (`forceUnapproved`, có lệnh `red-required`) | Chỉ C1–C9 (phát lại offline) | cột "cổng chặn" = `CHẶN` ở `b02m-replay.md` |
| "Đẩy vào vòng sửa" | C1–C9 và ảnh chụp | pha `revise` có mặt: `phases.csv` (cột `phase`) hoặc `byPhase.revise` của dòng ảnh chụp |
| B-10 (đích không hạng mục nào nhận, kế hoạch đọc dở) | **Không**: không có trường ghi quyết định ở nguồn nào | — |
| CTO ghi "không đạt" (pha `accept`) | **Không**: `accept` chỉ có token, không có kết luận | — |

**Đơn vị và gộp.** Mỗi lượt có đúng một dòng ⇒ mỗi lượt đóng góp một lần cổng quyết định (nên "độ nhạy một cặp mỗi lượt" của prereg trùng phân tích chính). `runId` là khóa lượt (có tên arm) chỉ dùng nội bộ để bootstrap, không in. Gộp mọi arm. Hai nguồn đo khác nhau (B-02 thật so với đại diện "vòng sửa") nên **báo riêng, không cộng gộp**. Lượt không có `byPhase` (không đi qua pha điều phối của CCoding, nên không có cổng) và lượt không có test ẩn (bài tài liệu/checklist) bị loại khỏi nguồn ảnh chụp; số bị loại được báo.

**Ngưỡng.** Nếu số lượt dương thật < 10: in "recall chưa ước lượng được" và **không in Recall, F1** (F1 suy từ recall). Vẫn in ma trận nhầm lẫn, số dương thật, số mẫu.

**Biến thể độc lập.** Với C1–C9, nhãn "lệnh còn đỏ" và quyết định B-02 cùng dựa vào `projectChecks.latest`, nên không độc lập; báo thêm biến thể chỉ dùng test ẩn.

### Kết quả (c)

### C-0. Nhận dạng dữ liệu và phạm vi của (c)

| Mục | Giá trị |
|---|---|
| sha256 (đã chuẩn hóa LF) `docs/research/analysis/b02m-replay.md` | `e32d073d1b19694ee3a4274ee0d74a0c60c1c7c42d76d66a34f1ccc7591ca06c` |
| sha256 (đã chuẩn hóa LF) `bench/vs-claude/results/runs.csv` | `128513e2de31727d44d08d11473d27d08dfe51f096e2d8493820fff8012e27f9` |
| sha256 (đã chuẩn hóa LF) `bench/vs-claude/results/phases.csv` | `4641996d769db2f036632eedc44b631dd83e8100a78bf687cb77db4ca187bb9e` |
| sha256 (đã chuẩn hóa LF) `bench/vs-claude/results/calls.csv` | `1d7f9f52365eea7e45ce4e146caa121529561417f1cdd27f1b4d0d68a3ca4e98` |
| sha256 ảnh chụp 276 dòng (`git show 838a5f1:…/runs.jsonl`) | `85db4ddbb65e12482cc7acb57e31154192ce22655d298061c9a437edce9b5d39` |
| C1–C9: lượt CCoding ghép được giữa `b02m-replay.md` và `runs.csv` (có test ẩn) | 54/54 |
| C1–C9: lượt có pha `revise` ở `phases.csv`; ở `calls.csv` không khớp (hai chiều) | 9; 0/0 |
| Ảnh chụp: số dòng | 276 |
| Ảnh chụp, loại: không có `byPhase` (không đi qua pha điều phối, không có cổng) | 101 |
| Ảnh chụp, loại: có `byPhase` nhưng không có test ẩn (bài tài liệu/checklist) | 55 |
| **Ảnh chụp, giữ lại: có `byPhase` và test ẩn** | **120** |

Phân vùng ảnh chụp: 101 + 55 + 120 = 276 dòng. Khóa lượt (`runId`) chứa tên arm nên chỉ dùng nội bộ cho bootstrap, không in. Không đọc dòng nào sau ảnh chụp; C1–C9 có trước ảnh chụp. B-10 và CTO không có trường ghi quyết định ở nguồn nào nên **không đo được** (xem định nghĩa ở trên).
### C-1. Cổng như bộ phát hiện lượt lỗi, C1–C9 (gộp mọi arm)

Lớp dương = lượt lỗi. Mỗi lượt một lần cổng quyết định, nên "một cặp mỗi lượt" trùng phân tích chính. CI 95 % bootstrap theo lượt, B = 2000, seed 20261103. Recall và F1 chỉ in khi ≥ 10 lượt dương thật. Nhãn "lệnh còn đỏ" và quyết định B-02 cùng đọc `projectChecks.latest` (không độc lập), nên dòng 2 và 4 dùng nhãn chỉ-test-ẩn.

| Cổng ↔ nhãn lỗi thật | n lượt | Dương thật | Dự đoán dương | TP/FN/FP/TN | Accuracy | Precision | Recall | F1 | κ | PABAK | Prevalence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| B-02 chặn ↔ lỗi thật (test ẩn < 100 % hoặc lệnh còn đỏ) | 54 | 4 | 1 | 1/3/0/50 | 0,944 [0,87; 1,00] | 1,000 [1,00; 1,00] | chưa ước lượng được (4 dương thật < 10) | chưa tính (suy từ recall) | 0,382 [0,00; 1,00] | 0,889 [0,74; 1,00] | 0,07 |
| B-02 chặn ↔ chỉ test ẩn < 100 % (biến thể độc lập) | 54 | 4 | 1 | 1/3/0/50 | 0,944 [0,87; 1,00] | 1,000 [1,00; 1,00] | chưa ước lượng được (4 dương thật < 10) | chưa tính (suy từ recall) | 0,382 [0,00; 1,00] | 0,889 [0,74; 1,00] | 0,07 |
| vòng sửa ↔ lỗi thật (test ẩn < 100 % hoặc lệnh còn đỏ) | 54 | 4 | 9 | 1/3/8/42 | 0,796 [0,69; 0,91] | 0,111 [0,00; 0,33] | chưa ước lượng được (4 dương thật < 10) | chưa tính (suy từ recall) | 0,057 [-0,14; 0,35] | 0,593 [0,37; 0,81] | 0,07 |
| vòng sửa ↔ chỉ test ẩn < 100 % | 54 | 4 | 9 | 1/3/8/42 | 0,796 [0,69; 0,91] | 0,111 [0,00; 0,33] | chưa ước lượng được (4 dương thật < 10) | chưa tính (suy từ recall) | 0,057 [-0,14; 0,35] | 0,593 [0,37; 0,81] | 0,07 |

⚠ B-02 chặn ↔ lỗi thật (test ẩn < 100 % hoặc lệnh còn đỏ); B-02 chặn ↔ chỉ test ẩn < 100 % (biến thể độc lập): NGHỊCH LÝ κ: prevalence (tham chiếu) = 0,074, tỉ lệ dương dự đoán = 0,019 nằm ngoài [0,1; 0,9], hầu hết ô chạm trần; κ = 0,382 có thể thấp dù khớp thô = 0,944. Đọc kèm PABAK = 0,889 (không phụ thuộc phân bố lớp).

⚠ vòng sửa ↔ lỗi thật (test ẩn < 100 % hoặc lệnh còn đỏ); vòng sửa ↔ chỉ test ẩn < 100 %: NGHỊCH LÝ κ: prevalence (tham chiếu) = 0,074, tỉ lệ dương dự đoán = 0,167 nằm ngoài [0,1; 0,9], hầu hết ô chạm trần; κ = 0,057 có thể thấp dù khớp thô = 0,796. Đọc kèm PABAK = 0,593 (không phụ thuộc phân bố lớp).
### C-2. Vòng sửa như bộ phát hiện lượt lỗi, ảnh chụp 276 dòng (gộp mọi arm)

Chỉ nhãn test ẩn (ảnh chụp không có trạng thái lệnh kiểm tra). "Vòng sửa" là đại diện: không phân biệt vòng sửa do cổng, reviewer hay CTO kích hoạt. Cùng cách đọc như C-1.

| Cổng ↔ nhãn lỗi thật | n lượt | Dương thật | Dự đoán dương | TP/FN/FP/TN | Accuracy | Precision | Recall | F1 | κ | PABAK | Prevalence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| vòng sửa (`byPhase.revise`) ↔ test ẩn < 100 % | 120 | 7 | 0 | 0/7/0/113 | 0,942 [0,90; 0,98] | n/a | chưa ước lượng được (7 dương thật < 10) | chưa tính (suy từ recall) | 0,000 [0,00; 0,00] | 0,883 [0,80; 0,97] | 0,06 |

⚠ vòng sửa (`byPhase.revise`) ↔ test ẩn < 100 %: NGHỊCH LÝ κ: prevalence (tham chiếu) = 0,058, tỉ lệ dương dự đoán = 0,000 nằm ngoài [0,1; 0,9], hầu hết ô chạm trần; κ = 0,000 có thể thấp dù khớp thô = 0,942. Đọc kèm PABAK = 0,883 (không phụ thuộc phân bố lớp).
**Đọc kết quả, mô tả, không suy diễn "cổng tốt/xấu".**

1. **Đo được gì.** (i) Trên C1–C9 (54 lượt), cổng B-02 phát lại offline chặn 1 lượt và lượt đó là lỗi thật (precision 1/1; CP 95 % [2,5 %; 100 %], tức không thông tin); **0 chặn nhầm trong 50 lượt không lỗi** (cận trên CP 95 % 7,1 %). (ii) Pha `revise` ("vào vòng sửa") có ở 9/54 lượt C1–C9, chỉ 1 trong 9 là lượt lỗi thật (precision 0,111, 8 vòng sửa ở lượt không có test ẩn hỏng). Nguồn không ghi cơ chế nào kích hoạt vòng sửa, nên không suy ra được ai (cổng, reviewer) gây ra; đại diện này chỉ cho biết "có vào vòng sửa", không phải "cổng chặn". (iii) Ở ảnh chụp 276 dòng, 120 lượt có cả pha điều phối lẫn test ẩn, 7 lượt lỗi thật, và **0 lượt vào pha `revise`**: đại diện này không bắt được lượt nào, precision không xác định (0/0).
2. **Không đo được gì.** **Recall chưa ước lượng được** ở cả ba phép (4 dương thật ở C1–C9, 7 ở ảnh chụp, đều < 10 lượt), nên Recall và F1 không được in. B-10 và CTO không có trường ghi quyết định ở nguồn nào, nên **không có phép đo** cho hai cơ chế này. Ba lỗi thật mà B-02 bỏ qua ở C1–C9 là lượt có test ẩn hỏng nhưng lệnh kiểm tra trong repo xanh ở trạng thái cuối (chỉ một lượt có lệnh đỏ ở cột "sau (latest)" của `b02m-replay.md`); B-02 đọc `projectChecks.latest` nên **không thể thấy** loại lỗi này theo thiết kế, đó là giới hạn của phép đo chứ chưa phải thất bại của cổng.
3. **Vì sao biến thể "chỉ test ẩn" giống dòng chính.** Nhãn "lệnh còn đỏ" không thêm lượt dương nào ngoài test ẩn hỏng (cùng 4 dương thật); biến thể độc lập vì thế không đổi kết luận, nhưng cũng không chứng minh nhãn và cổng độc lập.
4. **Nghịch lý κ.** Prevalence lỗi 0,07 (C1–C9) và 0,06 (ảnh chụp), tỉ lệ dương dự đoán 0,02 hoặc 0: κ rơi vào vùng cảnh báo (CI [0,00; 1,00] ở dòng 1, và κ = 0 ở C-2 là hệ quả của việc không dự đoán dương nào, không phải "ngẫu nhiên"). Đọc PABAK và ma trận nhầm lẫn, không đọc κ riêng lẻ.
5. **Cổng can thiệp vào nhãn.** Nhãn lỗi thật đo ở **cuối** lượt, sau khi cổng và vòng sửa đã chạy; lượt mà cổng chặn và vòng sửa chữa xong sẽ không còn lỗi, nên bị tính là dương giả: precision là cận dưới, recall (nếu có) có thể bị thổi phồng. Một lần cổng quyết định mỗi lượt nên không có tương quan trong lượt; tương quan **giữa** các lượt (cùng bài, cùng cửa sổ) không được bootstrap theo lượt bắt lại.
6. **Hai nguồn đo khác nhau.** C1–C9 dùng B-02 thật (phát lại), ảnh chụp chỉ có đại diện "vòng sửa"; không cộng gộp hai nguồn. Gộp mọi arm nên không có điểm theo arm (kiểm bằng grep ở mục Tái lập).

### Cỡ mẫu cho recall của cổng (đề xuất B-12, không chạy)

### C-3. Số lượt bài cài lỗi để nửa độ rộng CI 95 % của recall ≤ 0,15

Mục tiêu: nửa độ rộng CI 95 % của recall ≤ 0,15, tính bằng Clopper–Pearson chính xác (x = làm tròn r·n; n nhỏ nhất mà điều kiện đúng cho cả 10 giá trị n kế tiếp). **Mọi giá trị r, ρ, q dưới đây là giả định**, không ước lượng được từ dữ liệu hiện có (quá ít dương thật). Cột: r = recall kỳ vọng; "dương cần" = số quyết định dương thật nếu các quyết định độc lập; m = số lỗi cài trong một lượt; ρ = hệ số tương quan nội cụm giữa các quyết định cùng lượt; hệ số thiết kế DEFF = 1 + (m − 1)·ρ; "quyết định cần" = ⌈dương cần × DEFF⌉; lượt cần = ⌈quyết định cần / (m·q)⌉ với q = xác suất một lỗi cài sẵn còn nguyên đến cổng (agent không tự sửa trước). Với m = 1 mỗi lượt một quyết định nên DEFF = 1 và bootstrap theo lượt trùng bootstrap theo mục.

| r | Dương cần (độc lập) | m; ρ | DEFF | Quyết định cần | Lượt cần, q = 1,0 | q = 0,7 | q = 0,5 |
|---|---|---|---|---|---|---|---|
| 0,6 | 45 | 1; 0,0 | 1,00 | 45 | 45 | 65 | 90 |
| 0,6 | 45 | 3; 0,3 | 1,60 | 72 | 24 | 35 | 48 |
| 0,6 | 45 | 5; 0,5 | 3,00 | 135 | 27 | 39 | 54 |
| 0,8 | 32 | 1; 0,0 | 1,00 | 32 | 32 | 46 | 64 |
| 0,8 | 32 | 3; 0,3 | 1,60 | 52 | 18 | 25 | 35 |
| 0,8 | 32 | 5; 0,5 | 3,00 | 96 | 20 | 28 | 39 |
| 0,9 | 21 | 1; 0,0 | 1,00 | 21 | 21 | 31 | 42 |
| 0,9 | 21 | 3; 0,3 | 1,60 | 34 | 12 | 17 | 23 |
| 0,9 | 21 | 5; 0,5 | 3,00 | 63 | 13 | 18 | 26 |

Đơn giá tham chiếu (C1–C9, 54 lượt CCoding): trung bình 0,95 USD và 210 giây mỗi lượt (`runs.csv`, `cost_usd`, `wall_s`); chỉ để ước cỡ chi phí của B-12, không phải đo đạc cho đề xuất đó.
**Đọc.** Với recall kỳ vọng 0,8 và nếu 70 % lỗi cài sẵn còn nguyên đến cổng (q = 0,7): cần khoảng **46 lượt** khi mỗi lượt cài một lỗi (DEFF = 1), hay **25–28 lượt** khi mỗi lượt cài 3–5 lỗi tương quan (ρ = 0,3–0,5), tức 32 dương thật độc lập hoặc 52–96 quyết định tương quan. Nếu recall thật gần 0,6 hoặc q = 0,5 thì con số lên 64–90 lượt. Nhiều lỗi mỗi lượt giảm số lượt nhưng tăng số quyết định cần vì DEFF, và hiệu quả đó phụ thuộc ρ, chưa có số đo. Thêm lượt không lỗi: 0 chặn nhầm trong n lượt cho cận trên CP ≤ 5 % cần n ≥ 72 (hiện có 50 lượt không lỗi, cận trên 7,1 %). Đề xuất đầy đủ ở `improvement-backlog.md` mục B-12; **không chạy** trong gói này.

## MAST: κ giữa hai người gán nhãn C-01…C-49

> Hạng mục S5 (@data-scientist), 3/11/2026. Phân tích phụ/khám phá, ngoài họ Holm. Đơn vị lấy mẫu lại là C-xx (**không có cấu trúc lượt**). Hai người gán: A = @methodologist (S3), B = @research-lead (S4), gán độc lập theo `mast-codebook.md`. **Hai người gán là hai agent cùng họ mô hình**, nên đây không phải κ người–người.

### Thứ tự và độc lập (đối chiếu git)

### M-0. Đối chiếu commit và nhận dạng tệp nhãn MAST

| Tệp | Commit thêm tệp | Thời điểm commit (author date) | Commit cha | sha256 (LF) |
|---|---|---|---|---|
| `mast-codebook.md` | `b780cab13a0b9b95ab5e4b2548b112d5c987c5b3` | 2026-11-03 10:21:14 (UTC+7) | `925c5ea` | `541073162910b10ca29a745773c4446d2620fb404df524d10fabb2fc722ac0f7` |
| `mast-labels-B.csv` (S4, research-lead) | `2cfa9e566405cd57eccc65010c3c495790cf5b5b` | 2026-11-03 10:24:21 (UTC+7) | `476fdf4` | `cf49f8fb69823a58f1293a2d084978b76fd8a9ef58ca02f95bf040ef512ac082` |
| `mast-labels-A.csv` (S3, methodologist) | `8fe4abff5b3c189b91ad5bd3f2c061be28418c04` | 2026-11-03 10:28:15 (UTC+7) | `75b0c95` | `a6b202f1ec373735f6968368eaa49ba3ed1973f14ccbf772ecbdec3d9e5c6d9c` |

Kiểm bằng `git log --diff-filter=A --format=%H%x09%aI%x09%P -- <tệp>` và `git merge-base --is-ancestor`. Thứ tự commit: mast-codebook.md → mast-labels-B.csv → mast-labels-A.csv. Sổ mã là tổ tiên của commit B: có; của commit A: có. **Commit B là tổ tiên của commit A: không; commit A là tổ tiên của commit B: không.** Cha của commit A (`75b0c95`) có chứa commit B: không; cha của commit B (`476fdf4`) có chứa commit A: không. Hai nhánh làm việc tách từ cùng bản có sổ mã và không thấy tệp của nhau trong lịch sử git. Thời điểm commit là lúc CCoding bàn giao hạng mục, **không phải** lúc gán nhãn; dòng comment đầu mỗi tệp chỉ ghi ngày 3/11/2026. Git không chứng minh được việc không bàn nhãn ngoài lịch sử (xem giới hạn).
### κ, PABAK, CI

### M-1. κ giữa người gán A và B, C-01…C-49 (CI bootstrap theo C-xx)

Ref = nhãn A, pred = nhãn B; mỗi C-xx một đơn vị (**không có cấu trúc lượt**: không có `runId`, bootstrap lấy lại từng C-xx), B = 2000, seed 20261103. "Lớp có mặt" = số nhãn xuất hiện ở A hoặc B; k này cũng dùng cho PABAK và được giữ cố định khi lấy lại mẫu. Precision, Recall là macro (không trọng số lớp, lớp vắng tính 0), F1 là macro-F1; Accuracy, κ, PABAK đối xứng giữa A và B. "Lớp lớn nhất" = tỉ lệ lớp đông nhất ở A / ở B. Mẫu 49 với nhiều lớp thưa: CI rất rộng. Trùng nhãn chi tiết 36/49, trùng nhóm 37/49 (độ khớp giữa hai người gán, không phải độ đúng).

| Mức | n | Lớp có mặt | Accuracy | Precision (macro) | Recall (macro) | macro-F1 | κ | PABAK | Lớp lớn nhất A / B |
|---|---|---|---|---|---|---|---|---|---|
| 1. Chi tiết: 14 FM + INF + NA (16 nhãn khả dĩ) | 49 | 11 | 0,735 [0,61; 0,86] | 0,618 | 0,615 | 0,592 [0,46; 0,77] | 0,673 [0,52; 0,82] | 0,708 [0,57; 0,84] | 0,37 / 0,35 |
| 1b. Chỉ cặp mà cả hai gán FM (14 nhãn khả dĩ) | 17 | 7 | 0,882 [0,71; 1,00] | 0,821 | 0,786 | 0,796 [0,60; 1,00] | 0,858 [0,64; 1,00] | 0,863 [0,66; 1,00] | 0,24 / 0,24 |
| 2. Nhóm: FM-1, FM-2, FM-3, INF, NA (5 lớp) | 49 | 5 | 0,755 [0,63; 0,88] | 0,815 | 0,827 | 0,780 [0,64; 0,87] | 0,677 [0,52; 0,83] | 0,694 [0,54; 0,85] | 0,37 / 0,35 |
| 3. Nhóm, bỏ cặp có NA ở một bên: FM-1, FM-2, FM-3, INF | 35 | 4 | 0,914 [0,83; 1,00] | 0,930 | 0,923 | 0,925 [0,82; 1,00] | 0,869 [0,71; 1,00] | 0,886 [0,77; 1,00] | 0,49 / 0,49 |

Không có cảnh báo nghịch lý κ (không lớp nào > 0,9).
### M-2. Ma trận nhầm lẫn theo nhóm (hàng = A, cột = B)

| A \ B | FM-1 | FM-2 | FM-3 | INF | NA | Tổng A |
|---|---|---|---|---|---|---|
| **FM-1** | 7 | 0 | 0 | 1 | 7 | 15 |
| **FM-2** | 0 | 2 | 0 | 0 | 0 | 2 |
| **FM-3** | 1 | 0 | 7 | 0 | 1 | 9 |
| **INF** | 1 | 0 | 0 | 16 | 1 | 18 |
| **NA** | 0 | 0 | 0 | 0 | 5 | 5 |
| **Tổng B** | 9 | 2 | 7 | 17 | 14 | 49 |

Lệch nhóm: 12/49 C-xx, trong đó 9 có NA ở một bên. Không thể nói bên nào "đúng" khi chưa có chuẩn vàng.
**Đọc kết quả.**

1. **Mức chi tiết (16 nhãn khả dĩ, 11 nhãn có mặt):** trùng 36/49, κ = 0,673 (CI 95 % theo C-xx 0,52 … 0,82), PABAK 0,708. **Mức nhóm (FM-1/2/3, INF, NA):** trùng 37/49, κ = 0,677 (0,52 … 0,83). Không có cảnh báo nghịch lý κ (lớp lớn nhất 0,37 và 0,35).
2. **Nguồn lệch chính là nhãn NA, không phải ranh giới giữa các FM.** Trong 12 C-xx lệch nhóm, 10 có NA ở một bên; riêng B gán NA cho 14 C-xx so với 5 của A. Khi bỏ cặp có NA (mức 3, n = 35) κ = 0,869 (0,71 … 1,00); khi chỉ xét 17 cặp mà cả hai gán FM, 15/17 trùng chi tiết, κ = 0,858 (0,64 … 1,00). Hai kết quả này chỉ để chẩn đoán nguồn lệch: bỏ cặp theo nhãn đã gán là chọn mẫu theo kết quả, nên **không dùng làm κ chính**.
3. **Nguyên nhân của chỗ lệch NA** là một khoảng trống của sổ mã: không nói rõ cách xử lý thách thức *chỉ tốn chi phí hoặc độ trễ với đầu ra đúng* (C-02, C-03, C-05, C-09, C-10, C-12, C-42). B tự đặt quy ước "chi phí/thời gian thuần → NA" (ghi ở dòng comment đầu `mast-labels-B.csv`), A gán FM-1.x. Sổ mã §4 vừa cho NA là nhãn "không phải lỗi hệ", vừa cấm dùng NA khi gán được FM dù gượng. Đây là việc cần sửa ở sổ mã (S2) trước một vòng gán mới; S5 không sửa sổ mã.
4. **Mốc để định vị (không so trực tiếp được):** MAST báo κ người–người 0,88 (Mục 3.2 bản v3) và κ LLM–người 0,77 (Bảng 2, o1 few-shot) (`related-work.md` §2.12). Mốc của MAST đo trên *vết hội thoại* với 14 kiểu lỗi, còn đây đo trên 49 *thách thức dự án* với thêm hai nhãn tự đặt (INF, NA) và mẫu nhỏ hơn nhiều; κ mức chi tiết 0,67 nằm dưới cả hai mốc, κ khi bỏ NA 0,87 gần 0,88, nhưng con số sau chọn mẫu theo nhãn nên không có giá trị so sánh.

### Phân xử và nhóm cuối

### M-3. Phân xử: nhãn cuối so với A và B

| Mục | Giá trị |
|---|---|
| Số C-xx lệch nhãn chi tiết giữa A và B | 13 |
| Nhãn cuối trùng A (trong số lệch) | 8 |
| Nhãn cuối trùng B (trong số lệch) | 5 |
| Nhãn cuối khác cả A và B | 0 |
| Số C-xx trùng A và B mà nhãn cuối khác (phải bằng 0) | 0 |
| Phân bố nhóm của nhãn cuối: FM-1 / FM-2 / FM-3 / INF / NA | 13 / 2 / 7 / 18 / 9 |
| sha256 `mast-labels-final.csv` (LF) | `307990796474e92ab37a819c01196562c9c90e4086e4a7a421d8baaf44938d38` |

Kiểm `mast-labels-final.csv`: 49 dòng, mỗi dòng một nhãn hợp lệ, cột `fm_A`, `fm_B` trùng hai tệp gốc. Phân xử bởi một người (data-scientist, vai người thứ ba), **không độc lập với việc đọc cả hai nhãn**; đây không phải đo độ tin cậy, chỉ là chốt nhãn để dùng ở `challenges.md`.
### M-4. Nhóm gốc trong challenges.md (theo khoảng mã) so với nhóm cuối

| Nhóm gốc \ nhóm cuối | FM-1 | FM-2 | FM-3 | INF | NA | Tổng |
|---|---|---|---|---|---|---|
| **FM-1** (C-01…C-14) | 7 | 1 | 0 | 1 | 5 | 14 |
| **FM-2** (C-15…C-23) | 3 | 1 | 0 | 5 | 0 | 9 |
| **FM-3** (C-24…C-32) | 0 | 0 | 7 | 0 | 2 | 9 |
| **INF** (C-33…C-49) | 3 | 0 | 0 | 12 | 2 | 17 |

Nhóm gốc = tiêu đề mục 1.1–1.4 của `challenges.md` (một tác giả gán, trước khi có sổ mã). Trùng nhóm cuối: 27/49. Khớp thô 0,551 và κ = 0,412 (nhóm cuối có thêm lớp NA mà nhóm gốc không có nên κ chỉ mang tính mô tả; **nhóm cuối do chính người phân xử chốt**, không độc lập với nhóm gốc).
**Phân xử.** Với 13 chỗ lệch tôi chọn nhãn theo thứ tự quy tắc §5 của sổ mã (1 nguyên nhân gốc, 2 loại INF/NA trước, 3 điểm can thiệp), mỗi chỗ kèm một câu lý do trong `mast-labels-final.csv`. Chỗ A và B trùng nhãn chi tiết thì giữ nguyên, không xét lại. Riêng nhóm 7 C-xx "chỉ tốn chi phí/độ trễ", tôi dùng một **quy tắc bổ sung của người phân xử** (không có trong sổ mã, ghi ở dòng comment của tệp nhãn cuối): chỉ gán FM khi nêu được yếu tố hướng tới agent (prompt, vai trò, luồng thông tin, điều kiện dừng, kiểm chứng) mà chỗ sửa nằm ở đó; nếu chỉ là mã/tham số điều phối với đầu ra đúng thì NA. Quy tắc này chọn B ở C-10, C-12, C-42 và A ở C-02, C-03, C-05, C-09, nên **kết quả không nghiêng về một người gán**; nhưng nó là một lựa chọn có thể bị phản bác, và đổi quy tắc sẽ đổi các nhãn đó (C-02…C-42: 7 nhãn).

**Nhận xét mô tả, không suy diễn nhân quả.** Theo nhãn cuối, nhóm FM-2 (lệch phối hợp giữa agent) chỉ còn 2/49 C-xx (C-04, C-22) so với 9 mục dưới tiêu đề FM-2 của `challenges.md`; 5 trong 9 mục đó được xếp INF (lỗi worktree, gộp, `node_modules`, tranh agent). Nhóm INF lớn nhất (18/49) và NA có 9. Nhóm gốc theo tiêu đề trùng nhóm cuối 27/49 (M-4): phân nhóm một người gán trước đây **không** tái hiện được nếu áp sổ mã. Mẫu 49 là số sự cố được ghi, không phải tần suất.

### Giới hạn

1. **Hai người gán cùng họ mô hình, cùng đọc `challenges.md` và sổ mã**: sai lệch chung (ví dụ cùng bị neo bởi tiêu đề nhóm trong `challenges.md`) làm κ cao hơn κ người–người; κ này là cận trên của độ tin cậy giữa các người chú thích độc lập.
2. **Độc lập chỉ kiểm được qua git và lời khai trong tệp.** Hai commit tách từ cùng bản có sổ mã và không thấy tệp của nhau (M-0); thời điểm commit là lúc bàn giao hạng mục, không phải lúc gán. Không kiểm được việc hai bên không trao đổi ngoài git (biên bản vòng họp không có nội dung nhãn).
3. **Nhãn cuối do một người phân xử** đã đọc cả A lẫn B, và chọn quy tắc bổ sung ở trên. Nhãn cuối là nhãn làm việc, chưa có người thứ hai kiểm; không tính κ giữa nhãn cuối và A hay B (không độc lập).
4. **Mẫu nhỏ, lớp thưa:** 49 C-xx, 11 nhãn có mặt; nhiều ô ma trận rỗng, CI bootstrap (phân vị) rộng và xấp xỉ. FM-2 chỉ có 2 mục nên không nói được gì về FM-2.
5. **Sổ mã chưa đối chiếu Phụ lục A và H của MAST** (S2 chỉ đọc 100.000/160.349 ký tự đầu), cột "Không nhận" là suy luận của người soạn; nếu lệch phụ lục thì phụ lục thắng.
6. **INF và NA không thuộc 14 kiểu của MAST**: κ mức chi tiết trộn hai loại nhãn đó với 14 FM.

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
node docs/research/analysis/agreement.mjs --table C-1           # một bảng của (c); C-0…C-3, M-0…M-4
node docs/research/analysis/agreement.mjs --pairs tệp.csv       # κ cho cặp nhãn bất kỳ (cột ref,pred[,runId])
node docs/research/scripts/consistency-check.mjs
# không có điểm theo arm trong §(c) (kết quả phải rỗng):
awk '/^## \(c\)/,/^## MAST/' docs/research/analysis/agreement.md | grep -nE "\b(B0|A0|B7)\b"
```

- Dữ liệu (c): bốn tệp ở C-0 (`b02m-replay.md`, `runs.csv`, `phases.csv`, `calls.csv`), sha256 sau khi chuẩn hóa LF được ghim trong `agreement.mjs`; lệch thì script dừng. Ảnh chụp 276 dòng cùng hash như (a). Không dòng nào sau ảnh chụp; C1–C9 có trước. Không gọi LLM.
- Dữ liệu (κ MAST): `mast-labels-A.csv`, `mast-labels-B.csv`, `mast-labels-final.csv`, `mast-codebook.md` (sha256 ở M-0, M-3); `challenges.md` chỉ đọc để kiểm đủ C-01…C-49.

- Dữ liệu: `git show 838a5f1:bench/vs-claude/results/study-cloud/runs.jsonl`, sha256 `85db4ddbb65e12482cc7acb57e31154192ce22655d298061c9a437edce9b5d39` (script từ chối chạy nếu hash lệch), 276 dòng. Artifact: `bench/vs-claude/results/study-cloud/artifacts/<khóa>/`.
- Môi trường: Node ≥ 22 (chạy với v24.14.0), không gói ngoài, offline, không gọi LLM. `bench/` và `src/` không bị sửa. Seed 20261103; B = 2000.
- `--check` kiểm: các bảng trùng từng ký tự, hash ảnh chụp, `gold-key.csv` trùng bản sinh lại, các cột không phải nhãn của `gold-sheet.csv` trùng bản sinh lại (nên vẫn đạt khi đã điền nhãn).
