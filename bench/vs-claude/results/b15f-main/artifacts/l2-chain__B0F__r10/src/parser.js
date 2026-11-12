// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.
import { tokenize } from './lexer.js';

class ParseError {
  constructor(code, message, tok) {
    this.code = code; this.message = message; this.line = tok.line; this.column = tok.column;
  }
}

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const fail = (tok, what) => {
    if (tok.type === 'eof') throw new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp, cần ${what}`, tok);
    throw new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi, cần ${what}`, tok);
  };
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;
  const pos = (t) => ({ line: t.line, column: t.column });

  function value() {
    const t = peek();
    if (t.type === 'number') { next(); return { type: 'Number', value: t.value, ...pos(t) }; }
    if (t.type === 'string') { next(); return { type: 'String', parts: t.value, ...pos(t) }; }
    if (t.type === 'keyword' && (t.value === 'true' || t.value === 'false')) {
      next(); return { type: 'Bool', value: t.value === 'true', ...pos(t) };
    }
    if (t.type === 'keyword' && t.value === 'null') { next(); return { type: 'Null', ...pos(t) }; }
    if (isPunct(t, '[')) {
      next();
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) { next(); break; }
        items.push(value());
        const n = peek();
        if (isPunct(n, ',')) { next(); continue; }
        if (isPunct(n, ']')) { next(); break; }
        fail(n, '"," hoặc "]"');
      }
      return { type: 'Array', items, ...pos(t) };
    }
    return fail(t, 'một giá trị');
  }

  function stmt(top) {
    const t = peek();
    if (t.type === 'keyword' && t.value === 'include') {
      next();
      const s = peek();
      if (s.type !== 'string') fail(s, 'chuỗi đường dẫn');
      next();
      if (s.value.some((x) => x.type === 'Ref')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được có nội suy', s);
      }
      return { type: 'Include', path: s.value.map((x) => x.value).join(''), ...pos(t) };
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ ở cấp cao nhất', t);
      next();
      const n = peek();
      if (n.type !== 'ident') fail(n, 'tên hằng');
      next();
      const eq = peek();
      if (!isPunct(eq, '=')) fail(eq, '"="');
      next();
      return { type: 'Const', name: n.value, value: value(), ...pos(t) };
    }
    if (t.type === 'ident') {
      next();
      const n = peek();
      if (isPunct(n, '=')) { next(); return { type: 'Assign', key: t.value, value: value(), ...pos(t) }; }
      if (isPunct(n, '{')) {
        next();
        const body = stmts(false);
        next(); // '}'
        return { type: 'Block', key: t.value, body, ...pos(t) };
      }
      return fail(n, '"=" hoặc "{"');
    }
    return fail(t, 'câu lệnh');
  }

  function stmts(top) {
    const out = [];
    for (;;) {
      const t = peek();
      if (t.type === 'eof') {
        if (top) return out;
        fail(t, '"}"');
      }
      if (!top && isPunct(t, '}')) return out;
      out.push(stmt(top));
    }
  }

  const body = stmts(true);
  return { type: 'File', body, line: 1, column: 1 };
}

function parseSafe(source) {
  const lx = tokenize(source);
  if (!lx.ok) return lx;
  try {
    return { ok: true, ast: parseTokens(lx.tokens) };
  } catch (e) {
    if (e instanceof ParseError) {
      return { ok: false, error: { code: e.code, message: e.message, line: e.line, column: e.column } };
    }
    return { ok: false, error: { code: 'PARSE_UNEXPECTED_TOKEN', message: String(e && e.message), line: 1, column: 1 } };
  }
}

export function parse(source) {
  return parseSafe(String(source));
}

function collectIncludes(body, out) {
  for (const s of body) {
    if (s.type === 'Include') out.push(s.path);
    else if (s.type === 'Block') collectIncludes(s.body, out);
  }
  return out;
}

export function parseProject(files, entry) {
  const has = (n) => files != null && Object.hasOwn(files, n);
  if (!has(entry)) {
    return { ok: false, error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không có tệp vào: ${entry}`, file: entry, line: 1, column: 1 } };
  }
  const out = {};
  let failure = null;
  const visit = (name) => {
    const r = parseSafe(files[name]);
    if (!r.ok) {
      const { code, message, line, column } = r.error;
      failure = { code, message, file: name, line, column };
      return;
    }
    out[name] = r.ast;
    for (const path of collectIncludes(r.ast.body, [])) {
      if (has(path) && !Object.hasOwn(out, path)) {
        visit(path);
        if (failure) return;
      }
    }
  };
  visit(entry);
  if (failure) return { ok: false, error: failure };
  return { ok: true, program: { entry, files: out } };
}
