import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createServer } from '../src/server.js';
import { systemFor } from '../src/prompts.js';
import { pickRateHeaders } from '../src/runtimes/api.js';
import { readJsonl } from '../src/util/fsx.js';
import { testApp } from './helpers.js';

async function serve(app: ReturnType<typeof testApp>) {
  const srv = createServer(app);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as AddressInfo).port;
  app.config.server.port = port;
  srv.close();
  const srv2 = createServer(app);
  await new Promise<void>((r) => srv2.listen(port, '127.0.0.1', r));
  const base = `http://127.0.0.1:${port}`;
  const json = (path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') =>
    fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { srv: srv2, base, json };
}

test('giao việc riêng cho một agent: bỏ định tuyến/lập kế hoạch/họp, một hạng mục, có review, báo cáo từ bàn giao', async () => {
  const app = testApp();
  try {
    assert.throws(() => app.orchestrator.submit({ brief: 'x', mode: 'agent', agentId: 'orchestrator' }), /không thuộc phòng ban/);
    assert.throws(() => app.orchestrator.submit({ brief: 'x', mode: 'agent', agentId: 'khong-co' }), /Agent không hợp lệ/);
    const t = app.orchestrator.submit({ brief: 'Viết hàm kiểm tra email hợp lệ kèm test', agentId: 'backend-dev', options: { discussionRounds: 2 } });
    assert.equal(t.mode, 'agent');
    assert.equal(t.department, 'dev');
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(done.runs.length, 1);
    assert.deepEqual(done.runs[0].subtasks.map((s) => [s.id, s.assignee, s.status]), [['S1', 'backend-dev', 'done']]);
    const phases = readJsonl<{ taskId: string; phase: string; agentId: string }>(`${app.config.dataDir}/usage/ledger.jsonl`).filter((r) => r.taskId === t.id).map((r) => `${r.phase}:${r.agentId}`);
    assert.ok(!phases.some((p) => /^(route|plan|discuss|finalize|synthesize):/.test(p)), phases.join(', '));
    assert.ok(phases.includes('execute:backend-dev'));
    assert.ok(phases.includes('review:qa-tester'), 'reviewer của phòng vẫn review');
    const final = app.store.readRunFile(t.id, done.finalPath ?? 'FINAL.md') ?? '';
    assert.match(final, /Việc giao riêng cho/);
    // reviewer giao việc riêng cho chính mình → không tự review
    const t2 = app.orchestrator.submit({ brief: 'Viết kế hoạch kiểm thử', agentId: 'qa-tester' });
    const d2 = await app.orchestrator.waitFor(t2.id);
    assert.equal(d2.status, 'done');
    assert.equal(d2.runs[0].review, undefined);
  } finally {
    app.cleanup();
  }
});

