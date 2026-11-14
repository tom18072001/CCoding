# Quyết định chia việc có hiệu quả không (BRIEF-22, K2)

Phân loại dữ liệu: **Nội bộ**. Chỉ mô tả; không có p-value (các đợt khác nhau không gộp, vận hành thật không có đối chứng). Mọi bảng do `scorecard.mjs` sinh; kiểm bằng `node docs/research/analysis/decisions/scorecard.mjs --check`.

Phân vai: chia việc = **trưởng phòng** (bóc tách, khâu `plan`) + **hàm chọn làn** (`src/lane.ts:129`, không gọi LLM) + lập lịch theo `dependsOn`/`maxParallel` (`src/orchestrator.ts`). `cto` chỉ nghiệm thu; khi giám đốc nói "quyết định của CTO" về chia việc thì đó là ba thành phần trên.

## 3a. Vận hành thật: giới hạn tốc độ nằm ở cấu trúc kế hoạch hay ở lập lịch

<!-- BEGIN:ops -->
| Nhóm | Cho phép (work/cp) trung vị | Đạt được (work/span) trung vị | Tiết kiệm tối đa theo cấu trúc ≈ 1−cp/work | Tiết kiệm đạt được ≈ 1−span/work | Vượt đường găng: trung vị / q3 |
|---|---|---|---|---|---|
| P (56 lượt) | 1,41 | 1,28 | 29,2 % | 22,1 % | 2,7 % / 17,0 % |
| P/dev (35) | 1,49 | 1,28 | 32,7 % | 22,1 % | 8,1 % / 23,3 % |
| P/research (21) | 1,33 | 1,28 | 24,9 % | 22,1 % | 1,1 % / 2,9 % |
| Văn phòng phụ (5) | 1,62 | 1,54 | 38,1 % | 35,0 % | 5,0 % / 7,5 % |

Các cột "≈" suy từ trung vị bằng phép nghịch đảo: chỉ là xấp xỉ (trung vị của tỉ số khác tỉ số của trung vị); dữ liệu từng lượt không nằm trong repo nên không tính lại được chính xác.
<!-- END:ops -->

<!-- BEGIN:opsDetail -->
| Chỉ số (P, 56 lượt) | Giá trị | Ghi chú |
|---|---|---|
| Lượt có ≥ 2 hạng mục chạy cùng lúc | 42/56 = 75,0 % [61,6; 85,6] | CI Clopper–Pearson 95 % tính ở đây trên 56 lượt (khác 42/54 của P-1: P-1 chỉ tính 54 lượt có ≥ 2 hạng mục đủ mốc giờ) |
| Lượt có hạng mục dài nhất > 50 % tổng thời lượng | 10/56 = 17,9 % [8,9; 30,4] | Cấu trúc: một hạng mục nuốt phần lớn việc |
| Lượt 1 hạng mục | 2/56 | Không có gì để song song |
| Tỉ trọng hạng mục dài nhất (trung vị, IQR) | 35,7 % (27,9 %–46,9 %) |  |
| Mất cân bằng (dài nhất / trung vị) (trung vị, IQR) | 1,65 (1,47–2,14) |  |
| Độ rộng cấu trúc (n / độ sâu) (trung vị, IQR) | 1,67 (1,33–2,33) |  |
| Vượt đường găng (span/cp − 1) (trung vị, q3) | 2,7 % (q3 17,0 %) | Phần do lập lịch, giới hạn luồng, chờ gộp |
| Làm lại (trung vị, q3) | 22,5 % (q3 40,0 %) | Tỉ lệ hạng mục `attempts > 1` |
| Văn phòng phụ: lượt có hạng mục dài nhất > 50 % | 3/5 = 60,0 % [14,7; 94,7] | n=5, CI rất rộng; mọi lượt là việc phát triển chính CCoding |
<!-- END:opsDetail -->

