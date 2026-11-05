# Sổ chạy đợt 3e, phần local: E3, E4, E5, E6 (máy giám đốc, gói Max)

Phân loại dữ liệu: **Nội bộ**. Bài tổng hợp, không có dữ liệu thật. Ghi trước lượt local đầu tiên theo `docs/research/run-plan.md` §5.4.

| Mục | Giá trị |
|---|---|
| Duyệt | Giám đốc duyệt chạy E4–E6 local lúc 10:02 ngày 4/11/2026, giờ VN. E3 chuyển sang local theo sai lệch ghi lúc 10:05 (§9 khối (c)) |
| Commit ghim local | `6c454f67518244af6724ca68037613f99e34ab46`: có D9–D11 và D10b. Worktree `C:\Users\admin\ccoding-vs-claude\ccoding-3e`, `npm ci` và `npm run build` xong |
| Server | Cổng 7425, `ccoding.local.json`: `runner: process`, chỉ `claude-cli` (đăng nhập gói Max, không khóa API), chặn web bằng `--disallowedTools WebFetch,WebSearch`. Thư mục dữ liệu riêng `ccoding-3e\data`. **Không đụng server 7420** |
| Claude Code CLI (máy giám đốc) | 2.1.312 (cloud E1, E2: 2.1.318). Từ D11, SR-03 ghi phiên bản này vào từng dòng |
| Kịch bản | `run3e.ps1` chạy tuần tự E3 → E4a → E4b → E5 → E6a → E6b → E6c. Runner thoát mã 3 (hạn mức) thì chờ 20 phút rồi chạy lại; khóa đã xong được bỏ qua. Tạo tệp `STOP-3e` để dừng |
| N của E4 | Cố định trước theo §9 khối (a) bước 5: R_E4 = 16 (B7cab, B7cabO × g1, g2, g5, g6), R_B6 = 32 (B6 × g3, g4); tổng 192 lượt. q̂ của E2 chỉ để mô tả, không đổi N |
| Timeout | E3, E5, E6b, E6c: 40 phút. E4, E6a: 20 phút |
| Không xem điểm | Log ghi vào tệp, người điều phối chỉ đếm số lượt. Phòng Nghiên cứu phân tích khi đủ N |

## Diễn biến

| Giờ VN (4/11/2026) | Sự việc |
|---|---|
| 11:12 | Bắt đầu E3 |
| 12:03 | E3 xong: 6/6 lượt, exit 0, không chạm hạn mức. Kết quả ở `results/large-pilot`, sổ chạy riêng `large-pilot/RUNLOG.md`. Bắt đầu E4a |
| 12:19 | **Đổi thứ tự** theo §9, mục "E3 xong; E5 tạm giữ" ghi lúc 12:20, trước lượt đầu của E4b, E5 và E6. Kịch bản `run3e-b.ps1` chạy nền. Khi `run3e.ps1` bắt đầu E4b, nó tạo `STOP-3e` kèm `STOP-3e.auto`, để `run3e.ps1` dừng trước E5. Sau đó nó chạy tiếp E4b (bỏ qua khóa đã xong), rồi E6a, E6b, E6c. **E5 tạm giữ**, chờ Phòng Nghiên cứu thiết kế lại và giám đốc duyệt. Tệp `STOP-3e` do giám đốc tạo vẫn dừng cả hai kịch bản |
| 12:50 | **Giám đốc duyệt** trong phiên: (1) bước 2 của B-14, A/B `stablePrefix`, 96 lượt, local, sau E6, đúng mục đăng ký trước ở §9; (2) E5 thiết kế lại (E5′, ép làn đầy đủ, khoảng 40 lượt), local, sau E6. E5′ chỉ chạy khi mục §9 V4-3e-E5′ của BRIEF-17 đã gộp và D12 (arm `B0F`, `B1F`) đã gộp. Bước 2 chỉ chạy khi dòng hash mốc khóa đầu `results/b14-step2/RUNLOG.md` đã điền. Thứ tự dự kiến: E4 → E6 → E5′ → B-14 bước 2. Kiểm sandbox trong WSL để sau |
| 18:17 | E4a xong 128/128 khóa. Bắt đầu E4b. Từ dòng 18:18, Claude Code CLI tự cập nhật 2.1.312 → 2.1.318 (sai lệch ghi ở `gates-main/RUNLOG.md`) |
| 19:49–19:53 | E4b xong 64/64 khóa. `run3e.ps1` thấy `STOP-3e` (do `run3e-b.ps1` tạo) nên dừng trước E5, đúng bàn giao. `run3e-b.ps1` chạy lại E4b để bỏ qua khóa đã xong, rồi bắt đầu **E6a lúc 19:53**. E4: 192/192 khóa, 5,10 giờ máy, khoảng 54 USD (`gates-main/RUNLOG.md`) |
| 21:04 → 5/11 02:05 | E6a xong 21:04 (21/21). E6b chạm hạn mức 21:08–22:08 (3 lần thoát mã 3), xong 00:15 (14/14). E6c xong 02:05 (20/21; `t2-orders__B0__r3` lỗi hạ tầng, chưa chạy lại). Chi tiết ở `h6-3e/RUNLOG.md` |
| 5/11 02:07 → 03:46 | E5′ r1 (4 khóa, 2 lần chạm hạn mức). Kiểm nhiễu sau r1 dừng vì pha `review` vắng ở cả hai arm (cổng B-02 bỏ reviewer khi xanh). `STOP-E5F`, chờ giám đốc. Chi tiết ở `b15f-main/RUNLOG.md` |
| 5/11 10:05 | **Giám đốc quyết** (trong phiên): (1) E5′ chạy tiếp, coi `review` là pha có điều kiện (§9 V4-3e-E5′ "Sai lệch (3)"); (2) **duyệt E7 và E8**, chạy sau bước 2 của B-14 (§9 V4-3f, mục "Dự kiến"); (3) tắt tự cập nhật Claude Code, ghim 2.1.318 cho phần còn lại |
| 5/11 10:10 → | `run3e-d.ps1`: ghim CLI, khởi động lại 7425/7426, **E6 đủ 56/56** lúc 10:14 (chạy lại `t2-orders__B0__r3`), E5′ r2 từ 10:14:52. Bước 2 B-14 dựng xong 10:15 (worktree `0d216eb`, tiền điều kiện (7) 23/23), chờ E5′ xong; sự cố khởi động sớm 10:16–10:18 đã dừng (`b14-step2/RUNLOG.md`) |

