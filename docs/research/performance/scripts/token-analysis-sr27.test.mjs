// SR-27: nhãn vòng Sonnet đơn của token-analysis.mjs (T-d (3), T-h, T-i) sinh từ dữ liệu (SONNET_RD), không viết cứng "C7".
// Dựng bản sao results/ có thêm một vòng giả C10 (nhân bản dòng C9: làn nhanh + claude-sonnet) rồi so đầu ra.
// Chạy: node --test docs/research/performance/scripts/token-analysis-sr27.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'token-analysis.mjs');
const DOC = path.join(HERE, '..', 'token-analysis.md');
const REAL = path.resolve(HERE, '../../../../bench/vs-claude/results');
const CSVS = ['runs.csv', 'calls.csv', 'phases.csv', 'claude_turns.csv'];
const FAKE_ROUND = 'C10';

let tmp, fake;
const run = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
const count = (s, re) => (s.match(re) ?? []).length;

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sr27-'));
  fake = path.join(tmp, 'results');
  fs.mkdirSync(fake);
  fs.copyFileSync(path.join(REAL, 'summary.json'), path.join(fake, 'summary.json'));
  // script chỉ đọc tên thư mục con của C<n>/ ⇒ tạo thư mục rỗng cùng tên
  for (const d of fs.readdirSync(REAL, { withFileTypes: true }).filter((e) => e.isDirectory() && /^C\d+$/.test(e.name))) {
    fs.mkdirSync(path.join(fake, d.name));
    for (const n of fs.readdirSync(path.join(REAL, d.name))) fs.mkdirSync(path.join(fake, d.name, n));
  }
  const last = fs.readdirSync(path.join(REAL, 'C9'));
  fs.mkdirSync(path.join(fake, FAKE_ROUND));
  for (const n of last) fs.mkdirSync(path.join(fake, FAKE_ROUND, n));
  for (const f of CSVS) {
    const txt = fs.readFileSync(path.join(REAL, f), 'utf8');
    const eol = txt.includes('\r\n') ? '\r\n' : '\n';
    const dup = txt.split(/\r?\n/).filter((l) => l.startsWith('C9,')).map((l) => FAKE_ROUND + l.slice(2));
    fs.writeFileSync(path.join(fake, f), txt.replace(/(\r?\n)*$/, eol) + dup.join(eol) + eol);
  }
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('SR-27: dữ liệu thật — T-h, T-i dùng nhãn vòng Sonnet hiện có và không còn "C7" viết cứng', () => {
  for (const t of ['T-h', 'T-i']) {
    const r = run('--table', t);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /C9/);
    assert.equal(count(r.stdout, /C7/g), 0, `${t} còn "C7"`);
  }
});

test('SR-27: vòng giả có claude-sonnet — --table T-i in nhãn vòng mới, không còn C7/C9 làm nhãn Sonnet', () => {
  const r = run('--results', fake, '--table', 'T-i');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`${FAKE_ROUND} (so với|, cùng thời điểm)`));
  assert.equal(count(r.stdout, /C7/g), 0, 'còn "C7" viết cứng');
  assert.equal(count(r.stdout, /\bC9\b/g), 0, 'nhãn Sonnet vẫn là C9');
});

test('SR-27: vòng giả — T-h gắn nhãn "Claude Code Sonnet (C10)", T-d (3) đọc "ở C10"', () => {
  const h = run('--results', fake, '--table', 'T-h');
  assert.equal(h.status, 0, h.stderr);
  assert.ok(h.stdout.includes(`Claude Code Sonnet (${FAKE_ROUND})`));
  assert.equal(count(h.stdout, /C7/g), 0);
  const d = run('--results', fake, '--table', 'T-d');
  assert.equal(d.status, 0, d.stderr);
  assert.ok(d.stdout.includes(`ở ${FAKE_ROUND} (cùng thời điểm)`));
  assert.ok(d.stdout.includes(`${FAKE_ROUND} (cùng thời điểm với Sonnet đơn)`));
});

test('SR-27: --check vẫn khớp — tài liệu thật với results thật; bản sinh từ vòng giả khớp chính nó; tài liệu cũ bị báo lệch', () => {
  assert.equal(run('--check', DOC).status, 0);
  const gen = path.join(tmp, 'generated.md');
  const out = run('--results', fake);
  assert.equal(out.status, 0, out.stderr);
  fs.writeFileSync(gen, out.stdout);
  const self = run('--results', fake, '--check', gen);
  assert.equal(self.status, 0, self.stderr);
  const stale = run('--results', fake, '--check', DOC);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, new RegExp(FAKE_ROUND));
});

test('SR-27: mã nguồn lấy SONNET_RD từ CONFIG.sonnetRound', () => {
  const src = fs.readFileSync(SCRIPT, 'utf8');
  assert.match(src, /const SONNET_RD = CONFIG\.sonnetRound;/);
});
