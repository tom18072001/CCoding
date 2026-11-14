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

function unexpected(tok, want) {
  if (tok.type === 'eof') return new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đang đợi ${want}`, tok);
  return new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi, đang đợi ${want}`, tok);
}

const node = (type, tok, fields) => ({ type, line: tok.line, column: tok.column, ...fields });

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;

  function value() {
    const t = next();
    if (t.type === 'number') return node('Number', t, { value: t.value });
    if (t.type === 'string') return node('String', t, { parts: t.value.map((x) => ({ ...x })) });
    if (t.type === 'keyword') {
      if (t.value === 'true') return node('Bool', t, { value: true });
      if (t.value === 'false') return node('Bool', t, { value: false });
      if (t.value === 'null') return node('Null', t, {});
    }
    if (isPunct(t, '[')) {
      const items = [];
      while (true) {
        if (isPunct(peek(), ']')) { next(); break; }
        items.push(value());
        const s = next();
        if (isPunct(s, ',')) continue;
        if (isPunct(s, ']')) break;
        throw unexpected(s, "',' hoặc ']'");
      }
      return node('Array', t, { items });
    }
    throw unexpected(t, 'giá trị');
  }

  function stmts(depth) {
    const body = [];
    while (true) {
      const t = peek();
      if (t.type === 'eof') {
        if (depth > 0) throw unexpected(t, "'}'");
        return body;
      }
      if (depth > 0 && isPunct(t, '}')) return body;
      next();
      if (t.type === 'ident') {
        const n = next();
        if (isPunct(n, '=')) {
          body.push(node('Assign', t, { key: t.value, value: value() }));
        } else if (isPunct(n, '{')) {
          const inner = stmts(depth + 1);
          next(); // '}'
          body.push(node('Block', t, { key: t.value, body: inner }));
        } else {
          throw unexpected(n, "'=' hoặc '{'");
        }
      } else if (t.type === 'keyword' && t.value === 'include') {
        const s = next();
        if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
        if (s.value.some((x) => x.type !== 'Text')) {
          throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
        }
        body.push(node('Include', t, { path: s.value.map((x) => x.value).join('') }));
      } else if (t.type === 'keyword' && t.value === 'const') {
        if (depth > 0) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
        const id = next();
        if (id.type !== 'ident') throw unexpected(id, 'tên hằng');
        const eq = next();
        if (!isPunct(eq, '=')) throw unexpected(eq, "'='");
        body.push(node('Const', t, { name: id.value, value: value() }));
      } else {
        throw unexpected(t, 'câu lệnh');
      }
    }
  }

  const body = stmts(0);
  return { type: 'File', line: 1, column: 1, body };
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
      error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không tìm thấy tệp vào: ${entry}`, file: entry, line: 1, column: 1 },
    };
  }
  const out = {};
  let failure = null;
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) {
      const { code, message, line, column } = r.error;
      failure = { code, message, file: name, line, column };
      return;
    }
    out[name] = r.ast;
    for (const path of collectIncludes(r.ast.body, [])) {
      if (failure) return;
      if (Object.hasOwn(files, path) && !Object.hasOwn(out, path)) visit(path);
    }
  };
  visit(entry);
  if (failure) return { ok: false, error: failure };
  return { ok: true, program: { entry, files: out } };
}
