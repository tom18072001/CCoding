import os
os.chdir('docs/research')
def load(p): return open(p,encoding='utf-8',newline='').read()
def save(p,s): open(p,'w',encoding='utf-8',newline='').write(s)
def rep(s,a,b):
    assert s.count(a)==1,a[:50]
    return s.replace(a,b)

p='paper/paper.md'
s=load(p)
s=rep(s,"Thiết kế khóa ở `preregistration.md` §9, khối \"Đăng ký trước E7b\" (15/11/2026, BRIEF-26 K1); mục này chỉ tóm tắt, nếu lệch thì §9 là bản đúng. Bản đã đối chiếu: khối E7b (a)–(l) ở §9 và khóa `e7b.*` ở `facts.json`.",
"Thiết kế khóa ở `preregistration.md` §9, khối \"Đăng ký trước E7b\" (15/11/2026, BRIEF-26 K1) cùng \"Phụ lục sai lệch E7b (1)\" và \"(2)\" (15/11/2026, BRIEF-26b K1); mục này chỉ tóm tắt, nếu lệch thì §9 là bản đúng, và phụ lục (2) thắng khi mâu thuẫn với khối chính hay phụ lục (1). Bản đã đối chiếu: khối E7b (a)–(l), phụ lục (1), phụ lục (2) với bảng Quy tắc hiệu lực QH1–QH36, và khóa `e7b.*` ở `facts.json`.")
i=s.index("Trần 16 suy từ mốc thay thế")
j=s.index("**Thước đo.** Recall trên 64")
new=("Trần 16 suy từ mốc thay thế (số lượt của R3 ở E7: phân vị 90 % bằng 8, lớn nhất bằng 11), vì E7 không ghi số lượt của R1/R2; lý do và giới hạn ở §9 (b). Hai arm khác nhau ở cả model lẫn trần, nên so R2b với R1b là so gói \"Opus + trần 16\" với gói \"Sonnet + trần hiện hành\", không tách tác động riêng của model (QH2).\n\n"
"**Cách chạy (phụ lục (2) (a), QH3).** **Một tiến trình** `run.mjs` với `--arms R1,R2`; hai arm **xen kẽ theo bảng Latin** như E7, cùng thứ tự mục `20261104|e7|order`. Mỗi arm CCoding là một app riêng nạp tệp cấu hình của chính arm qua `--arm-config R1=<tệp>,R2=<tệp>` (cấu hình theo arm, D24; dữ liệu app ở `<--ccoding-data>/w1` và `/w2`); `--selected` dùng danh sách chốt của `selected.json`, không chạy bước chọn mẫu. Dòng `runs.jsonl` ghi `extraConfigSha256` của tệp của chính arm, nên kiểm được từng arm khớp `SHA256SUMS` (QH6). **Điều kiện cứng:** bản ghim phải chứa D24; thiếu D24 thì E7b hoãn. Phương án hai tiến trình song song của bản đăng ký đầu đã bị bỏ và không còn áp dụng; nó không phải chạy xen kẽ. Không chạy lại R3 (Claude Code đơn): không giả thuyết nào của E7b dùng R3 (§9 (d) \"R3 (Claude Code đơn): không chạy lại\", QH34).\n\n"
"**Nguồn kiểm và đính chính.** `capped` lấy từ `acceptTurnCapped` của dòng `runs.jsonl`; `authSource` của các lượt `accept` phải là đúng `[\"none\"]`; mỗi dòng `done` có đúng một lượt `accept` (QH5, QH10, QH11). Đính chính: trần token công cụ (`toolInputBudget`) chỉ có hiệu lực ở runtime `api`, còn E7b chạy `claude-cli` chỉ với trần lượt, nên đe dọa \"trần token cắt R2b trước 16 lượt\" không áp cho E7b (phụ lục (2) (c); kết luận từ đọc mã, không phải đo). Kiểm hạ tầng sai thì bộ phân tích chỉ in lỗi kiểm, không in nhãn hay nhánh (QH35).\n\n")
s=s[:i]+new+s[j:]
s=rep(s,"Lượt `unread` tính là không chặn (cách chính), kèm hai độ nhạy: tính là chặn, và bỏ cặp.",
"Lượt `unread` tính là không chặn (cách chính), kèm ba độ nhạy: S1 tính là chặn, S2 bỏ cặp, S3 giữ lại cặp thiếu do hết giờ (QH13–QH15). Phân bố `acceptTurns` và `acceptToolCalls` chỉ mô tả (QH29).")
s=rep(s,"Nhãn kết luận chỉ có \"khác nhau\" hoặc \"chưa phân biệt được\" (không phải \"tương đương\"). Kết quả P1, P2: `[chưa chạy]`.",
"Nhãn kết luận có ba giá trị: \"khác nhau\", \"chưa phân biệt được\" và \"chưa kết luận\" (khi hai phép khác chiều hoặc chỉ một phép có ý nghĩa, QH19); không có \"tương đương\". Một arm có hơn 3 cặp thiếu, hoặc hai arm chênh từ 3 cặp thiếu, thì nhãn và nhánh là \"chưa kết luận\" (QH21, QH22). Kết quả P1, P2: `[chưa chạy]`.")
s=rep(s,"và đứng được ở cả ba cách tính `unread`.","và đứng được ở cả cách chính lẫn ba độ nhạy S1–S3 (QH16, QH27).")
s=rep(s,"mô hình có thể trôi giữa 13/11 và lúc chạy (§9 (l)).","mô hình có thể trôi giữa 13/11 và lúc chạy (§9 (l)); hai app trong một tiến trình vẫn chung đăng nhập và hạn mức (phụ lục (2) (a)).")
save(p,s)

