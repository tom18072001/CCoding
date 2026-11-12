// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.

import { tokenize } from './lexer.js';

class ParseError extends Error {
  constructor(code, message, tok) {
    super(message);
    this.info = { code, message, line: tok.line, column: tok.column };
  }
}

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const unexpected = (tok, what) =>
    tok.type === 'eof'
      ? new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đang đợi ${what}`, tok)
      : new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi khi đang đợi ${what}`, tok);
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;

  function value() {
    const t = peek();
    if (t.type === 'number') { next(); return { type: 'Number', line: t.line, column: t.column, value: t.value }; }
    if (t.type === 'string') { next(); return { type: 'String', line: t.line, column: t.column, parts: t.value }; }
    if (t.type === 'keyword' && (t.value === 'true' || t.value === 'false')) {
      next();
      return { type: 'Bool', line: t.line, column: t.column, value: t.value === 'true' };
    }
    if (t.type === 'keyword' && t.value === 'null') { next(); return { type: 'Null', line: t.line, column: t.column }; }
    if (isPunct(t, '[')) {
      next();
      const items = [];
      while (true) {
        if (isPunct(peek(), ']')) { next(); break; }
        items.push(value());
        const s = peek();
        if (isPunct(s, ',')) { next(); continue; }
        if (isPunct(s, ']')) { next(); break; }
        throw unexpected(s, "',' hoặc ']'");
      }
      return { type: 'Array', line: t.line, column: t.column, items };
    }
    throw unexpected(t, 'giá trị');
  }

  function stmts(top) {
    const body = [];
    while (true) {
      const t = peek();
      if (t.type === 'eof') {
        if (top) return body;
        throw unexpected(t, "'}'");
      }
      if (isPunct(t, '}') && !top) { next(); return body; }
      if (t.type === 'ident') {
        next();
        const s = peek();
        if (isPunct(s, '=')) {
          next();
          body.push({ type: 'Assign', line: t.line, column: t.column, key: t.value, value: value() });
        } else if (isPunct(s, '{')) {
          next();
          body.push({ type: 'Block', line: t.line, column: t.column, key: t.value, body: stmts(false) });
        } else {
          throw unexpected(s, "'=' hoặc '{'");
        }
      } else if (t.type === 'keyword' && t.value === 'include') {
        next();
        const s = peek();
        if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
        if (s.value.some((x) => x.type !== 'Text')) {
          throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
        }
        next();
        body.push({ type: 'Include', line: t.line, column: t.column, path: s.value.map((x) => x.value).join('') });
      } else if (t.type === 'keyword' && t.value === 'const') {
        if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
        next();
        const nm = peek();
        if (nm.type !== 'ident') throw unexpected(nm, 'tên hằng');
        next();
        const eq = peek();
        if (!isPunct(eq, '=')) throw unexpected(eq, "'='");
        next();
        body.push({ type: 'Const', line: t.line, column: t.column, name: nm.value, value: value() });
      } else {
        throw unexpected(t, 'câu lệnh');
      }
    }
  }

  return { type: 'File', line: 1, column: 1, body: stmts(true) };
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

function collectIncludes(body, out) {
  for (const s of body) {
    if (s.type === 'Include') out.push(s.path);
    else if (s.type === 'Block') collectIncludes(s.body, out);
  }
  return out;
}

export function parseProject(files, entry) {
  const has = (name) => files !== null && typeof files === 'object' && Object.hasOwn(files, name);
  if (!has(entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không tìm thấy tệp vào: ${entry}`, file: entry, line: 1, column: 1 },
    };
  }
  const parsed = {};
  let failure = null;
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) {
      failure = { code: r.error.code, message: r.error.message, file: name, line: r.error.line, column: r.error.column };
      return false;
    }
    Object.defineProperty(parsed, name, { value: r.ast, enumerable: true, writable: true, configurable: true });
    for (const path of collectIncludes(r.ast.body, [])) {
      if (has(path) && !Object.hasOwn(parsed, path)) {
        if (!visit(path)) return false;
      }
    }
    return true;
  };
  if (!visit(entry)) return { ok: false, error: failure };
  return { ok: true, program: { entry, files: parsed } };
}
