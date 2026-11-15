'use strict';
const crypto = require('node:crypto');
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
  return v;
}
const hash = (v) => crypto.createHash('sha256').update(JSON.stringify(canon(v))).digest('hex');
module.exports = { canon, hash };
