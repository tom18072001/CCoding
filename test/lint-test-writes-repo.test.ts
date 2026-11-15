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

// D23: stringMask nhận regex literal; biến trung gian.
test('test-writes-repo D23: regex literal /\'/ đứng trước lời ghi vào repo không làm lệch trạng thái ⇒ vẫn đỏ', () => {
  const r = lint({ 'a/x.test.mjs': `${HEAD}const re = /'/;\nfs.rmSync(path.join(HERE, 'q'), { recursive: true });\n` });
  assert.equal(r.code, 1, r.out);
  const q2 = lint({ 'a/y.test.mjs': `${HEAD}const ok = /"/.test(x) && /\`/.test(y) && /[/'"\`]\//g.test(z);\nfs.rmSync(path.join(HERE, 'q'));\n` });
  assert.equal(q2.code, 1, q2.out);
});

test('test-writes-repo D23: regex chứa " hoặc ` hay lớp [...] không lệch trạng thái; lời ghi nằm trong regex vẫn không tính', () => {
  const neg = lint({ 'a/x.test.mjs': `${HEAD}const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'x-'));\nconst a = /"/.test(s), b = /\`/.test(s), c = /[/"]+/.test(s);\nfs.writeFileSync(path.join(tmp, 'f'), 'x');\nconst doc = /fs\.rmSync\(path\.join\(HERE/;\n` });
  assert.equal(neg.code, 0, neg.out);
});

test('test-writes-repo D23: a / b / c là phép chia, không bị hiểu thành regex (lời ghi ở giữa vẫn bị bắt)', () => {
  const r = lint({ 'a/x.test.mjs': `${HEAD}const n = a / b / c;\nfs.rmSync(path.join(HERE, 'q'));\nconst m = (a) / 2 / 3, k = arr[0] / 4;\n` });
  assert.equal(r.code, 1, r.out);
  const noRe = lint({ 'a/y.test.mjs': `${HEAD}const t = fs.mkdtempSync(path.join(os.tmpdir(), 'x-'));\nconst n = a / b; fs.rmSync(path.join(HERE, 'q')); const m = c / d;\n` });
  assert.equal(noRe.code, 1, noRe.out); // nếu "/ b; fs.rmSync(… / " bị coi là regex thì lời ghi bị nuốt ⇒ sẽ sai ở đây
});

test('test-writes-repo D23: đường dẫn repo qua biến trung gian ⇒ đỏ; qua thư mục tạm ⇒ xanh', () => {
  const bare = lint({ 'a/x.test.mjs': `${HEAD}const base = HERE;\nconst dir = path.join(base, 'tasks');\nfs.mkdirSync(dir, { recursive: true });\n` });
  assert.equal(bare.code, 1, bare.out);
  const viaUrl = lint({ 'a/y.test.mjs': `import { fileURLToPath } from 'node:url';\nimport fs from 'node:fs';\nimport path from 'node:path';\nconst here = path.dirname(fileURLToPath(import.meta.url));\nconst tasks = path.join(here, 'tasks');\nfs.rmSync(tasks, { recursive: true });\n` });
  assert.equal(viaUrl.code, 1, viaUrl.out);
  const tmp = lint({ 'a/z.test.mjs': `${HEAD}const base = fs.mkdtempSync(path.join(os.tmpdir(), 'x-'));\nconst dir = path.join(base, 'tasks');\nconst alias = base;\nfs.mkdirSync(dir, { recursive: true });\nfs.rmSync(alias, { recursive: true });\n` });
  assert.equal(tmp.code, 0, tmp.out);
});

test('test-writes-repo D23: giới hạn còn lại — tham số hàm và thuộc tính đối tượng KHÔNG bị bắt (ghi nhận, không phải bảo đảm)', () => {
  const r = lint({ 'a/x.test.mjs': `${HEAD}function w(d) { fs.rmSync(d, { recursive: true }); }\nw(HERE);\nconst o = { dir: HERE };\nfs.rmSync(o.dir);\n` });
  assert.equal(r.code, 0, r.out);
});
