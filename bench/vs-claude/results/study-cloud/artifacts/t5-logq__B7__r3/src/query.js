'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super('syntax error at position ' + position);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD = '[A-Za-z_@][A-Za-z0-9_.@-]*';
const FIELD_FULL_RE = new RegExp('^' + FIELD + '$');
const CMP_RE = new RegExp('^(' + FIELD + ')(>=|<=|>|<)');
const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Đọc chuỗi trong ngoặc kép bắt đầu tại i (q[i] === '"'). Trả { value, end } hoặc null nếu không đóng.
function readQuoted(q, i) {
  let s = '';
  let j = i + 1;
  while (j < q.length) {
    const c = q[j];
    if (c === '\\' && j + 1 < q.length) {
      const d = q[j + 1];
      s += d === '"' || d === '\\' ? d : c + d;
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

function wildcardRe(v) {
  let src = '';
  for (const ch of v) {
    if (ch === '*') src += '.*';
    else if (ch === '?') src += '.';
    else src += esc(ch);
  }
  return new RegExp('^' + src + '$', 'isu');
}

function exactRe(v) {
  return new RegExp('^' + esc(v) + '$', 'isu');
}

function substr(s) {
  const l = s.toLowerCase();
  return (text) => text.toLowerCase().includes(l);
}

function msgTest(match) {
  return (r) => {
    let m;
    if (has(r, 'msg') && r.msg != null) m = r.msg;
    else if (has(r, 'message') && r.message != null) m = r.message;
    else return false;
    return match(String(m));
  };
}

function fieldTest(field, re) {
  return (r) => has(r, field) && r[field] != null && re.test(String(r[field]));
}

function cmpTest(field, op, num) {
  return (r) => {
    if (!has(r, field)) return false;
    let v = r[field];
    if (typeof v === 'string' && NUM_RE.test(v)) v = Number(v);
    if (typeof v !== 'number' || Number.isNaN(v)) return false;
    switch (op) {
      case '>=': return v >= num;
      case '<=': return v <= num;
      case '>': return v > num;
      default: return v < num;
    }
  };
}

// Token lỗi được đẩy vào danh sách và chỉ ném khi parser chạm tới (để lỗi sớm hơn thắng).
function tokenize(q) {
  const toks = [];
  const n = q.length;
  let i = 0;
  const err = (pos) => { toks.push({ type: 'error', pos }); return toks; };
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ type: c, pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(q, i);
      if (!r) return err(i);
      toks.push({ type: 'term', pos: i, test: msgTest(substr(r.value)) });
      i = r.end;
      continue;
    }
    const start = i;
    while (i < n && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && q[i - 1] === ':' && FIELD_FULL_RE.test(q.slice(start, i - 1))) break;
      i++;
    }
    const word = q.slice(start, i);
    if (i < n && q[i] === '"') {
      const field = word.slice(0, -1);
      const r = readQuoted(q, i);
      if (!r) return err(i);
      if (field === '_exists_') {
        toks.push({ type: 'term', pos: start, test: (rec) => has(rec, r.value) && rec[r.value] != null });
      } else {
        toks.push({ type: 'term', pos: start, test: fieldTest(field, exactRe(r.value)) });
      }
      i = r.end;
      continue;
    }
    if (word === 'AND' || word === 'OR' || word === 'NOT') {
      toks.push({ type: word, pos: start });
      continue;
    }
    const cm = CMP_RE.exec(word);
    if (cm) {
      const rest = word.slice(cm[0].length);
      if (!NUM_RE.test(rest)) return err(start + cm[0].length);
      toks.push({ type: 'term', pos: start, test: cmpTest(cm[1], cm[2], Number(rest)) });
      continue;
    }
    const ci = word.indexOf(':');
    if (ci >= 0) {
      const field = word.slice(0, ci);
      const value = word.slice(ci + 1);
      if (!FIELD_FULL_RE.test(field)) return err(start);
      if (value === '') return err(start + ci + 1);
      if (field === '_exists_') {
        if (!FIELD_FULL_RE.test(value)) return err(start + ci + 1);
        toks.push({ type: 'term', pos: start, test: (rec) => has(rec, value) && rec[value] != null });
      } else {
        toks.push({ type: 'term', pos: start, test: fieldTest(field, wildcardRe(value)) });
      }
      continue;
    }
    toks.push({ type: 'term', pos: start, test: msgTest(substr(word)) });
  }
  return toks;
}

function compile(query) {
  const q = query == null ? '' : String(query);
  if (q.trim() === '') return () => true;
  const toks = tokenize(q);
  let p = 0;
  const peek = () => {
    const t = toks[p];
    if (t && t.type === 'error') throw new QuerySyntaxError(t.pos);
    return t;
  };
  const eofPos = q.length;

  function parseOr() {
    const parts = [parseAnd()];
    while (peek() && peek().type === 'OR') {
      p++;
      parts.push(parseAnd());
    }
    return parts.length === 1 ? parts[0] : (r) => parts.some((f) => f(r));
  }
  function parseAnd() {
    const parts = [parseNot()];
    for (;;) {
      const t = peek();
      if (!t || t.type === 'OR' || t.type === ')') break;
      if (t.type === 'AND') p++;
      parts.push(parseNot());
    }
    return parts.length === 1 ? parts[0] : (r) => parts.every((f) => f(r));
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
    if (!t) throw new QuerySyntaxError(eofPos);
    if (t.type === '(') {
      p++;
      const inner = parseOr();
      const c = peek();
      if (!c) throw new QuerySyntaxError(eofPos);
      if (c.type !== ')') throw new QuerySyntaxError(c.pos);
      p++;
      return inner;
    }
    if (t.type === 'term') {
      p++;
      return t.test;
    }
    throw new QuerySyntaxError(t.pos); // AND/OR/')' ở chỗ cần toán hạng
  }

  const fn = parseOr();
  const rest = peek();
  if (rest) throw new QuerySyntaxError(rest.pos);
  return (record) => fn(record) === true;
}

module.exports = { compile, QuerySyntaxError };
