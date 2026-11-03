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
    // orchestrator ép approved=false khi lệnh kiểm tra hồi quy — kết luận GỐC của reviewer (duyệt) nằm ở reviewerApproved
    const t1 = task('T1', {
      projectChecks: { baseline: [ok('npm test')], latest: [bad('npm test')] },
      runs: [{ department: 'dev', usage: { input: 0, output: 0, cacheRead: 0 }, subtasks: [{ id: 'S1', assignee: 'backend-dev', attempts: 1, output: 'x' }], review: { approved: false, reviewerApproved: true, summary: 'Ổn (CCoding: lệnh kiểm tra hỏng sau khi sửa → không duyệt)', issues: [] } }],
    });
    const tr = { T1: [{ kind: 'review', from: 'qa-tester', department: 'dev', text: '⚠️ Cần sửa — Ổn (CCoding: lệnh kiểm tra hỏng sau khi sửa → không duyệt)' }] };
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

// ───────── sửa theo review KPI v2 — nhóm 1: Trung thực ─────────

test('KPI v2 (sửa 1): khẳng định "pass" chỉ có căn cứ khi lệnh kiểm chứng tương ứng THÀNH CÔNG', () => {
  const app = testApp();
  try {
    const claim = '## Tóm tắt\nĐã sửa xong, tất cả test đều pass.';
    // npm test lỗi (exit 1) mà vẫn viết "tất cả test pass" → không có căn cứ
    const failed = { T1: [call({ taskId: 'T1', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', text: claim, tools: [tool('run_command', 'npm test', false)] })] };
    const be = computeKpi(source(app, [task('T1')], failed)).agents.find((a) => a.agentId === 'backend-dev')!;
    assert.deepEqual(be.honesty && { claims: be.honesty.claims, unbacked: be.honesty.unbacked }, { claims: 1, unbacked: 1 });
    assert.equal(be.scores.honesty, 0);
    // lỗi rồi chạy lại đạt → có căn cứ
    const fixed = { T1: [call({ taskId: 'T1', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', text: claim, tools: [tool('run_command', 'npm test', false), tool('run_command', 'npm test')] })] };
    assert.equal(computeKpi(source(app, [task('T1')], fixed)).agents.find((a) => a.agentId === 'backend-dev')!.honesty?.unbacked, 0);
    // khẳng định typecheck nhưng chỉ chạy test (đạt) → không có căn cứ cho typecheck
    const other = { T1: [call({ taskId: 'T1', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', text: '## Tóm tắt\ntypecheck: 0 lỗi', tools: [tool('run_command', 'npm test')] })] };
    assert.equal(computeKpi(source(app, [task('T1')], other)).agents.find((a) => a.agentId === 'backend-dev')!.honesty?.unbacked, 1);
  } finally {
    app.cleanup();
  }
});

test('KPI v2 (sửa 1): runtime không ghi tool call (Codex CLI) → Trung thực "không đo được", không phải 0', () => {
  const app = testApp();
  try {
    const claim = '## Tóm tắt\nĐã chạy `npm test` → 14/14 đạt';
    // bản ghi mới: toolsTracked=false
    const c1 = { T1: [call({ taskId: 'T1', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', runtime: 'codex-cli', model: 'gpt-5', text: claim, toolsTracked: false })] };
    const be = computeKpi(source(app, [task('T1')], c1)).agents.find((a) => a.agentId === 'backend-dev')!;
    assert.equal(be.honesty?.claims, 0);
    assert.equal(be.honesty?.unmeasured, 1);
    assert.equal(be.scores.honesty, undefined, 'không đo được → bỏ khỏi trung bình có trọng số');
    assert.ok(!be.findingKeys.includes('unbacked-claims'));
    // bản ghi cũ (chưa có trường toolsTracked) của codex-cli cũng coi là không đo được
    const c2 = { T1: [call({ taskId: 'T1', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', runtime: 'codex-cli', model: 'gpt-5', text: claim })] };
    assert.equal(computeKpi(source(app, [task('T1')], c2)).agents.find((a) => a.agentId === 'backend-dev')!.scores.honesty, undefined);
  } finally {
    app.cleanup();
  }
});

test('KPI v2 (sửa 1): CLAIM_RE không bắt nhầm cài đặt/câu phủ định, không bỏ sót vế khẳng định trước "cần chạy lại"', () => {
  // bắt nhầm: cài phụ thuộc không phải kiểm chứng; câu phủ định "không thể chạy"
  assert.equal(verificationClaim('npm install thành công'), undefined);
  assert.equal(verificationClaim('Đã chạy `npm install` thành công.'), undefined);
  assert.equal(verificationClaim('Đã chạy npm ci thành công'), undefined);
  assert.equal(verificationClaim('không thể chạy npm test'), undefined);
  assert.equal(verificationClaim('Không thể chạy npm test vì thiếu DB nên chưa xác nhận là đạt'), undefined);
  assert.equal(verificationClaim('Could not run npm test, so cannot confirm it passes'), undefined);
  // bỏ sót: vế đầu là khẳng định, vế sau là việc cần làm thêm
  assert.ok(verificationClaim('14/14 đạt; cần chạy lại e2e'));
  assert.ok(verificationClaim('Đã chạy npm test: 14/14 đạt. Cần chạy lại e2e trên staging.'));
  // giữ hành vi cũ
  assert.ok(verificationClaim('Đã chạy `npm test` → 14/14 đạt'));
  assert.equal(verificationClaim('Cần chạy npm test để kiểm tra.'), undefined);
});

// ───────── sửa theo review KPI v2 — nhóm 2: Kết quả thật và hiệu chỉnh reviewer ─────────

const run = (department: string, subtasks: Array<{ id: string; assignee: string }>, review?: Record<string, unknown>) => ({
  department,
  usage: { input: 0, output: 0, cacheRead: 0 },
  subtasks: subtasks.map((s) => ({ ...s, attempts: 1, output: 'x' })),
  ...(review ? { review: { summary: '', issues: [], ...review } } : {}),
});

test('KPI v2 (sửa 2): kết quả lệnh kiểm tra chỉ gán cho người thực thi của phòng chạy lệnh đó, và người đã sửa tệp', () => {
  const app = testApp();
  try {
    const t = task('T1', {
      runs: [run('research', [{ id: 'S1', assignee: 'data-scientist' }]), run('dev', [{ id: 'S1', assignee: 'backend-dev' }, { id: 'S2', assignee: 'tech-writer' }])],
      // phòng nghiên cứu chạy trước: kiểm tra vẫn đạt; phòng phát triển làm hỏng
      projectChecks: {
        baseline: [ok('npm test')],
        latest: [bad('npm test')],
        depts: { research: { before: [ok('npm test')], latest: [ok('npm test')] }, dev: { before: [ok('npm test')], latest: [bad('npm test')] } },
      },
    });
    const calls = {
      T1: [
        call({ taskId: 'T1', agentId: 'data-scientist', department: 'research', phase: 'execute', subtaskId: 'S1', text: '## Tóm tắt\nphân tích', tools: [tool('write_file', 'notebooks/a.py')] }),
        call({ taskId: 'T1', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', text: '## Tóm tắt\nsửa API', tools: [tool('edit_file', 'src/api.ts')] }),
        // chỉ đọc tệp, không sửa gì trong workspace (runtime có ghi công cụ) → không chịu hồi quy của người khác
        call({ taskId: 'T1', agentId: 'tech-writer', phase: 'execute', subtaskId: 'S2', text: '## Tóm tắt\nghi chú phát hành', tools: [tool('read_file', 'src/api.ts')] }),
      ],
    };
    const r = computeKpi(source(app, [t], calls));
    const by = (id: string) => r.agents.find((a) => a.agentId === id)!;
    assert.equal(by('backend-dev').outcome?.checksRegressed, 1);
    assert.equal(by('backend-dev').scores.outcome, 0);
    assert.equal(by('data-scientist').outcome?.checksRegressed ?? 0, 0, 'phòng khác không chịu hồi quy');
    assert.equal(by('data-scientist').scores.outcome, 100);
    assert.equal(by('tech-writer').outcome?.tasks ?? 0, 0, 'người không sửa tệp không chịu kết quả lệnh kiểm tra');
    // dữ liệu cũ không có kết quả theo phòng, nhiệm vụ nhiều phòng → không gán được, không đoán
    const old = task('T2', { runs: t.runs, projectChecks: { baseline: [ok('npm test')], latest: [bad('npm test')] } });
    const r2 = computeKpi(source(app, [old], { T2: calls.T1.map((c) => ({ ...c, taskId: 'T2' })) }));
    assert.equal(r2.agents.find((a) => a.agentId === 'data-scientist')!.outcome?.checksRegressed ?? 0, 0);
  } finally {
    app.cleanup();
  }
});

test('KPI v2 (sửa 2): hiệu chỉnh reviewer dùng kết luận GỐC (reviewerApproved), không dùng approved đã bị ép', () => {
  const app = testApp();
  try {
    const calls = { T1: [call({ taskId: 'T1', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', text: '## Tóm tắt\nx', tools: [tool('edit_file', 'a.ts')] }), call({ taskId: 'T1', agentId: 'qa-tester', phase: 'review', text: '{}' })] };
    const tr = { T1: [{ kind: 'review', from: 'qa-tester', department: 'dev', text: '⚠️ Cần sửa' }] };
    const checks = { baseline: [ok('npm test')], latest: [bad('npm test')] };
    const qa = (review: Record<string, unknown>) => computeKpi(source(app, [task('T1', { projectChecks: checks, runs: [run('dev', [{ id: 'S1', assignee: 'backend-dev' }], review)] })], calls, tr)).agents.find((a) => a.agentId === 'qa-tester')!;
    // reviewer duyệt bản hồi quy, CCoding ép không duyệt → vẫn là duyệt sai
    assert.deepEqual(qa({ approved: false, reviewerApproved: true }).calibration, { decisions: 1, falseApprovals: 1, falseRejections: 0 });
    // reviewer tự từ chối → quyết định đúng
    assert.deepEqual(qa({ approved: false, reviewerApproved: false }).calibration, { decisions: 1, falseApprovals: 0, falseRejections: 0 });
    // dữ liệu cũ (chưa có reviewerApproved): nhận ra kết luận bị ép qua ghi chú của CCoding trong summary
    assert.equal(qa({ approved: false, summary: 'Ổn (CCoding: lệnh kiểm tra hỏng sau khi sửa → không duyệt)' }).calibration?.falseApprovals, 1);
  } finally {
    app.cleanup();
  }
});

test('KPI v2 (sửa 2): lệnh vốn lỗi từ trước (so với baseline) không tính reviewer/CTO duyệt sai; không có baseline thì không tính', () => {
  const app = testApp();
  try {
    const calls = { T1: [call({ taskId: 'T1', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', text: '## Tóm tắt\nx', tools: [tool('edit_file', 'a.ts')] }), call({ taskId: 'T1', agentId: 'qa-tester', phase: 'review', text: '{}' }), call({ taskId: 'T1', agentId: 'cto', department: 'coord', phase: 'accept', text: '{}' })] };
    const tr = { T1: [{ kind: 'review', from: 'qa-tester', department: 'dev', text: '✅ Duyệt' }] };
    const acceptance = { at: '', by: 'cto', accepted: true, parsed: true, summary: '', criteria: [{ name: 'a', result: 'pass', evidence: '' }], risks: [], followUps: [], sig: '' };
    const mk = (projectChecks: unknown) => computeKpi(source(app, [task('T1', { projectChecks, acceptance, runs: [run('dev', [{ id: 'S1', assignee: 'backend-dev' }], { approved: true, reviewerApproved: true })] })], calls, tr)).agents;
    for (const pc of [
      { baseline: [ok('npm test'), bad('npm run lint')], latest: [ok('npm test'), bad('npm run lint')] }, // lint hỏng sẵn
      { latest: [ok('npm test'), bad('npm run lint')] }, // không có baseline
    ]) {
      const ag = mk(pc);
      assert.equal(ag.find((a) => a.agentId === 'qa-tester')!.calibration?.falseApprovals ?? 0, 0, JSON.stringify(pc));
      assert.equal(ag.find((a) => a.agentId === 'cto')!.calibration?.falseApprovals ?? 0, 0, JSON.stringify(pc));
    }
    // lint đạt trước, hỏng sau → duyệt sai (cả reviewer lẫn CTO)
    const ag = mk({ baseline: [ok('npm test'), ok('npm run lint')], latest: [ok('npm test'), bad('npm run lint')] });
    assert.equal(ag.find((a) => a.agentId === 'qa-tester')!.calibration?.falseApprovals, 1);
    assert.equal(ag.find((a) => a.agentId === 'cto')!.calibration?.falseApprovals, 1);
  } finally {
    app.cleanup();
  }
});

test('KPI v2 (sửa 2): tiêu chí nghiệm thu "unknown" không thổi phồng điểm', () => {
  const app = testApp();
  try {
    const calls = { T1: [call({ taskId: 'T1', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', text: '## Tóm tắt\nx' })] };
    const acc = (results: string[]) => ({ at: '', by: 'cto', accepted: false, parsed: true, summary: '', criteria: results.map((result, i) => ({ name: `c${i}`, result, evidence: '' })), risks: [], followUps: [], sig: '' });
    const be = (results: string[]) => computeKpi(source(app, [task('T1', { acceptance: acc(results) })], calls)).agents.find((a) => a.agentId === 'backend-dev')!;
    // 1 đạt + 3 không rõ: trước đây 100 — giờ quá nửa không rõ → không đo được
    const mostlyUnknown = be(['pass', 'unknown', 'unknown', 'unknown']);
    assert.equal(mostlyUnknown.scores.outcome, undefined);
    assert.equal(mostlyUnknown.outcome?.acceptUnmeasured, 1);
    // 2 đạt + 1 không rõ: không rõ tính vào mẫu số như chưa đạt → 67
    assert.equal(be(['pass', 'pass', 'unknown']).scores.outcome, 67);
  } finally {
    app.cleanup();
  }
});

test('KPI v2 (sửa 2): nhiệm vụ bị hủy/lỗi không tính Kết quả thật và hiệu chỉnh', () => {
  const app = testApp();
  try {
    const calls = { T1: [call({ taskId: 'T1', agentId: 'backend-dev', phase: 'execute', subtaskId: 'S1', text: '## Tóm tắt\nx', tools: [tool('edit_file', 'a.ts')] })] };
    for (const status of ['cancelled', 'failed']) {
      const be = computeKpi(source(app, [task('T1', { status, projectChecks: { baseline: [ok('npm test')], latest: [bad('npm test')] } })], calls)).agents.find((a) => a.agentId === 'backend-dev')!;
      assert.equal(be.scores.outcome, undefined, status);
      assert.ok(!be.findingKeys.includes('regression'), status);
    }
  } finally {
    app.cleanup();
  }
});
