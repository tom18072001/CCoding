# Phân tích token, cache và thời gian: multi-agent CCoding so với agent đơn (RQ3)

> Hạng mục S2 — Phòng Nghiên cứu · @data-scientist · 2/11/2026 · phân loại dữ liệu: nội bộ. **Cập nhật vòng 2** (nhiệm vụ T-20261102-121636-dd9, hạng mục S1): thêm C7 (Claude Code một mình bằng Sonnet), bảng T-h và T-i, mở rộng T-d (3), cột p hoán vị ở T-f.
> Mọi bảng dưới đây được **sinh nguyên văn** bởi `docs/research/performance/scripts/token-analysis.mjs`; kiểm tra khớp bằng
> `node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md`.
> Số thập phân dùng dấu chấm (đầu ra script); số nguyên nhóm bằng dấu cách. Các con số trong phần diễn giải trích từ các bảng này.

## 1. Tóm tắt

- **Chất lượng ngang nhau, nên so sánh quy về thời gian và chi phí.** Cả hai hệ gần như đạt trọn test ẩn ở mọi vòng (T-a: mỗi hệ rớt đúng 1 test ở một số lượt — Claude 297/298 ở `t1-duration` C1 và C5, CCoding 59/60 ở `t2-orders` C4).
- **Kết quả âm tính ở thiết kế ban đầu (C1, C2).** CCoding chậm hơn và đắt hơn khoảng gấp đôi (T-f: C1 thời gian +169.4 s, chi phí +0.610 USD; CI 95% không chứa 0). Ở C1 song song chỉ tiết kiệm 12.9% thời gian tuần tự (T-d).
- **Làn nhanh (C5) thu hẹp khoảng cách nhưng không đảo ngược chi phí.** Thời gian: chênh lệch +21.1 s, CI chứa 0 (không phân biệt được với bằng nhau); loại ngoại lệ treo stdin thì −14.7 s [−26.7; −2.5], nhưng đó là phân tích độ nhạy chọn sau khi thấy dữ liệu. Chi phí: CCoding vẫn đắt hơn +0.144 USD (+21.8%), CI không chứa 0.
- **C6 (làn nhanh sau `d7600f6`, chỉ `t3`, `t5`, 2 lượt mỗi ô) cho kết quả thuận hơn về thời gian.** CCoding nhanh hơn Claude Code ở cả hai bài (`t3` 192 so với 252 s, `t5` 174 so với 260 s; T-a, T-g), chênh lệch −72.8 s [−105.3; −40.3] (T-f); chi phí +0.136 USD [−0.016; 0.287], CI chứa 0, tức chi phí ngang hoặc cao hơn. Gộp C5+C6 theo bài (độ nhạy, chọn sau khi thấy dữ liệu), tỉ lệ thời gian là `t1` 0.85 · `t2` 1.16 · `t3` 0.98 · `t4` 0.76 · `t5` 0.67 (bỏ lượt treo; T-g). `t3` đảo từ 2.54 (C5, có lượt treo) xuống 0.76 (C6) chủ yếu vì Claude Code chạy chậm hơn ở C6 (155–160 → 246–258 s), nên một phần "lợi thế" là nhiễu thời điểm.
- **C7 tách hiệu ứng mô hình: cùng mô hình Sonnet, cùng thời điểm, một agent nhanh hơn làn nhanh ở 4/5 bài.** Claude Code một mình bằng Sonnet (hệ `claude-sonnet`, 2 lượt mỗi bài) đạt 100% test ẩn ở mọi lượt (10/10). Tỉ lệ thời gian làn nhanh / Sonnet đơn (làn nhanh C5–C7 gộp, bỏ lượt treo): `t1` 1.64 · `t2` 2.27 · `t3` 1.85 · `t4` 2.90 · `t5` 1.00 (T-h); chỉ dùng lượt C7 của làn nhanh: 1.66 · 1.71 · 1.79 · 2.45 · 0.77 (một lượt mỗi bài). Cùng thời điểm (T-i, hàng 1): làn nhanh chậm hơn **+38.0 s (+44.3%)**, p hoán vị 0.0329 (243 hoán vị, p nhỏ nhất có thể 1/243); chi phí **+0.441 USD (+171.6%)**, p hoán vị 0.0041. CI bootstrap [35.0; 41.0] **hẹp giả tạo** vì ô làn nhanh chỉ có 1 lượt; dựa vào p hoán vị và số theo bài. Chi phí làn nhanh / Sonnet đơn: 2.47–3.79× (gộp), 1.99–3.56× (chỉ C7).
- **Lợi thế thời gian của làn nhanh so với Opus chủ yếu đến từ mô hình.** Sonnet đơn so với Opus đơn: −90.8 s (−51.4%) và −0.436 USD (−62.9%), p hoán vị < 0.0001 (48 600 hoán vị; khác thời điểm: C7 so với C5–C6). Làn nhanh so với Opus: −28.2 s (C5–C6, p 0.0317) hoặc −34.9 s (C5–C7, p 0.0053), tức nhỏ hơn nhiều so với phần Sonnet một mình tiết kiệm được. Ba hiệu ứng này đo ở thời điểm và mẫu khác nhau nên không cộng được.
- **Chi phí cố định của điều phối (T-d (3)).** Kế hoạch + review + gộp/ngoài LLM của làn nhanh = 239.5 s cho 5 bài ở C7, bằng **55.8%** tổng thời gian Sonnet đơn cần cho 5 bài (429.0 s); gộp C5–C7 là 72.8%. Theo bài ở C7: `t1` 58.8% · `t2` 94.9% · `t3` 54.5% · `t4` 113.1% · `t5` 28.8%. Ở `t2` và `t4` phần cố định đã gần bằng hoặc vượt thời gian một agent làm xong cả bài. Chỉ `t5` (4 hạng mục độc lập) phần execute song song (79.4 s) nhỏ hơn một nửa Sonnet đơn (165.5 s), nên là bài duy nhất làn nhanh không chậm hơn.
- **Lượt C7 `t2` làn nhanh 52/60 (đã kiểm, KHÁC mô tả trong BRIEF-2).** Test ẩn hỏng: 6 test thuộc lỗi #3 (mua X tặng Y) và 2 test thuộc lỗi #4 (hạn mã NOV theo UTC); `runs.csv` cắt `failed_hidden` ở 5 mục (chỉ #3), danh sách đủ nằm trong `result.json`/`grade-hidden.tap`. **Pha review đã bắt được**: reviewer trả `approved: false`, vấn đề mức `major`, nêu đúng hai lỗi, dòng mã và cách sửa. Nhưng không có pha revise (`reviewRound` = 0 dù `maxRevisions` = 1), hạng mục sở hữu `src/promotions.js` có trong kế hoạch nhưng không chạy (chỉ S1 và S3 hoàn tất, `calls.csv` chỉ có 2 lượt execute), và harness vẫn ghi `done` (kèm `attention: review`). Vậy đây là bằng chứng về lỗ hổng ở điều phối và vòng phản hồi, **không phải** verifier LLM bỏ sót. Xem mục T-h bên dưới.
- **Con số "ghi cache gấp 2,8–4 lần" chỉ đúng một phần** (T-b): 4.71× ở C1, 6.08× ở C2, 3.34× ở C5, 3.37× ở C6. Với thiết kế hiện hành (C5, C6) con số nằm trong khoảng nêu.
- **Tiền tố prompt không phải thủ phạm chính của ghi cache** (T-e1: phần cố định chỉ 2 350 token mỗi lượt gọi). Ghi cache theo nội dung (đầu ra + kết quả công cụ). Trong ước lượng, đổi mô hình lead từ opus sang sonnet (O6) lớn nhất nhưng C5 đã áp dụng sẵn; O1–O5 mỗi cái ≤ 4.6% chi phí (T-e).
- **Tất cả là n nhỏ; bootstrap và hoán vị chỉ là minh họa.** 1–2 lượt mỗi ô ở C1–C6; C7 có 1 lượt làn nhanh và 2 lượt Sonnet mỗi bài; không hiệu chỉnh so sánh bội. Không rút kết luận khái quát.

## 2. Phương pháp

