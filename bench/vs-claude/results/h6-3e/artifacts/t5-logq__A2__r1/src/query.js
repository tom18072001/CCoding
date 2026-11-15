'use strict';

class QuerySyntaxError extends Error {
  constructor(position, detail) {
    super(`syntax error at position ${position}` + (detail ? `: ${detail}` : ''));
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_PREFIX = /^[A-Za-z_@][A-Za-z0-9_.@-]*/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Token types: lparen, rparen, and, or, not, term, error
function tokenize(q) {
  const toks = [];
  const n = q.length;
  let i = 0;
  const readQuoted = (start) => {
    let buf = '';
    let k = start + 1;
    while (k < n) {
      const c = q[k];
      if (c === '\\' && k + 1 < n && (q[k + 1] === '"' || q[k + 1] === '\\')) {
        buf += q[k + 1];
        k += 2;
      } else if (c === '"') {
        return { value: buf, end: k + 1 };
      } else {
        buf += c;
        k++;
      }
    }
    return null;
  };
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { toks.push({ type: 'lparen', pos: i }); i++; continue; }
    if (c === ')') { toks.push({ type: 'rparen', pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(i);
      if (!r) { toks.push({ type: 'error', pos: i }); break; }
      toks.push({ type: 'term', pos: i, test: { kind: 'text', text: r.value } });
      i = r.end;
      continue;
    }
    let j = i;
    while (j < n && !/\s/.test(q[j]) && q[j] !== '(' && q[j] !== ')' && q[j] !== '"') j++;
    const word = q.slice(i, j);
    const pos = i;
    if (word === 'AND') { toks.push({ type: 'and', pos }); i = j; continue; }
    if (word === 'OR') { toks.push({ type: 'or', pos }); i = j; continue; }
    if (word === 'NOT') { toks.push({ type: 'not', pos }); i = j; continue; }

    const m = FIELD_PREFIX.exec(word);
    const after = m ? word[m[0].length] : undefined;
    if (word.startsWith('_exists_:')) {
      const f = word.slice(9);
      const fm = FIELD_PREFIX.exec(f);
      if (f === '' || !fm || fm[0] !== f) {
        toks.push({ type: 'error', pos: pos + 9 });
        break;
      }
      toks.push({ type: 'term', pos, test: { kind: 'exists', field: f } });
      i = j;
    } else if (m && after === ':') {
      const field = m[0];
      const vstart = pos + field.length + 1;
      if (vstart === j) {
        if (q[j] === '"') {
          const r = readQuoted(j);
          if (!r) { toks.push({ type: 'error', pos: j }); break; }
          toks.push({ type: 'term', pos, test: { kind: 'eq', field, value: r.value, exact: true } });
          i = r.end;
        } else {
          toks.push({ type: 'error', pos: vstart });
          break;
        }
      } else {
        toks.push({ type: 'term', pos, test: { kind: 'eq', field, value: word.slice(field.length + 1), exact: false } });
        i = j;
      }
    } else if (m && (after === '>' || after === '<')) {
      const field = m[0];
      let op = after;
      let k = field.length + 1;
      if (word[k] === '=') { op += '='; k++; }
      const rhs = word.slice(k);
      if (!NUMBER_RE.test(rhs)) {
        toks.push({ type: 'error', pos: pos + k });
        break;
      }
      toks.push({ type: 'term', pos, test: { kind: 'cmp', field, op, num: Number(rhs) } });
      i = j;
    } else if (word.includes(':')) {
      toks.push({ type: 'error', pos });
      break;
    } else {
      toks.push({ type: 'term', pos, test: { kind: 'text', text: word } });
      i = j;
    }
  }
  return toks;
}

function wildcardRegex(v) {
  let src = '';
  for (const ch of v) {
    if (ch === '*') src += '[\\s\\S]*';
    else if (ch === '?') src += '[\\s\\S]';
    else src += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + src + '$', 'iu');
}

function buildTerm(t) {
  switch (t.kind) {
    case 'exists': {
      const f = t.field;
      return (r) => hasOwn(r, f) && r[f] !== null && r[f] !== undefined;
    }
    case 'eq': {
      const f = t.field;
      if (t.exact) {
        const want = t.value.toLowerCase();
        return (r) => hasOwn(r, f) && r[f] != null && String(r[f]).toLowerCase() === want;
      }
      const re = wildcardRegex(t.value);
      return (r) => hasOwn(r, f) && r[f] != null && re.test(String(r[f]));
    }
    case 'cmp': {
      const { field: f, op, num } = t;
      return (r) => {
        if (!hasOwn(r, f)) return false;
        const v = r[f];
        let x;
        if (typeof v === 'number') x = v;
        else if (typeof v === 'string' && NUMBER_RE.test(v)) x = Number(v);
        else return false;
        if (Number.isNaN(x)) return false;
        if (op === '>') return x > num;
        if (op === '>=') return x >= num;
        if (op === '<') return x < num;
        return x <= num;
      };
    }
    default: {
      const needle = t.text.toLowerCase();
      return (r) => {
        let m;
        if (hasOwn(r, 'msg') && r.msg != null) m = r.msg;
        else if (hasOwn(r, 'message') && r.message != null) m = r.message;
        else return false;
        return String(m).toLowerCase().includes(needle);
      };
    }
  }
}

function compile(query) {
  const q = String(query === undefined || query === null ? '' : query);
  const toks = tokenize(q);
  if (toks.length === 0) return () => true;
  let p = 0;
  const peek = () => toks[p];

  function parseOr() {
    const parts = [parseAnd()];
    while (peek() && peek().type === 'or') {
      p++;
      parts.push(parseAnd());
    }
    return parts.length === 1 ? parts[0] : (r) => parts.some((f) => f(r));
  }
  function startsOperand(t) {
    return t && (t.type === 'term' || t.type === 'lparen' || t.type === 'not' || t.type === 'error');
  }
  function parseAnd() {
    const parts = [parseNot()];
    for (;;) {
      const t = peek();
      if (t && t.type === 'and') {
        p++;
        parts.push(parseNot());
      } else if (startsOperand(t)) {
        parts.push(parseNot());
      } else break;
    }
    return parts.length === 1 ? parts[0] : (r) => parts.every((f) => f(r));
  }
  function parseNot() {
    const t = peek();
    if (t && t.type === 'not') {
      p++;
      const inner = parseNot();
      return (r) => !inner(r);
    }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = peek();
    if (!t) throw new QuerySyntaxError(q.length, 'unexpected end of query');
    if (t.type === 'error') throw new QuerySyntaxError(t.pos);
    if (t.type === 'lparen') {
      p++;
      const e = parseOr();
      if (!peek()) throw new QuerySyntaxError(q.length, 'missing closing parenthesis');
      p++;
      return e;
    }
    if (t.type === 'term') {
      p++;
      return buildTerm(t.test);
    }
    throw new QuerySyntaxError(t.pos, 'unexpected token');
  }

  const fn = parseOr();
  const rest = peek();
  if (rest) throw new QuerySyntaxError(rest.pos, 'unexpected token');
  return fn;
}

module.exports = { compile, QuerySyntaxError };
