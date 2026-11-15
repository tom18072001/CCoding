'use strict';

class QuerySyntaxError extends Error {
  constructor(position, detail) {
    super(`syntax error at position ${position}` + (detail ? `: ${detail}` : ''));
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_PREFIX = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(:|>=|<=|>|<)/;
const NUMBER = /^-?\d+(\.\d+)?$/;

// ---- Tokenizer (có vị trí) ----
function readQuoted(q, start) {
  // q[start] === '"'; trả về { value, end } (end = chỉ số sau '"' đóng) hoặc null
  let value = '';
  let i = start + 1;
  while (i < q.length) {
    const c = q[i];
    if (c === '\\' && (q[i + 1] === '"' || q[i + 1] === '\\')) {
      value += q[i + 1];
      i += 2;
    } else if (c === '"') {
      return { value, end: i + 1 };
    } else {
      value += c;
      i++;
    }
  }
  return null;
}

function tokenize(q) {
  const tokens = [];
  let i = 0;
  const isSpace = (c) => /\s/.test(c);
  while (i < q.length) {
    const c = q[i];
    if (isSpace(c)) { i++; continue; }
    if (c === '(' || c === ')') { tokens.push({ t: c, pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(q, i);
      if (!r) { tokens.push({ t: 'ERR', pos: i }); break; }
      tokens.push({ t: 'QUOTED', pos: i, value: r.value });
      i = r.end;
      continue;
    }
    const start = i;
    const m = FIELD_PREFIX.exec(q.slice(i));
    if (m && m[2] === ':' && q[i + m[0].length] === '"') {
      const qs = i + m[0].length;
      const r = readQuoted(q, qs);
      if (!r) { tokens.push({ t: 'ERR', pos: qs }); break; }
      tokens.push({ t: 'TERMQ', pos: start, field: m[1], value: r.value });
      i = r.end;
      continue;
    }
    while (i < q.length && !isSpace(q[i]) && q[i] !== '(' && q[i] !== ')') i++;
    const text = q.slice(start, i);
    if (text === 'AND' || text === 'OR' || text === 'NOT') tokens.push({ t: 'KW', pos: start, text });
    else tokens.push({ t: 'WORD', pos: start, text });
  }
  tokens.push({ t: 'EOF', pos: q.length });
  return tokens;
}

// ---- Matchers ----
function has(rec, f) {
  return rec != null && Object.prototype.hasOwnProperty.call(rec, f) && rec[f] !== null && rec[f] !== undefined;
}

function toNumber(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUMBER.test(v)) return Number(v);
  return null;
}

function wildcardRegex(pat) {
  let re = '';
  for (const ch of pat) {
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else re += ch.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp(`^(?:${re})$`, 'is');
}

function fieldEq(field, re) {
  return (r) => has(r, field) && re.test(String(r[field]));
}

function fieldExact(field, value) {
  const lv = value.toLowerCase();
  return (r) => has(r, field) && String(r[field]).toLowerCase() === lv;
}

function cmp(field, op, n) {
  return (r) => {
    if (!has(r, field)) return false;
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

function substr(text) {
  const lt = text.toLowerCase();
  return (r) => {
    let v;
    if (has(r, 'msg')) v = r.msg;
    else if (has(r, 'message')) v = r.message;
    else return false;
    return String(v).toLowerCase().includes(lt);
  };
}

// ---- Parser đệ quy xuống: OR < AND < NOT < primary ----
function compile(query) {
  const q = query == null ? '' : String(query);
  const tokens = tokenize(q);
  let p = 0;
  const peek = () => tokens[p];

  if (tokens.length === 1) return () => true;

  function parseOr() {
    const parts = [parseAnd()];
    while (peek().t === 'KW' && peek().text === 'OR') {
      p++;
      parts.push(parseAnd());
    }
    if (parts.length === 1) return parts[0];
    return (r) => parts.some((f) => f(r));
  }

  function parseAnd() {
    const parts = [parseNot()];
    for (;;) {
      const tk = peek();
      if (tk.t === 'KW' && tk.text === 'AND') {
        p++;
        parts.push(parseNot());
      } else if (tk.t === 'EOF' || tk.t === ')' || (tk.t === 'KW' && tk.text === 'OR')) {
        break;
      } else {
        parts.push(parseNot()); // AND ngầm
      }
    }
    if (parts.length === 1) return parts[0];
    return (r) => parts.every((f) => f(r));
  }

  function parseNot() {
    const tk = peek();
    if (tk.t === 'KW' && tk.text === 'NOT') {
      p++;
      const inner = parseNot();
      return (r) => !inner(r);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const tk = peek();
    switch (tk.t) {
      case 'ERR':
        throw new QuerySyntaxError(tk.pos, 'unterminated quoted string');
      case 'EOF':
        throw new QuerySyntaxError(q.length, 'unexpected end of query');
      case ')':
        throw new QuerySyntaxError(tk.pos, 'unexpected ")"');
      case 'KW':
        throw new QuerySyntaxError(tk.pos, `unexpected ${tk.text}`);
      case '(': {
        p++;
        const inner = parseOr();
        const close = peek();
        if (close.t === 'EOF') throw new QuerySyntaxError(q.length, 'missing ")"');
        if (close.t !== ')') throw new QuerySyntaxError(close.pos, 'expected ")"');
        p++;
        return inner;
      }
      case 'QUOTED':
        p++;
        return substr(tk.value);
      case 'TERMQ':
        p++;
        return fieldExact(tk.field, tk.value);
      default:
        p++;
        return parseWord(tk);
    }
  }

  function parseWord(tk) {
    const text = tk.text;
    const m = FIELD_PREFIX.exec(text);
    if (!m) return substr(text);
    const field = m[1];
    const op = m[2];
    const rest = text.slice(m[0].length);
    const after = tk.pos + m[0].length;
    if (op === ':') {
      if (rest === '') throw new QuerySyntaxError(after, 'missing value');
      if (field === '_exists_') return (r) => has(r, rest);
      return fieldEq(field, wildcardRegex(rest));
    }
    if (!NUMBER.test(rest)) throw new QuerySyntaxError(after, 'comparison requires a number');
    return cmp(field, op, Number(rest));
  }

  const f = parseOr();
  const last = peek();
  if (last.t !== 'EOF') throw new QuerySyntaxError(last.pos, 'unexpected ")"');
  return f;
}

module.exports = { compile, QuerySyntaxError };