**Dữ liệu.** `bench/vs-claude/results/{runs,phases,calls,claude_turns}.csv` và `summary.json`; không có `events.jsonl` trong `results/C*/` (chỉ có `result.json`, `grade-*.tap`, `ccoding-task.json`), nên không dùng. Năm bài (`t1`–`t5`), test ẩn chấm tự động; mỗi hệ chạy tuần tự trong chính nó (`--concurrency 1`, xem `bench/vs-claude/README.md`). Vòng C1–C2 = mốc ban đầu, C3–C4 = bước trung gian, C5 = làn nhanh, C6 = làn nhanh sau `d7600f6` (`maxParallel` = 4; chỉ `t3`, `t5`), C7 = Claude Code một mình bằng Sonnet (hệ `claude-sonnet`, 2 lượt mỗi bài, đủ 5 bài) chạy cùng lúc với làn nhanh (`ccoding-fastlane`, thành viên Sonnet, 1 lượt mỗi bài) — điều kiện D2 để tách hiệu ứng mô hình khỏi hiệu ứng điều phối.

**Nguồn dữ liệu.** `bench/vs-claude/results/` lấy từ nhánh `perf/vs-claude-loop` (`git restore --source=perf/vs-claude-loop -- bench/vs-claude/results`): commit thêm C7 là `7fa6305`, HEAD nhánh lúc lấy là `78edc88`; gồm C1–C7. Bản trích `c6-extract/` (commit `5866cda`, dùng ở bản trước vì khi đó `results/` chưa có C6) đã được đối chiếu với các dòng C6 trong `results/`: `runs` 8, `phases` 24, `calls` 25, `claude_turns` 56 dòng, **đều trùng từng ký tự** (T-0 in lại kết quả đối chiếu). Do đó `c6-extract/` bị bỏ khỏi pipeline: script không còn đọc nó làm dữ liệu; thư mục vẫn còn trong repo nhưng thừa.

**Khác biệt giao thức C5 và C6 (đã kiểm, KHÔNG phải "tuần tự → cùng lúc").** Mỗi hệ chạy tuần tự trong chính nó và hai hệ chạy song song nhau ở cả hai vòng: theo `started` + `wall_s`, 9/10 lượt CCoding ở C5 4/4 ở C6 và 5/5 ở C7 (với `claude-sonnet`) có khoảng chạy chồng với một lượt Claude Code (T-0). Khác biệt thật giữa C5 và C6 là (i) mã (`maxParallel` 3 → 4), (ii) thời điểm chạy (Claude Code `t3` chậm hơn ~1.6× ở C6), (iii) chỉ 2 bài. Do đó không gộp thẳng C5 và C6 làm kết quả chính; dòng gộp là độ nhạy riêng (T-f, T-g).

**Giao thức (ghi trước khi tính).**
1. Kiểm tra schema và đối chiếu tổng giữa các tệp (T-0). `runs.csv` là nguồn chuẩn cho tổng; `calls.csv` (theo lượt gọi agent) và `claude_turns.csv` (theo lượt mô hình) khác độ mịn nên chỉ so sánh ở mức lượt chạy.
2. Baseline = Claude Code thuần cùng vòng (T-a, T-b, T-f). Vòng không có Claude cùng vòng (C3, C4) không có tỷ lệ/CI.
3. Đường găng (T-d) tính từ `ts` (thời điểm kết thúc) và `duration_s`: khoảng của một lượt gọi là [ts − duration_s, ts]; thời gian pha = độ dài hợp các khoảng; găng lượt chạy = Σ các pha (giả định pha nối tiếp).
4. Ước lượng O1–O6 (T-e) là mô hình giả định trên dữ liệu có sẵn, **không chạy lại hệ thống**; mỗi dòng độc lập, kèm giả định. Giá quy đổi suy ra bằng bình phương tối thiểu từ `calls.csv` (T-e0), không phải bảng giá niêm yết.
5. Bootstrap (T-f): phân tầng theo bài, B = 10 000, seed = 20261102, phân vị 2,5/97,5. n = 1–2 lượt mỗi ô nên **chỉ minh họa**; kèm p hoán vị hai phía (hoán nhãn hệ trong từng bài, liệt kê đủ mọi hoán vị). Dòng "C5+C6" và bảng T-g gộp lượt trong từng bài qua hai vòng là độ nhạy, chọn sau khi thấy C6; lượt treo stdin ở C5 (`t3` lượt 1, 579 s) có hai biến thể: bỏ và giữ.
6. Không tinh chỉnh tham số theo kết quả; các tham số giả định (`charsPerToken` = 3.5, O3 = 30%, O4 = 50%, O5 = 20%) đặt cố định trong `CONFIG` của script.
7. T-h (ba hệ): TB thời gian, chi phí và test ẩn theo bài cho Opus (hệ `claude`, C5–C6), Sonnet (hệ `claude-sonnet`, C7) và làn nhanh (`ccoding-fastlane`, C5–C7). Lượt bị bỏ: chỉ C5 `t3` lượt 1 (treo stdin 579 s, quy tắc `CONFIG.hung` có từ bản trước). Mỗi ô ghi n; đối chiếu số thời gian với BRIEF-2.
8. T-i (kiểm định): thống kê = TB 5 bài của (TB hệ A − TB hệ B), bootstrap phân tầng (B = 10 000, cùng seed) và p hoán vị hai phía phân tầng theo bài. Bốn cặp: làn nhanh − Sonnet đơn (C7, kết quả chính), làn nhanh − Opus (C5–C6; và C5–C7 theo T-h), Sonnet đơn − Opus (tách phần do mô hình). Không hiệu chỉnh so sánh bội; chọn cặp và chỉ số trước khi thấy kết quả C7 theo đề bài.
9. T-d (3): chi phí cố định của điều phối = đường găng pha `route`/`plan`/`discuss`/`finalize` + `review`/`revise` + phần dư (thời gian tường − Σ đường găng pha; gồm tạo/gộp worktree, chạy kiểm tra, chờ), chia cho TB thời gian tường của `claude-sonnet` ở C7 cho cùng bài.

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
| claude_turns.csv | input / cache_read / cache_write (_1h, _5m) | token theo TỪNG lượt mô hình của Claude Code; cache_write = _1h + _5m | Claude (chỉ C1, C2, C5, C6, C7) |
| claude_turns.csv | output_partial | token đầu ra từ luồng sự kiện từng phần — KHÔNG dùng (≪ output thật trong runs.csv) | Claude |

Đối chiếu: 38/38 lượt CCoding có Σ(calls.csv) = runs.csv về input/output/cache_read/cache_write; 34/34 lượt Claude có Σ(claude_turns.csv) = runs.csv về cache_read/cache_write.

Quy đổi: runs.csv là nguồn chuẩn cho tổng. calls.csv (CCoding, theo lượt gọi agent = một tiến trình) và claude_turns.csv (Claude, theo lượt mô hình) KHÔNG cùng độ mịn, nên so sánh chỉ ở mức tổng theo lượt chạy hoặc "mỗi lượt gọi agent" (CCoding) với "mỗi lượt chạy" (Claude). claude_turns.csv có ở các vòng: C1, C2, C5, C6, C7; không có events.jsonl trong results/C*/. Nguồn: bench/vs-claude/results/ ở commit 7fa6305 (thêm C7 vào bench/vs-claude/results/); đọc từ perf/vs-claude-loop HEAD 78edc88. Đối chiếu bản trích c6-extract/C6-*.csv (commit 5866cda) với các dòng C6 trong results/: runs 8 dòng trùng từng ký tự; phases 24 dòng trùng từng ký tự; calls 25 dòng trùng từng ký tự; claude_turns 56 dòng trùng từng ký tự ⇒ c6-extract/ bị bỏ khỏi pipeline (script không đọc nó làm dữ liệu)..
Giao thức chạy (kiểm từ started + wall_s): số lượt CCoding có khoảng chạy chồng với ít nhất một lượt Claude cùng vòng — C5 9/10; C6 4/4; C7 5/5. Tức hai hệ chạy song song nhau (mỗi hệ tuần tự trong chính nó, --concurrency 1); khác biệt C5 → C6 không phải "tuần tự → cùng lúc" mà là mã (C6 sau d7600f6: maxParallel 4) và thời điểm chạy. Ở C7 đối chứng là claude-sonnet (Claude Code một mình bằng Sonnet) chạy cùng lúc với làn nhanh.

