# Phân tích token, cache và thời gian: multi-agent CCoding so với agent đơn (RQ3)

> Hạng mục S2 — Phòng Nghiên cứu · @data-scientist · 2/11/2026 · phân loại dữ liệu: nội bộ.
> Mọi bảng dưới đây được **sinh nguyên văn** bởi `docs/research/performance/scripts/token-analysis.mjs`; kiểm tra khớp bằng
> `node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md`.
> Số thập phân dùng dấu chấm (đầu ra script); số nguyên nhóm bằng dấu cách. Các con số trong phần diễn giải trích từ các bảng này.

## 1. Tóm tắt

- **Chất lượng ngang nhau, nên so sánh quy về thời gian và chi phí.** Cả hai hệ gần như đạt trọn test ẩn ở mọi vòng (T-a: mỗi hệ rớt đúng 1 test ở một số lượt — Claude 297/298 ở `t1-duration` C1 và C5, CCoding 59/60 ở `t2-orders` C4).
- **Kết quả âm tính ở thiết kế ban đầu (C1, C2).** CCoding chậm hơn và đắt hơn khoảng gấp đôi (T-f: C1 thời gian +169.4 s, chi phí +0.610 USD; CI 95% không chứa 0). Ở C1 song song chỉ tiết kiệm 12.9% thời gian tuần tự (T-d).
- **Làn nhanh (C5) thu hẹp khoảng cách nhưng không đảo ngược chi phí.** Thời gian: chênh lệch +21.1 s, CI chứa 0 (không phân biệt được với bằng nhau); loại ngoại lệ treo stdin thì −14.7 s [−26.7; −2.5], nhưng đó là phân tích độ nhạy chọn sau khi thấy dữ liệu. Chi phí: CCoding vẫn đắt hơn +0.144 USD (+21.8%), CI không chứa 0.
- **Con số "ghi cache gấp 2,8–4 lần" chỉ đúng một phần** (T-b): 4.71× ở C1, 6.08× ở C2, 3.34× ở C5. Với thiết kế hiện hành (C5) con số nằm trong khoảng nêu.
- **Tiền tố prompt không phải thủ phạm chính của ghi cache** (T-e1: phần cố định chỉ 2 588 token mỗi lượt gọi). Ghi cache theo nội dung (đầu ra + kết quả công cụ). Trong ước lượng, đổi mô hình lead từ opus sang sonnet (O6) lớn nhất nhưng C5 đã áp dụng sẵn; O1–O5 mỗi cái ≤ 5.1% chi phí (T-e).
- **Tất cả là 1–2 lượt mỗi ô; bootstrap chỉ là minh họa.** Không rút kết luận khái quát. C6: chưa có dữ liệu.

## 2. Phương pháp

**Dữ liệu.** `bench/vs-claude/results/{runs,phases,calls,claude_turns}.csv` và `summary.json`; không có `events.jsonl` trong `results/C*/` (chỉ có `result.json`, `grade-*.tap`, `ccoding-task.json`), nên không dùng. Năm bài (`t1`–`t5`), test ẩn chấm tự động; mỗi hệ chạy tuần tự (xem `bench/vs-claude/README.md`). Vòng C1–C2 = mốc ban đầu, C3–C4 = bước trung gian, C5 = làn nhanh; **C6 chưa có dữ liệu** nên mọi bảng ghi "chưa có dữ liệu", không nội suy.

