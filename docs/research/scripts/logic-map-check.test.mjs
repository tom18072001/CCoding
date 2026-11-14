// Test FX19 logic-map-check.mjs (làm cứng, BRIEF-22c): strict mặc định; ký hiệu đặc thù; khớp đúng dòng; 14 ca sai C2-r; --sample/--seed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'logic-map-check.mjs');
const repo = resolve(here, '..', '..', '..');
const BASE = 'ccc76cc0840110debab2a0e69f64b10bee965533';

const run = (args) => spawnSync(process.execPath, [script, '--root', repo, '--no-default', '--base', BASE, ...args], { encoding: 'utf8' });
const runLoose = (args) => run(['--no-strict', ...args]);
const show = (p) => execFileSync('git', ['-C', repo, 'show', `${BASE}:${p}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split(/\r?\n/);

function pick(path, sym) {
  const ls = show(path);
  const good = ls.findIndex((l) => l.includes(sym)) + 1;
  const bad = ls.findIndex((l) => !l.includes(sym)) + 1;
  assert.ok(good > 0 && bad > 0);
  return { good, bad };
}

const dir = mkdtempSync(join(tmpdir(), 'lmc-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('tham chiếu đúng ở mốc → exit 0', () => {
  const a = pick('src/lane.ts', 'chooseLane');
  const b = pick('src/orchestrator.ts', 'runTask');
  const f = join(dir, 'ok.md');
  writeFileSync(f, [
    '`orch` = `src/orchestrator.ts`',
    `Chọn làn: src/lane.ts:${a.good} (\`chooseLane\`).`,
    `Vòng đời: \`orch:${b.good}\` (\`runTask\`).`,
    `Dải: lane.ts:${a.good}–${a.good + 2} (\`chooseLane\`).`,
    'Chưa có ký hiệu: src/lane.ts:5.',
  ].join('\n'));
  const r = runLoose([f]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Tổng tham chiếu tệp:dòng: 4 /);
  assert.match(r.stdout, /lệch: 0/);
  assert.match(r.stderr, /Cảnh báo: 1 tham chiếu không kèm ký hiệu/);
  const r2 = run([f]); // strict mặc định: tham chiếu thiếu ký hiệu là lỗi
  assert.equal(r2.status, 1, r2.stdout + r2.stderr);
  assert.match(r2.stdout, /thiếu ký hiệu đặc thù/);
});

test('bản sao lệch một dòng → exit 1 và in tham chiếu lệch', () => {
  const a = pick('src/lane.ts', 'chooseLane');
  const f = join(dir, 'bad.md');
  writeFileSync(f, `Chọn làn: src/lane.ts:${a.bad} (\`chooseLane\`).\nĐúng: src/lane.ts:${a.good} (\`chooseLane\`).\n`);
  const r = run([f]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /lệch: 1/);
  assert.match(r.stdout, /LỆCH .*bad\.md:1/);
});

