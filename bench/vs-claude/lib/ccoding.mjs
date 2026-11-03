// CCoding arm: register the run's workspace as a project, submit the brief over REST, wait, collect usage.
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
    b02: b02.length ? { blocked: blocked(b02), rounds: Math.max(b02.filter((d) => d.verdict === 'block').length, ...b02.map((d) => (Number.isFinite(d.rounds) ? d.rounds : 0))) } : null,
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

export async function runCcoding(opts) {
  const api = client(opts.baseUrl);
  const t0 = Date.now();
  let task;
  try {
  await api('/api/projects', { method: 'POST', body: JSON.stringify({
    id: opts.projectId, name: `bench ${opts.projectId}`, workspace: opts.workdir, department: 'auto',
    classification: 'internal', runtime: opts.runtime, toolAccess: 'exec', isolation: 'none', budgetMode: 'complete', planApproval: false,
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
    if (t.status === 'paused') { await api(`/api/tasks/${task.id}/resume`, { method: 'POST', body: JSON.stringify({ budgetMode: 'complete' }) }).catch(() => {}); }
    await sleep(10000);
    try { t = (await api(`/api/tasks/${task.id}`)).task; } catch (e) { infra = 'error'; t = { ...t, status: 'failed', error: String(e.message) }; break; }
  }
  if (!infra && t.status !== 'done') { const rl = scan(); if (rl.rateLimited) { infra = 'rate-limit'; resetsAt = rl.resetsAt; } }
  const wallSec = (Date.now() - t0) / 1000;
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
  let research;
  try {
    const callsText = opts.dataDir && fs.existsSync(callsFile) ? fs.readFileSync(callsFile, 'utf8') : '';
    const evFile = path.join(opts.dataDir ?? '', 'runs', task.id, 'events.jsonl');
    const eventsText = opts.dataDir && fs.existsSync(evFile) ? fs.readFileSync(evFile, 'utf8') : '';
    research = researchFields(callsText, (await api(`/api/tasks/${task.id}`)).task ?? t, eventsText);
  } catch { research = researchFields('', t); }
  tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
  tokens.weighted = weighted(tokens);
  return {
    status: t.status === 'done' ? 'done' : 'failed', wallSec, tokens, costUsd, turns, calls,
    finalText, taskId: task.id, byPhase, agentsUsed: Object.keys(byAgent).length, byAgent,
    department: t.department, attention: t.attention,
    research, infra, ...(resetsAt ? { resetsAt } : {}),
  };
}

export async function serverUp(baseUrl) {
  try { await client(baseUrl)('/api/tasks'); return true; } catch { return false; }
}
