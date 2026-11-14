import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { templateHeadings } from '../src/kpi.js';
import { parseAcceptance } from '../src/planner.js';
import { ACCEPT_BRIEF_MAX_TOKENS } from '../src/orchestrator.js';
import type { Classification, TaskOptions } from '../src/types.js';
import { testApp } from './helpers.js';

// B-11(a): nghiệm thu CTO ở làn đơn full/brief/skip. LLM là mock; lệnh kiểm của dự án là lệnh node THẬT.

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

function setup(cmd: string, classification: Classification = 'internal') {
  const a = testApp();
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'), 'ccoding-accslim-'));
  const repo = repoIn(dir);
  a.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: repo, classification, toolAccess: 'exec', checkCommands: [cmd], createdAt: new Date().toISOString() });
  return Object.assign(a, { cleanupAll: () => { a.cleanup(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } });
}
type Ctx = ReturnType<typeof setup>;

interface AcceptCapture {
  prompt: string;
  context: string;
  maxTokens?: number;
}

const BRIEF_REPLY = `| Tiêu chí | Kết quả | Bằng chứng |\n|---|---|---|\n| Hàm cộng có mặt | pass | src/a.js |\n| Lệnh kiểm xanh | fail | exit 1 |\n\n\`\`\`json\n${JSON.stringify({ accepted: false, summary: 'Còn 1 tiêu chí chưa đạt', criteria: [{ name: 'Hàm cộng có mặt', result: 'pass', evidence: 'src/a.js' }, { name: 'Lệnh kiểm xanh', result: 'fail', evidence: 'exit 1' }], risks: [], followUps: [] })}\n\`\`\``;

/**
 * Bàn giao đúng mẫu ở execute (cổng mẫu xanh); tùy chọn ghi thêm tệp vào workspace; ghi lại prompt/maxTokens của lượt accept.
 * `reply` có thì thay đầu ra mock của lượt accept (mô phỏng CTO trả dạng brief).
 */
function instrument(a: Ctx, o: { touch?: string; reply?: string } = {}): AcceptCapture[] {
  const seen: AcceptCapture[] = [];
  const orch = a.orchestrator as unknown as { call: (...x: unknown[]) => Promise<{ text: string }> };
  const orig = orch.call.bind(orch);
  orch.call = async (agent, phase, build, ctx) => {
    if (phase === 'execute' && o.touch) {
      const f = path.join((ctx as { cwd: string }).cwd, o.touch);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, 'export {};\n');
    }
    const r = await orig(agent, phase, build, ctx);
    if (phase === 'execute') r.text = templateHeadings((agent as { body: string }).body).map((h) => `## ${h}\nNội dung thật cho mục này.`).join('\n');
    if (phase === 'accept') {
      const b = (build as (t: string[]) => { prompt: string; context?: string })([]);
      seen.push({ prompt: b.prompt, context: b.context ?? '', maxTokens: (ctx as { maxTokens?: number }).maxTokens });
      if (o.reply) r.text = o.reply;
    }
    return r;
  };
  return seen;
}

async function run(a: Ctx, options: TaskOptions, brief = 'Thêm hàm cộng vào src/a.js') {
  const t = a.orchestrator.submit({ brief, projectId: 'repo', options: { lane: 'single', ...options } });
  const done = await a.orchestrator.waitFor(t.id);
  assert.equal(done.status, 'done', done.error);
  return done;
}
const phasesOf = (a: Ctx, id: string) => a.usage.all({ task: id }).map((c) => c.phase);
const kinds = (a: Ctx, id: string) => a.logs.query({ task: id }).map((e) => e.kind);

test('B-11(a) mặc định: làn đơn nghiệm thu full — prompt như bản cũ, mode full, không có sự kiện accept.brief/skipped', async () => {
  const a = setup(GREEN);
  const seen = instrument(a);
  try {
    const t = await run(a, {});
    assert.equal(t.acceptance?.mode, 'full');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].maxTokens, undefined, 'full không đặt trần riêng');
    assert.match(seen[0].prompt, /## Báo cáo tổng hợp của các phòng/);
    assert.match(seen[0].prompt, /Rút 3–8 tiêu chí/);
    assert.equal(kinds(a, t.id).some((k) => k === 'accept.brief' || k === 'accept.skipped'), false);
    assert.ok(kinds(a, t.id).includes('accept.done'));
  } finally {
    a.cleanupAll();
  }
});

test('B-11(a) brief: truyền maxTokens, prompt dạng bảng tiêu chí không có báo cáo phòng, đầu ra brief parse đúng', async () => {
  const a = setup(GREEN);
  const seen = instrument(a, { reply: BRIEF_REPLY });
  try {
    const t = await run(a, { slim: { accept: 'brief' } });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].maxTokens, ACCEPT_BRIEF_MAX_TOKENS);
    assert.ok(ACCEPT_BRIEF_MAX_TOKENS >= 900 && ACCEPT_BRIEF_MAX_TOKENS <= 1000);
    assert.match(seen[0].prompt, /\| Tiêu chí \| Kết quả \| Bằng chứng \|/);
    assert.match(seen[0].prompt, /≤ 600 token/);
    assert.doesNotMatch(seen[0].prompt, /## Báo cáo tổng hợp của các phòng/);
    assert.match(seen[0].prompt, /Lệnh kiểm tra của dự án/);
    assert.match(seen[0].context, /Thêm hàm cộng vào src\/a\.js/);
    assert.equal(t.acceptance?.mode, 'brief');
    assert.equal(t.acceptance?.parsed, true);
    assert.equal(t.acceptance?.accepted, false);
    assert.deepEqual(t.acceptance?.criteria.map((c) => c.result), ['pass', 'fail']);
    const ev = a.logs.query({ task: t.id }).find((e) => e.kind === 'accept.brief');
    assert.deepEqual(ev?.data, { reason: 'configured' });
    assert.equal(t.attention?.reason, 'acceptance', 'brief chưa đạt → cần xem như full');
    // định dạng brief vẫn đọc được bằng parseAcceptance
    assert.equal(parseAcceptance(BRIEF_REPLY).criteria.length, 2);
  } finally {
    a.cleanupAll();
  }
});

