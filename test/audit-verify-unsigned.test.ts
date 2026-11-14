import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import type { AddressInfo } from 'node:net';
import { testApp } from './helpers.js';

// m2 (D18d): /api/audit/verify nhận allowUnsigned như CLI --allow-unsigned.
const ENV = 'CCODING_LOG_HMAC_KEY';
const FAKE_KEY = 'khoa-gia-chi-dung-cho-test-0002';

async function withServer(fn: (verify: (qs?: string) => Promise<{ ok: boolean; reason?: string }>, app: ReturnType<typeof testApp>) => Promise<void>): Promise<void> {
  const app = testApp();
  const s0 = createServer(app);
  await new Promise<void>((r) => s0.listen(0, '127.0.0.1', r));
  const port = (s0.address() as AddressInfo).port;
  s0.close();
  app.config.server.port = port;
  const srv = createServer(app);
  await new Promise<void>((r) => srv.listen(port, '127.0.0.1', r));
  const old = process.env[ENV];
  try {
    await fn(async (qs = '') => (await (await fetch(`http://127.0.0.1:${port}/api/audit/verify${qs}`)).json()) as { ok: boolean; reason?: string }, app);
  } finally {
    if (old === undefined) delete process.env[ENV];
    else process.env[ENV] = old;
    srv.close();
    app.cleanup();
  }
}

test('m2: có khóa, log chưa ký → không đạt; allowUnsigned=1 → đạt', async () => {
  await withServer(async (verify, app) => {
    delete process.env[ENV];
    const file = app.logs.fileFor('system');
    for (let i = 0; i < 3; i++) app.logs.append(file, { msg: `cu ${i}` });
    process.env[ENV] = FAKE_KEY;
    const strict = await verify();
    assert.equal(strict.ok, false);
    assert.equal(strict.reason, 'thiếu chữ ký');
    assert.equal((await verify('?allowUnsigned=0')).ok, false);
    assert.equal((await verify('?allowUnsigned=1')).ok, true);
  });
});

test('m2: log đã ký đủ → đạt, có hoặc không allowUnsigned', async () => {
  await withServer(async (verify, app) => {
    process.env[ENV] = FAKE_KEY;
    const file = app.logs.fileFor('system');
    for (let i = 0; i < 3; i++) app.logs.append(file, { msg: `moi ${i}` });
    assert.equal((await verify()).ok, true);
    assert.equal((await verify('?allowUnsigned=1')).ok, true);
  });
});
