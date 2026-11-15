# Lỗi chập chờn của `npm run test:bench` (D28b · S3 · K2)

Dữ liệu: **Nội bộ**. Số đo trên máy văn phòng (Windows 11, Node 24; `node --version` ≠ 22, chưa kiểm trên CI Node 22 — chờ CI sau khi Tom đẩy nhánh).

## Kết luận

1. **`assertOwnRepo` không tái hiện**: 10 lần (bảng A) + 10 lần (bảng B) + 4 lần có tải (bảng C) + 300 vòng thăm dò = 0 lần "không phải gốc repo git riêng". Xác suất bỏ sót nếu lỗi đỏ 1/3 số lần: (2/3)^20 ≈ 0,03% cho 20 lần chạy toàn bộ. Không sửa `lib.mjs` (không sửa mò).
2. **Lỗi chập chờn thật tìm được là khác**: ở lần 10 của bảng A, `SR-24: nearmiss < oracle = 1,00 …` đỏ (`oracle` chấm 18/19 = 0,947) vì bài `t4-perf` có test ẩn đo thời gian (< 1000 ms, tốt nhất trong 3 lần) nên đỏ khi máy bận. Sửa ở test: `gradeOracle` trong `bench/vs-claude/test/nearmiss-sr24.test.mjs` chấm lại oracle tối đa 3 lần; kèm test `gradeOracle thử lại…` (đỏ với mã cũ vì hàm chưa tồn tại; oracle sai thật vẫn đỏ vì cả 3 lần đều < 1).
3. Lỗi `assertOwnRepo` ở S1/S4 của D28 vẫn chưa rõ nguồn; giả thuyết hợp lý nhất (chưa chứng minh) là máy quá tải lúc đó. Nếu tái xuất hiện, chạy lại `thăm dò 300 vòng ở mục Loại trừ giả thuyết.

## Bảng A — `test:bench` tuần tự, mã cũ + `--test-force-exit` (tạm)

| Lần | Thời gian | Exit | Kết quả |
|---|---|---|---|
| 1 | 59 s | 0 | pass |
| 2 | 78 s | 0 | pass |
| 3 | 75 s | 0 | pass |
| 4 | 89 s | 0 | pass |
| 5 | 73 s | 0 | pass |
| 6 | 86 s | 0 | pass |
| 7 | 87 s | 0 | pass |
| 8 | 68 s | 0 | pass |
| 9 | 88 s | 0 | pass |
| 10 | 89 s | 1 | **fail** — `bench/vs-claude/test/nearmiss-sr24.test.mjs`, ca `SR-24: nearmiss < oracle = 1,00 và nearmiss > null ở từng bài` (28644 ms): oracle t4-perf = 0,947 (thời gian tốt nhất vượt ngưỡng) |

## Bảng B — sau bản sửa `gradeOracle`, chuỗi 10 lần xanh liên tiếp (đếm lại từ bản sửa)

| Lần | Thời gian | Exit |
|---|---|---|
| 1 | 56 s | 0 |
| 2 | 54 s | 0 |
| 3 | 53 s | 0 |
| 4 | 86 s | 0 |
| 5 | 66 s | 0 |
| 6 | 92 s | 0 |
| 7 | 74 s | 0 |
| 8 | 74 s | 0 |
| 9 | 56 s | 0 |
| 10 | 87 s | 0 |

Sau chuỗi này chỉ có thay đổi ở `e8-arms.test.mjs`, `plan-only-arms.test.mjs` (đóng server, xem mục Handle) và `test/force-exit.test.ts`; các lần chạy kiểm chứng cuối được ghi trong báo cáo bàn giao.
Vì đạt 10 lần xanh: giữ `--test-force-exit` trong `test:bench` và chuyển `test:bench` sang `FORCE_EXIT`.

## Bảng C — `test:bench` song song với `npm test` (không tính vào chuỗi xanh)

| Lần | `test:bench` | Exit | `npm test` cùng lúc |
|---|---|---|---|
| 1 | 184 s | 0 (fail 0) | exit 0 ở lần thấy được, sau đó 1 |
| 2 | 177–179 s | 0 | exit 1 |
| 3 | 171–181 s | 0 | exit 1 |
| 4 | 162 s | 0 | — |

Lưu ý trung thực: do một vòng lặp cũ còn chạy ngầm, các hàng của bảng này bị trộn; `run-L-*.log` đều `fail 0`. Cả 4 lần `test:bench` xanh dưới tải, **không tái hiện `assertOwnRepo`** ⇒ giả thuyết tranh %TEMP%/khóa git bị loại ở mức này. Phát hiện phụ ngoài phạm vi: `npm test` đỏ khi chạy dưới tải (ca "kế hoạch thấy năng lực công cụ từng người…", "repo dự án dùng chung…", do thời gian) — để S2/S4 biết.

## Loại trừ giả thuyết cho `assertOwnRepo`

Thăm dò 300 vòng: `mkdtemp` + `git init` + `rev-parse --show-toplevel` + `assertOwnRepo`.

| Giả thuyết | Bằng chứng | Loại? |
|---|---|---|
| `rev-parse` lỗi tạm thời (status ≠ 0, `index.lock`) | 0/300 vòng có status ≠ 0; `assertOwnRepo` không đụng index | Loại ở mức đo |
| Đường dẫn 8.3 | `os.tmpdir()` và `realpathSync.native(os.tmpdir())` trùng nhau; `realPath()` còn dùng native | Loại (không có thành phần dạng 8.3) |
| Hoa/thường, `/` so với `\` | `git` trả `C:/…`, `native` trả `C:\…` ở 300/300 vòng, nhưng `realPath()` hạ chữ thường + native nên bằng nhau; `bad = 0` | Loại |
| Hai test dùng chung thư mục / trùng tên `mkdtemp` | 300 tên `mkdtemp` không trùng (`dup = 0`); `e7.test.mjs` và `tasks-dir-d23.test.mjs` mỗi test tự `mkdtemp` | Loại |
| `%TEMP%` tích tụ | thăm dò dọn từng thư mục; 24 lần chạy toàn bộ không đổi hành vi | Loại ở mức đo |
| Tải đồng thời | bảng C, 0 lỗi | Không tái hiện |

## Handle/server trần trong `bench/vs-claude/test/`

- `e8-arms.test.mjs` (2 chỗ, dòng ~53 và ~99) và `plan-only-arms.test.mjs` (dòng ~112) dùng `srv.close()` trần. Đã đổi thành chờ `close` kèm `closeAllConnections()`; hai tệp chạy riêng 13 pass, 0 fail.
- Không có `listen`/`createServer` khác trong thư mục này.

## Chuỗi 10 lần trên bản cuối (D30 · K2)

Dữ liệu: **Nội bộ**. Lệnh: `npm run test:bench` (script có `--test-force-exit --test-timeout=300000`), Windows 11, Node v24.14.0, mỗi lần một vòng, tuần tự, không chạy lệnh test nào khác cùng lúc.
Commit đo: `d79ad430` (gồm bản sửa `DEFAULT_DENY` của K3 và kết quả K1). Sau chuỗi chỉ sửa chú thích và tài liệu (`test/force-exit.test.ts`, `test/helpers.ts`, `docs/`), không sửa mã chạy. Log: `.scratch/k2/run-<n>.log`, `.scratch/k2/summary.txt`.

| Lần | Thời gian | Kết quả | Số test | Ca đỏ |
|---|---|---|---|---|
| 1 | 53 s | pass (exit 0) | 295 (pass 295, fail 0) | không |
| 2 | 53 s | pass (exit 0) | 295 (pass 295, fail 0) | không |
| 3 | 52 s | pass (exit 0) | 295 (pass 295, fail 0) | không |
| 4 | 51 s | pass (exit 0) | 295 (pass 295, fail 0) | không |
| 5 | 52 s | pass (exit 0) | 295 (pass 295, fail 0) | không |
| 6 | 52 s | pass (exit 0) | 295 (pass 295, fail 0) | không |
| 7 | 53 s | pass (exit 0) | 295 (pass 295, fail 0) | không |
| 8 | 53 s | pass (exit 0) | 295 (pass 295, fail 0) | không |
| 9 | 53 s | pass (exit 0) | 295 (pass 295, fail 0) | không |
| 10 | 52 s | pass (exit 0) | 295 (pass 295, fail 0) | không |

**10/10 xanh liên tiếp**, không lần nào đỏ nên không cần sửa mã. Đây là số đo trên một máy (Windows, Node 24); chưa kiểm trên CI Node 22.
