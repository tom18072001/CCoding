import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeStreamParser } from '../src/runtimes/claude-cli.js';

test('ClaudeStreamParser: ghi lượt gọi công cụ theo tên CCoding, kèm lỗi khi bị chặn', () => {
  const p = new ClaudeStreamParser();
  const lines = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'cd app/server && npm test' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ℹ pass 417' }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'Read', input: { file_path: 'C:/Users/admin/workhub/.env' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: 'CCoding chặn: Read ngoài thư mục làm việc' }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't3', name: 'Edit', input: { file_path: 'app/server/src/a.js' } }] } },
  ];
  for (const l of lines) p.feed(JSON.stringify(l));
  assert.deepEqual(p.toolCalls.map((t) => [t.name, t.ok]), [['run_command', true], ['read_file', false], ['edit_file', true]]);
  assert.equal(p.toolCalls[0].args, 'cd app/server && npm test');
  assert.equal(p.toolCalls[0].outputChars, 'ℹ pass 417'.length);
  assert.match(p.toolCalls[1].error ?? '', /CCoding chặn/);
});
