'use strict';

function toCsv(items) {
  const rows = items.map((it) => [it.sku, it.quantity, it.price].join(','));
  return ['sku,quantity,price', ...rows].join('\n');
}

module.exports = { toCsv };
