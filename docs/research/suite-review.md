# Thẩm định bộ đo `bench/vs-claude` của giám đốc (commit `1568774`)

Phiên bản 1.0 · 2026-11-02 · Hạng mục S1 (R5) · Người viết: methodologist · Phân loại dữ liệu: internal
Phạm vi: 13 bài của bộ mới (không gồm t1–t5), H1–H10 trong `analyze.mjs`, `pairwise.mjs`, `lib/grade.mjs`, `lib/judge.mjs`, `run.mjs`, `arms.json`. **Không sửa mã**; mọi sửa đổi là đề xuất cho Phòng Dev (mục 5).

## Tóm tắt

Bộ đo đủ dùng làm hệ đánh giá chính, nhưng có 8 lỗi/khoảng trống cần sửa hoặc ghi rõ trong đăng ký trước. Nặng nhất:
- `run.mjs:64` coi mọi lượt đã ghi (kể cả `failed` do hết hạn mức) là xong nên chạy lại không bù được; `analyze.mjs:11-12` chỉ loại `leak`, lượt lỗi vẫn tính điểm 0.
- `ccoding.mjs:46-62` không cộng `costUsd` khi có `calls.jsonl` (chỉ cộng ở `:62`, nhánh không có tệp), nên USD của mọi arm B bằng 0. Kết quả: chưa thể phân tích độ nhạy USD cho TOST của B-01.
- H1, H2, H3, H4, H9 chỉ dựa trên 4, 4, 1, 1, 1 bài; với 3 lượt mỗi ô thì H3, H4, H9 gần như không kiểm định được. Các phép kiểm "không kém hơn/tương đương" (H2, H6) dùng ước lượng điểm, không dùng khoảng tin cậy.
- H10 lấy `size` làm biến giải thích nhưng `size` không có định nghĩa, gán không nhất quán, và lẫn với loại bài. Slope âm −3,4 pp ngay trong selftest cho thấy phép kiểm nhạy với mức null ≠ 0.
- Giám khảo LLM: mù một phần (ngôn ngữ tiếng Việt của arm B lộ danh tính), giám khảo mặc định `opus` trùng model của `A0-opus`, không có đối chiếu người.
- Ba grader regex (a1, r1) đo chữ khóa nhiều hơn ý (ví dụ `sign` khớp "design"); nên chạy toàn nghiên cứu với `--judge`.

Mọi con số điểm oracle/null lấy từ `results/selftest/summary.csv` (n = 1 lượt, chạy trên máy khác: đường dẫn `/home/claude/...`). Tôi **không chạy lại** selftest (chỉ có quyền đọc). Chỗ nào là suy luận của tôi chứ không phải kết quả chạy thì ghi "suy luận"/"cần kiểm".

---

## 1. Bảng 13 bài

Quy ước mức rủi ro chấm nhầm: **Cao** = có đường chấm sai thường gặp, ảnh hưởng điểm ≥ 1 mục; **TB** = có nhưng hiếm; **Thấp** = grader xác định.
Oracle/null: điểm selftest (oracle chép `hidden/solution|answer.json|reference` vào workspace, `run.mjs:104-109`).

