// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.

import { tokenize } from './lexer.js';

class ParseError {
  constructor(code, message, tok) {
    this.code = code;
    this.message = message;
    this.line = tok.line;
    this.column = tok.column;
  }
}

const unexpected = (tok, what) =>
  tok.type === 'eof'
    ? new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đợi ${what}`, tok)
    : new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi khi đợi ${what}`, tok);

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;
  const node = (type, tok, extra) => ({ type, line: tok.line, column: tok.column, ...extra });

  function value() {
    const t = next();
    if (t.type === 'number') return node('Number', t, { value: t.value });
    if (t.type === 'string') return node('String', t, { parts: t.value });
    if (t.type === 'keyword') {
      if (t.value === 'true') return node('Bool', t, { value: true });
      if (t.value === 'false') return node('Bool', t, { value: false });
      if (t.value === 'null') return node('Null', t, {});
    }
    if (isPunct(t, '[')) {
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) { next(); break; }
        items.push(value());
        const s = next();
        if (isPunct(s, ',')) continue;
        if (isPunct(s, ']')) break;
        throw unexpected(s, '"," hoặc "]"');
      }
      return node('Array', t, { items });
    }
    throw unexpected(t, 'một giá trị');
  }

  function stmts(top) {
    const body = [];
    for (;;) {
      const t = peek();
      if (t.type === 'eof') {
        if (top) return body;
        throw unexpected(t, '"}"');
      }
      if (isPunct(t, '}') && !top) { next(); return body; }
      body.push(stmt(top));
    }
  }

  function stmt(top) {
    const t = next();
    if (t.type === 'ident') {
      const s = next();
      if (isPunct(s, '=')) return node('Assign', t, { key: t.value, value: value() });
      if (isPunct(s, '{')) return node('Block', t, { key: t.value, body: stmts(false) });
      throw unexpected(s, '"=" hoặc "{"');
    }
    if (t.type === 'keyword' && t.value === 'include') {
      const s = next();
      if (s.type !== 'string') throw unexpected(s, 'đường dẫn chuỗi');
      if (s.value.some((x) => x.type === 'Ref')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không cho phép nội suy', s);
      }
      return node('Include', t, { path: s.value.map((x) => x.value).join('') });
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ hợp lệ ở cấp cao nhất', t);
      const name = next();
      if (name.type !== 'ident') throw unexpected(name, 'tên hằng');
      const eq = next();
      if (!isPunct(eq, '=')) throw unexpected(eq, '"="');
      return node('Const', t, { name: name.value, value: value() });
    }
    throw unexpected(t, 'một câu lệnh');
  }

  return node('File', { line: 1, column: 1 }, { body: stmts(true) });
}

export function parse(source) {
  const lexed = tokenize(source);
  if (!lexed.ok) return lexed;
  try {
    return { ok: true, ast: parseTokens(lexed.tokens) };
  } catch (e) {
    if (e instanceof ParseError) {
      return { ok: false, error: { code: e.code, message: e.message, line: e.line, column: e.column } };
    }
    throw e;
  }
}

// các câu lệnh include theo thứ tự tài liệu (kể cả trong khối)
export function collectIncludes(body, out = []) {
  for (const st of body) {
    if (st.type === 'Include') out.push(st);
    else if (st.type === 'Block') collectIncludes(st.body, out);
  }
  return out;
}

export function parseProject(files, entry) {
  if (!Object.hasOwn(files, entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không có tệp vào "${entry}"`, file: entry, line: 1, column: 1 },
    };
  }
  const parsed = {};
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) return { ok: false, error: { ...r.error, file: name } };
    Object.defineProperty(parsed, name, { value: r.ast, enumerable: true, writable: true, configurable: true });
    for (const inc of collectIncludes(r.ast.body)) {
      if (Object.hasOwn(files, inc.path) && !Object.hasOwn(parsed, inc.path)) {
        const sub = visit(inc.path);
        if (sub) return sub;
      }
    }
    return null;
  };
  const fail = visit(entry);
  if (fail) return fail;
  return { ok: true, program: { entry, files: parsed } };
}
