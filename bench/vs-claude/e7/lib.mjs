// E7: chuẩn bị mục và chạy ba arm nghiệm thu (R1 CTO Sonnet, R2 CTO Opus, R3 một Claude Code đơn), §9 V4-3f bản chốt.
// R1/R2 đi qua CCoding thật (Orchestrator.resume(..., { from: 'accept' }) → Orchestrator.call()), không gọi runtime trực tiếp.
// Không đưa nhãn (lỗi/đúng), vị trí đột biến hay tên thí nghiệm vào workspace, đề bài, báo cáo hay prompt.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applySite, mutationSites, overlayStarter, productFiles, rng, sample } from '../../../docs/research/analysis/g-mutation.mjs';
import { tapScore } from '../lib/grade.mjs';
import { taskDirs } from '../lib/workspace.mjs';
import { runClaude, weighted } from '../lib/claude.mjs';
import { callErrors } from '../lib/ccoding.mjs';
import { detectRateLimit } from '../lib/infra.mjs';
import { costOf, costOfCalls } from '../lib/pricing.mjs';

export const G_SEED = '20261104';
export const G_PER_RUN = 12;
export const ARMS = {
  R1: { kind: 'cto', model: undefined, label: 'CCoding CTO (model mặc định của CTO, Sonnet)' },
  R2: { kind: 'cto', model: 'opus', label: 'CCoding CTO, pha accept dùng Opus' },
  R3: { kind: 'claude', model: 'sonnet', label: 'Một Claude Code đơn, cùng văn bản bỏ phần vai trò' },
};
/** Thư mục con theo arm: tên trung tính (không lộ arm hay loại mục). */
export const ARM_DIR = { R1: 'w1', R2: 'w2', R3: 'w3' };
/** Bàn giao trung tính, giống nhau cho mọi mục (mục lỗi hay đúng đều nhận đúng chuỗi này). */
export const NEUTRAL = {
  planSummary: 'Một hạng mục: làm theo đề bài, kèm test.',
  subtaskTitle: 'Làm theo đề bài',
  handover: 'Đã làm theo đề bài: sửa mã nguồn và test trong repo; đã chạy `npm test`.',
  assignee: 'senior-swe',
};

const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
// lọc theo đường dẫn TƯƠNG ĐỐI so với gốc chép: thư mục cha tên `.git`/`node_modules` (vd. --work đặt trong một worktree) không làm mất cả cây
const SKIP = new Set(['.git', 'node_modules', '_FINAL.txt']);
export const copyTree = (src, dst) => fs.cpSync(src, dst, { recursive: true, filter: (s) => !path.relative(src, s).split(path.sep).some((x) => SKIP.has(x)) });
const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const realPath = (p) => { try { return fs.realpathSync.native(p).toLowerCase(); } catch { return path.resolve(p).toLowerCase(); } };
/** Thư mục làm việc phải là gốc của một repo git riêng (không phải thư mục con của repo khác): git của harness và của CCoding chỉ chạm repo tạm. */
export function assertOwnRepo(dir) {
  const top = git(dir, 'rev-parse', '--show-toplevel');
  if (top.status !== 0 || realPath(top.stdout.trim()) !== realPath(dir)) throw new Error(`${dir} không phải gốc repo git riêng của mục — dừng để không làm bẩn repo khác`);
}
const ID = ['-c', 'user.name=bench', '-c', 'user.email=bench@local'];

/** Nạp các hàm thật của CCoding từ `dist/` của một bản checkout (bản ghim của đợt đo). */
export async function loadCcoding(root) {
  const u = (p) => {
    const f = path.join(root, 'dist', p);
    if (!fs.existsSync(f)) throw new Error(`thiếu ${f} — chạy \`npm run build\` ở ${root}`);
    return import(pathToFileURL(f).href);
  };
  const [app, ws, gitm, prompts, planner, common, orch, red, conf] = await Promise.all([u('app.js'), u('tools/workspace.js'), u('git.js'), u('prompts.js'), u('planner.js'), u('runtimes/common.js'), u('orchestrator.js'), u('util/redact.js'), u('config.js')]);
  return { root, createApp: app.createApp, loadConfig: conf.loadConfig, runCheckCommand: ws.runCheckCommand, toolsFor: ws.toolsFor, changeSummary: gitm.changeSummary, acceptPrompt: prompts.acceptPrompt, templateReport: prompts.templateReport, parseAcceptance: planner.parseAcceptance, userPrompt: common.userPrompt, cliTools: orch.cliTools, redact: red.redact };
}

