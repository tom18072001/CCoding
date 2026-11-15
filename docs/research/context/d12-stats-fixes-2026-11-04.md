# D12 — Sửa mã thống kê theo thẩm định K2: bảng trước → sau

Nhãn dữ liệu: **Nội bộ**. Nhiệm vụ T-20261104-123633-378, hạng mục S4. Tài liệu này chỉ ghi số đo thật từ `analyze.mjs`; không đổi paper, `preregistration.md`, `facts.json`, `results/**`.

## (1) Phạm vi và căn cứ

- Căn cứ: thẩm định K2 (`docs/research/context/k2-stats-review-2026-11-04.md`, BRIEF-16; không có trong worktree, đọc bằng `git show 5df2cfc:docs/research/context/k2-stats-review-2026-11-04.md`), mục 2 (24 mã), mục 3 và 10.2 (F1–F12); `preregistration.md` §2.5 v2.1 (c).
- Sửa: `bench/vs-claude/lib/stats.mjs` (S1a) và `bench/vs-claude/analyze.mjs` (S1b), cùng test.
- "Trước D12" = commit `e12e037`. "Sau D12" = HEAD của worktree S4 (`2fe33cc`, đã gộp S1a, S1b). Mã sau này của S6 (nếu có) chưa nằm trong số liệu.
- Tập dữ liệu chạy: `study-cloud` (448 dòng, 440 sau khi loại 8 dòng hạ tầng), `b7prime` (20 dòng). **`study-cloud-final` không có `runs.jsonl`** (chỉ có báo cáo `analyze-*.md`), nên `analyze.mjs` không chạy được trên đó; xem mục "Giới hạn".
- Cờ: theo K2 §10.1. `--allow-mixed-judge` là cờ của D11 §2, **không phải cờ bản v0.4**; `--b01-arm B7|B6` là giả định của K2. Mọi số dưới đây là **số đối chiếu** (A-7), không dùng cho phân tích chính. Cả hai bản (trước, sau) chạy cùng cờ.

### Lệnh tái lập (nguyên văn, chạy từ gốc worktree, Node ≥ 22, Git Bash)

```bash
bash docs/research/analysis/d12-before-after.sh /tmp/d12out        # trước (git archive e12e037) và sau (HEAD), 9 lần chạy mỗi bên
node docs/research/analysis/d12-diff-rows.mjs /tmp/d12out          # in từng dòng bảng giả thuyết khác nhau: TRƯỚC / SAU
node docs/research/analysis/d12-diff-rows.mjs /tmp/d12out study-cloud-B0   # một thư mục
diff /tmp/d12out/before/study-cloud-B0/report.md /tmp/d12out/after/study-cloud-B0/report.md   # đối chiếu thô
```

`d12-before-after.sh` sao `runs.jsonl` vào thư mục tạm cho mỗi lần chạy (analyze ghi `report.md` cạnh dữ liệu), nên không ghi vào `results/`. Mỗi lần chạy là `analyze.mjs <thư mục> --baseline A0-sonnet --treatment <arm> --allow-mixed-judge [--b01-arm B7|B6]`; các thư mục kết quả: `study-cloud-{B0,B5,B6,B7,A1,A2}`, `study-cloud-B0.b01B7`, `study-cloud-B0.b01B6`, `b7prime-B7cab` (treatment `B7cab`). Tất cả exit 0 ở cả hai bên.

Hạt và RNG: hạt gốc 20261102 giữ nguyên. Trước D12 dùng một luồng chung; sau D12 H1, H2, H4, H6, H10 dùng `mulberry32(20261102 ^ fnv1a32(mã))` (A-5), nên p hoán vị của H10 lệch nhẹ (xem bảng). Bản cũ được giữ làm dòng độ nhạy trong báo cáo.

## (2) Bảng trước → sau

Ký hiệu: "nhãn" = cột phán quyết. `NK` = "not supported — không kết luận"; `BB` = "not supported — bác bỏ (CI hẳn ngoài vùng ủng hộ/biên)". Số liệu `study-cloud` có 6 treatment; dòng chung ghi gộp khi các arm cho kết quả giống hệt, ngoại lệ ghi riêng.

### 2.1 Thay đổi nhãn/phán quyết

