# Danh sách số đã thêm hoặc sửa ở bài báo v0.7 (cho S6 kiểm)

> Phân loại: Nội bộ. Ẩn danh "dự án A" giữ nguyên. **Không số nào do S5 tính lại**: mọi số chép từ `v07-axes-threats-draft.md` (S3, nơi có `tệp:dòng`), `bench/vs-claude/results/axis2-guard/report.md` (S2) và `docs/research/context/nd356-2025-note.md` (S1). S5 chỉ đối chiếu nhanh ba nguồn bằng cách đọc: `e7-cto/report.md:20–22`, `:24`; `e8-parallel/report.md:21–23`; còn lại **chưa đối chiếu lại với tệp gốc** (việc của S6).
>
> Cách đọc: "Nhãn mã R" là nhãn trong Phụ lục A của `paper.md`. Đường dẫn `results/…` là `bench/vs-claude/results/…`; `prereg` là `docs/research/preregistration.md`. Vị trí = mục của `paper.md`. Số dòng của `paper.md` không ghi vì còn đổi.

## A. Số mới (Bảng 16: trục 1, §6.3.1; cũng xuất hiện ở §1 Tóm tắt VI/EN và §9)

| # | Số | Nhãn | Nguồn (tệp:dòng) | Ghi chú cho S6 |
|---|---|---|---|---|
| A1 | G-1: 0/239, CP [0; 1,5 %] | Mô tả | `results/g-mutation/RUNLOG.md:55`, `:92` | |
| A2 | G-2: 0/250 (đơn 0/70; nhanh 0/60; làn đơn 0/60) | Mô tả | `RUNLOG.md:56`, `:65`, `:92` | |
| A3 | G-3: 1.903/2.097 = 90,7 %, [84,3; 95,9]; A 91,5 %, C 91,4 % | Mô tả | `RUNLOG.md:57`, `:67`, `:118` | |
| A4 | G-3Δ: +0,8; CI [−5,4; +8,8]; p 0,74; CI cũ [−4,7; +7,4] | Xác nhận (không phân biệt được) | CI mới `docs/research/analysis/v43f-rerun.md:237`; điểm/p `RUNLOG.md:58` | **`RUNLOG.md:58` vẫn ghi CI cũ**; xử lý ở RUNLOG (S6, trong phạm vi được sửa). Nhãn do S3 đánh dấu [S6 kiểm nhãn] |
| A5 | G độ nhạy: 91,7 % [85,6; 96,6], Δ +0,9 [−4,2; +6,9], p 0,67; bỏ `t5-logq` Δ +0,8 [−6,2; +9,6] | Khám phá | `RUNLOG.md:132–135`; `docs/research/analysis/v43f-e8-t5logq.md:8` | |
| A6 | E4 B-12: b02 0/64, cto 0/64 (chưa ước lượng được); b10 1/64 = 1,6 % [0,0; 8,4] | Xác nhận ("chưa ước lượng được") | `results/gates-main/report-e4.md:9–11` | |
| A7 | E4 lượt sạch n = 65: b02 0/65 [0,0; 5,5]; b10 5/60 [2,8; 18,4]; cto 62/65 [87,1; 99,0] | Mô tả | `report-e4.md:21–23`, `:25`; prereg:1032 | |
| A8 | E4 B-16: 0/0, p 1,000; 23/64 so 1/64; USD ×1,49 | H-O1 Xác nhận; bảng chặn Khám phá | `report-e4.md:29–31`; prereg:1034 | |
| A9 | E7 recall R1/R2/R3: 63/64 = 98,4 % [91,6; 100,0]; 55/64 = 85,9 % [75,0; 93,4]; 61/64 = 95,3 % [86,9; 99,0]; bootstrap [93,2; 100,0], [69,8; 100,0], [88,6; 100,0] | Mô tả | `results/e7-cto/report.md:20–22`, `:79` | S5 đã đọc dòng 20–22: khớp |
| A10 | E7 chặn nhầm: 27/64 = 42,2 % [29,9; 55,2]; 4/64 = 6,3 % [1,7; 15,2]; 30/64 = 46,9 % [34,3; 59,8] | Mô tả | `report.md:20–22`, `:73` | S5 đã đọc dòng 20–22: khớp |
| A11 | E7 chính: chỉ R1 3, chỉ R3 1, p = 0,625; hiệu +3,1 [−5,1; 11,4]; 4 cặp bất đồng | Mô tả | `report.md:24`, `:26`, `:72`, `:80`; prereg:1146, 1148 | S5 đã đọc dòng 24: khớp |
| A12 | E7 độ nhạy: bỏ `t5-logq` n = 55 3/1 p 0,625 hiệu +3,6 [−5,7; 13,1]; như đã ghi lúc đầu 3/3 p 1,000; bỏ mục phân loại lại n = 62 3/1 p 0,625; R3 chạm trần 3/1 p 0,625 | Mô tả | `report.md:35–38`; prereg:1172 | |
| A13 | E7 không đọc được: R1 0, R2 13, R3 1; R2 coi là chặn 61/64 = 95,3 %, chặn nhầm 11/64 = 17,2 % | Mô tả | `report.md:42`, `:65` | |
| A14 | E7 Youden J R1 0,56; R2 0,80; R3 0,48; USD ≈ ×2,6; R1 so R2 trên mục đúng 24 so 1 | Khám phá | `report.md:74` | Báo cáo ghi "mô tả"; S3 đề xuất [Khám phá]; **S6 kiểm nhãn** |
| A15 | E7 theo bài (8 bài): bất đồng ở `c3-shop-bugs`, `c5-tickets-api`, `t2-orders` (R1 hơn), `t3-api` (R3 hơn); chặn nhầm dồn ở `c2-burst-alert`, `t3-api`, `t2-orders`, `t5-logq` | Mô tả | `report.md:48–55`, `:75` | |
| A16 | E7: 16 cặp phân loại lại sau khi thấy kết quả; 16/128 mục; 2 cặp R3 chạm trần (`0bb51824b9`, `e59884e561`); 403 ở 09:47–09:51 và 10:17–10:20 UTC; phát hiện 10:37 (RUNLOG không ghi giờ ghim; S6 bỏ "10:43" ở 14/11) | Mô tả / đe dọa (v) | `report.md:26`, `:35–42`, `:65–68`, `:79–83`; prereg:1163–1173; `results/e7-cto/RUNLOG.md:89–91`, `:107–113` | Giờ và mã lượt chép từ S3 §8 (v), chưa đối chiếu với RUNLOG |

