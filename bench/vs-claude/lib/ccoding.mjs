// CCoding arm: register the run's workspace as a project, submit the brief over REST, wait, collect usage.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { weighted } from './claude.mjs';
import { detectRateLimit } from './infra.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function client(baseUrl) {
  return async function api(p, init = {}) {
    const r = await fetch(`${baseUrl}${p}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
    const text = await r.text();
    if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${p} -> ${r.status}: ${text.slice(0, 300)}`);
    try { return JSON.parse(text); } catch { return text; }
  };
}

/**
 * opts: { baseUrl, dataDir (CCoding data dir, for calls.jsonl), runtime, projectId, workdir, brief, title, taskOptions, timeoutMin }
 * Returns the same shape as runClaude() (gồm infra: 'rate-limit' | 'error' | undefined và resetsAt).
 */
/**
 * Chỉ các trường lỗi của từng dòng calls.jsonl (error, errorKind, attempts) — KHÔNG gồm `text` hay tham số công cụ,
 * vì nội dung bài (vd. log HTTP "status=429" của t5-logq) sẽ bị nhận nhầm thành hạn mức.
 */
export function callErrors(callsText) {
  const out = [];
  for (const l of String(callsText).split('\n')) {
    if (!l.trim()) continue;
    let c; try { c = JSON.parse(l); } catch { continue; }
    const e = { error: c.error, errorKind: c.errorKind, attempts: c.attempts };
    if (c.error || c.errorKind || (Array.isArray(c.attempts) && c.attempts.length)) out.push(e);
  }
  return out;
}

/**
 * B-11: số đo cho nghiên cứu, rút từ calls.jsonl + task.json. Chỉ số đo — không chép nội dung prompt hay đường dẫn.
 * Thời gian theo pha: nguồn chuẩn là calls.jsonl (durationMs; thiếu thì hiệu ts giữa hai dòng liên tiếp); byPhaseSecSource ghi nguồn.
 */
/**
 * B-12: đọc sự kiện `gate.decision` (events.jsonl của nhiệm vụ) → gates.b02 {blocked, rounds}, gates.b10 {blocked}, gates.cto {pass}.
 * Payload { gate: 'b02'|'b10'|'cto', verdict: 'block'|'pass', rounds?, subtaskId? } nằm ở `data` (hoặc ngang hàng). Cổng không có sự kiện → null.
 */
export function gateDecisions(eventsText) {
  const by = { b02: [], b10: [], cto: [] };
  for (const l of String(eventsText ?? '').split(/\r?\n/)) {
    if (!l.trim()) continue;
    let e; try { e = JSON.parse(l); } catch { continue; }
    if (e?.kind !== 'gate.decision') continue;
    const d = e.data && typeof e.data === 'object' ? e.data : e;
    if (by[d.gate] && (d.verdict === 'block' || d.verdict === 'pass')) by[d.gate].push(d);
  }
  const blocked = (a) => a.some((d) => d.verdict === 'block');
  const { b02, b10, cto } = by;
  return {
    b02: b02.length ? { blocked: blocked(b02), rounds: Math.max(b02.filter((d) => d.verdict === 'block').length, ...b02.map((d) => (Number.isFinite(d.rounds) ? d.rounds : 0))), checksRed: typeof b02[b02.length - 1].checks?.red === 'number' ? b02[b02.length - 1].checks.red : null } : null,
    b10: b10.length ? { blocked: blocked(b10) } : null,
    cto: cto.length ? { pass: cto[cto.length - 1].verdict === 'pass' } : null,
  };
}

