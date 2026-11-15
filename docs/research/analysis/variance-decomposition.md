# R14 — Tách phương sai log(B7/A0), CI dự kiến cho B7′ và bảng điểm dừng

> Phòng Nghiên cứu · vòng 4, gói 1b, hạng mục S2 (@data-scientist) · 3/11/2026 · phân loại dữ liệu: nội bộ. Điều kiện cứng của `improvement-backlog.md` §B-11.5 ("Độ rộng CI dự kiến"). Mọi bảng V-0…V-4 là đầu ra nguyên văn của `node docs/research/analysis/variance-decomposition.mjs`; kiểm bằng `--check`.

## Tóm tắt

- Trên t1–t5, phương sai giữa bài σ²_task ≈ 0,097 (token) và 0,099 (thời gian), tương đương phương sai giữa lượt σ²_run ≈ 0,087 / 0,081 (cùng bậc, giữa bài chỉ nhỉnh hơn). CI 90 % của σ²_task chạm 0 (chỉ 5 bài), nên "giữa bài lớn hơn giữa lượt" là **chưa chắc**.
- Nửa độ rộng CI 90 % dự kiến (thang log, mô phỏng, R thật = 1,3): phương án A (10 lượt × 5 bài) **0,218** cho cả hai đại lượng (cận trên ≈ R̂ × 1,24); phương án B (5 lượt × 10 bài) **0,170** nếu bài B7b đồng nhất với t1–t5 (K1), **0,196 / 0,224** theo ước lượng riêng của B7b (K2, token / thời gian), **0,245 / 0,291** nếu B7b nhiễu gấp đôi (K3).
- **Phương án chọn: A** (gần hòa, B chỉ hơn rõ ở giả định lạc quan chưa kiểm). Cả hai phương án đều cho cận trên CI ≈ R̂ × 1,2–1,3, nên kết luận "đạt ≤ ×1,3" chỉ có khi R thật ≲ 1,05; kết luận của backlog về rủi ro "không kết luận" **không đổi**.
- Điểm dừng sau 20 lượt (V-4): với R thật 1,3 / 1,6 / 2,0, P(R̂ > 1,6) = 9,6–10,0 % / 47–48 % / 89–90 % (phương án A).

## Tệp đã lưu

- `docs/research/analysis/variance-decomposition.mjs` (script, Node ≥ 22, không gói ngoài; import `classifyRows`, `bootstrapRatio`, `rng`… từ `prereg-tests.mjs`).
- `docs/research/analysis/variance-decomposition.md` (tệp này).

## Dữ liệu

Nguồn: `bench/vs-claude/results/study-cloud/runs.jsonl` (chỉ đọc). Hash ở V-0 là hash **phần ghim** (240 dòng đầu, tệp lúc phân tích có đúng 240 dòng): sha256 chuẩn hóa LF `3a7c6e52991368875975d55474697c9669311f2c6caf766d3a88c4a4e113e354`, blob git `9e596ff3170b0dedef5df62ede7dadfc790cec8e`. (`sha256sum` trên tệp thô lúc bắt đầu hạng mục cho `b0aaf381da0f7f6bf01cd1c94d999f36ce7a047b65f9f52b3f9b6aa54c914f12`, khác vì tệp có cuối dòng CRLF; script chuẩn hóa CRLF → LF như `prereg-tests.mjs`.) Số dòng theo arm lúc bắt đầu (mọi status): A0-sonnet 91, B7 84 (t1–t5: 45; B7b: 39), B6 19, B0 46; không có dòng failed/error/infra. Không có dữ liệu cá nhân.

## Giao thức đánh giá

Chốt trước khi chạy; chi tiết trong phần đầu script.

