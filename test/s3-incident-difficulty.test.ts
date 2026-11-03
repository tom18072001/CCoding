import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { loadConfig, ROOT } from '../src/config.js';
import { LogStore } from '../src/logger.js';
import { Registry } from '../src/registry.js';
import { executePrompt, revisePrompt, synthesizePrompt, type Ctx } from '../src/prompts.js';
import { parseIncidentLog } from '../src/incident.js';
import { DIFFICULTY_THRESHOLDS, modelForDifficulty, scoreDifficulty } from '../src/difficulty.js';
import type { LaneSignals } from '../src/lane.js';
import type { Task } from '../src/types.js';

const reg = new Registry(path.join(ROOT, 'agents'), path.join(ROOT, 'departments'));
const dept = reg.department('dev');
const agent = reg.agent('senior-swe');
const task = {
  id: 'T-1', title: 'Việc nhỏ', brief: 'Sửa lỗi làm tròn trong src/a.js', mode: 'project', projectId: 'p', classification: 'internal', status: 'running', departments: ['dev'], runs: [], options: {} as any,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 } as any, createdAt: '2026-11-03T00:00:00Z', updatedAt: '2026-11-03T00:00:00Z',
} as Task;
const st = { id: 'S1', title: 'Việc nhỏ', assignee: 'senior-swe', description: 'Làm trọn đề bài.', dependsOn: [], status: 'pending', deliverable: 'Báo cáo bàn giao theo mẫu' } as any;
const TOOLS = ['list_files', 'read_file', 'search', 'write_file', 'edit_file', 'run_command'] as any[];
const ctx = (flags?: Ctx['flags']): Ctx => ({ task, dept, project: { id: 'p', name: 'Dự án thử', description: 'Repo thử', classification: 'internal' } as any, cwd: '/w', roster: reg.members('dev'), filesAccessible: true, ccDir: '.ccoding/T-1', branch: 'ccoding/t-1', lane: 'fast', repoMap: { rel: '.ccoding/T-1/repo-map.md', large: [] }, flags });
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const renderAll = (flags?: Ctx['flags']) => {
  const c = ctx(flags);
  const ex = executePrompt(c, agent, st, 'Kế hoạch', '', [], TOOLS, undefined, [st]);
  const rv = revisePrompt(c, st, 'bản trước', '- [major] thiếu test', TOOLS, undefined);
  const sy = synthesizePrompt(c, 'Kế hoạch', 'Quyết định', [], 'review', undefined, '', TOOLS);
  return { execute: `${ex.context}\n=====\n${ex.prompt}`, revise: `${rv.context}\n=====\n${rv.prompt}`, synthesize: `${sy.context}\n=====\n${sy.prompt}` };
};

// Băm prompt của mã TRƯỚC khi thêm B-09/B-03 (commit 90cd913), cùng fixture ở trên: công tắc tắt phải trùng từng byte.
const SNAPSHOT = { execute: '29b87ce4e067cc8f', revise: '93bf7702f2f246d3', synthesize: '82b8ba8ef40d98b8' };

test('B-09: công tắc tắt → prompt trùng từng byte với bản trước khi sửa (execute, revise, synthesize)', () => {
  const r = renderAll(undefined);
  assert.deepEqual({ execute: sha(r.execute), revise: sha(r.revise), synthesize: sha(r.synthesize) }, SNAPSHOT);
  assert.deepEqual(renderAll({ outputCap: false, stopSurvey: false, incidentLog: false }), r);
});

test('B-09: outputCap thêm P1 vào execute/synthesize; stopSurvey thêm P2 vào execute; không đụng review/plan', () => {
  const off = renderAll();
  const cap = renderAll({ outputCap: true });
  assert.match(cap.execute, /Giữ báo cáo gọn: mỗi mục ≤ ~120 từ/);
  assert.match(cap.synthesize, /Giữ báo cáo gọn: mỗi mục ≤ ~120 từ/);
  assert.equal(cap.revise, off.revise);
  const ss = renderAll({ stopSurvey: true });
  assert.match(ss.execute, /Đã đọc\/tìm khoảng 8 lần mà chưa ghi gì thì DỪNG đọc/);
  assert.equal(ss.synthesize.includes('DỪNG đọc') && ss.synthesize !== off.synthesize, false, 'synthesize không có P2 ở hạng mục khác');
  assert.doesNotMatch(off.execute, /DỪNG đọc|≤ ~120 từ/);
});

