#!/usr/bin/env node
// Benchmark: Claude Code thuần (claude -p) vs CCoding trên cùng bộ bài có test ẩn.
// node run.mjs run   --config config.cloud.json --run R1 --tasks t1-duration,t2-orders --systems claude,ccoding --repeats 2 --concurrency 2
// node run.mjs grade --config … --run R1          (chấm lại các lượt đã xong)
// node run.mjs report --config … --run R1 [--run R2 …]
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => {
  const vals = [];
  for (let i = 1; i < args.length; i++) if (args[i] === `--${k}`) vals.push(args[i + 1]);
  return vals.length ? vals[vals.length - 1] : d;
};
const optAll = (k) => {
  const vals = [];
  for (let i = 1; i < args.length; i++) if (args[i] === `--${k}`) vals.push(args[i + 1]);
  return vals;
};

const cfgPath = opt('config', path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'config.json'));
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const BENCH = cfg.benchRoot;
const RESULTS = path.join(BENCH, 'results');
const now = () => new Date().toISOString();
const log = (...a) => console.log(`[${new Date().toLocaleTimeString('vi-VN', { hour12: false })}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sh(command, cmdArgs, o = {}) {
  const r = spawnSync(command, cmdArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true, ...o });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), error: r.error };
}

function git(cwd, ...a) {
  const r = sh('git', a, { cwd });
  if (r.code !== 0) throw new Error(`git ${a.join(' ')}: ${r.out}`);
  return r.out.trim();
}

function copyTree(src, dst, skip = ['.git', 'node_modules', 'test-hidden', '.ccoding']) {
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true, filter: (p) => !skip.includes(path.basename(p)) });
}

function childEnv() {
  const env = { ...process.env };
  for (const k of cfg.dropEnv ?? []) delete env[k];
  if (cfg.scrubKeys)
    for (const k of Object.keys(env))
      if (/(API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|^ANTHROPIC_|^NINEROUTER|^BIFROST_)/i.test(k)) delete env[k];
  return env;
}

// ── chuẩn bị repo xuất phát
function prepareRepo(task, dir) {
  copyTree(path.join(BENCH, 'tasks', task, 'starter'), dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'bench@local');
  git(dir, 'config', 'user.name', 'bench');
  git(dir, 'config', 'core.autocrlf', 'false');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'khởi điểm');
}

// ── hệ 1: Claude Code thuần
async function runClaude(job, repo, prompt, outDir) {
  // hệ 'claude' = Claude Code một mình với cfg.baselineModel; 'claude-<model>' (vd. claude-sonnet) = cùng cách chạy, mô hình <model>
  const model = job.system.startsWith('claude-') ? job.system.slice('claude-'.length) : (cfg.baselineModel ?? 'opus');
  const a = ['-p', '--model', model, '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
    '--permission-mode', 'acceptEdits', '--allowedTools', (cfg.baselineTools ?? ['Bash', 'Read', 'Edit', 'Write', 'Grep', 'Glob', 'TodoWrite', 'Task', 'Agent', 'NotebookEdit']).join(','),
    '--strict-mcp-config', '--setting-sources', 'project,local'];
  const t0 = Date.now();
  const stream = fs.createWriteStream(path.join(outDir, 'claude.jsonl'));
  let result;
  let buf = '';
  const code = await new Promise((resolve) => {
    const p = spawn(cfg.claudeCmd ?? 'claude', a, { cwd: repo, env: childEnv(), windowsHide: true });
    const timer = setTimeout(() => {
      log(`⛔ ${job.key}: claude quá ${cfg.claudeTimeoutMin ?? 45} phút — dừng`);
      p.kill();
    }, (cfg.claudeTimeoutMin ?? 45) * 60_000);
    p.stdout.on('data', (d) => {
      stream.write(d);
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        try {
          const ev = JSON.parse(line);
          if (ev.type === 'result') result = ev;
        } catch {}
      }
    });
    p.stderr.on('data', (d) => fs.appendFileSync(path.join(outDir, 'claude.stderr.txt'), d));
    p.on('close', (c) => {
      clearTimeout(timer);
      resolve(c);
    });
    p.stdin.end(prompt);
  });
  stream.end();
  const u = result?.usage ?? {};
  return {
    exitCode: code,
    status: result && !result.is_error ? 'done' : 'failed',
    wallSec: Math.round((Date.now() - t0) / 1000),
    costUsd: result?.total_cost_usd ?? 0,
    turns: result?.num_turns ?? 0,
    tokens: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 },
    models: Object.keys(result?.modelUsage ?? {}),
    modelUsage: result?.modelUsage,
    finalText: (result?.result ?? '').slice(0, 4000),
    workdir: repo,
  };
}

// ── hệ 2: CCoding
async function api(method, p, body, base = cfg.ccodingUrl) {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : undefined;
}

async function runCcoding(job, repo, prompt, outDir, variantCfg = {}) {
  const { _url: base = cfg.ccodingUrl, ...variantOptions } = variantCfg;
  const call = (m, p, b) => api(m, p, b, base);
  const pid = `b-${job.run}-${job.task.split('-')[0]}-${job.system.replace(/^ccoding-?/, '').slice(0, 6)}-${job.rep}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
  await call('POST', '/api/projects', {
    id: pid,
    name: `bench ${job.key}`,
    department: cfg.ccodingDepartment ?? 'dev',
    workspace: repo,
    classification: 'internal',
    toolAccess: 'exec',
    isolation: 'worktree',
    worktreeCopy: [],
    setupCommands: [],
    checkCommands: ['npm test'],
  });
  const t = await call('POST', '/api/tasks', {
    brief: prompt,
    title: `[bench ${job.run}] ${job.task} #${job.rep}`,
    mode: 'project',
    projectId: pid,
    options: { budgetMode: 'complete', ...(cfg.ccodingOptions ?? {}), ...variantOptions },
  });
  log(`▶ ${job.key}: CCoding ${t.id} (dự án ${pid})`);
  fs.writeFileSync(path.join(outDir, 'ccoding-task-id.txt'), t.id);
  const t0 = Date.now();
  let task;
  for (;;) {
    await sleep(15000);
    task = (await call('GET', `/api/tasks/${t.id}`)).task;
    if (['done', 'failed', 'cancelled'].includes(task.status)) break;
    if (Date.now() - t0 > (cfg.ccodingTimeoutMin ?? 60) * 60_000) {
      log(`⛔ ${job.key}: CCoding quá ${cfg.ccodingTimeoutMin ?? 60} phút — hủy`);
      await call('POST', `/api/tasks/${t.id}/cancel`).catch(() => {});
      await sleep(5000);
      task = (await call('GET', `/api/tasks/${t.id}`)).task;
      break;
    }
  }
  fs.writeFileSync(path.join(outDir, 'ccoding-task.json'), JSON.stringify(task, null, 1));
  const u = task.usage ?? {};
  const t1 = Date.parse(task.finishedAt ?? task.updatedAt);
  const ts = Date.parse(task.startedAt ?? task.createdAt);
  return {
    status: task.status,
    taskId: task.id,
    wallSec: Math.round((t1 - ts) / 1000),
    wallSecHarness: Math.round((Date.now() - t0) / 1000),
    costUsd: u.costUsd ?? 0,
    tokens: { input: u.input ?? 0, output: u.output ?? 0, cacheRead: u.cacheRead ?? 0, cacheWrite: u.cacheWrite ?? 0 },
    attention: task.attention?.reason,
    approved: task.runs?.filter((r) => r.review).every((r) => r.review.approved),
    subtasks: task.runs?.flatMap((r) => r.subtasks ?? []).map((s) => ({ id: s.id, agent: s.agentId, status: s.status, title: s.title })),
    workdir: task.workspace,
    branch: task.branch,
  };
}

