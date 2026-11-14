// Test FX19 logic-map-check.mjs: tham chiếu đúng ở mốc → exit 0; lệch một dòng → exit 1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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
