import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRateLimit } from '../lib/infra.mjs';

test('JSON 429 usage_limit_reached', () => {
  const j = '{"type":"result","is_error":true,"result":"API Error: 429 {\\"error\\":{\\"type\\":\\"usage_limit_reached\\"}}"}';
  assert.equal(detectRateLimit(j).rateLimited, true);
  assert.equal(detectRateLimit({ is_error: true, status: 429, error: { type: 'usage_limit_reached' } }).rateLimited, true);
  assert.equal(detectRateLimit('{"status":429}').rateLimited, true);
});

test('thông báo 5-hour limit lấy resetsAt thô', () => {
  const r = detectRateLimit("You've hit your 5-hour limit · resets 4:50pm");
  assert.deepEqual(r, { rateLimited: true, resetsAt: '4:50pm' });
  assert.equal(detectRateLimit("You've hit your 5-hour limit").resetsAt, undefined);
});

test('attention của task CCoding', () => {
  const attention = { reason: 'checks', detail: 'runtime: HTTP 429 usage_limit_reached — You\'ve hit your 5-hour limit · resets 4:50pm', at: 'x' };
  assert.deepEqual(detectRateLimit(attention), { rateLimited: true, resetsAt: '4:50pm' });
});

test('âm tính: chữ "rate limit" đứng một mình không bị báo', () => {
  assert.equal(detectRateLimit('Đã thêm rate limit middleware cho API, 100 request/phút').rateLimited, false);
  assert.equal(detectRateLimit('const rateLimit = require("express-rate-limit"); // rate limit 429 handler').rateLimited, false);
  assert.equal(detectRateLimit('').rateLimited, false);
  assert.equal(detectRateLimit(undefined).rateLimited, false);
  assert.equal(detectRateLimit({ status: 'done', n: 4290 }).rateLimited, false);
});
