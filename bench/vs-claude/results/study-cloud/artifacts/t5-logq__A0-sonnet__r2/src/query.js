'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super(`syntax error at position ${position}`);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Tokenizer: tokens {type, pos, text, ...}
function tokenize(q) {
  const toks = [];
  const n = q.length;
  let i = 0;
  // returns {value, end} or null if unclosed
  function readQuoted(start) {
    let out = '';
    let j = start + 1;
    while (j < n) {
      const c = q[j];
      if (c === '\\' && j + 1 < n && (q[j + 1] === '"' || q[j + 1] === '\\')) {
        out += q[j + 1];
        j += 2;
      } else if (c === '"') {
        return { value: out, end: j + 1 };
      } else {
        out += c;
        j++;
      }
    }
    return null;
  }
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ type: c, pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(i);
      if (!r) { toks.push({ type: 'bad', pos: i }); break; }
      toks.push({ type: 'quoted', pos: i, value: r.value });
      i = r.end;
      continue;
    }
    let j = i;
    while (j < n && !/\s/.test(q[j]) && q[j] !== '(' && q[j] !== ')') {
      if (q[j] === '"' && q[j - 1] === ':') break;
      j++;
    }
    const text = q.slice(i, j);
    if (j < n && q[j] === '"') {
      // FIELD:"quoted"
      const r = readQuoted(j);
      if (!r) { toks.push({ type: 'bad', pos: j }); break; }
      toks.push({ type: 'word', pos: i, text, quoted: r.value, end: r.end });
      i = r.end;
      continue;
    }
    toks.push({ type: 'word', pos: i, text });
    i = j;
  }
  return toks;
}

function wildcardRe(v) {
  let re = '';
  for (const ch of v) {
    if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'i');
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function compile(query) {
  const q = String(query);
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];
  const isKw = (t, kw) => t && t.type === 'word' && t.quoted === undefined && t.text === kw;

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

  function parseAnd() {
    let left = parseNot();
    for (;;) {
      const t = peek();
      if (!t || t.type === ')' || isKw(t, 'OR')) break;
      if (isKw(t, 'AND')) p++;
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
    if (!t) throw new QuerySyntaxError(q.length);
    if (t.type === 'bad') throw new QuerySyntaxError(t.pos);
    if (t.type === ')') throw new QuerySyntaxError(t.pos);
    if (t.type === '(') {
      p++;
      const e = parseOr();
      const c = peek();
      if (!c) throw new QuerySyntaxError(q.length);
      if (c.type === 'bad') throw new QuerySyntaxError(c.pos);
      if (c.type !== ')') throw new QuerySyntaxError(c.pos);
      p++;
      return e;
    }
    if (isKw(t, 'AND') || isKw(t, 'OR') || isKw(t, 'NOT')) throw new QuerySyntaxError(t.pos);
    p++;
    if (t.type === 'quoted') return textTerm(t.value);
    return wordTerm(t);
  }

  function textTerm(sub) {
    const needle = sub.toLowerCase();
    return (r) => {
      let v;
      if (has(r, 'msg') && r.msg != null) v = r.msg;
      else if (has(r, 'message') && r.message != null) v = r.message;
      else return false;
      return String(v).toLowerCase().includes(needle);
    };
  }

  function wordTerm(t) {
    const text = t.text;
    const cm = t.quoted === undefined ? CMP_RE.exec(text) : null;
    if (cm) {
      const field = cm[1];
      const op = cm[2];
      const rhs = text.slice(cm[0].length);
      if (!NUM_RE.test(rhs)) throw new QuerySyntaxError(t.pos + cm[0].length);
      const num = Number(rhs);
      return (r) => {
        if (!has(r, field)) return false;
        const v = toNum(r[field]);
        if (v === null) return false;
        switch (op) {
          case '>=': return v >= num;
          case '<=': return v <= num;
          case '>': return v > num;
          default: return v < num;
        }
      };
    }
    const ci = text.indexOf(':');
    if (ci < 0) return textTerm(text);
    const field = text.slice(0, ci);
    if (!FIELD_RE.test(field)) throw new QuerySyntaxError(t.pos);
    const valuePos = t.pos + ci + 1;
    const isQuoted = t.quoted !== undefined;
    const rest = isQuoted ? t.quoted : text.slice(ci + 1);
    if (!isQuoted && rest === '') throw new QuerySyntaxError(valuePos);
    if (isQuoted && ci + 1 !== text.length) throw new QuerySyntaxError(valuePos);
    if (field === '_exists_') {
      return (r) => has(r, rest) && r[rest] != null;
    }
    if (isQuoted) {
      const want = rest.toLowerCase();
      return (r) => has(r, field) && r[field] != null && String(r[field]).toLowerCase() === want;
    }
    const re = wildcardRe(rest);
    return (r) => has(r, field) && r[field] != null && re.test(String(r[field]));
  }

  if (toks.length === 0) return () => true;
  const fn = parseOr();
  const t = peek();
  if (t) throw new QuerySyntaxError(t.pos);
  return fn;
}

module.exports = { compile, QuerySyntaxError };