**Giao thức (ghi trước khi tính).**
1. Kiểm tra schema và đối chiếu tổng giữa các tệp (T-0). `runs.csv` là nguồn chuẩn cho tổng; `calls.csv` (theo lượt gọi agent) và `claude_turns.csv` (theo lượt mô hình) khác độ mịn nên chỉ so sánh ở mức lượt chạy.
2. Baseline = Claude Code thuần cùng vòng (T-a, T-b, T-f). Vòng không có Claude cùng vòng (C3, C4) không có tỷ lệ/CI.
3. Đường găng (T-d) tính từ `ts` (thời điểm kết thúc) và `duration_s`: khoảng của một lượt gọi là [ts − duration_s, ts]; thời gian pha = độ dài hợp các khoảng; găng lượt chạy = Σ các pha (giả định pha nối tiếp).
4. Ước lượng O1–O6 (T-e) là mô hình giả định trên dữ liệu có sẵn, **không chạy lại hệ thống**; mỗi dòng độc lập, kèm giả định. Giá quy đổi suy ra bằng bình phương tối thiểu từ `calls.csv` (T-e0), không phải bảng giá niêm yết.
5. Bootstrap (T-f): phân tầng theo bài, B = 10 000, seed = 20261102, phân vị 2,5/97,5. n = 1–2 lượt mỗi ô nên **chỉ minh họa**.
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
| claude_turns.csv | input / cache_read / cache_write (_1h, _5m) | token theo TỪNG lượt mô hình của Claude Code; cache_write = _1h + _5m | Claude (chỉ C1, C2, C5) |
| claude_turns.csv | output_partial | token đầu ra từ luồng sự kiện từng phần — KHÔNG dùng (≪ output thật trong runs.csv) | Claude |

Đối chiếu: 29/29 lượt CCoding có Σ(calls.csv) = runs.csv về input/output/cache_read/cache_write; 20/20 lượt Claude có Σ(claude_turns.csv) = runs.csv về cache_read/cache_write.

Quy đổi: runs.csv là nguồn chuẩn cho tổng. calls.csv (CCoding, theo lượt gọi agent = một tiến trình) và claude_turns.csv (Claude, theo lượt mô hình) KHÔNG cùng độ mịn, nên so sánh chỉ ở mức tổng theo lượt chạy hoặc "mỗi lượt gọi agent" (CCoding) với "mỗi lượt chạy" (Claude). claude_turns.csv có ở các vòng: C1, C2, C5; không có events.jsonl trong results/C*/.

Ghi cache của Claude theo TTL: 1 giờ = 600 399 token, 5 phút = 0 token (100.0% là 1 giờ). calls.csv không tách TTL cho CCoding.

Dữ liệu có: 49 lượt chạy, 170 dòng calls.csv, 163 dòng phases.csv, 170 dòng claude_turns.csv; vòng có trong runs.csv: C1, C2, C3, C4, C5.

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
| C6 | – | – | chưa có dữ liệu | chưa có dữ liệu | chưa có dữ liệu | chưa có dữ liệu | chưa có dữ liệu | chưa có dữ liệu | chưa có dữ liệu | chưa có dữ liệu | chưa có dữ liệu | chưa có dữ liệu | chưa có dữ liệu |

Đọc T-a: ở C1 và C2 (thiết kế ban đầu) CCoding chậm hơn và đắt hơn ở mọi bài có đối chứng. Ở C5, CCoding nhanh hơn ở `t1`, `t4`, `t5` (107/153/175 s so với 126/203/259 s), chậm hơn ở `t2` (106 so với 91 s) và `t3` (400 so với 158 s; trong đó lượt 579 s là lỗi treo stdin, lượt còn lại 221 s). Chi phí CCoding thấp hơn Claude ở đúng một ô C5 (`t4`, 0.574 so với 0.627 USD).

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
| C6 | – | – | chưa có dữ liệu |  |  |  |  |  |  |  |

Kiểm lại "gấp 2,8–4 lần": theo từng ô (vòng × bài × hệ có đối chứng Claude cùng vòng) tỷ lệ ghi cache nằm trong 2.76–6.08; 5/10 ô trong khoảng 2,8–4. Tỷ lệ gộp: C1/ccoding 4.71×; C2/ccoding 6.08×; C5/ccoding-fastlane 3.34×. Kết luận: ĐÚNG MỘT PHẦN: 1/3 tỷ lệ gộp theo vòng nằm trong 2,8–4. C3, C4 không có đối chứng Claude cùng vòng nên không có hàng tỷ lệ; C6: chưa có dữ liệu.