| Bài | Loại | size | Grader | Có đo đúng điều bài muốn đo? | Rủi ro chấm nhầm | Oracle | Null | Mức |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| c1-iis-ecs | coding | 2 | `gradeCode` (`grade.mjs:27`): hidden node:test, 6 test | Có: đo hành vi theo 5 quy tắc của brief. Chỉ đo kết quả, không đo test tự viết | Test ẩn có thể mã hóa lựa chọn brief để ngỏ (ví dụ cột thiếu, thời gian không có mili giây). Đã đọc brief nhưng **chưa đọc `iis.hidden.test.js`**: cần kiểm | 1,00 | 0,00 | TB |
| c2-burst-alert | coding | 2 | như trên, 7 test | Có, brief rất chặt (nửa mở, cooldown, hòa ts). Đã đọc test: 7 test khớp từng câu của brief | Thấp. Kết quả duy nhất theo đặc tả; cooldown/đếm lại đã có test (dòng 20-24 của test) | 1,00 | 0,00 | Thấp |
| c3-shop-bugs | coding | 3 | như trên, 6 test, 3 bug ở 3 tệp | Có: bug ẩn trong mã có sẵn, đo đúng khả năng tìm nguyên nhân gốc | Null được 1/6 (3 lỗi được phủ bởi test chạy được trên mã gốc, suy luận: test hồi quy đã đúng ở mã gốc). Test ẩn có thể phạt cách sửa hợp lệ khác (làm tròn nửa lên, kẹp tồn kho). Cần kiểm test | 1,00 | 0,17 | TB |
| c4-audit-chain | coding | 4 | như trên, 7 test | Phần lớn có. Bẫy "PII không được vào đầu vào băm" và biên SĐT (+84, chữ số liền kề) đo được qua test | Sai biên regex SĐT (đứng cạnh chữ số) bị phạt đúng. Cần kiểm: `canonicalize` khác `JSON.stringify` ở `undefined` trong mảng, ở chuỗi thoát | 1,00 | 0,00 | TB |
| c5-tickets-api | coding | 5 | như trên, 9 test | Có, gồm bẫy tương thích ngược (test 1 và test "tham số lạ bị bỏ qua", dòng 10-14 và 54-59) | Test ẩn cố định tên lỗi `invalid_cursor` cho cả cursor sai và `cursor` không có `limit`, brief chỉ nói `invalid_<param>`: hợp lý nhưng là suy diễn. Thứ tự ưu tiên khi nhiều tham số lỗi cùng lúc không bị test ép (chỉ test từng tham số riêng) nên ổn. Null 2/9 = hai test tương thích ngược qua mã gốc, nghĩa là **bẫy chỉ phạt khi agent làm hỏng hành vi cũ**; điểm sàn 0,22 | 1,00 | 0,22 | TB |
| l1-oncall | logic | 1 | `gradeExact` (`grade.mjs:47`), 3 trường | Có, nhưng 3 trường chung một bài: `schedule` đúng thì `count_without_rule_2` và `most_permissive_rule` vẫn phải tự tính | `eq` dùng `JSON.stringify` (`grade.mjs:43,54`): đối tượng `schedule` phải đúng **thứ tự khóa** Mon..Fri, sai thứ tự = sai trường dù nội dung đúng. Tính duy nhất của đáp án (10 và quy tắc 2, hòa?) **chưa kiểm được** vì tôi không chạy brute force: cần script đối chiếu trong `hidden/` | 1,00 | 0,00 | TB |
| l2-knights | logic | 1 | exact, 3 trường | Có. Tôi giải tay: giả sử A lành thì B, E bị nhiễm, D lành, C bị nhiễm, khi đó đúng 3 kẻ nhiễm làm câu của C thành thật, mâu thuẫn; còn A bị nhiễm cho nghiệm B, C lành, A, D, E nhiễm, khớp mọi câu. **Duy nhất**, `unique:true` đúng | Thấp. Chỉ có 3 điểm rời rạc; một bài size 1 ít phân biệt arm (dễ chạm trần) | 1,00 | 0,00 | Thấp |
| l3-reconcile | logic | 2 | exact, 4 trường | Có; bẫy múi giờ UTC+7, trùng lặp, hoàn tiền, void | `net_revenue_vnd` sai thì 3 trường còn lại vẫn đúng được (0,75). `duplicate_rows_ignored` có thể hiểu hai cách ("dòng trùng" so với "số dòng thừa so với số `txn_id` duy nhất") và brief chỉ nói "exact duplicate rows"; nếu có `txn_id` lặp khác nội dung thì đáp án khác. Cần kiểm CSV. `NOTES.md` yêu cầu nhưng **không được chấm** | 1,00 | 0,00 | TB |
| l4-startup-order | logic | 2 | exact, 3 trường | Có; `startup_order` so toàn bộ danh sách (`grade.mjs:53` loại trừ khỏi sắp xếp) | Thấp. Xác định (Kahn với chọn nhỏ nhất theo thứ tự chữ cái); `admin-ui` bị chặn nhưng không thuộc chu trình, có thể bị gộp nhầm vào `cycle_members`: đây chính là bẫy | 1,00 | 0,00 | Thấp |
| s1-sec-review | review | 3 | `gradeSecurity` (`grade.mjs:61`): F1 của recall (7 lỗi) và precision | Một phần. Đo khả năng gắn đúng **dòng ±3 và đúng `type`**, không đo chất lượng giải thích hay mức độ nghiêm trọng | (a) Một lỗi thật không được gieo (ví dụ `/api/attachments/:id` chỉ có `requireUser`, `server.js:47`) đếm là dương tính giả vì không nằm gần lỗi nào; (b) mồi nhử ở dòng 36, 52, 79: chỉ mồi nhử tính vào `decoyHits`, vẫn trừ precision như FP nhưng mọi finding sai chỗ khác cũng trừ như vậy, nên 3 mồi nhử **không được phân biệt** về điểm, chỉ ở chẩn đoán; (c) finding sai `type` nhưng trong ±3 dòng của lỗi thật là "trung tính" nên gắn nhầm type không bị phạt, chỉ mất recall; (d) mỗi loại `type` chỉ được tính một lần (`found`), nếu bài có hai lỗi cùng loại thì hỏng (hiện 7 loại khác nhau, an toàn) | 1,00 | 0,00 | Cao |
| a1-ambiguous-spec | requirements | 3 | `gradeChecklist` (`grade.mjs:85`): 6 mục; regex hoặc `--judge` | Một phần: đo việc nêu được 6 điểm mơ hồ. Không đo chất lượng giả định tạm, khả năng triển khai | **Regex bắt chữ**: `last-month` có nhánh `(calendar month\|rolling\|30 days\|previous month).{0,200}` khớp bất cứ chỗ nào có "30 days"; `team-definition` dùng `AD`, `HR`, `source` với cờ `i`, khớp "add", "through", "resource" trong vòng 200 ký tự sau "team": gần như luôn đúng. Tài liệu không thấy mâu thuẫn vẫn có thể được điểm. Có `--judge` thì mỗi mục một lệnh `claude -p` do opus chấm, chặt hơn nhưng dùng model của A0-opus (xem mục 4.4) | 1,00 (regex) | 0,00 | Cao |
| r1-elk-design | design | 4 | checklist, 8 mục | Một phần: bẫy giấy phép (searchable snapshots cần Enterprise) đo được; số học dung lượng cũng đo | **Âm tính giả**: `daily-volume` bắt `1[.,](2[5-9]\|3\d\|4\d)\d*` nên "1,4 TB/ngày" và "1,3 TB" **không khớp** (cần ≥ 2 chữ số), trong khi mô tả mục chấp nhận 1,2-1,5 TB. **Dương tính giả**: `integrity` dùng `sign` với cờ `i` nên "design" + "immutable" trong 400 ký tự là đủ; `replicas` chỉ cần xuất hiện từ "replica"; `ilm` chỉ cần "ILM"; `daily-volume` khớp "11.38 TB". 4/8 mục có mô tả chặt hơn regex nhiều | 1,00 (regex) | 0,00 | Cao |
| re1-lit-synthesis | research | 3 | `gradeResearch` (`grade.mjs:96`): 7 kiểm tra | Một phần. `q3` đo từ chối đúng (hiếm); `q4` cặp P1,P3 | (a) `q1` yêu cầu `f1` lệch < 1e-6 so với 0,962: viết 96,2 (phần trăm) bị chấm sai dù đúng nội dung (cần kiểm cách corpus ghi F1: tôi chưa đọc `P4.md`); (b) `citationPrecision` chỉ kiểm id nằm trong P1-P6, **không** kiểm trích dẫn trỏ đúng bài: đặt tên "precision" gây hiểu nhầm; (c) `review_written` chỉ cần ≥ 3 trích `[Pn]` hợp lệ, không kiểm 300-500 từ; (d) "luôn từ chối" nhận điểm q3 | 1,00 | 0,00 | TB |

**Nhận xét chung về oracle/null:**
- Oracle 1,00 cho thấy **grader chấp nhận lời giải tham chiếu** (điều kiện cần), nhưng *không* chứng minh grader chấp nhận mọi lời giải đúng khác (c-bài) và *không* chứng minh checklist regex bắt đúng ý: oracle của a1/r1 là văn bản được viết để khớp regex.
- Null ≠ 0 ở c3 (0,17) và c5 (0,22): sàn không phải 0. Với phép trừ độ lệch (delta) giữa hai arm thì sàn triệt tiêu, nhưng nó nén thang điểm và ảnh hưởng đến H10 (mục 4.3).
- Selftest chạy một lượt, không dùng `--judge`: chưa có bằng chứng nào về hành vi grader ở chế độ LLM.
- Chưa có phép kiểm "đáp án gần đúng": không có arm thứ ba (ví dụ "lời giải sai điển hình") để xem grader có phạt đúng không.

## 2. `size`: định nghĩa, tính nhất quán, dùng cho H10

**Định nghĩa.** Chỉ có một dòng trong `README.md:16-32` (cột "Parts") và trường `size` trong `task.json`. Không có quy tắc đếm nào, ở cả README lẫn mã; `run.mjs` chép giá trị vào dòng kết quả (`run.mjs:169-170`) và `analyze.mjs:55` đọc lại.

