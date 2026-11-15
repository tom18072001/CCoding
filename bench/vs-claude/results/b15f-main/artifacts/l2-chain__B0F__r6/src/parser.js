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

export function parse(source) {
  const lexed = tokenize(source);
  if (!lexed.ok) return lexed;
  try {
    return { ok: true, ast: parseTokens(lexed.tokens) };
  } catch (e) {
    if (e instanceof ParseError) {
      return { ok: false, error: { code: e.code, message: e.message, line: e.line, column: e.column } };
    }
    return {
      ok: false,
      error: { code: 'PARSE_UNEXPECTED_TOKEN', message: `Lỗi nội bộ: ${e && e.message}`, line: 1, column: 1 },
    };
  }
}

function parseTokens(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i < tokens.length - 1 ? i++ : i]; // eof không bị tiêu thụ
  const unexpected = (tok, want) => {
    if (tok.type === 'eof') return new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đang đợi ${want}`, tok);
    return new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi, đang đợi ${want}`, tok);
  };
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;

  function parseValue() {
    const t = next();
    const pos = { line: t.line, column: t.column };
    if (t.type === 'number') return { type: 'Number', value: t.value, ...pos };
    if (t.type === 'string') return { type: 'String', parts: t.value, ...pos };
    if (t.type === 'keyword') {
      if (t.value === 'true') return { type: 'Bool', value: true, ...pos };
      if (t.value === 'false') return { type: 'Bool', value: false, ...pos };
      if (t.value === 'null') return { type: 'Null', ...pos };
    }
    if (isPunct(t, '[')) {
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) { next(); break; }
        items.push(parseValue());
        const s = peek();
        if (isPunct(s, ',')) { next(); continue; }
        if (isPunct(s, ']')) { next(); break; }
        throw unexpected(s, "',' hoặc ']'");
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
        throw unexpected(t, "'}'");
      }
      if (!top && isPunct(t, '}')) { next(); return body; }
      const pos = { line: t.line, column: t.column };
      if (t.type === 'ident') {
        next();
        const n = peek();
        if (isPunct(n, '=')) {
          next();
          body.push({ type: 'Assign', key: t.value, value: parseValue(), ...pos });
        } else if (isPunct(n, '{')) {
          next();
          body.push({ type: 'Block', key: t.value, body: parseBody(false), ...pos });
        } else throw unexpected(n, "'=' hoặc '{'");
      } else if (t.type === 'keyword' && t.value === 'include') {
        next();
        const s = next();
        if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
        if (s.value.some((p) => p.type === 'Ref')) {
          throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
        }
        body.push({ type: 'Include', path: s.value.map((p) => p.value).join(''), ...pos });
      } else if (t.type === 'keyword' && t.value === 'const') {
        if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
        next();
        const name = next();
        if (name.type !== 'ident') throw unexpected(name, 'tên hằng');
        const eq = next();
        if (!isPunct(eq, '=')) throw unexpected(eq, "'='");
        body.push({ type: 'Const', name: name.value, value: parseValue(), ...pos });
      } else throw unexpected(t, 'câu lệnh');
    }
  }

  return { type: 'File', body: parseBody(true), line: 1, column: 1 };
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
  const parsed = {};
  let failure = null;
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) {
      failure = { ...r.error, file: name };
      return false;
    }
    parsed[name] = r.ast;
    for (const p of collectIncludes(r.ast.body, [])) {
      if (Object.hasOwn(files, p) && !Object.hasOwn(parsed, p)) {
        if (!visit(p)) return false;
      }
    }
    return true;
  };
  if (!visit(entry)) return { ok: false, error: failure };
  return { ok: true, program: { entry, files: parsed } };
}