test('thiếu mốc → exit 2', () => {
  const f = join(dir, 'nobase.md');
  writeFileSync(f, 'không có gì\n');
  const r = spawnSync(process.execPath, [script, '--root', repo, '--no-default', f], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});

test('đọc mốc từ dòng "Mốc:" của logic-map.md', () => {
  const sub = mkdtempSync(join(dir, 'm-'));
  const f = join(sub, 'logic-map.md');
  const a = pick('src/lane.ts', 'chooseLane');
  writeFileSync(f, `# Bản đồ\n\n> **Mốc: \`${BASE}\`**\n\nsrc/lane.ts:${a.good} (\`chooseLane\`)\n`);
  const r = spawnSync(process.execPath, [script, '--root', repo, '--no-default', f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// ---- Góp ý review: agents/*.md, ký hiệu yếu, danh sách quét mặc định ----
function pickPhrase(path, phrase) {
  const good = show(path).findIndex((l) => l.includes(phrase)) + 1;
  assert.ok(good > 0, `không thấy "${phrase}" trong ${path}`);
  return good;
}

test('agents/*.md: dòng đúng kèm cụm trích → exit 0; lệch một dòng → exit 1', () => {
  const n = pickPhrase('agents/cto.md', 'Quy trình làm việc');
  const ok = join(dir, 'agent-ok.md');
  writeFileSync(ok, `Hồ sơ: agents/cto.md:${n} (“Quy trình làm việc”) và cto.md:${n}-${n + 1} (\`Quy trình làm việc\`).\n`);
  const r1 = run([ok]);
  assert.equal(r1.status, 0, r1.stdout + r1.stderr);
  assert.match(r1.stdout, /Tổng tham chiếu tệp:dòng: 2 /);
  const bad = join(dir, 'agent-bad.md');
  writeFileSync(bad, `Hồ sơ: agents/cto.md:${n + 3} (“Quy trình làm việc”).\n`);
  const r2 = run([bad]);
  assert.equal(r2.status, 1, r2.stdout + r2.stderr);
  assert.match(r2.stdout, /LỆCH .*agent-bad\.md:1/);
});

test('agents/*.md: thiếu cụm trích → exit 1', () => {
  const f = join(dir, 'agent-noquote.md');
  writeFileSync(f, 'Hồ sơ: agents/cto.md:47-53.\n');
  const r = run([f]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /bắt buộc kèm cụm trích/);
});

test('.md ngoài agents/ không bị quét', () => {
  const f = join(dir, 'other-md.md');
  writeFileSync(f, 'Xem docs/research/report.md:12 và README.md:3.\n');
  const r = run([f]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Tổng tham chiếu tệp:dòng: 0 /);
});

test('ký hiệu ngắn/chung: --no-strict cảnh báo (exit 0), strict mặc định ⇒ exit 1', () => {
  const ls = show('src/lane.ts');
  const n2 = ls.findIndex((l) => l.includes('chooseLane')) + 1;
  const n3 = ls.findIndex((l) => l.includes('lane')) + 1;
  assert.ok(n2 > 0 && n3 > 0);
  const f2 = join(dir, 'weak2.md');
  writeFileSync(f2, `src/lane.ts:${n2} (\`chooseLane\`) ok; src/lane.ts:${n3} (\`lane\`).\n`);
  const r2 = runLoose([f2]);
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  assert.match(r2.stderr, /1 tham chiếu có ký hiệu không đặc thù/);
  const r3 = run([f2]);
  assert.equal(r3.status, 1, r3.stdout + r3.stderr);
  assert.match(r3.stdout, /--strict/);
});

test('danh sách quét mặc định gồm model-per-role.md và scorecard.md', () => {
  const r = mkdtempSync(join(dir, 'repo-'));
  const g = (...a) => execFileSync('git', ['-C', r, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { encoding: 'utf8' });
  g('init', '-q');
  mkdirSync(join(r, 'src'));
  mkdirSync(join(r, 'docs/research/analysis/decisions'), { recursive: true });
  writeFileSync(join(r, 'src/alpha.ts'), 'a\nexport function alphaBeta() {}\nb\nc\n');
  g('add', '-A'); g('commit', '-q', '-m', 'x');
  const head = g('rev-parse', 'HEAD').trim();
  const dec = join(r, 'docs/research/analysis/decisions');
  writeFileSync(join(dec, 'model-per-role.md'), 'src/alpha.ts:4 (`alphaBeta`)\n');
  writeFileSync(join(dec, 'scorecard.md'), 'src/alpha.ts:2 (`alphaBeta`)\n');
  const out = spawnSync(process.execPath, [script, '--root', r, '--base', head], { encoding: 'utf8' });
  assert.equal(out.status, 1, out.stdout + out.stderr);
  assert.match(out.stdout, /Tổng tham chiếu tệp:dòng: 2 /);
  assert.match(out.stdout, /LỆCH docs\/research\/analysis\/decisions\/model-per-role\.md:1/);
});

// ---- BRIEF-22c K1: 14 ca sai C2-r (nguyên văn từ bản trước khi sửa) → phải đỏ; dạng đúng → xanh ----
// Nguồn: logic-map.md/report.md/improvement-backlog.md ở commit ce659ee1 và 3200c7af (T-20261114-214506-fe1) đối chiếu mốc ccc76cc0.
// Dòng đúng ở mốc: research-lead.md:58 (“Không tạo hạng mục”), dev-lead.md:61 (“Hạng mục chạy lệnh”), dev-lead.md:53 (tiêu đề
// "Cách phân rã nhiệm vụ"), quality-gate.ts:67 (templateGate), quality-gate.ts:34 (checkCommands), orchestrator.md:2, cto.md:47.
const C2R = [
  { id: 1, bad: '`research-lead.md:51` bóc tách', good: '`research-lead.md:58` (“Không tạo hạng mục”) bóc tách' },
  { id: 2, bad: '`dev-lead.md:57` bóc tách', good: '`dev-lead.md:61` (`Hạng mục chạy lệnh`) bóc tách' },
  { id: 3, bad: 'agents/research/research-lead.md:51', good: 'agents/research/research-lead.md:58 (“Không tạo hạng mục”)' },
  { id: 4, bad: 'research-lead.md:51 (“Không tạo hạng mục”)', good: 'research-lead.md:58 (“Không tạo hạng mục”)' },
  { id: 5, bad: 'dev-lead.md:57 (“Hạng mục chạy lệnh”)', good: 'dev-lead.md:61 (“Hạng mục chạy lệnh”)' },
  { id: 6, bad: 'research-lead.md:46–55 (`@peer-reviewer`)', good: 'research-lead.md:58 (`@peer-reviewer`)' },
  { id: 7, bad: 'dev-lead.md:48–57', good: 'dev-lead.md:53–61 (`Cách phân rã nhiệm vụ`)' },
  { id: 8, bad: 'dev-lead.md:48–57 (`Cách phân rã nhiệm vụ`)', good: 'dev-lead.md:53 (`Cách phân rã nhiệm vụ`)' },
  { id: 9, bad: 'quality-gate.ts:63–72 (`templateGate`)', good: 'quality-gate.ts:67 (`templateGate`)' },
  { id: 10, bad: 'quality-gate.ts:34–157 (`names`)', good: 'quality-gate.ts:34 (`checkCommands`)' },
  { id: 11, bad: 'agents/orchestrator.md:1–12 (`id: orchestrator`)', good: 'agents/orchestrator.md:2 (`id: orchestrator`)' },
  { id: 12, bad: 'agents/cto.md:1–12 (`id: cto`)', good: 'agents/cto.md:47 (“Quy trình làm việc”)' },
  { id: 13, bad: 'research-lead.md:58 (`Ngoại lệ`)', good: 'research-lead.md:58 (“Không tạo hạng mục”)' },
  { id: 14, bad: 'cto.md:47–53', good: 'cto.md:47 (“Quy trình làm việc”)' },
];
for (const c of C2R) {
  test(`C2-r ca ${c.id}: tham chiếu sai phải đỏ, dạng đúng phải xanh`, () => {
    const fb = join(dir, `c2r-${c.id}-bad.md`); const fg = join(dir, `c2r-${c.id}-good.md`);
    writeFileSync(fb, `${c.bad}\n`); writeFileSync(fg, `${c.good}\n`);
    const rb = run([fb]); const rg = run([fg]);
    assert.equal(rb.status, 1, `ca sai ${c.id} không đỏ: ${rb.stdout}${rb.stderr}`);
    assert.equal(rg.status, 0, `dạng đúng ${c.id} không xanh: ${rg.stdout}${rg.stderr}`);
  });
}
test('C2-r: đủ 14 ca', () => assert.equal(C2R.length, 14));

test('khớp đúng dòng: ký hiệu ở giữa dải không đủ; ở đầu hoặc cuối dải thì đạt', () => {
  const a = pick('src/lane.ts', 'chooseLane');
  const f = join(dir, 'mid.md');
  writeFileSync(f, `src/lane.ts:${a.good - 1}–${a.good + 1} (\`chooseLane\`)\n`);
  assert.equal(run([f]).status, 1);
  writeFileSync(f, `src/lane.ts:${a.good}–${a.good + 1} (\`chooseLane\`)\nsrc/lane.ts:${a.good - 1}–${a.good} (\`chooseLane\`)\n`);
  assert.equal(run([f]).status, 0);
});

test('lệch cố ý đúng một dòng ⇒ exit 1 (ở cả hai phía)', () => {
  const a = pick('src/lane.ts', 'chooseLane');
  for (const d of [-1, 1]) {
    const f = join(dir, `off${d}.md`);
    writeFileSync(f, `src/lane.ts:${a.good + d} (\`chooseLane\`)\n`);
    assert.equal(run([f]).status, 1, `lệch ${d}`);
  }
});

test('ký hiệu ngắn/chung bị từ chối dù có trên đúng dòng; --no-strict chỉ cảnh báo', () => {
  const ls = show('src/lane.ts');
  const n = ls.findIndex((l) => /\bsingle\b/.test(l)) + 1;
  assert.ok(n > 0);
  const f = join(dir, 'generic.md');
  writeFileSync(f, `src/lane.ts:${n} (\`single\`)\n`);
  const r = run([f]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /không đặc thù/);
  assert.equal(runLoose([f]).status, 0);
});

test('khớp theo ranh giới từ: ký hiệu chỉ là chuỗi con của từ trên dòng đích ⇒ lệch', () => {
  const n = show('src/lane.ts').findIndex((l) => l.includes('chooseLane')) + 1;
  const f = join(dir, 'substr.md');
  writeFileSync(f, `src/lane.ts:${n} (\`chooseLan\`)\n`);
  assert.equal(run([f]).status, 1);
});

test('phủ bench/**: dòng đúng xanh, dòng kế bên đỏ', () => {
  const list = execFileSync('git', ['-C', repo, 'ls-tree', '-r', '--name-only', BASE, 'bench/vs-claude/harness/'], { encoding: 'utf8' }).split(/\r?\n/);
  const benchFile = list.find((p) => p.endsWith('stats.mjs'));
  assert.ok(benchFile, 'không thấy bench/vs-claude/harness/stats.mjs ở mốc');
  const ls = show(benchFile);
  const n = ls.findIndex((l) => /export function \w{6,}/.test(l)) + 1;
  assert.ok(n > 0 && n < ls.length);
  const name = ls[n - 1].match(/export function (\w+)/)[1];
  assert.ok(!ls[n].includes(name));
  const f = join(dir, 'bench.md');
  writeFileSync(f, `${benchFile}:${n} (\`${name}\`)\n${benchFile}:${n + 1} (\`${name}\`)\n`);
  const r = run([f]);
  assert.match(r.stdout, /Tổng tham chiếu tệp:dòng: 2 /);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /LỆCH .*bench\.md:2/);
  assert.doesNotMatch(r.stdout, /LỆCH .*bench\.md:1 /);
});

test('--sample/--seed: cùng seed cho cùng mẫu; khác seed khác mẫu; in đủ các trường', () => {
  const a = pick('src/lane.ts', 'chooseLane');
  const b = pick('src/orchestrator.ts', 'runTask');
  const f = join(dir, 'sample.md');
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push(i % 2 ? `Mục ${i}: src/lane.ts:${a.good} (\`chooseLane\`) xong.` : `Mục ${i}: src/orchestrator.ts:${b.good} (\`runTask\`) xong.`);
  writeFileSync(f, rows.join('\n') + '\n');
  const s1 = run(['--sample', '4', '--seed', '7', f]); const s2 = run(['--sample', '4', '--seed', '7', f]);
  const s3 = run(['--sample', '4', '--seed', '8', f]);
  assert.equal(s1.status, 0, s1.stdout + s1.stderr);
  assert.equal(s1.stdout, s2.stdout);
  assert.notEqual(s1.stdout, s3.stdout);
  assert.match(s1.stdout, /Mẫu 4\/12 tham chiếu \(seed 7\)/);
  assert.equal((s1.stdout.match(/^- /gm) || []).length, 4);
  assert.match(s1.stdout, /ký hiệu: (chooseLane|runTask)/);
  assert.match(s1.stdout, /trong bài: …/);
  assert.match(s1.stdout, /dòng thật ở mốc: /);
});

test('--sample không đổi mã thoát; tham số sai ⇒ exit 2', () => {
  const f = join(dir, 'sample-bad.md');
  const a = pick('src/lane.ts', 'chooseLane');
  writeFileSync(f, `src/lane.ts:${a.bad} (\`chooseLane\`)\n`);
  assert.equal(run(['--sample', '1', f]).status, 1);
  assert.equal(run(['--sample', 'x', f]).status, 2);
  assert.equal(run(['--khong-co', f]).status, 2);
});

test('phạm vi mặc định: backlog từ khối B-20, paper.md chỉ §4.4', () => {
  const r = mkdtempSync(join(dir, 'scope-'));
  const g = (...a) => execFileSync('git', ['-C', r, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { encoding: 'utf8' });
  g('init', '-q');
  mkdirSync(join(r, 'src'));
  mkdirSync(join(r, 'docs/research/paper'), { recursive: true });
  writeFileSync(join(r, 'src/alpha.ts'), 'a\nexport function alphaBeta() {}\nb\n');
  g('add', '-A'); g('commit', '-q', '-m', 'x');
  const head = g('rev-parse', 'HEAD').trim();
  writeFileSync(join(r, 'docs/research/improvement-backlog.md'), 'src/alpha.ts:3 (`alphaBeta`) trước B-20\n**(b) Mục mới B-20…B-49**\nsrc/alpha.ts:3 (`alphaBeta`) sau B-20\n');
  writeFileSync(join(r, 'docs/research/paper/paper.md'), '## 4. X\nsrc/alpha.ts:3 (`alphaBeta`) ngoài\n### 4.3 A\nsrc/alpha.ts:3 (`alphaBeta`) ngoài\n### 4.4 Engine\nsrc/alpha.ts:3 (`alphaBeta`) trong\n### 4.5 B\nsrc/alpha.ts:3 (`alphaBeta`) ngoài\n');
  const out = spawnSync(process.execPath, [script, '--root', r, '--base', head], { encoding: 'utf8' });
  assert.equal(out.status, 1, out.stdout + out.stderr);
  assert.match(out.stdout, /Tổng tham chiếu tệp:dòng: 2 /);
  assert.match(out.stdout, /improvement-backlog\.md:3 /);
  assert.match(out.stdout, /paper\.md:6 /);
});
