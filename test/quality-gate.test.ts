import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { templateHeadings } from '../src/kpi.js';
import { classifyChecks,needsReviewer, sensitivePaths, templateGate } from '../src/quality-gate.js';
import type { CheckResult } from '../src/types.js';
import { testApp } from './helpers.js';

const res = (command: string, ok: boolean): CheckResult => ({ command, code: ok ? 0 : 1, ok, ms: 1, summary: '', tail: ok ? '' : 'FAIL' });

test('B-02 §4.1: bốn nhánh phân loại — hồi quy/đỏ mới, đỏ kéo dài theo đề bài, đỏ kéo dài không liên quan, xanh', () => {
  const cmds = ['npm test', 'npm run lint', 'node --check a.js', 'npm run build'];
  const base = [res('npm test', true), res('npm run lint', false), res('node --check a.js', false), res('npm run build', true)];
  const latest = [res('npm test', false), res('npm run lint', false), res('node --check a.js', true), res('npm run build', true)];
  const cls = Object.fromEntries(classifyChecks(base, latest, 'Sửa lỗi và đảm bảo `npm run lint` xanh', cmds).map((c) => [c.command, c.cls]));
  assert.deepEqual(cls, { 'npm test': 'regression-or-new', 'npm run lint': 'red-required', 'node --check a.js': 'green', 'npm run build': 'green' });
  // đỏ → đỏ mà đề bài không nhắc lệnh
  assert.equal(classifyChecks(base, latest, 'Làm việc khác', cmds).find((c) => c.command === 'npm run lint')?.cls, 'red-unrelated');
  // đỏ mới: không có baseline
  assert.equal(classifyChecks(undefined, [res('npm test', false)], 'x', ['npm test'])[0].cls, 'regression-or-new');
  // lệnh bị chặn theo chính sách không có bằng chứng → buộc reviewer
  assert.equal(classifyChecks([], [{ ...res('docker ps', false), denied: 'docker' }], 'docker ps', ['docker ps'])[0].cls, 'red-unrelated');
});

const BODY = '## Mẫu đầu ra\n```markdown\n## Tóm tắt\n<…>\n## Tệp đã tạo/sửa\n<…>\n## Kiểm chứng\n<…>\n```\n';

test('B-02 §4.2: templateGate dùng phép kiểm của KPI; tiêu đề rỗng coi như thiếu', () => {
  const ok = templateGate('## Tóm tắt\nXong.\n## Tệp đã tạo/sửa\na.ts\n## Kiểm chứng\nnpm test → 0', BODY);
  assert.equal(ok.ok, true);
  assert.equal(ok.coverage, 1);
  const padded = templateGate('## Tóm tắt\nXong.\n## Tệp đã tạo/sửa\n\n## Kiểm chứng\n\n', BODY);
  assert.equal(padded.ok, false);
  assert.deepEqual(padded.missing, ['Tệp đã tạo/sửa', 'Kiểm chứng']);
  const noSummary = templateGate('## Kết luận\nx\n## Tệp đã tạo/sửa\na\n## Kiểm chứng\nb', BODY);
  assert.equal(noSummary.ok, false);
  assert.equal(noSummary.summaryOk, false);
});

test('B-02 §4.3: needsReviewer theo đường dẫn, nhãn dữ liệu, lệnh đỏ không liên quan, thất bại sau N vòng', () => {
  const green = { hasCheckCommands: true, changedFiles: ['src/foo.ts', 'README.md'], classes: ['green' as const] };
  assert.equal(needsReviewer(green), false);
  assert.equal(needsReviewer({ ...green, hasCheckCommands: false }), true);
  for (const f of ['src/tools/hook.ts', 'src/runtimes/api.ts', 'src/kpi.ts', 'src/store.ts', '.env.local', 'data/x.json', 'agents/dev/a.md', 'ccoding.config.json'])
    assert.equal(needsReviewer({ ...green, changedFiles: [f] }), true, f);
  assert.deepEqual(sensitivePaths(['src\\tools\\a.ts', 'src/orchestrator.ts']), ['src/tools/a.ts']);
  assert.equal(needsReviewer({ ...green, classification: 'confidential' }), true);
  assert.equal(needsReviewer({ ...green, classes: ['red-unrelated'] }), true);
  assert.equal(needsReviewer({ ...green, failedAfterRounds: true }), true);
});

function workspace() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-qg-ws-'));
  fs.writeFileSync(path.join(ws, 'a.js'), 'module.exports = 1;\n');
  return ws;
}

