'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec) {
  return new Error(`invalid aggregation: ${typeof spec === 'string' ? spec : String(spec)}`);
}

function has(r, k) {
  return r != null && Object.prototype.hasOwnProperty.call(r, k);
}

function nums(records, f) {
  const out = [];
  for (const r of records) {
    if (!has(r, f)) continue;
    const v = r[f];
    if (typeof v === 'number') { if (Number.isFinite(v)) out.push(v); }
    else if (typeof v === 'string' && NUM_RE.test(v)) out.push(Number(v));
  }
  return out;
}

function bucketsBy(records, f) {
  const m = new Map();
  for (const r of records) {
    if (!has(r, f) || r[f] == null) continue;
    const v = r[f];
    const id = v !== null && typeof v === 'object' ? 'o:' + JSON.stringify(v) : typeof v + ':' + String(v);
    const e = m.get(id);
    if (e) e.count++;
    else m.set(id, { key: v, count: 1 });
  }
  return [...m.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key), y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw invalid(spec);
  const parts = spec.trim().split(/\s+/);
  const cmd = parts[0];
  const bad = () => invalid(spec);
  const field = (s) => { if (!s || !FIELD_RE.test(s)) throw bad(); return s; };

  if (cmd === 'count') {
    if (parts.length === 1) return { type: 'count', value: records.length };
    if (parts.length === 3 && parts[1] === 'by') {
      const f = field(parts[2]);
      return { type: 'count_by', field: f, buckets: bucketsBy(records, f) };
    }
    throw bad();
  }
  if (cmd === 'top') {
    if (parts.length !== 3 || !/^\d+$/.test(parts[1])) throw bad();
    const n = Number(parts[1]);
    if (!Number.isSafeInteger(n) || n < 1) throw bad();
    const f = field(parts[2]);
    return { type: 'top', field: f, buckets: bucketsBy(records, f).slice(0, n) };
  }
  if (cmd === 'sum' || cmd === 'avg' || cmd === 'min' || cmd === 'max') {
    if (parts.length !== 2) throw bad();
    const f = field(parts[1]);
    const v = nums(records, f);
    let value = null;
    if (v.length) {
      if (cmd === 'sum') value = v.reduce((a, b) => a + b, 0);
      else if (cmd === 'avg') value = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1e4) / 1e4;
      else if (cmd === 'min') value = v.reduce((a, b) => (b < a ? b : a));
      else value = v.reduce((a, b) => (b > a ? b : a));
    }
    return { type: cmd, field: f, value };
  }
  if (/^p(50|90|95|99)$/.test(cmd)) {
    if (parts.length !== 2) throw bad();
    const f = field(parts[1]);
    const v = nums(records, f).sort((a, b) => a - b);
    let value = null;
    if (v.length) {
      const rank = Math.max(1, Math.ceil((Number(cmd.slice(1)) / 100) * v.length));
      value = v[rank - 1];
    }
    return { type: cmd, field: f, value };
  }
  if (cmd === 'histogram') {
    if (parts.length !== 2) throw bad();
    const m = /^(\d+)([smhd])$/.exec(parts[1]);
    if (!m) throw bad();
    const k = Number(m[1]);
    if (!Number.isSafeInteger(k) || k < 1) throw bad();
    return histogram(records, parts[1], k * UNITS[m[2]]);
  }
  throw bad();
}

function histogram(records, interval, size) {
  const counts = new Map();
  let lo = Infinity, hi = -Infinity;
  for (const r of records) {
    if (!has(r, '@t') || typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
    const b = Math.floor(r['@t'] / size) * size;
    counts.set(b, (counts.get(b) || 0) + 1);
    if (b < lo) lo = b;
    if (b > hi) hi = b;
  }
  const buckets = [];
  if (counts.size) {
    for (let b = lo; b <= hi; b += size) {
      buckets.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
    }
  }
  return { type: 'histogram', interval, buckets };
}

module.exports = { aggregate };
