# Cơ cấu chi phí, tỉ lệ trúng cache và độ nhạy giá (cache-sensitivity)

> Phân tích phụ, **ngoài họ Holm**; sinh bởi `cache-sensitivity.mjs`. Thước đo chính của dự án vẫn là `input + 1,25·cacheWrite + 0,1·cacheRead + 5·out`. Phân loại dữ liệu: Nội bộ. Dữ liệu: ảnh chụp git `838a5f1` (276 dòng).

### C-0. Nhận dạng dữ liệu

| Mục | Giá trị |
| --- | ---: |
| Script | cache-sensitivity v1 (round 4, package 3, S1) |
| Ảnh chụp | `git show 838a5f1:bench/vs-claude/results/study-cloud/runs.jsonl` |
| Số dòng (kỳ vọng 276) | 276 |
| Hash git (blob) của ảnh chụp | `a0e8bcb13c0241b66cd227ded9877e9e62f6e593` |
| sha256 (LF) | `85db4ddbb65e12482cc7acb57e31154192ce22655d298061c9a437edce9b5d39` |
| Số lượt done theo arm | A0-sonnet 101; B0 46; B6 45; B7 84 |
| Lượt không done | 0 |
| tokens.weighted ≠ weighted(tokens) (sai số > 1) | 0 lượt |
| Giá trị trường `model` trong ảnh chụp | (không có trường model) |
| Số lượt có `costUsd` > 0 | 101 |

### C-1. Cơ cấu token có trọng số theo arm (gộp bài, mọi lượt done)

Công thức chính (cacheRead ×0,1). Tỉ lệ = tổng thành phần có hệ số / tổng weighted của arm (gộp mọi lượt, nên bài nhiều token nặng hơn). Trung vị và IQR (Q1–Q3, nội suy tuyến tính) tính theo lượt. Mô tả, các arm có tập bài khác nhau.

| Arm | Lượt | input | 1,25·cacheWrite | 0,1·cacheRead | 5·out | Tổng weighted | Trung vị/lượt | IQR/lượt |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A0-sonnet | 101 | 0,0 % | 30,1 % | 16,0 % | 53,9 % | 6.558,6k | 52,1k | 35,3k – 93,3k |
| B0 | 46 | 0,0 % | 41,7 % | 10,9 % | 47,5 % | 12.216,8k | 201,4k | 170,4k – 252,2k |
| B6 | 45 | 0,0 % | 35,9 % | 11,9 % | 52,2 % | 14.275,4k | 262,0k | 234,3k – 399,2k |
| B7 | 84 | 0,0 % | 34,8 % | 12,9 % | 52,3 % | 13.556,6k | 120,9k | 100,1k – 212,1k |

### C-2. Tỉ lệ trúng cache = cacheRead / (cacheRead + cacheWrite + input)

Chỉ mô tả. "Gộp" = tỉ số của các tổng; "trung vị/lượt" tính trên tỉ lệ từng lượt. Không có ngưỡng đạt/không đạt.

| Arm | Σ input | Σ cacheWrite | Σ cacheRead | Tỉ lệ trúng (gộp) | Trung vị/lượt | IQR/lượt |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A0-sonnet | 1,0k | 1.577,3k | 10.524,4k | 87,0 % | 86,8 % | 84,6 % – 89,5 % |
| B0 | 1,9k | 4.071,8k | 13.259,3k | 76,5 % | 73,0 % | 70,8 % – 76,3 % |
| B6 | 2,1k | 4.099,7k | 16.963,5k | 80,5 % | 79,8 % | 77,6 % – 81,8 % |
| B7 | 2,1k | 3.775,0k | 17.446,4k | 82,2 % | 79,5 % | 76,5 % – 84,2 % |

### C-3. Đối chiếu con số "ghi cache ≈ 68 % chi phí" của tài liệu với T-4

