# Kết quả vòng 3, gói 3: phân tích xác nhận B-01 (làn đơn) và H5 trên study-cloud

Phiên bản 1.0 · 3/11/2026 · S3 (R10b), T-20261103-021358-275 · Phân loại dữ liệu: **Nội bộ** (bài tổng hợp, không có DLCN).

## Tóm tắt

**B-01 (làn đơn, B7) bị bác bỏ** trên bản chính và cả hai bản độ nhạy: token có trọng số ×2,498 (CI 90 % [2,02; 3,18]) và thời gian thực ×2,566 ([2,09; 3,25]) so với A0-sonnet, cận dưới cách xa biên 1,15. Phép (c) về điểm không kết luận được vì cả 5 bài t1–t5 chạm trần. B-02 và B-10 **không đủ dữ liệu**: `runs.jsonl` không có trường nào ghi cổng chặn hay duyệt, nên chỉ tiêu của chúng chỉ đo được bằng phát lại B02-M trên ca t5. Khuyến nghị: **không đưa B-01 lên `main` theo chỉ tiêu ±15 %**; B-02, B-10 chưa đề xuất cho tới khi chạy B02-M. Mọi kết luận mang nhãn "khóa muộn, phương án lùi §2.3" (§9 V3-01).

## Nguồn số liệu và cách đọc

- Mọi bảng và con số trong tệp này chép từ `docs/research/analysis/round3-tables.md`, do `docs/research/analysis/prereg-tests.mjs` sinh. Không tính tay.
- Hash commit 1 (script đóng băng): `f530e89bc5f880af983fcbeabbe5ae7c07757873`. sha256 `prereg-tests.mjs`: `3020ca47307bc6553a3ad715952411194256936eed515b50dd4384b804fb6506`. Commit 2 (kết quả `--write`): `3793f95519767cbcffe2f724fbec566fcebb5380`.
- Dữ liệu: `bench/vs-claude/results/study-cloud/runs.jsonl`, 197 dòng, năm cửa sổ (W1, W2a, W2b, W2c, B7a). Không dùng `pilot1`.
- Bootstrap hai tầng (lấy lại bài, rồi lấy lại lượt trong ô), B = 4000, hạt 20261102. Ba trạng thái theo `preregistration.md` §2.4: xác nhận / bác bỏ / không kết luận. Mỗi kết luận dưới đây là một dòng in đậm kèm mức chắc chắn.
- **B0 chạy trên `main` e0bd2f4, B6 và B7 trên nhánh `7fb18ba`; B0 không chạy t1–t5.** Không có so sánh B0 với B7 trên cùng bài.

## 1. Họ Holm {H3, H6}

**Họ Holm rỗng (K = 0): không giả thuyết nào được gọi "xác nhận" bằng Holm ở vòng này.** Mức chắc chắn: cao (là hệ quả trực tiếp của §2.5: SR-26 chưa có mã, H6 thiếu arm A1/A2).

| Giả thuyết | Trạng thái |
|---|---|
| H3 (review, s1) | Đủ N (A0-sonnet 10, B0 10) nhưng **không tính p** (SR-26 chưa có). Hạ xuống ước lượng: recall 0,0 pp [0,0; 0,0], precision 0,0 pp [0,0; 0,0] (n 10/10). Phân phối suy biến (mọi lượt 1,0), nên không cho thông tin phân biệt |
| H6 (A1/A2 ≈ B0) | **Chưa đủ N**, không tính p. Dữ liệu chỉ có arm B0, A0-sonnet, B6, B7; không có A1, A2 |

## 2. H1, H2 (ước lượng kèm CI)

**H1, H2: không báo ước lượng ở vòng này.** `round3-tables.md` không có bảng H1/H2, và theo §2.4 hai giả thuyết này chỉ là ước lượng, không phán "xác nhận/bác bỏ". Nhãn "SUPPORTED" mà `analyze.mjs` in cho chúng không dùng làm kết luận (xem mục 9). Mức chắc chắn: không áp dụng.