/**
 * `npm test` của mục bằng đúng hàm CCoding dùng (runCheckCommand). Bỏ NODE_TEST_CONTEXT trong lúc chạy: khi harness tự chạy dưới
 * `node --test` (bộ test của bench), node con thấy biến này sẽ bỏ qua tệp test và trả exit 0. Lúc đo thật biến này không có.
 */
async function check(cc, cwd, opts) {
  const v = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try { return await cc.runCheckCommand('npm test', cwd, opts); } finally { if (v !== undefined) process.env.NODE_TEST_CONTEXT = v; }
}

/** Tìm lại vị trí đột biến của G: cùng tệp, cùng thứ tự vị trí, cùng mẫu `sample(sites, 12, rng(seed|key))`, phần tử thứ `site.i`. */
export function locateSite(work, deliverable, key, site, { seed = G_SEED, perRun = G_PER_RUN } = {}) {
  const sites = [];
  for (const f of productFiles(work, deliverable)) {
    const text = fs.readFileSync(path.join(work, f), 'utf8');
    try { for (const s of mutationSites(text, f)) sites.push({ ...s, file: f }); } catch { /* như G: tệp không phân tích được thì bỏ */ }
  }
  const s = sample(sites, perRun, rng(`${seed}|${key}`))[site.i];
  return s && s.file === site.file && s.line === site.line && s.op === site.op && s.repl === site.repl ? s : null;
}