test('B-03: incidentLog thêm mục Nhật ký sự cố vào revisePrompt; mặc định cấu hình BẬT, B-09/B-17 TẮT', () => {
  assert.match(renderAll({ incidentLog: true }).revise, /## Nhật ký sự cố" gồm TỐI ĐA 3 dòng/);
  const cfg = loadConfig();
  assert.equal(cfg.phases.incidentLog, true);
  assert.equal(!!cfg.phases.outputCap, false);
  assert.equal(!!cfg.phases.stopSurveyHint, false);
  assert.equal(cfg.planner.difficultyModel.enabled, false);
});

test('B-03: parseIncidentLog đọc dạng chuẩn, dạng P4 cũ, giới hạn 3 mục; không có mục → parsed=false', () => {
  const std = parseIncidentLog('## Tóm tắt\nx\n\n## Nhật ký sự cố\n- [R1] test đỏ — nguyên nhân: thiếu biên rỗng → sửa: thêm kiểm biên → kiểm: `npm test`\n- [R2] lint — nguyên nhân: quên import → sửa: thêm import\n');
  assert.equal(std.parsed, true);
  assert.equal(std.items.length, 2);
  assert.deepEqual(std.items[0], { error: 'test đỏ', cause: 'thiếu biên rỗng', fix: 'thêm kiểm biên', verifyCmd: 'npm test' });
  assert.equal(std.items[1].verifyCmd, '');
  const old = parseIncidentLog('## Nhật ký sự cố\n- [R1] đọc thiếu đặc tả → thêm bước đọc SPEC trong prompt\n');
  assert.deepEqual(old.items, [{ error: '', cause: 'đọc thiếu đặc tả', fix: 'thêm bước đọc SPEC trong prompt', verifyCmd: '' }]);
  const many = parseIncidentLog('## Nhật ký sự cố\n' + [1, 2, 3, 4, 5].map((i) => `- [R${i}] lỗi ${i} — nguyên nhân: a → sửa: b`).join('\n'));
  assert.equal(many.items.length, 3);
  for (const none of ['## Tóm tắt\nXong.', '## Nhật ký sự cố\n(không có)\n', '']) assert.deepEqual(parseIncidentLog(none), { items: [], parsed: false });
});

test('B-03: bản ghi revise.incident qua LogStore che PII và bí mật giả', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-inc-'));
  const logs = new LogStore(dir, { redactSecrets: true, redactPii: true, hashChain: true });
  const inc = parseIncidentLog('## Nhật ký sự cố\n- [R1] gọi API — nguyên nhân: dùng token=abcd1234efgh5678 của an.nguyen@example.com → sửa: lấy khóa từ env, gọi 0912345678 → kiểm: `npm test`\n');
  logs.write({ level: 'info', kind: 'revise.incident', msg: 'x', taskId: 'T-9', data: { taskId: 'T-9', subtaskId: 'S1', round: 1, items: inc.items, b02: { blocked: false, rounds: 0 }, parsed: inc.parsed } });
  const line = fs.readFileSync(path.join(dir, 'runs', 'T-9', 'events.jsonl'), 'utf8');
  assert.doesNotMatch(line, /an\.nguyen@example\.com|abcd1234efgh5678|0912345678/);
  assert.match(line, /\[EMAIL\]/);
  assert.match(line, /\[REDACTED\]/);
  assert.match(line, /\[PHONE\]/);
});

