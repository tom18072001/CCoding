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
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function readQuoted(q, start) {
  // q[start] === '"'; trả về { value, end } hoặc null nếu không đóng
  let i = start + 1;
  let buf = '';
  while (i < q.length) {
    const c = q[i];
    if (c === '\\' && i + 1 < q.length) {
      const d = q[i + 1];
      if (d === '"') buf += '"';
      else if (d === '\\') buf += '\\';
      else buf += '\\' + d;
      i += 2;
    } else if (c === '"') {
      return { value: buf, end: i + 1 };
    } else {
      buf += c;
      i++;
    }
  }
  return null;
}

function tokenize(q) {
  const toks = [];
  let i = 0;
  const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  while (i < q.length) {
    const c = q[i];
    if (isWs(c)) { i++; continue; }
    if (c === '(') { toks.push({ t: 'lp', pos: i }); i++; continue; }
    if (c === ')') { toks.push({ t: 'rp', pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ t: 'err', pos: i }); return toks; }
      toks.push({ t: 'quoted', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    const start = i;
    let j = i;
    let done = false;
    while (j < q.length) {
      const d = q[j];
      if (isWs(d) || d === '(' || d === ')') break;
      if (d === '"' && q[j - 1] === ':' && FIELD_RE.test(q.slice(start, j - 1))) {
        const r = readQuoted(q, j);
        if (!r) { toks.push({ t: 'err', pos: j }); return toks; }
        toks.push({ t: 'fieldq', field: q.slice(start, j - 1), value: r.value, pos: start });
        j = r.end;
        done = true;
        break;
      }
      j++;
    }
    if (!done) toks.push({ t: 'word', text: q.slice(start, j), pos: start });
    i = j;
  }
  return toks;
}

function wildcardRe(v) {
  let src = '';
  for (const ch of v) {
    if (ch === '*') src += '.*';
    else if (ch === '?') src += '.';
    else src += ch.replace(/[.+^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^(?:' + src + ')$', 'is');
}

function toNum(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function present(r, f) {
  return has(r, f) && r[f] !== null && r[f] !== undefined;
}

function matchField(field, matcher) {
  return (r) => present(r, field) && matcher(String(r[field]));
}

function searchText(text) {
  const needle = text.toLowerCase();
  return (r) => {
    let v;
    if (present(r, 'msg')) v = r.msg;
    else if (present(r, 'message')) v = r.message;
    else return false;
    return String(v).toLowerCase().includes(needle);
  };
}

function compile(query) {
  const q = String(query === undefined || query === null ? '' : query);
  const toks = tokenize(q);
  if (toks.length === 0) return () => true;
  let p = 0;
  const peek = () => toks[p];
  const isKw = (t, k) => t && t.t === 'word' && t.text === k;
  const isKeyword = (t) => isKw(t, 'AND') || isKw(t, 'OR') || isKw(t, 'NOT');

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

  function startsOperand(t) {
    if (!t) return false;
    if (t.t === 'rp') return false;
    if (isKw(t, 'OR')) return false;
    return true;
  }

  function parseAnd() {
    let left = parseNot();
    for (;;) {
      const t = peek();
      if (isKw(t, 'AND')) {
        p++;
        const right = parseNot();
        const l = left;
        left = (r) => l(r) && right(r);
      } else if (startsOperand(t)) {
        const right = parseNot();
        const l = left;
        left = (r) => l(r) && right(r);
      } else break;
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
    if (t.t === 'err') throw new QuerySyntaxError(t.pos);
    if (t.t === 'rp') throw new QuerySyntaxError(t.pos);
    if (isKeyword(t) && t.text !== 'NOT') throw new QuerySyntaxError(t.pos);
    if (t.t === 'lp') {
      p++;
      const e = parseOr();
      const c = peek();
      if (!c) throw new QuerySyntaxError(q.length);
      if (c.t === 'err') throw new QuerySyntaxError(c.pos);
      p++; // rp
      return e;
    }
    if (t.t === 'quoted') {
      p++;
      return searchText(t.value);
    }
    if (t.t === 'fieldq') {
      p++;
      const target = t.value.toLowerCase();
      return matchField(t.field, (s) => s.toLowerCase() === target);
    }
    // word
    p++;
    const text = t.text;
    const cm = CMP_RE.exec(text);
    if (cm) {
      const [, field, op, rhs] = cm;
      if (!NUM_RE.test(rhs)) throw new QuerySyntaxError(t.pos + field.length + op.length);
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
      const value = text.slice(ci + 1);
      if (!FIELD_RE.test(field)) throw new QuerySyntaxError(t.pos);
      if (value === '') throw new QuerySyntaxError(t.pos + ci + 1);
      if (field === '_exists_') {
        return (r) => present(r, value);
      }
      const re = wildcardRe(value);
      return matchField(field, (s) => re.test(s));
    }
    return searchText(text);
  }

  const fn = parseOr();
  const rest = peek();
  if (rest) {
    if (rest.t === 'err') throw new QuerySyntaxError(rest.pos);
    throw new QuerySyntaxError(rest.pos);
  }
  return fn;
}

module.exports = { compile, QuerySyntaxError };
