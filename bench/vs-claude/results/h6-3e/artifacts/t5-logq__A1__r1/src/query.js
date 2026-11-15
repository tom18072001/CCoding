'use strict';

class QuerySyntaxError extends Error {
  constructor(position, detail) {
    super('syntax error at position ' + position + (detail ? ': ' + detail : ''));
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD = '[A-Za-z_@][A-Za-z0-9_.@-]*';
const FIELD_RE = new RegExp('^' + FIELD + '$');
const FIELD_COLON_RE = new RegExp('^' + FIELD + ':$');
const CMP_RE = new RegExp('^(' + FIELD + ')(>=|<=|>|<)');
const COLON_RE = new RegExp('^(' + FIELD + '):');
const NUM_RE = /^-?\d+(\.\d+)?$/;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Reads a quoted string starting at s[i] === '"'. Returns { value, end } or null if unclosed.
function readQuoted(s, i) {
  let out = '';
  let j = i + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\' && j + 1 < s.length) {
      const d = s[j + 1];
      out += d === '"' || d === '\\' ? d : c + d;
      j += 2;
    } else if (c === '"') {
      return { value: out, end: j + 1 };
    } else {
      out += c;
      j++;
    }
  }
  return null;
}

function tokenize(q) {
  const toks = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ t: c, pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ t: 'BADQ', pos: i }); i = q.length; continue; }
      toks.push({ t: 'Q', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    const start = i;
    let fq = null;
    while (i < q.length && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && FIELD_COLON_RE.test(q.slice(start, i))) {
        const r = readQuoted(q, i);
        if (!r) { fq = { bad: true, pos: i }; i = q.length; break; }
        fq = { value: r.value, pos: i, field: q.slice(start, i - 1) };
        i = r.end;
        break;
      }
      i++;
    }
    if (fq) {
      if (fq.bad) toks.push({ t: 'BADQ', pos: fq.pos });
      else toks.push({ t: 'FQ', field: fq.field, value: fq.value, pos: start, vpos: fq.pos });
    } else {
      toks.push({ t: 'W', text: q.slice(start, i), pos: start });
    }
  }
  return toks;
}

function wildcardRe(pat) {
  let src = '';
  for (const ch of pat.toLowerCase()) {
    if (ch === '*') src += '.*';
    else if (ch === '?') src += '.';
    else src += ch.replace(/[.+^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^' + src + '$', 's');
}

function toNumber(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function fieldEquals(field, test) {
  return (rec) => hasOwn(rec, field) && rec[field] != null && test(String(rec[field]).toLowerCase());
}

function compile(query) {
  if (typeof query !== 'string') throw new TypeError('query must be a string');
  const toks = tokenize(query);
  const end = query.length;
  let p = 0;
  if (toks.length === 0) return () => true;

  const isKw = (tk, kw) => tk && tk.t === 'W' && tk.text === kw;
  const isAndOr = (tk) => isKw(tk, 'AND') || isKw(tk, 'OR');

  function parseOr() {
    const parts = [parseAnd()];
    while (isKw(toks[p], 'OR')) {
      p++;
      parts.push(parseAnd());
    }
    return parts.length === 1 ? parts[0] : (r) => parts.some((f) => f(r));
  }

  function parseAnd() {
    const parts = [parseNot()];
    for (;;) {
      const tk = toks[p];
      if (!tk || tk.t === ')' || isKw(tk, 'OR')) break;
      if (isKw(tk, 'AND')) p++;
      parts.push(parseNot());
    }
    return parts.length === 1 ? parts[0] : (r) => parts.every((f) => f(r));
  }

  function parseNot() {
    if (isKw(toks[p], 'NOT')) {
      p++;
      const f = parseNot();
      return (r) => !f(r);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const tk = toks[p];
    if (!tk) throw new QuerySyntaxError(end, 'unexpected end of query');
    if (tk.t === ')') throw new QuerySyntaxError(tk.pos, 'unexpected ")"');
    if (tk.t === 'BADQ') throw new QuerySyntaxError(tk.pos, 'unterminated quote');
    if (isAndOr(tk)) throw new QuerySyntaxError(tk.pos, 'unexpected ' + tk.text);
    if (tk.t === '(') {
      p++;
      const f = parseOr();
      if (!toks[p]) throw new QuerySyntaxError(end, 'missing ")"');
      p++; // parseOr only stops at ')' or end of input
      return f;
    }
    p++;
    if (tk.t === 'Q') return textTerm(tk.value);
    if (tk.t === 'FQ') {
      if (tk.field === '_exists_') return existsTerm(tk.value, tk.vpos);
      const want = tk.value.toLowerCase();
      return fieldEquals(tk.field, (s) => s === want);
    }
    return wordTerm(tk);
  }

  function existsTerm(field, pos) {
    if (!FIELD_RE.test(field)) throw new QuerySyntaxError(pos, 'invalid field name');
    return (r) => hasOwn(r, field) && r[field] != null;
  }

  function textTerm(text) {
    const needle = text.toLowerCase();
    return (r) => {
      let v;
      if (hasOwn(r, 'msg') && r.msg != null) v = r.msg;
      else if (hasOwn(r, 'message') && r.message != null) v = r.message;
      else return false;
      return String(v).toLowerCase().includes(needle);
    };
  }

  function wordTerm(tk) {
    const w = tk.text;
    const cm = CMP_RE.exec(w);
    if (cm) {
      const field = cm[1];
      const op = cm[2];
      const rest = w.slice(cm[0].length);
      if (!NUM_RE.test(rest)) throw new QuerySyntaxError(tk.pos + cm[0].length, 'expected number');
      const n = Number(rest);
      const cmp = { '>=': (a) => a >= n, '<=': (a) => a <= n, '>': (a) => a > n, '<': (a) => a < n }[op];
      return (r) => {
        if (!hasOwn(r, field)) return false;
        const v = toNumber(r[field]);
        return v !== null && cmp(v);
      };
    }
    const m = COLON_RE.exec(w);
    if (m) {
      const field = m[1];
      const valPos = tk.pos + m[0].length;
      const value = w.slice(m[0].length);
      if (value === '') throw new QuerySyntaxError(valPos, 'missing value');
      if (field === '_exists_') return existsTerm(value, valPos);
      const re = wildcardRe(value);
      return fieldEquals(field, (s) => re.test(s));
    }
    if (w.includes(':')) throw new QuerySyntaxError(tk.pos, 'invalid field name');
    return textTerm(w);
  }

  const f = parseOr();
  if (p < toks.length) throw new QuerySyntaxError(toks[p].pos, 'unexpected token');
  return f;
}

module.exports = { compile, QuerySyntaxError };
