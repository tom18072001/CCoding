#!/usr/bin/env node
// B-14a — chẩn đoán cache của claude-cli (docs/research/analysis/cache-diagnostic-spec.md, Phần 1).
// 3 cặp gọi: (a) giống hệt, (b) khác bộ công cụ, (c) khác cwd; + 1 lượt khởi động; tối đa 8 lượt `claude -p`.
// Cờ lấy từ buildClaudeArgs() thật trong dist/ (chạy `npm run build` trước) — không chép.
//   --fixture <tệp> | --dry-run   đọc usage giả, KHÔNG spawn claude
//   --wait <giây>                 chờ giữa các cặp (mặc định 330 > TTL 5 phút; bỏ qua với fixture)
//   --model <tên>  --out <csv>  --no-warmup
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { claudeEnv } from './lib/claude.mjs';

export const MAX_CALLS = 8;
export const PAIRS = [
  { id: 'a', note: 'giống hệt', tools: ['Read', 'Grep'], tools2: ['Read', 'Grep'], sameCwd: true },
  { id: 'b', note: 'khác bộ công cụ', tools: ['Read', 'Grep'], tools2: ['Read', 'Grep', 'Edit', 'Write'], sameCwd: true },
  { id: 'c', note: 'khác cwd', tools: ['Read', 'Grep'], tools2: ['Read', 'Grep'], sameCwd: false },
];

/** h = CR / (CR + CW + IN) — cùng định nghĩa B-13. */
export function hitRatio({ cr = 0, cw = 0, input = 0 }) {
  const d = cr + cw + input;
  return d > 0 ? cr / d : 0;
}

/** Kế hoạch lượt gọi: khởi động (tùy chọn) + 2 lượt/cặp. Vượt MAX_CALLS thì ném lỗi. */
export function buildPlan({ warmup = true } = {}) {
  const plan = [];
  if (warmup) plan.push({ label: 'warmup', pair: 'warmup', n: 0, tools: PAIRS[0].tools, cwdKey: 'w' });
  for (const p of PAIRS) {
    plan.push({ label: `${p.id}1`, pair: p.id, n: 1, tools: p.tools, cwdKey: `${p.id}1` });
    plan.push({ label: `${p.id}2`, pair: p.id, n: 2, tools: p.tools2, cwdKey: p.sameCwd ? `${p.id}1` : `${p.id}2` });
  }
  if (plan.length > MAX_CALLS) throw new Error(`kế hoạch ${plan.length} lượt vượt trần ${MAX_CALLS}`);
  return plan;
}

/** Prompt giả (không dữ liệu thật); nonce ở ĐẦU stdin để cặp này không đọc cache stdin của cặp khác. */
export function buildPrompt(nonce, paragraphs = 400) {
  const body = Array.from({ length: paragraphs }, (_, i) => `Tài liệu mẫu số ${i + 1}: đây là đoạn văn tổng hợp dùng để đệm tiền tố cache, không chứa dữ liệu thật.`).join('\n');
  return `nonce:${nonce}\n${body}\nTrả lời đúng một từ: OK.`;
}

export function usageToRow(rec, usage) {
  const u = usage ?? {};
  const row = { pair: rec.pair, call: rec.label, model: rec.model ?? '', gap_s: rec.gap_s ?? 0, cw: u.cache_creation_input_tokens ?? 0, cr: u.cache_read_input_tokens ?? 0, in: u.input_tokens ?? 0, out: u.output_tokens ?? 0 };
  row.h = Number(hitRatio({ cr: row.cr, cw: row.cw, input: row.in }).toFixed(4));
  return row;
}

export const CSV_HEADER = 'pair,call,model,gap_s,cw,cr,in,out,h';
export const toCsv = (rows) => [CSV_HEADER, ...rows.map((r) => [r.pair, r.call, r.model, r.gap_s, r.cw, r.cr, r.in, r.out, r.h].join(','))].join('\n') + '\n';

/** Diễn giải theo bảng 1.4 của spec (ngưỡng 0,9 / 0,5 / 0,2 / 0,05 là lựa chọn thiết kế). */
export function interpret(rows) {
  const h = (id) => rows.find((r) => r.call === `${id}2`)?.h;
  const a = h('a'), b = h('b'), c = h('c');
  const out = [];
  if (a === undefined) return ['thiếu lượt a2'];
  out.push(a >= 0.9 ? `(a) h=${a}: cache hoạt động qua claude -p` : a < 0.5 ? `(a) h=${a}: cache KHÔNG hoạt động ở mức cơ bản — dừng, không chạy (b)(c)` : `(a) h=${a}: trung gian`);
  if (b !== undefined) out.push(b < 0.2 ? `(b) h=${b}: đổi bộ công cụ vỡ gần hết tiền tố (khớp G1)` : `(b) h=${b}: công cụ không đứng trước phần lớn tiền tố (G1 sai?)`);
  if (c !== undefined) out.push(a - c <= 0.05 ? `(c) h=${c}: cwd không phá cache (c2)` : `(c) h=${c}: cwd/môi trường nằm trong tiền tố (c1) — nên giữ cwd ổn định`);
  return out;
}