test('góp ý cho agent: lưu, bật/tắt, đưa vào hồ sơ (system prompt) ở lượt sau; thư viện prompt; hạn mức', async () => {
  const app = testApp();
  const { srv, json } = await serve(app);
  try {
    assert.equal((await json('/api/agents/khong-co/feedback', { text: 'x' })).status, 404);
    assert.equal((await json('/api/agents/backend-dev/feedback', {})).status, 400);
    const r = await json('/api/agents/backend-dev/feedback', { text: 'Luôn viết test trước khi sửa route', rating: 'up' });
    assert.equal(r.status, 201);
    const f = await r.json();
    const list = await (await json('/api/agents/backend-dev/feedback')).json();
    assert.equal(list.length, 1);
    assert.deepEqual(app.store.activeFeedback('backend-dev').map((x) => x.text), ['Luôn viết test trước khi sửa route']);
    const sys = systemFor(app.registry.agent('backend-dev'), app.registry.department('dev'), 'internal', 'execute', ['👍 Luôn viết test trước khi sửa route']);
    assert.match(sys, /## Góp ý của giám đốc \(Tom\) dành cho bạn[^\n]*\n- 👍 Luôn viết test/);
    assert.doesNotMatch(systemFor(app.registry.agent('backend-dev'), app.registry.department('dev'), 'internal', 'execute'), /Góp ý của giám đốc/);
    // tắt góp ý → không còn trong danh sách đang bật
    assert.equal((await json(`/api/agents/backend-dev/feedback/${f.id}`, { active: false })).status, 200);
    assert.deepEqual(app.store.activeFeedback('backend-dev'), []);
    assert.equal((await json(`/api/agents/backend-dev/feedback/${f.id}`, undefined, 'DELETE')).status, 200);
    // log góp ý không chứa nội dung
    assert.ok(app.logs.query({ agent: 'backend-dev', limit: 50 }).some((e) => e.kind === 'agent.feedback' && !e.msg.includes('Luôn viết test')));

    // thư viện prompt
    assert.equal((await json('/api/prompts', { title: '', body: 'x' })).status, 400);
    const pr = await (await json('/api/prompts', { title: 'Sửa lỗi', body: '## Mục tiêu\nSửa lỗi …', tags: ['dev'], mode: 'agent', agentId: 'backend-dev' })).json();
    assert.equal(pr.uses, 0);
    const upd = await json('/api/prompts', { id: pr.id, title: 'Sửa lỗi (bản 2)', body: 'mới' });
    assert.equal(upd.status, 200);
    assert.equal((await (await json(`/api/prompts/${pr.id}/use`, {})).json()).uses, 1);
    const all = await (await json('/api/prompts')).json();
    assert.deepEqual(all.map((x: any) => [x.title, x.uses, x.createdAt === pr.createdAt]), [['Sửa lỗi (bản 2)', 1, true]]);
    assert.equal((await json(`/api/prompts/${pr.id}`, undefined, 'DELETE')).status, 200);

    // hạn mức: theo runtime, không lộ khóa
    const q = await (await json('/api/quota')).json();
    assert.ok(q.runtimes.some((x: any) => x.id === 'mock'));
    assert.ok(!JSON.stringify(q).match(/sk-|gsk_|csk-/));
    for (const x of q.runtimes) assert.ok(!('key' in x) && !('apiKey' in x));

    // giao việc riêng qua API
    const t = await (await json('/api/tasks', { brief: 'Viết README', mode: 'agent', agentId: 'devops' })).json();
    assert.equal(t.agentId, 'devops');
    await app.orchestrator.waitFor(t.id);
  } finally {
    srv.close();
    app.cleanup();
  }
});

test('header giới hạn của nhà cung cấp: chỉ giữ x-ratelimit-* / retry-after', () => {
  const h = new Headers({ 'x-ratelimit-remaining-tokens-day': '812345', 'x-ratelimit-limit-requests': '30', 'retry-after': '12', authorization: 'Bearer secret-value', 'set-cookie': 'a=b' });
  assert.deepEqual(pickRateHeaders(h), { 'retry-after': '12', 'x-ratelimit-limit-requests': '30', 'x-ratelimit-remaining-tokens-day': '812345' });
});

test('chỉ dẫn bổ sung cho nhiệm vụ đang chạy (vào bối cảnh các lượt sau) và giao việc tiếp nối', async () => {
  const { planPrompt } = await import('../src/prompts.js');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const app = testApp();
  try {
    const t = app.orchestrator.submit({ brief: 'Viết tài liệu hướng dẫn cài đặt', agentId: 'devops' });
    const noted = app.orchestrator.addNote(t.id, 'Nhớ thêm mục gỡ cài đặt');
    assert.equal(noted.notes?.length, 1);
    assert.throws(() => app.orchestrator.addNote(t.id, '   '), /trống/);
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done');
    assert.ok(app.store.transcript(t.id).some((m) => m.kind === 'note' && m.from === 'director' && m.text.includes('gỡ cài đặt')));
    assert.throws(() => app.orchestrator.addNote(t.id, 'muộn rồi'), /Giao việc tiếp nối/);
    const ctx = { task: done, dept: app.registry.department('dev'), cwd: '/w', roster: app.registry.members('dev') };
    assert.match(planPrompt(ctx).context, /## Chỉ dẫn bổ sung của giám đốc[^\n]*\n- \([^)]+\) Nhớ thêm mục gỡ cài đặt/);
    // tiếp nối: kế thừa chế độ + agent, báo cáo trước vào inputs
    const f = app.orchestrator.submit({ brief: 'Bổ sung phần cấu hình proxy', followUp: t.id });
    assert.equal(f.mode, 'agent');
    assert.equal(f.agentId, 'devops');
    assert.equal(f.followUpOf, t.id);
    assert.match(f.brief, new RegExp(`Tiếp nối nhiệm vụ ${t.id}`));
    const prev = fs.readFileSync(path.join(app.store.runDir(f.id), 'inputs', 'NHIEM-VU-TRUOC.md'), 'utf8');
    assert.match(prev, /## Báo cáo của nhiệm vụ trước\n> Việc giao riêng/);
    assert.equal((await app.orchestrator.waitFor(f.id)).status, 'done');
    assert.throws(() => app.orchestrator.submit({ brief: 'x', followUp: 'T-khong-co' }), /để tiếp nối/);
  } finally {
    app.cleanup();
  }
});

test('giám đốc duyệt / yêu cầu sửa bằng tay: sửa theo yêu cầu + review lại; không reviewer thì chờ giám đốc; duyệt bỏ cờ cần xem', async () => {
  const app = testApp();
  try {
    const t = app.orchestrator.submit({ brief: 'Viết hàm chuẩn hóa số điện thoại kèm test', agentId: 'backend-dev' });
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const before = done.runs[0].subtasks[0].attempts;
    assert.throws(() => app.orchestrator.reviewDecision(t.id, { decision: 'reject', note: '  ' }), /Ghi rõ cần sửa/);
    const r = app.orchestrator.reviewDecision(t.id, { decision: 'reject', note: 'Thêm trường hợp số có mã quốc gia +84' });
    assert.ok(['queued', 'running'].includes(r.status), r.status);
    assert.equal(r.runs[0].review?.by, 'director');
    assert.throws(() => app.orchestrator.reviewDecision(t.id, { decision: 'approve' }), /đang chạy/);
    const again = await app.orchestrator.waitFor(t.id);
    assert.equal(again.status, 'done', again.error);
    assert.equal(again.runs[0].subtasks[0].attempts, before + 1, 'chạy đúng một vòng sửa');
    const tr = app.store.transcript(t.id);
    assert.ok(tr.some((m) => m.from === 'director' && m.kind === 'decision' && /yêu cầu sửa S1: Thêm trường hợp/.test(m.text)));
    assert.ok(tr.some((m) => m.kind === 'system' && /Sửa theo yêu cầu của giám đốc: S1/.test(m.text)));
    const reviews = tr.filter((m) => m.kind === 'review' && m.from === 'qa-tester');
    assert.ok(reviews.length >= 2, 'reviewer duyệt lại sau khi sửa');
    // reviewer tự làm (không có reviewer khác) → sửa xong chờ giám đốc xem
    const q = app.orchestrator.submit({ brief: 'Viết kế hoạch kiểm thử đăng nhập', agentId: 'qa-tester' });
    assert.equal((await app.orchestrator.waitFor(q.id)).status, 'done');
    app.orchestrator.reviewDecision(q.id, { decision: 'reject', note: 'Bổ sung ca khóa tài khoản sau 5 lần sai' });
    const q2 = await app.orchestrator.waitFor(q.id);
    assert.equal(q2.status, 'done', q2.error);
    assert.equal(q2.attention?.reason, 'review');
    assert.match(q2.attention?.detail ?? '', /chờ giám đốc xem/);
    // duyệt bằng tay → bỏ cờ, review ghi nhận giám đốc
    const ok = app.orchestrator.reviewDecision(q.id, { decision: 'approve', note: 'Đủ dùng' });
    assert.equal(ok.attention, undefined);
    assert.equal(ok.runs[0].review?.approved, true);
    assert.equal(ok.runs[0].review?.by, 'director');
    assert.ok(app.store.transcript(q.id).some((m) => m.from === 'director' && /Giám đốc duyệt kết quả: Đủ dùng/.test(m.text)));
    // API
    const { srv, json } = await serve(app);
    try {
      assert.equal((await json(`/api/tasks/${q.id}/review`, { decision: 'xyz' })).status, 409);
      assert.equal((await json(`/api/tasks/${q.id}/review`, { decision: 'approve' })).status, 200);
    } finally {
      srv.close();
    }
  } finally {
    app.cleanup();
  }
});

test('việc cần sửa: chấm bản cuối mỗi hạng mục; tự hết sau 2 nhiệm vụ sạch; đánh dấu đã sửa (tái diễn nếu lặp lại); góp ý liên kết tự xóa', async () => {
  const { computeKpi, applyResolutions, templateHeadings, clearFixedFeedback } = await import('../src/kpi.js');
  type Src = Parameters<typeof computeKpi>[0];
  const app = testApp();
  try {
    const full = templateHeadings(app.registry.agent('backend-dev').body).map((h) => `## ${h}\nnội dung`).join('\n');
    const tool = (ok: boolean) => ({ name: 'write_file', args: 'a', ok, ms: 1, outputChars: 1, error: ok ? undefined : 'lỗi' });
    const tools = (fail: number) => Array.from({ length: 6 }, (_, i) => tool(i >= fail));
    const call = (taskId: string, phase: string, text: string, t: ReturnType<typeof tool>[]) => ({ ts: '', callId: `${taskId}-${phase}`, taskId, subtaskId: 'S1', department: 'dev', agentId: 'backend-dev', phase, runtime: 'x', model: 'm', input: 1000, output: 100, cacheRead: 0, durationMs: 1000, text, tools: t });
    const calls: Record<string, ReturnType<typeof call>[]> = {
      A: [call('A', 'execute', 'Xong.', tools(4)), call('A', 'revise', full, [])],
      B: [call('B', 'execute', full, tools(0))],
      C: [call('C', 'execute', full, tools(0))],
      D: [call('D', 'execute', full, tools(4))],
      E: [call('E', 'execute', full, tools(4))],
    };
    const day: Record<string, string> = { A: '01', B: '02', C: '03', D: '04', E: '06' };
    const src = (ids: string[]): Src => ({
      tasks: ids.map((id) => ({ id, title: id, status: 'done', createdAt: `2026-10-${day[id]}T00:00:00Z`, updatedAt: '', runs: [], options: { budgetTokens: 1e6 } })) as unknown as Src['tasks'],
      calls: (id) => calls[id] ?? [],
      transcript: () => [],
      project: () => undefined,
      agent: (id) => app.registry.agents.get(id),
      access: () => 'read',
    });
    const s1 = src(['A', 'B', 'C']);
    const r1 = computeKpi(s1);
    const k1 = r1.agents.find((a) => a.agentId === 'backend-dev')!;
    assert.ok(k1.findingKeys.includes('tools-fail'), k1.findings.join('\n'));
    assert.ok(!k1.findingKeys.includes('template') && !k1.findingKeys.includes('summary'), 'thiếu mục ở lần đầu nhưng đã sửa ở vòng sau → không tính');
    applyResolutions(r1, s1, {});
    assert.ok(!k1.findingKeys.includes('tools-fail'), 'tự hết: 2 nhiệm vụ sau đó không còn lỗi');
    assert.equal(k1.resolved?.find((r) => r.key === 'tools-fail')?.how, 'auto');
    assert.equal(k1.findings.length, k1.findingKeys.length);
    // đánh dấu đã sửa trước E nhưng E vẫn lỗi → tái diễn; đánh dấu sau E → ẩn
    const s2 = src(['D', 'E']);
    const r2 = applyResolutions(computeKpi(s2), s2, { 'backend-dev': { 'tools-fail': { at: '2026-10-05T00:00:00Z' } } });
    const k2 = r2.agents.find((a) => a.agentId === 'backend-dev')!;
    assert.deepEqual(k2.recurred, ['tools-fail']);
    assert.match(k2.findings[k2.findingKeys.indexOf('tools-fail')], /^↻ Tái diễn sau khi đánh dấu đã sửa \(2026-10-05\)/);
    const r3 = applyResolutions(computeKpi(s2), s2, { 'backend-dev': { 'tools-fail': { at: '2026-10-07T00:00:00Z', note: 'đã thêm bước dò môi trường' } } });
    const k3 = r3.agents.find((a) => a.agentId === 'backend-dev')!;
    assert.ok(!k3.findingKeys.includes('tools-fail'));
    assert.equal(k3.resolved?.[0].how, 'manual');
    // góp ý tạo từ mục KPI tự xóa khi mục không còn; góp ý thường giữ nguyên
    app.store.addFeedback('backend-dev', { text: 'Việc cần sửa (KPI): …', finding: 'tools-fail' });
    app.store.addFeedback('backend-dev', { text: 'Viết commit message tiếng Việt' });
    const cleared = clearFixedFeedback(app, ['backend-dev']);
    assert.equal(cleared.length, 1);
    assert.deepEqual(app.store.feedback('backend-dev').map((f) => f.text), ['Viết commit message tiếng Việt']);
    // API
    const { srv, json } = await serve(app);
    try {
      assert.equal((await json('/api/kpi/resolve', { agentId: 'backend-dev', key: 'khong-co' })).status, 400);
      assert.equal((await json('/api/kpi/resolve', { agentId: 'backend-dev', key: 'template', note: 'rút gọn mẫu' })).status, 200);
      assert.equal(app.store.kpiResolutions()['backend-dev'].template.note, 'rút gọn mẫu');
      assert.equal((await json('/api/kpi/resolve', { agentId: 'backend-dev', key: 'template', undo: true })).status, 200);
      assert.equal(app.store.kpiResolutions()['backend-dev'], undefined);
      const fb = await json('/api/agents/backend-dev/feedback', { text: 'nhắc', finding: 'template' });
      assert.equal(((await fb.json()) as { finding?: string }).finding, 'template');
      assert.equal((await json('/api/kpi')).status, 200);
    } finally {
      srv.close();
    }
  } finally {
    app.cleanup();
  }
});
