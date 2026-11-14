'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec) {
  return new Error(`invalid aggregation: ${typeof spec === 'string' ? spec.trim() : String(spec)}`);
}

function numeric(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function numbersOf(records, field) {
  const out = [];
  for (const r of records) {
    if (r == null || !Object.prototype.hasOwnProperty.call(r, field)) continue;
    const n = numeric(r[field]);
    if (n !== null) out.push(n);
  }
  return out;
}

function buckets(records, field) {
  const map = new Map();
  for (const r of records) {
    if (r == null || !Object.prototype.hasOwnProperty.call(r, field)) continue;
    const v = r[field];
    if (v == null) continue;
    const id = typeof v === 'object' ? 'o:' + JSON.stringify(v) : v;
    const b = map.get(id);
    if (b) b.count++;
    else map.set(id, { key: v, count: 1 });
  }
  const arr = [...map.values()];
  arr.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return arr;
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw invalid(spec);
  const tok = spec.trim().split(/\s+/);
  if (tok.length === 1 && tok[0] === '') throw invalid(spec);
  const cmd = tok[0];
  const bad = () => invalid(spec);

  if (cmd === 'count') {
    if (tok.length === 1) return { type: 'count', value: records.length };
    if (tok.length === 3 && tok[1] === 'by') {
      return { type: 'count_by', field: tok[2], buckets: buckets(records, tok[2]) };
    }
    throw bad();
  }
  if (cmd === 'top') {
    if (tok.length !== 3 || !/^\d+$/.test(tok[1])) throw bad();
    const n = Number(tok[1]);
    if (n < 1) throw bad();
    return { type: 'top', field: tok[2], buckets: buckets(records, tok[2]).slice(0, n) };
  }
  if (cmd === 'sum' || cmd === 'avg' || cmd === 'min' || cmd === 'max') {
    if (tok.length !== 2) throw bad();
    const f = tok[1];
    const nums = numbersOf(records, f);
    let value = null;
    if (nums.length) {
      if (cmd === 'sum') value = nums.reduce((a, b) => a + b, 0);
      else if (cmd === 'avg') value = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1e4) / 1e4;
      else if (cmd === 'min') value = nums.reduce((a, b) => (b < a ? b : a));
      else value = nums.reduce((a, b) => (b > a ? b : a));
    }
    return { type: cmd, field: f, value };
  }
  if (/^p(50|90|95|99)$/.test(cmd)) {
    if (tok.length !== 2) throw bad();
    const p = Number(cmd.slice(1));
    const nums = numbersOf(records, tok[1]).sort((a, b) => a - b);
    let value = null;
    if (nums.length) value = nums[Math.max(1, Math.ceil((p / 100) * nums.length)) - 1];
    return { type: cmd, field: tok[1], value };
  }
  if (cmd === 'histogram') {
    if (tok.length !== 2) throw bad();
    const m = /^(\d+)([smhd])$/.exec(tok[1]);
    if (!m || Number(m[1]) < 1) throw bad();
    const k = Number(m[1]);
    const size = k * UNIT_MS[m[2]];
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of records) {
      if (r == null || typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
      const b = Math.floor(r['@t'] / size) * size;
      counts.set(b, (counts.get(b) || 0) + 1);
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    const out = [];
    if (counts.size) {
      for (let b = lo; b <= hi; b += size) {
        out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
      }
    }
    return { type: 'histogram', interval: `${k}${m[2]}`, buckets: out };
  }
  throw bad();
}

module.exports = { aggregate };
