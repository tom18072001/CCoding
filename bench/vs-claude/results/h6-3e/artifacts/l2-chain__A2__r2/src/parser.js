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
  const bad = (tok, what) =>
    tok.type === 'eof'
      ? new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đợi ${what}`, tok)
      : new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi khi đợi ${what}`, tok);
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;

  function parseValue() {
    const t = peek();
    if (t.type === 'number') { p++; return { type: 'Number', value: t.value, line: t.line, column: t.column }; }
    if (t.type === 'string') { p++; return { type: 'String', parts: t.value, line: t.line, column: t.column }; }
    if (t.type === 'keyword' && (t.value === 'true' || t.value === 'false')) {
      p++;
      return { type: 'Bool', value: t.value === 'true', line: t.line, column: t.column };
    }
    if (t.type === 'keyword' && t.value === 'null') { p++; return { type: 'Null', line: t.line, column: t.column }; }
    if (isPunct(t, '[')) {
      p++;
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) { p++; break; }
        items.push(parseValue());
        const d = peek();
        if (isPunct(d, ',')) { p++; continue; }
        if (isPunct(d, ']')) { p++; break; }
        throw bad(d, '`,` hoặc `]`');
      }
      return { type: 'Array', items, line: t.line, column: t.column };
    }
    throw bad(t, 'một giá trị');
  }

  function parseBody(top) {
    const body = [];
    for (;;) {
      const t = peek();
      if (t.type === 'eof') {
        if (top) return body;
        throw bad(t, '`}`');
      }
      if (isPunct(t, '}')) {
        if (top) throw bad(t, 'một câu lệnh');
        return body;
      }
      if (t.type === 'keyword' && t.value === 'include') {
        p++;
        const s = peek();
        if (s.type !== 'string') throw bad(s, 'đường dẫn chuỗi');
        if (s.value.some((x) => x.type === 'Ref')) {
          throw new ParseError('PARSE_BAD_INCLUDE', 'include không được có nội suy', s);
        }
        p++;
        body.push({ type: 'Include', path: s.value.map((x) => x.value).join(''), line: t.line, column: t.column });
        continue;
      }
      if (t.type === 'keyword' && t.value === 'const') {
        if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ hợp lệ ở cấp cao nhất', t);
        p++;
        const name = peek();
        if (name.type !== 'ident') throw bad(name, 'tên hằng');
        p++;
        if (!isPunct(peek(), '=')) throw bad(peek(), '`=`');
        p++;
        const value = parseValue();
        body.push({ type: 'Const', name: name.value, value, line: t.line, column: t.column });
        continue;
      }
      if (t.type === 'ident') {
        p++;
        const d = peek();
        if (isPunct(d, '=')) {
          p++;
          const value = parseValue();
          body.push({ type: 'Assign', key: t.value, value, line: t.line, column: t.column });
        } else if (isPunct(d, '{')) {
          p++;
          const inner = parseBody(false);
          p++; // '}'
          body.push({ type: 'Block', key: t.value, body: inner, line: t.line, column: t.column });
        } else throw bad(d, '`=` hoặc `{`');
        continue;
      }
      throw bad(t, 'một câu lệnh');
    }
  }

  const body = parseBody(true);
  return { type: 'File', body, line: 1, column: 1 };
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

// Các câu lệnh include theo thứ tự tài liệu (kể cả trong khối).
export function includesOf(stmts, out = []) {
  for (const s of stmts) {
    if (s.type === 'Include') out.push(s);
    else if (s.type === 'Block') includesOf(s.body, out);
  }
  return out;
}

export function parseProject(files, entry) {
  const has = (k) => Object.hasOwn(files, k);
  if (!has(entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không tìm thấy tệp vào: ${entry}`, file: entry, line: 1, column: 1 },
    };
  }
  const out = {};
  const set = (k, v) => Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
  let failure = null;
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) { failure = { ...r.error, file: name }; return false; }
    set(name, r.ast);
    for (const inc of includesOf(r.ast.body)) {
      if (has(inc.path) && !Object.hasOwn(out, inc.path)) {
        if (!visit(inc.path)) return false;
      }
    }
    return true;
  };
  if (!visit(entry)) {
    const { code, message, line, column, file } = failure;
    return { ok: false, error: { code, message, file, line, column } };
  }
  return { ok: true, program: { entry, files: out } };
}