## 3. H7

**H7: chưa đủ N, không tính p.** Mức chắc chắn: cao. §3.1 đòi r = 5 mỗi ô và ít nhất 3 bài; chỉ s1-sec-review có r ≥ 5 ở cả A0-sonnet và B0 (1 bài).

## 4. H5 (chi phí) và H4

H4 không phân tích ở vòng này (SR-07: chế độ chấm bị lẫn, §9 V3-08).

H5 ghép cặp chỉ trong cùng cửa sổ. Tỉ số trung vị theo bài của token có trọng số và thời gian thực (treatment/baseline), CI 95 %. "Đạt ngưỡng" là bài có token ≥ 3× **và** thời gian ≥ 1,5×. Ngưỡng này là của H5 (B0/A0); với B6, B7 chỉ để mô tả. Bảng chép từ `round3-tables.md` §3.

| Cặp | Số bài | Token trung vị (CI 95 %) | Thời gian trung vị (CI 95 %) | Đạt ngưỡng (ghép theo bài) | Đạt ngưỡng (analyze.mjs) |
| --- | ---: | --- | --- | --- | --- |
| W1: B0/A0-sonnet | 9 | ×5,68 [5,05; 6,58] | ×9,60 [6,71; 12,80] | 9/9 = 100 % | 9/9 = 100 % |
| W2a: B0/A0-sonnet | 4 | ×9,54 [5,96; 13,96] | ×11,71 [4,70; 23,71] | 4/4 = 100 % | 4/4 = 100 % |
| W2c (s1 r4–10): B0/A0-sonnet | 1 | ×9,32 [8,70; 9,51] | ×11,05 [10,14; 12,55] | 1/1 = 100 % | 1/1 = 100 % |
| W2b: B6/A0-sonnet | 5 | ×3,78 [3,07; 4,91] | ×3,43 [2,80; 4,88] | 5/5 = 100 % | 5/5 = 100 % |
| B7a (chính: A0 r4–9): B7/A0-sonnet | 5 | ×1,99 [1,73; 3,96] | ×1,94 [1,81; 3,94] | 1/5 = 20 % | 1/5 = 20 % |
| Độ nhạy B7a: A0 gộp r1–9 (W2b + B7a) | 5 | ×1,96 [1,74; 3,94] | ×1,93 [1,76; 3,94] | 1/5 = 20 % | 1/5 = 20 % |

**H5, B0 so với A0-sonnet (W1, W2a, W2c): chi phí của B0 cao hơn rõ rệt; mọi bài đạt cả hai ngưỡng (9/9, 4/4, 1/1), mô tả kèm CI, không phải kết luận xác nhận.** Mức chắc chắn: cao cho hướng và độ lớn ở W1 (9 bài); thấp ở W2c (1 bài, CI chỉ phản ánh lấy lại lượt, không có biến thiên giữa bài). W2a có CI rộng (4 bài).

**H5, B6 so với A0-sonnet (W2b): 5/5 bài đạt ngưỡng; token ×3,78 [3,07; 4,91], thời gian ×3,43 [2,80; 4,88]; mô tả.** Mức chắc chắn: vừa (5 bài, 3 lượt mỗi ô).

**H5, B7 so với A0-sonnet (B7a): chỉ 1/5 bài đạt ngưỡng (20 %); token ×1,99 [1,73; 3,96], thời gian ×1,94 [1,81; 3,94]; mô tả.** Bản độ nhạy cho kết quả cùng hướng (×1,96, ×1,93; 1/5). Mức chắc chắn: vừa. Phần lớn chênh nằm ở t4-perf (×4,21 ; ×4,56), bốn bài còn lại ×1,72 đến ×2,28 về token.

Tỉ số theo bài (token ; thời gian), chép từ `round3-tables.md` §3:

- W1 B0: c1-iis-ecs ×5,68 ; ×10,04 · c2-burst-alert ×7,36 ; ×16,13 · c3-shop-bugs ×5,33 ; ×9,06 · c4-audit-chain ×4,50 ; ×5,37 · c5-tickets-api ×4,42 ; ×6,71 · l3-reconcile ×6,68 ; ×9,60 · l4-startup-order ×6,33 ; ×18,46 · re1-lit-synthesis ×5,16 ; ×9,17 · s1-sec-review ×6,02 ; ×11,29
- W2a B0: a1-ambiguous-spec ×6,54 ; ×5,67 · l1-oncall ×13,97 ; ×23,71 · l2-knights ×12,55 ; ×17,75 · r1-elk-design ×5,96 ; ×4,46
- W2c (s1 r4–10) B0: s1-sec-review ×9,32 ; ×11,05
- W2b B6: t1-duration ×3,78 ; ×3,43 · t2-orders ×4,80 ; ×4,73 · t3-api ×3,45 ; ×3,42 · t4-perf ×4,65 ; ×4,64 · t5-logq ×3,07 ; ×2,73
- B7a (chính: A0 r4–9) B7: t1-duration ×1,72 ; ×1,94 · t2-orders ×2,28 ; ×2,85 · t3-api ×1,93 ; ×1,86 · t4-perf ×4,21 ; ×4,56 · t5-logq ×1,99 ; ×1,92

Giới hạn: W1 mở web nhưng không lượt nào gọi (§9 V3-04); từ W2 chặn web. Độ nhạy bỏ W1 khỏi H5 đã đăng ký ở V3-04 **chưa chạy** (không có trong `round3-tables.md`). Hai cột "đạt ngưỡng" bằng nhau ở mọi cặp, nên lỗi lệch chỉ số SR-06 của `analyze.mjs:81-83` không làm sai số liệu ở dữ liệu này.

## 5. B-01 (§3.2): B7 (làn đơn) so với A0-sonnet trên t1–t5

Chỉ token có trọng số (SR-02 chưa xong, không có độ nhạy USD). Cả hai arm trên cùng server nhánh `7fb18ba`. Chọn bản chính trước khi có kết quả (kế hoạch nhiệm vụ; §9 V3-07): A0 chạy cùng cửa sổ B7a.

**Bản chính** (A0 r4–9, cỡ ô 6/6/6/6/6; B7 9/9/9/9/9):

| Phép | R = B7/A0 | CI 90 % | Kết luận |
| --- | ---: | --- | --- |
| (a) token có trọng số | 2,498 | [2,02; 3,18] | bác bỏ |
| (b) thời gian thực | 2,566 | [2,09; 3,25] | bác bỏ |
| (c) điểm (có trần §2.7) | n/a | [n/a; n/a] | không kết luận (trần: còn 0 bài không chạm trần (< 3)) |

**B-01, bản chính (IUT ba phép): BÁC BỎ.** Mức chắc chắn: **cao**. Cận dưới CI của (a) và (b) đều lớn hơn biên 1,15 (quy tắc bác bỏ §3.2: cận dưới > 1,15 ở bất kỳ phép nào), và IUT bác bỏ chỉ cần một phép. Phép (a) không bị ảnh hưởng bởi đe dọa máy dùng chung; vì vậy kết luận không phụ thuộc vào độ nhiễu của thời gian.

**Bản độ nhạy** (chép từ `round3-tables.md` §2):

| Bản | A0 | Cỡ ô A0 / B7 | (a) R [CI 90 %] | (b) R [CI 90 %] | (c) | B-01 |
|---|---|---|---|---|---|---|
| Độ nhạy 1 | gộp W2b + B7a (r1–9) | 9 / 9 | 2,511 [2,05; 3,20] | 2,563 [2,09; 3,27] | không kết luận (trần) | bác bỏ |
| Độ nhạy 2 | chỉ r4–9 cho cả hai arm | 6 / 6 | 2,534 [2,04; 3,22] | 2,609 [2,12; 3,31] | không kết luận (trần) | bác bỏ |

