// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.

import { tokenize } from './lexer.js';

class ParseError extends Error {
  constructor(code, message, tok) {
    super(message);
    this.info = { code, message, line: tok.line, column: tok.column };
  }
}

function describe(tok) {
  return `${tok.type} ${JSON.stringify(tok.value)}`;
}

function unexpected(tok, want) {
  if (tok.type === 'eof') return new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đợi ${want}`, tok);
  return new ParseError('PARSE_UNEXPECTED_TOKEN', `Gặp ${describe(tok)}, cần ${want}`, tok);
}

function buildAst(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;

  function value() {
    const t = peek();
    if (t.type === 'number') { p++; return { type: 'Number', value: t.value, line: t.line, column: t.column }; }
    if (t.type === 'string') {
      p++;
      const parts = t.value.map((x) => (x.type === 'Text'
        ? { type: 'Text', value: x.value }
        : { type: 'Ref', path: [...x.path], const: x.const, line: x.line, column: x.column }));
      return { type: 'String', parts, line: t.line, column: t.column };
    }
    if (t.type === 'keyword') {
      if (t.value === 'true' || t.value === 'false') {
        p++;
        return { type: 'Bool', value: t.value === 'true', line: t.line, column: t.column };
      }
      if (t.value === 'null') { p++; return { type: 'Null', line: t.line, column: t.column }; }
    }
    if (isPunct(t, '[')) {
      p++;
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) { p++; break; }
        items.push(value());
        const s = peek();
        if (isPunct(s, ',')) { p++; continue; }
        if (isPunct(s, ']')) { p++; break; }
        throw unexpected(s, "',' hoặc ']'");
      }
      return { type: 'Array', items, line: t.line, column: t.column };
    }
    throw unexpected(t, 'giá trị');
  }

  function expectPunct(v) {
    const t = peek();
    if (!isPunct(t, v)) throw unexpected(t, `'${v}'`);
    p++;
  }

  // Đọc các câu lệnh; depth 0 là cấp cao nhất của tệp.
  function stmts(depth) {
    const body = [];
    for (;;) {
      const t = peek();
      if (t.type === 'eof') {
        if (depth === 0) return body;
        throw unexpected(t, "'}'");
      }
      if (isPunct(t, '}') && depth > 0) { p++; return body; }
      if (t.type === 'ident') {
        p++;
        const s = peek();
        if (isPunct(s, '=')) {
          p++;
          body.push({ type: 'Assign', key: t.value, value: value(), line: t.line, column: t.column });
        } else if (isPunct(s, '{')) {
          p++;
          body.push({ type: 'Block', key: t.value, body: stmts(depth + 1), line: t.line, column: t.column });
        } else {
          throw unexpected(s, "'=' hoặc '{'");
        }
        continue;
      }
      if (t.type === 'keyword' && t.value === 'include') {
        p++;
        const s = peek();
        if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
        if (s.value.some((x) => x.type === 'Ref')) {
          throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
        }
        p++;
        body.push({ type: 'Include', path: s.value.map((x) => x.value).join(''), line: t.line, column: t.column });
        continue;
      }
      if (t.type === 'keyword' && t.value === 'const') {
        if (depth > 0) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
        p++;
        const nm = peek();
        if (nm.type !== 'ident') throw unexpected(nm, 'tên hằng');
        p++;
        expectPunct('=');
        body.push({ type: 'Const', name: nm.value, value: value(), line: t.line, column: t.column });
        continue;
      }
      throw unexpected(t, 'câu lệnh');
    }
  }

  const body = stmts(0);
  return { type: 'File', body, line: 1, column: 1 };
}

export function parse(source) {
  const lx = tokenize(source);
  if (!lx.ok) return { ok: false, error: lx.error };
  try {
    return { ok: true, ast: buildAst(lx.tokens) };
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
}

export function parseProject(files, entry) {
  if (!Object.hasOwn(files, entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không có tệp vào: ${entry}`, file: entry, line: 1, column: 1 },
    };
  }
  const out = {};
  let error = null;
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) { error = { ...r.error, file: name }; return; }
    Object.defineProperty(out, name, { value: r.ast, enumerable: true, writable: true, configurable: true });
    const incs = [];
    collectIncludes(r.ast.body, incs);
    for (const path of incs) {
      if (error) return;
      if (Object.hasOwn(files, path) && !Object.hasOwn(out, path)) visit(path);
    }
  };
  visit(entry);
  if (error) return { ok: false, error };
  return { ok: true, program: { entry, files: out } };
}
