import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from '../src/config.js';
import { createServer } from '../src/server.js';
import { recordDirector, recordProposed, type Deps } from '../src/selfimprove.js';
import { testApp } from './helpers.js';

// B-19 / D10b-S1: lỗi 409 của route /api/selfimprove/* phải che đường dẫn cục bộ (D4); thao tác ghi cần token.
// Route dùng ROOT thật làm repo: test KHÔNG sửa tệp trong repo; "tệp đích bị sửa ngoài luồng" mô phỏng bằng bản vá có ngữ cảnh không còn khớp.

const lc = (s: string) => (process.platform === 'win32' ? s.toLowerCase() : s);
const meta = { pid: 'P-1', clusterId: 'CL-1', author: 'research-lead', labeledBy: ['methodologist'], kind: 'optimize' as const, hypothesis: 'thêm kiểm biên' };
const STALE = 'diff --git a/src/prompts.ts b/src/prompts.ts\n--- a/src/prompts.ts\n+++ b/src/prompts.ts\n@@ -1 +1 @@\n-dòng-không-tồn-tại-trong-tệp-đích\n+Kiểm biên rỗng.\n';

test('route 409 che đường dẫn (apply sai trạng thái; apply khi tệp đích đã đổi); POST không token bị từ chối', async () => {
  const app = testApp();
  const srv0 = createServer(app);
  await new Promise<void>((r) => srv0.listen(0, '127.0.0.1', r));
  const port = (srv0.address() as AddressInfo).port;
  srv0.close();
  app.config.server.port = port;
  const srv = createServer(app);
  await new Promise<void>((r) => srv.listen(port, '127.0.0.1', r));
  const TOKEN = 'tok-gia-cho-test';
  app.config.server.token = TOKEN;
  app.config.selfImprove = { ...app.config.selfImprove, enabled: true };
  const call = (p: string, token = true) =>
    fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${TOKEN}` } : {}) }, body: '{}' });
  const forbidden = [app.config.dataDir, path.resolve(app.config.dataDir), ROOT, path.resolve(ROOT), os.tmpdir(), path.resolve(os.tmpdir())].map(lc);
  const assertMasked = (text: string, what: string) => {
    for (const f of forbidden) assert.ok(!lc(text).includes(f), `${what}: thông báo lộ đường dẫn ${f}`);
  };
  try {
    const si: Deps = { cfg: app.config.selfImprove, logs: app.logs, dataDir: app.config.dataDir, root: ROOT };
    recordProposed('P-1', STALE, meta, si);

    // (a) apply khi còn ở trạng thái proposed (chưa duyệt) ⇒ 409
    const a = await call('/api/selfimprove/proposals/P-1/apply');
    assert.equal(a.status, 409);
    const aText = await a.text();
    assert.match(JSON.parse(aText).error, /chưa được giám đốc duyệt/);
    assertMasked(aText, '(a)');

    // (b) đã duyệt nhưng tệp đích không còn khớp bản vá ⇒ 409
    recordDirector('approved', 'P-1', si);
    const b = await call('/api/selfimprove/proposals/P-1/apply');
    assert.equal(b.status, 409);
    const bText = await b.text();
    assert.match(JSON.parse(bText).error, /thất bại/);
    assertMasked(bText, '(b)');
    assert.ok(JSON.parse(bText).error.length <= 200);

    // rollback khi chưa áp ⇒ 409, cũng không lộ đường dẫn
    const r = await call('/api/selfimprove/proposals/P-1/rollback-confirm');
    assert.equal(r.status, 409);
    assertMasked(await r.text(), 'rollback');

    // không token ⇒ 401 và trạng thái không đổi
    for (const verb of ['approve', 'reject', 'apply', 'rollback-confirm']) {
      const res = await call(`/api/selfimprove/proposals/P-1/${verb}`, false);
      assert.equal(res.status, 401, verb);
    }
    const list = (await (await fetch(`http://127.0.0.1:${port}/api/selfimprove/proposals`, { headers: { authorization: `Bearer ${TOKEN}` } })).json()) as Array<{ id: string; status: string }>;
    assert.equal(list.find((x) => x.id === 'P-1')!.status, 'approved');
  } finally {
    srv.close();
    app.cleanup();
  }
});
