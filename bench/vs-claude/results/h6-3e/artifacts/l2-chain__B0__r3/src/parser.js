// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.
import { tokenize } from './lexer.js';

class ParseError extends Error {
  constructor(code, message, tok) {
    super(message);
    this.info = { code, message, line: tok.line, column: tok.column };
  }
}

function unexpected(tok) {
  if (tok.type === 'eof') return new ParseError('PARSE_UNEXPECTED_EOF', 'Hết tệp đột ngột', tok);
  return new ParseError('PARSE_UNEXPECTED_TOKEN', 'Token không mong đợi', tok);
}

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  // không bao giờ đọc quá token eof
  const next = () => (tokens[p].type === 'eof' ? tokens[p] : tokens[p++]);
  const pos = (t) => ({ line: t.line, column: t.column });
  const isP = (t, v) => t.type === 'punct' && t.value === v;

  function value() {
    const t = next();
    if (t.type === 'number') return { type: 'Number', value: t.value, ...pos(t) };
    if (t.type === 'string') return { type: 'String', parts: t.value, ...pos(t) };
    if (t.type === 'keyword' && t.value === 'true') return { type: 'Bool', value: true, ...pos(t) };
    if (t.type === 'keyword' && t.value === 'false') return { type: 'Bool', value: false, ...pos(t) };
    if (t.type === 'keyword' && t.value === 'null') return { type: 'Null', ...pos(t) };
    if (isP(t, '[')) {
      const items = [];
      for (;;) {
        if (isP(peek(), ']')) { next(); break; }
        items.push(value());
        const s = next();
        if (isP(s, ',')) continue;
        if (isP(s, ']')) break;
        throw unexpected(s);
      }
      return { type: 'Array', items, ...pos(t) };
    }
    throw unexpected(t);
  }

  function expectEq() {
    const e = next();
    if (!isP(e, '=')) throw unexpected(e);
  }

  function stmt(top) {
    const t = next();
    if (t.type === 'ident') {
      const n = next();
      if (isP(n, '=')) return { type: 'Assign', key: t.value, value: value(), ...pos(t) };
      if (isP(n, '{')) {
        const body = stmts(false);
        next(); // '}'
        return { type: 'Block', key: t.value, body, ...pos(t) };
      }
      throw unexpected(n);
    }
    if (t.type === 'keyword' && t.value === 'include') {
      const s = next();
      if (s.type !== 'string') throw unexpected(s);
      if (s.value.some((x) => x.type === 'Ref')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
      }
      return { type: 'Include', path: s.value.map((x) => x.value).join(''), ...pos(t) };
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
      const nm = next();
      if (nm.type !== 'ident') throw unexpected(nm);
      expectEq();
      return { type: 'Const', name: nm.value, value: value(), ...pos(t) };
    }
    throw unexpected(t);
  }

  function stmts(top) {
    const body = [];
    for (;;) {
      const t = peek();
      if (t.type === 'eof') {
        if (top) return body;
        throw unexpected(t);
      }
      if (isP(t, '}')) {
        if (!top) return body;
        throw unexpected(t);
      }
      body.push(stmt(top));
    }
  }

  return { type: 'File', body: stmts(true), line: 1, column: 1 };
}

export function parse(source) {
  const lx = tokenize(source);
  if (!lx.ok) return lx;
  try {
    return { ok: true, ast: parseTokens(lx.tokens) };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.info };
    throw e;
  }
}

function includesOf(stmts, out = []) {
  for (const s of stmts) {
    if (s.type === 'Include') out.push(s.path);
    else if (s.type === 'Block') includesOf(s.body, out);
  }
  return out;
}

export function parseProject(files, entry) {
  if (!Object.hasOwn(files, entry)) {
    return { ok: false, error: { code: 'PARSE_ENTRY_NOT_FOUND', message: 'Không tìm thấy tệp vào', file: entry, line: 1, column: 1 } };
  }
  const parsed = {};
  const seen = new Set();
  let error = null;
  const visit = (name) => {
    seen.add(name);
    const r = parse(files[name]);
    if (!r.ok) { error = { ...r.error, file: name }; return false; }
    parsed[name] = r.ast;
    for (const path of includesOf(r.ast.body)) {
      if (Object.hasOwn(files, path) && !seen.has(path)) {
        if (!visit(path)) return false;
      }
    }
    return true;
  };
  if (!visit(entry)) {
    const { code, message, file, line, column } = error;
    return { ok: false, error: { code, message, file, line, column } };
  }
  return { ok: true, program: { entry, files: parsed } };
}