// ── chấm điểm
function tapCount(out) {
  let pass = 0;
  let fail = 0;
  const failed = [];
  for (const line of out.split(/\r?\n/)) {
    let m;
    if ((m = /^ok \d+ - (.*)$/.exec(line))) pass++;
    else if ((m = /^not ok \d+ - (.*)$/.exec(line))) {
      fail++;
      failed.push(m[1].replace(/ # .*$/, ''));
    }
  }
  return { pass, fail, total: pass + fail, failed };
}

function grade(job, workdir, outDir) {
  const g = path.join(cfg.workRoot, `grade-${job.run}-${job.key}-${Date.now()}`);
  fs.rmSync(g, { recursive: true, force: true });
  copyTree(workdir, g);
  copyTree(path.join(BENCH, 'tasks', job.task, 'hidden'), path.join(g, 'test-hidden'), []);
  const t0 = Date.now();
  const hidden = sh(process.execPath, ['--test', '--test-reporter=tap', 'test-hidden/**/*.test.js'], { cwd: g, timeout: 20 * 60_000 });
  const hiddenMs = Date.now() - t0;
  const visible = sh(process.execPath, ['--test', '--test-reporter=tap', 'test/**/*.test.js'], { cwd: g, timeout: 10 * 60_000 });
  fs.writeFileSync(path.join(outDir, 'grade-hidden.tap'), hidden.out);
  fs.writeFileSync(path.join(outDir, 'grade-visible.tap'), visible.out);
  const h = tapCount(hidden.out);
  const v = tapCount(visible.out);
  // các tệp đã đổi so với khởi điểm
  const starter = path.join(BENCH, 'tasks', job.task, 'starter');
  const changed = [];
  const walk = (d, rel = '') => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'test-hidden', '.ccoding'].includes(e.name)) continue;
      const r = path.join(rel, e.name);
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else {
        const s = path.join(starter, r);
        const a = fs.readFileSync(path.join(d, e.name));
        if (!fs.existsSync(s)) changed.push(`+${r}`);
        else if (!a.equals(fs.readFileSync(s))) changed.push(`~${r}`);
      }
    }
  };
  walk(g);
  const perf = /# thời gian tốt nhất: (\d+) ms/.exec(hidden.out);
  fs.rmSync(g, { recursive: true, force: true });
  return {
    hidden: { pass: h.pass, fail: h.fail, total: h.total, failed: h.failed.slice(0, 60), ms: hiddenMs, timedOut: hidden.code === null },
    visible: { pass: v.pass, fail: v.fail, total: v.total },
    changed,
    perfMs: perf ? Number(perf[1]) : undefined,
  };
}

