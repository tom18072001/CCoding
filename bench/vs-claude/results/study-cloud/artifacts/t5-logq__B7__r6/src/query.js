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
const FIELD_COLON_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*:$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const nn = (v) => v !== null && v !== undefined;

function readQuoted(q, start) {
  // q[start] === '"'; trả về { value, end } hoặc null nếu không đóng
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
  const n = q.length;
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') {
      toks.push({ t: c, pos: i });
      i++;
      continue;
    }
    if (c === '"') {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ t: 'bad', pos: i }); break; }
      toks.push({ t: 'quoted', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    const start = i;
    while (i < n && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && FIELD_COLON_RE.test(q.slice(start, i + 0))) break;
      i++;
    }
    const text = q.slice(start, i);
    if (i < n && q[i] === '"') {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ t: 'bad', pos: i }); break; }
      toks.push({ t: 'fieldq', field: text.slice(0, -1), value: r.value, pos: start });
      i = r.end;
      continue;
    }
    toks.push({ t: 'word', text, pos: start });
  }
  return toks;
}

function globRegex(v) {
  let src = '';
  for (const ch of v) {
    if (ch === '*') src += '[\\s\\S]*';
    else if (ch === '?') src += '[\\s\\S]';
    else src += ch.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^' + src + '$', 'i');
}

function numOf(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function compile(query) {
  const q = String(query);
  const toks = tokenize(q);
  let p = 0;
  const peek = () => {
    const t = toks[p];
    if (t && t.t === 'bad') throw new QuerySyntaxError(t.pos);
    return t;
  };
  const isKw = (t, kw) => t && t.t === 'word' && t.text === kw;

  function substring(s) {
    const needle = s.toLowerCase();
    return (r) => {
      let m;
      if (has(r, 'msg') && nn(r.msg)) m = r.msg;
      else if (has(r, 'message') && nn(r.message)) m = r.message;
      else return false;
      return String(m).toLowerCase().includes(needle);
    };
  }

  function term(t) {
    p++;
    if (t.t === 'quoted') return substring(t.value);
    if (t.t === 'fieldq') {
      const want = t.value.toLowerCase();
      const field = t.field;
      return (r) => has(r, field) && nn(r[field]) && String(r[field]).toLowerCase() === want;
    }
    const text = t.text;
    const cm = CMP_RE.exec(text);
    if (cm) {
      const field = cm[1], op = cm[2], rest = cm[3];
      if (!NUM_RE.test(rest)) throw new QuerySyntaxError(t.pos + field.length + op.length);
      const n = Number(rest);
      return (r) => {
        if (!has(r, field)) return false;
        const v = numOf(r[field]);
        if (v === null) return false;
        return op === '>=' ? v >= n : op === '<=' ? v <= n : op === '>' ? v > n : v < n;
      };
    }
    const ci = text.indexOf(':');
    if (ci >= 0) {
      const field = text.slice(0, ci);
      const value = text.slice(ci + 1);
      if (!FIELD_RE.test(field)) throw new QuerySyntaxError(t.pos);
      if (value === '') throw new QuerySyntaxError(t.pos + ci + 1);
      if (field === '_exists_') {
        if (!FIELD_RE.test(value)) throw new QuerySyntaxError(t.pos + ci + 1);
        return (r) => has(r, value) && nn(r[value]);
      }
      const re = globRegex(value);
      return (r) => has(r, field) && nn(r[field]) && re.test(String(r[field]));
    }
    return substring(text);
  }

  function primary() {
    const t = peek();
    if (!t) throw new QuerySyntaxError(q.length);
    if (t.t === ')') throw new QuerySyntaxError(t.pos);
    if (isKw(t, 'AND') || isKw(t, 'OR')) throw new QuerySyntaxError(t.pos);
    if (t.t === '(') {
      p++;
      const e = orExpr();
      const c = peek();
      if (!c) throw new QuerySyntaxError(q.length);
      p++; // chỉ có thể là ')'
      return e;
    }
    return term(t);
  }

  function notExpr() {
    if (isKw(peek(), 'NOT')) {
      p++;
      const e = notExpr();
      return (r) => !e(r);
    }
    return primary();
  }

  function andExpr() {
    const parts = [notExpr()];
    while (true) {
      const t = peek();
      if (!t || t.t === ')' || isKw(t, 'OR')) break;
      if (isKw(t, 'AND')) p++;
      parts.push(notExpr());
    }
    return (r) => parts.every((f) => f(r));
  }

  function orExpr() {
    const parts = [andExpr()];
    while (isKw(peek(), 'OR')) {
      p++;
      parts.push(andExpr());
    }
    return (r) => parts.some((f) => f(r));
  }

  if (toks.length === 0) return () => true;
  const f = orExpr();
  const t = peek();
  if (t) throw new QuerySyntaxError(t.pos); // ')' thừa
  return f;
}

module.exports = { compile, QuerySyntaxError };