test('B-17: scoreDifficulty tất định, đúng biên 0/1–2/≥3 điểm, không tín hiệu → mức 2', () => {
  const t = DIFFICULTY_THRESHOLDS;
  const sig = (o: Partial<LaneSignals> = {}): LaneSignals => ({ briefChars: 100, parts: 1, filesTouched: 1, repoFiles: 10, repoBytes: 1000, sequential: false, ...o });
  assert.equal(scoreDifficulty(sig()).level, 1);
  assert.equal(scoreDifficulty(sig({ parts: t.parts - 1, filesTouched: t.filesTouched - 1, briefChars: t.briefChars - 1 })).level, 1, 'ngay dưới ngưỡng');
  assert.equal(scoreDifficulty(sig({ parts: t.parts })).level, 2, '1 điểm');
  assert.equal(scoreDifficulty(sig({ parts: t.parts, filesTouched: t.filesTouched })).level, 2, '2 điểm');
  assert.equal(scoreDifficulty(sig({ parts: t.parts, filesTouched: t.filesTouched, briefChars: t.briefChars })).level, 3, '3 điểm');
  assert.equal(scoreDifficulty(sig({ parts: 9, filesTouched: 9, briefChars: 9999, repoFiles: 999, repoBytes: 9e9 })).level, 3, 'trần');
  assert.equal(scoreDifficulty(sig({ parts: t.parts, filesTouched: t.filesTouched, briefChars: t.briefChars, sequential: true })).level, 2, 'tuần tự trừ 1');
  assert.equal(scoreDifficulty(sig({ parts: t.parts, sequential: true })).level, 1, 'không âm');
  assert.deepEqual(scoreDifficulty(undefined), { level: 2, points: 0, reason: 'không có tín hiệu — dùng mức 2' });
  const a = sig({ parts: 4, briefChars: 2500 });
  assert.deepEqual(scoreDifficulty(a), scoreDifficulty({ ...a }));
});

test('B-17: ánh xạ mức → model theo cấu hình (1 sonnet, 3 opus); mức không khai báo → undefined', () => {
  const m = loadConfig().planner.difficultyModel.models;
  assert.equal(modelForDifficulty(1, m), 'sonnet');
  assert.equal(modelForDifficulty(2, m), undefined);
  assert.equal(modelForDifficulty(3, m), 'opus');
  assert.equal(modelForDifficulty(1, { 1: '  ' }), undefined);
  assert.equal(modelForDifficulty(2, undefined), undefined);
});

