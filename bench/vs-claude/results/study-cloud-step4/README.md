# Bước 4 RUNBOOK: phân tích trên 276 lượt `study-cloud`

Phân loại dữ liệu: **Nội bộ** (bài tổng hợp, không có DLCN). Ngày chạy: 2/11/2026 (UTC). Theo yêu cầu chủ dự án: "bước 4 luôn".

## Dữ liệu và cách chạy

- Ảnh chụp `bench/vs-claude/results/study-cloud/runs.jsonl` ở commit `838a5f1` (= `c42e2e3` về nội dung): 276 dòng, gồm W1, W2a–W2c, B7a, B7b, B6b và lượt neo A0-sonnet r10–11. sha256 `85db4ddbb65e12482cc7acb57e31154192ce22655d298061c9a437edce9b5d39`. Các lượt W3 trở đi không nằm trong ảnh chụp này.
- Quarantine §5.0: không có dòng `failed`/`infra`/`leak` nào (`classifyRows` của `prereg-tests.mjs`: giữ 276, loại 0), nên không chuyển dòng nào.
- Không chạy `pairwise.mjs`: `preregistration.md` §9 bảng SR, SR-08a ghi "không chạy pairwise ở vòng này".

| Tệp | Sinh bởi | Nội dung |
|---|---|---|
| `prereg-tests-276.md` | `node docs/research/analysis/prereg-tests.mjs` (đã khóa, sha256 `3020ca47…`; 13/13 test qua), chế độ in, **không** `--write` (không ghi đè `round3-tables.md` của vòng 3) | B-01 (B7), H5, mô tả, H3/H6/H7 trên 276 dòng |
| `step4-extra.mjs`, `step4-extra.md` | Script bổ sung, chỉ import các hàm đã khóa của `prereg-tests.mjs` (`classifyRows`, `bootstrapRatio`, `tostVerdict`, `tostScoreWithCeiling`, `iut`), không sửa chúng | B-01 cho B6 (FL) 9 lượt/bài; B-01 (B7) kèm lượt neo; mô tả B7 trên 13 bài của B7b |
| `analyze-B0.md`, `analyze-B6.md`, `analyze-B7.md`, `summary.csv`, `pareto.csv` | `analyze.mjs <bản sao> --baseline A0-sonnet --treatment X` (`run-plan.md` §5.3) | Bảng H1–H10 của `analyze.mjs`, để đối chiếu |

## Kết quả

1. **B-01 (làn đơn B7) vẫn bị bác bỏ** trên 276 dòng, giống vòng 3 (`docs/research/results-round3.md`): token có trọng số ×2,50 (CI 90 % [2,02; 3,18]), thời gian thực ×2,57 ([2,09; 3,25]); điểm (c) không kết luận vì cả 5 bài chạm trần. Thêm 2 lượt neo A0-sonnet r10–11 không đổi kết luận (×2,52; ×2,58).
2. **B-01 cho làn nhanh B6 (FL), 45/45 lượt: bác bỏ.** Token ×3,92 ([3,49; 4,43]), thời gian ×4,05 ([3,45; 4,76]); bản chỉ cùng cửa sổ W2b (r1–3) cho ×3,89 và ×3,76, cùng kết luận. Điểm (c) không kết luận (chỉ 1 bài không chạm trần).
3. **H5 (B0/A0-sonnet): không đổi so với vòng 3** (W1 ×5,68 token, ×9,60 thời gian, 9/9 bài đạt ngưỡng), mô tả.
4. **B7 trên 13 bài ngoài t1–t5 (mô tả, khác cửa sổ và khác server):** so A0-sonnet token ×2,61 ([2,13; 3,23]), thời gian ×3,97 ([3,11; 5,23]); so B0 token ×0,40, thời gian ×0,41. Chênh lớn nhất ở bài logic ngắn (l1-oncall ×7,6 token, ×14,8 thời gian; l2-knights ×5,4; ×8,3).
5. **Điểm:** gần như mọi ô ở trần 1,00. Ngoại lệ mô tả: A0-sonnet l1-oncall 0,89 và r1-elk-design 0,83 (r1 có `--judge` ở W2a, B7b thì không, nên không so được với B7).
6. **H3, H6, H7, Holm:** như vòng 3. H3 đủ N nhưng không tính p (SR-26), phân phối suy biến (mọi lượt 1,0). H6 thiếu A1/A2 (W4–W5 đang chạy). H7 thiếu N. Họ Holm rỗng (K = 0).

## Đọc `analyze.mjs` thế nào

Nhãn "SUPPORTED"/"not supported" của `analyze.mjs` **không** dùng làm kết luận (`preregistration.md` §2.4, §9 V3-06): H1, H2 chỉ là ước lượng; H5 có lỗi lệch chỉ số SR-06 (dùng bảng H5 của `prereg-tests`); H7 của `analyze.mjs` tính trên 17–18 bài với r = 3, trong khi §3.1 đòi r = 5. `analyze.mjs` gộp mọi cửa sổ và server; `prereg-tests` tách theo cửa sổ.

## Giới hạn

- Các nhãn cửa sổ trong `prereg-tests-276.md` gộp mọi dòng sau W2b vào "B7a" (`WINDOWS` cố định của vòng 3), nên dòng H5 "B7a … 18 bài" có ô `n/a` cho 13 bài của B7b: đây là giới hạn của script, không phải dữ liệu thiếu. Mô tả đúng cho B7b ở `step4-extra.md` §3.
- B6 r1–3 (W2b) và r4–9 (B6b) chạy ở hai cửa sổ khác nhau; A0-sonnet tương ứng cũng vậy. Hai server khác phiên bản (`main` `e0bd2f4` cho B0; nhánh `7fb18ba` cho B6/B7).
- Người chạy đã thấy điểm 2 lượt t1-duration r8 lúc 18:41Z (RUNLOG; §9 V3-09).