test('B-11(a) skip đủ ba điều kiện: không gọi CTO, ghi accept.skipped, nghiệm thu theo cổng', async () => {
  const a = setup(GREEN);
  const seen = instrument(a);
  try {
    const t = await run(a, { slim: { accept: 'skip' } });
    assert.equal(seen.length, 0);
    assert.equal(phasesOf(a, t.id).includes('accept'), false, 'không có lượt gọi CTO');
    assert.equal(t.acceptance?.mode, 'skip');
    assert.equal(t.acceptance?.parsed, true);
    assert.equal(t.acceptance?.accepted, true);
    assert.deepEqual(t.acceptance?.criteria.map((c) => c.result), ['pass']);
    assert.match(t.acceptance?.summary ?? '', /Bỏ qua nghiệm thu CTO/);
    const ev = a.logs.query({ task: t.id }).find((e) => e.kind === 'accept.skipped');
    assert.deepEqual(ev?.data, { gateGreen: true, sensitiveHit: false, classification: 'internal', checks: [{ cmd: GREEN, ok: true }] });
    assert.equal(kinds(a, t.id).includes('accept.brief'), false);
    assert.equal(t.attention, undefined);
  } finally {
    a.cleanupAll();
  }
});

// mỗi test hỏng đúng MỘT điều kiện của skip → lùi về brief kèm accept.brief
async function fallsBack(a: Ctx, opts: { touch?: string; brief?: string }, reason: RegExp) {
  const seen = instrument(a, { touch: opts.touch, reply: BRIEF_REPLY });
  const t = await run(a, { slim: { accept: 'skip' } }, opts.brief);
  assert.equal(seen.length, 1, 'vẫn gọi CTO (bản brief)');
  assert.equal(seen[0].maxTokens, ACCEPT_BRIEF_MAX_TOKENS);
  assert.equal(t.acceptance?.mode, 'brief');
  assert.equal(kinds(a, t.id).includes('accept.skipped'), false);
  const ev = a.logs.query({ task: t.id }).find((e) => e.kind === 'accept.brief');
  assert.match(String((ev?.data as { reason?: string })?.reason), reason);
  return t;
}

test('B-11(a) skip: diff đụng src/tools/ → lùi về brief', async () => {
  const a = setup(GREEN);
  try {
    await fallsBack(a, { touch: 'src/tools/x.ts' }, /^fallback:.*diff chạm vùng bảo mật\/dữ liệu/);
  } finally {
    a.cleanupAll();
  }
});

test('B-11(a) skip: lệnh kiểm tra đỏ → lùi về brief', async () => {
  const a = setup(RED);
  try {
    // đề không nhắc lệnh đỏ nên làn đơn không nâng làn; vẫn ở làn đơn với cổng đỏ
    const t = await run(a, { slim: { accept: 'skip' }, maxRevisions: 0 }, 'Thêm hàm cộng vào src/a.js');
    assert.equal(t.lane, 'single', 'đề không đòi lệnh đỏ nên không nâng làn');
    assert.equal(t.acceptance?.mode, 'brief');
    const ev = a.logs.query({ task: t.id }).find((e) => e.kind === 'accept.brief');
    assert.match(String((ev?.data as { reason?: string })?.reason), /^fallback:.*cổng lệnh kiểm tra chưa xanh/);
    assert.equal(kinds(a, t.id).includes('accept.skipped'), false);
  } finally {
    a.cleanupAll();
  }
});

test('B-11(a) skip: nhãn dữ liệu confidential → lùi về brief', async () => {
  const a = setup(GREEN, 'confidential');
  try {
    await fallsBack(a, {}, /^fallback:.*nhãn dữ liệu confidential/);
  } finally {
    a.cleanupAll();
  }
});

test('B-11(a) làn fast/full luôn nghiệm thu full dù cấu hình skip/brief', async () => {
  for (const lane of ['fast', 'full'] as const) {
    const a = setup(GREEN);
    const seen = instrument(a);
    try {
      const t = a.orchestrator.submit({ brief: 'Thêm hàm cộng vào src/a.js', projectId: 'repo', options: { lane, slim: { accept: 'skip' } } });
      const done = await a.orchestrator.waitFor(t.id);
      assert.equal(done.status, 'done', done.error);
      assert.equal(done.lane, lane);
      assert.equal(done.acceptance?.mode, 'full', lane);
      assert.equal(seen.length, 1, lane);
      assert.match(seen[0].prompt, /## Báo cáo tổng hợp của các phòng/);
      assert.equal(kinds(a, done.id).some((k) => k === 'accept.brief' || k === 'accept.skipped'), false);
    } finally {
      a.cleanupAll();
    }
  }
});