/** Test ẩn trong bản sao riêng (đa nền tảng, không cần shell). Dùng để kiểm lại nhãn trên máy chạy. */
export function hiddenPass(dir, hiddenDir, { fileTimeoutMs = 30_000, timeoutMs = 120_000 } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e7-hid-'));
  try {
    copyTree(dir, tmp);
    fs.mkdirSync(path.join(tmp, 'hidden'), { recursive: true });
    const files = fs.readdirSync(hiddenDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
    for (const f of files) fs.copyFileSync(path.join(hiddenDir, f), path.join(tmp, 'hidden', f));
    const tests = files.filter((f) => f.endsWith('.test.js')).map((f) => `hidden/${f}`);
    const r = spawnSync(process.execPath, ['--test', '--test-force-exit', `--test-timeout=${fileTimeoutMs}`, '--test-reporter=tap', ...tests], { cwd: tmp, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 << 20, env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
    const g = tapScore(`${r.stdout ?? ''}\n${r.stderr ?? ''}`);
    return { pass: !r.error && g.pass, total: g.details.total, timedOut: !!r.error };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/**
 * Chuẩn bị một mục: sản phẩm (artifact + tệp starter thiếu, như sai lệch G-b) và, với mục lỗi, đúng đột biến của G.
 * Kiểm lại trên máy chạy: `npm test` phải xanh; test ẩn phải trượt (lỗi) hoặc đạt hết (đúng). Không đạt → { ok: false, reason }.
 * Mỗi arm một repo git riêng: commit "base" = starter, cây làm việc = sản phẩm (chưa commit).
 */
export async function prepareItem(item, { suite, artifacts, workRoot, cc, arms = Object.keys(ARM_DIR), checkTimeoutSec = 600 }) {
  const task = JSON.parse(fs.readFileSync(path.join(suite, 'tasks', item.task, 'task.json'), 'utf8'));
  const { repoDir: starterDir, hiddenDir } = taskDirs(suite, task);
  const artifactDir = path.join(artifacts, item.key);
  if (!fs.existsSync(artifactDir)) return { ok: false, reason: 'missing-artifact' };
  const prod = fs.mkdtempSync(path.join(os.tmpdir(), 'e7-prod-'));
  try {
    copyTree(artifactDir, prod);
    let siteMode = null;
    if (item.kind === 'faulty') {
      // G tính vị trí trên artifact (lượt chạy lại theo G-b: thêm tệp starter); thử cả hai, ghi cách khớp
      for (const mode of ['artifact', 'overlay']) {
        const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'e7-probe-'));
        try {
          copyTree(artifactDir, probe);
          if (mode === 'overlay') overlayStarter(probe, starterDir);
          const s = locateSite(probe, task.deliverable, item.key, item.site);
          if (s) { siteMode = { mode, site: s }; break; }
        } finally { fs.rmSync(probe, { recursive: true, force: true }); }
      }
      if (!siteMode) return { ok: false, reason: 'site-not-found' };
    }
    const overlaid = overlayStarter(prod, starterDir);
    if (siteMode) {
      const fp = path.join(prod, siteMode.site.file);
      const before = fs.readFileSync(fp, 'utf8'), after = applySite(before, siteMode.site);
      if (after === before) return { ok: false, reason: 'site-not-found' };
      fs.writeFileSync(fp, after);
    }
    const opts = { denyCommands: [], timeoutSec: checkTimeoutSec, maxChars: 12000 };
    const latest = [await check(cc, prod, opts)];
    if (!latest[0].ok) return { ok: false, reason: 'prep-red' };
    // nhãn của G: lỗi = test ẩn trượt ít nhất một lần; đúng = đạt hết. Kiểm lại trên máy chạy: lỗi thử tối đa 3 lần (bộ test ẩn
    // của t5-logq cho số test khác nhau giữa các lần chạy), đúng chạy 1 lần như G.
    let h;
    // Quá hạn tính là trượt, như G.
    for (let k = 0; k < (item.kind === 'faulty' ? 3 : 1); k++) { h = hiddenPass(prod, hiddenDir); if (!h.pass) break; }
    if (item.kind === 'faulty' ? h.pass : !h.pass) return { ok: false, reason: 'label-mismatch' };
    const dirs = {};
    let base, baseline, changes;
    for (const arm of arms) {
      const dir = path.join(workRoot, item.id, ARM_DIR[arm]);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(starterDir)) fs.cpSync(starterDir, dir, { recursive: true });
      git(dir, 'init', '-q');
      // Windows: autocrlf của máy làm git in `warning: LF will be replaced by CRLF` lệch giữa các lần gọi (changeSummary của harness và của CCoding) → văn bản R1 ≠ R3
      git(dir, 'config', 'core.autocrlf', 'false'); git(dir, 'config', 'core.safecrlf', 'false');
      assertOwnRepo(dir);
      git(dir, 'add', '-A');
      git(dir, ...ID, 'commit', '-qm', 'base', '--allow-empty');
      const b = git(dir, 'rev-parse', 'HEAD').stdout.trim();
      // baseline: `npm test` trên starter, như CCoding chạy trước khi sửa (một lần mỗi mục, dùng chung cho mọi arm)
      baseline ??= [await check(cc, dir, opts)];
      for (const e of fs.readdirSync(dir)) if (e !== '.git') fs.rmSync(path.join(dir, e), { recursive: true, force: true });
      copyTree(prod, dir);
      base ??= b;
      changes ??= cc.changeSummary(dir, b);
      dirs[arm] = { dir, base: b };
    }
    return {
      ok: true, id: item.id, task: item.task, dirs, base, baseline, latest, changes, overlaid,
      siteMode: siteMode?.mode ?? null, hidden: { pass: h.pass, total: h.total },
      title: task.title, brief: briefFor(task),
    };
  } finally { fs.rmSync(prod, { recursive: true, force: true }); }
}

/** Đúng đề bài harness bench đưa cho mọi arm (`bench/vs-claude/run.mjs` briefFor). */
export function briefFor(task) {
  return `${task.brief}\n\nYou are working in the current directory, a git repository. Put deliverables exactly where the brief says. Work only inside this directory.`;
}

const emptyUsage = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, calls: 0, estimatedCalls: 0 });
const slim = (rs) => rs.map((r) => ({ ...r, tail: '' }));
const gateSummary = 'Cổng chất lượng: lệnh kiểm tra đều xanh, mẫu đầu ra đạt, diff không chạm vùng bảo mật — không thuộc diện bắt buộc review.';
const gateChecks = (latest) => latest.map((r) => ({ command: r.command, exitCode: r.code ?? undefined, ok: r.ok, note: `CCoding tự chạy${r.summary ? ` — ${r.summary.slice(0, 120)}` : ''}` }));

