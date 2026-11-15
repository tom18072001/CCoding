// B-18: thống kê và ngưỡng đo khởi động (sandbox-spec §f). Hàm thuần.

/** Trung vị, p95 (nearest-rank), min, max. n=30 thì p95 = phần tử lớn thứ hai — không suy rộng. */
export function stats(xs) {
  if (!xs.length) return { n: 0, median: NaN, p95: NaN, min: NaN, max: NaN };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  const mid = s.length >> 1;
  return { n: s.length, median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2, p95: q(0.95), min: s[0], max: s[s.length - 1] };
}

/** Kế hoạch đo §f. Điều kiện 4 cần `claude -p` nên đánh dấu requiresClaude (script này không chạy). */
export const PLAN = [
  { id: 0, name: 'đối chứng', runs: 30, warmup: 0 },
  { id: 1, name: 'sandbox mức A, lệnh con', runs: 30, warmup: 3 },
  { id: 2, name: 'khởi động phiên WSL2, VM nguội', runs: 10, warmup: 0, wslOnly: true },
  { id: 3, name: 'khởi động phiên WSL2, VM ấm', runs: 30, warmup: 0, wslOnly: true },
  { id: 4, name: 'đầu-cuối claude -p', runs: 10, warmup: 0, requiresClaude: true },
];

/** Ngưỡng do S1 đề xuất (GIẢ ĐỊNH, giám đốc duyệt/đổi). */
export const THRESHOLDS = {
  perCommandMs: { median: 150, p95: 500 },
  perClaudeMs: { median: 1500, p95: 4000 },
  endToEndPct: 5,
};

/** samples: { 0:[ms], 1:[ms], 2:[ms], 3:[ms], '3base':[ms], '4off':[ms], '4on':[ms] }. Thiếu dữ liệu → null (không bịa). Vượt ngưỡng không tự loại — chỉ báo. */
export function evaluate(samples) {
  const res = {};
  const diff = (a, b) => ({ median: b.median - a.median, p95: b.p95 - a.p95 });
  if (samples[0]?.length && samples[1]?.length) {
    const d = diff(stats(samples[0]), stats(samples[1]));
    res.perCommand = { ...d, ok: d.median <= THRESHOLDS.perCommandMs.median && d.p95 <= THRESHOLDS.perCommandMs.p95 };
  } else res.perCommand = null;
  if (samples['3base']?.length && samples[3]?.length) {
    const d = diff(stats(samples['3base']), stats(samples[3]));
    res.perClaude = { ...d, ok: d.median <= THRESHOLDS.perClaudeMs.median && d.p95 <= THRESHOLDS.perClaudeMs.p95 };
  } else res.perClaude = null;
  if (samples['4off']?.length && samples['4on']?.length) {
    const a = stats(samples['4off']), b = stats(samples['4on']);
    const pct = ((b.median - a.median) / a.median) * 100;
    res.endToEnd = { pct, ok: pct <= THRESHOLDS.endToEndPct };
  } else res.endToEnd = null;
  res.coldVm = samples[2]?.length ? stats(samples[2]) : null;
  return res;
}
