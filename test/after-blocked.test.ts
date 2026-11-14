import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateHeadings } from '../src/kpi.js';
import { testApp } from './helpers.js';

// FX5b (D18a/S2): nhiệm vụ trước xong nhưng CTO chưa nghiệm thu (accepted=false, parsed=true) → nhiệm vụ "after" không tự chạy.

const reply = (accepted: boolean): string => {
  const criteria = [{ name: 'Tiêu chí A', result: accepted ? 'pass' : 'fail', evidence: 'x', scope: 'decision' }];
  return `| Tiêu chí | Kết quả | Bằng chứng |\n|---|---|---|\n| Tiêu chí A | ${criteria[0].result} | x |\n\n\`\`\`json\n${JSON.stringify({ accepted, summary: accepted ? 'Đạt' : 'Chưa đạt', criteria, risks: [], followUps: [] })}\n\`\`\``;
};

type Orch = { call: (...x: unknown[]) => Promise<{ text: string }>; createTask: (i: unknown, e: unknown) => { id: string } };

function setup(accepted: boolean) {
  const a = testApp();
  const orch = a.orchestrator as unknown as Orch;
  const orig = orch.call.bind(orch);
  orch.call = async (agent, phase, build, ctx) => {
    const r = await orig(agent, phase, build, ctx);
    if (phase === 'execute') r.text = templateHeadings((agent as { body: string }).body).map((h) => `## ${h}\nNội dung thật.`).join('\n');
    if (phase === 'accept') r.text = reply(accepted);
    return r;
  };
  return a;
}
const opts = { lane: 'single', slim: { accept: 'brief' }, review: false } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('FX5b nhiệm vụ trước chưa nghiệm thu → nhiệm vụ after chờ (paused) kèm lý do, không chạy', async () => {
  const a = setup(false);
  try {
    const first = await a.orchestrator.waitFor(a.orchestrator.submit({ brief: 'Viết ghi chú A', options: opts }).id);
    assert.equal(first.status, 'done', first.error);
    assert.equal(first.acceptance?.parsed, true);
    assert.equal(first.acceptance?.accepted, false);
    const next = (a.orchestrator as unknown as Orch).createTask({ brief: 'Viết ghi chú B', options: opts }, { after: [first.id] });
    for (let i = 0; i < 100 && a.store.get(next.id)?.status !== 'paused'; i++) await sleep(20);
    const t = a.store.get(next.id)!;
    assert.equal(t.status, 'paused');
    assert.equal(t.runs.length, 0, 'chưa chạy gì');
    assert.match(t.pause?.detail ?? '', /chưa nghiệm thu/);
    assert.ok(a.logs.query({ task: t.id }).some((e) => e.kind === 'task.blocked'));
    // người dùng chủ động tiếp tục → bỏ điều kiện chờ và chạy
    a.orchestrator.resume(t.id);
    const ran = await a.orchestrator.waitFor(t.id);
    assert.equal(ran.status, 'done', ran.error);
  } finally {
    a.cleanup();
  }
});

test('FX5b nhiệm vụ trước đã nghiệm thu → nhiệm vụ after tự chạy', async () => {
  const a = setup(true);
  try {
    const first = await a.orchestrator.waitFor(a.orchestrator.submit({ brief: 'Viết ghi chú A', options: opts }).id);
    assert.equal(first.acceptance?.accepted, true);
    const next = (a.orchestrator as unknown as Orch).createTask({ brief: 'Viết ghi chú B', options: opts }, { after: [first.id] });
    const ran = await a.orchestrator.waitFor(next.id);
    assert.equal(ran.status, 'done', ran.error);
  } finally {
    a.cleanup();
  }
});
