'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super(`syntax error at position ${position}`);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const CMP_RE = /^([A-Za-z_@][A-Za-z0-9_.@-]*)(>=|<=|>|<)/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

function tokenize(q) {
  const toks = [];
  let i = 0;
  const n = q.length;
  // Đọc chuỗi trong ngoặc kép bắt đầu tại `open`; trả về { value, end } hoặc null nếu không đóng.
  function readQuoted(open) {
    let out = '';
    let j = open + 1;
    while (j < n) {
      const c = q[j];
      if (c === '\\' && (q[j + 1] === '"' || q[j + 1] === '\\')) { out += q[j + 1]; j += 2; continue; }
      if (c === '"') return { value: out, end: j + 1 };
      out += c;
      j++;
    }
    return null;
  }
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ t: c, pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(i);
      if (!r) { toks.push({ t: 'ERR', pos: i }); break; }
      toks.push({ t: 'QUOTED', value: r.value, pos: i });
      i = r.end;
      continue;
    }
    let j = i;
    while (j < n && !/\s/.test(q[j]) && q[j] !== '(' && q[j] !== ')' && q[j] !== '"') j++;
    const text = q.slice(i, j);
    if (text === 'AND' || text === 'OR' || text === 'NOT') { toks.push({ t: text, pos: i }); i = j; continue; }
    const m = CMP_RE.exec(text);
    if (m) {
      const rest = text.slice(m[0].length);
      if (NUMBER_RE.test(rest)) toks.push({ t: 'CMP', field: m[1], op: m[2], num: Number(rest), pos: i });
      else toks.push({ t: 'ERR', pos: i + m[0].length });
      i = j;
      continue;
    }
    const ci = text.indexOf(':');
    if (ci >= 0) {
      const name = text.slice(0, ci);
      const val = text.slice(ci + 1);
      const afterColon = i + ci + 1;
      if (name === '_exists_') {
        if (!FIELD_RE.test(val)) toks.push({ t: 'ERR', pos: val === '' ? afterColon : i });
        else toks.push({ t: 'EXISTS', field: val, pos: i });
        i = j;
        continue;
      }
      if (!FIELD_RE.test(name)) { toks.push({ t: 'ERR', pos: i }); i = j; continue; }
      if (val === '') {
        if (j < n && q[j] === '"') {
          const r = readQuoted(j);
          if (!r) { toks.push({ t: 'ERR', pos: j }); break; }
          toks.push({ t: 'FV', field: name, value: r.value, quoted: true, pos: i });
          i = r.end;
          continue;
        }
        toks.push({ t: 'ERR', pos: afterColon });
        i = j;
        continue;
      }
      toks.push({ t: 'FV', field: name, value: val, quoted: false, pos: i });
      i = j;
      continue;
    }
    toks.push({ t: 'WORD', value: text, pos: i });
    i = j;
  }
  toks.push({ t: 'EOF', pos: n });
  return toks;
}

function present(rec, f) {
  return Object.prototype.hasOwnProperty.call(rec, f) && rec[f] !== null && rec[f] !== undefined;
}

function wildcardRegex(v) {
  let s = '';
  for (const ch of v) {
    if (ch === '*') s += '.*';
    else if (ch === '?') s += '.';
    else s += ch.replace(/[.+^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^' + s + '$', 'is');
}

function messageOf(rec) {
  if (present(rec, 'msg')) return String(rec.msg);
  if (present(rec, 'message')) return String(rec.message);
  return null;
}

function compile(query) {
  const q = String(query);
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];

  function parseOr() {
    let left = parseAnd();
    while (peek().t === 'OR') {
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
      const t = peek().t;
      if (t === 'EOF' || t === ')' || t === 'OR') break;
      if (t === 'AND') p++;
      const l = left;
      const right = parseNot();
      left = (r) => l(r) && right(r);
    }
    return left;
  }
  function parseNot() {
    if (peek().t === 'NOT') {
      p++;
      const inner = parseNot();
      return (r) => !inner(r);
    }
    return parsePrimary();
  }
  function parsePrimary() {
    const tk = peek();
    switch (tk.t) {
      case 'EOF': throw new QuerySyntaxError(q.length);
      case 'ERR': case 'AND': case 'OR': case ')': throw new QuerySyntaxError(tk.pos);
      case '(': {
        p++;
        const e = parseOr();
        if (peek().t !== ')') throw new QuerySyntaxError(peek().t === 'EOF' ? q.length : peek().pos);
        p++;
        return e;
      }
      case 'CMP': {
        p++;
        const { field, op, num } = tk;
        return (r) => {
          if (!Object.prototype.hasOwnProperty.call(r, field)) return false;
          let v = r[field];
          if (typeof v === 'string' && NUMBER_RE.test(v)) v = Number(v);
          if (typeof v !== 'number' || Number.isNaN(v)) return false;
          switch (op) {
            case '>=': return v >= num;
            case '<=': return v <= num;
            case '>': return v > num;
            default: return v < num;
          }
        };
      }
      case 'EXISTS': { p++; const f = tk.field; return (r) => present(r, f); }
      case 'FV': {
        p++;
        const { field, value } = tk;
        if (tk.quoted) {
          const lv = value.toLowerCase();
          return (r) => present(r, field) && String(r[field]).toLowerCase() === lv;
        }
        const re = wildcardRegex(value);
        return (r) => present(r, field) && re.test(String(r[field]));
      }
      default: { // WORD, QUOTED
        p++;
        const needle = tk.value.toLowerCase();
        return (r) => {
          const m = messageOf(r);
          return m !== null && m.toLowerCase().includes(needle);
        };
      }
    }
  }

  if (toks.length === 1) return () => true;
  const fn = parseOr();
  if (peek().t !== 'EOF') throw new QuerySyntaxError(peek().pos); // `)` thừa
  return (rec) => fn(rec);
}

module.exports = { compile, QuerySyntaxError };