Đọc **[Mô tả]**:
- Trên 56 lượt P, song song đạt được (trung vị 1,28) thấp hơn mức cấu trúc cho phép (1,41) một chút; thời gian vượt đường găng chỉ trung vị 2,7 %. Phần lớn giới hạn tốc độ nằm ở **cấu trúc kế hoạch** (chuỗi phụ thuộc và hạng mục dài nhất), không phải lập lịch. Đây cũng là kết luận của P-2 (771 so với 717 phút ở các lượt có chạy chồng, `p-parallel/RUNLOG.md`).
- Có đuôi: phòng Dev có vượt đường găng 8,1 % (q3 23,3 %), nên ở một phần lượt lập lịch/chờ gộp/giới hạn luồng có góp. Phòng Nghiên cứu sát đường găng (1,1 %) nhưng có hạng mục dài nhất lớn hơn (43,3 %).
- Văn phòng phụ (5 lượt): hạng mục dài nhất chiếm trung vị 51,3 %, 3/5 lượt vượt 50 %; mọi lượt có song song (maxConc ≥ 2). Mẫu quá nhỏ để kết luận.
- Kế hoạch 1 hạng mục hiếm (2/56): trưởng phòng hầu như luôn chia. Câu hỏi "chia có hợp lý không" chưa trả lời được vì không có đối chứng chất lượng chia (E9).

## 3b. Bench: token và wall so với A0 cùng đợt

<!-- BEGIN:ratios -->
| Đợt | Arm | Bài | Lượt CC / A0 | Token có trọng số ÷ A0 (trung vị bài, IQR) | Wall ÷ A0 (trung vị bài, IQR) | Điểm − A0 (TB bài) | Pass − A0 (TB bài) | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| `b7prime` | B7cab | 5 | 10 / 10 | 1,60 (1,39–2,42) | 1,65 (1,56–2,49) | 0,000 | 0,0 điểm % | cùng đợt |
| `e8-parallel` | B6w4 | 3 | 18 / 18 | 2,11 (1,76–3,03) | 1,39 (1,00–1,78) | -0,004 | -22,2 điểm % | cùng đợt |
| `e8-parallel` | B6w1 | 3 | 18 / 18 | 2,03 (1,73–3,02) | 2,10 (1,80–3,04) | -0,010 | -11,1 điểm % | cùng đợt |
| `large-pilot` | B0 | 2 | 2 / 2 | 1,70 (1,41–1,99) | 2,09 (1,65–2,53) | 0,000 | 0,0 điểm % | cùng đợt |
| `large-pilot` | B1 | 2 | 2 / 2 | 1,69 (1,50–1,88) | 1,66 (1,52–1,81) | 0,000 | 0,0 điểm % | cùng đợt |
| `pilot1` | B0 | 13 | 13 / 13 | 5,90 (5,11–6,68) | 9,97 (8,12–12,58) | 0,010 | 7,7 điểm % | cùng đợt |
| `pilot1` | B5 | 13 | 13 / 13 | 1,48 (1,34–1,64) | 2,32 (1,92–3,08) | 0,000 | 0,0 điểm % | cùng đợt |
| `study-cloud` | B0 | 18 | 59 / 109 | 6,34 (5,43–7,09) | 9,06 (6,27–10,87) | 0,016 | 8,4 điểm % | cùng thư mục, có thể khác cửa sổ chạy |
| `study-cloud` | B6 | 18 | 84 / 109 | 4,01 (3,36–4,84) | 5,20 (3,99–7,41) | 0,013 | 3,5 điểm % | cùng thư mục, có thể khác cửa sổ chạy |
| `study-cloud` | B7 | 18 | 84 / 109 | 2,40 (2,00–3,19) | 3,07 (2,28–4,53) | 0,016 | 7,2 điểm % | cùng thư mục, có thể khác cửa sổ chạy |
| `study-cloud` | B5 | 13 | 39 / 109 | 1,53 (1,34–1,98) | 2,44 (1,92–3,20) | 0,007 | 3,3 điểm % | cùng thư mục, có thể khác cửa sổ chạy |