1. **Bộ lọc** (giữ đúng `prereg-tests.mjs` + `b7-cost-decomposition.mjs`): `classifyRows().kept` ∩ `status = done`; arm A0-sonnet và B7; bộ t1–t5 và B7b (13 bài có cả hai arm). Không lọc theo score. Số lượt sau lọc (91 A0, 84 B7) khớp số `done` của `b7-cost-decomposition.mjs` ở cùng dữ liệu.
2. **Mô hình:** ℓ_t = TB ln(B) − TB ln(A) theo bài; Var_t(ℓ_t) = σ²_task + TB_t(σ²_B/n_Bt + σ²_A/n_At); σ²_run = σ²_A + σ²_B (phương sai gộp trong ô, một cặp B/A). Ước lượng moment (ANOVA một chiều có hiệu chỉnh cỡ ô không đều), σ²_task cắt ở 0 nếu âm. CI 90 %: bootstrap phân tầng hai mức (lấy lại bài rồi lượt trong ô, từng arm), 4000 vòng, hạt 20261104.
3. **CI dự kiến:** mô phỏng tham số log-chuẩn (300 lần × 500 vòng bootstrap của `bootstrapRatio`), cùng thống kê/CI với `prereg-tests.mjs`; kèm công thức giải tích. R thật = 1,3, hai phương án đều 100 lượt.
4. **Giả định bài B7b (phương án B):** K1 = σ² như t1–t5; K2 = σ² theo ước lượng riêng của B7b; K3 = K2 gấp đôi (độ nhạy). Năm bài thêm giả định có cùng R trung bình với t1–t5 (không có tương tác bài × arm ngoài σ²_task).
5. **Quy tắc phân bổ:** xem V-3 (quy tắc của backlog + quy tắc phụ do S2 thêm, ghi rõ).
6. **Điểm dừng:** V-4, mô phỏng 20000 lần mỗi dòng.

## Kết quả

### V-0. Nhận dạng dữ liệu, bộ lọc, tham số

| Mục | Giá trị |
| --- | --- |
| Script | variance-decomposition v1 (round 4, S2) |
| Số dòng đã ghim (PIN_LINES) | 240 (tệp hiện có 240 dòng) |
| Hash git (blob) `runs.jsonl` (phần ghim) | `9e596ff3170b0dedef5df62ede7dadfc790cec8e` |
| sha256 `runs.jsonl` (phần ghim, LF) | `3a7c6e52991368875975d55474697c9669311f2c6caf766d3a88c4a4e113e354` |
| Lượt sau lọc (kept ∩ done): A0-sonnet / B7 | 91 / 84 |
| Bài t1–t5: lượt A0 / B7 | 45 / 45 |
| Bài B7b (13 bài có cả hai arm): lượt A0 / B7 | 46 / 39 |
| Hạt / vòng bootstrap σ² / mô phỏng độ rộng / mô phỏng điểm dừng | 20261104 / 4000 / 300×500 / 20000 |

### V-1. Tách phương sai log(B7/A0): σ²_task (giữa bài) và σ²_run (giữa lượt trong bài)

σ²_task = phương sai thật giữa bài của log tỷ số (đã trừ phần nhiễu lấy mẫu của ô); σ²_run = σ²_A + σ²_B, phương sai một cặp log(B7/A0) giữa lượt trong bài. CI 90 % = bootstrap phân tầng hai mức (bài rồi lượt), 4000 vòng. "TB log tỷ số" là trung bình theo bài của ℓ_t (tỷ số hình học, không phải thống kê prereg).

| Đại lượng | Bộ bài | Số bài; TB log tỷ số | σ²_task [CI 90 %] | σ²_run [CI 90 %] | σ²_A / σ²_B | So sánh | σ²_task âm trước khi cắt |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| token có trọng số | t1–t5 | 5 bài; 0,891 (×2,44) | 0,0974 [0,0000; 0,1883] | 0,0873 [0,0359; 0,1354] | 0,0156 / 0,0717 | giữa bài > giữa lượt | không |
| token có trọng số | B7b | 13 bài; 0,988 (×2,69) | 0,2138 [0,0691; 0,3478] | 0,0310 [0,0070; 0,0391] | 0,0264 / 0,0046 | giữa bài > giữa lượt | không |
| token có trọng số | gộp t1–t5 + B7b | 18 bài; 0,961 (×2,61) | 0,1675 [0,0639; 0,2789] | 0,0657 [0,0268; 0,0920] | 0,0205 / 0,0453 | giữa bài > giữa lượt | không |
| thời gian thực (wallSec) | t1–t5 | 5 bài; 0,921 (×2,51) | 0,0994 [0,0000; 0,1902] | 0,0809 [0,0360; 0,1151] | 0,0213 / 0,0596 | giữa bài > giữa lượt | không |
| thời gian thực (wallSec) | B7b | 13 bài; 1,406 (×4,08) | 0,3257 [0,1206; 0,5321] | 0,0583 [0,0194; 0,0662] | 0,0492 / 0,0091 | giữa bài > giữa lượt | không |
| thời gian thực (wallSec) | gộp t1–t5 + B7b | 18 bài; 1,271 (×3,57) | 0,2989 [0,1249; 0,4940] | 0,0736 [0,0359; 0,0893] | 0,0339 / 0,0397 | giữa bài > giữa lượt | không |

### V-2. Độ rộng CI 90 % dự kiến của tỷ số hình học theo phương án (R thật = 1,3)

