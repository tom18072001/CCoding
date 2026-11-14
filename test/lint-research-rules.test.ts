import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../src/config.js';

const RUNNER = path.join(ROOT, 'scripts', 'lint', 'run.mjs');
const LOCK_CLI = path.join(ROOT, 'scripts', 'lint', 'prereg-lock.mjs');

function write(dir: string, rel: string, content: string): void {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content, 'utf8');
}

function run(dir: string, script: string, args: string[]): { code: number | null; out: string } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.LINT_BASE;
  delete env.CCODING_BASE_REF;
  const r = spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8', env, windowsHide: true });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

/** Repo git tạm với allow/baseline rỗng, bản sao overclaim.json thật. */
function setup(files: Record<string, string>): { dir: string; lint: (rule: string) => { code: number | null; out: string }; track: () => void; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-research-lint-'));
  const git = (...a: string[]): void => {
    const r = spawnSync('git', a, { cwd: dir, encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0, r.stderr);
  };
  git('init', '-q');
  write(dir, 'scripts/lint/allow.json', '{ "entries": [] }\n');
  write(dir, 'scripts/lint/baseline.json', '{ "entries": [] }\n');
  fs.copyFileSync(path.join(ROOT, 'scripts', 'lint', 'overclaim.json'), path.join(dir, 'scripts', 'lint', 'overclaim.json'));
  for (const [k, v] of Object.entries(files)) write(dir, k, v);
  git('add', '-A');
  return { dir, lint: (rule) => run(dir, RUNNER, ['--rule', rule]), track: () => git('add', '-A'), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const PREREG = '# Đăng ký\n\n## 1. Thiết kế\n\nNội dung một.\n\n## 9. Sai lệch\n\n### Mục 9a\n\nGhi 9a.\n\n## Lịch sử bản\n\n- **v1:** đầu.\n';

test('prereg-lock: khóa lần đầu, rồi khối đã khóa bị sửa ⇒ lỗi', () => {
  const t = setup({ 'docs/research/preregistration.md': PREREG });
  try {
    assert.equal(run(t.dir, LOCK_CLI, ['--add-new']).code, 0);
    t.track();
    assert.equal(t.lint('prereg-lock').code, 0);
    write(t.dir, 'docs/research/preregistration.md', PREREG.replace('Nội dung một.', 'Nội dung một, đã sửa.'));
    const r = t.lint('prereg-lock');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /khối đã khóa bị sửa: "1\. Thiết kế"/);
  } finally {
    t.cleanup();
  }
});

test('prereg-lock: khối đã khóa bị xóa ⇒ lỗi; --add-new không che được', () => {
  const t = setup({ 'docs/research/preregistration.md': PREREG });
  try {
    run(t.dir, LOCK_CLI, ['--add-new']);
    t.track();
    write(t.dir, 'docs/research/preregistration.md', PREREG.replace('### Mục 9a\n\nGhi 9a.\n\n', ''));
    assert.equal(t.lint('prereg-lock').code, 1);
    const add = run(t.dir, LOCK_CLI, ['--add-new']);
    assert.equal(add.code, 1, add.out);
  } finally {
    t.cleanup();
  }
});

test('prereg-lock: khối mới ở §9 chỉ qua khi đã --add-new; khối mới ngoài §9 luôn lỗi; lịch sử chỉ thêm dòng', () => {
  const t = setup({ 'docs/research/preregistration.md': PREREG });
  try {
    run(t.dir, LOCK_CLI, ['--add-new']);
    t.track();
    // khối mới trong §9
    write(t.dir, 'docs/research/preregistration.md', PREREG.replace('## Lịch sử bản', '### Mục 9b\n\nGhi 9b.\n\n## Lịch sử bản'));
    assert.equal(t.lint('prereg-lock').code, 1);
    assert.equal(run(t.dir, LOCK_CLI, ['--add-new']).code, 0);
    assert.equal(t.lint('prereg-lock').code, 0);
    // thêm dòng lịch sử: được
    const withHist = fs.readFileSync(path.join(t.dir, 'docs/research/preregistration.md'), 'utf8').replace('- **v1:** đầu.', '- **v2:** thêm.\n- **v1:** đầu.');
    write(t.dir, 'docs/research/preregistration.md', withHist);
    assert.equal(t.lint('prereg-lock').code, 0, t.lint('prereg-lock').out);
    // sửa dòng lịch sử cũ: lỗi
    write(t.dir, 'docs/research/preregistration.md', withHist.replace('**v1:** đầu.', '**v1:** đầu, sửa.'));
    const r = t.lint('prereg-lock');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /chỉ được thêm dòng/);
    // khối mới ngoài §9
    write(t.dir, 'docs/research/preregistration.md', withHist.replace('## 9. Sai lệch', '## 2. Mới\n\nx\n\n## 9. Sai lệch'));
    const r2 = t.lint('prereg-lock');
    assert.equal(r2.code, 1, r2.out);
    assert.match(r2.out, /ngoài §9/);
    assert.equal(run(t.dir, LOCK_CLI, ['--add-new']).code, 1);
  } finally {
    t.cleanup();
  }
});

test('overclaim: câu cấm ngoài trích dẫn ⇒ lỗi; trong ngoặc kép/backtick và câu điều kiện ⇒ qua', () => {
  const bad = setup({ 'docs/research/paper/paper.md': '# Bài\n\nSong song gần như giảm nửa thời gian mà không tốn thêm token.\n' });
  try {
    const r = bad.lint('overclaim');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /\[khong-ton-them-token\]/);
  } finally {
    bad.cleanup();
  }
  const ok = setup({
    'docs/research/paper/paper.md': '# Bài\n\nCâu cấm: "không tốn thêm token" và `token không đổi`; còn nếu token không đổi thì USD ×2.\n',
    'docs/research/notes.md': 'không tốn thêm token (ngoài phạm vi của rule)\n',
  });
  try {
    const r = ok.lint('overclaim');
    assert.equal(r.code, 0, r.out);
  } finally {
    ok.cleanup();
  }
});

