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
  const unexpected = (tok, what) => new ParseError(
    tok.type === 'eof' ? 'PARSE_UNEXPECTED_EOF' : 'PARSE_UNEXPECTED_TOKEN',
    tok.type === 'eof' ? `Hết tệp khi đợi ${what}` : `Token không mong đợi, đợi ${what}`,
    tok,
  );
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;

  function value() {
    const t = peek();
    if (t.type === 'number') { p++; return { type: 'Number', line: t.line, column: t.column, value: t.value }; }
    if (t.type === 'string') { p++; return { type: 'String', line: t.line, column: t.column, parts: t.value }; }
    if (t.type === 'keyword') {
      if (t.value === 'true' || t.value === 'false') {
        p++; return { type: 'Bool', line: t.line, column: t.column, value: t.value === 'true' };
      }
      if (t.value === 'null') { p++; return { type: 'Null', line: t.line, column: t.column }; }
    }
    if (isPunct(t, '[')) {
      p++;
      const items = [];
      while (true) {
        if (isPunct(peek(), ']')) { p++; break; }
        items.push(value());
        const s = peek();
        if (isPunct(s, ',')) { p++; continue; }
        if (isPunct(s, ']')) { p++; break; }
        throw unexpected(s, "',' hoặc ']'");
      }
      return { type: 'Array', line: t.line, column: t.column, items };
    }
    throw unexpected(t, 'giá trị');
  }

  function stmt(top) {
    const t = peek();
    if (t.type === 'ident') {
      p++;
      const s = peek();
      if (isPunct(s, '=')) {
        p++;
        return { type: 'Assign', line: t.line, column: t.column, key: t.value, value: value() };
      }
      if (isPunct(s, '{')) {
        p++;
        const body = stmts(false);
        return { type: 'Block', line: t.line, column: t.column, key: t.value, body };
      }
      throw unexpected(s, "'=' hoặc '{'");
    }
    if (t.type === 'keyword' && t.value === 'include') {
      p++;
      const s = peek();
      if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
      if (s.value.some((x) => x.type === 'Ref')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được có nội suy', s);
      }
      p++;
      return { type: 'Include', line: t.line, column: t.column, path: s.value.map((x) => x.value).join('') };
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
      p++;
      const nm = peek();
      if (nm.type !== 'ident') throw unexpected(nm, 'tên hằng');
      p++;
      if (!isPunct(peek(), '=')) throw unexpected(peek(), "'='");
      p++;
      return { type: 'Const', line: t.line, column: t.column, name: nm.value, value: value() };
    }
    throw unexpected(t, 'câu lệnh');
  }

  // top: đọc tới eof; không top: đọc tới '}' (đã ăn '{').
  function stmts(top) {
    const body = [];
    while (true) {
      const t = peek();
      if (top) {
        if (t.type === 'eof') break;
      } else {
        if (isPunct(t, '}')) { p++; break; }
        if (t.type === 'eof') throw unexpected(t, "'}'");
      }
      body.push(stmt(top));
    }
    return body;
  }

  const body = stmts(true);
  return { type: 'File', line: 1, column: 1, body };
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

function includesOf(body, out) {
  for (const s of body) {
    if (s.type === 'Include') out.push(s.path);
    else if (s.type === 'Block') includesOf(s.body, out);
  }
  return out;
}

export function parseProject(files, entry) {
  const has = (k) => Object.prototype.hasOwnProperty.call(files, k);
  if (!has(entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không có tệp vào: ${entry}`, file: entry, line: 1, column: 1 },
    };
  }
  const out = {};
  const set = (k, v) => Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
  const seen = new Set();
  let failure = null;
  const visit = (name) => {
    seen.add(name);
    const r = parse(files[name]);
    if (!r.ok) { failure = { ...r.error, file: name }; return false; }
    set(name, r.ast);
    for (const inc of includesOf(r.ast.body, [])) {
      if (has(inc) && !seen.has(inc) && !visit(inc)) return false;
    }
    return true;
  };
  if (!visit(entry)) {
    const e = failure;
    return { ok: false, error: { code: e.code, message: e.message, file: e.file, line: e.line, column: e.column } };
  }
  return { ok: true, program: { entry, files: out } };
}