**Suy ngược quy tắc từ 13 bài (suy luận của tôi):**

| Bài | size | Căn cứ có thể suy ra | Thực tế cấu trúc |
| --- | --- | --- | --- |
| c1 | 2 | 5 quy tắc đánh số; không khớp 2 | cùng 1 hàm `parseIisLog`: phân tích dòng + ánh xạ trường |
| c2 | 2 | không rõ | 1 hàm; cửa sổ + cooldown |
| c3 | 3 | **3 lỗi ở 3 tệp**, độc lập | tách được thật |
| c4 | 4 | 4 mục đánh số (4 hàm) | **phụ thuộc nhau**: `append` gọi `redact`+`canonicalize`; `verify` gọi `canonicalize` |
| c5 | 5 | 5 mục đánh số | **một tệp**, `limit`/`cursor`/`sort`/`filter` ràng buộc nhau |
| l1 | 1 | 1 câu đố | nhưng có **3 câu hỏi/3 trường** |
| l2 | 1 | 1 câu đố | 3 trường |
| l3 | 2 | không rõ | 4 trường, nhiều bẫy |
| l4 | 2 | không rõ | 3 trường đầu ra |
| s1 | 3 | không rõ | 1 tệp, 7 lỗi, 3 mồi nhử |
| a1 | 3 | không rõ | 6 mục checklist |
| r1 | 4 | không rõ | 8 mục checklist |
| re1 | 3 | không rõ | 4 câu hỏi + REVIEW |

**Kết luận:**
1. Không nhất quán: đếm mục đánh số (c4, c5), đếm lỗi độc lập (c3), còn lại không suy ra được. c1 có 5 quy tắc nhưng size 2; l1 có 3 câu hỏi nhưng size 1.
2. `size` là thước đo "tách được thành bao nhiêu việc **độc lập** cho nhiều agent" hay "số mục cần làm"? Hai khái niệm khác nhau; c4/c5 có nhiều mục nhưng phụ thuộc nhau nên khó chia cho nhiều agent. H1 và H10 ngầm đọc `size` theo nghĩa thứ nhất.
3. `size` **không độc lập với loại bài**: logic = {1,1,2,2}, coding = {2,2,3,4,5}, còn lại 3-4. Xem 4.3.
4. Tag `hypotheses` trong `task.json` không khớp `analyze.mjs`: c1/c2 gắn H1 nhưng H1 lọc `size >= 3` (`analyze.mjs:62`) nên loại cả hai; l3 và r1 gắn H4 nhưng H4 chỉ lọc `requirements` (`analyze.mjs:77`); c3 gắn H3 nhưng H3 chỉ lọc `review` (`analyze.mjs:70`).

## 3. Bảng H1–H10

Quy ước: **Trong** = đủ để phát hiện hiệu ứng nếu hiệu ứng thật tồn tại trong thiết kế hiện tại; "3 lượt/ô" = `--repeats 3` (`README.md:47`). BASE mặc định `A0-sonnet`, TREAT mặc định `B0` (`analyze.mjs:15-16`). Trong phép `compare` (`analyze.mjs:38-53`): đơn vị mẫu là **bài** (delta của trung bình mỗi bài), bootstrap hai tầng 4000 lần, hoán vị đổi dấu 10 000 lần. Với n bài, p nhỏ nhất của hoán vị đổi dấu là 2/2ⁿ: n = 4 cho p ≥ 0,125 (khớp p = 0,123-0,124 của H1, H2 trong `selftest/report.md`).

