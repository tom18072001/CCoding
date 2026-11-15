import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { chooseLane, forcedLane, laneSignals, type LaneConfig } from '../src/lane.js';
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
  assert.deepEqual(base.lanes.single, { enabled: true, maxParts: 5, maxFilesTouched: 6, slim: { accept: 'full', compactTemplate: false, promptDiet: true } });
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

test('V4-3f khối B: l1-modules mà hạng mục chạy lệnh làm lần lượt (không có worktree con) ⇒ giữ làn đơn; tắt requireParallel ⇒ làn nhanh như cũ', () => {
  const { s } = pick('l1-modules');
  const serial = { ...s, serialWriters: true };
  const c = chooseLane(serial, cfg);
  assert.deepEqual([c.lane, c.rule], ['single', 3]);
  assert.match(c.why, /làm lần lượt/);
  assert.equal(cfg.fastLane.requireParallel, true, 'mặc định bật');
  const off: LaneConfig = { ...cfg, fastLane: { ...cfg.fastLane, requireParallel: false } };
  assert.equal(chooseLane(serial, off).lane, 'fast');
  // song song được thì không đổi
  assert.equal(chooseLane({ ...s, serialWriters: false }, cfg).lane, 'fast');
  // làn đơn tắt thì vẫn làn nhanh (không có làn nào rẻ hơn để chọn)
  const noSingle: LaneConfig = { ...cfg, lanes: { single: { enabled: false, maxParts: 5, maxFilesTouched: 6 } } };
  assert.equal(chooseLane(serial, noSingle).lane, 'fast');
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

test('B-02: forcedLane — options.lane > project.lane > auto; "auto" hoặc trống = không ép', () => {
  assert.equal(forcedLane('fast', 'single'), 'fast');
  assert.equal(forcedLane(undefined, 'single'), 'single');
  assert.equal(forcedLane('auto', 'single'), undefined, 'options "auto" nghĩa là không ép, không rơi xuống dự án');
  assert.equal(forcedLane(undefined, 'auto'), undefined);
  assert.equal(forcedLane(undefined, undefined), undefined);
  assert.equal(forcedLane('bậy', 'full'), 'full');
});

test('B-02: project.lane = single → làn đơn, không có lượt route (không gọi router)', async () => {
  const { testApp } = await import('./helpers.js');
  const a = testApp();
  try {
    a.store.saveProject({ id: 'p1', name: 'P', department: 'dev', classification: 'internal', lane: 'single', createdAt: new Date().toISOString() });
    const t = a.orchestrator.submit({ brief: 'Sửa lỗi chính tả trong README', projectId: 'p1' });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.lane, 'single', done.error);
    const phases = a.usage.all({ task: t.id }).map((c) => c.phase);
    assert.equal(phases.includes('route' as never), false);
  } finally {
    a.cleanup();
  }
});
