# Bản nháp v0.7: bảng ba trục, §8 đe dọa (i)–(vi), danh sách câu cấm

> **Phạm vi:** S3 của T-20261114-133920-30b (@methodologist). Bản nháp cho S5 (viết `paper.md`) và S6 (kiểm số). **Không phải văn bản bài báo.** Phân loại dữ liệu: Nội bộ. Ẩn danh "dự án A" giữ nguyên. Không có số nào ở đây được tính lại; mọi số đọc từ tệp nguồn ghi ở cột cuối. Không gọi LLM, không chạy benchmark.
>
> **Cách ghi nguồn.** `tệp:dòng` là số dòng của chính tệp đó ở nhánh này (đã đếm lại từng tệp, không đếm cộng dồn). Đường dẫn `results/…` là `bench/vs-claude/results/…`; `prereg` là `docs/research/preregistration.md`.
>
> **Nhãn** (theo prereg §2.4 dòng 84–91 và §5 dòng 305–313; S3 áp, S6 đối chiếu lại):
> - **[Xác nhận]**: phép kiểm chính **đăng ký trước**, chạy đúng đăng ký. Nhãn nói về *tư cách của phép kiểm*, không nói kết quả dương: B-14 là [Xác nhận] với phán quyết "không phân biệt được".
> - **[Mô tả]**: đếm, ước lượng kèm CI, hoặc p chỉ mang tính mô tả (ít cặp bất đồng, không hiệu chỉnh đa phép thử, nằm ngoài họ Holm).
> - **[Khám phá]**: ngoài đăng ký hoặc chọn sau khi thấy dữ liệu.
>
> Chỗ nào S3 không chắc nhãn thì ghi **[S6 kiểm nhãn]**.

---

## (a) Bảng ba trục

### Trục 1: nghiệm nhận bằng kiểm chứng thật

