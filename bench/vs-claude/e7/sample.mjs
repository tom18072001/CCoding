#!/usr/bin/env node
// E7: lấy mẫu mục cho CTO nghiệm thu trên lỗi lọt cổng (§9 V4-3f, bản chốt). Không gọi LLM, không đọc điểm.
//   node bench/vs-claude/e7/sample.mjs --survivors bench/vs-claude/results/g-mutation/g4-survivors.json \
//        --g bench/vs-claude/results/g-mutation/g-mutation.jsonl --out bench/vs-claude/results/e7-cto/items.json
//
// Quy tắc (ghi ở §9 trước khi chạy):
//   - Lỗi: từ kho G-4. Mỗi bài tối đa CAP lượt (mỗi lượt tối đa 1 lỗi), chọn lượt theo thứ tự xáo của rng(`seed|e7|faulty|<bài>`),
//     chọn lỗi trong lượt theo rng(`seed|e7|pick|<khóa lượt>`). Các lượt còn lại của bài xếp sau làm dự phòng (khi chuẩn bị hỏng).
//   - Đúng: cùng bài, cùng số lượng với lỗi. Ứng viên là lượt base có test ẩn đạt hết và `npm test` xanh trong G.
//     Ưu tiên lượt không có mục lỗi nào được chọn; thứ tự theo rng(`seed|e7|clean|<bài>`); phần còn lại làm dự phòng.
//   - Mã mục: 10 ký tự hex, băm từ (seed, loại, khóa, vị trí) — không suy ra được loại từ mã.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rng, sample } from '../../../docs/research/analysis/g-mutation.mjs';

export const E7_SEED = '20261104';
export const E7_CAP = 10;

const shuffle = (arr, seedStr) => sample(arr, arr.length, rng(seedStr));
const itemId = (seed, kind, key, i) => crypto.createHash('sha256').update(`e7|${seed}|${kind}|${key}|${i}`).digest('hex').slice(0, 10);

/**
 * survivors: danh sách G-4 [{key, task, arm, i, file, line, op, repl}]; gRows: các dòng của g-mutation.jsonl.
 * Trả { items: [...chính], reserve: {task: [...dự phòng theo thứ tự]} } — mục chính đúng thứ tự lấy mẫu.
 */
export function sampleItems(survivors, gRows, { seed = E7_SEED, cap = E7_CAP } = {}) {
  const byTask = new Map();
  for (const s of survivors) {
    const t = byTask.get(s.task) ?? new Map();
    const runs = t.get(s.key) ?? [];
    runs.push(s); t.set(s.key, runs); byTask.set(s.task, t);
  }
  const items = [], reserve = {};
  const tasks = [...byTask.keys()].sort();
  for (const task of tasks) {
    const runs = byTask.get(task);
    const keys = shuffle([...runs.keys()].sort(), `${seed}|e7|faulty|${task}`);
    const faulty = keys.map((key) => {
      const list = runs.get(key).slice().sort((a, b) => a.i - b.i);
      const [s] = sample(list, 1, rng(`${seed}|e7|pick|${key}`));
      return { id: itemId(seed, 'faulty', key, s.i), kind: 'faulty', task, key, arm: s.arm, site: { i: s.i, file: s.file, line: s.line, op: s.op, repl: s.repl } };
    });
    const nF = Math.min(cap, faulty.length);
    const usedRuns = new Set(faulty.slice(0, nF).map((x) => x.key));
    const cand = gRows.filter((r) => r.type === 'base' && r.task === task && r.hPass === true && r.vRed === false && r.vNone === false).map((r) => r.key).sort();
    const fresh = shuffle(cand.filter((k) => !usedRuns.has(k)), `${seed}|e7|clean|${task}`);
    const reused = shuffle(cand.filter((k) => usedRuns.has(k)), `${seed}|e7|clean-reuse|${task}`);
    const clean = [...fresh, ...reused].map((key) => ({ id: itemId(seed, 'clean', key, 0), kind: 'clean', task, key, arm: key.split('__')[1] }));
    const nC = Math.min(nF, clean.length);
    items.push(...faulty.slice(0, nF), ...clean.slice(0, nC));
    reserve[task] = { faulty: faulty.slice(nF), clean: clean.slice(nC) };
  }
  return { items, reserve };
}

/** Đếm theo bài và loại — để ghi RUNLOG và kiểm trần. */
export function countItems(items) {
  const out = {};
  for (const it of items) { const c = (out[it.task] ??= { faulty: 0, clean: 0 }); c[it.kind]++; }
  return out;
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
async function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1]]] : acc), []));
  const survText = fs.readFileSync(a.survivors, 'utf8');
  const gText = fs.readFileSync(a.g, 'utf8');
  const gRows = gText.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const { items, reserve } = sampleItems(JSON.parse(survText), gRows, { seed: a.seed ?? E7_SEED, cap: Number(a.cap ?? E7_CAP) });
  const doc = { seed: a.seed ?? E7_SEED, cap: Number(a.cap ?? E7_CAP), survivorsSha256: sha(survText), gSha256: sha(gText), counts: countItems(items), items, reserve };
  fs.mkdirSync(path.dirname(a.out), { recursive: true });
  fs.writeFileSync(a.out, JSON.stringify(doc, null, 1) + '\n');
  const n = (k) => items.filter((x) => x.kind === k).length;
  console.log(`${n('faulty')} lỗi + ${n('clean')} đúng, ${Object.keys(doc.counts).length} bài → ${a.out}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