Đọc T-b: khoảng "2,8–4 lần" của đề bài là **đúng một phần**. Nó khớp C5 (gộp 3.34×; 4 trong 5 bài nằm trong 2,8–4, riêng `t4` là 2.76 — sát dưới ngưỡng) nhưng lệch với C1 (4.71×) và C2 (6.08×). Mỗi ô chỉ 1–2 lượt nên nên trình bày như một thang giá trị, không phải hằng số. Cơ chế quan sát được: Claude chạy một tiến trình (ghi cache TB 28 033 token ở C1, 29 423 ở C5) còn CCoding chạy nhiều tiến trình (5.0–6.3 lượt gọi/lượt chạy) với 19 656–21 146 token ghi cache mỗi lượt gọi — tổng tăng vì **số lượt gọi nhân với phần nội dung mỗi lượt gọi tự ghi**, và T-e1 cho thấy phần cố định không phải nguyên nhân chính. Ghi cache của Claude đều là TTL 1 giờ (T-0). Đây là liên hệ mô tả, không phải bằng chứng nhân quả.

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

Đọc T-c: pha `execute` chiếm 50.1% (C1) và 60.0% (C5) lượng ghi cache; `review` chiếm 16.9% (C1) và 24.0% (C5) dù output của reviewer nhỏ — do `prompt_chars` (12 921 ký tự ở C5) và `tool_output_chars` (17 783) lớn, tức reviewer đọc nhiều. Σ retries = 0 ở mọi pha. Pha `discuss` chỉ có ở C1–C2, không còn ở làn nhanh.

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

**(2) Theo lượt chạy** — đường găng LLM = Σ đường găng các pha (giả định các pha nối tiếp nhau); "ngoài LLM" = thời gian tường − đường găng LLM (chạy kiểm tra, tạo/gộp worktree, chờ, điều phối; có thể âm do làm tròn duration_s).

| Vòng | Số lượt chạy | Thời gian tường TB (s) | Σ tuần tự LLM TB (s) | Đường găng LLM TB (s) | Tiết kiệm nhờ song song TB (s) | Ngoài LLM TB (s) | Tiết kiệm / tuần tự (%) |
|---|---|---:|---:|---:|---:|---:|---:|
| C1 | 8 | 341 | 353 | 308 | 45 | 33 | 12.9 |
| C2 | 4 | 339 | 351 | 289 | 62 | 50 | 11.6 |
| C3 | 2 | 190 | 169 | 169 | 0 | 20 | 0.0 |
| C4 | 5 | 195 | 247 | 183 | 64 | 12 | 25.0 |
| C5 | 10 | 188 | 265 | 187 | 78 | 1 | 30.5 |
| C6 | chưa có dữ liệu |  |  |  |  |  |  |

Đọc T-d: chỉ pha `execute` có song song; hệ số tăng từ 1.27 (C1) lên 2.02 (C5) khi làn nhanh chạy cùng lúc các hạng mục độc lập. Tiết kiệm nhờ song song tăng từ 12.9% (C1) lên 30.5% (C5) so với thời gian tuần tự. Sau khi song song hóa, `review` (81.3 s) thành pha dài nhất ở C5, lớn hơn đường găng của `execute` (76.9 s) — đó là chỗ tối ưu tiếp theo (O4). Thời gian ngoài LLM nhỏ (1 s ở C5) theo cách tính này. C3 chỉ có một hạng mục nên không có song song.

Lệnh tái lập bảng T-e0: `node docs/research/performance/scripts/token-analysis.mjs --table T-e0`

### T-e0. Giá hiệu dụng suy ra (nền cho T-e)

| Mô hình (requested) | Số lượt gọi | Giá đầu ra (USD/triệu token) | Giá đọc cache | Giá ghi cache | R² |
|---|---|---:|---:|---:|---:|
| opus | 27 | 20.08 | 0.205 | 8.02 | 1.000 |
| sonnet | 128 | 9.73 | 0.112 | 4.05 | 0.970 |

Giá hiệu dụng suy ra bằng bình phương tối thiểu từ calls.csv (cost_usd ~ output + cache_read + cache_write, không hệ số tự do; input bỏ vì ≈ 0). Nhãn mô hình trộn cả lượt haiku phụ, nên đây là giá HIỆU DỤNG chỉ dùng quy đổi tương đối, không phải bảng giá niêm yết.

