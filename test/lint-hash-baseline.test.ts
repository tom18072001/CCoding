import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../src/config.js';

// S3/K1 — băm lint không phụ thuộc CRLF/LF; baseline chỉ được giảm theo khóa (3 ca); khóa prereg không đổi.

const RUNNER = path.join(ROOT, 'scripts', 'lint', 'run.mjs');
const HASH = new URL('../scripts/lint/lib/hash.mjs', import.meta.url).href;
const PREREG_LIB = new URL('../scripts/lint/lib/prereg.mjs', import.meta.url).href;
const BASELINE_LIB = new URL('../scripts/lint/lib/baseline-shrink.mjs', import.meta.url).href;

// đường dẫn máy giả, ghép từ mảnh để chính tệp này không bị rule machine-path bắt
const BAD_LINE = `x = "${'C:'}${'\\'}Users${'\\'}someone${'\\'}proj"`;
const rawSha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(' ')} lỗi: ${r.stderr}`);
  return r.stdout.trim();
}

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-lint-hash-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'lint@example.invalid');
  git(dir, 'config', 'user.name', 'lint');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'core.autocrlf', 'false'); // giữ nguyên byte CRLF trong blob
  return {
    dir,
    write(rel: string, content: string) {
      fs.writeFileSync(path.join(dir, rel), content, 'utf8');
    },
    entries(list: object[]) {
      fs.mkdirSync(path.join(dir, 'scripts', 'lint'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'scripts', 'lint', 'allow.json'), `${JSON.stringify({ entries: [] })}\n`);
      fs.writeFileSync(path.join(dir, 'scripts', 'lint', 'baseline.json'), `${JSON.stringify({ entries: list }, null, 2)}\n`);
    },
    commit(msg: string) {
      git(dir, 'add', '-A');
      git(dir, 'commit', '-q', '-m', msg);
      return git(dir, 'rev-parse', 'HEAD');
    },
    lint(base?: string) {
      const env: NodeJS.ProcessEnv = { ...process.env };
      delete env.LINT_BASE;
      delete env.CCODING_BASE_REF;
      const r = spawnSync(process.execPath, [RUNNER, '--rule', 'machine-path', ...(base ? ['--base', base] : [])], { cwd: dir, encoding: 'utf8', env, windowsHide: true });
      return { code: r.status, out: `${r.stdout}${r.stderr}` };
    },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
  };
}

const entry = (file: string, sha256: string) => ({ rule: 'machine-path', file, sha256, owner: 'Phòng Dev', fixIn: 'thử', by: 'test' });

test('hash: cùng nội dung CRLF và LF cho cùng sha256 (chuỗi và Buffer)', async () => {
  const { sha256Norm } = (await import(HASH)) as { sha256Norm: (x: string | Buffer) => string };
  const lf = 'a\nb\n\nc\n';
  const crlf = 'a\r\nb\r\n\r\nc\r\n';
  assert.equal(sha256Norm(crlf), sha256Norm(lf));
  assert.equal(sha256Norm(Buffer.from(crlf)), sha256Norm(lf));
  assert.equal(sha256Norm(lf), rawSha(lf), 'nội dung LF: băm như sha256 thường (không đổi mã băm cũ của tệp LF)');
  assert.notEqual(rawSha(crlf), rawSha(lf), 'đối chứng: băm thô khác nhau');
  assert.notEqual(sha256Norm('a\rb'), sha256Norm('a\nb'), 'chỉ đổi CRLF, không đổi CR đơn');
});

test('hash: khối prereg băm như nhau cho CRLF và LF; khóa hiện có không bị báo sửa', async () => {
  const { splitBlocks, compare, PREREG, LOCK } = (await import(PREREG_LIB)) as {
    splitBlocks: (t: string) => Array<{ key: string; sha256: string }>;
    compare: (b: unknown, l: unknown) => { errors: unknown[]; fresh: unknown[] };
    PREREG: string;
    LOCK: string;
  };
  const lf = '# Tiêu đề\n\nnội dung\n\n## 9. Thêm\n\ndòng\n';
  const a = splitBlocks(lf).map((b) => [b.key, b.sha256]);
  const b = splitBlocks(lf.replace(/\n/g, '\r\n')).map((x) => [x.key, x.sha256]);
  assert.deepEqual(b, a);
  // tệp thật: so với khóa đã commit, cả bản LF lẫn CRLF
  const text = fs.readFileSync(path.join(ROOT, PREREG), 'utf8').replace(/\r\n/g, '\n');
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, LOCK), 'utf8'));
  for (const variant of [text, text.replace(/\n/g, '\r\n')]) {
    const r = compare(splitBlocks(variant), lock);
    assert.deepEqual(r.errors, [], 'khóa prereg-lock hiện có không được báo sửa');
  }
});

test('hash: mục baseline sha256 khớp cả khi tệp là CRLF lẫn LF', () => {
  const t = tempRepo();
  try {
    const lf = `${BAD_LINE}\nhết\n`;
    t.write('f.txt', lf);
    t.entries([entry('f.txt', rawSha(lf))]);
    t.commit('base');
    assert.equal(t.lint().code, 0, 'LF');
    t.write('f.txt', lf.replace(/\n/g, '\r\n'));
    const r = t.lint();
    assert.equal(r.code, 0, `CRLF: ${r.out}`);
    t.write('f.txt', `${lf}thêm\n`);
    assert.equal(t.lint().code, 1, 'nội dung đổi thật ⇒ mục không còn khớp');
  } finally {
    t.cleanup();
  }
});

test('baseline chỉ được giảm — ca 1: mốc không có baseline.json ⇒ đạt', () => {
  const t = tempRepo();
  try {
    const lf = `${BAD_LINE}\n`;
    t.write('f.txt', lf);
    const base = t.commit('mốc chưa có baseline');
    t.entries([entry('f.txt', rawSha(lf))]);
    const r = t.lint(base);
    assert.equal(r.code, 0, r.out);
  } finally {
    t.cleanup();
  }
});

test('baseline chỉ được giảm — ca 2: mục HEAD không có ở mốc ⇒ lỗi; mục có ở mốc hoặc bị xóa ⇒ đạt', () => {
  const t = tempRepo();
  try {
    const f = `${BAD_LINE}\n`;
    const g = `${BAD_LINE}\ng\n`;
    t.write('f.txt', f);
    t.entries([entry('f.txt', rawSha(f))]);
    const base = t.commit('mốc có baseline');
    assert.equal(t.lint(base).code, 0, 'không đổi');
    t.write('g.txt', g);
    t.entries([entry('f.txt', rawSha(f)), entry('g.txt', rawSha(g))]);
    const grown = t.lint(base);
    assert.equal(grown.code, 1, grown.out);
    assert.match(grown.out, /baseline tăng/);
    assert.match(grown.out, /g\.txt/);
    fs.rmSync(path.join(t.dir, 'g.txt'));
    t.entries([entry('f.txt', rawSha(f))]);
    assert.equal(t.lint(base).code, 0, 'giảm');
  } finally {
    t.cleanup();
  }
});

test('baseline chỉ được giảm — ca 3 (chuyển tiếp): băm thô ở mốc → băm chuẩn hóa ở HEAD, blob ở mốc không đổi ⇒ đạt; blob đã đổi ⇒ lỗi', () => {
  const t = tempRepo();
  try {
    const crlf = `${BAD_LINE}\r\nhết\r\n`; // blob CRLF (autocrlf=false) → mốc ghi băm thô của byte CRLF
    t.write('f.txt', crlf);
    t.entries([entry('f.txt', rawSha(crlf))]);
    const base = t.commit('mốc: băm thô');
    t.entries([entry('f.txt', rawSha(crlf.replace(/\r\n/g, '\n')))]); // HEAD: băm chuẩn hóa
    const ok = t.lint(base);
    assert.equal(ok.code, 0, ok.out);
    // tệp đổi nội dung sau mốc, mục HEAD khớp nội dung mới ⇒ không phải chuyển tiếp thuần, là mục mới
    const changed = `${BAD_LINE}\r\nkhác\r\n`;
    t.write('f.txt', changed);
    t.entries([entry('f.txt', rawSha(changed.replace(/\r\n/g, '\n')))]);
    const bad = t.lint(base);
    assert.equal(bad.code, 1, bad.out);
    assert.match(bad.out, /baseline tăng/);
  } finally {
    t.cleanup();
  }
});

test('addedBaselineEntries: khóa theo (rule, tệp, neo|sha256); chuyển tiếp cần (rule, tệp) ở mốc', async () => {
  const { addedBaselineEntries } = (await import(BASELINE_LIB)) as {
    addedBaselineEntries: (h: object[], b: object[] | null, show: (f: string) => string | null) => object[];
  };
  const lf = 'abc\n';
  const norm = rawSha(lf);
  const show = (f: string) => (f === 'a.txt' ? 'abc\r\n' : null);
  const e = (rule: string, file: string, extra: object) => ({ rule, file, owner: 'o', fixIn: 'f', by: 'b', ...extra });
  assert.deepEqual(addedBaselineEntries([e('r', 'a.txt', { anchor: 'x' })], null, show), [], 'mốc không có baseline');
  assert.equal(addedBaselineEntries([e('r', 'a.txt', { anchor: 'y' })], [e('r', 'a.txt', { anchor: 'x' })], show).length, 1, 'neo mới');
  assert.equal(addedBaselineEntries([e('r', 'a.txt', { anchor: 'x' })], [e('r', 'a.txt', { anchor: 'x' })], show).length, 0, 'neo cũ');
  assert.equal(addedBaselineEntries([e('r', 'a.txt', { sha256: norm })], [e('r', 'a.txt', { sha256: 'f'.repeat(64) })], show).length, 0, 'chuyển tiếp');
  assert.equal(addedBaselineEntries([e('r', 'b.txt', { sha256: norm })], [e('r', 'a.txt', { sha256: 'f'.repeat(64) })], show).length, 1, 'khác tệp');
  assert.equal(addedBaselineEntries([e('q', 'a.txt', { sha256: norm })], [e('r', 'a.txt', { sha256: 'f'.repeat(64) })], show).length, 1, 'khác rule');
});
