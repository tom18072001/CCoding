# Phòng Dev, gói D28: test treo phải thoát được; tìm vì sao `e7.test.mjs` treo; giới hạn thời gian ở CI

**Gói nhỏ: 3 hạng mục. Ngân sách 5M token.** Giao 15/11/2026.

**Căn cứ:** biên bản CTO của D27 (T-20261115-172418-a57, đã gộp).
- **`--test-timeout` chưa đủ.** Lệnh test có `--test-timeout` (300000 ms) sẽ đánh đỏ test treo. Nhưng nếu tiến trình còn handle mở (timer, socket, tiến trình con) thì lệnh chưa chắc tự thoát.
- **`--test-force-exit` chưa bật được.** K1 của D27 báo cờ này làm sập 4 tệp test trên Windows: `test/web.test.ts`, `test/ux3.test.ts`, `test/ux4.test.ts`, `test/selfimprove-route.test.ts`. K2 của D27 không tái hiện được lỗi sập.
- **Vụ 33 tiến trình mồ côi** (14–15/11, máy văn phòng): 11 bộ `npm run test:bench` → `node --test` → `bench/vs-claude/test/e7.test.mjs` treo nhiều giờ. Nguyên nhân chưa biết. CI Windows và Linux vẫn xanh. D27 không được sửa `bench/`, nên chưa dò.
- **CI (`.github/workflows/ci.yml`) chưa đặt `timeout-minutes`** cho job. Một test treo sẽ giữ runner tới giới hạn mặc định của GitHub (6 giờ).
- Luật `ci-integrity` (`docs/LINT.md`) chỉ cấm làm yếu CI. Thêm `timeout-minutes` là làm chặt hơn; cập nhật luật nếu luật đòi khớp nguyên văn.

**Phạm vi:**
- **Được sửa:** `test/`, `bench/vs-claude/test/`, `package.json` (chỉ script test), `.github/workflows/ci.yml` (chỉ thêm `timeout-minutes`), `scripts/lint/` (chỉ nếu `ci-integrity` cần biết khóa mới), `docs/` (trừ `docs/research/`).
- **Không sửa:** `src/` (trừ khi handle mở nằm trong mã sản phẩm; nêu rõ và kèm test), `bench/vs-claude/results/`, `docs/research/`.
- Không chạy benchmark, không gọi `claude -p` thật.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:bench`, `npm run test:research`.

## Hạng mục

**K1 — senior-swe: đóng handle mở; bật `--test-force-exit`**
- Chạy riêng từng tệp trong 4 tệp nêu ở căn cứ, kèm `--test-force-exit`, trên máy văn phòng (Windows), mỗi tệp 3 lần. Ghi lỗi nguyên văn nếu sập.
- Tìm handle còn mở sau khi test xong (server không đóng, timer không `unref`, tiến trình con không dọn) và đóng trong `after`/`t.after` của chính tệp test. Chỉ sửa `src/` khi handle nằm ở mã sản phẩm, kèm test.
- Bật `--test-force-exit` cho `test`, `test:bench`, `test:research` khi cả ba lệnh xanh 3 lần liên tiếp trên máy văn phòng.
- **Test:** tệp test tạm vừa treo vừa giữ handle mở (vd. `setInterval` không `unref`), chạy bằng đúng cờ của `package.json` ⇒ lệnh thoát khác 0 trong thời hạn. Tệp tạm ngoài cây test chính, dọn sau test.

**K2 — backend-dev: dò `e7.test.mjs` treo; `timeout-minutes` ở CI**
- **Dò `e7.test.mjs`:**
  - chạy riêng `node --test bench/vs-claude/test/e7.test.mjs` trên máy văn phòng 5 lần, ghi thời gian từng lần;
  - nếu có lần treo thì tìm handle hay tiến trình con còn sống (vd. `claude` giả, `git`, server, `waitFor` không hạn) và đóng;
  - nếu không tái hiện được, ghi "không tái hiện" kèm bằng chứng (5 lần, thời gian, phiên bản Node), và nêu các test trong tệp có tiến trình con hay timer dài, kèm cách đã bảo đảm dọn.
- **`timeout-minutes`:** thêm cho job test trong `ci.yml`, giá trị đủ thời gian chạy dài nhất gần đây cộng biên, kèm lý do. Cập nhật `ci-integrity` nếu cần, để luật vẫn chặn việc bỏ khóa này.
- Cập nhật `docs/` (cách chạy test, các cờ thời gian, giới hạn còn lại).

**K3 — qa-tester: review**
- Kết luận theo mẫu JSON. Khối JSON đặt **cuối** câu trả lời, đúng mẫu, để hệ thống đọc được.
- **Thử sức bắt lỗi:**
  - tạm bỏ `--test-force-exit` ⇒ test treo-giữ-handle của K1 đỏ vì quá thời hạn; trả lại ⇒ xanh;
  - tạm xóa `timeout-minutes` trong `ci.yml` ⇒ `npm run lint` đỏ (nếu K2 đã đưa khóa này vào `ci-integrity`).
- Chạy `npm test`, `npm run test:bench`, `npm run test:research` 3 lần liên tiếp trên máy văn phòng; ghi thời gian và kết quả.
