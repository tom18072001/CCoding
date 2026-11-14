#!/usr/bin/env node
// Khoảng tin cậy Clopper–Pearson hai phía, chính xác (nghịch đảo hàm phân phối nhị thức bằng chia đôi).
// Dùng: node docs/research/scripts/clopper-pearson.mjs <k> <n> [alpha=0.05]
function logChoose(n, k) { let s = 0; for (let i = 1; i <= k; i++) s += Math.log((n - k + i) / i); return s; }
// P(X <= k) với X ~ Bin(n, p)
function cdf(k, n, p) {
  if (k >= n) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  let s = 0;
  for (let i = 0; i <= k; i++) s += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  return Math.min(1, s);
}
function bisect(f, lo, hi) { for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(m)) hi = m; else lo = m; } return (lo + hi) / 2; }
export function clopperPearson(k, n, alpha = 0.05) {
  // cận dưới: P(X >= k | p) = alpha/2 ; cận trên: P(X <= k | p) = alpha/2
  const lower = k === 0 ? 0 : bisect((p) => 1 - cdf(k - 1, n, p) >= alpha / 2, 0, 1);
  const upper = k === n ? 1 : bisect((p) => cdf(k, n, p) <= alpha / 2, 0, 1);
  return { k, n, est: k / n, lower, upper };
}
if (process.argv[1] && process.argv[1].endsWith('clopper-pearson.mjs')) {
  const k = Number(process.argv[2]), n = Number(process.argv[3]), a = Number(process.argv[4] ?? 0.05);
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || k > n || n < 1) { console.error('Dùng: clopper-pearson.mjs <k> <n> [alpha]'); process.exit(2); }
  const r = clopperPearson(k, n, a);
  const f = (x) => (x * 100).toFixed(1).replace('.', ',') + ' %';
  console.log(`k=${k}, n=${n}, ước lượng ${f(r.est)}, CI ${(1 - a) * 100} % Clopper–Pearson [${f(r.lower)}; ${f(r.upper)}] (${r.lower.toFixed(4)}; ${r.upper.toFixed(4)})`);
}
