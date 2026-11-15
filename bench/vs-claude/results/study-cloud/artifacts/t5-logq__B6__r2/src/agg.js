'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec, why) {
  return new Error('invalid aggregation: ' + why + (typeof spec === 'string' ? ' (' + JSON.stringify(spec) + ')' : ''));
}

function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function has(r, f) {
  return r !== null && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, f);
}

function numbers(records, f) {
  const out = [];
  for (const r of records) {
    if (!has(r, f)) continue;
    const n = toNum(r[f]);
    if (n !== null) out.push(n);
  }
  return out;
}

function countBy(records, f) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, f)) continue;
    const v = r[f];
    if (v === null || v === undefined) continue;
    map.set(v, (map.get(v) || 0) + 1);
  }
  const buckets = [];
  for (const [key, count] of map) buckets.push({ key, count });
  buckets.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return buckets;
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw invalid(spec, 'spec must be a string');
  const toks = spec.trim().split(/\s+/).filter(Boolean);
  if (toks.length === 0) throw invalid(spec, 'empty spec');
  const kw = toks[0];
  const recs = Array.isArray(records) ? records : Array.from(records || []);

  if (kw === 'count') {
    if (toks.length === 1) return { type: 'count', value: recs.length };
    if (toks.length === 3 && toks[1] === 'by') {
      return { type: 'count_by', field: toks[2], buckets: countBy(recs, toks[2]) };
    }
    throw invalid(spec, 'expected "count" or "count by <field>"');
  }

  if (kw === 'top') {
    if (toks.length !== 3 || !/^\d+$/.test(toks[1])) throw invalid(spec, 'top needs <n> <field>');
    const n = Number(toks[1]);
    if (!Number.isSafeInteger(n) || n < 1) throw invalid(spec, 'n must be an integer >= 1');
    return { type: 'top', field: toks[2], buckets: countBy(recs, toks[2]).slice(0, n) };
  }

  if (kw === 'sum' || kw === 'avg' || kw === 'min' || kw === 'max') {
    if (toks.length !== 2) throw invalid(spec, kw + ' needs <field>');
    const f = toks[1];
    const nums = numbers(recs, f);
    let value = null;
    if (nums.length) {
      const sum = () => nums.reduce((a, b) => a + b, 0);
      if (kw === 'sum') value = sum();
      else if (kw === 'avg') value = Math.round((sum() / nums.length) * 1e4) / 1e4;
      else if (kw === 'min') value = nums.reduce((a, b) => (b < a ? b : a));
      else value = nums.reduce((a, b) => (b > a ? b : a));
    }
    return { type: kw, field: f, value };
  }

  if (kw === 'p50' || kw === 'p90' || kw === 'p95' || kw === 'p99') {
    if (toks.length !== 2) throw invalid(spec, kw + ' needs <field>');
    const f = toks[1];
    const nums = numbers(recs, f).sort((a, b) => a - b);
    let value = null;
    if (nums.length) {
      const p = Number(kw.slice(1));
      const rank = Math.max(1, Math.ceil((p / 100) * nums.length));
      value = nums[rank - 1];
    }
    return { type: kw, field: f, value };
  }

  if (kw === 'histogram') {
    const m = toks.length === 2 ? /^(\d+)([smhd])$/.exec(toks[1]) : null;
    if (!m) throw invalid(spec, 'histogram needs <k><u> with u in s,m,h,d');
    const k = Number(m[1]);
    if (!Number.isSafeInteger(k) || k < 1) throw invalid(spec, 'k must be an integer >= 1');
    const step = k * UNIT_MS[m[2]];
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of recs) {
      if (!has(r, '@t') || typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
      const b = Math.floor(r['@t'] / step) * step;
      counts.set(b, (counts.get(b) || 0) + 1);
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    const buckets = [];
    if (counts.size) {
      for (let b = lo; b <= hi; b += step) {
        buckets.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
      }
    }
    return { type: 'histogram', interval: toks[1], buckets };
  }

  throw invalid(spec, 'unknown keyword');
}

module.exports = { aggregate };
