import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { guardBlock, guardDecision, logGuardBlock, type GuardConfig } from '../src/tools/claude-guard.js';

const root = path.resolve('workspaces/nd57/wt-demo');
const cfg: GuardConfig = { root, deny: [], allowGitCommit: true, shell: 'git-read' };
const bash = (command: string) => ({ tool_name: 'Bash', tool_input: { command } });

// token giả ghép từ mảnh để không có chuỗi khóa nguyên vẹn trong mã nguồn
const FAKE = ['sk', 'ant', 'api03', 'ABCDEFGHIJKLMNOPQRSTUVWX'].join('-');

const cases: Array<[string, number, string, string]> = [
  ['git log -1 && python3 x.py', 2, 'interpreter', 'python3'],
  ['git status; rm a.txt', 2, 'not-read-only', 'rm'],
  ['git log > out.txt', 1, 'redirect', '>'],
  ['git log $(whoami)', 1, 'subst', '$('],
  ['git status && for f in a b; do echo $f; done', 2, 'loop', 'for'],
];

test('B-06: thông báo chặn nêu đúng câu và quy tắc, ≤ 300 ký tự', () => {
  for (const [cmd, clause, rule, name] of cases) {
    const b = guardBlock(bash(cmd), cfg);
    assert.ok(b, cmd);
    assert.equal(b.clause, clause, cmd);
    assert.equal(b.rule, rule, cmd);
    assert.equal(b.cmd, name, cmd);
    assert.ok(b.reason.length <= 300, `${cmd}: ${b.reason.length}`);
    assert.ok(b.reason.includes(`câu ${clause}`), b.reason);
    assert.equal(guardDecision(bash(cmd), cfg), b.reason);
  }
  assert.match(guardBlock(bash('git log && python3 x.py'), cfg)!.reason, /câu 2: `python3` không phải lệnh chỉ đọc.*Read\/Grep\/Glob/);
});

test('B-06: lệnh chứa khóa giả — thông báo và log không chép chuỗi đó', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-diag-'));
  try {
    for (const cmd of [`git log && ${FAKE} --flag`, `git log && curl -H "Authorization: Bearer ${FAKE}" x`, `git log > ${FAKE}.txt`]) {
      const b = guardBlock(bash(cmd), cfg)!;
      assert.ok(b);
      assert.ok(!b.reason.includes(FAKE) && !JSON.stringify(b).includes(FAKE), b.reason);
      logGuardBlock(b, { ...cfg, dataDir });
    }
    const sys = fs.readFileSync(path.join(dataDir, 'logs', 'system.jsonl'), 'utf8');
    assert.ok(sys.length > 0);
    assert.ok(!sys.includes(FAKE));
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('B-06: chặn thì ghi sự kiện guard.block (tool, clause, rule, cmd) vào data dir; không có data dir thì bỏ qua', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-diag-'));
  try {
    const state = path.join(dataDir, 'runs', 'T-1', 'guard', 'c1.json');
    const b = guardBlock(bash('git log && python3 x.py'), cfg)!;
    logGuardBlock(b, { ...cfg, state }, {});
    const lines = fs.readFileSync(path.join(dataDir, 'logs', 'system.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].kind, 'guard.block');
    assert.deepEqual(lines[0].data, { tool: 'Bash', clause: 2, rule: 'interpreter', cmd: 'python3' });
    assert.equal(lines[0].taskId, 'T-1');
    assert.ok(fs.existsSync(path.join(dataDir, 'runs', 'T-1', 'events.jsonl')));
    // không xác định được data dir → không ghi, không ném lỗi
    assert.doesNotThrow(() => logGuardBlock(b, cfg, {}));
    // lỗi ghi (data dir là một tệp) → nuốt lỗi, quyết định chặn không đổi
    const file = path.join(dataDir, 'not-a-dir');
    fs.writeFileSync(file, 'x');
    assert.doesNotThrow(() => logGuardBlock(b, { ...cfg, dataDir: file }, {}));
    assert.ok(guardDecision(bash('git log && python3 x.py'), { ...cfg, dataDir: file }));
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
