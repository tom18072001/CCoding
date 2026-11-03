// Đổi runs.jsonl (trường `gates`, B-12) thành cặp ref,pred cho agreement.mjs --pairs.
// Dùng: node docs/research/analysis/gates-pairs.mjs <runs.jsonl…> [--arms-json arms.json] --unit decision|run [--gate b02|b10|cto] [--negatives clean|cross] [--label gate|task] [--out file.csv]
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
 * Một dòng runs.jsonl → các cặp, theo cổng.
 * - Dòng không có `gates` (status infra/error) → không cặp, đếm vào `unrun[status]` (một lần mỗi dòng).
 * - Cổng null → không cặp, đếm vào `skipped[gate]`.
 * - Bài cài lỗi loại KHÁC cổng đang xét: negatives 'clean' (mặc định) → bỏ, đếm vào `cross[gate]`
 *   (cổng đó chặn đúng nhưng không phải bài sạch); 'cross' → giữ với ref=0 (hành vi cũ).
 * unit 'run': 1 cặp mỗi lượt × cổng. unit 'decision': b02 → `rounds` cặp pred=1 (mỗi lần chặn);
 * không suy được từ tóm tắt lượt có kết thúc không chặn hay không nên không thêm cặp pred=0 cho lượt đã bị chặn.
 * Lượt b02 không chặn → 1 cặp pred=0. b10, cto: 1 cặp.
 * Nhãn ref (`label`): 'task' = nhãn theo bài (cũ). 'gate' (mặc định) = nhãn tại thời điểm cổng (B-12 trường 7(b)):
 * - b02: ref = `checksRed > 0` (số lệnh kiểm đỏ tại cổng). Dòng thiếu `checksRed` (không phải số hữu hạn ≥ 0)
 *   → lùi về nhãn theo bài, đếm vào `fallback.b02`; `seen.b02` đếm mọi dòng b02 vào mẫu.
 *   b02 đọc chính lệnh kiểm nên recall b02 gần như theo định nghĩa; đại lượng có thông tin là q̂ (lỗi sống tới cổng).
 * - cto: nhãn cuối lượt = nhãn theo bài. Lập luận [chờ research-lead chốt]: ở làn đơn nghiệm thu là pha cuối,
 *   nên trạng thái test ẩn cuối lượt là trạng thái CTO đã thấy.
 * - b10: nhãn theo bài.
 */
export function rowToPairs(row, kinds, { unit = 'run', gates = GATES, negatives = 'clean', label = 'gate' } = {}) {
  const pairs = [], skipped = {}, cross = {}, unrun = {}, fallback = {}, seen = {};
  const tg = taskGate(row.task, kinds);
  const hasGates = row.gates && typeof row.gates === 'object';
  if (!hasGates) { const st = String(row.status ?? 'không rõ'); unrun[st] = 1; return { pairs, skipped, cross, unrun, fallback, seen }; }
  for (const gate of gates) {
    const d = row.gates[gate];
    if (!d || typeof d !== 'object') { skipped[gate] = 1; continue; }
    if (tg && tg !== gate && negatives === 'clean') { cross[gate] = 1; continue; }
    let ref = tg === gate ? '1' : '0';
    if (gate === 'b02') {
      seen.b02 = 1;
      if (label === 'gate') {
        if (Number.isFinite(d.checksRed) && d.checksRed >= 0) ref = d.checksRed > 0 ? '1' : '0';
        else fallback.b02 = 1;
      }
    }
    const base = { ref, runId: row.key ?? row.runId ?? '', gate, task: row.task ?? '', arm: row.arm ?? '' };
    const pred = gate === 'cto' ? !d.pass : !!d.blocked;
    if (unit === 'decision' && gate === 'b02' && pred) {
      const n = Math.max(1, Number.isFinite(d.rounds) ? Math.floor(d.rounds) : 1);
      for (let i = 0; i < n; i++) pairs.push({ ...base, pred: '1' });
    } else pairs.push({ ...base, pred: pred ? '1' : '0' });
  }
  return { pairs, skipped, cross, unrun, fallback, seen };
}

const addTo = (acc, o) => { for (const [k, v] of Object.entries(o)) acc[k] = (acc[k] ?? 0) + v; };