Cả hai phương án đều 100 lượt (50 B7′ + 50 A0, ghép cặp theo bài). "Nửa độ rộng (giải tích)" = 1,645·√(Σ_t(σ²_task,t + σ²_run,t/m)/T²) trên thang log; "nửa độ rộng (mô phỏng)" = trung vị qua 300 lần mô phỏng của (ln hi − ln lo)/2 với CI bootstrap đúng như `prereg-tests.mjs` (500 vòng mỗi lần); cột nhân tử = R̂/cận dưới … cận trên/R̂ (trung vị). Mô phỏng thường hẹp hơn giải tích khi T nhỏ (bootstrap lấy lại bài với T = 5 đánh giá thấp phương sai). Giả định cho 5 bài B7b: xem cột "kịch bản"; ước lượng B7b dựa trên A0 lấy từ cửa sổ khác (xem Giới hạn) nên σ²_task của B7b có thể bị thổi phồng.

| Đại lượng | Phương án | Kịch bản σ² cho bài thêm | nửa độ rộng (giải tích) | nửa độ rộng (mô phỏng) | nhân tử CI quanh R̂ | SD của ln R̂ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| token có trọng số | A: 10 lượt × 5 bài (t1–t5) | ước lượng t1–t5 | 0,240 | 0,218 | ×1,25 … ×1,24 | 0,146 |
| token có trọng số | B: 5 lượt × 10 bài (t1–t5 + 5 bài B7b) | K1: B7b cùng σ² với t1–t5 | 0,176 | 0,170 | ×1,19 … ×1,18 | 0,107 |
| token có trọng số | B: 5 lượt × 10 bài (t1–t5 + 5 bài B7b) | K2: B7b theo ước lượng riêng của B7b | 0,213 | 0,196 | ×1,22 … ×1,22 | 0,132 |
| token có trọng số | B: 5 lượt × 10 bài (t1–t5 + 5 bài B7b) | K3: B7b gấp đôi mọi σ² của ước lượng B7b | 0,274 | 0,245 | ×1,28 … ×1,28 | 0,170 |
| thời gian thực (wallSec) | A: 10 lượt × 5 bài (t1–t5) | ước lượng t1–t5 | 0,241 | 0,218 | ×1,25 … ×1,24 | 0,147 |
| thời gian thực (wallSec) | B: 5 lượt × 10 bài (t1–t5 + 5 bài B7b) | K1: B7b cùng σ² với t1–t5 | 0,177 | 0,170 | ×1,19 … ×1,18 | 0,108 |
| thời gian thực (wallSec) | B: 5 lượt × 10 bài (t1–t5 + 5 bài B7b) | K2: B7b theo ước lượng riêng của B7b | 0,248 | 0,224 | ×1,25 … ×1,25 | 0,153 |
| thời gian thực (wallSec) | B: 5 lượt × 10 bài (t1–t5 + 5 bài B7b) | K3: B7b gấp đôi mọi σ² của ước lượng B7b | 0,327 | 0,291 | ×1,34 … ×1,34 | 0,202 |

### V-3. Áp quy tắc phân bổ của `improvement-backlog.md` §B-11.5 ("Độ rộng CI dự kiến")

Quy tắc trong backlog (đề xuất, ngưỡng chưa kiểm): nếu phương sai giữa bài lớn hơn giữa lượt thì giữ tổng 100 lượt nhưng chia lại sang nhiều bài hơn (thêm bài từ B7b, ít lượt mỗi bài, A0 ghép cặp cùng bài); ngược lại thêm lượt trên cùng 5 bài. Áp dụng: so σ²_task với σ²_run của bộ t1–t5 (V-1) ở từng đại lượng. **Quy tắc phụ do script thêm (S2, cần vì điều kiện phương sai chưa nói B có thật sự hẹp hơn):** chỉ chọn B khi B còn hẹp hơn A theo mô phỏng với σ² của B7b ước lượng từ chính dữ liệu B7b (K2); K1 là cận lạc quan, K3 là cận bi quan. Điều kiện phương sai chỉ so σ²_run với σ²_task *không chia m*, nên không tự suy ra B hẹp hơn: B cũng đổi σ² của bài thêm.

| Đại lượng | σ²_task vs σ²_run (t1–t5) | nửa độ rộng A (mô phỏng) | nửa độ rộng B (K1; K2; K3) | B(K2) − A |
| --- | ---: | ---: | ---: | ---: |
| token có trọng số | 0,0974 vs 0,0873 → giữa bài lớn hơn | 0,218 | K1 0,170; K2 0,196; K3 0,245 | -0,022 (B hẹp hơn) |
| thời gian thực (wallSec) | 0,0994 vs 0,0809 → giữa bài lớn hơn | 0,218 | K1 0,170; K2 0,224; K3 0,291 | 0,006 (B không hẹp hơn) |

