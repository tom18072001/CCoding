> Bản lưu nguyên văn kết luận phản biện K7 của BRIEF-22 (peer-reviewer, 14/11/2026), do người điều phối chép từ thư mục đầu ra của nhiệm vụ vì gói chưa commit tệp này (CTO nêu ở biên bản nghiệm thu). Chỉ che đường dẫn máy.

<!-- T-20261114-162216-35d · K7 · peer-reviewer (Peer Reviewer (Devil's Advocate)) · claude-cli/claude-opus-5-5 · in 2 / out 8223 -->

## Tóm tắt
Kết luận: **Chưa đạt**. Còn 2 phát hiện mức chặn, đều sửa được bằng tay trong pha revise. Thứ nhất, backlog và run-plan chưa được chèn vào tệp đích, trong khi `report.md` đã dẫn tới chúng. Thứ hai, 12/34 điểm `tệp:dòng` tôi kiểm mẫu bị lệch.

Điểm mạnh: bảng điểm do script sinh, có `--check`, phủ đủ 14/14 agent. Phân vai "CTO" đúng với mã ở các điểm then chốt. `preregistration.md` chỉ thêm dòng, đúng vị trí trong §9. Không thấy đường dẫn máy. §6.5 của bài báo ghi rõ mức bằng chứng.

Vấn đề lớn nhất về nội dung: bài báo v0.8 có hai số khác nhau cho cùng một đại lượng P-1/P-2 (77,8 % so với 75,0 %; 27,5 % so với 29,2 %). Trong khi đó CHANGELOG ghi "không có số đổi giá trị".

## Kết luận
**Chưa đạt** (còn blocker). Sửa xong C1, C2 và các mục nên sửa M1–M5 thì đạt mức **Sửa nhỏ**.

Kết quả theo 8 tiêu chí của K7:

| # | Tiêu chí | Kết quả |
|---|---|---|
| 1 | Mỗi số có nguồn và khớp nguồn | Đạt phần lớn. Lệch ở M1 và M2 |
| 2 | Không câu nào vượt mức bằng chứng | Chưa đạt ở `report.md` và `model-per-role.md` (M3, M4) |
| 3 | Bảng điểm đủ agent của `kpi-office.json` | **Đạt**: 14/14 |
| 4 | `tệp:dòng` trỏ đúng | **Chưa đạt**: 12/34 lệch (C2) |
| 5 | Nguồn K3 có DOI/URL thật | Đạt. 3/3 nguồn kiểm trên arXiv có thật, có một chỗ nhỏ (m4) |
| 6 | `preregistration.md` chỉ có phần thêm | **Đạt**: 62 dòng thêm / 0 dòng xóa, ở dòng 1246, trong §9, trước §10 (dòng 1308) |
| 7 | Không lộ dữ liệu vận hành thật hay đường dẫn máy | **Đạt** với các mẫu đã kiểm. Tên dự án thật chưa kiểm vì không có danh sách |
| 8 | Danh sách lỗi đủ 4 trường và khớp backlog | Đủ trường, FX/TN khớp 1:1 với B-20…B-49 trong tệp chèn. **Tệp đích chưa có** (C1) |

## Phát hiện
Tổng cộng: 2 mức chặn (C1, C2), 5 mức nên sửa (M1–M5), 6 mức nhỏ (m1–m6) và 1 quan điểm thay thế. Mỗi phát hiện ghi theo dạng mức · vị trí · lý do · đề xuất.

**Mức chặn**

**C1 · blocker · `report.md:187`, `:242`, `:283`; `improvement-backlog.md`; `run-plan.md`**
- **Lý do:** từ `b146b87c` đến HEAD, hai tệp đích không đổi dòng nào: `git diff --stat` không liệt kê chúng, và không có `B-20` trong `improvement-backlog.md`. Dù vậy:
  - `report.md:187` ghi "Mã backlog ở cột cuối khớp `improvement-backlog.md` §0.2 và §5".
  - TN9 và mục 10 trỏ tới `run-plan.md` §10.2, mục này chưa có.
  - Đề bài giao backlog và run-plan là sản phẩm trong tệp đích.
- **Đề xuất:**
  - Chèn nguyên văn Khối A/B/C của `backlog-b20-insert.md` theo các điểm neo đã ghi. Tôi đã kiểm các neo đều có: dòng 12, `## 1. Kiểm nhận định…` ở dòng 82, `## 6. Quan hệ…` ở dòng 713.
  - Chèn `run-plan-s10-insert.md` theo neo của tệp đó.
  - `git diff --numstat` hai tệp phải có cột xóa bằng 0.
  - Chạy lại `consistency-check.mjs`.
  - Sau đó sửa dòng 254 và 266 của `report.md`, vì hai dòng này đang ghi là "chưa chèn".

**C2 · blocker · `logic-map.md` và các chỗ chép lại trong `report.md`, `backlog-b20-insert.md`: `tệp:dòng` lệch**
- **Lý do:** `src/` và `agents/` không đổi từ `b146b87c` (tôi đã kiểm bằng `git diff --stat`), nên lệch là do ghi sai, không phải do mã trôi. Mẫu 34 điểm: 21 đúng, 1 ở ranh giới, 12 lệch.

| Vị trí ghi | Ghi | Thực tế tại `b146b87c` |
|---|---|---|
| `logic-map.md:20,99,167`; `report.md:31,64` | `plan-gate.ts:158` (`planGate`) | `:165` |
| `logic-map.md:99` | Quy tắc A `:136`, B `:147` | A ở `:122`; B (`checkPlanReadable`) ở `:136` |
| `logic-map.md:183`; `report.md:194`; `backlog-b20-insert.md:40,103` | `research-lead.md:51` | quy tắc "Không tạo hạng mục review cho `@peer-reviewer`" ở `:53` |
| `logic-map.md:60-61` | `orch:2112 / 2116 / 2118 / 2119 / 2133 / 2120-2125` | `2105 / 2109 / 2111 / 2113 / 2125 / 2114-2120` (lệch khoảng 7 dòng) |
| `logic-map.md:101`; `report.md:208` | `templateGate` `quality-gate.ts:62` | `:66` |
| `logic-map.md:144` | danh sách đường dẫn nhạy cảm `quality-gate.ts:87` | `:81` |
| `logic-map.md:149,184`; `report.md:195` | `!hasCheckCommands` → cần reviewer `quality-gate.ts:84` | `:103` (trong `reviewerReasons`, `:101`) |

- **Các điểm đúng:**
  - `orch`: 124, 842, 876, 1042, 1090, 1151, 1239, 1253, 1379, 1650, 1916, 2073, 2356, 3436, 3462.
  - `planner.ts`: 25, 248, 288.
  - Khác: `plan-gate.ts:42`, `prompts.ts:313`, `claude-guard.ts:110`.
- **Đề xuất:**
  - Sửa đủ 12 điểm trên.
  - Rà thêm các tham chiếu `quality-gate.ts` và `plan-gate.ts` còn lại, vì lệch tập trung ở hai tệp này và ở phần thân `executeAll`.
  - Bằng chứng của FX19 (`report.md:211`) đang ghi "một chỗ xấp xỉ". Cần đổi thành tỉ lệ lệch đo được.

**Mức nên sửa**

**M1 · major · `paper.md:644-645, 903` so với `paper.md:709-711`; `CHANGELOG.md` (khối v0.8, dòng "Số đổi giá trị: không có")**
- **Lý do:** cùng một đại lượng trên P có hai số khác nhau mà bài không giải thích:
  - "Lượt có ≥ 2 hạng mục chạy cùng lúc": 42/54 = 77,8 % (P-1, Bảng 18 và dòng 903) so với 42/56 = 75,0 % (§6.5).
  - "Tiết kiệm tối đa": 27,5 % (P-2, gộp phút) so với 29,2 % (§6.5, nghịch đảo trung vị).
  - Mẫu số 54 so với 56 có lẽ do bỏ 2 kế hoạch chỉ có 1 hạng mục (`decomp-agg.json`: `singleSubtaskPlans: 2`). Đây là suy luận, chưa kiểm.
  - Như vậy quyết định của kế hoạch ("số cũ → số mới vào CHANGELOG") chưa được làm.
- **Đề xuất:**
  - Ghi rõ hai cách tính: mẫu số 54 hay 56; tổng gộp hay trung vị theo lượt.
  - Chọn một số làm số chính, ghi "số cũ → số mới" vào CHANGELOG.
  - Sửa dòng 903 cho khớp.

**M2 · major · `paper.md:711` (iv) so với `paper.md:647-648`**
- **Lý do:** E8 B6w4/B6w1 có hai cặp số:
  - token 0,99 và wall 0,55 ở §6.5;
  - 0,520 [0,488; 0,552] và 1,008 ở §6.3.3 (đăng ký trước).
  - §6.5 không nêu rằng đây là ước lượng khác (trung vị tỉ số theo bài).
- **Đề xuất:** ghi rõ cách tính, và dẫn số đăng ký trước 0,520 làm số chính.

**M3 · major · `report.md`: câu vượt mức bằng chứng**
- `:14` và `:123`: "tiết kiệm khoảng 22 % so với chạy lần lượt" là phản thực tế theo giả định, vì coi thời lượng hạng mục không đổi khi chạy lần lượt (work/span), lại là nghịch đảo của trung vị. Viết như một hiệu quả đo được là quá mức. → Thêm "theo giả định thời lượng hạng mục không đổi; xấp xỉ".
- `:84`: "Phòng Dev mất thêm ở lập lịch, chờ gộp hoặc giới hạn người nhận (L6, L7)" đang gán nguyên nhân từ đọc mã. Đây là giả thuyết, TN6 mới đo được. → Ghi "giả thuyết, chờ TN6".
- `:85`: "Lượt có lợi thật từ song song" không đúng, vì có ≥ 2 hạng mục chạy chồng không có nghĩa là có lợi. → Đổi thành "Lượt có chạy chồng".
- `:94` và `:128`: "trên việc tuần tự thì làm hỏng kết quả 39–70 %" khái quát hóa từ một benchmark (PlanCraft, S1 §4.2). `paper.md:739` đã viết đúng mức. → Thêm "ở một benchmark lập kế hoạch".
- `:176`: "Như vậy CTO **phát hiện đúng**" dựa trên n = 3 lấy từ biên bản. Ở BRIEF-D16, CTO chưa nghiệm thu nên không có kết luận để đánh giá đúng hay sai. Câu này cũng lệch với E7: chặn nhầm 42,2 % ở R1. → Viết như `paper.md:733`: "có tín hiệu từ CTO; nguyên nhân gốc ở khâu khác".

**M4 · major · `model-per-role.md:19`, `:27`; `paper.md:737`**
- **Lý do:**
  - `:19` viết "bị cắt … do trần lượt/đầu ra, không do model". Đây là khẳng định nhân quả chưa có chẩn đoán; FX8 chính là việc chẩn đoán. Cùng dòng xếp `research-lead` vào "Thành viên Nghiên cứu", trong khi đó là trưởng phòng.
  - `:27` và `paper.md:737` viết "nói 'trưởng phòng dùng Opus' sẽ sai với phần lớn lượt". Điều này chỉ đúng trên bench (252 lượt fast). Ở văn phòng phụ, `plan` chạy Opus 5/5 (`paper.md:709`).
- **Đề xuất:** ghi "giả thuyết, chờ FX8"; bỏ `research-lead` khỏi dòng thành viên; thêm "trên bench".

**M5 · major · `paper.md:739`: phạm vi trích dẫn**
- **Lý do:** câu "nên chuẩn là kết quả chạy test (Zheng et al., 2023; Wang et al., 2024)" dẫn hai bài đo bộ chấm LLM so với người trên câu trả lời mở. Hai bài này không nói gì về chạy test. Căn cứ cho "chuẩn là test" chỉ là Crupi et al. (2025).
- **Đề xuất:** dẫn Zheng và Wang cho ý "bộ chấm LLM có thiên lệch vị trí/độ dài". Giữ Crupi cho ý về test. Đây là lỗi gán phạm vi, không phải nguồn bịa.

**Mức nhỏ**

- **m1 · minor · `report.md:262`, `logic-map.md:16,98`, `model-per-role.md:16`:** `chooseLane` khai báo ở `lane.ts:129`, tức số của K2 mới đúng. `:130` là dòng đầu của thân hàm. Báo cáo đang chọn số kém chính xác hơn. → Đổi về `:129`.
- **m2 · minor · `paper.md:727`, `scorecard.md:133` so với `report.md:198`, `backlog-b20-insert.md:44`:** F-A8 ghi "gói D16" ở một nơi và "D16b K2" ở nơi khác. → Thống nhất một cách gọi.
- **m3 · minor · `report.md:14,89`:** khoảng ×1,5–×6,3 có cận trên ×6,34 của `study-cloud` B0. Cận này có ghi chú "có thể khác cửa sổ chạy" ở `effectiveness.md:52` nhưng báo cáo không chép ghi chú đó. → Chép ghi chú vào báo cáo.
- **m4 · minor · `paper.md:954`, `decomposition-sources-2026-11-14.md:36`:**
  - Trang arXiv 2512.08296 (v3) ghi +80,8 %, trong khi K3 ghi +80,9 % theo v1.
  - Theo lần tôi mở trang, có 21 tác giả, còn danh mục chép 20 tên. Cần mở lại trang để chốt. Đây là suy luận từ một lần fetch.
  - → Ghi rõ phiên bản dùng; đối chiếu lại danh sách tác giả.
- **m5 · minor · `preregistration.md:1246`:** E9 nằm dưới "§9 Sai lệch so với đăng ký" theo đúng quyết định của kế hoạch, nhưng về nghĩa đây không phải sai lệch. → Thêm một câu dẫn ở đầu §9.x: "đăng ký mới, đặt ở §9 để chỉ thêm dòng".
- **m6 · minor · `facts.json:88-90`:** ngoại lệ trỏ tới `paper.md:831` sẽ lệch tiếp khi bài báo đổi (K7a đã nêu). → Gắn ngoại lệ theo chuỗi văn bản thay vì số dòng.

**Quan điểm thay thế (không bắt sửa)**

`report.md:83` kết luận "giới hạn ở cấu trúc kế hoạch, không ở lập lịch". Cách đọc khác: work/cp 1,41 thấp có thể một phần do trưởng phòng được lời nhắc dặn ít hạng mục code song song (L8, `dev-lead.md:57`). Nếu vậy, "cấu trúc" cũng là sản phẩm của lời nhắc, không phải của bản chất bài. E9 nên ghi lại điều này.

## Kiểm trích dẫn & số liệu

**Trích dẫn, kiểm bằng WebFetch trên trang arXiv:**

| Nguồn | Kết quả |
|---|---|
| arXiv 2512.08296 (Kim et al.) | Có thật: tiêu đề, tác giả đầu, v1 9/12/2025, v3 8/4/2026. Tóm tắt nêu −70,0 % ở việc tuần tự. Các số 39–70 % và −3,5 % nằm trong thân bài, tôi chưa kiểm. Lệch +80,8/+80,9 (m4) |
| arXiv 2507.16587 (Crupi et al.) | Có thật: 6 tác giả khớp `paper.md:928`. κ 0,10–0,21 nằm ở Bảng II, không có trong tóm tắt, chưa kiểm |
| arXiv 2510.07505 (Dong et al., PEAR) | Có thật: 7 tác giả khớp; có ghi chú tác giả ở v1/v2. Tóm tắt khớp N23 ("planner yếu hại hơn executor yếu") |

**Số liệu tôi tính lại từ tệp nguồn:**
- **Bị cắt:** cộng trường `calls` của 14 agent trong `kpi-office.json` được 112; cộng `truncated` được 27; có 10 agent `truncated` > 0. Khớp `scorecard.md`, `report.md` và `paper.md:696`. Số "28/124" chỉ có trong báo cáo bàn giao của K2, đã được `report.md:261` ghi nhận.
- **Điểm:** trung vị của 14 điểm là 75,5, khớp `paper.md:696`.
- **`decomp-agg.json`:** `potentialSpeedup` 1,412, `achievedSpeedup` 1,283, `slackOverCp` 0,027, `plansWithLongestShareOver50pct` 10, `plansWithAnyParallel` 42, `singleSubtaskPlans` 2. Các số 1,41 / 1,28 / 2,7 % / 10/56 / 42/56 khớp. Tính lại 22,1 % = 1 − 1/1,283 và 29,2 % = 1 − 1/1,412: khớp.
- **E7:** 63/64 = 98,4 %; 55/64 = 85,9 %; 61/64 = 95,3 %; 27/64 = 42,2 %; 4/64 = 6,3 %; 30/64 = 46,9 %; R1 − R3 = +3,1 điểm %. Khớp.
- **Commit:** `c0e66fab`, `e2b6573c`, `a11abf45`, `d1903029`, `4b0437c8`, `de4b78fc`, `ce8f217b` đều có. Commit chạm `src/` mới nhất tính tới `b146b87c` là `a11abf45`, khớp `report.md:185`.
- **Ánh xạ:** FX1–FX21 ↔ B-20…B-40 và TN1–TN9 ↔ B-41…B-49, khớp 1:1 giữa `report.md` §6 và `backlog-b20-insert.md:39-68`.

**Lệnh đã chạy:**
- `git diff --stat b146b87c HEAD`: 15 tệp. Không có `src/`, `agents/`, `improvement-backlog.md` hay `run-plan.md`.
- `git diff --numstat b146b87c HEAD -- docs/research/preregistration.md` → `62 0`. Hunk duy nhất `@@ -1245,0 +1246,62 @@`.
- `git diff --stat b146b87c HEAD -- src agents` → rỗng.
- `git log --no-walk` trên các commit nêu ở trên.
- Grep mẫu đường dẫn máy (`X:\Users`, `/home/`, `/Users/`, `office-data`, `ccoding-e78`) trong `analysis/decisions/`: 0 kết quả. Chỉ thấy mã nhiệm vụ của chính gói này, theo đúng quy ước CHANGELOG.

**Lệnh chưa chạy:** `node …` bị hook chặn với vai này. Kết quả bốn lệnh kiểm tra lấy từ nhật ký K7a: cả bốn exit 0, gồm `scorecard.mjs --check` 14/14 agent và 358 khóa.

**Tệp đã tạo hoặc sửa:** không có. Vai này chỉ đọc. Research-lead lưu nguyên văn báo cáo này vào `docs/research/context/k7-brief22-review-2026-11-14.md`.

## Câu hỏi bảo vệ thử

1. **"Bài nói chia việc tiết kiệm 22 % thời gian. Ông đã chạy cùng kế hoạch theo kiểu tuần tự để so chưa?"**
   Gợi ý trả lời: chưa trên P. Con số 22 % suy từ work/span, với giả định thời lượng hạng mục không đổi. Bằng chứng có đối chứng là E8, 0,520 [0,488; 0,552], chỉ trên 3 bài.
2. **"77,8 % hay 75,0 %? Hai số trong cùng một bài."**
   Gợi ý trả lời: khác mẫu số (54 so với 56, bỏ hoặc không bỏ kế hoạch 1 hạng mục). Nêu số chính và lý do, theo M1.
3. **"Nếu CTO chặn nhầm 42 % ở R1, sao báo cáo lại nói CTO 'phát hiện đúng' ở ba ca 14/11?"**
   Gợi ý trả lời: rút lại câu đó. n = 3 từ biên bản chỉ cho biết CTO có phát tín hiệu, không đo được độ đúng (M3).
4. **"Bảng điểm có 14 agent. Còn 6 agent và điều phối viên thì sao?"**
   Gợi ý trả lời: phạm vi KPI chưa phủ. FX17 và TN4 xử lý phần này. Không được đọc là kết quả tốt.
5. **"Logic-map có mốc commit, nhưng tôi mở `plan-gate.ts:158` thì không thấy `planGate`?"**
   Gợi ý trả lời: lỗi ghi dòng, đã sửa theo C2. FX19 sẽ có script kiểm tự động.