| H | Câu giả thuyết | Phép kiểm và ngưỡng (dòng) | Kiểm định được với 3 lượt/ô? | Nguy cơ đối với hiệu lực |
| --- | --- | --- | --- | --- |
| **H1** | Việc phân rã được (coding/design, size ≥ 3): B0 hơn A0-sonnet | Lọc: `analyze.mjs:62`; SUPPORTED nếu `est >= 0.1 && lo > 0` (`:63`), p chỉ in ra | **Yếu**. Chỉ 4 bài (c3, c4, c5, r1). Với 4 bài, `lo > 0` (suy luận) gần như đòi cả 4 delta cùng dương; p không bao giờ < 0,125. Tính được `est` nhưng khoảng tin cậy hẹp giả tạo (4 điểm). c1, c2 (size 2) bị loại dù được gắn H1 | `size` là hệ số chưa định nghĩa; r1 chấm bằng regex (mục 1). Trộn coding (kiểm thử) và design (checklist) trong một trung bình. Chọn ngưỡng size ≥ 3 sau khi biết bộ bài (nguy cơ tùy chỉnh theo dữ liệu, cần ghi trong đăng ký trước) |
| **H2** | Suy luận ràng buộc chặt (logic) B0 *không* tốt hơn | Lọc `logic`: `:66`; "SUPPORTED" nếu `est <= 0.05` (`:67`) | **Không**. Chỉ ước lượng điểm, không dùng CI trên; 4 bài; "không khác" chỉ chứng minh được bằng giới hạn trên CI hoặc TOST. Trần: l1, l2 dễ chạm 1,0 ở cả hai arm nên delta ≈ 0 mà không nói gì về giả thuyết | Chạm trần (bài size 1, 3 trường). Nếu B0 kém hơn nhiều, `est ≤ 0,05` vẫn SUPPORTED: giả thuyết một phía trộn với "không tốt hơn" |
| **H3** | Review nâng recall của lỗi gieo mà không giảm precision | recall: `m(TREAT)−m(BASE) >= 0.15` và precision: `m(BASE)−m(TREAT) <= 0.05` (`:73`); 1 bài `s1` (`:70`) | **Không**. 1 bài, 3 lượt/arm; recall có bước 1/7 = 14,3 pp nên chênh 15 pp ≈ 1 lỗi/lượt; sai số lấy mẫu của trung bình 3 lượt lớn hơn ngưỡng. Không có CI, không có p | **Sai cấu trúc**: tên "Review" nhưng phép kiểm so TREAT với BASE (khác nhau ở cả kiến trúc lẫn review) ở `:73`; hiệu ứng review chỉ đo được bằng B0 so với B2 (review tắt), mà B2 chỉ in ra (`:72`) không vào phán quyết. Precision có thể NaN nếu không có finding (`:71`) |
| **H4** | Phát hiện mơ hồ gieo sẵn (requirements) | Lọc `requirements`: `:77`; `est >= 0.2` (`:78`) | **Không**. 1 bài (a1); bootstrap trong 1 bài chỉ lấy lại 3 lượt; điểm mịn 1/6 = 16,7 pp, ngưỡng 20 pp = 2 mục | Grader regex (mục 1) chưa kiểm ý; nếu chạy `--judge` cho arm này mà không cho arm khác (cờ `--judge` theo lệnh chạy, `run.mjs:36`) thì không so được. r1/l3 gắn H4 nhưng không vào |
| **H5** | Chi phí B0/A0: token có trọng số ≥ 3× và thời gian ≥ 1,5× ở ≥ 80 % bài | tỉ số trung vị theo bài `:81-82`, đếm `x >= 3 && wr[i] >= 1.5` (`:83`), SUPPORTED nếu ≥ 0,8 (`:84`) | **Có** (mô tả, không suy diễn thống kê): 13 bài, mỗi bài trung vị 3 lượt. Không có khoảng tin cậy | **Lỗi lập chỉ mục**: `tr` và `wr` được lọc `isFinite` độc lập (`:81`) nên chỉ số `i` lệch khi một bài có NaN (ví dụ `wallSec = 0` hoặc A0 thiếu ô). Trọng số token xem 4.1. Hai hệ đo token khác nhau (CLI `result.usage` so với tổng `calls.jsonl`) |
| **H6** | Agent đơn cùng tính toán (A1/A2) ≈ B0 | `\|est\| <= 0.05` với **một trong** A1/A2 (`:89-90`) | **Không**. Biên ±5 pp trên điểm trung bình 13 bài với 3 lượt: SD điểm theo bài ~0,2-0,3 (chưa có dữ liệu thật, suy luận) cho sai số chuẩn của trung bình cỡ 4-6 pp, bằng biên nên TOST thiếu công suất; chỉ so điểm ước lượng | `.some()`: chỉ cần 1 trong 2 arm khớp là SUPPORTED, tăng dương tính giả. A2 cố định n = 3 (`arms.json:21`), **không khớp tính toán của B0** (tỉ số H5 mới cho biết B0 tốn bao nhiêu). A1 chỉ là prompt 4 bước (`claude.mjs:6-12`), một lượt, không tương đương số token B0 |
| **H7** | Ổn định giữa các lượt: SD(B0)/SD(A0) ≤ 0,7 | tỉ số theo bài `:93`, trung vị ≤ 0,7 và ≥ 3 bài (`:94`) | **Không**. SD với 3 lượt có 2 bậc tự do; tỉ số hai SD rất nhiễu. Bài mà `sd(A0) = 0` bị loại khi `sd(B0) > 0` (NaN, `:93`), thiên lệch chọn: chỉ còn các bài mà A0 dao động | Điểm rời rạc (logic) nên SD theo bước. Chạm trần làm SD = 0 ở cả hai arm (tỉ số 1 do `b === 0 ? 1`) |
| **H8** | Thất bại điều phối: tỉ lệ thiếu sản phẩm, việc bị bỏ sót | `fm(arm)` = tỉ lệ `formatMiss` trên **mọi** lượt (`:97`); `fail(arm)` = tỉ lệ test ẩn trượt trên coding (`:98`); phán quyết = `fm(TREAT) > fm(BASE)` (`:99`) | **Không**. Không có kiểm định, chỉ so hai tỉ lệ; `formatMiss` không bao giờ đặt cho bài coding (`gradeCode` trả không có `formatMiss`, `grade.mjs:40`) | **Chỉ số lệch khỏi khái niệm**: `formatMiss` = JSON không nằm ở tệp mà phải bóc từ báo cáo cuối (`grade.mjs:9-17`). FINAL của B bằng tiếng Việt (README) nên khả năng bóc thất bại cao hơn vì ngôn ngữ, không phải vì điều phối. Ca t5 của C9 (kế hoạch bỏ sót `agg.js`, test đỏ mà review vẫn duyệt) **không được chỉ số này bắt**. Chỉ số trộn mọi bài và không cặp theo bài |
| **H9** | Bám nguồn: citation precision và từ chối đúng B0 hơn ≥ 10 pp | `dP >= 0.1 && dR >= 0.1` (`:104-106`); lọc `research` (`:102`) | **Không**. 1 bài (re1), 3 lượt/arm; `correctRefusal` nhị phân nên mỗi arm chỉ 3 quan sát (bước 33 pp). `citationPrecision` thường chạm 1,0 | `citationPrecision` chỉ kiểm id hợp lệ, không kiểm đúng bài (mục 1). Chênh ≥ 10 pp trên cả hai đồng thời là điều kiện giao (AND) rất chặt trên 3 quan sát |
| **H10** | Lợi thế tăng theo kích thước bài | độ dốc OLS của delta theo `size` trên 13 bài `:109-111`; hoán vị 5000 lần `:112-113`; SUPPORTED nếu `b > 0 && p < 0,05` (`:114`) | **Có thể, mong manh**. 13 điểm, `size` chỉ nhận 5 giá trị (1-5), delta nhiễu (trung bình 3 lượt). Công suất thấp với hiệu ứng nhỏ | `size` lẫn loại bài, chạm trần ở bài nhỏ, `size` chưa định nghĩa (mục 4.3). Xáo trộn `.sort(() => rnd() - 0.5)` (`:113`) không đều (xem SR-12) |

**Nguy cơ chung về hiệu lực (áp cho cả bảng):**

