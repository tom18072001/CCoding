import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../src/config.js';

const RUNNER = path.join(ROOT, 'scripts', 'lint', 'run.mjs');

interface Entry {
  rule: string;
  file: string;
  anchor?: string;
  reason?: string;
  owner?: string;
  fixIn?: string;
  by: string;
}

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(' ')} lỗi: ${r.stderr}`);
  return r.stdout.trim();
}

function write(dir: string, rel: string, content: string): void {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content, 'utf8');
}

function writeEntries(dir: string, kind: 'allow' | 'baseline', entries: Entry[]): void {
  write(dir, `scripts/lint/${kind}.json`, `${JSON.stringify({ entries }, null, 2)}\n`);
}

function pkg(deps: Record<string, string>): string {
  return `${JSON.stringify({ name: 'tmp', version: '0.0.0', dependencies: deps }, null, 2)}\n`;
}

/** Repo git tạm, có commit đầu. Trả về thư mục và dọn dẹp. */
function tempRepo(): { dir: string; commit: (msg: string) => string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-lint-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'lint@example.invalid');
  git(dir, 'config', 'user.name', 'lint');
  git(dir, 'config', 'commit.gpgsign', 'false');
  return {
    dir,
    commit: (msg) => {
      git(dir, 'add', '-A');
      git(dir, 'commit', '-q', '-m', msg);
      return git(dir, 'rev-parse', 'HEAD');
    },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

function lint(dir: string, args: string[]): { code: number | null; out: string } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.LINT_BASE;
  delete env.CCODING_BASE_REF;
  const r = spawnSync(process.execPath, [RUNNER, ...args], { cwd: dir, encoding: 'utf8', env, windowsHide: true });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const ALLOW_STALE: Entry = { rule: 'deps-allowlist', file: 'package.json', anchor: 'left-pad', reason: 'thử', by: 'test' };

test('lint: repo sạch, --rule deps-allowlist không cần mốc ⇒ exit 0', () => {
  const t = tempRepo();
  try {
    write(t.dir, 'package.json', pkg({ yaml: '^2.0.0' }));
    writeEntries(t.dir, 'allow', []);
    writeEntries(t.dir, 'baseline', []);
    t.commit('init');
    const r = lint(t.dir, ['--rule', 'deps-allowlist']);
    assert.equal(r.code, 0, r.out);
  } finally {
    t.cleanup();
  }
});

test('lint: phụ thuộc lạ ⇒ exit 1, in tệp:dòng — lỗi; ngoại lệ khớp thì xanh', () => {
  const t = tempRepo();
  try {
    write(t.dir, 'package.json', pkg({ yaml: '^2.0.0', 'left-pad': '^1.0.0' }));
    writeEntries(t.dir, 'allow', []);
    writeEntries(t.dir, 'baseline', []);
    t.commit('init');
    const bad = lint(t.dir, ['--rule', 'deps-allowlist']);
    assert.equal(bad.code, 1, bad.out);
    assert.match(bad.out, /package\.json:\d+ — "left-pad"/);
    writeEntries(t.dir, 'allow', [ALLOW_STALE]);
    assert.equal(lint(t.dir, ['--rule', 'deps-allowlist']).code, 0);
    const j = lint(t.dir, ['--rule', 'deps-allowlist', '--json']);
    assert.equal(j.code, 0);
    assert.equal((JSON.parse(j.out) as { total: number }).total, 0);
  } finally {
    t.cleanup();
  }
});

test('lint: ngoại lệ không còn khớp ⇒ exit 1 (allow và baseline)', () => {
  const t = tempRepo();
  try {
    write(t.dir, 'package.json', pkg({ yaml: '^2.0.0' }));
    writeEntries(t.dir, 'allow', [ALLOW_STALE]);
    writeEntries(t.dir, 'baseline', []);
    t.commit('init');
    const a = lint(t.dir, ['--rule', 'deps-allowlist']);
    assert.equal(a.code, 1, a.out);
    assert.match(a.out, /không còn khớp/);
    writeEntries(t.dir, 'allow', []);
    writeEntries(t.dir, 'baseline', [{ rule: 'deps-allowlist', file: 'package.json', anchor: 'left-pad', owner: 'Phòng Dev', fixIn: 'D99', by: 'test' }]);
    const b = lint(t.dir, ['--rule', 'deps-allowlist']);
    assert.equal(b.code, 1, b.out);
    assert.match(b.out, /baseline\.json/);
  } finally {
    t.cleanup();
  }
});

test('lint: mục thiếu trường by/lý do ⇒ exit 1', () => {
  const t = tempRepo();
  try {
    write(t.dir, 'package.json', pkg({ yaml: '^2.0.0' }));
    write(t.dir, 'scripts/lint/allow.json', JSON.stringify({ entries: [{ rule: 'deps-allowlist', file: 'package.json', anchor: 'x' }] }));
    writeEntries(t.dir, 'baseline', []);
    t.commit('init');
    const r = lint(t.dir, ['--rule', 'deps-allowlist']);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /thiếu\/sai trường/);
  } finally {
    t.cleanup();
  }
});

test('lint: baseline.json tăng so với mốc ⇒ exit 1; giữ nguyên hoặc giảm ⇒ exit 0', () => {
  const t = tempRepo();
  try {
    const mk = (anchor: string): Entry => ({ rule: 'deps-allowlist', file: 'package.json', anchor, owner: 'Phòng Dev', fixIn: 'D99', by: 'test' });
    write(t.dir, 'package.json', pkg({ yaml: '^2.0.0', 'left-pad': '^1.0.0' }));
    writeEntries(t.dir, 'allow', []);
    writeEntries(t.dir, 'baseline', [mk('left-pad')]);
    const base = t.commit('base');
    assert.equal(lint(t.dir, ['--rule', 'deps-allowlist', '--base', base]).code, 0);
    write(t.dir, 'package.json', pkg({ yaml: '^2.0.0', 'left-pad': '^1.0.0', 'is-odd': '^1.0.0' }));
    writeEntries(t.dir, 'baseline', [mk('left-pad'), mk('is-odd')]);
    const grown = lint(t.dir, ['--rule', 'deps-allowlist', '--base', base]);
    assert.equal(grown.code, 1, grown.out);
    assert.match(grown.out, /baseline tăng/);
    write(t.dir, 'package.json', pkg({ yaml: '^2.0.0' }));
    writeEntries(t.dir, 'baseline', []);
    assert.equal(lint(t.dir, ['--rule', 'deps-allowlist', '--base', base]).code, 0);
  } finally {
    t.cleanup();
  }
});

test('lint: rule needsBase thiếu mốc ⇒ exit 1; mốc qua LINT_BASE hợp lệ ⇒ exit 0; mốc rác ⇒ exit 1', () => {
  const t = tempRepo();
  try {
    write(t.dir, 'package.json', pkg({ yaml: '^2.0.0' }));
    writeEntries(t.dir, 'allow', []);
    writeEntries(t.dir, 'baseline', []);
    const base = t.commit('init');
    const none = lint(t.dir, ['--rule', 'agent-format-cochange']);
    assert.equal(none.code, 1, none.out);
    assert.match(none.out, /cần mốc git/);
    assert.equal(lint(t.dir, ['--base', base, '--rule', 'agent-format-cochange']).code, 0);
    assert.equal(lint(t.dir, ['--base', 'khong-co-ref-nay', '--rule', 'agent-format-cochange']).code, 1);
    const viaEnv = spawnSync(process.execPath, [RUNNER, '--rule', 'agent-format-cochange'], { cwd: t.dir, encoding: 'utf8', env: { ...process.env, LINT_BASE: base, CCODING_BASE_REF: '' }, windowsHide: true });
    assert.equal(viaEnv.status, 0, viaEnv.stdout + viaEnv.stderr);
  } finally {
    t.cleanup();
  }
});

test('lint: chạy đủ rule không mốc ⇒ exit 1 (rule needsBase không được bỏ qua)', () => {
  const t = tempRepo();
  try {
    write(t.dir, 'package.json', pkg({ yaml: '^2.0.0' }));
    writeEntries(t.dir, 'allow', []);
    writeEntries(t.dir, 'baseline', []);
    t.commit('init');
    const r = lint(t.dir, []);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /\[agent-format-cochange\]/);
  } finally {
    t.cleanup();
  }
});

test('lint: tùy chọn lạ hoặc rule không tồn tại ⇒ không xanh', () => {
  const t = tempRepo();
  try {
    write(t.dir, 'package.json', pkg({ yaml: '^2.0.0' }));
    writeEntries(t.dir, 'allow', []);
    writeEntries(t.dir, 'baseline', []);
    t.commit('init');
    assert.notEqual(lint(t.dir, ['--warn-only']).code, 0);
    assert.notEqual(lint(t.dir, ['--rule', 'khong-co']).code, 0);
  } finally {
    t.cleanup();
  }
});

test('agent-format-cochange: đổi src/registry.ts mà không đổi AGENTS-GUIDE/registry.test ⇒ exit 1', () => {
  const t = tempRepo();
  try {
    write(t.dir, 'package.json', pkg({ yaml: '^2.0.0' }));
    write(t.dir, 'src/registry.ts', 'export const v = 1;\n');
    write(t.dir, 'docs/AGENTS-GUIDE.md', '# guide\n');
    write(t.dir, 'test/registry.test.ts', '// test\n');
    writeEntries(t.dir, 'allow', []);
    writeEntries(t.dir, 'baseline', []);
    const base = t.commit('base');
    write(t.dir, 'src/registry.ts', 'export const v = 2;\n');
    const only = lint(t.dir, ['--rule', 'agent-format-cochange', '--base', base]);
    assert.equal(only.code, 1, only.out);
    assert.match(only.out, /docs\/AGENTS-GUIDE\.md/);
    assert.match(only.out, /test\/registry\.test\.ts/);
    write(t.dir, 'docs/AGENTS-GUIDE.md', '# guide\nđổi\n');
    const half = lint(t.dir, ['--rule', 'agent-format-cochange', '--base', base]);
    assert.equal(half.code, 1, half.out);
    write(t.dir, 'test/registry.test.ts', '// test đổi\n');
    assert.equal(lint(t.dir, ['--rule', 'agent-format-cochange', '--base', base]).code, 0);
  } finally {
    t.cleanup();
  }
});

test('lint: không truyền mốc, nhánh có upstream ⇒ tự tìm mốc, in nguồn @{upstream}, không lỗi mốc', () => {
  const t = tempRepo();
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-lint-remote-'));
  try {
    git(remote, 'init', '-q', '--bare');
    write(t.dir, 'package.json', pkg({ yaml: '^2.0.0' }));
    writeEntries(t.dir, 'allow', []);
    writeEntries(t.dir, 'baseline', []);
    const first = t.commit('init');
    git(t.dir, 'remote', 'add', 'upstream-tmp', remote);
    const branch = git(t.dir, 'rev-parse', '--abbrev-ref', 'HEAD');
    git(t.dir, 'push', '-q', 'upstream-tmp', `HEAD:refs/heads/${branch}`);
    git(t.dir, 'fetch', '-q', 'upstream-tmp');
    git(t.dir, 'branch', `--set-upstream-to=upstream-tmp/${branch}`);
    write(t.dir, 'note.txt', 'sau mốc\n');
    t.commit('tiếp');
    const r = lint(t.dir, ['--rule', 'agent-format-cochange']);
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, /cần mốc git/);
    assert.match(r.out, /nguồn: merge-base HEAD với @\{upstream\}/);
    assert.ok(r.out.includes(first.slice(0, 7)), r.out);
    const j = JSON.parse(lint(t.dir, ['--rule', 'agent-format-cochange', '--json']).out) as { baseSource: string };
    assert.match(j.baseSource, /@\{upstream\}/);
  } finally {
    t.cleanup();
    fs.rmSync(remote, { recursive: true, force: true });
  }
});

test('lint: không mốc, không upstream, không origin/main ⇒ exit 1 và liệt kê các nguồn đã thử', () => {
  const t = tempRepo();
  try {
    write(t.dir, 'package.json', pkg({ yaml: '^2.0.0' }));
    writeEntries(t.dir, 'allow', []);
    writeEntries(t.dir, 'baseline', []);
    t.commit('init');
    const r = lint(t.dir, ['--rule', 'agent-format-cochange']);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /cần mốc git/);
    assert.match(r.out, /Đã thử: --base, LINT_BASE, CCODING_BASE_REF, @\{upstream\}[^,]*, origin\/main/);
  } finally {
    t.cleanup();
  }
});

test('lint: tệp test vi phạm chưa git add vẫn bị quét ⇒ exit 1; tệp bị .gitignore thì không', () => {
  const t = tempRepo();
  try {
    write(t.dir, 'package.json', pkg({ yaml: '^2.0.0' }));
    writeEntries(t.dir, 'allow', []);
    writeEntries(t.dir, 'baseline', []);
    write(t.dir, '.gitignore', 'ignored/\n');
    t.commit('init');
    const badOnly = `test.${'only'}('a', () => {});\n`; // ghép chuỗi để lint của repo này không bắt chính tệp test
    write(t.dir, 'ignored/x.test.ts', badOnly);
    assert.equal(lint(t.dir, ['--rule', 'no-only']).code, 0);
    write(t.dir, 'test/moi.test.ts', badOnly);
    const r = lint(t.dir, ['--rule', 'no-only']);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /test\/moi\.test\.ts:1/);
  } finally {
    t.cleanup();
  }
});
