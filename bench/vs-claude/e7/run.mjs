#!/usr/bin/env node
// E7 runner: CTO nghiệm thu trên lỗi lọt cổng (§9 V4-3f, bản chốt). Chạy lại được: dòng `done` bỏ qua, `infra` chạy lại.
//   node bench/vs-claude/e7/run.mjs --items bench/vs-claude/results/e7-cto/items.json --out bench/vs-claude/results/e7-cto \
//        [--arms R1,R2,R3] [--root <bản checkout CCoding đã build>] [--work <thư mục tạm>] [--ccoding-data <thư mục data của app>]
//        [--config <tệp cấu hình thêm>] [--claude-bin claude] [--timeout 20] [--limit N] [--only id1,id2] [--prepare-only] [--smoke <mã mục dự phòng>]
//        [--arm-config R1=<tệp>,R2=<tệp>[,R3=<tệp>]] [--selected <danh sách chốt .json>]
// --arm-config (D24): mỗi arm một tệp cấu hình thêm, mỗi arm CCoding một app riêng (cùng một tiến trình, giữ xen kẽ bảng Latin); không dùng chung với --config.
// --selected (D24): dùng danh sách chốt có sẵn, không chạy bước 1, không tạo/sửa selected.json hay prep.jsonl trong --out.
// Bước 1 (một lần, trước mọi lượt gọi LLM): chuẩn bị và kiểm lại mọi mục, thay mục hỏng bằng dự phòng cùng bài và cùng loại
//   theo thứ tự đã lấy mẫu → selected.json (danh sách chốt) + prep.jsonl. Bước 2: chạy arm theo lịch xáo cố định.
// Không in kết luận của arm khi đang chạy (chỉ đếm), không ghi nhãn vào runs.jsonl.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rng, sample } from '../../../docs/research/analysis/g-mutation.mjs';
import { EXIT_RATE_LIMIT, cliVersion, gitCommit, latinOrders } from '../lib/queue.mjs';
import { ARMS, ARM_DIR, loadCcoding, prepareItem, runCto, runSingle } from './lib.mjs';

const SUITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const has = (k) => argv.includes(`--${k}`);

const out = path.resolve(flag('out', path.join(SUITE, 'results', 'e7-cto')));
const itemsFile = path.resolve(flag('items', path.join(out, 'items.json')));
const root = path.resolve(flag('root', path.join(SUITE, '..', '..')));
const work = path.resolve(flag('work', path.join(os.tmpdir(), `ccvb-${crypto.randomBytes(3).toString('hex')}`)));
const ccData = path.resolve(flag('ccoding-data', path.join(work, 'ccoding-data')));
const armIds = flag('arms', 'R1,R2,R3').split(',');
for (const a of armIds) if (!ARMS[a]) throw new Error(`arm không có: ${a} (có: ${Object.keys(ARMS).join(', ')})`);
const timeoutMin = Number(flag('timeout', '20'));
const claudeBin = flag('claude-bin', 'claude');
const runtime = flag('runtime', 'claude-cli');
const limit = Number(flag('limit', '0')) || Infinity;
const only = flag('only', '') ? new Set(flag('only', '').split(',')) : null;
const die = (m) => { console.error(`Lỗi: ${m}`); process.exit(2); };
const doc = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
// Thư mục bài: --tasks-dir hoặc VSC_TASKS_DIR; mặc định <suite>/tasks.
const tasksDir = path.resolve(flag('tasks-dir', process.env.VSC_TASKS_DIR || path.join(SUITE, 'tasks')));
const byId = new Map([...doc.items, ...Object.values(doc.reserve ?? {}).flatMap((r) => [...r.faulty, ...r.clean])].map((x) => [x.id, x]));
const fileSha = (f) => (f && fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : null);

