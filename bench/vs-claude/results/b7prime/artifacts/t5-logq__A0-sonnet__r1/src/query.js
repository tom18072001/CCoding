'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super('syntax error at position ' + position);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const NUM_RE = /^-?\d+(\.\d+)?$/;
const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*/;
const has = (r, k) => Object.prototype.hasOwnProperty.call(r, k);
const present = (r, k) => has(r, k) && r[k] !== null && r[k] !== undefined;

function tokenize(q) {
  const toks = [];
  const n = q.length;
  const isWs = (c) => /\s/.test(c);
  const readQuoted = (start) => {
    let i = start + 1;
    let s = '';
    while (i < n) {
      const c = q[i];
      if (c === '\\' && i + 1 < n && (q[i + 1] === '"' || q[i + 1] === '\\')) { s += q[i + 1]; i += 2; }
      else if (c === '"') return { value: s, end: i + 1 };
      else { s += c; i++; }
    }
    throw new QuerySyntaxError(start);
  };
  let i = 0;
  while (i < n) {
    const c = q[i];
    if (isWs(c)) { i++; continue; }
    if (c === '(') { toks.push({ t: 'LP', pos: i }); i++; continue; }
    if (c === ')') { toks.push({ t: 'RP', pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(i);
      toks.push({ t: 'Q', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    let j = i;
    while (j < n && !isWs(q[j]) && q[j] !== '(' && q[j] !== ')' && q[j] !== '"') j++;
    const text = q.slice(i, j);
    const tok = { t: 'W', text, pos: i };
    if (j < n && q[j] === '"' && text.endsWith(':')) {
      const r = readQuoted(j);
      tok.quoted = r.value;
      j = r.end;
    }
    toks.push(tok);
    i = j;
  }
  return toks;
}

function wildcard(v) {
  let re = '';
  for (const ch of v) {
    if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'i');
}

function toNum(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function makeTerm(tok, len) {
  if (tok.t === 'Q') {
    const needle = tok.value.toLowerCase();
    return freeText(needle);
  }
  const text = tok.text;
  const m = FIELD_RE.exec(text);
  if (m) {
    const field = m[0];
    const rest = text.slice(field.length);
    if (rest[0] === ':') {
      const valuePart = rest.slice(1);
      const afterColon = tok.pos + field.length + 1;
      if (field === '_exists_') {
        const name = tok.quoted !== undefined ? tok.quoted : valuePart;
        if (name === '' && tok.quoted === undefined) throw new QuerySyntaxError(afterColon);
        return (r) => present(r, name);
      }
      if (tok.quoted !== undefined) {
        const want = tok.quoted.toLowerCase();
        return (r) => present(r, field) && String(r[field]).toLowerCase() === want;
      }
      if (valuePart === '') throw new QuerySyntaxError(afterColon);
      const re = wildcard(valuePart);
      return (r) => present(r, field) && re.test(String(r[field]));
    }
    const cm = /^(>=|<=|>|<)/.exec(rest);
    if (cm) {
      const op = cm[1];
      const rhs = rest.slice(op.length);
      if (!NUM_RE.test(rhs)) throw new QuerySyntaxError(tok.pos + field.length + op.length);
      const n = Number(rhs);
      return (r) => {
        if (!has(r, field)) return false;
        const v = toNum(r[field]);
        if (v === null) return false;
        return op === '>=' ? v >= n : op === '<=' ? v <= n : op === '>' ? v > n : v < n;
      };
    }
  }
  if (text.includes(':')) throw new QuerySyntaxError(tok.pos);
  return freeText(text.toLowerCase());
}

function freeText(needle) {
  return (r) => {
    let v;
    if (present(r, 'msg')) v = r.msg;
    else if (present(r, 'message')) v = r.message;
    else return false;
    return String(v).toLowerCase().includes(needle);
  };
}

function compile(query) {
  if (typeof query !== 'string') throw new TypeError('query must be a string');
  const toks = tokenize(query);
  if (toks.length === 0) return () => true;
  const len = query.length;
  let p = 0;
  const peek = () => toks[p];
  const isKw = (t, kw) => t && t.t === 'W' && t.text === kw && t.quoted === undefined;

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
  function startsPrimary(t) {
    return t && t.t !== 'RP' && !isKw(t, 'OR');
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
    if (!t) throw new QuerySyntaxError(len);
    if (t.t === 'RP') throw new QuerySyntaxError(t.pos);
    if (isKw(t, 'AND') || isKw(t, 'OR')) throw new QuerySyntaxError(t.pos);
    if (t.t === 'LP') {
      p++;
      const e = parseOr();
      const c = peek();
      if (!c) throw new QuerySyntaxError(len);
      if (c.t !== 'RP') throw new QuerySyntaxError(c.pos);
      p++;
      return e;
    }
    p++;
    return makeTerm(t);
  }

  const fn = parseOr();
  if (p < toks.length) throw new QuerySyntaxError(toks[p].pos);
  return (record) => fn(record) === true;
}

module.exports = { compile, QuerySyntaxError };
