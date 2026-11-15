'use strict';

class QuerySyntaxError extends Error {
  constructor(position, detail) {
    super(`syntax error at position ${position}` + (detail ? `: ${detail}` : ''));
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)([\s\S]*)$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;

const has = (r, k) => Object.prototype.hasOwnProperty.call(r, k);

// Đọc chuỗi trong ngoặc kép bắt đầu tại i (q[i] === '"').
function readQuoted(q, i) {
  let out = '';
  let j = i + 1;
  while (j < q.length) {
    const c = q[j];
    if (c === '\\' && j + 1 < q.length && (q[j + 1] === '"' || q[j + 1] === '\\')) {
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
  const toks = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') {
      toks.push({ type: c, start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '"') {
      const r = readQuoted(q, i);
      toks.push({ type: 'quoted', value: r.value, start: i, end: r.end });
      i = r.end;
      continue;
    }
    // chunk trần; có thể chứa đoạn ngoặc kép (vd msg:"a b")
    const start = i;
    let text = '';
    const quotes = [];
    while (i < q.length && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"') {
        const r = readQuoted(q, i);
        quotes.push({ at: i - start, value: r.value });
        text += q.slice(i, r.end);
        i = r.end;
      } else {
        text += q[i++];
      }
    }
    toks.push({ type: 'word', text, start, end: i, quotes });
  }
  return toks;
}

function wildcardRe(v) {
  let s = '';
  for (const ch of v) {
    if (ch === '*') s += '[\\s\\S]*';
    else if (ch === '?') s += '[\\s\\S]';
    else s += ch.replace(/[.+^${}()|[\]\\\-/]/g, '\\$&');
  }
  return new RegExp('^' + s + '$', 'i');
}

function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function msgOf(r) {
  if (has(r, 'msg')) return r.msg;
  if (has(r, 'message')) return r.message;
  return undefined;
}

function substr(needle) {
  const n = needle.toLowerCase();
  return (r) => {
    const m = msgOf(r);
    if (m === undefined || m === null) return false;
    return String(m).toLowerCase().includes(n);
  };
}

function termFromWord(t) {
  const text = t.text;
  if (text.startsWith('_exists_:')) {
    const f = text.slice(9);
    if (f === '') throw new QuerySyntaxError(t.start + 9, 'missing field');
    return (r) => has(r, f) && r[f] !== null && r[f] !== undefined;
  }
  const cm = CMP_RE.exec(text);
  if (cm) {
    const field = cm[1];
    const op = cm[2];
    const rhs = cm[3];
    if (!NUM_RE.test(rhs)) {
      throw new QuerySyntaxError(t.start + field.length + op.length, 'expected number');
    }
    const n = Number(rhs);
    return (r) => {
      if (!has(r, field)) return false;
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
  const ci = text.indexOf(':');
  if (ci >= 0) {
    const field = text.slice(0, ci);
    if (!FIELD_RE.test(field)) throw new QuerySyntaxError(t.start, 'invalid field');
    const rest = text.slice(ci + 1);
    if (rest === '') throw new QuerySyntaxError(t.start + ci + 1, 'missing value');
    let re;
    if (rest[0] === '"') {
      const q = t.quotes.find((x) => x.at === ci + 1);
      const exact = (q ? q.value : rest).toLowerCase();
      re = { test: (s) => s.toLowerCase() === exact };
    } else {
      re = wildcardRe(rest);
    }
    return (r) => has(r, field) && r[field] !== null && r[field] !== undefined && re.test(String(r[field]));
  }
  return substr(text);
}

function parse(q) {
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];
  const isKw = (t, k) => t && t.type === 'word' && t.text === k;

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
    if (!t) throw new QuerySyntaxError(q.length, 'unexpected end');
    if (t.type === ')') throw new QuerySyntaxError(t.start, 'unexpected )');
    if (t.type === '(') {
      p++;
      const e = parseOr();
      if (!peek()) throw new QuerySyntaxError(q.length, 'missing )');
      p++; // ')'
      return e;
    }
    if (isKw(t, 'AND') || isKw(t, 'OR')) throw new QuerySyntaxError(t.start, 'unexpected ' + t.text);
    p++;
    if (t.type === 'quoted') return substr(t.value);
    return termFromWord(t);
  }

  if (toks.length === 0) return () => true;
  const f = parseOr();
  if (p < toks.length) throw new QuerySyntaxError(toks[p].start, 'unexpected token');
  return f;
}

function compile(query) {
  return parse(String(query === undefined || query === null ? '' : query));
}

module.exports = { compile, QuerySyntaxError };