| Tập | Giả thuyết/chỉ số | Trước D12 | Sau D12 | Mã |
| --- | --- | --- | --- | --- |
| study-cloud, mọi treatment | H2 (TOST90 [+0,0; +8,3] pp, 4 bài) | not supported | NK | A-4, T-1 |
| study-cloud, mọi treatment trừ B6 (ghi chú) | H5 (chi phí) | not supported (B0, B5, B7, A1, A2) | NK | A-4 |
| study-cloud B6 | H5 | SUPPORTED | giữ nguyên | (không đổi) |
| study-cloud B0, B6, B7, B5 | H1 | tên: "coding/design, size≥3"; B0 +2,8 pp [0,0; 9,0] 6 bài; B5 +2,3 [−6,0; 12,5] 3 bài; B6 +1,6 [−3,2; 8,1] 6 bài; B7 +2,8 [0,0; 8,3] 6 bài; nhãn not supported | tên: "danh sách cố định c3, c4, c5, r1", 4 bài. B0 +4,2 [0,0; 12,5]; B5 +1,7 [−4,9; 10,4]; B6 +2,8 [−5,6; 12,5]; B7 +4,2 [0,0; 12,5]; nhãn NK | A-2, A-4 |
| study-cloud A1, A2 | H1 | A1 +2,3 [−6,0; 12,5] 3 bài; A2 +3,5 [0,0; 11,8] 3 bài; not supported | A1 +1,7 [−4,2; 9,4] 4 bài; A2 +2,6 [0,0; 8,9] 4 bài; **BB** (hi < 10 pp) | A-2, B-2 |
| b7prime B7cab | H1 | +0,0 [0,0; 0,0] 3 bài, not supported | n/a, 0 bài, **insufficient data** (danh sách cố định không có bài nào đủ lượt) | A-2 |
| study-cloud, cả 6 treatment (A1, A2, B0, B5, B6, B7) | H3 | insufficient data ("chỉ 1 bài review (< 3), không phán") | NK, p recall 1,0000; p precision: B0 5,41e-6 (N=184756), B5/B6/B7/A1 0,0035 (N=286), A2 0,0152 (N=66); "H3 đăng ký 1 bài s1, không áp cổng ≥ 3 bài" | P-1 |
| study-cloud, cả 6 treatment | Dòng Holm {H3, H6} | K=0, "họ rỗng" | K=1, "H3: p=1,0000, p_min=…, confirmable=có, Holm không bác bỏ"; kết luận vẫn "không có giả thuyết xác nhận" | P-1 |
| study-cloud, cả 6 treatment | H7 | SUPPORTED (B0 0,00; A1 0,64; A2 0,47; B6 0,50; B7 0,04) hoặc not supported (B5 1,22), trên 13–18 bài, 0/0 := 1 | B0: tỉ số SD gộp 0,00 [0,00; 0,00], 2 bài, 16 bài loại vì r<5 → **insufficient data**; B5, A1, A2: 0 bài đủ cổng → insufficient data; B6: 5,87 [0,00; 10,17], 5 bài → NK; B7: 1,55 [1,55; 1,55], 5 bài → NK | A-1 |
| study-cloud, cả 6 treatment | H10, H10-coding, H10-adj | not supported | NK (giá trị ước lượng giữ nguyên) | A-4 |
| b7prime | H5, H7, H10, H10-coding, H10-adj | not supported; H7 1,00 [1,00; 1,00] 5 bài | H5, H10*: NK; H7: n/a, 0 bài (5 bài loại vì r<5) → insufficient data | A-4, A-1 |
| study-cloud B0 `--b01-arm B6` | B-01a (token) | R=3,752 [3,415; 4,290], 5 bài, not supported | R=3,934 [3,514; 4,392], 5 bài, "Bác bỏ", **BB** | T-2, B-2 |
| study-cloud B0 `--b01-arm B6` | B-01b (thời gian) | R=3,798 [3,297; 4,622], not supported | R=4,074 [3,468; 4,753], "Bác bỏ", **BB** | T-2, B-2 |
| study-cloud B0 `--b01-arm B6` | B-01c (điểm tương đối) | R=0,998 [0,993; 1,000], 5 bài, **SUPPORTED** | R=0,987 [n/a; n/a], 1 bài, bỏ trần [t1-duration, t3-api, t4-perf, t5-logq], "không kết luận (ít bài: 1 < 3)" → **insufficient data** | T-3, T-6, T-2 |
| study-cloud B0 `--b01-arm B7` | B-01a | R=2,460 [2,070; 3,023], not supported | R=2,519 [2,052; 3,131], **BB** | T-2, B-2 |
| study-cloud B0 `--b01-arm B7` | B-01b | R=2,482 [2,079; 3,140], not supported | R=2,580 [2,097; 3,242], **BB** | T-2, B-2 |
| study-cloud B0 `--b01-arm B7` | B-01c | R=1,000 [0,999; 1,000], 5 bài, **SUPPORTED** | R=n/a, 0 bài, bỏ trần cả 5 bài → "mọi bài chạm trần" → **insufficient data** | T-3, T-6 |
| b7prime, study-cloud B5/A1/A2 (arm SL mặc định) | B-01a/b/c | insufficient data ("không có dữ liệu SL") | insufficient data; chỉ đổi mô tả: "trung bình theo bài của log-tỉ số" | T-2 |
| mọi tập | H1′, H2′ | "dự kiến, chưa khóa (§2.6)" | thêm: "quy tắc trần/suy biến bảo thủ chờ đăng ký (S-1)"; số không đổi (B0: T=+0,0 pp, p=0,9167, 5 bài, 248832 hoán vị; B7cab: p=1,0000, 7776 hoán vị; H2′ chưa có bài đủ lượt) | S-1 |