/** Phòng Phát triển "đã xong" như vận hành thật ở làn nhanh khi cổng B-02 xanh (reviewer được bỏ qua, báo cáo dựng từ mẫu). */
export function syntheticRun(cc, { task, dept, latest, changes, at }) {
  const st = { id: 'S1', title: NEUTRAL.subtaskTitle, description: NEUTRAL.subtaskTitle, assignee: NEUTRAL.assignee, dependsOn: [], status: 'done', attempts: 1, usage: emptyUsage(), startedAt: at, finishedAt: at };
  const review = { approved: true, summary: gateSummary, issues: [], checks: gateChecks(latest), verified: true };
  const run = { department: dept.id, status: 'done', stage: 'done', planSummary: NEUTRAL.planSummary, subtasks: [st], usage: emptyUsage(), review, finalPath: `${dept.id}-FINAL.md`, startedAt: at, finishedAt: at };
  // như runDepartment: reviewText rồi templateReport (fastLane.finalReport = 'template')
  const reviewText = `Đã duyệt: ${review.summary}\nLệnh kiểm tra reviewer đã chạy: ${review.checks.map((c) => `${c.command}${c.ok === false ? ' (lỗi)' : c.ok ? ' (đạt)' : ''}`).join('; ')}`;
  const report = cc.templateReport(task, dept, run, [{ st, text: NEUTRAL.handover }], reviewText, changes);
  return { run, report };
}

/** Văn bản R3: đúng bối cảnh + công việc của lượt accept, bỏ phần "VAI TRÒ CỦA BẠN" (hồ sơ CTO). */
export function r3Prompt(cc, { config, cto, deptName, prep }) {
  const task = { title: prep.title, brief: prep.brief, mode: 'project', classification: 'internal', projectChecks: { baseline: prep.baseline, latest: prep.latest, latestAfter: 'execute' } };
  const tools = cc.toolsFor(cto.tools, 'exec', 'accept', config.tools.web !== false, config.tools.gitRead !== false);
  const { report } = syntheticRun(cc, { task, dept: { id: 'dev', name: deptName }, latest: prep.latest, changes: prep.changes, at: '' });
  const items = [{ department: deptName, final: report, review: `Đã duyệt — ${gateSummary}` }];
  const built = cc.acceptPrompt(task, items, { changes: prep.changes, tools, projectName: projectNameOf(prep) });
  const out = (s) => cc.redact(s, { secrets: config.dataProtection.redactSecrets, pii: false });
  return cc.userPrompt({ context: out(built.context), prompt: out(built.prompt) });
}
/** Tên dự án như harness bench (`bench vb-<băm>`), băm từ mã mục: không mang thông tin về loại mục. */
export const projectNameOf = (prep) => `bench vb-${sha(`${prep.id}|e7`).slice(0, 12)}`;

/** Bộ công cụ R3 tương ứng `cliTools` của CTO ở pha accept: đọc tệp + git chỉ đọc (hook claude-guard của CCoding ↔ luật quyền của Claude Code). */
export function r3Tools(cc, cto, { gitRead = true } = {}) {
  const list = cc.cliTools(cto.tools, 'exec', 'accept', gitRead);
  const allowed = list.flatMap((t) => (t === 'Bash' ? ['Bash(git log:*)', 'Bash(git show:*)', 'Bash(git diff:*)', 'Bash(git status:*)', 'Bash(git blame:*)'] : [t]));
  return { tools: list.join(','), allowedTools: allowed.join(',') };
}

