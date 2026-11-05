// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.
import { tokenize } from './lexer.js';

class ParseError extends Error {
  constructor(code, tok, message) {
    super(message);
    this.info = { code, message, line: tok.line, column: tok.column };
  }
}

const at = (type, tok, extra) => ({ type, line: tok.line, column: tok.column, ...extra });

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const unexpected = (tok, what) =>
    tok.type === 'eof'
      ? new ParseError('PARSE_UNEXPECTED_EOF', tok, `Hết tệp đột ngột, cần ${what}`)
      : new ParseError('PARSE_UNEXPECTED_TOKEN', tok, `Token không mong đợi, cần ${what}`);
  const isPunct = (tok, v) => tok.type === 'punct' && tok.value === v;
  const isKw = (tok, v) => tok.type === 'keyword' && tok.value === v;

  function value() {
    const t = peek();
    if (t.type === 'number') { next(); return at('Number', t, { value: t.value }); }
    if (t.type === 'string') { next(); return at('String', t, { parts: t.value.map((x) => ({ ...x })) }); }
    if (isKw(t, 'true')) { next(); return at('Bool', t, { value: true }); }
    if (isKw(t, 'false')) { next(); return at('Bool', t, { value: false }); }
    if (isKw(t, 'null')) { next(); return at('Null', t, {}); }
    if (isPunct(t, '[')) {
      next();
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) { next(); break; }
        items.push(value());
        if (isPunct(peek(), ',')) { next(); continue; }
        if (isPunct(peek(), ']')) { next(); break; }
        throw unexpected(peek(), '"," hoặc "]"');
      }
      return at('Array', t, { items });
    }
    throw unexpected(t, 'một giá trị');
  }

  function stmt(top) {
    const t = peek();
    if (t.type === 'ident') {
      next();
      const n = peek();
      if (isPunct(n, '=')) { next(); return at('Assign', t, { key: t.value, value: value() }); }
      if (isPunct(n, '{')) { next(); return at('Block', t, { key: t.value, body: stmts(false) }); }
      throw unexpected(n, '"=" hoặc "{"');
    }
    if (isKw(t, 'include')) {
      next();
      const s = peek();
      if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
      if (s.value.some((x) => x.type !== 'Text')) {
        throw new ParseError('PARSE_BAD_INCLUDE', s, 'include không được chứa nội suy');
      }
      next();
      return at('Include', t, { path: s.value.map((x) => x.value).join('') });
    }
    if (isKw(t, 'const')) {
      if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', t, 'const chỉ hợp lệ ở cấp cao nhất');
      next();
      const nm = peek();
      if (nm.type !== 'ident') throw unexpected(nm, 'tên hằng');
      next();
      if (!isPunct(peek(), '=')) throw unexpected(peek(), '"="');
      next();
      return at('Const', t, { name: nm.value, value: value() });
    }
    throw unexpected(t, 'một câu lệnh');
  }

  // top=true: đến eof; top=false: đến '}' (đã nuốt '{')
  function stmts(top) {
    const body = [];
    for (;;) {
      const t = peek();
      if (top && t.type === 'eof') break;
      if (!top && isPunct(t, '}')) { next(); break; }
      body.push(stmt(top));
    }
    return body;
  }

  return { type: 'File', line: 1, column: 1, body: stmts(true) };
}

export function parse(source) {
  const lx = tokenize(source);
  if (!lx.ok) return { ok: false, error: lx.error };
  try {
    return { ok: true, ast: parseTokens(lx.tokens) };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.info };
    throw e;
  }
}

function includesOf(body, out = []) {
  for (const s of body) {
    if (s.type === 'Include') out.push(s.path);
    else if (s.type === 'Block') includesOf(s.body, out);
  }
  return out;
}

export function parseProject(files, entry) {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  if (!has(files, entry)) {
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
      const { code, message, line, column } = r.error;
      failure = { code, message, file: name, line, column };
      return;
    }
    Object.defineProperty(parsed, name, { value: r.ast, enumerable: true, writable: true, configurable: true });
    for (const path of includesOf(r.ast.body)) {
      if (has(files, path) && !has(parsed, path)) {
        visit(path);
        if (failure) return;
      }
    }
  };
  visit(entry);
  if (failure) return { ok: false, error: failure };
  return { ok: true, program: { entry, files: parsed } };
}
