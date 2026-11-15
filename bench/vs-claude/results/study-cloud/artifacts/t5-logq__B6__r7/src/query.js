'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super('syntax error at position ' + position);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)/;
const FIELD_COLON_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*):/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

function has(rec, k) {
  return Object.prototype.hasOwnProperty.call(rec, k);
}

// Đọc chuỗi trong ngoặc kép bắt đầu tại i (q[i] === '"').
// Trả { value, end } (end = chỉ số sau '"' đóng) hoặc null nếu không đóng.
function readQuoted(q, i) {
  let out = '';
  let j = i + 1;
  while (j < q.length) {
    const c = q[j];
    if (c === '\\' && (q[j + 1] === '"' || q[j + 1] === '\\')) {
      out += q[j + 1];
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

// Token lỗi ('error') được phát ra tại chỗ và parser chỉ ném khi chạm tới nó,
// nên lỗi xuất hiện sớm hơn trong truy vấn luôn được báo trước.
function tokenize(q) {
  const toks = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') {
      toks.push({ type: c, pos: i });
      i++;
      continue;
    }
    if (c === '"') {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ type: 'error', pos: i }); return toks; }
      toks.push({ type: 'quoted', pos: i, value: r.value });
      i = r.end;
      continue;
    }
    const start = i;
    let quotedValue = null;
    while (i < q.length && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && i > start && q[i - 1] === ':' && FIELD_COLON_RE.test(q.slice(start, i))
          && q.indexOf(':', start) === i - 1) {
        const r = readQuoted(q, i);
        if (!r) { toks.push({ type: 'error', pos: i }); return toks; }
        quotedValue = r.value;
        const field = FIELD_COLON_RE.exec(q.slice(start, i))[1];
        toks.push({ type: 'term', pos: start, kind: 'eq', field, quoted: true, value: quotedValue });
        i = r.end;
        break;
      }
      i++;
    }
    if (quotedValue !== null) continue;

    const text = q.slice(start, i);
    if (text === 'AND' || text === 'OR' || text === 'NOT') {
      toks.push({ type: text, pos: start });
      continue;
    }
    if (text.startsWith('_exists_:')) {
      const f = text.slice(9);
      if (f === '') { toks.push({ type: 'error', pos: start + 9 }); return toks; }
      toks.push({ type: 'term', pos: start, kind: 'exists', field: f });
      continue;
    }
    let m = CMP_RE.exec(text);
    if (m) {
      const rhs = text.slice(m[0].length);
      if (!NUMBER_RE.test(rhs)) {
        toks.push({ type: 'error', pos: start + m[0].length });
        return toks;
      }
      toks.push({ type: 'term', pos: start, kind: 'cmp', field: m[1], op: m[2], num: Number(rhs) });
      continue;
    }
    m = FIELD_COLON_RE.exec(text);
    if (m) {
      const v = text.slice(m[0].length);
      if (v === '') { toks.push({ type: 'error', pos: start + m[0].length }); return toks; }
      toks.push({ type: 'term', pos: start, kind: 'eq', field: m[1], quoted: false, value: v });
      continue;
    }
    toks.push({ type: 'term', pos: start, kind: 'word', value: text });
  }
  toks.push({ type: 'eof', pos: q.length });
  return toks;
}

function numOf(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUMBER_RE.test(v)) return Number(v);
  return null;
}

function buildTerm(t) {
  switch (t.kind) {
    case 'exists':
      return (r) => has(r, t.field) && r[t.field] != null;
    case 'cmp': {
      const n = t.num;
      return (r) => {
        if (!has(r, t.field)) return false;
        const v = numOf(r[t.field]);
        if (v === null || Number.isNaN(v)) return false;
        switch (t.op) {
          case '>=': return v >= n;
          case '<=': return v <= n;
          case '>': return v > n;
          default: return v < n;
        }
      };
    }
    case 'eq': {
      let test;
      if (t.quoted) {
        const want = t.value.toLowerCase();
        test = (s) => s.toLowerCase() === want;
      } else {
        const src = t.value.replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*').replace(/\?/g, '.');
        const re = new RegExp('^' + src + '$', 'is');
        test = (s) => re.test(s);
      }
      return (r) => has(r, t.field) && r[t.field] != null && test(String(r[t.field]));
    }
    default: {
      const needle = t.value.toLowerCase();
      return (r) => {
        let m;
        if (has(r, 'msg')) m = r.msg;
        else if (has(r, 'message')) m = r.message;
        else return false;
        if (m == null) return false;
        return String(m).toLowerCase().includes(needle);
      };
    }
  }
}

function compile(query) {
  const q = String(query == null ? '' : query);
  if (q.trim() === '') return () => true;
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];
  const fail = (pos) => { throw new QuerySyntaxError(pos); };

  function startsPrimary(t) {
    return t.type === '(' || t.type === 'NOT' || t.type === 'term' || t.type === 'quoted';
  }

  function parseOr() {
    let left = parseAnd();
    while (peek().type === 'OR') {
      p++;
      const l = left;
      const right = parseAnd();
      left = (r) => l(r) || right(r);
    }
    return left;
  }

  function parseAnd() {
    let left = parseNot();
    for (;;) {
      const t = peek();
      if (t.type === 'AND') p++;
      else if (!startsPrimary(t)) break;
      const l = left;
      const right = parseNot();
      left = (r) => l(r) && right(r);
    }
    return left;
  }

  function parseNot() {
    if (peek().type === 'NOT') {
      p++;
      const inner = parseNot();
      return (r) => !inner(r);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    switch (t.type) {
      case '(': {
        p++;
        if (peek().type === ')') fail(peek().pos);
        const e = parseOr();
        const c = peek();
        if (c.type !== ')') fail(c.pos);
        p++;
        return e;
      }
      case 'term':
        p++;
        return buildTerm(t);
      case 'quoted':
        p++;
        return buildTerm({ kind: 'word', value: t.value });
      default:
        // eof, ')', AND, OR, error: đều báo tại vị trí của token
        return fail(t.pos);
    }
  }

  const fn = parseOr();
  const rest = peek();
  if (rest.type !== 'eof') fail(rest.pos);
  return fn;
}

module.exports = { compile, QuerySyntaxError };
