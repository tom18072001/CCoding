'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine, compile, aggregate } = require('../src');

test('parse JSON và logfmt', () => {
  assert.deepEqual(parseLine('{"level":"error","msg":"boom"}'), { ok: true, record: { level: 'error', msg: 'boom' } });
  assert.deepEqual(parseLine('level=info status=200'), { ok: true, record: { level: 'info', status: 200 } });
});

test('truy vấn cơ bản', () => {
  const q = compile('level:error AND status>=500');
  assert.equal(q({ level: 'ERROR', status: 503 }), true);
  assert.equal(q({ level: 'error', status: 404 }), false);
});

test('tổng hợp count by', () => {
  assert.deepEqual(aggregate([{ s: 'a' }, { s: 'b' }, { s: 'a' }], 'count by s'), { type: 'count_by', field: 's', buckets: [{ key: 'a', count: 2 }, { key: 'b', count: 1 }] });
});
