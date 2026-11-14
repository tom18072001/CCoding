import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseRetryAt } from '../src/runtimes/errors.js';
import type { RunRequest, RunResult } from '../src/types.js';
import { testApp } from './helpers.js';
import { taskArtifacts } from '../src/artifacts.js';

// K1/D16: hết hạn mức 5 giờ giữa lượt execute/synthesize ⇒ nhiệm vụ `paused` (không `failed`), không đốt lượt thử lại,
// không ghi FINAL từ thông báo lỗi, usage của lượt làm dở vẫn vào sổ. Runtime là giả — không gọi claude -p.

const MSG = "You've hit your 5-hour limit · resets 1am (Asia/Bangkok)";
const MSG_BAD_TZ = "You've hit your 5-hour limit · resets 1am (Mars/Olympus)";
const PARTIAL = 'Văn bản làm dở: đã viết xong phần đầu của tài liệu.';

// 23:55 giờ Bangkok (UTC+7) ngày 13/11/2026 = 16:55 UTC
const NOW = Date.UTC(2026, 10, 13, 16, 55);
const bkk = (d: number, h: number, m = 0) => Date.UTC(2026, 10, d, h - 7, m);

test('parseRetryAt: "resets 1am (Asia/Bangkok)" lúc 23:55 → 01:00 ngày hôm sau', () => {
  assert.equal(parseRetryAt(undefined, MSG, NOW), bkk(14, 1));
});
test('parseRetryAt: 00:30 giờ Bangkok → 01:00 cùng ngày', () => {
  assert.equal(parseRetryAt(undefined, MSG, bkk(14, 0, 30)), bkk(14, 1));
});
test('parseRetryAt: 1:30pm và 13:00', () => {
  assert.equal(parseRetryAt(undefined, 'resets 1:30pm (Asia/Bangkok)', bkk(14, 0, 30)), bkk(14, 13, 30));
  assert.equal(parseRetryAt(undefined, 'resets 13:00 (Asia/Bangkok)', bkk(14, 0, 30)), bkk(14, 13));
  assert.equal(parseRetryAt(undefined, 'resets 12am (Asia/Bangkok)', NOW), bkk(14, 0));
  assert.equal(parseRetryAt(undefined, 'resets 12pm (Asia/Bangkok)', NOW), bkk(14, 12));
});
test('parseRetryAt: múi giờ khác (America/New_York, có đổi giờ mùa) và múi giờ sai → undefined', () => {
  // 13/11/2026 là giờ chuẩn miền Đông (UTC-5): 9am = 14:00 UTC
  assert.equal(parseRetryAt(undefined, 'resets 9am (America/New_York)', Date.UTC(2026, 10, 13, 12, 0)), Date.UTC(2026, 10, 13, 14, 0));
  assert.equal(parseRetryAt(undefined, MSG_BAD_TZ, NOW), undefined);
  assert.equal(parseRetryAt(undefined, 'resets 25:00 (Asia/Bangkok)', NOW), undefined);
});

type App = ReturnType<typeof testApp>;
const limitRes = (extra: Partial<RunResult> = {}, msg = MSG): RunResult => ({
  text: PARTIAL,
  error: msg,
  usage: { input: 1234, output: 567, cacheRead: 0, cacheWrite: 0, costUsd: 0 },
  estimated: false,
  model: 'mock',
  runtime: 'mock',
  durationMs: 1,
  turns: 3,
  toolCalls: [{ name: 'write_file', args: 'a.md', ok: true, ms: 1 }],
  ...extra,
});

/** Ở pha `phase` runtime giả trả `make()`; các pha khác chạy mock thật. */
function inject(a: App, phase: string, make: () => RunResult) {
  let current = '';
  const hits: string[] = [];
  const orch = a.orchestrator as unknown as { call: (agent: unknown, ph: string, ...rest: unknown[]) => Promise<unknown> };
  const origCall = orch.call.bind(orch);
  orch.call = (agent, ph, ...rest) => {
    current = ph;
    return origCall(agent, ph, ...rest);
  };
  const mock = a.runtimes.get('mock')!;
  const origRun = mock.run.bind(mock);
  mock.run = async (req: RunRequest, hooks) => {
    if (current === phase) {
      hits.push(current);
      return make();
    }
    return origRun(req, hooks);
  };
  return hits;
}

const BRIEF = 'Viết tài liệu API nhỏ cho dịch vụ thanh toán';
// Báo cáo tổng hợp của phòng = `<phòng>-FINAL.md`. Khi tạm dừng, writeFinal KHÔNG ghi FINAL.md ở gốc: bản tạm (chỉ có phụ lục
// token/tệp đầu ra) nằm ở `DRAFT-paused.md` — kiểm riêng bên dưới rằng nó không chứa thông báo lỗi.
const hasFinal = (a: App, id: string) => {
  const dir = a.store.runDir(id);
  return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => /-FINAL\.md$/.test(f));
};

