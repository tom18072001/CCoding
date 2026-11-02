'use strict';

class QuerySyntaxError extends Error {
  constructor(detail, position) {
    super(`syntax error at position ${position}${detail ? ': ' + detail : ''}`);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)(.*)$/s;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Đọc chuỗi trong ngoặc kép bắt đầu tại i (query[i] === '"').
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

function tokenize(q) {
  const toks = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') {
      toks.push({ t: c, pos: i });
      i++;
      continue;
    }
    if (c === '"') {
      const r = readQuoted(q, i);
      if (!r) { toks.push({ t: 'BAD', pos: i }); break; }
      toks.push({ t: 'QUOTED', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    // từ trần; nếu gặp '"' ngay sau "FIELD:" thì đó là value trong ngoặc kép
    const start = i;
    let quoted = null;
    while (i < q.length && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"') {
        const prefix = q.slice(start, i);
        if (prefix.endsWith(':') && FIELD_RE.test(prefix.slice(0, -1))) {
          const r = readQuoted(q, i);
          if (!r) {
            toks.push({ t: 'BAD', pos: i });
            return toks;
          }
          quoted = { field: prefix.slice(0, -1), value: r.value };
          i = r.end;
        }
        break;
      }
      i++;
    }
    if (quoted) {
      toks.push({ t: 'FIELDQ', field: quoted.field, value: quoted.value, pos: start });
      continue;
    }
    // '"' giữa từ (không sau FIELD:) được coi là ký tự thường
    while (i < q.length && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') i++;
    toks.push({ t: 'WORD', text: q.slice(start, i), pos: start });
  }
  return toks;
}

function wildcardRegex(v) {
  const src = v
    .split('')
    .map((ch) => (ch === '*' ? '.*' : ch === '?' ? '.' : ch.replace(/[.+^${}()|[\]\\\/-]/g, '\\$&')))
    .join('');
  return new RegExp('^' + src + '$', 'is');
}

function textOf(r) {
  if (has(r, 'msg')) return r.msg;
  if (has(r, 'message')) return r.message;
  return undefined;
}

function compile(query) {
  const q = String(query);
  const toks = tokenize(q);
  let p = 0;
  const peek = () => {
    const tk = toks[p];
    if (tk && tk.t === 'BAD') throw new QuerySyntaxError('unterminated quote', tk.pos);
    return tk;
  };
  const isKw = (tk, kw) => tk && tk.t === 'WORD' && tk.text === kw;

  function parseOr() {
    let left = parseAnd();
    const parts = [left];
    while (isKw(peek(), 'OR')) {
      p++;
      parts.push(parseAnd());
    }
    return parts.length === 1 ? left : (r) => parts.some((f) => f(r));
  }

  function startsOperand(tk) {
    return tk && tk.t !== ')' && !isKw(tk, 'OR');
  }

  function parseAnd() {
    const parts = [parseNot()];
    for (;;) {
      const tk = peek();
      if (!startsOperand(tk)) break;
      if (isKw(tk, 'AND')) p++;
      parts.push(parseNot());
    }
    return parts.length === 1 ? parts[0] : (r) => parts.every((f) => f(r));
  }

  function parseNot() {
    const tk = peek();
    if (isKw(tk, 'NOT')) {
      p++;
      const f = parseNot();
      return (r) => !f(r);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const tk = peek();
    if (!tk) throw new QuerySyntaxError('unexpected end of query', q.length);
    if (tk.t === ')') throw new QuerySyntaxError('unexpected ")"', tk.pos);
    if (tk.t === '(') {
      p++;
      const f = parseOr();
      const close = peek();
      if (!close) throw new QuerySyntaxError('missing ")"', q.length);
      // close chỉ có thể là ')' vì parseOr dừng ở EOF hoặc ')'
      p++;
      return f;
    }
    if (isKw(tk, 'AND') || isKw(tk, 'OR')) {
      throw new QuerySyntaxError(`unexpected ${tk.text}`, tk.pos);
    }
    p++;
    if (tk.t === 'QUOTED') return substring(tk.value);
    if (tk.t === 'FIELDQ') return fieldEq(tk.field, wildcardless(tk.value));
    return parseWord(tk);
  }

  function parseWord(tk) {
    const w = tk.text;
    const cm = CMP_RE.exec(w);
    if (cm && !w.slice(0, cm[1].length).includes(':')) {
      const [, field, op, rhs] = cm;
      if (!NUM_RE.test(rhs)) {
        throw new QuerySyntaxError('expected number', tk.pos + field.length + op.length);
      }
      const n = Number(rhs);
      return (r) => {
        if (!has(r, field)) return false;
        const v = r[field];
        let x;
        if (typeof v === 'number') x = v;
        else if (typeof v === 'string' && NUM_RE.test(v)) x = Number(v);
        else return false;
        if (Number.isNaN(x)) return false;
        return op === '>=' ? x >= n : op === '<=' ? x <= n : op === '>' ? x > n : x < n;
      };
    }
    const ci = w.indexOf(':');
    if (ci >= 0) {
      const field = w.slice(0, ci);
      const value = w.slice(ci + 1);
      if (!FIELD_RE.test(field)) {
        throw new QuerySyntaxError('invalid field name', tk.pos);
      }
      if (value === '') throw new QuerySyntaxError('missing value', tk.pos + ci + 1);
      if (field === '_exists_') {
        if (!FIELD_RE.test(value)) throw new QuerySyntaxError('invalid field name', tk.pos + ci + 1);
        return (r) => has(r, value) && r[value] !== null && r[value] !== undefined;
      }
      const re = wildcardRegex(value);
      return fieldEq(field, (s) => re.test(s));
    }
    return substring(w);
  }

  function wildcardless(v) {
    const lv = v.toLowerCase();
    return (s) => s.toLowerCase() === lv;
  }

  function fieldEq(field, test) {
    return (r) => has(r, field) && r[field] !== null && r[field] !== undefined && test(String(r[field]));
  }

  function substring(s) {
    const ls = s.toLowerCase();
    return (r) => {
      const m = textOf(r);
      if (m === undefined || m === null) return false;
      return String(m).toLowerCase().includes(ls);
    };
  }

  if (toks.length === 0) return () => true;
  const fn = parseOr();
  const rest = peek();
  if (rest) throw new QuerySyntaxError('unexpected ")"', rest.pos);
  return fn;
}

module.exports = { compile, QuerySyntaxError };
