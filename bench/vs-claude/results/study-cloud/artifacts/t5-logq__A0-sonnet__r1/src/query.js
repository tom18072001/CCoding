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
const isWs = (c) => /\s/.test(c);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Đọc chuỗi trong ngoặc kép bắt đầu tại start (query[start] === '"').
// Trả { value, end } hoặc null nếu không đóng.
function readQuoted(q, start) {
  let s = '';
  let i = start + 1;
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
  return null;
}

function tokenize(q) {
  const toks = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (isWs(c)) { i++; continue; }
    if (c === '(') { toks.push({ type: 'lp', pos: i }); i++; continue; }
    if (c === ')') { toks.push({ type: 'rp', pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ type: 'bad', pos: i }); break; }
      toks.push({ type: 'quoted', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    const start = i;
    let quotedTerm = null;
    while (i < q.length && !isWs(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && q[i - 1] === ':') {
        const r = readQuoted(q, i);
        if (!r) { toks.push({ type: 'bad', pos: i }); return toks; }
        quotedTerm = { value: r.value, qpos: i };
        i = r.end;
        break;
      }
      i++;
    }
    const text = q.slice(start, i);
    if (quotedTerm) {
      toks.push({ type: 'fieldq', field: q.slice(start, quotedTerm.qpos - 1), value: quotedTerm.value, pos: start, text });
    } else {
      toks.push({ type: 'word', text, pos: start });
    }
  }
  return toks;
}

function wildcardRegex(v) {
  let re = '';
  for (const ch of v) {
    if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.+^${}()|[\]\\\/]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'iu');
}

function numeric(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

const present = (r, f) => has(r, f) && r[f] !== null && r[f] !== undefined;

function matchExact(value) {
  const lower = value.toLowerCase();
  return (r, f) => present(r, f) && String(r[f]).toLowerCase() === lower;
}

function fieldTerm(field, value, quoted) {
  if (quoted) {
    const m = matchExact(value);
    return (r) => m(r, field);
  }
  const re = wildcardRegex(value);
  return (r) => present(r, field) && re.test(String(r[field]));
}

function textTerm(text) {
  const lower = text.toLowerCase();
  return (r) => {
    let v;
    if (present(r, 'msg')) v = r.msg;
    else if (present(r, 'message')) v = r.message;
    else return false;
    return String(v).toLowerCase().includes(lower);
  };
}

function compile(query) {
  query = String(query);
  const toks = tokenize(query);
  let p = 0;
  const peek = () => toks[p];
  const isKw = (t, kw) => t && t.type === 'word' && t.text === kw;
  const fail = (pos) => { throw new QuerySyntaxError(pos); };

  function word(t) {
    const text = t.text;
    const m = CMP_RE.exec(text);
    if (m) {
      const [, field, op, rest] = m;
      if (!NUM_RE.test(rest)) fail(t.pos + field.length + op.length);
      const n = Number(rest);
      return (r) => {
        const v = has(r, field) ? numeric(r[field]) : null;
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
      if (!FIELD_RE.test(field)) fail(t.pos);
      if (value === '') fail(t.pos + ci + 1);
      if (field === '_exists_') return (r) => present(r, value);
      return fieldTerm(field, value, false);
    }
    return textTerm(text);
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

  function startsPrimary(t) {
    return t && t.type !== 'rp' && !isKw(t, 'OR') && !isKw(t, 'AND');
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
    if (isKw(peek(), 'NOT')) {
      p++;
      const inner = parseNot();
      return (r) => !inner(r);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    if (!t) fail(query.length);
    switch (t.type) {
      case 'bad': return fail(t.pos);
      case 'rp': return fail(t.pos);
      case 'lp': {
        p++;
        const n = peek();
        if (!n) fail(query.length);
        if (n.type === 'rp') fail(n.pos);
        const e = parseOr();
        const c = peek();
        if (!c) fail(query.length);
        if (c.type !== 'rp') fail(c.pos);
        p++;
        return e;
      }
      case 'quoted': p++; return textTerm(t.value);
      case 'fieldq': {
        if (!FIELD_RE.test(t.field)) fail(t.pos);
        p++;
        if (t.field === '_exists_') { const f = t.value; return (r) => present(r, f); }
        return fieldTerm(t.field, t.value, true);
      }
      default:
        if (t.text === 'AND' || t.text === 'OR') fail(t.pos);
        p++;
        return word(t);
    }
  }

  if (toks.length === 0) return () => true;
  const fn = parseOr();
  if (p < toks.length) fail(toks[p].pos);
  return fn;
}

module.exports = { compile, QuerySyntaxError };