function parseArgs(argv) {
  const o = { wait: 330, warmup: true, model: 'sonnet' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--fixture') o.fixture = argv[++i];
    else if (k === '--dry-run') o.dry = true;
    else if (k === '--wait') o.wait = Number(argv[++i]);
    else if (k === '--model') o.model = argv[++i];
    else if (k === '--out') o.out = argv[++i];
    else if (k === '--no-warmup') o.warmup = false;
    else throw new Error(`tùy chọn không rõ: ${k}`);
  }
  return o;
}

async function loadBuilder() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const f = path.resolve(here, '..', '..', 'dist', 'runtimes', 'claude-cli.js');
  if (!fs.existsSync(f)) throw new Error('thiếu dist/ — chạy `npm run build` trước');
  return import(pathToFileURL(f).href);
}

function sleep(s) { return new Promise((r) => setTimeout(r, s * 1000)); }

/** Chạy kế hoạch. Có fixture/--dry-run: usage giả, không spawn. Không: spawn `claude -p` thật (chỉ người điều phối chạy, ngoài hook). */
export async function runDiagnostic(opts, io = {}) {
  const plan = buildPlan({ warmup: opts.warmup !== false });
  const { buildClaudeArgs, ClaudeStreamParser } = await loadBuilder();
  const fixture = opts.fixture ? JSON.parse(fs.readFileSync(opts.fixture, 'utf8')) : null;
  const model = fixture?.model ?? opts.model ?? 'sonnet';
  const real = !fixture && !opts.dry;
  const tmp = real ? fs.mkdtempSync(path.join(os.tmpdir(), 'cache-diag-')) : null;
  const cwds = new Map();
  const rows = [];
  const nonces = new Map();
  let prevPair = null, prevEnd = 0;
  for (const step of plan) {
    if (!nonces.has(step.pair)) nonces.set(step.pair, crypto.randomBytes(6).toString('hex'));
    if (!cwds.has(step.cwdKey)) {
      const d = tmp ? path.join(tmp, `cwd-${step.cwdKey}`) : path.join(os.tmpdir(), `cache-diag-dry-cwd-${step.cwdKey}`);
      if (tmp) fs.mkdirSync(d, { recursive: true });
      cwds.set(step.cwdKey, d);
    }
    const cwd = cwds.get(step.cwdKey);
    const req = {
      phase: 'execute', model, cwd, tools: step.tools, allowTools: true, timeoutMs: 180000, system: '', prompt: '',
      toolPolicy: { root: cwd, allow: [], maxTurns: 2, commandTimeoutSec: 30, maxOutputChars: 4000 },
      meta: { taskId: 'cache-diag', department: 'research', callId: step.label },
    };
    const { args, env } = buildClaudeArgs({}, req, model);
    io.onStep?.({ step, args });
    let usage, gap = 0;
    if (fixture) {
      usage = fixture.calls?.[step.label];
      if (!usage) throw new Error(`fixture thiếu lượt ${step.label}`);
    } else if (opts.dry) {
      usage = {};
    } else {
      if (prevPair && prevPair !== step.pair && step.n === 1 && opts.wait > 0) await sleep(opts.wait);
      gap = step.n === 2 && prevEnd ? Math.round((Date.now() - prevEnd) / 1000) : 0;
      const r = spawnSync('claude', args, { cwd, input: buildPrompt(nonces.get(step.pair)), env: { ...claudeEnv(), ...env }, encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
      const p = new ClaudeStreamParser();
      for (const l of String(r.stdout ?? '').split('\n')) if (l.trim()) p.feed(l);
      usage = p.finalUsage();
      prevEnd = Date.now();
    }
    prevPair = step.pair;
    rows.push(usageToRow({ ...step, model, gap_s: gap }, usage));
  }
  return { rows, plan };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  const show = opts.dry || opts.fixture;
  const { rows } = await runDiagnostic(opts, { onStep: ({ step, args }) => { if (show) console.error(`# ${step.label}: claude ${args.filter((a) => !a.startsWith('{')).join(' ')}`); } });
  const csv = toCsv(rows);
  process.stdout.write(csv);
  if (opts.out) fs.writeFileSync(opts.out, csv);
  for (const l of interpret(rows)) console.log(`# ${l}`);
}