/** Nhiều dòng (text JSONL) → {pairs, skipped, cross, unrun, fallback, seen, bad}. Bỏ dòng hỏng JSON. */
export function jsonlToPairs(text, kinds, opts = {}) {
  const pairs = [], skipped = {}, cross = {}, unrun = {}, fallback = {}, seen = {}, g = opts.gates ?? GATES; let bad = 0;
  for (const l of String(text).split(/\r?\n/)) {
    if (!l.trim()) continue;
    let row; try { row = JSON.parse(l); } catch { bad++; continue; }
    const r = rowToPairs(row, kinds, opts);
    pairs.push(...r.pairs); addTo(skipped, r.skipped); addTo(cross, r.cross); addTo(unrun, r.unrun); addTo(fallback, r.fallback); addTo(seen, r.seen);
  }
  for (const k of g) { skipped[k] ??= 0; cross[k] ??= 0; }
  return { pairs, skipped, cross, unrun, fallback, seen, bad };
}

const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
export function toCsv(pairs) {
  return [HEAD, ...pairs.map((p) => HEAD.map((h) => p[h]))].map((r) => r.map(q).join(',')).join('\n') + '\n';
}

export function main(argv, io = { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }) {
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const valued = new Set(['--arms-json', '--unit', '--gate', '--out', '--negatives', '--label']);
  const files = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
  const unit = opt('--unit'), gate = opt('--gate');
  if (!files.length || !['decision', 'run'].includes(unit)) { io.err('Dùng: gates-pairs.mjs <runs.jsonl…> --unit decision|run [--gate b02|b10|cto] [--negatives clean|cross] [--label gate|task] [--arms-json f] [--out f.csv]\n'); return 2; }
  if (gate && !GATES.includes(gate)) { io.err(`--gate phải là một trong ${GATES.join('|')}\n`); return 2; }
  const negatives = opt('--negatives') ?? 'clean';
  if (!['clean', 'cross'].includes(negatives)) { io.err('--negatives phải là clean|cross\n'); return 2; }
  const label = opt('--label') ?? 'gate';
  if (!['gate', 'task'].includes(label)) { io.err('--label phải là gate|task\n'); return 2; }
  const kinds = gateKinds(JSON.parse(fs.readFileSync(opt('--arms-json') ?? DEFAULT_ARMS, 'utf8')));
  const gates = gate ? [gate] : GATES;
  const all = { pairs: [], skipped: {}, cross: {}, unrun: {}, fallback: {}, seen: {}, bad: 0 };
  for (const f of files) {
    const r = jsonlToPairs(fs.readFileSync(f, 'utf8'), kinds, { unit, gates, negatives, label });
    all.pairs.push(...r.pairs); all.bad += r.bad;
    addTo(all.skipped, r.skipped); addTo(all.cross, r.cross); addTo(all.unrun, r.unrun); addTo(all.fallback, r.fallback); addTo(all.seen, r.seen);
  }
  const csv = toCsv(all.pairs);
  // Dòng tổng hợp nhãn b02: lùi N/M, tỷ lệ lùi, nhãn hiệu lực. Luôn ở stderr; thêm vào stdout chỉ khi có --out (để không làm hỏng CSV).
  let summary = '';
  if (gates.includes('b02')) {
    const m = all.seen.b02 ?? 0, n = label === 'gate' ? (all.fallback.b02 ?? 0) : 0;
    const eff = label === 'task' ? 'task' : m > 0 && n === m ? 'task (lùi)' : n > 0 ? 'gate (lùi một phần)' : 'gate';
    summary = `gates-pairs: b02 nhãn hiệu lực: ${eff}; số dòng lùi: ${n}/${m}; tỷ lệ lùi: ${m ? ((100 * n) / m).toFixed(1) : '0.0'}%\n`;
    if (n > 0) io.err(`b02: ${n}/${m} dòng thiếu checksRed → dùng nhãn theo bài\n`);
  }
  if (opt('--out')) { fs.writeFileSync(opt('--out'), csv); io.out(summary); } else io.out(csv);
  const per = (o) => gates.map((k) => `${k}=${o[k] ?? 0}`).join(' ');
  const st = Object.entries(all.unrun).map(([k, v]) => `${k}=${v}`).join(' ') || '0';
  io.err(`gates-pairs: ${all.pairs.length} cặp (unit=${unit}, negatives=${negatives}, label=${label}); bỏ vì cổng null: ${per(all.skipped)}; bỏ vì bài cài lỗi loại khác: ${per(all.cross)}; dòng không chạy cổng (theo status): ${st}${all.bad ? `; dòng JSON hỏng: ${all.bad}` : ''}\n`);
  if (summary) io.err(summary);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
