'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super(`syntax error at position ${position}`);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD = '[A-Za-z_@][A-Za-z0-9_.@-]*';
const CMP_RE = new RegExp(`^(${FIELD})(>=|<=|>|<)(.*)$`, 's');
const COLON_RE = new RegExp(`^(${FIELD}):(.*)$`, 's');
const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function tokenize(q) {
  const toks = [];
  const n = q.length;
  let i = 0;
  const readQuoted = (start) => {
    // q[start] === '"'
    let j = start + 1;
    let s = '';
    while (j < n) {
      const c = q[j];
      if (c === '\\' && (q[j + 1] === '"' || q[j + 1] === '\\')) { s += q[j + 1]; j += 2; }
      else if (c === '"') return { value: s, end: j + 1 };
      else { s += c; j++; }
    }
    return null;
  };
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ t: c, pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(i);
      if (!r) { toks.push({ t: 'err', pos: i }); break; }
      toks.push({ t: 'quoted', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    let j = i;
    while (j < n && !/\s/.test(q[j]) && q[j] !== '(' && q[j] !== ')') {
      if (q[j] === '"' && q[j - 1] === ':' && COLON_RE.test(q.slice(i, j))) break;
      j++;
    }
    const text = q.slice(i, j);
    if (j < n && q[j] === '"') {
      const r = readQuoted(j);
      if (!r) { toks.push({ t: 'err', pos: j }); break; }
      toks.push({ t: 'fieldq', text, value: r.value, pos: i });
      i = r.end;
      continue;
    }
    toks.push({ t: 'word', text, pos: i });
    i = j;
  }
  return toks;
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

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUMBER_RE.test(v)) return Number(v);
  return null;
}

function textOf(rec) {
  let v;
  if (has(rec, 'msg') && rec.msg != null) v = rec.msg;
  else if (has(rec, 'message') && rec.message != null) v = rec.message;
  else return null;
  return String(v).toLowerCase();
}

function compile(query) {
  const q = String(query);
  const toks = tokenize(q);
  if (toks.length === 0) return () => true;
  let p = 0;
  const peek = () => toks[p];
  const isKw = (t, kw) => t && t.t === 'word' && t.text === kw;
  const endPos = q.length;

  function parseOr() {
    let left = parseAnd();
    const parts = [left];
    while (isKw(peek(), 'OR')) {
      p++;
      parts.push(parseAnd());
    }
    if (parts.length === 1) return left;
    return (r) => parts.some((f) => f(r));
  }

  function startsOperand(t) {
    if (!t) return false;
    if (t.t === ')') return false;
    if (isKw(t, 'OR')) return false;
    return true;
  }

  function parseAnd() {
    const parts = [parseNot()];
    for (;;) {
      const t = peek();
      if (isKw(t, 'AND')) { p++; parts.push(parseNot()); }
      else if (startsOperand(t)) parts.push(parseNot());
      else break;
    }
    if (parts.length === 1) return parts[0];
    return (r) => parts.every((f) => f(r));
  }

  function parseNot() {
    const t = peek();
    if (isKw(t, 'NOT')) {
      p++;
      const inner = parseNot();
      return (r) => !inner(r);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    if (!t) throw new QuerySyntaxError(endPos);
    if (t.t === ')') throw new QuerySyntaxError(t.pos);
    if (t.t === 'err') throw new QuerySyntaxError(t.pos);
    if (t.t === 'word' && (t.text === 'AND' || t.text === 'OR')) throw new QuerySyntaxError(t.pos);
    if (t.t === '(') {
      p++;
      const e = parseOr();
      const c = peek();
      if (!c) throw new QuerySyntaxError(endPos);
      if (c.t !== ')') throw new QuerySyntaxError(c.pos);
      p++;
      return e;
    }
    p++;
    if (t.t === 'quoted') return substringTerm(t.value);
    if (t.t === 'fieldq') {
      const m = COLON_RE.exec(t.text);
      // tokenizer guarantees t.text ends with ':' and matches FIELD:
      return fieldTerm(m[1], t.value, true);
    }
    const text = t.text;
    let m = COLON_RE.exec(text);
    if (m) {
      const field = m[1];
      const val = m[2];
      if (val === '') throw new QuerySyntaxError(t.pos + field.length + 1);
      if (field === '_exists_') {
        return (r) => has(r, val) && r[val] != null;
      }
      return fieldTerm(field, val, false);
    }
    m = CMP_RE.exec(text);
    if (m) {
      const field = m[1];
      const op = m[2];
      const rhs = m[3];
      if (!NUMBER_RE.test(rhs)) throw new QuerySyntaxError(t.pos + field.length + op.length);
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
    return substringTerm(text);
  }

  function substringTerm(word) {
    const needle = word.toLowerCase();
    return (r) => {
      const s = textOf(r);
      return s !== null && s.includes(needle);
    };
  }

  function fieldTerm(field, val, quoted) {
    if (field === '_exists_') {
      return (r) => has(r, val) && r[val] != null;
    }
    if (quoted) {
      const want = val.toLowerCase();
      return (r) => has(r, field) && r[field] != null && String(r[field]).toLowerCase() === want;
    }
    const re = wildcardRegex(val);
    return (r) => has(r, field) && r[field] != null && re.test(String(r[field]));
  }

  const ast = parseOr();
  const rest = peek();
  if (rest) throw new QuerySyntaxError(rest.pos);
  return ast;
}

module.exports = { compile, QuerySyntaxError };