test('B-02 ca t5: lệnh đỏ từ baseline, đề bài đòi xanh → vòng sửa, KHÔNG gọi reviewer, approved=false', async () => {
  const ws = workspace();
  const app = testApp();
  try {
    const cmd = 'node -e "process.exit(1)"';
    app.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: ws, classification: 'internal', toolAccess: 'exec', checkCommands: [cmd], createdAt: new Date().toISOString() });
    const t = app.orchestrator.submit({ brief: `Viết test cho các module, đảm bảo \`${cmd}\` xanh.`, projectId: 'repo', options: { discussionRounds: 0, maxRevisions: 1 } });
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const pc = done.projectChecks!;
    assert.equal(pc.baseline?.[0].ok, false, 'đỏ từ baseline (chạy lệnh thật)');
    assert.equal(pc.latest?.[0].ok, false, 'vẫn đỏ sau vòng sửa');
    const phases = app.usage.all({ task: t.id }).map((c) => c.phase);
    assert.equal(phases.includes('review'), false, 'không gọi reviewer');
    assert.equal(phases.filter((p) => p === 'revise').length, 2, 'đủ gate.maxFixRounds=2 vòng sửa theo kiểm tra');
    const run = done.runs[0];
    assert.equal(run.review?.approved, false);
    assert.match(run.review?.summary ?? '', /không gọi reviewer, không duyệt/);
    assert.equal(done.attention?.reason, 'review');
  } finally {
    app.cleanup();
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

/** Gateway giả: kế hoạch một việc cho backend-dev; mọi bàn giao đúng mẫu đầu ra của vai đó; reviewer luôn duyệt và không chạy lệnh nào. */
async function gatewayApp() {
  const agentMd = fs.readFileSync(path.join(process.cwd(), 'agents', 'dev', 'backend-dev.md'), 'utf8');
  const reply = templateHeadings(agentMd).map((h) => `## ${h}\nNội dung thật cho mục này.`).join('\n');
  const prompts: string[] = [];
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
    const say = (s: string) => res.write(`data: ${JSON.stringify({ model: 'm-ok', choices: [{ delta: { content: s }, finish_reason: 'stop' }] })}\n\n`);
    if (user.includes('LẬP KẾ HOẠCH')) say(`\`\`\`json\n${JSON.stringify({ summary: 'Một việc', subtasks: [{ id: 'S1', title: 'API', assignee: 'backend-dev', description: 'Viết API', dependsOn: [] }] })}\n\`\`\``);
    else if (user.includes('REVIEW CHẤT LƯỢNG')) {
      prompts.push(user);
      say(`\`\`\`json\n${JSON.stringify({ approved: true, summary: 'Ổn', issues: [] })}\n\`\`\``);
    } else say(reply);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 300, completion_tokens: 20 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-qg-gw-'));
  const base = loadConfig();
  const app = createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['fake'] },
    runtimes: { fake: { type: 'openai-api', baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none', local: false } },
    models: { fake: { opus: ['m-ok'], sonnet: ['m-ok'], haiku: ['m-ok'] } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  });
  const ws = workspace();
  return {
    app,
    ws,
    prompts,
    cleanup: () => {
      srv.closeAllConnections?.();
      srv.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
      fs.rmSync(ws, { recursive: true, force: true });
    },
  };
}

test('B-02: lệnh xanh, mẫu đầu ra đạt, diff không chạm vùng nhạy cảm → không gọi reviewer, duyệt kèm lý do của cổng', async () => {
  const g = await gatewayApp();
  try {
    g.app.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: g.ws, classification: 'internal', toolAccess: 'exec', checkCommands: ['node -e "process.exit(0)"'], createdAt: new Date().toISOString() });
    const t = g.app.orchestrator.submit({ brief: 'Thêm hàm tiện ích', projectId: 'repo', options: { discussionRounds: 0, maxRevisions: 1 } });
    const done = await g.app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(g.prompts.length, 0, 'không gọi reviewer');
    assert.equal(done.runs[0].review?.approved, true);
    assert.match(done.runs[0].review?.summary ?? '', /Cổng chất lượng/);
    assert.equal(done.attention, undefined);
  } finally {
    g.cleanup();
  }
});

test('B-02 §4.2: bàn giao sai mẫu → lượt sửa định dạng (tính vào N); vẫn sai thì gọi reviewer', async () => {
  const app = testApp();
  const ws = workspace();
  try {
    app.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: ws, classification: 'internal', toolAccess: 'exec', checkCommands: ['node -e "process.exit(0)"'], createdAt: new Date().toISOString() });
    const t = app.orchestrator.submit({ brief: 'Thêm hàm tiện ích', projectId: 'repo', options: { discussionRounds: 0, maxRevisions: 0 } });
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const calls = app.usage.all({ task: t.id });
    // mock không sinh đúng mẫu → tổng số lượt sửa định dạng bị chặn ở gate.maxFixRounds = 2
    assert.equal(calls.filter((c) => c.phase === 'revise').length, 2);
    assert.equal(calls.some((c) => c.phase === 'review'), true, 'thất bại sau N vòng ⇒ gọi reviewer');
    const kinds = new Set(app.logs.query({ task: t.id, limit: 1000 }).map((l) => l.kind));
    for (const k of ['gate.classify', 'gate.template', 'gate.review']) assert.ok(kinds.has(k), k);
  } finally {
    app.cleanup();
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test('B-02 D-02: dự án không có checkCommands, reviewer có quyền chạy lệnh nhưng không chạy → duyệt vẫn gắn attention "review"', async () => {
  const g = await gatewayApp();
  try {
    g.app.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: g.ws, classification: 'internal', toolAccess: 'exec', createdAt: new Date().toISOString() });
    const t = g.app.orchestrator.submit({ brief: 'API', projectId: 'repo', options: { discussionRounds: 0, maxRevisions: 0 } });
    const done = await g.app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(g.prompts.length, 1, 'không có checkCommands ⇒ gọi reviewer');
    assert.equal(done.runs[0].review?.approved, true);
    assert.equal(done.runs[0].review?.verified, false);
    assert.equal(done.attention?.reason, 'review');
    assert.match(done.attention?.detail ?? '', /chưa có kiểm chứng chạy thật/);
  } finally {
    g.cleanup();
  }
});