### 2.2 Thay đổi số (không đổi nhãn)

| Tập | Chỉ số | Trước D12 | Sau D12 | Mã |
| --- | --- | --- | --- | --- |
| study-cloud B0 | H6 B0−A1 (mô tả, mọi bài) | +0,7 pp [0,0; +2,2] | +0,7 pp [0,0; **+2,4**] | T-4 (phân vị) |
| study-cloud B5 | H6 B5−A1 | −0,9 [−3,7; +1,2] | −0,9 [**−3,8**; **+1,1**] | T-4 |
| study-cloud A1 | H6 A1−A2 | −0,3 [−1,8; +1,1] | −0,3 [**−1,7**; +1,1] | T-4 |
| study-cloud A2 | H6 A2−A1 | +0,3 [−1,1; +1,7] | +0,3 [**−1,0**; **+1,9**] | T-4 |
| study-cloud B0 | H10 p hoán vị | 0,129 | 0,132 | A-5 |
| study-cloud B5 | H10 p hoán vị | 0,074 | 0,075 | A-5 |
| study-cloud A1 | H10 p hoán vị | 0,128 | 0,133 | A-5 |
| study-cloud A2 | H10 p hoán vị | 0,150 | 0,155 | A-5 |
| study-cloud B6 | H10 p hoán vị | 0,153 | 0,148 | A-5 |
| study-cloud B7 | H10 p hoán vị | 0,128 | 0,126 | A-5 |
| study-cloud mọi treatment | H6, dòng mô tả | "bootstrap estimate" | "bootstrap ước lượng (ít bài) (CI một tầng … không phản ánh biến thiên giữa bài, kết luận chính theo CI hai tầng của tost)"; nhãn H6 vẫn insufficient data (tập khai báo n=0) | B-3, C-2 |

Số H6 của B6 (B6−A1 +0,3 [−0,9; +1,7]; B6−A2 +0,1 [−1,7; +1,9]) và B7 (B7−A1 +0,7 [0,0; +2,4]; B7−A2 +0,5 [0,0; +1,9]) **không đổi** giữa trước và sau (đã đối chiếu bằng `d12-diff-rows.mjs`); chỉ đổi ghi chú CI một tầng.

### 2.3 Dòng độ nhạy mới (giữ cách cũ, chỉ đối chiếu; xuất hiện ở báo cáo sau D12, mục "Độ nhạy")

