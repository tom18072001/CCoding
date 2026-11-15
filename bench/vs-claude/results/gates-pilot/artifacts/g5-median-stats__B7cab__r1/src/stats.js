'use strict';

function median(xs) {
  if (xs.length === 0) throw new RangeError('Mảng rỗng');
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function summary(xs) {
  if (xs.length === 0) throw new RangeError('Mảng rỗng');
  let min = Infinity, max = -Infinity, sum = 0;
  for (const x of xs) { if (x < min) min = x; if (x > max) max = x; sum += x; }
  return {
    count: xs.length,
    min,
    max,
    mean: Number((sum / xs.length).toFixed(2)),
    median: median(xs),
  };
}

module.exports = { median, summary };