Ghi cache của Claude theo TTL: 1 giờ = 1 014 326 token, 5 phút = 0 token (100.0% là 1 giờ). calls.csv không tách TTL cho CCoding.

Dữ liệu có: 72 lượt chạy, 217 dòng calls.csv, 209 dòng phases.csv, 292 dòng claude_turns.csv; vòng có trong runs.csv: C1, C2, C3, C4, C5, C6, C7.

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
| C7 | t1-duration | ccoding-fastlane | 1 | 149/149 | 1/1 | 109 | 109 | 109 | 0.398 | 18 | 16 375 | 229 886 | 52 239 |
| C7 | t1-duration | claude-sonnet | 2 | 298/298 | 2/2 | 66 | 62 | 69 | 0.200 | 11 | 9 443 | 252 702 | 19 962 |
| C7 | t2-orders | ccoding-fastlane | 1 | 52/60 | 0/1 | 71 | 71 | 71 | 0.396 | 30 | 12 951 | 387 597 | 56 176 |
| C7 | t2-orders | claude-sonnet | 2 | 120/120 | 2/2 | 42 | 41 | 42 | 0.156 | 12 | 5 623 | 268 477 | 18 294 |
| C7 | t3-api | ccoding-fastlane | 1 | 87/87 | 1/1 | 192 | 192 | 192 | 1.126 | 70 | 48 263 | 1 340 496 | 126 205 |
| C7 | t3-api | claude-sonnet | 2 | 174/174 | 2/2 | 108 | 100 | 115 | 0.341 | 17 | 16 645 | 450 100 | 32 326 |
| C7 | t4-perf | ccoding-fastlane | 1 | 19/19 | 1/1 | 120 | 120 | 120 | 0.533 | 32 | 21 015 | 444 823 | 68 760 |
| C7 | t4-perf | claude-sonnet | 2 | 38/38 | 2/2 | 49 | 45 | 53 | 0.150 | 10 | 6 159 | 214 891 | 16 580 |
| C7 | t5-logq | ccoding-fastlane | 1 | 146/146 | 1/1 | 127 | 127 | 127 | 1.038 | 58 | 45 936 | 850 499 | 121 966 |
| C7 | t5-logq | claude-sonnet | 2 | 292/292 | 2/2 | 166 | 159 | 172 | 0.439 | 16 | 24 725 | 433 299 | 37 068 |

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

**C7** — 5 lượt chạy CCoding, 22 lượt gọi agent ("Công cụ" = tool_calls TB; *_chars là ký tự; mọi cột "/ lượt gọi" là trung bình)

| Pha | Agent | Lượt gọi | Công cụ TB | Ghi cache / lượt gọi | Đọc cache / lượt gọi | Output / lượt gọi | system_chars | context_chars | prompt_chars | tool_output_chars | max_tokens | retries (Σ) | Thời gian TB (s) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| plan | dev-lead | 5 | 1.4 | 14 054 | 57 984 | 2 909 | 4 784 | 677 | 9 125 | 7 006 | 8000 | 0 | 23.1 |
| execute | backend-dev | 5 | 8.6 | 23 640 | 261 060 | 10 475 | 4 249 | 1 163 | 5 257 | 12 117 | 32000 | 0 | 65.3 |
| execute | data-engineer | 4 | 6.0 | 18 913 | 159 072 | 8 651 | 4 004 | 1 210 | 5 196 | 6 092 | 32000 | 0 | 51.8 |
| execute | devops | 1 | 6.0 | 21 895 | 188 469 | 9 020 | 4 372 | 1 284 | 5 787 | 10 662 | 32000 | 0 | 54.6 |
| execute | frontend-dev | 1 | 6.0 | 25 855 | 143 848 | 13 486 | 4 065 | 1 284 | 5 326 | 9 013 | 32000 | 0 | 79.4 |
| execute | security | 1 | 8.0 | 17 889 | 137 475 | 7 936 | 4 371 | 1 344 | 5 943 | 4 216 | 32000 | 0 | 45.6 |
| review | qa-tester | 5 | 2.8 | 19 117 | 110 400 | 2 515 | 4 331 | 677 | 11 800 | 12 762 | 6000 | 0 | 23.4 |

Tổng C7: ghi cache 425 346, đọc cache 3 253 301, output 144 540 token. Tỷ trọng ghi cache theo pha: plan 16.5%, execute 61.0%, review 22.5%.

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
| C7 | plan | 5 | 1.0 | 23.1 | 23.1 | 1.00 |
| C7 | execute | 5 | 2.4 | 142.7 | 75.9 | 1.88 |
| C7 | review | 5 | 1.0 | 23.4 | 23.4 | 1.00 |

**(2) Theo lượt chạy** — đường găng LLM = Σ đường găng các pha (giả định các pha nối tiếp nhau); "ngoài LLM" = thời gian tường − đường găng LLM (chạy kiểm tra, tạo/gộp worktree, chờ, điều phối; có thể âm do làm tròn duration_s).

| Vòng | Số lượt chạy | Thời gian tường TB (s) | Σ tuần tự LLM TB (s) | Đường găng LLM TB (s) | Tiết kiệm nhờ song song TB (s) | Ngoài LLM TB (s) | Tiết kiệm / tuần tự (%) |
|---|---|---:|---:|---:|---:|---:|---:|
| C1 | 8 | 341 | 353 | 308 | 45 | 33 | 12.9 |
| C2 | 4 | 339 | 351 | 289 | 62 | 50 | 11.6 |
| C3 | 2 | 190 | 169 | 169 | 0 | 20 | 0.0 |
| C4 | 5 | 195 | 247 | 183 | 64 | 12 | 25.0 |
| C5 | 10 | 188 | 265 | 187 | 78 | 1 | 30.5 |
| C6 | 4 | 183 | 318 | 181 | 137 | 2 | 42.9 |
| C7 | 5 | 124 | 189 | 122 | 67 | 1 | 28.7 |

**(3) Chi phí cố định của điều phối (làn nhanh) so với thời gian Sonnet đơn cần cho cả bài** — chia thời gian tường của làn nhanh thành: lập kế hoạch = Σ đường găng pha route/plan/discuss/finalize; review = pha review + revise; gộp + ngoài LLM = thời gian tường − (kế hoạch + review + execute), gồm pha tổng hợp, tạo/gộp worktree, chạy kiểm tra dự án, chờ (là phần dư, có thể gồm nhiễu); execute = đường găng pha execute. "Cố định" = kế hoạch + review + gộp/ngoài LLM, tức phần một agent đơn không phải trả. Mẫu số = TB thời gian tường của claude-sonnet ở C7 (n ghi trong ngoặc). Lượt treo C5 t3 lượt 1 bị bỏ khỏi tập gộp.

