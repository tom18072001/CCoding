// node --test bench/vs-claude/test/
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkArms, doneKeys, supportedLanes } from '../lib/queue.mjs';

const SUITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARMS = JSON.parse(fs.readFileSync(path.join(SUITE, 'arms.json'), 'utf8'));

test('arms.json có B6 (lane fast) và B7 (lane single, chờ B-01)', () => {
  assert.equal(ARMS.B6.options.lane, 'fast');
  assert.equal(ARMS.B7.options.lane, 'single');
  assert.equal(ARMS.B7.pending, 'B-01');
});

test('dòng infra không được tính là xong, lượt đó phải chạy lại', () => {
  const text = [
    JSON.stringify({ key: 'a', status: 'done' }),
    JSON.stringify({ key: 'b', status: 'infra', infra: 'rate-limit', resetsAt: '4:50pm' }),
    JSON.stringify({ key: 'c', status: 'failed' }),
    'dòng hỏng',
    '',
  ].join('\n');
  const done = doneKeys(text);
  assert.ok(done.has('a') && done.has('c'));
  assert.ok(!done.has('b'));
});

test('checkArms: B7 báo lỗi rõ khi lane single chưa được hỗ trợ, B6 thì không', () => {
  const lanes = ['auto', 'fast', 'full'];
  assert.deepEqual(checkArms(['B6', 'B0'], ARMS, lanes), []);
  assert.deepEqual(checkArms(['B7'], ARMS, lanes), ["Arm B7 cần lane 'single' (B-01) — CCoding hiện chưa hỗ trợ"]);
  assert.deepEqual(checkArms(['B7'], ARMS, [...lanes, 'single']), []);
});

test('supportedLanes đọc union lane từ src/types.ts', () => {
  const lanes = supportedLanes(path.resolve(SUITE, '../..'));
  assert.ok(lanes.includes('fast'));
});

test('run.mjs --arms B7 thoát mã ≠ 0 trước khi gửi task (lane single chưa có)', (t) => {
  if (supportedLanes(path.resolve(SUITE, '../..')).includes('single')) return t.skip("CCoding đã hỗ trợ lane 'single'");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ccvb-b7-'));
  const r = spawnSync(process.execPath, [path.join(SUITE, 'run.mjs'), '--arms', 'B7', '--tasks', 't1', '--repeats', '1', '--out', out], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Arm B7 cần lane 'single' \(B-01\) — CCoding hiện chưa hỗ trợ/);
  assert.ok(!fs.existsSync(path.join(out, 'runs.jsonl')));
  fs.rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('analyze.mjs loại dòng infra và in số dòng đã loại', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccvb-an-'));
  const row = (o) => JSON.stringify({ task: 't1-duration', category: 'coding', size: 1, rep: 1, score: 1, pass: true, status: 'done', ...o });
  fs.writeFileSync(path.join(dir, 'runs.jsonl'), [row({ key: 'k1', arm: 'A0-sonnet' }), row({ key: 'k2', arm: 'B0' }), row({ key: 'k3', arm: 'B6', status: 'infra', infra: 'rate-limit', score: 0, pass: false })].join('\n'));
  const r = spawnSync(process.execPath, [path.join(SUITE, 'analyze.mjs'), dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Đã loại 1 dòng infra/);
  assert.ok(!fs.readFileSync(path.join(dir, 'summary.csv'), 'utf8').includes('B6'));
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
