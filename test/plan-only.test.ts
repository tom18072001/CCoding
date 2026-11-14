import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { variantOptions, isPlanModel } from '../src/orchestrator.js';
import type { Task } from '../src/types.js';
import { testApp } from './helpers.js';

// BRIEF-D19 K1: options.planOnly / options.planModel. LLM là runtime mock; không gọi model thật.

type App = ReturnType<typeof testApp>;
const BRIEF = 'Phân tích và lập kế hoạch viết API đăng ký người dùng có kiểm tra đầu vào, kèm test và tài liệu.';
const rows = (a: App, id: string) => a.usage.all({ task: id }) as Array<{ phase: string; model?: string }>;
const phases = (a: App, id: string) => rows(a, id).map((r) => r.phase);
const kinds = (a: App, id: string, kind: string) => a.logs.query({ task: id }).filter((e) => e.kind === kind);

/** Hạng mục dùng chung cho các ca kiểm tra "không có gì sau cổng kế hoạch". */
function assertStopped(a: App, t: Task): void {
  assert.equal(t.status, 'done', t.error);
  assert.equal(t.attention, undefined, 'không đặt attention');
  assert.equal(t.finalPath, undefined, 'không gán finalPath');
  assert.equal(fs.existsSync(path.join(a.store.runDir(t.id), 'FINAL.md')), false, 'không ghi FINAL.md');
  const ph = phases(a, t.id);
  for (const banned of ['execute', 'review', 'revise', 'synthesize', 'accept']) assert.equal(ph.includes(banned), false, `không có lượt ${banned}: ${ph.join(',')}`);
  assert.ok(ph.includes('plan'), 'có lượt plan');
  for (const r of t.runs) {
    assert.equal(r.planOnly, true);
    assert.ok(r.planRaw && r.planRaw.length > 0, 'có planRaw');
    assert.ok(r.planFinal && r.planFinal.length > 0, 'có planFinal');
    assert.ok(r.planGate, 'có planGate');
    assert.equal(r.subtasks.some((s) => s.attempts > 0 || s.status === 'done'), false, 'không hạng mục nào được chạy');
  }
}

