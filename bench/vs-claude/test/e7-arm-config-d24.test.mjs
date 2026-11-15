// D24: run.mjs của E7 nhận --arm-config (mỗi arm một app, một tiến trình), --selected; runCto ghi trường accept*. Không gọi LLM thật:
// run.mjs chạy thật bằng tiến trình con, nhưng --root trỏ tới một "dist" giả bọc dist thật và thay runtime claude-cli bằng runtime giả.
// Cần dist/ (npm run build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { acceptStats } from '../e7/lib.mjs';
import { mutationSites, productFiles, rng, sample } from '../../../docs/research/analysis/g-mutation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RUN = path.join(ROOT, 'bench', 'vs-claude', 'e7', 'run.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'e7-d24-'));
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const jl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

/** Bộ bài giả + artifact giả (như e7.test.mjs): hai mục (lỗi, đúng) cùng một bài. */
function fixture() {
  const suite = tmp();
  const t = { id: 'tx-grade', category: 'coding', title: 'Letter grades', deliverable: 'src/', grader: 'code', brief: 'Implement `grade(score)` in `src/grade.js`: A for >= 90, B for >= 50, otherwise C. `npm test` runs the visible tests.' };
  const tasksDir = path.join(suite, 'tasks');
  write(path.join(tasksDir, t.id, 'task.json'), JSON.stringify(t));
  const pkg = JSON.stringify({ name: 'g', type: 'module', scripts: { test: 'node --test "test/**/*.test.js"' } });
  write(path.join(tasksDir, t.id, 'repo', 'package.json'), pkg);
  write(path.join(tasksDir, t.id, 'repo', 'src', 'grade.js'), 'export function grade(score) {\n  throw new Error("todo");\n}\n');
  write(path.join(tasksDir, t.id, 'hidden', 'grade.hidden.test.js'), "import { test } from 'node:test'; import assert from 'node:assert/strict'; import { grade } from '../src/grade.js';\ntest('bands', () => { assert.equal(grade(95), 'A'); assert.equal(grade(90), 'A'); assert.equal(grade(70), 'B'); assert.equal(grade(50), 'B'); assert.equal(grade(10), 'C'); });\n");
  const artifacts = path.join(suite, 'artifacts');
  const key = `${t.id}__A0-sonnet__r1`;
  const art = path.join(artifacts, key);
  write(path.join(art, 'package.json'), pkg);
  write(path.join(art, 'src', 'grade.js'), "export function grade(score) {\n  if (score >= 90) return 'A';\n  if (score >= 50) return 'B';\n  return 'C';\n}\n");
  write(path.join(art, 'test', 'grade.test.js'), "import { test } from 'node:test'; import assert from 'node:assert/strict'; import { grade } from '../src/grade.js';\ntest('A', () => assert.equal(grade(95), 'A'));\n");
  const sites = []; for (const f of productFiles(art, t.deliverable)) for (const s of mutationSites(fs.readFileSync(path.join(art, f), 'utf8'), f)) sites.push({ ...s, file: f });
  const pick = sample(sites, 12, rng(`20261104|${key}`));
  const i = pick.findIndex((s) => s.op === 'CRP' && s.repl === '51');
  assert.ok(i >= 0);
  const s = pick[i];
  const faulty = { id: 'aaaaaaaaaa', kind: 'faulty', task: t.id, key, arm: 'A0-sonnet', site: { i, file: s.file, line: s.line, op: s.op, repl: s.repl } };
  const clean = { id: 'bbbbbbbbbb', kind: 'clean', task: t.id, key, arm: 'A0-sonnet' };
  const itemsFile = path.join(suite, 'items.json');
  write(itemsFile, JSON.stringify({ seed: 'd24-test', items: [faulty, clean], reserve: {} }));
  return { suite, tasksDir, artifacts, itemsFile, faulty, clean };
}

