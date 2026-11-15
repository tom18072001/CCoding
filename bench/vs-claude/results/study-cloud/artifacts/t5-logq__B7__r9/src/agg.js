'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec, why) {
  return new Error('invalid aggregation: ' + JSON.stringify(spec) + (why ? ' (' + why + ')' : ''));
}

function present(r, f) {
  return Object.prototype.hasOwnProperty.call(r, f) && r[f] !== null && r[f] !== undefined;
}

function numbers(records, f) {
  const out = [];
  for (const r of records) {
    if (!Object.prototype.hasOwnProperty.call(r, f)) continue;
    const v = r[f];
    if (typeof v === 'number' && !Number.isNaN(v)) out.push(v);
    else if (typeof v === 'string' && NUM_RE.test(v)) out.push(Number(v));
  }
  return out;
}

function buckets(records, f) {
  const map = new Map();
  for (const r of records) {
    if (!present(r, f)) continue;
    const v = r[f];
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
  if (typeof spec !== 'string') throw invalid(spec, 'spec must be a string');
  const w = spec.trim().split(/\s+/);
  const cmd = w[0];
  if (cmd === 'count' && w.length === 1) return { type: 'count', value: records.length };
  if (cmd === 'count' && w.length === 3 && w[1] === 'by') {
    return { type: 'count_by', field: w[2], buckets: buckets(records, w[2]) };
  }
  if (cmd === 'top' && w.length === 3) {
    if (!/^\d+$/.test(w[1]) || Number(w[1]) < 1) throw invalid(spec, 'n must be an integer >= 1');
    return { type: 'top', field: w[2], buckets: buckets(records, w[2]).slice(0, Number(w[1])) };
  }
  if (['sum', 'avg', 'min', 'max'].includes(cmd) && w.length === 2) {
    const nums = numbers(records, w[1]);
    let value = null;
    if (nums.length) {
      if (cmd === 'sum') value = nums.reduce((a, b) => a + b, 0);
      else if (cmd === 'avg') value = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1e4) / 1e4;
      else if (cmd === 'min') value = nums.reduce((a, b) => (b < a ? b : a));
      else value = nums.reduce((a, b) => (b > a ? b : a));
    }
    return { type: cmd, field: w[1], value };
  }
  if (/^p(50|90|95|99)$/.test(cmd) && w.length === 2) {
    const nums = numbers(records, w[1]).sort((a, b) => a - b);
    let value = null;
    if (nums.length) {
      const rank = Math.ceil((Number(cmd.slice(1)) / 100) * nums.length);
      value = nums[Math.max(rank, 1) - 1];
    }
    return { type: cmd, field: w[1], value };
  }
  if (cmd === 'histogram' && w.length === 2) {
    const m = /^(\d+)([smhd])$/.exec(w[1]);
    if (!m || Number(m[1]) < 1) throw invalid(spec, 'bad interval');
    const step = Number(m[1]) * UNIT_MS[m[2]];
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of records) {
      const t = r['@t'];
      if (typeof t !== 'number' || !Number.isFinite(t)) continue;
      const b = Math.floor(t / step) * step;
      counts.set(b, (counts.get(b) || 0) + 1);
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    const out = [];
    if (counts.size) {
      for (let b = lo; b <= hi; b += step) out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
    }
    return { type: 'histogram', interval: m[1] + m[2], buckets: out };
  }
  throw invalid(spec);
}

module.exports = { aggregate };
