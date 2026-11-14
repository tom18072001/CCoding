'use strict';

function median(xs) {
  if (xs.length === 0) throw new RangeError('Mảng rỗng');
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function summary(xs) {
  if (xs.length === 0) throw new RangeError('Mảng rỗng');
  let min = xs[0];
  let max = xs[0];
  let sum = 0;
  for (const x of xs) {
    if (x < min) min = x;
    if (x > max) max = x;
    sum += x;
  }
  return {
    count: xs.length,
    min,
    max,
    mean: Number((sum / xs.length).toFixed(2)),
    median: median(xs),
  };
}

module.exports = { median, summary };
