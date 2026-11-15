import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { testApp } from './helpers.js';

// K2 (D16b): review chạm trần lượt mà chưa có JSON kết luận → lượt tiếp nối → chạy lại với trần cao hơn → attention.
// LLM là mock; mỗi lượt review được ghi đè văn bản/`capped` theo kịch bản. Không gọi `claude -p` thật.

const GREEN = 'node -e "process.exit(0)"';
const OPENING = 'Tôi sẽ thử các lệnh theo đề bài.';
const VERDICT = '```json\n{ "approved": true, "summary": "Đã kiểm 12 lệnh, đạt.", "issues": [] }\n```';

interface Step { text: string; capped?: 'turns' | 'input' }
interface Seen { noTools?: boolean; maxTurns?: number }

function setup() {
  const a = testApp();
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'), 'ccoding-k2-'));
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"x","private":true}\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  a.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: repo, classification: 'internal', toolAccess: 'exec', checkCommands: [GREEN], createdAt: new Date().toISOString() });
  return Object.assign(a, { cleanupAll: () => { a.cleanup(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } });
}

/** Ghi đè kết quả các lượt review theo kịch bản; trả về các ctx đã thấy. Hết kịch bản thì giữ kết quả mock. */
function scriptReviews(a: ReturnType<typeof setup>, steps: Step[]): Seen[] {
  const orch = a.orchestrator as unknown as { call: (...x: unknown[]) => Promise<{ text: string; capped?: string }> };
  const orig = orch.call.bind(orch);
  const seen: Seen[] = [];
  let i = 0;
  orch.call = async (agent, phase, build, ctx) => {
    const r = await orig(agent, phase, build, ctx);
    if (phase === 'review') {
      const c = ctx as Seen;
      seen.push({ noTools: c.noTools, maxTurns: c.maxTurns });
      const s = steps[i++];
      if (s) { r.text = s.text; r.capped = s.capped; }
    }
    return r;
  };
  return seen;
}

const submit = (a: ReturnType<typeof setup>) => a.orchestrator.submit({ brief: 'Thêm hàm cộng vào src/a.js', projectId: 'repo', options: { lane: 'full', discussionRounds: 0, maxRevisions: 0 } });
const reviewCalls = (a: ReturnType<typeof setup>, id: string) => a.usage.all({ task: id }).filter((c) => c.phase === 'review').length;

test('K2 ca 1: chạm trần, không có JSON → lượt tiếp nối không công cụ trả JSON → dùng kết luận đó', async () => {
  const a = setup();
  const seen = scriptReviews(a, [{ text: OPENING, capped: 'turns' }, { text: VERDICT }]);
  try {
    const t = submit(a);
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(seen.length, 2, 'một lượt review + một lượt tiếp nối');
    assert.equal(seen[1].noTools, true, 'lượt tiếp nối có trần công cụ = 0');
    assert.equal(done.runs[0].review?.approved, true);
    assert.match(done.runs[0].review!.summary, /Đã kiểm 12 lệnh/);
    assert.ok(a.logs.query({ task: t.id }).some((e) => e.kind === 'review.verdict' && (e.data as { step: string }).step === 'followup'));
    assert.doesNotMatch(done.attention?.detail ?? '', /Review chưa có kết luận/);
  } finally {
    a.cleanupAll();
  }
});

test('K2 ca 2: lượt tiếp nối vẫn không JSON → chạy lại đúng một lần với trần lượt gấp đôi → dùng JSON', async () => {
  const a = setup();
  const seen = scriptReviews(a, [{ text: OPENING, capped: 'turns' }, { text: 'Vẫn chưa có kết luận.' }, { text: VERDICT }]);
  try {
    const t = submit(a);
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(seen.length, 3, 'review + tiếp nối + chạy lại');
    const base = a.config.phases.toolTurns.review ?? 8;
    assert.equal(seen[0].maxTurns, undefined, 'lượt đầu dùng trần của phase');
    assert.equal(seen[2].maxTurns, base * 2, 'chạy lại với trần gấp đôi');
    assert.notEqual(seen[2].noTools, true, 'chạy lại có công cụ');
    assert.equal(done.runs[0].review?.approved, true);
    assert.doesNotMatch(done.attention?.detail ?? '', /Review chưa có kết luận/);
  } finally {
    a.cleanupAll();
  }
});

test('K2 ca 3: cả hai thất bại → attention "review chưa có kết luận", không approved, không chạy lại lần nữa', async () => {
  const a = setup();
  const seen = scriptReviews(a, [{ text: OPENING, capped: 'turns' }, { text: 'Không có JSON.' }, { text: 'Lại không có JSON.', capped: 'turns' }]);
  try {
    const t = submit(a);
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(seen.length, 3, 'không quá một lượt tiếp nối và một lần chạy lại');
    assert.equal(done.runs[0].review?.approved, false);
    assert.equal(done.attention?.reason, 'review');
    assert.match(done.attention?.detail ?? '', /Review chưa có kết luận/);
    assert.ok(a.logs.query({ task: t.id }).some((e) => e.kind === 'review.verdict' && e.level === 'warn' && (e.data as { step: string }).step === 'none'));
    assert.ok(a.store.transcript(t.id).some((m) => m.kind === 'system' && m.text.includes('Review chưa có kết luận')));
  } finally {
    a.cleanupAll();
  }
});

test('K2 ca 4: review bình thường (có JSON) → không phát sinh lượt gọi thêm; không JSON nhưng không chạm trần → không tiếp nối', async () => {
  const a = setup();
  const seen = scriptReviews(a, [{ text: VERDICT }]);
  try {
    const t = submit(a);
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(seen.length, 1);
    assert.equal(reviewCalls(a, t.id), 1);
    assert.equal(done.runs[0].review?.approved, true);
    assert.equal(a.logs.query({ task: t.id }).some((e) => e.kind === 'review.verdict'), false);
  } finally {
    a.cleanupAll();
  }
  const b = setup();
  const seenB = scriptReviews(b, [{ text: 'Không có JSON, không chạm trần.' }]);
  try {
    const t = submit(b);
    const done = await b.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(seenB.length, 1, 'không chạm trần → hành vi cũ, không tiếp nối');
    assert.equal(done.runs[0].review?.approved, false);
  } finally {
    b.cleanupAll();
  }
});
