# Đối chiếu `analyze.mjs` với `prereg-tests.mjs` (vòng 3, gói 3)

> Phân loại dữ liệu: **Nội bộ** (bài tổng hợp, không có DLCN). Theo `run-plan.md` §5.3: chạy `bench/vs-claude/analyze.mjs` trên **bản sao đã lọc** của `runs.jsonl`; bản gốc không bị sửa. Mọi số của phòng lấy từ `round3-tables.md` (sinh bởi `prereg-tests.mjs`). Hash commit 1 (script đóng băng) ghi ở đầu `round3-tables.md`.

## Tóm tắt

- Bản lọc có **197/197 dòng** (0 lượt bị loại: không dòng nào thỏa Q, L, T, E1, E4; `excluded-round3.csv` chỉ có header và ghi chú). `analyze.mjs` cũng báo "Errors / non-done runs: none", "Leaked runs: none", "0 infra rows dropped".
- **H5: hai công cụ khớp** ở độ chính xác một chữ số thập phân cho cả năm cặp cùng cửa sổ (token, thời gian, tỉ lệ bài đạt ngưỡng). Lỗi lệch chỉ số SR-06 (`analyze.mjs:81-83`) **tồn tại trong mã nhưng không tác động ở dữ liệu này** vì không bài nào có tỉ số NaN.
- **Lệch có thật** nằm ở chỗ `analyze.mjs` làm khác phép của phòng, không phải ở lỗi số học: (1) gộp mọi cửa sổ trong một thư mục, (2) phán quyết bằng ước lượng điểm chứ không bằng CI/TOST, (3) in nhãn "SUPPORTED" cho H1/H2/H7 ở cỡ mẫu và điều kiện trần mà tiền đăng ký không cho phép gọi như vậy, (4) không có B-01. Giải thích từng chỗ ở §4.
- `analyze.mjs` không có phép TOST, nên **B-01 không có số đối chiếu**; chỉ đối chiếu được hiệu điểm theo bài (khớp, §3).

## Lệnh đã chạy (từ thư mục gốc repo)

```bash
node docs/research/analysis/reconcile-prepare.mjs
# in: all: 197 dòng · W1: 54 · W2a: 24 · W2b: 30 · W2c: 14 · B7a: 75 · Bị loại: 0
A=docs/research/analysis/reconcile; AN=bench/vs-claude/analyze.mjs
for w in W1 W2a W2c; do node $AN $A/$w --baseline A0-sonnet --treatment B0 > $A/$w/stdout-B0.md; done
node $AN $A/W2b --baseline A0-sonnet --treatment B6 > $A/W2b/stdout-B6.md
node $AN $A/B7a --baseline A0-sonnet --treatment B7 > $A/B7a/stdout-B7.md
for x in B0 B6 B7; do node $AN $A/all --baseline A0-sonnet --treatment $x > $A/all/stdout-$x.md; done
```

`reconcile-prepare.mjs` dùng cùng `classifyRows` với `prereg-tests.mjs`. Tạo `all/` (mọi lượt giữ lại) và một thư mục mỗi cửa sổ để `analyze.mjs` tính đúng cặp cùng cửa sổ như H5 của phòng. Mỗi thư mục có `runs.jsonl` (bản sao), `stdout-<arm>.md` (đầu ra nguyên văn), `summary.csv`, `pareto.csv`. `report.md` do `analyze.mjs` ghi đè mỗi lần chạy nên đã bỏ khỏi bản lưu vì trùng `stdout`. Không xếp lệnh `pairwise.mjs` (§5.3): không có bài design/requirements/research cần giám khảo cặp trong phạm vi gói này.

## Đầu ra nguyên văn (dòng H5; các dòng H khác ở §4)

```
reconcile/W1  (B0/A0)  | H5 | Cost ratio B0/A0-sonnet | weighted tokens median x5.7, wall time median x9.6; tasks meeting both thresholds 100% | SUPPORTED |
reconcile/W2a (B0/A0)  | H5 | Cost ratio B0/A0-sonnet | weighted tokens median x9.5, wall time median x11.7; tasks meeting both thresholds 100% | SUPPORTED |
reconcile/W2c (B0/A0)  | H5 | Cost ratio B0/A0-sonnet | weighted tokens median x9.3, wall time median x11.1; tasks meeting both thresholds 100% | SUPPORTED |
reconcile/W2b (B6/A0)  | H5 | Cost ratio B6/A0-sonnet | weighted tokens median x3.8, wall time median x3.4; tasks meeting both thresholds 100% | SUPPORTED |
reconcile/B7a (B7/A0)  | H5 | Cost ratio B7/A0-sonnet | weighted tokens median x2.0, wall time median x1.9; tasks meeting both thresholds 20% | not supported |
reconcile/all (B0/A0)  | H5 | ... | weighted tokens median x6.3, wall time median x9.6; tasks meeting both thresholds 100% | SUPPORTED |
reconcile/all (B6/A0)  | H5 | ... | weighted tokens median x3.8, wall time median x3.5; tasks meeting both thresholds 100% | SUPPORTED |
reconcile/all (B7/A0)  | H5 | ... | weighted tokens median x2.0, wall time median x1.9; tasks meeting both thresholds 20% | not supported |
```

