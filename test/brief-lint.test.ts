import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../src/config.js';
import { NEEDS_CMD_RE } from '../src/plan-gate.js';

const RUNNER = path.join(ROOT, 'scripts', 'lint', 'run.mjs');

function write(dir: string, rel: string, content: string): void {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content, 'utf8');
}

function agent(id: string, dept: string, tools: string): string {
  return `---\nid: ${id}\ndepartment: ${dept}\ntools: [${tools}]\n---\n# ${id}\n`;
}

/** Repo git tạm: dùng đúng src/plan-gate.ts của repo (rule nạp mã thật, không chép), hồ sơ agent giả. */
function setup(briefBody: string, name = 'BRIEF-T1.md'): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-brief-'));
  const git = (...a: string[]): void => {
    const r = spawnSync('git', a, { cwd: dir, encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0, r.stderr);
  };
  git('init', '-q');
  git('config', 'user.email', 'lint@example.invalid');
  git('config', 'user.name', 'lint');
  git('config', 'commit.gpgsign', 'false');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src', 'plan-gate.ts'), path.join(dir, 'src', 'plan-gate.ts'));
  write(dir, 'agents/research/peer-reviewer.md', agent('peer-reviewer', 'research', 'Read, Glob, Grep, WebSearch, WebFetch'));
  write(dir, 'agents/research/data-scientist.md', agent('data-scientist', 'research', 'Read, Glob, Grep, Write, Edit, Bash'));
  write(dir, 'agents/dev/devops.md', agent('devops', 'dev', 'Read, Write, Edit, Glob, Grep, Bash'));
  write(dir, 'scripts/lint/allow.json', '{ "entries": [] }\n');
  write(dir, 'scripts/lint/baseline.json', '{ "entries": [] }\n');
  write(dir, `docs/research/${name}`, briefBody);
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function lint(dir: string): { code: number | null; out: string } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.LINT_BASE;
  delete env.CCODING_BASE_REF;
  const r = spawnSync(process.execPath, [RUNNER, '--rule', 'brief-lint'], { cwd: dir, encoding: 'utf8', env, windowsHide: true });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const HEAD = '# Phòng Nghiên cứu, gói T: thử\n\n**Gói nhỏ: 1 hạng mục. Ngân sách 2M token.** Giao 14/11/2026.\n\n**Phạm vi:**\n- Được sửa: `docs/research/`.\n- Dữ liệu: **Nội bộ**.\n\n';

test('NEEDS_CMD_RE được export và nhận ra "chạy lệnh"', () => {
  assert.equal(NEEDS_CMD_RE.test('- Chạy lệnh kiểm tra'), true);
  assert.equal(NEEDS_CMD_RE.test('- Đọc đầu ra đã lưu'), false);
});

test('brief-lint: đề bài đúng ⇒ exit 0', () => {
  const t = setup(`${HEAD}**K1 — data-scientist: chạy lệnh kiểm tra**\n- Chạy lệnh \`node --test\`.\n\n**K2 — peer-reviewer: phản biện (chỉ đọc)**\n- Đọc đầu ra đã lưu.\n`);
  try {
    const r = lint(t.dir);
    assert.equal(r.code, 0, r.out);
  } finally {
    t.cleanup();
  }
});

test('brief-lint: vai chỉ đọc bị đòi chạy lệnh (mẫu BRIEF-22c lần 1) ⇒ exit 1', () => {
  const t = setup(`${HEAD}**K1 — peer-reviewer: phản biện lại**\n- Chạy lệnh \`node docs/research/scripts/logic-map-check.mjs --strict\` và ghi kết quả.\n`);
  try {
    const r = lint(t.dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /K1: vai peer-reviewer không có công cụ chạy lệnh/);
    assert.match(r.out, /đề bài BRIEF-T1\.md/);
  } finally {
    t.cleanup();
  }
});

test('brief-lint: đề bài có câu phủ định cho vai chỉ đọc ("không cần chạy lệnh") ⇒ exit 0', () => {
  const t = setup(`${HEAD}**K1 — peer-reviewer: phản biện (chỉ đọc)**
- Chỉ đọc và ghi tệp, không cần chạy lệnh. Đọc mã bằng read_file.
`);
  try {
    const r = lint(t.dir);
    assert.equal(r.code, 0, r.out);
  } finally {
    t.cleanup();
  }
});

test('brief-lint: vai không có trong agents/<phòng>/ ⇒ exit 1', () => {
  const t = setup(`${HEAD}**K1 — dev-backend: làm việc**\n- Đọc tệp.\n`);
  try {
    const r = lint(t.dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /vai "dev-backend" không có trong agents\/research\//);
  } finally {
    t.cleanup();
  }
});

test('brief-lint: vai một từ phải viết @vai; K ghi hai vai bị từ chối', () => {
  const t = setup(`${HEAD}**K1 — devops: CI**\n- Đọc tệp.\n\n**K2 — data-scientist, peer-reviewer: gộp**\n- Đọc tệp.\n`);
  try {
    const r = lint(t.dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /K1: briefItems\(\) không nhận ra vai/);
    assert.match(r.out, /K2: ghi 2 vai/);
  } finally {
    t.cleanup();
  }
});

test('brief-lint: thiếu Phạm vi, nhãn dữ liệu, ngân sách, hạng mục K ⇒ exit 1', () => {
  const t = setup('# Phòng Nghiên cứu, gói T: thử\n\nKhông có gì cả.\n');
  try {
    const r = lint(t.dir);
    assert.equal(r.code, 1, r.out);
    for (const re of [/không có hạng mục K nào/, /thiếu \*\*Phạm vi:\*\*/, /thiếu dòng "Dữ liệu:"/, /thiếu dòng ngân sách/]) assert.match(r.out, re);
  } finally {
    t.cleanup();
  }
});

test('brief-lint: dòng Dữ liệu có hai nhãn ⇒ exit 1; ngoại lệ allow.json theo neo ⇒ exit 0', () => {
  const body = `${HEAD.replace('Dữ liệu: **Nội bộ**', 'Dữ liệu: **Nội bộ** hoặc Công khai')}**K1 — data-scientist: việc**\n- Đọc tệp.\n`;
  const t = setup(body);
  try {
    const r = lint(t.dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /đúng một nhãn/);
    write(t.dir, 'scripts/lint/allow.json', `${JSON.stringify({ entries: [{ rule: 'brief-lint', file: 'docs/research/BRIEF-T1.md', anchor: '(đề bài BRIEF-T1.md)', reason: 'thử', by: 'test' }] })}\n`);
    spawnSync('git', ['add', '-A'], { cwd: t.dir });
    const r2 = lint(t.dir);
    assert.equal(r2.code, 0, r2.out);
  } finally {
    t.cleanup();
  }
});