// ── kiểm tra truy cập ngoài thư mục làm việc (đề phòng xem test ẩn)
function audit(outDir) {
  const hits = [];
  const pat = /(bench[\\/]+tasks|[\\/]hidden[\\/]|test-hidden|grade-)/i;
  for (const f of ['claude.jsonl']) {
    const p = path.join(outDir, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      if (!line.includes('tool_use')) continue;
      try {
        const ev = JSON.parse(line);
        for (const b of ev.message?.content ?? []) if (b.type === 'tool_use' && pat.test(JSON.stringify(b.input))) hits.push(JSON.stringify(b.input).slice(0, 200));
      } catch {}
    }
  }
  return hits;
}

function totalCost() {
  let sum = 0;
  if (!fs.existsSync(RESULTS)) return 0;
  for (const run of fs.readdirSync(RESULTS)) {
    const d = path.join(RESULTS, run);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const j of fs.readdirSync(d)) {
      const f = path.join(d, j, 'result.json');
      if (fs.existsSync(f)) sum += JSON.parse(fs.readFileSync(f, 'utf8')).run?.costUsd ?? 0;
    }
  }
  return sum;
}

async function runJob(job) {
  const outDir = path.join(RESULTS, job.run, job.key);
  const resFile = path.join(outDir, 'result.json');
  if (fs.existsSync(resFile)) return JSON.parse(fs.readFileSync(resFile, 'utf8'));
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const repo = path.join(cfg.workRoot, `${job.run}-${job.key}-${Math.random().toString(36).slice(2, 8)}`, 'repo');
  prepareRepo(job.task, repo);
  const prompt = fs.readFileSync(path.join(BENCH, 'tasks', job.task, 'prompt.txt'), 'utf8').trim();
  log(`▶ ${job.key} bắt đầu (${repo})`);
  const startedAt = now();
  let run;
  try {
    run = job.system === 'claude' || job.system.startsWith('claude-') ? await runClaude(job, repo, prompt, outDir) : await runCcoding(job, repo, prompt, outDir, (cfg.variants ?? {})[job.system] ?? {});
  } catch (e) {
    run = { status: 'error', error: String(e.message ?? e), costUsd: 0 };
  }
  let g;
  if (run.workdir && fs.existsSync(run.workdir)) g = grade(job, run.workdir, outDir);
  const res = { ...job, env: cfg.env, startedAt, finishedAt: now(), run, grade: g, audit: audit(outDir) };
  fs.writeFileSync(resFile, JSON.stringify(res, null, 1));
  log(`${run.status === 'done' ? '✓' : '✗'} ${job.key}: ${run.status} · ${run.wallSec ?? '?'}s · $${(run.costUsd ?? 0).toFixed(2)} · ẩn ${g ? `${g.hidden.pass}/${g.hidden.total}` : '—'}${g?.perfMs ? ` · ${g.perfMs} ms` : ''} · tổng chi $${totalCost().toFixed(2)}`);
  return res;
}

