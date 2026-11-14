import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateHeadings } from '../src/kpi.js';
import { testApp } from './helpers.js';

// FX16 (D18a/S2): FINAL do trưởng phòng viết qua cổng "Mẫu đầu ra" của hồ sơ lead; thiếu mục ⇒ cờ trong gate.decision, không chặn cứng.

type Orch = { call: (...x: unknown[]) => Promise<{ text: string }> };

function setup(synth: (leadBody: string) => string) {
  const a = testApp();
  const orch = a.orchestrator as unknown as Orch;
  const orig = orch.call.bind(orch);
  orch.call = async (agent, phase, build, ctx) => {
    const r = await orig(agent, phase, build, ctx);
    if (phase === 'execute') r.text = templateHeadings((agent as { body: string }).body).map((h) => `## ${h}\nNội dung thật.`).join('\n');
    if (phase === 'synthesize') r.text = synth((agent as { body: string }).body);
    return r;
  };
  return a;
}
const submit = (a: ReturnType<typeof setup>) => a.orchestrator.submit({ brief: 'Viết ghi chú ngắn về quy trình đóng gói', department: 'dev', options: { lane: 'full', discussionRounds: 0, review: false } });
const finalGate = (a: ReturnType<typeof setup>, id: string) => a.logs.query({ task: id }).filter((e) => e.kind === 'gate.decision' && (e.data as { gate?: string }).gate === 'final-template');

test('FX16 FINAL của trưởng phòng thiếu mục bắt buộc → gate.decision có cờ, nhiệm vụ vẫn xong', async () => {
  const a = setup(() => '## Tóm tắt\nChỉ có phần tóm tắt, thiếu các mục còn lại.');
  try {
    const done = await a.orchestrator.waitFor(submit(a).id);
    assert.equal(done.status, 'done', done.error);
    const ev = finalGate(a, done.id);
    assert.equal(ev.length, 1);
    const d = ev[0].data as { verdict: string; flag: string; missing: string[]; coverage: number };
    assert.equal(d.verdict, 'block');
    assert.equal(d.flag, 'final-missing-sections');
    assert.ok(d.missing.length > 0);
    assert.ok(d.coverage < 1);
    assert.equal(ev[0].level, 'warn');
  } finally {
    a.cleanup();
  }
});

test('FX16 FINAL đủ mục theo mẫu của lead → gate.decision pass, không cờ', async () => {
  const a = setup((body) => templateHeadings(body).map((h) => `## ${h}\nNội dung thật cho mục này.`).join('\n\n') + '\n\n## Tóm tắt\nĐủ mục.');
  try {
    const done = await a.orchestrator.waitFor(submit(a).id);
    assert.equal(done.status, 'done', done.error);
    const ev = finalGate(a, done.id);
    assert.equal(ev.length, 1);
    const d = ev[0].data as { verdict: string; flag?: string };
    assert.equal(d.verdict, 'pass');
    assert.equal(d.flag, undefined);
  } finally {
    a.cleanup();
  }
});
