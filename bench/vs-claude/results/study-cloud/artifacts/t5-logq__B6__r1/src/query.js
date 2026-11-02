'use strict';

class QuerySyntaxError extends Error {
  constructor(position, detail) {
    super(`syntax error at position ${position}` + (detail ? `: ${detail}` : ''));
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

// Đọc chuỗi trong ngoặc kép bắt đầu tại i (q[i] === '"'); thoát \" và \\.
function readQuoted(q, i) {
  let out = '';
  let j = i + 1;
  while (j < q.length) {
    const c = q[j];
    if (c === '\\' && (q[j + 1] === '"' || q[j + 1] === '\\')) {
      out += q[j + 1];
      j += 2;
    } else if (c === '"') {
      return { value: out, end: j + 1 };
    } else {
      out += c;
      j++;
    }
  }
  throw new QuerySyntaxError(i, 'unterminated quote');
}

function tokenize(q) {
  const tokens = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') {
      tokens.push({ type: c, pos: i });
      i++;
      continue;
    }
    // token trần, có thể chứa đoạn "..." (vd msg:"a b")
    const start = i;
    while (i < q.length && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"') i = readQuoted(q, i).end;
      else i++;
    }
    tokens.push({ type: 'word', text: q.slice(start, i), pos: start });
  }
  tokens.push({ type: 'eof', pos: q.length });
  return tokens;
}

function wildcardRegex(v) {
  let re = '';
  for (const ch of v) {
    if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.+^${}()|[\]\\/-]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'i');
}

function present(rec, f) {
  return Object.prototype.hasOwnProperty.call(rec, f) && rec[f] !== null && rec[f] !== undefined;
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUMBER_RE.test(v)) return Number(v);
  return null;
}

function substrMatcher(s) {
  const needle = s.toLowerCase();
  return (rec) => {
    let m;
    if (present(rec, 'msg')) m = rec.msg;
    else if (present(rec, 'message')) m = rec.message;
    else return false;
    return String(m).toLowerCase().includes(needle);
  };
}

function termFromToken(t) {
  const text = t.text;
  if (text[0] === '"') {
    const r = readQuoted(text, 0);
    if (r.end !== text.length) throw new QuerySyntaxError(t.pos + r.end, 'unexpected text after quote');
    return substrMatcher(r.value);
  }
  const cm = CMP_RE.exec(text);
  const ci = text.indexOf(':');
  if (cm && (ci === -1 || cm[1].length < ci)) {
    const field = cm[1];
    const rest = text.slice(cm[0].length);
    if (!NUMBER_RE.test(rest)) throw new QuerySyntaxError(t.pos + cm[0].length, 'expected number');
    const n = Number(rest);
    const op = cm[2];
    return (rec) => {
      if (!present(rec, field)) return false;
      const v = toNum(rec[field]);
      if (v === null) return false;
      if (op === '>=') return v >= n;
      if (op === '<=') return v <= n;
      if (op === '>') return v > n;
      return v < n;
    };
  }
  if (ci !== -1) {
    const field = text.slice(0, ci);
    if (!FIELD_RE.test(field)) throw new QuerySyntaxError(t.pos, 'invalid field');
    const valPos = t.pos + ci + 1;
    const rest = text.slice(ci + 1);
    if (rest === '') throw new QuerySyntaxError(valPos, 'missing value');
    if (field === '_exists_') {
      if (!FIELD_RE.test(rest)) throw new QuerySyntaxError(valPos, 'invalid field');
      return (rec) => present(rec, rest);
    }
    if (rest[0] === '"') {
      const r = readQuoted(rest, 0);
      if (r.end !== rest.length) throw new QuerySyntaxError(valPos + r.end, 'unexpected text after quote');
      const want = r.value.toLowerCase();
      return (rec) => present(rec, field) && String(rec[field]).toLowerCase() === want;
    }
    const re = wildcardRegex(rest);
    return (rec) => present(rec, field) && re.test(String(rec[field]));
  }
  return substrMatcher(text);
}

function compile(query) {
  const q = String(query === undefined || query === null ? '' : query);
  if (q.trim() === '') return () => true;
  const tokens = tokenize(q);
  let p = 0;
  const peek = () => tokens[p];
  const isKw = (t, k) => t.type === 'word' && t.text === k;

  function parseOr() {
    const parts = [parseAnd()];
    while (isKw(peek(), 'OR')) {
      p++;
      parts.push(parseAnd());
    }
    if (parts.length === 1) return parts[0];
    return (rec) => parts.some((f) => f(rec));
  }

  function parseAnd() {
    const parts = [parseNot()];
    for (;;) {
      const t = peek();
      if (t.type === 'eof' || t.type === ')' || isKw(t, 'OR')) break;
      if (isKw(t, 'AND')) p++;
      parts.push(parseNot());
    }
    if (parts.length === 1) return parts[0];
    return (rec) => parts.every((f) => f(rec));
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
    const t = peek();
    if (t.type === 'eof') throw new QuerySyntaxError(q.length, 'unexpected end');
    if (t.type === ')') throw new QuerySyntaxError(t.pos, 'unexpected )');
    if (isKw(t, 'AND') || isKw(t, 'OR')) throw new QuerySyntaxError(t.pos, `unexpected ${t.text}`);
    if (t.type === '(') {
      p++;
      const inner = parseOr();
      if (peek().type !== ')') throw new QuerySyntaxError(q.length, 'missing )');
      p++;
      return inner;
    }
    p++;
    return termFromToken(t);
  }

  const f = parseOr();
  const t = peek();
  if (t.type !== 'eof') throw new QuerySyntaxError(t.pos, 'unexpected token');
  return f;
}

module.exports = { compile, QuerySyntaxError };
