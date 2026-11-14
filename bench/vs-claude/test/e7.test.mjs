// E7 (§9 V4-3f bản chốt): lấy mẫu, chuẩn bị mục, R1 qua CCoding thật với runtime giả, R3 với claude giả, phân tích. Không gọi LLM.
// Cần dist/ (npm run build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeArgs, TOOLS } from '../lib/claude.mjs';
import { sampleItems, countItems } from '../e7/sample.mjs';
import { spawnSync } from 'node:child_process';
import { assertOwnRepo, copyTree, loadCcoding, locateSite, prepareItem, r3Prompt, r3Tools, runCto, runSingle, verdictOf, ARM_DIR } from '../e7/lib.mjs';
import { analyze, mcnemarExact } from '../e7/analyze.mjs';
import { mutationSites, productFiles, rng, sample, applySite } from '../../../docs/research/analysis/g-mutation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'e7-t-'));
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

test('claudeArgs: mặc định giữ đúng từng cờ như mọi đợt đo trước', () => {
  assert.deepEqual(claudeArgs({ prompt: 'P', model: 'sonnet' }), ['-p', 'P', '--output-format', 'stream-json', '--verbose', '--model', 'sonnet',
    '--permission-mode', 'acceptEdits', '--allowedTools', TOOLS, '--disallowedTools', 'WebFetch,WebSearch,Task',
    '--no-session-persistence', '--strict-mcp-config', '--setting-sources', 'project,local']);
  const a = claudeArgs({ prompt: 'P', model: 'sonnet', tools: 'Read,Glob', allowedTools: 'Read,Glob', permissionMode: 'default', maxTurns: 6, stdin: true });
  assert.equal(a.includes('P'), false, 'stdin: prompt không nằm trong tham số');
  assert.deepEqual(a.slice(a.indexOf('--tools'), a.indexOf('--tools') + 2), ['--tools', 'Read,Glob']);
  assert.deepEqual(a.slice(a.indexOf('--max-turns'), a.indexOf('--max-turns') + 2), ['--max-turns', '6']);
  assert.equal(a[a.indexOf('--permission-mode') + 1], 'default');
});

test('sampleItems: trần mỗi bài, tối đa 1 lỗi mỗi lượt, mục đúng ghép theo bài và ưu tiên lượt chưa dùng, tất định', () => {
  const surv = [];
  for (let r = 1; r <= 14; r++) for (let i = 0; i < 3; i++) surv.push({ key: `ta__A__r${r}`, task: 'ta', arm: 'A', i, file: 'src/a.js', line: i + 1, op: 'ROR', repl: '<' });
  for (let r = 1; r <= 3; r++) surv.push({ key: `tb__B__r${r}`, task: 'tb', arm: 'B', i: 0, file: 'src/b.js', line: 1, op: 'EQ', repl: '!==' });
  const g = [];
  for (let r = 1; r <= 20; r++) g.push({ type: 'base', key: `ta__A__r${r}`, task: 'ta', hPass: true, vRed: false, vNone: false });
  for (let r = 1; r <= 4; r++) g.push({ type: 'base', key: `tb__B__r${r}`, task: 'tb', hPass: r !== 4, vRed: false, vNone: false });
  const a = sampleItems(surv, g, { cap: 10 }), b = sampleItems(surv, g, { cap: 10 });
  assert.deepEqual(a, b);
  assert.deepEqual(countItems(a.items), { ta: { faulty: 10, clean: 10 }, tb: { faulty: 3, clean: 3 } });
  const fk = a.items.filter((x) => x.kind === 'faulty').map((x) => x.key);
  assert.equal(new Set(fk).size, fk.length, 'mỗi lượt tối đa 1 lỗi');
  const faultyTa = new Set(a.items.filter((x) => x.kind === 'faulty' && x.task === 'ta').map((x) => x.key));
  assert.ok(a.items.filter((x) => x.kind === 'clean' && x.task === 'ta').every((x) => !faultyTa.has(x.key)), 'ta có đủ lượt chưa dùng');
  assert.ok(!a.items.some((x) => x.key === 'tb__B__r4' && x.kind === 'clean'), 'lượt trượt test ẩn không là mục đúng');
  assert.equal(a.reserve.ta.faulty.length, 4);
  assert.ok(a.items.every((x) => /^[0-9a-f]{10}$/.test(x.id)));
  assert.equal(new Set(a.items.map((x) => x.id)).size, a.items.length);
});

