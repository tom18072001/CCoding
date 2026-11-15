'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super(`syntax error at position ${position}`);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD = '[A-Za-z_@][A-Za-z0-9_.@-]*';
const CMP_RE = new RegExp(`^(${FIELD})(>=|<=|>|<)`);
const TERM_RE = new RegExp(`^(${FIELD}):`);
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

// Đọc chuỗi trong ngoặc kép bắt đầu tại s[i] === '"'. Trả { value, end } (end = sau '"' đóng).
function readQuoted(s, i) {
  let out = '';
  let j = i + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\' && (s[j + 1] === '"' || s[j + 1] === '\\')) {
      out += s[j + 1];
      j += 2;
    } else if (c === '"') {
      return { value: out, end: j + 1 };
    } else {
      out += c;
      j++;
    }
  }
  throw new QuerySyntaxError(i);
}

// Token: { type: '(' | ')' | 'AND' | 'OR' | 'NOT' | 'term', pos, test? }
function tokenize(q) {
  const tokens = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { tokens.push({ type: c, pos: i }); i++; continue; }
    const start = i;
    // đọc một chunk tới khoảng trắng/ngoặc; chuỗi ngoặc kép được nuốt trọn
    let raw = '';
    let quotedAt = -1;
    let quotedValue = null;
    while (i < q.length && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && quotedAt < 0) {
        const r = readQuoted(q, i);
        quotedAt = raw.length;
        quotedValue = r.value;
        raw += q.slice(i, r.end);
        i = r.end;
      } else {
        raw += q[i];
        i++;
      }
    }
    tokens.push(makeTerm(raw, start, quotedAt, quotedValue));
  }
  return tokens;
}

function makeTerm(raw, start, quotedAt, quotedValue) {
  if (raw === 'AND' || raw === 'OR' || raw === 'NOT') return { type: raw, pos: start };
  if (quotedAt === 0) {
    return { type: 'term', pos: start, test: containsTest(quotedValue) };
  }
  if (raw.startsWith('_exists_:')) {
    const f = raw.slice(9);
    if (f === '') throw new QuerySyntaxError(start + 9);
    return { type: 'term', pos: start, test: (r) => has(r, f) && r[f] !== null };
  }
  let m = CMP_RE.exec(raw);
  if (m) {
    const opEnd = m[0].length;
    const rhs = raw.slice(opEnd);
    if (!NUMBER_RE.test(rhs)) throw new QuerySyntaxError(start + opEnd);
    return { type: 'term', pos: start, test: cmpTest(m[1], m[2], Number(rhs)) };
  }
  m = TERM_RE.exec(raw);
  if (m) {
    const field = m[1];
    const vStart = m[0].length;
    if (vStart === raw.length) throw new QuerySyntaxError(start + vStart);
    if (quotedAt === vStart) {
      const want = quotedValue.toLowerCase();
      return {
        type: 'term',
        pos: start,
        test: (r) => has(r, field) && r[field] !== null && String(r[field]).toLowerCase() === want,
      };
    }
    const re = globToRegExp(raw.slice(vStart));
    return {
      type: 'term',
      pos: start,
      test: (r) => has(r, field) && r[field] !== null && re.test(String(r[field])),
    };
  }
  if (raw.includes(':')) throw new QuerySyntaxError(start);
  return { type: 'term', pos: start, test: containsTest(raw) };
}

function has(r, f) {
  return r !== null && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, f);
}

function globToRegExp(g) {
  let src = '';
  for (const ch of g) {
    if (ch === '*') src += '[\\s\\S]*';
    else if (ch === '?') src += '[\\s\\S]';
    else src += ch.replace(/[.+^${}()|[\]\\\-/]/g, '\\$&');
  }
  return new RegExp(`^${src}$`, 'i');
}

function containsTest(text) {
  const needle = text.toLowerCase();
  return (r) => {
    if (r === null || typeof r !== 'object') return false;
    let v;
    if (has(r, 'msg')) v = r.msg;
    else if (has(r, 'message')) v = r.message;
    else return false;
    if (v === null || v === undefined) return false;
    return String(v).toLowerCase().includes(needle);
  };
}

function cmpTest(field, op, n) {
  return (r) => {
    if (!has(r, field)) return false;
    let v = r[field];
    if (typeof v === 'string') {
      if (!NUMBER_RE.test(v)) return false;
      v = Number(v);
    } else if (typeof v !== 'number') return false;
    switch (op) {
      case '>=': return v >= n;
      case '<=': return v <= n;
      case '>': return v > n;
      default: return v < n;
    }
  };
}

function compile(query) {
  const q = query === undefined || query === null ? '' : String(query);
  const tokens = tokenize(q);
  if (tokens.length === 0) return () => true;
  let p = 0;
  const peek = () => tokens[p];

  function parseOr() {
    let node = parseAnd();
    while (peek() && peek().type === 'OR') {
      p++;
      const l = node;
      const r = parseAnd();
      node = (rec) => l(rec) || r(rec);
    }
    return node;
  }

  function parseAnd() {
    let node = parseNot();
    for (;;) {
      const t = peek();
      if (!t || t.type === 'OR' || t.type === ')') break;
      if (t.type === 'AND') p++;
      const l = node;
      const r = parseNot();
      node = (rec) => l(rec) && r(rec);
    }
    return node;
  }

  function parseNot() {
    const t = peek();
    if (t && t.type === 'NOT') {
      p++;
      const inner = parseNot();
      return (rec) => !inner(rec);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    if (!t) throw new QuerySyntaxError(q.length);
    if (t.type === 'AND' || t.type === 'OR' || t.type === ')') throw new QuerySyntaxError(t.pos);
    if (t.type === '(') {
      p++;
      const inner = parseOr();
      if (!peek()) throw new QuerySyntaxError(q.length);
      p++; // token kế tiếp chắc chắn là ')'
      return inner;
    }
    p++;
    return t.test;
  }

  const fn = parseOr();
  if (p < tokens.length) throw new QuerySyntaxError(tokens[p].pos); // ')' thừa
  return (rec) => fn(rec) === true;
}

module.exports = { compile, QuerySyntaxError };
