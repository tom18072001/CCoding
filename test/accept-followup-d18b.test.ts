import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { templateHeadings } from '../src/kpi.js';
import { briefItems } from '../src/plan-gate.js';
import { testApp } from './helpers.js';

// K5 (D18c): luồng vòng bổ sung đầu-cuối trên fixture D18b, runtime giả.
// CTO chưa nghiệm thu → mở vòng bổ sung 1/1 → trưởng phòng trả plan-d18b-followup.json → cổng đạt → chạy hết hạng mục → nghiệm thu lại.

const BRIEF = fs.readFileSync(path.join('docs', 'research', 'BRIEF-D18b.md'), 'utf8');
const FIXTURE = fs.readFileSync(path.join('test', 'fixtures', 'brief-item', 'plan-d18b-followup.json'), 'utf8');
const fixturePlan = JSON.parse(FIXTURE) as { subtasks: unknown[] };

type Crit = { name: string; result: 'pass' | 'fail'; evidence: string; scope?: 'in' | 'decision' };
const reply = (accepted: boolean, criteria: Crit[]): string =>
  `| Tiêu chí | Kết quả | Bằng chứng |\n|---|---|---|\n${criteria.map((c) => `| ${c.name} | ${c.result} | ${c.evidence} |`).join('\n')}\n\n\`\`\`json\n${JSON.stringify({ accepted, summary: accepted ? 'Đạt' : 'Chưa đạt', criteria, risks: [], followUps: [] })}\n\`\`\``;

function setup() {
  const a = testApp();
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'), 'ccoding-d18b-'));
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  fs.writeFileSync(path.join(repo, 'a.js'), 'module.exports = 1;\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  (a.config.defaults as { acceptFollowupRounds?: number }).acceptFollowupRounds = 1; // ghim, không phụ thuộc cấu hình máy
  a.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: repo, classification: 'internal', toolAccess: 'exec', createdAt: new Date().toISOString() });
  return Object.assign(a, { cleanupAll: () => { a.cleanup(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } });
}
type Ctx = ReturnType<typeof setup>;

async function flow(a: Ctx, critName: string) {
  let accepts = 0;
  let followupPlans = 0;
  const orch = a.orchestrator as unknown as { call: (...x: unknown[]) => Promise<{ text: string; error?: string }> };
  const orig = orch.call.bind(orch);
  orch.call = async (agent, phase, build, ctx) => {
    const r = await orig(agent, phase, build, ctx);
    if (phase === 'execute') r.text = templateHeadings((agent as { body: string }).body).map((h) => `## ${h}\nNội dung thật cho mục này.`).join('\n');
    if (phase === 'plan') {
      const t = [...a.store.tasks.values()].find((x) => x.status === 'running');
      if (t && t.runs.length === 1) {
        // vòng đầu: mỗi mã K một hạng mục đúng vai, mô tả chứa nguyên đề bài, để cổng thường đạt
        const subtasks = briefItems(BRIEF).map((it, i) => ({ id: `S${i + 1}`, title: `${it.code} — hạng mục`, description: BRIEF, assignee: it.role ?? 'backend-dev', dependsOn: [] as string[] }));
        r.text = `\`\`\`json\n${JSON.stringify({ summary: 'Kế hoạch vòng đầu', subtasks })}\n\`\`\``;
      }
      if (t && t.runs.length === 2 && t.runs[1].followupOf) { followupPlans++; r.text = `\`\`\`json\n${FIXTURE}\n\`\`\``; }
    }
    if (phase === 'accept') {
      accepts++;
      r.text = accepts === 1
        ? reply(false, [{ name: critName, result: 'fail', evidence: 'thiếu', scope: 'in' }])
        : reply(true, [{ name: critName, result: 'pass', evidence: 'ok' }]);
    }
    return r;
  };
  const t = a.orchestrator.submit({ brief: BRIEF, projectId: 'repo', options: { lane: 'fast', slim: { accept: 'brief' }, review: false } });
  const done = await a.orchestrator.waitFor(t.id);
  return { done, accepts, followupPlans: () => followupPlans };
}

test('K5 luồng D18b: tiêu chí không mã → cổng bổ sung đạt (followupScope.skipped), chạy hết hạng mục, nghiệm thu lại đạt', async () => {
  const a = setup();
  try {
    const { done, followupPlans } = await flow(a, 'chainChecker bắt buộc ký — log gỡ hết sig vẫn lọt');
    assert.notEqual(done.status, 'failed', done.error);
    assert.equal(done.status, 'done', done.error);
    assert.equal(followupPlans(), 1, 'trưởng phòng được gọi lập kế hoạch bổ sung một lần');
    assert.equal(done.runs.length, 2);
    assert.equal(done.runs[1].round, 1);
    assert.equal(done.runs[1].subtasks.length, fixturePlan.subtasks.length);
    assert.equal(done.runs[1].subtasks.every((s) => s.status === 'done'), true, 'chạy hết hạng mục');
    assert.equal(done.acceptance?.accepted, true, 'nghiệm thu lại đạt');
    const logs = a.logs.query({ task: done.id });
    const gates = logs.filter((e) => e.kind === 'gate.decision' || e.kind === 'plan.gate');
    const fu = gates.filter((e) => (e.data as { followupScope?: unknown }).followupScope);
    assert.ok(fu.length >= 1, 'log cổng có followupScope');
    const scope = (fu[0].data as { followupScope: { round: number; codes: string[]; skipped: boolean } }).followupScope;
    assert.equal(scope.round, 1);
    assert.deepEqual(scope.codes, []);
    assert.equal(scope.skipped, true);
    assert.equal(fu.every((e) => (e.data as { verdict?: string }).verdict !== 'block'), true, 'cổng vòng bổ sung không chặn');
    assert.equal(logs.some((e) => e.kind === 'plan.gate' && (e.data as { stage?: string }).stage === 'stopped'), false);
  } finally {
    a.cleanupAll();
  }
});