Cùng một dữ liệu, mẫu số khác nhau cho phần trăm khác nhau. Tài liệu: 1 nhiệm vụ chạy thật, 5 lượt, tổng chi phí (không nêu bảng giá hay hệ số), "ghi cache" hiểu là cacheWrite. T-4 (b7-cost-decomposition.md): phần CHÊNH B7 − A0 trên t1–t5, mẫu số là Δ weighted. Dòng "Phần chênh" ở đây tính lại T-4 trên ảnh chụp 276 dòng (T-4 gốc dùng 221 dòng đầu) nên có thể lệch nhẹ so với 50,4 / 36,8 / 12,8 %. Dòng USD là cơ cấu chi phí thật nếu mọi lượt tính giá một model (ảnh chụp không có trường `model`).

| Phạm vi | Mẫu số | cacheWrite | cacheRead | cacheWrite + cacheRead | out |
| --- | ---: | ---: | ---: | ---: | ---: |
| B7, mọi bài (gộp lượt) | weighted 0,1 | 34,8 % | 12,9 % | 47,7 % | 52,3 % |
| B7, mọi bài (gộp lượt) | USD giá Sonnet 5.5 | 37,2 % | 6,9 % | 44,1 % | 55,9 % |
| B7, mọi bài (gộp lượt) | USD giá Opus 5.5 | 37,2 % | 6,9 % | 44,1 % | 55,9 % |
| B7, t1–t5 (gộp lượt) | weighted 0,1 | 33,8 % | 13,9 % | 47,7 % | 52,3 % |
| A0-sonnet, t1–t5 (gộp lượt) | weighted 0,1 | 27,0 % | 16,0 % | 43,0 % | 57,0 % |
| Phần chênh B7 − A0, t1–t5 (cách T-4: trung vị theo bài) | weighted 0,1 | 36,5 % | 12,5 % | 49,0 % | 51,0 % |
| B0, mọi bài (gộp lượt) | weighted 0,1 | 41,7 % | 10,9 % | 52,5 % | 47,5 % |
| B6, mọi bài (gộp lượt) | weighted 0,1 | 35,9 % | 11,9 % | 47,8 % | 52,2 % |

Phân bố theo từng lượt của tỉ trọng cacheWrite trong USD (giá Sonnet 5.5; cùng tỉ lệ ở giá Opus 5.5 vì mọi thành phần Opus đúng 2× Sonnet). Tài liệu chỉ có 1 lượt chạy thật, nên câu hỏi là 68 % nằm ở đâu trong phân bố này:

| Arm | Lượt | Trung vị | P90 | Max | Số lượt ≥ 68 % |
| --- | ---: | ---: | ---: | ---: | ---: |
| A0-sonnet | 101 | 35,5 % | 58,5 % | 82,1 % | 1 |
| B0 | 46 | 46,8 % | 53,0 % | 54,2 % | 0 |
| B6 | 45 | 38,1 % | 43,1 % | 46,1 % | 0 |
| B7 | 84 | 38,8 % | 46,2 % | 53,8 % | 0 |

### C-4. Độ nhạy của tỉ số token có trọng số với hệ số cacheRead 0,05 (ngoài họ Holm)

Ước lượng điểm kiểu prereg (trung bình hình học của tỉ số trung bình theo bài, `bootstrapRatio` với `reps: 1`, cùng hàm T-7), mọi lượt done, ảnh chụp 276 dòng. Hệ số **0,1 vẫn là thước đo chính**; cột 0,05 (giá Opus 5.5 / Sonnet 5.5 theo chú thích 2 của trang giá) chỉ là phân tích phụ, không p, không đổi K, không thuộc họ Holm. Cột 0,1 trên t1–t5 đối chiếu T-7 (×2,51 trên 221 dòng đầu).

| Tỉ số | Số bài | Hệ số 0,1 (chính) | Hệ số 0,05 | Đổi so với chính |
| --- | ---: | ---: | ---: | ---: |
| B7/A0, t1–t5 | 5 | ×2,52 | ×2,55 | 1,3 % |
| B7/A0, mọi bài có cả hai arm | 18 | ×2,63 | ×2,73 | 4,0 % |
| B6/A0, mọi bài có cả hai arm | 5 | ×3,93 | ×4,03 | 2,5 % |

### C-5. Chi phí USD theo bảng giá (phân tích phụ, ngoài họ Holm)