| Nguy cơ | Vị trí | Tác động | Tình trạng |
| --- | --- | --- | --- |
| Lượt `failed`/timeout/hết hạn mức vẫn tính điểm 0 | chỉ loại `r.leak` ở `analyze.mjs:11-12`; `claude.mjs` đặt `failed` khi `is_error` | Arm nào dính hạn mức nhiều hơn (thường arm B vì nhiều lượt gọi, hoặc arm chạy cuối cửa sổ) bị phạt giả | Chưa có tiêu chí loại trong mã |
| Chạy lại không bù lượt hỏng | `run.mjs:64`: `done` gồm **mọi** khóa đã ghi | Lượt `failed` do hạn mức không bao giờ được chạy lại; mỗi cửa sổ 5 giờ ghi cả lượt hỏng | **Lỗi P0** |
| Thứ tự xen kẽ | `run.mjs:47-53`: vòng ngoài là lượt lặp, mỗi bài trộn bằng seed `ccvb/r`, arm xoay `(r + ti) % k` | Tốt hơn chạy tuần tự (dịch chuyển theo thời gian trải đều). Hạn chế: với k = 2 và 13 bài, arm đứng đầu không cân (7/6); không phải khối ngẫu nhiên hoàn toàn; ghi rõ là "xen kẽ + xoay", không phải ngẫu nhiên hóa | Chấp nhận được; ghi trong đăng ký trước |
| Cùng runtime | `run.mjs:33` mặc định `claude-cli` cho cả B và A; `lib/claude.mjs` gọi `claude -p` | Công bằng giữa A0 và B về model, nhưng B0 dùng lập lịch riêng của CCoding (phase models); không biết model thực tế của từng phase mặc định nếu không đọc `arms.json` (B0 `options: {}`) | Cần ghi cấu hình thực tế của B0 trong mỗi dòng kết quả |
| Phiên bản CCoding khác nhau giữa các arm và trong lúc Phòng Dev đang sửa | `run.mjs:169-176`: dòng kết quả **không** lưu hash commit CCoding, phiên bản `claude` CLI, model thực dùng; `config.json` (`run.mjs:62`) chỉ lưu `argv` và `cfg` | Nếu Phòng Dev gộp `main` giữa hai cửa sổ thì B0 ở cửa sổ 1 và 2 là hai hệ khác nhau, không biết sau khi chạy | **P0**: ghi vào mỗi dòng |
| Hạn mức đổi giữa chừng | README ghi "do not mix plans or rate-limit states mid-study" (`README.md:65`) nhưng không có cơ chế ghi trạng thái hạn mức | Nghiên cứu 3+ cửa sổ chắc chắn đổi trạng thái; ca 2/11 hết hạn mức sau khoảng 4,5 giờ | Cần cờ `window` và `quotaState` mỗi dòng |
| B5 dùng `senior-swe` | `arms.json:67-72`; `mode: 'agent'` (`ccoding.mjs:30`) | B5 so với B0 tách "khung CCoding" khỏi "văn phòng", nhưng B5 cũng chạy qua REST + hồ sơ agent khác với `claude -p` trần: chênh lệch B5 so với A0 gồm cả khung lẫn hồ sơ; không tách được riêng. `senior-swe` chỉ hợp bài coding, chưa chắc hợp logic/research/design (hồ sơ vai khác) | Giải thích hạn chế trong đăng ký trước |
| Tính hợp lệ của USD | `ccoding.mjs:46-62` không cộng `costUsd` | USD của arm B luôn 0 ở nhánh `calls.jsonl` | **P0** (mục 4.2) |
| Timeout mặc định 60 phút | `run.mjs:34`; `ccoding.mjs:33-36` hủy và đặt `failed` | Bài dài với B0 dễ bị cắt, tính 0 | Tiêu chí loại timeout cần áp |
| Phát hiện rò rỉ | `run.mjs:87-91` | Từ khóa `checklist.json`, `issues.json`, `hidden/` có thể xuất hiện trong `calls.jsonl` vì lý do hợp lệ (đường dẫn trong prompt hệ thống), dương tính giả loại oan arm B. Best-of-N không kiểm rò rỉ ở bước chọn | Cần kiểm trên dữ liệu thật |
| Chế độ chấm trộn | `gradeChecklist` chọn regex hoặc judge theo cờ `--judge` (`grade.mjs:88-90`); `details.judge` có ghi | Nếu một phần lượt chạy khác chế độ thì điểm không so được | Phải khóa một chế độ cho cả nghiên cứu |

## 4. Bốn điểm bắt buộc

### 4.1 Trọng số token `5 × output`

- Công thức: `weighted = input + 1.25·cacheWrite + 0.1·cacheRead + 5·output` (`claude.mjs:15-17`, README dòng 69). Tỉ lệ 1 : 5 : 1,25 : 0,1 là tỉ lệ giá công bố của Anthropic *trong cùng một model* (đầu ra gấp 5 lần đầu vào; ghi bộ nhớ đệm 1,25 lần; đọc bộ nhớ đệm 0,1 lần). **Tôi không tra bảng giá hiện hành trong phiên này**: cần kiểm lại với trang giá chính thức trước khi khóa đăng ký trước, vì giá thay đổi theo đời model.
- **Điểm mạnh:** không phụ thuộc giá USD nên không đổi khi giá đổi; cố định, đã dùng trong `ccoding bench` và ở C1-C9 (giữ nhất quán).
- **Điểm yếu:**
  1. Tỉ lệ 5 : 1 chỉ đúng trong một model; không hề phản ánh chênh lệch giá giữa model (Opus so với Sonnet). Nên `A0-opus` và `A0-sonnet` cùng số token có cùng `weighted` nhưng USD khác nhau; tương tự B0 (nhiều phase có thể dùng model khác nhau) so với A0-sonnet.
  2. `0,1 × cacheRead` làm chi phí của phiên dài (A0 nhiều lượt) thấp đi nhiều: `cacheRead` thường chiếm đa số token tổng nhưng chỉ ~10 % trọng số. Arm có nhiều cuộc gọi ngắn (B0) trả nhiều `cacheWrite`/`input` hơn. Kết luận H5 nhạy với cách cache hoạt động, không chỉ với số việc làm.
  3. Hai cách đo khác nhau: A-arm lấy `result.usage` của CLI (`claude.mjs:45`; cần kiểm xem nó có tổng hợp mọi lượt gọi con/lượt trong phiên không), B-arm cộng từng dòng `calls.jsonl` (`ccoding.mjs:46-62`). Chênh lệch phạm vi đo có thể tạo hệ số nhân giả.
  4. Gói `output` gồm cả token suy nghĩ (nếu có) tùy runtime.
- **Đề xuất:** giữ `weighted` làm chỉ số chính (theo chỉ đạo giám đốc và theo quyết định), nhưng (a) bắt buộc báo cáo kèm bảng token thô, (b) thêm USD ước lượng theo bảng giá có phiên bản theo model làm độ nhạy (SR-02), (c) kiểm tra tỉ lệ `cacheRead/total` từng arm để thấy mức bất đối xứng.

### 4.2 `weighted` khác chi phí USD và hệ quả cho TOST của B-01

