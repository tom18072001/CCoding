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
