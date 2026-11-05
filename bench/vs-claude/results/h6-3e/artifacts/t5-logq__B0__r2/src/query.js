'use strict';

class QuerySyntaxError extends Error {
  constructor(position, detail) {
    super('syntax error at position ' + position + (detail ? ': ' + detail : ''));
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)(.*)$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function readQuoted(q, start) {
  // q[start] === '"'; trả về { value, end } với end là chỉ số sau dấu đóng
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
  throw new QuerySyntaxError(start, 'unterminated string');
}

function tokenize(q) {
  const toks = [];
  let i = 0;
  const n = q.length;
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '(' || c === ')') {
      toks.push({ type: c, pos: i });
      i++;
    } else if (c === '"') {
      const r = readQuoted(q, i);
      toks.push({ type: 'quoted', pos: i, value: r.value });
      i = r.end;
    } else {
      const start = i;
      let text = '';
      let done = false;
      while (i < n && !done) {
        const d = q[i];
        if (/\s/.test(d) || d === '(' || d === ')') break;
        if (d === '"' && !(text.endsWith(':') && text.length > 1)) break; // dấu " giữa từ mở QUOTED mới
        if (d === '"') {
          const r = readQuoted(q, i);
          toks.push({ type: 'fieldq', pos: start, field: text.slice(0, -1), value: r.value, colon: start + text.length - 1 });
          i = r.end;
          done = true;
        } else {
          text += d;
          i++;
        }
      }
      if (!done) toks.push({ type: 'word', pos: start, text });
    }
  }
  return toks;
}

function wildcardRegex(v) {
  let re = '';
  for (const ch of v) {
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'isu');
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function compile(query) {
  const q = query === undefined || query === null ? '' : String(query);
  const toks = tokenize(q);
  if (toks.length === 0) return () => true;
  let p = 0;
  const isKw = (t, kw) => t && t.type === 'word' && t.text === kw;

  function parseOr() {
    let left = parseAnd();
    const parts = [left];
    while (isKw(toks[p], 'OR')) {
      p++;
      parts.push(parseAnd());
    }
    if (parts.length === 1) return left;
    return (r) => parts.some((f) => f(r));
  }

  function parseAnd() {
    const parts = [parseNot()];
    for (;;) {
      const t = toks[p];
      if (!t || t.type === ')' || isKw(t, 'OR')) break;
      if (isKw(t, 'AND')) p++;
      parts.push(parseNot());
    }
    if (parts.length === 1) return parts[0];
    return (r) => parts.every((f) => f(r));
  }

  function parseNot() {
    if (isKw(toks[p], 'NOT')) {
      p++;
      const f = parseNot();
      return (r) => !f(r);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = toks[p];
    if (!t) throw new QuerySyntaxError(q.length, 'unexpected end of query');
    if (t.type === '(') {
      p++;
      const f = parseOr();
      const c = toks[p];
      if (!c) throw new QuerySyntaxError(q.length, 'missing )');
      if (c.type !== ')') throw new QuerySyntaxError(c.pos, 'unexpected token');
      p++;
      return f;
    }
    if (t.type === ')') throw new QuerySyntaxError(t.pos, 'unexpected )');
    if (t.type === 'quoted') {
      p++;
      return substringMatcher(t.value);
    }
    if (t.type === 'fieldq') {
      if (!FIELD_RE.test(t.field)) throw new QuerySyntaxError(t.pos, 'invalid field');
      p++;
      const want = t.value.toLowerCase();
      const field = t.field;
      return (r) => has(r, field) && r[field] !== null && r[field] !== undefined && String(r[field]).toLowerCase() === want;
    }
    // word
    const text = t.text;
    if (text === 'AND' || text === 'OR') throw new QuerySyntaxError(t.pos, 'unexpected ' + text);
    p++;
    if (text.startsWith('_exists_:')) {
      const field = text.slice(9);
      if (field === '') throw new QuerySyntaxError(t.pos + 9, 'missing field');
      if (!FIELD_RE.test(field)) throw new QuerySyntaxError(t.pos + 9, 'invalid field');
      return (r) => has(r, field) && r[field] !== null && r[field] !== undefined;
    }
    const m = CMP_RE.exec(text);
    if (m) {
      const [, field, op, rhs] = m;
      const numPos = t.pos + field.length + op.length;
      if (!NUM_RE.test(rhs)) throw new QuerySyntaxError(numPos, 'expected number');
      const n = Number(rhs);
      return (r) => {
        if (!has(r, field)) return false;
        const v = toNum(r[field]);
        if (v === null) return false;
        if (op === '>=') return v >= n;
        if (op === '<=') return v <= n;
        if (op === '>') return v > n;
        return v < n;
      };
    }
    const idx = text.indexOf(':');
    if (idx >= 0) {
      const field = text.slice(0, idx);
      const value = text.slice(idx + 1);
      if (!FIELD_RE.test(field)) throw new QuerySyntaxError(t.pos, 'invalid field');
      if (value === '') throw new QuerySyntaxError(t.pos + idx + 1, 'missing value');
      const re = wildcardRegex(value);
      return (r) => has(r, field) && r[field] !== null && r[field] !== undefined && re.test(String(r[field]));
    }
    return substringMatcher(text);
  }

  function substringMatcher(s) {
    const needle = s.toLowerCase();
    return (r) => {
      const v = has(r, 'msg') ? r.msg : r.message;
      if (v === undefined || v === null) return false;
      return String(v).toLowerCase().includes(needle);
    };
  }

  const f = parseOr();
  if (p < toks.length) {
    const t = toks[p];
    throw new QuerySyntaxError(t.pos, 'unexpected token');
  }
  return (r) => f(r) === true;
}

module.exports = { compile, QuerySyntaxError };