test('mcnemarExact và analyze: recall, chặn nhầm, cặp bất đồng', () => {
  assert.equal(mcnemarExact(0, 0), 1);
  assert.ok(Math.abs(mcnemarExact(0, 6) - 2 / 64) < 1e-12);
  assert.ok(Math.abs(mcnemarExact(2, 8) - 2 * (1 + 10 + 45) / 1024) < 1e-12);
  const items = [
    { id: 'f1', kind: 'faulty', task: 'x' }, { id: 'f2', kind: 'faulty', task: 'x' }, { id: 'f3', kind: 'faulty', task: 'y' },
    { id: 'c1', kind: 'clean', task: 'x' }, { id: 'c2', kind: 'clean', task: 'y' },
  ];
  const row = (id, arm, verdict, status = 'done') => ({ id, arm, status, verdict, tokens: { weighted: 10 }, costUsd: 0.1, wallSec: 5 });
  const rows = [row('f1', 'R1', 'block'), row('f2', 'R1', 'block'), row('f3', 'R1', 'pass'), row('c1', 'R1', 'pass'), row('c2', 'R1', 'block'),
    row('f1', 'R3', 'pass'), row('f2', 'R3', 'unparsed'), row('f3', 'R3', 'pass'), row('c1', 'R3', 'pass'), row('c2', 'R3', 'pass'),
    row('f3', 'R2', null, 'infra')];
  const a = analyze({ items, selected: items.map((x) => x.id), rows, arms: ['R1', 'R2', 'R3'] });
  assert.deepEqual([a.per.R1.faulty.blocked, a.per.R1.faulty.n, a.per.R1.clean.blocked, a.per.R1.clean.n], [2, 3, 1, 2]);
  assert.deepEqual([a.per.R3.faulty.blocked, a.per.R3.faulty.unparsed], [0, 1], 'không đọc được kết luận thì không chặn');
  assert.equal(a.per.R2.faulty.n, 0, 'dòng infra không tính');
  assert.deepEqual([a.primary.n, a.primary.aOnly, a.primary.bOnly], [3, 2, 0]);
  assert.equal(verdictOf(true, false), 'block');
  assert.equal(verdictOf(false, false), 'unparsed');
});

// ───────────── bộ bài giả + artifact giả ─────────────
function fixture() {
  const suite = tmp();
  const t = { id: 'tx-grade', category: 'coding', title: 'Letter grades', deliverable: 'src/', grader: 'code', brief: 'Implement `grade(score)` in `src/grade.js`: A for >= 90, B for >= 50, otherwise C. `npm test` runs the visible tests.' };
  write(path.join(suite, 'tasks', t.id, 'task.json'), JSON.stringify(t));
  const pkg = JSON.stringify({ name: 'g', type: 'module', scripts: { test: 'node --test "test/**/*.test.js"' } });
  write(path.join(suite, 'tasks', t.id, 'repo', 'package.json'), pkg);
  write(path.join(suite, 'tasks', t.id, 'repo', 'src', 'grade.js'), 'export function grade(score) {\n  throw new Error("todo");\n}\n');
  write(path.join(suite, 'tasks', t.id, 'repo', 'data', 'note.txt'), 'starter-only file\n');
  write(path.join(suite, 'tasks', t.id, 'hidden', 'grade.hidden.test.js'), "import { test } from 'node:test'; import assert from 'node:assert/strict'; import { grade } from '../src/grade.js';\ntest('bands', () => { assert.equal(grade(95), 'A'); assert.equal(grade(90), 'A'); assert.equal(grade(70), 'B'); assert.equal(grade(50), 'B'); assert.equal(grade(10), 'C'); });\n");
  const art = path.join(suite, 'artifacts', `${t.id}__A0-sonnet__r1`);
  write(path.join(art, 'package.json'), pkg);
  write(path.join(art, 'src', 'grade.js'), "export function grade(score) {\n  if (score >= 90) return 'A';\n  if (score >= 50) return 'B';\n  return 'C';\n}\n");
  write(path.join(art, 'test', 'grade.test.js'), "import { test } from 'node:test'; import assert from 'node:assert/strict'; import { grade } from '../src/grade.js';\ntest('A', () => assert.equal(grade(95), 'A'));\n");
  write(path.join(art, '_FINAL.txt'), 'báo cáo của agent (không dùng)');
  // đột biến lọt cổng: npm test xanh, test ẩn trượt (như kho G-4)
  const key = `${t.id}__A0-sonnet__r1`;
  const sites = []; for (const f of productFiles(art, t.deliverable)) for (const s of mutationSites(fs.readFileSync(path.join(art, f), 'utf8'), f)) sites.push({ ...s, file: f });
  const pick = sample(sites, 12, rng(`20261104|${key}`));
  const i = pick.findIndex((s) => s.op === 'CRP' && s.repl === '51');
  assert.ok(i >= 0, 'fixture có đột biến 50 → 51');
  const s = pick[i];
  return { suite, task: t, key, faulty: { id: 'aaaaaaaaaa', kind: 'faulty', task: t.id, key, arm: 'A0-sonnet', site: { i, file: s.file, line: s.line, op: s.op, repl: s.repl } }, clean: { id: 'bbbbbbbbbb', kind: 'clean', task: t.id, key, arm: 'A0-sonnet' } };
}

