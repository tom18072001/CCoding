'use strict';

class QuerySyntaxError extends Error {
  constructor(position, detail) {
    super('syntax error at position ' + position + (detail ? ': ' + detail : ''));
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const WS_RE = /\s/;

// Đọc chuỗi trong ngoặc kép bắt đầu tại q[start] === '"'. Trả null nếu không đóng.
function readQuoted(q, start) {
  let s = '';
  let i = start + 1;
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

function classify(text, pos) {
  if (text === 'AND' || text === 'OR' || text === 'NOT') return { t: text, pos };
  const m = CMP_RE.exec(text);
  if (m) {
    const rest = text.slice(m[0].length);
    const opPos = pos + m[0].length;
    if (!NUM_RE.test(rest)) return { t: 'ERR', pos: opPos, detail: 'expected number after ' + m[2] };
    return { t: 'CMP', pos, field: m[1], op: m[2], num: Number(rest) };
  }
  const k = text.indexOf(':');
  if (k >= 0) {
    const field = text.slice(0, k);
    const value = text.slice(k + 1);
    if (!FIELD_RE.test(field)) return { t: 'ERR', pos, detail: 'invalid field name' };
    if (field === '_exists_') {
      if (!FIELD_RE.test(value)) return { t: 'ERR', pos: pos + k + 1, detail: 'expected field name' };
      return { t: 'EXISTS', pos, field: value };
    }
    if (value === '') return { t: 'ERR', pos: pos + k + 1, detail: 'expected value' };
    return { t: 'TERM', pos, field, value, quoted: false };
  }
  return { t: 'WORD', pos, value: text };
}

function tokenize(q) {
  const toks = [];
  const n = q.length;
  let i = 0;
  while (i < n) {
    const c = q[i];
    if (WS_RE.test(c)) { i++; continue; }
    if (c === '(') { toks.push({ t: 'LP', pos: i }); i++; continue; }
    if (c === ')') { toks.push({ t: 'RP', pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ t: 'ERR', pos: i, detail: 'unterminated string' }); break; }
      toks.push({ t: 'QUOTED', pos: i, value: r.value });
      i = r.end;
      continue;
    }
    let j = i;
    let done = false;
    while (j < n && !WS_RE.test(q[j]) && q[j] !== '(' && q[j] !== ')') {
      if (q[j] === '"' && j > i && q[j - 1] === ':' && FIELD_RE.test(q.slice(i, j - 1))) {
        const field = q.slice(i, j - 1);
        if (field === '_exists_') {
          toks.push({ t: 'ERR', pos: j, detail: 'expected field name' });
          done = true;
          break;
        }
        const r = readQuoted(q, j);
        if (!r) {
          toks.push({ t: 'ERR', pos: j, detail: 'unterminated string' });
          done = true;
          break;
        }
        toks.push({ t: 'TERM', pos: i, field, value: r.value, quoted: true });
        i = r.end;
        j = -1;
        break;
      }
      j++;
    }
    if (done) break;
    if (j === -1) continue;
    toks.push(classify(q.slice(i, j), i));
    i = j;
  }
  return toks;
}

function has(rec, f) {
  return rec !== null && typeof rec === 'object' && Object.prototype.hasOwnProperty.call(rec, f);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
}

function termMatcher(tok) {
  const field = tok.field;
  let re;
  if (tok.quoted) {
    re = new RegExp('^' + escapeRe(tok.value) + '$', 'is');
  } else {
    let src = '';
    for (const ch of tok.value) {
      if (ch === '*') src += '[\\s\\S]*';
      else if (ch === '?') src += '[\\s\\S]';
      else src += escapeRe(ch);
    }
    re = new RegExp('^' + src + '$', 'iu');
  }
  return (rec) => has(rec, field) && rec[field] !== null && rec[field] !== undefined && re.test(String(rec[field]));
}

function numeric(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function cmpMatcher(tok) {
  const { field, op, num } = tok;
  return (rec) => {
    if (!has(rec, field)) return false;
    const v = numeric(rec[field]);
    if (v === null) return false;
    switch (op) {
      case '>=': return v >= num;
      case '<=': return v <= num;
      case '>': return v > num;
      default: return v < num;
    }
  };
}

function wordMatcher(text) {
  const needle = text.toLowerCase();
  return (rec) => {
    if (rec === null || typeof rec !== 'object') return false;
    let v = has(rec, 'msg') ? rec.msg : undefined;
    if (v === undefined || v === null) v = has(rec, 'message') ? rec.message : undefined;
    if (v === undefined || v === null) return false;
    return String(v).toLowerCase().includes(needle);
  };
}

function compile(query) {
  query = String(query === undefined || query === null ? '' : query);
  const toks = tokenize(query);
  if (toks.length === 0) return () => true;
  let p = 0;
  const len = query.length;

  const peek = () => {
    const tk = toks[p];
    if (tk === undefined) return { t: 'EOF', pos: len };
    if (tk.t === 'ERR') throw new QuerySyntaxError(tk.pos, tk.detail);
    return tk;
  };
  const next = () => { const tk = peek(); p++; return tk; };

  function parseOr() {
    let left = parseAnd();
    while (peek().t === 'OR') {
      next();
      const l = left;
      const r = parseAnd();
      left = (rec) => l(rec) || r(rec);
    }
    return left;
  }

  function parseAnd() {
    let left = parseNot();
    for (;;) {
      const t = peek().t;
      if (t === 'AND') next();
      else if (t === 'OR' || t === 'RP' || t === 'EOF') break;
      const l = left;
      const r = parseNot();
      left = (rec) => l(rec) && r(rec);
    }
    return left;
  }

  function parseNot() {
    if (peek().t === 'NOT') {
      next();
      const inner = parseNot();
      return (rec) => !inner(rec);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const tk = peek();
    switch (tk.t) {
      case 'EOF': throw new QuerySyntaxError(len, 'unexpected end of query');
      case 'AND': case 'OR': case 'RP':
        throw new QuerySyntaxError(tk.pos, 'unexpected ' + (tk.t === 'RP' ? ')' : tk.t));
      case 'LP': {
        next();
        const e = parseOr();
        const close = peek();
        if (close.t !== 'RP') throw new QuerySyntaxError(len, 'missing )');
        next();
        return e;
      }
      case 'TERM': next(); return termMatcher(tk);
      case 'CMP': next(); return cmpMatcher(tk);
      case 'EXISTS': next(); return (rec) => has(rec, tk.field) && rec[tk.field] !== null && rec[tk.field] !== undefined;
      default: // WORD, QUOTED
        next();
        return wordMatcher(tk.value);
    }
  }

  const fn = parseOr();
  const rest = peek();
  if (rest.t !== 'EOF') throw new QuerySyntaxError(rest.pos, 'unexpected )');
  return fn;
}

module.exports = { compile, QuerySyntaxError };
