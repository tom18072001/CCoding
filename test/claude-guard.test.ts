import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { guardDecision } from '../src/tools/claude-guard.js';

const root = path.resolve('workspaces/nd57/wt-demo');
const cfg = { root, deny: ['\\bdocker\\b', '\\bmigrate\\s+(dev|reset|deploy)\\b'], allowGitCommit: true };

test('claude-guard: chặn lệnh khớp denyCommands của dự án', () => {
  assert.match(guardDecision({ tool_name: 'Bash', tool_input: { command: 'docker ps' } }, cfg) ?? '', /chặn/);
  assert.match(guardDecision({ tool_name: 'Bash', tool_input: { command: 'npx prisma migrate deploy' } }, cfg) ?? '', /chặn/);
  assert.equal(guardDecision({ tool_name: 'Bash', tool_input: { command: 'cd app/server && npm test' } }, cfg), undefined);
});

test('claude-guard: không cho tạo/chuyển nhánh, push; cho xem nhánh hiện tại và commit trong worktree', () => {
  for (const c of ['git checkout -b x', 'git switch main', 'git push origin HEAD', 'git branch feat-x', 'git reset --hard HEAD~1']) {
    assert.ok(guardDecision({ tool_name: 'Bash', tool_input: { command: c } }, cfg), c);
  }
  assert.equal(guardDecision({ tool_name: 'Bash', tool_input: { command: 'git branch --show-current' } }, cfg), undefined);
  assert.equal(guardDecision({ tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' } }, cfg), undefined);
  assert.ok(guardDecision({ tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' } }, { ...cfg, allowGitCommit: false }));
});

test('claude-guard: tệp phải nằm trong thư mục làm việc, không đụng .env', () => {
  assert.equal(guardDecision({ tool_name: 'Edit', tool_input: { file_path: path.join(root, 'app/server/src/a.js') } }, cfg), undefined);
  assert.equal(guardDecision({ tool_name: 'Read', tool_input: { file_path: 'app/server/.env.example' } }, cfg), undefined);
  assert.ok(guardDecision({ tool_name: 'Read', tool_input: { file_path: path.resolve(root, '../../../../workhub/.env') } }, cfg));
  assert.ok(guardDecision({ tool_name: 'Read', tool_input: { file_path: path.join(root, 'app/server/.env') } }, cfg));
  assert.ok(guardDecision({ tool_name: 'Grep', tool_input: { path: 'C:/Users/admin' } }, cfg));
  assert.ok(guardDecision({ tool_name: 'Bash', tool_input: { command: 'cat app/server/.env' } }, cfg));
});
