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
