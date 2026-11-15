'use strict';

class QuerySyntaxError extends Error {
  constructor(position, detail) {
    super('syntax error at position ' + position + (detail ? ': ' + detail : ''));
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD = '[A-Za-z_@][A-Za-z0-9_.@-]*';
const FIELD_COLON_RE = new RegExp('^(' + FIELD + '):(.*)$', 's');
const FIELD_ONLY_COLON_RE = new RegExp('^' + FIELD + ':$');
const CMP_RE = new RegExp('^(' + FIELD + ')(>=|<=|>|<)(.*)$', 's');
const NUM_RE = /^-?\d+(\.\d+)?$/;
const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\v' || c === '\f';

// Trả về { value, end } hoặc null nếu không đóng.
function readQuoted(s, start) {
  let i = start + 1;
  let out = '';
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      const d = s[i + 1];
      if (d === '"' || d === '\\') out += d;
      else out += c + d;
      i += 2;
    } else if (c === '"') {
      return { value: out, end: i + 1 };
    } else { out += c; i++; }
  }
  return null;
}

function tokenize(s) {
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (isWs(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ type: c, pos: i }); i++; continue; }
    const pos = i;
    let text = '';
    let quoted = null;
    while (i < s.length) {
      const d = s[i];
      if (isWs(d) || d === '(' || d === ')') break;
      if (d === '"' && (text === '' || FIELD_ONLY_COLON_RE.test(text))) {
        const q = readQuoted(s, i);
        if (!q) { toks.push({ type: 'ERR', pos: i, detail: 'unterminated string' }); return toks; }
        quoted = q.value;
        i = q.end;
        break;
      }
      text += d;
      i++;
    }
    toks.push({ type: 'T', pos, text, quoted });
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

function has(rec, f) {
  return Object.prototype.hasOwnProperty.call(rec, f) && rec[f] !== null && rec[f] !== undefined;
}

function toNum(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function compile(query) {
  query = String(query === undefined || query === null ? '' : query);
  const toks = tokenize(query);
  if (toks.length === 0) return () => true;
  let p = 0;
  const len = query.length;
  const peek = () => toks[p];
  const isKw = (t, kw) => t && t.type === 'T' && t.quoted === null && t.text === kw;

  function parseOr() {
    const parts = [parseAnd()];
    while (isKw(peek(), 'OR')) {
      p++;
      parts.push(parseAnd());
    }
    if (parts.length === 1) return parts[0];
    return (r) => parts.some((f) => f(r));
  }

  function parseAnd() {
    const parts = [parseNot()];
    for (;;) {
      const t = peek();
      if (!t || t.type === ')' || isKw(t, 'OR')) break;
      if (isKw(t, 'AND')) p++;
      parts.push(parseNot());
    }
    if (parts.length === 1) return parts[0];
    return (r) => parts.every((f) => f(r));
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
    if (!t) throw new QuerySyntaxError(len, 'unexpected end of query');
    if (t.type === 'ERR') throw new QuerySyntaxError(t.pos, t.detail);
    if (t.type === ')') throw new QuerySyntaxError(t.pos, 'unexpected ")"');
    if (t.type === '(') {
      p++;
      const e = parseOr();
      const c = peek();
      if (!c) throw new QuerySyntaxError(len, 'missing ")"');
      if (c.type !== ')') throw new QuerySyntaxError(c.pos, 'unexpected token');
      p++;
      return e;
    }
    if (isKw(t, 'AND') || isKw(t, 'OR')) throw new QuerySyntaxError(t.pos, 'unexpected ' + t.text);
    p++;
    return parseTerm(t);
  }

  function substr(r, needle) {
    let v;
    if (has(r, 'msg')) v = r.msg;
    else if (has(r, 'message')) v = r.message;
    else return false;
    return String(v).toLowerCase().includes(needle);
  }

  function parseTerm(t) {
    const { text, quoted, pos } = t;
    if (quoted !== null) {
      if (text === '') {
        const needle = quoted.toLowerCase();
        return (r) => substr(r, needle);
      }
      // text là "FIELD:" và quoted là giá trị
      const field = text.slice(0, -1);
      if (field === '_exists_') return (r) => has(r, quoted);
      const want = quoted.toLowerCase();
      return (r) => has(r, field) && String(r[field]).toLowerCase() === want;
    }
    if (text.startsWith('_exists_:')) {
      const f = text.slice(9);
      if (f === '') throw new QuerySyntaxError(pos + 9, 'missing field');
      return (r) => has(r, f);
    }
    let m = FIELD_COLON_RE.exec(text);
    if (m) {
      const field = m[1];
      const val = m[2];
      if (val === '') throw new QuerySyntaxError(pos + field.length + 1, 'missing value');
      const re = wildcardRe(val);
      return (r) => has(r, field) && re.test(String(r[field]));
    }
    m = CMP_RE.exec(text);
    if (m) {
      const field = m[1];
      const op = m[2];
      const rhs = m[3];
      if (!NUM_RE.test(rhs)) throw new QuerySyntaxError(pos + field.length + op.length, 'expected number');
      const n = Number(rhs);
      return (r) => {
        if (!Object.prototype.hasOwnProperty.call(r, field)) return false;
        const v = toNum(r[field]);
        if (v === null) return false;
        switch (op) {
          case '>=': return v >= n;
          case '<=': return v <= n;
          case '>': return v > n;
          default: return v < n;
        }
      };
    }
    if (text.includes(':')) throw new QuerySyntaxError(pos, 'invalid term');
    const needle = text.toLowerCase();
    return (r) => substr(r, needle);
  }

  const result = parseOr();
  if (p < toks.length) {
    throw new QuerySyntaxError(toks[p].pos, 'unexpected token');
  }
  return result;
}

module.exports = { compile, QuerySyntaxError };
