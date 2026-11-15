'use strict';
const { UNITS } = require('./units');

function parseSize(s) {
  const m = /^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i.exec(String(s).trim());
  if (!m) throw new TypeError('Kích thước không hợp lệ: ' + s);
  return Math.round(Number(m[1]) * UNITS[m[2].toUpperCase()]);
}

module.exports = { parseSize };
