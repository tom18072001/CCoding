import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { parseReview } from '../src/planner.js';
import { compactHistory, wantsCacheControl, withCacheMarks } from '../src/runtimes/api.js';
import { testApp } from './helpers.js';

// Các cải tiến quy trình sau đợt đánh giá performance 26/10: chạy lệnh lần lượt trong repo dùng chung, review có bằng chứng,
// ước lượng/tách nhiệm vụ, ngân sách theo hạng mục, né model vừa bị 429, rút gọn lịch sử theo đợt + điểm cache.

const RUNNERS = new Set(['backend-dev', 'frontend-dev', 'devops', 'qa-tester', 'data-engineer', 'security']);

/** Gateway giả: trả kế hoạch 4 hạng mục song song, đo số hạng mục "chạy lệnh" thực thi đồng thời. */
async function planGateway(delayMs = 80) {
  const active = new Set<string>();
  const stats = { peakRunners: 0, architectOverlapped: false };
  const srv = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'm-ok' }] }));
    }
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    const text = (m: { content: unknown }) => (typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((p: { text?: string }) => p.text ?? '').join('') : '');
    const sys = body.messages.filter((m: { role: string }) => m.role === 'system').map(text).join('\n');
    const user = body.messages.filter((m: { role: string }) => m.role === 'user').map(text).join('\n');
    const who = /\(@([a-z-]+)\)/.exec(sys)?.[1] ?? '?';
    const executing = user.includes('## Hạng mục của bạn');
    if (executing) {
      active.add(who);
      stats.peakRunners = Math.max(stats.peakRunners, [...active].filter((a) => RUNNERS.has(a)).length);
      if (active.has('solution-architect') && [...active].some((a) => RUNNERS.has(a))) stats.architectOverlapped = true;
    }
    await new Promise((r) => setTimeout(r, executing ? delayMs : 5));
    active.delete(who);
    let out = '## Tóm tắt\nXong phần việc.';
    if (user.includes('LẬP KẾ HOẠCH'))
      out = `\`\`\`json\n${JSON.stringify({
        summary: 'Bốn hạng mục song song',
        subtasks: [
          { id: 'S1', title: 'API', assignee: 'backend-dev', description: 'Viết API', dependsOn: [] },
          { id: 'S2', title: 'Giao diện', assignee: 'frontend-dev', description: 'Viết UI', dependsOn: [] },
          { id: 'S3', title: 'ADR', assignee: 'solution-architect', description: 'Viết ADR', dependsOn: [] },
          { id: 'S4', title: 'CI', assignee: 'devops', description: 'Viết CI', dependsOn: [] },
        ],
      })}\n\`\`\``;
    else if (user.includes('REVIEW CHẤT LƯỢNG')) out = '```json\n{"approved": true, "summary": "Ổn", "issues": []}\n```';
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ model: 'm-ok', choices: [{ delta: { content: out }, finish_reason: 'stop' }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 500, completion_tokens: 50 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, stats, url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1` };
}

function gatewayApp(url: string, dataDir: string, serializeWriters: boolean) {
  const base = loadConfig();
  return createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['fake'] },
    runtimes: { fake: { type: 'openai-api', baseUrl: url, tags: 'none', local: false } },
    models: { fake: { opus: ['m-ok'], sonnet: ['m-ok'], haiku: ['m-ok'] } },
    tools: { ...base.tools, serializeWriters },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  });
}

test('repo dự án dùng chung: hạng mục chạy lệnh làm lần lượt, hạng mục chỉ viết tài liệu vẫn song song; review không chạy lệnh bị gắn cờ', async () => {
  for (const serialize of [true, false]) {
    const gw = await planGateway();
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-serial-'));
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-serial-ws-'));
    const app = gatewayApp(gw.url, dataDir, serialize);
    try {
      app.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: ws, classification: 'internal', toolAccess: 'exec', createdAt: new Date().toISOString() });
      const t = app.orchestrator.submit({ brief: 'Xây tính năng', projectId: 'repo', options: { discussionRounds: 0, maxParallel: 3, maxRevisions: 0 } });
      const done = await app.orchestrator.waitFor(t.id);
      assert.equal(done.status, 'done', done.error);
      const run = done.runs[0];
      assert.equal(run.subtasks.length, 4);
      assert.ok(run.estimate && run.estimate.tokens > 0, 'có ước lượng kế hoạch');
      const msgs = app.store.transcript(t.id).map((m) => m.text).join('\n');
      if (serialize) {
        assert.equal(gw.stats.peakRunners, 1, 'không có hai hạng mục chạy lệnh cùng lúc');
        assert.ok(gw.stats.architectOverlapped, 'hạng mục chỉ viết tài liệu vẫn chạy song song');
        assert.match(msgs, /làm lần lượt/);
        // reviewer (QA) có quyền chạy lệnh nhưng không chạy lệnh nào → kết luận chưa có bằng chứng
        assert.equal(run.review?.verified, false);
        assert.match(msgs, /KHÔNG chạy lệnh kiểm tra nào/);
        assert.ok(app.logs.query({ task: t.id, limit: 2000 }).some((e) => e.kind === 'review.unverified'));
      } else {
        assert.ok(gw.stats.peakRunners > 1, 'tắt serializeWriters thì chạy song song như trước');
      }
    } finally {
      gw.srv.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
      fs.rmSync(ws, { recursive: true, force: true });
    }
  }
});

test('kế hoạch quá lớn → cảnh báo/tạm dừng (chế độ pause); tách hạng mục thành nhiệm vụ riêng chạy theo thứ tự phụ thuộc', async () => {
  const app = testApp();
  try {
    const t = app.orchestrator.submit({ brief: 'Xây hệ thống API, giao diện, CI và tài liệu', mode: 'department', department: 'dev', options: { budgetTokens: 100000, budgetMode: 'pause', discussionRounds: 0 } });
    const p = await app.orchestrator.waitFor(t.id);
    assert.equal(p.status, 'paused');
    assert.equal(p.pause?.reason, 'budget');
    assert.match(p.pause?.detail ?? '', /ước tính/);
    assert.ok((p.runs[0].estimate?.tokens ?? 0) > 120000);
    assert.ok(app.orchestrator.alerts.some((a) => a.kind === 'budget.estimate'));
    const subs = p.runs[0].subtasks.length;
    assert.ok(subs >= 2);

    const { task, created } = app.orchestrator.splitTask(t.id, { budgetMode: 'complete', budgetTokens: 300000 });
    assert.equal(created.length, subs);
    assert.equal(task.status, 'cancelled');
    assert.deepEqual(task.splitInto, created.map((c) => c.id));
    assert.ok(task.runs[0].subtasks.every((s) => s.splitTo && s.status === 'skipped'));
    for (const c of created) {
      assert.equal(c.splitFrom?.taskId, t.id);
      assert.equal(c.options.budgetTokens, 300000);
      assert.match(c.brief, /được tách từ hạng mục S\d/);
      assert.ok(fs.existsSync(path.join(app.store.runDir(c.id), 'inputs', 'YEU-CAU-GOC.md')));
    }
    const dep = created.find((c) => c.after?.length);
    assert.ok(dep, 'hạng mục phụ thuộc → nhiệm vụ chờ nhiệm vụ trước');
    for (const c of created) await app.orchestrator.waitFor(c.id);
    const d = app.store.get(dep!.id)!;
    const first = app.store.get(dep!.after![0])!;
    assert.equal(d.status, 'done');
    assert.equal(first.status, 'done');
    assert.ok(Date.parse(d.startedAt!) >= Date.parse(first.finishedAt!), 'chỉ bắt đầu khi nhiệm vụ trước xong');
    assert.throws(() => app.orchestrator.splitTask(t.id), /Không còn hạng mục/);
    // tiếp tục nhiệm vụ gốc không chạy lại các hạng mục đã tách
    app.orchestrator.resume(t.id);
    const again = await app.orchestrator.waitFor(t.id);
    assert.ok(again.runs[0].subtasks.every((s) => s.status === 'skipped' && s.attempts === 0));
  } finally {
    app.cleanup();
  }
});

test('ngân sách theo hạng mục và cảnh báo hạng mục chạy lần thứ 3', async () => {
  const app = testApp();
  try {
    const t = app.orchestrator.submit({ brief: 'Viết đề cương ngắn', mode: 'department', department: 'research', options: { review: false, discussionRounds: 0, subtaskBudgetTokens: 500 } });
    let r = await app.orchestrator.waitFor(t.id);
    assert.equal(r.status, 'done');
    app.orchestrator.resume(t.id, { rerun: 'all' });
    r = await app.orchestrator.waitFor(t.id);
    assert.ok(app.orchestrator.alerts.some((a) => a.kind === 'budget.subtask'), 'hạng mục vượt phần ngân sách → cảnh báo');
    assert.ok(r.runs[0].subtasks.some((s) => (s.budgetAlerted ?? 0) >= 100));
    app.orchestrator.resume(t.id, { rerun: 'all' });
    r = await app.orchestrator.waitFor(t.id);
    assert.equal(r.status, 'done');
    assert.ok(app.orchestrator.alerts.some((a) => a.kind === 'subtask.attempts' && /lần thứ 3/.test(a.title)));
  } finally {
    app.cleanup();
  }
});

test('review: không đọc được JSON thì KHÔNG coi là duyệt; đọc "checks"', () => {
  const bad = parseReview('Mọi thứ có vẻ ổn.', ['S1']);
  assert.equal(bad.approved, false);
  assert.equal(bad.parsed, false);
  const ok = parseReview('```json\n{"approved":true,"summary":"tốt","issues":[],"checks":[{"command":"npm test","exitCode":0,"note":"148/148"},{"command":"npm run lint","exitCode":2}]}\n```', ['S1']);
  assert.equal(ok.approved, true);
  assert.deepEqual(
    ok.checks.map((c) => [c.command, c.ok]),
    [
      ['npm test', true],
      ['npm run lint', false],
    ],
  );
});

test('model vừa báo 429 bị xếp sau model khác cho tới khi gọi thành công lại', async () => {
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'm-a' }, { id: 'm-b' }] }));
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-rate-'));
  const base = loadConfig();
  const app = createApp({
    dataDir,
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['fake'] },
    runtimes: { fake: { type: 'openai-api', baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none' } },
    models: { fake: { sonnet: ['m-a', 'm-b'] } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  });
  try {
    const order = async () => (await app.runtimes.candidates([], 'internal', 'sonnet')).list.map((c) => c.model);
    assert.deepEqual(await order(), ['m-a', 'm-b']);
    app.runtimes.markFailure('fake', 'm-a', 'rate', '[429] rate_limit_error');
    assert.deepEqual(await order(), ['m-b'], 'đang nghỉ ngắn → bỏ qua');
    app.runtimes.health.get('fake::m-a')!.until = Date.now() - 1; // hết thời gian nghỉ ngắn
    const c = await app.runtimes.candidates([], 'internal', 'sonnet');
    assert.deepEqual(c.list.map((x) => x.model), ['m-b', 'm-a'], 'vẫn xếp sau trong khoảng rateBackoffMs');
    assert.deepEqual(c.deferred, ['fake/m-a']);
    app.runtimes.markOk('fake::m-a');
    assert.deepEqual(await order(), ['m-a', 'm-b'], 'gọi thành công lại → về vị trí cũ');
  } finally {
    srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('vòng lặp công cụ: rút gọn lịch sử theo đợt (giữ tiền tố ổn định cho cache) và điểm cache_control', () => {
  const big = 'x'.repeat(15_000);
  const msgs: Array<Record<string, unknown> & { role: string }> = [
    { role: 'system', content: 'hồ sơ' },
    { role: 'user', content: 'việc' },
  ];
  for (let i = 0; i < 5; i++) msgs.push({ role: 'assistant', content: null, tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'read_file', arguments: '{}' } }] }, { role: 'tool', tool_call_id: `c${i}`, content: big });
  assert.equal(compactHistory(msgs), false, '2 kết quả cũ (30k ký tự) < ngưỡng 40k → giữ nguyên');
  msgs.push({ role: 'assistant', content: null, tool_calls: [{ id: 'c5', type: 'function', function: { name: 'read_file', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'c5', content: big });
  assert.equal(compactHistory(msgs), true);
  const tools = msgs.filter((m) => m.role === 'tool').map((m) => String(m.content).length);
  assert.ok(tools.slice(0, 3).every((n) => n < 600), 'kết quả cũ đã rút gọn');
  assert.ok(tools.slice(3).every((n) => n === 15_000), '3 kết quả mới nhất giữ nguyên');

  assert.equal(wantsCacheControl({ cacheControl: true }, 'ninerouter/cc/claude-sonnet-5-5'), true);
  assert.equal(wantsCacheControl({ cacheControl: true }, 'ninerouter/cx/gpt-6-sol'), false);
  assert.equal(wantsCacheControl({}, 'claude-x'), false);
  assert.equal(wantsCacheControl({ cacheControl: 'sol' }, 'cx/gpt-6-sol'), true);
  const context = 'B'.repeat(3000);
  const marked = withCacheMarks(
    [
      { role: 'system', content: 'hồ sơ vị trí' },
      { role: 'user', content: `${context}\n\nviệc riêng` },
      { role: 'assistant', content: null, tool_calls: [] },
      { role: 'tool', tool_call_id: 'c1', content: 'kết quả' },
    ],
    { context, prompt: 'việc riêng' },
    false,
  );
  const parts = (i: number) => marked[i].content as Array<{ text: string; cache_control?: unknown }>;
  assert.ok(parts(0)[0].cache_control);
  assert.equal(parts(1).length, 2);
  assert.ok(parts(1)[0].cache_control && !parts(1)[1].cache_control);
  assert.equal(parts(1)[0].text, context);
  assert.ok(parts(3)[0].cache_control, 'điểm cache di động ở kết quả công cụ mới nhất');
});

test('KPI sub-agent: mẫu đầu ra từ agent.md, chấm từ log, bảng KPI trong báo cáo nhiệm vụ', async () => {
  const { templateHeadings, templateCoverage, computeKpi, kpiReport } = await import('../src/kpi.js');
  const app = testApp({ reviewRejectRate: 1 });
  try {
    const be = app.registry.agent('backend-dev');
    const heads = templateHeadings(be.body);
    assert.ok(heads.length >= 4 && heads[0].startsWith('Tóm tắt'), heads.join(' | '));
    const cov = templateCoverage('## Tóm tắt\nx\n## Tệp đã tạo/sửa\n- a.ts\n## Kiểm chứng\n- `npm test` → pass', heads);
    assert.ok(cov.coverage > 0 && cov.coverage < 1 && cov.missing.length > 0);

    const t = app.orchestrator.submit({ brief: 'Viết API Node.js ghi log kiểm toán', mode: 'department', department: 'dev', options: { discussionRounds: 0 } });
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done');
    const rep = kpiReport(app, { tasks: [t.id] });
    const members = rep.agents.filter((a) => a.subtasks > 0);
    assert.ok(members.length >= 2);
    for (const a of rep.agents) assert.ok(a.score >= 0 && a.score <= 100 && ['A', 'B', 'C', 'D'].includes(a.grade));
    // mock luôn bắt sửa một hạng mục ở lần review đầu → người phụ trách bị ghi nhận 1 lỗi major
    assert.ok(members.some((a) => a.quality.major >= 1 && a.quality.firstPassOk < a.quality.reviewed));
    assert.ok(rep.agents.some((a) => a.reviewer && a.reviewer.reviews >= 1));
    assert.ok(rep.departments.some((d) => d.id === 'dev' && d.score > 0));
    const final = app.store.readRunFile(t.id, 'FINAL.md') ?? '';
    assert.match(final, /### KPI agent trong nhiệm vụ/);
    assert.ok(fs.existsSync(path.join(app.store.runDir(t.id), 'kpi.json')));

    // phát hiện theo ngưỡng: công cụ lỗi nhiều, chạm trần, thiếu mục mẫu đầu ra, không chạy lệnh dù có quyền
    const fake = computeKpi({
      tasks: [{ ...done, id: 'T-k', runs: [{ ...done.runs[0], subtasks: [{ ...done.runs[0].subtasks[0], id: 'S1', assignee: 'backend-dev', attempts: 4 }] }] }],
      calls: () => [
        { ts: '', callId: 'a', taskId: 'T-k', subtaskId: 'S1', department: 'dev', agentId: 'backend-dev', phase: 'execute', runtime: 'x', model: 'm', input: 300000, output: 2000, cacheRead: 0, durationMs: 60000, diag: 'chạm trần 400000 token đầu vào của vòng lặp công cụ sau 15 lượt', turns: 16, text: 'Xong rồi.', tools: Array.from({ length: 10 }, (_, i) => ({ name: 'run_command', args: 'npm test', ok: i > 5, ms: 1, outputChars: 1 })) },
      ],
      transcript: () => [],
      project: () => undefined,
      agent: (id) => app.registry.agents.get(id),
      access: () => 'exec',
    });
    const k = fake.agents.find((a) => a.agentId === 'backend-dev')!;
    const text = k.findings.join('\n');
    assert.match(text, /Thao tác công cụ lỗi nhiều \(6\/10/);
    assert.match(text, /chạm trần vòng công cụ/);
    assert.match(text, /chạy nhiều lần/);
    assert.match(text, /thiếu mục trong "Mẫu đầu ra"/);
    assert.match(text, /không mở đầu bằng "## Tóm tắt"/);
  } finally {
    app.cleanup();
  }
});

test('bằng chứng kiểm chứng: lệnh test/typecheck khác lệnh khảo sát; rg không có kết quả không phải lỗi', async () => {
  const { isCheckCommand, isNoMatch } = await import('../src/tools/workspace.js');
  for (const c of ['npm test', 'cd app/server; npm run typecheck', 'npx tsc --noEmit', 'node --test', 'pnpm lint', 'npx prisma validate', 'pytest -q']) assert.ok(isCheckCommand(c), c);
  for (const c of ['git status --short', "rg -n 'x' src", 'Get-Content a.js', 'ls']) assert.ok(!isCheckCommand(c), c);
  assert.ok(isNoMatch({ name: 'run_command', args: "rg -n 'foo' src", ok: false, error: 'exit code: 1' }));
  assert.ok(!isNoMatch({ name: 'run_command', args: "rg -n 'foo' src/{a,b}", ok: false, error: 'exit code: 2 rg: …' }));
  assert.ok(!isNoMatch({ name: 'run_command', args: 'npm test', ok: false, error: 'exit code: 1' }));
});

test('worktree tách từ nhánh xuất phát (baseRef) thay vì HEAD; ref không an toàn bị từ chối', async () => {
  const { addWorktree, git, isSafeRef } = await import('../src/git.js');
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-base-'));
  const run = (...a: string[]) => assert.ok(git(repo, a).ok, a.join(' '));
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 't@example.invalid');
  run('config', 'user.name', 't');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'main');
  run('add', '.');
  run('commit', '-qm', 'main');
  run('checkout', '-qb', 'feature');
  fs.writeFileSync(path.join(repo, 'b.txt'), 'feature');
  run('add', '.');
  run('commit', '-qm', 'feature');
  // repo đang đứng ở nhánh feature; worktree phải tách từ main
  const wt = path.join(repo + '-wt', 'x');
  const r = addWorktree(repo, wt, 'ccoding/t-1', 'main');
  assert.ok(r.ok, r.out);
  assert.ok(fs.existsSync(path.join(wt, 'a.txt')));
  assert.ok(!fs.existsSync(path.join(wt, 'b.txt')), 'không được mang commit của nhánh đang đứng');
  // mặc định vẫn là HEAD
  const wt2 = path.join(repo + '-wt', 'y');
  assert.ok(addWorktree(repo, wt2, 'ccoding/t-2').ok);
  assert.ok(fs.existsSync(path.join(wt2, 'b.txt')));
  for (const ok of ['origin/main', 'main', 'release/1.2', 'HEAD']) assert.ok(isSafeRef(ok), ok);
  for (const bad of ['-x', '--upload-pack=x', 'a..b', 'a b', '', 'x/', 'a;rm']) assert.ok(!isSafeRef(bad), bad);
  assert.equal(addWorktree(repo, path.join(repo + '-wt', 'z'), 'ccoding/t-3', '--orphan').ok, false);
});

test('API dự án: lưu baseRef, worktreeCopy rỗng, lệnh cấm; từ chối ref/regex không hợp lệ', async () => {
  const { createServer } = await import('../src/server.js');
  const app = testApp();
  const probe = createServer(app);
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
  const port = (probe.address() as AddressInfo).port;
  probe.close();
  app.config.server.port = port;
  const srv = createServer(app);
  await new Promise<void>((r) => srv.listen(port, '127.0.0.1', r));
  const post = (body: object) => fetch(`http://127.0.0.1:${port}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const ok = await post({ id: 'nd-test', name: 'Thử', baseRef: 'origin/main', worktreeCopy: [], denyCommands: ['\\bdocker\\b', ':5434\\b'] });
    assert.equal(ok.status, 201);
    const p = await ok.json();
    assert.equal(p.baseRef, 'origin/main');
    assert.deepEqual(p.worktreeCopy, []);
    assert.equal(p.denyCommands.length, 2);
    // sửa dự án mà không gửi các trường này → giữ nguyên
    const again = await (await post({ id: 'nd-test', name: 'Thử 2' })).json();
    assert.equal(again.baseRef, 'origin/main');
    assert.deepEqual(again.worktreeCopy, []);
    assert.equal((await post({ id: 'nd-bad', name: 'x', baseRef: '--upload-pack=x' })).status, 400);
    assert.equal((await post({ id: 'nd-bad', name: 'x', denyCommands: ['(unclosed'] })).status, 400);
    // lệnh chuẩn bị/kiểm tra: lưu được; lệnh bị chặn bởi danh sách cấm (chung hoặc của dự án) → 400
    const ck = await (await post({ id: 'nd-test', name: 'Thử', setupCommands: ['cd app/server; npm ci'], checkCommands: ['cd app/server; npm test', ' '] })).json();
    assert.deepEqual(ck.checkCommands, ['cd app/server; npm test']);
    assert.deepEqual(ck.setupCommands, ['cd app/server; npm ci']);
    assert.equal((await post({ id: 'nd-test', name: 'Thử', checkCommands: ['docker compose up'] })).status, 400, 'docker bị cấm ở dự án');
    assert.equal((await post({ id: 'nd-test', name: 'Thử', checkCommands: ['git push origin main'] })).status, 400, 'git push bị cấm mặc định');
  } finally {
    srv.close();
  }
});