/** Gốc giả: dist/ bọc dist thật; app.js thay runtime claude-cli bằng runtime giả ghi yêu cầu nhận được vào FAKE_LOG. */
function fakeRoot() {
  const root = tmp();
  const real = path.join(ROOT, 'dist');
  for (const f of ['tools/workspace.js', 'git.js', 'prompts.js', 'planner.js', 'runtimes/common.js', 'orchestrator.js', 'util/redact.js', 'config.js']) {
    write(path.join(root, 'dist', f), `export * from ${JSON.stringify(pathToFileURL(path.join(real, f)).href)};\n`);
  }
  write(path.join(root, 'dist', 'app.js'), `import fs from 'node:fs';
import { createApp as real } from ${JSON.stringify(pathToFileURL(path.join(real, 'app.js')).href)};
export function createApp(o, opts) {
  const app = real(o, { ...opts, root: ${JSON.stringify(ROOT)} });
  const rt = app.runtimes.get('claude-cli');
  rt.available = async () => ({ ok: true, detail: 'giả' });
  rt.run = async (req) => {
    fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ dataDir: app.config.dataDir, phase: req.phase, maxTurns: req.toolPolicy?.maxTurns ?? null, cwd: req.cwd }) + '\\n');
    const json = { accepted: true, summary: 'Đạt.', criteria: [{ name: 'Biên', result: 'pass', evidence: 'src/grade.js' }], risks: [], followUps: [] };
    return { text: '## Tóm tắt\\nx\\n\\n\`\`\`json\\n' + JSON.stringify(json) + '\\n\`\`\`', usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, costUsd: 0 }, estimated: false, model: 'claude-sonnet-5-5', runtime: 'claude-cli', durationMs: 5, turns: 3 };
  };
  return app;
}
`);
  return root;
}

const cfg = (dir, name, accept) => { const f = path.join(dir, name); fs.writeFileSync(f, JSON.stringify({ phases: { toolTurns: { accept } } })); return f; };
const node = (args, env = {}) => spawnSync(process.execPath, [RUN, ...args], { encoding: 'utf8', timeout: 400_000, env: { ...process.env, ...env } });

