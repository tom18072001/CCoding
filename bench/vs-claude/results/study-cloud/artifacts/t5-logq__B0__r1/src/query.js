'use strict';

class QuerySyntaxError extends Error {
  constructor(position, description) {
    super(`syntax error at position ${position}: ${description}`);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const FIELD_PREFIX_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*):/;
const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const WS_RE = /\s/;

// Đọc chuỗi trong ngoặc kép bắt đầu tại start (q[start] === '"').
// Trả { value, end } (end = chỉ số sau dấu đóng) hoặc null nếu không đóng.
function readQuoted(q, start) {
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
  while (i < q.length) {
    const c = q[i];
    if (WS_RE.test(c)) { i++; continue; }
    if (c === '(' || c === ')') {
      tokens.push({ type: c, pos: i });
      i++;
      continue;
    }
    if (c === '"') {
      const r = readQuoted(q, i);
      if (!r) { tokens.push({ type: 'ERR', pos: i, msg: 'unterminated quoted string' }); return tokens; }
      tokens.push({ type: 'QUOTED', pos: i, value: r.value });
      i = r.end;
      continue;
    }
    const start = i;
    while (i < q.length && !WS_RE.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && q[i - 1] === ':' && FIELD_RE.test(q.slice(start, i - 1))) break;
      i++;
    }
    const text = q.slice(start, i);
    if (q[i] === '"') {
      // FIELD:"quoted"
      const r = readQuoted(q, i);
      if (!r) { tokens.push({ type: 'ERR', pos: i, msg: 'unterminated quoted string' }); return tokens; }
      tokens.push({ type: 'TERM', pos: start, kind: 'eq', field: text.slice(0, -1), value: r.value, quoted: true });
      i = r.end;
      continue;
    }
    if (text === 'AND' || text === 'OR' || text === 'NOT') {
      tokens.push({ type: text, pos: start });
      continue;
    }
    if (text.startsWith('_exists_:')) {
      const f = text.slice('_exists_:'.length);
      if (f === '') throw new QuerySyntaxError(start + text.length, 'missing field after _exists_:');
      tokens.push({ type: 'TERM', pos: start, kind: 'exists', field: f });
      continue;
    }
    let m = CMP_RE.exec(text);
    if (m) {
      const opEnd = start + m[0].length;
      const rest = text.slice(m[0].length);
      if (!NUMBER_RE.test(rest)) throw new QuerySyntaxError(opEnd, 'expected number after comparison operator');
      tokens.push({ type: 'TERM', pos: start, kind: 'cmp', field: m[1], op: m[2], num: Number(rest) });
      continue;
    }
    m = FIELD_PREFIX_RE.exec(text);
    if (m) {
      const rest = text.slice(m[0].length);
      if (rest === '') throw new QuerySyntaxError(start + m[0].length, 'missing value after ":"');
      tokens.push({ type: 'TERM', pos: start, kind: 'eq', field: m[1], value: rest, quoted: false });
      continue;
    }
    tokens.push({ type: 'TERM', pos: start, kind: 'word', value: text });
  }
  return tokens;
}

function has(rec, f) {
  return Object.prototype.hasOwnProperty.call(rec, f) && rec[f] !== null && rec[f] !== undefined;
}

function wildcardRegex(v) {
  const src = v.replace(/[.+^${}()|[\]\\*?]/g, (ch) => (ch === '*' ? '.*' : ch === '?' ? '.' : '\\' + ch));
  return new RegExp('^(?:' + src + ')$', 'is');
}

function buildTerm(t) {
  switch (t.kind) {
    case 'exists':
      return (r) => has(r, t.field);
    case 'cmp': {
      const { field, op, num } = t;
      return (r) => {
        if (!has(r, field)) return false;
        const v = r[field];
        let n;
        if (typeof v === 'number') n = v;
        else if (typeof v === 'string' && NUMBER_RE.test(v)) n = Number(v);
        else return false;
        if (!Number.isFinite(n)) return false;
        return op === '>' ? n > num : op === '>=' ? n >= num : op === '<' ? n < num : n <= num;
      };
    }
    case 'eq': {
      const { field } = t;
      if (t.quoted) {
        const want = t.value.toLowerCase();
        return (r) => has(r, field) && String(r[field]).toLowerCase() === want;
      }
      const re = wildcardRegex(t.value);
      return (r) => has(r, field) && re.test(String(r[field]));
    }
    default: {
      const want = t.value.toLowerCase();
      return (r) => {
        const v = has(r, 'msg') ? r.msg : has(r, 'message') ? r.message : null;
        return v !== null && String(v).toLowerCase().includes(want);
      };
    }
  }
}

function compile(query) {
  const q = String(query);
  if (q.trim() === '') return () => true;
  const tokens = tokenize(q);
  let p = 0;
  const peek = () => tokens[p];

  function fail(tok, desc) {
    throw new QuerySyntaxError(tok ? tok.pos : q.length, desc);
  }

  function parseOr() {
    let left = parseAnd();
    while (peek() && peek().type === 'OR') {
      p++;
      const right = parseAnd();
      const l = left;
      left = (r) => l(r) || right(r);
    }
    return left;
  }

  function parseAnd() {
    let left = parseNot();
    for (;;) {
      const t = peek();
      if (!t || t.type === 'OR' || t.type === ')') break;
      if (t.type === 'AND') p++;
      const right = parseNot();
      const l = left;
      left = (r) => l(r) && right(r);
    }
    return left;
  }

  function parseNot() {
    const t = peek();
    if (t && t.type === 'NOT') {
      p++;
      const inner = parseNot();
      return (r) => !inner(r);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    if (!t) fail(null, 'unexpected end of query');
    switch (t.type) {
      case 'ERR': return fail(t, t.msg);
      case 'AND': case 'OR': return fail(t, `unexpected ${t.type}`);
      case ')': return fail(t, 'unexpected ")"');
      case '(': {
        p++;
        const inner = parseOr();
        const c = peek();
        if (!c) fail(null, 'missing ")"');
        if (c.type === 'ERR') fail(c, c.msg);
        if (c.type !== ')') fail(c, 'expected ")"');
        p++;
        return inner;
      }
      case 'QUOTED':
        p++;
        return buildTerm({ kind: 'word', value: t.value });
      default:
        p++;
        return buildTerm(t);
    }
  }

  const fn = parseOr();
  if (p < tokens.length) fail(tokens[p], 'unexpected ")"');
  return fn;
}

module.exports = { compile, QuerySyntaxError };
