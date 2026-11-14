import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';

// FX4 (D18a/S2): review tắt hoặc không có reviewer, không có lệnh kiểm tra → run.review.skipped + attention + log riêng.

test('FX4 review tắt, không lệnh kiểm tra → run.review.skipped, attention "chưa review", log review.skipped', async () => {
  const a = testApp();
  try {
    const t = a.orchestrator.submit({ brief: 'Viết ghi chú ngắn về quy trình đóng gói', options: { lane: 'full', discussionRounds: 0, review: false } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const rv = done.runs[0].review;
    assert.ok(rv, 'run.review phải có dấu vết');
    assert.equal(rv.skipped, true);
    assert.ok(rv.reason && /review/.test(rv.reason));
    assert.equal(rv.approved, false);
    assert.equal(done.attention?.reason, 'review');
    assert.match(done.attention?.detail ?? '', /chưa review/i);
    const ev = a.logs.query({ task: t.id }).filter((e) => e.kind === 'review.skipped');
    assert.equal(ev.length, 1);
  } finally {
    a.cleanup();
  }
});

test('FX4 review bật và có reviewer → không đánh dấu skipped', async () => {
  const a = testApp();
  try {
    const t = a.orchestrator.submit({ brief: 'Viết ghi chú ngắn về quy trình đóng gói', options: { lane: 'full', discussionRounds: 0, review: true, maxRevisions: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.notEqual(done.runs[0].review?.skipped, true);
    assert.equal(a.logs.query({ task: t.id }).filter((e) => e.kind === 'review.skipped').length, 0);
  } finally {
    a.cleanup();
  }
});