## B. Số mới (Bảng 17: trục 2, §6.3.2; cũng ở §1, §9)

| # | Số | Nhãn | Nguồn | Ghi chú cho S6 |
|---|---|---|---|---|
| B1 | RedCode-Exec: 600 mục Bash → 82 lệnh một dòng, đều "nên chặn"; commit `664e479` (đủ: `664e4793…`); CC BY 4.0 | Mô tả | `results/axis2-guard/report.md:11–13` | Dòng 12 quy ca; dòng 13 bộ dự phòng không dùng |
| B2 | `git-read`: 82/82 = 100 %, CP [95,6; 100] % | Mô tả | `report.md:21–24` | Diễn giải "chặn được phần lớn ca…" |
| B3 | `full`: 30/82 = 36,6 %, [26,2; 48,0] % | Mô tả | `report.md:21–24` | Diễn giải "không phải rào chính… (sandbox)" |
| B4 | Theo rule: git-read `not-read-only` 52, `deny-list` 30; full `deny-list` 30, lọt 52 | Mô tả | `report.md:26–33` | |
| B5 | Theo nhóm: nhóm 2 30/30 và 0/30; nhóm 4 2/2 và 0/2; nhóm 8 20/20 và 0/20; nhóm 9 30/30 và 30/30 | Mô tả | `report.md:37–42` | |
| B6 | Kiểm n = 72: 1 − 0,025^(1/72) = 4,994 %; 0/72 → 4,994 %; 0/71 → 5,063 % | Mô tả | `report.md:44` | S2 kiểm bằng script; S5 chỉ chép |
| B7 | Commit khóa danh sách `74f11d99`; commit kết quả `6dac52c8`; giữ nguyên, không squash | — | `results/axis2-guard/RUNLOG.md` (R32); `git log` | S6 kiểm sha còn trong lịch sử sau khi gộp |
| B8 | Phần (a): câu bắt buộc "chặn nhầm trên lệnh thật chưa đo, chờ giám đốc chỉ định hai người gán nhãn" (§1 VI/EN, §2, §6.3.2, §9) | — | prereg:1196–1208 | Mốc n = 72 ở prereg:1207; ngưỡng (a) ở :1208 |
| B9 | Ngưỡng (b): ≥ 90 % cận dưới; < 50 % cận trên; còn lại "chưa kết luận" | — | prereg:1217; quy ca :1215 | |

## C. Số mới (Bảng 18: trục 3, §6.3.3; cũng ở §1, §7.4, §9)

