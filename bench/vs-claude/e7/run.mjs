#!/usr/bin/env node
// E7 runner: CTO nghiệm thu trên lỗi lọt cổng (§9 V4-3f, bản chốt). Chạy lại được: dòng `done` bỏ qua, `infra` chạy lại.
//   node bench/vs-claude/e7/run.mjs --items bench/vs-claude/results/e7-cto/items.json --out bench/vs-claude/results/e7-cto \
//        [--arms R1,R2,R3] [--root <bản checkout CCoding đã build>] [--work <thư mục tạm>] [--ccoding-data <thư mục data của app>]
//        [--config <tệp cấu hình thêm>] [--claude-bin claude] [--timeout 20] [--limit N] [--only id1,id2] [--prepare-only] [--smoke <mã mục dự phòng>]
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
import { ARMS, loadCcoding, prepareItem, runCto, runSingle } from './lib.mjs';

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
if (flag('config')) process.env.CCODING_CONFIG = path.resolve(flag('config'));

const doc = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
const artifacts = path.resolve(flag('artifacts', path.join(SUITE, 'results', 'study-cloud', 'artifacts')));
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(work, { recursive: true });
const cc = await loadCcoding(root);
const jl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
const append = (f, row) => fs.appendFileSync(f, `${JSON.stringify(row)}\n`);
/** Repo công khai: bỏ đường dẫn máy chạy (thư mục tạm, bản checkout, thư mục người dùng) khỏi văn bản lưu lại. */
const scrub = (t) => [[work, '<work>'], [root, '<ccoding>'], [os.homedir(), '<home>']].reduce((s, [a, b]) => s.split(a).join(b).split(a.replace(/\\/g, '/')).join(b), String(t));
const fileSha = (f) => (f && fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : null);
// cấu hình của app trong tiến trình (R1/R2): phải giống server bench (chỉ claude-cli, chặn web) — ghi sha256 để đối chiếu
const meta = { ccodingCommit: gitCommit(root), claudeCliVersion: cliVersion(claudeBin), node: process.version, platform: process.platform, localConfigSha256: fileSha(path.join(root, 'ccoding.local.json')), extraConfigSha256: fileSha(process.env.CCODING_CONFIG) };

