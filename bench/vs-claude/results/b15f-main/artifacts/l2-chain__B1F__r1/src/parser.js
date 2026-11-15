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

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  // Không đi quá token eof.
  const next = () => (tokens[p].type === 'eof' ? tokens[p] : tokens[p++]);
  const fail = (tok, expect) => {
    if (tok.type === 'eof') {
      throw new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp, đang đợi ${expect}`, tok);
    }
    throw new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi, đang đợi ${expect}`, tok);
  };
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;
  const node = (type, tok, extra) => ({ type, line: tok.line, column: tok.column, ...extra });

  function value() {
    const t = next();
    if (t.type === 'number') return node('Number', t, { value: t.value });
    if (t.type === 'string') {
      const parts = t.value.map((x) =>
        x.type === 'Text' ? { type: 'Text', value: x.value } : { ...x, path: [...x.path] },
      );
      return node('String', t, { parts });
    }
    if (t.type === 'keyword') {
      if (t.value === 'true' || t.value === 'false') return node('Bool', t, { value: t.value === 'true' });
      if (t.value === 'null') return node('Null', t, {});
    }
    if (isPunct(t, '[')) {
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) {
          next();
          break;
        }
        items.push(value());
        const s = next();
        if (isPunct(s, ',')) continue;
        if (isPunct(s, ']')) break;
        fail(s, "',' hoặc ']'");
      }
      return node('Array', t, { items });
    }
    return fail(t, 'một giá trị');
  }

  function stmts(depth) {
    const body = [];
    for (;;) {
      const t = peek();
      if (t.type === 'eof') {
        if (depth > 0) fail(t, "'}'");
        return body;
      }
      if (depth > 0 && isPunct(t, '}')) return body;
      body.push(stmt(depth));
    }
  }

  function stmt(depth) {
    const t = next();
    if (t.type === 'ident') {
      const s = next();
      if (isPunct(s, '=')) return node('Assign', t, { key: t.value, value: value() });
      if (isPunct(s, '{')) {
        const body = stmts(depth + 1);
        next(); // '}'
        return node('Block', t, { key: t.value, body });
      }
      return fail(s, "'=' hoặc '{'");
    }
    if (t.type === 'keyword' && t.value === 'include') {
      const s = next();
      if (s.type !== 'string') return fail(s, 'chuỗi đường dẫn');
      if (s.value.some((x) => x.type === 'Ref')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được có nội suy', s);
      }
      return node('Include', t, { path: s.value.map((x) => x.value).join('') });
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (depth > 0) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
      const n = next();
      if (n.type !== 'ident') return fail(n, 'tên hằng');
      const eq = next();
      if (!isPunct(eq, '=')) return fail(eq, "'='");
      return node('Const', t, { name: n.value, value: value() });
    }
    return fail(t, 'một câu lệnh');
  }

  const body = stmts(0);
  return { type: 'File', line: 1, column: 1, body };
}

export function parse(source) {
  const lexed = tokenize(source);
  if (!lexed.ok) return { ok: false, error: lexed.error };
  try {
    return { ok: true, ast: parseTokens(lexed.tokens) };
  } catch (e) {
    if (e instanceof ParseError) {
      return { ok: false, error: { code: e.code, message: e.message, line: e.line, column: e.column } };
    }
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
  const has = (n) => Object.hasOwn(files, n);
  if (!has(entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không có tệp vào: ${entry}`, file: entry, line: 1, column: 1 },
    };
  }
  const out = {};
  let error = null;
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) {
      error = { code: r.error.code, message: r.error.message, file: name, line: r.error.line, column: r.error.column };
      return;
    }
    out[name] = r.ast;
    for (const path of includesOf(r.ast.body)) {
      if (has(path) && !Object.hasOwn(out, path)) {
        visit(path);
        if (error) return;
      }
    }
  };
  visit(entry);
  if (error) return { ok: false, error };
  return { ok: true, program: { entry, files: out } };
}
