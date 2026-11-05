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
import { loadCcoding, locateSite, prepareItem, r3Prompt, r3Tools, runCto, runSingle, verdictOf, ARM_DIR } from '../e7/lib.mjs';
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
  const bin = path.join(dir, 'claude');
  const log = path.join(dir, 'args.jsonl');
  write(bin, `#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
let input = ''; process.stdin.on('data', (d) => (input += d)); process.stdin.on('end', () => {
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ argv: process.argv.slice(2), stdin: input, cwd: process.cwd() }) + '\\n');
  const ok = /score >= 50\\)/.test(fs.readFileSync(path.join(process.cwd(), 'src', 'grade.js'), 'utf8'));
  const res = '## Tóm tắt\\nx\\n\\n\`\`\`json\\n' + JSON.stringify({ accepted: ok, summary: 's', criteria: [{ name: 'b', result: ok ? 'pass' : 'fail', evidence: 'e' }], risks: [], followUps: [] }) + '\\n\`\`\`';
  console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sonnet-5-5' }));
  console.log(JSON.stringify({ type: 'result', is_error: false, result: res, num_turns: 2, total_cost_usd: 0.01, usage: { input_tokens: 900, output_tokens: 150, cache_read_input_tokens: 4000, cache_creation_input_tokens: 100 } }));
});
`);
  fs.chmodSync(bin, 0o755);
  const work = tmp();
  const opts = { suite: fx.suite, artifacts: path.join(fx.suite, 'artifacts'), workRoot: work, cc };
  const deptName = app.registry.department('dev').name;
  const pf = await prepareItem(fx.faulty, opts), pc = await prepareItem(fx.clean, opts);
  const ctx = { config: app.config, cto: app.registry.cto(), deptName, bin, timeoutMin: 1, maxTurns: app.config.phases.toolTurns.accept };
  const rf = await runSingle(cc, pf, ctx), rc = await runSingle(cc, pc, ctx);
  assert.deepEqual([rf.status, rf.verdict, rc.verdict], ['done', 'block', 'pass']);
  const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const a = calls[0].argv;
  assert.equal(a[a.indexOf('--tools') + 1], 'Read,Glob,Grep,Bash');
  assert.match(a[a.indexOf('--allowedTools') + 1], /Bash\(git diff:\*\)/);
  assert.equal(a[a.indexOf('--permission-mode') + 1], 'default');
  assert.equal(a[a.indexOf('--max-turns') + 1], String(app.config.phases.toolTurns.accept));
  assert.equal(a[a.indexOf('--model') + 1], 'sonnet');
  assert.equal(calls[0].stdin, r3Prompt(cc, { config: app.config, cto: app.registry.cto(), deptName, prep: pf }));
  assert.equal(path.basename(calls[0].cwd), ARM_DIR.R3);
  assert.ok(rf.costUsd > 0);
  assert.equal(rf.promptSha.length, 64);
});