test('read_file dừng ở ranh giới dòng theo hạn mức ký tự và chỉ offset đọc tiếp (không cắt mất phần giữa)', async () => {
  const { executeTool } = await import('../src/tools/workspace.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-read-'));
  try {
    const lines = Array.from({ length: 420 }, (_, i) => `model M${i + 1} { id String @id // ${'x'.repeat(30)} }`);
    fs.writeFileSync(path.join(root, 'schema.prisma'), lines.join('\n'));
    fs.writeFileSync(path.join(root, 'b.txt'), 'b');
    const policy = { root, allow: ['read_file'] as const, maxOutputChars: 12000, commandTimeoutMs: 1000, denyCommands: [], allowGitCommit: false };
    const r1 = await executeTool('read_file', { paths: ['schema.prisma', 'b.txt'] }, policy as never);
    assert.ok(r1.ok);
    assert.ok(r1.output.length <= 12000, `${r1.output.length}`);
    assert.doesNotMatch(r1.output, /đã lược/);
    const m = /offset=(\d+)/.exec(r1.output);
    assert.ok(m, 'có chỉ dẫn offset đọc tiếp');
    const next = Number(m![1]);
    assert.match(r1.output, new RegExp(`\\b${next - 1}\\| model M${next - 1} `), 'dòng cuối đã đọc liền trước offset');
    assert.match(r1.output, /chưa đọc vì đã hết hạn mức ký tự.*b\.txt/);
    const r2 = await executeTool('read_file', { path: 'schema.prisma', offset: next }, policy as never);
    assert.match(r2.output, new RegExp(`\\b${next}\\| model M${next} `));
    // hạn mức riêng cho read_file: đọc trọn file cỡ vừa trong một lần
    const r3 = await executeTool('read_file', { path: 'schema.prisma', limit: 2000 }, { ...policy, maxReadChars: 40000 } as never);
    assert.match(r3.output, /\b420\| model M420 /);
    assert.doesNotMatch(r3.output, /offset=/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hạng mục chạm trần công cụ khi chưa xong → chạy tiếp với ngữ cảnh mới; hạng mục sau chỉ chạy khi hạng mục trước thật sự xong', async () => {
  const { cappedDone } = await import('../src/runtimes/api.js');
  assert.equal(cappedDone('TRẠNG THÁI: XONG\n## Tóm tắt\nok'), true);
  assert.equal(cappedDone('TRẠNG THÁI: CHƯA XONG — còn migration\n## Tóm tắt'), false);
  assert.equal(cappedDone('## Tóm tắt\nĐã làm một phần'), false);
  const seen: string[] = [];
  const srv = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'm-ok' }] }));
    }
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    const text = (m: { content: unknown }) => (typeof m.content === 'string' ? m.content : '');
    const user = body.messages.filter((m: { role: string }) => m.role === 'user').map(text).join('\n');
    const sys = body.messages.filter((m: { role: string }) => m.role === 'system').map(text).join('\n');
    const who = /\(@([a-z-]+)\)/.exec(sys)?.[1] ?? '?';
    const last = body.messages[body.messages.length - 1];
    const toolMsgs = body.messages.filter((m: { role: string }) => m.role === 'tool').length;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    const say = (s: string) => send({ model: 'm-ok', choices: [{ delta: { content: s }, finish_reason: 'stop' }] });
    const tool = (name: string, args: object) => send({ model: 'm-ok', choices: [{ delta: { tool_calls: [{ index: 0, id: `c${toolMsgs}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });
    if (user.includes('LẬP KẾ HOẠCH'))
      say(`\`\`\`json\n${JSON.stringify({ summary: 'API rồi UI', subtasks: [
        { id: 'S1', title: 'API', assignee: 'backend-dev', description: 'Viết API', dependsOn: [] },
        { id: 'S2', title: 'UI', assignee: 'frontend-dev', description: 'Viết UI', dependsOn: ['S1'] },
      ] })}\n\`\`\``);
    else if (user.includes('REVIEW CHẤT LƯỢNG')) say('```json\n{"approved": true, "summary": "Ổn", "issues": []}\n```');
    else if (user.includes('## Hạng mục của bạn') && who === 'backend-dev') {
      const contd = /CHẠY TIẾP \(lần 1\/2\)/.test(user);
      seen.push(contd ? 'S1-cont' : 'S1');
      if (!contd) {
        if (last.role === 'user' && String(last.content).includes('KHÔNG gọi thêm công cụ')) say('TRẠNG THÁI: CHƯA XONG — còn ghi api.txt\n## Tóm tắt\nMới khảo sát.');
        else tool('list_files', {});
      } else {
        assert.match(user, /Mới khảo sát/, 'lần chạy tiếp nhận bàn giao dở dang');
        if (toolMsgs === 0) tool('write_file', { path: 'api.txt', content: 'api' });
        else say('## Tóm tắt\nĐã ghi api.txt.');
      }
    } else {
      if (user.includes('## Hạng mục của bạn')) seen.push(who);
      say('## Tóm tắt\nXong.');
    }
    send({ choices: [], usage: { prompt_tokens: 400, completion_tokens: 30 } });
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-cont-'));
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-cont-ws-'));
  const base = loadConfig();
  const app = createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['fake'] },
    runtimes: { fake: { type: 'openai-api', baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none', local: false } },
    models: { fake: { opus: ['m-ok'], sonnet: ['m-ok'], haiku: ['m-ok'] } },
    phases: { ...base.phases, toolTurns: { ...base.phases.toolTurns, execute: 3 } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  });
  try {
    app.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: ws, classification: 'internal', toolAccess: 'write', createdAt: new Date().toISOString() });
    const t = app.orchestrator.submit({ brief: 'API + UI', projectId: 'repo', options: { discussionRounds: 0, maxRevisions: 0 } });
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const s1 = done.runs[0].subtasks.find((s) => s.id === 'S1')!;
    assert.equal(s1.status, 'done');
    assert.equal(s1.continuations, 1);
    assert.ok(fs.existsSync(path.join(ws, 'api.txt')), 'lần chạy tiếp ghi được tệp');
    // ranh giới package: dự án trong workspaces/ không kế thừa "type": "module" của CCoding
    const boundary = JSON.parse(fs.readFileSync(path.join(dataDir, 'workspaces', 'package.json'), 'utf8'));
    assert.equal(boundary.type, undefined);
    assert.deepEqual(seen.filter((x, i) => x !== seen[i - 1]), ['S1', 'S1-cont', 'frontend-dev'], 'S2 chỉ chạy sau khi S1 xong thật (mỗi phần tử: các lượt của một lần gọi)');
    assert.ok(app.logs.query({ task: t.id, limit: 2000 }).some((e) => e.kind === 'subtask.continue'));
  } finally {
    srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test('hạng mục vẫn chưa xong sau các lần chạy tiếp → nhiệm vụ "lỗi" (không báo hoàn thành); Tiếp tục thì làm tiếp từ bàn giao dở dang', async () => {
  let finish = false;
  const prompts: string[] = [];
  const srv = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'm-ok' }] }));
    }
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    const text = (m: { content: unknown }) => (typeof m.content === 'string' ? m.content : '');
    const user = body.messages.filter((m: { role: string }) => m.role === 'user').map(text).join('\n');
    const sys = body.messages.filter((m: { role: string }) => m.role === 'system').map(text).join('\n');
    const who = /\(@([a-z-]+)\)/.exec(sys)?.[1] ?? '?';
    const last = body.messages[body.messages.length - 1];
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    const say = (s: string) => send({ model: 'm-ok', choices: [{ delta: { content: s }, finish_reason: 'stop' }] });
    if (user.includes('LẬP KẾ HOẠCH'))
      say(`\`\`\`json\n${JSON.stringify({ summary: 'API rồi UI', subtasks: [
        { id: 'S1', title: 'API', assignee: 'backend-dev', description: 'Viết API', dependsOn: [] },
        { id: 'S2', title: 'UI', assignee: 'frontend-dev', description: 'Viết UI', dependsOn: ['S1'] },
      ] })}\n\`\`\``);
    else if (user.includes('REVIEW CHẤT LƯỢNG')) say('```json\n{"approved": true, "summary": "Ổn", "issues": []}\n```');
    else if (user.includes('## Hạng mục của bạn') && who === 'backend-dev') {
      if (last.role === 'user') prompts.push(user);
      if (finish) say('## Tóm tắt\nĐã xong API.');
      else if (last.role === 'user' && String(last.content).includes('KHÔNG gọi thêm công cụ')) say('TRẠNG THÁI: CHƯA XONG — còn route POST\n## Tóm tắt\nĐã viết model, còn route.');
      else send({ model: 'm-ok', choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'list_files', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] });
    } else say('## Tóm tắt\nXong.');
    send({ choices: [], usage: { prompt_tokens: 400, completion_tokens: 30 } });
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-inc-'));
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-inc-ws-'));
  const base = loadConfig();
  const app = createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['fake'] },
    runtimes: { fake: { type: 'openai-api', baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none', local: false } },
    models: { fake: { opus: ['m-ok'], sonnet: ['m-ok'], haiku: ['m-ok'] } },
    phases: { ...base.phases, toolTurns: { ...base.phases.toolTurns, execute: 2 }, maxContinuations: 1 },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  });
  try {
    app.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: ws, classification: 'internal', toolAccess: 'write', createdAt: new Date().toISOString() });
    const t = app.orchestrator.submit({ brief: 'API + UI', projectId: 'repo', options: { discussionRounds: 0, maxRevisions: 0 } });
    const first = await app.orchestrator.waitFor(t.id);
    assert.equal(first.status, 'failed', 'không báo hoàn thành khi còn hạng mục dở');
    assert.match(first.error ?? '', /S1 \(dừng giữa chừng\).*S2 \(bỏ qua vì phụ thuộc\)/);
    const s1 = first.runs[0].subtasks.find((s) => s.id === 'S1')!;
    assert.equal(s1.incomplete, true);
    assert.equal(s1.continuations, 1);
    assert.ok(app.orchestrator.alerts.some((a) => a.kind === 'task.unfinished'));
    finish = true;
    prompts.length = 0;
    app.orchestrator.resume(t.id, { budgetMode: 'complete' });
    const second = await app.orchestrator.waitFor(t.id);
    assert.equal(second.status, 'done', second.error);
    assert.match(prompts[0] ?? '', /Nhiệm vụ vừa được tiếp tục/);
    assert.match(prompts[0] ?? '', /Đã viết model, còn route/, 'mang theo bàn giao dở dang');
    assert.equal(second.runs[0].subtasks.find((s) => s.id === 'S1')!.incomplete, undefined);
    assert.equal(second.runs[0].subtasks.find((s) => s.id === 'S2')!.status, 'done');
  } finally {
    srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test('vòng công cụ: đọc trùng không gửi lại nội dung; chưa ghi tệp khi đã dùng ~35%/65% lượt thì bị nhắc dừng khảo sát', async () => {
  const nudges: number[] = [];
  const toolOutputs: string[] = [];
  let calls = 0;
  const srv = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    calls++;
    const msgs = body.messages as Array<{ role: string; content: unknown }>;
    const last = msgs[msgs.length - 1];
    if (last.role === 'tool') toolOutputs.push(String(last.content));
    if (last.role === 'user' && /CHƯA ghi tệp nào|chưa ghi tệp nào/.test(String(last.content))) nudges.push(calls);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    if (last.role === 'user' && String(last.content).includes('KHÔNG gọi thêm công cụ')) send({ choices: [{ delta: { content: 'TRẠNG THÁI: CHƯA XONG — chưa ghi\n## Tóm tắt\nx' }, finish_reason: 'stop' }] });
    else send({ choices: [{ delta: { tool_calls: [{ index: 0, id: `c${calls}`, function: { name: 'read_file', arguments: JSON.stringify({ path: 'a.txt' }) } }] }, finish_reason: 'tool_calls' }] });
    send({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 10 } });
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-nudge-'));
  fs.writeFileSync(path.join(root, 'a.txt'), 'nội dung A');
  try {
    const { OpenAiApiRuntime } = await import('../src/runtimes/api.js');
    const { parseAgent } = await import('../src/registry.js');
    const rt = new OpenAiApiRuntime({ baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none' }, {}, 'nudge');
    const agent = parseAgent('a.md', '---\nid: backend-dev\nname: Backend\ndepartment: dev\nrole: member\n---\nbody');
    const r = await rt.run(
      {
        agent, phase: 'execute', system: 's', prompt: 'p', model: 'm', cwd: root, tools: [], allowTools: true, timeoutMs: 10000,
        toolPolicy: { root, allow: ['read_file', 'write_file'], maxTurns: 10, commandTimeoutSec: 10, maxOutputChars: 2000, denyCommands: [], allowGitCommit: false, expectWrites: true },
        meta: { taskId: 'T-x', department: 'dev', callId: 'c1' },
      },
      {},
    );
    assert.equal(r.capped, 'turns');
    assert.match(toolOutputs[0], /nội dung A/);
    assert.ok(toolOutputs.slice(1).every((o) => /Đã đọc đúng nội dung này ở lượt 1/.test(o)), 'các lần đọc lại trả ghi chú ngắn');
    assert.equal(nudges.length, 2, 'nhắc hai lần (≈35% và ≈65%)');
    assert.match(r.diag ?? '', /nhắc ghi tệp lần 1 ở lượt 4.*nhắc ghi tệp lần 2 ở lượt 7/);
  } finally {
    srv.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('lỗi giữa vòng công cụ sau khi đã ghi workspace (vd. 429) → lần thử trên runtime khác nhận danh sách thao tác đã làm để làm tiếp', async () => {
  const prompts: string[] = [];
  const mk = (name: 'a' | 'b') =>
    http.createServer(async (req, res) => {
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ data: [{ id: `m-${name}` }] }));
      }
      let raw = '';
      for await (const c of req) raw += c;
      const body = JSON.parse(raw);
      const text = (m: { content: unknown }) => (typeof m.content === 'string' ? m.content : '');
      const user = body.messages.filter((m: { role: string }) => m.role === 'user').map(text).join('\n');
      const toolMsgs = body.messages.filter((m: { role: string }) => m.role === 'tool').length;
      const executing = user.includes('## Hạng mục của bạn');
      if (name === 'a' && executing && toolMsgs >= 1) {
        res.writeHead(429, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: { type: 'rate_limit_error', message: 'rate limited' } }));
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      const say = (s: string) => send({ model: `m-${name}`, choices: [{ delta: { content: s }, finish_reason: 'stop' }] });
      if (user.includes('LẬP KẾ HOẠCH')) say(`\`\`\`json\n${JSON.stringify({ summary: 'Một việc', subtasks: [{ id: 'S1', title: 'API', assignee: 'backend-dev', description: 'Viết API', dependsOn: [] }] })}\n\`\`\``);
      else if (user.includes('REVIEW CHẤT LƯỢNG')) say('```json\n{"approved": true, "summary": "Ổn", "issues": []}\n```');
      else if (executing && name === 'a') send({ model: 'm-a', choices: [{ delta: { tool_calls: [{ index: 0, id: 'w1', type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: 'api.js', content: 'module.exports = 1;' }) } }] }, finish_reason: 'tool_calls' }] });
      else {
        if (executing) prompts.push(user);
        say('## Tóm tắt\nXong.');
      }
      send({ choices: [], usage: { prompt_tokens: 300, completion_tokens: 20 } });
      res.end('data: [DONE]\n\n');
    });
  const sa = mk('a');
  const sb = mk('b');
  await new Promise<void>((r) => sa.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => sb.listen(0, '127.0.0.1', r));
  const url = (s: http.Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}/v1`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-ho-'));
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-ho-ws-'));
  const base = loadConfig();
  const app = createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['a', 'b'] },
    runtimes: { a: { type: 'openai-api', baseUrl: url(sa), tags: 'none', local: false }, b: { type: 'openai-api', baseUrl: url(sb), tags: 'none', local: false } },
    models: { a: { opus: ['m-a'], sonnet: ['m-a'], haiku: ['m-a'] }, b: { opus: ['m-b'], sonnet: ['m-b'], haiku: ['m-b'] } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  });
  try {
    app.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: ws, classification: 'internal', toolAccess: 'write', createdAt: new Date().toISOString() });
    const t = app.orchestrator.submit({ brief: 'API', projectId: 'repo', options: { discussionRounds: 0, maxRevisions: 0 } });
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.ok(fs.existsSync(path.join(ws, 'api.js')));
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /Lần thử trước bị ngắt giữa chừng/);
    assert.match(prompts[0], /write_file .*api\.js/);
  } finally {
    sa.close();
    sb.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test('luồng trả lời treo (không byte nào trong idleTimeoutMs) → lỗi "timeout" ngay, không chờ hết 30 phút', async () => {
  const srv = http.createServer(async (req, res) => {
    for await (const _ of req) void _;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ model: 'm', choices: [{ delta: { content: 'Bắt đầu…' } }] })}\n\n`);
    // rồi im lặng — không đóng kết nối
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const { OpenAiApiRuntime } = await import('../src/runtimes/api.js');
    const { parseAgent } = await import('../src/registry.js');
    const rt = new OpenAiApiRuntime({ baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none', idleTimeoutMs: 400 }, {}, 'idle');
    const agent = parseAgent('a.md', '---\nid: backend-dev\nname: Backend\ndepartment: dev\nrole: member\n---\nbody');
    const t0 = Date.now();
    await assert.rejects(
      rt.run({ agent, phase: 'execute', system: 's', prompt: 'p', model: 'm', cwd: os.tmpdir(), tools: [], allowTools: false, timeoutMs: 60_000, meta: { taskId: 'T-x', department: 'dev', callId: 'c1' } }, {}),
      (e: { kind?: string; message?: string }) => e.kind === 'timeout' && /treo/.test(e.message ?? ''),
    );
    assert.ok(Date.now() - t0 < 5000, `${Date.now() - t0} ms`);
  } finally {
    srv.closeAllConnections?.();
    srv.close();
  }
});

