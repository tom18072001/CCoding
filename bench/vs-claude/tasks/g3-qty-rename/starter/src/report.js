'use strict';
const { orderTotal } = require('./order');

function summary(items) {
  return { lines: items.length, units: items.reduce((s, it) => s + it.qty, 0), total: orderTotal(items) };
}

module.exports = { summary };
