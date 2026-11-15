# Phòng Dev, gói D30: tìm handle làm libuv sập khi `npm test` có `--test-force-exit`; chuỗi 10 lần xanh của `test:bench`; sửa chú thích lỗi thời; bịt thêm lối diệt tiến trình theo tên; thử khởi động lại server thật

**Gói vừa: 4 hạng mục. Ngân sách 7M token.** Giao 16/11/2026.

**Căn cứ:** biên bản CTO của D28b (T-20261115-211946-3fc). D28/D28b đã gộp vào `perf/vs-claude-loop`; CI GitHub 4/4 xanh, gồm Node 22 (lượt `43742232787`). CTO chưa nghiệm thu trọn vì các điểm sau.
- **`npm test` chưa bật được `--test-force-exit`.** Có cờ thì libuv sập 8/10 lần (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`). Nguyên nhân gốc mới là nghi vấn (`test/selfimprove-route.test.ts`, khoảng dòng 21–27), chưa chứng minh.
- **`closeServer` còn nhịp chờ cố định 50 ms sau sự kiện `close`.** Phòng đã đo: `setImmediate` sập 8/8 lần, 20 ms sập 1/6, 50 ms sập 0/8. Nhịp này chỉ giảm xác suất, và chưa được ghi là ngoại lệ đã đo.
- **`test:bench` chưa xanh đủ 10 lần liên tiếp trên bản cuối.** Bảng 10 lần đo trước khi sửa 3 chỗ `srv.close()` và đổi hai mảng của `test/force-exit.test.ts`.
- **Chú thích và tài liệu lỗi thời:**
  - F3: chú thích trong `test/force-exit.test.ts` ghi sai đường dẫn tệp nguồn của libuv;
  - F4: chú thích `FORCE_EXIT`/`NO_FORCE_EXIT` còn nói `test:bench` chưa bật cờ;
  - F5: `docs/LINT.md`, mục kết quả K1, còn câu cũ.
- **Biên bản CTO của D29** (T-20261116-005855-f7d):
  - `DEFAULT_DENY` còn các lối lách đã biết: `spps -Name …` (bí danh của `Stop-Process`), `kill $(pgrep …)`, `Invoke-CimMethod … Terminate`, `… | xargs pkill`, `node -e "process.kill(…)"`;
  - thiếu khoảng trắng ở dòng khai báo `DEFAULT_DENY`;
  - `recoverOrphans` (nhiệm vụ mồ côi thành `paused` khi server khởi động) mới có test, chưa thử trên server thật.
- **Sự cố 15/11** (quyết định 15): hai vòng `npm test` chạy song song trong cùng một thư mục, rồi mọi tiến trình `node.exe` trên máy chết. Khi chạy lặp, chỉ chạy **một** vòng mỗi lần, tuần tự, và **không** diệt tiến trình theo tên. Văn phòng đã chặn các lệnh đó.

**Phạm vi:**
- **Được sửa:** `test/`, `bench/vs-claude/test/`, `package.json` (chỉ script test), `docs/` (trừ `docs/research/`), `src/tools/workspace.ts` (chỉ `DEFAULT_DENY`, K3), `src/` khác chỉ khi handle mở nằm trong mã sản phẩm (nêu rõ và kèm test).
- **Không sửa:** `bench/vs-claude/results/`, `docs/research/`, `.github/workflows/ci.yml`.
- Không chạy benchmark, không gọi `claude -p` thật. Tệp nháp, log chạy lặp chỉ để trong `.scratch/`.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:bench`, `npm run test:research`.

## Hạng mục

**K1 — senior-swe: khoanh vùng handle làm libuv sập; bỏ nhịp 50 ms nếu được**
- **Chia đôi tập tệp test:** chạy `npm test` với `--test-force-exit` trên từng nửa, lặp cho tới khi còn một tệp (hoặc một cặp tệp) làm sập. Mỗi bước chạy 3 lần, tuần tự. Ghi bảng chia đôi trong `docs/force-exit-handles.md`.
- **Sửa handle ở tệp tìm được** (server, socket, timer, watcher, tiến trình con chưa dọn) và có test.
- Sau khi sửa: thử bỏ nhịp 50 ms của `closeServer` (chỉ chờ sự kiện). Không sập 10/10 thì bỏ. Không được thì giữ, và ghi trong `docs/` là ngoại lệ đã đo, kèm bảng số.
- **Bật `--test-force-exit` cho `test`** khi xanh 10 lần liên tiếp, tuần tự, trên máy văn phòng. Chuyển `test` sang `FORCE_EXIT` trong `test/force-exit.test.ts`. Không đạt thì để nguyên, ghi nguyên nhân đã tìm được.

**K2 — backend-dev: chuỗi 10 lần của `test:bench`; sửa F3–F5**
- Chạy `npm run test:bench` 10 lần **tuần tự** trên bản cuối (sau K1). Ghi bảng (thời gian, pass/fail, ca đỏ nguyên văn) vào `docs/test-bench-flaky.md`. Có lần đỏ thì tìm nguyên nhân và sửa, rồi chạy lại 10 lần.
- Sửa F3, F4, F5 cho khớp mã hiện tại. Đường dẫn tệp nguồn libuv lấy đúng từ thông báo lỗi; không đọc được thì không ghi đường dẫn.
- Tìm mọi câu trong `docs/` và chú thích test còn nói trạng thái cũ của cờ `--test-force-exit`, và sửa.

**K3 — senior-swe: bịt thêm lối diệt tiến trình theo tên; thử khởi động lại server thật**
- Thêm vào `DEFAULT_DENY` các mẫu cho những lối lách ở căn cứ, mỗi mẫu có ca dương và ca âm. Lối không chặn được bằng chuỗi lệnh thì ghi rõ trong `docs/TOOLS.md` là giới hạn. Lớp chặn theo chuỗi lệnh không phải biên bảo vệ; biên thật là sandbox hệ điều hành.
- Sửa khoảng trắng ở dòng khai báo `DEFAULT_DENY`.
- **Thử thật `recoverOrphans`:**
  - chạy server thử ở một cổng khác 7430, với thư mục dữ liệu tạm có một nhiệm vụ `running` giả;
  - dừng server thử bằng **PID của chính nó**, khởi động lại;
  - xác nhận nhiệm vụ thành `paused`, có sự kiện `task.orphaned`, `resume` chạy được;
  - ghi kết quả vào `docs/`. Không chạm server 7430, không diệt tiến trình theo tên.

**K4 — qa-tester: review**
- Kết luận theo mẫu JSON. Khối JSON đặt **cuối** câu trả lời, đúng mẫu, để hệ thống đọc được.
- **Thử sức bắt lỗi:**
  - gỡ bản sửa handle của K1 ⇒ chạy tệp đó với cờ thì sập lại (hoặc ghi rõ vì sao không tái hiện);
  - bỏ cờ khỏi một script ở nhóm `FORCE_EXIT` ⇒ test đỏ;
  - bỏ một mẫu mới của K3 khỏi `DEFAULT_DENY` ⇒ test đỏ.
- Chạy `npm test`, `npm run test:bench`, `npm run test:research` 3 lần **tuần tự** với cờ cuối cùng; ghi thời gian và kết quả.
