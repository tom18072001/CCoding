// Test FX19 logic-map-check.mjs: tham chiếu đúng ở mốc → exit 0; lệch một dòng → exit 1.
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
  const r = run([f]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Tổng tham chiếu tệp:dòng: 4 /);
  assert.match(r.stdout, /lệch: 0/);
  assert.match(r.stderr, /Cảnh báo: 1 tham chiếu không kèm ký hiệu/);
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

test('ký hiệu ngắn/chung: cảnh báo (exit 0), --strict ⇒ exit 1', () => {
  const ls = show('src/lane.ts');
  const n2 = ls.findIndex((l) => l.includes('chooseLane')) + 1;
  const n3 = ls.findIndex((l) => l.includes('lane')) + 1;
  assert.ok(n2 > 0 && n3 > 0);
  const f2 = join(dir, 'weak2.md');
  writeFileSync(f2, `src/lane.ts:${n2} (\`chooseLane\`) ok; src/lane.ts:${n3} (\`lane\`).\n`);
  const r2 = run([f2]);
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  assert.match(r2.stderr, /1 tham chiếu có ký hiệu quá ngắn\/chung/);
  const r3 = run(['--strict', f2]);
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
