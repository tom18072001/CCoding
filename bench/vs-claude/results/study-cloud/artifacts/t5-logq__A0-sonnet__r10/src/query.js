'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super(`syntax error at position ${position}`);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function readQuoted(q, start) {
  // q[start] === '"'; returns { value, end } or null if unclosed
  let out = '';
  let i = start + 1;
  while (i < q.length) {
    const c = q[i];
    if (c === '\\' && i + 1 < q.length) {
      const d = q[i + 1];
      if (d === '"' || d === '\\') out += d;
      else out += c + d;
      i += 2;
    } else if (c === '"') return { value: out, end: i + 1 };
    else { out += c; i++; }
  }
  return null;
}

function tokenize(q) {
  const toks = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ type: c, pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ type: 'badquote', pos: i }); i = q.length; continue; }
      toks.push({ type: 'quoted', pos: i, value: r.value });
      i = r.end;
      continue;
    }
    const start = i;
    while (i < q.length && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && q[i - 1] === ':' && i > start) break;
      i++;
    }
    const text = q.slice(start, i);
    if (i < q.length && q[i] === '"') {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ type: 'badquote', pos: i }); i = q.length; continue; }
      toks.push({ type: 'fieldq', pos: start, text, value: r.value });
      i = r.end;
      continue;
    }
    toks.push({ type: 'word', pos: start, text });
  }
  return toks;
}

function wildcardRe(v) {
  let re = '';
  for (const ch of v) {
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else re += ch.replace(/[.+^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'is');
}

function present(r, f) { return has(r, f) && r[f] !== null && r[f] !== undefined; }

function fieldMatcher(field, test) {
  return (r) => present(r, field) && test(String(r[field]));
}

function termFromWord(tok) {
  const t = tok.text;
  if (t.startsWith('_exists_:')) {
    const field = t.slice(9);
    if (field === '') throw new QuerySyntaxError(tok.pos + 9);
    return (r) => present(r, field);
  }
  const m = CMP_RE.exec(t);
  if (m) {
    const opEnd = m[0].length;
    const rest = t.slice(opEnd);
    if (!NUM_RE.test(rest)) throw new QuerySyntaxError(tok.pos + opEnd);
    const n = Number(rest);
    const field = m[1];
    const op = m[2];
    return (r) => {
      if (!has(r, field)) return false;
      const v = r[field];
      let x;
      if (typeof v === 'number') x = v;
      else if (typeof v === 'string' && NUM_RE.test(v)) x = Number(v);
      else return false;
      if (op === '>') return x > n;
      if (op === '>=') return x >= n;
      if (op === '<') return x < n;
      return x <= n;
    };
  }
  const ci = t.indexOf(':');
  if (ci >= 0) {
    const field = t.slice(0, ci);
    if (!FIELD_RE.test(field)) throw new QuerySyntaxError(tok.pos);
    const value = t.slice(ci + 1);
    if (value === '') throw new QuerySyntaxError(tok.pos + ci + 1);
    const re = wildcardRe(value);
    return fieldMatcher(field, (s) => re.test(s));
  }
  return wordMatcher(t);
}

function wordMatcher(w) {
  const needle = w.toLowerCase();
  return (r) => {
    const f = present(r, 'msg') ? 'msg' : present(r, 'message') ? 'message' : null;
    if (!f) return false;
    return String(r[f]).toLowerCase().includes(needle);
  };
}

function compile(query) {
  query = String(query === undefined || query === null ? '' : query);
  const toks = tokenize(query);
  if (toks.length === 0) return () => true;
  let p = 0;
  const isKw = (t, k) => t && t.type === 'word' && t.text === k;
  const isKeyword = (t) => t && t.type === 'word' && (t.text === 'AND' || t.text === 'OR' || t.text === 'NOT');

  function orExpr() {
    let left = andExpr();
    const parts = [left];
    while (isKw(toks[p], 'OR')) {
      p++;
      parts.push(andExpr());
    }
    if (parts.length === 1) return left;
    return (r) => parts.some((f) => f(r));
  }
  function startsOperand(t) {
    if (!t) return false;
    if (t.type === ')' || t.type === 'badquote') return t.type === 'badquote';
    if (t.type === 'word') return t.text !== 'OR';
    return true;
  }
  function andExpr() {
    const parts = [notExpr()];
    for (;;) {
      const t = toks[p];
      if (isKw(t, 'AND')) { p++; parts.push(notExpr()); }
      else if (startsOperand(t)) parts.push(notExpr());
      else break;
    }
    if (parts.length === 1) return parts[0];
    return (r) => parts.every((f) => f(r));
  }
  function notExpr() {
    if (isKw(toks[p], 'NOT')) {
      p++;
      const inner = notExpr();
      return (r) => !inner(r);
    }
    return primary();
  }
  function primary() {
    const t = toks[p];
    if (!t) throw new QuerySyntaxError(query.length);
    if (t.type === 'badquote') throw new QuerySyntaxError(t.pos);
    if (t.type === ')') throw new QuerySyntaxError(t.pos);
    if (t.type === '(') {
      p++;
      const e = orExpr();
      const c = toks[p];
      if (!c) throw new QuerySyntaxError(query.length);
      if (c.type === 'badquote') throw new QuerySyntaxError(c.pos);
      if (c.type !== ')') throw new QuerySyntaxError(c.pos);
      p++;
      return e;
    }
    if (isKeyword(t)) {
      // AND / OR in operand position (NOT handled by notExpr)
      throw new QuerySyntaxError(t.pos);
    }
    p++;
    if (t.type === 'quoted') return wordMatcher(t.value);
    if (t.type === 'fieldq') {
      if (!t.text.endsWith(':') || !FIELD_RE.test(t.text.slice(0, -1))) throw new QuerySyntaxError(t.pos);
      const want = t.value.toLowerCase();
      return fieldMatcher(t.text.slice(0, -1), (s) => s.toLowerCase() === want);
    }
    return termFromWord(t);
  }

  const f = orExpr();
  if (p < toks.length) {
    const t = toks[p];
    throw new QuerySyntaxError(t.pos);
  }
  return f;
}

module.exports = { compile, QuerySyntaxError };
