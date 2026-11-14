// E9-lite (BRIEF-D19 K2): arm P-H/P-S/P-O. Server CCoding giả (http) + runtime mock; không gọi `claude -p`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkArms } from '../lib/queue.mjs';
import { extractFiles, planOnlyRow, planOnlySchedule, slimPlan } from '../lib/plan-only.mjs';

const SUITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARMS = JSON.parse(fs.readFileSync(path.join(SUITE, 'arms.json'), 'utf8'));
const RUN = path.join(SUITE, 'run.mjs');
const TASKS = ['t1-duration', 't2-orders', 't3-api'];
const PARMS = ['P-H', 'P-S', 'P-O'];

test('P-H/P-S/P-O chỉ khác planModel, ép làn fast như B6', () => {
  const strip = (a) => { const { planModel, ...rest } = ARMS[a].options; return rest; };
  assert.deepEqual(PARMS.map((a) => ARMS[a].options.planModel), ['haiku', 'sonnet', 'opus']);
  assert.deepEqual(strip('P-H'), { lane: 'fast', planOnly: true });
  assert.deepEqual(strip('P-S'), strip('P-H'));
  assert.deepEqual(strip('P-O'), strip('P-H'));
  for (const a of PARMS) { assert.equal(ARMS[a].kind, 'ccoding'); assert.match(ARMS[a].label, /ép làn fast như B6/); }
  assert.equal(ARMS.B6.options.lane, 'fast');
  assert.deepEqual(checkArms(PARMS, ARMS, ['single', 'fast', 'full']), []);
});

test('xáo tất định theo seed và theo khối bài', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const x = planOnlySchedule(ids, PARMS, 2, 'seed1');
  assert.deepEqual(x, planOnlySchedule(ids, PARMS, 2, 'seed1'));
  assert.notDeepEqual(x.map((r) => r.key), planOnlySchedule(ids, PARMS, 2, 'seed2').map((r) => r.key));
  assert.equal(x.length, 6 * 3 * 2);
  assert.equal(new Set(x.map((r) => r.key)).size, x.length);
  const order = []; for (const r of x) if (order.at(-1) !== r.task) order.push(r.task);
  assert.equal(order.length, 6, 'mỗi bài chỉ một khối liền nhau');
  for (const t of ids) assert.deepEqual(x.filter((r) => r.task === t).map((r) => `${r.arm}/${r.rep}`).sort(), ['P-H/1', 'P-H/2', 'P-O/1', 'P-O/2', 'P-S/1', 'P-S/2']);
  assert.notDeepEqual(order, ids, 'thứ tự bài được xáo');
});

test('extractFiles: lấy tệp nêu trong mô tả, bỏ URL, tên khung, số phiên bản, trùng', () => {
  assert.deepEqual(extractFiles('Sửa `src/util/slug.ts` và test/slug.test.mjs; xem https://example.com/a.js, Node.js 22, v1.2.3, src/util/slug.ts lần nữa.'), ['src/util/slug.ts', 'test/slug.test.mjs']);
  assert.deepEqual(extractFiles('Cập nhật README.md, package.json và ./lib/a.py.'), ['README.md', 'package.json', 'lib/a.py']);
  assert.deepEqual(extractFiles('Không có tệp nào, e.g. như vậy.'), []);
  assert.deepEqual(extractFiles(undefined), []);
  assert.deepEqual(slimPlan([{ id: 'K1', title: 't', assignee: 'x', description: 'sửa a/b.ts', dependsOn: ['K0'], deliverable: 'd' }]), [{ id: 'K1', title: 't', assignee: 'x', dependsOn: ['K0'], files: ['a/b.ts'] }]);
  assert.equal(slimPlan(undefined), null);
});