**B-01, hai bản độ nhạy: BÁC BỎ, cùng trạng thái với bản chính** (bác bỏ / bác bỏ / bác bỏ). Mức chắc chắn: cao. Kết luận lấy từ bản chính.

**B-01(c) điểm: KHÔNG KẾT LUẬN.** Mức chắc chắn: cao rằng không thể kết luận. Cả 5 bài t1-duration, t2-orders, t3-api, t4-perf, t5-logq có mọi lượt cả hai arm ≥ 0.99, nên theo §2.7 bị bỏ khỏi bằng chứng điểm; còn 0 bài (< 3). Δ điểm tuyệt đối (B7 − A0, TB theo bài, báo kèm theo §3.2): −0,04 pp ở bản chính và bản gộp, 0,00 pp ở độ nhạy 2. Đây là mô tả; không dùng làm bằng chứng "tương đương".

Điểm theo bài, kiểm tính tương thích để gộp A0 (mô tả):

| Bài | A0 W2b (r1–3) TB | A0 B7a (r4–9) TB | B7 (r1–9) TB |
| --- | ---: | ---: | ---: |
| t1-duration | 1,0000 | 1,0000 | 0,9982 |
| t2-orders | 1,0000 | 1,0000 | 1,0000 |
| t3-api | 1,0000 | 1,0000 | 1,0000 |
| t4-perf | 1,0000 | 1,0000 | 1,0000 |
| t5-logq | 1,0000 | 1,0000 | 1,0000 |

Làn nhanh (B6), làn đơn (B7), B0 trên t1–t5 (**mô tả, không xác nhận; B0 không chạy t1–t5, B0 khác server**), chép từ `round3-tables.md` §4.2:

| Cặp | Chỉ số | R | CI 90 % |
| --- | --- | ---: | --- |
| B6/A0 (W2b) | token | 3,89 | [3,42; 4,43] |
| B6/A0 (W2b) | thời gian | 3,76 | [3,17; 4,51] |
| B7/A0 (B7a) | token | 2,50 | [2,02; 3,18] |
| B7/A0 (B7a) | thời gian | 2,57 | [2,09; 3,25] |
| B7/B6 (khác cửa sổ) | token | 0,65 | [0,55; 0,77] |
| B7/B6 (khác cửa sổ) | thời gian | 0,68 | [0,58; 0,79] |

Quan sát mô tả: B7 rẻ và nhanh hơn B6 (tỉ số dưới 1, CI không chứa 1), nhưng vẫn ngoài biên so với A0-sonnet. So B7/B6 là khác cửa sổ, nên chỉ để tham khảo.

Điểm theo arm trên t1–t5: B6 (W2b) TB 0,9989, B7 (B7a) TB 0,9996, A0-sonnet TB 1,0000 ở cả hai cửa sổ. Bảng điểm theo bài và theo arm đầy đủ ở `round3-tables.md` §4.1.

## 6. B-02 và B-10

**B-02 (cổng chất lượng): KHÔNG ĐỦ DỮ LIỆU.** Mức chắc chắn: cao rằng dữ liệu study-cloud không đo được chỉ tiêu. Chỉ tiêu nghiệm thu của B-02 (`improvement-backlog.md` §4.5) đo bằng `ccoding-task.json` (`review.approved`, `projectChecks.latest[].ok`) và log `checks.run`; B02-M phát lại offline trên ca `t5-logq.ccoding-fastlane.2` (`preregistration.md` §3.2). Dòng `runs.jsonl` của B7 chỉ có `byPhase` (`execute`, `accept`), `calls`, `agentsUsed`, điểm và test ẩn; không có trường ghi cổng chặn hay `approved` (đã tìm khóa `gate`, `approved`, `lane` trong `runs.jsonl`, 0 kết quả; RUNLOG không ghi lượt nào bị cổng chặn). Điểm B7 (t5-logq TB 1,0000) không chứng minh cổng hoạt động, vì A0-sonnet không có cổng cũng đạt 1,0000 ở cùng bài.

