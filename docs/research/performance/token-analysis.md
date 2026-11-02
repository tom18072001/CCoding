# Phân tích token, cache và thời gian: multi-agent CCoding so với agent đơn (RQ3)

> Hạng mục S2 — Phòng Nghiên cứu · @data-scientist · 2/11/2026 · phân loại dữ liệu: nội bộ.
> Mọi bảng dưới đây được **sinh nguyên văn** bởi `docs/research/performance/scripts/token-analysis.mjs`; kiểm tra khớp bằng
> `node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md`.
> Số thập phân dùng dấu chấm (đầu ra script); số nguyên nhóm bằng dấu cách. Các con số trong phần diễn giải trích từ các bảng này.

## 1. Tóm tắt

- **Chất lượng ngang nhau, nên so sánh quy về thời gian và chi phí.** Cả hai hệ gần như đạt trọn test ẩn ở mọi vòng (T-a: mỗi hệ rớt đúng 1 test ở một số lượt — Claude 297/298 ở `t1-duration` C1 và C5, CCoding 59/60 ở `t2-orders` C4).
- **Kết quả âm tính ở thiết kế ban đầu (C1, C2).** CCoding chậm hơn và đắt hơn khoảng gấp đôi (T-f: C1 thời gian +169.4 s, chi phí +0.610 USD; CI 95% không chứa 0). Ở C1 song song chỉ tiết kiệm 12.9% thời gian tuần tự (T-d).
- **Làn nhanh (C5) thu hẹp khoảng cách nhưng không đảo ngược chi phí.** Thời gian: chênh lệch +21.1 s, CI chứa 0 (không phân biệt được với bằng nhau); loại ngoại lệ treo stdin thì −14.7 s [−26.7; −2.5], nhưng đó là phân tích độ nhạy chọn sau khi thấy dữ liệu. Chi phí: CCoding vẫn đắt hơn +0.144 USD (+21.8%), CI không chứa 0.
- **C6 (làn nhanh sau `d7600f6`, chỉ `t3`, `t5`, 2 lượt mỗi ô) cho kết quả thuận hơn về thời gian.** CCoding nhanh hơn Claude Code ở cả hai bài (`t3` 192 so với 252 s, `t5` 174 so với 260 s; T-a, T-g), chênh lệch −72.8 s [−105.3; −40.3] (T-f); chi phí +0.136 USD [−0.016; 0.287], CI chứa 0, tức chi phí ngang hoặc cao hơn. Gộp C5+C6 theo bài (độ nhạy, chọn sau khi thấy dữ liệu), tỉ lệ thời gian là `t1` 0.85 · `t2` 1.16 · `t3` 0.98 · `t4` 0.76 · `t5` 0.67 (bỏ lượt treo; T-g). `t3` đảo từ 2.54 (C5, có lượt treo) xuống 0.76 (C6) chủ yếu vì Claude Code chạy chậm hơn ở C6 (155–160 → 246–258 s), nên một phần "lợi thế" là nhiễu thời điểm.
- **Con số "ghi cache gấp 2,8–4 lần" chỉ đúng một phần** (T-b): 4.71× ở C1, 6.08× ở C2, 3.34× ở C5, 3.37× ở C6. Với thiết kế hiện hành (C5, C6) con số nằm trong khoảng nêu.
- **Tiền tố prompt không phải thủ phạm chính của ghi cache** (T-e1: phần cố định chỉ 2 399 token mỗi lượt gọi). Ghi cache theo nội dung (đầu ra + kết quả công cụ). Trong ước lượng, đổi mô hình lead từ opus sang sonnet (O6) lớn nhất nhưng C5 đã áp dụng sẵn; O1–O5 mỗi cái ≤ 4.7% chi phí (T-e).
- **Tất cả là 1–2 lượt mỗi ô; bootstrap chỉ là minh họa.** Không rút kết luận khái quát.

## 2. Phương pháp

**Dữ liệu.** `bench/vs-claude/results/{runs,phases,calls,claude_turns}.csv` và `summary.json`; không có `events.jsonl` trong `results/C*/` (chỉ có `result.json`, `grade-*.tap`, `ccoding-task.json`), nên không dùng. Năm bài (`t1`–`t5`), test ẩn chấm tự động; mỗi hệ chạy tuần tự trong chính nó (`--concurrency 1`, xem `bench/vs-claude/README.md`). Vòng C1–C2 = mốc ban đầu, C3–C4 = bước trung gian, C5 = làn nhanh, C6 = làn nhanh sau `d7600f6` (`maxParallel` = 4; chỉ `t3`, `t5`).

**Nguồn dữ liệu C6.** `results/` của nhánh này chưa có C6 (nhánh xuất phát được cập nhật sau). Các dòng C6 của `runs`, `phases`, `calls`, `claude_turns` được trích nguyên văn từ commit `5866cda` (`git show 5866cda:bench/vs-claude/results/<tệp>.csv`, lọc `^C6,`) vào `docs/research/performance/c6-extract/C6-*.csv`; script chỉ bổ sung vòng chưa có trong `results/`, nên khi C6 vào `results/` thì tệp phụ tự bị bỏ qua. Các tệp khác (kể cả ba vòng C1–C5) không đổi so với commit đó (đã so sánh). Khi chạy lại sẽ khớp số trong chỉ dẫn của giám đốc (t3: 246/258 s Claude, 211/173 s CCoding; t5: 283/236 và 134/214 s).

**Khác biệt giao thức C5 và C6 (đã kiểm, KHÔNG phải "tuần tự → cùng lúc").** Mỗi hệ chạy tuần tự trong chính nó và hai hệ chạy song song nhau ở cả hai vòng: theo `started` + `wall_s`, 9/10 lượt CCoding ở C5 và 4/4 ở C6 có khoảng chạy chồng với một lượt Claude Code (T-0). Khác biệt thật giữa C5 và C6 là (i) mã (`maxParallel` 3 → 4), (ii) thời điểm chạy (Claude Code `t3` chậm hơn ~1.6× ở C6), (iii) chỉ 2 bài. Do đó không gộp thẳng C5 và C6 làm kết quả chính; dòng gộp là độ nhạy riêng (T-f, T-g).

**Giao thức (ghi trước khi tính).**
1. Kiểm tra schema và đối chiếu tổng giữa các tệp (T-0). `runs.csv` là nguồn chuẩn cho tổng; `calls.csv` (theo lượt gọi agent) và `claude_turns.csv` (theo lượt mô hình) khác độ mịn nên chỉ so sánh ở mức lượt chạy.
2. Baseline = Claude Code thuần cùng vòng (T-a, T-b, T-f). Vòng không có Claude cùng vòng (C3, C4) không có tỷ lệ/CI.
3. Đường găng (T-d) tính từ `ts` (thời điểm kết thúc) và `duration_s`: khoảng của một lượt gọi là [ts − duration_s, ts]; thời gian pha = độ dài hợp các khoảng; găng lượt chạy = Σ các pha (giả định pha nối tiếp).
4. Ước lượng O1–O6 (T-e) là mô hình giả định trên dữ liệu có sẵn, **không chạy lại hệ thống**; mỗi dòng độc lập, kèm giả định. Giá quy đổi suy ra bằng bình phương tối thiểu từ `calls.csv` (T-e0), không phải bảng giá niêm yết.
5. Bootstrap (T-f): phân tầng theo bài, B = 10 000, seed = 20261102, phân vị 2,5/97,5. n = 1–2 lượt mỗi ô nên **chỉ minh họa**. Dòng "C5+C6" và bảng T-g gộp lượt trong từng bài qua hai vòng là độ nhạy, chọn sau khi thấy C6; lượt treo stdin ở C5 (`t3` lượt 1, 579 s) có hai biến thể: bỏ và giữ.
6. Không tinh chỉnh tham số theo kết quả; các tham số giả định (`charsPerToken` = 3.5, O3 = 30%, O4 = 50%, O5 = 20%) đặt cố định trong `CONFIG` của script.