- Hai đại lượng bằng nhau về thứ hạng chỉ khi mọi lượt dùng cùng model và cùng cấu trúc bảng giá. Điều này **không đảm bảo** giữa `A0-sonnet` và làn đơn của CCoding nếu làn dùng model khác, thêm lượt định tuyến hoặc nghiệm thu, hoặc ghi cache khác.
- **Lỗi cụ thể:** trong `ccoding.mjs:46-62`, `costUsd` chỉ được cộng ở nhánh `else` (không có `calls.jsonl`). Khi có `calls.jsonl` (trường hợp bình thường), `costUsd = 0`. Hậu quả: `meanUsd` trong `pareto.csv` (`analyze.mjs:126`) cho mọi arm B là 0; so USD giữa A0-sonnet và làn đơn không thể thực hiện.
- **Hệ quả cho TOST của B-01 (theo quyết định đã chốt: ba đại lượng, mỗi đại lượng một phép TOST riêng, so với trung bình A0-sonnet, α = 0,05 mỗi phía, bootstrap 90 % CI; chỉ số chính là token có trọng số):**
  1. **Chỉ số chính (token có trọng số)** chạy được ngay với dữ liệu hiện có, nhưng kết luận "tương đương ±15 %" chỉ là tương đương về *token có trọng số*, không suy ra tương đương USD.
  2. **Độ nhạy USD** chưa chạy được cho tới khi SR-02 xong. Cho tới đó, đăng ký trước phải ghi: "tương đương USD chưa được kiểm; nếu độ nhạy USD cho kết luận khác thì báo cáo cả hai, không đổi chỉ số chính".
  3. **Thang biên:** ±15 % nên định nghĩa trên tỉ số (thang log, biên [ln 0,85; ln 1,15]) vì −15 % và +15 % không đối xứng trên thang tỉ số (1/0,85 = 1,176). Nếu dùng chênh tuyệt đối trên trung bình A0-sonnet thì biên phụ thuộc mức nền từng bài; bài nhỏ (l1) có ngưỡng tuyệt đối tí hon so với bài lớn (c5). Đề xuất phép TOST trên log tỉ số trung bình theo bài rồi lấy trung bình (hoặc ghép cặp).
  4. **Điểm tương đối:** biên ±15 % của điểm có nghĩa kém khi điểm gần trần (A0-sonnet ≈ 0,9 thì ±15 % là ±13,5 pp, rất rộng). Cần nêu rõ biên điểm theo pp hay theo tỉ lệ.
  5. `analyze.mjs` hiện **không có TOST**: H2 và H6 dùng ngưỡng điểm ước lượng (`:67`, `:89-90`). Cần bổ sung hàm tương đương dùng chung với `compare` (SR-04).
  6. Thời gian thực: B-arm đo thời gian có kèm polling 10 giây (`ccoding.mjs:38`); độ phân giải thô với bài ngắn (l1) khiến tỉ số nhiễu.

### 4.3 H10 dùng `size` làm biến giải thích

1. **Không có định nghĩa** (mục 2). Một biến giải thích phải được định nghĩa độc lập với kết quả; ở đây người định `size` biết bài nào kỳ vọng B0 hơn.
2. **Lẫn loại bài.** Logic có size 1-2 và (theo H2) kỳ vọng delta ≈ 0; coding có size 2-5. Độ dốc dương có thể chỉ vì logic nằm ở đầu trái. Dữ liệu thật cần: hồi quy `delta ~ size + loại` hoặc phân tích riêng trong coding (5 bài: 2, 2, 3, 4, 5) đủ để thấy xu hướng mà không bị lẫn.
3. **Chạm trần.** Bài nhỏ dễ, A0 gần 1,0 nên delta không thể dương; tạo độ dốc dương giả ngay cả khi lợi thế không đổi.
4. **Sàn null ≠ 0.** Bằng chứng thực tế: selftest cho độ dốc −3,4 pp/phần, p = 0,061, với *oracle so với null*, nơi lợi thế đáng ra không phụ thuộc size. Nguyên nhân (suy luận): c3, c5 có sàn 0,17, 0,22 nên delta của chúng bị nén. Nghĩa là H10 phản ứng với cấu trúc thang điểm, không chỉ với kiến trúc.
5. **Chỉ 13 điểm, 5 mức size**, mỗi điểm là trung bình 3 lượt: công suất thấp; trọng số các bài bằng nhau dù độ nhiễu khác nhau.
6. **Xáo trộn không đều:** `.sort(() => rnd() - 0.5)` (`analyze.mjs:113`) không phải xáo trộn Fisher-Yates; p hoán vị có thể lệch.
7. **Kết luận:** H10 *có thể chạy* nhưng chỉ nên coi là thăm dò, cho tới khi (a) `size` có định nghĩa và gán lại theo quy tắc, (b) mô hình có điều chỉnh loại bài hoặc chỉ dùng coding, (c) báo cáo khoảng tin cậy của độ dốc, không chỉ p.

### 4.4 Giám khảo LLM chấm sản phẩm LLM (`pairwise.mjs`, `lib/judge.mjs`)

| Câu hỏi | Trả lời từ mã |
| --- | --- |
| **Mù có thật không?** | **Chỉ một phần.** `blind()` (`judge.mjs:6-12`) thay tên hệ thống, tên vai trò, "Trưởng phòng/Phòng ...", và xóa dòng `[bench ...]`. Nhưng: (1) sản phẩm B thường bằng **tiếng Việt** hoặc có phong cách báo cáo riêng của CCoding (README nói FINAL tiếng Việt và giám khảo "được dặn bỏ qua ngôn ngữ"): dặn bỏ qua không đồng nghĩa không nhận ra; (2) `deliverable()` (`pairwise.mjs:19-23`) ghép thêm `REVIEW.md` và `NOTES.md`; arm nhiều agent hay để lại nhiều tệp phụ; (3) nếu không có tệp sản phẩm thì dùng `_FINAL.txt`, vốn đặc trưng của B. Chưa có phép kiểm "giám khảo đoán được danh tính không" để đo mức mù thực |
| **Có đảo thứ tự cặp không?** | **Có.** `judgePair` chạy hai thứ tự (`judge.mjs:41-45`), bất đồng thì tính hòa. Tốt cho thiên lệch vị trí, nhưng (a) bất đồng do nhiễu cũng thành hòa nên tỉ lệ hòa lẫn nhiễu với bất phân thắng bại; (b) mỗi thứ tự chỉ một phán quyết (temperature mặc định) nên không biết độ lặp lại; (c) cắt văn bản ở 60 000 ký tự (`judge.mjs:38`), sản phẩm dài bị cắt thiệt |
| **Thống kê** | Không có kiểm định: `pairwise.mjs:39-41` chỉ in số thắng/thua/hòa và tỉ lệ thắng bỏ hòa, không CI, không kiểm định dấu, không điều chỉnh theo bài (3-4 bài × 3 lượt, các lượt cùng bài không độc lập) |
| **Độ thiên về Claude / tự ưu ái** | Giám khảo mặc định `opus` (`pairwise.mjs:14`, `run.mjs:36`): **cùng model với `A0-opus`**, cùng họ với mọi arm khác (model sinh ra đều là Claude). Tài liệu về thiên lệch tự ưu ái của giám khảo LLM có tồn tại nhưng tôi **chưa kiểm nguồn trong phiên này**; coi là rủi ro cần kiểm thực nghiệm, không phải kết luận. Không có giám khảo ngoài họ Claude |
| **Tiêu chí (rubric)** | Chỉ một câu cho mỗi loại (`pairwise.mjs:24-28`), trong khi checklist chi tiết nằm ở `hidden/` mà giám khảo cặp không nhìn thấy. Phán quyết cặp và điểm checklist có thể mâu thuẫn; không có phép đối chiếu hai thước |
| **Phạm vi** | Chỉ 3 loại (design, requirements, research); logic/review/coding không qua giám khảo, tốt. Nhưng H4, H9 và nhánh r1 của H1 là các phép kiểm dựa vào grader regex/judge, và đây là chỗ giám khảo LLM chi phối kết luận |
| **Đề xuất** | (1) Bổ sung một mẫu **do người chấm** (tối thiểu 20 % số cặp, chọn ngẫu nhiên phân tầng theo bài, người chấm không biết arm) để tính độ đồng thuận (kappa hoặc tỉ lệ đồng ý) với giám khảo LLM; (2) tăng mù: chuẩn hóa ngôn ngữ (yêu cầu cả hai arm viết sản phẩm cùng ngôn ngữ, hoặc dịch qua bước trung lập), cắt tên tệp phụ; (3) kiểm "đoán danh tính" bằng một lệnh giám khảo thử; (4) thêm một giám khảo thứ hai ngoài `A0-opus` model (Sonnet), báo cáo cả hai; (5) thêm kiểm định dấu/CI nhị thức trong `pairwise.mjs` |