test('planOnly (a): làn nhanh dừng sau cổng kế hoạch, done, không execute/review/synthesize/accept/FINAL.md', async () => {
  const a = testApp();
  try {
    const t = a.orchestrator.submit({ brief: BRIEF, mode: 'department', department: 'dev', options: { planOnly: true, lane: 'fast', discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.lane, 'fast');
    assertStopped(a, done);
    assert.equal(done.options.planOnly, true);
    assert.equal(typeof done.runs[0].planModel, 'string');
    assert.equal(done.runs[0].planModelSource, 'fastLane');
    assert.ok(Array.isArray(done.runs[0].planRaw?.[0]?.dependsOn));
    assert.equal(kinds(a, t.id, 'task.done').length, 1);
  } finally {
    a.cleanup();
  }
});

test('planOnly (b): làn đầy (có họp chốt) dừng sau cổng, không execute/review/synthesize/accept/FINAL.md', async () => {
  const a = testApp();
  try {
    const t = a.orchestrator.submit({ brief: BRIEF, mode: 'department', department: 'dev', options: { planOnly: true, lane: 'full', discussionRounds: 1 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.lane, 'full');
    assertStopped(a, done);
    assert.ok(phases(a, t.id).includes('discuss'), 'họp thảo luận vẫn chạy ở làn đầy');
    assert.ok(phases(a, t.id).includes('finalize'), 'họp chốt vẫn chạy ở làn đầy');
  } finally {
    a.cleanup();
  }
});

for (const lane of ['fast', 'full'] as const) {
  test(`planOnly (c): planModel 'haiku' trên làn ${lane}: lượt plan dùng haiku, route/discuss/finalize giữ model cũ, có log task.planModel`, async () => {
    const a = testApp();
    try {
      const common = { planOnly: true, lane, discussionRounds: 1 } as const;
      // đối chứng: không planModel (mode auto để có lượt route)
      const c0 = a.orchestrator.submit({ brief: BRIEF, options: common });
      await a.orchestrator.waitFor(c0.id);
      const t = a.orchestrator.submit({ brief: BRIEF, options: { ...common, planModel: 'haiku' } });
      const done = await a.orchestrator.waitFor(t.id);
      assertStopped(a, done);
      const plan = rows(a, t.id).filter((r) => r.phase === 'plan');
      assert.ok(plan.length >= 1);
      for (const r of plan) assert.match(r.model ?? '', /haiku/, 'lượt plan dùng haiku');
      assert.match(done.runs[0].planModel ?? '', /haiku/);
      assert.equal(done.runs[0].planModelSource, 'task');
      const others = (id: string) => rows(a, id).filter((r) => r.phase !== 'plan').map((r) => `${r.phase}:${r.model}`).sort();
      assert.deepEqual(others(t.id), others(c0.id), 'các pha khác giữ model như đối chứng');
      assert.ok(others(t.id).some((x) => x.startsWith('route:')), 'có lượt route');
      const log = kinds(a, t.id, 'task.planModel')[0];
      assert.equal((log?.data as { source?: string } | undefined)?.source, 'task');
      assert.match(String((log?.data as { model?: string } | undefined)?.model), /haiku/);
    } finally {
      a.cleanup();
    }
  });
}

test('planOnly (d): cổng buộc sửa kế hoạch → planRaw ≠ planFinal, planReplans ≥ 1, planRaw giữ bản đầu', async () => {
  const a = testApp();
  try {
    const orch = a.orchestrator as unknown as { call: (...x: unknown[]) => Promise<{ text: string }> };
    const orig = orch.call.bind(orch);
    let planCalls = 0;
    orch.call = async (agent, phase, build, ctx) => {
      const r = await orig(agent, phase, build, ctx);
      // lượt plan đầu: một hạng mục giao cho agent không có trong roster → cổng B (v) chặn
      if (phase === 'plan' && planCalls++ === 0) r.text = '```json\n' + JSON.stringify({ summary: 'Kế hoạch lỗi', subtasks: [{ id: 'S1', title: 'Việc duy nhất', assignee: 'ghost-agent', description: 'x', dependsOn: [], deliverable: 'y' }] }) + '\n```';
      return r;
    };
    const t = a.orchestrator.submit({ brief: BRIEF, mode: 'department', department: 'dev', options: { planOnly: true, lane: 'full', discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assertStopped(a, done);
    const run = done.runs[0];
    assert.ok((run.planReplans ?? 0) >= 1);
    assert.equal(run.planRaw!.length, 1);
    assert.equal(run.planRaw![0].title, 'Việc duy nhất');
    assert.notDeepEqual(run.planRaw, run.planFinal);
    assert.ok(run.planFinal!.length > 1);
    assert.equal(run.planGate?.replanned, true);
    assert.equal(phases(a, t.id).filter((p) => p === 'plan').length, 2, 'một lượt plan + một lượt sửa');
  } finally {
    a.cleanup();
  }
});

test('planOnly (e): variantOptions giữ planOnly/planModel đúng, bỏ giá trị sai', () => {
  assert.deepEqual(variantOptions({ planOnly: true, planModel: 'opus' }), { planOnly: true, planModel: 'opus' });
  for (const m of ['haiku', 'sonnet', 'opus']) assert.equal(variantOptions({ planModel: m as 'haiku' }).planModel, m);
  for (const bad of ['gpt-4', 'Opus', '', 5, null, {}]) assert.equal('planModel' in variantOptions({ planModel: bad as never }), false, String(bad));
  for (const bad of ['true', 1, null]) assert.equal('planOnly' in variantOptions({ planOnly: bad as never }), false, String(bad));
  assert.equal(isPlanModel('sonnet'), true);
  assert.equal(isPlanModel('claude-sonnet'), false);
});

test('planOnly (f): kèm planApproval: true vẫn done, không chờ duyệt, không execute', async () => {
  const a = testApp();
  try {
    const t = a.orchestrator.submit({ brief: BRIEF, mode: 'department', department: 'dev', options: { planOnly: true, planApproval: true, lane: 'full', discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assertStopped(a, done);
    assert.equal(done.pause, undefined);
    assert.equal(done.runs[0].planReview, undefined);
    assert.ok(kinds(a, t.id, 'task.planOnly').length >= 1);
  } finally {
    a.cleanup();
  }
});

test('planOnly (g): resume nhiệm vụ planOnly đã tạm dừng giữa chừng → dừng sau cổng, không execute', async () => {
  const a = testApp();
  let again: App | undefined;
  try {
    const t = a.orchestrator.submit({ brief: BRIEF, mode: 'department', department: 'dev', options: { planOnly: true, lane: 'full', discussionRounds: 0 } });
    await a.orchestrator.waitFor(t.id);
    // giả lập server dừng sau khi chốt kế hoạch nhưng trước điểm dừng planOnly
    const saved = a.store.get(t.id)!;
    saved.status = 'running';
    saved.runs[0].status = 'running';
    saved.runs[0].planOnly = undefined;
    saved.runs[0].planGate = undefined;
    saved.runs[0].stage = 'finalized';
    a.store.put(saved, true);
    again = testApp({ dataDir: a.config.dataDir });
    assert.equal(again.store.get(t.id)!.status, 'paused');
    again.orchestrator.resume(t.id);
    const done = await again.orchestrator.waitFor(t.id);
    assertStopped(again, done);
  } finally {
    again?.cleanup();
    a.cleanup();
  }
});

test('planOnly (h): resume run đã planOnly (điểm chặn 1) → không chạy lại gì, không ghi thêm log dừng, không thêm lượt', async () => {
  const a = testApp();
  let again: App | undefined;
  try {
    const t = a.orchestrator.submit({ brief: BRIEF, mode: 'department', department: 'dev', options: { planOnly: true, lane: 'full', discussionRounds: 0 } });
    await a.orchestrator.waitFor(t.id);
    const saved = a.store.get(t.id)!;
    saved.status = 'running';
    saved.runs[0].status = 'running';
    a.store.put(saved, true);
    again = testApp({ dataDir: a.config.dataDir });
    const before = { stops: kinds(again, t.id, 'task.planOnly').length, rows: rows(again, t.id).length };
    assert.equal(before.stops, 1);
    again.orchestrator.resume(t.id);
    const done = await again.orchestrator.waitFor(t.id);
    assertStopped(again, done);
    assert.equal(kinds(again, t.id, 'task.planOnly').length, before.stops, 'run đã dừng: không chạy lại điểm dừng');
    assert.equal(rows(again, t.id).length, before.rows, 'không phát sinh lượt LLM nào');
  } finally {
    again?.cleanup();
    a.cleanup();
  }
});
