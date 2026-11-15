// B-14b: runtimes.claude-cli.stablePrefix — một bộ công cụ cho cả nhiệm vụ; hook chặn theo pha (deny-by-default ở pha chỉ đọc).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClaudeArgs, STABLE_TOOLS } from '../src/runtimes/claude-cli.js';
import { guardDecision } from '../src/tools/claude-guard.js';
import type { RunRequest } from '../src/types.js';

const toolsOf: Record<string, string[]> = {
  plan: ['Read', 'Grep', 'Glob'],
  execute: ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'],
  review: ['Read', 'Grep', 'Glob', 'Bash'],
};
function req(phase: string): RunRequest {
  return {
    phase, model: 'sonnet', cwd: 'C:/tmp/x', tools: toolsOf[phase], allowTools: true, timeoutMs: 1000, system: 's', prompt: 'p',
    toolPolicy: { root: 'C:/tmp/x', allow: [], maxTurns: 8, commandTimeoutSec: 10, maxOutputChars: 1000 },
    meta: { taskId: 't', department: 'dev', callId: 'c' },
  } as unknown as RunRequest;
}
const flag = (a: string[], k: string) => a[a.indexOf(k) + 1];
const guardEnv = (r: ReturnType<typeof buildClaudeArgs>) => JSON.parse(r.env.CCODING_GUARD ?? '{}');

test('B-14b: tắt (mặc định) → --tools/--allowedTools theo pha như hiện tại, guard không có trường stable', () => {
  for (const phase of Object.keys(toolsOf)) {
    const off = buildClaudeArgs({}, req(phase), 'm');
    assert.equal(flag(off.args, '--tools'), toolsOf[phase].join(','));
    assert.equal(flag(off.args, '--allowedTools'), toolsOf[phase].join(','));
    assert.equal(guardEnv(off).stablePrefix, undefined);
    assert.equal(guardEnv(off).phase, undefined);
    assert.deepEqual(buildClaudeArgs({ stablePrefix: false }, req(phase), 'm').args, off.args);
  }
});

test('B-14b: bật → bộ công cụ GIỐNG HỆT giữa plan/execute/review; phase + callTools nằm trong CCODING_GUARD', () => {
  const runs = Object.keys(toolsOf).map((p) => buildClaudeArgs({ stablePrefix: true }, req(p), 'm'));
  const sets = runs.map((r) => `${flag(r.args, '--tools')}|${flag(r.args, '--allowedTools')}`);
  assert.equal(new Set(sets).size, 1);
  assert.equal(flag(runs[0].args, '--tools'), STABLE_TOOLS.join(','));
  runs.forEach((r, i) => {
    const g = guardEnv(r);
    const p = Object.keys(toolsOf)[i];
    assert.equal(g.stablePrefix, true);
    assert.equal(g.phase, p);
    assert.deepEqual(g.callTools, toolsOf[p]);
  });
});

const root = 'C:/tmp/x';
const hook = (tool: string, input: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  guardDecision({ tool_name: tool, tool_input: input }, { root, deny: [], allowGitCommit: false, stablePrefix: true, callTools: [...STABLE_TOOLS], ...extra });

const EVIL = ['echo x; rm -rf src', 'echo $(rm -rf src)', 'echo `id`', 'echo hi > a.txt', 'echo hi | tee a.txt', 'sed -i s/a/b/ f.ts', "node -e \"require('fs').writeFileSync('a','b')\"", 'ls', 'git status', 'npm test'];

test('B-14b: pha chỉ đọc (plan/review/synthesize/…) chặn TOÀN BỘ Bash, kể cả lệnh ác ý và lệnh vô hại', () => {
  for (const phase of ['plan', 'review', 'synthesize', 'accept', 'finalize']) {
    for (const c of EVIL) assert.match(hook('Bash', { command: c }, { phase }) ?? '', /chỉ đọc/, `${phase}: ${c}`);
    assert.ok(hook('PowerShell', { command: 'Set-Content a.txt x' }, { phase }), `${phase}: PowerShell`);
  }
});

test('B-14b: pha chỉ đọc chặn Write/Edit/MultiEdit/NotebookEdit; Read/Grep/Glob vẫn được', () => {
  for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) assert.match(hook(tool, { file_path: `${root}/a.ts` }, { phase: 'plan', callTools: [...STABLE_TOOLS, 'NotebookEdit'] }) ?? '', /chỉ đọc/, tool);
  for (const tool of ['Read', 'Grep', 'Glob']) assert.equal(hook(tool, { file_path: `${root}/a.ts` }, { phase: 'plan' }), undefined, tool);
});

test('B-14b: thiếu / sai phase → coi là chỉ đọc (fail-closed)', () => {
  for (const phase of [undefined, '', 'EXECUTE', 'execute ', 'bất-kỳ', 'route']) {
    assert.ok(hook('Bash', { command: 'ls' }, { phase }), `phase=${String(phase)}`);
    assert.ok(hook('Write', { file_path: `${root}/a.ts` }, { phase }), `phase=${String(phase)}`);
  }
});

test('B-14b: pha execute/revise được ghi tệp và chạy Bash (vẫn qua chính sách cũ)', () => {
  for (const phase of ['execute', 'revise']) {
    assert.equal(hook('Write', { file_path: `${root}/a.ts` }, { phase }), undefined);
    assert.equal(hook('Bash', { command: 'npm test' }, { phase }), undefined);
    assert.ok(hook('Bash', { command: 'git push origin HEAD' }, { phase }));
    assert.ok(hook('Write', { file_path: 'C:/Windows/x.txt' }, { phase }));
  }
});

test('B-14b: công cụ ngoài callTools của lượt này bị chặn dù nằm trong bộ cố định (quyền dự án/vai trò)', () => {
  const callTools = ['Read', 'Grep', 'Glob']; // dự án chỉ cho đọc, kể cả ở pha execute
  assert.match(hook('Write', { file_path: `${root}/a.ts` }, { phase: 'execute', callTools }) ?? '', /không được cấp/);
  assert.ok(hook('Bash', { command: 'npm test' }, { phase: 'execute', callTools }));
  assert.ok(hook('WebFetch', { url: 'https://example.com' }, { phase: 'plan', callTools }));
  // thiếu callTools → chỉ công cụ đọc
  assert.ok(hook('Write', { file_path: `${root}/a.ts` }, { phase: 'execute', callTools: undefined }));
  assert.equal(hook('Read', { file_path: `${root}/a.ts` }, { phase: 'execute', callTools: undefined }), undefined);
});

test('B-14b: stablePrefix tắt → hook không đổi hành vi (không có chặn theo pha)', () => {
  const off = { root, deny: [], allowGitCommit: false };
  assert.equal(guardDecision({ tool_name: 'Bash', tool_input: { command: 'ls' } }, { ...off, phase: 'plan' }), undefined);
  assert.equal(guardDecision({ tool_name: 'Write', tool_input: { file_path: `${root}/a.ts` } }, { ...off, phase: 'plan' }), undefined);
});