Tỉ số từng bài = TB các lượt arm CCoding ÷ TB các lượt A0-sonnet của cùng bài, rồi lấy trung vị qua bài. Mô tả, không có p; các đợt khác nhau không gộp. `study-cloud` gồm nhiều cửa sổ chạy nên so sánh trong đợt này không phải cặp cùng cửa sổ.
<!-- END:ratios -->

**[Mô tả]**: mọi arm CCoding đắt hơn A0-sonnet ở mọi đợt có cả hai; điểm trung bình lệch ≤ 0,016 so với A0 (chạm trần); riêng `e8-parallel` (3 bài ghép) tỉ lệ pass thấp hơn A0 11–22 điểm % ở cả hai arm, n quá nhỏ để đọc. Phần còn lại khớp với kết luận B-01 trong `paper/paper.md` v0.7.1, không thêm hiệu ứng nào.
- `pilot1` và `study-cloud` B0 (đủ phòng) ×6 token, ×9–10 wall: đắt nhất.
- B7 (làn đơn) ×1,6–2,4; B5 (một agent `senior-swe`) ×1,5.
- Đợt `e8-parallel` chỉ có 3 bài có cả ba arm trong tính toán ghép; xem mục 3d.

## 3c. Tỉ trọng token các khâu phối hợp

<!-- BEGIN:phases -->
| Nhóm | Lượt | route | plan | discuss | review | synthesize | accept | **Phối hợp (tổng)** | execute | revise |
|---|---|---|---|---|---|---|---|---|---|---|
| Mọi lượt CCoding `done` có byPhase | 632 | 2,0 % | 9,5 % | 1,0 % | 3,1 % | 2,7 % | 12,1 % | 31,6 % | 67,8 % | 0,7 % |
| arm B0 | 101 | 2,7 % | 9,2 % | 1,4 % | 6,8 % | 8,3 % | 10,0 % | 39,5 % | 59,1 % | 1,3 % |
| arm B5 | 52 | 0,0 % | 0,0 % | 0,0 % | 34,3 % | 0,0 % | 0,0 % | 34,3 % | 57,8 % | 7,9 % |
| arm B6 | 152 | 4,7 % | 15,8 % | 0,0 % | 2,8 % | 0,0 % | 17,7 % | 41,0 % | 58,2 % | 0,8 % |
| arm B7 | 84 | 0,0 % | 3,5 % | 0,0 % | 4,2 % | 0,0 % | 24,5 % | 32,2 % | 67,8 % | 0,0 % |
| arm B7cab | 87 | 0,0 % | 16,2 % | 0,0 % | 0,0 % | 0,0 % | 22,3 % | 38,5 % | 61,4 % | 0,1 % |
| arm B7cabO | 76 | 0,0 % | 19,1 % | 0,0 % | 0,0 % | 0,0 % | 30,5 % | 49,7 % | 50,2 % | 0,1 % |
| arm B6w4 | 18 | 2,2 % | 7,8 % | 0,0 % | 0,0 % | 0,0 % | 8,6 % | 18,6 % | 80,9 % | 0,5 % |
| arm B6w1 | 18 | 2,2 % | 8,2 % | 0,0 % | 0,0 % | 0,0 % | 8,6 % | 19,0 % | 81,0 % | 0,0 % |
| arm B0F | 20 | 0,9 % | 4,7 % | 4,9 % | 0,0 % | 3,4 % | 2,3 % | 21,8 % | 78,2 % | 0,0 % |
| arm B1F | 20 | 1,2 % | 6,8 % | 0,0 % | 0,0 % | 3,7 % | 3,0 % | 14,7 % | 85,3 % | 0,0 % |
| làn single | 42 | 1,6 % | 0,0 % | 0,0 % | 0,0 % | 0,0 % | 31,8 % | 33,4 % | 66,6 % | 0,0 % |
| làn fast | 252 | 2,4 % | 13,0 % | 0,0 % | 0,0 % | 0,0 % | 14,8 % | 30,2 % | 69,6 % | 0,2 % |
| làn full | 40 | 1,0 % | 5,6 % | 2,9 % | 0,0 % | 3,5 % | 2,6 % | 18,8 % | 81,2 % | 0,0 % |