---

## 5. Đề xuất sửa (Phòng Dev thực hiện; S1 không tự sửa mã)

Mức: **P0** = chặn khóa đăng ký trước (S4 đánh dấu "khóa có điều kiện: chờ SR-xx" cho các H bị ảnh hưởng); **P1** = sửa trước khi chạy nghiên cứu chính; **P2** = nên sửa.

### Danh sách P0 (S4 dùng)

| Mã | Mức | Nội dung | Tệp:dòng cần sửa | H/giả thuyết bị ảnh hưởng |
| --- | --- | --- | --- | --- |
| **SR-01** | **P0** | (a) `done` chỉ gồm khóa có `status === 'done'`; lượt `failed`/`error` được chạy lại ở lần sau hoặc được gắn nhãn nguyên nhân (`quota`, `timeout`, `error`); (b) thêm trường `excluded` (lý do) vào dòng kết quả; (c) `analyze.mjs` loại các lượt `excluded` theo tiêu chí loại của bản 1 (hạn mức, rò rỉ, timeout) và báo số lượt loại theo arm | `run.mjs:64` (tập `done`), `run.mjs:169-176` (dòng kết quả), `analyze.mjs:11-12` | Tất cả H1-H10, B-01, B-02 |
| **SR-02** | **P0** | Cộng `costUsd` cho nhánh `calls.jsonl` (nhân giá theo model của từng dòng với bảng giá có phiên bản), lưu `model` mỗi cuộc gọi; báo `weighted` và USD ước lượng cạnh nhau | `lib/ccoding.mjs:46-62`, `analyze.mjs:122,126` | H5, TOST B-01 (độ nhạy USD), đường biên chi phí |
| **SR-03** | **P0** | Ghi vào **mỗi dòng kết quả**: hash commit CCoding đang chạy, phiên bản `claude` CLI, model thực của từng phase B, cửa sổ hạn mức (`window` đánh số) và trạng thái hạn mức; `analyze.mjs` cảnh báo (hoặc từ chối) khi một arm có nhiều hơn một hash | `run.mjs:169-176`, `run.mjs:62` (`config.json`) | Mọi H (đặc biệt khi Phòng Dev gộp `main` giữa các cửa sổ) |
| **SR-04** | **P0** | Thêm phép tương đương (TOST) dùng chung: bootstrap 90 % CI trên log-tỉ số, biên khai báo trước; áp cho H2, H6 và giả thuyết làn đơn B-01 (token có trọng số, thời gian, điểm tương đối). Thay phán quyết `est <= 0.05` và `|est| <= 0.05` bằng điều kiện CI nằm trong biên | `analyze.mjs:66-68` (H2), `:87-91` (H6), thêm hàm cạnh `compare` (`:38-53`) | H2, H6, B-01 |
| **SR-05** | **P0** | Định nghĩa `size` bằng văn bản và quy tắc đếm, thêm trường `sizeBasis` vào `task.json`; gán lại 13 bài theo quy tắc; trong `analyze.mjs` H10 báo cáo (i) độ dốc có điều chỉnh loại bài hoặc chỉ trong coding, (ii) khoảng tin cậy độ dốc, (iii) Fisher-Yates thay `.sort(() => rnd() - 0.5)`. Nếu chưa gán lại kịp, S4 ghi H10 là thăm dò | `README.md:16-32`, `tasks/*/task.json`, `analyze.mjs:109-114` | H10, H1 (ngưỡng `size >= 3`) |
| **SR-06** | **P0** | Sửa lỗi lệch chỉ số: lọc `tr` và `wr` cùng nhau để chỉ số khớp theo bài, và loại bài NaN trước khi đếm | `analyze.mjs:81-83` | H5 |
| **SR-07** | **P0** | Khóa một chế độ chấm cho cả nghiên cứu: `analyze.mjs` từ chối nếu `details.judge` khác nhau giữa các lượt cùng bài; quy định chạy chính luôn bật `--judge` (regex chỉ là lưới an toàn, báo cả hai điểm khi có thể); ghi rõ model giám khảo | `analyze.mjs` (kiểm đầu vào, sau dòng 12), `run.mjs:36` (cờ), `README.md:47` | H1 (r1), H4, H9 |
| **SR-08** | **P0** | Giám khảo cặp: đối chiếu người một mẫu ≥ 20 % cặp, thêm giám khảo thứ hai ngoài `A0-opus` model, ghi tỉ lệ đồng thuận; thêm kiểm định dấu/CI nhị thức; chuẩn hóa ngôn ngữ/tệp phụ để tăng mù. Phần mã nhỏ có thể làm sau, nhưng đăng ký trước phải ghi giới hạn mù | `pairwise.mjs:14,19-23,39-41`, `lib/judge.mjs:6-12,38` | Mọi kết luận dùng pairwise; H4, H9 |

### P1