| Số đo | Nhãn | Câu giới hạn (dùng nguyên câu) | Nguồn |
|---|---|---|---|
| **G-1** chặn nhầm của `npm test`: 0/239 sản phẩm đúng có lệnh đỏ, CP 95 % [0; 1,5 %] | [Mô tả] | "Trên study-cloud, 10 bài tổng hợp (9 bài đủ điều kiện đột biến); đo trạng thái cuối, nên không nói được về cổng đã chặn lượt nào trước khi giao." | `results/g-mutation/RUNLOG.md:55`, `:92` |
| **G-2** giao khi lệnh còn đỏ: 0/250 lượt (agent đơn 0/70, làn nhanh 0/60, làn đơn 0/60) | [Mô tả] | "Cổng bắt buộc không có gì để chặn thêm trên bộ bài này." Không viết thành "cổng ngăn được". | `RUNLOG.md:56`, `:65`, `:92` |
| **G-3** recall của cổng trên lỗi cài bằng máy: 1 903/2 097 = 90,7 % (bootstrap hai tầng [84,3; 95,9]); A 91,5 %, C 91,4 % | [Mô tả] | "Đột biến không đồng nhất với lỗi tự nhiên; đơn vị độc lập là 9 bài; G-3 đo độ mạnh của bộ test, không đo CTO." Bổ sung G-5 (Khám phá): chỉ test của starter 49,2 %, nên recall ~91 % không chủ yếu nhờ test tác giả bài. | `RUNLOG.md:57`, `:67`, `:118` |
| **G-3Δ** C − A: +0,8 điểm %, **CI [−5,4; +8,8]** (bản sau BRIEF-19 S1), p hoán vị 0,74 | [Xác nhận] (đã đăng ký ở V4-3f) phán quyết **không phân biệt được** **[S6 kiểm nhãn]** | "Không phân biệt được" ≠ "tương đương". Dùng CI mới; CI cũ [−4,7; +7,4] chỉ nêu kèm sai lệch D-G1. | CI mới: `docs/research/analysis/v43f-rerun.md:237` (và `analysis/v43f-e8-t5logq/g3-table.txt:3`). Điểm và p: `RUNLOG.md:58`. **Lưu ý cho S6:** `RUNLOG.md:58` của g-mutation vẫn ghi CI cũ [−4,7; +7,4]. |
| **G độ nhạy** có `t4-perf` (G-c): 91,7 % [85,6; 96,6], Δ +0,9 [−4,2; +6,9], p 0,67; **G độ nhạy `t5-logq`**: bỏ `t5-logq` Δ +0,8 [−6,2; +9,6] | [Khám phá] | "Không đổi kết luận." Số `t5-logq` lấy ở `analysis/v43f-e8-t5logq.md:8`, không phải RUNLOG. | `RUNLOG.md:132`–`:135`; `analysis/v43f-e8-t5logq.md:8` |
| **E4, B-12** recall từng cổng: b02 0/64 và cto 0/64 lượt dương thật → **chưa ước lượng được** (< 10 dương); b10 chặn 1/64 = 1,6 % [0,0; 8,4] | [Xác nhận] cho "chưa ước lượng được" | "Không có recall của b02 và cto để báo." | `results/gates-main/report-e4.md:9`–`:11` |
| **E4, lượt sạch** (n = 65): b02 0/65 [0,0; 5,5]; b10 5/60 [2,8; 18,4]; cto 62/65 [87,1; 99,0] | [Mô tả] | "n < 72 nên không tuyên bố '≤ 5 %'"; cto chặn = phán quyết "chưa đạt", nhiệm vụ vẫn giao. Lượt sạch dùng 40 lượt E5′ thay E5 (A1). | `report-e4.md:21`–`:23`, `:25`; prereg:1032 |
| **E4, B-16** (Opus so Sonnet, CTO): H-O1 0/0 lượt có lỗi nguyên, p = 1,000, **chưa ước lượng được**; chặn trên lượt test ẩn đạt 23/64 so 1/64 | H-O1 [Xác nhận], bảng chặn **[Khám phá]** (A2) | "Bảng chặn không vào kết luận chính." H-O2: USD ×1,49, mô tả. | `report-e4.md:29`–`:31`; prereg:1034 |
| **E7 recall** R1/R2/R3: 63/64 = 98,4 % [91,6; 100,0]; 55/64 = 85,9 % [75,0; 93,4]; 61/64 = 95,3 % [86,9; 99,0]. Bootstrap theo bài: [93,2; 100,0]; [69,8; 100,0]; [88,6; 100,0] | [Mô tả] | "Lỗi cài bằng máy, được chọn vì lọt `npm test`; 8 bài; một nhà cung cấp mô hình; CLI 2.1.318." | `results/e7-cto/report.md:20`–`:22`, `:79` |
| **E7 chặn nhầm** R1/R2/R3: 27/64 = 42,2 % [29,9; 55,2]; 4/64 = 6,3 % [1,7; 15,2]; 30/64 = 46,9 % [34,3; 59,8] | [Mô tả] | "Cứ khoảng 2 sản phẩm đúng thì 1 bị trả lại (Sonnet). Recall cao đi kèm chặn nhầm gần một nửa sản phẩm đúng, chưa chứng minh phân biệt tốt." | `report.md:20`–`:22`, `:73` |
| **E7 phép kiểm chính** McNemar R1 so R3, 64 mục lỗi: chỉ R1 chặn 3, chỉ R3 chặn 1, **p = 0,625**; hiệu R1 − R3 = +3,1 điểm % [−5,1; 11,4] (bootstrap hai tầng theo bài) | [Mô tả] (4 cặp bất đồng < 10) | (1) "**p chỉ mang tính mô tả vì 4 cặp bất đồng < 10.**" (2) "McNemar và bootstrap theo bài cho cùng cách đọc (điều kiện K3 số 1): chưa đủ để nói lớp CCoding giúp bắt lỗi tốt hơn, cũng chưa đủ để nói hai bên tương đương." (3) "**R1 − R3 là hiệu của hồ sơ CTO cộng lớp vận hành CCoding**, không tách riêng được phần hồ sơ." | `report.md:24`, `:26`, `:72`, `:80`; prereg:1146, 1148 |
| **E7 bảng theo bài** (8 bài): R1 − R3 chỉ bất đồng ở `c3-shop-bugs`, `c5-tickets-api`, `t2-orders` (R1 hơn) và `t3-api` (R3 hơn) | [Mô tả] | "Chặn nhầm dồn ở `c2-burst-alert`, `t3-api`, `t2-orders`, `t5-logq`." | `report.md:48`–`:55`, `:75` |
| **E7 độ nhạy** (đều **cùng cách đọc**): coi "không đọc được" là chặn: chỉ R1 3 / chỉ R3 1, p 0,625; **bỏ `t5-logq`** (n = 55): 3 / 1, p 0,625, hiệu +3,6 [−5,7; 13,1]; **như đã ghi lúc đầu** (16 cặp): 3 / 3, p 1,000; bỏ mục bị phân loại lại (n = 62): 3 / 1, p 0,625; R3 chạm trần (2 cặp): 3 / 1, p 0,625 | [Mô tả] | "Mọi kết luận phải đứng ở cả ba cách tính (chính / như đã ghi lúc đầu / bỏ mục bị phân loại lại); không đứng thì ghi 'không kết luận'. Ở đây cả ba cho cùng cách đọc." | `report.md:35`–`:38`; prereg:1172 |
| **E7 recall theo số lần test ẩn trượt khi kiểm nhãn** | [Mô tả] | Cả 64 mục lỗi trượt 3/3 nên bảng suy biến (một hàng); không phải bằng chứng về độ khó. | `report.md:57`–`:61`, `:7` |
| **E7 không đọc được kết luận**: R1 0, R2 13, R3 1; nếu R2 coi là chặn: 61/64 = 95,3 % và chặn nhầm 11/64 = 17,2 % | [Mô tả] (lệch giữa arm; đã tách nguyên nhân theo điều kiện 3) | "Trần 6 lượt bất lợi cho Opus." | `report.md:42`, `:65` |
| **E7 Youden J** R1 0,56; R2 0,80; R3 0,48; USD ≈ ×2,6 (R2/R1) | [Khám phá] **[S6 kiểm nhãn]**; báo cáo ghi "mô tả" | "Chọn sau khi thấy kết quả; R1 so R2 trên mục đúng (24 so 1) không hiệu chỉnh đa phép thử." | `report.md:74` |

### Trục 2: khung quản trị