Tỉ trọng = tổng `byPhase` (token có trọng số) của khâu ÷ tổng `byPhase` của nhóm. "Phối hợp" = route + plan + discuss + finalize + review + synthesize + accept (finalize không in cột riêng vì nhỏ).
<!-- END:phases -->

**[Mô tả]**:
- Khâu `accept` là khâu phối hợp lớn nhất ở làn nhanh/đơn (đến khoảng 30 % ở B7cabO, bài nhỏ); `plan` ~13–19 % ở làn nhanh; `route` chỉ vài %.
- Khâu `review` chỉ xuất hiện ở đợt `study-cloud`; ở các đợt có `lane` bằng 0 (xem ghi chú ở `scorecard.md`).
- Chi phí phối hợp cố định tương đối lớn trên bài nhỏ; trên bài lớn (làn full) tỉ trọng phối hợp thấp hơn (khoảng 19 %). Đây là quan sát chéo đợt, không phải hiệu ứng của làn.

## 3d. Số hạng mục với chi phí, thời gian, điểm

<!-- BEGIN:relation -->
| Nhóm (đợt `e8-parallel`) | Lượt `done` | subtasksTimed trung vị (min–max) | maxConcSubtasks trung vị (min–max) | ρ(số hạng mục, token) | ρ(số hạng mục, wall) | ρ(số hạng mục, điểm) | ρ(maxConc, wall) | pass |
|---|---|---|---|---|---|---|---|---|
| B6w4 | 18 | 4 (2–5) | 4 (1–4) | 0,78 | 0,32 | 0,25 | -0,04 | 13/18 |
| B6w1 | 18 | 4 (3–6) | 1 (1–1) | 0,83 | 0,83 | 0,29 | — | 15/18 |
| cả hai arm | 36 | 4 (2–6) | 1 (1–4) | 0,80 | 0,44 | 0,26 | -0,50 | 28/36 |

ρ = Spearman, mô tả; không có p. Mẫu trộn nhiều bài (kích thước bài khác nhau) nên ρ lẫn hiệu ứng bài, không phải hiệu ứng của việc chia.
<!-- END:relation -->

<!-- BEGIN:w4w1 -->
B6w4 ÷ B6w1 cùng bài (đợt `e8-parallel`, 3 bài): token có trọng số 0,99 (IQR 0,99–1,01); wall 0,55 (IQR 0,48–0,60); số hạng mục TB của B6w4 theo bài 3,50 (IQR 3,33–4,25). Mô tả; không p (cặp cùng đợt, nhưng báo cáo E8 mới là nơi có kiểm định đăng ký trước).
<!-- END:w4w1 -->

<!-- BEGIN:agentsUsed -->
Mọi lượt CCoding (586 lượt trong 43 nhóm đợt-bài có ≥ 3 lượt): ρ(agentsUsed, token ÷ TB nhóm) = 0,62; ρ(agentsUsed, wall ÷ TB nhóm) = 0,59. Đã chuẩn hóa theo nhóm đợt-bài; arm khác nhau (đủ phòng so với một agent) lẫn vào, nên là mô tả, không nhân quả.
<!-- END:agentsUsed -->

**[Mô tả]**: trong `e8-parallel`, số hạng mục tương quan mạnh với token (ρ ≈ 0,8) và với wall ở B6w1 (ρ ≈ 0,8); ở B6w4 tương quan với wall yếu hơn (ρ ≈ 0,3) vì hạng mục chạy chồng. Đợt này chỉ có 2 arm và ít bài nên mọi ρ lẫn hiệu ứng bài. Chỉ `e8-parallel` có `subtasksTimed`/`maxConcSubtasks`; các đợt khác ghi `agentsUsed`.

