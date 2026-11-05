import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LogStore } from '../src/logger.js';
import { loadConfig } from '../src/config.js';
import { DAY_MS, effectiveDays, isRotatedLog, ledgerPath, purgeLogs, runLogRetention, sealRotated, verifySeal } from '../src/log-retention.js';

const NOW = Date.UTC(2026, 10, 4);

function setup() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-logret-'));
  const logs = new LogStore(dataDir, { redactSecrets: true, redactPii: true, hashChain: true });
  const dir = path.join(dataDir, 'logs');
  const put = (name: string, ageDays: number, body = `{"x":"${name}"}\n`): string => {
    const f = path.join(dir, name);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
    const t = new Date(NOW - ageDays * DAY_MS);
    fs.utimesSync(f, t, t);
    return f;
  };
  return { dataDir, logs, put, cfg: (o: Partial<{ enabled: boolean; days: number }> = {}) => ({ enabled: true, days: 0, intervalHours: 24, ...o }) };
}

test('công tắc mặc định tắt', () => {
  assert.equal(loadConfig({ local: false }).logs.retention.enabled, false);
});

test('công tắc tắt: không xóa, không niêm phong', () => {
  const s = setup();
  const f = s.put('system.jsonl.1', 900);
  assert.equal(runLogRetention({ cfg: s.cfg({ enabled: false }), logs: s.logs, dataDir: s.dataDir }, NOW), null);
  assert.ok(fs.existsSync(f));
  assert.ok(!fs.existsSync(ledgerPath(s.dataDir)));
});

test('log chưa tới sàn còn nguyên: truy xuất < 365, xử lý dữ liệu < 183', () => {
  const s = setup();
  const a = s.put('audit.jsonl.1', 300);
  const p = s.put('data-processing.jsonl.1', 100);
  const r = runLogRetention({ cfg: s.cfg(), logs: s.logs, dataDir: s.dataDir }, NOW)!;
  assert.deepEqual(r, { sealed: 2, purged: 0 });
  assert.ok(fs.existsSync(a) && fs.existsSync(p));
});

test('sàn khác nhau theo loại: xử lý dữ liệu 200 ngày bị xóa, audit 200 ngày còn', () => {
  const s = setup();
  const a = s.put('audit.jsonl.1', 200);
  const p = s.put('data-processing.jsonl.1', 200);
  runLogRetention({ cfg: s.cfg(), logs: s.logs, dataDir: s.dataDir }, NOW);
  assert.ok(fs.existsSync(a));
  assert.ok(!fs.existsSync(p));
});

test('log quá hạn đã niêm phong thì bị xóa; sổ ghi purged và verify-seal vẫn xanh', () => {
  const s = setup();
  const f = s.put('agents/dev.jsonl.2', 400);
  const r = runLogRetention({ cfg: s.cfg(), logs: s.logs, dataDir: s.dataDir }, NOW)!;
  assert.deepEqual(r, { sealed: 1, purged: 1 });
  assert.ok(!fs.existsSync(f));
  assert.ok(verifySeal(s.dataDir).ok);
  // chạy lại không nhân bản dòng sổ
  const before = fs.readFileSync(ledgerPath(s.dataDir), 'utf8');
  runLogRetention({ cfg: s.cfg(), logs: s.logs, dataDir: s.dataDir }, NOW);
  assert.equal(fs.readFileSync(ledgerPath(s.dataDir), 'utf8'), before);
});

test('tệp quá hạn chưa niêm phong thì không bị xóa trong purgeLogs', () => {
  const s = setup();
  const f = s.put('events.jsonl.1', 900);
  assert.deepEqual(purgeLogs(s.dataDir, 0, s.logs, NOW), []);
  assert.ok(fs.existsSync(f));
});