| Tập | Bài | n làn nhanh | Kế hoạch (s) | Review (s) | Gộp + ngoài LLM (s) | Cố định (s) | Execute (s) | Thời gian tường (s) | Sonnet đơn TB (s) | Cố định / Sonnet đơn (%) | Execute / Sonnet đơn (%) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| C7 (cùng thời điểm với Sonnet đơn) | t1-duration | 1 | 14.9 | 22.9 | 0.7 | 38.5 | 70.5 | 109.0 | 65.5 (n=2) | 58.8 | 107.6 |
| C7 (cùng thời điểm với Sonnet đơn) | t2-orders | 1 | 15.6 | 22.7 | 1.1 | 39.4 | 31.6 | 71.0 | 41.5 (n=2) | 94.9 | 76.1 |
| C7 (cùng thời điểm với Sonnet đơn) | t3-api | 1 | 34.3 | 22.4 | 1.9 | 58.6 | 133.4 | 192.0 | 107.5 (n=2) | 54.5 | 124.1 |
| C7 (cùng thời điểm với Sonnet đơn) | t4-perf | 1 | 23.3 | 30.6 | 1.5 | 55.4 | 64.6 | 120.0 | 49.0 (n=2) | 113.1 | 131.8 |
| C7 (cùng thời điểm với Sonnet đơn) | t5-logq | 1 | 27.5 | 18.2 | 1.9 | 47.6 | 79.4 | 127.0 | 165.5 (n=2) | 28.8 | 48.0 |
| C7 (cùng thời điểm với Sonnet đơn) | Σ 5 bài |  | 115.6 | 116.8 | 7.1 | 239.5 | 379.5 | 619.0 | 429.0 | 55.8 | 88.5 |
| C5–C7 (bỏ lượt treo) | t1-duration | 3 | 18.1 | 30.3 | 0.7 | 49.2 | 58.5 | 107.7 | 65.5 (n=2) | 75.1 | 89.3 |
| C5–C7 (bỏ lượt treo) | t2-orders | 3 | 21.5 | 37.9 | 1.1 | 60.4 | 33.9 | 94.3 | 41.5 (n=2) | 145.7 | 81.7 |
| C5–C7 (bỏ lượt treo) | t3-api | 4 | 36.4 | 23.7 | 1.6 | 61.7 | 137.5 | 199.3 | 107.5 (n=2) | 57.4 | 127.9 |
| C5–C7 (bỏ lượt treo) | t4-perf | 3 | 25.6 | 35.2 | 1.7 | 62.5 | 79.5 | 142.0 | 49.0 (n=2) | 127.6 | 162.2 |
| C5–C7 (bỏ lượt treo) | t5-logq | 5 | 25.7 | 50.5 | 1.9 | 78.2 | 86.6 | 164.8 | 165.5 (n=2) | 47.3 | 52.3 |
| C5–C7 (bỏ lượt treo) | Σ 5 bài |  | 127.4 | 177.6 | 7.1 | 312.1 | 396.0 | 708.0 | 429.0 | 72.8 | 92.3 |

Đọc: ở C7 (cùng thời điểm) phần cố định bằng 55.8% tổng thời gian Sonnet đơn cần cho 5 bài; gộp C5–C7 là 72.8%. Ở C7, riêng phần execute của làn nhanh đã dài hơn cả bài Sonnet đơn ở: t1, t3, t4 (cột "Execute / Sonnet đơn" > 100%); làn nhanh chỉ có thể thắng khi execute song song + phần cố định < thời gian một agent.

Đọc T-d: chỉ pha `execute` có song song; hệ số tăng từ 1.27 (C1) lên 2.02 (C5) khi làn nhanh chạy cùng lúc các hạng mục độc lập. Tiết kiệm nhờ song song tăng từ 12.9% (C1) lên 30.5% (C5) so với thời gian tuần tự. Sau khi song song hóa, `review` (81.3 s) thành pha dài nhất ở C5, lớn hơn đường găng của `execute` (76.9 s) — đó là chỗ tối ưu tiếp theo (O4). Ở C6 hệ số của `execute` là 2.26 (4 hạng mục chạy cùng lúc thay vì 3) và tiết kiệm nhờ song song 42.9% thời gian tuần tự; `execute` (đường găng 108.4 s) thay `review` (34.0 s) làm pha dài nhất, nhất quán với ghi nhận ở PROCESS-REVIEW rằng một hạng mục nối tệp chung nằm trên đường găng (`n` = 4 lượt; ghi chú đó dựa vào `events.jsonl` mà tôi không có, nên chưa tự kiểm). Thời gian ngoài LLM nhỏ (1 s ở C5, 2 s ở C6) theo cách tính này. C3 chỉ có một hạng mục nên không có song song.

Lệnh tái lập bảng T-e0: `node docs/research/performance/scripts/token-analysis.mjs --table T-e0`

### T-e0. Giá hiệu dụng suy ra (nền cho T-e)

| Mô hình (requested) | Số lượt gọi | Giá đầu ra (USD/triệu token) | Giá đọc cache | Giá ghi cache | R² |
|---|---|---:|---:|---:|---:|
| opus | 27 | 20.08 | 0.205 | 8.02 | 1.000 |
| sonnet | 175 | 9.80 | 0.107 | 4.06 | 0.978 |

Giá hiệu dụng suy ra bằng bình phương tối thiểu từ calls.csv (cost_usd ~ output + cache_read + cache_write, không hệ số tự do; input bỏ vì ≈ 0). Nhãn mô hình trộn cả lượt haiku phụ, nên đây là giá HIỆU DỤNG chỉ dùng quy đổi tương đối, không phải bảng giá niêm yết.

Lệnh tái lập bảng T-e1: `node docs/research/performance/scripts/token-analysis.mjs --table T-e1`

### T-e1. Mô hình ghi cache theo lượt gọi (nền cho O1)

| Số lượt gọi (mọi vòng) | Hệ số chặn F (token / lượt gọi) | Hệ số theo token ngữ cảnh+công cụ (a) | Hệ số theo token output (b) | R² |
|---|---|---:|---:|---:|
| 217 | 2 350 | 1.55 | 1.13 | 0.755 |

Hồi quy bình phương tối thiểu: cache_write ≈ F + a·(Σ *_chars / 3.5) + b·output, trên mọi dòng calls.csv. F là phần ghi cache cố định mỗi lượt gọi agent (tiền tố mà các lượt gọi không dùng chung được); nếu F nhỏ so với ghi cache TB một lượt gọi thì lượng ghi cache lớn của CCoding đến từ nội dung (đầu ra và kết quả công cụ bị ghi lại ở mỗi tiến trình), không phải từ tiền tố. Tương quan, không phải nhân quả; phụ thuộc giả định charsPerToken.

Lệnh tái lập bảng T-e: `node docs/research/performance/scripts/token-analysis.mjs --table T-e`

### T-e. Ước lượng định lượng cho O1–O6

| Mã | Đề xuất | Tiết kiệm ước tính / lượt chạy (USD) | % chi phí CCoding (cùng nền) | Giả định |
|---|---|---:|---:|---:|
| O1 | Tiền tố prompt ổn định dùng chung cache | 0.037 | 4.6 | Trần trên: phần ghi cache cố định mỗi lượt gọi F = 2 350 token (T-e1) chuyển thành đọc cache ở mọi lượt gọi sau lượt đầu của mỗi lượt chạy, tính giá sonnet. Phần hệ thống gốc của Claude Code đã được cache chéo tiến trình (claude_turns lượt 1 đọc ~33 nghìn token) nên không tính thêm |
| O2 | Tái dùng phiên execute → revise | 0.006 | 0.7 | Mỗi lượt revise đọc lại tối đa min(ghi cache revise, ghi cache TB execute cùng agent) thay vì ghi; trần trên (giả định phiên còn trong TTL). Dữ liệu C5 chỉ có 1 lượt revise |
| O3 | Rút gọn ngữ cảnh 30% | 0.002 | 0.2 | Cắt 30% context_chars ở mọi lượt gọi; mỗi token ngữ cảnh ghi 1 lần + đọc ở (tool_calls) lượt mô hình sau |
| O4 | Reviewer chỉ nhận diff + kết quả lệnh kiểm tra | 0.022 | 2.8 | Pha review: giảm 50% của (context_chars + prompt_chars + tool_output_chars), giả định reviewer không tự đọc lại tệp; 11 lượt review. Chồng lấn một phần với O3 |
| O5 | Giới hạn đầu ra (plan/review/synthesize) | 0.014 | 1.7 | Giảm 20% token output ở 21 lượt gọi plan/review/synthesize; execute không đụng vì output là mã cần viết |
| O6 | Mô hình theo pha: opus → sonnet ở lượt gọi lead | 0.257 | 20.7 | Nền C1 (không phải C5): C1 có 18 lượt gọi opus (plan, synthesize, finalize) tính lại bằng giá hiệu dụng sonnet; C5 đã dùng sonnet ở mọi pha (0 lượt gọi khác sonnet) nên phần còn lại của O6 (sonnet → haiku ở review/plan) KHÔNG định giá được (hồi quy haiku không đáng tin) và chưa đo chất lượng |

