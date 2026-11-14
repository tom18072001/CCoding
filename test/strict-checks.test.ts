import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { templateHeadings } from '../src/kpi.js';
import { classifyChecks, lintGuardPaths, reviewerReasons } from '../src/quality-gate.js';
import type { CheckResult } from '../src/types.js';
import { testApp } from './helpers.js';

// K5 — strictChecks, CCODING_BASE_REF, reviewer bắt buộc khi diff chạm tệp ngoại lệ/khóa của lint-CI.
// LLM là runtime giả (mock); lệnh kiểm của dự án là lệnh node thật. CCODING_CONFIG được cô lập để không phụ thuộc máy.

const GREEN = 'node -e "process.exit(0)"';
const RED = 'node -e "process.exit(1)"';
const WRITE_REF = `node -e "require('fs').writeFileSync('ref.txt', process.env.CCODING_BASE_REF || '')"`;
const rm = (p: string) => fs.rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });

/** Cô lập CCODING_CONFIG: trỏ tới tệp cấu hình rỗng trong thư mục tạm, trả hàm khôi phục. */
function isolateConfig(): () => void {
  const prev = process.env.CCODING_CONFIG;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-k5cfg-'));
  const file = path.join(dir, 'empty.yaml');
  fs.writeFileSync(file, '{}\n');
  process.env.CCODING_CONFIG = file;
  return () => {
    if (prev === undefined) delete process.env.CCODING_CONFIG;
    else process.env.CCODING_CONFIG = prev;
    rm(dir);
  };
}

function setup(cmd: string, strictChecks: boolean | undefined) {
  const restore = isolateConfig();
  const a = testApp();
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'), 'ccoding-k5-'));
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"x","private":true}\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  a.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: repo, classification: 'internal', toolAccess: 'exec', checkCommands: [cmd], strictChecks, createdAt: new Date().toISOString() });
  return Object.assign(a, { cleanupAll: () => { a.cleanup(); rm(dir); restore(); } });
}

type Orch = { call: (...x: unknown[]) => Promise<{ text: string }> };

/** Bàn giao execute đúng "Mẫu đầu ra"; tùy chọn ghi thêm một tệp vào worktree khi execute (mô phỏng agent sửa tệp). */
function fakeExecute(a: { orchestrator: unknown }, writeFile?: string): void {
  const orch = a.orchestrator as Orch;
  const orig = orch.call.bind(orch);
  orch.call = async (agent, phase, build, ctx) => {
    const r = await orig(agent, phase, build, ctx);
    if (phase === 'execute') {
      r.text = templateHeadings((agent as { body: string }).body).map((h) => `## ${h}\nNội dung thật cho mục này.`).join('\n');
      const cwd = (ctx as { cwd?: string }).cwd;
      if (writeFile && cwd) {
        fs.mkdirSync(path.dirname(path.join(cwd, writeFile)), { recursive: true });
        fs.writeFileSync(path.join(cwd, writeFile), '{"entries":[]}\n');
      }
    }
    return r;
  };
}

const phases = (a: ReturnType<typeof setup>, id: string) => a.usage.all({ task: id }).map((c) => c.phase);

const red = (command: string): CheckResult => ({ command, code: 1, ok: false, ms: 1, summary: 'lỗi', tail: '' });

test('K5 classifyChecks: strict đổi red-unrelated thành red-required; tắt thì giữ hành vi cũ', () => {
  const before = [red('npm test')];
  const now = [red('npm test')];
  assert.equal(classifyChecks(before, now, 'việc khác', ['npm test'])[0].cls, 'red-unrelated');
  assert.equal(classifyChecks(before, now, 'việc khác', ['npm test'], false)[0].cls, 'red-unrelated');
  assert.equal(classifyChecks(before, now, 'việc khác', ['npm test'], true)[0].cls, 'red-required');
  const denied = [{ ...red('npm test'), code: null, denied: 'bị cấm' }];
  assert.equal(classifyChecks(before, denied, 'việc khác', ['npm test'], true)[0].cls, 'red-required');
  assert.equal(classifyChecks(before, [{ ...red('npm test'), ok: true, code: 0 }], 'x', ['npm test'], true)[0].cls, 'green');
});

test('K5 lintGuardPaths/reviewerReasons: năm nhóm tệp ngoại lệ/khóa bắt buộc reviewer', () => {
  const files = ['scripts/lint/allow.json', 'scripts\\lint\\baseline.json', 'scripts/lint/overclaim.json', '.github/workflows/ci.yml', 'docs/research/preregistration.lock.json', 'src/a.ts'];
  assert.deepEqual(lintGuardPaths(files), files.slice(0, 5).map((f) => f.replaceAll('\\', '/')));
  assert.deepEqual(lintGuardPaths(['src/a.ts', 'scripts/lint/run.mjs']), []);
  const need = (changedFiles: string[]) => reviewerReasons({ hasCheckCommands: true, changedFiles, classes: ['green'] });
  assert.ok(need(['scripts/lint/allow.json']).some((r) => r.includes('lint-CI')));
  assert.deepEqual(need(['src/a.ts']), []);
});

