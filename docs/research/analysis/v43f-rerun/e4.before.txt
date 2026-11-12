# E4 (V4-3e-E4): cổng chất lượng trên bộ bài cài lỗi (B-12) và CTO Opus so với Sonnet (B-16)

Dòng: 203, dùng 192 dòng `done`. Dòng không `done` (đã chạy lại đúng khóa): 11.

## B-12: recall từng cổng

| Cổng | Lượt | Lượt dương thật (lỗi còn tới cổng) | q̂ (CP 95 %) | Recall |
|---|---|---|---|---|
| b02 (g1, g2; B7cab + B7cabO) | 64 | 0 | 0,0 % [0,0 %; 5,6 %] | **chưa ước lượng được** (< 10 dương) |
| cto (g5, g6; B7cab + B7cabO) | 64 | 0 | 0,0 % [0,0 %; 5,6 %] | **chưa ước lượng được** (< 10 dương) |
| b10 (B6 × g3, g4; nhãn theo bài) | 64 | 64 (theo bài) | — | 1/64 = 1,6 % [0,0 %; 8,4 %] |

- b02 chặn 0/64 lượt trên g1/g2; cổng null 0.
- cto chặn 1/64 lượt có test ẩn đạt trên g5/g6.
- b10: cổng null 0 lượt; test ẩn đạt 64/64 lượt, tức lỗi cài ở g3/g4 được agent sửa dù b10 không chặn.

## Lượt sạch (chỉ mô tả; n = 65: {"E3":4,"E5′":40,"E6":21}; test ẩn đạt 63/65)

| Cổng | Chặn / n | CP 95 % | Theo nguồn |
|---|---|---|---|
| b02 | 0/65 | [0,0 %; 5,5 %] | {"E3":"0/4","E5′":"0/40","E6":"0/21"} |
| b10 | 5/60 | [2,8 %; 18,4 %] | {"E3":"0/4","E5′":"5/40","E6":"0/16"} |
| cto | 62/65 | [87,1 %; 99,0 %] | {"E3":"4/4","E5′":"40/40","E6":"18/21"} |

n < 72 nên không tuyên bố "≤ 5 %" (BL B-12 trường 4(b)). Chặn của cto ở bảng này là phán quyết nghiệm thu "chưa đạt"; nhiệm vụ vẫn giao kết quả.

## B-16: CTO Opus (B7cabO) so với Sonnet (B7cab)

- **H-O1 (chính), nghiệm thu sai:** B7cab 0/0, B7cabO 0/0 lượt có lỗi còn nguyên. McNemar chính xác trên 64 cặp: 0 chỉ Sonnet, 0 chỉ Opus, p = 1,000. chạm: < 10 lượt dương thật, H-O1 chưa ước lượng được.
- **Khám phá, ngoài đăng ký (không vào kết luận chính):** chặn trên lượt có test ẩn đạt: B7cab 23/64, B7cabO 1/64. Bất đồng phán quyết CTO: 22 chỉ Sonnet chặn, 0 chỉ Opus chặn (McNemar chính xác p = 4,8e-7, chỉ mô tả).
- **H-O2 (phụ), chi phí mỗi lượt:** B7cab 0,245 USD, 99.415 token có trọng số (pha accept 23.200); B7cabO 0,365 USD, 115.464 (pha accept 34.819). Tỉ số USD 1,49.
- **Điểm dừng CD 3.5:** vô ích: không chạm (USD/lượt Opus ≤ 2 × Sonnet); có hại: không đánh giá được: E4 không có lượt sạch của B7cab/B7cabO (ghi trước); không đủ dương: chạm: < 10 lượt dương thật, H-O1 chưa ước lượng được.