const FORBIDDEN = ['faulty', 'mutant', 'mutation', 'đột biến', 'E7', 'CRP', 'hidden', 'nhãn lỗi'];
const leaks = (s) => FORBIDDEN.filter((w) => String(s).includes(w));

test('prepareItem: đúng đột biến của G, nhãn kiểm lại, base = starter, không lộ nhãn trong workspace', async () => {
  const cc = await loadCcoding(ROOT);
  const fx = fixture();
  const work = tmp();
  const pf = await prepareItem(fx.faulty, { suite: fx.suite, artifacts: path.join(fx.suite, 'artifacts'), workRoot: work, cc });
  assert.equal(pf.ok, true, pf.reason);
  assert.equal(pf.siteMode, 'artifact');
  assert.equal(pf.latest[0].ok, true);
  assert.equal(pf.hidden.pass, false);
  for (const arm of Object.keys(ARM_DIR)) {
    const d = pf.dirs[arm].dir;
    assert.match(fs.readFileSync(path.join(d, 'src', 'grade.js'), 'utf8'), /score >= 51/);
    assert.equal(fs.existsSync(path.join(d, '_FINAL.txt')), false);
    assert.equal(fs.existsSync(path.join(d, 'data', 'note.txt')), true, 'tệp starter thiếu được chép (G-b)');
    assert.deepEqual(leaks(d), [], 'đường dẫn workspace trung tính');
  }
  assert.match(pf.changes, /grade\.js/);
  const pc = await prepareItem(fx.clean, { suite: fx.suite, artifacts: path.join(fx.suite, 'artifacts'), workRoot: work, cc });
  assert.equal(pc.ok, true);
  assert.equal(pc.hidden.pass, true);
  assert.match(fs.readFileSync(path.join(pc.dirs.R1.dir, 'src', 'grade.js'), 'utf8'), /score >= 50/);
  // nhãn không tái lập → loại
  const wrong = await prepareItem({ ...fx.clean, id: 'cccccccccc', kind: 'faulty', site: fx.faulty.site, key: fx.key }, { suite: fx.suite, artifacts: path.join(fx.suite, 'artifacts'), workRoot: work, cc });
  assert.equal(wrong.ok, true, 'cùng đột biến vẫn là lỗi');
  const bad = await prepareItem({ ...fx.faulty, id: 'dddddddddd', site: { ...fx.faulty.site, line: 99 } }, { suite: fx.suite, artifacts: path.join(fx.suite, 'artifacts'), workRoot: work, cc });
  assert.deepEqual([bad.ok, bad.reason], [false, 'site-not-found']);
  assert.equal(locateSite(path.join(fx.suite, 'artifacts', fx.key), 'src/', fx.key, fx.faulty.site).repl, '51');
});