| # | Số | Nhãn | Nguồn | Ghi chú cho S6 |
|---|---|---|---|---|
| C1 | P-1: 42/54 = 77,8 % [64,4; 88,0]; hệ số chồng trung vị 1,32 (IQR 1,17–1,63); 53 nhiệm vụ, 6 dự án; 53/54 lượt `isolation: worktree`; 21/54 lượt Phòng NC | Mô tả | `results/p-parallel/RUNLOG.md:25–27`, `:36`, `:49` | Không đưa tệp từng lượt vào bài |
| C2 | P-2: 375 phút, 27,5 % (cận trên); đường găng 771 so 717 phút (+7,5 %); Dev 516 so 463; NC 254 so 253 | Mô tả; đường găng Khám phá | `RUNLOG.md:28`, `:37`, `:55–60` | |
| C3 | P-3: 6/213 = 2,8 % [1,0; 6,0]; 0 còn xung đột; đỏ mới 2/47 = 4,3 % [0,5; 14,5]; 11/47 lệnh đỏ lúc kết thúc; cả 6 xung đột ở Phòng Dev | Mô tả; "đỏ mới" Khám phá | `RUNLOG.md:30–31`, `:33`, `:46`, `:48–49`, `:5` | |
| C4 | E8: `wallSecTask` 0,520 [0,488; 0,552], p ≤ 0,0001, 6/6 ở 3 bài; `wallSec` 0,530 [0,498; 0,562]; token 1,008 [0,942; 1,075], p 0,84 | Xác nhận (thời gian); Mô tả (token) | `results/e8-parallel/report.md:21–23`, `:25–27`, `:62` | S5 đã đọc dòng 21–23: khớp. Dòng 26 của báo cáo viết "Không thấy tốn thêm token"; bài dùng "không thấy thay đổi token phát hiện được (CI chứa 1)" theo danh sách câu cấm #10 |
| C5 | E8 cấu hình: chạy chồng 17/18 và 0/18; chia < 2 hạng mục 0; cổng cuối 0/18 | Mô tả | `report.md:33–35` | |
| C6 | E8 gộp: B6w4 70 gộp, 1 xung đột; B6w1 70 gộp, 0 xung đột | Mô tả | `report.md:37–40` | |
| C7 | E8 chất lượng: 0,995 / 0,990 / 1,000; pass 13/18, 15/18, 17/18 | Mô tả | `report.md:33–35`, `:56` | |
| C8 | E8 so A0: thời gian 0,59 / 2,08 / 1,36; token 1,41 / 3,95 / 2,11 (`l1-modules` / `t2-orders` / `t3-api`) | Mô tả; theo bài Khám phá | `report.md:41–49`, `:55` | Nhãn **S6 kiểm** |
| C9 | E8 giới hạn: σ_ln 0,178; máy chủ A cổng 7428 `maxParallel` 4, B cổng 7429 `maxParallel` 1; CLI 2.1.318; hạn mức chờ 30 phút sau 12:45; `pauseCount` 0; CI ±0,03 | Mô tả | `report.md:5`, `:50`, `:60–62`; `results/e8-parallel/RUNLOG.md:5–6` | |

## D. Số mới (Bảng 19: kết quả thêm, §6.4; cũng ở §1, §7.4, §9)

| # | Số | Nhãn | Nguồn | Ghi chú cho S6 |
|---|---|---|---|---|
| D1 | E5′: token R̂ 0,722 [0,668; 0,790] (CI 90 %); thời gian 0,717 [0,667; 0,779]; điểm Δ −0,000; pass 20/20 và 19/20; USD 56,13 và 40,71; 20/20 lượt | Token Xác nhận; thời gian, điểm Mô tả | `results/b15f-main/report.md:9–11`, `:15–16`, `:51`; prereg:1040, 1045 | |
| D2 | E6: B0 − A1 −0,0 [−0,3; +0,1]; B0 − A2 −0,1 [−0,3; +0,0]; H6 "insufficient data" | Mô tả | `results/h6-3e/report.md:16`, `:23`, `:46–48`; `report-h6-sensitivity.md:4–6`, `:20–22`; prereg:1036–1039 | |
| D3 | B-14: N = 96; R̂ 0,999 [0,886; 1,127]; p 0,983; không phân biệt được; commit `0d216eb` | Xác nhận | `results/b14-step2/report.md:17–20`, `:86–88` | |
| D4 | B-14 power: ≈ 0,38 (10 %), ≈ 0,13 (5 %); σ 0,312 so 0,182; mức phát hiện ≈ 16,3 %; ≈ 276 lượt (46 mỗi ô); CI tương thích tiết kiệm ≈ 11 % hoặc tốn thêm ≈ 13 % | Mô tả | `report.md:22`, `:24–29` | "≈ 11 %" và "≈ 13 %" suy từ CI, S6 kiểm |
| D5 | B-14 độ nhạy: 0,988 [0,872; 1,117] p 0,841; n = 71: 0,974 [0,841; 1,134] p 0,733; bỏ `t4-perf` 1,008 | Mô tả | `report.md:35–37`, `:43–45`, `:47` | |
| D6 | B-14 phụ: pass 97,9 % và 91,7 % | Khám phá | `report.md:76–82` | |

