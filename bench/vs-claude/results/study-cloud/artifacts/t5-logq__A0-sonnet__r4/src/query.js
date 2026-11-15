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

function tokenize(q) {
  const toks = [];
  const n = q.length;
  let i = 0;
  const isWs = (c) => /\s/.test(c);
  // returns {value, end} or null if unclosed
  function readQuoted(start) {
    let s = '';
    let k = start + 1;
    while (k < n) {
      const c = q[k];
      if (c === '\\' && k + 1 < n && (q[k + 1] === '"' || q[k + 1] === '\\')) {
        s += q[k + 1];
        k += 2;
      } else if (c === '"') return { value: s, end: k + 1 };
      else {
        s += c;
        k++;
      }
    }
    return null;
  }
  while (i < n) {
    const c = q[i];
    if (isWs(c)) { i++; continue; }
    if (c === '(') { toks.push({ t: 'LP', pos: i }); i++; continue; }
    if (c === ')') { toks.push({ t: 'RP', pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(i);
      if (!r) { toks.push({ t: 'ERR', pos: i }); return toks; }
      toks.push({ t: 'Q', pos: i, value: r.value });
      i = r.end;
      continue;
    }
    let j = i;
    while (j < n && !isWs(q[j]) && q[j] !== '(' && q[j] !== ')') {
      if (q[j] === '"' && j > i && q[j - 1] === ':') break;
      j++;
    }
    const text = q.slice(i, j);
    if (j < n && q[j] === '"' && text.endsWith(':')) {
      const r = readQuoted(j);
      if (!r) { toks.push({ t: 'ERR', pos: j }); return toks; }
      toks.push({ t: 'FQ', pos: i, field: text.slice(0, -1), value: r.value, valuePos: j });
      i = r.end;
      continue;
    }
    toks.push({ t: 'W', pos: i, text });
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
  return new RegExp('^(?:' + re + ')$', 'is');
}

function numeric(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function compile(query) {
  const q = query === undefined || query === null ? '' : String(query);
  const toks = tokenize(q);
  let p = 0;
  const end = q.length;

  const peek = () => {
    const t = toks[p];
    if (t && t.t === 'ERR') throw new QuerySyntaxError(t.pos);
    return t;
  };
  const isKw = (t, kw) => t && t.t === 'W' && t.text === kw;

  function startsPrimary(t) {
    if (!t) return false;
    if (t.t === 'RP') return false;
    if (t.t === 'W' && (t.text === 'AND' || t.text === 'OR')) return false;
    return true;
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
      else if (!startsPrimary(t)) break;
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
    if (!t) throw new QuerySyntaxError(end);
    if (t.t === 'LP') {
      p++;
      const e = parseOr();
      const c = peek();
      if (!c) throw new QuerySyntaxError(end);
      if (c.t !== 'RP') throw new QuerySyntaxError(c.pos);
      p++;
      return e;
    }
    if (t.t === 'RP') throw new QuerySyntaxError(t.pos);
    if (t.t === 'W' && (t.text === 'AND' || t.text === 'OR')) throw new QuerySyntaxError(t.pos);
    p++;
    return term(t);
  }

  function fieldMatcher(field, pos, matchFn) {
    if (!FIELD_RE.test(field)) throw new QuerySyntaxError(pos);
    return (r) => has(r, field) && r[field] !== null && r[field] !== undefined && matchFn(String(r[field]));
  }

  function term(t) {
    if (t.t === 'Q') return wordSearch(t.value);
    if (t.t === 'FQ') {
      const lv = t.value.toLowerCase();
      return fieldMatcher(t.field, t.pos, (s) => s.toLowerCase() === lv);
    }
    const text = t.text;
    const m = CMP_RE.exec(text);
    if (m) {
      const [, field, op, rhs] = m;
      if (!NUM_RE.test(rhs)) throw new QuerySyntaxError(t.pos + field.length + op.length);
      const n = Number(rhs);
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
    const ci = text.indexOf(':');
    if (ci >= 0) {
      const field = text.slice(0, ci);
      const value = text.slice(ci + 1);
      if (value === '') throw new QuerySyntaxError(t.pos + ci + 1);
      if (field === '_exists_') {
        if (!FIELD_RE.test(value)) throw new QuerySyntaxError(t.pos + ci + 1);
        return (r) => has(r, value) && r[value] !== null && r[value] !== undefined;
      }
      const re = wildcardRegex(value);
      return fieldMatcher(field, t.pos, (s) => re.test(s));
    }
    return wordSearch(text);
  }

  function wordSearch(w) {
    const lw = w.toLowerCase();
    return (r) => {
      let v;
      if (has(r, 'msg') && r.msg !== null && r.msg !== undefined) v = r.msg;
      else if (has(r, 'message') && r.message !== null && r.message !== undefined) v = r.message;
      else return false;
      return String(v).toLowerCase().includes(lw);
    };
  }

  if (toks.length === 0) return () => true;
  const fn = parseOr();
  const t = peek();
  if (t) throw new QuerySyntaxError(t.pos); // only a stray ')' can remain
  return (r) => !!fn(r);
}

module.exports = { compile, QuerySyntaxError };
