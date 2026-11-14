'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super('syntax error at position ' + position);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)([\s\S]*)$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function readQuoted(q, start) {
  let i = start + 1;
  let s = '';
  while (i < q.length) {
    const c = q[i];
    if (c === '\\' && i + 1 < q.length) {
      const d = q[i + 1];
      if (d === '"' || d === '\\') s += d;
      else s += c + d;
      i += 2;
    } else if (c === '"') {
      return { value: s, end: i + 1 };
    } else { s += c; i++; }
  }
  throw new QuerySyntaxError(start);
}

function tokenize(q) {
  const toks = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ t: c, pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(q, i);
      toks.push({ t: 'quoted', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    let j = i;
    while (j < q.length && !/\s/.test(q[j]) && q[j] !== '(' && q[j] !== ')') {
      if (q[j] === '"' && q[j - 1] === ':') break;
      j++;
    }
    const word = q.slice(i, j);
    if (word.endsWith(':') && q[j] === '"') {
      const r = readQuoted(q, j);
      toks.push({ t: 'term', field: word.slice(0, -1), value: r.value, pos: i });
      i = r.end;
      continue;
    }
    toks.push({ t: 'word', value: word, pos: i });
    i = j;
  }
  return toks;
}

function wildcardRe(v) {
  let re = '';
  for (const ch of v) {
    if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.+^${}()|[\]\\/-]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'i');
}

function present(rec, f) {
  return hasOwn(rec, f) && rec[f] !== null && rec[f] !== undefined;
}

function numOf(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function searchText(rec) {
  if (present(rec, 'msg')) return String(rec.msg);
  if (present(rec, 'message')) return String(rec.message);
  return null;
}

function compile(query) {
  const q = String(query);
  if (/^\s*$/.test(q)) return () => true;
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];
  const isKw = (t, kw) => t && t.t === 'word' && t.value === kw;
  const eofPos = q.length;

  function parseOr() {
    let node = parseAnd();
    while (isKw(peek(), 'OR')) {
      p++;
      const right = parseAnd();
      const left = node;
      node = (r) => left(r) || right(r);
    }
    return node;
  }

  function startsPrimary(t) {
    if (!t) return false;
    if (t.t === ')') return false;
    if (isKw(t, 'AND') || isKw(t, 'OR')) return false;
    return true;
  }

  function parseAnd() {
    let node = parseNot();
    for (;;) {
      const t = peek();
      if (isKw(t, 'AND')) p++;
      else if (!startsPrimary(t)) break;
      const right = parseNot();
      const left = node;
      node = (r) => left(r) && right(r);
    }
    return node;
  }

  function parseNot() {
    if (isKw(peek(), 'NOT')) {
      p++;
      const inner = parseNot();
      return (r) => !inner(r);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    if (!t) throw new QuerySyntaxError(eofPos);
    if (t.t === ')') throw new QuerySyntaxError(t.pos);
    if (isKw(t, 'AND') || isKw(t, 'OR')) throw new QuerySyntaxError(t.pos);
    if (t.t === '(') {
      p++;
      const e = parseOr();
      const c = peek();
      if (!c) throw new QuerySyntaxError(eofPos);
      if (c.t !== ')') throw new QuerySyntaxError(c.pos);
      p++;
      return e;
    }
    p++;
    if (t.t === 'quoted') return textTerm(t.value);
    if (t.t === 'term') return fieldTerm(t.field, t.value, true, t.pos);
    const w = t.value;
    const m = CMP_RE.exec(w);
    if (m) {
      const field = m[1], op = m[2], rhs = m[3];
      if (!NUM_RE.test(rhs)) throw new QuerySyntaxError(t.pos + field.length + op.length);
      return cmpTerm(field, op, Number(rhs));
    }
    const ci = w.indexOf(':');
    if (ci >= 0) {
      const field = w.slice(0, ci);
      const value = w.slice(ci + 1);
      if (value === '') throw new QuerySyntaxError(t.pos + ci + 1);
      return fieldTerm(field, value, false, t.pos);
    }
    return textTerm(w);
  }

  function fieldTerm(field, value, quoted, pos) {
    if (field === '_exists_' && !quoted) return (r) => present(r, value);
    if (!FIELD_RE.test(field)) throw new QuerySyntaxError(pos);
    if (quoted) {
      const lv = value.toLowerCase();
      return (r) => present(r, field) && String(r[field]).toLowerCase() === lv;
    }
    const re = wildcardRe(value);
    return (r) => present(r, field) && re.test(String(r[field]));
  }

  function cmpTerm(field, op, n) {
    return (r) => {
      if (!hasOwn(r, field)) return false;
      const v = numOf(r[field]);
      if (v === null) return false;
      switch (op) {
        case '>=': return v >= n;
        case '<=': return v <= n;
        case '>': return v > n;
        default: return v < n;
      }
    };
  }

  function textTerm(text) {
    const lt = text.toLowerCase();
    return (r) => {
      const s = searchText(r);
      return s !== null && s.toLowerCase().includes(lt);
    };
  }

  const root = parseOr();
  if (p < toks.length) throw new QuerySyntaxError(toks[p].pos);
  return root;
}

module.exports = { compile, QuerySyntaxError };
