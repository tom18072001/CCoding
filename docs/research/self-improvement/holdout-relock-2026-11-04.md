# Khóa lại bộ bài giữ lại B-19 — biên bản rà diff (4/11/2026)

Phân loại dữ liệu: **Nội bộ**. Hạng mục S1/K1, BRIEF-16. Người thực hiện: data-scientist.

**TRẠNG THÁI: ĐÃ KHÓA LẠI (4/11/2026).** Rà diff xong; `l3-reconcile` đổi `brief` (xem §2–§3), research-lead chọn phương án (A) nên đã chạy `--hash`, cập nhật `holdout-lock.json` và bảng hash trong `holdout-and-sample-size.md`, `--size`, `--check`. Sai lệch ghi tại `preregistration.md` §9 ("Sai lệch vòng 4 gói 10").

## 1. Bằng chứng chưa có lượt A/B nào của B-19

Commit HEAD lúc kiểm lần đầu: `6c454f6`; kiểm lại ở HEAD `9203887` (nhánh `ccoding/t-20261104-110942-567`) cho cùng kết quả: `git log --all` trên đường dẫn selfimprove/b19/data → 0 dòng; `grep` "selfimprove|B-19" trong `results/` → 0 tệp; không có `data/`; tập nhánh trong `runs.jsonl` không đổi.

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
- Đã đối chiếu `task.json` của c1-iis-ecs, l3-reconcile, s1-sec-review với `tr -d ""` của `git show 902fc78:<path>` rồi `sha256sum`: trùng hash trong lock.
- Báo cáo của người điều phối về "lệch hash cả 10 bài" khớp diff: mọi bài đều đổi `task.json` hoặc `hidden/`.

## 5. Kết quả khóa lại

Quyết định: phương án (A), research-lead. Lệnh và kết quả:

- `node docs/research/self-improvement/holdout-sample-size.mjs --hash` → exit 0; lặp lại lần hai cho cùng đầu ra.
- `--size` → exit 0 (143 dòng); `--check docs/research/self-improvement/holdout-and-sample-size.md` → "OK: 120 dòng bảng trùng đầu ra script", exit 0. Cỡ mẫu không đổi vì `runs.jsonl` của `study-cloud` không đổi (blob `9131f77…`).
- `npm run typecheck` → exit 0. `npm test` → exit 0, 415 test, 410 đạt, 0 lỗi, 5 bỏ qua; CT-09, CT-12, CT-13, CT-19 đều ✔. Bốn test đọc kỳ vọng từ `holdout-lock.json` (không có hash ghi cứng), nên không sửa test.

Hash cũ → mới của 10 bài (đầy đủ):

