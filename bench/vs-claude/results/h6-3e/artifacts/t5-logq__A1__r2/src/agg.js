'use strict';

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec, why) {
  return new Error('invalid aggregation: ' + JSON.stringify(spec) + (why ? ' (' + why + ')' : ''));
}

function has(rec, f) {
  return rec !== null && typeof rec === 'object' && Object.prototype.hasOwnProperty.call(rec, f);
}

function numeric(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function numbers(records, field) {
  const out = [];
  for (const r of records) {
    if (!has(r, field)) continue;
    const n = numeric(r[field]);
    if (n !== null) out.push(n);
  }
  return out;
}

function buckets(records, field) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, field)) continue;
    const v = r[field];
    if (v === null || v === undefined) continue;
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
  if (typeof spec !== 'string') throw invalid(spec, 'spec must be a string');
  const parts = spec.trim().split(/\s+/);
  const cmd = parts[0];
  const need = (n) => { if (parts.length !== n) throw invalid(spec, 'wrong number of arguments'); };
  const field = (f) => { if (!FIELD_RE.test(f)) throw invalid(spec, 'bad field'); return f; };

  if (cmd === 'count') {
    if (parts.length === 1) return { type: 'count', value: records.length };
    if (parts.length === 3 && parts[1] === 'by') {
      const f = field(parts[2]);
      return { type: 'count_by', field: f, buckets: buckets(records, f) };
    }
    throw invalid(spec, 'wrong number of arguments');
  }
  if (cmd === 'top') {
    need(3);
    if (!/^\d+$/.test(parts[1]) || Number(parts[1]) < 1) throw invalid(spec, 'bad n');
    const f = field(parts[2]);
    return { type: 'top', field: f, buckets: buckets(records, f).slice(0, Number(parts[1])) };
  }
  return aggregateRest(records, spec, parts, need, field);
}

function aggregateRest(records, spec, parts, need, field) {
  const cmd = parts[0];
  if (cmd === 'sum' || cmd === 'avg' || cmd === 'min' || cmd === 'max') {
    need(2);
    const f = field(parts[1]);
    const nums = numbers(records, f);
    let value = null;
    if (nums.length > 0) {
      if (cmd === 'sum') value = nums.reduce((a, b) => a + b, 0);
      else if (cmd === 'avg') value = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1e4) / 1e4;
      else if (cmd === 'min') value = nums.reduce((a, b) => (b < a ? b : a));
      else value = nums.reduce((a, b) => (b > a ? b : a));
    }
    return { type: cmd, field: f, value };
  }
  if (cmd === 'p50' || cmd === 'p90' || cmd === 'p95' || cmd === 'p99') {
    need(2);
    const f = field(parts[1]);
    const p = Number(cmd.slice(1));
    const nums = numbers(records, f).sort((a, b) => a - b);
    let value = null;
    if (nums.length > 0) {
      const rank = Math.max(1, Math.ceil(p / 100 * nums.length));
      value = nums[rank - 1];
    }
    return { type: cmd, field: f, value };
  }
  if (cmd === 'histogram') {
    need(2);
    const m = /^(\d+)([smhd])$/.exec(parts[1]);
    if (!m || Number(m[1]) < 1) throw invalid(spec, 'bad interval');
    const k = Number(m[1]);
    const step = k * UNIT_MS[m[2]];
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of records) {
      if (!has(r, '@t') || typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
      const b = Math.floor(r['@t'] / step) * step;
      counts.set(b, (counts.get(b) || 0) + 1);
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    const out = [];
    if (counts.size > 0) {
      for (let b = lo; b <= hi; b += step) {
        out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
      }
    }
    return { type: 'histogram', interval: k + m[2], buckets: out };
  }
  throw invalid(spec, 'unknown aggregation');
}

module.exports = { aggregate };
