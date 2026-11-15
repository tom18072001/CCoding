# Phòng Dev, gói D28b: test force-exit đỏ trên Node 22; bật --test-force-exit cho mọi lệnh test; tìm lỗi chập chờn của test:bench

**Gói vừa: 3 hạng mục. Ngân sách 6M token.** Giao 15/11/2026. Việc nối của D28 (T-20261115-183715-207): làm tiếp trên nhánh `ccoding/t-20261115-183715-207`.

**Căn cứ:** biên bản CTO của D28 (chưa nghiệm thu) và CI GitHub của nhánh D28.
- **CI đỏ 2/4 ô** (lượt `43722751961`: ubuntu Node 22 và windows Node 22).
  - Test hỏng: `test/force-exit.test.ts`, ca `script "test:research": test treo + giữ handle mở`.
  - Trên Node 22, lệnh vẫn thoát mã ≠ 0 đúng hạn. Nhưng TAP chỉ báo tên **tệp** (`not ok 1 - …/hang.test.mjs`, `failureType: 'testTimeoutFailure'`, `error: 'test timed out after 1500ms'`), không có tên test bên trong ("treo vô hạn").
  - `assert.match(r.out, /treo vô hạn/)` vì vậy đỏ trên Node 22. Node 24 (máy văn phòng) thì xanh. Gói không được gộp khi CI chưa xanh 4/4.
- **`--test-force-exit` mới bật cho `test:research`.**
  - `test`: libuv sập khoảng 1/3 lần toàn bộ (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, theo chú thích trong `test/force-exit.test.ts`).
  - `test:bench`: đỏ 1/3 lần với lỗi "không phải gốc repo git riêng" (`assertOwnRepo` ở `bench/vs-claude/e7/lib.mjs`). Lỗi này lặp ở cả S1 lẫn S4 của D28; nguyên nhân chưa rõ. Một lỗi chập chờn trong `test:bench` sẽ làm hỏng ngẫu nhiên các nhiệm vụ có `strictChecks`.
  - Còn khoảng 20 tệp test dùng `srv.close()` trần. `closeServer` (`test/helpers.ts`) chờ cố định 50 ms, chỉ giảm xác suất.
- **Thời lượng CI thật** (người điều phối đo bằng `gh`, 12 lượt thành công gần nhất): ubuntu tối đa 2–3 phút; windows Node 22 tối đa 9 phút (TB 7); windows Node 24 tối đa 8 phút (TB 6). `timeout-minutes: 20` bằng khoảng 2,2 lần lượt dài nhất.
- **Bằng chứng K1 của D28 còn thiếu:** bảng 12 lần chạy riêng 4 tệp và danh sách handle theo tệp:dòng.

**Phạm vi:**
- **Được sửa:** `test/`, `bench/vs-claude/test/`, `bench/vs-claude/e7/lib.mjs` (chỉ nếu nguyên nhân lỗi chập chờn nằm ở đó, kèm test), `package.json` (chỉ script test), `docs/` (trừ `docs/research/`).
- **Không sửa:** `src/` (trừ khi handle mở nằm trong mã sản phẩm; nêu rõ và kèm test), `bench/vs-claude/results/`, `docs/research/`, `.github/workflows/ci.yml`.
- Không chạy benchmark, không gọi `claude -p` thật.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:bench`, `npm run test:research`.

## Hạng mục

**K1 — senior-swe: test force-exit không phụ thuộc phiên bản Node; đóng handle có chờ sự kiện; bật cờ cho `npm test`**
- **`test/force-exit.test.ts`:** kiểm "test treo bị báo đỏ vì quá hạn" bằng dấu hiệu có ở cả Node 22 và 24 (vd. `testTimeoutFailure` hoặc `timed out`, hoặc tên test bên trong), không bằng tên test riêng của một phiên bản.
  - Ghi trong chú thích: Node 22 báo ở mức tệp, Node 24 báo ở mức test.
  - Có ca test cho cả hai dạng đầu ra (chuỗi TAP mẫu của Node 22 và 24 ở căn cứ).
- **`closeServer`:** chờ sự kiện `close` của server (và đóng kết nối còn mở), không chờ cố định.
- Chuyển mọi chỗ `srv.close()` trần trong `test/` sang `closeServer`. Liệt kê tệp:dòng trong `docs/`.
- **Bật `--test-force-exit` cho `test`** khi `npm test` xanh **10 lần liên tiếp** trên máy văn phòng với cờ. Ghi bảng 10 lần (thời gian, kết quả) trong `docs/`. Không đạt thì để nguyên, ghi lỗi nguyên văn và nguyên nhân tìm được.
- Bổ sung bảng 12 lần chạy riêng 4 tệp của D28 (`web`, `ux3`, `ux4`, `selfimprove-route`) với cờ.

**K2 — backend-dev: lỗi chập chờn "không phải gốc repo git riêng" của `test:bench`; bật cờ cho `test:bench`**
- Chạy `npm run test:bench` ít nhất 10 lần trên máy văn phòng; ghi tệp test và ca nào đỏ, thông báo nguyên văn.
- Tìm nguyên nhân gốc trong `assertOwnRepo` hoặc nơi gọi: `git rev-parse --show-toplevel` lỗi tạm thời (khóa, tiến trình khác), đường dẫn tạm dạng 8.3, chữ hoa/thường, hay hai test dùng chung thư mục.
  - Sửa và có test tái hiện điều kiện gây lỗi.
  - Không tái hiện được trong 10 lần: ghi "không tái hiện" kèm bằng chứng và để nguyên.
- **Bật `--test-force-exit` cho `test:bench`** khi xanh 10 lần liên tiếp với cờ; chuyển `test:bench` sang nhóm `FORCE_EXIT` trong `test/force-exit.test.ts`.
- `docs/LINT.md`: ghi nguồn số liệu của `timeout-minutes: 20` (thời lượng CI thật ở căn cứ).

**K3 — qa-tester: review**
- Kết luận theo mẫu JSON. Khối JSON đặt **cuối** câu trả lời, đúng mẫu, để hệ thống đọc được.
- **Thử sức bắt lỗi:**
  - đưa chuỗi TAP mẫu của Node 22 vào kiểm của K1 ⇒ nhận đúng là quá hạn;
  - bỏ `--test-force-exit` khỏi một script ở nhóm `FORCE_EXIT` ⇒ test đỏ.
- Chạy `npm test`, `npm run test:bench`, `npm run test:research` 3 lần liên tiếp với cờ cuối cùng; ghi thời gian và kết quả.
