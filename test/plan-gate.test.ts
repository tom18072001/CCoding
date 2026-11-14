import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MockRuntime } from '../src/runtimes/mock.js';
import { parsePlan } from '../src/planner.js';
import { briefItems, checkPlanCoverage, checkPlanReadable, planGate, planTargets, type GateSubtask } from '../src/plan-gate.js';

const IDS = ['backend-dev', 'frontend-dev', 'data-engineer', 'senior-swe'];
const st = (id: string, over: Partial<GateSubtask> = {}): GateSubtask => ({ id, title: `Việc ${id}`, description: `Mô tả ${id}`, assignee: 'backend-dev', deliverable: `sản phẩm ${id}`, ...over });

// --- fixture rút từ bench/vs-claude/results/C9 (brief + planSummary + subtasks) ---
const T5_BRIEF =
  'Xây dựng công cụ logq theo đúng đặc tả trong SPEC.md: thư viện (src/parse.js, src/query.js, src/agg.js) và CLI bin/logq.js. Viết test cho các module, đảm bảo `npm test` xanh. Không thêm thư viện ngoài.';
const T5_SUMMARY =
  'Bốn hạng mục độc lập chạy song song, mỗi hạng mục sở hữu tệp riêng và viết theo hợp đồng trong SPEC.md. Cụ thể: parse.js, query.js, agg.js và CLI. CLI chỉ dùng API đã chốt trong src/index.js (parseLine, compile, QuerySyntaxError, aggregate). index.js đã có sẵn nên không ai sửa. Test của mỗi phần nằm ở test/<phần>.test.js.';
const T5_SUBTASKS: GateSubtask[] = [
  { id: 'S1', title: 'Hiện thực src/parse.js + test', assignee: 'backend-dev', description: 'Hiện thực parseLine(line) trong src/parse.js đúng SPEC §1. Test viết trong test/parse.test.js.', deliverable: 'src/parse.js, test/parse.test.js (test xanh)' },
  { id: 'S2', title: 'Hiện thực src/query.js + test', assignee: 'frontend-dev', description: 'Chỉ giao cho backend-dev nếu S1 có người khác làm. Nếu phải cùng một người thì xem ghi chú trong phần summary. (Assignee thực tế: data-engineer, xem mục S2 bên dưới.)', deliverable: '(không dùng)' },
];
const T1_BRIEF = 'Hiện thực src/duration.js theo SPEC.md: parse và format thời lượng. Viết test, đảm bảo `npm test` xanh.';
const T1_SUMMARY = 'Tách module thành hai phần độc lập theo hợp đồng chung: parse (src/parse.js) và format (src/format.js). Tệp src/duration.js chỉ re-export và do một hạng mục sở hữu. Mỗi bên viết test riêng.';
const T1_SUBTASKS: GateSubtask[] = [
  st('S1', { title: 'parse', description: 'Hiện thực src/parse.js + test/parse.test.js', deliverable: 'src/parse.js, test/parse.test.js' }),
  st('S2', { title: 'format', assignee: 'frontend-dev', description: 'Hiện thực src/format.js và src/duration.js (re-export) + test', deliverable: 'src/format.js, src/duration.js' }),
];

test('planTargets: đường dẫn có đuôi tệp, gộp tên rút gọn, bỏ tệp tham khảo', () => {
  const t = planTargets(T5_BRIEF, T5_SUMMARY);
  assert.deepEqual([...t].sort(), ['bin/logq.js', 'src/agg.js', 'src/parse.js', 'src/query.js']);
  // tên rút gọn trong tóm tắt ↔ đường dẫn đầy đủ trong đề bài; SPEC.md không phải đích; test/<phần>… bị bỏ
  assert.ok(!t.includes('agg.js') && !t.some((x) => x.includes('SPEC')) && !t.includes('src/index.js'));
  // tên rút gọn + git ls-files
  assert.deepEqual(planTargets('Sửa agg.js', '', ['src/agg.js', 'src/x.js']), ['src/agg.js']);
});

test('quy tắc A: đích chưa có hạng mục nhận bị chặn; phủ qua title/description/deliverable', () => {
  const miss = checkPlanCoverage({ brief: T5_BRIEF, planSummary: T5_SUMMARY, subtasks: T5_SUBTASKS });
  assert.deepEqual([...miss.uncovered].sort(), ['bin/logq.js', 'src/agg.js']);
  const full = [...T5_SUBTASKS, st('S3', { description: 'Hiện thực agg' , deliverable: 'src/agg.js'}), st('S4', { title: 'CLI bin/logq.js' })];
  assert.deepEqual(checkPlanCoverage({ brief: T5_BRIEF, planSummary: T5_SUMMARY, subtasks: full }).uncovered, []);
});