| Tập | Dòng | Giá trị cách cũ (nhãn cũ) | Mã |
| --- | --- | --- | --- |
| study-cloud B0 | H1 (lọc size ≥ 3, luồng chung) | +2,8 pp [0,0; 9,0], p=1,000, 6 bài | A-2 |
| study-cloud B0 | H2/H4/H6/H10 (luồng chung cũ) | H2 +2,8 [0,0; 11,1] p=1,000; H4 +1,5 [0,0; 4,5] p=1,000 (1 bài); H6 B0−A1 +0,7 [0,0; 2,2] p=0,504, B0−A2 +0,5 [0,0; 1,9] p=1,000; H10 +1,6 [0,0; 4,3] p=0,128 | A-5 |
| study-cloud B0 | H7 (phép cũ) | SD gộp 0,00 trên 13 bài; median per-task 1,00 trên 18; nhãn cũ SUPPORTED | A-1 |
| study-cloud B5 | H1 / H2-H10 / H7 | H1 +2,3 [−6,0; 12,5] p=1,000 (3 bài); H10 +0,7 [−2,3; 3,8] p=0,753; H7 1,22 trên 13 bài, nhãn cũ not supported | A-1, A-2, A-5 |
| study-cloud A1 | H1 / H2-H10 / H7 | H1 +2,3 [−6,0; 12,5]; H10 +1,5 [−1,1; 4,9] p=0,377; H7 0,64 trên 13 bài, nhãn cũ SUPPORTED | A-1, A-2, A-5 |
| study-cloud A2 | H1 / H2-H10 / H7 | H1 +3,5 [0,0; 11,8]; H10 +1,8 [0,0; 4,9] p=0,254; H7 0,47 trên 13 bài, nhãn cũ SUPPORTED | A-1, A-2, A-5 |
| b7prime B7cab | H1 / H2-H10 / H7 | H1 +0,0 [0,0; 0,0] 3 bài; H2/H4/H6 n/a; H10 +0,0 p=1,000; H7 1,00 trên 5 bài, nhãn cũ not supported | A-1, A-2 |
| study-cloud B6, B7 | cùng ba dòng | có trong `report.md` sau (chạy `diff`) | A-1, A-2, A-5 |

### 2.4 Không đổi

H4, H8, H9 (không dòng nào khác biệt trong `d12-diff-rows.mjs` trên cả 9 thư mục; kể cả H9 sau A-3), H5 của B6 (SUPPORTED), số H6 của B6 và B7, ước lượng mô tả của H3 (recall/precision +0,0 pp).

### Ghi chú đọc số

- Nhãn BB ở H1 của A1/A2 nghĩa là CI trên (+9,4; +8,9 pp) nằm dưới ngưỡng ủng hộ 10 pp (`refuted: hi < 0,1`). Đây là ngữ nghĩa B-2 như `analyze.mjs` cài, không phải kết luận "treatment tệ hơn". **Đề nghị S5b/N-2 xác nhận ngữ nghĩa này đúng ý đăng ký** (tôi không đọc preregistration để kiểm).
- Trên dữ liệu đã công bố, T-1 không tạo ra nhãn "equivalent" nào: H2, H6 và B-01 ở đây vốn không đạt tương đương. Thay đổi đáng chú ý nhất là: hai nhãn **SUPPORTED** của B-01c (khi `--b01-arm B6` hoặc `B7`) mất đi (T-3, T-6); và các nhãn SUPPORTED của H7 (B0, A1, A2, B6, B7) không còn (A-1): B0, A1, A2 thành insufficient data, B6, B7 thành NK.
- Phần "trước D12" chạy trên mã `e12e037` nên có cổng 3 bài cho H3. Báo cáo D11 (`docs/research/context/d11-baseline/`) ở commit `1673529` cũ hơn và không dùng để so ở đây.

## (3) 24 mã và 12 ca F → commit/test

Nguồn: bàn giao S1b (`.ccoding/T-20261104-123633-378/outputs/dev-S1b-senior-swe.md`). **Chưa có bàn giao S1a trong thư mục outputs lúc viết**; cột commit của `stats.mjs` lấy từ `git log` và từ bảng S1b, cột test ghi theo tệp. Tệp test: `bench/vs-claude/test/stats-k2.test.mjs` (S1a, mức hàm) và `analyze-k2.test.mjs` (S1b, mức analyze).

