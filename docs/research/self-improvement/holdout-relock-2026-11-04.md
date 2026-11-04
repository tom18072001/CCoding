# Khóa lại bộ bài giữ lại B-19 — biên bản rà diff (4/11/2026)

Phân loại dữ liệu: **Nội bộ**. Hạng mục S1/K1, BRIEF-16. Người thực hiện: data-scientist.

**TRẠNG THÁI: DỪNG tại cổng rà diff. Chưa chạy `--hash`, chưa sửa `holdout-lock.json`, chưa sửa `holdout-and-sample-size.md`, chưa ghi §9.** Lý do: `l3-reconcile/task.json` đổi trường `brief` (lời nhắc agent nhìn thấy), không phải bộ chấm hay siêu dữ liệu (xem §2). Chờ research-lead quyết định.

## 1. Bằng chứng chưa có lượt A/B nào của B-19

Commit HEAD lúc kiểm: `6c454f6` (nhánh `ccoding/t-20261104-110942-567--s1`).

| Lệnh | Đầu ra |
|---|---|
| `git log --all --oneline -- 'bench/vs-claude/results/selfimprove*' 'bench/vs-claude/results/b19*' 'data/'` | rỗng |
| `grep -rIl -i -E "selfimprove\|B-19" bench/vs-claude/results` | rỗng |
| `git ls-files \| grep -i -E "(^\|/)(ab\|b19\|b-19)[-_./]\|ab-runs\|selfimprove.*\.jsonl"` | rỗng |
| `ls data` | không có thư mục `data/` |
| `find bench/vs-claude/results -name runs.jsonl` | 9 tệp: b11-mock, b7prime, gates-pilot, pilot1, selftest, study-cloud, study-cloud-anchor-W3/W4/W5 |
| nhánh (`"arm"`) trong các `runs.jsonl` đó | chỉ A0-sonnet, A1, A2, B0, B5, B6, B7, B7c, B7cab, B7cabO, B7cb, null, oracle — không có nhánh bản vá A/B |

Kết luận: không có kết quả A/B nào của B-19 trong repo ở `6c454f6`. Giới hạn: chỉ kiểm được repo/nhánh này; `data/` của máy khác (nếu người dùng đã chạy giao diện B-19 cục bộ) không nằm trong tầm kiểm. Brief nêu "chưa có lượt A/B nào", khớp.

## 2. Bảng rà diff `8b0b6c3..902fc78` (10 bài giữ lại)

Không bài nào có thay đổi trong `repo/` (workspace agent nhận). Mọi thay đổi nằm ở `task.json` và `hidden/`.

| Bài | Tệp đổi | Mục SR | Loại | Lộ đáp án? | Độ khó / hướng |
|---|---|---|---|---|---|
| c1-iis-ecs | task.json (`size` 2→1, +`sizeBasis`, +`sizeLegacy`, bỏ nhãn H1); +hidden/nearmiss/src/iis.js, +nearmiss.note.txt | SR-05, SR-15, SR-24 | siêu dữ liệu; bộ chấm (đối chứng near-miss) | không | không đổi bài; đối xứng |
| c2-burst-alert | task.json (size 2→1, bỏ H1, H2); +nearmiss (alert.js, note) | SR-05, SR-15, SR-24 | như trên | không | như trên |
| c3-shop-bugs | task.json (+sizeBasis/sizeLegacy, bỏ H3); +nearmiss (stock.js, note) | SR-05, SR-15, SR-24 | như trên | không | như trên |
| c4-audit-chain | task.json (+sizeBasis/sizeLegacy); +nearmiss (index.js, note) | SR-05, SR-24 | như trên | không | như trên |
| c5-tickets-api | task.json (size 5→1, bỏ H1); +nearmiss (handler.js, note) | SR-05, SR-15, SR-24 | như trên | không | như trên |
| l1-oncall | task.json (size 1→3, +sizeBasis); +hidden/bruteforce.mjs, +nearmiss/answer.json, note | SR-05, SR-16, SR-24 | siêu dữ liệu; bộ chấm | không (đáp án vẫn chỉ trong `hidden/`) | không đổi |
| l2-knights | task.json (size 1→3); +nearmiss/answer.json, note | SR-05, SR-24 | như trên | không | không đổi |
| **l3-reconcile** | task.json: size 2→4, bỏ H4, **`brief` thêm 1 câu định nghĩa "duplicate row"**; +nearmiss/answer.json, note | SR-05, SR-15, SR-16, SR-24 | siêu dữ liệu + bộ chấm + **KHÁC: sửa prompt** | không lộ giá trị đáp án, nhưng làm rõ cách đếm `duplicate_rows_ignored` | **có thể giảm độ khó** (bớt mơ hồ). Cùng prompt cho mọi nhánh nên không thiên về nhánh nào, nhưng là đổi bài |
| l4-startup-order | task.json (size 2→3); +nearmiss/answer.json, note | SR-05, SR-24 | như trên | không | không đổi |
| s1-sec-review | task.json (size 3→1); hidden/issues.json định dạng lại + thêm `bonus` (2 mục) và `note`; +nearmiss/findings.json, note | SR-05, SR-17, SR-24 | bộ chấm + siêu dữ liệu | không (danh sách 7 lỗi và 3 decoy giữ nguyên; `bonus` chỉ nằm trong `hidden/`) | `bonus` không phạt/không tính điểm ⇒ không đổi điểm; đối xứng |

