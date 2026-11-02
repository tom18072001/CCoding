import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checksOutcome, computeKpi, kpiMarkdown, verificationClaim, type CallRow } from '../src/kpi.js';
import { testApp } from './helpers.js';

type Src = Parameters<typeof computeKpi>[0];

const tool = (name: string, args: string, ok = true) => ({ name, args, ok, ms: 1, outputChars: 1 });
function call(p: Partial<CallRow> & Pick<CallRow, 'taskId' | 'agentId' | 'phase'>): CallRow {
  return { ts: '', callId: `${p.taskId}-${p.agentId}-${p.phase}-${p.subtaskId ?? ''}-${Math.random()}`, department: 'dev', runtime: 'ollama', model: 'qwen3:8b', input: 1000, output: 200, cacheRead: 0, durationMs: 10_000, ...p };
}
const ok = (command: string) => ({ command, code: 0, ok: true, ms: 1, summary: '', tail: '' });
const bad = (command: string) => ({ command, code: 1, ok: false, ms: 1, summary: '', tail: '' });

function task(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
    status: 'done',
    createdAt: `2026-11-0${id.length}T00:00:00Z`,
    updatedAt: '',
    options: { budgetTokens: 1e6 },
    runs: [{ department: 'dev', usage: { input: 0, output: 0, cacheRead: 0 }, subtasks: [{ id: 'S1', assignee: 'backend-dev', attempts: 1, output: 'x' }], review: { approved: true, summary: '', issues: [] } }],
    ...extra,
  };
}

function source(app: ReturnType<typeof testApp>, tasks: unknown[], calls: Record<string, CallRow[]>, transcript: Record<string, unknown[]> = {}, limits?: Src['limits']): Src {
  return {
    tasks: tasks as Src['tasks'],
    calls: (id) => calls[id] ?? [],
    transcript: (id) => (transcript[id] ?? []) as ReturnType<Src['transcript']>,
    project: () => undefined,
    agent: (id) => app.registry.agents.get(id),
    access: () => 'exec',
    limits,
  };
}

test('KPI v2: phát hiện khẳng định đã kiểm chứng (VI/EN), bỏ câu phủ định', () => {
  assert.ok(verificationClaim('## Tóm tắt\nĐã xong. Tất cả test đều pass.'));
  assert.ok(verificationClaim('npm run typecheck: 0 lỗi'));
  assert.ok(verificationClaim('Result: 12/12 tests passed'));
  assert.ok(verificationClaim('exit code 0'));
  assert.equal(verificationClaim('Chưa chạy test vì thiếu môi trường; test sẽ pass khi có DB.'), undefined);
  assert.equal(verificationClaim('Cần chạy npm test để kiểm tra.'), undefined);
  assert.equal(verificationClaim('Thiết kế pipeline Logstash.'), undefined);
});

test('KPI v2: kết quả lệnh kiểm tra trước/sau — hồi quy, sửa được, vẫn lỗi, bỏ lệnh bị chặn', () => {
  assert.equal(checksOutcome({}), undefined);
  assert.deepEqual(checksOutcome({ projectChecks: { baseline: [ok('npm test')], latest: [bad('npm test')] } }), { pass: false, regressed: true, fixed: false, stillFailing: false });
  assert.deepEqual(checksOutcome({ projectChecks: { baseline: [bad('npm test')], latest: [ok('npm test')] } }), { pass: true, regressed: false, fixed: true, stillFailing: false });
  assert.deepEqual(checksOutcome({ projectChecks: { baseline: [bad('tsc')], latest: [bad('tsc')] } }), { pass: false, regressed: false, fixed: false, stillFailing: true });
  assert.equal(checksOutcome({ projectChecks: { latest: [{ ...bad('rm -rf /'), denied: 'x' }] } }), undefined);
});