| Mã | Chỗ sửa | Test | Commit |
| --- | --- | --- | --- |
| T-1 | `tost`/`bootP`/`h6Combine`; H2, H6, B-01 trong `verdict()` | F1, F7, `T-1 (H2, B-01)`; `stats-k2.test.mjs` | `860118b` + `0fe233b` |
| B-1 | `bootP` lọc NaN, p = null | F7; `stats-k2.test.mjs` | `860118b` |
| T-2 | B-01 dùng `tost` log-tỉ số theo bài | F12 | `18a2387` + `0fe233b` |
| T-3, T-6 | B-01: trần 0,99 cho điểm, `minTasks: 3` | `T-3/T-6 B-01`, F2 | `18a2387` + `0fe233b` |
| T-4, A-6 | `percentileCI` thay `floor` | `A-6 + A-5` | `18a2387` + `0fe233b` |
| T-5 | NaN là suy biến | F7 | `860118b` |
| B-2 | nhãn bác bỏ khi CI hẳn ngoài biên | F6 | `18a2387` + `0fe233b` |
| B-3 | `ciNote` ở dòng H6 | không có test riêng | `18a2387` + `0fe233b` |
| B-4 | giữ cách phân tầng khác, ghi lý do trong comment | không có test | `18a2387` |
| C-1 | từ chối dòng thiếu `arm` | `C-1` | `18a2387` + `0fe233b` |
| C-2 | nhãn H6 từ `h6Combine` | F1, F6 | `0fe233b` |
| S-1 | `permStratified` loại bài trần khi margin ≠ 0 | F11 | `9c3136c` + `0fe233b` |
| S-2 | `alt = 'two'` | `stats-k2.test.mjs` | `9c3136c` |
| P-1 | H3 bỏ cổng ≥ 3 bài | `P-1`, F9 | `0fe233b` |
| P-2 | chặn kích thước, Monte Carlo khi ∏C > 10⁶ | `stats-k2.test.mjs` | `9c3136c` |
| A-1 | H7 cổng r ≥ 5, ≥ 3 bài, suy biến khi sd gộp = 0 | `A-1` | `0fe233b` |
| A-2 | H1 danh sách c3, c4, c5, r1 | `A-2` | `0fe233b` |
| A-3 | H9 `citationValidityOf` | `A-3` | `0fe233b` |
| A-4 | `verdict()` tách bác bỏ / không kết luận | `A-4` | `0fe233b` |
| A-5 | `streamFor` + `fnv1a32` | `A-5` | `9c3136c` + `0fe233b` |
| A-7 | ghi chú `--allow-mixed-judge` | `A-7` | `0fe233b` |

Bảng có 21 dòng và phủ 23 mã: T-1…T-6 (6), B-1…B-4 (4), C-1, C-2, S-1, S-2, P-1, P-2 (6), A-1…A-7 (7). Đề bài nói "24 phát hiện" nhưng danh sách mã liệt kê chỉ có 23; tôi không tìm thấy mã thứ 24 trong đề, cần S5b/S6 đối chiếu với K2 mục 2 (`git show 5df2cfc:docs/research/context/k2-stats-review-2026-11-04.md`).

| F | Test trong `analyze-k2.test.mjs` |
| --- | --- |
| F1 | `F1 (T-1, C-2)` |
| F2 | `F2 (T-3)` |
| F3 | `F3` |
| F4 | `F4 (n = 0)` |
| F5 | `F5 (n = 1, 2, 3)` |
| F6 | `F6 (suy biến bị bác bỏ)` |
| F7 | `F7 (B-1, NaN)` |
| F8 | `F8 (a)(e)` |
| F9 | `F9 (H3 suy biến)` |
| F10 | `F10 (permStratified qua H1′/H2′)` |
| F11 | `F11 (S-1)` |
| F12 | `F12 (T-2)` |

Lưu ý từ S1b: kiểm đột biến cho thấy 13/23 test đỏ khi dùng `analyze.mjs` cũ; F2, F3, F4, F5, F7, F8, F9, F10, F12, A-6 vẫn xanh với `analyze.mjs` cũ vì `stats.mjs` đã sửa, nên chỉ làm lưới chặn hồi quy.

## (4) Quy tắc bảo thủ chờ Phòng Nghiên cứu đăng ký