/** Kết luận theo đúng luật của CCoding: chỉ khối JSON đọc được với accepted=false mới chặn; không đọc được thì không chặn. */
export function verdictOf(parsed, accepted) {
  return !parsed ? 'unparsed' : accepted ? 'pass' : 'block';
}

/** R1/R2: một nhiệm vụ CCoding "đã xong thực thi", chạy lại đúng bước CTO nghiệm thu. */
export async function runCto(app, cc, prep, arm, { runtime = 'claude-cli', capture, waitTimeoutMs = 90 * 60_000 } = {}) {
  const { store, orchestrator, registry } = app;
  const { dir, base } = prep.dirs[arm];
  const now = new Date().toISOString();
  const projectId = `e7-${prep.id}-${ARM_DIR[arm]}`;
  store.saveProject({ id: projectId, name: projectNameOf(prep), workspace: dir, department: 'auto', classification: 'internal', runtime, toolAccess: 'exec', isolation: 'worktree', budgetMode: 'complete', planApproval: false, checkCommands: ['npm test'], createdAt: now });
  const model = ARMS[arm].model;
  const created = orchestrator.submit({ brief: prep.brief, title: prep.title, mode: 'project', projectId, backlog: true, options: { budgetMode: 'complete', planApproval: false, ...(model ? { phaseModels: { accept: model } } : {}) } });
  const task = store.get(created.id);
  const branch = `ccoding/${task.id.toLowerCase()}`;
  assertOwnRepo(dir);
  git(dir, 'checkout', '-q', '-b', branch);
  const dept = registry.department('dev');
  const { run, report } = syntheticRun(cc, { task, dept, latest: prep.latest, changes: prep.changes, at: now });
  fs.mkdirSync(store.runDir(task.id), { recursive: true });
  fs.writeFileSync(path.join(store.runDir(task.id), run.finalPath), report);
  Object.assign(task, {
    status: 'done', pause: undefined, phase: undefined, lane: 'fast', departments: ['dev'],
    routing: { departments: ['dev'], reason: 'Dự án gắn phòng Phát triển.', by: 'keywords' },
    workspace: dir, branch, baseRef: base, runs: [run], startedAt: now, finishedAt: now,
    projectChecks: { baseline: prep.baseline, baselineAt: now, latest: prep.latest, latestAt: now, latestAfter: 'execute', setupDone: true, depts: { dev: { before: slim(prep.baseline), latest: slim(prep.latest), at: now } } },
  });
  store.put(task, true);
  const t0 = Date.now();
  orchestrator.resume(task.id, { from: 'accept' });
  // waitFor không có hạn: runtime treo thì treo cả đợt → đặt hạn; quá hạn thì hủy (abort runtime) và ghi hạ tầng
  let timer, timedOut = false;
  const t = await Promise.race([orchestrator.waitFor(task.id), new Promise((res) => { timer = setTimeout(() => { timedOut = true; orchestrator.cancel(task.id); res(store.get(task.id)); }, waitTimeoutMs); })]);
  clearTimeout(timer);
  const wallSec = (Date.now() - t0) / 1000;
  const callsText = fs.existsSync(store.callsFile(task.id)) ? fs.readFileSync(store.callsFile(task.id), 'utf8') : '';
  const calls = callsText.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const c of calls) { tokens.input += c.input ?? 0; tokens.output += c.output ?? 0; tokens.cacheRead += c.cacheRead ?? 0; tokens.cacheWrite += c.cacheWrite ?? 0; }
  tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite; tokens.weighted = weighted(tokens);
  const acc = t.acceptance;
  const errText = [acc?.error, t.pause?.detail, t.error, callErrors(callsText).slice(-5)];
  const rl = detectRateLimit(errText);
  const infra = timedOut ? 'error' : t.status === 'paused' ? (rl.rateLimited || t.pause?.reason === 'quota' ? 'rate-limit' : 'error') : rl.rateLimited ? 'rate-limit' : acc?.error || !acc ? 'error' : undefined;
  const pausedDetail = t.pause?.detail; // cancel() xóa `pause` → giữ lại trước khi hủy để dòng infra còn lý do
  if (t.status === 'paused') orchestrator.cancel(task.id);
  const text = acc?.path ? store.readRunFile(task.id, acc.path) ?? '' : '';
  const cap = capture?.get(task.id);
  return {
    taskId: task.id, status: infra ? 'infra' : 'done', infra, ...(rl.resetsAt ? { resetsAt: rl.resetsAt } : {}), error: infra ? String(timedOut ? `quá hạn chờ ${Math.round(waitTimeoutMs / 1000)}s` : (acc?.error ?? pausedDetail ?? t.error ?? '')).slice(0, 300) : undefined,
    verdict: infra ? null : verdictOf(acc.parsed, acc.accepted), accepted: acc?.accepted ?? null, parsed: acc?.parsed ?? null, acceptMode: acc?.mode ?? null,
    criteria: acc?.criteria?.length ?? 0, fails: acc?.criteria?.filter((c) => c.result === 'fail').length ?? 0, unknowns: acc?.criteria?.filter((c) => c.result === 'unknown').length ?? 0,
    tokens, calls: calls.length, turns: calls.reduce((n, c) => n + (c.turns ?? 0), 0), models: [...new Set(calls.map((c) => c.model).filter(Boolean))], ...costOfCalls(callsText),
    wallSec, durationMs: calls.reduce((n, c) => n + (c.durationMs ?? 0), 0),
    promptSha: cap ? sha(cc.userPrompt(cap)) : null, tools: cap?.tools ?? null, maxTurns: cap?.maxTurns ?? null, text,
  };
}

