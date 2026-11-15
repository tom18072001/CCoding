// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.
import { tokenize } from './lexer.js';

class ParseError extends Error {
  constructor(code, message, tok) {
    super(message);
    this.info = { code, message, line: tok.line, column: tok.column };
  }
}

export function parse(source) {
  const lexed = tokenize(source);
  if (!lexed.ok) return lexed;
  try {
    return { ok: true, ast: parseTokens(lexed.tokens) };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.info };
    throw e;
  }
}

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const unexpected = (tok, what) =>
    tok.type === 'eof'
      ? new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đợi ${what}`, tok)
      : new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi khi đợi ${what}`, tok);
  const isP = (t, v) => t.type === 'punct' && t.value === v;
  const expectP = (v) => {
    const t = peek();
    if (!isP(t, v)) throw unexpected(t, `'${v}'`);
    p++;
    return t;
  };

  function value() {
    const t = peek();
    const at = { line: t.line, column: t.column };
    if (t.type === 'number') { p++; return { type: 'Number', ...at, value: t.value }; }
    if (t.type === 'string') { p++; return { type: 'String', ...at, parts: t.value }; }
    if (t.type === 'keyword' && (t.value === 'true' || t.value === 'false')) {
      p++;
      return { type: 'Bool', ...at, value: t.value === 'true' };
    }
    if (t.type === 'keyword' && t.value === 'null') { p++; return { type: 'Null', ...at }; }
    if (isP(t, '[')) {
      p++;
      const items = [];
      for (;;) {
        if (isP(peek(), ']')) { p++; break; }
        items.push(value());
        if (isP(peek(), ',')) { p++; continue; }
        if (isP(peek(), ']')) { p++; break; }
        throw unexpected(peek(), "',' hoặc ']'");
      }
      return { type: 'Array', ...at, items };
    }
    throw unexpected(t, 'một giá trị');
  }

  function body(depth) {
    const out = [];
    for (;;) {
      const t = peek();
      if (t.type === 'eof') {
        if (depth > 0) throw unexpected(t, "'}'");
        return out;
      }
      if (depth > 0 && isP(t, '}')) return out;
      const at = { line: t.line, column: t.column };
      if (t.type === 'ident') {
        p++;
        const n = peek();
        if (isP(n, '=')) {
          p++;
          out.push({ type: 'Assign', ...at, key: t.value, value: value() });
        } else if (isP(n, '{')) {
          p++;
          const b = body(depth + 1);
          expectP('}');
          out.push({ type: 'Block', ...at, key: t.value, body: b });
        } else throw unexpected(n, "'=' hoặc '{'");
      } else if (t.type === 'keyword' && t.value === 'include') {
        p++;
        const s = peek();
        if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
        if (s.value.some((x) => x.type !== 'Text')) {
          throw new ParseError('PARSE_BAD_INCLUDE', 'include không được có nội suy', s);
        }
        p++;
        out.push({ type: 'Include', ...at, path: s.value.map((x) => x.value).join('') });
      } else if (t.type === 'keyword' && t.value === 'const') {
        if (depth > 0) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ ở cấp cao nhất', t);
        p++;
        const n = peek();
        if (n.type !== 'ident') throw unexpected(n, 'tên hằng');
        p++;
        expectP('=');
        out.push({ type: 'Const', ...at, name: n.value, value: value() });
      } else throw unexpected(t, 'một câu lệnh');
    }
  }

  const stmts = body(0);
  return { type: 'File', line: 1, column: 1, body: stmts };
}

function collectIncludes(body, out) {
  for (const s of body) {
    if (s.type === 'Include') out.push(s.path);
    else if (s.type === 'Block') collectIncludes(s.body, out);
  }
  return out;
}

export function parseProject(files, entry) {
  if (!files || !Object.hasOwn(files, entry)) {
    return {
      ok: false,
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không có tệp vào: ${entry}`, file: entry, line: 1, column: 1 },
    };
  }
  const result = {};
  let failure = null;
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) {
      const { code, message, line, column } = r.error;
      failure = { code, message, file: name, line, column };
      return;
    }
    result[name] = r.ast;
    for (const path of collectIncludes(r.ast.body, [])) {
      if (Object.hasOwn(files, path) && !Object.hasOwn(result, path)) {
        visit(path);
        if (failure) return;
      }
    }
  };
  visit(entry);
  if (failure) return { ok: false, error: failure };
  return { ok: true, program: { entry, files: result } };
}