test('tệp bị sửa sau niêm phong: verify-seal lỗi, tệp không bị xóa, có cảnh báo', () => {
  const s = setup();
  const f = s.put('events.jsonl.1', 900);
  sealRotated(s.dataDir, NOW);
  fs.appendFileSync(f, '{"them":1}\n');
  const t = new Date(NOW - 900 * DAY_MS);
  fs.utimesSync(f, t, t);
  const v = verifySeal(s.dataDir);
  assert.equal(v.ok, false);
  assert.match(v.problems.join('\n'), /bị sửa/);
  assert.deepEqual(purgeLogs(s.dataDir, 0, s.logs, NOW), []);
  assert.ok(fs.existsSync(f));
  assert.match(fs.readFileSync(path.join(s.dataDir, 'logs', 'system.jsonl'), 'utf8'), /logs\.retention\.skipped/);
});

test('tệp đã niêm phong bị mất (không có dòng purged) thì verify-seal lỗi', () => {
  const s = setup();
  const f = s.put('calls.jsonl.1', 10);
  sealRotated(s.dataDir, NOW);
  fs.rmSync(f);
  const v = verifySeal(s.dataDir);
  assert.equal(v.ok, false);
  assert.match(v.problems.join('\n'), /bị mất/);
});

test('chuỗi sổ đứt (xóa dòng giữa / sửa dòng) bị phát hiện và chặn dọn', () => {
  const s = setup();
  s.put('a.jsonl.1', 900);
  s.put('b.jsonl.1', 900);
  s.put('c.jsonl.1', 900);
  sealRotated(s.dataDir, NOW);
  assert.ok(verifySeal(s.dataDir).ok);
  const lines = fs.readFileSync(ledgerPath(s.dataDir), 'utf8').trim().split('\n');
  fs.writeFileSync(ledgerPath(s.dataDir), `${[lines[0], lines[2]].join('\n')}\n`);
  const v = verifySeal(s.dataDir);
  assert.equal(v.ok, false);
  assert.match(v.problems.join('\n'), /chuỗi đứt/);
  assert.deepEqual(purgeLogs(s.dataDir, 0, s.logs, NOW), []);
  assert.ok(fs.existsSync(path.join(s.dataDir, 'logs', 'a.jsonl.1')));
});

test('cấu hình hạ thời hạn dưới sàn vẫn giữ sàn; chỉ nâng được', () => {
  assert.equal(effectiveDays('audit.jsonl.1', 30), 365);
  assert.equal(effectiveDays('data-processing.jsonl.1', 30), 183);
  assert.equal(effectiveDays('x.jsonl.1', Number.NaN), 365);
  assert.equal(effectiveDays('audit.jsonl.1', 500), 500);
  const s = setup();
  const f = s.put('audit.jsonl.1', 200);
  runLogRetention({ cfg: s.cfg({ days: 1 }), logs: s.logs, dataDir: s.dataDir }, NOW);
  assert.ok(fs.existsSync(f));
});

test('tệp đang ghi và sổ không bị đụng dù mtime rất cũ', () => {
  const s = setup();
  const sys = s.put('system.jsonl', 2000);
  const ag = s.put('agents/dev.jsonl', 2000);
  s.put('x.jsonl.1', 2000);
  assert.ok(!isRotatedLog('system.jsonl') && !isRotatedLog('agents/dev.jsonl'));
  runLogRetention({ cfg: s.cfg(), logs: s.logs, dataDir: s.dataDir }, NOW);
  assert.ok(fs.existsSync(sys) && fs.existsSync(ag));
  assert.ok(fs.existsSync(ledgerPath(s.dataDir)));
  assert.ok(!isRotatedLog('seal-ledger.jsonl'));
  // sổ không bao giờ bị dọn dù cũ
  const t = new Date(NOW - 3000 * DAY_MS);
  fs.utimesSync(ledgerPath(s.dataDir), t, t);
  runLogRetention({ cfg: s.cfg(), logs: s.logs, dataDir: s.dataDir }, NOW);
  assert.ok(fs.existsSync(ledgerPath(s.dataDir)));
});
