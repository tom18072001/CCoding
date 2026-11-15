'use strict';

class QuerySyntaxError extends Error {
  constructor(position) {
    super('syntax error at position ' + position);
    this.name = 'QuerySyntaxError';
    this.position = position;
  }
}

const NUM_RE = /^-?\d+(\.\d+)?$/;
const FIELD_PREFIX = /^[A-Za-z_@][A-Za-z0-9_.@-]*/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function tokenize(q) {
  const toks = [];
  const n = q.length;
  let i = 0;
  // returns {value,end} or null if unclosed
  function readQuoted(start) {
    let s = '';
    let j = start + 1;
    while (j < n) {
      const c = q[j];
      if (c === '\\' && j + 1 < n) {
        const d = q[j + 1];
        if (d === '"' || d === '\\') s += d;
        else s += c + d;
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
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { toks.push({ t: 'LP', pos: i }); i++; continue; }
    if (c === ')') { toks.push({ t: 'RP', pos: i }); i++; continue; }
    if (c === '"') {
      const r = readQuoted(i);
      if (!r) { toks.push({ t: 'BADQ', pos: i }); break; }
      toks.push({ t: 'QUOTED', pos: i, value: r.value });
      i = r.end;
      continue;
    }
    const start = i;
    while (i < n && !/\s/.test(q[i]) && q[i] !== '(' && q[i] !== ')') {
      if (q[i] === '"' && q[i - 1] === ':') break;
      i++;
    }
    const text = q.slice(start, i);
    if (i < n && q[i] === '"') {
      const r = readQuoted(i);
      if (!r) { toks.push({ t: 'BADQ', pos: i }); break; }
      toks.push({ t: 'FIELDQ', pos: start, field: text.slice(0, -1), value: r.value, fieldEnd: start + text.length });
      i = r.end;
      continue;
    }
    toks.push({ t: 'WORD', pos: start, text });
  }
  return toks;
}

function wildcardRe(v) {
  let s = '';
  for (const ch of v) {
    if (ch === '*') s += '.*';
    else if (ch === '?') s += '.';
    else s += ch.replace(/[.+^${}()|[\]\\\/-]/g, '\\$&');
  }
  return new RegExp('^' + s + '$', 'is');
}

function numeric(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function fieldEq(field, matcher) {
  return (r) => has(r, field) && r[field] !== null && r[field] !== undefined && matcher(String(r[field]));
}

function compile(query) {
  const q = String(query);
  if (q.trim() === '') return () => true;
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];

  function parseOr() {
    let node = parseAnd();
    const parts = [node];
    while (peek() && peek().t === 'WORD' && peek().text === 'OR') {
      p++;
      parts.push(parseAnd());
    }
    if (parts.length === 1) return node;
    return (r) => parts.some((f) => f(r));
  }

  function startsOperand(t) {
    if (!t) return false;
    if (t.t === 'RP') return false;
    if (t.t === 'WORD' && (t.text === 'OR')) return false;
    return true;
  }

  function parseAnd() {
    const parts = [parseNot()];
    for (;;) {
      const t = peek();
      if (t && t.t === 'WORD' && t.text === 'AND') {
        p++;
        parts.push(parseNot());
      } else if (startsOperand(t)) {
        parts.push(parseNot());
      } else break;
    }
    if (parts.length === 1) return parts[0];
    return (r) => parts.every((f) => f(r));
  }

  function parseNot() {
    const t = peek();
    if (t && t.t === 'WORD' && t.text === 'NOT') {
      p++;
      const f = parseNot();
      return (r) => !f(r);
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    if (!t) throw new QuerySyntaxError(q.length);
    if (t.t === 'BADQ') throw new QuerySyntaxError(t.pos);
    if (t.t === 'RP') throw new QuerySyntaxError(t.pos);
    if (t.t === 'LP') {
      p++;
      const nx = peek();
      if (nx && nx.t === 'RP') throw new QuerySyntaxError(nx.pos);
      const f = parseOr();
      const c = peek();
      if (!c) throw new QuerySyntaxError(q.length);
      // only RP can remain here
      p++;
      return f;
    }
    if (t.t === 'QUOTED') {
      p++;
      return textSearch(t.value);
    }
    if (t.t === 'FIELDQ') {
      p++;
      return fieldQuoted(t);
    }
    // WORD
    if (t.text === 'AND' || t.text === 'OR') throw new QuerySyntaxError(t.pos);
    p++;
    return wordTerm(t);
  }

  function fieldQuoted(t) {
    if (!FIELD_PREFIX.test(t.field) || FIELD_PREFIX.exec(t.field)[0] !== t.field) {
      throw new QuerySyntaxError(t.pos);
    }
    if (t.field === '_exists_') {
      const f = t.value;
      return (r) => has(r, f) && r[f] !== null && r[f] !== undefined;
    }
    const lv = t.value.toLowerCase();
    return fieldEq(t.field, (s) => s.toLowerCase() === lv);
  }

  function wordTerm(t) {
    const text = t.text;
    const m = FIELD_PREFIX.exec(text);
    const next = m ? text[m[0].length] : text[0];
    if (m && next === ':') {
      const field = m[0];
      const val = text.slice(field.length + 1);
      if (val === '') throw new QuerySyntaxError(t.pos + field.length + 1);
      if (field === '_exists_') {
        return (r) => has(r, val) && r[val] !== null && r[val] !== undefined;
      }
      const re = wildcardRe(val);
      return fieldEq(field, (s) => re.test(s));
    }
    if (m && (next === '>' || next === '<')) {
      const field = m[0];
      let op = next;
      let idx = field.length + 1;
      if (text[idx] === '=') { op += '='; idx++; }
      const rest = text.slice(idx);
      if (!NUM_RE.test(rest)) throw new QuerySyntaxError(t.pos + idx);
      const n = Number(rest);
      return (r) => {
        if (!has(r, field)) return false;
        const v = numeric(r[field]);
        if (v === null) return false;
        switch (op) {
          case '>': return v > n;
          case '>=': return v >= n;
          case '<': return v < n;
          default: return v <= n;
        }
      };
    }
    if (text.includes(':')) throw new QuerySyntaxError(t.pos);
    return textSearch(text);
  }

  function textSearch(word) {
    const w = word.toLowerCase();
    return (r) => {
      let v;
      if (has(r, 'msg') && r.msg !== null && r.msg !== undefined) v = r.msg;
      else if (has(r, 'message') && r.message !== null && r.message !== undefined) v = r.message;
      else return false;
      return String(v).toLowerCase().includes(w);
    };
  }

  const f = parseOr();
  if (p < toks.length) throw new QuerySyntaxError(toks[p].pos);
  return f;
}

module.exports = { compile, QuerySyntaxError };