| Bài | task.json cũ | task.json mới | hidden/ cũ | hidden/ mới | Số tệp ẩn cũ → mới |
| --- | --- | --- | --- | --- | ---: |
| c1-iis-ecs | `cfab976b556d8d03e3b4c65f14a36419c3c3b35f194e4c8c3655fce492202deb` | `0b878cf3081732ba173fedbefd6a209c88a82a56960346044cbfed3133fd8326` | `6565ca2323bc4865d2473454acaf9688182c35fe6c796ee2d8eef921b950e108` | `58f1b5649426a3820077452832626c5020b6754447e0a6851d585e37061435a1` | 2 → 4 |
| c2-burst-alert | `308513e6112e6d73d38ce771568a7d1316437c64870e0cca847a9d916d78cbf8` | `8c2221aa9634f1759a8eca7fe74e97dc6bc35a37f44e93803342b452d8d0d907` | `5277755da8e57382dd844060a24c83c41afe62d67bd18dd24564052eb0a70fc7` | `28078504768236aee575f5151422f05ddcd8ca0f1037b1b339a742f65a71899d` | 2 → 4 |
| c3-shop-bugs | `723e266c61c51416e715d7e35c5a1d1a8eaa79f626b94356f49a32bbdb2b9d9a` | `2049df7b1f04c693938f878024aa32605ebfc8d3faaf7d0a81469a555e97bb7d` | `77b7e695fedaa8ec1b96486be5ca951a71e7a282f3a013bed68326c8f5109494` | `ab8263012fdebd231564d6bc7a42455b1fed5365d49ab619acd20cfb5246ba9d` | 4 → 6 |
| c4-audit-chain | `6ac634a94400520fe25cfe48f0de5e673a3aba8c0549ba9b6b04f583653e1a28` | `1f47afff670612613808a4ae0b4f0567a201972eeb65ff38c47e4e5fc0fcd7fe` | `dec3ef65f5b30b0103528630445d235460e019e511cee3646b0c4904f8a8a433` | `1712f4a0fe429f795a215fcab8d2922765325a49e0195972f16b8409960d2e4e` | 2 → 4 |
| c5-tickets-api | `132988780f1f52fdcab5fad058927911b211cc6d456acc0b96e9c88c5ac9eeaf` | `dfbdeff29a3ea4a64a3ad0a7e7a09d889613a7ae6792f1b5842e116018f7a308` | `2648b012cf765f509aba7004643d8cfd7bc950545b981d93ab419e0e98b7b8e1` | `e63d39e86bf6e198a3a25474bea4539edcb6608d5817d5c0043a591aa8b20bc5` | 2 → 4 |
| l1-oncall | `59c1d04f2e1f6eec6f14619dab134fae2720569d63c3d24d3313f5b8a9903b8c` | `1918a4bb22879aafe8a52fc708e3cf4ca8d5237b0accd0e80f85eaee3217d6ce` | `6dd47dfb85226e100acc7686922a600dbae8cc40c36ba29a0a6c17f1a21551c3` | `d52eb417ca1f23f08e7847a6fb9246e18d37a1c60728b6345e376c583be551a5` | 1 → 4 |
| l2-knights | `9701823e9a5f5f0a7e98a7a32f8b905ca7bf6c2f1482a8e405362e144d1c5171` | `03d0a9ec9486feaae46b7291cb31363381086eb295dcc2189b4b7209300de80b` | `a08e8d994b0618119ed905aa7d6e54d09e7077db87306a59e4fc1fcd52e44588` | `c94b462658a19cace61ca4d3d55082a01cb382f322f5cfa42842afb5992f1c14` | 1 → 3 |
| l3-reconcile | `357593db167c54b4f307b9bb66771910bdb32ab71d857ff1a93a9a24fc055073` | `79810448b4304a3a9ab39acb4f8f906cc41048f961c3820bb3e6649e78aff28f` | `bd033ab3712ab6e5cad7373207deb4e75ebfb48172ec94c49457434331171701` | `0cf7636fc9e4112f6ef8b3b64960f413394f66f6896c3cde14c7126c81a7da54` | 1 → 3 |
| l4-startup-order | `cf69a6939604dfd8ff06480b90aa4f4da693d98a0c107393c24e20ac367e0580` | `027b8cf881ca50511546a499870eb1bc8d95f6f46ae789fb7806cae45435248f` | `25d0003e3e422de9bfd3340f43bc926a2d9c46f4ec87b33612f1d21ddf224b31` | `4f48535743cf47768caa44aee57adc128195bd3d1d57d3c49dd702296152de27` | 1 → 3 |
| s1-sec-review | `8c5f1505c2b8747c91b8f20d657ed0e8d821d5d1ea9a4bcc822d2172cdef1b02` | `2264cb3bcd8488199184c50d39fbb20235ca25c34ca58615366be29136a38e2d` | `278257718ce3da6a4c31b24cff68ad42d550432a4c1de9b94a557bd274614540` | `c306f6dcbc5e0f3bb4672e0139ab8bdf059044af7ba03a2253ab9d7fa3f63f88` | 2 → 4 |

Bộ giữ lại cũ khóa tại `8b0b6c3`; hash mới tính trên nội dung tại `902fc78` (không có commit nào đổi `tasks/` giữa `902fc78` và `9203887`, xem `git diff 902fc78 9203887 --stat -- bench/vs-claude/tasks`).
