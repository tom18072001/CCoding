import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { templateHeadings } from '../src/kpi.js';
import { testApp } from './helpers.js';

// B-02 (phần còn thiếu): cổng chất lượng chạy ở MỌI làn, gate.maxFixRounds là ngân sách cho cả nhiệm vụ, resume giữa lúc nâng làn nạp lại bàn giao.
// LLM là mock; lệnh kiểm của dự án là lệnh node thật.

const GREEN = 'node -e "process.exit(0)"';
const RED = 'node -e "process.exit(1)"';
const rm = (p: string) => fs.rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });

function setup(cmd: string) {
  const a = testApp();
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'), 'ccoding-gate-'));
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"x","private":true}\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  a.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: repo, classification: 'internal', toolAccess: 'exec', checkCommands: [cmd], createdAt: new Date().toISOString() });
  const extra: string[] = [];
  return Object.assign(a, { track: (p: string) => void extra.push(p), dataDir: a.config.dataDir, cleanupAll: () => { a.cleanup(); rm(dir); extra.forEach(rm); } });
}

/** Bàn giao execute đúng "Mẫu đầu ra" của vai để cổng mẫu không kéo thêm lượt sửa định dạng. */
function compliantExecute(a: { orchestrator: unknown }): void {
  const orch = a.orchestrator as { call: (...x: unknown[]) => Promise<{ text: string }> };
  const orig = orch.call.bind(orch);
  orch.call = async (agent, phase, build, ctx) => {
    const r = await orig(agent, phase, build, ctx);
    if (phase === 'execute') r.text = templateHeadings((agent as { body: string }).body).map((h) => `## ${h}\nNội dung thật cho mục này.`).join('\n');
    return r;
  };
}

const kinds = (a: ReturnType<typeof setup>, id: string, kind: string) => a.logs.query({ task: id }).filter((e) => e.kind === kind);
const phases = (a: ReturnType<typeof setup>, id: string) => a.usage.all({ task: id }).map((c) => c.phase);

