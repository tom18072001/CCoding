import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { templateHeadings } from '../src/kpi.js';
import { acceptanceTextVerdict, parseAcceptance } from '../src/planner.js';
import { testApp } from './helpers.js';

// D27/K1: văn bản nghiệm thu nói ngược khối JSON ⇒ textMismatch + dòng [Hệ thống]; engine vẫn theo JSON. Runtime giả.

type Crit = { name: string; result: 'pass' | 'fail'; evidence: string; scope?: 'in' | 'decision' };
const PASS: Crit[] = [{ name: 'Tiêu chí A', result: 'pass', evidence: 'ok' }];
const IN2: Crit[] = [
  { name: 'Tiêu chí A', result: 'fail', evidence: 'thiếu', scope: 'in' },
  { name: 'Tiêu chí B', result: 'fail', evidence: 'thiếu', scope: 'in' },
];
const OK2: Crit[] = [{ name: 'Tiêu chí A', result: 'pass', evidence: 'ok' }, { name: 'Tiêu chí B', result: 'pass', evidence: 'ok' }];
const reply = (first: string, accepted: boolean, criteria: Crit[]): string =>
  `## Tóm tắt\n${first}\n\n| Tiêu chí | Kết quả |\n|---|---|\n${criteria.map((c) => `| ${c.name} | ${c.result} |`).join('\n')}\n\n\`\`\`json\n${JSON.stringify({ accepted, summary: 'tóm tắt', criteria, risks: [], followUps: [] })}\n\`\`\``;

test('D27 ca 1: "Nghiệm thu." + JSON false ⇒ lệch', () => {
  const r = parseAcceptance(reply('Nghiệm thu.', false, IN2));
  assert.equal(r.accepted, false);
  assert.equal(r.textMismatch, true);
});

test('D27 ca 2: "Chưa nghiệm thu." + JSON true ⇒ lệch', () => {
  const r = parseAcceptance(reply('Chưa nghiệm thu.', true, PASS));
  assert.equal(r.accepted, true);
  assert.equal(r.textMismatch, true);
});

test('D27 ca 3: "Nghiệm thu có điều kiện" + JSON false ⇒ không lệch', () => {
  assert.equal(parseAcceptance(reply('Nghiệm thu có điều kiện, còn hai tiêu chí.', false, IN2)).textMismatch, undefined);
  assert.equal(acceptanceTextVerdict('## Tóm tắt\nNghiệm thu có điều kiện.'), 'not_accepted');
});

test('D27 ca 4: văn bản không rõ ⇒ không lệch', () => {
  assert.equal(parseAcceptance(reply('Kết quả như bảng dưới.', false, IN2)).textMismatch, undefined);
  assert.equal(parseAcceptance(reply('Kết quả như bảng dưới.', true, PASS)).textMismatch, undefined);
  assert.equal(acceptanceTextVerdict(''), undefined);
});

test('D27 ca 5: khớp JSON ⇒ không lệch (cả hai chiều)', () => {
  assert.equal(parseAcceptance(reply('Đã nghiệm thu.', true, PASS)).textMismatch, undefined);
  assert.equal(parseAcceptance(reply('Chưa nghiệm thu.', false, IN2)).textMismatch, undefined);
  assert.equal(parseAcceptance(reply('Chưa đạt.', false, IN2)).textMismatch, undefined);
});

test('D27 nhận diện: không có mục Tóm tắt lấy câu đầu body; "chưa" thắng "nghiệm thu"; JSON không đọc được ⇒ không lệch', () => {
  assert.equal(acceptanceTextVerdict('Nghiệm thu. Mọi tiêu chí đạt.'), 'accepted');
  assert.equal(acceptanceTextVerdict('**Chưa nghiệm thu.** Còn lỗi.'), 'not_accepted');
  assert.equal(acceptanceTextVerdict('## Tóm tắt\nKhông nghiệm thu vì thiếu test.'), 'not_accepted');
  assert.equal(acceptanceTextVerdict('## Tóm tắt\nKhông đạt yêu cầu.'), 'not_accepted');
  assert.equal(acceptanceTextVerdict('## Tóm tắt\nBiên bản nghiệm thuật.'), undefined);
  assert.equal(parseAcceptance('Nghiệm thu.').textMismatch, undefined);
});