/** CTO giả: đọc tệp trong workspace (như dùng Read) và tự chạy thử grade(50); không biết nhãn. */
function fakeCto(seen) {
  return async (req) => {
    seen.push(req);
    const src = fs.readFileSync(path.join(req.cwd, 'src', 'grade.js'), 'utf8');
    const ok = /score >= 50\)/.test(src);
    const json = { accepted: ok, summary: ok ? 'Đạt.' : 'Biên 50 sai.', criteria: [{ name: 'Biên B = 50', result: ok ? 'pass' : 'fail', evidence: 'src/grade.js' }], risks: [], followUps: [] };
    return { text: `## Tóm tắt\nx\n\n## Tiêu chí nghiệm thu\n| Tiêu chí | Kết quả | Bằng chứng |\n|---|---|---|\n| Biên | ${ok ? 'Đạt' : 'Không'} | src |\n\n\`\`\`json\n${JSON.stringify(json)}\n\`\`\``, usage: { input: 1000, output: 200, cacheRead: 5000, cacheWrite: 300, costUsd: 0 }, estimated: false, model: 'claude-sonnet-5-5', runtime: 'claude-cli', durationMs: 1234, turns: 3 };
  };
}

test('runCto (R1/R2) qua Orchestrator thật với runtime giả: chặn mục lỗi, duyệt mục đúng, cùng văn bản với R3, không lộ nhãn', async () => {
  const cc = await loadCcoding(ROOT);
  const fx = fixture();
  const data = tmp();
  const base = cc.loadConfig({ root: ROOT });
  const app = cc.createApp({ dataDir: data, workspacesDir: path.join(data, 'workspaces'), runner: 'process', herdr: { ...base.herdr, notify: false, agentPanes: false } }, { root: ROOT });
  const rt = app.runtimes.get('claude-cli');
  const seen = [];
  rt.available = async () => ({ ok: true, detail: 'giả' });
  rt.run = fakeCto(seen);
  const capture = new Map();
  const orig = rt.run;
  rt.run = async (req, hooks) => { if (req.phase === 'accept') capture.set(req.meta?.taskId, { context: req.context, prompt: req.prompt, tools: req.tools, maxTurns: req.toolPolicy?.maxTurns ?? null }); return orig(req, hooks); };
  const work = tmp();
  const opts = { suite: fx.suite, artifacts: path.join(fx.suite, 'artifacts'), workRoot: work, cc };
  const pf = await prepareItem(fx.faulty, opts), pc = await prepareItem(fx.clean, opts);
  const rf = await runCto(app, cc, pf, 'R1', { capture }), rc = await runCto(app, cc, pc, 'R1', { capture }), r2 = await runCto(app, cc, pf, 'R2', { capture });
  assert.deepEqual([rf.status, rf.verdict, rf.acceptMode], ['done', 'block', 'full']);
  assert.deepEqual([rc.status, rc.verdict], ['done', 'pass']);
  assert.equal(r2.verdict, 'block');
  assert.equal(seen.length, 3, 'mỗi mục đúng một lượt gọi (pha accept)');
  assert.ok(seen.every((r) => r.phase === 'accept'));
  assert.equal(seen[2].model, 'opus', 'R2: phaseModels.accept = opus');
  assert.equal(seen[0].model, 'sonnet');
  assert.deepEqual(seen[0].tools, ['Read', 'Glob', 'Grep', 'Bash'], 'CTO: đọc tệp + git chỉ đọc');
  assert.equal(seen[0].toolPolicy.gitReadOnly, true);
  assert.equal(rf.maxTurns, app.config.phases.toolTurns.accept);
  assert.equal(rf.tokens.input, 1000);
  assert.equal(rf.calls, 1);
  assert.ok(rf.costUsd > 0);
  // sự kiện cổng CTO ghi đúng
  const ev = (id) => fs.readFileSync(path.join(data, 'runs', id, 'events.jsonl'), 'utf8').split('\n').filter((l) => l.includes('"gate.decision"')).map((l) => JSON.parse(l).data);
  assert.deepEqual(ev(rf.taskId).map((d) => [d.gate, d.verdict]), [['cto', 'block']]);
  assert.deepEqual(ev(rc.taskId).map((d) => [d.gate, d.verdict]), [['cto', 'pass']]);
  // R3 nhận đúng văn bản R1 nhận, trừ phần vai trò
  const deptName = app.registry.department('dev').name;
  for (const [prep, r] of [[pf, rf], [pc, rc]]) {
    const text = r3Prompt(cc, { config: app.config, cto: app.registry.cto(), deptName, prep });
    assert.equal(cc.userPrompt(capture.get(r.taskId)), text);
    assert.deepEqual(leaks(text), [], 'prompt không lộ nhãn');
    assert.ok(!text.includes('VAI TRÒ CỦA BẠN'));
    assert.match(text, /npm test/);
    assert.match(text, /grade\.js/);
  }
  const sys = seen.map((r) => r.system + r.context + r.prompt).join('\n');
  assert.deepEqual(leaks(sys), []);
  assert.ok(seen[0].system.includes('CTO'), 'R1 có hồ sơ CTO');
  // văn bản mục lỗi và mục đúng chỉ khác ở phần sản phẩm (không có chuỗi nào chỉ mục lỗi mới có, trừ thống kê diff)
  const tf = cc.userPrompt(capture.get(rf.taskId)), tc = cc.userPrompt(capture.get(rc.taskId));
  const norm = (t) => t.replace(/bench vb-[0-9a-f]{12}/g, 'bench vb-X');
  assert.equal(norm(tf), norm(tc), 'cùng bài, cùng diff stat → văn bản giống hệt (trừ tên dự án băm); khác biệt chỉ nằm trong tệp');
  assert.deepEqual(r3Tools(cc, app.registry.cto()), { tools: 'Read,Glob,Grep,Bash', allowedTools: 'Read,Glob,Grep,Bash(git log:*),Bash(git show:*),Bash(git diff:*),Bash(git status:*),Bash(git blame:*)' });
});

