// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.

import { tokenize } from './lexer.js';

class ParseError extends Error {
  constructor(code, message, tok) {
    super(message);
    this.code = code;
    this.line = tok.line;
    this.column = tok.column;
  }
}

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const unexpected = (tok, want) => new ParseError(
    tok.type === 'eof' ? 'PARSE_UNEXPECTED_EOF' : 'PARSE_UNEXPECTED_TOKEN',
    tok.type === 'eof' ? `Hết tệp khi đợi ${want}` : `Token không mong đợi, đợi ${want}`,
    tok,
  );
  const isPunct = (tok, v) => tok.type === 'punct' && tok.value === v;

  function parseValue() {
    const t = next();
    const pos = { line: t.line, column: t.column };
    if (t.type === 'number') return { type: 'Number', value: t.value, ...pos };
    if (t.type === 'string') return { type: 'String', parts: t.value, ...pos };
    if (t.type === 'keyword' && (t.value === 'true' || t.value === 'false')) {
      return { type: 'Bool', value: t.value === 'true', ...pos };
    }
    if (t.type === 'keyword' && t.value === 'null') return { type: 'Null', ...pos };
    if (isPunct(t, '[')) {
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) { next(); break; }
        items.push(parseValue());
        const s = next();
        if (isPunct(s, ',')) continue;
        if (isPunct(s, ']')) break;
        throw unexpected(s, '`,` hoặc `]`');
      }
      return { type: 'Array', items, ...pos };
    }
    throw unexpected(t, 'giá trị');
  }

  function parseBody(top) {
    const body = [];
    for (;;) {
      const t = peek();
      if (t.type === 'eof') {
        if (top) return body;
        throw unexpected(t, '`}`');
      }
      if (!top && isPunct(t, '}')) { next(); return body; }
      body.push(parseStmt(top));
    }
  }

  function parseStmt(top) {
    const t = next();
    const pos = { line: t.line, column: t.column };
    if (t.type === 'ident') {
      const s = next();
      if (isPunct(s, '=')) return { type: 'Assign', key: t.value, value: parseValue(), ...pos };
      if (isPunct(s, '{')) return { type: 'Block', key: t.value, body: parseBody(false), ...pos };
      throw unexpected(s, '`=` hoặc `{`');
    }
    if (t.type === 'keyword' && t.value === 'include') {
      const s = next();
      if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
      if (s.value.some((x) => x.type === 'Ref')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được có nội suy', s);
      }
      return { type: 'Include', path: s.value.map((x) => x.value).join(''), ...pos };
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ ở cấp cao nhất', t);
      const name = next();
      if (name.type !== 'ident') throw unexpected(name, 'tên hằng');
      const eq = next();
      if (!isPunct(eq, '=')) throw unexpected(eq, '`=`');
      return { type: 'Const', name: name.value, value: parseValue(), ...pos };
    }
    throw unexpected(t, 'câu lệnh');
  }

  return { type: 'File', body: parseBody(true), line: 1, column: 1 };
}

export function parse(source) {
  const lx = tokenize(source);
  if (!lx.ok) return lx;
  try {
    return { ok: true, ast: parseTokens(lx.tokens) };
  } catch (e) {
    if (e instanceof ParseError) {
      return { ok: false, error: { code: e.code, message: e.message, line: e.line, column: e.column } };
    }
    throw e;
  }
}

// Các câu lệnh include theo thứ tự tài liệu (kể cả trong khối).
export function collectIncludes(body, out = []) {
  for (const s of body) {
    if (s.type === 'Include') out.push(s);
    else if (s.type === 'Block') collectIncludes(s.body, out);
  }
  return out;
}

export function parseProject(files, entry) {
  if (!Object.hasOwn(files, entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không có tệp vào: ${entry}`, file: entry, line: 1, column: 1 },
    };
  }
  const out = {};
  let failure = null;
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) {
      failure = {
        ok: false,
        error: { code: r.error.code, message: r.error.message, file: name, line: r.error.line, column: r.error.column },
      };
      return;
    }
    out[name] = r.ast;
    for (const inc of collectIncludes(r.ast.body)) {
      if (failure) return;
      if (Object.hasOwn(files, inc.path) && !Object.hasOwn(out, inc.path)) visit(inc.path);
    }
  };
  visit(entry);
  if (failure) return failure;
  return { ok: true, program: { entry, files: out } };
}
