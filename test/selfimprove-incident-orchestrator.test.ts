import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { loadIncidents, type SkipReason } from '../src/selfimprove.js';
import type { Classification } from '../src/types.js';

// K4 (D13): chạy cả vòng Orchestrator bằng gateway giả (không LLM thật, không claude -p) cho khối nguồn sự cố B-19.
// Reviewer từ chối ở lần đầu (major) → nguồn review.issue; lượt sửa trả mục "Nhật ký sự cố" → nguồn revise.incident.

const SECRETS = /an\.nguyen@example\.com|abcd1234efgh5678|0912345678/;
const COMMENT = 'thiếu test, liên hệ an.nguyen@example.com hoặc 0912345678, token=abcd1234efgh5678';

async function gateway() {
  const srv = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'm-ok' }] }));
    }
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    const user = body.messages.filter((m: { role: string }) => m.role === 'user').map((m: { content: unknown }) => (typeof m.content === 'string' ? m.content : '')).join('\n');
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    const say = (s: string) => send({ model: 'm-ok', choices: [{ delta: { content: s }, finish_reason: 'stop' }] });
    if (user.includes('LẬP KẾ HOẠCH')) {
      say(`\`\`\`json\n${JSON.stringify({ summary: 'Một việc', subtasks: [{ id: 'S1', title: 'API', assignee: 'backend-dev', description: 'Viết API', dependsOn: [], deliverable: 'API' }] })}\n\`\`\``);
    } else if (user.includes('REVIEW CHẤT LƯỢNG')) {
      say(`\`\`\`json\n${JSON.stringify({ approved: false, summary: 'Chưa đạt', issues: [{ subtask: 'S1', severity: 'major', comment: COMMENT }] })}\n\`\`\``);
    } else if (user.includes('SỬA THEO REVIEW')) {
      say(`## Tóm tắt\nĐã sửa.\n\n## Đã sửa theo review\n- thêm test\n\n## Nhật ký sự cố\n- [R1] thiếu test — nguyên nhân: quên test của an.nguyen@example.com với token=abcd1234efgh5678, gọi 0912345678 → sửa: thêm test → kiểm: \`npm test\`\n`);
    } else say('## Tóm tắt\nXong.');
    send({ choices: [], usage: { prompt_tokens: 300, completion_tokens: 20 } });
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1` };
}

/** local: true để nhiệm vụ confidential/restricted vẫn được chạy (chính sách dữ liệu chỉ cho runtime cục bộ). */
function appFor(url: string, dataDir: string, selfImprove: Record<string, unknown>) {
  const base = loadConfig();
  return createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['fake'] },
    runtimes: { fake: { type: 'openai-api', baseUrl: url, tags: 'none', local: true } },
    models: { fake: { opus: ['m-ok'], sonnet: ['m-ok'], haiku: ['m-ok'] } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
    selfImprove: { ...base.selfImprove, ...selfImprove },
  } as any);
}

const allEvents = (dataDir: string): any[] => {
  const runs = path.join(dataDir, 'runs');
  if (!fs.existsSync(runs)) return [];
  return fs.readdirSync(runs).flatMap((id) => {
    const f = path.join(runs, id, 'events.jsonl');
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  });
};
const incidentsFile = (dataDir: string): string => path.join(dataDir, 'self-improve', 'incidents.jsonl');

/** Chạy một nhiệm vụ trọn vòng; classification lấy từ dự án (nguồn nhãn thật của Orchestrator). */
async function runTask(selfImprove: Record<string, unknown>, classification: Classification) {
  const gw = await gateway();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-k4-'));
  const app = appFor(gw.url, dataDir, selfImprove);
  try {
    app.store.saveProject({ id: 'p-k4', name: 'Dự án thử K4', department: 'dev', classification, createdAt: new Date().toISOString() } as any);
    const t = app.orchestrator.submit({ brief: 'Viết API', projectId: 'p-k4', options: { discussionRounds: 0, maxRevisions: 1 } });
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.classification, classification, 'nhãn dữ liệu của nhiệm vụ lấy từ dự án');
    return { dataDir, taskId: t.id, ev: allEvents(dataDir) };
  } finally {
    gw.srv.close();
  }
}

test('K4(1): selfImprove bật + nhiệm vụ internal → sự cố vào incidents.jsonl, có incident.recorded, PII/bí mật giả đã bị che', async () => {
  const { dataDir, taskId, ev } = await runTask({ enabled: true, collect: true }, 'internal');
  const recorded = ev.filter((e) => e.kind === 'incident.recorded');
  assert.ok(recorded.length >= 1, 'có ít nhất một incident.recorded');
  assert.equal(ev.filter((e) => e.kind === 'incident.skipped').length, 0);
  const sources = new Set(recorded.map((e) => e.data.source));
  assert.ok(sources.has('review.issue'), `nguồn review.issue (có: ${[...sources].join(',')})`);
  assert.ok(sources.has('agent.selfReport'), `nguồn revise.incident → agent.selfReport (có: ${[...sources].join(',')})`);
  for (const e of recorded) {
    assert.equal(e.data.taskId, taskId);
    assert.equal(e.data.classification, 'internal');
    assert.equal(e.data.schema, 'ccoding/incident/v1');
    assert.equal('agentProposal' in e.data, false, 'agentProposal (không đáng tin) không vào sự kiện');
  }
  const file = incidentsFile(dataDir);
  assert.ok(fs.existsSync(file), 'có incidents.jsonl');
  const incs = loadIncidents(dataDir);
  assert.equal(incs.length, recorded.length, 'mỗi incident.recorded có đúng một bản ghi trong incidents.jsonl');
  assert.deepEqual(new Set(incs.map((i) => i.id)), new Set(recorded.map((e) => e.data.id)));
  assert.ok(incs.some((i) => i.agentProposal), 'agentProposal nằm ở incidents.jsonl');
  // PII/khóa giả (có trong comment của reviewer và báo cáo sửa) không được lọt vào tệp sự cố lẫn sự kiện
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), SECRETS);
  assert.doesNotMatch(JSON.stringify(recorded), SECRETS);
});

for (const classification of ['confidential', 'restricted'] as const) {
  test(`K4(2): nhiệm vụ ${classification} → không vào hàng đợi, ghi incident.skipped (reason ∈ SkipReason), không symptom/agentProposal`, async () => {
    const { dataDir, taskId, ev } = await runTask({ enabled: true, collect: true }, classification);
    const expected: SkipReason = 'classification';
    const skipped = ev.filter((e) => e.kind === 'incident.skipped');
    assert.ok(skipped.length >= 1, 'có incident.skipped');
    assert.deepEqual(new Set(skipped.map((e) => e.data.kind)), new Set(['review.incident', 'revise.incident']), 'bỏ qua cả hai nguồn đã phát sinh');
    for (const e of skipped) {
      assert.equal(e.data.taskId, taskId);
      assert.equal(e.data.reason, expected);
      assert.deepEqual(Object.keys(e.data).sort(), ['kind', 'reason', 'taskId'], 'chỉ taskId/kind/reason');
      assert.equal(JSON.stringify(e).includes('symptom'), false);
      assert.equal(JSON.stringify(e).includes('agentProposal'), false);
    }
    assert.equal(ev.filter((e) => e.kind === 'incident.recorded').length, 0);
    assert.equal(fs.existsSync(incidentsFile(dataDir)), false, 'không có incidents.jsonl');
    assert.deepEqual(loadIncidents(dataDir), []);
  });
}

test('K4(3): công tắc tắt → không có sự kiện incident.* và không có incidents.jsonl (vòng sửa vẫn chạy)', async () => {
  const { dataDir, ev } = await runTask({ enabled: false }, 'internal');
  assert.ok(ev.some((e) => e.kind === 'revise.incident'), 'đối chứng: nguồn revise.incident vẫn được ghi');
  assert.ok(ev.some((e) => e.kind === 'review.incident') === false, 'review.incident chỉ phát khi bật selfImprove');
  assert.equal(ev.filter((e) => String(e.kind).startsWith('incident.')).length, 0);
  assert.equal(fs.existsSync(incidentsFile(dataDir)), false);
  assert.equal(fs.existsSync(path.join(dataDir, 'self-improve')), false);
});