1. **S-1**: `permStratified` với margin ≠ 0 (H1′, H2′) loại bài trần rồi kiểm suy biến, giống H6 v2.1 (b). Chưa có trong đăng ký; phải đăng ký trước khi khóa H1′, H2′. Báo cáo ghi "quy tắc trần/suy biến bảo thủ chờ đăng ký (S-1)".
2. **A-5**: cách suy hạt từng giả thuyết `mulberry32(20261102 ^ fnv1a32(mã))`. Đăng ký chỉ có hạt gốc 20261102. Kết quả luồng chung cũ giữ ở mục "Độ nhạy".
3. **A-1, A-2**: dòng độ nhạy cho H7 (phép cũ) và H1 (lọc size ≥ 3) là cách trình bày của D12, chưa được đăng ký làm độ nhạy (V4-K2-1).
4. **B-2**: ngữ nghĩa "bác bỏ" (CI hẳn ngoài biên/ngưỡng ủng hộ) áp cho H1, H4, H2, H6, B-01. Cần xác nhận đây là cách đọc đúng của đăng ký.
5. **T-3, T-6 cho B-01 (c)**: trần ≥ 0,99 và cổng ≥ 3 bài theo K2; xác nhận khớp §2.5.
6. **B-3, B-4**: CI một tầng của bootstrap H6 chỉ là mô tả; kết luận chính theo CI hai tầng của `tost`. Giữ khác ở B-4 vì lý do trong comment `stats.mjs`.
7. Ngưỡng bậc giá Haiku (K2/S2) thuộc mục (5), do S6 điền.

## (5) K2 giá Haiku và K3 arm

Nguồn: bàn giao S2, S3 (`.ccoding/T-20261104-123633-378/outputs/dev-S2-data-engineer.md`, `dev-S3-backend-dev.md`). **K2 đạt** (S2 không báo blocker).

**K2: giá Haiku 5.5** (`bench/vs-claude/lib/pricing.mjs`, `recost.mjs`)
- Nguồn chính thức, truy cập 4/11/2026 (HTTP 200): https://www.anthropic.com/claude-haiku-5-5 và https://platform.claude.com/docs/en/models/haiku-5-5/overview. Không dùng số bên thứ ba. Trích nguyên văn nằm ở comment đầu `pricing.mjs`.
- USD / 1 triệu token, hai bậc: input 0,10 (≤ 100K) / 0,50 (> 100K); output 0,50 / 2,50; ghi cache 5 phút 0,125 / 0,625; ghi cache 1 giờ 0,20 / 1; đọc cache 0,01 / 0,05.
- Ngưỡng bậc: trang viết "for prompts up to 100,000 tokens" và "for requests up to 100,000 tokens", tức theo từng prompt/request; trang không nói cách tính phần cache trong "prompt". `costUsd` dùng bậc cao (cận trên), `costUsdLow` dùng bậc thấp, nên mọi cách áp ngưỡng đều nằm trong [`costUsdLow`, `costUsd`]. `costBasis` có hậu tố `/haiku-tier-upper`; `PRICING_VERSION` = `2026-11-04`. Đọc cache của Haiku là 0,1× input (Sonnet/Opus 0,05×) nên có `cacheReadMult` riêng. **Chờ Phòng Nghiên cứu xác nhận** cách áp ngưỡng nếu muốn một số duy nhất.
- Kết quả `large-pilot` (`node bench/vs-claude/recost.mjs bench/vs-claude/results/large-pilot --out <tạm>`, exit 0, không sửa `runs.jsonl`): cả 6 dòng có chi phí; 4 dòng CCoding (B0, B1) hết `null`. B0: 1,210–2,060; B1: 1,392–1,873; A0-sonnet 0,890–1,006 (2 dòng giữ số cũ). Chênh giữa hai cận cùng một lượt chỉ ≈ 0,006 USD. Dữ liệu dựa `byPhaseDetail` × `byPhaseModel` (mỗi pha một model) vì `large-pilot` không có `calls.jsonl`.
- Test: `test/pricing.test.mjs` (thêm 3 test), `test/recost.test.mjs` (3 test: `recostRow` theo pha; ưu tiên `calls/<key>.jsonl`; ghi `costs-recomputed.json`, chạy lại cùng kết quả, CLI).

**K3: arm B0F/B1F ép làn đầy đủ** (`bench/vs-claude/arms.json`, README bench)
- Đường truyền, không sửa `src/`: `lib/ccoding.mjs:114` trải `opts.taskOptions` vào `options`; `src/types.ts:75` có `lane` gồm `'full'` (nên `supportedLanes()` ở `lib/queue.mjs:23` đọc được); `src/lane.ts:100` `forcedLane` và `src/orchestrator.ts:1373` `pickLane`; `src/orchestrator.ts:325` clamp `discussionRounds` 0–3, `:1719`/`:1725` họp khi `rounds > 0`, kế hoạch không nhỏ và lane khác `fast`.
- Test (`test/arms-full-lane.test.mjs`, runtime giả `mock`, không gọi `claude -p`): khai báo đúng; (a) `lane:full` + kế hoạch giả ≥ 3 hạng mục, ≥ 2 người ⇒ có pha họp; (b) `discussionRounds:0` ⇒ không họp; (c) `checkArms(['B0F','B1F'])` trả `[]`; (d) mọi arm cũ giống hệt `arms.json` ở `e12e037` (bỏ qua khi clone nông).
- Không thấy danh sách arm bị khóa cứng trong `bench/vs-claude/test` và README.