**B-10 (cổng phủ kế hoạch): KHÔNG ĐỦ DỮ LIỆU.** Mức chắc chắn: cao. Cùng lý do: chỉ tiêu "bắt ca đã biết", "chặn nhầm", "không chạy kế hoạch dở" cần `ccoding-task.json` (`runs[].subtasks` so với `planSummary`) và phát lại trên `results/C*/`.

Điều kiện để kết luận cả hai: chạy B02-M (phát lại offline trên mọi `results/C*/*/ccoding-task.json`, không tốn hạn mức LLM) trên mã có cổng (nhánh `7fb18ba` hoặc con cháu). Không suy ra từ B-01: B7 đắt hơn A0-sonnet không nói gì về việc cổng có chặn đúng ca hay không.

B02-G, B02-Q, B02-H8b: mô tả, không đạt thống kê (§3.2); không có số ở vòng này.

## 7. Lượt bị loại (§4.1, §4.3)

Nguồn: `docs/research/analysis/excluded-round3.csv` (chỉ có header và ghi chú) và `round3-tables.md` §1.

**Số lượt bị loại: 0 trên 197 dòng.** Mức chắc chắn: cao (cờ Q, L, T, E1, E4 áp tự động, không dùng `score`; số dòng khớp RUNLOG ở mọi cửa sổ).

| Cửa sổ | Server | Dòng đọc | Theo RUNLOG | Bị loại |
| --- | --- | ---: | ---: | ---: |
| W1 | main e0bd2f4 | 54 | 54 | 0 |
| W2a | main e0bd2f4 | 24 | 24 | 0 |
| W2b | nhánh 7fb18ba | 30 | 30 | 0 |
| W2c | main e0bd2f4 | 14 | 14 | 0 |
| B7a | nhánh 7fb18ba | 75 | 75 | 0 |

Cờ giám sát: `failed` do hết giờ 0; `failed`/`error` giữ như kết quả 0; `done` có wallSec ≥ 98 % hạn 0; `done` có token ≈ 0: 0. Cờ L chỉ loại theo `leak`, chưa kiểm tay.

## 8. Sai lệch so với đăng ký

Chi tiết ở `docs/research/preregistration.md` §9 (V3-01 đến V3-12) và §8. Những sai lệch ảnh hưởng tới kết luận:

- **V3-01, khóa muộn:** không có thời điểm khóa; script và hash được ghi sau khi dữ liệu đã có. Hash script ở §8 (commit 1 `f530e89bc5f880af983fcbeabbe5ae7c07757873`). Mọi kết luận mang nhãn "khóa muộn, phương án lùi §2.3".
- **V3-02, V3-03, V3-11:** hai server khác phiên bản (B0 trên `main`, B6/B7 trên nhánh `7fb18ba`); B0 không chạy t1–t5. H5 chỉ ghép cặp cùng cửa sổ.
- **V3-04:** web mở ở W1, chặn từ W2; không lượt nào gọi web.
- **V3-05:** bộ đo sửa ở `7fb18ba` (13:32:43Z), W1 chạy trước bản sửa; commit runner W1 chưa xác minh.
- **V3-06:** SR-01, SR-04, SR-06 dùng phương án lùi bằng script ngoài; SR-02 chưa xong (bỏ độ nhạy USD); SR-26 chưa có (họ Holm rỗng).
- **V3-07:** arm B7 không có trong `run-plan.md`; A0 ở bản chính chỉ 6 lượt mỗi bài, thấp hơn 9 đã đăng ký.
- **V3-08, V3-09:** `--judge` chỉ ở W2a; người chạy đã thấy điểm 2 lượt t1 r8.
- **V3-10:** hai server cùng máy, không có xác nhận cô lập; ảnh hưởng `wallSec`.
- **Sai lệch bổ sung từ phân tích, chưa có dòng trong §9:** quy tắc trần §2.7 đòi đánh giá trần "chỉ bằng pilot", nhưng pilot không có t1–t5 nên script áp quy tắc ở mức lượt trên chính dữ liệu xác nhận (`round3-tables.md` §6). Chiều của sai lệch: không đổi trạng thái (c), vì chỉ làm (c) thành "không kết luận" thay vì để (c) "đạt" giả. Cần S2 hoặc chủ dự án ghi thành mã V3-13.
- **Độ nhạy đã đăng ký nhưng chưa chạy:** bỏ 2 lượt t1 r8 và bỏ bài t1 (V3-09); bỏ W1 khỏi H5 (V3-04). Không có trong `round3-tables.md`. Với B-01(c) hai độ nhạy này không đổi trạng thái vì (c) đã "không kết luận" do trần.