test('B-02 (i): review = false, lệnh đỏ mà đề bài đòi xanh → vẫn vào vòng sửa, không gọi reviewer, không approved', async () => {
  const a = setup(RED);
  try {
    const t = a.orchestrator.submit({ brief: `Sửa src/a.js để \`${RED}\` xanh.`, projectId: 'repo', options: { lane: 'full', review: false, discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(kinds(a, t.id, 'gate.fix').length, 2, 'đủ gate.maxFixRounds vòng sửa dù không có review');
    assert.equal(phases(a, t.id).includes('review'), false);
    assert.equal(done.runs[0].review?.approved, false);
    assert.equal(done.runs[0].gateFixRoundsUsed, 2);
    assert.equal(done.attention?.reason, 'review');
  } finally {
    a.cleanupAll();
  }
});

test('B-02 (ii): làn nhanh không reviewer → cổng chạy; cổng xanh thì ghi kiểm chứng theo cổng', async () => {
  const a = setup(GREEN);
  compliantExecute(a);
  try {
    const t = a.orchestrator.submit({ brief: 'Thêm hàm cộng vào src/a.js', projectId: 'repo', options: { lane: 'fast', review: false, discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(done.lane, 'fast');
    assert.ok(kinds(a, t.id, 'gate.classify').length >= 1, 'cổng đã chạy');
    assert.equal(phases(a, t.id).includes('review'), false);
    assert.equal(done.runs[0].review?.verified, true);
  } finally {
    a.cleanupAll();
  }
});

test('B-02 (ii): việc giao riêng một agent, lệnh đỏ đề bài đòi xanh → vòng sửa và không approved', async () => {
  const a = setup(RED);
  try {
    const t = a.orchestrator.submit({ brief: `Sửa src/a.js để \`${RED}\` xanh.`, projectId: 'repo', mode: 'agent', department: 'dev', agentId: 'senior-swe', options: { review: false } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(kinds(a, t.id, 'gate.fix').length, 2);
    assert.equal(done.runs[0].review?.approved, false);
  } finally {
    a.cleanupAll();
  }
});

test('B-02 (iii): gate.maxFixRounds là ngân sách cho cả nhiệm vụ — tiếp tục sau tạm dừng không cấp lại', async () => {
  const a = setup(RED);
  let again: ReturnType<typeof testApp> | undefined;
  try {
    const t = a.orchestrator.submit({ brief: `Sửa src/a.js để \`${RED}\` xanh.`, projectId: 'repo', options: { lane: 'full', review: false, discussionRounds: 0 } });
    await a.orchestrator.waitFor(t.id);
    assert.equal(kinds(a, t.id, 'gate.fix').length, 2);

    // giả lập server dừng giữa chừng sau khi vòng sửa đã tốn hết ngân sách, rồi tiếp tục
    const saved = a.store.get(t.id)!;
    assert.equal(saved.runs[0].gateFixRoundsUsed, 2, 'ngân sách đã dùng được lưu vào trạng thái run');
    saved.status = 'running';
    saved.runs[0].status = 'running';
    saved.runs[0].stage = 'executed';
    saved.runs[0].finalPath = undefined;
    saved.runs[0].review = undefined;
    saved.runs[0].reviewRound = undefined;
    a.store.put(saved, true);
    again = testApp({ dataDir: a.dataDir });
    assert.equal(again.store.get(t.id)!.status, 'paused');
    again.orchestrator.resume(t.id);
    const done = await again.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(kinds(a, t.id, 'gate.fix').length, 2, 'tổng vòng sửa ≤ maxFixRounds qua pause/resume');
    assert.equal(done.runs[0].gateFixRoundsUsed, 2);
    assert.equal(done.runs[0].review?.approved, false, 'hết ngân sách, còn đỏ → không approved');
  } finally {
    again?.cleanup();
    a.cleanupAll();
  }
});

test('B-02 (iii): ngân sách dùng chung giữa làn đơn và làn sau khi nâng cấp', async () => {
  const a = setup(RED);
  try {
    const t = a.orchestrator.submit({ brief: `Viết test cho src/a.js, đảm bảo \`${RED}\` xanh.`, projectId: 'repo', options: { lane: 'single', discussionRounds: 0, maxRevisions: 1 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.notEqual(done.lane, 'single');
    assert.equal(kinds(a, t.id, 'gate.fix').length, 2, 'làn đơn dùng hết 2 vòng; làn sau nâng cấp không cấp lại');
    assert.equal(done.runs[0].gateFixRoundsUsed, 2);
  } finally {
    a.cleanupAll();
  }
});

test('B-02 (iv): tiếp tục sau tạm dừng giữa lúc nâng làn → prior của pha plan chứa nội dung LANE-HANDOVER.md', async () => {
  const a = setup(GREEN);
  let again: ReturnType<typeof testApp> | undefined;
  try {
    const orch = a.orchestrator as unknown as { call: (...x: unknown[]) => Promise<{ text: string }> };
    const orig = orch.call.bind(orch);
    orch.call = async (agent, phase, build, ctx) => {
      const r = await orig(agent, phase, build, ctx);
      const c = ctx as { task: { lane?: string; workspace?: string } };
      if (phase === 'execute' && c.task.lane === 'single') {
        fs.writeFileSync(path.join(c.task.workspace!, 'partial-iv.txt'), 'làm dở\n');
        r.text += '\nESCALATE: cần chia việc nhiều phần\n';
      }
      return r;
    };
    const t = a.orchestrator.submit({ brief: 'Thêm hàm cộng vào src/a.js', projectId: 'repo', options: { lane: 'single' } });
    await a.orchestrator.waitFor(t.id);
    const handover = fs.readFileSync(path.join(a.store.runDir(t.id), 'LANE-HANDOVER.md'), 'utf8');

    // trạng thái ngay sau lúc nâng làn: đã đổi lane, chưa có kế hoạch; `prior` trong bộ nhớ đã mất khi server dừng
    const saved = a.store.get(t.id)!;
    Object.assign(saved, { status: 'running', lane: 'fast' });
    Object.assign(saved.runs[0], { status: 'running', subtasks: [], stage: undefined, planSummary: undefined, decisions: undefined, review: undefined, finalPath: undefined, planGate: undefined, planReview: undefined });
    assert.equal(saved.runs[0].escalatedFrom, 'single');
    a.store.put(saved, true);

    again = testApp({ dataDir: a.dataDir });
    const o2 = again.orchestrator as unknown as { call: (...x: unknown[]) => Promise<{ text: string }> };
    const orig2 = o2.call.bind(o2);
    const planPrompts: string[] = [];
    o2.call = async (agent, phase, build, ctx) => {
      if (phase === 'plan') planPrompts.push((build as (t: string[]) => { prompt: string })([]).prompt);
      return orig2(agent, phase, build, ctx);
    };
    again.orchestrator.resume(t.id);
    const done = await again.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.ok(planPrompts.length >= 1, 'có pha plan sau khi tiếp tục');
    assert.match(planPrompts[0], /partial-iv\.txt/, 'prior chứa nội dung LANE-HANDOVER.md');
    assert.ok(handover.includes('partial-iv.txt'));
  } finally {
    again?.cleanup();
    a.cleanupAll();
  }
});