test('quy tắc A: outOfScope có lý do thì không chặn, thiếu lý do thì vẫn chặn', () => {
  const sub = [st('S1', { description: 'Sửa src/a.js' })];
  const brief = 'Sửa src/a.js và src/b.js';
  assert.deepEqual(checkPlanCoverage({ brief, planSummary: '', subtasks: sub }).uncovered, ['src/b.js']);
  assert.deepEqual(checkPlanCoverage({ brief, planSummary: '', subtasks: sub, outOfScope: [{ target: 'src/b.js', reason: 'đã có sẵn, không ai sửa' }] }).uncovered, []);
  assert.deepEqual(checkPlanCoverage({ brief, planSummary: '', subtasks: sub, outOfScope: [{ target: 'src/b.js', reason: '  ' }] }).uncovered, ['src/b.js']);
});

test('quy tắc B: bốn tiêu chí (i)–(iv) riêng biệt', () => {
  const ok = [st('S1'), st('S2')];
  assert.deepEqual(checkPlanReadable({ planSummary: 'Chia hai hạng mục song song.', subtasks: ok }), []);
  assert.match(checkPlanReadable({ planSummary: 'Bốn hạng mục độc lập.', subtasks: ok })[0], /^\(i\).*4.*2/);
  assert.match(checkPlanReadable({ planSummary: 'Chia 3 hạng mục.', subtasks: ok })[0], /^\(i\)/);
  assert.deepEqual(checkPlanReadable({ planSummary: 'Một hạng mục sở hữu phần ghép nối.', subtasks: ok }), [], '"một hạng mục sở hữu…" không phải số đếm');
  for (const d of ['(không dùng)', '—']) {
    assert.match(checkPlanReadable({ planSummary: '', subtasks: [st('S1', { deliverable: d })] })[0], /^\(ii\) S1/, d);
  }
  // rỗng chỉ bị coi là dở khi hạng mục khác có deliverable; kế hoạch bỏ hẳn trường ở mọi hạng mục là kiểu tối giản hợp lệ
  for (const d of [undefined, '']) {
    assert.match(checkPlanReadable({ planSummary: '', subtasks: [st('S1', { deliverable: d }), st('S2')] })[0], /^\(ii\) S1/, String(d));
    assert.deepEqual(checkPlanReadable({ planSummary: '', subtasks: [st('S1', { deliverable: d }), st('S2', { deliverable: d })] }), []);
  }
  const iii = checkPlanReadable({ planSummary: '', subtasks: [st('S1', { assignee: 'frontend-dev', description: 'Chỉ giao cho backend-dev nếu cần' })], agentIds: IDS });
  assert.match(iii[0], /^\(iii\) S1/);
  assert.deepEqual(checkPlanReadable({ planSummary: '', subtasks: [st('S1', { description: 'Phối hợp với @frontend-dev khi nối API' })], agentIds: IDS }), []);
  assert.match(checkPlanReadable({ planSummary: '', subtasks: ok, truncated: true })[0], /^\(iv\)/);
});

test('parsePlan: cờ truncated khi JSON cụt; kế hoạch tốt không có cờ; outOfScope đọc được', () => {
  const lead = { id: 'dev-lead' } as never;
  const roster = [{ id: 'backend-dev', name: 'B', title: 'B', role: 'member', skills: [] }] as never;
  const cut = 'Kế hoạch:\n```json\n{"summary":"Hai hạng mục","subtasks":[{"id":"S1","title":"a","assignee":"backend-dev","description":"x","deliverable":"y"},{"id":"S2","title":"b","assignee":"backend-dev","desc';
  const p = parsePlan(cut, roster, lead, 'brief');
  assert.equal(p.parsed, false);
  assert.equal(p.truncated, true);
  const good = '```json\n{"summary":"Một hạng mục.","outOfScope":[{"target":"src/i.js","reason":"đã có"},"src/j.js — chỉ đọc"],"subtasks":[{"id":"S1","title":"a","assignee":"backend-dev","description":"x","deliverable":"y"}]}\n```';
  const g = parsePlan(good, roster, lead, 'brief');
  assert.equal(g.parsed, true);
  assert.equal(g.truncated, undefined);
  assert.deepEqual(g.outOfScope, [{ target: 'src/i.js', reason: 'đã có' }, { target: 'src/j.js', reason: 'chỉ đọc' }]);
});