test('--arm-config + --selected: hai app trong một tiến trình, trần lượt theo arm, xen kẽ, thư mục data riêng, sha256 đúng tệp', () => {
  const fx = fixture(), root = fakeRoot(), d = tmp();
  const out = path.join(d, 'out'), ccData = path.join(d, 'ccd'), log = path.join(d, 'fake.jsonl');
  const c1 = cfg(d, 'r1.json', 6), c2 = cfg(d, 'r2.json', 16);
  const selected = path.join(d, 'chot.json');
  fs.writeFileSync(selected, JSON.stringify({ items: ['aaaaaaaaaa', 'bbbbbbbbbb'] }));
  // CCODING_CONFIG (có hiệu lực nhờ CCODING_TEST_LOCAL) trần 99: cấu hình theo arm phải thắng, biến môi trường không được dùng chung
  const env = { FAKE_LOG: log, CCODING_TEST_LOCAL: '1', CCODING_CONFIG: cfg(d, 'env.json', 99) };
  const r = node(['--items', fx.itemsFile, '--tasks-dir', fx.tasksDir, '--artifacts', fx.artifacts, '--out', out, '--work', path.join(d, 'work'), '--ccoding-data', ccData,
    '--root', root, '--arms', 'R1,R2', '--arm-config', `R1=${c1},R2=${c2}`, '--selected', selected], env);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  const rows = jl(path.join(out, 'runs.jsonl'));
  assert.equal(rows.length, 4);
  assert.ok(rows.every((x) => x.status === 'done'), JSON.stringify(rows.map((x) => [x.arm, x.status, x.error])));
  // xen kẽ trong một tiến trình: R1,R2 rồi R2,R1 (hoặc ngược lại), mỗi mục đủ hai arm
  const seq = rows.map((x) => x.arm);
  assert.ok(seq[0] !== seq[1] && seq[2] !== seq[3] && seq[1] === seq[2], seq.join());
  // trần lượt nhận ở yêu cầu runtime: R1 6, R2 16; calls.jsonl của từng arm ở thư mục riêng
  const calls = jl(log).filter((x) => x.phase === 'accept');
  const by = (dir) => calls.filter((x) => path.resolve(x.dataDir) === path.resolve(ccData, dir));
  assert.equal(by('w1').length, 2); assert.equal(by('w2').length, 2);
  assert.ok(by('w1').every((x) => x.maxTurns === 6), JSON.stringify(by('w1')));
  assert.ok(by('w2').every((x) => x.maxTurns === 16), JSON.stringify(by('w2')));
  for (const x of rows) { assert.equal(x.maxTurns, x.arm === 'R1' ? 6 : 16); assert.equal(x.extraConfigSha256, sha(x.arm === 'R1' ? c1 : c2)); }
  for (const dir of ['w1', 'w2']) {
    const files = fs.readdirSync(path.join(ccData, dir), { recursive: true }).filter((f) => String(f).endsWith('calls.jsonl'));
    assert.equal(files.length, 2, `${dir}: mỗi mục một calls.jsonl`);
  }
  // trường lượt accept trên dòng chạy
  for (const x of rows) { assert.equal(x.acceptCalls, 1); assert.ok(Array.isArray(x.acceptAuthSources)); assert.equal(typeof x.acceptTurnCapped, 'boolean'); assert.equal(typeof x.acceptToolCalls, 'number'); assert.ok('acceptTurns' in x); }
  // --selected: không có selected.json hay prep.jsonl mới trong --out; config-*.json ghi bảng sha256
  assert.equal(fs.existsSync(path.join(out, 'selected.json')), false);
  assert.equal(fs.existsSync(path.join(out, 'prep.jsonl')), false);
  const cf = fs.readdirSync(out).filter((f) => /^config-.*\.json$/.test(f));
  assert.equal(cf.length, 1);
  const conf = JSON.parse(fs.readFileSync(path.join(out, cf[0]), 'utf8'));
  assert.deepEqual(conf.armConfigSha256, { R1: sha(c1), R2: sha(c2) });
  assert.equal(conf.selectedSha256, sha(selected));
  assert.deepEqual(fs.readdirSync(out).filter((f) => !/^config-/.test(f)).sort(), ['responses', 'runs.jsonl']);
});

