import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../src/config.js';

const RUNNER = path.join(ROOT, 'scripts', 'lint', 'run.mjs');

/** Repo git tạm chỉ có allow/baseline rỗng và các tệp cho trước; chạy rule test-writes-repo. */
function lint(files: Record<string, string>): { code: number | null; out: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-twr-'));
  try {
    const git = (...a: string[]): void => {
      const r = spawnSync('git', a, { cwd: dir, encoding: 'utf8', windowsHide: true });
      assert.equal(r.status, 0, r.stderr);
    };
    git('init', '-q');
    const all: Record<string, string> = { 'scripts/lint/allow.json': '{ "entries": [] }\n', 'scripts/lint/baseline.json': '{ "entries": [] }\n', ...files };
    for (const [k, v] of Object.entries(all)) {
      fs.mkdirSync(path.dirname(path.join(dir, k)), { recursive: true });
      fs.writeFileSync(path.join(dir, k), v, 'utf8');
    }
    git('add', '-A');
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.LINT_BASE;
    delete env.CCODING_BASE_REF;
    const r = spawnSync(process.execPath, [RUNNER, '--rule', 'test-writes-repo'], { cwd: dir, encoding: 'utf8', env, windowsHide: true });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const HEAD = "import fs from 'node:fs';\nimport os from 'node:os';\nimport path from 'node:path';\nconst HERE = path.dirname(new URL(import.meta.url).pathname);\n";

test('test-writes-repo: ghi vào đường dẫn ghép từ HERE (trực tiếp hoặc qua biến) ⇒ đỏ', () => {
  const direct = lint({ 'a/x.test.mjs': `${HEAD}fs.mkdirSync(path.join(HERE, '../tasks/new'), { recursive: true });\n` });
  assert.equal(direct.code, 1, direct.out);
  assert.match(direct.out, /a\/x\.test\.mjs:5 — mkdirSync\(\)/);
  const viaVar = lint({ 'a/y.test.mjs': `${HEAD}const dir = path.resolve(HERE, 'out');\nfs.writeFileSync(path.join(dir, 'f.json'), '{}');\n` });
  assert.equal(viaVar.code, 1, viaVar.out);
  const dest = lint({ 'a/z.test.mjs': `${HEAD}fs.cpSync(os.tmpdir(), path.join(HERE, 'copy'), { recursive: true });\n` });
  assert.equal(dest.code, 1, dest.out);
});

test('test-writes-repo: ghi vào thư mục tạm, hoặc chỉ ĐỌC từ HERE ⇒ xanh; tệp không phải test bị bỏ qua', () => {
  const ok = lint({
    'a/x.test.mjs': `${HEAD}const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'x-'));\nfs.copyFileSync(path.join(HERE, 'fixture.json'), path.join(tmp, 'f.json'));\nfs.writeFileSync(path.join(tmp, 'g.json'), fs.readFileSync(path.join(HERE, 'fixture.json')));\nfs.rmSync(tmp, { recursive: true, force: true });\n`,
    'a/helper.mjs': `${HEAD}fs.mkdirSync(path.join(HERE, 'x'));\n`,
  });
  assert.equal(ok.code, 0, ok.out);
});

test('test-writes-repo: lời gọi ghi nằm trong chuỗi/template/comment (fixture) không bị tính; trong ${…} của template thì vẫn tính', () => {
  const inStr = lint({ 'a/x.test.mjs': `${HEAD}const s = "fs.rmSync(path.join(HERE, 'q'))";\n// fs.rmSync(path.join(HERE, 'c'))\nconst t = \`fs.rmSync(path.join(HERE, 'q'))\`;\n` });
  assert.equal(inStr.code, 0, inStr.out);
  const inTpl = lint({ 'a/y.test.mjs': `${HEAD}const t = \`x\${fs.rmSync(path.join(HERE, 'q'))}\`;\n` });
  assert.equal(inTpl.code, 1, inTpl.out);
});
