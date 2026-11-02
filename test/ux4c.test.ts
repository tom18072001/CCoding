import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseAcceptance } from '../src/planner.js';
import { testApp } from './helpers.js';

// UX-4c: CTO nghiệm thu sau khi các phòng tổng hợp xong; BA, Technical Writer, Senior SE trong phòng Phát triển.

const block = (o: unknown) => `## Tóm tắt\nxx\n\n\`\`\`json\n${JSON.stringify(o)}\n\`\`\``;

test('đọc kết luận nghiệm thu: kết luận chung phải khớp bảng; không đọc được thì chưa nghiệm thu', () => {
  const ok = parseAcceptance(block({ accepted: true, summary: 's', criteria: [{ name: 'A', result: 'pass', evidence: 'npm test → 0' }, { name: 'B', result: 'Đạt', evidence: 'tệp' }], risks: ['r'], followUps: [{ title: 'T', brief: 'B', department: 'dev' }] }));
  assert.equal(ok.parsed, true);
  assert.equal(ok.accepted, true);
  assert.deepEqual(ok.criteria.map((c) => c.result), ['pass', 'pass'], 'chấp nhận "Đạt" tiếng Việt');
  assert.equal(ok.followUps[0].department, 'dev');
  // nói "accepted" nhưng bảng còn tiêu chí không đạt / chưa kiểm được → chưa nghiệm thu
  const lie = parseAcceptance(block({ accepted: true, criteria: [{ name: 'A', result: 'pass' }, { name: 'B', result: 'unknown' }] }));
  assert.equal(lie.accepted, false);
  assert.equal(parseAcceptance(block({ accepted: true, criteria: [] })).accepted, false, 'không có tiêu chí thì không coi là đạt');
  const bad = parseAcceptance('Không có JSON');
  assert.deepEqual([bad.parsed, bad.accepted], [false, false]);
  const fu = parseAcceptance(block({ accepted: false, criteria: [{ name: 'A', result: 'fail' }], followUps: [{ title: '', brief: 'x' }, { title: 'Y', brief: 'z', department: 'sales' }] }));
  assert.deepEqual(fu.followUps, [{ title: 'Y', brief: 'z', department: undefined }], 'bỏ đề xuất thiếu tiêu đề, phòng không hợp lệ');
});

test('CTO nghiệm thu sau tổng hợp: tệp ACCEPTANCE.md, tin "nghiệm thu", không lặp khi báo cáo không đổi', async () => {
  const app = testApp();
  try {
    const t = app.orchestrator.submit({ brief: 'Thiết kế API quản lý hồ sơ có phân quyền và log kiểm toán', mode: 'department', department: 'dev', options: { discussionRounds: 0 } });
    const d = await app.orchestrator.waitFor(t.id);
    assert.equal(d.status, 'done', d.error);
    assert.ok(d.acceptance, 'có kết luận nghiệm thu');
    assert.equal(d.acceptance!.by, 'cto');
    assert.equal(d.acceptance!.accepted, true);
    assert.ok(d.acceptance!.criteria.length >= 1);
    assert.ok(!d.attention);
    assert.ok(fs.readFileSync(path.join(app.store.runDir(t.id), 'ACCEPTANCE.md'), 'utf8').includes('## Tiêu chí nghiệm thu'));
    const msgs = app.store.transcript(t.id).filter((m) => m.kind === 'acceptance');
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].from, 'cto');
    assert.ok(!msgs[0].text.includes('```json'), 'tin hiển thị không kèm khối JSON máy đọc');
    const calls = app.usage.all({ task: t.id });
    assert.equal(calls.at(-1)!.phase, 'accept');
    assert.equal(calls.at(-1)!.agentId, 'cto');
    // giám đốc duyệt (không viết lại báo cáo) → không nghiệm thu lại
    const n = calls.length;
    app.orchestrator.reviewDecision(t.id, { decision: 'approve' });
    assert.equal(app.usage.all({ task: t.id }).length, n);
    // viết lại báo cáo tổng hợp → nghiệm thu lại
    app.orchestrator.resume(t.id, { from: 'synthesize' });
    const r = await app.orchestrator.waitFor(t.id);
    assert.equal(r.status, 'done');
    assert.deepEqual(app.usage.all({ task: t.id }).slice(n).map((x) => x.phase), ['synthesize', 'accept']);
    assert.equal(app.store.transcript(t.id).filter((m) => m.kind === 'acceptance').length, 2);
  } finally {
    app.cleanup();
  }
});

test('CTO chưa nghiệm thu → "cần xem"; tắt nghiệm thu hoặc giao riêng một agent → không gọi CTO', async () => {
  const app = testApp({ acceptRejectRate: 1 });
  try {
    const t = app.orchestrator.submit({ brief: 'Viết tổng quan tài liệu về phát hiện bất thường', mode: 'department', department: 'research', options: { discussionRounds: 0 } });
    const d = await app.orchestrator.waitFor(t.id);
    assert.equal(d.status, 'done', d.error);
    assert.equal(d.acceptance?.accepted, false);
    assert.equal(d.attention?.reason, 'acceptance');
    assert.match(d.attention!.detail, /CTO chưa nghiệm thu: 1\/\d+ tiêu chí/);
    assert.ok(app.orchestrator.alerts.some((a) => a.kind === 'task.attention' && a.taskId === t.id && /CTO chưa nghiệm thu/.test(a.title)));
    // giám đốc duyệt kết quả → bỏ "cần xem"
    app.orchestrator.reviewDecision(t.id, { decision: 'approve' });
    assert.ok(!app.store.get(t.id)!.attention);

    const off = app.orchestrator.submit({ brief: 'Viết đề cương', mode: 'department', department: 'research', options: { discussionRounds: 0, acceptance: false } });
    const o = await app.orchestrator.waitFor(off.id);
    assert.equal(o.status, 'done');
    assert.ok(!o.acceptance);
    assert.ok(!app.usage.all({ task: off.id }).some((x) => x.phase === 'accept'));
    const solo = app.orchestrator.submit({ brief: 'Viết README cho module tính toán', mode: 'agent', agentId: 'tech-writer' });
    const s = await app.orchestrator.waitFor(solo.id);
    assert.equal(s.status, 'done', s.error);
    assert.ok(!s.acceptance, 'việc giao riêng một agent không qua CTO');
  } finally {
    app.cleanup();
  }
});
