// Sửa lỗi rà soát trước W2: nhận nhầm hạn mức từ nội dung bài, chấm TAP khi không có dòng tổng kết, dòng tổng kết giả.
import test from 'node:test';
import assert from 'node:assert/strict';
import { callErrors } from '../lib/ccoding.mjs';
import { detectRateLimit } from '../lib/infra.mjs';
import { tapScore } from '../lib/grade.mjs';

test('calls.jsonl: nội dung agent viết có "status=429" không bị coi là hạn mức', () => {
  const lines = [
    { phase: 'execute', text: 'Đã thêm test: dòng `GET /api status=429 1200ms` phải được đếm là lỗi; "status":429 cũng vậy', tools: [{ name: 'write_file', input: 'HTTP 429 error' }], attempts: [] },
    { phase: 'review', text: 'error handling ok', attempts: [] },
  ].map((x) => JSON.stringify(x)).join('\n');
  assert.deepEqual(callErrors(lines), []);
  assert.equal(detectRateLimit([undefined, undefined, callErrors(lines)]).rateLimited, false);
});

test('calls.jsonl: lỗi runtime 429 thật vẫn được nhận', () => {
  const lines = [
    JSON.stringify({ phase: 'execute', text: '', error: 'API Error: 429 {"error":{"type":"usage_limit_reached"}}', errorKind: 'rate-limit' }),
    'không phải json',
  ].join('\n');
  assert.equal(callErrors(lines).length, 1);
  assert.equal(detectRateLimit(callErrors(lines)).rateLimited, true);
});

test('TAP: lấy dòng tổng kết cuối, bỏ qua "# pass" do mã được chấm in ra', () => {
  const out = ['# pass 50', 'ok 1 - a', 'not ok 2 - b', '1..2', '# tests 2', '# pass 1', '# fail 1', '# cancelled 0'].join('\n');
  const r = tapScore(out);
  assert.equal(r.details.passed, 1); assert.equal(r.details.total, 2); assert.equal(r.score, 0.5); assert.equal(r.pass, false);
  assert.deepEqual(r.details.failed, ['b']);
});

test('TAP: không có dòng tổng kết (bị giết) thì đếm từng test, không cho đạt', () => {
  const out = ['TAP version 13', '# Subtest: x', '    ok 1 - t1', '    ok 2 - t2', '    not ok 3 - t3'].join('\n');
  const r = tapScore(out);
  assert.equal(r.details.passed, 2); assert.equal(r.details.total, 3); assert.equal(r.pass, false); assert.equal(r.details.noSummary, true);
});

test('TAP: test bị hủy (timeout) tính là trượt', () => {
  const r = tapScore(['# tests 3', '# pass 2', '# fail 0', '# cancelled 1'].join('\n'));
  assert.equal(r.score, 2 / 3); assert.equal(r.pass, false);
});