**Phương án được chọn: A** — điều kiện phương sai (giữa bài > giữa lượt) thỏa ở 2/2 đại lượng, nhưng theo ước lượng riêng của B7b (K2) B không hẹp hơn A ở 1/2 đại lượng; chênh độ rộng giữa hai phương án ≤ 0,022 trên thang log (gần hòa). B chỉ hơn rõ ở K1 (giả định B7b đồng nhất với t1–t5, chưa kiểm) và kém hơn ở K3. Giữ A: không phụ thuộc giả định chưa kiểm về B7b và ghép được với B7 cũ trên cùng 5 bài.

### V-4. Điểm dừng: xác suất R̂ sau 20 lượt (10 cặp B7′/A0) vượt ngưỡng, theo R thật

Mô phỏng tham số 20000 lần mỗi dòng, σ² lấy từ V-1 (bộ t1–t5; K3 = B7b gấp đôi σ² của ước lượng B7b). R̂ là thống kê prereg (TB hình học theo bài của tỷ số các trung bình; không phải trung vị). 20 lượt = 10 B7′ + 10 A0 xen kẽ, phương án A đã hoàn thành 2 vòng lượt trên 5 bài, phương án B đã hoàn thành 1 vòng trên 10 bài. Cột "R̂: trung vị (5 %…95 %)" cho thấy độ phân tán của R̂. Đọc: nếu R thật = 1,3 mà P(R̂ > 1,6) đáng kể thì ngưỡng dừng 1,6 gây dừng nhầm; nếu R thật = 2,0 mà P(R̂ > 1,6) thấp thì ngưỡng bỏ sót.

| Đại lượng | Phương án | R thật | R̂: trung vị (5 %…95 %) | P(R̂ > 1,45) | P(R̂ > 1,6) | P(R̂ > 1,8) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| token có trọng số | A: 2 lượt × 5 bài (t1–t5) | 1,3 | ×1,28 (×0,97 … ×1,69) | 23,4 % | 9,6 % | 2,1 % |
| token có trọng số | A: 2 lượt × 5 bài (t1–t5) | 1,6 | ×1,58 (×1,20 … ×2,07) | 69,4 % | 47,0 % | 21,5 % |
| token có trọng số | A: 2 lượt × 5 bài (t1–t5) | 2,0 | ×1,97 (×1,50 … ×2,59) | 96,6 % | 89,4 % | 70,2 % |
| token có trọng số | B: 1 lượt × 10 bài (K1) | 1,3 | ×1,26 (×1,01 … ×1,58) | 15,3 % | 4,0 % | 0,5 % |
| token có trọng số | B: 1 lượt × 10 bài (K1) | 1,6 | ×1,56 (×1,24 … ×1,94) | 69,9 % | 42,2 % | 14,0 % |
| token có trọng số | B: 1 lượt × 10 bài (K1) | 2,0 | ×1,94 (×1,55 … ×2,43) | 98,4 % | 92,4 % | 71,0 % |
| token có trọng số | B: 1 lượt × 10 bài (K3) | 1,3 | ×1,30 (×0,96 … ×1,75) | 26,9 % | 12,2 % | 3,7 % |
| token có trọng số | B: 1 lượt × 10 bài (K3) | 1,6 | ×1,60 (×1,18 … ×2,15) | 69,9 % | 49,3 % | 25,4 % |
| token có trọng số | B: 1 lượt × 10 bài (K3) | 2,0 | ×1,99 (×1,47 … ×2,70) | 95,8 % | 88,5 % | 71,0 % |
| thời gian thực (wallSec) | A: 2 lượt × 5 bài (t1–t5) | 1,3 | ×1,29 (×0,98 … ×1,70) | 24,0 % | 10,0 % | 2,2 % |
| thời gian thực (wallSec) | A: 2 lượt × 5 bài (t1–t5) | 1,6 | ×1,59 (×1,21 … ×2,08) | 70,4 % | 48,0 % | 22,2 % |
| thời gian thực (wallSec) | A: 2 lượt × 5 bài (t1–t5) | 2,0 | ×1,98 (×1,51 … ×2,60) | 96,9 % | 90,0 % | 71,3 % |
| thời gian thực (wallSec) | B: 1 lượt × 10 bài (K1) | 1,3 | ×1,28 (×1,02 … ×1,59) | 16,7 % | 4,5 % | 0,5 % |
| thời gian thực (wallSec) | B: 1 lượt × 10 bài (K1) | 1,6 | ×1,57 (×1,26 … ×1,95) | 72,3 % | 44,7 % | 15,3 % |
| thời gian thực (wallSec) | B: 1 lượt × 10 bài (K1) | 2,0 | ×1,96 (×1,57 … ×2,44) | 98,7 % | 93,5 % | 73,6 % |
| thời gian thực (wallSec) | B: 1 lượt × 10 bài (K3) | 1,3 | ×1,31 (×0,91 … ×1,88) | 32,4 % | 17,9 % | 7,2 % |
| thời gian thực (wallSec) | B: 1 lượt × 10 bài (K3) | 1,6 | ×1,62 (×1,13 … ×2,30) | 69,3 % | 51,8 % | 31,3 % |
| thời gian thực (wallSec) | B: 1 lượt × 10 bài (K3) | 2,0 | ×2,02 (×1,41 … ×2,89) | 93,5 % | 85,7 % | 70,1 % |