**Tái lập.** Node ≥ 22 (đã chạy với v24.14.0), không phụ thuộc ngoài, offline, đầu ra xác định (hai lần chạy cho cùng mã băm).

```bash
node docs/research/performance/scripts/token-analysis.mjs                   # toàn bộ bảng
node docs/research/performance/scripts/token-analysis.mjs --table T-b       # một bảng
node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md
```

## 3. Kết quả

Lệnh tái lập bảng T-0: `node docs/research/performance/scripts/token-analysis.mjs --table T-0`

### T-0. Schema, đơn vị và đối chiếu giữa các tệp

| Tệp | Cột | Đơn vị / ý nghĩa | Áp dụng |
|---|---|---:|---:|
| runs.csv | wall_s | giây (đồng hồ tường của harness) | cả hai hệ |
| runs.csv | cost_usd | USD theo giá niêm yết do Claude Code báo | cả hai hệ |
| runs.csv | input / output / cache_read / cache_write | token, tổng cả lượt chạy (CCoding: cộng mọi lượt gọi agent) | cả hai hệ |
| runs.csv | hidden_pass / hidden_total | số test ẩn đạt / tổng | cả hai hệ |
| calls.csv | duration_s | giây của một lượt gọi agent; ts = thời điểm KẾT THÚC (ts − duration_s ≈ bắt đầu; lượt 1 khớp `started` của runs.csv) | CCoding |
| calls.csv | input / output / cache_read / cache_write | token của cả lượt gọi agent (gồm nhiều lượt mô hình bên trong; số công cụ ở tool_calls) | CCoding |
| calls.csv | system_chars / context_chars / prompt_chars | ký tự (không phải token); đổi token bằng charsPerToken = 3.5 (giả định) | CCoding |
| calls.csv | tool_output_chars | ký tự kết quả công cụ đưa lại vào hội thoại | CCoding |
| calls.csv | max_tokens / retries | trần đầu ra cấu hình theo pha / số lần thử lại | CCoding |
| claude_turns.csv | input / cache_read / cache_write (_1h, _5m) | token theo TỪNG lượt mô hình của Claude Code; cache_write = _1h + _5m | Claude (chỉ C1, C2, C5, C6) |
| claude_turns.csv | output_partial | token đầu ra từ luồng sự kiện từng phần — KHÔNG dùng (≪ output thật trong runs.csv) | Claude |

Đối chiếu: 33/33 lượt CCoding có Σ(calls.csv) = runs.csv về input/output/cache_read/cache_write; 24/24 lượt Claude có Σ(claude_turns.csv) = runs.csv về cache_read/cache_write.

Quy đổi: runs.csv là nguồn chuẩn cho tổng. calls.csv (CCoding, theo lượt gọi agent = một tiến trình) và claude_turns.csv (Claude, theo lượt mô hình) KHÔNG cùng độ mịn, nên so sánh chỉ ở mức tổng theo lượt chạy hoặc "mỗi lượt gọi agent" (CCoding) với "mỗi lượt chạy" (Claude). claude_turns.csv có ở các vòng: C1, C2, C5, C6; không có events.jsonl trong results/C*/. Các dòng C6 (runs, phases, calls, claude_turns) đọc từ docs/research/performance/c6-extract/C6-*.csv, trích nguyên văn từ commit 5866cda vì results/ của nhánh này chưa có C6.
Giao thức chạy (kiểm từ started + wall_s): số lượt CCoding có khoảng chạy chồng với ít nhất một lượt Claude cùng vòng — C5 9/10; C6 4/4. Tức ở cả C5 lẫn C6 hai hệ chạy song song nhau (mỗi hệ tuần tự trong chính nó, --concurrency 1); khác biệt C5 → C6 không phải "tuần tự → cùng lúc" mà là mã (C6 sau d7600f6: maxParallel 4) và thời điểm chạy.

Ghi cache của Claude theo TTL: 1 giờ = 765 868 token, 5 phút = 0 token (100.0% là 1 giờ). calls.csv không tách TTL cho CCoding.

Dữ liệu có: 57 lượt chạy, 195 dòng calls.csv, 187 dòng phases.csv, 226 dòng claude_turns.csv; vòng có trong runs.csv: C1, C2, C3, C4, C5, C6.

Lệnh tái lập bảng T-a: `node docs/research/performance/scripts/token-analysis.mjs --table T-a`

### T-a. Kết quả theo vòng × bài × hệ (trung bình các lượt lặp)

