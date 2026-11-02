# S2 — Kiểm chứng lệnh và số liệu (T-20261102-112755-181)

- `git rev-parse HEAD` = `8b52644f0e65040e8af14fdde65c487c584c686c`
- `git status --short` = (rỗng) lúc bắt đầu. Worktree con S2 sạch, nên các thay đổi chưa commit ở nhánh nhiệm vụ không có ở đây; mọi kiểm tra theo HEAD này.
- Chỉ ghi `docs/research/dev-review/verification.md`. Không sửa `paper.md`, `challenges.md`, `token-analysis.*` hay các bản vá.

## 1. Tóm tắt lệnh

| # | Lệnh | Exit | Kết quả | Đạt? |
|---|---|---:|---|---|
| 1a | `node docs/research/performance/scripts/token-analysis.mjs` | 0 | 261 dòng, các bảng T-0, T-a…T-g; stderr rỗng | Đạt |
| 1b | `… token-analysis.mjs --check docs/research/performance/token-analysis.md` | 0 | `OK: 10 bảng … trùng đầu ra script.` | Đạt |
| 2a | `git apply --check P1-output-cap.diff` (không cờ) | 1 | `patch failed: src/prompts.ts:480` | **Không** (mục 2) |
| 2b | `git apply --check P2-stop-surveying.diff` | 1 | `patch failed: src/prompts.ts:271` | **Không** |
| 2c | `git apply --check P3-review-diff-only.diff` | 1 | `patch failed: src/prompts.ts:624` | **Không** |
| 2d | `git apply --check P4-incident-log-on-revise.diff` | 1 | `patch failed: src/prompts.ts:524` | **Không** |
| 2e | `git apply --unidiff-zero --ignore-whitespace --check` cho từng P1…P4 | 0 ×4 | không in lỗi | Đạt (cờ ghi ở tiêu đề P1) |
| 3 | `git cat-file -t` cho 54 hash | 0 | 54/54 là `commit` | Đạt |
| 4 | Đối chiếu 20 số (mục 4) | – | 17 khớp, 3 lệch | **Có lệch** |
| 5 | grep "C6 … chưa có" / "không nhanh hơn rõ rệt" | – | 17 dòng khớp (mục 5) | Đầu vào cho R1 |

## 2. Về `git apply --check` (P1…P4)

- Lệnh trần (không cờ) **thất bại cả 4 bản vá**, đều ở `src/prompts.ts`. Mỗi bản vá là hunk không có dòng ngữ cảnh (`@@ -480 +480 @@`).
- Nguyên nhân: **không phải do mã đã đổi.** `git log --oneline d7600f6..HEAD -- src/prompts.ts` rỗng (0 commit) và `cf3ae6c` (commit mà P1 dẫn) tồn tại. `src/prompts.ts` ở working tree là CRLF (`file` báo CRLF; `core.autocrlf=true`), còn bản vá viết bằng LF và không có ngữ cảnh, nên dòng không khớp về ký tự xuống dòng.
- Kèm `--unidiff-zero --ignore-whitespace`, cả 4 đều qua (exit 0). Đây là lệnh ghi ở mục "Áp dụng" của P1; tôi dùng cùng cờ cho P2…P4 mà chưa đối chiếu dòng "Áp dụng" riêng của từng tệp. Không `apply` thật.
- Chưa kiểm: các bản vá có chồng lên nhau không (cùng `src/prompts.ts`), vì chỉ `--check` từng tệp.
- Đề xuất: mọi tài liệu nhắc `git apply --check` phải ghi kèm cờ trên.

## 3. Hash (`git cat-file -t`, không fetch)

Cách trích: `grep -oE '\b[0-9a-f]{7,40}\b' docs/research/challenges.md`, giữ chuỗi có cả chữ số lẫn chữ a–f, cộng `5866cda` và `d7600f6`. Hạn chế: hash toàn chữ số hoặc toàn chữ bị loại, chưa kiểm khả năng đó.

Kết quả: 54/54 là `commit`, không có "not found". `5866cda` và `d7600f6` đều có trong repo này.

