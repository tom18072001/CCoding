'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super(`syntax error at position ${position}`);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD = '[A-Za-z_@][A-Za-z0-9_.@-]*';
const FIELD_COLON_RE = new RegExp('^(' + FIELD + '):');
const CMP_RE = new RegExp('^(' + FIELD + ')(>=|<=|>|<)');
const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function readQuoted(q, start) {
  // q[start] === '"'
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
  throw new QuerySyntaxError(start);
}

function wildcardRegex(v) {
  let re = '';
  for (const ch of v) {
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else re += ch.replace(/[.+^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^(?:' + re + ')$', 'is');
}

function numOf(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function tokenize(q) {
  const toks = [];
  try {
    tokenizeInto(q, toks);
  } catch (e) {
    if (!(e instanceof QuerySyntaxError)) throw e;
    toks.push({ t: 'ERR', pos: e.position });
  }
  return toks;
}

function tokenizeInto(q, toks) {
  const n = q.length;
  let i = 0;
  const isWs = (c) => /\s/.test(c);
  while (i < n) {
    const c = q[i];
    if (isWs(c)) { i++; continue; }
    if (c === '(') { toks.push({ t: 'LP', pos: i }); i++; continue; }
    if (c === ')') { toks.push({ t: 'RP', pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(q, i);
      toks.push({ t: 'TERM', pos: i, test: substrTest(r.value) });
      i = r.end;
      continue;
    }
    let j = i;
    while (j < n && !isWs(q[j]) && q[j] !== '(' && q[j] !== ')') {
      // quoted value directly after "field:"
      if (q[j] === '"' && q[j - 1] === ':' && FIELD_COLON_RE.test(q.slice(i, j))) break;
      j++;
    }
    const word = q.slice(i, j);
    if (j < n && q[j] === '"') {
      // field:"quoted"
      const field = word.slice(0, -1);
      const r = readQuoted(q, j);
      const lower = r.value.toLowerCase();
      toks.push({
        t: 'TERM', pos: i,
        test: (rec) => has(rec, field) && rec[field] != null && String(rec[field]).toLowerCase() === lower,
      });
      i = r.end;
      continue;
    }
    toks.push(classify(word, i));
    i = j;
  }
}

function substrTest(text) {
  const lower = text.toLowerCase();
  return (rec) => {
    let m;
    if (has(rec, 'msg') && rec.msg != null) m = rec.msg;
    else if (has(rec, 'message') && rec.message != null) m = rec.message;
    else return false;
    return String(m).toLowerCase().includes(lower);
  };
}

function classify(word, pos) {
  if (word === 'AND' || word === 'OR' || word === 'NOT') return { t: word, pos };
  let m = FIELD_COLON_RE.exec(word);
  if (m) {
    const field = m[1];
    const value = word.slice(m[0].length);
    if (value === '') throw new QuerySyntaxError(pos + m[0].length);
    if (field === '_exists_') {
      if (!new RegExp('^' + FIELD + '$').test(value)) throw new QuerySyntaxError(pos + m[0].length);
      return { t: 'TERM', pos, test: (rec) => has(rec, value) && rec[value] != null };
    }
    const re = wildcardRegex(value);
    return {
      t: 'TERM', pos,
      test: (rec) => has(rec, field) && rec[field] != null && re.test(String(rec[field])),
    };
  }
  m = CMP_RE.exec(word);
  if (m) {
    const field = m[1];
    const op = m[2];
    const rest = word.slice(m[0].length);
    if (!NUM_RE.test(rest)) throw new QuerySyntaxError(pos + m[0].length);
    const num = Number(rest);
    return {
      t: 'TERM', pos,
      test: (rec) => {
        if (!has(rec, field)) return false;
        const v = numOf(rec[field]);
        if (v === null) return false;
        if (op === '>=') return v >= num;
        if (op === '<=') return v <= num;
        if (op === '>') return v > num;
        return v < num;
      },
    };
  }
  if (word.includes(':')) throw new QuerySyntaxError(pos);
  return { t: 'TERM', pos, test: substrTest(word) };
}

function compile(query) {
  const q = String(query);
  const toks = tokenize(q);
  if (toks.length === 0) return () => true;
  let p = 0;
  const peek = () => toks[p];
  const eofPos = q.length;

  function parseOr() {
    let left = parseAnd();
    const parts = [left];
    while (peek() && peek().t === 'OR') {
      p++;
      parts.push(parseAnd());
    }
    return parts.length === 1 ? parts[0] : (r) => parts.some((f) => f(r));
  }
  function startsOperand(t) {
    return t && (t.t === 'NOT' || t.t === 'LP' || t.t === 'TERM' || t.t === 'ERR');
  }
  function parseAnd() {
    const parts = [parseNot()];
    for (;;) {
      const t = peek();
      if (t && t.t === 'AND') { p++; parts.push(parseNot()); }
      else if (startsOperand(t)) parts.push(parseNot());
      else break;
    }
    return parts.length === 1 ? parts[0] : (r) => parts.every((f) => f(r));
  }
  function parseNot() {
    const t = peek();
    if (t && t.t === 'NOT') {
      p++;
      const inner = parseNot();
      return (r) => !inner(r);
    }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = peek();
    if (!t) throw new QuerySyntaxError(eofPos);
    if (t.t === 'LP') {
      p++;
      const e = parseOr();
      const c = peek();
      if (!c) throw new QuerySyntaxError(eofPos);
      if (c.t !== 'RP') throw new QuerySyntaxError(c.pos);
      p++;
      return e;
    }
    if (t.t === 'TERM') { p++; return t.test; }
    // AND / OR / RP where an operand is expected
    throw new QuerySyntaxError(t.pos);
  }

  const f = parseOr();
  if (p < toks.length) throw new QuerySyntaxError(toks[p].pos);
  return f;
}

module.exports = { compile, QuerySyntaxError };
