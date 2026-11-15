'use strict';

function toCsv(items) {
  const rows = items.map((it) => [it.sku, it.qty, it.price].join(','));
  return ['sku,qty,price', ...rows].join('\n');
}

module.exports = { toCsv };