// ───────────── kiểm cờ (trước mọi thư mục, prep, app và lượt gọi LLM) ─────────────
/** arm → đường dẫn tuyệt đối của tệp cấu hình thêm */
const armConfig = {};
const useArmConfig = has('arm-config');
if (useArmConfig) {
  if (flag('config')) die('--arm-config không dùng chung với --config (chọn một trong hai).');
  const raw = flag('arm-config', '');
  if (!raw || raw.startsWith('--')) die('--arm-config cần dạng R1=<tệp>,R2=<tệp>[,R3=<tệp>].');
  for (const part of raw.split(',')) {
    const i = part.indexOf('=');
    const a = i < 0 ? part : part.slice(0, i), f = i < 0 ? '' : part.slice(i + 1);
    if (!ARMS[a]) die(`--arm-config: arm không có: "${a}" (có: ${Object.keys(ARMS).join(', ')}).`);
    if (!f) die(`--arm-config: arm ${a} thiếu đường dẫn tệp.`);
    if (a in armConfig) die(`--arm-config: arm ${a} bị trùng.`);
    armConfig[a] = path.resolve(f);
  }
  for (const a of armIds) if (!armConfig[a]) die(`--arm-config: arm ${a} (có trong --arms) chưa có tệp cấu hình.`);
  for (const a of Object.keys(armConfig)) if (!fs.existsSync(armConfig[a]) || !fs.statSync(armConfig[a]).isFile()) die(`--arm-config: tệp của arm ${a} không tồn tại: ${armConfig[a]}`);
  for (const a of Object.keys(armConfig)) { try { JSON.parse(fs.readFileSync(armConfig[a], 'utf8')); } catch (e) { die(`--arm-config: tệp của arm ${a} không phải JSON hợp lệ (${e.message}).`); } }
} else if (flag('config')) process.env.CCODING_CONFIG = path.resolve(flag('config'));
const armCfgSha = Object.fromEntries(Object.entries(armConfig).map(([a, f]) => [a, fileSha(f)]));

// --selected: danh sách chốt có sẵn (không chạy bước 1)
const selectedFile = has('selected') ? path.resolve(flag('selected', '')) : null;
let selectedDoc = null;
if (has('selected')) {
  if (!flag('selected') || flag('selected').startsWith('--')) die('--selected cần đường dẫn tệp danh sách chốt.');
  if (!fs.existsSync(selectedFile)) die(`--selected: tệp không tồn tại: ${selectedFile}`);
  try { selectedDoc = JSON.parse(fs.readFileSync(selectedFile, 'utf8')); } catch (e) { die(`--selected: tệp không phải JSON hợp lệ (${e.message}).`); }
  if (!Array.isArray(selectedDoc?.items) || !selectedDoc.items.length) die('--selected: tệp phải có mảng "items" không rỗng.');
  const missing = selectedDoc.items.filter((id) => !byId.has(id));
  if (missing.length) die(`--selected: ${missing.length} mã mục không có trong bộ mục (${itemsFile}): ${missing.slice(0, 5).join(', ')}`);
  const noTask = [...new Set(selectedDoc.items.map((id) => byId.get(id).task))].filter((t) => !fs.existsSync(path.join(tasksDir, t, 'task.json')));
  if (noTask.length) die(`--selected: bài không có trong thư mục bài ${tasksDir}: ${noTask.join(', ')}`);
}
const artifacts = path.resolve(flag('artifacts', path.join(SUITE, 'results', 'study-cloud', 'artifacts')));
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(work, { recursive: true });
const cc = await loadCcoding(root);
const jl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
const append = (f, row) => fs.appendFileSync(f, `${JSON.stringify(row)}\n`);
/** Repo công khai: bỏ đường dẫn máy chạy (thư mục tạm, bản checkout, thư mục người dùng) khỏi văn bản lưu lại. */
const scrub = (t) => [[work, '<work>'], [root, '<ccoding>'], [os.homedir(), '<home>']].reduce((s, [a, b]) => s.split(a).join(b).split(a.replace(/\\/g, '/')).join(b), String(t));
// cấu hình của app trong tiến trình (R1/R2): phải giống server bench (chỉ claude-cli, chặn web) — ghi sha256 để đối chiếu
const meta = { ccodingCommit: gitCommit(root), claudeCliVersion: cliVersion(claudeBin), node: process.version, platform: process.platform, localConfigSha256: fileSha(path.join(root, 'ccoding.local.json')), extraConfigSha256: useArmConfig ? null : fileSha(process.env.CCODING_CONFIG) };

