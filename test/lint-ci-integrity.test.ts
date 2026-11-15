import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../src/config.js';

const RUNNER = path.join(ROOT, 'scripts', 'lint', 'run.mjs');
const CI_REAL = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

/** Repo git tạm chứa bản sao ci.yml thật đã chỉnh dòng timeout-minutes (null = xóa khóa). */
function lintWith(timeout: string | null): { code: number | null; out: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-ci-lint-'));
  try {
    const yml = CI_REAL.replace(/^[ \t]*timeout-minutes:.*\r?\n/m, timeout === null ? '' : `    timeout-minutes: ${timeout}\n`);
    const w = (rel: string, c: string): void => {
      const f = path.join(dir, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, c, 'utf8');
    };
    w('.github/workflows/ci.yml', yml);
    w('scripts/lint/allow.json', '{ "entries": [] }\n');
    w('scripts/lint/baseline.json', '{ "entries": [] }\n');
    const git = (...a: string[]): void => {
      const r = spawnSync('git', a, { cwd: dir, encoding: 'utf8', windowsHide: true });
      assert.equal(r.status, 0, r.stderr);
    };
    git('init', '-q');
    git('add', '-A');
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.LINT_BASE;
    delete env.CCODING_BASE_REF;
    const r = spawnSync(process.execPath, [RUNNER, '--rule', 'ci-integrity'], { cwd: dir, encoding: 'utf8', env, windowsHide: true });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('ci-integrity: ci.yml thật có timeout-minutes hợp lệ ⇒ xanh', () => {
  assert.match(CI_REAL, /^\s*timeout-minutes:\s*\d+\s*$/m);
  const r = lintWith('20');
  assert.equal(r.code, 0, r.out);
});

test('ci-integrity: thiếu timeout-minutes ⇒ đỏ', () => {
  const r = lintWith(null);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /thiếu timeout-minutes/);
});

test('ci-integrity: timeout-minutes vượt trần 120 ⇒ đỏ', () => {
  const r = lintWith('121');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /vượt trần 120/);
  assert.equal(lintWith('120').code, 0);
});

test('ci-integrity: timeout-minutes không phải số nguyên dương ⇒ đỏ', () => {
  for (const v of ['"20"', 'abc', '0', '-5', '2.5']) {
    const r = lintWith(v);
    assert.equal(r.code, 1, `${v}: ${r.out}`);
    assert.match(r.out, /phải là số nguyên dương/, v);
  }
});
