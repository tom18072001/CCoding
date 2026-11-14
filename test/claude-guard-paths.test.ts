// B-08 (G3, G4): hook dùng cwd của sự kiện + realpath; cho Read tool-results của chính phiên. Test đối kháng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { guardDecision } from '../src/tools/claude-guard.js';
import { pathImplFor, realInsideRoot, resolveFrom } from '../src/tools/guard-paths.js';
import { pathInside } from '../src/tools/shell-policy.js';

const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-b08-')));
const root = path.join(base, 'wt');
const outside = path.join(base, 'ngoai');
const cfgDir = path.join(base, 'claude-cfg');
const SID = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';
const OTHER = 'cccccccc-4444-5555-6666-dddddddddddd';
fs.mkdirSync(path.join(root, 'src'), { recursive: true });
fs.mkdirSync(outside, { recursive: true });
fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'x');
fs.writeFileSync(path.join(outside, 'bi-mat.txt'), 'x');
for (const sid of [SID, OTHER]) {
  fs.mkdirSync(path.join(cfgDir, 'projects', 'slug', sid, 'tool-results'), { recursive: true });
  fs.writeFileSync(path.join(cfgDir, 'projects', 'slug', sid, 'tool-results', 'out.txt'), 'x');
}
fs.mkdirSync(path.join(cfgDir, 'projects', 'slug', SID, 'khac'), { recursive: true });
fs.writeFileSync(path.join(cfgDir, 'projects', 'slug', SID, 'khac', 'x.txt'), 'x');
fs.writeFileSync(path.join(cfgDir, 'settings.json'), '{}');
const env = { CLAUDE_CONFIG_DIR: cfgDir } as NodeJS.ProcessEnv;
const cfg = { root, deny: [], allowGitCommit: false };
const dec = (tool: string, p: string, extra: Record<string, unknown> = {}, c = cfg) =>
  guardDecision({ tool_name: tool, tool_input: { file_path: p }, ...extra }, c, env);

test.after(() => fs.rmSync(base, { recursive: true, force: true }));

test('B-08 G3: có cwd — đường dẫn tương đối giải theo cwd, `../` thoát worktree bị chặn', () => {
  assert.equal(dec('Read', 'a.ts', { cwd: path.join(root, 'src') }), undefined);
  assert.equal(dec('Read', '../src/a.ts', { cwd: path.join(root, 'src') }), undefined);
  assert.ok(dec('Read', '../../ngoai/bi-mat.txt', { cwd: path.join(root, 'src') }));
  assert.ok(dec('Read', '../../../etc/passwd', { cwd: path.join(root, 'src') }));
  assert.ok(dec('Write', '..\\..\\ngoai\\moi.txt', { cwd: path.join(root, 'src') }));
});

test('B-08 G3: cwd giả nằm ngoài worktree — tệp tương đối giải ra ngoài nên bị chặn', () => {
  assert.ok(dec('Read', 'bi-mat.txt', { cwd: outside }));
  assert.ok(dec('Edit', 'bi-mat.txt', { cwd: outside }));
  assert.ok(dec('Read', 'a.ts', { cwd: path.join(root, '..') }));
});

test('B-08 G3: thiếu cwd (hoặc cwd không phải đường dẫn tuyệt đối) → giải theo root như cũ', () => {
  assert.equal(dec('Read', 'src/a.ts'), undefined);
  assert.ok(dec('Read', '../ngoai/bi-mat.txt'));
  assert.equal(dec('Read', 'src/a.ts', { cwd: 'tuong/doi' }), undefined);
});

test('B-08 G3: tệp mới (Write) trong worktree vẫn được; .env vẫn bị chặn', () => {
  assert.equal(dec('Write', path.join(root, 'src', 'moi.ts'), { cwd: root }), undefined);
  assert.ok(dec('Read', '.env', { cwd: root }));
});

test('B-08 G3: tắt guard.useEventCwd → hành vi cũ (giải theo root, bỏ qua cwd)', () => {
  const off = { ...cfg, useEventCwd: false };
  assert.equal(dec('Read', 'src/a.ts', { cwd: outside }, off), undefined);
});

function tryLink(target: string, link: string): string | undefined {
  try {
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    return undefined;
  } catch (e) {
    return `${process.platform}: không tạo được symlink/junction (thường do thiếu quyền/hệ tệp không hỗ trợ): ${(e as Error).message}`;
  }
}

test('B-08 G3: symlink/junction trong worktree trỏ ra ngoài bị chặn (realpath)', (t) => {
  const link = path.join(root, 'lien-ket');
  const why = tryLink(outside, link);
  if (why) return t.skip(why);
  assert.ok(dec('Read', 'lien-ket/bi-mat.txt', { cwd: root }));
  assert.ok(dec('Read', path.join(link, 'bi-mat.txt')));
  assert.ok(dec('Write', 'lien-ket/moi.txt', { cwd: root })); // tệp chưa tồn tại: tổ tiên là liên kết
  // đối chứng: liên kết trỏ vào trong worktree vẫn dùng được
  const inner = path.join(root, 'lien-ket-trong');
  const why2 = tryLink(path.join(root, 'src'), inner);
  if (!why2) assert.equal(dec('Read', 'lien-ket-trong/a.ts', { cwd: root }), undefined);
});

const tr = (sid: string, ...rest: string[]) => path.join(cfgDir, 'projects', 'slug', sid, ...rest);