// ───────────── bước 1: chốt danh sách mục ─────────────
const selFile = path.join(out, 'selected.json');
const prepFile = path.join(out, 'prep.jsonl');
// chạy thử (§9 E7 (7)): một mục dự phòng KHÔNG thuộc danh sách chốt, vào thư mục riêng; không vào phân tích
const smoke = flag('smoke', null);
if (smoke && path.resolve(out) === path.resolve(SUITE, 'results', 'e7-cto')) throw new Error('--smoke phải ghi vào thư mục khác results/e7-cto');
if (!smoke && !selectedDoc && !fs.existsSync(selFile)) {
  const selected = [], skipped = [];
  const queue = new Map(); // task|kind → dự phòng còn lại
  for (const [task, r] of Object.entries(doc.reserve)) for (const kind of ['faulty', 'clean']) queue.set(`${task}|${kind}`, r[kind].slice());
  // lỗi trước, rồi đúng: số mục đúng mỗi bài = số mục lỗi chốt được của bài đó (ghép theo bài)
  const nFaulty = {};
  for (const item of [...doc.items.filter((x) => x.kind === 'faulty'), ...doc.items.filter((x) => x.kind === 'clean')]) {
    if (item.kind === 'clean' && selected.filter((x) => x.kind === 'clean' && x.task === item.task).length >= (nFaulty[item.task] ?? 0)) { skipped.push({ id: item.id, task: item.task, kind: item.kind, reason: 'match-trim' }); continue; }
    let cand = item;
    while (cand) {
      const p = await prepareItem(cand, { suite: SUITE, artifacts, workRoot: path.join(work, 'prep'), cc, arms: ['R1'], tasksDir });
      append(prepFile, { at: new Date().toISOString(), id: cand.id, task: cand.task, ok: p.ok, reason: p.reason ?? null, siteMode: p.siteMode ?? null, overlaid: p.overlaid ?? null, baseline: p.baseline ? { ok: p.baseline[0].ok, code: p.baseline[0].code } : null, changesSha: p.changes ? crypto.createHash('sha256').update(p.changes).digest('hex') : null, ...meta });
      if (p.ok) { selected.push(cand); if (cand.kind === 'faulty') nFaulty[cand.task] = (nFaulty[cand.task] ?? 0) + 1; break; }
      skipped.push({ id: cand.id, task: cand.task, kind: cand.kind, reason: p.reason });
      cand = queue.get(`${cand.task}|${cand.kind}`).shift();
    }
  }
  fs.rmSync(path.join(work, 'prep'), { recursive: true, force: true });
  fs.writeFileSync(selFile, JSON.stringify({ at: new Date().toISOString(), itemsSha256: crypto.createHash('sha256').update(fs.readFileSync(itemsFile)).digest('hex'), ...meta, n: selected.length, skipped, items: selected.map((x) => x.id) }, null, 1) + '\n');
  console.log(`chốt ${selected.length} mục (${skipped.length} mục thay) → ${selFile}`);
}
if (has('prepare-only')) process.exit(0);

