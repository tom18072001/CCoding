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

function has(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function readQuoted(q, start) {
  let i = start + 1;
  let s = '';
  while (i < q.length) {
    const c = q[i];
    if (c === '\\' && i + 1 < q.length && (q[i + 1] === '"' || q[i + 1] === '\\')) {
      s += q[i + 1];
      i += 2;
    } else if (c === '"') {
      return { value: s, end: i + 1 };
    } else {
      s += c;
      i++;
    }
  }
  throw new QuerySyntaxError(start);
}

function tokenize(q) {
  const toks = [];
  let i = 0;
  const n = q.length;
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ t: c, pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(q, i);
      toks.push({ t: 'quoted', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    const start = i;
    while (i < n && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && q[i - 1] === ':' && i > start + 1) break;
      i++;
    }
    const text = q.slice(start, i);
    if (i < n && q[i] === '"') {
      const r = readQuoted(q, i);
      toks.push({ t: 'fieldquoted', field: text.slice(0, -1), value: r.value, pos: start });
      i = r.end;
      continue;
    }
    toks.push({ t: 'word', text, pos: start });
  }
  return toks;
}

function globToRegExp(v) {
  let re = '';
  for (const ch of v) {
    if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.+^${}()|[\]\\/-]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'i');
}

function numeric(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function fieldValue(rec, f) {
  return has(rec, f) ? rec[f] : undefined;
}

function eqTerm(field, value, wildcard) {
  let test;
  if (wildcard) {
    const re = globToRegExp(value);
    test = (s) => re.test(s);
  } else {
    const lv = value.toLowerCase();
    test = (s) => s.toLowerCase() === lv;
  }
  return (rec) => {
    const v = fieldValue(rec, field);
    if (v === undefined || v === null) return false;
    return test(String(v));
  };
}

function cmpTerm(field, op, n) {
  return (rec) => {
    const x = numeric(fieldValue(rec, field));
    if (x === null) return false;
    switch (op) {
      case '>=': return x >= n;
      case '<=': return x <= n;
      case '>': return x > n;
      default: return x < n;
    }
  };
}

function wordTerm(text) {
  const lt = text.toLowerCase();
  return (rec) => {
    let v = fieldValue(rec, 'msg');
    if (v === undefined) v = fieldValue(rec, 'message');
    if (v === undefined || v === null) return false;
    return String(v).toLowerCase().includes(lt);
  };
}

function compile(query) {
  const q = String(query === undefined || query === null ? '' : query);
  const toks = tokenize(q);
  if (toks.length === 0) return () => true;
  let p = 0;
  const isKw = (tk, kw) => tk && tk.t === 'word' && tk.text === kw;
  const peek = () => toks[p];

  function startsOperand(tk) {
    if (!tk) return false;
    if (tk.t === '(' || tk.t === 'quoted' || tk.t === 'fieldquoted') return true;
    if (tk.t === 'word') return tk.text !== 'AND' && tk.text !== 'OR';
    return false;
  }

  function parseOr() {
    let left = parseAnd();
    while (isKw(peek(), 'OR')) {
      p++;
      const l = left;
      const r = parseAnd();
      left = (rec) => l(rec) || r(rec);
    }
    return left;
  }

  function parseAnd() {
    let left = parseNot();
    for (;;) {
      const tk = peek();
      if (isKw(tk, 'AND')) p++;
      else if (!startsOperand(tk)) break;
      const l = left;
      const r = parseNot();
      left = (rec) => l(rec) && r(rec);
    }
    return left;
  }

  function parseNot() {
    if (isKw(peek(), 'NOT')) {
      p++;
      const inner = parseNot();
      return (rec) => !inner(rec);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const tk = peek();
    if (!tk) throw new QuerySyntaxError(q.length);
    if (tk.t === ')') throw new QuerySyntaxError(tk.pos);
    if (tk.t === '(') {
      p++;
      const e = parseOr();
      const close = peek();
      if (!close) throw new QuerySyntaxError(q.length);
      if (close.t !== ')') throw new QuerySyntaxError(close.pos);
      p++;
      return e;
    }
    p++;
    if (tk.t === 'quoted') return wordTerm(tk.value);
    if (tk.t === 'fieldquoted') {
      if (!FIELD_RE.test(tk.field)) throw new QuerySyntaxError(tk.pos);
      return eqTerm(tk.field, tk.value, false);
    }
    const text = tk.text;
    if (text === 'AND' || text === 'OR') throw new QuerySyntaxError(tk.pos);
    const m = CMP_RE.exec(text);
    if (m) {
      const afterOp = tk.pos + m[1].length + m[2].length;
      if (!NUM_RE.test(m[3])) throw new QuerySyntaxError(afterOp);
      return cmpTerm(m[1], m[2], Number(m[3]));
    }
    const ci = text.indexOf(':');
    if (ci === -1) return wordTerm(text);
    const field = text.slice(0, ci);
    const value = text.slice(ci + 1);
    if (value === '') throw new QuerySyntaxError(tk.pos + ci + 1);
    if (field === '_exists_') {
      if (!FIELD_RE.test(value)) throw new QuerySyntaxError(tk.pos + ci + 1);
      return (rec) => {
        const v = fieldValue(rec, value);
        return v !== undefined && v !== null;
      };
    }
    if (!FIELD_RE.test(field)) throw new QuerySyntaxError(tk.pos);
    return eqTerm(field, value, true);
  }

  const result = parseOr();
  if (p < toks.length) throw new QuerySyntaxError(toks[p].pos);
  return result;
}

module.exports = { compile, QuerySyntaxError };