/** Gateway giả: reviewer từ chối ở lần đầu → vòng sửa trả báo cáo kèm mục Nhật ký sự cố (có PII/khóa giả). */
async function gateway(withIncident: boolean) {
  const planModels: string[] = [];
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
      planModels.push(String(body.model));
      say(`\`\`\`json\n${JSON.stringify({ summary: 'Một việc', subtasks: [{ id: 'S1', title: 'API', assignee: 'backend-dev', description: 'Viết API', dependsOn: [], deliverable: 'API' }] })}\n\`\`\``);
    } else if (user.includes('REVIEW CHẤT LƯỢNG')) {
      say(`\`\`\`json\n${JSON.stringify({ approved: false, summary: 'Chưa đạt', issues: [{ subtask: 'S1', severity: 'major', comment: 'thiếu test' }] })}\n\`\`\``);
    } else if (user.includes('SỬA THEO REVIEW')) {
      say(`## Tóm tắt\nĐã sửa.\n\n## Đã sửa theo review\n- thêm test\n${withIncident ? '\n## Nhật ký sự cố\n- [R1] thiếu test — nguyên nhân: quên test của an.nguyen@example.com với token=abcd1234efgh5678 → sửa: thêm test → kiểm: `npm test`\n' : ''}`);
    } else say('## Tóm tắt\nXong.');
    send({ choices: [], usage: { prompt_tokens: 300, completion_tokens: 20 } });
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, planModels, url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1` };
}

function appFor(url: string, dataDir: string, over: Record<string, unknown> = {}) {
  const base = loadConfig();
  return createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['fake'] },
    runtimes: { fake: { type: 'openai-api', baseUrl: url, tags: 'none', local: false } },
    models: { fake: { opus: ['m-ok'], sonnet: ['m-ok'], haiku: ['m-ok'] } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
    ...over,
  } as any);
}

const events = (dataDir: string, id: string) => fs.readFileSync(path.join(dataDir, 'runs', id, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

for (const withIncident of [true, false]) {
  test(`B-03/B-12 tích hợp: revise ghi revise.incident (${withIncident ? 'có mục → che PII/khóa' : 'không có mục → parsed=false'}); gate.decision b10 ghi đúng hợp đồng`, async () => {
    const gw = await gateway(withIncident);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-s3-'));
    const app = appFor(gw.url, dataDir);
    try {
      const t = app.orchestrator.submit({ brief: 'Viết API', options: { discussionRounds: 0, maxRevisions: 1 } });
      await app.orchestrator.waitFor(t.id);
      const ev = events(dataDir, t.id);
      const inc = ev.filter((e) => e.kind === 'revise.incident');
      assert.equal(inc.length, 1, 'đúng một bản ghi cho một lượt sửa');
      const d = inc[0].data;
      assert.equal(d.taskId, t.id);
      assert.equal(d.subtaskId, 'S1');
      assert.equal(d.round, 1);
      // gateway giả không trả mẫu đầu ra → cổng B-02 đã dùng 1 vòng sửa định dạng trước vòng review; b02 phản ánh đúng số vòng đã dùng
      assert.equal(typeof d.b02.rounds, 'number');
      assert.equal(d.b02.blocked, d.b02.rounds > 0);
      assert.ok(ev.some((e) => e.kind === 'gate.decision' && e.data.gate === 'b02' && e.data.rounds === d.b02.rounds), 'b02 gate.decision cùng số vòng');
      assert.equal(d.parsed, withIncident);
      if (withIncident) {
        assert.equal(d.items.length, 1);
        assert.equal(d.items[0].verifyCmd, 'npm test');
        assert.doesNotMatch(JSON.stringify(inc[0]), /an\.nguyen@example\.com|abcd1234efgh5678/);
      } else assert.deepEqual(d.items, []);
      const gates = ev.filter((e) => e.kind === 'gate.decision');
      assert.ok(gates.length >= 1);
      for (const g of gates) {
        assert.ok(['b02', 'b10', 'cto'].includes(g.data.gate));
        assert.ok(['block', 'pass'].includes(g.data.verdict));
      }
      assert.ok(gates.some((g) => g.data.gate === 'b10' && g.data.verdict === 'pass'), 'b10 pass được ghi');
    } finally {
      gw.srv.close();
    }
  });
}

test('B-03: incidentLog=false → prompt revise không đòi mục và không ghi revise.incident', async () => {
  const gw = await gateway(true);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-s3off-'));
  const base = loadConfig();
  const app = appFor(gw.url, dataDir, { phases: { ...base.phases, incidentLog: false } });
  try {
    const t = app.orchestrator.submit({ brief: 'Viết API', options: { discussionRounds: 0, maxRevisions: 1 } });
    await app.orchestrator.waitFor(t.id);
    assert.equal(events(dataDir, t.id).filter((e) => e.kind === 'revise.incident').length, 0);
  } finally {
    gw.srv.close();
  }
});

test('B-17 tích hợp: bật → ghi plan.difficulty (không tín hiệu → mức 2) và áp model; tắt → không ghi, không đổi model', async () => {
  for (const enabled of [true, false]) {
    const gw = await gateway(false);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-s3b17-'));
    const app = appFor(gw.url, dataDir, { planner: { difficultyModel: { enabled, models: { 2: 'haiku' } } } });
    try {
      const t = app.orchestrator.submit({ brief: 'Viết API', options: { discussionRounds: 0, maxRevisions: 0 } });
      const done = await app.orchestrator.waitFor(t.id);
      const ev = events(dataDir, t.id).filter((e) => e.kind === 'plan.difficulty');
      if (enabled) {
        assert.equal(ev.length, 1);
        assert.equal(ev[0].data.level, 2);
        assert.equal(ev[0].data.signals, null);
        assert.equal(ev[0].data.applied, true);
        assert.equal(done.options.phaseModels?.plan, 'haiku');
      } else {
        assert.equal(ev.length, 0);
        assert.equal(done.options.phaseModels?.plan, undefined);
      }
    } finally {
      gw.srv.close();
    }
  }
});