Ba điều cần xác nhận:

1. **Chỉ bộ chấm hoặc siêu dữ liệu?** KHÔNG ĐẠT, vì `l3-reconcile` đổi `brief` (commit `096e47d`, SR-16). Chín bài còn lại đạt.
2. **`hidden/` không vào workspace/prompt agent thấy?** Đạt. `bench/vs-claude/harness/run.mjs:212` chỉ chép `hidden/` vào thư mục chấm `test-hidden` SAU khi agent chạy xong; `copyTree` bỏ qua `test-hidden`; `run.mjs:251` có mẫu phát hiện agent chạm `hidden/`. Thay đổi trong `hidden/` (near-miss, bruteforce, bonus) không đổi điều agent thấy.
3. **Đối xứng giữa prompt gốc và prompt cải thiện?** Đạt về cơ chế: harness dùng một `brief` cho mọi nhánh; bộ chấm chung. Riêng `l3` là thay đổi prompt nên cần quyết định riêng (xem §3).

Lưu ý khác (không chặn): `size` đổi theo SR-05 (c1 2→1, c2 2→1, c5 5→1, l1 1→3, l2 1→3, l3 2→4, l4 2→3, s1 3→1; c3, c4 thêm `sizeBasis`). `size` không vào hash `hidden/` nhưng vào hash `task.json` và có thể đổi cỡ mẫu nếu `holdout-sample-size.mjs` dùng `size` (script đọc mã: không dùng `size`; cỡ mẫu chỉ phụ thuộc `study-cloud/runs.jsonl`, nên **không dự kiến đổi**; sẽ xác nhận bằng `--size` sau khi khóa).

## 3. Đề nghị cho research-lead

Chọn một:
- **(A) Chấp nhận** thay đổi `brief` của l3 là làm rõ bộ chấm (câu thêm chỉ định nghĩa quy ước đếm mà bộ chấm `exact` đã dùng) và ghi nó như sai lệch có tên trong §9, vì chưa có lượt A/B nào nên không có nhánh nào đã chạy trên prompt cũ. Khi đó data-scientist chạy `--hash` và tiếp bước (4)–(6).
- **(B) Không chấp nhận**: hoàn lại `brief` l3 (ngoài phạm vi của hạng mục này: `bench/` không được sửa) hoặc thay l3 bằng bài khác, tính lại bộ giữ lại.

Đề nghị của data-scientist: (A), kèm ghi rõ trong §9 rằng l3 có prompt khác prompt dùng cho dữ liệu `study-cloud` (dữ liệu phương sai SS-1…SS-3 của l3 đo trên prompt cũ ⇒ ước phương sai của l3 có thể hơi lệch, nhất là SD điểm). Đây là quyết định phương pháp, không phải của data-scientist.

## 4. Ghi chú EOL / hash

- `holdout-sample-size.mjs` băm qua `sha256` của `prereg-tests.mjs:190`, hàm này gọi `norm(buf)` chuẩn hóa CRLF→LF trước khi băm (đúng như ghi chú "Quy ước" của script). Hash thư mục dựng từ các dòng nối bằng `\n`, nên không phụ thuộc EOL của máy.
- `git config core.autocrlf` = `true`; `.gitattributes`: `* text=auto`. `git ls-files --eol` cho tệp bài: `i/lf w/crlf` (index LF, working tree CRLF trên Windows). Vì script chuẩn hóa EOL nên hash Windows = hash Linux = hash blob git cho tệp văn bản. Rủi ro còn lại: tệp nhị phân hoặc tệp có CR tình cờ giữa dòng sẽ không chuẩn hóa như nhau; `.gitattributes` chỉ đánh dấu `*.png` binary, và các bài giữ lại không có `.png`. Không sửa script.
- Việc đối chiếu từng hash với `git show 902fc78:<path>` sẽ làm ở bước (4) sau quyết định (A).
- Báo cáo của người điều phối về "lệch hash cả 10 bài" khớp diff: mọi bài đều đổi `task.json` hoặc `hidden/`.

## 5. Còn lại sau quyết định

`--hash` → cập nhật `holdout-lock.json` và bảng trong `holdout-and-sample-size.md` → `--size`, `--check` → kiểm CT-09/12/13/19 (đọc từ lock hay ghi cứng) → §9 `preregistration.md` (hash cũ → mới, bằng chứng §1, cỡ mẫu trước/sau) → `typecheck`, `npm test`.