## E. Đoạn chữ mới hoặc sửa (không chỉ là số)

| # | Chỗ | Thay đổi | Cần S6 |
|---|---|---|---|
| E1 | Đầu bài (banner) | Thêm v0.7; giữ nguyên lịch sử v0.6 trở về trước | Khớp CHANGELOG |
| E2 | §1 VI và EN | Thêm đoạn "ba trục"; đổi câu hàm ý về bài lớn (H6 không đủ dữ liệu, E8 chỉ `l1-modules`) | Số = Mục A–D |
| E3 | §2 | Thêm đoạn "Đóng góp dựng quanh ba trục"; cập nhật "Cấu trúc bài" | |
| E4 | §4.3(d) | Mới: ánh xạ ba trục vào cơ chế; nêu CLI 2.1.318 và commit `0d216eb` | `1568774`, `7ff4b9c` ở §8.3 chép từ S3/prereg, chưa kiểm sha |
| E5 | §6.1 sau Bảng 10 | Thêm ghi chú cập nhật v0.7 về H6 | |
| E6 | §6.3, §6.4 | Mới (Bảng 16–19) | |
| E7 | §7.3 (i), (ii); §7.4 | Cập nhật vì E6, E5′, B-14 bước 2 đã chạy; thêm dữ kiện E8 | |
| E8 | §8.3 | Mới: sáu đe dọa (i)–(vi) và giới hạn chung | Chỉ có trong nguồn S3 |
| E9 | §9 | Thêm bốn hàng (trục 1, 2, 3, kết quả thêm); sửa RQ3b; sửa (b), (c) của Hàm ý | |
| E10 | §10, Phụ lục A, Khai báo AI | Thêm 2 tài liệu tham khảo (Chính phủ 2025; Kế toán An Pha 2026); R20–R32; đoạn v0.7 | |
| E11 | Khung pháp lý (§6.3.2, cuối) | Nghị định 356/2025/NĐ-CP, hiệu lực 01/01/2026; Điều 42 k2, Điều 8 k3, Điều 29 k1, Điều 19, Điều 17–18; **[CHƯA KIỂM CHỨNG]** | Giữ nhãn đến khi S1 đọc được bản gốc. Trong `paper.md` v0.6 **không có** chỗ nào nhắc Nghị định 13/2023; đoạn này là mới, nên "thay mọi chỗ nhắc" thành "thêm khung pháp lý mới" |

## F. Chỗ S5 không làm được hoặc cần chú ý

- Không đối chiếu từng số với tệp gốc ngoài ba nguồn đã nêu ở đầu; S6 phải kiểm.
- `docs/research` ngoài `paper.md`: S1 xác nhận không có chỗ nhắc Nghị định 13 cần sửa (`gold-sheet.csv:36` là dữ liệu quan sát, không sửa); không tệp nào khác bị S5 sửa.
- `facts.json`, `CHANGELOG.md`, `preregistration.md` không sửa (việc của S6).
- Danh sách câu cấm (S3 mục c): đã quét `paper.md` bằng Grep cho "an toàn", "bảo vệ được", "ngăn được", "không có hiệu ứng", "vô hiệu", "nhanh hơn agent đơn", "không tốn thêm", "chặn nhầm thấp", "Nghị định 13". Các lần còn lại đều nằm trong câu phủ định, tên trục hoặc tên RQ5 cũ (không phải khẳng định). Cụm "tương đương" còn nhiều ở phần W1–W5 cũ (kiểm TOST), đúng nghĩa thống kê.
- Ba lệnh kiểm của dự án (`token-analysis --check`, `stats.test.mjs`, `consistency-check.mjs`) chưa chạy trong hạng mục này (vai trò không chạy được `node`); `consistency-check.mjs` có thể cần chạy lại vì bài thêm số mới.