## 9. Chỗ lệch với `analyze.mjs`

Chi tiết ở `docs/research/analysis/analyze-reconcile.md`. Tóm lược:

- **H5 khớp** ở cả năm cặp cùng cửa sổ (token, thời gian, tỉ lệ bài đạt ngưỡng), kể cả bản gộp A0 r1–9. Hiệu điểm theo bài (B7 − A0, B6 − A0) khớp. Số lượt loại khớp (0).
- Lệch có thật nằm ở phép làm, không ở số học: (1) `analyze.mjs` gộp mọi cửa sổ trong một thư mục (B6/A0 gộp cho thời gian lệch 0,1 so với ×3,43 của cặp W2b; số gộp ở `analyze-reconcile.md` §3); (2) phán quyết bằng ước lượng điểm, không bằng CI/TOST; (3) in nhãn "SUPPORTED" cho H1/H2/H7 ở cỡ mẫu và điều kiện trần mà đăng ký không cho gọi như vậy (ví dụ H1 ở W2a chỉ dựa 1 bài); (4) không có B-01, nên B-01 không có số đối chiếu.
- Lỗi SR-06 (`analyze.mjs:81-83`) tồn tại trong mã nhưng không tác động ở dữ liệu này.

## 10. Đe dọa hiệu lực

Chi tiết ở `docs/research/analysis/validity-round3.md` (8 đe dọa, mỗi đe dọa có hướng thiên lệch dự kiến và biện pháp). Những đe dọa ảnh hưởng tới cách đọc kết luận:

- **Arm chạy ở cửa sổ khác nhau (đe dọa 1):** B7 và A0 xen kẽ cùng cửa sổ B7a nên trôi theo thời gian nhỏ hơn; dấu chưa rõ.
- **Gộp hay tách A0 (đe dọa 2):** bản chính tách (n_A0 = 6, CI rộng hơn, thiên về bảo thủ). Bác bỏ B-01 giữ nguyên ở bản gộp, nên lựa chọn không ảnh hưởng kết luận.
- **Máy dùng chung (đe dọa 3):** thổi tỉ số thời gian B7/A0 lên, nên (b) "bác bỏ" ít chắc hơn (a). Kết luận B-01 do (a) giữ vững.
- **Bài chạm trần (đe dọa 4):** (c) không kết luận; thiên về "tương đương" nếu bị bỏ qua.
- **Khóa muộn (đe dọa 6):** thiên về tự do của người phân tích; giảm bằng thứ tự hai commit của S1 và biên, hạt, B đã đăng ký.
- **Ngoại tại (đe dọa 8):** t1–t5 đã dùng để tinh chỉnh CCoding (C1–C8), lạc quan cho B7. Kết quả "bác bỏ" xảy ra dù có lạc quan này, nên chiều thiên lệch này củng cố chứ không làm yếu kết luận bác bỏ.

## 11. Giới hạn của kết quả

- Kết luận chỉ cho t1–t5, A0-sonnet, runtime `claude-cli`, hai server khác nhau; không nói về bài khác hay Opus.
- Chỉ có dữ liệu chi phí ở dạng token có trọng số (USD không dùng, SR-02).
- Không có dữ liệu cho: chọn đúng làn (l1-modules, l2-chain), KPI trước/sau, test ẩn kiểu ĐK-P3 với biên 2 pp (điểm trần).