## 3. Bảng đối chiếu

| Mục | `prereg-tests.mjs` (`round3-tables.md`) | `analyze.mjs` | Khớp? |
|---|---|---|---|
| H5 W1 B0/A0 (9 bài) | token ×5,68 · thời gian ×9,60 · 9/9 | ×5,7 · ×9,6 · 100 % | Khớp |
| H5 W2a B0/A0 (4 bài) | ×9,54 · ×11,71 · 4/4 | ×9,5 · ×11,7 · 100 % | Khớp |
| H5 W2c B0/A0 (s1 r4–10) | ×9,32 · ×11,05 · 1/1 | ×9,3 · ×11,1 · 100 % | Khớp |
| H5 W2b B6/A0 (5 bài) | ×3,78 · ×3,43 · 5/5 | ×3,8 · ×3,4 · 100 % | Khớp |
| H5 B7a B7/A0, A0 r4–9 (5 bài) | ×1,99 · ×1,94 · 1/5 | ×2,0 · ×1,9 · 20 % | Khớp |
| H5 B7/A0 với A0 gộp r1–9 (độ nhạy) | ×1,96 · ×1,93 · 1/5 | `all`: ×2,0 · ×1,9 · 20 % | Khớp |
| H5 B0/A0 gộp mọi cửa sổ | không tính (không phải cặp cùng cửa sổ) | `all`: ×6,3 · ×9,6 | Không có đối ứng; xem §4.1 |
| H5 B6/A0 gộp | không tính | `all`: ×3,8 · ×3,5 (W2b cho ×3,43) | Lệch 0,1 ở thời gian; xem §4.1 |
| Hiệu điểm theo bài, B7 − A0 (B7a) | t1 −0,18 pp (B7 TB 0,9982), t2–t5 0 | Per task: t1 −0,2 pp, t2–t5 +0,0 pp | Khớp |
| Hiệu điểm theo bài, B6 − A0 (W2b) | t2 −0,56 pp (B6 TB 0,9944), còn lại 0 | Per task: t2 −0,6 pp, còn lại +0,0 pp | Khớp |
| Lượt bị loại | 0 | "0 infra rows dropped", "Errors / non-done: none", "Leaked runs: none" | Khớp |
| B-01 (a), (b), (c) | (a) ×2,50 [2,02; 3,18] · (b) ×2,57 [2,09; 3,25] · (c) trần ⇒ không kết luận; IUT **bác bỏ** | không có TOST | `analyze.mjs` không đối chiếu được |
| Chi phí USD | không dùng (SR-02) | B7 `0.00` USD, A0-sonnet `0.18` USD | Không so được; xem §4.6 |

## 4. Giải thích từng chỗ lệch

### 4.1 `analyze.mjs` gộp mọi lượt của một arm trong thư mục
Với `all/`, `A0-sonnet` là **một** ô duy nhất cho cùng bài ở mọi cửa sổ (t1–t5: W2b r1–3 và B7a r4–9; s1: W1 r1–3 và W2c r4–10). Cặp B6/A0 trong `all` so B6 r1–3 với A0 r1–9 nên thời gian ×3,5 thay vì ×3,43 của cặp cùng cửa sổ W2b. Tiền đăng ký chỉ cho phép ghép cùng cửa sổ (kế hoạch chung, quyết định về H5), nên số của phòng là số chính. Riêng B7/A0 gộp trùng độ nhạy "A0 gộp r1–9" của phòng (×1,96 làm tròn ×2,0). Đối chiếu từng cửa sổ dùng thư mục `W1`, `W2a`, `W2b`, `W2c`, `B7a`.

### 4.2 Lỗi SR-06 (lệch chỉ số `:81-83`) không tác động ở đây
`analyze.mjs` lọc `tr` và `wr` riêng bằng `Number.isFinite` rồi đếm `tr.filter((x, i) => x >= 3 && (wr[i] ?? 0) >= 1.5)`. Nếu một bài có tỉ số NaN ở chuỗi này mà không NaN ở chuỗi kia thì chỉ số `i` lệch và mẫu số lấy `tr.length`. Phòng ghép theo bài. Hai cột "ghép theo bài" và "analyze.mjs" trong `round3-tables.md` §3 **bằng nhau ở mọi cặp** (không bài nào có trung vị bằng 0), vậy lỗi này chưa làm sai số liệu vòng 3. SR-06 vẫn là lỗi cần sửa trong mã (P0), nhưng không đổi kết luận H5 ở đây.