test('B-08 G4: Read tool-results của CHÍNH phiên được phép', () => {
  assert.equal(dec('Read', tr(SID, 'tool-results', 'out.txt'), { cwd: root, session_id: SID }), undefined);
});

test('B-08 G4: tool-results của phiên khác, thiếu/sai session_id bị chặn', () => {
  assert.ok(dec('Read', tr(OTHER, 'tool-results', 'out.txt'), { cwd: root, session_id: SID }));
  assert.ok(dec('Read', tr(SID, 'tool-results', 'out.txt'), { cwd: root }));
  assert.ok(dec('Read', tr(SID, 'tool-results', 'out.txt'), { cwd: root, session_id: '../x' }));
  assert.ok(dec('Read', tr(SID, 'tool-results', 'out.txt'), { cwd: root, session_id: 'ngan' }));
});

test('B-08 G4: đúng phiên nhưng đường dẫn chứa `..` thoát tool-results bị chặn', () => {
  assert.ok(dec('Read', tr(SID, 'tool-results', '..', 'khac', 'x.txt'), { cwd: root, session_id: SID }));
  assert.ok(dec('Read', tr(SID, 'tool-results', '..', '..', OTHER, 'tool-results', 'out.txt'), { cwd: root, session_id: SID }));
  assert.ok(dec('Read', tr(SID, 'tool-results', '..', '..', '..', '..', 'settings.json'), { cwd: root, session_id: SID }));
});

test('B-08 G4: không mở thư mục khác trong .claude/; chỉ Read (Write/Edit/Grep không được)', () => {
  assert.ok(dec('Read', path.join(cfgDir, 'settings.json'), { cwd: root, session_id: SID }));
  assert.ok(dec('Read', tr(SID, 'khac', 'x.txt'), { cwd: root, session_id: SID }));
  assert.ok(dec('Write', tr(SID, 'tool-results', 'out.txt'), { cwd: root, session_id: SID }));
  assert.ok(dec('Edit', tr(SID, 'tool-results', 'out.txt'), { cwd: root, session_id: SID }));
  assert.ok(dec('Grep', tr(SID, 'tool-results', 'out.txt'), { cwd: root, session_id: SID }));
});

test('B-08 G4: tắt allowOwnToolResults → chặn như cũ', () => {
  assert.ok(dec('Read', tr(SID, 'tool-results', 'out.txt'), { cwd: root, session_id: SID }, { ...cfg, allowOwnToolResults: false }));
});

test('B-08 G4: junction trong tool-results trỏ ra ngoài bị chặn (realpath)', (t) => {
  const link = tr(SID, 'tool-results', 'ra-ngoai');
  const why = tryLink(outside, link);
  if (why) return t.skip(why);
  assert.ok(dec('Read', path.join(link, 'bi-mat.txt'), { cwd: root, session_id: SID }));
});

// B-14 — ngữ nghĩa theo kiểu đường dẫn của root (tiêm path.win32/posix qua root), giống nhau trên Windows và Linux.
const inside = (r: string, p: string, cwd?: string) => {
  const P = pathImplFor(r);
  const abs = resolveFrom(r, p, cwd, P);
  return pathInside(r, abs) && realInsideRoot(r, abs, P);
};

test('B-14: root C:/tmp/x + a.ts → trong root; C:/TMP/X/a.ts cũng trong root (không phân biệt hoa thường)', () => {
  assert.equal(inside('C:/tmp/x', 'a.ts'), true);
  assert.equal(inside('C:/tmp/x', 'C:/TMP/X/a.ts'), true);
});

test('B-14: `..\\..\\ngoai\\moi.txt` bị chặn với root win32 và root posix', () => {
  assert.equal(inside('C:/tmp/x', '..\\..\\ngoai\\moi.txt', 'C:/tmp/x/src'), false);
  assert.equal(inside('/tmp/x', '..\\..\\ngoai\\moi.txt', '/tmp/x/src'), false);
  assert.equal(inside('/tmp/x', 'src\\a.ts'), true);
});

test('B-14: UNC `\\\\server\\share` khi root Windows → chặn', () => {
  assert.equal(inside('C:\\tmp\\x', '\\\\server\\share\\a.txt'), false);
  assert.equal(inside('C:\\tmp\\x', '//server/share/a.txt'), false);
});

test('B-14: `C:/Users/admin` khi root POSIX → chặn', () => {
  assert.equal(inside('/tmp/x', 'C:/Users/admin'), false);
  assert.equal(inside('/tmp/x', 'C:\\Users\\admin'), false);
});

test('B-14: `/etc/passwd` khi root `C:\\…` → chặn; MSYS `/c/…` đổi rồi so', () => {
  assert.equal(inside('C:\\tmp\\x', '/etc/passwd'), false);
  assert.equal(inside('C:\\', '/etc/passwd'), false);
  assert.equal(inside('C:\\tmp\\x', '/c/tmp/x/a.ts'), true);
  assert.equal(inside('C:\\tmp\\x', '/c/Users/admin'), false);
});

test('B-14: guardDecision chặn `..\\..` (Write) và Grep ra ngoài trên nền tảng đang chạy', () => {
  assert.ok(dec('Write', '..\\..\\ngoai\\moi.txt', { cwd: path.join(root, 'src') }));
  assert.ok(guardDecision({ tool_name: 'Grep', tool_input: { path: outside } }, cfg, env));
});
