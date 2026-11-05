'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super(`syntax error at position ${position}`);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const FIELD_PREFIX = '[A-Za-z_@][A-Za-z0-9_.@-]*';
const FIELD_RE = new RegExp('^' + FIELD_PREFIX + '$');
const COLON_RE = new RegExp('^(' + FIELD_PREFIX + '):');
const CMP_RE = new RegExp('^(' + FIELD_PREFIX + ')(>=|<=|>|<)');
const NUM_RE = /^-?\d+(\.\d+)?$/;

// Đọc chuỗi trong ngoặc kép bắt đầu tại s[i] === '"'. Trả { value, end } hoặc null nếu không đóng.
function readQuoted(s, i) {
  let v = '';
  let j = i + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\' && j + 1 < s.length && (s[j + 1] === '"' || s[j + 1] === '\\')) {
      v += s[j + 1];
      j += 2;
    } else if (c === '"') {
      return { value: v, end: j + 1 };
    } else {
      v += c;
      j++;
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
    if (c === '(') { toks.push({ type: 'lparen', pos: i }); i++; continue; }
    if (c === ')') { toks.push({ type: 'rparen', pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ type: 'bad', pos: i }); break; }
      toks.push({ type: 'quoted', pos: i, value: r.value });
      i = r.end;
      continue;
    }
    const start = i;
    while (i < n && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && q[i - 1] === ':' && i > start) break;
      i++;
    }
    const text = q.slice(start, i);
    const tok = { type: 'word', pos: start, text };
    if (i < n && q[i] === '"' && text.endsWith(':')) {
      const r = readQuoted(q, i);
      if (!r) { tok.badQuote = i; i = n; }
      else { tok.quoted = r.value; i = r.end; }
    }
    toks.push(tok);
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

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function makeTerm(tok, len) {
  const text = tok.text;
  if (tok.badQuote !== undefined) throw new QuerySyntaxError(tok.badQuote);

  if (text.startsWith('_exists_:') && (text.length > 9)) {
    const field = text.slice(9);
    if (!FIELD_RE.test(field)) throw new QuerySyntaxError(tok.pos + 9);
    return (r) => has(r, field) && r[field] !== null && r[field] !== undefined;
  }

  const cm = CMP_RE.exec(text);
  if (cm) {
    const field = cm[1];
    const op = cm[2];
    const rest = text.slice(cm[0].length);
    if (!NUM_RE.test(rest)) throw new QuerySyntaxError(tok.pos + cm[0].length);
    const num = Number(rest);
    return (r) => {
      if (!has(r, field)) return false;
      const v = toNum(r[field]);
      if (v === null) return false;
      if (op === '>=') return v >= num;
      if (op === '<=') return v <= num;
      if (op === '>') return v > num;
      return v < num;
    };
  }

  const fm = COLON_RE.exec(text);
  if (fm) {
    const field = fm[1];
    const afterColon = tok.pos + fm[0].length;
    if (tok.quoted !== undefined) {
      if (text.length !== fm[0].length) throw new QuerySyntaxError(afterColon);
      const want = tok.quoted.toLowerCase();
      return (r) => has(r, field) && r[field] != null && String(r[field]).toLowerCase() === want;
    }
    const val = text.slice(fm[0].length);
    if (val === '') throw new QuerySyntaxError(afterColon);
    const re = wildcardRe(val);
    return (r) => has(r, field) && r[field] != null && re.test(String(r[field]));
  }

  if (text.includes(':')) throw new QuerySyntaxError(tok.pos);
  return substringTerm(text);
}

function substringTerm(s) {
  const needle = s.toLowerCase();
  return (r) => {
    const v = has(r, 'msg') ? r.msg : has(r, 'message') ? r.message : null;
    if (v === null || v === undefined) return false;
    return String(v).toLowerCase().includes(needle);
  };
}

const isKw = (t, kw) => t && t.type === 'word' && t.text === kw && t.quoted === undefined && t.badQuote === undefined;

function compile(query) {
  const q = String(query === undefined || query === null ? '' : query);
  const toks = tokenize(q);
  if (toks.length === 0) return () => true;
  const len = q.length;
  let p = 0;

  function parseOr() {
    let left = parseAnd();
    while (isKw(toks[p], 'OR')) {
      p++;
      const right = parseAnd();
      const l = left;
      left = (r) => l(r) || right(r);
    }
    return left;
  }

  function parseAnd() {
    let left = parseNot();
    for (;;) {
      const t = toks[p];
      if (!t || t.type === 'rparen' || isKw(t, 'OR')) break;
      if (isKw(t, 'AND')) p++;
      const right = parseNot();
      const l = left;
      left = (r) => l(r) && right(r);
    }
    return left;
  }

  function parseNot() {
    if (isKw(toks[p], 'NOT')) {
      p++;
      const inner = parseNot();
      return (r) => !inner(r);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = toks[p];
    if (!t) throw new QuerySyntaxError(len);
    if (t.type === 'bad') throw new QuerySyntaxError(t.pos);
    if (t.type === 'rparen') throw new QuerySyntaxError(t.pos);
    if (isKw(t, 'AND') || isKw(t, 'OR')) throw new QuerySyntaxError(t.pos);
    if (t.type === 'lparen') {
      p++;
      const e = parseOr();
      const c = toks[p];
      if (!c || c.type !== 'rparen') throw new QuerySyntaxError(c ? c.pos : len);
      p++;
      return e;
    }
    p++;
    if (t.type === 'quoted') return substringTerm(t.value);
    return makeTerm(t, len);
  }

  const fn = parseOr();
  if (p < toks.length) throw new QuerySyntaxError(toks[p].pos);
  return fn;
}

module.exports = { compile, QuerySyntaxError };
