// SR-16: duyệt vét cạn 5! = 120 lịch trực để xác nhận answer.json của l1-oncall.
// Kiểm: (1) đúng một lịch thỏa cả 7 luật và trùng answer.json; (2) count_without_rule_2 đúng;
// (3) most_permissive_rule là luật DUY NHẤT có số lịch nhiều nhất khi bỏ riêng luật đó (không hòa).
// Dùng: node bruteforce.mjs [đường dẫn answer.json]   (exit 0 = khớp, 1 = lệch)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const PEOPLE = ['An', 'Binh', 'Chi', 'Dung', 'Em'];

/** Ngày (0-4) của mỗi người trong một hoán vị `order` (order[i] = người trực ngày i). */
const dayOf = (order) => Object.fromEntries(order.map((p, i) => [p, i]));

export const RULES = [
  (d) => d.An !== 0 && d.An !== 4,
  (d) => d.Binh === d.Chi + 1,
  (d) => d.Dung < d.An,
  (d) => Math.abs(d.Em - d.Binh) !== 1,
  (d) => d.Chi !== 0,
  (d) => d.Em !== 2,
  (d) => Math.abs(d.Dung - d.Em) !== 1,
];

export function permutations(xs) {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Tính toàn bộ đáp án từ 7 luật. */
export function solve(rules = RULES) {
  const all = permutations(PEOPLE).map((order) => ({ order, d: dayOf(order) }));
  const valid = (skip) => all.filter(({ d }) => rules.every((r, i) => i === skip || r(d)));
  const full = valid(-1);
  const without = rules.map((_, i) => valid(i).length);
  const max = Math.max(...without);
  const best = without.flatMap((n, i) => (n === max ? [i + 1] : []));
  return {
    total: all.length,
    solutions: full.map((s) => Object.fromEntries(DAYS.map((day, i) => [day, s.order[i]]))),
    without,
    count_without_rule_2: without[1],
    mostPermissiveRules: best,
  };
}

export function verify(answer, rules = RULES) {
  const s = solve(rules);
  const errors = [];
  if (s.total !== 120) errors.push(`không gian tìm kiếm ${s.total} ≠ 120`);
  if (s.solutions.length !== 1) errors.push(`lời giải không duy nhất: ${s.solutions.length} lịch`);
  else if (JSON.stringify(s.solutions[0]) !== JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, answer.schedule?.[d]])))) errors.push(`schedule lệch: tính được ${JSON.stringify(s.solutions[0])}`);
  if (answer.count_without_rule_2 !== s.count_without_rule_2) errors.push(`count_without_rule_2 = ${answer.count_without_rule_2}, tính được ${s.count_without_rule_2}`);
  if (s.mostPermissiveRules.length !== 1) errors.push(`most_permissive_rule hòa: luật ${s.mostPermissiveRules.join(', ')}`);
  else if (answer.most_permissive_rule !== s.mostPermissiveRules[0]) errors.push(`most_permissive_rule = ${answer.most_permissive_rule}, tính được ${s.mostPermissiveRules[0]}`);
  return { ok: errors.length === 0, errors, solved: s };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'answer.json');
  const r = verify(JSON.parse(fs.readFileSync(file, 'utf8')));
  console.log(`số lịch khi bỏ từng luật 1..7: ${r.solved.without.join(', ')}`);
  if (r.ok) console.log('OK: lời giải duy nhất, count_without_rule_2 và most_permissive_rule (không hòa) khớp.');
  else { console.error(r.errors.join('\n')); process.exit(1); }
}