## Nguồn p của H6 cho E6 (ghi trước lượt E6 đầu tiên, theo V4-3e-E6 (6))

Ghi lúc 4/11/2026 khoảng 13:50 giờ VN. Lúc này **chưa có lượt E6 nào**, vì `run3e-b.ps1` đang chờ tệp `GO-E6`.

| Mục | Giá trị |
|---|---|
| Bản sửa thống kê | D12 (T-20261104-123633-378), gộp vào `perf/vs-claude-loop` ở commit `57148de`. Sửa T-1 (suy biến không bao giờ cho "tương đương"), B-1 (NaN), C-2 (nhãn H6 lấy từ `h6Combine`) cùng các mục còn lại của K2 |
| `bench/vs-claude/lib/stats.mjs` | commit `9c3136c9345ee54df27fe52e193aaa163af1662d`, blob `fa048e744bffbb5e210fb106ef49607a38f5c69e` |
| `bench/vs-claude/analyze.mjs` | commit `ef8b78fa7041c2a605f66fc46ffd0289d6bf51e5`, blob `7c69f438e693ff810b1870cbf84405ce9c6a26c8` |
| Test | 12 ca F1–F12 thành test: `bench/vs-claude/test/stats-k2.test.mjs`, `analyze-k2.test.mjs`. Trên Linux sau khi gộp: `npm test` 415/415 chạy ba lần, `npm run test:bench` 245/245, `holdout-sample-size --check` OK, `consistency-check` đạt, `token-analysis --check` OK, test của `docs/research/analysis` 48/48 |
| Kết luận theo (6) | SR-26 đã gộp, có test, và hash đã ghi ở đây trước lượt E6 đầu. Vì vậy H6 dùng **p của SR-26** đúng quy tắc trần và suy biến v2.1 (a)–(d), không dùng phương án lùi |
| Nơi chạy E6 | Server và runner 7425 vẫn ở `6c454f6`. Mã thống kê chỉ dùng khi phân tích, không ảnh hưởng lúc chạy |

Ghi chú: CTO của D12 chưa nghiệm thu vì `npm test` đỏ bốn test holdout và `--check` lệch hash. Nguyên nhân là nhánh nhiệm vụ dựng từ `e12e037`, trước khi BRIEF-16 khóa lại holdout. Sau khi gộp vào HEAD (đã có khóa mới), cả hai đều xanh như bảng trên. `results/study-cloud-final` không có `runs.jsonl`, nên không chạy lại được.

## Hạn mức (Q) trong E4a

- **14:28 → 17:09 giờ VN:** runner thoát mã 3 vì hạn mức 5 giờ của gói Max. Hàng đợi báo mở lại lúc 16:50. `run3e.ps1` thử lại mỗi 20 phút, 8 lần thoát ngay; lần 9 lúc 17:09 chạy tiếp.
- **Lượt bị cắt:** lượt đang chạy khi chạm hạn mức được runner chạy lại đúng khóa đó, theo §4.1 (Q).
- **Nguyên nhân góp phần:** BRIEF-18 và D13 chạy cùng lúc trên cùng gói, khoảng 15 M token, trong khi E4a đang chạy. CTO của BRIEF-18 cũng không chạy được vì chạm hạn mức.
- **Từ nay:** không giao nhiệm vụ CCoding mới trong lúc đợt đo đang chạy, trừ khi giám đốc yêu cầu.
- Thời gian chờ giữa hai cửa sổ không tính vào trần 15 giờ của E4 (khối (a) bước 4).
- E4a đã dùng cửa sổ 1, phần còn lại chạy ở cửa sổ 2, bắt đầu 16:50.

## Sự cố 11:10 ngày 5/11: ứng dụng desktop khởi động lại

- Ứng dụng Claude desktop khởi động lại lúc khoảng 11:10. Mọi tiến trình con bị kết thúc theo: `run3e-d.ps1`, `b14-run.ps1`, các server 7425, 7426, 7427.
- **11:53:** chạy tiếp bằng `run3e-e.ps1` (E5′ r3…r10) và `b14-run.ps1`, khởi chạy qua WMI để không phụ thuộc vào ứng dụng. Chi tiết ở `b15f-main/RUNLOG.md` và `b14-step2/RUNLOG.md`.
- Server chính 7420 cũng không còn nghe. Không khởi động lại server này: chỉ giám đốc mới khởi động lại nó.
