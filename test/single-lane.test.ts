import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { templateHeadings } from '../src/kpi.js';
import { testApp } from './helpers.js';

// B-01 làn đơn (backlog §3.2–§3.3): LLM là mock, lệnh kiểm của dự án là lệnh node THẬT (không mock lớp kiểm tra).

const GREEN = 'node -e "process.exit(0)"';
const RED = 'node -e "process.exit(1)"';

function repoIn(dir: string): string {
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"x","private":true}\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  return repo;
}

function setup(cmd: string) {
  const a = testApp();
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'), 'ccoding-single-'));
  const repo = repoIn(dir);
  a.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: repo, classification: 'internal', toolAccess: 'exec', checkCommands: [cmd], createdAt: new Date().toISOString() });
  return Object.assign(a, { cleanupAll: () => { a.cleanup(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } });
}

/** Mock không viết đúng "Mẫu đầu ra" của vai → cổng mẫu (B-02 §4.2) không đạt và reviewer bị gọi. Ca "cổng xanh" cần bàn giao đúng mẫu. */
function compliantExecute(a: ReturnType<typeof setup>): void {
  const orch = a.orchestrator as unknown as { call: (...x: unknown[]) => Promise<{ text: string }> };
  const orig = orch.call.bind(orch);
  orch.call = async (agent, phase, build, ctx) => {
    const r = await orig(agent, phase, build, ctx);
    if (phase === 'execute') r.text = templateHeadings((agent as { body: string }).body).map((h) => `## ${h}\nNội dung thật cho mục này.`).join('\n');
    return r;
  };
}

const phasesOf = (a: ReturnType<typeof setup>, id: string) => a.usage.all({ task: id }).map((c) => c.phase);
const finalText = (a: ReturnType<typeof setup>, id: string) => {
  const f = fs.readdirSync(a.store.runDir(id)).find((x) => x.endsWith('-FINAL.md'));
  return f ? fs.readFileSync(path.join(a.store.runDir(id), f), 'utf8') : '';
};