Ảnh chụp **không có trường `model`** (giá trị: (không có trường model)) nên không tách được lượt Sonnet / Opus theo dữ liệu. `arms.json` chỉ ghi bí danh `sonnet` cho A0-sonnet và không ghi model cho B0/B6/B7 (do cấu hình CCoding quyết định). Vì vậy mỗi arm được tính ở **hai kịch bản cận**: toàn bộ lượt giá Sonnet 5.5, hoặc toàn bộ giá Opus 5.5; không suy đoán tỉ lệ pha. Ảnh chụp không phân biệt cacheWrite 5 phút và 1 giờ, nên có hai nhóm cột: cacheWrite giá 5 phút (1,25× giá đầu vào) và giá 1 giờ (2×). Đối chiếu duy nhất có thể kiểm: cột `costUsd` đã ghi của A0-sonnet (chỉ A0 có `costUsd` > 0; số trong ngoặc là số lượt) với hai cột Sonnet 5.5; so khớp ở nhóm nào thì nhóm đó là bằng chứng gián tiếp cho cách tính của claude-cli (chỉ cho A0, và giả định A0-sonnet chạy Sonnet 5.5). Khi mọi thành phần Opus đúng 2× Sonnet thì tỉ số B/A0 ở hai model trùng nhau; ở hệ số 0,05 và cacheWrite 5 phút, tỉ số USD cũng trùng C-4 cột 0,05 (giá Sonnet 5.5 có tỉ lệ 1 : 1,25 : 0,05 : 5).

