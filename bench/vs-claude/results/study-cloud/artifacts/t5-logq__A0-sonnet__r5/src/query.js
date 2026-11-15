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
const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function readQuoted(q, start) {
  // q[start] === '"'; returns { value, end } or null if unclosed
  let i = start + 1;
  let s = '';
  while (i < q.length) {
    const c = q[i];
    if (c === '\\' && i + 1 < q.length) {
      const d = q[i + 1];
      if (d === '"' || d === '\\') s += d;
      else s += '\\' + d;
      i += 2;
    } else if (c === '"') {
      return { value: s, end: i + 1 };
    } else {
      s += c;
      i++;
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
    if (c === '(') { toks.push({ t: 'LP', pos: i }); i++; continue; }
    if (c === ')') { toks.push({ t: 'RP', pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ t: 'BAD', pos: i }); break; }
      toks.push({ t: 'QUOTED', pos: i, value: r.value });
      i = r.end;
      continue;
    }
    const start = i;
    while (i < n && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && q[i - 1] === ':') break;
      i++;
    }
    const text = q.slice(start, i);
    if (q[i] === '"' && text.endsWith(':')) {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ t: 'BAD', pos: i }); break; }
      toks.push({ t: 'FQ', pos: start, text, qpos: i, value: r.value });
      i = r.end;
    } else {
      toks.push({ t: 'WORD', pos: start, text });
    }
  }
  return toks;
}

function wildcardRe(pat) {
  let re = '';
  for (const ch of pat) {
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else re += ch.replace(/[.+^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'is');
}

function numOf(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function compile(query) {
  const q = String(query);
  if (q.trim() === '') return () => true;
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];

  const isKw = (t, k) => t && t.t === 'WORD' && t.text === k;

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
    if (t.t === 'RP') return false;
    if (isKw(t, 'OR')) return false;
    return true;
  }

  function parseAnd() {
    const parts = [parseNot()];
    for (;;) {
      const t = peek();
      if (isKw(t, 'AND')) {
        p++;
        parts.push(parseNot());
      } else if (startsOperand(t)) {
        parts.push(parseNot());
      } else break;
    }
    if (parts.length === 1) return parts[0];
    return (r) => parts.every((f) => f(r));
  }

  function parseNot() {
    const t = peek();
    if (isKw(t, 'NOT')) {
      p++;
      const f = parseNot();
      return (r) => !f(r);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    if (!t) throw new QuerySyntaxError(q.length, 'unexpected end of query');
    if (t.t === 'BAD') throw new QuerySyntaxError(t.pos, 'unterminated quote');
    if (t.t === 'RP') throw new QuerySyntaxError(t.pos, 'unexpected )');
    if (t.t === 'LP') {
      p++;
      const f = parseOr();
      const n = peek();
      if (!n) throw new QuerySyntaxError(q.length, 'missing )');
      if (n.t === 'BAD') throw new QuerySyntaxError(n.pos, 'unterminated quote');
      if (n.t !== 'RP') throw new QuerySyntaxError(n.pos, 'unexpected token');
      p++;
      return f;
    }
    if (t.t === 'WORD' && (t.text === 'AND' || t.text === 'OR')) {
      throw new QuerySyntaxError(t.pos, `unexpected ${t.text}`);
    }
    p++;
    if (t.t === 'QUOTED') return substringTerm(t.value);
    if (t.t === 'FQ') {
      const field = t.text.slice(0, -1);
      if (field === '_exists_' || !FIELD_RE.test(field)) {
        throw new QuerySyntaxError(t.qpos, 'invalid field');
      }
      const want = t.value.toLowerCase();
      return (r) => {
        if (!has(r, field) || r[field] === null || r[field] === undefined) return false;
        return String(r[field]).toLowerCase() === want;
      };
    }
    // WORD
    const text = t.text;
    const cm = CMP_RE.exec(text);
    if (cm) {
      const field = cm[1];
      const op = cm[2];
      const rest = text.slice(cm[0].length);
      if (!NUM_RE.test(rest)) throw new QuerySyntaxError(t.pos + cm[0].length, 'expected number');
      const num = Number(rest);
      return (r) => {
        if (!has(r, field)) return false;
        const v = numOf(r[field]);
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
    if (ci >= 0) {
      const field = text.slice(0, ci);
      const value = text.slice(ci + 1);
      if (field === '_exists_') {
        if (value === '') throw new QuerySyntaxError(t.pos + ci + 1, 'missing field');
        return (r) => has(r, value) && r[value] !== null && r[value] !== undefined;
      }
      if (!FIELD_RE.test(field)) throw new QuerySyntaxError(t.pos, 'invalid field');
      if (value === '') throw new QuerySyntaxError(t.pos + ci + 1, 'missing value');
      const re = wildcardRe(value);
      return (r) => {
        if (!has(r, field) || r[field] === null || r[field] === undefined) return false;
        return re.test(String(r[field]));
      };
    }
    return substringTerm(text);
  }

  function substringTerm(s) {
    const needle = s.toLowerCase();
    return (r) => {
      let m;
      if (has(r, 'msg') && r.msg !== null && r.msg !== undefined) m = r.msg;
      else if (has(r, 'message') && r.message !== null && r.message !== undefined) m = r.message;
      else return false;
      return String(m).toLowerCase().includes(needle);
    };
  }

  const f = parseOr();
  const t = peek();
  if (t) {
    if (t.t === 'RP') throw new QuerySyntaxError(t.pos, 'unexpected )');
    if (t.t === 'BAD') throw new QuerySyntaxError(t.pos, 'unterminated quote');
    throw new QuerySyntaxError(t.pos, 'unexpected token');
  }
  return f;
}

module.exports = { compile, QuerySyntaxError };
