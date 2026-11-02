'use strict';
const NUM = /^-?\d+(\.\d+)?$/;
const FIELD = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const CMP = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)(.*)$/s;

class QuerySyntaxError extends Error {
  constructor(position, detail) {
    super(`syntax error at position ${position}: ${detail}`);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

function readQuoted(q, start) {
  let k = start + 1;
  let out = '';
  while (k < q.length) {
    const c = q[k];
    if (c === '\\' && k + 1 < q.length) {
      const d = q[k + 1];
      out += d === '"' ? '"' : d === '\\' ? '\\' : '\\' + d;
      k += 2;
      continue;
    }
    if (c === '"') return { value: out, end: k + 1 };
    out += c;
    k++;
  }
  throw new QuerySyntaxError(start, 'unterminated quote');
}

const lower = (v) => String(v).toLowerCase();
const has = (r, f) => r[f] !== undefined && r[f] !== null;
function wildcard(v) {
  const re = '^' + v.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[\\s\\S]*').replace(/\?/g, '[\\s\\S]') + '$';
  return new RegExp(re, 'i');
}
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && NUM.test(v)) return Number(v);
  return undefined;
}

function tokenize(q) {
  const toks = [];
  const n = q.length;
  let i = 0;
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '(' || c === ')') {
      toks.push({ t: c, pos: i });
      i++;
      continue;
    }
    if (c === '"') {
      const { value, end } = readQuoted(q, i);
      const needle = value.toLowerCase();
      toks.push({ t: 'TERM', pos: i, fn: (r) => textMatch(r, needle) });
      i = end;
      continue;
    }
    let k = i;
    while (k < n && !/\s/.test(q[k]) && q[k] !== '(' && q[k] !== ')' && q[k] !== '"') k++;
    const word = q.slice(i, k);
    if (word === 'AND' || word === 'OR' || word === 'NOT') {
      toks.push({ t: word, pos: i });
      i = k;
      continue;
    }
    const cm = CMP.exec(word);
    if (cm && !word.includes(':')) {
      const [, field, op, rest] = cm;
      const at = i + field.length + op.length;
      if (!NUM.test(rest)) throw new QuerySyntaxError(at, 'number expected');
      const n2 = Number(rest);
      const f = op === '>=' ? (x) => x >= n2 : op === '<=' ? (x) => x <= n2 : op === '>' ? (x) => x > n2 : (x) => x < n2;
      toks.push({ t: 'TERM', pos: i, fn: (r) => { const x = num(r[field]); return x !== undefined && f(x); } });
      i = k;
      continue;
    }
    const colon = word.indexOf(':');
    if (colon > 0) {
      const field = word.slice(0, colon);
      let value = word.slice(colon + 1);
      let quoted = false;
      let end = k;
      if (!value && q[k] === '"') {
        const r = readQuoted(q, k);
        value = r.value;
        end = r.end;
        quoted = true;
      } else if (!value) {
        throw new QuerySyntaxError(i + colon + 1, 'value expected');
      }
      if (field === '_exists_') {
        const f = value;
        toks.push({ t: 'TERM', pos: i, fn: (r) => has(r, f) });
      } else if (quoted) {
        const v = value.toLowerCase();
        toks.push({ t: 'TERM', pos: i, fn: (r) => has(r, field) && lower(r[field]) === v });
      } else {
        const re = wildcard(value);
        toks.push({ t: 'TERM', pos: i, fn: (r) => has(r, field) && re.test(String(r[field])) });
      }
      void FIELD;
      i = end;
      continue;
    }
    const needle = word.toLowerCase();
    toks.push({ t: 'TERM', pos: i, fn: (r) => textMatch(r, needle) });
    i = k;
  }
  return toks;
}

function textMatch(r, needle) {
  const m = has(r, 'msg') ? r.msg : has(r, 'message') ? r.message : undefined;
  return m !== undefined && lower(m).includes(needle);
}

function compile(query) {
  const q = String(query ?? '');
  const toks = tokenize(q);
  if (!toks.length) return () => true;
  let p = 0;
  const peek = () => toks[p];
  const end = () => new QuerySyntaxError(q.length, 'unexpected end of query');
  const parseOr = () => {
    let left = parseAnd();
    while (peek() && peek().t === 'OR') {
      p++;
      if (!peek()) throw end();
      const l = left;
      const r = parseAnd();
      left = (x) => l(x) || r(x);
    }
    return left;
  };
  const parseAnd = () => {
    let left = parseNot();
    while (peek() && peek().t !== 'OR' && peek().t !== ')') {
      if (peek().t === 'AND') {
        p++;
        if (!peek()) throw end();
      }
      const l = left;
      const r = parseNot();
      left = (x) => l(x) && r(x);
    }
    return left;
  };
  const parseNot = () => {
    if (peek() && peek().t === 'NOT') {
      p++;
      if (!peek()) throw end();
      const inner = parseNot();
      return (x) => !inner(x);
    }
    return parsePrimary();
  };
  const parsePrimary = () => {
    const t = peek();
    if (!t) throw end();
    if (t.t === '(') {
      p++;
      if (peek() && peek().t === ')') throw new QuerySyntaxError(peek().pos, 'empty group');
      const e = parseOr();
      if (!peek()) throw new QuerySyntaxError(q.length, "missing ')'");
      p++;
      return e;
    }
    if (t.t === 'TERM') {
      p++;
      return t.fn;
    }
    throw new QuerySyntaxError(t.pos, `unexpected ${t.t}`);
  };
  const e = parseOr();
  if (p < toks.length) throw new QuerySyntaxError(toks[p].pos, `unexpected ${toks[p].t}`);
  return (record) => !!e(record);
}

module.exports = { compile, QuerySyntaxError };
