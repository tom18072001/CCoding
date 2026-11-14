'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function bad(spec) {
  return new Error('invalid aggregation: ' + JSON.stringify(spec));
}

function numeric(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function numbers(records, f) {
  const out = [];
  for (const r of records) {
    const n = numeric(r[f]);
    if (n !== null) out.push(n);
  }
  return out;
}

function buckets(records, f) {
  const map = new Map();
  for (const r of records) {
    const v = r[f];
    if (v === undefined || v === null) continue;
    const id = typeof v + ':' + (typeof v === 'object' ? JSON.stringify(v) : String(v));
    const b = map.get(id);
    if (b) b.count++;
    else map.set(id, { key: v, count: 1 });
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw bad(spec);
  const tok = spec.trim().split(/\s+/);
  const cmd = tok[0];
  const need = (n) => { if (tok.length !== n) throw bad(spec); };

  if (cmd === 'count') {
    if (tok.length === 1) return { type: 'count', value: records.length };
    need(3);
    if (tok[1] !== 'by') throw bad(spec);
    return { type: 'count_by', field: tok[2], buckets: buckets(records, tok[2]) };
  }
  if (cmd === 'top') {
    need(3);
    if (!/^\d+$/.test(tok[1]) || Number(tok[1]) < 1) throw bad(spec);
    return { type: 'top', field: tok[2], buckets: buckets(records, tok[2]).slice(0, Number(tok[1])) };
  }
  if (cmd === 'sum' || cmd === 'avg' || cmd === 'min' || cmd === 'max') {
    need(2);
    const f = tok[1];
    const nums = numbers(records, f);
    let value = null;
    if (nums.length) {
      const sum = nums.reduce((a, b) => a + b, 0);
      if (cmd === 'sum') value = sum;
      else if (cmd === 'avg') value = Math.round((sum / nums.length) * 1e4) / 1e4;
      else if (cmd === 'min') value = nums.reduce((a, b) => (b < a ? b : a));
      else value = nums.reduce((a, b) => (b > a ? b : a));
    }
    return { type: cmd, field: f, value };
  }
  if (/^p(50|90|95|99)$/.test(cmd)) {
    need(2);
    const p = Number(cmd.slice(1));
    const nums = numbers(records, tok[1]).sort((a, b) => a - b);
    let value = null;
    if (nums.length) value = nums[Math.max(1, Math.ceil(p / 100 * nums.length)) - 1];
    return { type: cmd, field: tok[1], value };
  }
  if (cmd === 'histogram') {
    need(2);
    const m = /^(\d+)([smhd])$/.exec(tok[1]);
    if (!m || Number(m[1]) < 1) throw bad(spec);
    const width = Number(m[1]) * UNIT_MS[m[2]];
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of records) {
      if (typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
      const k = Math.floor(r['@t'] / width) * width;
      counts.set(k, (counts.get(k) || 0) + 1);
      if (k < lo) lo = k;
      if (k > hi) hi = k;
    }
    const out = [];
    if (counts.size) {
      for (let k = lo; k <= hi; k += width) out.push({ key: new Date(k).toISOString(), count: counts.get(k) || 0 });
    }
    return { type: 'histogram', interval: tok[1], buckets: out };
  }
  throw bad(spec);
}

module.exports = { aggregate };
