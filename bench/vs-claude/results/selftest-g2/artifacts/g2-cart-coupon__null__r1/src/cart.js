'use strict';
const { toCents } = require('./money');

function total(items) {
  return items.reduce((s, it) => s + toCents(it.price) * it.quantity, 0);
}

module.exports = { total };