## Khuyến nghị cho giám đốc

Trích nguyên văn chỉ tiêu từ `docs/research/improvement-backlog.md`: §3.4 (B-01), §4.5 (B-02), "Chỉ tiêu nghiệm thu B-10" (mục B-10, §5). Mọi đề xuất tính tới sai lệch khóa đăng ký (§9 V3-01: không có thời điểm khóa, script ghi sau dữ liệu) và khác server (V3-02, V3-03).

| Hạng mục | Chỉ tiêu nghiệm thu (trích nguyên văn, có §) | Bằng chứng | Đạt / chưa đạt / không đủ dữ liệu | Đề xuất |
|---|---|---|---|---|
| B-01 | §3.4: "Thời gian so với Claude Code đơn cùng mô hình — trong ±15 % (tỉ lệ ∈ [0,85; 1,15])" | (b) R = 2,566, CI 90 % [2,09; 3,25] (bản chính); 2,563 [2,09; 3,27] và 2,609 [2,12; 3,31] ở hai bản độ nhạy | **Chưa đạt** (bác bỏ). Giới hạn: máy dùng chung có thể thổi lên (V3-10) | Chưa đưa lên `main` |
| B-01 | §3.4: "Chi phí — trong ±15 %" | (a) token có trọng số R = 2,498, CI 90 % [2,02; 3,18]; 2,511 [2,05; 3,20]; 2,534 [2,04; 3,22]. Chỉ đo token, USD không dùng (SR-02) | **Chưa đạt** (bác bỏ). Cận dưới CI lớn hơn biên 1,15 ở cả ba bản | Chưa đưa lên `main` |
| B-01 | §3.4: "Test ẩn — không kém hơn, biên 2 điểm %" | Δ điểm (B7 − A0) −0,04 pp (bản chính), 0,00 pp (độ nhạy 2). 5 bài chạm trần, phép (c) "không kết luận" | **Không đủ dữ liệu** (không có phép kiểm không kém hơn; trần che hiệu ứng). Quan sát mô tả: không thấy tụt điểm | Không quyết định được từ dữ liệu này; cần bài có phân tán điểm (t6–t8) nếu chỉ tiêu này quyết định |
| B-01 | §3.4: "KPI — không giảm so với baseline" | Không đo trong study-cloud | **Không đủ dữ liệu** | Cần `GET /api/kpi` trước/sau |
| B-01 | §3.4: "Chọn đúng làn — l1-modules → đa-agent nhanh hơn (ĐK-P5); l2-chain → không đa-agent (ĐK-P6)" | l1-modules, l2-chain không chạy ở study-cloud | **Không đủ dữ liệu** | Cần chạy hai bài này |
| **B-01 (kết luận chung)** | §3.2 `preregistration.md`: IUT của (a), (b), (c), biên [0,85; 1,15] | B-01 bác bỏ ở bản chính và hai bản độ nhạy | **Chưa đạt** | **Chưa.** Không đưa B-01 làn đơn lên `main` theo chỉ tiêu ±15 %. Điều kiện xem lại: giảm chi phí của B7 rồi chạy lại t1–t5 trên máy cô lập, cùng server với A0. Dữ liệu `byPhase` (khám phá, §5 mục 5) chưa phân tích để chỉ ra nguồn chi phí. Ghi chú: B7 rẻ hơn B6 (token 0,65, thời gian 0,68), nhưng đó là mô tả khác cửa sổ và không đổi kết luận so với A0 |
| B-02 | §4.5: "**(R8)** Lượt `approved` khi lệnh đề bài đòi xanh còn đỏ — **0** — phát lại trên C9 phải bắt `t5-logq.ccoding-fastlane.2`" | `runs.jsonl` không có trường cổng, `approved` hay `lane`; RUNLOG không ghi lượt nào bị chặn | **Không đủ dữ liệu** | **Sau điều kiện:** chạy phát lại B02-M trên `results/C*/*/ccoding-task.json` bằng mã có cổng |
| B-02 | §4.5: "Lượt reviewer bị bỏ khi mã đỏ — = số sự kiện `checks.run` đỏ (không còn `review` sau đỏ)"; "Số vòng sửa — ≤ N=2" | Không có log `checks.run` trong dữ liệu study-cloud | **Không đủ dữ liệu** | Như trên (B02-M) |
| B-02 | §4.5: "Test ẩn — không kém hơn Claude Code đơn, biên 2 điểm % (ĐK-P3)" | Xem B-01 test ẩn: trần, không có phép kiểm | **Không đủ dữ liệu** (B02-Q không đạt thống kê, §3.2) | Mô tả; B02-M là phương án lùi |
| B-02 | §4.5: "Hiệu quả — thời gian, chi phí trong ±15 % (như B-01)" | B7 chạy trên nhánh có B-01/B-02/B-10 cùng lúc (RUNLOG dòng 42): token ×2,498, thời gian ×2,566 | **Chưa đạt cho gói B7; không tách riêng được B-02** | Không quy chi phí của B7 cho B-02 hay B-01 riêng; cần đo cổng tách rời |
| B-10 | "Chỉ tiêu nghiệm thu B-10": "Bắt ca đã biết — `t5-logq.ccoding-fastlane.2` bị chặn bởi **cả** quy tắc A và B"; "Chặn nhầm — ≤ 1 lượt bị chặn ngoài ca t5 … `t1-duration.ccoding-fastlane.3` **không** bị chặn"; "Không chạy kế hoạch dở — 0 lượt có số hạng mục đã chạy < số hạng mục tóm tắt tự khai" | Không có phát lại; `runs.jsonl` không có `subtasks` hay `planSummary` | **Không đủ dữ liệu** | **Sau điều kiện:** chạy B02-M (phát lại offline). Không suy ra từ B-01 |
| B-10 | "Lỗi phối hợp trên bộ đo — … tỉ lệ 'bỏ yêu cầu' … không lớn hơn A0-sonnet trên bài coding"; "Chi phí — 0 lượt LLM thêm khi kế hoạch đạt; ≤ 1 lượt plan khi bị chặn" | `byPhase` của B7 chỉ có `execute`, `accept`; không có tên test hỏng theo nhóm trong bảng đã sinh | **Không đủ dữ liệu** | Mô tả; cần tên test (H8b) và log `plan` |