test('runSingle (R3) với claude giả: cờ chỉ đọc, prompt qua stdin, kết luận theo parseAcceptance', async () => {
  const cc = await loadCcoding(ROOT);
  const fx = fixture();
  const data = tmp();
  const base = cc.loadConfig({ root: ROOT });
  const app = cc.createApp({ dataDir: data, workspacesDir: path.join(data, 'workspaces'), runner: 'process', herdr: { ...base.herdr, notify: false, agentPanes: false } }, { root: ROOT });
  const dir = tmp();
  const bin = path.join(dir, 'claude.cjs');
  const log = path.join(dir, 'args.jsonl');
  write(bin, `const fs = require('fs'); const path = require('path');
let input = ''; process.stdin.on('data', (d) => (input += d)); process.stdin.on('end', () => {
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ argv: process.argv.slice(2), stdin: input, cwd: process.cwd(), keys: Object.keys(process.env).filter((k) => /API_?KEY|TOKEN|^ANTHROPIC_/i.test(k)) }) + '\\n');
  const ok = /score >= 50\\)/.test(fs.readFileSync(path.join(process.cwd(), 'src', 'grade.js'), 'utf8'));
  const res = '## Tóm tắt\\nx\\n\\n\`\`\`json\\n' + JSON.stringify({ accepted: ok, summary: 's', criteria: [{ name: 'b', result: ok ? 'pass' : 'fail', evidence: 'e' }], risks: [], followUps: [] }) + '\\n\`\`\`';
  console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sonnet-5-5', apiKeySource: 'none' }));
  console.log(JSON.stringify({ type: 'result', is_error: false, result: res, num_turns: 2, total_cost_usd: 0.01, usage: { input_tokens: 900, output_tokens: 150, cache_read_input_tokens: 4000, cache_creation_input_tokens: 100 } }));
});
`);
  const work = tmp();
  const opts = { suite: fx.suite, artifacts: path.join(fx.suite, 'artifacts'), workRoot: work, cc };
  const deptName = app.registry.department('dev').name;
  const pf = await prepareItem(fx.faulty, opts), pc = await prepareItem(fx.clean, opts);
  const ctx = { config: app.config, cto: app.registry.cto(), deptName, bin: process.execPath, binArgs: [bin], timeoutMin: 1, maxTurns: app.config.phases.toolTurns.accept };
  // 13/11: máy chạy có ANTHROPIC_API_KEY cấp người dùng → R3 phải không nhận khóa/token nào (như runtime claude-cli của CCoding)
  const saved = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, NINEROUTER_API_KEY: process.env.NINEROUTER_API_KEY, ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL };
  Object.assign(process.env, { ANTHROPIC_API_KEY: 'sk-thu', NINEROUTER_API_KEY: 'x', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' });
  let rf, rc;
  try { rf = await runSingle(cc, pf, ctx); rc = await runSingle(cc, pc, ctx); } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  assert.deepEqual([rf.status, rf.verdict, rc.verdict], ['done', 'block', 'pass']);
  assert.equal(rf.authSource, 'none');
  const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const a = calls[0].argv;
  assert.equal(a[a.indexOf('--tools') + 1], 'Read,Glob,Grep,Bash');
  assert.match(a[a.indexOf('--allowedTools') + 1], /Bash\(git diff:\*\)/);
  assert.equal(a[a.indexOf('--permission-mode') + 1], 'default');
  assert.equal(a[a.indexOf('--max-turns') + 1], String(app.config.phases.toolTurns.accept));
  assert.equal(a[a.indexOf('--model') + 1], 'sonnet');
  assert.equal(calls[0].stdin, r3Prompt(cc, { config: app.config, cto: app.registry.cto(), deptName, prep: pf }));
  assert.equal(path.basename(calls[0].cwd), ARM_DIR.R3);
  assert.deepEqual(calls.map((c) => c.keys), [[], []], 'không chuyển biến khóa/token cho claude -p');
  assert.ok(rf.costUsd > 0);
  assert.equal(rf.promptSha.length, 64);
});

test('13/11 runSingle (R3) chạm --max-turns: không phải lỗi hạ tầng — văn bản assistant được đọc như runtime CCoding; không có JSON → unparsed', async () => {
  const cc = await loadCcoding(ROOT);
  const fx = fixture();
  const data = tmp();
  const base = cc.loadConfig({ root: ROOT });
  const app = cc.createApp({ dataDir: data, workspacesDir: path.join(data, 'workspaces'), runner: 'process', herdr: { ...base.herdr, notify: false, agentPanes: false } }, { root: ROOT });
  const dir = tmp();
  const bin = path.join(dir, 'claude.cjs');
  // E7_FAKE=json: khối JSON kết luận nằm trong văn bản assistant trước khi chạm trần; E7_FAKE=plain: chỉ có câu dở dang
  write(bin, `let input = ''; process.stdin.on('data', (d) => (input += d)); process.stdin.on('end', () => {
  const json = '\`\`\`json\\n' + JSON.stringify({ accepted: false, summary: 's', criteria: [{ name: 'b', result: 'fail', evidence: 'e' }], risks: [], followUps: [] }) + '\\n\`\`\`';
  console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sonnet-5-5', apiKeySource: 'none' }));
  console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Để tôi xem diff.' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'git diff' } }] } }));
  if (process.env.E7_FAKE === 'json') console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '## Kết luận\\n' + json }] } }));
  console.log(JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true, num_turns: 7, total_cost_usd: 0.02, usage: { input_tokens: 900, output_tokens: 150, cache_read_input_tokens: 4000, cache_creation_input_tokens: 100 } }));
  process.exit(1);
});
`);
  const work = tmp();
  const opts = { suite: fx.suite, artifacts: path.join(fx.suite, 'artifacts'), workRoot: work, cc };
  const deptName = app.registry.department('dev').name;
  const ctx = { config: app.config, cto: app.registry.cto(), deptName, bin: process.execPath, binArgs: [bin], timeoutMin: 1, maxTurns: 6 };
  const saved = process.env.E7_FAKE;
  let rj, rp;
  try {
    process.env.E7_FAKE = 'json'; rj = await runSingle(cc, await prepareItem(fx.faulty, opts), ctx);
    process.env.E7_FAKE = 'plain'; rp = await runSingle(cc, await prepareItem(fx.clean, opts), ctx);
  } finally { if (saved === undefined) delete process.env.E7_FAKE; else process.env.E7_FAKE = saved; }
  assert.deepEqual([rj.status, rj.infra, rj.capped, rj.verdict, rj.turns], ['done', undefined, 'turns', 'block', 7]);
  assert.match(rj.text, /Để tôi xem diff\.\n## Kết luận/);
  assert.deepEqual([rp.status, rp.infra, rp.capped, rp.verdict, rp.parsed], ['done', undefined, 'turns', 'unparsed', false]);
});

// ───────────── K2: các ca hỏng của harness (Windows, treo, làm bẩn repo) ─────────────
const newApp = (cc) => {
  const data = tmp();
  const base = cc.loadConfig({ root: ROOT });
  const app = cc.createApp({ dataDir: data, workspacesDir: path.join(data, 'workspaces'), runner: 'process', herdr: { ...base.herdr, notify: false, agentPanes: false } }, { root: ROOT });
  app.runtimes.get('claude-cli').available = async () => ({ ok: true, detail: 'giả' });
  return { app, data };
};
const treeSha = (dir) => fs.readdirSync(dir, { recursive: true }).sort().map((f) => { const p = path.join(dir, f); return fs.statSync(p).isFile() ? `${f}:${fs.readFileSync(p, 'hex')}` : f; }).join('|');

test('copyTree: thư mục cha tên .git/node_modules không làm mất cả cây; vẫn bỏ .git, node_modules, _FINAL.txt bên trong', () => {
  const root = path.join(tmp(), '.git', 'node_modules', 'art');
  write(path.join(root, 'src', 'a.js'), 'x');
  write(path.join(root, '_FINAL.txt'), 'y');
  write(path.join(root, 'node_modules', 'm', 'i.js'), 'z');
  write(path.join(root, '.git', 'HEAD'), 'h');
  const dst = tmp();
  copyTree(root, dst);
  assert.deepEqual(fs.readdirSync(dst, { recursive: true }).map((f) => f.split(path.sep).join('/')).sort(), ['src', 'src/a.js']);
});

test('prepareItem: artifact CRLF (Windows autocrlf) vẫn tìm đúng vị trí đột biến và áp đúng; vị trí lệch thì site-not-found', async () => {
  const cc = await loadCcoding(ROOT);
  const fx = fixture();
  const art = path.join(fx.suite, 'artifacts', fx.key);
  for (const f of ['src/grade.js', 'test/grade.test.js']) { const p = path.join(art, f); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/\r?\n/g, '\r\n')); }
  const opts = { suite: fx.suite, artifacts: path.join(fx.suite, 'artifacts'), workRoot: tmp(), cc };
  const pf = await prepareItem(fx.faulty, opts);
  assert.equal(pf.ok, true, pf.reason);
  const src = fs.readFileSync(path.join(pf.dirs.R1.dir, 'src', 'grade.js'), 'utf8');
  assert.match(src, /score >= 51\)/);
  assert.match(src, /\r\n/, 'CRLF giữ nguyên, chỉ đổi đúng 50 → 51');
  assert.equal((src.match(/>= 5[01]/g) ?? []).length, 1);
  // cùng dòng nhưng sai phép đột biến / sai chuỗi thay → không bắt nhầm vị trí khác
  for (const site of [{ ...fx.faulty.site, repl: '52' }, { ...fx.faulty.site, op: 'ROR' }, { ...fx.faulty.site, file: 'src/other.js' }, { ...fx.faulty.site, i: 11 }]) {
    const r = await prepareItem({ ...fx.faulty, id: 'eeeeeeeeee', site }, opts);
    assert.deepEqual([r.ok, r.reason], [false, 'site-not-found'], JSON.stringify(site));
  }
  // thiếu artifact
  const m = await prepareItem({ ...fx.faulty, key: 'khong-co' }, opts);
  assert.deepEqual([m.ok, m.reason], [false, 'missing-artifact']);
});

