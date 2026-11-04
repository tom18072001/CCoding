'use strict';
const { UNITS } = require('./units');

const PATTERN = new RegExp(
  '^(\\d+(?:\\.\\d+)?)\\s*(' + Object.keys(UNITS).join('|') + ')$', 'i');

function parseSize(s) {
  const m = PATTERN.exec(String(s).trim());
  if (!m) throw new TypeError('Kích thước không hợp lệ: ' + s);
  return Math.round(Number(m[1]) * UNITS[m[2].toUpperCase()]);
}

module.exports = { parseSize };
