// Số liệu cho ngưỡng làn đơn (B-01): từ bench/vs-claude/results/runs.csv, vòng C7 (Sonnet đơn và làn nhanh cùng thời điểm).
// Chạy: node docs/research/context/lane-threshold.mjs   (thăm dò, n = 5 bài × 1 lượt làn nhanh; không phải kiểm định)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const p = join(dirname(fileURLToPath(import.meta.url)), "../../../bench/vs-claude/results/runs.csv");
const lines = readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean);
// run_note có dấu phẩy ⇒ bắt theo mẫu "<vòng>,<ghi chú>,<bài>,<hệ>,<rep>,<status>,<wall>,<cost>,<pass>,<total>"
const rows = lines.slice(1).map((l) => {
  const m = l.match(/^(C\d+),(.*?),(t\d-[a-z]+),([a-z-]+),(\d+),(\w+),([\d.]+),([\d.]+),(\d+),(\d+)/);
  return m && { run: m[1], task: m[3], system: m[4], wall: +m[7], cost: +m[8], pass: +m[9], total: +m[10] };
}).filter(Boolean);
const c7 = rows.filter((r) => r.run === "C7");
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sum = (a) => a.reduce((s, v) => s + v, 0);
const tasks = [...new Set(c7.map((r) => r.task))];
const x = [], y = [], cx = [], cy = [];
console.log("bài\tSonnet đơn (s)\tlàn nhanh (s)\ttỉ lệ TG\tSonnet $\tlàn nhanh $\ttỉ lệ $\ttest ẩn làn nhanh");
for (const t of tasks) {
  const s = c7.filter((r) => r.task === t && r.system === "claude-sonnet");
  const f = c7.filter((r) => r.task === t && r.system === "ccoding-fastlane");
  const sw = mean(s.map((r) => r.wall)), fw = mean(f.map((r) => r.wall)), sc = mean(s.map((r) => r.cost)), fc = mean(f.map((r) => r.cost));
  x.push(sw); y.push(fw); cx.push(sc); cy.push(fc);
  console.log(`${t}\t${sw.toFixed(1)} (n=${s.length})\t${fw.toFixed(1)} (n=${f.length})\t${(fw / sw).toFixed(2)}\t${sc.toFixed(3)}\t${fc.toFixed(3)}\t${(fc / sc).toFixed(2)}\t${f.map((r) => `${r.pass}/${r.total}`).join(",")}`);
}
console.log(`Σ\t${sum(x).toFixed(1)}\t${sum(y).toFixed(1)}\t${(sum(y) / sum(x)).toFixed(2)}\t${sum(cx).toFixed(3)}\t${sum(cy).toFixed(3)}\t${(sum(cy) / sum(cx)).toFixed(2)}`);
const mx = mean(x), my = mean(y);
const b = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / x.reduce((s, v) => s + (v - mx) ** 2, 0);
const a = my - b * mx;
console.log(`\nhồi quy thô TG làn nhanh = a + b·TG đơn (5 điểm): a = ${a.toFixed(1)} s, b = ${b.toFixed(3)}; giao điểm T* = a/(1−b) = ${(a / (1 - b)).toFixed(1)} s; k = 1/(1−b) = ${(1 / (1 - b)).toFixed(2)}`);
