'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super('syntax error at position ' + position);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD = '[A-Za-z_@][A-Za-z0-9_.@-]*';
const CMP_RE = new RegExp('^(' + FIELD + ')(>=|<=|>|<)([\\s\\S]*)$');
const FIELD_VAL_RE = new RegExp('^(' + FIELD + '):([\\s\\S]*)$');
const FIELD_ONLY_RE = new RegExp('^' + FIELD + '$');
const NUM_RE = /^-?\d+(\.\d+)?$/;

function has(rec, f) {
  return Object.prototype.hasOwnProperty.call(rec, f);
}

function tokenize(q) {
  const toks = [];
  const n = q.length;
  let i = 0;
  const isWs = (c) => /\s/.test(c);
  // Trả về { value, end } hoặc null nếu không đóng
  function readQuoted(start) {
    let s = '';
    let j = start + 1;
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
    return null;
  }
  while (i < n) {
    const c = q[i];
    if (isWs(c)) { i++; continue; }
    if (c === '(') { toks.push({ type: 'lp', pos: i }); i++; continue; }
    if (c === ')') { toks.push({ type: 'rp', pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(i);
      if (!r) { toks.push({ type: 'badquote', pos: i }); break; }
      toks.push({ type: 'quoted', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    const start = i;
    let fq = null;
    while (i < n && !isWs(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && q[i - 1] === ':') {
        const r = readQuoted(i);
        if (!r) { fq = { bad: i }; break; }
        fq = { value: r.value, end: r.end, qpos: i };
        break;
      }
      i++;
    }
    if (fq && fq.bad !== undefined) {
      toks.push({ type: 'badquote', pos: fq.bad });
      break;
    }
    if (fq) {
      toks.push({ type: 'fq', field: q.slice(start, fq.qpos - 1), value: fq.value, pos: start });
      i = fq.end;
      continue;
    }
    toks.push({ type: 'word', text: q.slice(start, i), pos: start });
  }
  toks.push({ type: 'eof', pos: n });
  return toks;
}

function wildcardRegex(v) {
  let re = '';
  for (const ch of v) {
    if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'i');
}

function toNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function msgOf(rec) {
  if (has(rec, 'msg') && rec.msg != null) return String(rec.msg);
  if (has(rec, 'message') && rec.message != null) return String(rec.message);
  return null;
}

function compile(query) {
  const q = String(query == null ? '' : query);
  if (q.trim() === '') return () => true;
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];
  const isKw = (t, kw) => t.type === 'word' && t.text === kw;

  function parseExpr() {
    const first = parseAnd();
    const parts = [first];
    while (isKw(peek(), 'OR')) {
      p++;
      parts.push(parseAnd());
    }
    return parts.length === 1 ? first : (r) => parts.some((f) => f(r));
  }

  function parseAnd() {
    const parts = [parseNot()];
    while (true) {
      const t = peek();
      if (t.type === 'eof' || t.type === 'rp' || isKw(t, 'OR')) break;
      if (isKw(t, 'AND')) p++;
      parts.push(parseNot());
    }
    return parts.length === 1 ? parts[0] : (r) => parts.every((f) => f(r));
  }

  function parseNot() {
    if (isKw(peek(), 'NOT')) {
      p++;
      const inner = parseNot();
      return (r) => !inner(r);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    switch (t.type) {
      case 'eof': throw new QuerySyntaxError(q.length);
      case 'rp': throw new QuerySyntaxError(t.pos);
      case 'badquote': throw new QuerySyntaxError(t.pos);
      case 'lp': {
        p++;
        const e = parseExpr();
        if (peek().type !== 'rp') throw new QuerySyntaxError(q.length);
        p++;
        return e;
      }
      case 'quoted': {
        p++;
        return substringMatcher(t.value);
      }
      case 'fq': {
        p++;
        if (!FIELD_ONLY_RE.test(t.field)) throw new QuerySyntaxError(t.pos);
        const want = t.value.toLowerCase();
        const f = t.field;
        return (r) => has(r, f) && r[f] != null && String(r[f]).toLowerCase() === want;
      }
      default: {
        if (t.text === 'AND' || t.text === 'OR') throw new QuerySyntaxError(t.pos);
        p++;
        return wordTerm(t);
      }
    }
  }

  function substringMatcher(s) {
    const want = s.toLowerCase();
    return (r) => {
      const m = msgOf(r);
      return m !== null && m.toLowerCase().includes(want);
    };
  }

  function wordTerm(t) {
    const text = t.text;
    let m;
    if (text.startsWith('_exists_:')) {
      const f = text.slice(9);
      if (f === '' || !FIELD_ONLY_RE.test(f)) throw new QuerySyntaxError(t.pos + 9);
      return (r) => has(r, f) && r[f] != null;
    }
    if ((m = CMP_RE.exec(text))) {
      const f = m[1];
      const op = m[2];
      const rest = m[3];
      if (!NUM_RE.test(rest)) throw new QuerySyntaxError(t.pos + f.length + op.length);
      const n = Number(rest);
      return (r) => {
        if (!has(r, f)) return false;
        const v = toNum(r[f]);
        if (v === null) return false;
        if (op === '>=') return v >= n;
        if (op === '<=') return v <= n;
        if (op === '>') return v > n;
        return v < n;
      };
    }
    if ((m = FIELD_VAL_RE.exec(text))) {
      const f = m[1];
      const val = m[2];
      if (val === '') throw new QuerySyntaxError(t.pos + f.length + 1);
      const re = wildcardRegex(val);
      return (r) => has(r, f) && r[f] != null && re.test(String(r[f]));
    }
    if (text.includes(':')) {
      const idx = text.indexOf(':');
      throw new QuerySyntaxError(idx === 0 ? t.pos : t.pos + idx + 1);
    }
    return substringMatcher(text);
  }

  const fn = parseExpr();
  const t = peek();
  if (t.type !== 'eof') throw new QuerySyntaxError(t.pos);
  return fn;
}

module.exports = { compile, QuerySyntaxError };