Nền: C5, 10 lượt chạy CCoding, chi phí Σ calls.csv = 8.042 USD (TB 0.804 USD / lượt chạy). Theo giá hiệu dụng, đầu ra = 38.4% chi phí, ghi cache = 49.6%, đọc cache = 9.7%. O1–O5 trên nền C5, O6 trên nền C1. Mỗi dòng là ước lượng ĐỘC LẬP (không cộng gộp; O3/O4 chồng lấn). Đây là mô hình giả định trên dữ liệu có sẵn, chưa chạy lại hệ thống; thời gian không được ước lượng. charsPerToken = 3.5 (giả định).

Đọc T-e (ước lượng theo mô hình, chưa kiểm chứng bằng chạy lại):
- **O6** (lead opus → sonnet) lớn nhất trên nền C1, nhưng C5 đã dùng sonnet ở mọi pha nên phần này **đã được hiện thực** và góp phần thu hẹp khoảng cách chi phí C1 → C5. Chất lượng chưa được đo riêng cho thay đổi này.
- **O1** có trần trên 4.6% chi phí (thực tế thấp hơn, vì phần hệ thống gốc của Claude Code đã được cache chéo tiến trình); **O4** 2.8%, **O5** 1.7%, **O2** 0.7% (mới có 1 lượt revise), **O3** 0.2%. Mỗi đề xuất riêng lẻ nhỏ; T-e không ước lượng tác động lên thời gian.
- O3 gần như vô ích vì `context_chars` nhỏ (khoảng 1 200 ký tự ở C5): khối lượng lớn nằm ở kết quả công cụ và đầu ra.
- Chi phí CCoding ở C5: đầu ra 38.4%, ghi cache 49.6%, đọc cache 9.7% (giá hiệu dụng) — đòn bẩy thật nằm ở giảm số tiến trình và lượng tệp/công cụ đọc lặp, không phải tinh chỉnh tiền tố prompt.

Lệnh tái lập bảng T-f: `node docs/research/performance/scripts/token-analysis.mjs --table T-f`

### T-f. Bootstrap CI 95% cho chênh lệch thời gian / chi phí

> **MINH HỌA, n nhỏ — không đủ lực thống kê để khái quát.** Mỗi ô (bài × hệ) chỉ 1–2 lượt. Bootstrap phân tầng theo bài (lấy lại mẫu các lượt trong từng ô; B = 10000, seed = 20261102, phân vị 2,5/97,5); thống kê = TB các bài của (CCoding − Claude). CI chỉ mô phỏng nhiễu trong ô nên hẹp hơn thực tế (thiếu nhiễu giữa bài/ngày/hạn mức). Các hệ ccoding* trong cùng vòng gộp thành "CC".

| Vòng | Tập con | Chỉ số | Cỡ mẫu | Chênh lệch (CC − Claude) | CI 95% (bootstrap) | Chênh lệch tương đối so với Claude [CI] | p hoán vị hai phía (số hoán vị) | Nhận xét |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| C1 | tất cả lượt | Thời gian (s) | 4 bài; 8 CC / 8 Claude | 169.4 | [117.1; 223.1] | 98.7% [61.1; 147.4] | 0.0031 (1 296) | CC > Claude |
| C1 | tất cả lượt | Chi phí (USD) | 4 bài; 8 CC / 8 Claude | 0.610 | [0.440; 0.784] | 96.6% [67.0; 130.3] | 0.0015 (1 296) | CC > Claude |
| C2 | tất cả lượt | Thời gian (s) | 1 bài; 2 CC / 2 Claude | 168.5 | [160.0; 177.0] | 68.9% [65.3; 72.5] | 0.3333 (6) | CC > Claude |
| C2 | tất cả lượt | Chi phí (USD) | 1 bài; 2 CC / 2 Claude | 1.072 | [0.879; 1.265] | 106.6% [86.8; 126.8] | 0.3333 (6) | CC > Claude |
| C3 | – | không có đối chứng claude (Opus) cùng vòng |  |  |  |  |  |  |
| C4 | – | không có đối chứng claude (Opus) cùng vòng |  |  |  |  |  |  |
| C5 | tất cả lượt | Thời gian (s) | 5 bài; 10 CC / 10 Claude | 21.1 | [-22.6; 64.9] | 12.6% [-13.4; 39.5] | 0.8971 (7 776) | CI chứa 0 |
| C5 | tất cả lượt | Chi phí (USD) | 5 bài; 10 CC / 10 Claude | 0.144 | [0.077; 0.210] | 21.8% [11.5; 32.1] | 0.0430 (7 776) | CC > Claude |
| C5 | loại t3 lượt 1 (treo stdin, 579 s) — độ nhạy | Thời gian (s) | 5 bài; 9 CC / 10 Claude | -14.7 | [-26.7; -2.5] | -8.8% [-15.7; -1.5] | 0.3786 (3 888) | CC < Claude |
| C5 | loại t3 lượt 1 (treo stdin, 579 s) — độ nhạy | Chi phí (USD) | 5 bài; 9 CC / 10 Claude | 0.156 | [0.093; 0.220] | 23.7% [14.0; 33.7] | 0.0489 (3 888) | CC > Claude |
| C6 | tất cả lượt | Thời gian (s) | 2 bài; 4 CC / 4 Claude | -72.8 | [-105.3; -40.3] | -28.4% [-40.0; -15.9] | 0.0556 (36) | CC < Claude |
| C6 | tất cả lượt | Chi phí (USD) | 2 bài; 4 CC / 4 Claude | 0.136 | [-0.016; 0.287] | 13.2% [-1.4; 30.2] | 0.3889 (36) | CI chứa 0 |
| C7 | – | không có đối chứng claude (Opus) cùng vòng; đối chứng là claude-sonnet, xem T-i |  |  |  |  |  |  |
| C5+C6 | gộp lượt trong bài, bỏ lượt treo — độ nhạy | Thời gian (s) | 5 bài; 13 CC / 14 Claude | -28.2 | [-44.4; -11.4] | -16.0% [-24.2; -6.8] | 0.0317 (529 200) | CC < Claude |
| C5+C6 | gộp lượt trong bài, bỏ lượt treo — độ nhạy | Chi phí (USD) | 5 bài; 13 CC / 14 Claude | 0.125 | [0.047; 0.204] | 18.1% [6.5; 30.4] | 0.0310 (529 200) | CC > Claude |
| C5+C6 | gộp lượt trong bài, giữ lượt treo — độ nhạy | Thời gian (s) | 5 bài; 14 CC / 14 Claude | -9.3 | [-40.2; 30.2] | -5.3% [-22.2; 17.4] | 0.7773 (1 058 400) | CI chứa 0 |
| C5+C6 | gộp lượt trong bài, giữ lượt treo — độ nhạy | Chi phí (USD) | 5 bài; 14 CC / 14 Claude | 0.122 | [0.046; 0.199] | 17.6% [6.4; 29.6] | 0.0271 (1 058 400) | CC > Claude |

p hoán vị: hoán nhãn hệ trong từng bài (phân tầng), thống kê = TB các bài của chênh lệch TB; liệt kê đủ mọi hoán vị khi ≤ 3e+7 (dấu * = lấy mẫu 200000 hoán vị). Với n nhỏ, p tối thiểu bị chặn bởi số hoán vị (vd. C6: 2 bài × C(4,2) = 6 mỗi bài ⇒ 36 hoán vị ⇒ p nhỏ nhất 2/36 = 0.0556). "Claude" ở T-f = hệ claude (Opus); vòng C7 không có hệ này nên xem T-i.

C6 chỉ có 2 bài (t3, t5), 2 lượt mỗi ô nên CI của dòng C6 càng chỉ là minh họa. Hai dòng "C5+C6" trộn hai thời điểm và hai phiên bản mã (C6 sau d7600f6: maxParallel 4), và được chọn SAU khi thấy dữ liệu: coi là độ nhạy, không phải kết quả chính.