test('B-01: làn đơn, cổng xanh → một lượt execute, không route/plan/họp/review/synthesize; FINAL.md dựng từ mẫu; CTO vẫn nghiệm thu', async () => {
  const a = setup(GREEN);
  compliantExecute(a);
  try {
    const t = a.orchestrator.submit({ brief: 'Thêm hàm cộng vào src/a.js', projectId: 'repo', options: { lane: 'single' } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(done.lane, 'single');
    const phases = phasesOf(a, t.id);
    for (const p of ['route', 'plan', 'discuss', 'finalize', 'review', 'synthesize']) assert.equal(phases.includes(p as never), false, `không gọi ${p}`);
    assert.equal(phases.filter((p) => p === 'execute').length, 1);
    assert.ok(phases.includes('accept'), 'pha nghiệm thu CTO giữ nguyên hành vi');
    const run = done.runs[0];
    assert.equal(run.subtasks.length, 1);
    assert.equal(run.review?.approved, true);
    assert.equal(done.projectChecks?.baseline?.[0].ok, true, 'baseline chạy lệnh thật');
    assert.match(finalText(a, t.id), /Làn đơn: một agent làm trọn đề bài/);
    assert.ok(a.logs.query({ task: t.id }).some((e) => e.kind === 'lane.pick'));
  } finally {
    a.cleanupAll();
  }
});

test('B-01 + B-02 ca t5: đề đòi lệnh xanh, đỏ → đỏ → vòng sửa, nâng lên multi-agent, không gọi reviewer, không approved', async () => {
  const a = setup(RED);
  try {
    const t = a.orchestrator.submit({ brief: `Viết test cho module src/a.js, đảm bảo \`${RED}\` xanh.`, projectId: 'repo', options: { lane: 'single', discussionRounds: 0, maxRevisions: 1 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(done.projectChecks?.baseline?.[0].ok, false, 'đỏ từ baseline');
    assert.equal(done.projectChecks?.latest?.[0].ok, false, 'vẫn đỏ sau vòng sửa');
    const phases = phasesOf(a, t.id);
    assert.ok(phases.filter((p) => p === 'revise').length >= 2, 'đủ gate.maxFixRounds vòng sửa theo kiểm tra');
    assert.equal(phases.includes('review'), false, 'không gọi reviewer khi đỏ kéo dài mà đề bài đòi xanh');
    assert.notEqual(done.lane, 'single', 'đã nâng cấp');
    assert.ok(a.logs.query({ task: t.id }).some((e) => e.kind === 'lane.escalate'));
    assert.equal(done.runs[0].review?.approved, false);
    assert.equal(done.attention?.reason, 'review');
  } finally {
    a.cleanupAll();
  }
});

test('B-01 §3.3: agent ghi dòng ESCALATE: → nâng cấp, giữ worktree và bàn giao dở dang cho pha plan', async () => {
  const a = setup(GREEN);
  try {
    const orch = a.orchestrator as unknown as { call: (...x: unknown[]) => Promise<{ text: string }> };
    const orig = orch.call.bind(orch);
    orch.call = async (agent, phase, build, ctx) => {
      const r = await orig(agent, phase, build, ctx);
      const c = ctx as { task: { lane?: string; workspace?: string } };
      if (phase === 'execute' && c.task.lane === 'single') {
        fs.writeFileSync(path.join(c.task.workspace!, 'partial.txt'), 'làm dở\n');
        r.text += '\nESCALATE: cần chia việc nhiều phần\n';
      }
      return r;
    };
    const t = a.orchestrator.submit({ brief: 'Thêm hàm cộng vào src/a.js', projectId: 'repo', options: { lane: 'single' } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.ok(done.lane === 'fast' || done.lane === 'full', `lane sau nâng cấp: ${done.lane}`);
    assert.ok(phasesOf(a, t.id).includes('plan'), 'sau nâng cấp có plan');
    assert.ok(fs.existsSync(path.join(done.workspace!, 'partial.txt')), 'worktree được giữ, phần làm dở còn nguyên');
    const handover = fs.readFileSync(path.join(a.store.runDir(t.id), 'LANE-HANDOVER.md'), 'utf8');
    assert.match(handover, /partial\.txt/);
    assert.match(handover, /cần chia việc nhiều phần/);
    const esc = a.logs.query({ task: t.id }).find((e) => e.kind === 'lane.escalate');
    assert.ok(esc);
    assert.equal((esc!.data as { trigger: string }).trigger, 'agent');
    assert.ok(a.store.transcript(t.id).some((m) => m.kind === 'system' && m.text.startsWith('⬆️ Nâng cấp làn đơn')));
  } finally {
    a.cleanupAll();
  }
});

test('B-01: ép làn nhanh/đầy không đổi hành vi — không có luồng làn đơn, không nâng cấp', async () => {
  for (const lane of ['fast', 'full'] as const) {
    const a = setup(GREEN);
    try {
      const t = a.orchestrator.submit({ brief: 'Thêm hàm cộng vào src/a.js', projectId: 'repo', options: { lane } });
      const done = await a.orchestrator.waitFor(t.id);
      assert.equal(done.status, 'done', done.error);
      assert.equal(done.lane, lane);
      assert.ok(phasesOf(a, t.id).includes('plan'), `${lane}: có plan`);
      assert.equal(a.store.transcript(t.id).some((m) => m.text.startsWith('🎯 Làn đơn')), false);
      assert.equal(a.logs.query({ task: t.id }).some((e) => e.kind === 'lane.escalate'), false);
    } finally {
      a.cleanupAll();
    }
  }
});

test('B-01: ép làn đơn trên dự án phòng "auto" → định tuyến bằng từ khóa, không có lượt route bằng LLM', async () => {
  const a = setup(GREEN);
  try {
    const p = a.store.project('repo')!;
    a.store.saveProject({ ...p, department: 'auto' });
    const t = a.orchestrator.submit({ brief: 'Thêm hàm cộng vào src/a.js', projectId: 'repo', options: { lane: 'single' } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(phasesOf(a, t.id).includes('route'), false);
    assert.equal(done.routing?.by, 'keywords');
  } finally {
    a.cleanupAll();
  }
});