Bảng giá (USD / triệu token; nguồn https://platform.claude.com/docs/en/about-claude/pricing, truy cập 2026-11-03, verified=true):

| Model | input | cacheWrite 5 phút | cacheWrite 1 giờ | cacheRead | output | cacheRead / input |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sonnet 5.5 | 2,00 | 2,50 | 4,00 | 0,10 | 10,00 | 0,05× |
| Opus 5.5 | 4,00 | 5,00 | 8,00 | 0,20 | 20,00 | 0,05× |

USD theo arm:

| Arm | Lượt | Σ USD giá Sonnet 5.5 | Trung vị/lượt Sonnet 5.5 | Σ USD giá Opus 5.5 | Trung vị/lượt Opus 5.5 | Σ Sonnet 5.5, cacheWrite 1 giờ | Σ Opus 5.5, cacheWrite 1 giờ | Σ `costUsd` đã ghi (số lượt > 0) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A0-sonnet | 101 | $12,06 | $0,09 | $24,13 | $0,19 | $14,43 | $28,86 | $14,43 (101) |
| B0 | 46 | $23,11 | $0,38 | $46,22 | $0,76 | $29,22 | $58,43 | $0,00 (0) |
| B6 | 45 | $26,85 | $0,49 | $53,71 | $0,99 | $33,00 | $66,01 | $0,00 (0) |
| B7 | 84 | $25,37 | $0,22 | $50,74 | $0,45 | $31,03 | $62,06 | $0,00 (0) |

Tỉ số USD (cùng kiểu ước lượng prereg như C-4; cacheWrite giá 5 phút):

| Tỉ số | Giá trị |
| --- | ---: |
| B7/A0 (18 bài), cùng giá Sonnet 5.5 | ×2,73 |
| B6/A0 (5 bài), cùng giá Sonnet 5.5 | ×4,03 |
| B7/A0 (18 bài), cùng giá Opus 5.5 | ×2,73 |
| B6/A0 (5 bài), cùng giá Opus 5.5 | ×4,03 |


## Diễn giải (viết tay, không thuộc phần `--check`; số lấy từ các bảng trên)

**Quy ước.** Mọi bảng là phân tích phụ, ngoài họ Holm. Công thức `input + 1,25·cacheWrite + 0,1·cacheRead + 5·out` vẫn là thước đo chính; hệ số 0,05 (C-4) và USD (C-5) chỉ là độ nhạy.

**C-1/C-2.** `input` chỉ ~0 % ở mọi arm (cache bao gần hết tiền tố). Ở B7, 1,25·cacheWrite chiếm 34,8 %, 0,1·cacheRead 12,9 %, 5·out 52,3 %. B0 có tỉ trọng cacheWrite cao nhất (41,7 %) và tỉ lệ trúng cache thấp nhất (76,5 %); A0-sonnet cao nhất (87,0 %). Tỉ lệ trúng cache của B6/B7 (80,5 % / 82,2 %) nằm giữa. Tập bài của các arm khác nhau nên đây chỉ là mô tả, không so sánh có kiểm định.

**C-3 — vì sao không thấy 68 %.** Ba lý do về mẫu số, không phải mâu thuẫn trực tiếp:
1. *Mẫu số.* T-4 là phần chênh B7 − A0 (cacheWrite 36,5 % trên ảnh chụp 276 dòng; T-4 gốc 36,8 % trên 221 dòng); C-1 là tổng chi phí gộp lượt (cacheWrite 34,8 % ở B7). Cả hai đều dùng token có trọng số, trong đó out nhân 5 và chiếm 51–52 %.
2. *Đơn vị.* Tài liệu nói "chi phí" của 1 nhiệm vụ, 5 lượt; không nêu bảng giá. Ở USD (giá Sonnet 5.5, cacheWrite 5 phút) cacheWrite chiếm 37,2 % ở B7; không có lượt B0/B6/B7 nào đạt 68 % (max theo lượt: B7 53,8 %, B0 54,2 %). Chỉ 1/101 lượt A0-sonnet đạt ≥ 68 %.
3. *Hình dạng nhiệm vụ.* Tỉ trọng cacheWrite cao khi lượt chạy có ít out so với tiền tố mới ghi (nhiệm vụ 5 lượt, mỗi lượt ghi 7–26k). 68 % là có thể xảy ra ở một nhiệm vụ nhỏ, nhưng không đặc trưng cho các nhiệm vụ benchmark của ta. Ghi chú diễn giải: nếu "ghi cache" của tài liệu hiểu là cacheWrite + cacheRead thì mẫu số gộp của ta là 44–48 %; tỉ trọng này theo lượt chưa được tính ở đây.
Kết luận: bằng chứng của ta **không ủng hộ** "cache chiếm 68 %" như một đặc điểm chung; nó **ủng hộ** hướng "cache là thành phần lớn thứ hai sau out" (cacheWrite + cacheRead ≈ 44–52 % tùy mẫu số). Chưa đủ để khẳng định chi phí do cache là nguyên nhân chính của chênh B7 − A0: out vẫn chiếm phần lớn nhất (≈ 51–52 %).

**C-4.** Đổi hệ số cacheRead từ 0,1 sang 0,05 làm tỉ số B7/A0 trên t1–t5 đổi +1,3 % (×2,52 → ×2,55) và B6/A0 +2,5 %. Tức hệ số này gần như không ảnh hưởng kết luận; ×2,52 trên t1–t5 là ảnh chụp 276 dòng, T-7 gốc (221 dòng) báo ×2,51.

**C-5.** Ảnh chụp không có trường `model`; USD là hai kịch bản cận, không phải ước lượng thực. Đối chiếu kiểm được duy nhất: Σ `costUsd` đã ghi của A0-sonnet = $14,43, khớp với cột Sonnet 5.5 khi cacheWrite tính giá **1 giờ** ($14,43), không khớp giá 5 phút ($12,06). Đây là bằng chứng gián tiếp rằng claude-cli (A0) ghi cache 1 giờ, nếu A0-sonnet chạy Sonnet 5.5; chưa kiểm cho B0/B6/B7 vì `costUsd` = 0. Giá lấy từ trang chính thức, `verified=true`, truy cập 3/11/2026. Giá cache của Sonnet 5.5/Opus 5.5 theo trang: đọc 0,05× đầu vào (chú thích 2 trên trang).

## Tái lập

`node docs/research/analysis/cache-sensitivity.mjs > docs/research/analysis/cache-sensitivity.md` rồi chép lại phần diễn giải; kiểm: `node docs/research/analysis/cache-sensitivity.mjs --check docs/research/analysis/cache-sensitivity.md`. Script dừng (exit 3) nếu ảnh chụp 838a5f1 không đúng 276 dòng.
