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
  const unexpected = (tok, want) => {
    if (tok.type === 'eof') return new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp, đang đợi ${want}`, tok);
    return new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi, đang đợi ${want}`, tok);
  };
  const isPunct = (tok, v) => tok.type === 'punct' && tok.value === v;
  const isKw = (tok, v) => tok.type === 'keyword' && tok.value === v;
  const pos = (tok) => ({ line: tok.line, column: tok.column });

  function value() {
    const t = peek();
    if (t.type === 'number') { next(); return { type: 'Number', value: t.value, ...pos(t) }; }
    if (t.type === 'string') { next(); return { type: 'String', parts: t.value, ...pos(t) }; }
    if (isKw(t, 'true') || isKw(t, 'false')) {
      next();
      return { type: 'Bool', value: t.value === 'true', ...pos(t) };
    }
    if (isKw(t, 'null')) { next(); return { type: 'Null', ...pos(t) }; }
    if (isPunct(t, '[')) {
      next();
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) { next(); break; }
        items.push(value());
        const s = peek();
        if (isPunct(s, ',')) { next(); continue; }
        if (isPunct(s, ']')) { next(); break; }
        throw unexpected(s, '"," hoặc "]"');
      }
      return { type: 'Array', items, ...pos(t) };
    }
    throw unexpected(t, 'một giá trị');
  }

  function stmt(top) {
    const t = peek();
    if (t.type === 'ident') {
      next();
      const s = peek();
      if (isPunct(s, '=')) {
        next();
        return { type: 'Assign', key: t.value, value: value(), ...pos(t) };
      }
      if (isPunct(s, '{')) {
        next();
        return { type: 'Block', key: t.value, body: body(false), ...pos(t) };
      }
      throw unexpected(s, '"=" hoặc "{"');
    }
    if (isKw(t, 'include')) {
      next();
      const s = peek();
      if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
      if (s.value.some((x) => x.type !== 'Text')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
      }
      next();
      return { type: 'Include', path: s.value.map((x) => x.value).join(''), ...pos(t) };
    }
    if (isKw(t, 'const')) {
      if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
      next();
      const n = peek();
      if (n.type !== 'ident') throw unexpected(n, 'tên hằng');
      next();
      const e = peek();
      if (!isPunct(e, '=')) throw unexpected(e, '"="');
      next();
      return { type: 'Const', name: n.value, value: value(), ...pos(t) };
    }
    throw unexpected(t, 'một câu lệnh');
  }

  // top=true: thân tệp (kết thúc bằng eof); top=false: thân khối (kết thúc bằng "}")
  function body(top) {
    const out = [];
    for (;;) {
      const t = peek();
      if (top ? t.type === 'eof' : isPunct(t, '}')) {
        if (!top) next();
        return out;
      }
      out.push(stmt(top));
    }
  }

  return { type: 'File', body: body(true), line: 1, column: 1 };
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
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không có tệp vào "${entry}"`, file: entry, line: 1, column: 1 },
    };
  }
  const parsed = {};
  const setParsed = (k, v) => Object.defineProperty(parsed, k, { value: v, enumerable: true, writable: true, configurable: true });
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) {
      const { code, message, line, column } = r.error;
      return { ok: false, error: { code, message, file: name, line, column } };
    }
    setParsed(name, r.ast);
    for (const path of includesOf(r.ast.body)) {
      if (Object.hasOwn(files, path) && !Object.hasOwn(parsed, path)) {
        const sub = visit(path);
        if (sub) return sub;
      }
    }
    return null;
  };
  const err = visit(entry);
  if (err) return err;
  return { ok: true, program: { entry, files: parsed } };
}