/** R3: `claude -p` đơn trong repo của mục, cùng văn bản (bỏ hồ sơ CTO), cùng bộ công cụ chỉ đọc và cùng trần lượt. */
export async function runSingle(cc, prep, { config, cto, deptName, bin = 'claude', binArgs = [], timeoutMin = 20, maxTurns }) {
  const { dir } = prep.dirs.R3;
  // trạng thái git như R1 sau finishWorkspace: sản phẩm đã commit trên nhánh nhiệm vụ
  git(dir, 'checkout', '-q', '-b', 'ccoding/task');
  git(dir, 'add', '-A');
  git(dir, ...ID, 'commit', '-qm', `CCoding: ${prep.title}`.slice(0, 200));
  const prompt = r3Prompt(cc, { config, cto, deptName, prep });
  const { tools, allowedTools } = r3Tools(cc, cto, { gitRead: config.tools.gitRead !== false });
  const r = await runClaude({ cwd: dir, prompt, model: ARMS.R3.model, timeoutMin, bin, binArgs, tools, allowedTools, permissionMode: 'default', maxTurns, stdin: true });
  const p = r.status === 'done' ? cc.parseAcceptance(r.finalText) : { parsed: false, accepted: false, criteria: [] };
  const infra = r.infra ?? (r.status !== 'done' ? 'error' : undefined);
  const usd = r.model ? costOf(r.tokens, r.model) : null;
  return {
    status: infra ? 'infra' : 'done', infra, ...(r.resetsAt ? { resetsAt: r.resetsAt } : {}), error: infra ? String(r.stderr ?? '').slice(-300) : undefined,
    verdict: infra ? null : verdictOf(p.parsed, p.accepted), accepted: infra ? null : p.accepted, parsed: infra ? null : p.parsed,
    criteria: p.criteria?.length ?? 0, fails: p.criteria?.filter((c) => c.result === 'fail').length ?? 0, unknowns: p.criteria?.filter((c) => c.result === 'unknown').length ?? 0,
    tokens: r.tokens, calls: 1, turns: r.turns, models: r.model ? [r.model] : [], costUsd: usd, costBasis: usd === null ? 'unknown-model' : undefined, costUsdReported: r.costUsd,
    wallSec: r.wallSec, timedOut: r.timedOut, promptSha: sha(prompt), tools, maxTurns: maxTurns ?? null, text: r.finalText,
  };
}