test('execute: hết hạn mức 5 giờ giữa lượt (giờ tự tiếp tục ĐỌC TỪ THÔNG BÁO) → paused, không failed, gọi 1 lần, không FINAL, usage vào sổ', async () => {
  const a = testApp();
  try {
    const hits = inject(a, 'execute', () => limitRes());
    const before = Date.now();
    const t = a.orchestrator.submit({ brief: BRIEF, options: { discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'paused', `status=${done.status}`);
    assert.equal(done.pause?.reason, 'quota');
    // nguồn giờ: thông báo (không phải quotaCooldownMs) — 01:00 Bangkok kế tiếp, tối đa 24 giờ nữa
    const at = Date.parse(done.pause?.resumeAt ?? '');
    assert.ok(Number.isFinite(at), 'có giờ tự tiếp tục');
    const wall = new Date(at + 7 * 3_600_000);
    assert.equal(wall.getUTCHours(), 1, 'giờ tự tiếp tục là 01:00 giờ Bangkok');
    assert.equal(wall.getUTCMinutes(), 0);
    assert.ok(at > before && at - before <= 24 * 3_600_000 + 60_000);
    assert.ok(!done.runs.flatMap((r) => r.subtasks).some((s) => s.status === 'failed'), 'hạng mục không bị đánh failed');
    assert.equal(hits.length, 1, 'không có lượt thử lại tức thì');
    assert.equal(hasFinal(a, t.id), false, 'không có FINAL');
    const rec = a.usage.all({ task: t.id }).filter((r) => r.phase === 'execute');
    assert.ok(rec.some((r) => r.input === 1234 && r.output === 567), 'usage của lượt làm dở có trong sổ');
  } finally {
    a.cleanup();
  }
});

test('execute: múi giờ sai trong thông báo → vẫn paused, giờ tự tiếp tục theo quotaCooldownMs', async () => {
  const a = testApp();
  try {
    const cooldown = 3 * 3_600_000 + 17 * 60_000; // giá trị lạ để phân biệt với giờ đọc từ thông báo
    (a.config.runtime as { quotaCooldownMs: number }).quotaCooldownMs = cooldown;
    const hits = inject(a, 'execute', () => limitRes({}, MSG_BAD_TZ));
    const before = Date.now();
    const t = a.orchestrator.submit({ brief: BRIEF, options: { discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'paused', `status=${done.status}`);
    assert.equal(done.pause?.reason, 'quota');
    const at = Date.parse(done.pause?.resumeAt ?? '');
    assert.ok(at >= before + cooldown - 1000 && at <= Date.now() + cooldown + 1000, `resumeAt lệch khỏi cooldown: ${at - before}`);
    assert.equal(hits.length, 1);
    assert.ok(!done.runs.flatMap((r) => r.subtasks).some((s) => s.status === 'failed'));
    assert.equal(hasFinal(a, t.id), false);
  } finally {
    a.cleanup();
  }
});

test('synthesize: cùng thông báo hạn mức → paused, không ghi FINAL/báo cáo từ thông báo lỗi', async () => {
  const a = testApp();
  try {
    const hits = inject(a, 'synthesize', () => limitRes());
    const t = a.orchestrator.submit({ brief: BRIEF, options: { discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.ok(hits.length >= 1, 'pha synthesize được gọi');
    assert.equal(done.status, 'paused', `status=${done.status}`);
    assert.equal(done.pause?.reason, 'quota');
    assert.equal(hasFinal(a, t.id), false, 'không có báo cáo tổng hợp của phòng');
    assert.ok(done.runs.every((r) => !r.finalPath), 'run không có finalPath');
    const interim = a.store.readRunFile(t.id, 'DRAFT-paused.md') ?? '';
    assert.equal(interim.includes('5-hour limit'), false, 'bản tạm DRAFT-paused.md không chứa thông báo lỗi');
    assert.equal(interim.includes(PARTIAL), false);
    const dir = a.store.runDir(t.id);
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      const p = path.join(dir, f);
      if (f.endsWith('.md') && fs.statSync(p).isFile()) assert.equal(fs.readFileSync(p, 'utf8').includes('5-hour limit'), false, `${f} không chứa thông báo lỗi`);
    }
    const msgs = (done.messages ?? []) as Array<{ kind?: string; text?: string }>;
    assert.equal(msgs.some((m) => m.kind === 'report' && String(m.text ?? '').includes('5-hour limit')), false);
  } finally {
    a.cleanup();
  }
});

test('K4(a): paused vì hết hạn mức → không ghi FINAL.md, không finalPath; bản tạm là DRAFT-paused.md và không hiện là "Báo cáo tổng hợp"', async () => {
  const a = testApp();
  try {
    inject(a, 'synthesize', () => limitRes());
    const t = a.orchestrator.submit({ brief: BRIEF, options: { discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'paused');
    assert.equal(done.pause?.reason, 'quota');
    assert.equal(done.finalPath, undefined, 'task không có finalPath');
    assert.equal(fs.existsSync(path.join(a.store.runDir(t.id), 'FINAL.md')), false, 'không có FINAL.md');
    const draft = a.store.readRunFile(t.id, 'DRAFT-paused.md') ?? '';
    assert.match(draft.split('\n')[0], /BẢN TẠM/, 'dòng đầu nói rõ là bản tạm');
    assert.ok(!taskArtifacts(a.store, done).some((x) => x.name === 'Báo cáo tổng hợp' || x.path.includes('DRAFT-paused')), 'bản tạm không hiện thành báo cáo');
  } finally {
    a.cleanup();
  }
});

test('K4(a): tiếp tục rồi hoàn thành → FINAL.md được ghi bình thường, bản tạm bị dọn', async () => {
  const a = testApp();
  try {
    let limited = true;
    const mock = a.runtimes.get('mock')!;
    const orig = mock.run.bind(mock);
    let phase = '';
    const orch = a.orchestrator as unknown as { call: (agent: unknown, ph: string, ...rest: unknown[]) => Promise<unknown> };
    const origCall = orch.call.bind(orch);
    orch.call = (agent, ph, ...rest) => {
      phase = ph;
      return origCall(agent, ph, ...rest);
    };
    mock.run = async (req: RunRequest, hooks) => (limited && phase === 'synthesize' ? limitRes() : orig(req, hooks));
    const t = a.orchestrator.submit({ brief: BRIEF, options: { discussionRounds: 0 } });
    const paused = await a.orchestrator.waitFor(t.id);
    assert.equal(paused.status, 'paused');
    assert.equal(fs.existsSync(path.join(a.store.runDir(t.id), 'FINAL.md')), false);
    limited = false;
    // hạn mức đã mở lại: gỡ trạng thái tạm ngừng của runtime/model
    for (const key of [...(a.runtimes as unknown as { health: Map<string, unknown> }).health.keys()]) a.runtimes.markOk(key);
    a.orchestrator.resume(t.id);
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', `status=${done.status} ${JSON.stringify(done.pause)}`);
    assert.equal(done.finalPath, 'FINAL.md');
    assert.ok(fs.existsSync(path.join(a.store.runDir(t.id), 'FINAL.md')));
    assert.equal(fs.existsSync(path.join(a.store.runDir(t.id), 'DRAFT-paused.md')), false, 'bản tạm đã dọn');
  } finally {
    a.cleanup();
  }
});

// D7: nhiệm vụ paused CŨ (ghi bởi bản trước) còn FINAL.md tạm mà chưa có finalPath → khi tiếp tục thì đổi tên, không xóa, có log.
test('D7: paused cũ còn FINAL.md tạm → resume đổi tên thành DRAFT-paused.md, giữ nội dung, ghi log', async () => {
  const a = testApp();
  try {
    inject(a, 'synthesize', () => limitRes());
    const t = a.orchestrator.submit({ brief: BRIEF, options: { discussionRounds: 0 } });
    const paused = await a.orchestrator.waitFor(t.id);
    assert.equal(paused.status, 'paused');
    const dir = a.store.runDir(t.id);
    fs.rmSync(path.join(dir, 'DRAFT-paused.md'), { force: true });
    fs.writeFileSync(path.join(dir, 'FINAL.md'), 'BẢN TẠM CŨ — nội dung cần giữ', 'utf8');
    (a.orchestrator as unknown as { renameLegacyInterimFinal: (t: unknown) => void }).renameLegacyInterimFinal(paused);
    assert.equal(fs.existsSync(path.join(dir, 'FINAL.md')), false, 'FINAL.md tạm đã được đổi tên');
    assert.equal(fs.readFileSync(path.join(dir, 'DRAFT-paused.md'), 'utf8'), 'BẢN TẠM CŨ — nội dung cần giữ', 'nội dung còn nguyên');
    const logged = a.logs.query({ task: t.id, limit: 500 }).filter((e) => e.kind === 'task.final.legacy-renamed');
    assert.equal(logged.length, 1, 'có đúng một sự kiện log đổi tên');
  } finally {
    a.cleanup();
  }
});

test('D7: tên DRAFT-paused.md đã có → đổi thành DRAFT-paused-legacy.md; nhiệm vụ đã có finalPath thì không đụng', async () => {
  const a = testApp();
  try {
    inject(a, 'synthesize', () => limitRes());
    const t = a.orchestrator.submit({ brief: BRIEF, options: { discussionRounds: 0 } });
    const paused = await a.orchestrator.waitFor(t.id);
    const dir = a.store.runDir(t.id);
    assert.ok(fs.existsSync(path.join(dir, 'DRAFT-paused.md')));
    fs.writeFileSync(path.join(dir, 'FINAL.md'), 'CŨ', 'utf8');
    const o = a.orchestrator as unknown as { renameLegacyInterimFinal: (t: unknown) => void };
    o.renameLegacyInterimFinal({ ...paused, finalPath: 'FINAL.md' });
    assert.ok(fs.existsSync(path.join(dir, 'FINAL.md')), 'có finalPath: giữ nguyên');
    o.renameLegacyInterimFinal(paused);
    assert.equal(fs.readFileSync(path.join(dir, 'DRAFT-paused-legacy.md'), 'utf8'), 'CŨ');
    assert.equal(fs.existsSync(path.join(dir, 'FINAL.md')), false);
  } finally {
    a.cleanup();
  }
});
