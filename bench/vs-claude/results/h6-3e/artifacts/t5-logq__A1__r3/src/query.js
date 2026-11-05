'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super('syntax error at position ' + position);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_SRC = '[A-Za-z_@][A-Za-z0-9_.@-]*';
const FIELD_RE = new RegExp('^' + FIELD_SRC + '$');
const CMP_RE = new RegExp('^(' + FIELD_SRC + ')(>=|<=|>|<)(.*)$', 's');
const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// ---- tokenizer (lỗi được hoãn tới khi parser chạm tới token) ----
function tokenize(q) {
  const toks = [];
  const n = q.length;
  let i = 0;
  const isWs = (c) => /\s/.test(c);

  // đọc chuỗi trong ngoặc kép bắt đầu tại q[i] === '"'; trả {value,end} hoặc null
  function readQuoted(start) {
    let j = start + 1;
    let v = '';
    while (j < n) {
      const c = q[j];
      if (c === '\\') {
        if (j + 1 >= n) return null;
        const d = q[j + 1];
        if (d === '"' || d === '\\') v += d;
        else v += '\\' + d;
        j += 2;
      } else if (c === '"') {
        return { value: v, end: j + 1 };
      } else {
        v += c;
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
      if (!r) { toks.push({ type: 'bad', pos: i }); i = n; continue; }
      toks.push({ type: 'quoted', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    const start = i;
    let fq = null;
    while (i < n && !isWs(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && q[i - 1] === ':' && FIELD_RE.test(q.slice(start, i - 1))) {
        const r = readQuoted(i);
        if (!r) { fq = { bad: true, pos: i }; i = n; }
        else { fq = { field: q.slice(start, i - 1), value: r.value }; i = r.end; }
        break;
      }
      i++;
    }
    if (fq) {
      if (fq.bad) toks.push({ type: 'bad', pos: fq.pos });
      else toks.push({ type: 'fq', field: fq.field, value: fq.value, pos: start });
    } else {
      toks.push({ type: 'word', text: q.slice(start, i), pos: start });
    }
  }
  return toks;
}

// ---- helpers ngữ nghĩa ----
function wildcardRegex(pattern) {
  let src = '';
  for (const ch of pattern) {
    if (ch === '*') src += '.*';
    else if (ch === '?') src += '.';
    else src += ch.replace(/[.+^${}()|[\]\\\-\/]/g, '\\$&');
  }
  return new RegExp('^' + src + '$', 'is');
}

function present(rec, f) {
  return has(rec, f) && rec[f] !== null && rec[f] !== undefined;
}

function numeric(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function msgOf(rec) {
  if (present(rec, 'msg')) return String(rec.msg);
  if (present(rec, 'message')) return String(rec.message);
  return null;
}

function substrPred(text) {
  const needle = text.toLowerCase();
  return (rec) => {
    const m = msgOf(rec);
    return m !== null && m.toLowerCase().includes(needle);
  };
}

function compile(query) {
  const q = String(query === undefined || query === null ? '' : query);
  const toks = tokenize(q);
  if (toks.length === 0) return () => true;

  let p = 0;
  const peek = () => toks[p];
  const isKw = (t, kw) => t && t.type === 'word' && t.text === kw;

  function parseOr() {
    const parts = [parseAnd()];
    while (isKw(peek(), 'OR')) {
      p++;
      parts.push(parseAnd());
    }
    if (parts.length === 1) return parts[0];
    return (r) => parts.some((f) => f(r));
  }

  function startsPrimary(t) {
    if (!t) return false;
    if (t.type === 'rp') return false;
    if (isKw(t, 'OR') || isKw(t, 'AND')) return false;
    return true;
  }

  function parseAnd() {
    const parts = [parseNot()];
    while (true) {
      const t = peek();
      if (isKw(t, 'AND')) {
        p++;
        parts.push(parseNot());
      } else if (startsPrimary(t)) {
        parts.push(parseNot());
      } else break;
    }
    if (parts.length === 1) return parts[0];
    return (r) => parts.every((f) => f(r));
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
    if (!t) throw new QuerySyntaxError(q.length);
    switch (t.type) {
      case 'bad': throw new QuerySyntaxError(t.pos);
      case 'rp': throw new QuerySyntaxError(t.pos);
      case 'lp': {
        p++;
        const e = parseOr();
        const c = peek();
        if (!c) throw new QuerySyntaxError(q.length);
        if (c.type !== 'rp') throw new QuerySyntaxError(c.pos);
        p++;
        return e;
      }
      case 'quoted':
        p++;
        return substrPred(t.value);
      case 'fq': {
        p++;
        const want = t.value.toLowerCase();
        const f = t.field;
        return (r) => present(r, f) && String(r[f]).toLowerCase() === want;
      }
      case 'word':
        if (t.text === 'AND' || t.text === 'OR') throw new QuerySyntaxError(t.pos);
        p++;
        return wordTerm(t);
      default:
        throw new QuerySyntaxError(t.pos);
    }
  }

  function wordTerm(t) {
    const w = t.text;
    if (w.startsWith('_exists_:')) {
      const f = w.slice(9);
      if (!FIELD_RE.test(f)) throw new QuerySyntaxError(t.pos + 9);
      return (r) => present(r, f);
    }
    const cm = CMP_RE.exec(w);
    if (cm) {
      const [, f, op, rhs] = cm;
      if (!NUM_RE.test(rhs)) throw new QuerySyntaxError(t.pos + f.length + op.length);
      const n = Number(rhs);
      return (r) => {
        if (!has(r, f)) return false;
        const v = numeric(r[f]);
        if (v === null) return false;
        switch (op) {
          case '>=': return v >= n;
          case '<=': return v <= n;
          case '>': return v > n;
          default: return v < n;
        }
      };
    }
    const ci = w.indexOf(':');
    if (ci >= 0) {
      const f = w.slice(0, ci);
      if (!FIELD_RE.test(f)) throw new QuerySyntaxError(t.pos);
      const val = w.slice(ci + 1);
      if (val === '') throw new QuerySyntaxError(t.pos + ci + 1);
      const re = wildcardRegex(val);
      return (r) => present(r, f) && re.test(String(r[f]));
    }
    return substrPred(w);
  }

  const result = parseOr();
  if (p < toks.length) throw new QuerySyntaxError(toks[p].pos);
  return result;
}

module.exports = { compile, QuerySyntaxError };
