'use strict';

function lineTotal(item) { return item.price * item.quantity; }
function orderTotal(items) { return items.reduce((s, it) => s + lineTotal(it), 0); }

module.exports = { lineTotal, orderTotal };