| Mã | Mức | Nội dung | Tệp:dòng | Ảnh hưởng |
| --- | --- | --- | --- | --- |
| **SR-09** | P1 | Làm checklist chặt hơn: bỏ `sign` khỏi `integrity` hoặc thêm ranh giới từ (`\bsign(ed\|ature\|ing)?\b`); sửa `daily-volume` để khớp "1,4 TB" và "1,3 TB"; sửa `team-definition` bỏ `AD\|HR` ngắn (dùng `\bAD\b`, `\bHR\b` phân biệt hoa thường); thu hẹp `last-month` (không khớp "30 days" đơn lẻ); `replicas`/`ilm` đòi bằng chứng số liệu/cấu hình. Chạy lại selftest và một tập "giải pháp sai điển hình" để thấy regex có phạt | `tasks/a1-ambiguous-spec/hidden/checklist.json`, `tasks/r1-elk-design/hidden/checklist.json` | H4, H1 (r1) |
| **SR-10** | P1 | Sửa H3 để đo hiệu ứng review: so B0 với B2 (review tắt), không so B0 với A0-sonnet; hoặc đổi tên giả thuyết. Thêm CI cho recall/precision, xử lý precision NaN | `analyze.mjs:70-74` | H3 |
| **SR-11** | P1 | H4, H9, H3 chỉ có 1 bài: hoặc thêm ít nhất 1-2 bài mỗi loại (ưu tiên requirements và research), hoặc hạ xuống mô tả và không phán SUPPORTED. Verdict `insufficient data` khi số bài < 3 thay vì `!c.n` | `analyze.mjs:60,63,67,74,78,106`; thêm bài `tasks/` | H3, H4, H9 |
| **SR-12** | P1 | H6: yêu cầu cả hai (hoặc arm khai báo trước) trong ±biên, không `.some()`; ghi tỉ số token A2/B0 để biết "cùng tính toán" thực tế; xem lại n = 3 của A2 | `analyze.mjs:89-90`, `arms.json:18-23` | H6 |
| **SR-13** | P1 | H8: thay `formatMiss` bằng chỉ số điều phối đúng nghĩa: số test trượt thuộc tệp mà agent không sửa (so snapshot với `hidden/solution`), cờ "lệnh kiểm vẫn đỏ mà kết thúc"; giữ `formatMiss` làm chỉ số phụ; tách theo bài, cặp theo bài; cho `gradeCode` trả `formatMiss` khi thiếu tệp sản phẩm. Ca t5/C9 là mẫu thử | `analyze.mjs:97-99`, `lib/grade.mjs:40` | H8, B-02 |
| **SR-14** | P1 | H7: dùng phương sai gộp theo bài hoặc kiểm tra Levene/bootstrap thay trung vị tỉ số SD với 3 lượt; không bỏ bài `sd(A0)=0`; hoặc tăng lượt lặp cho tập con | `analyze.mjs:93-94` | H7 |
| **SR-15** | P1 | Đồng bộ nhãn `hypotheses` trong `task.json` với bộ lọc `analyze.mjs` (xem mục 2.4); thêm chú thích trong README | `tasks/*/task.json`, `README.md` | H1, H3, H4 |
| **SR-16** | P1 | `l1-oncall`: thêm script brute-force vào `hidden/` xác nhận lời giải duy nhất, `count_without_rule_2` và tính duy nhất của `most_permissive_rule` (không hòa); `l3`: ghi rõ định nghĩa "duplicate rows"; so sánh JSON không phụ thuộc thứ tự khóa | `tasks/l1-oncall/hidden/`, `lib/grade.mjs:43,54` | H2 |
| **SR-17** | P1 | `s1`: chấp nhận tập `findings` có finding thật ngoài danh sách (ví dụ IDOR ở `server.js:47`) bằng cách thêm vào `issues.json` mục "bonus không phạt" hoặc ghi rõ rằng chúng bị tính là FP; báo riêng `decoyHits` trong báo cáo H3 | `tasks/s1-sec-review/hidden/issues.json`, `lib/grade.mjs:70-77` | H3 |
| **SR-18** | P1 | `re1`: đổi tên `citationPrecision` thành `citationValidity` hoặc thêm kiểm trích đúng bài; chấp nhận F1 theo phần trăm; kiểm số từ REVIEW | `lib/grade.mjs:99-118` | H9 |
| **SR-19** | P1 | Mỗi dòng ghi thêm: `quotaState`, nguyên nhân `failed`, độ dài timeout; thêm cờ `--window` | `run.mjs:169-176` | Mọi H |

### P2

| Mã | Mức | Nội dung | Tệp:dòng |
| --- | --- | --- | --- |
| **SR-20** | P2 | Bộ sinh số giả ngẫu nhiên `seed * 1103515245 + 12345` vượt 2⁵³ nên mất bit thấp trước khi `& 0x7fffffff`; thay bằng mulberry32 hoặc `crypto`; ghi seed vào báo cáo (cần kiểm tác động thực) | `analyze.mjs:22` |
| **SR-21** | P2 | Kiểm tra rò rỉ: tránh dương tính giả do từ khóa trong prompt hệ thống; thêm kiểm cho bước chọn của A2 | `run.mjs:87-91,116-135` |
| **SR-22** | P2 | Điểm trung bình "Overall" tính theo lượt nên coding (5/13 bài) có trọng số lớn; thêm trung bình theo loại có trọng số bằng nhau | `analyze.mjs:133` |
| **SR-23** | P2 | Cân bằng thứ tự arm: dùng bảng Latin thật cho k arm | `run.mjs:47-53` |
| **SR-24** | P2 | Selftest cần thêm arm "lời giải sai điển hình" (một đáp án gần đúng cho mỗi bài) để kiểm grader có phạt | `arms.json`, `run.mjs:103-109` |

### Ánh xạ bốn điểm bắt buộc sang đề xuất

| Điểm | Đề xuất |
| --- | --- |
| Trọng số `5 × output` | SR-02 (USD cạnh weighted), SR-03; ghi trong 4.1 |
| `weighted` khác USD, hệ quả TOST B-01 | SR-02, SR-04 (và ghi trong đăng ký trước: USD chỉ là độ nhạy, chưa kiểm được trước SR-02) |
| H10 và `size` | SR-05, SR-15 |
| Giám khảo LLM chấm sản phẩm LLM | SR-07, SR-08, SR-09 |

## Việc chưa làm được (ghi rõ)

- Không chạy bất kỳ lệnh nào (chỉ đọc). Cần Phòng Dev/data-scientist chạy: `node bench/vs-claude/run.mjs --arms oracle,null --repeats 1 --out <thư mục tạm>` để tái xác nhận selftest trên máy này; brute-force kiểm l1; `node --test bench/vs-claude/harness/stats.test.mjs` (baseline đã đo, 12/12 qua; không liên quan bộ mới).
- Chưa đọc `iis.hidden.test.js`, `shop.hidden.test.js`, `chain.hidden.test.js`, `P1-P6.md`, `transactions.csv`, `services.txt`; các nhận định về c1, c3, c4, l3, re1 ở mục "cần kiểm".
- Chưa kiểm cách `claude -p` báo `usage` (tổng hợp hay chỉ lượt cuối) và model mặc định các phase của B0.
- Chưa tra bảng giá hiện hành và tài liệu về thiên lệch giám khảo LLM.