## 3e. Ước lượng chia kém ảnh hưởng hiệu suất toàn hệ thống bao nhiêu

<!-- BEGIN:impact -->
| Kênh | Ước lượng (mô tả) | Cách tính | Giới hạn |
|---|---|---|---|
| Thời gian, vận hành thật: trần theo cấu trúc kế hoạch | tiết kiệm tối đa ≈ 29,2 % (IQR 15,3–40,9 %) so với chạy lần lượt | 1 − cp/work từ `potentialSpeedup` (P, 56 lượt) | Thời lượng là thời lượng đã xảy ra; không biết kế hoạch khác có tốt hơn không |
| Thời gian, vận hành thật: đạt được | tiết kiệm ≈ 22,1 % (IQR 0,0–37,7 %) | 1 − span/work từ `achievedSpeedup` | Lẫn thời gian chờ hạn mức nếu có |
| Phần mất do lập lịch (không do cấu trúc) | trung vị 2,7 % so với đường găng; q3 17,0 %; hiệu "tối đa − đạt" theo trung vị ≈ 7,1 điểm % | slackOverCp và hiệu hai cột trên | Hiệu hai trung vị là xấp xỉ |
| Phần kế hoạch không chia được hoặc chia lệch | 10/56 = 17,9 % [8,9; 30,4] lượt có hạng mục dài nhất > 50 %; 2/56 lượt 1 hạng mục | `decomp-agg.json` | Không biết có nên chia hay không (cần E9) |
| Chi phí phối hợp trong bench (token) | tổng khâu phối hợp ≈ 31,6 % token có trọng số (mọi lượt CCoding); trung vị theo lượt 43,7 % (IQR 30,6–52,0 %) | Σ byPhase của khâu ÷ Σ byPhase | Gồm cả khâu accept/review có giá trị riêng ngoài việc chia |
| Chi phí tổng so với A0 (bench) | xem bảng tỉ số: trung vị bài của mỗi arm ở mục 3b | mục 3b | Chi phí gồm cả vai khác ngoài bóc tách; không tách riêng "chia kém" |
<!-- END:impact -->

Trả lời có khoảng, **[Mô tả]**:
- **Thời gian (vận hành thật):** nếu kế hoạch chạy hết song song theo cấu trúc hiện có, tiết kiệm tối đa khoảng 29 % (IQR 15–41 %) so với lần lượt; thực tế đạt khoảng 22 %. Chênh giữa hai trung vị ≈ 7 điểm %, là phần lập lịch có thể cải thiện; phần còn lại phụ thuộc vào việc kế hoạch có hạng mục độc lập hay không.
- **Cấu trúc xấu rõ ràng:** khoảng 18 % lượt (10/56) có hạng mục dài nhất > 50 % tổng thời lượng; ở các lượt đó song song không thể cho nhiều hơn 2 lần.
- **Token:** chi phí phối hợp chiếm khoảng 32 % token có trọng số trong bench, nhưng phần này gồm cả accept/review có giá trị riêng. Không tách được phần "do chia kém".
- Không có thước đo trực tiếp "kế hoạch tốt/kém" nên không có con số "mất X % vì chia kém". Việc cần chạy: E9 (đăng ký ở K4) đo chất lượng bóc tách và lợi ích của planner mạnh.

## Khóa facts.json đề xuất (tiền tố `brief22.`)