/** Gateway giả cho kiểm thử lệnh kiểm tra của dự án: S1 ghi broken.flag="broken", vòng sửa ghi "fixed". */
async function checksGateway(approve: boolean) {
  const prompts: { review: string[]; revise: string[]; execute: string[] } = { review: [], revise: [], execute: [] };
  const srv = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'm-ok' }] }));
    }
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    const text = (m: { content: unknown }) => (typeof m.content === 'string' ? m.content : '');
    const user = body.messages.filter((m: { role: string }) => m.role === 'user').map(text).join('\n');
    const toolMsgs = body.messages.filter((m: { role: string }) => m.role === 'tool').length;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    const say = (s: string) => send({ model: 'm-ok', choices: [{ delta: { content: s }, finish_reason: 'stop' }] });
    const write = (content: string) => send({ model: 'm-ok', choices: [{ delta: { tool_calls: [{ index: 0, id: `w${toolMsgs}`, type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: 'broken.flag', content }) } }] }, finish_reason: 'tool_calls' }] });
    if (user.includes('LẬP KẾ HOẠCH')) say(`\`\`\`json\n${JSON.stringify({ summary: 'Một việc', subtasks: [{ id: 'S1', title: 'API', assignee: 'backend-dev', description: 'Viết API', dependsOn: [] }] })}\n\`\`\``);
    else if (user.includes('REVIEW CHẤT LƯỢNG')) {
      prompts.review.push(user);
      say(`\`\`\`json\n${JSON.stringify({ approved: approve, summary: approve ? 'Ổn' : 'Chưa đạt', issues: approve ? [] : [{ subtask: 'S1', severity: 'major', comment: 'thiếu test' }] })}\n\`\`\``);
    } else if (user.includes('SỬA THEO REVIEW')) {
      if (toolMsgs === 0) prompts.revise.push(user);
      if (toolMsgs === 0) write('fixed');
      else say('## Tóm tắt\nĐã sửa.');
    } else if (user.includes('## Hạng mục của bạn')) {
      if (toolMsgs === 0) prompts.execute.push(user);
      if (toolMsgs === 0) write('broken');
      else say('## Tóm tắt\nXong API.');
    } else say('## Tóm tắt\nXong.');
    send({ choices: [], usage: { prompt_tokens: 300, completion_tokens: 20 } });
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, prompts, url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1` };
}

function checksApp(url: string, dataDir: string) {
  const base = loadConfig();
  return createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['fake'] },
    runtimes: { fake: { type: 'openai-api', baseUrl: url, tags: 'none', local: false } },
    models: { fake: { opus: ['m-ok'], sonnet: ['m-ok'], haiku: ['m-ok'] } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  });
}

test('CCoding tự chạy lệnh chuẩn bị + kiểm tra của dự án: baseline, sau thực thi, sau sửa; hỏng sau khi sửa → không duyệt dù reviewer duyệt', async () => {
  const gw = await checksGateway(true);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-chk-'));
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-chk-ws-'));
  fs.writeFileSync(path.join(ws, 'check.js'), "const fs=require('fs');const f='broken.flag';if(fs.existsSync(f)&&fs.readFileSync(f,'utf8')==='broken'){console.log('tests 3 pass 2 fail 1');process.exit(1)}console.log('tests 3 pass 3 fail 0')");
  const app = checksApp(gw.url, dataDir);
  try {
    app.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: ws, classification: 'internal', toolAccess: 'exec', setupCommands: ["node -e \"require('fs').writeFileSync('setup.ok','1')\""], checkCommands: ['node check.js'], createdAt: new Date().toISOString() });
    const t = app.orchestrator.submit({ brief: 'API', projectId: 'repo', options: { discussionRounds: 0, maxRevisions: 1 } });
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.ok(fs.existsSync(path.join(ws, 'setup.ok')), 'lệnh chuẩn bị đã chạy');
    const pc = done.projectChecks!;
    assert.equal(pc.setupDone, true);
    assert.equal(pc.baseline?.[0].ok, true);
    assert.match(pc.baseline?.[0].summary ?? '', /fail 0/);
    assert.equal(pc.latestAfter, 'revise');
    assert.equal(pc.latest?.[0].ok, true, 'sau vòng sửa lệnh kiểm tra đạt lại');
    // agent thấy baseline đo sẵn; reviewer thấy lệnh hỏng sau thực thi
    assert.match(gw.prompts.execute[0], /Lệnh kiểm tra của dự án \(CCoding tự chạy/);
    assert.match(gw.prompts.execute[0], /KHÔNG đo lại baseline/);
    assert.match(gw.prompts.review[0], /node check\.js` → exit 1 — tests 3 pass 2 fail 1/);
    // reviewer "duyệt" nhưng lệnh hỏng sau khi sửa → CCoding không duyệt, giao sửa cho S1
    assert.equal(gw.prompts.revise.length, 1);
    assert.match(gw.prompts.revise[0], /đạt trước khi sửa nhưng lỗi sau khi sửa/);
    assert.ok(app.orchestrator.alerts.some((a) => a.kind === 'checks.regression'));
    assert.equal(done.runs[0].review?.approved, true, 'review lần 2 duyệt sau khi đạt lại');
    assert.equal(done.runs[0].review?.verified, true, 'có bằng chứng do CCoding chạy');
    assert.equal(done.attention, undefined);
    const fin = app.store.readRunFile(t.id, 'FINAL.md') ?? '';
    assert.match(fin, /Lệnh kiểm tra của dự án \(CCoding tự chạy\)/);
    assert.match(app.store.transcript(t.id).map((m) => m.text).join('\n'), /🧪 Lệnh kiểm tra của dự án \(trước khi sửa\)/);
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test('review cuối chưa duyệt → nhiệm vụ xong nhưng gắn cờ "cần xem" + cảnh báo; lệnh kiểm tra bị chặn thì không chạy', async () => {
  const gw = await checksGateway(false);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-att-'));
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-att-ws-'));
  fs.writeFileSync(path.join(ws, 'check.js'), "console.log('tests 1 pass 1 fail 0')");
  const app = checksApp(gw.url, dataDir);
  try {
    app.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: ws, classification: 'internal', toolAccess: 'exec', denyCommands: ['\\bdocker\\b'], checkCommands: ['node check.js', 'docker ps'], createdAt: new Date().toISOString() });
    const t = app.orchestrator.submit({ brief: 'API', projectId: 'repo', options: { discussionRounds: 0, maxRevisions: 0 } });
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(done.attention?.reason, 'review');
    assert.ok(app.orchestrator.alerts.some((a) => a.kind === 'task.attention'));
    const docker = done.projectChecks?.baseline?.find((r) => r.command === 'docker ps');
    assert.ok(docker?.denied, 'lệnh bị chặn theo danh sách cấm của dự án');
    assert.match(app.store.readRunFile(t.id, 'FINAL.md') ?? '', /Cần xem lại/);
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test('chặn đọc/tìm tệp qua shell khi đã có read_file/search; lọc đầu ra của lệnh test vẫn được', async () => {
  const { shellReadReason, executeTool } = await import('../src/tools/workspace.js');
  for (const c of [
    'Get-Content app/server/prisma/schema.prisma -Encoding utf8 | Select-Object -First 230',
    'cd app/server; $l = Get-Content server.js -Encoding utf8; $l[39..110]',
    '(Get-Content a.js).Length',
    'cat src/server.js',
    "rg -n 'decree' app/server/src",
    'Select-String -Path src/permissions.js -Pattern ALL_UNITS',
    "foreach($x in $f){ $i=0; Get-Content $x -Encoding utf8 | ForEach-Object { $i++ } }",
    '$t=[IO.File]::ReadAllText((Resolve-Path $f))',
  ])
    assert.ok(shellReadReason(c), c);
  for (const c of [
    'cd app/server; npm test 2>&1 | Select-String -Pattern "^ℹ (tests|pass|fail)"',
    'npm ci 2>&1 | Select-Object -Last 8',
    'git status --short; git log --oneline -3',
    'git grep -n decree',
    'npx prisma validate',
    'node --test src/decree.test.js',
    '$o = npm test 2>&1 | Out-String; $o | Select-String "fail"',
  ])
    assert.equal(shellReadReason(c), undefined, c);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-shellread-'));
  try {
    const base = { root, maxOutputChars: 2000, commandTimeoutSec: 10, denyCommands: [], allowGitCommit: false, maxTurns: 5 };
    const r = await executeTool('run_command', { command: 'cat a.txt' }, { ...base, allow: ['read_file', 'run_command'] } as never);
    assert.equal(r.ok, false);
    assert.match(r.output, /dùng read_file/);
    // không có read_file (vd. runtime chỉ chạy lệnh) thì không chặn
    const r2 = await executeTool('run_command', { command: 'cat missing.txt' }, { ...base, allow: ['run_command'] } as never);
    assert.doesNotMatch(r2.output, /dùng read_file/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
