'use strict';

class QuerySyntaxError extends Error {
  constructor(position, detail) {
    super('syntax error at position ' + position + (detail ? ': ' + detail : ''));
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const FIELD_PREFIX_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// q[i] === '"'; trả về { value, end } hoặc null nếu không đóng.
function readQuoted(q, i) {
  let s = '';
  let j = i + 1;
  while (j < q.length) {
    const ch = q[j];
    if (ch === '\\' && j + 1 < q.length && (q[j + 1] === '"' || q[j + 1] === '\\')) {
      s += q[j + 1];
      j += 2;
    } else if (ch === '"') {
      return { value: s, end: j + 1 };
    } else {
      s += ch;
      j++;
    }
  }
  return null;
}

// Token: { t: 'lp'|'rp'|'kw'|'term'|'badquote', pos, ... }
// Lỗi từ vựng được hoãn thành token để lỗi xuất hiện sớm hơn (theo vị trí) được ném trước.
function tokenize(q) {
  const toks = [];
  let i = 0;
  const n = q.length;
  while (i < n) {
    const ch = q[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '(') { toks.push({ t: 'lp', pos: i }); i++; continue; }
    if (ch === ')') { toks.push({ t: 'rp', pos: i }); i++; continue; }
    if (ch === '"') {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ t: 'badquote', pos: i }); break; }
      toks.push({ t: 'term', kind: 'text', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    const start = i;
    let quoted = null;
    let bad = false;
    while (i < n && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && q[i - 1] === ':' && FIELD_RE.test(q.slice(start, i - 1))) {
        const r = readQuoted(q, i);
        if (!r) { toks.push({ t: 'badquote', pos: i }); bad = true; break; }
        quoted = r.value;
        i = r.end;
        break;
      }
      i++;
    }
    if (bad) break;
    const raw = q.slice(start, i);
    if (quoted !== null) {
      const colon = raw.indexOf(':');
      toks.push({ t: 'term', kind: 'fieldq', field: raw.slice(0, colon), value: quoted, pos: start });
      continue;
    }
    if (raw === 'AND' || raw === 'OR' || raw === 'NOT') {
      toks.push({ t: 'kw', value: raw, pos: start });
      continue;
    }
    toks.push(classifyWord(raw, start));
  }
  return toks;
}

function classifyWord(raw, pos) {
  const colon = raw.indexOf(':');
  if (colon >= 0) {
    const field = raw.slice(0, colon);
    if (!FIELD_RE.test(field)) return { t: 'badterm', pos, at: pos, detail: 'invalid field name' };
    const value = raw.slice(colon + 1);
    const at = pos + colon + 1;
    if (value === '') return { t: 'badterm', pos, at, detail: 'missing value' };
    if (field === '_exists_') {
      if (!FIELD_RE.test(value)) return { t: 'badterm', pos, at, detail: 'invalid field name' };
      return { t: 'term', kind: 'exists', field: value, pos };
    }
    return { t: 'term', kind: 'field', field, value, pos };
  }
  const fm = FIELD_PREFIX_RE.exec(raw);
  if (fm) {
    const rest = raw.slice(fm[0].length);
    const op = rest.startsWith('>=') ? '>=' : rest.startsWith('<=') ? '<=' : rest[0] === '>' ? '>' : rest[0] === '<' ? '<' : null;
    if (op) {
      const rhs = rest.slice(op.length);
      if (!NUM_RE.test(rhs)) {
        return { t: 'badterm', pos, at: pos + fm[0].length + op.length, detail: 'expected number' };
      }
      return { t: 'term', kind: 'cmp', field: fm[0], op, num: Number(rhs), pos };
    }
  }
  return { t: 'term', kind: 'text', value: raw, pos };
}

function escapeRe(s) {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function wildcardRe(v) {
  let src = '';
  for (const ch of v) {
    if (ch === '*') src += '[\\s\\S]*';
    else if (ch === '?') src += '[\\s\\S]';
    else src += escapeRe(ch);
  }
  return new RegExp('^' + src + '$', 'i');
}

function present(rec, f) {
  return has(rec, f) && rec[f] !== null && rec[f] !== undefined;
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function makeTerm(tok) {
  switch (tok.kind) {
    case 'exists': {
      const f = tok.field;
      return (r) => present(r, f);
    }
    case 'field': {
      const f = tok.field;
      const re = wildcardRe(tok.value);
      return (r) => present(r, f) && re.test(String(r[f]));
    }
    case 'fieldq': {
      const f = tok.field;
      const want = tok.value.toLowerCase();
      return (r) => present(r, f) && String(r[f]).toLowerCase() === want;
    }
    case 'cmp': {
      const { field: f, op, num } = tok;
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
    default: {
      const want = tok.value.toLowerCase();
      return (r) => {
        const m = present(r, 'msg') ? r.msg : present(r, 'message') ? r.message : null;
        return m !== null && String(m).toLowerCase().includes(want);
      };
    }
  }
}

function compile(query) {
  const q = query === undefined || query === null ? '' : String(query);
  if (q.trim() === '') return () => true;
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];
  const isKw = (t, v) => t && t.t === 'kw' && t.value === v;

  function parseOr() {
    let left = parseAnd();
    while (isKw(peek(), 'OR')) {
      p++;
      const l = left;
      const r = parseAnd();
      left = (rec) => l(rec) || r(rec);
    }
    return left;
  }

  function parseAnd() {
    let left = parseNot();
    for (;;) {
      const t = peek();
      if (!t) break;
      if (isKw(t, 'AND')) {
        p++;
      } else if (!(t.t === 'lp' || t.t === 'term' || t.t === 'badterm' || t.t === 'badquote' || isKw(t, 'NOT'))) {
        break;
      }
      const l = left;
      const r = parseNot();
      left = (rec) => l(rec) && r(rec);
    }
    return left;
  }

  function parseNot() {
    if (isKw(peek(), 'NOT')) {
      p++;
      const inner = parseNot();
      return (rec) => !inner(rec);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    if (!t) throw new QuerySyntaxError(q.length, 'unexpected end of query');
    if (t.t === 'badquote') throw new QuerySyntaxError(t.pos, 'unterminated quote');
    if (t.t === 'badterm') throw new QuerySyntaxError(t.at, t.detail);
    if (t.t === 'kw') throw new QuerySyntaxError(t.pos, 'unexpected ' + t.value);
    if (t.t === 'rp') throw new QuerySyntaxError(t.pos, 'unexpected )');
    if (t.t === 'lp') {
      p++;
      const e = parseOr();
      if (!peek()) throw new QuerySyntaxError(q.length, 'missing )');
      p++; // chỉ có thể là ')'
      return e;
    }
    p++;
    return makeTerm(t);
  }

  const fn = parseOr();
  if (peek()) throw new QuerySyntaxError(peek().pos, 'unexpected )');
  return fn;
}

module.exports = { compile, QuerySyntaxError };
