import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { templateHeadings } from '../src/kpi.js';
import { testApp } from './helpers.js';

// K3 (S4): vòng bổ sung sau nghiệm thu. Runtime giả; lượt accept do test điều khiển qua `replies`.

type Crit = { name: string; result: 'pass' | 'fail'; evidence: string; scope?: 'in' | 'decision' };
const reply = (accepted: boolean, criteria: Crit[]): string =>
  `| Tiêu chí | Kết quả | Bằng chứng |\n|---|---|---|\n${criteria.map((c) => `| ${c.name} | ${c.result} | ${c.evidence} |`).join('\n')}\n\n\`\`\`json\n${JSON.stringify({ accepted, summary: accepted ? 'Đạt' : 'Chưa đạt', criteria, risks: [], followUps: [] })}\n\`\`\``;
const IN2: Crit[] = [
  { name: 'Tiêu chí A', result: 'fail', evidence: 'thiếu', scope: 'in' },
  { name: 'Tiêu chí B', result: 'fail', evidence: 'thiếu', scope: 'in' },
];
const OK: Crit[] = [{ name: 'Tiêu chí A', result: 'pass', evidence: 'ok' }, { name: 'Tiêu chí B', result: 'pass', evidence: 'ok' }];

function setup() {
  const a = testApp();
  (a.config.defaults as { acceptFollowupRounds?: number }).acceptFollowupRounds = 1; // ghim, không phụ thuộc CCODING_CONFIG của máy
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'), 'ccoding-accfu-'));
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  fs.writeFileSync(path.join(repo, 'a.js'), 'module.exports = 1;\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  a.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: repo, classification: 'internal', toolAccess: 'exec', createdAt: new Date().toISOString() });
  return Object.assign(a, { cleanupAll: () => { a.cleanup(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } });
}
type Ctx = ReturnType<typeof setup>;

/** `next(n)` trả đầu ra của lượt accept thứ n (1-based); `hook` chạy trước mỗi lượt accept. */
function instrument(a: Ctx, next: (n: number) => { text?: string; error?: string }, hook?: (n: number) => void): { accepts: () => number } {
  let n = 0;
  const orch = a.orchestrator as unknown as { call: (...x: unknown[]) => Promise<{ text: string; error?: string }> };
  const orig = orch.call.bind(orch);
  orch.call = async (agent, phase, build, ctx) => {
    if (phase === 'accept') {
      n++;
      hook?.(n);
    }
    const r = await orig(agent, phase, build, ctx);
    if (phase === 'execute') r.text = templateHeadings((agent as { body: string }).body).map((h) => `## ${h}\nNội dung thật cho mục này.`).join('\n');
    if (phase === 'accept') {
      const o = next(n);
      if (o.error) r.error = o.error;
      if (o.text !== undefined) r.text = o.text;
    }
    return r;
  };
  return { accepts: () => n };
}

async function run(a: Ctx, wait = 'done', lane: 'single' | 'fast' | 'full' = 'single') {
  const t = a.orchestrator.submit({ brief: 'Thêm hàm cộng vào a.js', projectId: 'repo', options: { lane, slim: { accept: 'brief' }, review: false } });
  const done = await a.orchestrator.waitFor(t.id);
  assert.equal(done.status, wait, done.error);
  return done;
}
const kinds = (a: Ctx, id: string) => a.logs.query({ task: id }).map((e) => e.kind);
const followLogs = (a: Ctx, id: string) => a.logs.query({ task: id }).filter((e) => e.kind === 'accept.followup');

test('K3 2 tiêu chí in → có run bổ sung, lượt accept thứ hai, đạt thì hết cần xem', async () => {
  const a = setup();
  const acc = instrument(a, (n) => ({ text: n === 1 ? reply(false, IN2) : reply(true, OK) }));
  try {
    const t = await run(a);
    assert.equal(acc.accepts(), 2);
    assert.equal(t.runs.length, 2);
    assert.equal(t.runs[1].round, 1);
    assert.equal(t.runs[1].followupOf, t.runs[0].department);
    assert.equal(t.acceptFollowups, 1);
    assert.notEqual(t.runs[1].finalPath, t.runs[0].finalPath, 'báo cáo vòng bổ sung không đè báo cáo gốc');
    assert.equal(t.acceptance?.accepted, true);
    assert.equal(t.attention, undefined);
    const ev = followLogs(a, t.id).find((e) => (e.data as { opened?: boolean }).opened);
    assert.ok(ev, 'có log accept.followup mở vòng');
    const d = ev.data as { round: number; maxRounds: number; inScope: string[]; decision: string[]; budgetLeft: number; estimate: number };
    assert.equal(d.round, 1);
    assert.equal(d.maxRounds, 1);
    assert.deepEqual(d.inScope, ['Tiêu chí A', 'Tiêu chí B']);
    assert.deepEqual(d.decision, []);
    assert.equal(typeof d.budgetLeft, 'number');
    assert.equal(typeof d.estimate, 'number');
  } finally {
    a.cleanupAll();
  }
});

test('K3 chỉ có tiêu chí decision → không mở vòng, attention nêu tên tiêu chí', async () => {
  const a = setup();
  const crit: Crit[] = [{ name: 'Cần quyền ghi production', result: 'fail', evidence: 'thiếu quyền', scope: 'decision' }, { name: 'Thiếu scope', result: 'unknown' as 'fail', evidence: '' }];
  const acc = instrument(a, () => ({ text: reply(false, crit) }));
  try {
    const t = await run(a);
    assert.equal(acc.accepts(), 1);
    assert.equal(t.runs.length, 1);
    assert.equal(t.acceptFollowups, undefined);
    assert.equal(t.attention?.reason, 'acceptance');
    assert.match(t.attention?.detail ?? '', /cần giám đốc quyết định: Cần quyền ghi production; Thiếu scope/);
    const ev = followLogs(a, t.id)[0];
    assert.equal((ev.data as { opened: boolean }).opened, false);
  } finally {
    a.cleanupAll();
  }
});

test('K3 đã hết vòng → không mở thêm, tổng số lượt accept bị chặn', async () => {
  const a = setup();
  const acc = instrument(a, () => ({ text: reply(false, IN2) }));
  try {
    const t = await run(a);
    assert.equal(acc.accepts(), 2, '1 lượt đầu + 1 lượt sau vòng bổ sung, không lặp vô hạn');
    assert.equal(t.runs.length, 2);
    assert.equal(t.acceptFollowups, 1);
    assert.equal(t.attention?.reason, 'acceptance');
    const logs = followLogs(a, t.id);
    assert.equal((logs[logs.length - 1].data as { opened: boolean }).opened, false);
    assert.match(logs[logs.length - 1].msg, /hết 1 vòng/);
  } finally {
    a.cleanupAll();
  }
});

test('K3 acceptFollowupRounds = 0 → tắt vòng bổ sung', async () => {
  const a = setup();
  (a.config.defaults as { acceptFollowupRounds?: number }).acceptFollowupRounds = 0;
  const acc = instrument(a, () => ({ text: reply(false, IN2) }));
  try {
    const t = await run(a);
    assert.equal(acc.accepts(), 1);
    assert.equal(t.runs.length, 1);
  } finally {
    a.cleanupAll();
  }
});

test('K3 lỗi lượt gọi nghiệm thu (accept.error) → không mở vòng', async () => {
  const a = setup();
  const acc = instrument(a, () => ({ error: 'runtime sập', text: '' }));
  try {
    const t = await run(a);
    assert.equal(acc.accepts(), 1);
    assert.equal(t.runs.length, 1);
    assert.ok(kinds(a, t.id).includes('accept.error'));
    assert.equal(kinds(a, t.id).includes('accept.followup'), false);
    assert.equal(t.acceptFollowups, undefined);
  } finally {
    a.cleanupAll();
  }
});

test('K3 task bị hủy giữa lượt nghiệm thu → không mở vòng', async () => {
  const a = setup();
  const acc = instrument(a, () => ({ text: reply(false, IN2) }), (n) => {
    if (n === 1) {
      const t = [...a.store.tasks.values()].find((x) => x.status === 'running');
      assert.ok(t);
      a.orchestrator.cancel(t.id);
    }
  });
  try {
    const t = await run(a, 'cancelled');
    assert.equal(acc.accepts(), 1);
    assert.equal(t.runs.length, 1);
    assert.equal(t.acceptFollowups, undefined);
    assert.equal(kinds(a, t.id).includes('accept.followup'), false);
  } finally {
    a.cleanupAll();
  }
});

test('K3 kế hoạch bổ sung vượt ngân sách còn lại → tạm dừng chờ tăng ngân sách, không chạy hạng mục', async () => {
  const a = setup();
  const acc = instrument(a, () => ({ text: reply(false, IN2) }));
  const orch = a.orchestrator as unknown as { estimatePlan: (t: unknown, r: { followupOf?: string }, p?: unknown) => number };
  const orig = orch.estimatePlan.bind(orch);
  // ước lượng thô (chưa có followupOf) nhỏ để vòng được mở; kế hoạch bổ sung thật thì rất lớn
  orch.estimatePlan = (t, r, p) => (r.followupOf ? 1e12 : orig(t, r, p));
  try {
    const t = await run(a, 'paused', 'fast');
    assert.equal(acc.accepts(), 1, 'không nghiệm thu lại vì vòng bổ sung dừng ở cổng ngân sách');
    assert.equal(t.runs.length, 2);
    assert.equal(t.acceptFollowups, 1);
    assert.equal(t.runs[1].subtasks.every((s) => s.status === 'pending'), true, 'chưa thực thi hạng mục nào');
    assert.ok(followLogs(a, t.id).some((e) => (e.data as { overBudget?: boolean }).overBudget));
  } finally {
    a.cleanupAll();
  }
});

test('K3 hủy giữa vòng bổ sung → không nghiệm thu lại', async () => {
  const a = setup();
  const acc = instrument(a, () => ({ text: reply(false, IN2) }));
  const orch = a.orchestrator as unknown as { call: (...x: unknown[]) => Promise<unknown> };
  const orig = orch.call.bind(orch);
  let cancelled = false;
  orch.call = async (agent, phase, build, ctx) => {
    const t = [...a.store.tasks.values()].find((x) => x.status === 'running');
    if (!cancelled && t && t.runs.length === 2 && phase !== 'accept') {
      cancelled = true;
      a.orchestrator.cancel(t.id);
    }
    return orig(agent, phase, build, ctx);
  };
  try {
    const t = await run(a, 'cancelled');
    assert.equal(cancelled, true);
    assert.equal(acc.accepts(), 1);
  } finally {
    a.cleanupAll();
  }
});