Lệnh tái lập bảng T-e1: `node docs/research/performance/scripts/token-analysis.mjs --table T-e1`

### T-e1. Mô hình ghi cache theo lượt gọi (nền cho O1)

| Số lượt gọi (mọi vòng) | Hệ số chặn F (token / lượt gọi) | Hệ số theo token ngữ cảnh+công cụ (a) | Hệ số theo token output (b) | R² |
|---|---|---:|---:|---:|
| 170 | 2 588 | 1.50 | 1.16 | 0.716 |

Hồi quy bình phương tối thiểu: cache_write ≈ F + a·(Σ *_chars / 3.5) + b·output, trên mọi dòng calls.csv. F là phần ghi cache cố định mỗi lượt gọi agent (tiền tố mà các lượt gọi không dùng chung được); nếu F nhỏ so với ghi cache TB một lượt gọi thì lượng ghi cache lớn của CCoding đến từ nội dung (đầu ra và kết quả công cụ bị ghi lại ở mỗi tiến trình), không phải từ tiền tố. Tương quan, không phải nhân quả; phụ thuộc giả định charsPerToken.

Lệnh tái lập bảng T-e: `node docs/research/performance/scripts/token-analysis.mjs --table T-e`

### T-e. Ước lượng định lượng cho O1–O6

| Mã | Đề xuất | Tiết kiệm ước tính / lượt chạy (USD) | % chi phí CCoding (cùng nền) | Giả định |
|---|---|---:|---:|---:|
| O1 | Tiền tố prompt ổn định dùng chung cache | 0.041 | 5.1 | Trần trên: phần ghi cache cố định mỗi lượt gọi F = 2 588 token (T-e1) chuyển thành đọc cache ở mọi lượt gọi sau lượt đầu của mỗi lượt chạy, tính giá sonnet. Phần hệ thống gốc của Claude Code đã được cache chéo tiến trình (claude_turns lượt 1 đọc ~33 nghìn token) nên không tính thêm |
| O2 | Tái dùng phiên execute → revise | 0.006 | 0.7 | Mỗi lượt revise đọc lại tối đa min(ghi cache revise, ghi cache TB execute cùng agent) thay vì ghi; trần trên (giả định phiên còn trong TTL). Dữ liệu C5 chỉ có 1 lượt revise |
| O3 | Rút gọn ngữ cảnh 30% | 0.002 | 0.2 | Cắt 30% context_chars ở mọi lượt gọi; mỗi token ngữ cảnh ghi 1 lần + đọc ở (tool_calls) lượt mô hình sau |
| O4 | Reviewer chỉ nhận diff + kết quả lệnh kiểm tra | 0.022 | 2.8 | Pha review: giảm 50% của (context_chars + prompt_chars + tool_output_chars), giả định reviewer không tự đọc lại tệp; 11 lượt review. Chồng lấn một phần với O3 |
| O5 | Giới hạn đầu ra (plan/review/synthesize) | 0.014 | 1.7 | Giảm 20% token output ở 21 lượt gọi plan/review/synthesize; execute không đụng vì output là mã cần viết |
| O6 | Mô hình theo pha: opus → sonnet ở lượt gọi lead | 0.257 | 20.7 | Nền C1 (không phải C5): C1 có 18 lượt gọi opus (plan, synthesize, finalize) tính lại bằng giá hiệu dụng sonnet; C5 đã dùng sonnet ở mọi pha (0 lượt gọi khác sonnet) nên phần còn lại của O6 (sonnet → haiku ở review/plan) KHÔNG định giá được (hồi quy haiku không đáng tin) và chưa đo chất lượng |

Nền: C5, 10 lượt chạy CCoding, chi phí Σ calls.csv = 8.042 USD (TB 0.804 USD / lượt chạy). Theo giá hiệu dụng, đầu ra = 38.1% chi phí, ghi cache = 49.4%, đọc cache = 10.2%. O1–O5 trên nền C5, O6 trên nền C1. Mỗi dòng là ước lượng ĐỘC LẬP (không cộng gộp; O3/O4 chồng lấn). Đây là mô hình giả định trên dữ liệu có sẵn, chưa chạy lại hệ thống; thời gian không được ước lượng. charsPerToken = 3.5 (giả định).

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
| C6 | – | chưa có dữ liệu |  |  |  |  |  |

