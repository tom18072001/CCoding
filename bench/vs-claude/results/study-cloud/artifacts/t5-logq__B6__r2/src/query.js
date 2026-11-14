'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super(`syntax error at position ${position}`);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const MQ = '\u0000'; // đánh dấu bắt đầu đoạn quoted trong raw
const ME = '\u0001'; // đánh dấu kết thúc đoạn quoted

// Tokenizer có vị trí: 'lparen' | 'rparen' | 'word' | 'badquote'
function tokenize(q) {
  const toks = [];
  let i = 0;
  const n = q.length;
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { toks.push({ type: 'lparen', start: i }); i++; continue; }
    if (c === ')') { toks.push({ type: 'rparen', start: i }); i++; continue; }
    const start = i;
    let raw = '';
    let hasQuote = false;
    let bad = null;
    while (i < n && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"') {
        hasQuote = true;
        const qs = i;
        i++;
        let val = '';
        let closed = false;
        while (i < n) {
          if (q[i] === '\\' && (q[i + 1] === '"' || q[i + 1] === '\\')) { val += q[i + 1]; i += 2; continue; }
          if (q[i] === '"') { closed = true; i++; break; }
          val += q[i++];
        }
        if (!closed) { bad = qs; break; }
        raw += MQ + val + ME;
      } else {
        raw += q[i++];
      }
    }
    if (bad !== null) { toks.push({ type: 'badquote', start, pos: bad }); break; }
    toks.push({ type: 'word', start, raw, hasQuote });
  }
  return toks;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function wildcardRe(v) {
  let s = '';
  for (const ch of v) s += ch === '*' ? '.*' : ch === '?' ? '.' : escapeRe(ch);
  return new RegExp('^' + s + '$', 'is');
}

function has(rec, f) {
  return rec != null && Object.prototype.hasOwnProperty.call(rec, f) && rec[f] !== null && rec[f] !== undefined;
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUMBER_RE.test(v)) return Number(v);
  return null;
}

function substrMatcher(s) {
  const needle = s.toLowerCase();
  return (r) => {
    const f = has(r, 'msg') ? 'msg' : has(r, 'message') ? 'message' : null;
    if (!f) return false;
    return String(r[f]).toLowerCase().includes(needle);
  };
}

function compile(query) {
  const q = String(query == null ? '' : query);
  const toks = tokenize(q);
  if (toks.length === 0) return () => true;
  let p = 0;
  const len = q.length;
  const peek = () => toks[p];
  const isKw = (t, k) => !!t && t.type === 'word' && !t.hasQuote && t.raw === k;
  const isAndOr = (t) => isKw(t, 'AND') || isKw(t, 'OR');

  function parseOr() {
    const parts = [parseAnd()];
    while (isKw(peek(), 'OR')) {
      p++;
      parts.push(parseAnd());
    }
    return parts.length === 1 ? parts[0] : (r) => parts.some((f) => f(r));
  }

  function parseAnd() {
    const parts = [parseNot()];
    for (;;) {
      const t = peek();
      if (!t || t.type === 'rparen' || isKw(t, 'OR')) break;
      if (isKw(t, 'AND')) p++;
      parts.push(parseNot());
    }
    return parts.length === 1 ? parts[0] : (r) => parts.every((f) => f(r));
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
    if (!t) throw new QuerySyntaxError(len);
    if (t.type === 'badquote') throw new QuerySyntaxError(t.pos);
    if (t.type === 'rparen') throw new QuerySyntaxError(t.start);
    if (isAndOr(t)) throw new QuerySyntaxError(t.start);
    if (t.type === 'lparen') {
      p++;
      const e = parseOr();
      const c = peek();
      if (!c) throw new QuerySyntaxError(len);
      if (c.type === 'badquote') throw new QuerySyntaxError(c.pos);
      if (c.type !== 'rparen') throw new QuerySyntaxError(c.start);
      p++;
      return e;
    }
    p++;
    return parseTerm(t);
  }

  function parseTerm(t) {
    const raw = t.raw;
    if (raw[0] === MQ) {
      const end = raw.indexOf(ME);
      if (end !== raw.length - 1) throw new QuerySyntaxError(t.start);
      return substrMatcher(raw.slice(1, end));
    }
    const m = FIELD_RE.exec(raw);
    if (m) {
      const field = m[0];
      const rest = raw.slice(field.length);
      const off = t.start; // đúng vì phần trước toán tử không chứa đoạn quoted
      if (rest[0] === ':') {
        const val = rest.slice(1);
        const afterColon = off + field.length + 1;
        if (val === '') throw new QuerySyntaxError(afterColon);
        if (field === '_exists_') {
          const fm = FIELD_RE.exec(val);
          if (!fm || fm[0] !== val) throw new QuerySyntaxError(afterColon);
          return (r) => has(r, val);
        }
        if (val[0] === MQ) {
          const end = val.indexOf(ME);
          if (end !== val.length - 1) throw new QuerySyntaxError(afterColon);
          const lit = val.slice(1, end).toLowerCase();
          return (r) => has(r, field) && String(r[field]).toLowerCase() === lit;
        }
        if (val.includes(MQ)) throw new QuerySyntaxError(afterColon);
        const re = wildcardRe(val);
        return (r) => has(r, field) && re.test(String(r[field]));
      }
      const cm = /^(>=|<=|>|<)/.exec(rest);
      if (cm) {
        const op = cm[1];
        const rhs = rest.slice(op.length);
        if (!NUMBER_RE.test(rhs)) throw new QuerySyntaxError(off + field.length + op.length);
        const num = Number(rhs);
        return (r) => {
          if (!has(r, field)) return false;
          const v = toNum(r[field]);
          if (v === null) return false;
          return op === '>=' ? v >= num : op === '<=' ? v <= num : op === '>' ? v > num : v < num;
        };
      }
    }
    if (raw.includes(MQ) || raw.includes(':') || /[<>]/.test(raw)) throw new QuerySyntaxError(t.start);
    return substrMatcher(raw);
  }

  const fn = parseOr();
  const rest = peek();
  if (rest) throw new QuerySyntaxError(rest.type === 'badquote' ? rest.pos : rest.start);
  return fn;
}

module.exports = { compile, QuerySyntaxError };
