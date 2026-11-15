# Sổ chạy E4: bộ bài cài lỗi, phần chính (đợt 3e, V4-3e-E4)

Phân loại dữ liệu: **Nội bộ**. Bài tổng hợp, không có dữ liệu thật. Người điều phối chỉ ghi số liệu chạy, **không xem điểm**. Log chạy `logs-3e\E4a.log` và `E4b.log` có cột điểm, nên giữ trên máy giám đốc, không commit.

| Mục | Giá trị |
|---|---|
| Duyệt | Giám đốc duyệt đợt 3e lúc 10:02 ngày 4/11/2026, giờ VN |
| Server 7425 | Máy giám đốc, worktree `ccoding-3e` tại `6c454f67518244af6724ca68037613f99e34ab46`. Mọi dòng ghi đúng commit này (`ccodingCommit`). Xem `results/local-3e/RUNLOG.md` |
| Lệnh | `run3e.ps1`, phần E4a: `--arms B7cab,B7cabO --tasks g1-slug-dedupe,g2-cart-coupon,g5-median-stats,g6-range-merge --repeats 16 --timeout 20`. `run3e-b.ps1`, phần E4b: `--arms B6 --tasks g3-qty-rename,g4-gb-unit --repeats 32 --timeout 20`. Cùng `--out results\gates-main` |
| N cố định trước | 192 khóa, theo §9 khối (a) bước 5: R_E4 = 16 (B7cab, B7cabO × g1, g2, g5, g6), R_B6 = 32 (B6 × g3, g4) |
| Thời gian | Dòng đầu `2026-11-04T05:05:06Z` (12:05 giờ VN), dòng cuối `12:53:03Z` (19:53 giờ VN). Kể cả thời gian chờ hạn mức 14:28–17:09 |
| `runs.jsonl` | sha256 `ca519aeb1f9574c53f5c438b859b777220e5b75c82168f08daee2b158f826ceb`, 203 dòng |

## Kết quả chạy (không có điểm)

| Arm | Khóa `done` | Dòng không `done` | Rò rỉ | Token có trọng số | USD (`pricing.mjs` theo model từng pha) | Thời gian thực |
|---|---|---|---|---|---|---|
| B7cab | 64/64 | 8: 7 hạn mức (cùng khóa `g2-cart-coupon__B7cab__r1`, thử lại khi bị chặn), 1 lỗi | 0 | 6,44 M | 15,87 | 1,60 giờ |
| B7cabO | 64/64 | 1 hạn mức | 0 | 7,39 M | 23,36 | 1,93 giờ |
| B6 | 64/64 | 2 lỗi (`g4-gb-unit__B6__r1`, `r5`), runner chạy lại | 0 | 6,61 M | 15,13 | 1,57 giờ |

- **Tổng:** 192/192 khóa xong. Thời gian máy 5,10 giờ, dưới trần 15 giờ của E4 (khối (a) bước 4). Khoảng 54 USD quy theo bảng giá 5.5, gồm cả token của dòng không `done`.
- **Cửa sổ hạn mức:** cửa sổ 1 (12:05–14:28) và cửa sổ 2 (từ 16:50; chạy lại từ 17:09). Chi tiết ở `local-3e/RUNLOG.md`, mục "Hạn mức (Q) trong E4a".
- Dòng không `done` được loại theo §4.1. Mỗi khóa có đúng một dòng `done`.

## Sai lệch: phiên bản Claude Code CLI đổi giữa chừng

- Claude Code trên máy giám đốc tự cập nhật từ **2.1.312** lên **2.1.318**. Dòng đầu tiên ghi 2.1.318 là lúc `2026-11-04T11:18:11Z` (18:18 giờ VN), đúng lúc bắt đầu E4b.
- **Phạm vi:**
  - E4a: 128 dòng `done`, toàn bộ B7cab và B7cabO, đều 2.1.312;
  - E4b: 64 dòng `done`, toàn bộ B6, đều 2.1.318.
- **Ảnh hưởng:** phép so B7cab với B7cabO (B-16) cùng một phiên bản. B6 (b10 trên g3, g4) chạy ở phiên bản khác, nên không so trực tiếp với E4a.
- **Hệ quả cho phần sau:** E6, E5′ và bước 2 của B-14 sẽ chạy trên 2.1.318, hoặc bản mới hơn nếu CLI lại tự cập nhật. `claudeCliVersion` ghi ở từng dòng. Muốn ghim phiên bản cho phần còn lại thì phải tắt tự cập nhật của Claude Code trên máy giám đốc. Đây là đổi cấu hình máy, nên chờ giám đốc quyết định.
- Phòng Nghiên cứu phân tích theo §9 V4-3e-E4, kèm sai lệch này.