C6: chưa có dữ liệu.

Đọc T-f: ở C1 và C2, CI không chứa 0 theo hướng CCoding chậm và đắt hơn. Ở C5 thời gian không phân biệt được (CI chứa 0), chi phí vẫn cao hơn. Dòng "loại t3 lượt 1" là phân tích độ nhạy chọn sau khi thấy ngoại lệ; hướng của nó đổi (CCoding nhanh hơn) nên **kết luận về thời gian ở C5 nhạy với một lượt chạy**. CI hẹp một cách giả tạo vì chỉ lấy lại mẫu nhiễu trong ô (1–2 lượt).

## 4. Khi nào multi-agent nhanh hơn agent đơn?

Trả lời thẳng, trên dữ liệu có (n nhỏ, một mô hình lead, 5 bài mỗi bài vài trăm giây):

1. **Thiết kế đầy đủ ban đầu (họp, tổng hợp bằng opus) chậm hơn và đắt hơn ~2×** (C1, C2) — kết quả âm tính.
2. **Làn nhanh chỉ nhanh hơn khi chia được hạng mục độc lập để chạy song song.** Ở C5 `execute` đạt hệ số song song 2.02; CCoding nhanh hơn ở `t1`, `t4`, `t5`, không nhanh hơn ở `t2`, `t3`; trung bình toàn vòng chênh lệch thời gian không phân biệt được với 0 (T-f). Bài loại nào chia song song tốt là giả thuyết cần thí nghiệm, chưa phải kết quả.
3. **Không có bằng chứng multi-agent rẻ hơn.** Chi phí C5 cao hơn +21.8% (CI [11.5; 32.1]%); chỉ `t4` thấp hơn.
4. **Chất lượng không phải lợi thế đo được** trong 5 bài này: cả hai gần như đạt trọn.
5. **Chưa loại trừ lợi ích với bài dài hơn** (nhiều hạng mục, > 15 phút), nơi chi phí cố định của điều phối nhỏ hơn so với phần song song — dữ liệu hiện tại không có bài như vậy, nên đây là giả thuyết, không phải kết quả.

## 5. Giới hạn

- **n rất nhỏ**: 1–2 lượt mỗi ô, 5 bài, tối đa 10 lượt CCoding mỗi vòng; không kiểm định giả thuyết chính thức, chỉ bootstrap minh họa, không hiệu chỉnh so sánh bội.
- **Nhiễu thời gian không kiểm soát**: thời gian tường phụ thuộc tải nhà cung cấp; các vòng chạy khác thời điểm (1/11 và 2/11) và hạn mức; C4 chạy hai nhiệm vụ CCoding đồng thời nên thời gian nhiễu.
- **Giá hiệu dụng** suy ra bằng hồi quy (R² mô hình sonnet 0.970), nhãn mô hình trộn haiku; chỉ để quy đổi tương đối.
- **O1–O6 là giả định**; `charsPerToken` = 3.5 chưa hiệu chuẩn. Hồi quy T-e1 có R² 0.716 nên một phần ghi cache chưa được giải thích.
- `claude_turns.csv` không có cột `system`, không có ở C3/C4; `output_partial` không dùng được; `calls.csv` không tách TTL ghi cache của CCoding; không có `events.jsonl`.
- Đường găng giả định các pha nối tiếp; `ts` là thời điểm kết thúc (đã kiểm với lượt 1); "ngoài LLM" chỉ là phần dư.
- Hai hệ khác cấu hình mô hình (Claude Code: opus; CCoding C5: sonnet): so sánh là của **cả hệ thống**, không tách hiệu ứng multi-agent khỏi hiệu ứng mô hình.
- C6: chưa có dữ liệu — cần chạy lại các bảng khi có.
