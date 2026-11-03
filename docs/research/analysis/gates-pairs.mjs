// Đổi runs.jsonl (trường `gates`, B-12) thành cặp ref,pred cho agreement.mjs --pairs.
// Dùng: node docs/research/analysis/gates-pairs.mjs <runs.jsonl…> [--arms-json arms.json] --unit decision|run [--gate b02|b10|cto] [--out file.csv]
// Quy ước và giới hạn: xem README.md (mục gates-pairs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATES = ['b02', 'b10', 'cto'];
export const HEAD = ['ref', 'pred', 'runId', 'gate', 'task', 'arm'];
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ARMS = path.resolve(HERE, '../../../bench/vs-claude/arms.json');

/** arms.json → [{prefix, gate}] từ _suites.gates.kinds (expectGate). */
export function gateKinds(armsJson) {
  const kinds = armsJson?._suites?.gates?.kinds ?? {};
  return Object.values(kinds).flatMap((k) => (k.prefixes ?? []).map((prefix) => ({ prefix, gate: k.expectGate })));
}

/** Cổng mà bài này cài lỗi cho; null nếu là bài sạch. */
export function taskGate(task, kinds) {
  return kinds.find((k) => String(task ?? '').startsWith(k.prefix))?.gate ?? null;
}

/**
 * Một dòng runs.jsonl → các cặp, theo cổng. Cổng null/thiếu → không có cặp (skipped).
 * unit 'run': 1 cặp mỗi lượt × cổng. unit 'decision': b02 → `rounds` cặp pred=1 (mỗi lần chặn);
 * không suy được từ tóm tắt lượt có kết thúc không chặn hay không nên không thêm cặp pred=0 cho lượt đã bị chặn.
 * Lượt b02 không chặn → 1 cặp pred=0. b10, cto: 1 cặp.
 */
export function rowToPairs(row, kinds, { unit = 'run', gates = GATES } = {}) {
  const pairs = [], skipped = {};
  const tg = taskGate(row.task, kinds);
  const g = row.gates && typeof row.gates === 'object' ? row.gates : {};
  for (const gate of gates) {
    const d = g[gate];
    if (!d || typeof d !== 'object') { skipped[gate] = 1; continue; }
    const ref = tg === gate ? '1' : '0';
    const base = { ref, runId: row.key ?? row.runId ?? '', gate, task: row.task ?? '', arm: row.arm ?? '' };
    const pred = gate === 'cto' ? !d.pass : !!d.blocked;
    if (unit === 'decision' && gate === 'b02' && pred) {
      const n = Math.max(1, Number.isFinite(d.rounds) ? Math.floor(d.rounds) : 1);
      for (let i = 0; i < n; i++) pairs.push({ ...base, pred: '1' });
    } else pairs.push({ ...base, pred: pred ? '1' : '0' });
  }
  return { pairs, skipped };
}

/** Nhiều dòng (text JSONL) → {pairs, skipped:{gate:n}, bad}. Bỏ dòng hỏng JSON. */
export function jsonlToPairs(text, kinds, opts = {}) {
  const pairs = [], skipped = {}, g = opts.gates ?? GATES; let bad = 0;
  for (const l of String(text).split(/\r?\n/)) {
    if (!l.trim()) continue;
    let row; try { row = JSON.parse(l); } catch { bad++; continue; }
    const r = rowToPairs(row, kinds, opts);
    pairs.push(...r.pairs);
    for (const [k, v] of Object.entries(r.skipped)) skipped[k] = (skipped[k] ?? 0) + v;
  }
  for (const k of g) skipped[k] ??= 0;
  return { pairs, skipped, bad };
}

const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
export function toCsv(pairs) {
  return [HEAD, ...pairs.map((p) => HEAD.map((h) => p[h]))].map((r) => r.map(q).join(',')).join('\n') + '\n';
}

export function main(argv, io = { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }) {
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const valued = new Set(['--arms-json', '--unit', '--gate', '--out']);
  const files = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
  const unit = opt('--unit'), gate = opt('--gate');
  if (!files.length || !['decision', 'run'].includes(unit)) { io.err('Dùng: gates-pairs.mjs <runs.jsonl…> --unit decision|run [--gate b02|b10|cto] [--arms-json f] [--out f.csv]\n'); return 2; }
  if (gate && !GATES.includes(gate)) { io.err(`--gate phải là một trong ${GATES.join('|')}\n`); return 2; }
  const kinds = gateKinds(JSON.parse(fs.readFileSync(opt('--arms-json') ?? DEFAULT_ARMS, 'utf8')));
  const gates = gate ? [gate] : GATES;
  const all = { pairs: [], skipped: {}, bad: 0 };
  for (const f of files) {
    const r = jsonlToPairs(fs.readFileSync(f, 'utf8'), kinds, { unit, gates });
    all.pairs.push(...r.pairs); all.bad += r.bad;
    for (const [k, v] of Object.entries(r.skipped)) all.skipped[k] = (all.skipped[k] ?? 0) + v;
  }
  const csv = toCsv(all.pairs);
  if (opt('--out')) fs.writeFileSync(opt('--out'), csv); else io.out(csv);
  io.err(`gates-pairs: ${all.pairs.length} cặp (unit=${unit}); bỏ vì cổng null: ${gates.map((k) => `${k}=${all.skipped[k] ?? 0}`).join(' ')}${all.bad ? `; dòng JSON hỏng: ${all.bad}` : ''}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