function fakeServer() {
  const seen = []; const tasks = {};
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.method === 'POST' && req.url === '/api/projects') return send(200, { ok: true });
      if (req.method === 'POST' && req.url === '/api/tasks') {
        const b = JSON.parse(body); seen.push(b.options);
        const id = `T-${seen.length}`;
        const it = (i, d, dep) => ({ id: i, title: `Làm ${i}`, assignee: 'x', description: d, dependsOn: dep, deliverable: 'd' });
        const run = { planOnly: true, planModel: `mock-${b.options.planModel}`, planModelSource: 'task', planReplans: 1, planGate: { ok: true },
          planRaw: [it('K1', 'Sửa src/a.ts', []), it('K2', 'Sửa test/b.test.ts', ['K1'])], planFinal: [it('K1', 'Sửa src/a.ts', [])] };
        tasks[id] = { id, status: 'done', runs: [run] };
        return send(200, tasks[id]);
      }
      const m = req.url.match(/^\/api\/tasks\/(T-\d+)$/);
      if (req.method === 'GET' && m) return send(200, { task: tasks[m[1]], usage: [{ key: 'planner', input: 10, output: 5, cacheRead: 0, cacheWrite: 0, calls: 1 }] });
      if (req.method === 'GET' && req.url === '/api/tasks') return send(200, []);
      return send(404, { error: 'không có' });
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, seen, url: `http://127.0.0.1:${srv.address().port}` })));
}
const run = (url, out) => new Promise((resolve) => {
  const args = [RUN, '--arms', PARMS.join(','), '--tasks', TASKS.join(','), '--repeats', '2', '--seed', 'abc', '--runtime', 'mock', '--ccoding-url', url, '--claude-bin', process.execPath, '--out', out, '--work', path.join(out, 'w')];
  const p = spawn(process.execPath, args);
  let stdout = '', stderr = ''; p.stdout.on('data', (c) => { stdout += c; }); p.stderr.on('data', (c) => { stderr += c; });
  p.on('close', (status) => resolve({ status, stdout, stderr }));
});
const rows = (out) => fs.readFileSync(path.join(out, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

test('run.mjs --runtime mock: đủ trường, có authSource, không score/pass, chạy tiếp bỏ qua khóa đã xong', async () => {
  const { srv, seen, url } = await fakeServer();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'p-arms-'));
  try {
    const p = await run(url, out);
    assert.equal(p.status, 0, p.stderr + p.stdout);
    assert.doesNotMatch(p.stdout, /score/i, 'không in điểm');
    const rs = rows(out); const n = TASKS.length * 3 * 2;
    assert.equal(rs.length, n); assert.equal(seen.length, n);
    for (const r of rs) {
      for (const k of ['key', 'task', 'arm', 'rep', 'planRaw', 'planFinal', 'planGate', 'replanCount', 'usage', 'planModel', 'authSource', 'configHash', 'claudeCliVersion', 'ccodingCommit']) assert.ok(k in r, `thiếu ${k}`);
      assert.equal(r.status, 'done'); assert.equal(r.authSource, 'mock');
      assert.ok(!('score' in r) && !('pass' in r), 'không có score/pass');
      assert.equal(r.planModel.match, true); assert.equal(r.planModel.arm, { 'P-H': 'haiku', 'P-S': 'sonnet', 'P-O': 'opus' }[r.arm]);
      assert.equal(r.replanCount, 1); assert.equal(r.planRaw.length, 2);
      assert.deepEqual(r.planRaw[0], { id: 'K1', title: 'Làm K1', assignee: 'x', dependsOn: [], files: ['src/a.ts'] });
      assert.equal(r.usage.tokens.input, 10);
    }
    assert.deepEqual(rs.map((r) => r.key), planOnlySchedule(TASKS, PARMS, 2, 'abc').map((x) => x.key), 'thứ tự chạy = lịch xáo theo seed');
    // chạy tiếp: bỏ dòng cuối → chỉ chạy lại đúng khóa đó
    const lines = fs.readFileSync(path.join(out, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean);
    fs.writeFileSync(path.join(out, 'runs.jsonl'), `${lines.slice(0, -1).join('\n')}\n`);
    const p2 = await run(url, out);
    assert.equal(p2.status, 0, p2.stderr);
    assert.equal(seen.length, n + 1, 'chỉ một lượt mới được gửi');
    assert.equal(rows(out).length, n);
    await run(url, out); assert.equal(seen.length, n + 1, 'đã xong hết thì không gửi thêm');
  } finally { srv.close(); fs.rmSync(out, { recursive: true, force: true }); }
});

test('model thật của lượt plan lệch planModel của arm → lượt ghi lỗi, không tính là xong', () => {
  const r = planOnlyRow({ s: { key: 'k', task: 't', arm: 'P-H', rep: 1 }, spec: ARMS['P-H'], meta: { timeoutMin: 1 }, runtime: 'mock', seed: 's',
    r: { status: 'done', plan: { planModel: 'claude-opus-5-5', planRaw: [], planFinal: [], planGate: null, planReplans: 0 } } });
  assert.equal(r.status, 'error'); assert.equal(r.planModel.match, false); assert.match(r.error, /không khớp/);
});