p='facts.json'
s=load(p)
s=rep(s,"BRIEF-26 (15/11/2026, K3): tham số thiết kế khóa trước của E7b (preregistration.md §9, khối 'Đăng ký trước E7b'). CHƯA CHẠY","BRIEF-26 (15/11/2026, K3), cập nhật BRIEF-26b (15/11/2026, K3): tham số thiết kế khóa trước của E7b (preregistration.md §9, khối 'Đăng ký trước E7b' và Phụ lục sai lệch E7b (2), bảng QH1–QH36). CHƯA CHẠY")
s=rep(s,'"e7b.runMode": "hai tiến trình song song, cùng seed thứ tự (không xen kẽ)",',
'"e7b.runMode": "một tiến trình xen kẽ bảng Latin, --arms R1,R2, --arm-config R1=<tệp>,R2=<tệp> (D24), --selected <tệp>",\n    "e7b.requiresD24": true,\n    "e7b.authSourceLocked": "[\\"none\\"]",\n    "e7b.acceptCallsPerDoneRow": 1,')
s=rep(s,'"e7b.rerunR3": false,','"e7b.rerunR3": false,\n    "e7b.rerunR3Ref": "preregistration.md §9 (d)",\n    "e7b.toolInputBudgetAppliesToE7b": false,\n    "e7b.missingPairsPerArmMax": 3,\n    "e7b.missingPairsArmGapMin": 3,\n    "e7b.labels": "khác nhau | chưa phân biệt được | chưa kết luận",')
save(p,s)

p='CHANGELOG.md'
s=load(p)
mark="## Vòng 4, gói 19 (T-20261115-094542-2d1"
new="""## Vòng 4, gói 19b (T-20261115-105245-bbd, BRIEF-26b, 15/11/2026): Phụ lục sai lệch E7b (2), E7b chạy xen kẽ một tiến trình, chưa chạy

Không sửa `src/`, mã `bench/`; không gọi LLM; **không có số kết quả E7b**. Dữ liệu: Nội bộ. Mục này chỉ dẫn mã QH đã có trong bảng của phụ lục (2); `BRIEF-26.md` là đề bài lưu trữ, không sửa.

- **Phụ lục sai lệch E7b (2) (K1, `preregistration.md` §9, chỉ thêm):** đổi cách chạy, nguồn kiểm theo dòng `runs.jsonl` của D24, đính chính P2, luật "hết giờ" (QH30), kiểm hạ tầng (QH35) và bảng Quy tắc hiệu lực QH1–QH36. Khi mâu thuẫn với khối chính hay phụ lục (1) thì phụ lục (2) thắng.
- **Lý do đổi từ hai tiến trình sang một tiến trình xen kẽ (QH3):** D24 gỡ ràng buộc "một `--config` mỗi tiến trình" (`--arm-config`, `--selected`). Một tiến trình giữ đúng thiết kế E7: cùng thứ tự mục và cùng thứ tự chạm lượt, bảng Latin, không có hai tiến trình tranh hạn mức. Phương án hai tiến trình song song bị bỏ, **không còn áp dụng và không được gọi là "xen kẽ"**. Thiếu D24 trong bản ghim thì E7b hoãn.
- **Đính chính P2 về `toolInputBudget` (phụ lục (2) (c)):** `maxInputTokens` được truyền ở `src/orchestrator.ts:3877` nhưng chỉ đọc ở `src/runtimes/api.ts:378`; `claude-cli` (runtime của E7b) chỉ nhận `--max-turns` và `capped` chỉ có `'turns'`. Đe dọa "trần token cắt R2b trước 16 lượt" vì vậy **không áp cho E7b**. Kết luận từ đọc mã, không phải đo. Điều này sửa đoạn "Đe dọa mới" ở (P2) của phụ lục (1).
- **Rà chỗ dẫn "§9, mục Có chạy lại R3" (minor 10 của review):** `paper/paper.md` §6.7 từng dẫn sai mục; đã sửa về §9 (d) "R3 (Claude Code đơn): không chạy lại". Trong `docs/research/` chỉ còn `BRIEF-26.md:40` (đề bài lưu trữ, không sửa; câu gốc "Có chạy lại R3 (Claude Code đơn) không", không phải chỗ dẫn mục).
- **K3 (@academic-writer):** `paper/paper.md` §6.7 mô tả E7b xen kẽ một tiến trình với `--arm-config` (D24), nhãn ba giá trị gồm "chưa kết luận", ba độ nhạy S1–S3, vẫn "đã đăng ký, chưa chạy" và `[chưa chạy]`; `facts.json` nhóm `e7b.*` cập nhật `runMode`, thêm `requiresD24`, `authSourceLocked`, `acceptCallsPerDoneRow`, `rerunR3Ref`, `toolInputBudgetAppliesToE7b`, ngưỡng cặp thiếu và nhãn; không thêm số đo.
- **Ghi chú:** câu "hai tiến trình song song … (không xen kẽ)" ở mục gói 19 bên dưới là lịch sử của bản đăng ký đầu, nay bị phụ lục (2) thay.

"""
s=rep(s,mark,new+mark)
save(p,s)