### Cách dùng cho ngưỡng dừng (gợi ý cho S1, không phải quyết định)

- Ngưỡng R̂ > 1,6 sau 20 lượt (phương án A): dừng nhầm ≈ 10 % nếu R thật = 1,3; chỉ ≈ 47–48 % bắt được R thật = 1,6; ≈ 89–90 % bắt được R thật = 2,0. Ngưỡng 1,45: dừng nhầm ≈ 23–24 % (R thật 1,3), bắt ≈ 69–70 % (1,6), ≈ 97 % (2,0). Sau 10 cặp, R̂ có 90 % khoảng ≈ ×0,97…×1,69 khi R thật = 1,3, nên 20 lượt đầu **không đủ** để phân biệt 1,3 với 1,6 một cách chắc chắn; chỉ đủ để bắt R lớn (≳ 2).
- Hệ quả: dùng 1,6 làm điểm dừng "báo và hỏi" (không phải bác bỏ giả thuyết), vì kết luận chính vẫn phải đợi đủ 100 lượt (backlog §B-11.5 quy tắc dừng (1)).
- Mọi số mô phỏng phụ thuộc σ² ước lượng từ 5 bài và giả định log-chuẩn; R thật ở V-4 là tỷ số kỳ vọng, không phải trung vị.

## Phân tích lỗi

- σ²_task của t1–t5 có CI 90 % [0; ≈ 0,19]: dữ liệu không loại trừ "không có phương sai giữa bài". Với 13 bài B7b σ²_task lớn hơn rõ (0,21 token; 0,33 thời gian) nhưng đây là B7b trộn cửa sổ (A0 B7b lấy từ W1/W2a/W2c trên server main, B7 chạy ở cửa sổ khác: `b7-cost-decomposition.md`), nên σ²_task của B7b gồm cả hiệu ứng cửa sổ, không tách được.
- σ²_B (≈ 0,07) lớn hơn σ²_A (≈ 0,016) trên t1–t5: B7 biến động giữa lượt hơn A0 (số pha và vòng sửa thay đổi); phương án mô phỏng dùng hai phương sai riêng.
- Mô phỏng hẹp hơn giải tích (0,218 so với 0,240) vì bootstrap lấy lại bài với T = 5 đánh giá thấp phương sai giữa bài; CI thật của B7′ có thể rộng hơn con số mô phỏng.

## Tái lập

```
node docs/research/analysis/variance-decomposition.mjs                  # in bảng (≈ 12 giây)
node docs/research/analysis/variance-decomposition.mjs --check docs/research/analysis/variance-decomposition.md
```

Node v24.14.0, hạt cố định (SEED 20261104), không phụ thuộc ngoài. Đổi `PIN_LINES` hay bộ lọc thì phải sinh lại tệp này.

## Giới hạn

- 5 bài t1–t5 cho ước lượng σ²_task rất mỏng; CI 90 % của nó chạm 0 (kết quả "không phân biệt được với 0" là kết quả, không phải lỗi).
- σ² của B7b bị trộn hiệu ứng cửa sổ/server; K1–K3 là giả định, không phải đo. Chưa kiểm tương tác bài × arm riêng cho từng bài B7b.
- Log-chuẩn là giả định; chưa kiểm phân phối đuôi (lượt chạy lại, hết hạn mức).
- Chưa có dữ liệu B7′; mọi số về B7′ là mô phỏng.
- Kết quả không thay đổi kết luận của backlog: với R thật 1,3 hay cao hơn, CI 90 % vẫn quá rộng để "đạt ≤ ×1,3" trừ khi R thật ≲ 1,05.
