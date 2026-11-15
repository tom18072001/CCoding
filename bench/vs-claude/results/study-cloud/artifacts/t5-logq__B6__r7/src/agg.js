'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec, why) {
  return new Error('invalid aggregation: ' + (why || String(spec)));
}

function present(r, f) {
  return r != null && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, f) && r[f] !== null && r[f] !== undefined;
}

function buckets(records, f) {
  const map = new Map();
  for (const r of records) {
    if (!present(r, f)) continue;
    const v = r[f];
    const id = typeof v === 'object' ? 'o:' + JSON.stringify(v) : typeof v + ':' + String(v);
    const b = map.get(id);
    if (b) b.count++;
    else map.set(id, { key: v, count: 1 });
  }
  const list = [...map.values()];
  list.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    const x = String(a.key), y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return list;
}

function numbers(records, f) {
  const out = [];
  for (const r of records) {
    if (!present(r, f)) continue;
    const v = r[f];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    else if (typeof v === 'string' && NUM_RE.test(v)) out.push(Number(v));
  }
  return out;
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw invalid(spec, 'spec must be a string');
  if (!Array.isArray(records)) records = Array.from(records || []);
  const t = spec.trim().split(/\s+/).filter(Boolean);
  if (t.length === 0) throw invalid(spec, 'empty spec');
  const cmd = t[0];

  if (cmd === 'count') {
    if (t.length === 1) return { type: 'count', value: records.length };
    if (t.length === 3 && t[1] === 'by') {
      return { type: 'count_by', field: t[2], buckets: buckets(records, t[2]) };
    }
    throw invalid(spec);
  }

  if (cmd === 'top') {
    if (t.length !== 3 || !/^\d+$/.test(t[1]) || Number(t[1]) < 1 || !Number.isSafeInteger(Number(t[1]))) throw invalid(spec);
    return { type: 'top', field: t[2], buckets: buckets(records, t[2]).slice(0, Number(t[1])) };
  }

  if (cmd === 'sum' || cmd === 'avg' || cmd === 'min' || cmd === 'max') {
    if (t.length !== 2) throw invalid(spec);
    const f = t[1];
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
    if (t.length !== 2) throw invalid(spec);
    const f = t[1];
    const nums = numbers(records, f).sort((a, b) => a - b);
    let value = null;
    if (nums.length) {
      const rank = Math.ceil((Number(cmd.slice(1)) / 100) * nums.length);
      value = nums[Math.min(Math.max(rank, 1), nums.length) - 1];
    }
    return { type: cmd, field: f, value };
  }

  if (cmd === 'histogram') {
    if (t.length !== 2) throw invalid(spec);
    const m = /^(\d+)([smhd])$/.exec(t[1]);
    if (!m || Number(m[1]) < 1 || !Number.isSafeInteger(Number(m[1]))) throw invalid(spec);
    const k = Number(m[1]);
    const size = k * UNIT_MS[m[2]];
    const counts = new Map();
    let lo = Infinity, hi = -Infinity;
    for (const r of records) {
      if (!r || typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
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
    return { type: 'histogram', interval: k + m[2], buckets: out };
  }

  throw invalid(spec, 'unknown command');
}

module.exports = { aggregate };