test('không truyền cờ mới: một app dùng chung, extraConfigSha256 theo --config, selected.json vẫn do bước 1 tạo', () => {
  const fx = fixture(), root = fakeRoot(), d = tmp();
  const out = path.join(d, 'out'), ccData = path.join(d, 'ccd'), log = path.join(d, 'fake.jsonl');
  const c = cfg(d, 'chung.json', 9);
  const r = node(['--items', fx.itemsFile, '--tasks-dir', fx.tasksDir, '--artifacts', fx.artifacts, '--out', out, '--work', path.join(d, 'work'), '--ccoding-data', ccData,
    '--root', root, '--arms', 'R1,R2', '--config', c, '--only', 'bbbbbbbbbb'], { FAKE_LOG: log, CCODING_TEST_LOCAL: '1' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  const rows = jl(path.join(out, 'runs.jsonl'));
  assert.equal(rows.length, 2);
  for (const x of rows) { assert.equal(x.extraConfigSha256, sha(c)); assert.equal(x.maxTurns, 9); assert.equal(x.status, 'done'); }
  assert.equal(fs.existsSync(path.join(out, 'selected.json')), true);
  assert.equal(fs.existsSync(path.join(ccData, 'w1')), false, 'không có --arm-config: data dùng chung như cũ');
});

test('lỗi cờ: thoát khác 0 trước mọi thư mục, prep.jsonl, runs.jsonl', () => {
  const fx = fixture(), d = tmp();
  const c1 = cfg(d, 'r1.json', 6), c2 = cfg(d, 'r2.json', 16);
  const good = path.join(d, 'chot.json');
  fs.writeFileSync(good, JSON.stringify({ items: ['aaaaaaaaaa'] }));
  const bad = path.join(d, 'hong.json'); fs.writeFileSync(bad, '{không phải json');
  const empty = path.join(d, 'rong.json'); fs.writeFileSync(empty, JSON.stringify({ items: [] }));
  const unknown = path.join(d, 'la.json'); fs.writeFileSync(unknown, JSON.stringify({ items: ['aaaaaaaaaa', 'zzzzzzzzzz'] }));
  const cases = [
    ['thiếu arm R2', ['--arms', 'R1,R2', '--arm-config', `R1=${c1}`], /R2.*chưa có tệp/],
    ['arm trùng', ['--arms', 'R1,R2', '--arm-config', `R1=${c1},R2=${c2},R1=${c1}`], /R1 bị trùng/],
    ['tệp không tồn tại', ['--arms', 'R1,R2', '--arm-config', `R1=${c1},R2=${path.join(d, 'khong-co.json')}`], /không tồn tại/],
    ['dùng chung với --config', ['--arms', 'R1,R2', '--arm-config', `R1=${c1},R2=${c2}`, '--config', c1], /không dùng chung/],
    ['arm lạ', ['--arms', 'R1,R2', '--arm-config', `R1=${c1},R2=${c2},R9=${c2}`], /arm không có/],
    ['--selected không tồn tại', ['--selected', path.join(d, 'khong-co.json')], /không tồn tại/],
    ['--selected không phải JSON', ['--selected', bad], /không phải JSON/],
    ['--selected items rỗng', ['--selected', empty], /không rỗng/],
    ['--selected có mã lạ', ['--selected', unknown], /không có trong bộ mục/],
  ];
  for (const [name, args, re] of cases) {
    const out = path.join(d, `out-${name.replace(/\W/g, '_')}`), work = path.join(d, `work-${name.replace(/\W/g, '_')}`), ccd = path.join(d, `ccd-${name.replace(/\W/g, '_')}`);
    const r = node(['--items', fx.itemsFile, '--tasks-dir', fx.tasksDir, '--artifacts', fx.artifacts, '--out', out, '--work', work, '--ccoding-data', ccd, ...args]);
    assert.notEqual(r.status, 0, `${name}: phải thoát khác 0\n${r.stdout}`);
    assert.match(r.stderr, re, name);
    assert.equal(fs.existsSync(out), false, `${name}: không tạo --out`);
    assert.equal(fs.existsSync(work), false, `${name}: không tạo --work`);
    assert.equal(fs.existsSync(ccd), false, `${name}: không tạo thư mục data`);
  }
});

test('acceptStats: turnCapped, authSource, toolCalls; một bản ghi accept thiếu turns ⇒ acceptTurns null; đủ turns ⇒ tổng', () => {
  const text = [
    { phase: 'accept', authSource: 'login', turns: 4, toolCalls: 3 },
    { phase: 'accept', authSource: 'login', turns: 6, toolCalls: 5, turnCapped: true },
    { phase: 'accept', authSource: 'oauth', turns: 2 },
    { phase: 'exec', authSource: 'khác', turns: 99, toolCalls: 99 },
    { phase: 'accept', authSource: '' , turns: 1, toolCalls: 1 },
  ].map((x) => JSON.stringify(x)).join('\n');
  const calls = text.split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(acceptStats(calls), { acceptCalls: 4, acceptAuthSources: ['login', 'oauth'], acceptTurnCapped: true, acceptToolCalls: 9, acceptTurns: 13 });
  const missing = [...calls, { phase: 'accept', authSource: 'login', toolCalls: 2 }];
  const s = acceptStats(missing);
  assert.equal(s.acceptTurns, null, 'thiếu turns ở một bản ghi accept ⇒ null, không coi là 0');
  assert.equal(s.acceptCalls, 5);
  assert.equal(acceptStats([{ phase: 'accept', turns: 'ba' }]).acceptTurns, null, 'turns không phải số ⇒ null');
  assert.deepEqual(acceptStats([{ phase: 'plan', turns: 2 }]), { acceptCalls: 0, acceptAuthSources: [], acceptTurnCapped: false, acceptToolCalls: 0, acceptTurns: null });
});
