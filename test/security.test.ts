import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { redact } from '../src/util/redact.js';
import { LogStore, verifyChain } from '../src/logger.js';

test('redact che khóa bí mật', () => {
  const s = redact('key=sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 password = "hunter2xx"', { secrets: true });
  assert.ok(!s.includes('AAAAAAAAAAAAAAAA'));
  assert.ok(!s.includes('ghp_ABCDEF'));
  assert.ok(!s.includes('hunter2xx'));
});

test('redact che dữ liệu cá nhân nhưng không phá mã nhiệm vụ', () => {
  const s = redact('Liên hệ an.nguyen@example.com, 0912345678, CCCD 001203004567, thẻ 4111 1111 1111 1111, task T-20261026-203501-a1b', { secrets: true, pii: true });
  assert.ok(s.includes('[EMAIL]'));
  assert.ok(s.includes('[PHONE]'));
  assert.ok(s.includes('[CCCD]'));
  assert.ok(s.includes('[CARD]'));
  assert.ok(s.includes('T-20261026-203501-a1b'));
});

test('log có chuỗi băm và phát hiện chỉnh sửa', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-log-'));
  try {
    const logs = new LogStore(dir, { redactSecrets: true, redactPii: true, hashChain: true });
    for (let i = 0; i < 5; i++) logs.write({ level: 'info', kind: 'test', msg: `dòng ${i}`, agentId: 'backend-dev', department: 'dev' });
    const f = logs.fileFor('agent', 'backend-dev');
    assert.deepEqual(verifyChain(f), { ok: true, lines: 5 });
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines[2] = lines[2].replace('dòng 2', 'dòng 2 (đã sửa)');
    fs.writeFileSync(f, lines.join('\n'));
    const r = verifyChain(f);
    assert.equal(r.ok, false);
    assert.equal(r.brokenAt, 3);
    // log PII bị che trước khi ghi
    logs.write({ level: 'info', kind: 'test', msg: 'gửi tới a@b.vn', agentId: 'x' });
    assert.ok(fs.readFileSync(logs.fileFor('agent', 'x'), 'utf8').includes('[EMAIL]'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
