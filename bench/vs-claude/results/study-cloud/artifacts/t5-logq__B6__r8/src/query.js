'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super(`syntax error at position ${position}`);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)(.*)$/s;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Tokenizer có vị trí ký tự.
function tokenize(q) {
  const toks = [];
  let i = 0;
  const n = q.length;
  const readQuoted = (open) => {
    let j = open + 1;
    let s = '';
    while (j < n) {
      const c = q[j];
      if (c === '\\' && j + 1 < n && (q[j + 1] === '"' || q[j + 1] === '\\')) {
        s += q[j + 1];
        j += 2;
      } else if (c === '"') {
        return { value: s, end: j + 1 };
      } else {
        s += c;
        j++;
      }
    }
    throw new QuerySyntaxError(open);
  };
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { toks.push({ t: 'LP', pos: i }); i++; continue; }
    if (c === ')') { toks.push({ t: 'RP', pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(i);
      toks.push({ t: 'QUOTED', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    const start = i;
    let quoted = null;
    while (i < n && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && q[i - 1] === ':') {
        const r = readQuoted(i);
        quoted = { value: r.value, qpos: i };
        i = r.end;
        break;
      }
      i++;
    }
    if (quoted) {
      const field = q.slice(start, quoted.qpos - 1);
      if (!FIELD_RE.test(field)) throw new QuerySyntaxError(start);
      toks.push({ t: 'FIELDQ', field, value: quoted.value, pos: start });
      continue;
    }
    const text = q.slice(start, i);
    if (text === 'AND' || text === 'OR' || text === 'NOT') {
      toks.push({ t: 'KW', text, pos: start });
    } else {
      toks.push({ t: 'WORD', text, pos: start });
    }
  }
  toks.push({ t: 'EOF', pos: n });
  return toks;
}

function wildcardRe(v) {
  const src = v.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^(?:${src})$`, 'is');
}

function fieldValue(rec, f) {
  if (rec === null || typeof rec !== 'object' || !hasOwn(rec, f)) return undefined;
  const v = rec[f];
  return v === null ? undefined : v;
}

function numOf(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function substrMatcher(needle) {
  const nd = needle.toLowerCase();
  return (rec) => {
    let v = fieldValue(rec, 'msg');
    if (v === undefined) v = fieldValue(rec, 'message');
    if (v === undefined) return false;
    return String(v).toLowerCase().includes(nd);
  };
}

function termFromWord(tok) {
  const text = tok.text;
  const pos = tok.pos;
  if (text.startsWith('_exists_:')) {
    const f = text.slice(9);
    if (!f || !FIELD_RE.test(f)) throw new QuerySyntaxError(pos + 9);
    return (rec) => fieldValue(rec, f) !== undefined;
  }
  const m = CMP_RE.exec(text);
  const ci = text.indexOf(':');
  if (m && (ci === -1 || ci > m[1].length)) {
    const [, f, op, rhs] = m;
    if (!NUM_RE.test(rhs)) throw new QuerySyntaxError(pos + f.length + op.length);
    const n = Number(rhs);
    return (rec) => {
      const v = fieldValue(rec, f);
      if (v === undefined) return false;
      const x = numOf(v);
      if (x === null) return false;
      switch (op) {
        case '>=': return x >= n;
        case '<=': return x <= n;
        case '>': return x > n;
        default: return x < n;
      }
    };
  }
  if (ci !== -1) {
    const f = text.slice(0, ci);
    if (!FIELD_RE.test(f)) throw new QuerySyntaxError(pos);
    const val = text.slice(ci + 1);
    if (!val) throw new QuerySyntaxError(pos + ci + 1);
    const re = wildcardRe(val);
    return (rec) => {
      const v = fieldValue(rec, f);
      return v !== undefined && re.test(String(v));
    };
  }
  return substrMatcher(text);
}

function compile(query) {
  const q = String(query);
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];

  function expr() {
    const parts = [andExpr()];
    while (peek().t === 'KW' && peek().text === 'OR') {
      p++;
      parts.push(andExpr());
    }
    return parts.length === 1 ? parts[0] : (r) => parts.some((f) => f(r));
  }

  function andExpr() {
    const parts = [notExpr()];
    for (;;) {
      const t = peek();
      if (t.t === 'KW' && t.text === 'AND') {
        p++;
        parts.push(notExpr());
      } else if (t.t === 'EOF' || t.t === 'RP' || (t.t === 'KW' && t.text === 'OR')) {
        break;
      } else {
        parts.push(notExpr());
      }
    }
    return parts.length === 1 ? parts[0] : (r) => parts.every((f) => f(r));
  }

  function notExpr() {
    const t = peek();
    if (t.t === 'KW' && t.text === 'NOT') {
      p++;
      const f = notExpr();
      return (r) => !f(r);
    }
    return primary();
  }

  function primary() {
    const t = peek();
    switch (t.t) {
      case 'LP': {
        p++;
        const f = expr();
        if (peek().t !== 'RP') throw new QuerySyntaxError(q.length);
        p++;
        return f;
      }
      case 'EOF': throw new QuerySyntaxError(q.length);
      case 'RP': throw new QuerySyntaxError(t.pos);
      case 'KW': throw new QuerySyntaxError(t.pos); // AND/OR (NOT xử lý ở notExpr)
      case 'QUOTED': p++; return substrMatcher(t.value);
      case 'FIELDQ': {
        p++;
        const want = t.value.toLowerCase();
        const f = t.field;
        return (rec) => {
          const v = fieldValue(rec, f);
          return v !== undefined && String(v).toLowerCase() === want;
        };
      }
      default: p++; return termFromWord(t);
    }
  }

  if (toks.length === 1) return () => true;
  const f = expr();
  if (peek().t !== 'EOF') throw new QuerySyntaxError(peek().pos);
  return (rec) => f(rec);
}

module.exports = { compile, QuerySyntaxError };
