'use strict';

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec) {
  return new Error('invalid aggregation: ' + String(spec));
}

function numOf(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function numbers(records, field) {
  const out = [];
  for (const r of records) {
    if (!has(r, field)) continue;
    const n = numOf(r[field]);
    if (n !== null) out.push(n);
  }
  return out;
}

function buckets(records, field) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, field) || r[field] == null) continue;
    const v = r[field];
    const id = typeof v + ':' + (typeof v === 'object' ? JSON.stringify(v) : String(v));
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
  const parts = spec.trim().split(/\s+/);
  const cmd = parts[0];
  const bad = () => invalid(spec);

  if (cmd === 'count') {
    if (parts.length === 1) return { type: 'count', value: records.length };
    if (parts.length === 3 && parts[1] === 'by' && FIELD_RE.test(parts[2])) {
      return { type: 'count_by', field: parts[2], buckets: buckets(records, parts[2]) };
    }
    throw bad();
  }
  if (cmd === 'top') {
    if (parts.length !== 3 || !/^\d+$/.test(parts[1]) || Number(parts[1]) < 1 || !FIELD_RE.test(parts[2])) throw bad();
    return { type: 'top', field: parts[2], buckets: buckets(records, parts[2]).slice(0, Number(parts[1])) };
  }
  if (cmd === 'sum' || cmd === 'avg' || cmd === 'min' || cmd === 'max') {
    if (parts.length !== 2 || !FIELD_RE.test(parts[1])) throw bad();
    const f = parts[1];
    const nums = numbers(records, f);
    let value = null;
    if (nums.length) {
      if (cmd === 'sum') value = nums.reduce((a, b) => a + b, 0);
      else if (cmd === 'avg') value = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1e4) / 1e4;
      else if (cmd === 'min') value = nums.reduce((a, b) => (b < a ? b : a));
      else value = nums.reduce((a, b) => (b > a ? b : a));
    }
    return { type: cmd, field: f, value };
  }
  if (cmd === 'p50' || cmd === 'p90' || cmd === 'p95' || cmd === 'p99') {
    if (parts.length !== 2 || !FIELD_RE.test(parts[1])) throw bad();
    const f = parts[1];
    const p = Number(cmd.slice(1));
    const nums = numbers(records, f).sort((a, b) => a - b);
    let value = null;
    if (nums.length) {
      const rank = Math.ceil(p / 100 * nums.length);
      value = nums[Math.max(rank, 1) - 1];
    }
    return { type: cmd, field: f, value };
  }
  if (cmd === 'histogram') {
    const m = parts.length === 2 && /^(\d+)([smhd])$/.exec(parts[1]);
    if (!m || Number(m[1]) < 1) throw bad();
    const k = Number(m[1]);
    const width = k * UNITS[m[2]];
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of records) {
      if (!has(r, '@t') || typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
      const b = Math.floor(r['@t'] / width) * width;
      counts.set(b, (counts.get(b) || 0) + 1);
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    const out = [];
    if (counts.size) {
      for (let b = lo; b <= hi; b += width) {
        out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
      }
    }
    return { type: 'histogram', interval: k + m[2], buckets: out };
  }
  throw bad();
}

module.exports = { aggregate };
