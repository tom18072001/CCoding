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
import { PROCESS_SUFFIX, claudeEnv, runClaude, weighted } from './lib/claude.mjs';
import { runCcoding, serverUp, checkServers } from './lib/ccoding.mjs';
import { costOfCalls, priceRun } from './lib/pricing.mjs';
import { GRADERS } from './lib/grade.mjs';
import { blind } from './lib/judge.mjs';
import { EXIT_RATE_LIMIT, checkArms, classifyRun, cliVersion, doneKeys, gitCommit, latinOrders, leakCounts, leakInCalls, leakInSelectorPrompt, leakInTranscript, leakNeedles, provenance, replacementRuns, suiteTaskIds, supportedLanes } from './lib/queue.mjs';
import { populateWorkspace, taskDirs } from './lib/workspace.mjs';

const SUITE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const has = (k) => argv.includes(`--${k}`);

const { _suites: SUITES = {}, ...ARMS } = JSON.parse(fs.readFileSync(path.join(SUITE, 'arms.json'), 'utf8')); // _suites không phải arm (B-12)
const allTasks = fs.readdirSync(path.join(SUITE, 'tasks')).filter((d) => fs.existsSync(path.join(SUITE, 'tasks', d, 'task.json'))).sort();
const taskSel = flag('tasks', 'all');
const taskIds = taskSel === 'all' ? allTasks : taskSel.startsWith('suite:') ? suiteTaskIds(SUITES, taskSel.slice(6), allTasks) : taskSel.split(',').flatMap((s) => allTasks.filter((t) => t === s || t.startsWith(`${s}-`) || JSON.parse(fs.readFileSync(path.join(SUITE, 'tasks', t, 'task.json'))).category === s));
const armIds = flag('arms', 'A0-sonnet,B0').split(',');
for (const a of armIds) if (!ARMS[a]) throw new Error(`Unknown arm ${a}. Known: ${Object.keys(ARMS).join(', ')}`);
const repeats = Number(flag('repeats', '3'));
const out = path.resolve(flag('out', path.join(SUITE, 'results', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'))));
const cfg = {
  ccodingUrl: flag('ccoding-url', 'http://127.0.0.1:7420'),
  ccodingData: flag('ccoding-data', path.resolve(SUITE, '../../data')),
  // E8: server thứ hai (arm có `server: "alt"`, vd. B6w1 cần fastLane.maxParallel = 1 ở cấu hình server)
  ccodingUrlAlt: flag('ccoding-url-alt', null),
  ccodingDataAlt: flag('ccoding-data-alt', null),
  runtime: flag('runtime', 'claude-cli'),
  timeoutMin: Number(flag('timeout', '60')),
  claudeBin: flag('claude-bin', 'claude'),
  judge: { enabled: has('judge'), model: flag('judge-model', 'opus') },
  seed: flag('seed', 'ccvb'),
  window: flag('window', null), // SR-19: cửa sổ hạn mức/ca chạy do người vận hành khai, vd. 'W3'
  quotaState: flag('quota-state', null), // SR-19: trạng thái hạn mức lúc bắt đầu do người vận hành khai; không đoán
  workRoot: path.resolve(flag('work', path.join(os.tmpdir(), `ccvb-${crypto.randomBytes(3).toString('hex')}`))),
  // V4-3f khối B: 'none' (mặc định, như mọi đợt đo trước) → hạng mục chạy lệnh làm lần lượt; 'worktree' như vận hành thật → song song được
  isolation: flag('isolation', 'none'),
};
if (!['none', 'worktree'].includes(cfg.isolation)) throw new Error(`--isolation phải là none hoặc worktree (nhận: ${cfg.isolation})`);

// ---------- schedule: interleaved, arm order rotated per (repeat, task) to spread drift and warm-cache effects ----------
function shuffled(arr, seed) {
  const a = [...arr]; let h = crypto.createHash('sha256').update(seed).digest();
  for (let i = a.length - 1; i > 0; i--) { h = crypto.createHash('sha256').update(h).digest(); const j = h.readUInt32BE(0) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const schedule = [];
for (let r = 1; r <= repeats; r++) {
  shuffled(taskIds, `${cfg.seed}/${r}`).forEach((t, ti) => {
    // SR-23: bảng Latin (Williams) thật — mỗi arm đứng mỗi vị trí đều nhau, mỗi cặp liền kề đều nhau; thay cho xoay vòng (r + ti) % k.
    for (const a of latinOrders(armIds.length)[(r + ti) % latinOrders(armIds.length).length].map((x) => armIds[x])) schedule.push({ task: t, arm: a, rep: r, key: `${t}__${a}__r${r}` });
  });
}

// SR-01: lượt failed/error/infra chạy lại; khóa bị loại (excluded) vẫn tính là xong và được lượt thay rep = max(rep)+1 (§4.3).
const runsFile = path.join(out, 'runs.jsonl');
const runsText = fs.existsSync(runsFile) ? fs.readFileSync(runsFile, 'utf8') : '';
const done = doneKeys(runsText);
for (const x of replacementRuns(runsText, repeats, taskIds.flatMap((task) => armIds.map((arm) => ({ task, arm }))))) {
  const key = `${x.task}__${x.arm}__r${x.rep}`;
  if (!schedule.some((s) => s.key === key)) schedule.push({ task: x.task, arm: x.arm, rep: x.rep, key });
}

if (has('dry-run')) {
  console.log(`${schedule.length} runs -> ${out}`);
  for (const s of schedule) console.log(s.key);
  process.exit(0);
}

fs.mkdirSync(out, { recursive: true });
// SR-03: hash CCoding và phiên bản claude CLI lấy một lần lúc khởi động, ghi vào config.json rồi chép vào mỗi dòng.
const meta = { ccodingCommit: gitCommit(SUITE), claudeCliVersion: cliVersion(cfg.claudeBin), window: cfg.window, quotaState: cfg.quotaState, timeoutMin: cfg.timeoutMin };
fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify({ argv, cfg, meta, armIds, taskIds, repeats, startedAt: new Date().toISOString() }, null, 2));

const armErrors = checkArms(armIds, ARMS, supportedLanes(path.resolve(SUITE, '../..')));
if (armErrors.length) { for (const e of armErrors) console.error(e); process.exit(2); }

{ // isolation: trường của arm thắng cờ --isolation; báo khi cờ tường minh bị đè
  const over = armIds.filter((a) => ARMS[a].isolation && ARMS[a].isolation !== cfg.isolation);
  if (has('isolation') && over.length) console.error(`Lưu ý: --isolation ${cfg.isolation} bị đè bởi trường isolation của arm: ${over.map((a) => `${a}=${ARMS[a].isolation}`).join(', ')}`);
}
if (armIds.some((a) => ARMS[a].kind === 'ccoding' && ARMS[a].server !== 'alt') && !(await serverUp(cfg.ccodingUrl))) {
  console.error(`CCoding server not reachable at ${cfg.ccodingUrl} - start it with: node dist/cli.js serve`);
  process.exit(2);
}
if (armIds.some((a) => ARMS[a].server === 'alt')) {
  const srvErrors = checkServers(armIds, ARMS, cfg);
  if (srvErrors.length) { for (const e of srvErrors) console.error(e); process.exit(2); }
  if (!(await serverUp(cfg.ccodingUrlAlt))) { console.error(`CCoding server (alt) không truy cập được ở ${cfg.ccodingUrlAlt}`); process.exit(2); }
}
/** Server của arm: mặc định hoặc server thứ hai (E8). */
const serverOf = (spec) => (spec.server === 'alt' ? { url: cfg.ccodingUrlAlt, data: cfg.ccodingDataAlt } : { url: cfg.ccodingUrl, data: cfg.ccodingData });

// ---------- helpers ----------
function freshWorkspace(task, key) { // task: the parsed task.json
  const dir = path.join(cfg.workRoot, key);
  populateWorkspace(dir, taskDirs(SUITE, task).repoDir);
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q'); git('add', '-A');
  git('-c', 'user.name=bench', '-c', 'user.email=bench@local', 'commit', '-qm', 'base');
  return dir;
}

function briefFor(task) {
  return `${task.brief}\n\nYou are working in the current directory, a git repository. Put deliverables exactly where the brief says. Work only inside this directory.`;
}

/** Did the agent touch the suite (hidden tests / answers)? SR-21: chỉ xét đường dẫn và tham số công cụ (tool_use), không xét văn bản prompt hệ thống/kết quả công cụ. */
const NEEDLES = leakNeedles(SUITE, path.sep);
const leakCheck = (transcriptLines) => leakInTranscript(transcriptLines, NEEDLES);

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
  if (spec.kind === 'null') { const dir = freshWorkspace(task, key); return { dir, status: 'done', wallSec: 0, tokens: zero(), costUsd: 0, turns: 0, finalText: '' }; }
  if (spec.kind === 'oracle' || spec.kind === 'nearmiss') { // SR-24: nearmiss = lời giải tham chiếu rồi đè hidden/nearmiss/ (lời giải gần đúng, phải chấm < 1,00)
    const dir = freshWorkspace(task, key); const { hiddenDir: h, solutionDir } = taskDirs(SUITE, task);
    if (solutionDir) fs.cpSync(solutionDir, dir, { recursive: true });
    if (fs.existsSync(path.join(h, 'solution'))) fs.cpSync(path.join(h, 'solution'), dir, { recursive: true });
    if (fs.existsSync(path.join(h, 'answer.json'))) fs.copyFileSync(path.join(h, 'answer.json'), path.join(dir, task.deliverable.endsWith('.json') ? task.deliverable : 'answer.json'));
    if (fs.existsSync(path.join(h, 'reference'))) fs.cpSync(path.join(h, 'reference'), dir, { recursive: true });
    if (spec.kind === 'nearmiss') {
      if (!fs.existsSync(path.join(h, 'nearmiss'))) throw new Error(`Bài ${task.id} thiếu hidden/nearmiss/ (SR-24)`);
      fs.cpSync(path.join(h, 'nearmiss'), dir, { recursive: true });
    }
    return { dir, status: 'done', wallSec: 0, tokens: zero(), costUsd: 0, turns: 0, finalText: '' };
  }
  if (spec.kind === 'claude') {
    const dir = freshWorkspace(task, key);
    const r = await runClaude({ cwd: dir, prompt: spec.process ? brief + PROCESS_SUFFIX : brief, model: spec.model, timeoutMin: cfg.timeoutMin, bin: cfg.claudeBin });
    return { dir, ...r, leak: leakCheck(r.transcript), transcript: undefined };
  }
  if (spec.kind === 'best-of-n') {
    const cands = [];
    for (let i = 0; i < spec.n; i++) {
      const dir = freshWorkspace(task, `${key}__c${i}`);
      const r = await runClaude({ cwd: dir, prompt: brief, model: spec.model, timeoutMin: cfg.timeoutMin, bin: cfg.claudeBin });
      cands.push({ dir, ...r, leak: leakCheck(r.transcript), transcript: undefined });
    }
    let pick = 0, selector = zero(), selCost = 0, selectorSawSuite = false;
    if (task.grader === 'code') {
      const s = cands.map((c) => visibleTestScore(c.dir)); pick = s.indexOf(Math.max(...s));
    } else {
      // Selector sees only the deliverables (never hidden data).
      const shown = cands.map((c, i) => { const p = path.join(c.dir, task.deliverable); const t = fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p, 'utf8') : c.finalText; return `### Candidate ${i}\n${blind(t).slice(0, 40000)}`; }).join('\n\n');
      const selPrompt = `Brief:\n${task.brief}\n\n${shown}\n\nWhich candidate best satisfies the brief? Reply with only JSON {"best": <index>}.`;
      selectorSawSuite = leakInSelectorPrompt(selPrompt.replace(task.brief, ''), NEEDLES);
      const sel = spawnSync(cfg.claudeBin, ['-p', selPrompt, '--output-format', 'json', '--model', spec.model, '--tools', '', '--no-session-persistence', '--strict-mcp-config'], { cwd: os.tmpdir(), env: claudeEnv(), encoding: 'utf8', timeout: 600000, maxBuffer: 64 << 20 });
      try { const o = JSON.parse(sel.stdout); pick = Number(String(o.result).match(/"best"\s*:\s*(\d+)/)?.[1] ?? 0); const u = o.usage ?? {}; selector = { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 }; selCost = o.total_cost_usd ?? 0; } catch { pick = 0; }
    }
    const tok = [...cands.map((c) => c.tokens), selector].reduce((a, b) => ({ input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite }), zero());
    tok.total = tok.input + tok.output + tok.cacheRead + tok.cacheWrite; tok.weighted = weighted(tok);
    const best = cands[Math.min(pick, cands.length - 1)];
    const selLeak = selectorSawSuite; // SR-21: bước chọn của A2 cũng được kiểm
    return { ...best, tokens: tok, costUsd: cands.reduce((s, c) => s + c.costUsd, selCost), wallSec: cands.reduce((s, c) => s + c.wallSec, 0), turns: cands.reduce((s, c) => s + c.turns, 0), leak: selLeak || cands.some((c) => c.leak), picked: pick };
  }
  if (spec.kind === 'ccoding') {
    const dir = freshWorkspace(task, key);
    const projectId = `vb-${crypto.createHash('sha1').update(key + cfg.workRoot).digest('hex').slice(0, 12)}`;
    const srv = serverOf(spec);
    const r = await runCcoding({ baseUrl: srv.url, dataDir: srv.data, runtime: cfg.runtime, projectId, workdir: dir, brief, title: `[vs-claude ${key}] ${task.title}`.slice(0, 120), taskOptions: spec.options ?? {}, agentId: spec.agentId, variant: `vs-claude/${key}`, timeoutMin: cfg.timeoutMin, isolation: spec.isolation ?? cfg.isolation });
    if (r.infra || !r.taskId) return { dir, ...r, infra: r.infra ?? 'error' }; // chưa tạo được task: lỗi hạ tầng, không chấm
    let leak = false, callsCost; // SR-02: costUsd cộng theo model của từng dòng calls.jsonl
    const callsFile = path.join(srv.data, 'runs', r.taskId, 'calls.jsonl');
    if (fs.existsSync(callsFile)) { const text = fs.readFileSync(callsFile, 'utf8'); leak = leakInCalls(text, NEEDLES); callsCost = costOfCalls(text); }
    return { dir, ...r, leak, callsCost: callsCost ?? costOfCalls('') };
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
    if (!r.infra) { // lỗi hạ tầng: không chấm, không tính là xong
      g = await GRADERS[task.grader]({ workdir: r.dir, hiddenDir: path.join(SUITE, 'tasks', s.task, 'hidden'), suiteRepoDir: taskDirs(SUITE, task).repoDir, finalText: r.finalText, task, judge: cfg.judge });
      snapshot(r.dir, path.join(out, 'artifacts', s.key));
      fs.writeFileSync(path.join(out, 'artifacts', s.key, '_FINAL.txt'), r.finalText ?? '');
    }
  } catch (e) { error = String(e?.stack ?? e).slice(0, 2000); }
  if (r?.infra) {
    const row = { key: s.key, task: s.task, arm: s.arm, rep: s.rep, at: new Date().toISOString(), status: 'infra', infra: r.infra, resetsAt: r.resetsAt, wallSec: r.wallSec,
      failReason: r.infra === 'rate-limit' ? 'quota' : 'error', excluded: null, ...(r.error ? { error: String(r.error).slice(0, 300) } : {}), ...provenance(meta, ARMS[s.arm], r, { quotaState: r.infra === 'rate-limit' ? 'rate-limited' : undefined }) }; // infra luôn chạy lại, nên không ghi excluded
    fs.appendFileSync(runsFile, `${JSON.stringify(row)}\n`);
    if (r.infra === 'rate-limit') {
      console.log(`HẠN MỨC${r.resetsAt ? ` — mở lại lúc ${r.resetsAt}` : ''}`);
      console.error(`\nDừng hàng đợi vì hạn mức tài khoản${r.resetsAt ? `; mở lại lúc ${r.resetsAt} (giờ theo thông báo)` : ''}. Chạy lại đúng lệnh này để chạy tiếp, lượt ${s.key} sẽ được chạy lại.`);
      process.exit(EXIT_RATE_LIMIT);
    }
    console.log('LỖI HẠ TẦNG (lượt sẽ chạy lại khi chạy tiếp)');
    continue;
  }
  const { failReason, excluded } = classifyRun(r, { timeoutMin: cfg.timeoutMin, error });
  const row = {
    key: s.key, task: s.task, category: task.category, size: task.size, arm: s.arm, rep: s.rep, at: new Date().toISOString(),
    status: error ? 'error' : r.status, failReason, excluded, ...provenance(meta, ARMS[s.arm], r, { quotaState: failReason === 'quota' ? 'rate-limited' : undefined }), error, wallSec: r?.wallSec, tokens: r?.tokens, ...(r ? priceRun(ARMS[s.arm], r) : {}), turns: r?.turns,
    calls: r?.calls, agentsUsed: r?.agentsUsed, byPhase: r?.byPhase, ...(r?.research ?? {}), picked: r?.picked, leak: !!r?.leak,
    score: g?.score ?? 0, pass: !!g?.pass, formatMiss: !!g?.formatMiss, details: g?.details,
  };
  fs.appendFileSync(runsFile, `${JSON.stringify(row)}\n`);
  console.log(error ? `ERROR ${error.split('\n')[0]}` : `score ${row.score.toFixed(2)} | ${Math.round(row.wallSec ?? 0)}s | ${row.tokens?.weighted ?? 0} wtok${row.leak ? ' | LEAK' : ''}`);
}
// B-19: chỉ in số đếm leak theo nhánh (lượt leak=true bị loại ở analyze.mjs), không in nội dung.
if (fs.existsSync(runsFile)) {
  const rows = fs.readFileSync(runsFile, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  for (const c of leakCounts(rows)) console.log(`leak ${JSON.stringify(c)}`);
}
console.log(`\nDone. Results: ${runsFile}\nAnalyse: node ${path.relative(process.cwd(), path.join(SUITE, 'analyze.mjs'))} ${out}`);