| Vòng | Bài | Hệ | n | Test ẩn đạt/tổng | Đạt trọn | Thời gian TB (s) | min | max | Chi phí TB (USD) | Input TB | Output TB | Cache đọc TB | Cache ghi TB |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| C1 | t1-duration | ccoding | 2 | 298/298 | 2/2 | 330 | 314 | 346 | 1.142 | 41 | 34 215 | 612 320 | 130 285 |
| C1 | t1-duration | claude | 2 | 297/298 | 1/2 | 132 | 129 | 135 | 0.510 | 10 | 13 867 | 226 944 | 23 438 |
| C1 | t2-orders | ccoding | 2 | 120/120 | 2/2 | 143 | 139 | 146 | 0.783 | 39 | 21 917 | 528 400 | 79 340 |
| C1 | t2-orders | claude | 2 | 120/120 | 2/2 | 94 | 86 | 101 | 0.417 | 12 | 9 551 | 272 944 | 21 417 |
| C1 | t3-api | ccoding | 2 | 174/174 | 2/2 | 446 | 412 | 479 | 1.808 | 74 | 64 317 | 1 406 480 | 189 045 |
| C1 | t3-api | claude | 2 | 174/174 | 2/2 | 212 | 197 | 226 | 0.874 | 27 | 21 064 | 765 491 | 37 418 |
| C1 | t4-perf | ccoding | 2 | 38/38 | 2/2 | 446 | 323 | 569 | 1.233 | 55 | 42 307 | 807 823 | 129 981 |
| C1 | t4-perf | claude | 2 | 38/38 | 2/2 | 250 | 171 | 328 | 0.724 | 21 | 18 723 | 550 347 | 29 860 |
| C2 | t1-duration | ccoding-fast | 1 | 149/149 | 1/1 | 265 | 265 | 265 | 0.597 | 9 751 | 22 617 | 334 470 | 53 902 |
| C2 | t1-duration | ccoding-sonlead | 1 | 149/149 | 1/1 | 266 | 266 | 266 | 0.483 | 8 835 | 22 294 | 281 718 | 57 505 |
| C2 | t5-logq | ccoding | 2 | 292/292 | 2/2 | 413 | 405 | 421 | 2.077 | 88 | 74 467 | 1 334 897 | 249 170 |
| C2 | t5-logq | claude | 2 | 292/292 | 2/2 | 245 | 244 | 245 | 1.005 | 23 | 27 496 | 636 528 | 40 951 |
| C3 | t1-duration | ccoding-new | 1 | 149/149 | 1/1 | 258 | 258 | 258 | 0.772 | 38 | 29 936 | 654 301 | 75 338 |
| C3 | t2-orders | ccoding-new | 1 | 60/60 | 1/1 | 121 | 121 | 121 | 0.843 | 28 | 16 630 | 320 271 | 118 285 |
| C4 | t1-duration | ccoding-fastlane | 1 | 149/149 | 1/1 | 170 | 170 | 170 | 0.808 | 36 | 37 459 | 484 668 | 95 107 |
| C4 | t2-orders | ccoding-fastlane | 1 | 59/60 | 0/1 | 127 | 127 | 127 | 0.552 | 40 | 19 338 | 527 184 | 75 377 |
| C4 | t3-api | ccoding-fastlane | 1 | 87/87 | 1/1 | 247 | 247 | 247 | 1.404 | 92 | 54 083 | 1 578 632 | 174 592 |
| C4 | t4-perf | ccoding-fastlane | 1 | 19/19 | 1/1 | 124 | 124 | 124 | 0.553 | 42 | 21 086 | 621 347 | 69 043 |
| C4 | t5-logq | ccoding-fastlane | 1 | 146/146 | 1/1 | 307 | 307 | 307 | 1.145 | 78 | 49 576 | 1 247 352 | 129 741 |
| C5 | t1-duration | ccoding-fastlane | 2 | 298/298 | 2/2 | 107 | 98 | 116 | 0.542 | 27 | 22 477 | 360 565 | 69 381 |
| C5 | t1-duration | claude | 2 | 297/298 | 1/2 | 126 | 117 | 134 | 0.513 | 12 | 13 490 | 284 984 | 23 202 |
| C5 | t2-orders | ccoding-fastlane | 2 | 120/120 | 2/2 | 106 | 78 | 134 | 0.690 | 53 | 23 685 | 716 938 | 94 044 |
| C5 | t2-orders | claude | 2 | 120/120 | 2/2 | 91 | 89 | 93 | 0.436 | 12 | 9 626 | 271 612 | 23 584 |
| C5 | t3-api | ccoding-fastlane | 2 | 174/174 | 2/2 | 400 | 221 | 579 | 1.139 | 65 | 41 731 | 1 090 418 | 129 267 |
| C5 | t3-api | claude | 2 | 174/174 | 2/2 | 158 | 155 | 160 | 0.713 | 15 | 18 442 | 384 891 | 33 307 |
| C5 | t4-perf | ccoding-fastlane | 2 | 38/38 | 2/2 | 153 | 134 | 172 | 0.574 | 37 | 22 354 | 556 459 | 72 709 |
| C5 | t4-perf | claude | 2 | 38/38 | 2/2 | 203 | 186 | 219 | 0.627 | 18 | 16 315 | 446 164 | 26 333 |
| C5 | t5-logq | ccoding-fastlane | 2 | 292/292 | 2/2 | 175 | 161 | 188 | 1.077 | 59 | 47 255 | 948 520 | 126 007 |
| C5 | t5-logq | claude | 2 | 292/292 | 2/2 | 259 | 247 | 270 | 1.015 | 20 | 29 167 | 528 954 | 40 692 |
| C6 | t3-api | ccoding-fastlane | 2 | 174/174 | 2/2 | 192 | 173 | 211 | 1.103 | 65 | 46 470 | 1 124 335 | 129 942 |
| C6 | t3-api | claude | 2 | 174/174 | 2/2 | 252 | 246 | 258 | 1.044 | 36 | 24 526 | 1 080 376 | 42 120 |
| C6 | t5-logq | ccoding-fastlane | 2 | 292/292 | 2/2 | 174 | 134 | 214 | 1.222 | 70 | 51 386 | 1 065 509 | 148 805 |
| C6 | t5-logq | claude | 2 | 292/292 | 2/2 | 260 | 236 | 283 | 1.009 | 20 | 28 820 | 536 977 | 40 615 |

Đọc T-a: ở C1 và C2 (thiết kế ban đầu) CCoding chậm hơn và đắt hơn ở mọi bài có đối chứng. Ở C5, CCoding nhanh hơn ở `t1`, `t4`, `t5` (107/153/175 s so với 126/203/259 s), chậm hơn ở `t2` (106 so với 91 s) và `t3` (400 so với 158 s; trong đó lượt 579 s là lỗi treo stdin, lượt còn lại 221 s). Chi phí CCoding thấp hơn Claude ở đúng một ô C5 (`t4`, 0.574 so với 0.627 USD). C6: CCoding nhanh hơn ở `t3` (192 so với 252 s) và `t5` (174 so với 260 s), chi phí `t3` 1.103 so với 1.044 USD, `t5` 1.222 so với 1.009 USD; test ẩn 174/174 và 292/292 ở cả hai hệ. Lưu ý Claude Code `t3` chạy 155–160 s ở C5 nhưng 246–258 s ở C6, tức nhiễu giữa hai thời điểm cùng cỡ chênh lệch giữa hai hệ.

Lệnh tái lập bảng T-b: `node docs/research/performance/scripts/token-analysis.mjs --table T-b`

### T-b. Tỷ lệ ghi cache CCoding / Claude (kiểm lại "2,8–4 lần")

| Vòng | Bài | Hệ CCoding | Ghi cache CC TB | Ghi cache Claude TB | Tỷ lệ ghi cache CC/Claude | Tỷ lệ đọc cache | Tỷ lệ output | Tỷ lệ chi phí | Lượt gọi agent / lượt chạy (CC) | Ghi cache / lượt gọi agent (CC) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| C1 | t1-duration | ccoding | 130 285 | 23 438 | 5.56 | 2.70 | 2.47 | 2.24 | 5.0 | 26 057 |
| C1 | t2-orders | ccoding | 79 340 | 21 417 | 3.70 | 1.94 | 2.29 | 1.88 | 5.0 | 15 868 |
| C1 | t3-api | ccoding | 189 045 | 37 418 | 5.05 | 1.84 | 3.05 | 2.07 | 7.5 | 25 206 |
| C1 | t4-perf | ccoding | 129 981 | 29 860 | 4.35 | 1.47 | 2.26 | 1.70 | 7.5 | 17 331 |
| C1 | GỘP 4 bài | ccoding | 132 163 | 28 033 | 4.71 | 1.85 | 2.58 | 1.97 | 6.3 | 21 146 |
| C2 | t5-logq | ccoding | 249 170 | 40 951 | 6.08 | 2.10 | 2.71 | 2.07 | 12.5 | 19 934 |
| C2 | GỘP 1 bài | ccoding | 249 170 | 40 951 | 6.08 | 2.10 | 2.71 | 2.07 | 12.5 | 19 934 |
| C5 | t1-duration | ccoding-fastlane | 69 381 | 23 202 | 2.99 | 1.27 | 1.67 | 1.06 | 4.0 | 17 345 |
| C5 | t2-orders | ccoding-fastlane | 94 044 | 23 584 | 3.99 | 2.64 | 2.46 | 1.58 | 6.0 | 15 674 |
| C5 | t3-api | ccoding-fastlane | 129 267 | 33 307 | 3.88 | 2.83 | 2.26 | 1.60 | 5.5 | 23 503 |
| C5 | t4-perf | ccoding-fastlane | 72 709 | 26 333 | 2.76 | 1.25 | 1.37 | 0.92 | 4.0 | 18 177 |
| C5 | t5-logq | ccoding-fastlane | 126 007 | 40 692 | 3.10 | 1.79 | 1.62 | 1.06 | 5.5 | 22 910 |
| C5 | GỘP 5 bài | ccoding-fastlane | 98 282 | 29 423 | 3.34 | 1.92 | 1.81 | 1.22 | 5.0 | 19 656 |
| C6 | t3-api | ccoding-fastlane | 129 942 | 42 120 | 3.09 | 1.04 | 1.89 | 1.06 | 5.5 | 23 626 |
| C6 | t5-logq | ccoding-fastlane | 148 805 | 40 615 | 3.66 | 1.98 | 1.78 | 1.21 | 7.0 | 21 258 |
| C6 | GỘP 2 bài | ccoding-fastlane | 139 374 | 41 367 | 3.37 | 1.35 | 1.83 | 1.13 | 6.3 | 22 300 |

