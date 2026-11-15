'use strict';

function median(xs) {
  if (xs.length === 0) throw new RangeError('Mảng rỗng');
  const s = xs.sort();
  return s[Math.floor(s.length / 2)];
}

module.exports = { median };
