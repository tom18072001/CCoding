import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { templateHeadings } from '../src/kpi.js';
import type { RunRequest, RunResult } from '../src/types.js';
import { testApp } from './helpers.js';

// D17 (S3): các đường còn thiếu của vòng bổ sung sau nghiệm thu. Runtime giả; lượt accept do test điều khiển.
// (a) tiếp tục sau tạm dừng giữa vòng · (b) hết hạn mức 5 giờ giữa vòng · (c) vòng bổ sung ở làn đầy
// (d) attention.detail có mã K · (e) log gate.review ở mức luồng orchestrator.

type Crit = { name: string; result: 'pass' | 'fail'; evidence: string; scope?: 'in' | 'decision' };
const reply = (accepted: boolean, criteria: Crit[]): string =>
  `| Tiêu chí | Kết quả | Bằng chứng |\n|---|---|---|\n${criteria.map((c) => `| ${c.name} | ${c.result} | ${c.evidence} |`).join('\n')}\n\n\`\`\`json\n${JSON.stringify({ accepted, summary: accepted ? 'Đạt' : 'Chưa đạt', criteria, risks: [], followUps: [] })}\n\`\`\``;
const IN2: Crit[] = [
  { name: 'Tiêu chí A', result: 'fail', evidence: 'thiếu', scope: 'in' },
  { name: 'Tiêu chí B', result: 'fail', evidence: 'thiếu', scope: 'in' },
];
const OK: Crit[] = [{ name: 'Tiêu chí A', result: 'pass', evidence: 'ok' }, { name: 'Tiêu chí B', result: 'pass', evidence: 'ok' }];
const MSG = "You've hit your 5-hour limit · resets 1am (Asia/Bangkok)";

function setup() {
  const a = testApp();
  (a.config.defaults as { acceptFollowupRounds?: number }).acceptFollowupRounds = 1; // ghim, không phụ thuộc CCODING_CONFIG của máy
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'), 'ccoding-fup-'));
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
type Hook = (phase: string, n: number, run: number) => RunResult | undefined | void;

/**
 * Bọc `call`: lượt accept thứ n trả `acceptText(n)`; execute của agent có mẫu đầu ra đủ mục; `hook(phase, n, soRun)` chạy trước
 * mỗi lượt gọi (n = số lượt accept đã thấy) — trả RunResult thì thay luôn kết quả runtime (dùng giả lập hết hạn mức).
 */
function instrument(a: Ctx, acceptText: (n: number) => string, hook?: Hook): { accepts: () => number } {
  let n = 0;
  let phase = '';
  const orch = a.orchestrator as unknown as { call: (...x: unknown[]) => Promise<{ text: string; error?: string }> };
  const origCall = orch.call.bind(orch);
  const mock = a.runtimes.get('mock')!;
  const origRun = mock.run.bind(mock);
  let injected: RunResult | undefined;
  mock.run = async (req: RunRequest, hooks) => {
    if (injected) {
      const r = injected;
      injected = undefined;
      return r;
    }
    return origRun(req, hooks);
  };
  orch.call = async (agent, ph, build, ctx) => {
    phase = ph;
    if (ph === 'accept') n++;
    const t = [...a.store.tasks.values()].find((x) => x.status === 'running');
    const out = hook?.(phase, n, t?.runs.length ?? 0);
    if (out) injected = out;
    const r = await origCall(agent, ph, build, ctx);
    if (ph === 'execute' && !r.error) r.text = templateHeadings((agent as { body: string }).body).map((h) => `## ${h}\nNội dung thật cho mục này.`).join('\n');
    if (ph === 'accept') r.text = acceptText(n);
    return r;
  };
  return { accepts: () => n };
}

const submit = (a: Ctx, lane: 'single' | 'fast' | 'full', review = false) =>
  a.orchestrator.submit({ brief: 'Thêm hàm cộng vào a.js', projectId: 'repo', options: { lane, slim: { accept: 'brief' }, review } });
const followLogs = (a: Ctx, id: string) => a.logs.query({ task: id }).filter((e) => e.kind === 'accept.followup');

test('D17(a) tạm dừng giữa vòng bổ sung rồi tiếp tục → không mở thêm vòng, nghiệm thu lại đúng một lần', async () => {
  const a = setup();
  let paused = false;
  const acc = instrument(a, (n) => (n === 1 ? reply(false, IN2) : reply(true, OK)), (ph, _n, runs) => {
    if (!paused && runs === 2 && ph !== 'accept') {
      paused = true;
      const t = [...a.store.tasks.values()].find((x) => x.status === 'running')!;
      a.orchestrator.pause(t.id);
    }
  });
  try {
    const t = submit(a, 'single');
    const p = await a.orchestrator.waitFor(t.id);
    assert.equal(paused, true);
    assert.equal(p.status, 'paused', `status=${p.status}`);
    assert.equal(p.acceptFollowups, 1, 'bộ đếm đã lưu trước khi chạy vòng');
    assert.equal(acc.accepts(), 1, 'chưa nghiệm thu lại khi đang tạm dừng');
    a.orchestrator.resume(t.id);
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', `status=${done.status} ${JSON.stringify(done.pause)}`);
    assert.equal(done.acceptFollowups, 1, 'tiếp tục không mở thêm vòng');
    assert.equal(done.runs.length, 2);
    assert.equal(acc.accepts(), 2);
    assert.equal(done.acceptance?.accepted, true);
    assert.equal(followLogs(a, t.id).filter((e) => (e.data as { opened?: boolean }).opened).length, 1);
  } finally {
    a.cleanupAll();
  }
});

test('D17(b) hết hạn mức 5 giờ giữa vòng bổ sung → paused (quota), không failed, tiếp tục không mở thêm vòng', async () => {
  const a = setup();
  let hit = 0;
  const limited: RunResult = { text: 'làm dở', error: MSG, usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, costUsd: 0 }, estimated: false, model: 'mock', runtime: 'mock', durationMs: 1, turns: 1, toolCalls: [] };
  const acc = instrument(a, (n) => (n === 1 ? reply(false, IN2) : reply(true, OK)), (ph, _n, runs) => {
    if (!hit && runs === 2 && ph === 'execute') {
      hit++;
      return limited;
    }
  });
  try {
    const t = submit(a, 'single');
    const p = await a.orchestrator.waitFor(t.id);
    assert.equal(hit, 1);
    assert.equal(p.status, 'paused', `status=${p.status}`);
    assert.equal(p.pause?.reason, 'quota');
    assert.ok(!p.runs.flatMap((r) => r.subtasks).some((s) => s.status === 'failed'), 'hạng mục không bị failed');
    assert.equal(p.acceptFollowups, 1);
    assert.equal(acc.accepts(), 1);
    for (const key of [...(a.runtimes as unknown as { health: Map<string, unknown> }).health.keys()]) a.runtimes.markOk(key);
    a.orchestrator.resume(t.id);
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', `status=${done.status} ${JSON.stringify(done.pause)}`);
    assert.equal(done.acceptFollowups, 1);
    assert.equal(done.runs.length, 2);
  } finally {
    a.cleanupAll();
  }
});