Kiểm lại "gấp 2,8–4 lần": theo từng ô (vòng × bài × hệ có đối chứng Claude cùng vòng) tỷ lệ ghi cache nằm trong 2.76–6.08; 7/12 ô trong khoảng 2,8–4. Tỷ lệ gộp: C1/ccoding 4.71×; C2/ccoding 6.08×; C5/ccoding-fastlane 3.34×; C6/ccoding-fastlane 3.37×. Kết luận: ĐÚNG MỘT PHẦN: 2/4 tỷ lệ gộp theo vòng nằm trong 2,8–4. C3, C4 không có đối chứng Claude cùng vòng nên không có hàng tỷ lệ; C6 (2 bài t3, t5) có đối chứng.

Đọc T-b: khoảng "2,8–4 lần" của đề bài là **đúng một phần**. Nó khớp C5 (gộp 3.34×; 4 trong 5 bài nằm trong 2,8–4, riêng `t4` là 2.76 — sát dưới ngưỡng) và C6 (gộp 3.37×; `t3` 3.09, `t5` 3.66) nhưng lệch với C1 (4.71×) và C2 (6.08×). Mỗi ô chỉ 1–2 lượt nên nên trình bày như một thang giá trị, không phải hằng số. Cơ chế quan sát được: Claude chạy một tiến trình (ghi cache TB 28 033 token ở C1, 29 423 ở C5) còn CCoding chạy nhiều tiến trình (5.0–6.3 lượt gọi/lượt chạy) với 19 656–21 146 token ghi cache mỗi lượt gọi — tổng tăng vì **số lượt gọi nhân với phần nội dung mỗi lượt gọi tự ghi**, và T-e1 cho thấy phần cố định không phải nguyên nhân chính. Ghi cache của Claude đều là TTL 1 giờ (T-0). Đây là liên hệ mô tả, không phải bằng chứng nhân quả.

Lệnh tái lập bảng T-c: `node docs/research/performance/scripts/token-analysis.mjs --table T-c`

### T-c. Phân rã CCoding theo pha × agent

**C1** — 8 lượt chạy CCoding, 50 lượt gọi agent ("Công cụ" = tool_calls TB; *_chars là ký tự; mọi cột "/ lượt gọi" là trung bình)

| Pha | Agent | Lượt gọi | Công cụ TB | Ghi cache / lượt gọi | Đọc cache / lượt gọi | Output / lượt gọi | system_chars | context_chars | prompt_chars | tool_output_chars | max_tokens | retries (Σ) | Thời gian TB (s) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| plan | dev-lead | 8 | 1.9 | 17 217 | 68 118 | 5 003 | 4 784 | 660 | 7 793 | 10 310 | 8000 | 0 | 57.4 |
| discuss | backend-dev | 2 | 0.0 | 11 731 | 13 937 | 1 138 | 1 978 | 7 634 | 6 510 | 0 | 700 | 0 | 10.8 |
| discuss | data-engineer | 2 | 0.0 | 10 958 | 14 680 | 1 200 | 2 073 | 7 634 | 6 261 | 0 | 700 | 0 | 8.6 |
| discuss | qa-tester | 2 | 0.0 | 10 842 | 14 680 | 810 | 1 750 | 7 634 | 6 403 | 0 | 700 | 0 | 6.2 |
| finalize | dev-lead | 2 | 1.5 | 19 813 | 69 890 | 7 054 | 4 784 | 698 | 19 401 | 6 862 | 8000 | 0 | 71.5 |
| execute | backend-dev | 10 | 9.8 | 28 511 | 258 929 | 10 935 | 4 249 | 2 499 | 7 151 | 13 834 | 32000 | 0 | 97.5 |
| execute | data-engineer | 3 | 7.7 | 24 834 | 191 780 | 11 250 | 4 004 | 3 234 | 6 055 | 10 752 | 32000 | 0 | 68.8 |
| execute | frontend-dev | 1 | 8.0 | 17 182 | 105 587 | 6 821 | 4 065 | 1 277 | 5 403 | 6 769 | 32000 | 0 | 39.9 |
| execute | qa-tester | 4 | 8.5 | 38 346 | 359 433 | 18 231 | 4 331 | 1 400 | 7 673 | 15 047 | 32000 | 0 | 124.7 |
| review | qa-tester | 8 | 2.4 | 22 355 | 86 968 | 2 048 | 4 331 | 660 | 14 751 | 12 459 | 6000 | 0 | 21.6 |
| synthesize | dev-lead | 8 | 1.6 | 12 982 | 66 880 | 3 231 | 4 784 | 660 | 12 116 | 1 042 | 10000 | 0 | 35.1 |

Tổng C1: ghi cache 1 057 300, đọc cache 6 710 045, output 325 510 token. Tỷ trọng ghi cache theo pha: plan 13.0%, discuss 6.3%, finalize 3.7%, execute 50.1%, review 16.9%, synthesize 9.8%.

**C5** — 10 lượt chạy CCoding, 50 lượt gọi agent ("Công cụ" = tool_calls TB; *_chars là ký tự; mọi cột "/ lượt gọi" là trung bình)

| Pha | Agent | Lượt gọi | Công cụ TB | Ghi cache / lượt gọi | Đọc cache / lượt gọi | Output / lượt gọi | system_chars | context_chars | prompt_chars | tool_output_chars | max_tokens | retries (Σ) | Thời gian TB (s) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| plan | dev-lead | 10 | 1.6 | 14 274 | 60 408 | 3 165 | 4 784 | 677 | 9 125 | 7 412 | 8000 | 0 | 25.4 |
| execute | backend-dev | 10 | 5.6 | 18 908 | 152 658 | 7 390 | 4 249 | 1 219 | 5 493 | 8 414 | 32000 | 0 | 49.1 |
| execute | data-engineer | 9 | 7.2 | 20 249 | 183 830 | 9 029 | 4 004 | 1 235 | 5 081 | 8 221 | 32000 | 0 | 58.9 |
| execute | devops | 1 | 7.0 | 21 258 | 219 224 | 8 300 | 4 372 | 1 275 | 5 389 | 10 648 | 32000 | 0 | 51.4 |
| execute | frontend-dev | 6 | 9.0 | 24 178 | 221 015 | 10 929 | 4 065 | 1 249 | 5 130 | 11 729 | 32000 | 0 | 68.3 |
| execute | security | 2 | 6.0 | 26 171 | 147 616 | 5 502 | 4 371 | 1 332 | 5 386 | 7 211 | 32000 | 0 | 34.9 |
| review | qa-tester | 11 | 4.2 | 21 451 | 144 030 | 3 541 | 4 331 | 673 | 12 921 | 17 783 | 6000 | 0 | 73.9 |
| revise | backend-dev | 1 | 7.0 | 14 122 | 135 793 | 4 362 | 4 249 | 640 | 6 939 | 4 404 | 32000 | 0 | 30.8 |