test('prepareItem/runCto: repo của mục là gốc riêng, bản gốc (artifact, starter) không đổi, autocrlf tắt, git của CCoding chỉ commit vào repo tạm', async () => {
  const cc = await loadCcoding(ROOT);
  const fx = fixture();
  const { app } = newApp(cc);
  const rt = app.runtimes.get('claude-cli');
  rt.run = fakeCto([]);
  const art = path.join(fx.suite, 'artifacts', fx.key), starter = path.join(fx.suite, 'tasks', fx.task.id, 'repo');
  const before = [treeSha(art), treeSha(starter)];
  const work = tmp();
  const pf = await prepareItem(fx.faulty, { suite: fx.suite, artifacts: path.join(fx.suite, 'artifacts'), workRoot: work, cc });
  for (const arm of Object.keys(ARM_DIR)) {
    assertOwnRepo(pf.dirs[arm].dir);
    assert.equal(spawnSync('git', ['config', 'core.autocrlf'], { cwd: pf.dirs[arm].dir, encoding: 'utf8' }).stdout.trim(), 'false');
  }
  const r = await runCto(app, cc, pf, 'R1', {});
  assert.equal(r.status, 'done');
  const d = pf.dirs.R1.dir;
  const g = (...a) => spawnSync('git', a, { cwd: d, encoding: 'utf8' }).stdout.trim();
  assert.equal(g('rev-parse', '--abbrev-ref', 'HEAD'), `ccoding/${r.taskId.toLowerCase()}`);
  assert.equal(g('status', '--porcelain', '--', '.', ':!.ccoding'), '', 'sản phẩm đã commit trên nhánh nhiệm vụ');
  assert.equal(g('rev-list', '--count', `${pf.base}..HEAD`), '1');
  assert.deepEqual([treeSha(art), treeSha(starter)], before, 'artifact và starter nguyên vẹn');
  // thư mục không phải gốc repo riêng (con của repo khác) → từ chối trước khi chạy bất kỳ lệnh git nào
  const sub = path.join(pf.dirs.R2.dir, 'src');
  assert.throws(() => assertOwnRepo(sub), /không phải gốc repo git riêng/);
  const plain = tmp();
  assert.throws(() => assertOwnRepo(plain), /không phải gốc repo git riêng/);
  await assert.rejects(runCto(app, cc, { ...pf, dirs: { ...pf.dirs, R2: { ...pf.dirs.R2, dir: sub } } }, 'R2', {}), /không phải gốc repo git riêng/);
});