| Số đo | Nhãn | Câu giới hạn | Nguồn |
|---|---|---|---|
| **Hiện trạng:** chính sách tĩnh `guardDecision` (`claude-guard.ts`; hai tầng `shell: git-read` và `full`) đã có; **chưa có số đo nào** *(Ghi chú 14/11, K4 #9: hàng này và hàng (b) dưới đây là bản trước khi đo; đã thay bằng Bảng 17 của paper.md v0.7.1, R25:21–24.)* | — | "Trục 2 hiện chưa có số đo." Hàm đo, hai tầng, `deny: []`: prereg:1192. | prereg:1190, 1192 |
| **Đã đăng ký trước** (13/11, BRIEF-19 K1b): (a) chặn nhầm trên lệnh thật; (b) chặn đúng trên bộ ngoài | — (không phải kết quả) | Đăng ký trước khi tính số nào; giờ chính thức là giờ commit chứa mục. | prereg:1188–1238 |
| **(a) chặn nhầm trên lệnh thật agent đã chạy** | **chưa đo** | **Câu bắt buộc, nguyên văn: "chặn nhầm trên lệnh thật chưa đo, chờ giám đốc chỉ định hai người gán nhãn."** Nếu mẫu số < 72: chỉ báo n và CI, không viết "chặn nhầm thấp". Không dùng chữ "an toàn" hay "bảo vệ được" cho (a). | prereg:1196–1208 (mốc n = 72 ở :1207; ngưỡng ở :1208; người gán nhãn ở :1204) |
| **(b) chặn đúng trên RedCode-Exec** (và bộ dự phòng nếu quy được < 30 ca): **[GIỮ CHỖ]** | **[GIỮ CHỖ]**: S5 điền từ `results/axis2-guard/report.md` của S2. Nếu S2 dừng: viết "chưa đo" kèm lý do, không thay bằng bộ ngoài danh sách. | Báo n, CP 95 % theo bộ, tầng, quy tắc. Ngưỡng đã khóa: cận dưới ≥ 90 % → "chặn được phần lớn ca của bộ này ở tầng chính sách tĩnh"; cận trên < 50 % → "bộ kiểm không phải rào chính cho loại ca này, cần lớp khác (sandbox)"; còn lại "chưa kết luận". "Phép đo không nói gì về sandbox WSL2/native." Ca lọt qua chỉ liệt kê, không sửa chính sách cùng lần đo. | prereg:1212–1217 (ngưỡng :1217; quy ca :1215; điều kiện kích hoạt :1212) |
| Kiểm n = 72 | [Mô tả] (S2 ghi) | Giá trị 1 − 0,025^(1/72) do S2 kiểm bằng script; S5 chỉ chép kết quả của S2. | prereg:1207 |

> Phần (a) của trục 2 **không làm** trong gói này. Mọi tài liệu dùng đúng câu bắt buộc ở trên.

### Trục 3: song song an toàn

| Số đo | Nhãn | Câu giới hạn | Nguồn |
|---|---|---|---|
| **P-1** lượt có ≥ 2 hạng mục chạy cùng lúc: 42/54 = 77,8 % [64,4; 88,0]; hệ số chồng trung vị 1,32 (IQR 1,17–1,63) | [Mô tả] | "Dữ liệu quan sát từ 53 nhiệm vụ của 6 dự án trên server chính, không ngẫu nhiên hóa." 53/54 lượt ở dự án `isolation: worktree`; 21/54 lượt của Phòng Nghiên cứu nơi song song không cần worktree. | `results/p-parallel/RUNLOG.md:25`–`:27`, `:36`, `:49` |
| **P-2** tiết kiệm pha thực thi: 375 phút, 27,5 % (**cận trên**); **đường găng** ở 42 lượt chạy chồng: thời gian thực **771 so 717 phút** (+7,5 %); Dev 516 so 463; Nghiên cứu 254 so 253 | [Mô tả]; số đường găng ngoài đăng ký, [Khám phá] | "27,5 % là cận trên, chưa so với chạy đơn; phần so sánh đó là E8." "Lợi ích còn lại bị giới hạn bởi phụ thuộc giữa hạng mục, không bởi lịch chạy." Chạy lại 13/11 trùng P-1/P-2/P-3 (số 771/717 thay ví dụ từng lượt). | `RUNLOG.md:28`, `:37`, `:55`–`:60` |
| **P-3** gộp worktree: 6/213 lần xung đột = 2,8 % [1,0; 6,0]; 0 hạng mục còn xung đột; đỏ mới do nhiệm vụ 2/47 = 4,3 % [0,5; 14,5] (khi báo phải kèm 11/47 lệnh đỏ lúc kết thúc) | [Mô tả]; "đỏ mới" thêm sau khi thấy 11/47 (P-a) → [Khám phá] | "Cả 6 xung đột đều ở Phòng Dev." Không có đối chứng chạy đơn, không có token. Tệp từng lượt không vào repo. | `RUNLOG.md:30`–`:31`, `:33`, `:46`, `:48`–`:49`, `:5` |
| **E8 chính** B6w4/B6w1: exp(Δ) `wallSecTask` **0,520 [0,488; 0,552]**, p ≤ 0,0001, 6/6 mỗi ô ở 3 bài; `wallSec` 0,530 [0,498; 0,562]; token 1,008 [0,942; 1,075], p 0,84 | [Xác nhận] cho phép kiểm thời gian; token [Mô tả] (CI chứa 1, không viết "không tốn thêm token" như bằng chứng bằng nhau) | "p là giá trị nhỏ nhất đo được với số hoán vị đã dùng (Monte Carlo), nên chỉ biết p ≤ 0,0001." Chỉ suy cho 3 bài (`l1-modules`, `t2-orders`, `t3-api`), làn nhanh, CLI 2.1.318, một máy Windows. | `results/e8-parallel/report.md:21`–`:23`, `:25`–`:27`, `:62` |
| **E8 kiểm cấu hình** (điều kiện 5): B6w4 chạy chồng 17/18; B6w1 0/18; lượt chia < 2 hạng mục: 0 ở cả hai arm; cổng cuối đỏ/xanh: 0/18 ở cả hai | [Mô tả] | "1 lượt B6w4 không chạy chồng." | `report.md:33`–`:35` |
| **E8 gộp worktree** (`extract-*.json`): B6w4 70 lần gộp, 1 tin nhắn xung đột, không ca còn xung đột; B6w1 70 gộp, 0 xung đột | [Mô tả] | "Gộp có 1 xung đột trên 70." Không phép kiểm. | `report.md:37`–`:40` |
| **E8 chất lượng** điểm test ẩn TB B6w4 0,995 / B6w1 0,990 / A0 1,000; pass 13/18, 15/18, 17/18 | [Mô tả] | "Chất lượng không đổi (mô tả)" chỉ khi kèm n nhỏ, không phép kiểm; pass B6w4 thấp hơn 2 lượt cần theo dõi. | `report.md:33`–`:35`, `:56` |
| **E8 so A0-sonnet** (mốc theo bài, mô tả): B6w4/A0 thời gian 0,59 / 2,08 / 1,36 (`l1-modules` / `t2-orders` / `t3-api`); token 1,41 / 3,95 / 2,11 | [Mô tả] / [Khám phá] **[S6 kiểm nhãn]** | "**Chỉ `l1-modules` nhanh hơn agent đơn**; ở hai bài còn lại CCoding chậm hơn và tốn 2–4 lần token." Cấm "nhanh hơn agent đơn" nói chung. A0 tính `wallSec`, không phải `wallSecTask`. | `report.md:41`–`:49`, `:55` |
| **Giới hạn E8 (điều kiện 4–6 của K3)** | — | (4) "σ_ln 0,178 lấy từ arm một agent; ngoại suy sang B6w1/B6w4 là giả định; nhiều ô σ = 0 do `wallSec` lượng tử theo vòng hỏi 10 giây; hiệu quan sát lớn hơn nhiều độ dao động nên không đổi kết luận." (5) "17/18 lượt B6w4 chạy chồng, 0/18 B6w1; 0 lượt chia dưới 2 hạng mục." (6) "Server A và B lẫn với arm (mỗi arm một server), cùng mã, cùng `dist`, cùng máy, xen kẽ theo lịch; không loại hẳn khác biệt do server." | `report.md:60`–`:62`, `:5`; `results/e8-parallel/RUNLOG.md:5`; prereg:1149–1151 |
| **Câu về bench cũ** | — | **"Bench W1–W5 đo chi phí chia việc mà không có song song"** (harness `isolation: none` ⇒ `parallelWorktrees()` false). Kết quả chi phí W1–W5 (B-01) **giữ nguyên là kết quả chính**; S5 chép số từ nguồn đã có, S3 không đưa số. | `results/e8-parallel/report.md:54`; prereg:975 |

### Kết quả thêm (không thuộc ba trục chính; xếp ở phần "Thêm kết quả")

| Số đo | Nhãn | Câu giới hạn | Nguồn |
|---|---|---|---|
| **E5′** (bỏ họp, B1F so B0F; l1-modules, l2-chain; n = 20/20): token R̂ **0,722 [0,668; 0,790]** (CI 90 %); thời gian R̂ 0,717 [0,667; 0,779]; điểm test ẩn Δ −0,000, không phân biệt được; pass 20/20 và 19/20; USD 56,13 và 40,71 | [Xác nhận] token (chính, CI 90 %, "không p theo (6)"); thời gian và điểm [Mô tả] | "Hai bài nên CI rộng (không tuyên bố độ chính xác 0,218 của phương án A)." Không loại lượt nào theo (8); CI lệch 1 hạng phân vị (D-E5-1). | `results/b15f-main/report.md:9`–`:11`, `:15`–`:16`, `:51`; prereg:1040, 1045 |
| **E6 (H6)** B0 − A1 = −0,0 pp [−0,3; +0,1], B0 − A2 = −0,1 pp [−0,3; +0,0]; mọi bài (mô tả). Verdict H6: **insufficient data**; họ Holm rỗng | [Mô tả] (không giả thuyết xác nhận) | "Điểm trần (1,00 ở cả arm); bài có sàn null cao (`t2-orders`, `t4-perf`) không phân biệt được; cờ 'nhạy với bài' do Δ đổi phía ở độ lớn < 0,1 điểm %." Không viết "tương đương" hay "CCoding không hơn". | `results/h6-3e/report.md:16`, `:23`, `:46`–`:48`; `report-h6-sensitivity.md:4`–`:6`, `:20`–`:22`; prereg:1036–1039 |
| **B-14 bước 2** (`stablePrefix`): N = 96; R̂ **0,999 [0,886; 1,127]**, p 0,983 → **không phân biệt được**. Power ở mức 10 % ≈ **0,38** (5 %: ≈ 0,13); σ quan sát 0,312 so kế hoạch 0,182; mức nhỏ nhất phát hiện (power 0,8) ≈ 16,3 %; muốn trả lời ở 10 % cần ≈ **276 lượt** (46 mỗi ô) | [Xác nhận] (phán quyết "không phân biệt được") | "Khoảng tin cậy tương thích với tiết kiệm tới ~11 % hoặc tốn thêm tới ~13 %. 'Không phân biệt được' không phải bằng chứng là không có hiệu ứng." Chỉ áp cho 3 bài, arm B7, CLI 2.1.318, commit `0d216eb`; `stablePrefix` giữ tắt. | `results/b14-step2/report.md:17`–`:20`, `:22`, `:24`–`:29`, `:86`–`:88` |
| **B-14 bảng độ nhạy**: bỏ `off × t3-api × r1`: 0,988 [0,872; 1,117], p 0,841; cách gom bản đầu (n = 71): 0,974 [0,841; 1,134], p 0,733; bỏ `t4-perf`: 1,008, cờ "nhạy với bài" | [Mô tả] | Cả ba cùng phán quyết; cờ bật vì T ≈ −0,001 nên đổi phía rất dễ, vị trí CI so với 1 không đổi. | `b14-step2/report.md:35`–`:37`, `:43`–`:45`, `:47` |
| B-14 phụ: pass 97,9 % (tắt) so 91,7 % (bật); h, tỉ lệ ghi cache | [Khám phá] (không đăng ký kiểm) | "Không đủ để nói công tắc làm giảm chất lượng." | `b14-step2/report.md:76`–`:82` |

---

## (b) §8 (nháp): Đe dọa tính hợp lệ

> Văn phong dành cho S5 chuyển thành văn xuôi. Mỗi mục: **điều gì**, **vì sao quan trọng**, **hướng ảnh hưởng nếu biết**, **việc đã làm**. Nội dung (i)–(vi) lấy từ `docs/research/BRIEF-20.md:31` (K1, gạch "§8 (đe dọa)"); chi tiết thêm từ các nguồn ghi kèm.

**(i) Harness bench `isolation: none` khác cấu hình vận hành.** Harness tạo dự án với `isolation: 'none'` từ commit đầu `1568774`, nên `parallelWorktrees()` trả false: các arm CCoding của W1–W5 chạy không song song, khác cấu hình vận hành (P: 53/54 lượt ở dự án `isolation: worktree`). *Hướng:* chi phí chia việc ở W1–W5 là chi phí không có song song; thời gian vận hành thật có thể thấp hơn. *Việc đã làm:* E8 bật `isolation: worktree` cho B6w4/B6w1 và đo riêng. *Giới hạn còn lại:* E8 chỉ 3 bài. Nguồn: prereg:975; `p-parallel/RUNLOG.md:25`; `e8-parallel/report.md:54`.

**(ii) Đường xác thực của arm `claude -p` trước 13/11 không được ghi.** Trước 13/11, arm `claude -p` do harness gọi (pilot1, b7prime, large-pilot, h6-3e; 2–4/11) nhận nguyên môi trường; máy chạy có `ANTHROPIC_API_KEY` cấp người dùng, nên khả năng arm này dùng khóa còn arm CCoding dùng phiên đăng nhập claude.ai (hai đường khác nhau) **không loại được**; các dòng cũ không có `authSource`. *Bằng chứng gián tiếp (không phải trực tiếp):* A2 của h6-3e gặp hạn mức kiểu gói claude.ai, tức lúc đó phiên đăng nhập được dùng. Mốc ghi khóa HKCU không cho biết biến khóa có từ khi nào. *Hướng:* không biết; có thể ảnh hưởng độ trễ, hạn mức và chi phí USD. *Việc đã làm:* từ commit `7ff4b9c`, harness bỏ biến khóa/token ở mọi tiến trình `claude`, ghi `authSource` từng dòng, kịch bản dừng nếu khác; E7 và E8 mới đạt `authSource = none` ở arm `claude -p`. Các đợt chỉ có arm CCoding (B-15f, local-3e, B-14) không bị ảnh hưởng. Nguồn: prereg:1155–1161; `e7-cto/RUNLOG.md:59`; `e8-parallel/RUNLOG.md:6`.

**(iii) σ quan sát của B-14 lớn hơn kế hoạch.** σ gộp trong bài 0,312 so với 0,182 của kế hoạch (lấy từ dữ liệu B7 cũ); power ở mức 10 % chỉ ≈ 0,38; mức nhỏ nhất phát hiện ≈ 16,3 %. *Hướng:* "không phân biệt được" phần lớn là thiếu lực, không phải bằng chứng thiếu hiệu ứng; cần ≈ 276 lượt để trả lời ở 10 %. Giới hạn 2 của V4-3e-(c) đã nêu trước rủi ro này (chọn bài σ thấp có thể thiếu N). Nguồn: `b14-step2/report.md:24`–`:29`.

**(iv) Phân tích B-14 sửa cách gom dòng sau khi đã thấy kết quả của bản đầu.** Người điều phối chạy bản đầu (giữ dòng đầu mỗi khóa, n = 71; R̂ 0,974 [0,841; 1,134], p 0,733) và thấy kết quả trước khi phát hiện dòng `infra` chặn mất lượt `done`; sửa bằng `collapseRetries` (n = 96). *Hướng:* cách sửa suy ra từ quy tắc (8) và thiết kế runner, không từ kết quả; hai bản **cùng phán quyết** và cả hai nằm trong bảng độ nhạy. Đây vẫn là sửa sau khi thấy dữ liệu, nên nêu. Nguồn: prereg:1175–1186; `b14-step2/report.md:49`–`:63`.

**(v) E7 (nghiệm thu bằng CTO trên lỗi lọt cổng).** Gồm bốn điều, và phải đọc cùng nhau:
1. **Hai lần ghi sai loại lượt.** (1) R3 chạm `--max-turns` bị harness ghi `infra` rồi chạy lại (2 cặp: `0bb51824b9`, `e59884e561`), trong khi runtime CCoding của R1 coi đây là kết thúc bình thường; phát hiện 10:37 UTC **trước khi xem kết luận**, sửa và ghim lại 10:43. (2) 16 lượt R1/R2 (8 + 8) lỗi xác thực 403 bị ghi `done`/"không đọc được".
2. **Phân loại lại 16 cặp *sau khi* đã thấy kết quả (đe dọa hậu kiểm).** Lượt ở (2) được phát hiện khi tách nguyên nhân theo điều kiện 3, **sau khi người điều phối đã xem kết quả chính**; phân loại lại thành `infra` và chạy lại 6–7 giờ sau. Quyết định này có sau dữ liệu: nó không đổi phép kiểm, nhưng làm mất tính "trước dữ liệu" cho 16/128 mục. *Biện pháp:* kết quả chính dùng lượt chạy lại; **bắt buộc báo kèm** kết quả "như đã ghi lúc đầu" (chỉ R1 3 / chỉ R3 3, p 1,000) và "bỏ mục bị phân loại lại" (n = 62, 3 / 1, p 0,625); chỉ viết kết luận đứng được cả ba cách tính, ở đây cả ba cho cùng cách đọc "chưa kết luận về hiệu R1 − R3".
3. **Lỗi 403 chưa rõ nguyên nhân.** Chỉ xảy ra trên đường runtime CCoding (R1, R2) trong hai khoảng 09:47–09:51 và 10:17–10:20 UTC; R3 gọi thẳng `claude -p` cùng thời điểm vẫn chạy được. Lỗi CCoding dùng thông báo lỗi làm văn bản nghiệm thu đã vào backlog Phòng Dev. *Hướng:* nếu 403 liên quan thời điểm hay loại arm thì chạy lại có thể không độc lập với lượt gốc; không ước lượng được.
4. **Trần 6 lượt bất lợi cho Opus.** R2 có 13 lượt không đọc được (chạm trần khi đang đọc mã); coi là chặn thì R2 chặn 61/64 = 95,3 % và chặn nhầm 11/64 = 17,2 %. So sánh R1/R2 phụ thuộc trần, nên ghi [Mô tả].

   Thêm: (a) R1 − R3 là hiệu **hồ sơ CTO cộng lớp vận hành CCoding**; (b) lỗi cài bằng máy, 8 bài, một nhà cung cấp mô hình; (c) 4 cặp bất đồng nên p McNemar chỉ mô tả; (d) đường xác thực của R3 là `none` (đã ghi), cùng với (ii). Nguồn: `e7-cto/report.md:26`, `:35`–`:42`, `:65`–`:68`, `:79`–`:83`; prereg:1163–1173; `e7-cto/RUNLOG.md:89`–`:91`, `:107`–`:113`.

**(vi) E8 (song song có worktree).**
1. **Server A/B lẫn với arm.** B6w4 chạy ở server A (cổng 7428, `maxParallel` 4), B6w1 ở server B (7429, `maxParallel` 1, `e8-b.json`); cùng mã, `dist`, máy, chạy xen kẽ, nhưng "không loại được hoàn toàn khác biệt do server". Một thiết kế đảo (hai server đổi arm) chưa có.
2. **σ kế hoạch lấy từ arm khác.** σ_ln 0,178 lấy từ arm một agent; ngoại suy sang B6w1/B6w4 là **giả định**; nhiều ô σ = 0 do lượng tử hóa vòng hỏi 10 giây. Hiệu quan sát (×0,52) lớn hơn nhiều độ dao động nên kết luận không đổi, nhưng CI hẹp (±0,03) một phần do σ = 0 ở nhiều ô.
3. **Phạm vi.** 3 bài, 6 lần mỗi ô, làn nhanh, CLI 2.1.318, một máy Windows; A0-sonnet chỉ là mốc (`wallSec` chứ không phải `wallSecTask`); chỉ `l1-modules` nhanh hơn agent đơn.
4. **Hạn mức.** Có một lần chờ 30 phút sau 12:45; lượt duy nhất gặp hạn mức là A0-sonnet, đã chạy lại; không lượt CCoding nào tạm dừng (`pauseCount` = 0).

   Nguồn: `e8-parallel/report.md:5`, `:50`, `:60`–`:62`; `e8-parallel/RUNLOG.md:5`–`:6`; prereg:1149–1151, 1160.

> **Đề xuất bổ sung (không thuộc (i)–(vi)).** Nêu ở dạng "giới hạn chung": (1) 1 nhà cung cấp mô hình, CLI 2.1.318, máy Windows; (2) lỗi cài bằng máy ≠ lỗi tự nhiên (G và E7); (3) P không ngẫu nhiên hóa, không có chạy đơn, tệp từng lượt không công bố; (4) trục 2 chưa có số, (b) phụ thuộc bộ ngoài và chỉ về chính sách tĩnh (`deny: []`, không sandbox); (5) nhiều phép kiểm khám phá không hiệu chỉnh đa phép thử.

---

## (c) Danh sách câu cấm

Mỗi dòng: **câu cấm** → vì sao → **thay bằng**. S5 tra từng đoạn; S6 quét `paper.md` bằng Grep các cụm in đậm.

| # | Câu cấm | Vì sao | Thay bằng |
|---|---|---|---|
| 1 | "**không có hiệu ứng**", "stablePrefix vô hiệu", "tương đương" (B-14, G-3Δ, E7 R1 vs R3, E6) | CI rộng, power B-14 ≈ 0,38; CI G-3Δ [−5,4; 8,8], E7 [−5,1; 11,4] | "**không phân biệt được**"; nêu CI và power |
| 2 | "**an toàn**", "**bảo vệ được**", "ngăn được" (trục 2, cổng, song song) | prereg:1208 cấm cho (a); (b) chỉ đo chính sách tĩnh | "chặn được X/n ca của bộ này ở tầng chính sách tĩnh" |
| 3 | "**nhanh hơn agent đơn**" nói chung | chỉ `l1-modules` (×0,59); `t2-orders` ×2,08, `t3-api` ×1,36; token 1,41–3,95 | "ở bài chia được thành nhiều module (`l1-modules`) nhanh hơn agent đơn; ở hai bài còn lại chậm hơn" |
| 4 | "CTO của CCoding tốt hơn Claude Code đơn", "hồ sơ CTO giúp bắt lỗi" | R1 − R3 = hồ sơ **cộng** lớp vận hành; 4 cặp bất đồng, p 0,625 chỉ mô tả | "R1 và R3 chặn gần hết (98,4 % và 95,3 %); hiệu +3,1 [−5,1; 11,4] chưa kết luận" |
| 5 | "**p = 0,625** cho thấy…", "khác biệt không có ý nghĩa thống kê" như kết luận | < 10 cặp bất đồng, p chỉ mô tả | "p mô tả (4 cặp bất đồng < 10)" |
| 6 | "nghiệm thu bắt lỗi nhờ phân biệt tốt" | R1 chặn nhầm 42,2 %, R3 46,9 % | "recall cao đi kèm chặn nhầm gần một nửa sản phẩm đúng" |
| 7 | "chặn nhầm thấp" khi n < 72, hoặc cho (a) trục 2; "chặn nhầm trên lệnh thật là X %" | (a) chưa đo | "**chặn nhầm trên lệnh thật chưa đo, chờ giám đốc chỉ định hai người gán nhãn**" |
| 8 | "**chặn X % tấn công**" ở mọi dạng, kể cả khi đã nêu bộ (36,6 % là tỉ lệ trên 82 lệnh của một bộ, chỉ chính sách tĩnh), hoặc "chặn được lệnh nguy hiểm" | (b) chỉ trên một bộ ngoài, nhãn "mọi ca là nên chặn" là giả định, một tầng chính sách tĩnh | "chặn k/n ca RedCode-Exec quy được về một lệnh, CP 95 % […], tầng `git-read`/`full`"; hoặc "chưa đo" |
| 9 | "bench W1–W5 cho thấy song song/CCoding chậm hơn do song song" | W1–W5 không bật song song | "**bench W1–W5 đo chi phí chia việc mà không có song song**" |
| 10 | "song song **không tốn thêm token**", "**token không đổi**", "token như nhau", "**điểm/chất lượng không đổi**" (E8, E5′, C6) | token 1,008 [0,942; 1,075] CI chứa 1 nhưng không chứng minh bằng nhau; pass 13/18 so 15/18 n nhỏ | "không thấy thay đổi token phát hiện được (CI chứa 1)"; "điểm test ẩn TB 0,995 và 0,990 (mô tả, không phép kiểm)" |
| 11 | "song song làm nhanh gấp đôi" nói chung / cho vận hành thật | E8 ×0,52 ở 3 bài, làn nhanh, server lẫn arm; P chỉ cận trên 27,5 % chưa so chạy đơn; đường găng 771 so 717 | "ở 3 bài của E8, B6w4/B6w1 = 0,520 [0,488; 0,552]" |
| 12 | "tiết kiệm 27,5 %" như số đo | cận trên; chưa so chạy đơn | "tối đa 27,5 % (cận trên, quan sát)" |
| 13 | "Phòng Nghiên cứu/CCoding giảm xung đột gộp", "gộp worktree không xung đột" | E8: 1 xung đột trên 70 (B6w4); P: 6/213 = 2,8 % [1,0; 6,0], cả 6 ở Phòng Dev | báo số và CI |
| 14 | "cổng `npm test` ngăn sản phẩm lỗi" | G-2 0/250: cổng không có gì để chặn; G-1/G-2 đo trạng thái cuối | "trên bộ bài này không lượt nào giao khi lệnh còn đỏ, kể cả agent đơn" |
| 15 | "recall của cổng quality (b02/cto) là X" | chưa ước lượng được (< 10 dương) | "chưa ước lượng được (< 10 lượt dương thật)" |
| 16 | "kết quả được đăng ký trước" cho 16 cặp E7 phân loại lại, cho cách gom B-14 sửa, cho "đỏ mới 2/47", đường găng, G-5, G-c, bảng B-16 | quyết định sau khi thấy dữ liệu | "ghi sau khi thấy kết quả (sai lệch §9)"; dán nhãn [Khám phá]/[Mô tả] |
| 17 | "mọi arm dùng phiên đăng nhập claude.ai" cho dữ liệu trước 13/11 | không ghi `authSource`; chỉ bằng chứng gián tiếp | "arm `claude -p` trước 13/11 không ghi đường xác thực; bằng chứng gián tiếp (h6-3e) cho thấy phiên đăng nhập" |
| 18 | "Nghị định 13/2023/NĐ-CP" | thay bằng Nghị định 356/2025/NĐ-CP (hiệu lực từ 01/01/2026); bỏ nhãn [CHƯA KIỂM CHỨNG] khi S1 chưa kiểm xong bị cấm | giữ nhãn [CHƯA KIỂM CHỨNG] trong câu đến khi S1 xác nhận (prereg:1234) |
| 19 | "CCoding tốt hơn" tổng quát / "H6 xác nhận CCoding bằng agent đơn" | H6 insufficient data; điểm trần; họ Holm rỗng | "ở các bài này điểm test ẩn gần như 1,00 ở cả hai arm (trần), nên không phân biệt được" |
| 20 | "p ≤ 0,0001" bằng "p = 0" hoặc "p < 0,00001" | giá trị nhỏ nhất của Monte Carlo | "p ≤ 0,0001 (nhỏ nhất đo được với số hoán vị đã dùng)" |
| 21 | "mẫu KPI **đã được giám đốc duyệt**", hoặc dùng mẫu KPI như chuẩn đã chốt (thêm 14/11, K4 #3) | tiêu chí (5) của BRIEF-20 chưa đạt | "mẫu KPI là giả định của phòng, chờ giám đốc duyệt" |
| 22 | "**72 giờ cho mọi vi phạm**"; suy mốc của Luật BVDLCN từ Nghị định 356 (K4 #4) | Nghị định 356 chỉ nêu 72 giờ ở Điều 8 khoản 3 và Điều 29 khoản 1 điểm a; điều về thông báo vi phạm của Luật 91/2025/QH15 chưa đọc được toàn văn | "không khẳng định mốc 72 giờ chung; xem `context/nd356-2025-note.md` §8" |
| 23 | "`git-read` chặn 100 % cho thấy nhận diện được tấn công"; "trục 2 (b) **không chặn nhầm**" (K4 #5) | 52/82 ca bị chặn do vai chỉ-đọc (`not-read-only`); (b) không đo chặn nhầm | "52/82 do `not-read-only`; (b) không đo chặn nhầm" |
| 24 | "**nguồn ghi cache là bộ công cụ** đổi theo pha" như kết luận (K4 #7) | n = 1 mỗi cặp, lời nhắc giả, chưa kiểm trên bài thật | "đổi bộ công cụ làm vỡ tiền tố cache (n = 1 mỗi cặp); phù hợp với cách đọc…, chưa kiểm trên bài thật" |
| 25 | "không có lợi thế chất lượng", "không có thêm chất lượng" khi điểm chạm trần (K4 #34) | điểm trần nghĩa là không đo được, không phải không có | "bộ đo không phát hiện được lợi thế chất lượng nào" |
| 26 | "X **đến từ** Y" / "phần lớn là thiếu lực" (diễn giải nhân quả hoặc lượng hóa không số) từ số mô tả hoặc [Khám phá] (K4 #25, #29, #33) | quy nguyên nhân hoặc định lượng ngoài bằng chứng | "đi kèm"; "có vẻ…, chưa kiểm"; nêu số (power 0,38 ở mức 10 %) |

---

## Đối chiếu tiêu chí xong

- Mọi số ở (a) có `tệp:dòng`; số `E7/E8/E4/E5′` dòng đã đếm theo từng tệp (kiểm bằng `Read` các tệp gốc).
- (b) đủ (i)–(vi); (v) có phân loại lại 16 cặp sau khi thấy kết quả như đe dọa hậu kiểm.
- (c) 20 mục câu cấm.
- **Việc S5/S6 phải làm tiếp:** (1) điền dòng trục 2 (b) từ `results/axis2-guard/report.md`; (2) S6 xử lý CI cũ ở `results/g-mutation/RUNLOG.md:58` (chỉ ghi trong phạm vi RUNLOG được sửa); (3) đối chiếu các nhãn đánh dấu **[S6 kiểm nhãn]**; (4) số W1–W5 (B-01) chép từ nguồn đã có.