async function main() {
  if (cmd === 'run') {
    const run = opt('run', 'R1');
    const tasks = opt('tasks', 't1-duration,t2-orders,t3-api,t4-perf').split(',');
    const systems = opt('systems', 'claude,ccoding').split(',');
    const repeats = Number(opt('repeats', '1'));
    const startRep = Number(opt('from-rep', '1'));
    const conc = Number(opt('concurrency', '2'));
    const jobs = [];
    for (let r = startRep; r < startRep + repeats; r++)
      for (const task of tasks)
        for (const system of systems) jobs.push({ run, task, system, rep: r, key: `${task}.${system}.${r}` });
    log(`${jobs.length} lượt, song song ${conc}, trần chi phí $${cfg.maxCostUsd}`);
    let idx = 0;
    const worker = async () => {
      while (idx < jobs.length) {
        const job = jobs[idx++];
        if (totalCost() >= cfg.maxCostUsd) {
          log(`⏹ Chạm trần chi phí $${cfg.maxCostUsd} — bỏ ${job.key}`);
          continue;
        }
        try {
          await runJob(job);
        } catch (e) {
          log(`✗ ${job.key}: ${e.stack ?? e}`);
        }
      }
    };
    await Promise.all(Array.from({ length: conc }, worker));
    log('xong');
  } else if (cmd === 'regrade') {
    const run = opt('run', 'R1');
    for (const j of fs.readdirSync(path.join(RESULTS, run))) {
      const f = path.join(RESULTS, run, j, 'result.json');
      if (!fs.existsSync(f)) continue;
      const res = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (res.run?.workdir && fs.existsSync(res.run.workdir)) {
        res.grade = grade(res, res.run.workdir, path.join(RESULTS, run, j));
        res.audit = audit(path.join(RESULTS, run, j));
        fs.writeFileSync(f, JSON.stringify(res, null, 1));
        log(`chấm lại ${j}: ${res.grade.hidden.pass}/${res.grade.hidden.total}`);
      }
    }
  } else if (cmd === 'cost') {
    console.log(totalCost().toFixed(2));
  } else {
    console.log('lệnh: run | regrade | cost');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