// ── qua orchestrator ──
function setup(rounds: number) {
  const a = testApp();
  (a.config.defaults as { acceptFollowupRounds?: number }).acceptFollowupRounds = rounds;
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'), 'ccoding-accmm-'));
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

function instrument(a: Ctx, next: (n: number) => string, hook?: (n: number) => void): { accepts: () => number } {
  let n = 0;
  const orch = a.orchestrator as unknown as { call: (...x: unknown[]) => Promise<{ text: string; error?: string }> };
  const orig = orch.call.bind(orch);
  orch.call = async (agent, phase, build, ctx) => {
    if (phase === 'accept') {
      n++;
      hook?.(n);
    }
    const r = await orig(agent, phase, build, ctx);
    if (phase === 'execute') r.text = templateHeadings((agent as { body: string }).body).map((h) => `## ${h}\nNội dung thật cho mục này.`).join('\n');
    if (phase === 'accept') r.text = next(n);
    return r;
  };
  return { accepts: () => n };
}

test('D27 orchestrator: "Nghiệm thu." + JSON false ⇒ dòng [Hệ thống], sự kiện nhật ký, vòng bổ sung vẫn mở theo JSON', async () => {
  const a = setup(1);
  let taskId = '';
  let fileAfterFirst = '';
  const acc = instrument(
    a,
    (n) => (n === 1 ? reply('Nghiệm thu.', false, IN2) : reply('Đã nghiệm thu.', true, OK2)),
    (n) => {
      if (n === 2) fileAfterFirst = fs.readFileSync(path.join(a.store.runDir(taskId), 'ACCEPTANCE.md'), 'utf8');
    },
  );
  try {
    const t = a.orchestrator.submit({ brief: 'Thêm hàm cộng vào a.js', projectId: 'repo', options: { lane: 'single', slim: { accept: 'brief' }, review: false } });
    taskId = t.id;
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    // engine theo JSON: mở vòng bổ sung, nghiệm thu lần hai
    assert.equal(acc.accepts(), 2);
    assert.equal(done.acceptFollowups, 1);
    assert.equal(done.runs.length, 2);
    // dòng đầu do hệ thống ghi, nêu kết luận theo JSON
    const first = fileAfterFirst.replace(/\r/g, '').split('\n')[0];
    assert.match(first, /^> \*\*\[Hệ thống\]\*\*/);
    assert.match(first, /accepted: false/);
    assert.match(first, /CHƯA nghiệm thu/);
    assert.match(fileAfterFirst.replace(/\r/g, ''), /\n## Tóm tắt\nNghiệm thu\./);
    const ev = a.logs.query({ task: t.id }).filter((e) => e.kind === 'accept.text_mismatch');
    assert.equal(ev.length, 1, 'chỉ lượt accept đầu lệch');
    assert.equal(ev[0].level, 'warn');
    // lượt hai khớp: không lệch, tệp không có dòng thêm
    assert.equal(done.acceptance?.accepted, true);
    assert.equal(done.acceptance?.textMismatch, undefined);
    const last = fs.readFileSync(path.join(a.store.runDir(t.id), 'ACCEPTANCE.md'), 'utf8');
    assert.ok(last.startsWith('## Tóm tắt\nĐã nghiệm thu.'), 'không có dòng [Hệ thống] khi khớp');
  } finally {
    a.cleanupAll();
  }
});

test('D27 orchestrator: JSON true + "Chưa nghiệm thu." ⇒ textMismatch, dòng nêu ĐÃ nghiệm thu, engine theo JSON', async () => {
  const a = setup(0);
  const acc = instrument(a, () => reply('Chưa nghiệm thu.', true, OK2));
  try {
    const t = a.orchestrator.submit({ brief: 'Thêm hàm cộng vào a.js', projectId: 'repo', options: { lane: 'single', slim: { accept: 'brief' }, review: false } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(acc.accepts(), 1);
    assert.equal(done.acceptance?.accepted, true);
    assert.equal(done.acceptance?.textMismatch, true);
    const file = fs.readFileSync(path.join(a.store.runDir(t.id), 'ACCEPTANCE.md'), 'utf8');
    assert.match(file.split('\n')[0], /ĐÃ nghiệm thu/);
  } finally {
    a.cleanupAll();
  }
});
