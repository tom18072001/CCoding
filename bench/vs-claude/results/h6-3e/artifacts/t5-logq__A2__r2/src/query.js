'use strict';

class QuerySyntaxError extends Error {
  constructor(position, detail) {
    super('syntax error at position ' + position + (detail ? ': ' + detail : ''));
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD = '[A-Za-z_@][A-Za-z0-9_.@-]*';
const FIELD_ONLY_RE = new RegExp('^' + FIELD + '$');
const FIELD_VALUE_RE = new RegExp('^(' + FIELD + '):([\\s\\S]*)$');
const CMP_RE = new RegExp('^(' + FIELD + ')(>=|<=|>|<)([\\s\\S]*)$');
const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function tokenize(q) {
  const tokens = [];
  const n = q.length;
  let i = 0;
  const readQuoted = (start) => {
    let s = '';
    let j = start + 1;
    while (j < n) {
      const c = q[j];
      if (c === '\\' && (q[j + 1] === '"' || q[j + 1] === '\\')) {
        s += q[j + 1];
        j += 2;
      } else if (c === '"') {
        return { value: s, end: j + 1 };
      } else {
        s += c;
        j++;
      }
    }
    return null;
  };
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { tokens.push({ type: 'lparen', pos: i }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rparen', pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(i);
      if (!r) { tokens.push({ type: 'badquote', pos: i }); break; }
      tokens.push({ type: 'quoted', pos: i, text: r.value });
      i = r.end;
      continue;
    }
    let j = i;
    while (j < n && !/\s/.test(q[j]) && q[j] !== '(' && q[j] !== ')') {
      if (q[j] === '"' && q[j - 1] === ':' && FIELD_VALUE_RE.test(q.slice(i, j))) break;
      j++;
    }
    const word = q.slice(i, j);
    const m = FIELD_VALUE_RE.exec(word);
    if (m && m[2] === '' && q[j] === '"') {
      const r = readQuoted(j);
      if (!r) { tokens.push({ type: 'badquote', pos: j }); break; }
      tokens.push({ type: 'fieldquoted', pos: i, field: m[1], text: r.value });
      i = r.end;
      continue;
    }
    tokens.push({ type: 'word', pos: i, text: word });
    i = j;
  }
  tokens.push({ type: 'eof', pos: n });
  return tokens;
}

function wildcardRegex(v) {
  let re = '';
  for (const ch of v) {
    if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'i');
}

function numeric(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUMBER_RE.test(v)) return Number(v);
  return null;
}

function compile(query) {
  const q = query == null ? '' : String(query);
  if (q.trim() === '') return () => true;
  const tokens = tokenize(q);
  let p = 0;
  const peek = () => tokens[p];
  const isKw = (t, kw) => t.type === 'word' && t.text === kw;

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
      if (isKw(t, 'AND')) {
        p++;
      } else if (t.type === 'eof' || t.type === 'rparen' || isKw(t, 'OR')) {
        break;
      }
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
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    switch (t.type) {
      case 'eof':
        throw new QuerySyntaxError(q.length, 'unexpected end of query');
      case 'rparen':
        throw new QuerySyntaxError(t.pos, 'unexpected ")"');
      case 'badquote':
        throw new QuerySyntaxError(t.pos, 'unterminated quote');
      case 'lparen': {
        p++;
        const e = parseOr();
        if (peek().type !== 'rparen') throw new QuerySyntaxError(q.length, 'missing ")"');
        p++;
        return e;
      }
      case 'quoted':
        p++;
        return searchMsg(t.text);
      case 'fieldquoted': {
        p++;
        const lower = t.text.toLowerCase();
        const field = t.field;
        return (r) => has(r, field) && r[field] != null && String(r[field]).toLowerCase() === lower;
      }
      default:
        return parseWord(t);
    }
  }

  function parseWord(t) {
    const w = t.text;
    if (w === 'AND' || w === 'OR') throw new QuerySyntaxError(t.pos, 'unexpected ' + w);
    p++;
    if (w.startsWith('_exists_:')) {
      const field = w.slice(9);
      if (!FIELD_ONLY_RE.test(field)) throw new QuerySyntaxError(t.pos + 9, 'expected field name');
      return (r) => has(r, field) && r[field] != null;
    }
    let m = CMP_RE.exec(w);
    if (m) {
      const field = m[1], op = m[2], rhs = m[3];
      if (!NUMBER_RE.test(rhs)) {
        throw new QuerySyntaxError(t.pos + field.length + op.length, 'expected number');
      }
      const n = Number(rhs);
      return (r) => {
        if (!has(r, field)) return false;
        const v = numeric(r[field]);
        if (v === null) return false;
        if (op === '>=') return v >= n;
        if (op === '<=') return v <= n;
        if (op === '>') return v > n;
        return v < n;
      };
    }
    m = FIELD_VALUE_RE.exec(w);
    if (m) {
      const field = m[1], value = m[2];
      if (value === '') throw new QuerySyntaxError(t.pos + field.length + 1, 'expected value');
      const re = wildcardRegex(value);
      return (r) => has(r, field) && r[field] != null && re.test(String(r[field]));
    }
    if (w.includes(':')) throw new QuerySyntaxError(t.pos, 'invalid field');
    return searchMsg(w);
  }

  function searchMsg(text) {
    const needle = text.toLowerCase();
    return (r) => {
      const v = has(r, 'msg') && r.msg != null ? r.msg : has(r, 'message') ? r.message : null;
      if (v == null) return false;
      return String(v).toLowerCase().includes(needle);
    };
  }

  const result = parseOr();
  const t = peek();
  if (t.type === 'rparen') throw new QuerySyntaxError(t.pos, 'unexpected ")"');
  if (t.type !== 'eof') throw new QuerySyntaxError(t.pos);
  return result;
}

module.exports = { compile, QuerySyntaxError };
