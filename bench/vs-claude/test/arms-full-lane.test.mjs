// K3 (D12): arm B0F/B1F ép làn đầy đủ. node --test bench/vs-claude/test/arms-full-lane.test.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkArms, supportedLanes } from '../lib/queue.mjs';

const SUITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(SUITE, '..', '..');
const ARMS = JSON.parse(fs.readFileSync(path.join(SUITE, 'arms.json'), 'utf8'));
const PROBE = path.join(SUITE, 'test', 'fixtures', 'full-lane-probe.mts');
const BASE_COMMIT = 'e12e037'; // arms.json trước D12

function probe(options) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', PROBE, JSON.stringify(options)], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

test('B0F/B1F khai báo đúng trong arms.json', () => {
  assert.deepEqual(ARMS.B0F, { kind: 'ccoding', options: { lane: 'full' }, label: 'CCoding làn đầy đủ (ép)' });
  assert.deepEqual(ARMS.B1F, { kind: 'ccoding', options: { lane: 'full', discussionRounds: 0 }, label: 'CCoding làn đầy đủ (ép), bỏ họp' });
});

test('(a) lane:full, kế hoạch giả ≥ 3 hạng mục và ≥ 2 người ⇒ có pha discuss', { timeout: 150_000 }, () => {
  const r = probe(ARMS.B0F.options);
  assert.equal(r.status, 'done', r.error);
  assert.equal(r.lane, 'full');
  assert.ok(r.subtasks >= 3 && r.assignees >= 2, `kế hoạch giả: ${r.subtasks} hạng mục, ${r.assignees} người`);
  assert.ok(r.discussion > 0, 'có phát biểu trong họp');
});

test('(b) lane:full + discussionRounds:0 ⇒ không có pha discuss', { timeout: 150_000 }, () => {
  const r = probe(ARMS.B1F.options);
  assert.equal(r.status, 'done', r.error);
  assert.equal(r.lane, 'full');
  assert.ok(r.subtasks >= 3 && r.assignees >= 2);
  assert.equal(r.discussion, 0);
});

test("(c) checkArms(['B0F','B1F']) với lane đọc từ src/types.ts trả mảng rỗng", () => {
  const lanes = supportedLanes(ROOT);
  assert.ok(lanes.includes('full'), `lanes: ${lanes}`);
  assert.deepEqual(checkArms(['B0F', 'B1F'], ARMS, lanes), []);
});

test(`(d) mọi arm cũ giống hệt arms.json ở ${BASE_COMMIT}`, (t) => {
  let old;
  try {
    old = JSON.parse(execFileSync('git', ['show', `${BASE_COMMIT}:bench/vs-claude/arms.json`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch { return t.skip(`không đọc được ${BASE_COMMIT} (clone nông?)`); }
  for (const [id, arm] of Object.entries(old)) assert.deepEqual(ARMS[id], arm, `arm ${id} bị đổi`);
  // arm thêm sau e12e037: B0F/B1F (D12), B6w1/B6w4 (E8, V4-3f) — arm cũ không đổi
  assert.deepEqual(Object.keys(ARMS).filter((k) => !(k in old)).sort(), ['B0F', 'B1F', 'B6w1', 'B6w4']);
});
