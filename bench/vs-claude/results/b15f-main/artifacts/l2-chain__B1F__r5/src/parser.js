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

function describe(tok) {
  return tok.type === 'eof' ? 'hết tệp' : `${tok.type} ${JSON.stringify(tok.value)}`;
}

function unexpected(tok, expected) {
  if (tok.type === 'eof') return new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đợi ${expected}`, tok);
  return new ParseError('PARSE_UNEXPECTED_TOKEN', `Gặp ${describe(tok)} khi đợi ${expected}`, tok);
}

function buildAst(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;
  const pos = (t) => ({ line: t.line, column: t.column });

  function value() {
    const t = peek();
    if (t.type === 'number') { p++; return { type: 'Number', value: t.value, ...pos(t) }; }
    if (t.type === 'string') { p++; return { type: 'String', parts: t.value, ...pos(t) }; }
    if (t.type === 'keyword' && (t.value === 'true' || t.value === 'false')) {
      p++;
      return { type: 'Bool', value: t.value === 'true', ...pos(t) };
    }
    if (t.type === 'keyword' && t.value === 'null') { p++; return { type: 'Null', ...pos(t) }; }
    if (isPunct(t, '[')) {
      p++;
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) { p++; break; }
        items.push(value());
        const s = peek();
        if (isPunct(s, ',')) { p++; continue; }
        if (isPunct(s, ']')) { p++; break; }
        throw unexpected(s, '"," hoặc "]"');
      }
      return { type: 'Array', items, ...pos(t) };
    }
    throw unexpected(t, 'một giá trị');
  }

  function stmt(top) {
    const t = peek();
    if (t.type === 'ident') {
      p++;
      const s = peek();
      if (isPunct(s, '=')) {
        p++;
        return { type: 'Assign', key: t.value, value: value(), ...pos(t) };
      }
      if (isPunct(s, '{')) {
        p++;
        return { type: 'Block', key: t.value, body: stmts(false), ...pos(t) };
      }
      throw unexpected(s, '"=" hoặc "{"');
    }
    if (t.type === 'keyword' && t.value === 'include') {
      p++;
      const s = peek();
      if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
      if (s.value.some((x) => x.type !== 'Text')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
      }
      p++;
      return { type: 'Include', path: s.value.map((x) => x.value).join(''), ...pos(t) };
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
      p++;
      const name = peek();
      if (name.type !== 'ident') throw unexpected(name, 'tên hằng');
      p++;
      const eq = peek();
      if (!isPunct(eq, '=')) throw unexpected(eq, '"="');
      p++;
      return { type: 'Const', name: name.value, value: value(), ...pos(t) };
    }
    throw unexpected(t, 'một câu lệnh');
  }

  // top: đọc tới eof; ngược lại đọc tới '}' (đã tiêu thụ).
  function stmts(top) {
    const body = [];
    for (;;) {
      const t = peek();
      if (top) {
        if (t.type === 'eof') break;
      } else if (isPunct(t, '}')) {
        p++;
        break;
      }
      body.push(stmt(top));
    }
    return body;
  }

  const body = stmts(true);
  return { type: 'File', body, line: 1, column: 1 };
}

export function parse(source) {
  const lx = tokenize(source);
  if (!lx.ok) return lx;
  try {
    return { ok: true, ast: buildAst(lx.tokens) };
  } catch (e) {
    if (e instanceof ParseError) {
      return { ok: false, error: { code: e.code, message: e.message, line: e.line, column: e.column } };
    }
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
  if (!Object.hasOwn(files, entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không có tệp vào: ${entry}`, file: entry, line: 1, column: 1 },
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
    for (const path of collectIncludes(r.ast.body, [])) {
      if (Object.hasOwn(files, path) && !Object.hasOwn(parsed, path)) {
        visit(path);
        if (failure) return;
      }
    }
  };
  visit(entry);
  if (failure) return { ok: false, error: failure };
  return { ok: true, program: { entry, files: parsed } };
}