test('planGate: fixture t5 C9 lượt 2 bị chặn bởi cả A và B; t1 C9 lượt 3 không bị chặn', () => {
  const t5 = planGate({ brief: T5_BRIEF, planSummary: T5_SUMMARY, subtasks: T5_SUBTASKS, agentIds: IDS });
  assert.equal(t5.blocked, true);
  assert.deepEqual(t5.rules, ['A', 'B']);
  assert.deepEqual([...t5.uncovered].sort(), ['bin/logq.js', 'src/agg.js']);
  assert.ok(t5.reasons.some((r) => r.includes('(i)')) && t5.reasons.some((r) => r.includes('(ii)')) && t5.reasons.some((r) => r.includes('(iii)')));
  const t1 = planGate({ brief: T1_BRIEF, planSummary: T1_SUMMARY, subtasks: T1_SUBTASKS, agentIds: IDS });
  assert.deepEqual(t1, { blocked: false, rules: [], uncovered: [], reasons: [] });
});

// --- nối vào orchestrator, runtime mock ---

type Variant = { summary: string; subtasks: Array<Record<string, unknown>> };
const proto = MockRuntime.prototype as unknown as { generate: (req: { phase: string; hints?: Record<string, unknown> }, rnd: () => number) => string };

/** Thay lượt 'plan' của mock bằng kế hoạch dựng sẵn: lần đầu `first`, các lần sau (hints.replan) `again`. Trả về hàm khôi phục + bộ đếm. */
function scriptPlans(first: Variant, again: Variant) {
  const orig = proto.generate;
  const seen = { plan: 0, replan: 0 };
  proto.generate = function (req, rnd) {
    if (req.phase !== 'plan') return orig.call(this, req, rnd);
    const roster = (req.hints?.roster as Array<{ id: string; role: string }>) ?? [];
    const who = roster.find((r) => r.role === 'member')?.id ?? 'backend-dev';
    const replan = !!req.hints?.replan;
    seen[replan ? 'replan' : 'plan']++;
    const v = replan ? again : first;
    return `\`\`\`json\n${JSON.stringify({ summary: v.summary, subtasks: v.subtasks.map((s) => ({ assignee: who, dependsOn: [], ...s })) })}\n\`\`\``;
  };
  return { seen, restore: () => void (proto.generate = orig) };
}

function app() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-plangate-'));
  const base = loadConfig();
  const a = createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'mock', order: ['mock'] },
    runtimes: { ...base.runtimes, mock: { minDelayMs: 1, maxDelayMs: 5, reviewRejectRate: 0 } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
    tools: { ...base.tools, repoMap: false },
  });
  const repo = path.join(dataDir, 'repo');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"x","private":true}\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  a.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: repo, classification: 'internal', toolAccess: 'write', createdAt: new Date().toISOString() });
  return Object.assign(a, { cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true }) });
}

const BRIEF_AB = 'Thêm hàm vào src/a.js và tạo mới src/b.js';
const onlyA: Variant = { summary: 'Một hạng mục sửa src/a.js.', subtasks: [{ id: 'S1', title: 'Sửa src/a.js', description: 'Thêm hàm vào src/a.js', deliverable: 'src/a.js' }] };
const both: Variant = {
  summary: 'Hai hạng mục: src/a.js và src/b.js.',
  subtasks: [
    { id: 'S1', title: 'Sửa src/a.js', description: 'Thêm hàm vào src/a.js', deliverable: 'src/a.js' },
    { id: 'S2', title: 'Tạo src/b.js', description: 'Tạo module src/b.js', deliverable: 'src/b.js' },
  ],
};