// ───────────── bước 2: chạy ─────────────
const sel = smoke ? { items: [smoke] } : selectedDoc ?? JSON.parse(fs.readFileSync(selFile, 'utf8'));
const order = sample(sel.items, sel.items.length, rng(`${doc.seed}|e7|order`));
const orders = latinOrders(armIds.length);
const runsFile = path.join(out, 'runs.jsonl');
// cặp đã xong = dòng CUỐI của cặp là `done` (13/11/2026: dòng infra phân loại lại ghi sau dòng done → chạy lại cặp đó)
const lastOf = new Map(jl(runsFile).map((r) => [`${r.id}__${r.arm}`, r]));
const done = new Set([...lastOf].filter(([, r]) => r.status === 'done').map(([k]) => k));
fs.writeFileSync(path.join(out, `config-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify({ argv: argv.map(scrub), out: scrub(out), root: scrub(root), armIds, timeoutMin, runtime, ...meta, ...(useArmConfig ? { armConfigSha256: armCfgSha } : {}), ...(selectedDoc ? { selectedSha256: fileSha(selectedFile) } : {}), startedAt: new Date().toISOString() }, null, 1));

const apps = new Map();
const capture = new Map();
/** App của arm: có --arm-config → một app riêng mỗi arm (cấu hình riêng, data `<ccoding-data>/<w1|w2|w3>`); không thì một app dùng chung như trước. */
const appFor = (arm) => {
  const key = useArmConfig ? arm : '*';
  if (apps.has(key)) return apps.get(key);
  const configFile = useArmConfig ? armConfig[arm] : undefined;
  const base = cc.loadConfig({ root, configFile });
  const dataDir = useArmConfig ? path.join(ccData, ARM_DIR[arm]) : ccData;
  const app = cc.createApp({ dataDir, workspacesDir: path.join(dataDir, 'workspaces'), runner: 'process', herdr: { ...base.herdr, notify: false, agentPanes: false } }, { root, ...(configFile ? { configFile } : {}) });
  // chỉ ghi lại văn bản lượt accept để đối chiếu với R3 (promptSha); lượt gọi vẫn đi qua Orchestrator.call() như thường
  const rt = app.runtimes.get(runtime);
  const orig = rt.run.bind(rt);
  rt.run = async (req, hooks) => { if (req.phase === 'accept') capture.set(req.meta?.taskId, { context: req.context, prompt: req.prompt, tools: req.tools, maxTurns: req.toolPolicy?.maxTurns ?? null }); return orig(req, hooks); };
  apps.set(key, app);
  return app;
};

let n = 0, k = 0;
for (const [idx, id] of order.entries()) {
  if (only && !only.has(id)) continue;
  const todo = orders[idx % orders.length].map((x) => armIds[x]).filter((a) => !done.has(`${id}__${a}`));
  if (!todo.length) continue;
  if (k++ >= limit) break;
  const item = byId.get(id);
  const prep = await prepareItem(item, { suite: SUITE, artifacts, workRoot: path.join(work, 'items'), cc, arms: todo, tasksDir });
  if (!prep.ok) { append(runsFile, { id, arm: todo.join('+'), at: new Date().toISOString(), status: 'infra', infra: 'prep', error: prep.reason, ...meta }); console.log(`${id}: chuẩn bị hỏng (${prep.reason})`); continue; }
  for (const arm of todo) {
    n++;
    process.stdout.write(`[${n}] ${id} ${arm} … `);
    let r;
    try {
      if (ARMS[arm].kind === 'cto') r = await runCto(appFor(arm), cc, prep, arm, { runtime, capture });
      else {
        const a = appFor(arm);
        r = await runSingle(cc, prep, { config: a.config, cto: a.registry.cto(), deptName: a.registry.department('dev').name, bin: claudeBin, timeoutMin, maxTurns: a.config.phases?.toolTurns?.accept });
      }
    } catch (e) { r = { status: 'infra', infra: 'error', error: String(e?.stack ?? e).slice(0, 1500) }; }
    const { text, ...row } = r;
    if (row.error) row.error = scrub(row.error);
    if (text) { fs.mkdirSync(path.join(out, 'responses'), { recursive: true }); fs.writeFileSync(path.join(out, 'responses', `${id}__${arm}.md`), scrub(text)); }
    append(runsFile, { id, arm, at: new Date().toISOString(), ...row, ...meta, ...(useArmConfig ? { extraConfigSha256: armCfgSha[arm] } : {}) });
    console.log(r.status === 'done' ? `xong | ${Math.round(r.wallSec ?? 0)}s | ${r.tokens?.weighted ?? 0} wtok` : `HẠ TẦNG (${r.infra}${r.resetsAt ? `, mở lại ${r.resetsAt}` : ''})`);
    if (r.infra === 'rate-limit') { console.error('Dừng vì hạn mức; chạy lại đúng lệnh này để chạy tiếp.'); process.exit(EXIT_RATE_LIMIT); }
  }
  fs.rmSync(path.join(work, 'items', id), { recursive: true, force: true });
}
const rows = jl(runsFile);
console.log(`\nXong lượt này. Dòng done: ${rows.filter((r) => r.status === 'done').length}/${sel.items.length * armIds.length}; infra: ${rows.filter((r) => r.status === 'infra').length}.`);
process.exit(0);
