import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBench, parseSpec, reportMarkdown, runBench, runInput, runMetrics, schedule, summarize, weighted, type BenchClient, type BenchState } from '../src/bench.js';
import type { CallRow } from '../src/kpi.js';
import { variantOptions } from '../src/orchestrator.js';
import { selectHistory } from '../src/history.js';
import { buildRepoMap } from '../src/repomap.js';
import { ClaudeCliRuntime } from '../src/runtimes/claude-cli.js';
import type { AgentDef, Task } from '../src/types.js';
import { readJsonl } from '../src/util/fsx.js';
import { testApp } from './helpers.js';

const baseSpec = {
  name: 'nd57',
  projectId: 'bench',
  brief: 'Thêm API thống kê. Viết test.',
  options: { discussionRounds: 0, maxParallel: 3, bogus: 1 },
  variants: [
    { id: 'V0', label: 'Hiện tại', options: {} },
    { id: 'V1', options: { bashMaxOutput: 12000 } },
    { id: 'V2', options: { bashMaxOutput: 12000, repoMapMode: 'compact', phaseModels: { synthesize: 'sonnet' } } },
  ],
};

test('bench spec: kiểm tra, xếp lượt xen kẽ (xoay mỗi lần lặp), ghép tùy chọn chung + biến thể + nhãn', () => {
  const spec = parseSpec(baseSpec);
  assert.equal(spec.repeats, 2);
  assert.deepEqual(spec.options, { discussionRounds: 0, maxParallel: 3 }, 'bỏ khóa lạ');
  assert.deepEqual(
    schedule(spec).map((r) => r.key),
    ['V0#1', 'V1#1', 'V2#1', 'V1#2', 'V2#2', 'V0#2'],
  );
  const inp = runInput(spec, schedule(spec)[2]);
  assert.equal(inp.projectId, 'bench');
  assert.equal(inp.mode, 'project');
  assert.match(inp.title!, /^\[bench nd57 V2#1\]/);
  assert.deepEqual(inp.options, { budgetMode: 'complete', discussionRounds: 0, maxParallel: 3, bashMaxOutput: 12000, repoMapMode: 'compact', phaseModels: { synthesize: 'sonnet' }, variant: 'nd57/V2#1' });
  assert.throws(() => parseSpec({ ...baseSpec, variants: [baseSpec.variants[0]] }), /ít nhất 2 biến thể/);
  assert.throws(() => parseSpec({ ...baseSpec, variants: [baseSpec.variants[0], baseSpec.variants[0]] }), /trùng id/);
  assert.throws(() => parseSpec({ ...baseSpec, name: 'có dấu cách' }), /name/);
  // tùy chọn biến thể khi giao việc: chỉ nhận đúng kiểu, kẹp trong khoảng an toàn
  assert.deepEqual(variantOptions({ bashMaxOutput: 50, repoMapMode: 'x' as never, phaseModels: { synthesize: 'sonnet', bogus: 'opus', plan: 'rm -rf /' } as never, variant: '  b/V1#1 ' }), { bashMaxOutput: 2000, phaseModels: { synthesize: 'sonnet' }, variant: 'b/V1#1' });
});

const call = (o: Partial<CallRow>): CallRow => ({ ts: '', callId: 'c', taskId: 't', department: 'dev', agentId: 'a', phase: 'execute', runtime: 'claude-cli', model: 'm', input: 0, output: 0, cacheRead: 0, durationMs: 0, ...o });

function fakeTask(over: Partial<Task> = {}): Task {
  return {
    id: 'T1',
    status: 'done',
    createdAt: '2026-11-01T00:00:00Z',
    startedAt: '2026-11-01T00:00:00Z',
    finishedAt: '2026-11-01T00:05:00Z',
    updatedAt: '2026-11-01T00:05:00Z',
    runs: [{ department: 'dev', status: 'done', subtasks: [{ id: 'S1', status: 'done' }, { id: 'S2', status: 'failed' }], review: { approved: true, summary: '', issues: [] }, reviewRound: 1, usage: {} }],
    projectChecks: { latest: [{ command: 'npm test', ok: true }, { command: 'npm run lint', ok: false }] },
    options: {},
    ...over,
  } as unknown as Task;
}

test('bench số đo: token quy đổi theo giá, theo pha, phân loại công cụ, ký tự gửi lại, chất lượng', () => {
  assert.equal(weighted({ input: 100, output: 10, cacheRead: 1000, cacheWrite: 80 }), 100 + 100 + 100 + 50);
  const calls = [
    call({ phase: 'plan', input: 10, output: 100, cacheWrite: 1000, durationMs: 4000, costUsd: 0.5 } as never),
    call({
      phase: 'execute',
      input: 5,
      output: 200,
      cacheRead: 10_000,
      durationMs: 60_000,
      turns: 4,
      tools: [
        { name: 'read_file', args: 'src/a.ts', ok: true, ms: 1, outputChars: 1000 },
        { name: 'run_command', args: 'cat src/b.ts', ok: true, ms: 1, outputChars: 500 },
        { name: 'edit_file', args: 'src/a.ts', ok: false, ms: 1, outputChars: 10 },
        { name: 'run_command', args: 'npm test', ok: true, ms: 1, outputChars: 300 },
      ],
    }),
  ];
  const m = runMetrics(fakeTask(), calls, [{ command: 'node accept.js', code: 0, ms: 5, tail: '' }]);
  assert.equal(m.wallSec, 300);
  assert.equal(m.calls, 2);
  assert.equal(m.tokens.weighted, weighted({ input: 15, output: 300, cacheRead: 10_000, cacheWrite: 1000 }));
  assert.equal(m.byPhase.plan.weighted, 10 + 500 + 1250);
  assert.equal(m.byPhase.execute.sec, 60);
  assert.deepEqual({ ...m.tools }, { total: 4, read: 2, write: 1, shell: 1, other: 0, failed: 1, resultChars: 1810, resentChars: 1000 * 3 + 500 * 2 + 10 });
  assert.equal(m.costUsd, 0.5);
  assert.deepEqual(m.quality, { subtasks: 2, subtasksDone: 1, approved: true, reviewRounds: 1, attention: undefined, checksOk: 1, checksTotal: 2, acceptOk: 1, acceptTotal: 1 });
});

function stateWith(rows: Array<{ v: string; w: number; wall: number; approved?: boolean; overlap?: string[] }>): BenchState {
  const spec = parseSpec(baseSpec);
  return {
    version: 1,
    id: 'x',
    spec,
    specHash: '',
    createdAt: '',
    updatedAt: '',
    status: 'done',
    runs: rows.map((r, i) => ({
      key: `${r.v}#${i}`,
      variant: r.v,
      repeat: 1,
      status: 'done',
      overlap: r.overlap ?? [],
      metrics: {
        status: 'done',
        wallSec: r.wall,
        calls: 10,
        failedCalls: 0,
        tokens: { input: 0, output: r.w / 10, cacheRead: 0, cacheWrite: 0, total: 0, weighted: r.w },
        costUsd: r.w / 1e6,
        byPhase: { execute: { calls: 5, sec: r.wall, weighted: r.w, output: 0 } },
        tools: { total: 20, read: 10, write: 5, shell: 5, other: 0, failed: 0, resultChars: 0, resentChars: 0 },
        turns: 0,
        quality: { subtasks: 3, subtasksDone: 3, approved: r.approved ?? true, reviewRounds: 0, checksOk: 2, checksTotal: 2 },
        models: ['m'],
      },
    })),
  };
}

test('bench báo cáo: Δ so với gốc, thời gian bỏ lượt chạy chồng, kết luận chỉ "đổi mặc định" khi tốt hơn rõ và chất lượng không kém', () => {
  const st = stateWith([
    { v: 'V0', w: 1_000_000, wall: 300 },
    { v: 'V0', w: 1_100_000, wall: 320 },
    { v: 'V1', w: 1_050_000, wall: 290 },
    { v: 'V1', w: 990_000, wall: 900, overlap: ['T-real'] },
    { v: 'V2', w: 700_000, wall: 250 },
    { v: 'V2', w: 750_000, wall: 260, approved: false },
  ]);
  const s = summarize(st);
  assert.equal(s[0].mean.weighted, 1_050_000);
  assert.equal(s[1].clean, 1, 'lượt chạy chồng không tính thời gian');
  assert.equal(s[1].mean.wallSec, 290);
  assert.equal(s[1].delta?.weighted, -2.9);
  assert.match(s[1].verdict!, /biên dao động/);
  assert.match(s[2].verdict!, /Chất lượng kém hơn/, 'một lượt không được duyệt → không đổi mặc định dù rẻ hơn');
  const ok = summarize(stateWith([{ v: 'V0', w: 1_000_000, wall: 300 }, { v: 'V0', w: 1_100_000, wall: 320 }, { v: 'V2', w: 700_000, wall: 250 }, { v: 'V2', w: 750_000, wall: 260 }]));
  assert.match(ok[2].verdict!, /Tốt hơn rõ .*có thể đổi mặc định/);
  const md = reportMarkdown(st);
  assert.match(md, /## Tổng hợp/);
  assert.match(md, /\| V2 \| 2\/2 \|/);
  assert.match(md, /chạy chồng T-real/);
});

test('bench chạy thật (runtime mock): chờ máy rảnh, giao từng lượt, nghiệm thu, báo cáo; lượt bench không nhận/không góp lịch sử dự án', async () => {
  const app = testApp();
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-bench-ws-'));
  const benchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-bench-'));
  try {
    fs.mkdirSync(path.join(ws, 'src'));
    fs.writeFileSync(path.join(ws, 'src', 'a.ts'), 'export function tinhTong(a: number, b: number) {\n  return a + b;\n}\n');
    app.store.saveProject({ id: 'bench', name: 'Bench', department: 'dev', workspace: ws, classification: 'internal', toolAccess: 'read', createdAt: new Date().toISOString() } as never);
    // nhiệm vụ thật trước đó của dự án
    const real = app.orchestrator.submit({ brief: 'Rà soát mã', projectId: 'bench', options: { discussionRounds: 0, maxRevisions: 0 } });
    assert.equal((await app.orchestrator.waitFor(real.id)).status, 'done');
    const spec = parseSpec({
      name: 'mock',
      projectId: 'bench',
      brief: 'Viết hướng dẫn dùng hàm tinhTong',
      options: { discussionRounds: 0, maxRevisions: 0 },
      variants: [
        { id: 'V0', options: {} },
        { id: 'V1', options: { repoMapMode: 'compact', bashMaxOutput: 12000, phaseModels: { synthesize: 'haiku' } } },
      ],
      repeats: 1,
      accept: ['node -e "process.exit(0)"'],
      idle: { quietSec: 0, pollSec: 1 },
    });
    const { dir } = createBench(benchDir, spec);
    let lists = 0;
    const busy = { id: 'T-that', status: 'running' } as Task;
    const client: BenchClient = {
      // 2 lần đầu: có một nhiệm vụ thật đang chạy → phải chờ
      list: async () => [...app.store.list(), ...(lists++ < 2 ? [busy] : [])],
      get: async (id) => app.store.get(id),
      submit: async (input) => app.orchestrator.submit(input),
      cancel: async (id) => void app.orchestrator.cancel(id),
      calls: (id) => readJsonl<CallRow>(app.store.callsFile(id)),
    };
    const logs: string[] = [];
    const st = await runBench(dir, client, { sleep: () => new Promise((r) => setTimeout(r, 5)), now: Date.now, log: (m) => logs.push(m) });
    assert.equal(st.status, 'done', logs.join('\n'));
    assert.match(logs[0], /chờ nhiệm vụ đang chạy xong \(T-that\)/);
    assert.deepEqual(st.runs.map((r) => r.status), ['done', 'done']);
    const [t0, t1] = st.runs.map((r) => app.store.get(r.taskId!)!);
    assert.equal(t1.options.variant, 'mock/V1#1');
    assert.equal(t1.options.repoMapMode, 'compact');
    assert.equal(t1.options.bashMaxOutput, 12000);
    assert.equal(st.runs[1].metrics?.quality.acceptOk, 1);
    assert.ok(st.runs[0].metrics!.calls > 0);
    // bản đồ gọn + chỉ mục chỉ ở biến thể compact
    assert.ok(!fs.existsSync(path.join(ws, '.ccoding', t0.id, 'repo-index.md')));
    assert.match(fs.readFileSync(path.join(ws, '.ccoding', t1.id, 'repo-index.md'), 'utf8'), /src\/a\.ts:1 {2}def {2}tinhTong/);
    assert.match(fs.readFileSync(path.join(ws, '.ccoding', t1.id, 'repo-map.md'), 'utf8'), /repo-index\.md/);
    // model theo pha của riêng nhiệm vụ
    const synth = (id: string) => readJsonl<CallRow & { requestedModel?: string }>(app.store.callsFile(id)).find((c) => c.phase === 'synthesize')?.requestedModel;
    assert.ok(synth(t0.id) && synth(t1.id) && synth(t0.id) !== synth(t1.id), `${synth(t0.id)} / ${synth(t1.id)}`);
    // lịch sử dự án: lượt bench không thấy nhiệm vụ trước; nhiệm vụ thật sau đó không thấy lượt bench
    assert.ok(!fs.existsSync(path.join(ws, '.ccoding', t0.id, 'inputs', 'PROJECT-HISTORY.md')), 'lượt bench không nhận lịch sử dự án');
    const later = app.orchestrator.submit({ brief: 'Việc tiếp', projectId: 'bench', options: { discussionRounds: 0, maxRevisions: 0 } });
    assert.deepEqual(selectHistory(app.store.list(), app.store.get(later.id)!, 5).map((t) => t.id), [real.id]);
    await app.orchestrator.waitFor(later.id);
    const hist = fs.readFileSync(path.join(ws, '.ccoding', later.id, 'inputs', 'PROJECT-HISTORY.md'), 'utf8');
    assert.match(hist, new RegExp(real.id));
    assert.doesNotMatch(hist, /\[bench /);
    assert.match(fs.readFileSync(path.join(dir, 'report.md'), 'utf8'), /\| V1 \| 1\/1 \|/);
  } finally {
    app.cleanup();
    fs.rmSync(ws, { recursive: true, force: true });
    fs.rmSync(benchDir, { recursive: true, force: true });
  }
});

test('bản đồ repo gọn: ≤ 6k ký tự, thư mục theo số dòng, tệp lớn; chỉ mục một ký hiệu một dòng (route/schema trước)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-map-c-'));
  try {
    fs.mkdirSync(path.join(root, 'app/server/src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'app/server/prisma'), { recursive: true });
    const server = ["const express = require('express');", 'const app = express();', ...Array.from({ length: 900 }, (_, i) => `// dòng ${i}`), "app.get('/api/tasks', auth, async (req, res) => {", '});', 'async function ensureCurrentMonth() {}'].join('\n');
    fs.writeFileSync(path.join(root, 'app/server/src/server.js'), server);
    fs.writeFileSync(path.join(root, 'app/server/prisma/schema.prisma'), 'model Task {\n  id Int @id\n}\n');
    for (let i = 0; i < 60; i++) fs.writeFileSync(path.join(root, 'app/server/src', `m${i}.ts`), Array.from({ length: 30 }, (_, k) => `export function f${i}_${k}() {}`).join('\n'));
    const full = buildRepoMap(root, { now: new Date('2026-11-01T00:00:00Z') });
    const map = buildRepoMap(root, { mode: 'compact', indexRel: '.ccoding/T/repo-index.md', now: new Date('2026-11-01T00:00:00Z') });
    assert.equal(full.index, '', 'mặc định (full) không tạo chỉ mục');
    assert.ok(map.text.length <= 6_000 && map.text.length < full.text.length / 2, `${map.text.length} / ${full.text.length}`);
    assert.match(map.text, /search từ khóa trong `\.ccoding\/T\/repo-index\.md`/);
    assert.match(map.text, /- app\/server\/src — 61 tệp/);
    assert.match(map.text, /## Tệp nguồn lớn \(≥ 800 dòng — đọc theo đoạn\)\n- app\/server\/src\/server\.js — 905 dòng/);
    assert.doesNotMatch(map.text, /f12_3/, 'bản gọn không liệt kê từng hàm');
    const rows = map.index.split('\n');
    assert.match(rows[1], /^app\/server\/src\/server\.js:903 {2}route {2}GET \/api\/tasks$/);
    assert.ok(rows.some((r) => r === 'app/server/prisma/schema.prisma:1  schema  model Task'));
    assert.ok(rows.some((r) => r === 'app/server/src/m12.ts:4  def  f12_3'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('claude-cli: bashMaxOutput của nhiệm vụ → BASH_MAX_OUTPUT_LENGTH; không đặt thì giữ mặc định của CLI', { skip: process.platform === 'win32' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-fake-claude-'));
  try {
    const bin = path.join(dir, 'fake-claude');
    fs.writeFileSync(
      bin,
      `#!/usr/bin/env node\nlet i='';process.stdin.on('data',(d)=>i+=d);process.stdin.on('end',()=>{require('fs').appendFileSync(require('path').join(process.cwd(),'env.jsonl'),JSON.stringify({bash:process.env.BASH_MAX_OUTPUT_LENGTH??null})+'\\n');console.log(JSON.stringify({type:'result',subtype:'success',result:'ok',usage:{input_tokens:1,output_tokens:1}}));});\n`,
    );
    fs.chmodSync(bin, 0o755);
    const rt = new ClaudeCliRuntime({ command: bin } as never, {});
    const req = (bashMaxOutput?: number) => ({
      agent: { id: 'backend-dev' } as AgentDef,
      phase: 'execute' as const,
      system: 's',
      prompt: 'p',
      model: 'sonnet',
      cwd: dir,
      tools: ['Read', 'Bash'],
      allowTools: true,
      timeoutMs: 20_000,
      toolPolicy: { root: dir, allow: [], maxTurns: 5, commandTimeoutSec: 30, maxOutputChars: 1000, denyCommands: [], allowGitCommit: false, bashMaxOutput },
      meta: { taskId: 't', department: 'dev', callId: 'c' },
    });
    assert.equal((await rt.run(req(12000), {})).text, 'ok');
    await rt.run(req(undefined), {});
    assert.deepEqual(readJsonl<{ bash: string | null }>(path.join(dir, 'env.jsonl')), [{ bash: '12000' }, { bash: null }]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
