// Chạy lại bộ test ẩn của t5-logq trên artifact đã commit, N lần, ghi số test đếm được (pass/fail/total). Không gọi LLM.
// Chép nguyên logic `hidden()` của g-mutation.mjs (không import vì g-mutation.mjs cần typescript); chỉ đọc bench/, tạm trong os.tmpdir().
//   node docs/research/analysis/t5logq-probe.mjs <khóa lượt> <N>
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const { tapScore } = await import(pathToFileURL(path.join(ROOT, 'bench', 'vs-claude', 'lib', 'grade.mjs')).href);
export const TASKS = path.join(ROOT, 'bench', 'vs-claude', 'tasks');
const walk = (root, rel = '') => fs.readdirSync(path.join(root, rel), { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name === '.git' ? [] : e.isDirectory() ? walk(root, path.posix.join(rel, e.name)) : [path.posix.join(rel, e.name)]));
function run(cwd, args, ms) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, { cwd, env: { ...process.env, NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; p.stdout.on('data', (b) => { out += b; }); p.stderr.on('data', (b) => { out += b; });
    const t = setTimeout(() => p.kill('SIGKILL'), ms);
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out }); });
  });
}
/** Một lần chạy test ẩn trên bản sao của artifactDir (+ tệp starter còn thiếu). */
export async function hiddenOnce(artifactDir, mutate, taskId = 't5-logq') {
  const TASK = path.join(TASKS, taskId);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'));
  try {
    fs.cpSync(artifactDir, tmp, { recursive: true, filter: (s) => !s.split(path.sep).some((x) => x === '.git' || x === 'node_modules' || x === '_FINAL.txt') });
    for (const rel of walk(path.join(TASK, 'starter'))) { const dst = path.join(tmp, rel); if (!fs.existsSync(dst)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(TASK, 'starter', rel), dst); } }
    if (mutate) mutate(tmp);
    fs.mkdirSync(path.join(tmp, 'hidden'), { recursive: true });
    const files = fs.readdirSync(path.join(TASK, 'hidden'), { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
    for (const f of files) fs.copyFileSync(path.join(TASK, 'hidden', f), path.join(tmp, 'hidden', f));
    const r = await run(tmp, ['--test', '--test-force-exit', '--test-timeout=30000', '--test-reporter=tap', ...files.filter((f) => f.endsWith('.test.js')).map((f) => `hidden/${f}`)], 60000);
    const g = tapScore(r.out);
    return { pass: g.pass, passed: g.details.passed, total: g.details.total, failed: g.details.failed, out: r.out };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [key, n] = process.argv.slice(2);
  for (let i = 0; i < Number(n); i++) { const { out, ...r } = await hiddenOnce(path.join(ROOT, 'bench', 'vs-claude', 'results', 'study-cloud', 'artifacts', key)); console.log(JSON.stringify({ key, i, ...r })); }
}
