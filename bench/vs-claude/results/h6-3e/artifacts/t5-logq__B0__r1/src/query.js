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

// Đọc chuỗi trong ngoặc kép bắt đầu tại start (query[start] === '"').
// Trả { value, end } (end = chỉ số sau dấu đóng) hoặc null nếu không đóng.
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
  return null;
}

function tokenize(q) {
  const toks = [];
  let i = 0;
  const isWs = (c) => /\s/.test(c);
  while (i < q.length) {
    const c = q[i];
    if (isWs(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ type: c, pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ type: 'err', pos: i }); break; }
      toks.push({ type: 'quoted', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    const start = i;
    while (i < q.length && !isWs(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && q[i - 1] === ':' && i > start) break;
      i++;
    }
    const text = q.slice(start, i);
    if (i < q.length && q[i] === '"') {
      // text kết thúc bằng ':' và theo sau là chuỗi trích dẫn
      const r = readQuoted(q, i);
      if (!r) { toks.push({ type: 'err', pos: i }); break; }
      toks.push({ type: 'fieldq', text, value: r.value, pos: start, qpos: i });
      i = r.end;
      continue;
    }
    toks.push({ type: 'word', text, pos: start });
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
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function present(r, f) {
  return Object.prototype.hasOwnProperty.call(r, f) && r[f] !== null && r[f] !== undefined;
}

function compile(query) {
  const q = String(query);
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];
  const isKw = (t, kw) => t && t.type === 'word' && t.text === kw;

  function term(t) {
    if (t.type === 'quoted') return msgContains(t.value);
    if (t.type === 'fieldq') {
      const field = t.text.slice(0, -1);
      if (!FIELD_RE.test(field)) throw new QuerySyntaxError(t.pos);
      const want = t.value.toLowerCase();
      if (field === '_exists_') throw new QuerySyntaxError(t.qpos);
      return (r) => present(r, field) && String(r[field]).toLowerCase() === want;
    }
    const text = t.text;
    const cm = CMP_RE.exec(text);
    if (cm) {
      const field = cm[1];
      const op = cm[2];
      if (!NUM_RE.test(cm[3])) throw new QuerySyntaxError(t.pos + field.length + op.length);
      const n = Number(cm[3]);
      return (r) => {
        const v = toNum(r[field]);
        if (v === null) return false;
        if (op === '>=') return v >= n;
        if (op === '<=') return v <= n;
        if (op === '>') return v > n;
        return v < n;
      };
    }
    const ci = text.indexOf(':');
    if (ci >= 0) {
      const field = text.slice(0, ci);
      const value = text.slice(ci + 1);
      if (!FIELD_RE.test(field)) throw new QuerySyntaxError(t.pos);
      if (value === '') throw new QuerySyntaxError(t.pos + ci + 1);
      if (field === '_exists_') return (r) => present(r, value);
      const re = wildcardRegex(value);
      return (r) => present(r, field) && re.test(String(r[field]));
    }
    return msgContains(text);
  }

  function msgContains(s) {
    const want = s.toLowerCase();
    return (r) => {
      const m = present(r, 'msg') ? r.msg : present(r, 'message') ? r.message : undefined;
      if (m === undefined) return false;
      return String(m).toLowerCase().includes(want);
    };
  }

  function parseOr() {
    let left = parseAnd();
    while (isKw(peek(), 'OR')) {
      p++;
      const l = left;
      const right = parseAnd();
      left = (r) => l(r) || right(r);
    }
    return left;
  }

  function parseAnd() {
    let left = parseNot();
    for (;;) {
      const t = peek();
      if (isKw(t, 'AND')) p++;
      else if (!t || t.type === ')' || isKw(t, 'OR')) break;
      const l = left;
      const right = parseNot();
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
    return primary();
  }

  function primary() {
    const t = peek();
    if (!t) throw new QuerySyntaxError(q.length);
    if (t.type === 'err' || t.type === ')') throw new QuerySyntaxError(t.pos);
    if (isKw(t, 'AND') || isKw(t, 'OR')) throw new QuerySyntaxError(t.pos);
    if (t.type === '(') {
      p++;
      const e = parseOr();
      const c = peek();
      if (!c) throw new QuerySyntaxError(q.length);
      if (c.type !== ')') throw new QuerySyntaxError(c.pos);
      p++;
      return e;
    }
    p++;
    return term(t);
  }

  if (toks.length === 0) return () => true;
  const fn = parseOr();
  if (p < toks.length) throw new QuerySyntaxError(toks[p].pos);
  return fn;
}

module.exports = { compile, QuerySyntaxError };