test('placeholders: "(pha review điền)", TBD, TODO ⇒ lỗi', () => {
  const t = setup({ 'docs/research/x.md': '## K5 — Review (pha review điền)\n\nTBD\n', 'docs/research/y.md': 'sạch\n' });
  try {
    const r = t.lint('placeholders');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /x\.md:1/);
    assert.match(r.out, /x\.md:3/);
    assert.doesNotMatch(r.out, /y\.md/);
  } finally {
    t.cleanup();
  }
});

test('review-verdict: cần đúng một dòng Kết luận; hai dòng hoặc dấu hiệu bị cắt ⇒ lỗi', () => {
  const ok = setup({ 'docs/research/context/a-review.md': '# Phản biện\n\n**Kết luận:** Sửa nhỏ\n\nNội dung.\n' });
  const dup = setup({ 'docs/research/context/b-review.md': '# P\n\n**Kết luận:** Đạt\n**Kết luận:** Chưa đạt\n' });
  const cut = setup({ 'docs/research/context/c-review.md': '# P\n\n**Kết luận:** Đạt\n\nĐã hết lượt công cụ giữa chừng.\n' });
  const none = setup({ 'docs/research/context/d-review.md': '# P\n\nKết luận: Đạt\n' });
  try {
    assert.equal(ok.lint('review-verdict').code, 0);
    assert.equal(dup.lint('review-verdict').code, 1);
    const c = cut.lint('review-verdict');
    assert.equal(c.code, 1, c.out);
    assert.match(c.out, /bị cắt/);
    assert.equal(none.lint('review-verdict').code, 1);
  } finally {
    for (const t of [ok, dup, cut, none]) t.cleanup();
  }
});