test('runCto: runtime treo → quá hạn chờ thì hủy, ghi hạ tầng "error" (không treo đợt); runtime tạm dừng vì hạn mức → rate-limit, không treo', async () => {
  const cc = await loadCcoding(ROOT);
  const fx = fixture();
  const { app } = newApp(cc);
  const rt = app.runtimes.get('claude-cli');
  const opts = { suite: fx.suite, artifacts: path.join(fx.suite, 'artifacts'), workRoot: tmp(), cc };
  const pf = await prepareItem(fx.faulty, opts);
  // treo: chỉ trả khi bị abort, như tiến trình claude bị kill
  rt.run = (req, hooks) => new Promise((_, rej) => { hooks.signal.addEventListener('abort', () => rej(new Error('bị hủy'))); });
  const t0 = Date.now();
  const r = await runCto(app, cc, pf, 'R1', { waitTimeoutMs: 400 });
  assert.ok(Date.now() - t0 < 20_000, 'trả về trong hạn');
  assert.deepEqual([r.status, r.infra, r.verdict], ['infra', 'error', null]);
  assert.match(r.error, /quá hạn chờ/);
  assert.equal((await app.orchestrator.waitFor(r.taskId)).status, 'cancelled', 'hủy thật: tiến trình runtime bị abort, nhiệm vụ không còn chạy ngầm');
  // hết hạn mức: không chờ trong tiến trình (waitForFastMs = 0), nhiệm vụ tạm dừng → waitFor trả về, runCto hủy và báo rate-limit
  app.config.runtime.waitForFastMs = 0;
  rt.run = async () => { throw new Error('429 rate_limit_error: You have hit your limit · resets 4:50pm'); };
  const pc = await prepareItem(fx.clean, opts);
  const t1 = Date.now();
  const q = await runCto(app, cc, pc, 'R1', { waitTimeoutMs: 20_000 });
  assert.ok(Date.now() - t1 < 15_000, `không chạm hạn chờ (mất ${Date.now() - t1}ms)`);
  assert.equal(q.status, 'infra');
  assert.equal(q.infra, 'rate-limit');
  assert.match(q.error, /429|hạn mức|limit/i, 'dòng infra còn lý do sau khi hủy nhiệm vụ tạm dừng');
  assert.equal(app.store.get(q.taskId).status === 'paused', false, 'không để nhiệm vụ tạm dừng treo lại hàng đợi');
});

test('13/11 runCto: lượt accept trả lỗi kèm văn bản (403 khi xác thực) → CCoding dùng văn bản lỗi làm nghiệm thu, harness ghi infra', async () => {
  const cc = await loadCcoding(ROOT);
  const fx = fixture();
  const { app } = newApp(cc);
  const rt = app.runtimes.get('claude-cli');
  const msg = 'Failed to authenticate. API Error: 403 Attention Required! | Cloudflare';
  rt.run = async () => ({ text: msg, error: msg, usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 }, model: 'claude-sonnet-5-5', runtime: 'claude-cli', durationMs: 5 });
  const pf = await prepareItem(fx.faulty, { suite: fx.suite, artifacts: path.join(fx.suite, 'artifacts'), workRoot: tmp(), cc });
  const r = await runCto(app, cc, pf, 'R1', { waitTimeoutMs: 20_000 });
  assert.equal(app.store.get(r.taskId).acceptance?.parsed, false, 'CCoding ghi nghiệm thu không đọc được (không phải lỗi)');
  assert.deepEqual([r.status, r.infra, r.verdict], ['infra', 'error', null]);
  assert.match(r.error, /403/);
});
