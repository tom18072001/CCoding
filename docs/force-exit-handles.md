# Handle mở trong test: chuyển `srv.close()` trần sang `closeServer` (D28b/S1)

Nhãn dữ liệu: **Nội bộ**. Không có dữ liệu thật.

## Vì sao
`srv.close()` trần không đóng kết nối keep-alive (fetch/undici) và không chờ sự kiện `close`, nên khi bật `--test-force-exit`
tiến trình có thể thoát giữa lúc handle đang đóng và libuv sập (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`).

## `closeServer` (test/helpers.ts)
Gọi `srv.close()`, `closeAllConnections()`, rồi chờ sự kiện `'close'` của server, sau đó **một nhịp đệm `setTimeout` 50 ms**.
Nhịp đệm giữ lại vì có số đo (Windows, Node 24, `--test-force-exit`, chạy `selfimprove-route.test.ts` + `ux4.test.ts`):

| Sau sự kiện `close` | Lần sập libuv |
|---|---|
| không nhịp | 8/8 |
| một `setImmediate` | 8/8 |
| vòng `setImmediate` chờ `getActiveResourcesInfo()` hết handle | 8/8 |
| `setTimeout` 20 ms | 1/6 |
| `setTimeout` 50 ms | 0/8 |

Cả bộ `tsx --test --test-force-exit "test/**/*.test.ts"`: chưa có nhịp 5/5 lần đỏ (`Assertion failed … async.c line 76`);
có nhịp 50 ms 3/3 lần xanh (exit 0, pass 950, fail 0). Số đo trên một máy; CI Node 22 chưa kiểm.
Hạn an toàn 5000 ms; quá hạn ném lỗi tiếng Việt. Server chưa `listen` thì trả về ngay.
Dùng cho cả `http.Server` lẫn `net.Server` (chỗ dò cổng), nên không còn ngoại lệ nào.

## Trước (tệp:dòng, `srv.close();` trần, 57 chỗ ở `srv`/`gw.srv` cộng các server dò cổng)
```
test/agent-probes.test.ts:97:    srv.close();
test/audit-verify-unsigned.test.ts:26:    srv.close();
test/diff.test.ts:170:    srv.close();
test/director.test.ts:15:  srv.close();
test/director.test.ts:98:    srv.close();
test/director.test.ts:179:      srv.close();
test/director.test.ts:248:      srv.close();
test/e2e.test.ts:159:  srv.close();
test/failover.test.ts:102:    gw.srv.close();
test/failover.test.ts:144:    srv.close();
test/failover.test.ts:185:    srv.close();
test/failover.test.ts:230:    srv.close();
test/failover.test.ts:257:    gw.srv.close();
test/failover.test.ts:305:    srv.close();
test/failover.test.ts:348:    srv.close();
test/failover.test.ts:376:    srv.close();
test/failover.test.ts:458:    srv.close();
test/failover.test.ts:510:    srv.close();
test/git-base-orchestrator.test.ts:77:    gw.srv.close();
test/kpi-v2.test.ts:450:    srv.close();
test/parallel-worktrees.test.ts:150:      gw.srv.close();
test/parallel-worktrees.test.ts:196:    gw.srv.close();
test/parallel-worktrees.test.ts:232:    gw.srv.close();
test/parallel-worktrees.test.ts:263:    gw.srv.close();
test/parallel-worktrees.test.ts:294:    gw.srv.close();
test/parallel-worktrees.test.ts:334:    gw.srv.close();
test/parallel-worktrees.test.ts:358:    gw.srv.close();
test/parallel-worktrees.test.ts:426:    gw.srv.close();
test/parallel-worktrees.test.ts:467:    gw.srv.close();
test/parallel-worktrees.test.ts:500:    gw.srv.close();
test/process.test.ts:105:      gw.srv.close();
test/process.test.ts:216:    srv.close();
test/process.test.ts:411:    srv.close();
test/process.test.ts:520:    srv.close();
test/process.test.ts:594:    srv.close();
test/process.test.ts:642:    srv.close();
test/process.test.ts:734:    srv.close();
test/process.test.ts:830:    gw.srv.close();
test/process.test.ts:853:    gw.srv.close();
test/process.test.ts:1141:    srv.close();
test/quality-gate.test.ts:131:      srv.close();
test/s3-incident-difficulty.test.ts:202:      gw.srv.close();
test/s3-incident-difficulty.test.ts:217:    gw.srv.close();
test/s3-incident-difficulty.test.ts:241:      gw.srv.close();
test/scratch-commit.test.ts:226:    srv.close();
test/selfimprove-apply.test.ts:354:    srv.close();
test/selfimprove-incident-orchestrator.test.ts:83:    gw.srv.close();
test/selfimprove-route-auth.test.ts:35:  return { app, srv, si, post, decisions, done: () => { srv.close(); app.cleanup(); } };
test/subagent-mgmt.test.ts:267:    gw.srv.close();
test/ui7.test.ts:14:  srv.close();
test/ui7.test.ts:45:    srv.close();
test/ui7.test.ts:90:    srv.close();
test/ui7.test.ts:166:    srv.close();
test/ui7.test.ts:195:    srv.close();
test/ui7.test.ts:245:    srv.close();
test/uploads.test.ts:55:    srv.close();
test/ux4d.test.ts:257:    srv.close();
```
Server dò cổng/phụ (cũng đã chuyển): audit-verify-unsigned:16 (`s0`), diff:139 (`srv0`), e2e:176 (`srv2`), process:374 (`probe`), process:706-707 và 1051-1052 (`sa`,`sb`), selfimprove-apply:291 (`srv0`), selfimprove-route-auth:25 (`srv0`), uploads:15 (`probe`), ux4d:176 (`s0`).

## Sau (tệp:dòng gọi `closeServer`, số dòng đã dịch vì thêm import)
```
test/agent-probes.test.ts:98:    await closeServer(srv);
test/audit-verify-unsigned.test.ts:16:  await closeServer(s0);
test/audit-verify-unsigned.test.ts:26:    await closeServer(srv);
test/diff.test.ts:139:  await closeServer(srv0);
test/diff.test.ts:170:    await closeServer(srv);
test/director.test.ts:15:  await closeServer(srv);
test/director.test.ts:98:    await closeServer(srv);
test/director.test.ts:179:      await closeServer(srv);
test/director.test.ts:248:      await closeServer(srv);
test/e2e.test.ts:159:  await closeServer(srv);
test/e2e.test.ts:176:    await closeServer(srv2);
test/failover.test.ts:103:    await closeServer(gw.srv);
test/failover.test.ts:145:    await closeServer(srv);
test/failover.test.ts:186:    await closeServer(srv);
test/failover.test.ts:231:    await closeServer(srv);
test/failover.test.ts:258:    await closeServer(gw.srv);
test/failover.test.ts:306:    await closeServer(srv);
test/failover.test.ts:349:    await closeServer(srv);
test/failover.test.ts:377:    await closeServer(srv);
test/failover.test.ts:459:    await closeServer(srv);
test/failover.test.ts:511:    await closeServer(srv);
test/gateway.test.ts:82:    await closeServer(srv);
test/git-base-orchestrator.test.ts:78:    await closeServer(gw.srv);
test/kpi-v2.test.ts:450:    await closeServer(srv);
test/parallel-worktrees.test.ts:151:      await closeServer(gw.srv);
test/parallel-worktrees.test.ts:197:    await closeServer(gw.srv);
test/parallel-worktrees.test.ts:233:    await closeServer(gw.srv);
test/parallel-worktrees.test.ts:264:    await closeServer(gw.srv);
test/parallel-worktrees.test.ts:295:    await closeServer(gw.srv);
test/parallel-worktrees.test.ts:335:    await closeServer(gw.srv);
test/parallel-worktrees.test.ts:359:    await closeServer(gw.srv);
test/parallel-worktrees.test.ts:427:    await closeServer(gw.srv);
test/parallel-worktrees.test.ts:468:    await closeServer(gw.srv);
test/parallel-worktrees.test.ts:501:    await closeServer(gw.srv);
test/process.test.ts:105:      await closeServer(gw.srv);
test/process.test.ts:216:    await closeServer(srv);
test/process.test.ts:374:  await closeServer(probe);
test/process.test.ts:411:    await closeServer(srv);
test/process.test.ts:520:    await closeServer(srv);
test/process.test.ts:594:    await closeServer(srv);
test/process.test.ts:642:    await closeServer(srv);
test/process.test.ts:706:    await closeServer(sa);
test/process.test.ts:707:    await closeServer(sb);
test/process.test.ts:734:    await closeServer(srv);
test/process.test.ts:830:    await closeServer(gw.srv);
test/process.test.ts:853:    await closeServer(gw.srv);
test/process.test.ts:1051:    await closeServer(sa);
test/process.test.ts:1052:    await closeServer(sb);
test/process.test.ts:1141:    await closeServer(srv);
test/quality-gate.test.ts:131:      await closeServer(srv);
test/s3-incident-difficulty.test.ts:203:      await closeServer(gw.srv);
test/s3-incident-difficulty.test.ts:218:    await closeServer(gw.srv);
test/s3-incident-difficulty.test.ts:242:      await closeServer(gw.srv);
test/scratch-commit.test.ts:227:    await closeServer(srv);
test/selfimprove-apply.test.ts:291:  await closeServer(srv0);
test/selfimprove-apply.test.ts:354:    await closeServer(srv);
test/selfimprove-incident-orchestrator.test.ts:84:    await closeServer(gw.srv);
test/selfimprove-route-auth.test.ts:25:  await closeServer(srv0);
test/selfimprove-route-auth.test.ts:35:  return { app, srv, si, post, decisions, done: async () => { await closeServer(srv); app.cleanup(); } };
test/selfimprove-route.test.ts:24:  await closeServer(srv0);
test/selfimprove-route.test.ts:71:    await closeServer(srv);
test/subagent-mgmt.test.ts:268:    await closeServer(gw.srv);
test/ui7.test.ts:14:  await closeServer(srv);
test/ui7.test.ts:45:    await closeServer(srv);
test/ui7.test.ts:90:    await closeServer(srv);
test/ui7.test.ts:166:    await closeServer(srv);
test/ui7.test.ts:195:    await closeServer(srv);
test/ui7.test.ts:245:    await closeServer(srv);
test/uploads.test.ts:15:  await closeServer(probe);
test/uploads.test.ts:55:    await closeServer(srv);
test/ux3.test.ts:171:  await closeServer(s0);
test/ux3.test.ts:192:    await closeServer(srv);
test/ux4.test.ts:90:  await closeServer(s0);
test/ux4.test.ts:110:    await closeServer(srv);
test/ux4d.test.ts:176:  await closeServer(s0);
test/ux4d.test.ts:257:    await closeServer(srv);
test/web.test.ts:75:    await closeServer(srv);
```

## Ngoại lệ
Không có. `selfimprove-route-auth.test.ts` (`done`) và `quality-gate.test.ts` (`cleanup`) chuyển thành hàm `async`; chỗ gọi đã `await`.

## Kiểm
`grep -rnE "\.close\(" test | grep -v closeServer` chỉ còn dòng trong `closeServer` (helpers.ts).

## Đo D28b/S2 — bật `--test-force-exit` cho `npm test` (Windows 11, Node v24.14.0, tuần tự, không chạy song song lệnh khác)

Lệnh: `tsx --test --test-force-exit --test-timeout=300000 --test-reporter=spec "test/**/*.test.ts"`. Cột "đỏ thật" bỏ qua 1 ca bảo vệ
`script "test" chưa bật --test-force-exit…` của `force-exit.test.ts` (đỏ có chủ ý vì cờ đang bật tạm trong lúc đo).

| Lần | Thời gian | Exit | pass/fail | Lỗi nguyên văn · tệp đang chạy |
|---|---|---|---|---|
| 1 | 93 s | 1 | 950/2 | `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76` · `test\selfimprove-route.test.ts` |
| 2 | 91 s | 1 | 950/2 | như lần 1 |
| 3 | 91 s | 1 | 950/2 | như lần 1 |
| 4 | 91 s | 1 | 950/2 | như lần 1 |
| 5 | 91 s | 1 | 950/1 | không sập libuv (chỉ ca bảo vệ đỏ) |
| 6 | 92 s | 1 | 950/2 | như lần 1 |
| 7 | 94 s | 1 | 950/2 | như lần 1 |
| 8 | 93 s | 1 | 950/1 | không sập libuv (chỉ ca bảo vệ đỏ) |
| 9 | 92 s | 1 | 950/2 | như lần 1 |
| 10 | 92 s | 1 | 950/2 | như lần 1 |

**Kết quả: libuv sập 8/10 lần, luôn ở `test\selfimprove-route.test.ts` ⇒ KHÔNG đạt 10/10.** Quyết định: gỡ cờ khỏi script `test`,
giữ `test` trong `NO_FORCE_EXIT` (`test/force-exit.test.ts`). Đây là kết quả đo trên một máy; chưa kiểm trên CI Node 22.
Nguyên nhân gốc chưa xác định: tệp chạy riêng thì không sập (bảng dưới), chỉ sập khi chạy cùng cả bộ (nhiều tệp song song); handle nghi vấn là
cặp `createServer` ở `test/selfimprove-route.test.ts:21-27` (cổng dò rồi mở lại) và kết nối `fetch` keep-alive ở dòng 32 và 68, đóng ở dòng 24 và 71.
Chưa chứng minh đây là handle gây sập, nên không ghi là nguyên nhân.
Việc còn mở: tìm handle gây sập trong ngữ cảnh chạy cả bộ rồi mới bật lại cờ.

## Chạy riêng 4 tệp × 12 lần: `npx tsx --test --test-force-exit test/<tệp>.test.ts`

Tên tệp đã xác minh bằng `ls test`: `web.test.ts`, `ux3.test.ts`, `ux4.test.ts`, `selfimprove-route.test.ts`
(khác `selfimprove-route-auth.test.ts`). Mọi lần: exit 0, 0 lần `Assertion failed`.

| Tệp | Số ca pass/fail | Lần 1–12 (ms) | Exit 0 | Sập libuv |
|---|---|---|---|---|
| web | 2/0 | 2473, 2282, 2260, 2286, 2244, 2315, 2285, 2321, 2250, 2293, 2350, 2409 | 12/12 | 0/12 |
| ux3 | 7/0 | 3201, 3460, 3392, 3280, 3445, 3476, 3315, 3411, 3540, 3578, 3366, 3255 | 12/12 | 0/12 |
| ux4 | 3/0 | 3904, 3851, 3767, 3627, 3840, 3815, 3659, 3701, 3872, 3957, 3803, 3862 | 12/12 | 0/12 |
| selfimprove-route | 1/0 | 2751, 2562, 2495, 2430, 2445, 2501, 2506, 2541, 2435, 2439, 2450, 2519 | 12/12 | 0/12 |

Kết luận: cờ an toàn khi chạy riêng từng tệp (48/48), nhưng không đủ để bật cho cả bộ `npm test`.

## Handle còn tồn tại (tệp:dòng)
Sau S1 không còn `srv.close()` trần trong `test/` (xem mục "Sau"). Handle liên quan còn lại, theo số đo ở trên:
- `test/selfimprove-route.test.ts:21-27` và `:71`: server mở lại cùng cổng, `closeServer` đã chờ sự kiện `close`; vẫn là tệp duy nhất sập khi chạy cả bộ.
- `test/selfimprove-route.test.ts:32`, `:68`: `fetch` (undici keep-alive); `closeServer` gọi `closeAllConnections()` phía server nhưng không đóng pool của client.
- `test/helpers.ts`: nhịp đệm `setTimeout` 50 ms sau `close` (số đo ở đầu tệp) là biện pháp giảm xác suất, chưa phải nguyên nhân gốc đã xử lý.

## D30/K1 — khoanh vùng handle làm libuv sập (Windows 11, Node v24.14.0, tuần tự; log trong `.scratch/k1/`)

Lệnh: `npx tsx --test --test-force-exit --test-timeout=300000 <tập tệp>`. Dòng lỗi nguyên văn ở mọi lần sập:
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76` (log mẫu: `.scratch/k1/full-2.log`, `full-3.log`).

| Bước | Tập tệp | Lần | Sập libuv | Thời gian |
|---|---|---|---|---|
| h0 | nửa đầu `test/**/*.test.ts` | 3 | 0/3 | 53, 51, 52 s |
| h1 | nửa sau | 3 | 0/3 | 68, 69, 68 s |
| full | cả bộ (bản 50 ms) | 3 | 2/3 (lần 2, 3) | 92, 93, 93 s |
| pair | `selfimprove-route` + `ux4`, bỏ nhịp 50 ms | 4 | 4/4 | 3–4 s |
| ux4 | `ux4.test.ts` riêng, bỏ nhịp | 4 | 4/4 | 4 s |
| sir | `selfimprove-route.test.ts` riêng, bỏ nhịp | 4 | 4/4 | 2–3 s |
| ux4 + `Connection: close` | `ux4.test.ts`, bỏ nhịp | 4 | 4/4 | 4 s |

Chia nửa đầu/sau không sập, chỉ cả bộ sập, nên việc chia đôi không thu về một cặp tệp ổn định; nhưng thử bỏ nhịp thì từng tệp riêng (có `fetch`) sập 4/4.
Thí nghiệm tối thiểu `exp/k.test.mjs` (chỉ `node:http` trần + vài `fetch`, **không có mã repo**) cũng sập, `exp-l`, `exp-j4` sập khi dùng server của repo;
còn thí nghiệm không dùng `fetch` (`exp-m`: chỉ cấp phát rác; `exp-n` chế độ http.Agent) không sập.
**Kết luận:** handle không nằm trong mã test hay mã sản phẩm. Đây là cuộc đua của runtime (`fetch`/undici nạp llhttp WASM; tác vụ nền của V8 gửi tín hiệu
vào handle async của libuv khi `--test-force-exit` đang đóng vòng lặp). Đóng server/socket đúng cách chỉ lùi thời điểm đua. Không có bản sửa handle để commit; không sửa `src/`.
Thử cờ V8 `--no-wasm-dynamic-tiering`: tập cặp 5/5 không sập, cả bộ 2/2 lần đầu không sập, lần 3 đỏ ở giây 20 với hàng loạt ca không liên quan
(nghi chạy trùng với lệnh chẩn đoán của tôi, chưa chứng minh) và chuỗi bị dừng theo PID ⇒ **chưa có chuỗi 10 lần**, không đưa cờ này vào script.

## Ngoại lệ đã đo: nhịp 50 ms của `closeServer`
Giữ nguyên. Bỏ nhịp: cặp `selfimprove-route` + `ux4` sập 4/4 (và từng tệp riêng 4/4), nên không chạy tiếp 10 lần cả bộ.

| Sau sự kiện `close` | Sập libuv |
|---|---|
| không nhịp (số mới, D30) | 4/4 (cặp), 4/4 (từng tệp) |
| `setImmediate` (cũ) | 8/8 |
| `setTimeout` 20 ms (cũ) | 1/6 |
| `setTimeout` 50 ms (cũ) | 0/8 |

Nhịp 50 ms chỉ giảm xác suất của một cuộc đua runtime, không loại bỏ: cả bộ có nhịp vẫn sập 2/3 lần ở D30 (và 8/10 ở D28b/S2).

## Trạng thái cờ của `npm test`
Không đạt 10/10 ⇒ script `test` **không** có `--test-force-exit`; `test` vẫn ở `NO_FORCE_EXIT`. Việc còn mở: thử chuỗi 10 lần với `--no-wasm-dynamic-tiering`
(hoặc tránh `fetch` toàn cục trong test, dùng `http.request` với agent riêng), chạy một vòng mỗi lần.