test('D17(c) vòng bổ sung ở làn đầy (full) → run bổ sung có followupOf/round, nghiệm thu lại', async () => {
  const a = setup();
  const acc = instrument(a, (n) => (n === 1 ? reply(false, IN2) : reply(true, OK)));
  try {
    const t = submit(a, 'full');
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', `status=${done.status} ${done.error ?? ''}`);
    assert.equal(done.lane, 'full');
    assert.equal(done.runs.length, 2);
    assert.equal(done.runs[1].followupOf, done.runs[0].department);
    assert.equal(done.runs[1].round, 1);
    assert.equal(acc.accepts(), 2);
    assert.equal(done.acceptance?.accepted, true);
  } finally {
    a.cleanupAll();
  }
});

test('D17(d) attention.detail nêu mã K của tiêu chí cần giám đốc quyết định', async () => {
  const a = setup();
  const crit: Crit[] = [
    { name: 'K4 peer-reviewer chưa có', result: 'fail', evidence: 'thiếu', scope: 'decision' },
    { name: 'K5 cần quyền ghi production', result: 'fail', evidence: 'thiếu quyền', scope: 'decision' },
  ];
  instrument(a, () => reply(false, crit));
  try {
    const done = await a.orchestrator.waitFor(submit(a, 'single').id);
    assert.equal(done.attention?.reason, 'acceptance');
    assert.match(done.attention?.detail ?? '', /cần giám đốc quyết định: K4 peer-reviewer chưa có; K5 cần quyền ghi production/);
    assert.match(done.attention?.detail ?? '', /\bK4\b/);
    assert.match(done.attention?.detail ?? '', /\bK5\b/);
  } finally {
    a.cleanupAll();
  }
});

test('D17(e) luồng orchestrator ghi log gate.review có decision và mã nhiệm vụ', async () => {
  const a = setup();
  instrument(a, () => reply(true, OK));
  try {
    const t = submit(a, 'full', true);
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', `status=${done.status} ${done.error ?? ''}`);
    const ev = a.logs.query({ task: t.id }).filter((e) => e.kind === 'gate.review');
    assert.ok(ev.length >= 1, 'có ít nhất một log gate.review');
    for (const e of ev) {
      const d = e.data as { decision?: string };
      assert.ok(['call-reviewer', 'skip-reviewer', 'no-reviewer', 'forced-unapproved'].includes(d.decision ?? ''), `decision=${d.decision}`);
      assert.ok(e.msg.startsWith(`${t.id}:`));
      assert.equal(e.taskId, t.id);
    }
  } finally {
    a.cleanupAll();
  }
});
