'use strict';

// Nửa mở [start, end): chạm đầu mút không tính là chồng.
function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

function mergeRanges(ranges) {
  for (const r of ranges) {
    if (!(r.start < r.end)) {
      throw new RangeError(`Khoảng không hợp lệ: start=${r.start}, end=${r.end}`);
    }
  }
  const sorted = ranges
    .map((r) => ({ start: r.start, end: r.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && overlaps(last, r)) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push(r);
    }
  }
  return out;
}

module.exports = { overlaps, mergeRanges };
