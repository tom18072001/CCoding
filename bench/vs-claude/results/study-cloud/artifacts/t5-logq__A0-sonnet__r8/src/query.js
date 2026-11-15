'use strict';

class QuerySyntaxError extends Error {
  constructor(position, detail) {
    super('syntax error at position ' + position + (detail ? ': ' + detail : ''));
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)(.*)$/s;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function tokenize(q) {
  const toks = [];
  const n = q.length;
  let i = 0;
  const readQuoted = (start) => {
    // q[start] === '"'
    let j = start + 1;
    let s = '';
    while (j < n) {
      const c = q[j];
      if (c === '\\' && j + 1 < n && (q[j + 1] === '"' || q[j + 1] === '\\')) { s += q[j + 1]; j += 2; }
      else if (c === '"') return { value: s, end: j + 1 };
      else { s += c; j++; }
    }
    return null;
  };
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ type: c, pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(i);
      if (!r) { toks.push({ type: 'badquote', pos: i }); break; }
      toks.push({ type: 'quoted', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    let j = i;
    while (j < n && !/\s/.test(q[j]) && q[j] !== '(' && q[j] !== ')') {
      if (q[j] === '"' && q[j - 1] === ':' && j > i) break;
      j++;
    }
    const word = q.slice(i, j);
    if (j < n && q[j] === '"' && word.endsWith(':')) {
      const r = readQuoted(j);
      if (!r) { toks.push({ type: 'badquote', pos: j }); break; }
      toks.push({ type: 'fieldq', field: word.slice(0, -1), value: r.value, pos: i, valuePos: j });
      i = r.end;
      continue;
    }
    toks.push({ type: 'word', value: word, pos: i });
    i = j;
  }
  return toks;
}

function wildcardRegex(v) {
  let re = '';
  for (const ch of v) {
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else re += ch.replace(/[.+^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'is');
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function msgOf(r) {
  if (r.msg != null && has(r, 'msg')) return String(r.msg);
  if (r.message != null && has(r, 'message')) return String(r.message);
  return null;
}

function compile(query) {
  const q = String(query == null ? '' : query);
  if (q.trim() === '') return () => true;
  const toks = tokenize(q);
  let p = 0;
  const peek = () => {
    const t = toks[p];
    if (t && t.type === 'badquote') throw new QuerySyntaxError(t.pos, 'unterminated quote');
    return t;
  };
  const isKw = (t, k) => t && t.type === 'word' && t.value === k;
  const isOpKw = (t) => isKw(t, 'AND') || isKw(t, 'OR');

  function startsOperand(t) {
    if (!t) return false;
    if (t.type === '(' || t.type === 'quoted' || t.type === 'fieldq') return true;
    if (t.type === 'word') return !isOpKw(t);
    return false;
  }

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
      if (isKw(t, 'AND')) p++;
      else if (!startsOperand(t)) break;
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
    if (!t) throw new QuerySyntaxError(q.length, 'unexpected end of query');
    if (t.type === ')') throw new QuerySyntaxError(t.pos, 'unexpected )');
    if (isOpKw(t)) throw new QuerySyntaxError(t.pos, 'unexpected ' + t.value);
    if (t.type === '(') {
      p++;
      const e = parseOr();
      const c = peek();
      if (!c) throw new QuerySyntaxError(q.length, 'missing )');
      if (c.type !== ')') throw new QuerySyntaxError(c.pos, 'expected )');
      p++;
      return e;
    }
    p++;
    if (t.type === 'quoted') {
      const needle = t.value.toLowerCase();
      return (r) => { const m = msgOf(r); return m !== null && m.toLowerCase().includes(needle); };
    }
    if (t.type === 'fieldq') {
      if (!FIELD_RE.test(t.field)) throw new QuerySyntaxError(t.pos, 'invalid field');
      return exactMatch(t.field, t.value);
    }
    return wordTerm(t);
  }

  function exactMatch(field, value) {
    const want = value.toLowerCase();
    return (r) => has(r, field) && r[field] != null && String(r[field]).toLowerCase() === want;
  }

  function wordTerm(t) {
    const w = t.value;
    const m = CMP_RE.exec(w);
    if (m) {
      const [, field, op, rhs] = m;
      if (!NUM_RE.test(rhs)) throw new QuerySyntaxError(t.pos + field.length + op.length, 'expected number');
      const num = Number(rhs);
      return (r) => {
        if (!has(r, field)) return false;
        const v = toNum(r[field]);
        if (v === null) return false;
        switch (op) {
          case '>=': return v >= num;
          case '<=': return v <= num;
          case '>': return v > num;
          default: return v < num;
        }
      };
    }
    const ci = w.indexOf(':');
    if (ci === -1) {
      const needle = w.toLowerCase();
      return (r) => { const s = msgOf(r); return s !== null && s.toLowerCase().includes(needle); };
    }
    const field = w.slice(0, ci);
    const value = w.slice(ci + 1);
    if (field === '_exists_') {
      if (value === '') throw new QuerySyntaxError(t.pos + ci + 1, 'missing field');
      if (!FIELD_RE.test(value)) throw new QuerySyntaxError(t.pos + ci + 1, 'invalid field');
      return (r) => has(r, value) && r[value] != null;
    }
    if (!FIELD_RE.test(field)) throw new QuerySyntaxError(t.pos, 'invalid field');
    if (value === '') throw new QuerySyntaxError(t.pos + ci + 1, 'missing value');
    const re = wildcardRegex(value);
    return (r) => has(r, field) && r[field] != null && re.test(String(r[field]));
  }

  const fn = parseOr();
  const rest = peek();
  if (rest) {
    if (rest.type === ')') throw new QuerySyntaxError(rest.pos, 'unexpected )');
    throw new QuerySyntaxError(rest.pos, 'unexpected token');
  }
  return fn;
}

module.exports = { compile, QuerySyntaxError };