Tổng C5: ghi cache 982 815, đọc cache 7 345 798, output 315 002 token. Tỷ trọng ghi cache theo pha: plan 14.5%, execute 60.0%, review 24.0%, revise 1.4%.

**C6** — 4 lượt chạy CCoding, 25 lượt gọi agent ("Công cụ" = tool_calls TB; *_chars là ký tự; mọi cột "/ lượt gọi" là trung bình)

| Pha | Agent | Lượt gọi | Công cụ TB | Ghi cache / lượt gọi | Đọc cache / lượt gọi | Output / lượt gọi | system_chars | context_chars | prompt_chars | tool_output_chars | max_tokens | retries (Σ) | Thời gian TB (s) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| plan | dev-lead | 4 | 2.0 | 16 678 | 77 031 | 4 302 | 4 784 | 713 | 9 125 | 12 097 | 8000 | 0 | 32.2 |
| execute | backend-dev | 4 | 11.8 | 30 182 | 383 862 | 14 338 | 4 249 | 1 324 | 5 773 | 16 625 | 32000 | 0 | 90.4 |
| execute | data-engineer | 4 | 6.8 | 22 747 | 199 907 | 11 629 | 4 004 | 1 324 | 5 340 | 7 180 | 32000 | 0 | 67.2 |
| execute | devops | 2 | 6.5 | 22 564 | 166 632 | 8 893 | 4 372 | 1 196 | 5 428 | 12 327 | 32000 | 0 | 55.6 |
| execute | frontend-dev | 3 | 5.3 | 18 740 | 119 486 | 8 860 | 4 065 | 1 292 | 4 881 | 5 293 | 32000 | 0 | 52.6 |
| execute | security | 2 | 6.5 | 18 220 | 127 844 | 6 610 | 4 371 | 1 451 | 5 708 | 7 426 | 32000 | 0 | 40.5 |
| review | qa-tester | 5 | 3.2 | 25 651 | 130 562 | 2 920 | 4 331 | 707 | 17 951 | 18 369 | 6000 | 0 | 27.2 |
| revise | devops | 1 | 4.0 | 13 027 | 136 268 | 2 451 | 4 372 | 684 | 8 297 | 4 695 | 32000 | 0 | 26.0 |

Tổng C6: ghi cache 557 494, đọc cache 4 379 687, output 195 711 token. Tỷ trọng ghi cache theo pha: plan 12.0%, execute 62.7%, review 23.0%, revise 2.3%.

Đọc T-c: pha `execute` chiếm 50.1% (C1) và 60.0% (C5) lượng ghi cache; `review` chiếm 16.9% (C1) và 24.0% (C5) dù output của reviewer nhỏ — do `prompt_chars` (12 921 ký tự ở C5) và `tool_output_chars` (17 783) lớn, tức reviewer đọc nhiều. Σ retries = 0 ở mọi pha. Pha `discuss` chỉ có ở C1–C2, không còn ở làn nhanh. C6 (4 lượt chạy) giống C5: `execute` 62.7%, `review` 23.0% lượng ghi cache; `review` vẫn đọc nhiều (`prompt_chars` 17 951, `tool_output_chars` 18 369) và Σ retries = 0.

Lệnh tái lập bảng T-d: `node docs/research/performance/scripts/token-analysis.mjs --table T-d`

### T-d. Đường găng theo pha (tuần tự so với song song)

**(1) Theo pha** — "tuần tự" = Σ thời gian các lượt gọi trong pha; "đường găng pha" = độ dài hợp các khoảng [ts − duration_s, ts] (thời gian thực khi các lượt chạy song song); hệ số = tuần tự / găng.

| Vòng | Pha | Số lượt chạy có pha | Lượt gọi / lượt chạy | Tuần tự TB (s) | Đường găng pha TB (s) | Hệ số song song |
|---|---|---:|---:|---:|---:|---:|
| C1 | plan | 8 | 1.0 | 57.4 | 57.4 | 1.00 |
| C1 | discuss | 2 | 3.0 | 25.6 | 25.6 | 1.00 |
| C1 | finalize | 2 | 1.0 | 71.5 | 71.5 | 1.00 |
| C1 | execute | 8 | 2.3 | 214.9 | 169.6 | 1.27 |
| C1 | review | 8 | 1.0 | 21.6 | 21.6 | 1.00 |
| C1 | synthesize | 8 | 1.0 | 35.1 | 35.1 | 1.00 |
| C2 | plan | 4 | 1.0 | 51.1 | 51.1 | 1.00 |
| C2 | discuss | 2 | 4.5 | 31.3 | 31.2 | 1.00 |
| C2 | finalize | 2 | 1.0 | 68.7 | 68.7 | 1.00 |
| C2 | execute | 4 | 3.0 | 200.2 | 138.0 | 1.45 |
| C2 | review | 4 | 1.0 | 31.9 | 31.9 | 1.00 |
| C2 | synthesize | 4 | 1.0 | 17.9 | 17.9 | 1.00 |
| C3 | plan | 2 | 1.0 | 39.9 | 39.9 | 1.00 |
| C3 | execute | 2 | 1.0 | 84.5 | 84.5 | 1.00 |
| C3 | review | 2 | 1.0 | 26.3 | 26.3 | 1.00 |
| C3 | synthesize | 2 | 1.0 | 18.5 | 18.5 | 1.00 |
| C4 | plan | 5 | 1.0 | 24.2 | 24.2 | 1.00 |
| C4 | execute | 5 | 3.0 | 177.6 | 113.6 | 1.56 |
| C4 | review | 5 | 1.2 | 38.2 | 38.2 | 1.00 |
| C4 | revise | 1 | 1.0 | 36.7 | 36.7 | 1.00 |
| C5 | plan | 10 | 1.0 | 25.4 | 25.4 | 1.00 |
| C5 | execute | 10 | 2.8 | 155.3 | 76.9 | 2.02 |
| C5 | review | 10 | 1.1 | 81.3 | 81.3 | 1.00 |
| C5 | revise | 1 | 1.0 | 30.8 | 30.8 | 1.00 |
| C6 | plan | 4 | 1.0 | 32.2 | 32.2 | 1.00 |
| C6 | execute | 4 | 3.8 | 245.2 | 108.4 | 2.26 |
| C6 | review | 4 | 1.3 | 34.0 | 34.0 | 1.00 |
| C6 | revise | 1 | 1.0 | 26.0 | 26.0 | 1.00 |

