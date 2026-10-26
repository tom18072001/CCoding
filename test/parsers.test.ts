import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeStreamParser } from '../src/runtimes/claude-cli.js';
import { CodexParser, GenericJsonParser } from '../src/runtimes/cli-agents.js';
import { estimateTokens } from '../src/util/tokens.js';

test('ClaudeStreamParser lấy kết quả, usage và chi phí từ stream-json', () => {
  const acts: string[] = [];
  const p = new ClaudeStreamParser({ onActivity: (a) => acts.push(a) });
  const lines = [
    { type: 'system', subtype: 'init', model: 'claude-sonnet-5-5' },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }], usage: { input_tokens: 100, output_tokens: 10 } } },
    { type: 'assistant', message: { content: [{ type: 'text', text: '## Tóm tắt\nXong' }], usage: { input_tokens: 150, output_tokens: 40 } } },
    { type: 'result', subtype: 'success', result: '## Tóm tắt\nXong', total_cost_usd: 0.0123, usage: { input_tokens: 250, output_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 30 }, modelUsage: { 'claude-sonnet-5-5': {} } },
  ];
  for (const l of lines) p.feed(JSON.stringify(l));
  assert.equal(p.resultText, '## Tóm tắt\nXong');
  assert.deepEqual(p.finalUsage(), { input_tokens: 250, output_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 30 });
  assert.equal(p.costUsd, 0.0123);
  assert.equal(acts[0], 'Bash: npm test');
});

test('ClaudeStreamParser cộng usage theo lượt khi thiếu result', () => {
  const p = new ClaudeStreamParser();
  p.feed(JSON.stringify({ type: 'assistant', message: { content: [], usage: { input_tokens: 10, output_tokens: 2 } } }));
  p.feed(JSON.stringify({ type: 'assistant', message: { content: [], usage: { input_tokens: 5, output_tokens: 3 } } }));
  assert.deepEqual(p.finalUsage(), { input_tokens: 15, output_tokens: 5 });
});

test('CodexParser đọc agent_message và usage (trừ phần cache)', () => {
  const p = new CodexParser();
  p.feed(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'kết quả' } }));
  p.feed(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1000, cached_input_tokens: 400, output_tokens: 80 } }));
  assert.equal(p.messages.at(-1), 'kết quả');
  assert.equal(p.input, 1000);
  assert.equal(p.cached, 400);
  assert.equal(p.output, 80);
});

test('GenericJsonParser (kimi) đọc tin nhắn assistant', () => {
  const p = new GenericJsonParser();
  p.feed(JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: 'xin chào' }] }));
  p.feed(JSON.stringify({ role: 'assistant', content: 'bản cuối', usage: { prompt_tokens: 12, completion_tokens: 3 } }));
  assert.equal(p.messages.at(-1), 'bản cuối');
  assert.equal(p.input, 12);
  assert.equal(p.output, 3);
});

test('estimateTokens tính tiếng Việt nặng hơn tiếng Anh', () => {
  assert.ok(estimateTokens('Phân tích kiến trúc hệ thống') > estimateTokens('Analyse the system design'));
  assert.equal(estimateTokens(''), 0);
});