Đọc T-f: ở C1 và C2, CI không chứa 0 theo hướng CCoding chậm và đắt hơn. Ở C5 thời gian không phân biệt được (CI chứa 0), chi phí vẫn cao hơn. Dòng "loại t3 lượt 1" là phân tích độ nhạy chọn sau khi thấy ngoại lệ; hướng của nó đổi (CCoding nhanh hơn) nên **kết luận về thời gian ở C5 nhạy với một lượt chạy**. CI hẹp một cách giả tạo vì chỉ lấy lại mẫu nhiễu trong ô (1–2 lượt). Thêm p hoán vị (hai phía, số hoán vị trong bảng): C5 thời gian 0.8971 và chi phí 0.0430; **C6 thời gian 0.0556** (36 hoán vị ⇒ p nhỏ nhất có thể là 2/36 = 0.0556, nên CI [−105.3; −40.3] hẹp nhưng p chưa vượt ngưỡng 0.05) và chi phí 0.3889; C5+C6 bỏ lượt treo 0.0317 (thời gian), 0.0310 (chi phí). Khi báo CI của C6 phải ghi kèm p = 0.0556.

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

Lệnh tái lập bảng T-h: `node docs/research/performance/scripts/token-analysis.mjs --table T-h`

### T-h. Ba hệ theo bài: Claude Code Opus, Claude Code Sonnet, làn nhanh CCoding

Trung bình thời gian tường, chi phí và test ẩn theo bài cho ba hệ; mỗi hàng ghi n (số lượt). Hai cột cuối = tỉ lệ so với Sonnet đơn (C7) của cùng bài; > 1 nghĩa là chậm hơn / đắt hơn Sonnet đơn. Opus = hệ `claude` (Claude Code mặc định) ở C5–C6; Sonnet = hệ `claude-sonnet` ở C7 (cùng lúc với làn nhanh C7); làn nhanh = hệ `ccoding-fastlane`. **Mẫu rất nhỏ (n = 1–5 mỗi ô, C7 chỉ 2 lượt Sonnet mỗi bài): minh họa.**

| Bài | Hệ (vòng) | n | Thời gian TB (s) | Chi phí TB (USD) | Test ẩn đạt/tổng | Đạt trọn | Thời gian / Sonnet đơn | Chi phí / Sonnet đơn |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| t1-duration | Claude Code Opus (C5–C6) | 2 | 126 | 0.513 | 297/298 | 1/2 | 1.92 | 2.57 |
| t1-duration | Claude Code Sonnet (C7) | 2 | 66 | 0.200 | 298/298 | 2/2 | 1.00 | 1.00 |
| t1-duration | Làn nhanh (C5–C7, bỏ lượt treo) | 3 | 108 | 0.494 | 447/447 | 3/3 | 1.64 | 2.47 |
| t1-duration | Làn nhanh (chỉ C7) | 1 | 109 | 0.398 | 149/149 | 1/1 | 1.66 | 1.99 |
| t2-orders | Claude Code Opus (C5–C6) | 2 | 91 | 0.436 | 120/120 | 2/2 | 2.19 | 2.79 |
| t2-orders | Claude Code Sonnet (C7) | 2 | 42 | 0.156 | 120/120 | 2/2 | 1.00 | 1.00 |
| t2-orders | Làn nhanh (C5–C7, bỏ lượt treo) | 3 | 94 | 0.592 | 172/180 | 2/3 | 2.27 | 3.79 |
| t2-orders | Làn nhanh (chỉ C7) | 1 | 71 | 0.396 | 52/60 | 0/1 | 1.71 | 2.53 |
| t3-api | Claude Code Opus (C5–C6) | 4 | 205 | 0.878 | 348/348 | 4/4 | 1.90 | 2.58 |
| t3-api | Claude Code Sonnet (C7) | 2 | 108 | 0.341 | 174/174 | 2/2 | 1.00 | 1.00 |
| t3-api | Làn nhanh (C5–C7, bỏ lượt treo) | 4 | 199 | 1.133 | 348/348 | 4/4 | 1.85 | 3.32 |
| t3-api | Làn nhanh (chỉ C7) | 1 | 192 | 1.126 | 87/87 | 1/1 | 1.79 | 3.30 |
| t4-perf | Claude Code Opus (C5–C6) | 2 | 203 | 0.627 | 38/38 | 2/2 | 4.13 | 4.19 |
| t4-perf | Claude Code Sonnet (C7) | 2 | 49 | 0.150 | 38/38 | 2/2 | 1.00 | 1.00 |
| t4-perf | Làn nhanh (C5–C7, bỏ lượt treo) | 3 | 142 | 0.560 | 57/57 | 3/3 | 2.90 | 3.74 |
| t4-perf | Làn nhanh (chỉ C7) | 1 | 120 | 0.533 | 19/19 | 1/1 | 2.45 | 3.56 |
| t5-logq | Claude Code Opus (C5–C6) | 4 | 259 | 1.012 | 584/584 | 4/4 | 1.56 | 2.30 |
| t5-logq | Claude Code Sonnet (C7) | 2 | 166 | 0.439 | 292/292 | 2/2 | 1.00 | 1.00 |
| t5-logq | Làn nhanh (C5–C7, bỏ lượt treo) | 5 | 165 | 1.127 | 730/730 | 5/5 | 1.00 | 2.57 |
| t5-logq | Làn nhanh (chỉ C7) | 1 | 127 | 1.038 | 146/146 | 1/1 | 0.77 | 2.36 |
| TB các bài (không trọng số) | Claude Code Opus (C5–C6) | 14 | 177 | 0.693 |  |  | 2.34 | 2.88 |
| TB các bài (không trọng số) | Claude Code Sonnet (C7) | 10 | 86 | 0.257 |  |  | 1.00 | 1.00 |
| TB các bài (không trọng số) | Làn nhanh (C5–C7, bỏ lượt treo) | 18 | 142 | 0.781 |  |  | 1.93 | 3.18 |
| TB các bài (không trọng số) | Làn nhanh (chỉ C7) | 5 | 124 | 0.698 |  |  | 1.68 | 2.75 |

Lượt bị bỏ khỏi "làn nhanh (C5–C7)": C5 t3-api lượt 1 (579 s, task T-20261102-105231-9e5) — treo stdin của harness; lượt còn lại cùng ô chạy 221 s. Không lượt nào khác bị bỏ.

Đối chiếu số thời gian trong BRIEF-2 (Opus/Sonnet/làn nhanh, làm tròn s): t1 126/66/108 khớp · t2 91/42/94 khớp · t3 205/108/199 khớp · t4 203/49/142 khớp · t5 259/166/165 khớp.

Tỉ lệ làn nhanh (C5–C7, bỏ lượt treo) / Sonnet đơn: thời gian t1 1.64 · t2 2.27 · t3 1.85 · t4 2.90 · t5 1.00; chi phí t1 2.47 · t2 3.79 · t3 3.32 · t4 3.74 · t5 2.57 (BRIEF-2: chi phí 2.5–3.8×: khớp). Chỉ dùng lượt C7 của làn nhanh (cùng thời điểm): thời gian t1 1.66 · t2 1.71 · t3 1.79 · t4 2.45 · t5 0.77.

Đọc T-h: (1) Mọi số thời gian trong BRIEF-2 khớp bảng (làm tròn giây), và khoảng chi phí làn nhanh / Sonnet đơn 2.5–3.8× khớp (2.47–3.79× theo bài, gộp C5–C7). (2) "Nhanh hơn 1.6–2.9× ở 4/5 bài" đúng với cột làn nhanh gộp (tỉ lệ làn nhanh / Sonnet đơn là 1.64–2.90 ở `t1`–`t4`); chỉ dùng lượt C7 của làn nhanh thì 1.66–2.45. (3) `t5`: gộp 1.00 (165 s so với 166 s), C7 riêng 127 s so với 159 và 172 s của hai lượt Sonnet (0.77×); với 1 lượt làn nhanh chỉ nói được là hòa hoặc nhanh hơn nhẹ, không phân biệt được. (4) Chất lượng: Sonnet đạt trọn 10/10 lượt; Opus 13/14 (`t1` 297/298 ở một lượt); làn nhanh 17/18 (`t2` 172/180). Không hệ nào có lợi thế chất lượng đo được; đáng chú ý là lượt duy nhất không đạt trọn của làn nhanh C7 (`t2`) mà Sonnet đơn đạt 60/60 cả hai lượt.