export function researchFields(callsText, task, eventsText) {
  const byPhaseSec = {}, byPhaseTokens = {}, promptChars = {};
  // B-13: model theo pha và chi tiết theo pha (byPhase gốc vẫn là số weighted, không đổi).
  const byPhaseModel = {}, byPhaseDetail = {}, models = new Set();
  let withDur = 0, withoutDur = 0, prevTs = null;
  for (const l of String(callsText ?? '').split(/\r?\n/)) {
    if (!l.trim()) continue;
    let c; try { c = JSON.parse(l); } catch { continue; }
    const ph = c.phase ?? '?';
    const ts = Date.parse(c.ts);
    let sec = 0;
    if (typeof c.durationMs === 'number' && c.durationMs > 0) { sec = c.durationMs / 1000; withDur++; }
    else { if (prevTs != null && Number.isFinite(ts)) sec = Math.max(0, (ts - prevTs) / 1000); withoutDur++; }
    if (Number.isFinite(ts)) prevTs = ts;
    byPhaseSec[ph] = +((byPhaseSec[ph] ?? 0) + sec).toFixed(3);
    const t = (byPhaseTokens[ph] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    t.input += c.input ?? 0; t.output += c.output ?? 0; t.cacheRead += c.cacheRead ?? 0; t.cacheWrite += c.cacheWrite ?? 0;
    const d = (byPhaseDetail[ph] ??= { calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, ms: 0 });
    d.calls++; d.input += c.input ?? 0; d.cacheRead += c.cacheRead ?? 0; d.cacheWrite += c.cacheWrite ?? 0; d.output += c.output ?? 0; d.ms += sec * 1000;
    if (c.model) { models.add(c.model); const m = (byPhaseModel[ph] ??= []); if (!m.includes(c.model)) m.push(c.model); }
    if (c.sizes) {
      const p = (promptChars[ph] ??= { system: 0, context: 0, prompt: 0, calls: 0 });
      p.system += c.sizes.system ?? 0; p.context += c.sizes.context ?? 0; p.prompt += c.sizes.prompt ?? 0; p.calls++;
    }
  }
  for (const d of Object.values(byPhaseDetail)) d.ms = Math.round(d.ms);
  const latest = task?.projectChecks?.latest ?? [];
  const gate = !latest.length ? 'none' : latest.every((r) => r.ok) ? 'green' : 'red';
  const runs = task?.runs ?? [];
  return {
    byPhaseSec, byPhaseSecSource: withDur ? (withoutDur ? 'calls.durationMs+ts' : 'calls.durationMs') : withoutDur ? 'calls.ts' : 'none',
    byPhaseTokens, promptChars,
    byPhaseModel, byPhaseDetail, models: [...models], gates: gateDecisions(eventsText),
    lane: task?.lane ?? null, escalatedFrom: runs.some((r) => r.escalatedFrom === 'single') ? 'single' : null,
    gate, fixRounds: runs.reduce((n, r) => n + (r.gateFixRoundsUsed ?? 0), 0),
    acceptMode: task?.acceptance?.mode ?? 'full',
  };
}

/**
 * D14 K4: thời gian thực theo mốc của chính nhiệm vụ (startedAt → finishedAt), không theo vòng hỏi 10 s của harness.
 * `wallSec` cũ (đồng hồ harness, làm tròn lên theo vòng hỏi) giữ nguyên để so được với các đợt trước. Thiếu mốc → null.
 */
export function taskTimes(task) {
  const at = (x) => (typeof x === 'string' ? Date.parse(x) : NaN);
  const d = (a, b) => { const v = (at(b) - at(a)) / 1000; return Number.isFinite(v) && v >= 0 ? +v.toFixed(3) : null; };
  // E8: số hạng mục chạy cùng lúc tối đa (theo mốc hạng mục), để kiểm B6w1 thật sự chạy lần lượt
  const iv = (task?.runs ?? []).flatMap((r) => r.subtasks ?? []).map((st) => [at(st.startedAt), at(st.finishedAt)]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a);
  const ev = iv.flatMap(([a, b]) => [[a, 1], [b, -1]]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let c = 0, maxConc = 0; for (const [, k] of ev) { c += k; maxConc = Math.max(maxConc, c); }
  return { wallSecTask: d(task?.startedAt, task?.finishedAt), queueSecTask: d(task?.createdAt, task?.startedAt), subtasksTimed: iv.length, maxConcSubtasks: maxConc };
}

export async function runCcoding(opts) {
  const api = client(opts.baseUrl);
  const t0 = Date.now();
  let task;
  try {
  await api('/api/projects', { method: 'POST', body: JSON.stringify({
    id: opts.projectId, name: `bench ${opts.projectId}`, workspace: opts.workdir, department: 'auto',
    classification: 'internal', runtime: opts.runtime, toolAccess: 'exec', isolation: opts.isolation ?? 'none', budgetMode: 'complete', planApproval: false,
    checkCommands: fs.existsSync(path.join(opts.workdir, 'package.json')) ? ['npm test'] : [],
  }) });
  task = await api('/api/tasks', { method: 'POST', body: JSON.stringify({
    brief: opts.brief, title: opts.title, mode: opts.agentId ? 'agent' : 'project', projectId: opts.projectId, agentId: opts.agentId,
    options: { budgetMode: 'complete', planApproval: false, ...opts.taskOptions, variant: opts.variant },
  }) });
  if (!task?.id) throw new Error(`POST /api/tasks không trả id: ${JSON.stringify(task).slice(0, 300)}`);
  } catch (e) {
    const rl = detectRateLimit(String(e.message));
    return { status: 'failed', wallSec: (Date.now() - t0) / 1000, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, weighted: 0 }, costUsd: 0, turns: 0, calls: 0, finalText: '', byPhase: {}, agentsUsed: 0, byAgent: {}, infra: rl.rateLimited ? 'rate-limit' : 'error', ...(rl.resetsAt ? { resetsAt: rl.resetsAt } : {}), error: String(e.message) };
  }
  const deadline = t0 + (opts.timeoutMin ?? 60) * 60000;
  let t = task; let infra, resetsAt;
  // K4: thời gian harness thấy nhiệm vụ ở trạng thái tạm dừng (độ chính xác = vòng hỏi 10 s); chỉ thêm trường mới, wallSecTask vẫn gồm cả thời gian dừng
  let pausedSince = null, pausedMs = 0, pauseCount = 0;
  const callsPath = path.join(opts.dataDir ?? '', 'runs', task.id, 'calls.jsonl');
  const scan = () => {
    const texts = [t.attention, t.error];
    try { if (opts.dataDir && fs.existsSync(callsPath)) texts.push(callErrors(fs.readFileSync(callsPath, 'utf8')).slice(-5)); } catch { /* bỏ qua */ }
    return detectRateLimit(texts);
  };
  while (!['done', 'failed', 'cancelled'].includes(t.status)) {
    if (Date.now() > deadline) { await api(`/api/tasks/${task.id}/cancel`, { method: 'POST', body: '{}' }).catch(() => {}); t = { ...t, status: 'failed', timedOut: true }; break; }
    const rl = scan();
    if (rl.rateLimited) {
      infra = 'rate-limit'; resetsAt = rl.resetsAt;
      await api(`/api/tasks/${task.id}/cancel`, { method: 'POST', body: '{}' }).catch(() => {});
      t = { ...t, status: 'failed' }; break;
    }
    if (t.status === 'paused') { if (pausedSince === null) { pausedSince = Date.now(); pauseCount++; } await api(`/api/tasks/${task.id}/resume`, { method: 'POST', body: JSON.stringify({ budgetMode: 'complete' }) }).catch(() => {}); }
    await sleep(10000);
    try { t = (await api(`/api/tasks/${task.id}`)).task; if (pausedSince !== null && t.status !== 'paused') { pausedMs += Date.now() - pausedSince; pausedSince = null; } } catch (e) { infra = 'error'; t = { ...t, status: 'failed', error: String(e.message) }; break; }
  }
  if (!infra && t.status !== 'done') { const rl = scan(); if (rl.rateLimited) { infra = 'rate-limit'; resetsAt = rl.resetsAt; } }
  if (pausedSince !== null) { pausedMs += Date.now() - pausedSince; pausedSince = null; }
  const wallSec = (Date.now() - t0) / 1000;
  // V4-3f: isolation 'worktree' → CCoding làm trên nhánh nhiệm vụ trong worktree riêng; đưa thư mục chấm về đúng commit cuối của nhánh
  const isolation = opts.isolation ?? 'none';
  let checkout;
  if (isolation === 'worktree') checkout = checkoutTaskBranch(opts.workdir, t.branch);
  // Nhiệm vụ xong mà không đưa được thư mục chấm về nhánh → không được chấm trên thư mục cũ (sẽ ra điểm 0 giả): coi là lỗi hạ tầng, chạy lại khi chạy tiếp
  let checkoutError;
  if (checkout && !checkout.ok && t.status === 'done' && !infra) { infra = 'error'; checkoutError = `Không đưa được thư mục chấm về nhánh nhiệm vụ: ${checkout.note ?? ''}`; }
  let finalText = '';
  try { finalText = String(await api(`/api/tasks/${task.id}/file?path=FINAL.md`)); } catch { /* no report */ }

  // Usage: prefer calls.jsonl (one line per LLM call), else the server's per-agent summary.
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }; let costUsd = 0, calls = 0, turns = 0; const byPhase = {}; const byAgent = {};
  const callsFile = path.join(opts.dataDir ?? '', 'runs', task.id, 'calls.jsonl');
  if (opts.dataDir && fs.existsSync(callsFile)) {
    for (const line of fs.readFileSync(callsFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const c = JSON.parse(line);
      tokens.input += c.input ?? 0; tokens.output += c.output ?? 0; tokens.cacheRead += c.cacheRead ?? 0; tokens.cacheWrite += c.cacheWrite ?? 0;
      calls++; turns += c.turns ?? 0;
      const w = weighted({ input: c.input ?? 0, output: c.output ?? 0, cacheRead: c.cacheRead ?? 0, cacheWrite: c.cacheWrite ?? 0 });
      byPhase[c.phase] = (byPhase[c.phase] ?? 0) + w;
      byAgent[c.agentId] = (byAgent[c.agentId] ?? 0) + w;
    }
  } else {
    const detail = await api(`/api/tasks/${task.id}`);
    for (const row of detail.usage ?? []) {
      tokens.input += row.input; tokens.output += row.output; tokens.cacheRead += row.cacheRead; tokens.cacheWrite += row.cacheWrite ?? 0;
      costUsd += row.costUsd ?? 0; calls += row.calls ?? 0;
      byAgent[row.key] = weighted(row);
    }
  }
  let research, final;
  try {
    const callsText = opts.dataDir && fs.existsSync(callsFile) ? fs.readFileSync(callsFile, 'utf8') : '';
    const evFile = path.join(opts.dataDir ?? '', 'runs', task.id, 'events.jsonl');
    const eventsText = opts.dataDir && fs.existsSync(evFile) ? fs.readFileSync(evFile, 'utf8') : '';
    final = (await api(`/api/tasks/${task.id}`)).task ?? t;
    research = researchFields(callsText, final, eventsText);
  } catch { research = researchFields('', t); }
  tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
  tokens.weighted = weighted(tokens);
  return {
    status: t.status === 'done' ? 'done' : 'failed', wallSec, tokens, costUsd, turns, calls,
    finalText, taskId: task.id, byPhase, agentsUsed: Object.keys(byAgent).length, byAgent,
    department: t.department, attention: t.attention,
    research: { ...research, isolation, ...taskTimes(final ?? t), pausedSecObserved: +(pausedMs / 1000).toFixed(1), pauseCount, ...(checkout ? { checkout } : {}) }, infra, ...(checkoutError ? { error: checkoutError } : {}), ...(resetsAt ? { resetsAt } : {}),
  };
}

/** Đưa `workdir` (repo gốc của lượt) về commit cuối của nhánh nhiệm vụ (HEAD tách rời: nhánh có thể đang mở ở worktree khác). */
export function checkoutTaskBranch(workdir, branch) {
  if (!branch) return { ok: false, note: 'nhiệm vụ không có nhánh' };
  const r = spawnSync('git', ['checkout', '-q', '-f', '--detach', branch], { cwd: workdir, encoding: 'utf8' });
  return r.status === 0 ? { ok: true, branch } : { ok: false, branch, note: String(r.stderr || r.error?.message || '').trim().slice(0, 300) };
}

/**
 * K3: kiểm cấu hình hai server của E8. Trả về danh sách lỗi tiếng Việt (rỗng = ổn).
 * Arm có `server: "alt"` bắt buộc có URL và data riêng, không trùng server chính (không âm thầm rơi về server chính, không dùng chung data/).
 */
export function checkServers(armIds, arms, cfg) {
  if (!armIds.some((a) => arms[a]?.server === 'alt')) return [];
  const errs = [];
  if (!cfg.ccodingUrlAlt || !cfg.ccodingDataAlt) return ['Arm có server "alt" cần --ccoding-url-alt và --ccoding-data-alt (xem RUNBOOK, E8)'];
  const normUrl = (u) => String(u).trim().replace(/\/+$/, '').toLowerCase().replace('localhost', '127.0.0.1');
  const normDir = (d) => { const r = path.resolve(String(d)); return process.platform === 'win32' ? r.toLowerCase() : r; };
  if (normUrl(cfg.ccodingUrlAlt) === normUrl(cfg.ccodingUrl)) errs.push('--ccoding-url-alt trùng --ccoding-url: arm "alt" phải chạy trên server thứ hai (cổng khác)');
  if (normDir(cfg.ccodingDataAlt) === normDir(cfg.ccodingData)) errs.push('--ccoding-data-alt trùng --ccoding-data: hai server không được dùng chung thư mục data/');
  return errs;
}

export async function serverUp(baseUrl) {
  try { await client(baseUrl)('/api/tasks'); return true; } catch { return false; }
}
