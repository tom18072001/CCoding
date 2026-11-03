'use strict';

class QuerySyntaxError extends Error {
  constructor(position, detail) {
    super('syntax error at position ' + position + (detail ? ': ' + detail : ''));
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

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

function escRe(c) {
  return c.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
}

function globToRegex(v) {
  let src = '';
  for (const c of v) src += c === '*' ? '[\\s\\S]*' : c === '?' ? '[\\s\\S]' : escRe(c);
  return new RegExp('^' + src + '$', 'i');
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function wordTerm(text) {
  const needle = text.toLowerCase();
  return (r) => {
    const v = r.msg !== undefined ? r.msg : r.message;
    if (v == null) return false;
    return String(v).toLowerCase().includes(needle);
  };
}

function makeTerm(word, pos) {
  const m = FIELD_RE.exec(word);
  if (m) {
    const field = m[0];
    const rest = word.slice(field.length);
    if (rest[0] === ':') {
      const vpos = pos + field.length + 1;
      const value = rest.slice(1);
      if (field === '_exists_') {
        const fm = FIELD_RE.exec(value);
        if (!fm || fm[0] !== value) throw new QuerySyntaxError(vpos, 'expected field name');
        return (r) => r[value] != null;
      }
      if (value === '') throw new QuerySyntaxError(vpos, 'missing value');
      const re = globToRegex(value);
      return (r) => r[field] != null && re.test(String(r[field]));
    }
    const cm = /^(>=|<=|>|<)/.exec(rest);
    if (cm) {
      const op = cm[1];
      const num = rest.slice(op.length);
      if (!NUM_RE.test(num)) throw new QuerySyntaxError(pos + field.length + op.length, 'expected number');
      const n = Number(num);
      return (r) => {
        const v = toNum(r[field]);
        if (v === null) return false;
        return op === '>=' ? v >= n : op === '<=' ? v <= n : op === '>' ? v > n : v < n;
      };
    }
  }
  if (word.includes(':')) throw new QuerySyntaxError(pos, 'invalid term');
  return wordTerm(word);
}

function tokenize(q) {
  const toks = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (isWs(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ t: c, pos: i }); i++; continue; }
    const start = i;
    let word = '';
    let quoted = null;
    while (i < q.length && !isWs(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && (i === start || word.endsWith(':'))) {
        quoted = readQuoted(q, i);
        i = quoted.end;
        break;
      }
      word += q[i++];
    }
    if (quoted) {
      let fn;
      if (word === '') fn = wordTerm(quoted.value);
      else {
        const m = FIELD_RE.exec(word);
        if (!m || m[0] !== word.slice(0, -1) || m[0] === '_exists_') throw new QuerySyntaxError(start, 'invalid term');
        const field = m[0];
        const lit = quoted.value.toLowerCase();
        fn = (r) => r[field] != null && String(r[field]).toLowerCase() === lit;
      }
      toks.push({ t: 'term', pos: start, fn });
    } else if (word === 'AND' || word === 'OR' || word === 'NOT') {
      toks.push({ t: word, pos: start });
    } else {
      toks.push({ t: 'term', pos: start, fn: makeTerm(word, start) });
    }
  }
  return toks;
}

function compile(query) {
  const q = String(query);
  const toks = tokenize(q);
  if (toks.length === 0) return () => true;
  let p = 0;
  const peek = () => toks[p];

  function parseOr() {
    const parts = [parseAnd()];
    while (peek() && peek().t === 'OR') { p++; parts.push(parseAnd()); }
    return parts.length === 1 ? parts[0] : (r) => parts.some((f) => f(r));
  }
  function parseAnd() {
    const parts = [parseNot()];
    for (;;) {
      const t = peek();
      if (!t) break;
      if (t.t === 'AND') { p++; parts.push(parseNot()); }
      else if (t.t === 'term' || t.t === '(' || t.t === 'NOT') parts.push(parseNot());
      else break;
    }
    return parts.length === 1 ? parts[0] : (r) => parts.every((f) => f(r));
  }
  function parseNot() {
    const t = peek();
    if (t && t.t === 'NOT') {
      p++;
      const f = parseNot();
      return (r) => !f(r);
    }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = peek();
    if (!t) throw new QuerySyntaxError(q.length, 'unexpected end');
    if (t.t === 'term') { p++; return t.fn; }
    if (t.t === '(') {
      p++;
      const f = parseOr();
      if (!peek()) throw new QuerySyntaxError(q.length, 'missing )');
      p++;
      return f;
    }
    throw new QuerySyntaxError(t.pos, 'unexpected ' + t.t);
  }

  const f = parseOr();
  if (p < toks.length) throw new QuerySyntaxError(toks[p].pos, 'unexpected ' + toks[p].t);
  return (r) => f(r) === true;
}

module.exports = { compile, QuerySyntaxError };