**(2) Theo lượt chạy** — đường găng LLM = Σ đường găng các pha (giả định các pha nối tiếp nhau); "ngoài LLM" = thời gian tường − đường găng LLM (chạy kiểm tra, tạo/gộp worktree, chờ, điều phối; có thể âm do làm tròn duration_s).

| Vòng | Số lượt chạy | Thời gian tường TB (s) | Σ tuần tự LLM TB (s) | Đường găng LLM TB (s) | Tiết kiệm nhờ song song TB (s) | Ngoài LLM TB (s) | Tiết kiệm / tuần tự (%) |
|---|---|---:|---:|---:|---:|---:|---:|
| C1 | 8 | 341 | 353 | 308 | 45 | 33 | 12.9 |
| C2 | 4 | 339 | 351 | 289 | 62 | 50 | 11.6 |
| C3 | 2 | 190 | 169 | 169 | 0 | 20 | 0.0 |
| C4 | 5 | 195 | 247 | 183 | 64 | 12 | 25.0 |
| C5 | 10 | 188 | 265 | 187 | 78 | 1 | 30.5 |
| C6 | 4 | 183 | 318 | 181 | 137 | 2 | 42.9 |

Đọc T-d: chỉ pha `execute` có song song; hệ số tăng từ 1.27 (C1) lên 2.02 (C5) khi làn nhanh chạy cùng lúc các hạng mục độc lập. Tiết kiệm nhờ song song tăng từ 12.9% (C1) lên 30.5% (C5) so với thời gian tuần tự. Sau khi song song hóa, `review` (81.3 s) thành pha dài nhất ở C5, lớn hơn đường găng của `execute` (76.9 s) — đó là chỗ tối ưu tiếp theo (O4). Ở C6 hệ số của `execute` là 2.26 (4 hạng mục chạy cùng lúc thay vì 3) và tiết kiệm nhờ song song 42.9% thời gian tuần tự; `execute` (đường găng 108.4 s) thay `review` (34.0 s) làm pha dài nhất, nhất quán với ghi nhận ở PROCESS-REVIEW rằng một hạng mục nối tệp chung nằm trên đường găng (`n` = 4 lượt; ghi chú đó dựa vào `events.jsonl` mà tôi không có, nên chưa tự kiểm). Thời gian ngoài LLM nhỏ (1 s ở C5, 2 s ở C6) theo cách tính này. C3 chỉ có một hạng mục nên không có song song.

Lệnh tái lập bảng T-e0: `node docs/research/performance/scripts/token-analysis.mjs --table T-e0`

### T-e0. Giá hiệu dụng suy ra (nền cho T-e)

| Mô hình (requested) | Số lượt gọi | Giá đầu ra (USD/triệu token) | Giá đọc cache | Giá ghi cache | R² |
|---|---|---:|---:|---:|---:|
| opus | 27 | 20.08 | 0.205 | 8.02 | 1.000 |
| sonnet | 153 | 9.77 | 0.109 | 4.05 | 0.975 |

Giá hiệu dụng suy ra bằng bình phương tối thiểu từ calls.csv (cost_usd ~ output + cache_read + cache_write, không hệ số tự do; input bỏ vì ≈ 0). Nhãn mô hình trộn cả lượt haiku phụ, nên đây là giá HIỆU DỤNG chỉ dùng quy đổi tương đối, không phải bảng giá niêm yết.

Lệnh tái lập bảng T-e1: `node docs/research/performance/scripts/token-analysis.mjs --table T-e1`

### T-e1. Mô hình ghi cache theo lượt gọi (nền cho O1)

| Số lượt gọi (mọi vòng) | Hệ số chặn F (token / lượt gọi) | Hệ số theo token ngữ cảnh+công cụ (a) | Hệ số theo token output (b) | R² |
|---|---|---:|---:|---:|
| 195 | 2 399 | 1.54 | 1.14 | 0.740 |

Hồi quy bình phương tối thiểu: cache_write ≈ F + a·(Σ *_chars / 3.5) + b·output, trên mọi dòng calls.csv. F là phần ghi cache cố định mỗi lượt gọi agent (tiền tố mà các lượt gọi không dùng chung được); nếu F nhỏ so với ghi cache TB một lượt gọi thì lượng ghi cache lớn của CCoding đến từ nội dung (đầu ra và kết quả công cụ bị ghi lại ở mỗi tiến trình), không phải từ tiền tố. Tương quan, không phải nhân quả; phụ thuộc giả định charsPerToken.

Lệnh tái lập bảng T-e: `node docs/research/performance/scripts/token-analysis.mjs --table T-e`

### T-e. Ước lượng định lượng cho O1–O6

| Mã | Đề xuất | Tiết kiệm ước tính / lượt chạy (USD) | % chi phí CCoding (cùng nền) | Giả định |
|---|---|---:|---:|---:|
| O1 | Tiền tố prompt ổn định dùng chung cache | 0.038 | 4.7 | Trần trên: phần ghi cache cố định mỗi lượt gọi F = 2 399 token (T-e1) chuyển thành đọc cache ở mọi lượt gọi sau lượt đầu của mỗi lượt chạy, tính giá sonnet. Phần hệ thống gốc của Claude Code đã được cache chéo tiến trình (claude_turns lượt 1 đọc ~33 nghìn token) nên không tính thêm |
| O2 | Tái dùng phiên execute → revise | 0.006 | 0.7 | Mỗi lượt revise đọc lại tối đa min(ghi cache revise, ghi cache TB execute cùng agent) thay vì ghi; trần trên (giả định phiên còn trong TTL). Dữ liệu C5 chỉ có 1 lượt revise |
| O3 | Rút gọn ngữ cảnh 30% | 0.002 | 0.2 | Cắt 30% context_chars ở mọi lượt gọi; mỗi token ngữ cảnh ghi 1 lần + đọc ở (tool_calls) lượt mô hình sau |
| O4 | Reviewer chỉ nhận diff + kết quả lệnh kiểm tra | 0.022 | 2.8 | Pha review: giảm 50% của (context_chars + prompt_chars + tool_output_chars), giả định reviewer không tự đọc lại tệp; 11 lượt review. Chồng lấn một phần với O3 |
| O5 | Giới hạn đầu ra (plan/review/synthesize) | 0.014 | 1.7 | Giảm 20% token output ở 21 lượt gọi plan/review/synthesize; execute không đụng vì output là mã cần viết |
| O6 | Mô hình theo pha: opus → sonnet ở lượt gọi lead | 0.257 | 20.7 | Nền C1 (không phải C5): C1 có 18 lượt gọi opus (plan, synthesize, finalize) tính lại bằng giá hiệu dụng sonnet; C5 đã dùng sonnet ở mọi pha (0 lượt gọi khác sonnet) nên phần còn lại của O6 (sonnet → haiku ở review/plan) KHÔNG định giá được (hồi quy haiku không đáng tin) và chưa đo chất lượng |

Nền: C5, 10 lượt chạy CCoding, chi phí Σ calls.csv = 8.042 USD (TB 0.804 USD / lượt chạy). Theo giá hiệu dụng, đầu ra = 38.3% chi phí, ghi cache = 49.6%, đọc cache = 9.9%. O1–O5 trên nền C5, O6 trên nền C1. Mỗi dòng là ước lượng ĐỘC LẬP (không cộng gộp; O3/O4 chồng lấn). Đây là mô hình giả định trên dữ liệu có sẵn, chưa chạy lại hệ thống; thời gian không được ước lượng. charsPerToken = 3.5 (giả định).

