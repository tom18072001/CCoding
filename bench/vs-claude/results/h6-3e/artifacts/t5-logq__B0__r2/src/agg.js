'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function bad(spec, why) {
  return new Error('invalid aggregation: ' + String(spec) + (why ? ' (' + why + ')' : ''));
}

function numeric(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function numbers(records, f) {
  const out = [];
  for (const r of records) {
    if (!has(r, f)) continue;
    const n = numeric(r[f]);
    if (n !== null) out.push(n);
  }
  return out;
}

function buckets(records, f) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, f)) continue;
    const v = r[f];
    if (v === null || v === undefined) continue;
    const id = typeof v + ':' + (typeof v === 'object' ? JSON.stringify(v) : String(v));
    const b = map.get(id);
    if (b) b.count++;
    else map.set(id, { key: v, count: 1 });
  }
  const list = [...map.values()];
  list.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return list;
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw bad(spec);
  const parts = spec.trim().split(/\s+/);
  const cmd = parts[0];
  const argc = parts.length;

  if (cmd === 'count' && argc === 1) return { type: 'count', value: records.length };
  if (cmd === 'count' && argc === 3 && parts[1] === 'by') {
    return { type: 'count_by', field: parts[2], buckets: buckets(records, parts[2]) };
  }
  if (cmd === 'top' && argc === 3) {
    if (!/^\d+$/.test(parts[1]) || Number(parts[1]) < 1) throw bad(spec, 'n must be integer >= 1');
    return { type: 'top', field: parts[2], buckets: buckets(records, parts[2]).slice(0, Number(parts[1])) };
  }
  if ((cmd === 'sum' || cmd === 'avg' || cmd === 'min' || cmd === 'max') && argc === 2) {
    const f = parts[1];
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
  if (/^p(50|90|95|99)$/.test(cmd) && argc === 2) {
    const f = parts[1];
    const pct = Number(cmd.slice(1));
    const nums = numbers(records, f).sort((a, b) => a - b);
    let value = null;
    if (nums.length > 0) {
      const rank = Math.max(1, Math.ceil((pct / 100) * nums.length));
      value = nums[rank - 1];
    }
    return { type: cmd, field: f, value };
  }
  if (cmd === 'histogram' && argc === 2) {
    const m = /^(\d+)([smhd])$/.exec(parts[1]);
    if (!m || Number(m[1]) < 1) throw bad(spec, 'bad interval');
    const step = Number(m[1]) * UNIT_MS[m[2]];
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
    return { type: 'histogram', interval: parts[1], buckets: out };
  }
  throw bad(spec);
}

module.exports = { aggregate };
