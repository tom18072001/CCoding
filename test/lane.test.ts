import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { chooseLane, laneSignals, type LaneConfig } from '../src/lane.js';
import { loadConfig } from '../src/config.js';

const TASKS = path.resolve('bench/vs-claude/tasks');
const base = loadConfig();
const cfg: LaneConfig = base;

function starterFiles(id: string): string[] {
  const root = path.join(TASKS, id, 'starter');
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(root, p).replace(/\\/g, '/'));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

function briefOf(id: string): string {
  const dir = path.join(TASKS, id);
  const tj = path.join(dir, 'task.json');
  if (fs.existsSync(tj)) return JSON.parse(fs.readFileSync(tj, 'utf8')).brief;
  return fs.readFileSync(path.join(dir, 'prompt.txt'), 'utf8').trim();
}

function pick(id: string, forced?: 'single' | 'fast' | 'full') {
  const s = laneSignals(briefOf(id), starterFiles(id), 20_000, forced);
  return { s, c: chooseLane(s, cfg) };
}

test('lanes.single có giá trị mặc định theo backlog §3.1', () => {
  assert.deepEqual(base.lanes.single, { enabled: true, maxParts: 5, maxFilesTouched: 6 });
});

for (const id of ['t1-duration', 't2-orders', 't3-api', 't4-perf', 't5-logq']) {
  test(`${id} ⇒ làn đơn (quy tắc 4)`, () => {
    const { s, c } = pick(id);
    assert.equal(c.lane, 'single', JSON.stringify(s));
    assert.equal(c.rule, 4);
    assert.ok(s.parts < 5 && s.filesTouched < 6, JSON.stringify(s));
  });
}

test('l1-modules (5 phần độc lập) ⇒ lớn, làn nhanh', () => {
  const { s, c } = pick('l1-modules');
  assert.equal(s.parts, 5);
  assert.equal(s.sequential, false);
  assert.equal(c.lane, 'fast');
  assert.equal(c.rule, 3);
});

test('l2-chain (chuỗi phụ thuộc tuần tự) ⇒ làn đơn dù nêu nhiều tệp', () => {
  const { s, c } = pick('l2-chain');
  assert.equal(s.sequential, true);
  assert.ok(s.filesTouched >= 6 || s.parts >= 4, JSON.stringify(s));
  assert.equal(c.lane, 'single');
});

test('mục đánh số/gạch đầu dòng cấp cao nhất được đếm, mục con thì không', () => {
  const brief = '- a\n  - a1\n  - a2\n- b\n- c\n- d\n- e';
  assert.equal(laneSignals(brief, [], 0).parts, 5);
  assert.equal(chooseLane(laneSignals(brief, [], 0), cfg).lane, 'fast');
  assert.equal(laneSignals('1. một\n2. hai\n3. ba', [], 0).parts, 3);
});

test('filesTouched: đường dẫn khớp ls-files + thư mục nêu, không đếm trùng', () => {
  const files = ['src/a.js', 'src/b.js', 'test/a.test.js', 'README.md'];
  const s = laneSignals('Sửa src/a.js, src/b.js, thư mục test/ và README.md', files, 0);
  assert.equal(s.filesTouched, 4);
  const many = laneSignals('sửa src/a.js src/b.js src/c.js src/d.js src/e.js src/f.js', files, 0);
  assert.equal(chooseLane(many, cfg).lane, 'fast');
});

test('quy tắc 2: đề dài hoặc repo lớn ⇒ làn đầy', () => {
  const long = laneSignals('x'.repeat(cfg.fastLane.maxBriefChars + 1), [], 0);
  assert.deepEqual([chooseLane(long, cfg).lane, chooseLane(long, cfg).rule], ['full', 2]);
  const big = laneSignals('việc nhỏ', Array.from({ length: cfg.fastLane.maxRepoFiles + 1 }, (_, i) => `f${i}.js`), 0);
  assert.equal(chooseLane(big, cfg).lane, 'full');
  assert.equal(chooseLane(laneSignals('việc nhỏ', [], cfg.fastLane.maxRepoBytes + 1), cfg).lane, 'full');
});

test('lanes.single.enabled = false ⇒ việc nhỏ đi làn nhanh', () => {
  const off: LaneConfig = { ...cfg, lanes: { single: { enabled: false, maxParts: 5, maxFilesTouched: 6 } } };
  assert.equal(chooseLane(laneSignals('việc nhỏ', [], 0), off).lane, 'fast');
});

test('ép làn fast/full/single được tôn trọng, kể cả khi tín hiệu nói khác', () => {
  for (const forced of ['fast', 'full', 'single'] as const) {
    for (const id of ['t1-duration', 'l1-modules']) {
      const { c } = pick(id, forced);
      assert.equal(c.lane, forced);
      assert.equal(c.rule, 1);
    }
  }
  const long = laneSignals('x'.repeat(9000), [], 0, 'single');
  assert.equal(chooseLane(long, cfg).lane, 'single');
});