Đọc T-e (ước lượng theo mô hình, chưa kiểm chứng bằng chạy lại):
- **O6** (lead opus → sonnet) lớn nhất trên nền C1, nhưng C5 đã dùng sonnet ở mọi pha nên phần này **đã được hiện thực** và góp phần thu hẹp khoảng cách chi phí C1 → C5. Chất lượng chưa được đo riêng cho thay đổi này.
- **O1** có trần trên 5.1% chi phí (thực tế thấp hơn, vì phần hệ thống gốc của Claude Code đã được cache chéo tiến trình); **O4** 2.8%, **O5** 1.7%, **O2** 0.7% (mới có 1 lượt revise), **O3** 0.2%. Mỗi đề xuất riêng lẻ nhỏ; T-e không ước lượng tác động lên thời gian.
- O3 gần như vô ích vì `context_chars` nhỏ (khoảng 1 200 ký tự ở C5): khối lượng lớn nằm ở kết quả công cụ và đầu ra.
- Chi phí CCoding ở C5: đầu ra 38.1%, ghi cache 49.4%, đọc cache 10.2% (giá hiệu dụng) — đòn bẩy thật nằm ở giảm số tiến trình và lượng tệp/công cụ đọc lặp, không phải tinh chỉnh tiền tố prompt.

Lệnh tái lập bảng T-f: `node docs/research/performance/scripts/token-analysis.mjs --table T-f`

### T-f. Bootstrap CI 95% cho chênh lệch thời gian / chi phí

> **MINH HỌA, n nhỏ — không đủ lực thống kê để khái quát.** Mỗi ô (bài × hệ) chỉ 1–2 lượt. Bootstrap phân tầng theo bài (lấy lại mẫu các lượt trong từng ô; B = 10000, seed = 20261102, phân vị 2,5/97,5); thống kê = TB các bài của (CCoding − Claude). CI chỉ mô phỏng nhiễu trong ô nên hẹp hơn thực tế (thiếu nhiễu giữa bài/ngày/hạn mức). Các hệ ccoding* trong cùng vòng gộp thành "CC".

| Vòng | Tập con | Chỉ số | Cỡ mẫu | Chênh lệch (CC − Claude) | CI 95% (bootstrap) | Chênh lệch tương đối so với Claude [CI] | Nhận xét |
|---|---|---:|---:|---:|---:|---:|---:|
| C1 | tất cả lượt | Thời gian (s) | 4 bài; 8 CC / 8 Claude | 169.4 | [117.1; 223.1] | 98.7% [61.1; 147.4] | CC > Claude |
| C1 | tất cả lượt | Chi phí (USD) | 4 bài; 8 CC / 8 Claude | 0.610 | [0.440; 0.784] | 96.6% [67.0; 130.3] | CC > Claude |
| C2 | tất cả lượt | Thời gian (s) | 1 bài; 2 CC / 2 Claude | 168.5 | [160.0; 177.0] | 68.9% [65.3; 72.5] | CC > Claude |
| C2 | tất cả lượt | Chi phí (USD) | 1 bài; 2 CC / 2 Claude | 1.072 | [0.879; 1.265] | 106.6% [86.8; 126.8] | CC > Claude |
| C3 | – | không có đối chứng Claude cùng vòng |  |  |  |  |  |
| C4 | – | không có đối chứng Claude cùng vòng |  |  |  |  |  |
| C5 | tất cả lượt | Thời gian (s) | 5 bài; 10 CC / 10 Claude | 21.1 | [-22.6; 64.9] | 12.6% [-13.4; 39.5] | CI chứa 0 |
| C5 | tất cả lượt | Chi phí (USD) | 5 bài; 10 CC / 10 Claude | 0.144 | [0.077; 0.210] | 21.8% [11.5; 32.1] | CC > Claude |
| C5 | loại t3 lượt 1 (treo stdin, 579 s) — độ nhạy | Thời gian (s) | 5 bài; 9 CC / 10 Claude | -14.7 | [-26.7; -2.5] | -8.8% [-15.7; -1.5] | CC < Claude |
| C5 | loại t3 lượt 1 (treo stdin, 579 s) — độ nhạy | Chi phí (USD) | 5 bài; 9 CC / 10 Claude | 0.156 | [0.093; 0.220] | 23.7% [14.0; 33.7] | CC > Claude |
| C6 | tất cả lượt | Thời gian (s) | 2 bài; 4 CC / 4 Claude | -72.8 | [-105.3; -40.3] | -28.4% [-40.0; -15.9] | CC < Claude |
| C6 | tất cả lượt | Chi phí (USD) | 2 bài; 4 CC / 4 Claude | 0.136 | [-0.016; 0.287] | 13.2% [-1.4; 30.2] | CI chứa 0 |
| C5+C6 | gộp lượt trong bài, bỏ lượt treo — độ nhạy | Thời gian (s) | 5 bài; 13 CC / 14 Claude | -28.2 | [-44.4; -11.4] | -16.0% [-24.2; -6.8] | CC < Claude |
| C5+C6 | gộp lượt trong bài, bỏ lượt treo — độ nhạy | Chi phí (USD) | 5 bài; 13 CC / 14 Claude | 0.125 | [0.047; 0.204] | 18.1% [6.5; 30.4] | CC > Claude |
| C5+C6 | gộp lượt trong bài, giữ lượt treo — độ nhạy | Thời gian (s) | 5 bài; 14 CC / 14 Claude | -9.3 | [-40.2; 30.2] | -5.3% [-22.2; 17.4] | CI chứa 0 |
| C5+C6 | gộp lượt trong bài, giữ lượt treo — độ nhạy | Chi phí (USD) | 5 bài; 14 CC / 14 Claude | 0.122 | [0.046; 0.199] | 17.6% [6.4; 29.6] | CC > Claude |

C6 chỉ có 2 bài (t3, t5), 2 lượt mỗi ô nên CI của dòng C6 càng chỉ là minh họa. Hai dòng "C5+C6" trộn hai thời điểm và hai phiên bản mã (C6 sau d7600f6: maxParallel 4), và được chọn SAU khi thấy dữ liệu: coi là độ nhạy, không phải kết quả chính.

Đọc T-f: ở C1 và C2, CI không chứa 0 theo hướng CCoding chậm và đắt hơn. Ở C5 thời gian không phân biệt được (CI chứa 0), chi phí vẫn cao hơn. Dòng "loại t3 lượt 1" là phân tích độ nhạy chọn sau khi thấy ngoại lệ; hướng của nó đổi (CCoding nhanh hơn) nên **kết luận về thời gian ở C5 nhạy với một lượt chạy**. CI hẹp một cách giả tạo vì chỉ lấy lại mẫu nhiễu trong ô (1–2 lượt).

Lệnh tái lập bảng T-g: `node docs/research/performance/scripts/token-analysis.mjs --table T-g`

### T-g. Tỉ lệ thời gian và chi phí làn nhanh / Claude theo bài: C5, C6, gộp C5+C6