## Người đọc mã độc lập (N-2)

Tệp đầy đủ: [`d12-stats-fixes-2026-11-04.n2-review.md`](d12-stats-fixes-2026-11-04.n2-review.md) (mục 1: kỳ vọng F1–F12 tự suy, commit `ce9cd13` trước mọi commit sửa mã; mục 3: so với diff, S5b). Tóm tắt: **đạt có điều kiện**; T-1, B-1, C-2 đạt; 245/245 `test:bench`; F1–F12: 9 khớp hoàn toàn, 2 khớp một phần (F5, F8), 1 lệch (F12, kỳ vọng S5a sai, mã đúng); biên, ngưỡng, B = 4000, hạt 20261102 không đổi. Không có blocker. Cách S6 xử lý (không viết lại ý kiến người đọc):

| Phát hiện | Xử lý ở S6 | Commit/test |
| --- | --- | --- |
| M-1 major: nhãn H6 chưa đòi mức Holm (§2.4) | **Sửa.** `analyze.mjs` H6: `verdict(h6.supported && h6Holm, …)`, `h6Holm = holm.byId.H6 ? holm.byId.H6.confirmed : true`. Dòng H6 trên dữ liệu đã công bố không đổi (H6 vốn "insufficient data"; đã chạy lại `d12-before-after.sh` và `d12-diff-rows.mjs`, bảng (2) giữ nguyên). **Chưa chứng minh được test có răng:** không dựng được ca CI trong biên mà Holm không xác nhận (S5b cũng không); test F8 chỉ khẳng định SUPPORTED ⇔ (Holm bác bỏ ∧ trong biên). | `ef8b78f`; `analyze-k2.test.mjs` F8 |
| m-1: F12 chưa kiểm nhãn/CI hai bài | **Sửa.** Thêm ca hai bài: không "suy biến", không SUPPORTED | `ef8b78f`; F12 |
| m-2: F5 n = 3 không kiểm "không SUPPORTED"; F8(e) không kiểm Holm | **Sửa.** Thêm `!isSupported` ở F5; thêm khẳng định dòng Holm ở F8 | `ef8b78f`; F5, F8 |
| m-3: chưa chứng minh từng ca đỏ rồi xanh cho `stats-k2.test.mjs` | **Làm đột biến** trên `stats.mjs` (đã hoàn nguyên, `git status` sạch): bỏ kiểm NaN của `bootP` (:212) ⇒ 2 test đỏ; bỏ nhánh suy biến của `tost` (:129) ⇒ 4 đỏ; bỏ nhánh suy biến của `bootP` (:218) ⇒ 5 đỏ. **Hai đột biến sống sót:** bỏ `!boots.every(isFinite)` ở `tost` (:122) và bỏ `pA.degenerate` ở `h6Combine` (:244), vì có chặn dự phòng (est không hữu hạn ở :122; `p == null` ở :244 bắt cùng ca). Tôi coi là tương đương về hành vi, **chưa chứng minh bằng ca đầu vào**. | không đổi mã |
| m-4: hai loại luồng hạt (xor-băm và hạt gốc) | **Chuyển** Phòng Nghiên cứu: ghi cả hai loại khi đăng ký A-5 (mục (4), 2) | không đổi mã |
| m-5: kỳ vọng F12 của S5a sai | Không sửa mục 1 (đúng quy trình); S5b đã đính chính ở mục 3 | n/a |
| Ghi chú S4: "24 mã" nhưng liệt kê 23 | S6 **không** đối chiếu với K2 mục 2 (chưa chạy `git show 5df2cfc:…`). Bảng (3) phủ 23 mã. **Việc còn mở** cho người điều phối. | n/a |

## Hash và kiểm cuối

Hash lấy sau commit mã cuối của S6 (`ef8b78f`); tài liệu này commit riêng, sau cùng (không đổi hai tệp mã).