test('KPI v2: khẳng định không có lệnh kiểm chứng, hồi quy, duyệt sai và co điểm theo bằng chứng', () => {
  const app = testApp();
  try {
    const claim = '## Tóm tắt\nĐã sửa xong, tất cả test đều pass.';
    const calls = {
      T1: [
        call({ taskId: 'T1', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', text: claim, tools: [tool('write_file', 'src/a.ts')] }),
        call({ taskId: 'T1', agentId: 'qa-tester', phase: 'review', text: '{"approved":true}', tools: [] }),
      ],
    };
    const t1 = task('T1', { projectChecks: { baseline: [ok('npm test')], latest: [bad('npm test')] } });
    const tr = { T1: [{ kind: 'review', from: 'qa-tester', department: 'dev', text: 'Duyệt.' }] };
    const r = computeKpi(source(app, [t1], calls, tr));
    const be = r.agents.find((a) => a.agentId === 'backend-dev')!;
    assert.deepEqual(be.honesty && { claims: be.honesty.claims, unbacked: be.honesty.unbacked }, { claims: 1, unbacked: 1 });
    assert.equal(be.scores.honesty, 0);
    assert.equal(be.outcome?.checksRegressed, 1);
    assert.equal(be.scores.outcome, 0);
    assert.ok(be.findingKeys.includes('unbacked-claims'));
    assert.ok(be.findingKeys.includes('regression'));
    assert.notEqual(be.confidence, 'high');
    assert.ok(be.score >= be.scoreRaw!, 'điểm thấp được co lên về 60 khi ít bằng chứng — không kết luận vội');
    const qa = r.agents.find((a) => a.agentId === 'qa-tester')!;
    assert.deepEqual(qa.calibration, { decisions: 1, falseApprovals: 1, falseRejections: 0 });
    assert.ok(qa.findingKeys.includes('false-approval'));
    // cùng khẳng định nhưng có chạy npm test trong lượt đó → không tính là tự khai
    const calls2 = { T1: [call({ taskId: 'T1', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', text: claim, tools: [tool('run_command', 'npm test')] })] };
    const be2 = computeKpi(source(app, [task('T1')], calls2)).agents.find((a) => a.agentId === 'backend-dev')!;
    assert.equal(be2.honesty?.unbacked, 0);
    assert.equal(be2.scores.honesty, 100);
  } finally {
    app.cleanup();
  }
});

test('KPI v2: review không đọc được JSON bị tính (v1 bỏ qua), CTO nghiệm thu chia cho người thực thi và trưởng phòng', () => {
  const app = testApp();
  try {
    const calls = {
      T2: [
        call({ taskId: 'T2', agentId: 'dev-lead', phase: 'plan', text: '{}' }),
        call({ taskId: 'T2', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', text: '## Tóm tắt\nxong' }),
        call({ taskId: 'T2', agentId: 'qa-tester', phase: 'review', text: 'ok luôn' }),
      ],
    };
    const t2 = task('T2', { acceptance: { at: '', by: 'cto', accepted: false, parsed: true, summary: '', criteria: [{ name: 'a', result: 'pass', evidence: '' }, { name: 'b', result: 'fail', evidence: '' }], risks: [], followUps: [], sig: '' } });
    const tr = { T2: [{ kind: 'review', from: 'qa-tester', department: 'dev', text: 'Không đọc được kết luận review dạng JSON — chưa coi là đã duyệt.' }] };
    const r = computeKpi(source(app, [t2], calls, tr));
    const qa = r.agents.find((a) => a.agentId === 'qa-tester')!;
    assert.equal(qa.format?.reviewUnparsed, 1);
    assert.ok(qa.findingKeys.includes('review-unparsed'));
    assert.ok((qa.scores.reliability ?? 100) < 100);
    const be = r.agents.find((a) => a.agentId === 'backend-dev')!;
    const lead = r.agents.find((a) => a.agentId === 'dev-lead')!;
    assert.equal(be.outcome?.criteriaFailed, 1);
    assert.equal(be.scores.outcome, 50);
    assert.equal(lead.scores.outcome, 50);
  } finally {
    app.cleanup();
  }
});

test('KPI v2: prompt sát cửa sổ ngữ cảnh (Ollama num_ctx) và đầu ra chạm trần thật của runtime', () => {
  const app = testApp();
  try {
    const calls = {
      T3: [
        call({ taskId: 'T3', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', input: 32_500, output: 4096, text: 'x'.repeat(50) }),
        call({ taskId: 'T3', agentId: 'backend-dev', phase: 'revise', subtaskId: 'S1', input: 28_000, output: 100, text: 'y'.repeat(50) }),
      ],
    };
    const r = computeKpi(source(app, [task('T3')], calls, {}, () => ({ contextWindow: 32_768, maxOut: 4096 })));
    const be = r.agents.find((a) => a.agentId === 'backend-dev')!;
    assert.deepEqual(be.context, { known: 2, nearLimit: 1, overLimit: 1, maxFillPct: 99 });
    assert.equal(be.truncated, 1);
    assert.ok(be.findingKeys.includes('context-overflow'));
    assert.match(kpiMarkdown(r), /99%/);
  } finally {
    app.cleanup();
  }
});

test('KPI v2: tách theo agent × model khi một agent chạy cả model đám mây lẫn Ollama', () => {
  const app = testApp();
  try {
    const calls = {
      T4: [call({ taskId: 'T4', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', model: 'sonnet', runtime: 'claude-cli', text: '## Tóm tắt\nA' })],
      T5: [call({ taskId: 'T5', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', model: 'qwen3:8b', text: '## Tóm tắt\nB' })],
    };
    const src = source(app, [task('T4'), task('T5')], calls);
    const merged = computeKpi(src).agents.filter((a) => a.agentId === 'backend-dev');
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0].models, { sonnet: 1, 'qwen3:8b': 1 });
    const split = computeKpi(src, { by: 'agent-model' }).agents.filter((a) => a.agentId === 'backend-dev');
    assert.deepEqual(split.map((a) => a.key).sort(), ['backend-dev@qwen3:8b', 'backend-dev@sonnet']);
    assert.ok(split.every((a) => a.subtasks === 1));
  } finally {
    app.cleanup();
  }
});

test('KPI v2: một hạng mục sạch không còn được điểm A (co về trung tính); nhiều bằng chứng thì gần điểm thô', () => {
  const app = testApp();
  try {
    const mk = (id: string) => [call({ taskId: id, agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', text: '## Tóm tắt\nok', tools: [tool('run_command', 'npm test')] })];
    const one = computeKpi(source(app, [task('A')], { A: mk('A') })).agents.find((a) => a.agentId === 'backend-dev')!;
    assert.equal(one.confidence, 'low');
    assert.ok(one.score < 80, `một hạng mục: ${one.score}`);
    const ids = ['B', 'BB', 'BBB', 'BBBB', 'BBBBB'];
    const many = computeKpi(source(app, ids.map((i) => task(i)), Object.fromEntries(ids.map((i) => [i, mk(i)])))).agents.find((a) => a.agentId === 'backend-dev')!;
    assert.equal(many.confidence, 'high');
    assert.ok(Math.abs(many.score - many.scoreRaw!) < Math.abs(one.score - one.scoreRaw!));
  } finally {
    app.cleanup();
  }
});

test('KPI v2: mô tả ca kiểm thử không bị coi là khẳng định đã chạy', () => {
  assert.equal(verificationClaim('- Test case: đăng nhập thành công với mật khẩu đúng'), undefined);
  assert.equal(verificationClaim('Viết test để đảm bảo build ổn định'), undefined);
  assert.ok(verificationClaim('Đã chạy `npm test` → 14/14 đạt'));
  assert.ok(verificationClaim('build: ok'));
});