<!-- BEGIN:facts -->
| Khóa | Giá trị |
|---|---|
| `brief22.bench.ccodingRuns` | 632 |
| `brief22.bench.ccodingRunsWithLane` | 334 |
| `brief22.bench.escalatedFrom` | 143 |
| `brief22.bench.escalatedFromDetail` | single 143 |
| `brief22.bench.lane.fast.runs` | 252 |
| `brief22.bench.lane.fast.withReview` | 0 |
| `brief22.bench.lane.full.runs` | 40 |
| `brief22.bench.lane.full.withReview` | 0 |
| `brief22.bench.lane.single.runs` | 42 |
| `brief22.bench.lane.single.withReview` | 0 |
| `brief22.eff.P.anyParallel` | 42/56 |
| `brief22.eff.P.anyParallelCi` | 61,6–85,6 % |
| `brief22.eff.P.gapPp` | 7.1 |
| `brief22.eff.P.longestOver50` | 10/56 |
| `brief22.eff.P.longestOver50Ci` | 8,9–30,4 % |
| `brief22.eff.P.saveAchieved` | 22.1 |
| `brief22.eff.P.saveAchievedHi` | 37.7 |
| `brief22.eff.P.saveAchievedLo` | 0 |
| `brief22.eff.P.saveStructural` | 29.2 |
| `brief22.eff.P.saveStructuralHi` | 40.9 |
| `brief22.eff.P.saveStructuralIqr` | 15,3–40,9 % |
| `brief22.eff.P.saveStructuralLo` | 15.3 |
| `brief22.eff.agentsUsed.n` | 586 |
| `brief22.eff.agentsUsed.rhoTokens` | 0.62 |
| `brief22.eff.agentsUsed.rhoWall` | 0.59 |
| `brief22.eff.ccoding.failPass` | 26/632 |
| `brief22.eff.e8.B6w1.n` | 18 |
| `brief22.eff.e8.B6w1.rhoConcWall` | — |
| `brief22.eff.e8.B6w1.rhoSubTokens` | 0.83 |
| `brief22.eff.e8.B6w1.rhoSubWall` | 0.83 |
| `brief22.eff.e8.B6w4.n` | 18 |
| `brief22.eff.e8.B6w4.rhoConcWall` | -0.04 |
| `brief22.eff.e8.B6w4.rhoSubTokens` | 0.78 |
| `brief22.eff.e8.B6w4.rhoSubWall` | 0.32 |
| `brief22.eff.e8.all.n` | 36 |
| `brief22.eff.e8.all.rhoConcWall` | -0.5 |
| `brief22.eff.e8.all.rhoSubTokens` | 0.8 |
| `brief22.eff.e8.all.rhoSubWall` | 0.44 |
| `brief22.eff.e8.w4w1.tasks` | 3 |
| `brief22.eff.e8.w4w1.tokens` | 0.99 |
| `brief22.eff.e8.w4w1.wall` | 0.55 |
| `brief22.eff.fixRounds.runsWithFix` | 6/334 |
| `brief22.eff.office.longestOver50Ci` | 14,7–94,7 % |
| `brief22.eff.phase.acceptShare` | 12.1 |
| `brief22.eff.phase.arm.B0.coordShare` | 39.5 |
| `brief22.eff.phase.arm.B0F.coordShare` | 21.8 |
| `brief22.eff.phase.arm.B1F.coordShare` | 14.7 |
| `brief22.eff.phase.arm.B5.coordShare` | 34.3 |
| `brief22.eff.phase.arm.B6.coordShare` | 41 |
| `brief22.eff.phase.arm.B6w1.coordShare` | 19 |
| `brief22.eff.phase.arm.B6w4.coordShare` | 18.6 |
| `brief22.eff.phase.arm.B7.coordShare` | 32.2 |
| `brief22.eff.phase.arm.B7cab.coordShare` | 38.5 |
| `brief22.eff.phase.arm.B7cabO.coordShare` | 49.7 |
| `brief22.eff.phase.coordShare` | 31.6 |
| `brief22.eff.phase.coordShareRunIqr` | 30,6–52,0 % |
| `brief22.eff.phase.coordShareRunMedian` | 43.7 |
| `brief22.eff.phase.discussShare` | 1 |
| `brief22.eff.phase.executeShare` | 67.8 |
| `brief22.eff.phase.lane.fast.coordShare` | 30.2 |
| `brief22.eff.phase.lane.full.coordShare` | 18.8 |
| `brief22.eff.phase.lane.single.coordShare` | 33.4 |
| `brief22.eff.phase.planShare` | 9.5 |
| `brief22.eff.phase.reviewShare` | 3.1 |
| `brief22.eff.phase.routeShare` | 2 |
| `brief22.eff.phase.runs` | 632 |
| `brief22.eff.phase.synthesizeShare` | 2.7 |
| `brief22.eff.ratio.b7prime.B7cab.tasks` | 5 |
| `brief22.eff.ratio.b7prime.B7cab.tokens` | 1.6 |
| `brief22.eff.ratio.b7prime.B7cab.wall` | 1.65 |
| `brief22.eff.ratio.e8-parallel.B6w1.tasks` | 3 |
| `brief22.eff.ratio.e8-parallel.B6w1.tokens` | 2.03 |
| `brief22.eff.ratio.e8-parallel.B6w1.wall` | 2.1 |
| `brief22.eff.ratio.e8-parallel.B6w4.tasks` | 3 |
| `brief22.eff.ratio.e8-parallel.B6w4.tokens` | 2.11 |
| `brief22.eff.ratio.e8-parallel.B6w4.wall` | 1.39 |
| `brief22.eff.ratio.large-pilot.B0.tasks` | 2 |
| `brief22.eff.ratio.large-pilot.B0.tokens` | 1.7 |
| `brief22.eff.ratio.large-pilot.B0.wall` | 2.09 |
| `brief22.eff.ratio.large-pilot.B1.tasks` | 2 |
| `brief22.eff.ratio.large-pilot.B1.tokens` | 1.69 |
| `brief22.eff.ratio.large-pilot.B1.wall` | 1.66 |
| `brief22.eff.ratio.pilot1.B0.tasks` | 13 |
| `brief22.eff.ratio.pilot1.B0.tokens` | 5.9 |
| `brief22.eff.ratio.pilot1.B0.wall` | 9.97 |
| `brief22.eff.ratio.pilot1.B5.tasks` | 13 |
| `brief22.eff.ratio.pilot1.B5.tokens` | 1.48 |
| `brief22.eff.ratio.pilot1.B5.wall` | 2.32 |
| `brief22.eff.ratio.study-cloud.B0.tasks` | 18 |
| `brief22.eff.ratio.study-cloud.B0.tokens` | 6.34 |
| `brief22.eff.ratio.study-cloud.B0.wall` | 9.06 |
| `brief22.eff.ratio.study-cloud.B5.tasks` | 13 |
| `brief22.eff.ratio.study-cloud.B5.tokens` | 1.53 |
| `brief22.eff.ratio.study-cloud.B5.wall` | 2.44 |
| `brief22.eff.ratio.study-cloud.B6.tasks` | 18 |
| `brief22.eff.ratio.study-cloud.B6.tokens` | 4.01 |
| `brief22.eff.ratio.study-cloud.B6.wall` | 5.2 |
| `brief22.eff.ratio.study-cloud.B7.tasks` | 18 |
| `brief22.eff.ratio.study-cloud.B7.tokens` | 2.4 |
| `brief22.eff.ratio.study-cloud.B7.wall` | 3.07 |
<!-- END:facts -->

## Giới hạn

- Dữ liệu P là quan sát, 53 nhiệm vụ của 6 dự án, không đối chứng; không có token.
- Văn phòng phụ chỉ 5 lượt, đều là việc phát triển chính CCoding.
- `study-cloud` gồm nhiều cửa sổ chạy; so sánh A0 trong đó là cùng thư mục, chưa chắc cùng cửa sổ. Các đợt có A0 riêng (b7prime, e8-parallel, large-pilot, pilot1) là cùng đợt.
- `gates-main`, `gates-pilot`, `b15f-main`, `h6-3e` không có A0 cùng đợt (hoặc là arm khác), nên chỉ vào bảng tỉ trọng khâu, không vào bảng tỉ số.
- Số đo thời lượng gồm cả thời gian chờ hạn mức nếu có. Các phép "≈" từ trung vị là xấp xỉ.