```
git log -1 --format=%H -- bench/vs-claude/lib/stats.mjs   -> 9c3136c9345ee54df27fe52e193aaa163af1662d
git log -1 --format=%H -- bench/vs-claude/analyze.mjs     -> ef8b78fa7041c2a605f66fc46ffd0289d6bf51e5
git rev-parse HEAD:bench/vs-claude/lib/stats.mjs          -> fa048e744bffbb5e210fb106ef49607a38f5c69e
git rev-parse HEAD:bench/vs-claude/analyze.mjs            -> 7c69f438e693ff810b1870cbf84405ce9c6a26c8
```

Hash commit có thể đổi khi gộp vào `perf/vs-claude-loop` (rebase/squash đổi, merge thường không); hash blob không đổi. RUNLOG E6 ghi cả hai. Commit đầu gỡ chặn T-1/B-1 là `860118b` (chỉ tham chiếu, không dùng cho E6).

Kiểm cuối (worktree S6, Node v24.14.0, Windows):

| Lệnh | Kết quả thật |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` lần 1 | exit 1; tests 415, pass 408, fail 4, skipped 3 |
| `npm test` lần 2 | exit 1; tests 415, pass 408, fail 4, skipped 3 |
| `npm test` lần 3 | exit 1; tests 415, pass 408, fail 4, skipped 3 |
| `npm run test:bench` | exit 0; tests 245, pass 245, fail 0, skipped 0 |
| `node docs/research/scripts/consistency-check.mjs` | exit 0; "Đạt: 46 tệp, không lệch số liệu." |
| `node docs/research/self-improvement/holdout-sample-size.mjs --check` (không đối số) | exit 1; `TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string or an instance of Buffer or URL. Received undefined` (script cần đường dẫn tệp) |
| `… holdout-sample-size.mjs --check docs/research/self-improvement/holdout-and-sample-size.md` | exit 1; "LỆCH HASH so với holdout-lock.json: c1-iis-ecs, c2-burst-alert, c3-shop-bugs, c4-audit-chain, c5-tickets-api, l1-oncall, l2-knights, l3-reconcile, l4-startup-order, s1-sec-review — dừng, không tính cỡ mẫu." |
| `node docs/research/performance/scripts/token-analysis.mjs --check` (không đối số) | exit 1; `TypeError [ERR_INVALID_ARG_TYPE]: The "paths[0]" argument must be of type string. Received undefined` |
| `… token-analysis.mjs --check docs/research/performance/token-analysis.md` | exit 0; "OK: 12 bảng trong docs/research/performance/token-analysis.md trùng đầu ra script." |
| `node --test docs/research/analysis/*.test.mjs` (glob mở được: `agreement`, `gates-pairs`, `prereg-tests`) | exit 0; tests 46, pass 46, fail 0, skipped 0 |

Bốn test fail của `npm test` giống nhau cả ba lần: CT-09, CT-12, CT-13, CT-19 (nhóm `buildAbSpec`/`verifyHoldout`/holdout lock). Đề không yêu cầu điều tra; S6 không đổi `src/` hay `test/` của chúng. **Giả thuyết chưa kiểm:** cùng nguyên nhân với "LỆCH HASH holdout" ở trên. `npm test` đã đỏ ở baseline (exit 1) nhưng đề không có danh sách tên test đỏ của baseline nên **không so sánh được từng tên**.

`git diff e12e037 --stat` (18 tệp): chỉ `bench/vs-claude/**` và `docs/research/{analysis,context}/d12-*`. **Không chạm** `src/`, `docs/research/paper/`, `docs/research/preregistration.md`, `facts.json`, `results/**/runs.jsonl`, `RUNLOG.md` (lọc theo các mẫu này: không dòng nào).

## Giới hạn

- `study-cloud-final` không có `runs.jsonl` nên không có cột trước → sau cho tập này; báo cáo `analyze-*.md` ở đó là bản công bố v0.4 và không thể tính lại ở HEAD.
- Cờ chạy là cờ đối chiếu (xem mục 1), không phải cờ bản v0.4 (không có trong RUNLOG).
- Cột "Test" của các mã `stats.mjs` ở mục (3) ghi theo tệp `stats-k2.test.mjs`; S6 không đối chiếu từng tên test với bàn giao S1a.
- `prereg-tests.mjs` (K2 §10.1) không nằm trong phạm vi S4 và không được chạy lại.