`02c01e7 03816e4 03eed23 0601a36 0a41705 0be5579 0e82b82 2dba97c 2e49b2c 36d498c 3b037b2 43f522b 44ad65d 44e28ca 4fab312 505a1df 52a9ce7 5866cda 6a9abe5 6cba132 6f51a47 7291cec 77382d5 7ea8a74 895fd1c 8df59b8 8f70d47 8f92a52 9227e6b 9589c2f a310109 a44c113 a958362 a9b6214 a9db0ad aa6aa3a ae28f0a b80769b ba70470 bf37344 c5c78ce d6bfdb0 d73fefa d7600f6 d767806 d83dbbe e41b684 e9147d8 e94e071 eb5f176 f1981ff f4681f1 fc570f3 fef09a9`

Chỉ kiểm hash **tồn tại**, chưa kiểm hash đúng nội dung `challenges.md` mô tả (việc của S3).

## 4. Kiểm số liệu

Cách chọn: script Node (mulberry32, **seed = 20261102**) chọn 20 dòng không lặp từ 123 dòng ứng viên của 4 tệp (dòng có ký hiệu vòng/cache/giây/USD/lần/×/CI/T-x và có số). Nhiều dòng được chọn là văn xuôi không có số đối chiếu được (paper:12, 16, 52, 58, 123; challenges:27, 41, 142) nên bị bỏ; tôi **bổ sung tay** các dòng đánh dấu † để đủ ≥ 15. Nguồn "script" là đầu ra thật của lệnh 1a.

| # | Tệp:dòng | Số trong bài | Số trong script | Bảng | Kết quả |
|---|---|---|---|---|---|
| 1 | paper.md:187 | t3 Claude Code 246, 258 → 252 s | 252 | T-a (C6) | Khớp |
| 2 | paper.md:187 | t3 CCoding 211, 173 → 192 s | 192 | T-a | Khớp |
| 3 | paper.md:187 | tỉ lệ thời gian t3 0,76 | 0.76 | T-g | Khớp |
| 4 | paper.md:187 | chi phí 1,044 / 1,103 | 1.044 / 1.103 | T-a | Khớp |
| 5 | paper.md:187 | ghi cache 42 120 / 129 942 (3,1×) | 42 120 / 129 942; 3.09 | T-a, T-b | Khớp |
| 6 | paper.md:107 | chi phí +5,6% (t3), +21,1% (t5); thời gian 0,76 / 0,67 | T-g 1.06 / 1.21; 0.76 / 0.67 (tính lại 1,103/1,044 = 1,0565; 1,222/1,009 = 1,211) | T-g | Khớp |
| 7 | paper.md:171 | C1 chi phí +0.610 USD, 96.6% [67.0; 130.3] | giống hệt | T-f | Khớp |
| 8 | paper.md:175 | C5 chi phí +0.144 USD, 21.8% [11.5; 32.1] | giống hệt | T-f | Khớp |
| 9 | paper.md:229 | C5 tỷ trọng ghi cache plan 14.5 / execute 60.0 / review 24.0 / revise 1.4% | giống hệt | T-c | Khớp |
| 10 | paper.md:246 | O6 tiết kiệm 0.257 USD, 20.7% | 0.257; 20.7 | T-e | Khớp |
| 11 | paper.md:162 | Claude 297/298 (t1, C1 và C5); CCoding 59/60 (t2, C4) | giống hệt | T-a | Khớp |
| 12 | paper.md:332 | "đắt hơn khoảng gấp đôi" (thiết kế ban đầu); "cao hơn khoảng 22%" (C5) | C1 tỷ lệ chi phí 1.97; C5 +21.8% | T-b, T-f | Khớp |
| 13 | publication-plan.md:123 | một lượt C5 ≈ 0.54–1.14 USD, ≈ 107–400 s | TB theo bài: 0.542–1.139 USD; 107–400 s | T-a | Khớp (đó là TB theo bài; min–max từng lượt là 78–579 s) |
| 14 † | paper.md:216 | C1 gộp: 132 163 / 28 033 / 4.71 / 1.85 / 2.58 / 1.97 / 6.3 | giống hệt | T-b | Khớp |
| 15 † | challenges.md:37, :132; presentation-notes.md:29 | 3,34–6,08×; C1 4,71; C2 6,08; C5 3,34 | giống hệt theo vòng (C6 là 3.37, nằm trong khoảng) | T-b | Khớp |
| 16 † | paper.md:190 | C6: 8/8 lượt đạt 100% test ẩn | C6: 4 CC + 4 Claude, đủ test ẩn | T-a | Khớp |
| 17 † | paper.md:187 | t5 ghi cache 3,7× | 3.66 | T-b | Khớp |
| 18 | **paper.md:248** | đầu ra 38.1%, ghi cache 49.4%, đọc cache 10.2% | **38.3%, 49.6%, 9.9%** (tổng 8.042 USD khớp) | T-e, dòng "Nền" | **LỆCH** |
| 19 † | **paper.md:222** | "5/10 ô trong khoảng 2,8–4" | **7/12 ô** (khoảng 2.76–6.08 khớp) | T-b | **LỆCH** (chưa cập nhật số ô sau khi thêm C6) |
| 20 | **publication-plan.md:30, :159** | O1 "trần trên 5.1%" | **4.7%** (0.038 USD) | T-e | **LỆCH** |

