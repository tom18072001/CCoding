'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super('syntax error at position ' + position);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)(.*)$/s;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Trả về mảng token; token cuối là EOF hoặc ERR.
function tokenize(q) {
  const toks = [];
  const n = q.length;
  let i = 0;
  // đọc chuỗi trong ngoặc kép bắt đầu tại i (q[i] === '"'); trả về {value, end} hoặc null
  function readQuoted(start) {
    let s = '';
    let k = start + 1;
    while (k < n) {
      const c = q[k];
      if (c === '\\' && k + 1 < n && (q[k + 1] === '"' || q[k + 1] === '\\')) {
        s += q[k + 1];
        k += 2;
      } else if (c === '"') {
        return { value: s, end: k + 1 };
      } else {
        s += c;
        k++;
      }
    }
    return null;
  }
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { toks.push({ t: 'LP', pos: i }); i++; continue; }
    if (c === ')') { toks.push({ t: 'RP', pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(i);
      if (!r) { toks.push({ t: 'ERR', pos: i }); return toks; }
      toks.push({ t: 'QUOTED', pos: i, value: r.value });
      i = r.end;
      continue;
    }
    const start = i;
    while (i < n && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && q[i - 1] === ':') {
        const r = readQuoted(i);
        if (!r) { toks.push({ t: 'ERR', pos: i }); return toks; }
        toks.push({ t: 'FQ', pos: start, field: q.slice(start, i - 1), value: r.value, valuePos: i });
        i = r.end;
        break;
      }
      i++;
    }
    if (toks.length && toks[toks.length - 1].pos === start && toks[toks.length - 1].t === 'FQ') continue;
    toks.push({ t: 'WORD', pos: start, text: q.slice(start, i) });
  }
  toks.push({ t: 'EOF', pos: n });
  return toks;
}

function wildcardRegex(v) {
  let re = '';
  for (const ch of v) {
    if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'i');
}

function present(rec, f) {
  return has(rec, f) && rec[f] !== null && rec[f] !== undefined;
}

function numeric(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function textOf(rec) {
  if (present(rec, 'msg')) return String(rec.msg);
  if (present(rec, 'message')) return String(rec.message);
  return null;
}

function fieldExact(field, value) {
  const lv = value.toLowerCase();
  return (rec) => present(rec, field) && String(rec[field]).toLowerCase() === lv;
}

function substr(value) {
  const lv = value.toLowerCase();
  return (rec) => {
    const t = textOf(rec);
    return t !== null && t.toLowerCase().includes(lv);
  };
}

function compile(query) {
  if (typeof query !== 'string') throw new TypeError('query must be a string');
  const toks = tokenize(query);
  let p = 0;
  const len = query.length;

  function peek() {
    const t = toks[p];
    if (t.t === 'ERR') throw new QuerySyntaxError(t.pos);
    return t;
  }
  const isKw = (t, k) => t.t === 'WORD' && t.text === k;

  function parseOr() {
    let left = parseAnd();
    while (isKw(peek(), 'OR')) {
      p++;
      const right = parseAnd();
      const l = left;
      left = (r) => l(r) || right(r);
    }
    return left;
  }

  function parseAnd() {
    let left = parseNot();
    for (;;) {
      const t = peek();
      if (t.t === 'EOF' || t.t === 'RP' || isKw(t, 'OR')) break;
      if (isKw(t, 'AND')) p++;
      const right = parseNot();
      const l = left;
      left = (r) => l(r) && right(r);
    }
    return left;
  }

  function parseNot() {
    const t = peek();
    if (isKw(t, 'NOT')) {
      p++;
      const inner = parseNot();
      return (r) => !inner(r);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    if (t.t === 'EOF') throw new QuerySyntaxError(len);
    if (t.t === 'RP') throw new QuerySyntaxError(t.pos);
    if (t.t === 'LP') {
      p++;
      const e = parseOr();
      const c = peek();
      if (c.t !== 'RP') throw new QuerySyntaxError(c.t === 'EOF' ? len : c.pos);
      p++;
      return e;
    }
    if (t.t === 'QUOTED') { p++; return substr(t.value); }
    if (t.t === 'FQ') {
      p++;
      if (!FIELD_RE.test(t.field)) throw new QuerySyntaxError(t.pos);
      return fieldExact(t.field, t.value);
    }
    // WORD
    if (t.text === 'AND' || t.text === 'OR') throw new QuerySyntaxError(t.pos);
    p++;
    return parseTerm(t);
  }

  function parseTerm(t) {
    const w = t.text;
    const m = CMP_RE.exec(w);
    if (m) {
      const [, field, op, rest] = m;
      if (!NUM_RE.test(rest)) throw new QuerySyntaxError(t.pos + field.length + op.length);
      const n = Number(rest);
      return (r) => {
        if (!has(r, field)) return false;
        const v = numeric(r[field]);
        if (v === null) return false;
        switch (op) {
          case '>=': return v >= n;
          case '<=': return v <= n;
          case '>': return v > n;
          default: return v < n;
        }
      };
    }
    const ci = w.indexOf(':');
    if (ci >= 0) {
      const field = w.slice(0, ci);
      const value = w.slice(ci + 1);
      if (value === '') throw new QuerySyntaxError(t.pos + ci + 1);
      if (field === '_exists_') {
        if (!FIELD_RE.test(value)) throw new QuerySyntaxError(t.pos + ci + 1);
        return (r) => present(r, value);
      }
      if (!FIELD_RE.test(field)) throw new QuerySyntaxError(t.pos);
      const re = wildcardRegex(value);
      return (r) => present(r, field) && re.test(String(r[field]));
    }
    return substr(w);
  }

  if (toks[0].t === 'EOF') return () => true;
  const fn = parseOr();
  const t = peek();
  if (t.t !== 'EOF') throw new QuerySyntaxError(t.pos);
  return fn;
}

module.exports = { compile, QuerySyntaxError };