for (const lane of ['fast', 'full'] as const) {
  test(`cổng nối orchestrator (${lane}): A trượt → sửa kế hoạch một lượt rồi chạy đủ hạng mục`, async () => {
    const a = app();
    const s = scriptPlans(onlyA, both);
    try {
      const t = a.orchestrator.submit({ brief: BRIEF_AB, projectId: 'repo', options: { lane } });
      const done = await a.orchestrator.waitFor(t.id);
      assert.equal(done.status, 'done', done.error);
      assert.deepEqual(s.seen, { plan: 1, replan: 1 });
      const run = done.runs[0];
      assert.equal(run.subtasks.length, 2);
      assert.equal(run.planGate?.replanned, true);
      assert.deepEqual(run.planGate?.uncovered, []);
      const logs = a.logs.query({ task: t.id, kind: 'plan.gate' });
      assert.ok(logs.length >= 2, 'ghi plan.gate lúc chặn và lúc sau khi sửa');
    } finally {
      s.restore();
      a.cleanup();
    }
  });
}

test('cổng nối orchestrator: A vẫn thiếu sau khi sửa → dừng attention plan-coverage, không chạy hạng mục nào', async () => {
  const a = app();
  const s = scriptPlans(onlyA, onlyA);
  try {
    const t = a.orchestrator.submit({ brief: BRIEF_AB, projectId: 'repo', options: { lane: 'fast' } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'failed');
    assert.equal(done.attention?.reason, 'plan-coverage');
    assert.match(done.attention?.detail ?? '', /src\/b\.js/);
    assert.deepEqual(s.seen, { plan: 1, replan: 1 }, 'tối đa một lượt sửa kế hoạch');
    assert.equal(a.usage.summary('phase', { task: t.id }).some((r) => r.key === 'execute'), false, 'không chạy execute');
    assert.ok(done.runs[0].subtasks.every((x) => x.attempts === 0 && x.status !== 'done'), 'không chạy tập con hạng mục');
    assert.deepEqual(done.runs[0].planGate?.rules, ['A']);
  } finally {
    s.restore();
    a.cleanup();
  }
});

test('cổng nối orchestrator: B (tóm tắt khai 3, đọc được 1) vẫn dở → dừng attention plan-unreadable', async () => {
  const a = app();
  const dở: Variant = { summary: 'Chia 3 hạng mục song song.', subtasks: [{ id: 'S1', title: 'Việc duy nhất', description: 'Sửa src/a.js', deliverable: 'src/a.js' }] };
  const s = scriptPlans(dở, dở);
  try {
    const t = a.orchestrator.submit({ brief: 'Thêm hàm vào src/a.js', projectId: 'repo', options: { lane: 'full' } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'failed');
    assert.equal(done.attention?.reason, 'plan-unreadable');
    assert.deepEqual(s.seen, { plan: 1, replan: 1 });
    assert.equal(a.usage.summary('phase', { task: t.id }).some((r) => r.key === 'execute'), false);
  } finally {
    s.restore();
    a.cleanup();
  }
});

test('cổng nối orchestrator: kế hoạch đạt thì không tốn thêm lượt plan', async () => {
  const a = app();
  const s = scriptPlans(both, both);
  try {
    const t = a.orchestrator.submit({ brief: BRIEF_AB, projectId: 'repo', options: { lane: 'fast' } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.deepEqual(s.seen, { plan: 1, replan: 0 });
    assert.deepEqual(done.runs[0].planGate, { uncovered: [], reasons: [], rules: [] });
  } finally {
    s.restore();
    a.cleanup();
  }
});

// ── brief-item: hạng mục có mã của đề bài (fixture: đề bài D17) ──
const D17_BRIEF = [
  '# Phòng Dev, gói D17',
  '',
  '**K1 — dev-backend: cổng phủ kế hoạch kiểm cả hạng mục của đề bài**',
  '- Nhận diện hạng mục có mã.',
  '**K2 — dev-backend: đề bài đòi review thì không được bỏ review**',
  '**K3 — dev-backend: CTO chưa nghiệm thu thì tự làm một vòng bổ sung**',
  '**K4 — code-reviewer: review K1–K3**',
].join('\n');
const ROLES = {
  'backend-dev': { role: 'developer', skills: ['backend'] },
  'senior-swe': { role: 'developer', skills: ['backend'] },
  'qa-tester': { role: 'reviewer', skills: ['code-review', 'testing'] },
};
const d17 = (extra: GateSubtask[]): GateSubtask[] => [
  st('S1', { title: 'K1 cổng phủ' }), st('S2', { title: 'K2 review' }), st('S3', { title: 'K3 vòng bổ sung' }), ...extra,
];
const gate = (brief: string, subtasks: GateSubtask[]) => planGate({ brief, planSummary: '', subtasks, agentIds: IDS, agentRoles: ROLES });

test('briefItems: đọc các dạng dòng, vai và cờ review/exempt', () => {
  const it = briefItems(['**K1 — dev-backend: a**', 'K2 — b', 'K3: c @qa-tester', 'K4 - d review kỹ', '## K5 – e', 'K6 — chờ quyết định', 'Dải K1–K3 trong mô tả'].join('\n'));
  assert.deepEqual(it.map((x) => x.code), ['K1', 'K2', 'K3', 'K4', 'K5', 'K6']);
  assert.equal(it[0].role, 'dev-backend');
  assert.equal(it[2].role, 'qa-tester');
  assert.equal(it[2].review, true);
  assert.equal(it[3].review, true);
  assert.equal(it[1].review, false);
  assert.equal(it[5].exempt, true);
  assert.equal(it[4].exempt, false);
  assert.deepEqual(briefItems(D17_BRIEF).map((x) => [x.code, x.role]), [['K1', 'dev-backend'], ['K2', 'dev-backend'], ['K3', 'dev-backend'], ['K4', 'code-reviewer']]);
});

test('briefItems: "không làm" ở phần ngay dưới dòng mã cũng được miễn', () => {
  const it = briefItems('K1 — việc a\nK2 — việc b\nKhông làm trong gói này.\nK3 — việc c');
  assert.deepEqual(it.map((x) => x.exempt), [false, true, false]);
});

test('brief-item: kế hoạch bỏ K4 → chặn', () => {
  const g = gate(D17_BRIEF, d17([]));
  assert.equal(g.blocked, true);
  assert.ok(g.rules.includes('brief-item'));
  assert.ok(g.reasons.some((r) => r.includes('K4')));
});

test('brief-item: K4 giao qa-tester (role reviewer / skill code-review) → đạt', () => {
  const g = gate(D17_BRIEF, d17([st('S4', { title: 'K4 review', assignee: 'qa-tester' })]));
  assert.equal(g.blocked, false);
  assert.deepEqual(g.rules, []);
});

test('brief-item: K4 nhắc nhưng giao sai vai → chặn, nêu vai thiếu', () => {
  const g = gate(D17_BRIEF, d17([st('S4', { title: 'K4 review', assignee: 'senior-swe' })]));
  assert.equal(g.blocked, true);
  assert.ok(g.reasons.some((r) => r.includes('K4') && r.includes('code-reviewer')));
});

test('brief-item: mục "không làm" được miễn', () => {
  const brief = 'K1 — việc a\nK2 — Phần (a): không làm';
  assert.equal(gate(brief, [st('S1', { title: 'K1 việc a' })]).blocked, false);
});

test('brief-item: đề bài không có mã → không đổi hành vi; K1 không khớp K10', () => {
  assert.equal(gate('Làm việc bình thường', [st('S1')]).rules.includes('brief-item'), false);
  const g = gate('K1 — việc a', [st('S1', { title: 'K10 việc khác' })]);
  assert.ok(g.rules.includes('brief-item'));
});

const D17_FULL = [
  '**K1 — dev-backend: cổng phủ kế hoạch**',
  '- Khi đề bài nói một hạng mục không làm hay chờ (vd. "Phần (a): không làm"), hạng mục đó được miễn.',
  '**K2 — dev-backend: không bỏ review**',
  '**K3 — dev-backend: vòng bổ sung**',
  '**K4 — code-reviewer: review K1–K3**',
].join('\n');

test('briefItems: câu ví dụ "không làm" trong thân K1 không miễn K1; bỏ K1 → chặn', () => {
  assert.equal(briefItems(D17_FULL)[0].exempt, false);
  const g = gate(D17_FULL, [st('S2', { title: 'K2' }), st('S3', { title: 'K3' }), st('S4', { title: 'K4 review', assignee: 'qa-tester' })]);
  assert.equal(g.blocked, true);
  assert.ok(g.reasons.some((r) => r.includes('K1')));
});

test('brief-item: D17 đầy đủ, K3 giao senior-swe, K4 giao qa-tester → đạt (vai dev-* chỉ là gợi ý)', () => {
  const g = gate(D17_FULL, [st('S1', { title: 'K1' }), st('S2', { title: 'K2' }), st('S3', { title: 'K3', assignee: 'senior-swe' }), st('S4', { title: 'K4 review', assignee: 'qa-tester' })]);
  assert.equal(g.blocked, false);
});
