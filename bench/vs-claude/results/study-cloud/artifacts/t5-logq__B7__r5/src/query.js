'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super('syntax error at position ' + position);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)([\s\S]*)$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function readQuoted(q, start) {
  // q[start] === '"'; trả về { value, end } (end = chỉ số sau dấu đóng)
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

function tokenize(q) {
  const toks = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') {
      toks.push({ t: c, pos: i });
      i++;
    } else if (c === '"') {
      const r = readQuoted(q, i);
      toks.push({ t: 'quoted', value: r.value, pos: i });
      i = r.end;
    } else {
      const start = i;
      while (i < q.length && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
        if (q[i] === '"' && q[i - 1] === ':' && FIELD_RE.test(q.slice(start, i - 1))) {
          const r = readQuoted(q, i);
          toks.push({ t: 'fq', field: q.slice(start, i - 1), value: r.value, pos: start });
          i = r.end;
          break;
        }
        i++;
      }
      if (i > start && (toks.length === 0 || toks[toks.length - 1].pos !== start)) {
        toks.push({ t: 'word', text: q.slice(start, i), pos: start });
      }
    }
  }
  return toks;
}

function wildcardRe(v) {
  let re = '^';
  for (const ch of v) {
    if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.+^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp(re + '$', 'i');
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function fieldVal(rec, f) {
  return has(rec, f) ? rec[f] : undefined;
}

function msgOf(rec) {
  let v = fieldVal(rec, 'msg');
  if (v === undefined || v === null) v = fieldVal(rec, 'message');
  return v === undefined || v === null ? null : String(v);
}

function compile(query) {
  const q = String(query);
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];
  const isKw = (tk, kw) => tk && tk.t === 'word' && tk.text === kw;

  function parseOr() {
    let parts = [parseAnd()];
    while (isKw(peek(), 'OR')) {
      p++;
      parts.push(parseAnd());
    }
    return parts.length === 1 ? parts[0] : (r) => parts.some((f) => f(r));
  }

  function parseAnd() {
    const parts = [parseNot()];
    for (;;) {
      const tk = peek();
      if (isKw(tk, 'AND')) {
        p++;
        parts.push(parseNot());
      } else if (tk && tk.t !== ')' && !isKw(tk, 'OR')) {
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
    const tk = peek();
    if (!tk) throw new QuerySyntaxError(q.length);
    if (tk.t === ')') throw new QuerySyntaxError(tk.pos);
    if (tk.t === '(') {
      p++;
      const f = parseOr();
      const close = peek();
      if (!close) throw new QuerySyntaxError(q.length);
      p++; // chỉ có thể là ')'
      return f;
    }
    if (isKw(tk, 'AND') || isKw(tk, 'OR')) throw new QuerySyntaxError(tk.pos);
    p++;
    if (tk.t === 'quoted') return substr(tk.value);
    if (tk.t === 'fq') return fieldMatch(tk.field, tk.value, true);
    return term(tk);
  }

  function substr(s) {
    const needle = s.toLowerCase();
    return (r) => {
      const m = msgOf(r);
      return m !== null && m.toLowerCase().includes(needle);
    };
  }

  function fieldMatch(field, value, exact) {
    if (exact) {
      const lv = value.toLowerCase();
      return (r) => {
        const v = fieldVal(r, field);
        return v !== undefined && v !== null && String(v).toLowerCase() === lv;
      };
    }
    const re = wildcardRe(value);
    return (r) => {
      const v = fieldVal(r, field);
      return v !== undefined && v !== null && re.test(String(v));
    };
  }

  function term(tk) {
    const text = tk.text;
    const cm = CMP_RE.exec(text);
    if (cm) {
      const [, field, op, rhs] = cm;
      if (!NUM_RE.test(rhs)) throw new QuerySyntaxError(tk.pos + field.length + op.length);
      const n = Number(rhs);
      return (r) => {
        const v = toNum(fieldVal(r, field));
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
    if (ci === -1) return substr(text);
    const field = text.slice(0, ci);
    const value = text.slice(ci + 1);
    if (!FIELD_RE.test(field)) throw new QuerySyntaxError(tk.pos);
    if (value === '') throw new QuerySyntaxError(tk.pos + ci + 1);
    if (field === '_exists_') {
      return (r) => {
        const v = fieldVal(r, value);
        return v !== undefined && v !== null;
      };
    }
    return fieldMatch(field, value, false);
  }

  if (toks.length === 0) return () => true;
  const f = parseOr();
  if (p < toks.length) throw new QuerySyntaxError(toks[p].pos); // ')' thừa
  return (r) => f(r);
}

module.exports = { compile, QuerySyntaxError };
