'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super(`syntax error at position ${position}`);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function tokenize(q) {
  const toks = [];
  const n = q.length;
  let i = 0;
  const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  const readQuoted = (start) => {
    let s = '';
    let j = start + 1;
    while (j < n) {
      const c = q[j];
      if (c === '\\' && j + 1 < n && (q[j + 1] === '"' || q[j + 1] === '\\')) { s += q[j + 1]; j += 2; }
      else if (c === '"') return { text: s, end: j + 1 };
      else { s += c; j++; }
    }
    return null;
  };
  while (i < n) {
    const c = q[i];
    if (isWs(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ t: c, pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(i);
      if (!r) { toks.push({ t: 'bad', pos: i }); i = n; continue; }
      toks.push({ t: 'quoted', text: r.text, pos: i });
      i = r.end;
      continue;
    }
    let j = i;
    while (j < n && !isWs(q[j]) && q[j] !== '(' && q[j] !== ')' && q[j] !== '"') j++;
    const w = q.slice(i, j);
    if (q[j] === '"' && w.endsWith(':')) {
      const r = readQuoted(j);
      if (!r) { toks.push({ t: 'bad', pos: j }); i = n; continue; }
      toks.push({ t: 'word', text: w, pos: i, quoted: r.text });
      i = r.end;
      continue;
    }
    toks.push({ t: 'word', text: w, pos: i });
    i = j;
  }
  return toks;
}

function globToRegex(p) {
  let re = '';
  for (const ch of p) {
    if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'i');
}

function toNum(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function compile(query) {
  const q = String(query);
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];
  const isKw = (t, k) => t && t.t === 'word' && t.quoted === undefined && t.text === k;
  const err = (pos) => { throw new QuerySyntaxError(pos); };

  function substr(text) {
    const want = text.toLowerCase();
    return (r) => {
      let m;
      if (has(r, 'msg') && r.msg != null) m = r.msg;
      else if (has(r, 'message') && r.message != null) m = r.message;
      else return false;
      return String(m).toLowerCase().includes(want);
    };
  }

  function term(tok) {
    if (tok.t === 'quoted') return substr(tok.text);
    const w = tok.text;
    const s = tok.pos;
    if (w.startsWith('_exists_:')) {
      const f = w.slice(9);
      if (!FIELD_RE.test(f) || tok.quoted !== undefined) err(s + 9);
      return (r) => has(r, f) && r[f] != null;
    }
    const cm = CMP_RE.exec(w);
    if (cm) {
      const rest = w.slice(cm[0].length);
      if (!NUM_RE.test(rest) || tok.quoted !== undefined) err(s + cm[0].length);
      const f = cm[1];
      const op = cm[2];
      const num = Number(rest);
      return (r) => {
        if (!has(r, f)) return false;
        const v = toNum(r[f]);
        if (v === null) return false;
        if (op === '>') return v > num;
        if (op === '>=') return v >= num;
        if (op === '<') return v < num;
        return v <= num;
      };
    }
    const ci = w.indexOf(':');
    if (ci >= 0) {
      const f = w.slice(0, ci);
      if (!FIELD_RE.test(f)) err(s);
      const val = w.slice(ci + 1);
      if (tok.quoted !== undefined) {
        const want = tok.quoted.toLowerCase();
        return (r) => has(r, f) && r[f] != null && String(r[f]).toLowerCase() === want;
      }
      if (val === '') err(s + ci + 1);
      const re = globToRegex(val);
      return (r) => has(r, f) && r[f] != null && re.test(String(r[f]));
    }
    return substr(w);
  }

  function primary() {
    const tok = peek();
    if (!tok) err(q.length);
    if (tok.t === 'bad' || tok.t === ')') err(tok.pos);
    if (tok.t === '(') {
      p++;
      const nx = peek();
      if (nx && nx.t === ')') err(nx.pos);
      const e = orExpr();
      if (!peek()) err(q.length);
      p++; // ')'
      return e;
    }
    if (isKw(tok, 'AND') || isKw(tok, 'OR')) err(tok.pos);
    if (isKw(tok, 'NOT')) {
      p++;
      const e = primary();
      return (r) => !e(r);
    }
    p++;
    return term(tok);
  }

  function andExpr() {
    const parts = [primary()];
    for (;;) {
      const t = peek();
      if (!t || t.t === ')' || isKw(t, 'OR')) break;
      if (isKw(t, 'AND')) p++;
      parts.push(primary());
    }
    return (r) => parts.every((f) => f(r));
  }

  function orExpr() {
    const parts = [andExpr()];
    while (isKw(peek(), 'OR')) {
      p++;
      parts.push(andExpr());
    }
    return (r) => parts.some((f) => f(r));
  }

  if (toks.length === 0) return () => true;
  const fn = orExpr();
  if (peek()) err(peek().pos); // chỉ có thể là ')' thừa
  return fn;
}

module.exports = { compile, QuerySyntaxError };