test('K5: strictChecks bật, đỏ từ mốc → không done, không gọi CTO, biên bản "Chưa nghiệm thu: còn đỏ"', async () => {
  const a = setup(RED, true);
  fakeExecute(a);
  try {
    // đề bài không nhắc lệnh: trước đây là red-unrelated (không vòng sửa), nay là bắt buộc
    const t = a.orchestrator.submit({ brief: 'Thêm hàm cộng vào src/a.js', projectId: 'repo', options: { lane: 'full', review: false, discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.notEqual(done.status, 'done');
    assert.equal(done.status, 'failed');
    assert.equal(phases(a, t.id).includes('accept'), false, 'không gọi CTO');
    assert.equal(done.acceptance?.accepted, false);
    assert.ok(done.acceptance?.summary.startsWith('Chưa nghiệm thu: còn đỏ'), done.acceptance?.summary);
    assert.ok(done.acceptance?.summary.includes(RED));
    const rel = done.acceptance?.path ?? '';
    const body = fs.readFileSync(path.join(a.store.runDir(t.id), rel), 'utf8');
    assert.ok(body.includes('Đầu ra cuối của lệnh đỏ'));
    assert.ok(body.includes('exit 1'));
    assert.ok(a.logs.query({ task: t.id }).some((e) => e.kind === 'gate.fix'), 'có vòng sửa theo kiểm tra');
  } finally {
    a.cleanupAll();
  }
});

test('K5: strictChecks tắt → hành vi cũ (đỏ không liên quan đề bài vẫn done, CTO vẫn nghiệm thu)', async () => {
  for (const flag of [false, undefined]) {
    const a = setup(RED, flag);
    fakeExecute(a);
    try {
      const t = a.orchestrator.submit({ brief: 'Thêm hàm cộng vào src/a.js', projectId: 'repo', options: { lane: 'full', review: false, discussionRounds: 0 } });
      const done = await a.orchestrator.waitFor(t.id);
      assert.equal(done.status, 'done', done.error);
      assert.equal(phases(a, t.id).includes('accept'), true, 'CTO vẫn nghiệm thu');
      assert.equal(a.logs.query({ task: t.id }).filter((e) => e.kind === 'gate.fix').length, 0, 'không ép vòng sửa');
      assert.ok(!done.acceptance?.summary.startsWith('Chưa nghiệm thu: còn đỏ'));
    } finally {
      a.cleanupAll();
    }
  }
});

test('K5: diff chạm scripts/lint/allow.json → bắt buộc reviewer; diff thường thì không', async () => {
  const withGuard = setup(GREEN, undefined);
  fakeExecute(withGuard, 'scripts/lint/allow.json');
  try {
    const t = withGuard.orchestrator.submit({ brief: 'Cập nhật ngoại lệ lint', projectId: 'repo', options: { lane: 'fast', review: false, discussionRounds: 0 } });
    const done = await withGuard.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const dec = withGuard.logs.query({ task: t.id }).filter((e) => e.kind === 'gate.review').map((e) => e.data as { decision?: string; reasons?: string[] });
    assert.equal(dec.at(-1)?.decision, 'no-reviewer', 'cổng đòi reviewer');
    assert.ok(dec.at(-1)?.reasons?.some((r) => r.includes('scripts/lint/allow.json')), JSON.stringify(dec));
  } finally {
    withGuard.cleanupAll();
  }
  const plain = setup(GREEN, undefined);
  fakeExecute(plain, 'src/b.js');
  try {
    const t = plain.orchestrator.submit({ brief: 'Thêm src/b.js', projectId: 'repo', options: { lane: 'fast', review: false, discussionRounds: 0 } });
    const done = await plain.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const dec = plain.logs.query({ task: t.id }).filter((e) => e.kind === 'gate.review').map((e) => e.data as { decision?: string });
    assert.equal(dec.at(-1)?.decision, 'skip-reviewer', 'đối chứng: không bắt buộc reviewer');
  } finally {
    plain.cleanupAll();
  }
});

test('K5: lệnh kiểm tra nhận CCODING_BASE_REF bằng mốc của nhiệm vụ', async () => {
  const a = setup(WRITE_REF, undefined);
  fakeExecute(a);
  try {
    const t = a.orchestrator.submit({ brief: 'Thêm hàm cộng vào src/a.js', projectId: 'repo', options: { lane: 'fast', review: false, discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.ok(done.baseRef && /^[0-9a-f]{7,40}$/.test(done.baseRef), `task.baseRef = ${done.baseRef}`);
    const ref = fs.readFileSync(path.join(done.workspace ?? '', 'ref.txt'), 'utf8');
    assert.equal(ref, done.baseRef);
  } finally {
    a.cleanupAll();
  }
});