Ghi chú:
- Ba chỗ lệch (18–20) do bài chưa theo kịp script. Tôi không sửa.
- T-d **có** hàng C6 (execute 4 lượt, 245,2 s; tổng đường găng C6 có dòng riêng), trái với câu "C6 chưa có trong T-d" ở paper.md:204.
- Chưa so lại số thô trong `c6-extract/*.csv` với commit `5866cda`. T-0 báo 33/33 và 24/24 lượt khớp tổng giữa các tệp.

## 5. Grep (đầu vào cho R1)

Lệnh: `grep -rnE 'C6.{0,40}chưa có|không nhanh hơn rõ rệt' --include=*.md docs/research` (dùng `-E` vì `-P` lỗi locale; grep theo dòng nên tương đương mẫu gốc). 17 dòng khớp. Tôi chỉ in 240 ký tự đầu mỗi dòng; các dòng ghi "mở dòng" có đoạn khớp nằm ở phần bị cắt.

| Tệp:dòng | Nội dung (rút gọn) | Ghi chú cho R1 |
|---|---|---|
| challenges.md:5 | "C6: chưa có dữ liệu — mọi chỗ cần C6 … ghi 'chưa đo'" | Cập nhật |
| challenges.md:36 | C-12 `maxParallel` | Mở dòng để xem đoạn khớp; cập nhật bằng số C6 |
| challenges.md:108 | L11 `maxParallel` | Cập nhật |
| challenges.md:138 | P-07 "C6 … chưa có; hiệu quả `d7600f6` chưa xác nhận" | Cập nhật |
| paper/paper.md:5 | Quy ước số liệu, "C1–C5 …" | Cập nhật |
| paper/paper.md:179 | "C6 chưa có trong T-f; không có CI bootstrap cho C6" | Sai: T-f có 2 dòng C6 (−72,8 s; +0,136 USD) |
| paper/paper.md:204 | "C6 chưa có trong T-d …" | Sai: T-d có hàng C6 |
| paper/paper.md:220 | "C6 chưa có trong T-b; … 3,1× và 3,7×" | Sai: T-b có C6 (3.09, 3.66) |
| performance/token-analysis.md:22 | "`results/` của nhánh này chưa có C6 …" | Có thể giữ: mô tả nguồn dữ liệu, sau đó nói đã dùng c6-extract |
| presentation-notes.md:5 | "**C6: chưa có dữ liệu.**" | Cập nhật |
| publication-plan.md:6 | "**C6: chưa có dữ liệu.**" | Cập nhật |
| publication-plan.md:55 | B2 | Mở dòng |
| publication-plan.md:181 | "vòng C1–C5 (C6 chưa có)" | Cập nhật |
| publication-plan.md:197 | "… đắt hơn, không nhanh hơn rõ rệt" | Mâu thuẫn T-f/T-g (C6 −72,8 s; C5+C6 bỏ lượt treo −28,2 s; giữ lượt treo CI chứa 0) |
| related-work.md:337, :358, :361 | K-section, N1, N4 | Mở dòng; có thể khớp "C6 … chưa có" ở phần cuối dòng |
| self-improvement/design.md:208 | "Chưa có số đo C6 và chưa có `token-analysis.md` của S2" | Cập nhật |

Con số 17 dòng hơi lệch báo cáo trước ("20 chỗ"), có thể do mẫu hoặc cách đếm khác.

## 6. Chưa làm / hạn chế

- Chưa chạy `npm run typecheck` / `npm test`: hạng mục này chỉ chạy lệnh kiểm chứng tài liệu, không đổi mã.
- Chưa kiểm hash đúng nội dung; chưa so số thô c6-extract với `5866cda`.
- Mẫu số chọn từ dòng có từ khóa và có 5 dòng bổ sung tay (†), nên không phải mẫu ngẫu nhiên thuần.
