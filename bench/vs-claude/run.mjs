#!/usr/bin/env node
// CCoding vs single Claude benchmark runner.
//   node run.mjs --arms A0-sonnet,B0 --tasks all --repeats 3 --out results/2026-11-pilot
//   node run.mjs --arms oracle,null --repeats 1 --out results/selftest      (grader self-test, no LLM)
// Resumable: re-run the same command and finished run keys are skipped.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROCESS_SUFFIX, runClaude, weighted } from './lib/claude.mjs';
import { runCcoding, serverUp } from './lib/ccoding.mjs';
import { GRADERS } from './lib/grade.mjs';
import { blind } from './lib/judge.mjs';

const SUITE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const has = (k) => argv.includes(`--${k}`);

const ARMS = JSON.parse(fs.readFileSync(path.join(SUITE, 'arms.json'), 'utf8'));
const allTasks = fs.readdirSync(path.join(SUITE, 'tasks')).filter((d) => fs.existsSync(path.join(SUITE, 'tasks', d, 'task.json'))).sort();
const taskSel = flag('tasks', 'all');
const taskIds = taskSel === 'all' ? allTasks : taskSel.split(',').flatMap((s) => allTasks.filter((t) => t === s || t.startsWith(`${s}-`) || JSON.parse(fs.readFileSync(path.join(SUITE, 'tasks', t, 'task.json'))).category === s));
const armIds = flag('arms', 'A0-sonnet,B0').split(',');
for (const a of armIds) if (!ARMS[a]) throw new Error(`Unknown arm ${a}. Known: ${Object.keys(ARMS).join(', ')}`);
const repeats = Number(flag('repeats', '3'));
const out = path.resolve(flag('out', path.join(SUITE, 'results', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'))));
const cfg = {
  ccodingUrl: flag('ccoding-url', 'http://127.0.0.1:7420'),
  ccodingData: flag('ccoding-data', path.resolve(SUITE, '../../data')),
  runtime: flag('runtime', 'claude-cli'),
  timeoutMin: Number(flag('timeout', '60')),
  claudeBin: flag('claude-bin', 'claude'),
  judge: { enabled: has('judge'), model: flag('judge-model', 'opus') },
  seed: flag('seed', 'ccvb'),
  workRoot: path.resolve(flag('work', path.join(os.tmpdir(), `ccvb-${crypto.randomBytes(3).toString('hex')}`))),
};

// ---------- schedule: interleaved, arm order rotated per (repeat, task) to spread drift and warm-cache effects ----------
function shuffled(arr, seed) {
  const a = [...arr]; let h = crypto.createHash('sha256').update(seed).digest();
  for (let i = a.length - 1; i > 0; i--) { h = crypto.createHash('sha256').update(h).digest(); const j = h.readUInt32BE(0) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const schedule = [];
for (let r = 1; r <= repeats; r++) {
  shuffled(taskIds, `${cfg.seed}/${r}`).forEach((t, ti) => {
    const k = (r + ti) % armIds.length;
    for (const a of [...armIds.slice(k), ...armIds.slice(0, k)]) schedule.push({ task: t, arm: a, rep: r, key: `${t}__${a}__r${r}` });
  });
}

if (has('dry-run')) {
  console.log(`${schedule.length} runs -> ${out}`);
  for (const s of schedule) console.log(s.key);
  process.exit(0);
}

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify({ argv, cfg, armIds, taskIds, repeats, startedAt: new Date().toISOString() }, null, 2));
const runsFile = path.join(out, 'runs.jsonl');
const done = new Set(fs.existsSync(runsFile) ? fs.readFileSync(runsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);

if (armIds.some((a) => ARMS[a].kind === 'ccoding') && !(await serverUp(cfg.ccodingUrl))) {
  console.error(`CCoding server not reachable at ${cfg.ccodingUrl} - start it with: node dist/cli.js serve`);
  process.exit(2);
}

// ---------- helpers ----------
function freshWorkspace(task, key) {
  const dir = path.join(cfg.workRoot, key);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(path.join(SUITE, 'tasks', task, 'repo'), dir, { recursive: true });
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q'); git('add', '-A');
  git('-c', 'user.name=bench', '-c', 'user.email=bench@local', 'commit', '-qm', 'base');
  return dir;
}

function briefFor(task) {
  return `${task.brief}\n\nYou are working in the current directory, a git repository. Put deliverables exactly where the brief says. Work only inside this directory.`;
}

/** Did the agent touch the suite (hidden tests / answers)? */
function leakCheck(lines) {
  const needles = [SUITE, `${path.sep}hidden${path.sep}`, 'hidden/answer.json', 'hidden/solution', 'checklist.json', 'issues.json'];
  return lines.some((l) => needles.some((n) => String(l).includes(n)));
}

function visibleTestScore(dir) {
  if (!fs.existsSync(path.join(dir, 'package.json'))) return 0;
  const r = spawnSync('npm', ['test', '--silent'], { cwd: dir, encoding: 'utf8', timeout: 120000, shell: process.platform === 'win32' });
  const o = `${r.stdout}\n${r.stderr}`;
  const pass = Number(o.match(/^# pass (\d+)/m)?.[1] ?? 0), fail = Number(o.match(/^# fail (\d+)/m)?.[1] ?? 0);
  return pass / Math.max(1, pass + fail) + (r.status === 0 ? 1 : 0);
}

async function runArm(arm, task, key) {
  const spec = ARMS[arm];
  const brief = briefFor(task);
  if (spec.kind === 'null') { const dir = freshWorkspace(task.id, key); return { dir, status: 'done', wallSec: 0, tokens: zero(), costUsd: 0, turns: 0, finalText: '' }; }
  if (spec.kind === 'oracle') {
    const dir = freshWorkspace(task.id, key); const h = path.join(SUITE, 'tasks', task.id, 'hidden');
    if (fs.existsSync(path.join(h, 'solution'))) fs.cpSync(path.join(h, 'solution'), dir, { recursive: true });
    if (fs.existsSync(path.join(h, 'answer.json'))) fs.copyFileSync(path.join(h, 'answer.json'), path.join(dir, task.deliverable.endsWith('.json') ? task.deliverable : 'answer.json'));
    if (fs.existsSync(path.join(h, 'reference'))) fs.cpSync(path.join(h, 'reference'), dir, { recursive: true });
    return { dir, status: 'done', wallSec: 0, tokens: zero(), costUsd: 0, turns: 0, finalText: '' };
  }
  if (spec.kind === 'claude') {
    const dir = freshWorkspace(task.id, key);
    const r = await runClaude({ cwd: dir, prompt: spec.process ? brief + PROCESS_SUFFIX : brief, model: spec.model, timeoutMin: cfg.timeoutMin, bin: cfg.claudeBin });
    return { dir, ...r, leak: leakCheck(r.transcript), transcript: undefined };
  }
  if (spec.kind === 'best-of-n') {
    const cands = [];
    for (let i = 0; i < spec.n; i++) {
      const dir = freshWorkspace(task.id, `${key}__c${i}`);
      const r = await runClaude({ cwd: dir, prompt: brief, model: spec.model, timeoutMin: cfg.timeoutMin, bin: cfg.claudeBin });
      cands.push({ dir, ...r, leak: leakCheck(r.transcript), transcript: undefined });
    }
    let pick = 0, selector = zero(), selCost = 0;
    if (task.grader === 'code') {
      const s = cands.map((c) => visibleTestScore(c.dir)); pick = s.indexOf(Math.max(...s));
    } else {
      // Selector sees only the deliverables (never hidden data).
      const shown = cands.map((c, i) => { const p = path.join(c.dir, task.deliverable); const t = fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p, 'utf8') : c.finalText; return `### Candidate ${i}\n${blind(t).slice(0, 40000)}`; }).join('\n\n');
      const sel = spawnSync(cfg.claudeBin, ['-p', `Brief:\n${task.brief}\n\n${shown}\n\nWhich candidate best satisfies the brief? Reply with only JSON {"best": <index>}.`, '--output-format', 'json', '--model', spec.model, '--tools', '', '--no-session-persistence', '--strict-mcp-config'], { cwd: os.tmpdir(), encoding: 'utf8', timeout: 600000, maxBuffer: 64 << 20 });
      try { const o = JSON.parse(sel.stdout); pick = Number(String(o.result).match(/"best"\s*:\s*(\d+)/)?.[1] ?? 0); const u = o.usage ?? {}; selector = { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 }; selCost = o.total_cost_usd ?? 0; } catch { pick = 0; }
    }
    const tok = [...cands.map((c) => c.tokens), selector].reduce((a, b) => ({ input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite }), zero());
    tok.total = tok.input + tok.output + tok.cacheRead + tok.cacheWrite; tok.weighted = weighted(tok);
    const best = cands[Math.min(pick, cands.length - 1)];
    return { ...best, tokens: tok, costUsd: cands.reduce((s, c) => s + c.costUsd, selCost), wallSec: cands.reduce((s, c) => s + c.wallSec, 0), turns: cands.reduce((s, c) => s + c.turns, 0), leak: cands.some((c) => c.leak), picked: pick };
  }
  if (spec.kind === 'ccoding') {
    const dir = freshWorkspace(task.id, key);
    const projectId = `vb-${crypto.createHash('sha1').update(key + cfg.workRoot).digest('hex').slice(0, 12)}`;
    const r = await runCcoding({ baseUrl: cfg.ccodingUrl, dataDir: cfg.ccodingData, runtime: cfg.runtime, projectId, workdir: dir, brief, title: `[vs-claude ${key}] ${task.title}`.slice(0, 120), taskOptions: spec.options ?? {}, agentId: spec.agentId, variant: `vs-claude/${key}`, timeoutMin: cfg.timeoutMin });
    let leak = false;
    const callsFile = path.join(cfg.ccodingData, 'runs', r.taskId, 'calls.jsonl');
    if (fs.existsSync(callsFile)) leak = leakCheck(fs.readFileSync(callsFile, 'utf8').split('\n'));
    return { dir, ...r, leak };
  }
  throw new Error(`unknown arm kind ${spec.kind}`);
}
function zero() { return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, weighted: 0 }; }

function snapshot(dir, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(dir, dest, { recursive: true, filter: (s) => !s.split(path.sep).includes('.git') && !s.split(path.sep).includes('node_modules') });
}

// ---------- main loop ----------
let i = 0;
for (const s of schedule) {
  i++;
  if (done.has(s.key)) continue;
  const task = JSON.parse(fs.readFileSync(path.join(SUITE, 'tasks', s.task, 'task.json'), 'utf8'));
  process.stdout.write(`[${i}/${schedule.length}] ${s.key} ... `);
  let r, g, error;
  try {
    r = await runArm(s.arm, task, s.key);
    g = await GRADERS[task.grader]({ workdir: r.dir, hiddenDir: path.join(SUITE, 'tasks', s.task, 'hidden'), suiteRepoDir: path.join(SUITE, 'tasks', s.task, 'repo'), finalText: r.finalText, task, judge: cfg.judge });
    snapshot(r.dir, path.join(out, 'artifacts', s.key));
    fs.writeFileSync(path.join(out, 'artifacts', s.key, '_FINAL.txt'), r.finalText ?? '');
  } catch (e) { error = String(e?.stack ?? e).slice(0, 2000); }
  const row = {
    key: s.key, task: s.task, category: task.category, size: task.size, arm: s.arm, rep: s.rep, at: new Date().toISOString(),
    status: error ? 'error' : r.status, error, wallSec: r?.wallSec, tokens: r?.tokens, costUsd: r?.costUsd, turns: r?.turns,
    calls: r?.calls, agentsUsed: r?.agentsUsed, byPhase: r?.byPhase, picked: r?.picked, leak: !!r?.leak,
    score: g?.score ?? 0, pass: !!g?.pass, formatMiss: !!g?.formatMiss, details: g?.details,
  };
  fs.appendFileSync(runsFile, `${JSON.stringify(row)}\n`);
  console.log(error ? `ERROR ${error.split('\n')[0]}` : `score ${row.score.toFixed(2)} | ${Math.round(row.wallSec ?? 0)}s | ${row.tokens?.weighted ?? 0} wtok${row.leak ? ' | LEAK' : ''}`);
}
console.log(`\nDone. Results: ${runsFile}\nAnalyse: node ${path.relative(process.cwd(), path.join(SUITE, 'analyze.mjs'))} ${out}`);
