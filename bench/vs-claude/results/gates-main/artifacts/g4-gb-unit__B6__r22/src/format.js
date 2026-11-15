'use strict';
const { UNITS } = require('./units');

// Chọn đơn vị lớn nhất mà giá trị >= 1; 1 chữ số thập phân nếu không nguyên.
function formatSize(bytes) {
  const unit = Object.keys(UNITS).reverse().find((u) => bytes >= UNITS[u]) || 'B';
  const v = bytes / UNITS[unit];
  return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + ' ' + unit;
}

module.exports = { formatSize };
