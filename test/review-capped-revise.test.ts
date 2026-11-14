import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';

// D6 (D18a/S2): review chạm trần không ra kết luận khi maxRevisions>0 → attention của review vẫn còn sau vòng sửa.
// Reviewer luôn chạm trần mà không trả JSON; sau mỗi lượt sửa attention không được biến mất.

type Orch = { call: (...x: unknown[]) => Promise<{ text: string; capped?: string }> };

test('D6 review chạm trần, maxRevisions=1 → attention review còn nguyên, run.review chưa duyệt', async () => {
  const a = testApp({ reviewRejectRate: 1 });
  const orch = a.orchestrator as unknown as Orch;
  const orig = orch.call.bind(orch);
  let reviews = 0;
  orch.call = async (agent, phase, build, ctx) => {
    const r = await orig(agent, phase, build, ctx);
    // lượt review đầu: mock từ chối kèm lỗi → có vòng sửa; từ lượt hai: chạm trần không có kết luận
    if (phase === 'review' && ++reviews >= 2) {
      r.text = 'Tôi đang kiểm tra các tệp theo đề bài.';
      r.capped = 'turns';
    }
    return r;
  };
  try {
    const t = a.orchestrator.submit({ brief: 'Viết ghi chú ngắn về quy trình đóng gói', department: 'dev', options: { lane: 'full', discussionRounds: 0, review: true, maxRevisions: 1 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.ok(reviews >= 2, 'phải có vòng sửa rồi review lại');
    assert.ok(a.usage.all({ task: t.id }).some((c) => c.phase === 'revise'), 'có lượt sửa');
    const rv = done.runs[0].review;
    assert.ok(rv);
    assert.equal(rv.approved, false);
    assert.equal(done.attention?.reason, 'review');
    assert.match(done.attention?.detail ?? '', /chưa có kết luận/);
    // attention phải do review CUỐI (sau vòng sửa) quyết định, không phải dấu vết của vòng từ chối đầu
    const reviseAt = a.usage.all({ task: t.id }).filter((c) => c.phase === 'revise').length;
    assert.ok(reviseAt >= 1);
    assert.doesNotMatch(done.attention?.detail ?? '', /Cần sửa|từ chối/i);
    assert.match(rv.summary, /chưa có kết luận/);
  } finally {
    a.cleanup();
  }
});