**Tóm lại cho giám đốc:**

1. **B-01 (làn đơn): chưa đưa lên `main`.** Hai chỉ tiêu đo được (thời gian, chi phí) đều bị bác bỏ rõ: cận dưới CI 90 % của cả hai cao hơn nhiều so với biên 1,15, ở cả ba bản phân tích. Các chỉ tiêu còn lại (test ẩn, KPI, chọn đúng làn) không đủ dữ liệu, nên không thể bù cho hai chỉ tiêu đã chưa đạt.
2. **B-02 (cổng chất lượng) và B-10 (cổng phủ kế hoạch): không đủ dữ liệu, chưa đề xuất đưa lên `main`.** Điều kiện duy nhất để quyết định: chạy B02-M (phát lại offline trên `results/C*/`, không tốn hạn mức LLM). B02-M cũng mang giới hạn của backlog: chỉ dựa trên 1 ca (t5 C9 lượt 2). Hai mục này không bị bác bỏ bởi dữ liệu study-cloud; cổng cũng không phụ thuộc vào việc B-01 đạt hay không.
3. **Độ tin cậy:** kết luận bác bỏ B-01 dựa vào phép (a), không bị đe dọa máy dùng chung; sai lệch khóa muộn (V3-01) và n_A0 = 6 không đổi kết luận, vì bản gộp (n = 9) và cả hai bản độ nhạy cho cùng trạng thái. Sai lệch trần §2.7 (mục 8) chỉ ảnh hưởng (c) và cần ghi thành V3-13.