// ───────────── bước 1: chốt danh sách mục ─────────────
const selFile = path.join(out, 'selected.json');
const prepFile = path.join(out, 'prep.jsonl');
// chạy thử (§9 E7 (7)): một mục dự phòng KHÔNG thuộc danh sách chốt, vào thư mục riêng; không vào phân tích
const smoke = flag('smoke', null);
if (smoke && path.resolve(out) === path.resolve(SUITE, 'results', 'e7-cto')) throw new Error('--smoke phải ghi vào thư mục khác results/e7-cto');
if (!smoke && !fs.existsSync(selFile)) {
  const selected = [], skipped = [];
  const queue = new Map(); // task|kind → dự phòng còn lại
  for (const [task, r] of Object.entries(doc.reserve)) for (const kind of ['faulty', 'clean']) queue.set(`${task}|${kind}`, r[kind].slice());
  // lỗi trước, rồi đúng: số mục đúng mỗi bài = số mục lỗi chốt được của bài đó (ghép theo bài)
  const nFaulty = {};
  for (const item of [...doc.items.filter((x) => x.kind === 'faulty'), ...doc.items.filter((x) => x.kind === 'clean')]) {
    if (item.kind === 'clean' && selected.filter((x) => x.kind === 'clean' && x.task === item.task).length >= (nFaulty[item.task] ?? 0)) { skipped.push({ id: item.id, task: item.task, kind: item.kind, reason: 'match-trim' }); continue; }
    let cand = item;
    while (cand) {
      const p = await prepareItem(cand, { suite: SUITE, artifacts, workRoot: path.join(work, 'prep'), cc, arms: ['R1'] });
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
const sel = smoke ? { items: [smoke] } : JSON.parse(fs.readFileSync(selFile, 'utf8'));
const byId = new Map([...doc.items, ...Object.values(doc.reserve).flatMap((r) => [...r.faulty, ...r.clean])].map((x) => [x.id, x]));
const order = sample(sel.items, sel.items.length, rng(`${doc.seed}|e7|order`));
const orders = latinOrders(armIds.length);
const runsFile = path.join(out, 'runs.jsonl');
const done = new Set(jl(runsFile).filter((r) => r.status === 'done').map((r) => `${r.id}__${r.arm}`));
fs.writeFileSync(path.join(out, `config-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify({ argv: argv.map(scrub), out: scrub(out), root: scrub(root), armIds, timeoutMin, runtime, ...meta, startedAt: new Date().toISOString() }, null, 1));

let app;
const capture = new Map();
const appFor = () => {
  if (app) return app;
  const base = cc.loadConfig({ root });
  app = cc.createApp({ dataDir: ccData, workspacesDir: path.join(ccData, 'workspaces'), runner: 'process', herdr: { ...base.herdr, notify: false, agentPanes: false } }, { root });
  // chỉ ghi lại văn bản lượt accept để đối chiếu với R3 (promptSha); lượt gọi vẫn đi qua Orchestrator.call() như thường
  const rt = app.runtimes.get(runtime);
  const orig = rt.run.bind(rt);
  rt.run = async (req, hooks) => { if (req.phase === 'accept') capture.set(req.meta?.taskId, { context: req.context, prompt: req.prompt, tools: req.tools, maxTurns: req.toolPolicy?.maxTurns ?? null }); return orig(req, hooks); };
  return app;
};

let n = 0, k = 0;
for (const [idx, id] of order.entries()) {
  if (only && !only.has(id)) continue;
  const todo = orders[idx % orders.length].map((x) => armIds[x]).filter((a) => !done.has(`${id}__${a}`));
  if (!todo.length) continue;
  if (k++ >= limit) break;
  const item = byId.get(id);
  const prep = await prepareItem(item, { suite: SUITE, artifacts, workRoot: path.join(work, 'items'), cc, arms: todo });
  if (!prep.ok) { append(runsFile, { id, arm: todo.join('+'), at: new Date().toISOString(), status: 'infra', infra: 'prep', error: prep.reason, ...meta }); console.log(`${id}: chuẩn bị hỏng (${prep.reason})`); continue; }
  for (const arm of todo) {
    n++;
    process.stdout.write(`[${n}] ${id} ${arm} … `);
    let r;
    try {
      if (ARMS[arm].kind === 'cto') r = await runCto(appFor(), cc, prep, arm, { runtime, capture });
      else {
        const a = appFor();
        r = await runSingle(cc, prep, { config: a.config, cto: a.registry.cto(), deptName: a.registry.department('dev').name, bin: claudeBin, timeoutMin, maxTurns: a.config.phases?.toolTurns?.accept });
      }
    } catch (e) { r = { status: 'infra', infra: 'error', error: String(e?.stack ?? e).slice(0, 1500) }; }
    const { text, ...row } = r;
    if (row.error) row.error = scrub(row.error);
    if (text) { fs.mkdirSync(path.join(out, 'responses'), { recursive: true }); fs.writeFileSync(path.join(out, 'responses', `${id}__${arm}.md`), scrub(text)); }
    append(runsFile, { id, arm, at: new Date().toISOString(), ...row, ...meta });
    console.log(r.status === 'done' ? `xong | ${Math.round(r.wallSec ?? 0)}s | ${r.tokens?.weighted ?? 0} wtok` : `HẠ TẦNG (${r.infra}${r.resetsAt ? `, mở lại ${r.resetsAt}` : ''})`);
    if (r.infra === 'rate-limit') { console.error('Dừng vì hạn mức; chạy lại đúng lệnh này để chạy tiếp.'); process.exit(EXIT_RATE_LIMIT); }
  }
  fs.rmSync(path.join(work, 'items', id), { recursive: true, force: true });
}
const rows = jl(runsFile);
console.log(`\nXong lượt này. Dòng done: ${rows.filter((r) => r.status === 'done').length}/${sel.items.length * armIds.length}; infra: ${rows.filter((r) => r.status === 'infra').length}.`);
process.exit(0);