### 4.3 Ước lượng điểm so với CI: nhãn "SUPPORTED" của H1/H2
`analyze.mjs` phán H1 bằng `est ≥ 0,1 && lo > 0` và H2 bằng `est ≤ 0,05`. Hệ quả quan sát được:
- `W2a` H1 = "SUPPORTED" (`+16.7 pp [+12.5, +25.0], tasks=1`): chỉ **một bài** (r1) có size ≥ 3, và CI chỉ phản ánh lấy lại 3 lượt trong ô. Đây là điểm của giám khảo `--judge` ở r1, không phải bằng chứng nhóm bài. p in ra là `1.000` vì hoán vị đổi dấu với n = 1 không thể nhỏ hơn 1 (p_min = 2^(1−n)).
- `W1` và `all/B0` H2 = "SUPPORTED" với `+0.0 pp` / `+2.8 pp [0,0; +11,1]`: phán quyết `est ≤ 0,05` vẫn đúng khi cận trên CI vượt 0,05, và Δ = 0 do trần không phải bằng chứng "B0 không hơn" (§2.7 cảnh báo cho H2).
Theo §2.4–§2.5 H1 và H2 chỉ là **ước lượng kèm CI**; phòng không dùng các nhãn này làm kết luận.

### 4.4 H3 và H7: `analyze.mjs` in nhãn dù chưa đủ N
- H3: `analyze.mjs` in "not supported" (`recall +0.0 pp, precision +0.0 pp`) vì s1 đạt recall = precision = 1,0 ở mọi lượt của cả hai arm (ô s1 = 10/10 sau gộp W1 và W2c). Phòng ghi: đủ N (10/10) **nhưng không tính p** vì SR-26 chưa có; H3 hạ xuống ước lượng (0,0 pp [0,0; 0,0]). Hơn nữa, vì recall và precision đều 1,0 ở mọi lượt nên phân phối suy biến: điều khoản dự phòng s1 (§2.7) sẽ đưa H3 về mô tả (điều khoản đó đặt cho pilot; dữ liệu pilot s1 chưa có, nên đây là quan sát, không phải thủ tục đã đăng ký).
- H7: `analyze.mjs` in "SUPPORTED" ở `W2a` (SD ratio 0,50, 4 bài) và "not supported" ở nơi khác, dù mỗi ô chỉ 3 lượt. §3.1 đòi r = 5 mỗi ô và ≥ 3 bài; chỉ s1 có r ≥ 5 ở cả hai arm. Phòng in "chưa đủ N" và không tính. Ngoài ra bài có `sd(A0) = 0` bị bỏ (NaN, `:93`), đúng như cảnh báo thiên lệch chọn của H7.
- H6 cần A1/A2: không có trong dữ liệu; cả hai công cụ báo thiếu.

### 4.5 `analyze.mjs` không có B-01; sinh số ngẫu nhiên khác
`analyze.mjs` dùng LCG hạt 12345 và CI 95 % trên hiệu điểm (pp); phòng dùng mulberry32 hạt 20261102, CI 90 % trên log-tỉ số và CI 95 % cho H5 (analyze không in CI cho H5). Vì vậy không so được CI từng con số, chỉ so được ước lượng điểm, đã khớp ở bảng §3. Điểm của B-01(c) bị trần: A0 = 1,000 ở mọi lượt, B7 gần 1,000 (t1 TB 0,9982); `analyze.mjs` cũng cho Δ = 0,0 pp ở 4/5 bài. Trần là lý do (c) "không kết luận", không phải thiếu dữ liệu.

### 4.6 USD
`analyze.mjs` đưa "Mean USD" 0,00 cho arm B (SR-02: `costUsd` của nhánh `calls.jsonl` luôn 0) và 0,18 cho A0-sonnet. Cột "Score per 1M weighted tokens" (B7 4,81 so với A0 11,81) chỉ phản ánh token. Phòng không dùng USD (preregistration §2.1).

### 4.7 Phép chính và ngưỡng khác nhau
`analyze.mjs` đếm H5 trên **mọi bài của thư mục** (đúng khi thư mục là một cặp cùng cửa sổ); `all/` trộn 18 bài với số lượt khác nhau, nên các dòng H7, H8, H10 trong `all/` không có nghĩa suy diễn và phòng không dùng.

## Kết luận đối chiếu
Không có sai khác số học giữa hai công cụ trên các đại lượng chung (H5, hiệu điểm theo bài, số lượt loại). Các khác biệt đều do phạm vi (gộp cửa sổ), phép kiểm (không TOST, nhãn theo ước lượng điểm) hoặc cỡ mẫu tối thiểu, và đã giải thích ở trên.