**Kiểm lượt C7 `t2` làn nhanh 52/60** (nguồn: `results/C7/t2-orders.ccoding-fastlane.1/{result.json,grade-hidden.tap,ccoding-task.json}`, `runs.csv`, `calls.csv`, `phases.csv`):

- Test ẩn hỏng (8): `#3 mua 2 tặng 1` với 2, 5, 6 món; `#3 mua 3 tặng 2` với 4 và 10 món; `#3 mua 1 tặng 1` với 7 món (6 test); `#4 mã NOV lúc 2026-11-30T10:00:00Z → nhận` và `…T23:59:59.999Z → nhận` (2 test). Xác nhận đúng #3 (mua X tặng Y) và #4 (hạn mã theo UTC). Lưu ý: cột `failed_hidden` của `runs.csv` chỉ liệt kê 5 mục (cả 5 thuộc #3), nên muốn đủ #4 phải đọc `result.json` hoặc `grade-hidden.tap`. Test hiển thị 17/17 qua.
- Các lỗi khác (#1, #2, #5, #6) đạt: S1 (lỗi 1, 2, 6) và S3 (lỗi 5) hoàn tất.
- **Pha review CÓ ghi nhận**: lượt `review` (qa-tester, 22.7 s, 6 công cụ) trả `approved: false`, vấn đề `major` "Lỗi 3/4 (src/promotions.js)": `src/promotions.js` chưa đổi và `test/promotions-fixes.test.js` chưa tồn tại; chỉ ra `freeUnits` vẫn là `Math.floor(qty/buy)*free` (đúng phải chia cho `buy+free`; ví dụ q = 2, 3, 5, 6 ra [1, 1, 2, 3] thay vì [0, 1, 1, 2]) và `checkValidity` so `now < new Date(endsAt)` (mã `endsAt` = 2026-11-30 bị từ chối lúc 10:00Z); đề xuất cách sửa và các ca biên. Tức BRIEF-2 ("review không bắt") **không khớp dữ liệu**; số liệu ủng hộ cách đọc "bắt được nhưng không xử lý".
- Vì sao lỗi còn: kế hoạch chia 3 hạng mục (`planSummary`: "Chia 3 hạng mục độc lập"), trong đó hạng mục sở hữu `src/promotions.js` (lỗi 3, 4) có mô tả trong `reviewFocus`, nhưng `subtasks` hoàn tất chỉ gồm S1 và S3 và `calls.csv` chỉ có 4 lượt gọi (plan, 2 execute, review). Sau review không có lượt `revise` (`reviewRound` = 0, dù `options.maxRevisions` = 1) và task kết thúc `done` với `attention.reason = review`, harness chấm theo `done`. Dữ liệu không cho biết vì sao hạng mục thứ ba không chạy (không có `events.jsonl`) — chưa xác định.
- Đối chiếu các lượt làn nhanh khác (C5–C7, 19 lượt): chỉ hai lượt có `approved: false` + `attention: review`: C7 `t2` (52/60) và C5 `t3` lượt 1 (lượt treo 579 s, đạt 87/87). Số quan sát quá ít để nói tỉ lệ.
- Hệ quả cho diễn giải RQ3: lượt này **không** nên dùng làm bằng chứng "verifier LLM bỏ sót lỗi" (đối chiếu TeamBench). Phù hợp hơn: bằng chứng về điểm yếu của điều phối — một hạng mục trong kế hoạch bị rơi và tín hiệu từ reviewer không kích hoạt vòng sửa — làm làn nhanh đạt thấp hơn một agent đơn trong cùng điều kiện. Chỉ 1 lượt, nên là minh họa.

Lệnh tái lập bảng T-i: `node docs/research/performance/scripts/token-analysis.mjs --table T-i`

### T-i. Chênh lệch thời gian / chi phí giữa các hệ: CI bootstrap và p hoán vị

> **MINH HỌA, n nhỏ.** Thống kê = TB 5 bài của (TB hệ A − TB hệ B); bootstrap phân tầng theo bài (B = 10000, seed = 20261102, phân vị 2,5/97,5); p hoán vị hai phía bằng cách hoán nhãn hệ trong từng bài (liệt kê đủ mọi hoán vị; số hoán vị trong ngoặc, nên p nhỏ nhất bị chặn bởi số này: vd. dòng C7 có 3^5 = 243 hoán vị ⇒ p ≥ 1/243). **Cảnh báo:** ở dòng C7 ô làn nhanh chỉ có 1 lượt, ô Sonnet 2 lượt, nên bootstrap gần như chỉ lấy lại mẫu 2 giá trị Sonnet và CI hẹp một cách giả tạo; dùng p hoán vị và chênh lệch theo bài (T-h) thay vì CI. Cột "n mỗi ô" ghi số lượt A/B theo từng bài. Không hiệu chỉnh so sánh bội (4 cặp × 2 chỉ số); CI chỉ mô phỏng nhiễu trong ô nên hẹp hơn thực tế.

| Cặp (A − B) | Tập | Chỉ số | n mỗi ô (A/B) | Chênh lệch | CI 95% (bootstrap) | Tương đối so với B [CI] | p hoán vị hai phía (số hoán vị) | Nhận xét |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Làn nhanh − Sonnet đơn | C7, cùng thời điểm | Thời gian (s) | t1 1/2 · t2 1/2 · t3 1/2 · t4 1/2 · t5 1/2 | 38.0 | [35.0; 41.0] | 44.3% [39.4; 49.5] | 0.0329 (243) | A > B; p < 0.05 |
| Làn nhanh − Sonnet đơn | C7, cùng thời điểm | Chi phí (USD) | t1 1/2 · t2 1/2 · t3 1/2 · t4 1/2 · t5 1/2 | 0.441 | [0.432; 0.450] | 171.6% [162.4; 181.4] | 0.0041 (243) | A > B; p < 0.05 |
| Làn nhanh − Opus | C5–C6, bỏ lượt treo | Thời gian (s) | t1 2/2 · t2 2/2 · t3 3/4 · t4 2/2 · t5 4/4 | -28.2 | [-44.4; -11.4] | -16.0% [-24.2; -6.8] | 0.0317 (529 200) | A < B; p < 0.05 |
| Làn nhanh − Opus | C5–C6, bỏ lượt treo | Chi phí (USD) | t1 2/2 · t2 2/2 · t3 3/4 · t4 2/2 · t5 4/4 | 0.125 | [0.047; 0.204] | 18.1% [6.5; 30.4] | 0.0310 (529 200) | A > B; p < 0.05 |
| Làn nhanh − Opus | làn nhanh C5–C7 (bỏ lượt treo) so với Opus C5–C6 (như T-h) | Thời gian (s) | t1 3/2 · t2 3/2 · t3 4/4 · t4 3/2 · t5 5/4 | -34.9 | [-50.7; -18.9] | -19.8% [-27.5; -11.2] | 0.0053 (8 820 000) | A < B; p < 0.05 |
| Làn nhanh − Opus | làn nhanh C5–C7 (bỏ lượt treo) so với Opus C5–C6 (như T-h) | Chi phí (USD) | t1 3/2 · t2 3/2 · t3 4/4 · t4 3/2 · t5 5/4 | 0.088 | [0.018; 0.162] | 12.7% [2.5; 24.2] | 0.0944 (8 820 000) | A > B; p ≥ 0.05 |
| Sonnet đơn − Opus | C7 so với C5–C6 (khác thời điểm; tách phần do mô hình) | Thời gian (s) | t1 2/2 · t2 2/2 · t3 2/4 · t4 2/2 · t5 2/4 | -90.8 | [-102.5; -79.3] | -51.4% [-54.8; -47.6] | < 0.0001 (48 600) | A < B; p < 0.05 |
| Sonnet đơn − Opus | C7 so với C5–C6 (khác thời điểm; tách phần do mô hình) | Chi phí (USD) | t1 2/2 · t2 2/2 · t3 2/4 · t4 2/2 · t5 2/4 | -0.436 | [-0.477; -0.396] | -62.9% [-65.3; -60.3] | < 0.0001 (48 600) | A < B; p < 0.05 |

Hàng 1 là phép so sánh cùng thời điểm, cùng mô hình (Sonnet) nên là kết quả chính cho RQ3; hàng 2–3 trộn hiệu ứng mô hình (Opus so với Sonnet) với hiệu ứng điều phối; hàng 4 đo riêng phần do mô hình (và thời điểm).

Đọc T-i: (1) Cùng mô hình, cùng thời điểm (hàng 1), làn nhanh chậm hơn Sonnet đơn +38.0 s và đắt hơn +0.441 USD; p hoán vị 0.0329 và 0.0041 trên 243 hoán vị (p nhỏ nhất có thể 1/243). Ô làn nhanh chỉ 1 lượt, ô Sonnet 2 lượt, nên không đọc CI bootstrap [35.0; 41.0] như độ không chắc chắn thật. (2) So với Opus (hàng 2–3), làn nhanh nhanh hơn 28–35 s nhưng đắt hơn 0.09–0.13 USD; p của chi phí 0.0944 ở dòng C5–C7 (không đạt 0.05). (3) Hàng 4: Sonnet đơn nhanh hơn Opus 90.8 s và rẻ hơn 0.436 USD, lớn hơn nhiều so với mọi chênh lệch giữa làn nhanh và Opus ⇒ phần lớn lợi thế của làn nhanh so với Opus đến từ việc chạy Sonnet. (4) Tám phép kiểm định, không hiệu chỉnh bội; p ≈ 0.03 ở vài hàng không đủ vững nếu hiệu chỉnh.

## 4. Khi nào multi-agent nhanh hơn agent đơn?

Trả lời thẳng, trên dữ liệu có (n nhỏ, 5 bài mỗi bài vài chục đến vài trăm giây):

1. **Thiết kế đầy đủ ban đầu (họp, tổng hợp bằng opus) chậm hơn và đắt hơn ~2×** (C1, C2) — kết quả âm tính.
2. **Khi cùng mô hình (Sonnet) và cùng thời điểm (C7), làn nhanh không nhanh hơn một agent**: chậm hơn 1.6–2.9× ở 4/5 bài (gộp C5–C7; 1.7–2.5× chỉ lượt C7), hòa ở `t5`, nơi có nhiều module độc lập (T-h); chênh lệch trung bình +38.0 s, p hoán vị 0.0329 (T-i). Chi phí gấp 2.5–3.8× (gộp; C7 riêng 2.0–3.6×), p 0.0041.
3. **Lợi thế so với Opus chủ yếu do mô hình.** Làn nhanh nhanh hơn Opus 28–35 s, nhưng riêng việc đổi sang Sonnet (một agent) đã nhanh hơn Opus 90.8 s (T-i hàng 4; khác thời điểm). Làn nhanh vì thế không chứng minh được lợi ích của điều phối.
4. **Chi phí cố định của điều phối lớn so với thời gian một agent cần** (T-d (3)): kế hoạch + review + gộp ≈ 48 s mỗi lượt ở C7 (38.5–58.6 s), bằng 55.8% thời gian Sonnet đơn cho 5 bài (gộp C5–C7: 72.8%); ở `t2` và `t4` gần bằng hoặc vượt thời gian một agent làm xong cả bài (94.9% và 113.1%).
5. **Không có bằng chứng multi-agent rẻ hơn** (xem 2 và C5–C6: +18.1% so với Opus khi gộp, p 0.0310).
6. **Chất lượng không phải lợi thế đo được**; lượt C7 `t2` của làn nhanh còn 52/60 so với 60/60 của Sonnet đơn. Reviewer đã phát hiện lỗi còn lại nhưng quy trình không sửa (mục T-h) — vấn đề ở điều phối, một lượt duy nhất.
7. **Điều kiện có thể có lợi — chỉ là giả thuyết, chưa được kiểm.** (a) Việc chia được thành phần độc lập và đủ lớn để phần song song bù phần cố định: gợi ý bởi `t5` (execute song song 79.4 s so với 165.5 s Sonnet đơn); (b) bài đủ dài: phần cố định ở C7 chỉ 38.5–58.6 s dù thời gian Sonnet đơn từ 41.5 đến 165.5 s, nên tỉ lệ cố định có thể giảm khi bài dài hơn. Bài dài nhất trong dữ liệu là `t5` của Opus (259 s, ~4 phút); cần bài > 15 phút (nhiều hạng mục) để kiểm, cùng mô hình và cùng thời điểm.

## 5. Giới hạn

- **n rất nhỏ**: 1–2 lượt mỗi ô ở C1–C6; C7 có 1 lượt làn nhanh và 2 lượt Sonnet mỗi bài; 5 bài; chỉ bootstrap và hoán vị minh họa, không hiệu chỉnh so sánh bội. P hoán vị nhỏ nhất bị chặn bởi số hoán vị (C7: 1/243; C6: 2/36). CI bootstrap ở các ô chỉ 1 lượt hẹp giả tạo.
- **Nhiễu thời gian không kiểm soát**: thời gian tường phụ thuộc tải nhà cung cấp; các vòng chạy khác thời điểm (1/11 và 2/11) và hạn mức; C4 chạy hai nhiệm vụ CCoding đồng thời nên thời gian nhiễu.
- **Giá hiệu dụng** suy ra bằng hồi quy (R² mô hình sonnet 0.978 sau khi thêm C7), nhãn mô hình trộn haiku; chỉ để quy đổi tương đối.
- **O1–O6 là giả định**; `charsPerToken` = 3.5 chưa hiệu chuẩn. Hồi quy T-e1 có R² 0.755 nên một phần ghi cache chưa được giải thích.
- `claude_turns.csv` không có cột `system`, không có ở C3/C4; `output_partial` không dùng được; `calls.csv` không tách TTL ghi cache của CCoding; không có `events.jsonl`.
- Đường găng giả định các pha nối tiếp; `ts` là thời điểm kết thúc (đã kiểm với lượt 1); "ngoài LLM" chỉ là phần dư.
- Ở C1–C6 hai hệ khác cấu hình mô hình (Claude Code: opus; CCoding: sonnet), nên so sánh là của cả hệ thống. C7 tách được hiệu ứng này nhưng chỉ ở mức: 1 lượt làn nhanh, 2 lượt Sonnet mỗi bài, một đợt chạy trong cùng một buổi; chưa lặp lại ngày khác.
- **C6 chỉ có 2 bài × 2 lượt × 2 hệ (8 lượt chạy)**; CI của dòng C6 là minh họa, p hoán vị thời gian 0.0556 (= mức nhỏ nhất của 36 hoán vị). Chưa có `events.jsonl` nên nguyên nhân "còn chậm ở đâu" ở C6 và vì sao hạng mục thứ ba của `t2` C7 không chạy chưa tự kiểm.
- Thêm C6 làm đổi nhẹ các bảng phụ thuộc mọi dòng `calls.csv` (T-e0: R² sonnet; T-e1: F từ 2 588 xuống 2 399 token) và tỷ lệ O1–O5 (nền vẫn là C5); không đổi kết luận. Thêm C7 làm đổi tiếp: R² sonnet 0.975 → 0.978; F 2 399 → 2 350 token; R² T-e1 0.740 → 0.755; O1 4.7% → 4.6%; không đổi kết luận.
- Gộp C5+C6 trộn hai thời điểm và hai phiên bản mã; so sánh có nghĩa nhất là cùng thời điểm, nhưng ở C5 và C6 cặp lượt Claude/CCoding không được ghép từng đôi nên chưa tách được nhiễu thời điểm.

- **Không có bài dài**: bài dài nhất ~4 phút (Opus `t5`, 259 s); câu hỏi "đủ dài thì điều phối có lợi không" chưa kiểm được (cần bài > 15 phút).
- **Phần cố định T-d (3)** tính từ đường găng pha và phần dư; phần dư ("gộp + ngoài LLM") rất nhỏ (0.7–1.9 s) nên gần như toàn bộ phần cố định là kế hoạch và review. `failed_hidden` ở `runs.csv` có thể bị cắt (mục T-h).