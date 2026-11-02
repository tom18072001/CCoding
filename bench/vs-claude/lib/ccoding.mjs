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
export async function runCcoding(opts) {
  const api = client(opts.baseUrl);
  await api('/api/projects', { method: 'POST', body: JSON.stringify({
    id: opts.projectId, name: `bench ${opts.projectId}`, workspace: opts.workdir, department: 'auto',
    classification: 'internal', runtime: opts.runtime, toolAccess: 'exec', isolation: 'none', budgetMode: 'complete', planApproval: false,
    checkCommands: fs.existsSync(path.join(opts.workdir, 'package.json')) ? ['npm test'] : [],
  }) });
  const t0 = Date.now();
  let task;
  try {
  task = await api('/api/tasks', { method: 'POST', body: JSON.stringify({
    brief: opts.brief, title: opts.title, mode: opts.agentId ? 'agent' : 'project', projectId: opts.projectId, agentId: opts.agentId,
    options: { budgetMode: 'complete', planApproval: false, ...opts.taskOptions, variant: opts.variant },
  }) });
  } catch (e) {
    const rl = detectRateLimit(String(e.message));
    return { status: 'failed', wallSec: (Date.now() - t0) / 1000, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, weighted: 0 }, costUsd: 0, turns: 0, calls: 0, finalText: '', byPhase: {}, agentsUsed: 0, byAgent: {}, infra: rl.rateLimited ? 'rate-limit' : 'error', ...(rl.resetsAt ? { resetsAt: rl.resetsAt } : {}), error: String(e.message) };
  }
  const deadline = t0 + (opts.timeoutMin ?? 60) * 60000;
  let t = task; let infra, resetsAt;
  const callsPath = path.join(opts.dataDir ?? '', 'runs', task.id, 'calls.jsonl');
  const scan = () => {
    const texts = [t.attention, t.error];
    try { if (opts.dataDir && fs.existsSync(callsPath)) texts.push(fs.readFileSync(callsPath, 'utf8').split('\n').filter((l) => /error|"ok":\s*false/i.test(l)).slice(-5)); } catch { /* bỏ qua */ }
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
  tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
  tokens.weighted = weighted(tokens);
  return {
    status: t.status === 'done' ? 'done' : 'failed', wallSec, tokens, costUsd, turns, calls,
    finalText, taskId: task.id, byPhase, agentsUsed: Object.keys(byAgent).length, byAgent,
    department: t.department, attention: t.attention,
    infra, ...(resetsAt ? { resetsAt } : {}),
  };
}

export async function serverUp(baseUrl) {
  try { await client(baseUrl)('/api/tasks'); return true; } catch { return false; }
}
