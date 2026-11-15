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

function readQuoted(q, start) {
  // q[start] === '"'; returns { value, end } or null if unclosed
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
  return null;
}

function tokenize(q) {
  const toks = [];
  const n = q.length;
  let i = 0;
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') {
      toks.push({ t: c, pos: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '"') {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ t: 'ERR', pos: i }); i = n; break; }
      toks.push({ t: 'Q', value: r.value, pos: i, end: r.end });
      i = r.end;
      continue;
    }
    let j = i;
    while (j < n && !/\s/.test(q[j]) && q[j] !== '(' && q[j] !== ')') {
      if (q[j] === ':' && q[j + 1] === '"') {
        const r = readQuoted(q, j + 1);
        if (!r) {
          toks.push({ t: 'ERR', pos: j + 1 });
          return toks;
        }
        toks.push({ t: 'FQ', field: q.slice(i, j), value: r.value, pos: i, colon: j, end: r.end });
        i = r.end;
        j = -1;
        break;
      }
      j++;
    }
    if (j === -1) continue;
    toks.push({ t: 'W', text: q.slice(i, j), pos: i, end: j });
    i = j;
  }
  return toks;
}

const has = (r, k) => Object.prototype.hasOwnProperty.call(r, k);

function wildcardRegex(v) {
  let re = '';
  for (const ch of v) {
    if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.+^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'iu');
}

function numOf(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function compile(query) {
  const q = query == null ? '' : String(query);
  if (q.trim() === '') return () => true;
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];

  function fieldEq(field, str) {
    const lc = str.toLowerCase();
    return (r) => has(r, field) && r[field] != null && String(r[field]).toLowerCase() === lc;
  }

  function primary() {
    const tk = peek();
    if (!tk) throw new QuerySyntaxError(q.length);
    switch (tk.t) {
      case 'ERR': throw new QuerySyntaxError(tk.pos);
      case ')': throw new QuerySyntaxError(tk.pos);
      case '(': {
        p++;
        const e = orExpr();
        const nx = peek();
        if (!nx) throw new QuerySyntaxError(q.length);
        if (nx.t !== ')') throw new QuerySyntaxError(nx.pos);
        p++;
        return e;
      }
      case 'Q': {
        p++;
        const needle = tk.value.toLowerCase();
        return msgSearch(needle);
      }
      case 'FQ': {
        p++;
        if (!FIELD_RE.test(tk.field)) throw new QuerySyntaxError(tk.pos);
        return fieldEq(tk.field, tk.value);
      }
      case 'W': {
        const text = tk.text;
        if (text === 'AND' || text === 'OR') throw new QuerySyntaxError(tk.pos);
        p++;
        const m = CMP_RE.exec(text);
        if (m) {
          const rest = text.slice(m[0].length);
          if (!NUM_RE.test(rest)) throw new QuerySyntaxError(tk.pos + m[0].length);
          const n = Number(rest);
          const f = m[1];
          const op = m[2];
          return (r) => {
            if (!has(r, f)) return false;
            const v = numOf(r[f]);
            if (v === null) return false;
            return op === '>=' ? v >= n : op === '<=' ? v <= n : op === '>' ? v > n : v < n;
          };
        }
        const ci = text.indexOf(':');
        if (ci >= 0) {
          const field = text.slice(0, ci);
          const value = text.slice(ci + 1);
          if (!FIELD_RE.test(field)) throw new QuerySyntaxError(tk.pos);
          if (value === '') throw new QuerySyntaxError(tk.pos + ci + 1);
          if (field === '_exists_') {
            if (!FIELD_RE.test(value)) throw new QuerySyntaxError(tk.pos + ci + 1);
            return (r) => has(r, value) && r[value] != null;
          }
          const re = wildcardRegex(value);
          return (r) => has(r, field) && r[field] != null && re.test(String(r[field]));
        }
        return msgSearch(text.toLowerCase());
      }
    }
    throw new QuerySyntaxError(tk.pos);
  }

  function msgSearch(needle) {
    return (r) => {
      let v = has(r, 'msg') && r.msg != null ? r.msg : has(r, 'message') ? r.message : undefined;
      if (v == null) return false;
      return String(v).toLowerCase().includes(needle);
    };
  }

  function notExpr() {
    const tk = peek();
    if (tk && tk.t === 'W' && tk.text === 'NOT') {
      p++;
      const e = notExpr();
      return (r) => !e(r);
    }
    return primary();
  }

  function andExpr() {
    const parts = [notExpr()];
    for (;;) {
      const tk = peek();
      if (!tk || tk.t === ')') break;
      if (tk.t === 'W' && tk.text === 'OR') break;
      if (tk.t === 'W' && tk.text === 'AND') p++;
      parts.push(notExpr());
    }
    return (r) => parts.every((f) => f(r));
  }

  function orExpr() {
    const parts = [andExpr()];
    for (;;) {
      const tk = peek();
      if (tk && tk.t === 'W' && tk.text === 'OR') {
        p++;
        parts.push(andExpr());
      } else break;
    }
    return (r) => parts.some((f) => f(r));
  }

  const fn = orExpr();
  if (p < toks.length) throw new QuerySyntaxError(toks[p].pos);
  return (r) => fn(r);
}

module.exports = { compile, QuerySyntaxError };
