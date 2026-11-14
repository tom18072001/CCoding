// Test consistency-check.mjs: quét đường dẫn máy (FX20) và ngoại lệ neo theo anchor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'consistency-check.mjs');

// Dựng cây docs/research tạm. Đường dẫn máy được ghép từ mảnh để chính tệp test không chứa chúng.
function makeRoot(files, facts = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cc-'));
  mkdirSync(join(root, 'docs', 'research'), { recursive: true });
  writeFileSync(join(root, 'docs', 'research', 'facts.json'), JSON.stringify(facts));
  for (const [name, body] of Object.entries(files)) {
    const p = join(root, 'docs', 'research', name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
  }
  return root;
}
const run = (root) => spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
const win = ['C:', 'Users', 'someone', 'x'].join('\\');
const winSlash = ['D:', 'Users', 'someone'].join('/');
const mac = ['', 'Users', 'someone', 'proj'].join('/');
const home = ['', 'home', 'runner', 'work'].join('/');
const tmp = ['', 'tmp', 'abc'].join('/');
const varf = ['', 'var', 'folders', 'zz'].join('/');
const appd = ['AppData', 'Local', 'Temp', 'x'].join('\\');

test('không có đường dẫn máy → exit 0', () => {
  const root = makeRoot({ 'a.md': 'Dùng `src/tmp/x` và docs/Users/guide, không có gì.\n' });
  try { assert.equal(run(root).status, 0); } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const [name, p] of [['windows', win], ['windows /', winSlash], ['mac', mac], ['linux home', home], ['tmp', tmp], ['var/folders', varf], ['AppData Temp', appd]]) {
  test(`có đường dẫn máy (${name}) → exit 1, in tệp:dòng`, () => {
    const root = makeRoot({ 'sub/b.md': `dòng 1\nchạy ở ${p} xong\n` });
    try {
      const r = run(root);
      assert.equal(r.status, 1, r.stdout);
      assert.match(r.stdout, /docs\/research\/sub\/b\.md:2 — machine-path/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('preregistration.md được miễn quét đường dẫn máy', () => {
  const root = makeRoot({ 'preregistration.md': `chạy ở ${win}\n` });
  try { assert.equal(run(root).status, 0); } finally { rmSync(root, { recursive: true, force: true }); }
});

const staleFacts = (ex) => ({ stale: [{ id: 'S-X', pattern: 'CỤM-LỖI', reason: 'thử', exceptions: ex }] });

test('ngoại lệ dạng line vẫn hoạt động', () => {
  const body = 'a\nCỤM-LỖI ở dòng 2\nb\n';
  let root = makeRoot({ 'c.md': body }, staleFacts([{ file: 'docs/research/c.md', line: 2, reason: 'thử' }]));
  try { assert.equal(run(root).status, 0); } finally { rmSync(root, { recursive: true, force: true }); }
  root = makeRoot({ 'c.md': body }, staleFacts([{ file: 'docs/research/c.md', line: 3, reason: 'thử' }]));
  try { assert.equal(run(root).status, 1); } finally { rmSync(root, { recursive: true, force: true }); }
});

test('ngoại lệ dạng anchor: khớp duy nhất → bỏ qua đúng dòng, không phụ thuộc số dòng', () => {
  const body = 'a\nb\nCỤM-LỖI ở đoạn NEO-1\nc\n';
  const root = makeRoot({ 'c.md': body }, staleFacts([{ file: 'docs/research/c.md', anchor: 'NEO-1', reason: 'thử' }]));
  try { assert.equal(run(root).status, 0); } finally { rmSync(root, { recursive: true, force: true }); }
});

test('anchor chỉ miễn đúng dòng chứa nó; dòng khác vẫn lỗi', () => {
  const body = 'CỤM-LỖI ở đầu\nCỤM-LỖI ở đoạn NEO-1\n';
  const root = makeRoot({ 'c.md': body }, staleFacts([{ file: 'docs/research/c.md', anchor: 'NEO-1', reason: 'thử' }]));
  try {
    const r = run(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /c\.md:1 /);
    assert.doesNotMatch(r.stdout, /c\.md:2 /);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('anchor không tìm thấy → lỗi (exit 2)', () => {
  const root = makeRoot({ 'c.md': 'CỤM-LỖI\n' }, staleFacts([{ file: 'docs/research/c.md', anchor: 'KHÔNG-CÓ', reason: 'thử' }]));
  try {
    const r = run(root);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /không tìm thấy/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('anchor xuất hiện hơn một lần → lỗi (exit 2)', () => {
  const root = makeRoot({ 'c.md': 'CỤM-LỖI NEO\nCỤM-LỖI NEO\n' }, staleFacts([{ file: 'docs/research/c.md', anchor: 'NEO', reason: 'thử' }]));
  try {
    const r = run(root);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /xuất hiện 2 lần/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
