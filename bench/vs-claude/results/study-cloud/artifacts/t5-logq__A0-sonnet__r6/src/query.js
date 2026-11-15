'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super('syntax error at position ' + position);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD = '[A-Za-z_@][A-Za-z0-9_.@-]*';
const FIELD_COLON_RE = new RegExp('^(' + FIELD + '):');
const CMP_RE = new RegExp('^(' + FIELD + ')(>=|<=|>|<)');
const NUM_RE = /^-?\d+(\.\d+)?$/;

// Token: {type:'(' | ')' | 'word' | 'quoted' | 'fq' | 'error', pos, text, field, errPos}
function tokenize(q) {
  const toks = [];
  const n = q.length;
  let i = 0;
  // returns {value, end} or null if unclosed
  function readQuoted(start) {
    let s = '';
    let j = start + 1;
    while (j < n) {
      const c = q[j];
      if (c === '\\' && j + 1 < n && (q[j + 1] === '"' || q[j + 1] === '\\')) {
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
  }
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ type: c, pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(i);
      if (!r) { toks.push({ type: 'error', pos: i, errPos: i }); break; }
      toks.push({ type: 'quoted', pos: i, text: r.value });
      i = r.end;
      continue;
    }
    const start = i;
    let failed = false;
    while (i < n && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && q[i - 1] === ':' && FIELD_COLON_RE.test(q.slice(start, i))) {
        const r = readQuoted(i);
        if (!r) {
          toks.push({ type: 'error', pos: start, errPos: i });
          failed = true;
        } else {
          toks.push({ type: 'fq', pos: start, field: q.slice(start, i - 1), text: r.value });
          i = r.end;
        }
        break;
      }
      i++;
    }
    if (failed) break;
    if (toks.length && toks[toks.length - 1].pos === start) continue; // fq pushed
    toks.push({ type: 'word', pos: start, text: q.slice(start, i) });
  }
  return toks;
}

function globToRegex(pat) {
  let re = '';
  for (const ch of pat) {
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else re += ch.replace(/[.+^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'is');
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function has(rec, f) {
  const v = rec[f];
  return v !== undefined && v !== null;
}

function compile(query) {
  const q = String(query);
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];
  const isKw = (t, k) => t && t.type === 'word' && t.text === k;

  function parseOr() {
    let left = parseAnd();
    const parts = [left];
    while (isKw(peek(), 'OR')) {
      p++;
      parts.push(parseAnd());
    }
    return parts.length === 1 ? left : (r) => parts.some((f) => f(r));
  }

  function startsOperand(t) {
    if (!t) return false;
    if (t.type === ')') return false;
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
    return parts.length === 1 ? parts[0] : (r) => parts.every((f) => f(r));
  }

  function parseNot() {
    if (isKw(peek(), 'NOT')) {
      p++;
      const f = parseNot();
      return (r) => !f(r);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    if (!t) throw new QuerySyntaxError(q.length);
    if (t.type === 'error') throw new QuerySyntaxError(t.errPos);
    if (t.type === ')') throw new QuerySyntaxError(t.pos);
    if (isKw(t, 'AND') || isKw(t, 'OR')) throw new QuerySyntaxError(t.pos);
    if (t.type === '(') {
      p++;
      const f = parseOr();
      const c = peek();
      if (!c) throw new QuerySyntaxError(q.length);
      if (c.type !== ')') throw new QuerySyntaxError(c.pos);
      p++;
      return f;
    }
    p++;
    return makeTerm(t);
  }

  function makeTerm(t) {
    if (t.type === 'quoted') return msgMatcher(t.text);
    if (t.type === 'fq') {
      const want = t.text.toLowerCase();
      const field = t.field;
      if (field === '_exists_') return (r) => has(r, t.text);
      return (r) => has(r, field) && String(r[field]).toLowerCase() === want;
    }
    const w = t.text;
    const m = FIELD_COLON_RE.exec(w);
    if (m) {
      const field = m[1];
      const val = w.slice(m[0].length);
      if (val === '') throw new QuerySyntaxError(t.pos + m[0].length);
      if (field === '_exists_') return (r) => has(r, val);
      const re = globToRegex(val);
      return (r) => has(r, field) && re.test(String(r[field]));
    }
    const c = CMP_RE.exec(w);
    if (c) {
      const field = c[1];
      const op = c[2];
      const rest = w.slice(c[0].length);
      if (!NUM_RE.test(rest)) throw new QuerySyntaxError(t.pos + c[0].length);
      const n = Number(rest);
      return (r) => {
        const v = toNumber(r[field]);
        if (v === null) return false;
        switch (op) {
          case '>=': return v >= n;
          case '<=': return v <= n;
          case '>': return v > n;
          default: return v < n;
        }
      };
    }
    if (w.includes(':')) throw new QuerySyntaxError(t.pos);
    return msgMatcher(w);
  }

  function msgMatcher(text) {
    const needle = text.toLowerCase();
    return (r) => {
      const v = has(r, 'msg') ? r.msg : has(r, 'message') ? r.message : undefined;
      if (v === undefined) return false;
      return String(v).toLowerCase().includes(needle);
    };
  }

  if (toks.length === 0) return () => true;
  const f = parseOr();
  if (peek()) throw new QuerySyntaxError(peek().pos);
  return f;
}

module.exports = { compile, QuerySyntaxError };