Tỉ lệ = TB thời gian (CCoding làn nhanh) / TB thời gian (Claude Code) trong cùng ô; < 1 nghĩa là CCoding nhanh hơn. Trong ngoặc: số lượt CCoding/Claude. Cột "C5+C6" gộp mọi lượt của bài trong hai vòng (trộn thời điểm và phiên bản mã; Claude Code t3 chạy 155–160 s ở C5 nhưng 246–258 s ở C6 nên gộp không loại được nhiễu thời điểm).

| Bài | Tỉ lệ thời gian C5 (mọi lượt) | C6 | C5+C6 (bỏ lượt treo) | C5+C6 (giữ lượt treo) |
|---|---|---:|---:|---:|
| t1-duration | 0.85 (2/2) | – | 0.85 (2/2) | (như cột trước) |
| t2-orders | 1.16 (2/2) | – | 1.16 (2/2) | (như cột trước) |
| t3-api | 2.54 (2/2) | 0.76 (2/2) | 0.98 (3/4) | 1.45 (4/4) |
| t4-perf | 0.76 (2/2) | – | 0.76 (2/2) | (như cột trước) |
| t5-logq | 0.68 (2/2) | 0.67 (2/2) | 0.67 (4/4) | (như cột trước) |

TB không trọng số các bài của tỉ lệ C5+C6: 0.89 (bỏ lượt treo), 0.98 (giữ lượt treo).

| Bài | Tỉ lệ chi phí C5 | C6 | C5+C6 (bỏ lượt treo) |
|---|---|---:|---:|
| t1-duration | 1.06 | – | 1.06 |
| t2-orders | 1.58 | – | 1.58 |
| t3-api | 1.60 | 1.06 | 1.29 |
| t4-perf | 0.92 | – | 0.92 |
| t5-logq | 1.06 | 1.21 | 1.14 |

Đọc T-g: các tỉ lệ gộp C5+C6 theo bài trùng chỉ dẫn của giám đốc (`t3` 0.98 khi bỏ lượt treo — giá trị thực 0.985, chỉ dẫn làm tròn lên 0,99, script hiển thị 0.98; `t5` 0.67; `t1` 0.85, `t2` 1.16, `t4` 0.76). Nếu giữ lượt treo thì `t3` là 1.45. Chi phí gộp ≥ 1 ở 4/5 bài (chỉ `t4` 0.92): làn nhanh có TB thời gian thấp hơn ở 4/5 bài (`t3` gần ngang) nhưng không rẻ hơn.

## 4. Khi nào multi-agent nhanh hơn agent đơn?

Trả lời thẳng, trên dữ liệu có (n nhỏ, một mô hình lead, 5 bài mỗi bài vài trăm giây):

1. **Thiết kế đầy đủ ban đầu (họp, tổng hợp bằng opus) chậm hơn và đắt hơn ~2×** (C1, C2) — kết quả âm tính.
2. **Làn nhanh nhanh hơn khi chia được hạng mục độc lập để chạy song song, nhưng bằng chứng còn mỏng.** Ở C5 `execute` đạt hệ số song song 2.02; CCoding nhanh hơn ở `t1`, `t4`, `t5`, chậm hơn ở `t2`, `t3`; trung bình toàn vòng chênh lệch thời gian không phân biệt được với 0 (T-f). Ở C6 (`maxParallel` 4, chỉ `t3`, `t5`) CCoding nhanh hơn ở cả hai (hệ số song song 2.26; chênh lệch −72.8 s, CI [−105.3; −40.3]), và gộp C5+C6 theo bài (độ nhạy) TB thời gian thấp hơn Claude 28.2 s [−44.4; −11.4] khi bỏ lượt treo, nhưng CI chứa 0 khi giữ lượt treo (−9.3 s [−40.2; 30.2]) — kết luận phụ thuộc có tính lượt treo stdin hay không. Ngoại lệ âm tính: `t2` (1.16×) chậm hơn ở C5 và chưa được đo lại ở C6. Nhiễu thời điểm cùng cỡ hiệu ứng (Claude Code `t3` 155–160 s ở C5, 246–258 s ở C6). Bài loại nào chia song song tốt là giả thuyết cần thí nghiệm, chưa phải kết quả.
3. **Không có bằng chứng multi-agent rẻ hơn.** Chi phí C5 cao hơn +21.8% (CI [11.5; 32.1]%); chỉ `t4` thấp hơn. C6: +0.136 USD [−0.016; 0.287] (`t3` 1.06×, `t5` 1.21×); gộp C5+C6 +18.1% [6.5; 30.4] khi bỏ lượt treo. Hướng nhất quán: nhanh hơn có thể, rẻ hơn thì không.
4. **Chất lượng không phải lợi thế đo được** trong 5 bài này: cả hai gần như đạt trọn.
5. **Chưa loại trừ lợi ích với bài dài hơn** (nhiều hạng mục, > 15 phút), nơi chi phí cố định của điều phối nhỏ hơn so với phần song song — dữ liệu hiện tại không có bài như vậy, nên đây là giả thuyết, không phải kết quả.

## 5. Giới hạn

- **n rất nhỏ**: 1–2 lượt mỗi ô, 5 bài, tối đa 10 lượt CCoding mỗi vòng; không kiểm định giả thuyết chính thức, chỉ bootstrap minh họa, không hiệu chỉnh so sánh bội.
- **Nhiễu thời gian không kiểm soát**: thời gian tường phụ thuộc tải nhà cung cấp; các vòng chạy khác thời điểm (1/11 và 2/11) và hạn mức; C4 chạy hai nhiệm vụ CCoding đồng thời nên thời gian nhiễu.
- **Giá hiệu dụng** suy ra bằng hồi quy (R² mô hình sonnet 0.975 sau khi thêm C6), nhãn mô hình trộn haiku; chỉ để quy đổi tương đối.
- **O1–O6 là giả định**; `charsPerToken` = 3.5 chưa hiệu chuẩn. Hồi quy T-e1 có R² 0.740 nên một phần ghi cache chưa được giải thích.
- `claude_turns.csv` không có cột `system`, không có ở C3/C4; `output_partial` không dùng được; `calls.csv` không tách TTL ghi cache của CCoding; không có `events.jsonl`.
- Đường găng giả định các pha nối tiếp; `ts` là thời điểm kết thúc (đã kiểm với lượt 1); "ngoài LLM" chỉ là phần dư.
- Hai hệ khác cấu hình mô hình (Claude Code: opus; CCoding C5: sonnet): so sánh là của **cả hệ thống**, không tách hiệu ứng multi-agent khỏi hiệu ứng mô hình.
- **C6 chỉ có 2 bài × 2 lượt × 2 hệ (8 lượt chạy)**, lấy từ commit `5866cda` chứ không từ `results/` của nhánh này; CI của dòng C6 là minh họa. Chưa có `events.jsonl` nên nguyên nhân "còn chậm ở đâu" ở C6 chưa được tự kiểm.
- Thêm C6 làm đổi nhẹ các bảng phụ thuộc mọi dòng `calls.csv` (T-e0: R² sonnet; T-e1: F từ 2 588 xuống 2 399 token) và tỷ lệ O1–O5 (nền vẫn là C5); không đổi kết luận.
- Gộp C5+C6 trộn hai thời điểm và hai phiên bản mã; so sánh có nghĩa nhất là cùng thời điểm, nhưng ở C5 và C6 cặp lượt Claude/CCoding không được ghép từng đôi nên chưa tách được nhiễu thời điểm.
