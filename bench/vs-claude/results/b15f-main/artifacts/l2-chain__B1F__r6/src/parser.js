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
  const unexpected = (tok, want) =>
    tok.type === 'eof'
      ? new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp, đang đợi ${want}`, tok)
      : new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi, đang đợi ${want}`, tok);
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;
  const expectPunct = (v) => {
    const t = peek();
    if (!isPunct(t, v)) throw unexpected(t, `'${v}'`);
    p++;
    return t;
  };

  function value() {
    const t = peek();
    if (t.type === 'number') {
      p++;
      return { type: 'Number', value: t.value, line: t.line, column: t.column };
    }
    if (t.type === 'string') {
      p++;
      return { type: 'String', parts: t.value, line: t.line, column: t.column };
    }
    if (t.type === 'keyword') {
      if (t.value === 'true' || t.value === 'false') {
        p++;
        return { type: 'Bool', value: t.value === 'true', line: t.line, column: t.column };
      }
      if (t.value === 'null') {
        p++;
        return { type: 'Null', line: t.line, column: t.column };
      }
    }
    if (isPunct(t, '[')) {
      p++;
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) {
          p++;
          break;
        }
        items.push(value());
        const s = peek();
        if (isPunct(s, ',')) {
          p++;
          continue;
        }
        if (isPunct(s, ']')) {
          p++;
          break;
        }
        throw unexpected(s, "',' hoặc ']'");
      }
      return { type: 'Array', items, line: t.line, column: t.column };
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
        const v = value();
        return { type: 'Assign', key: t.value, value: v, line: t.line, column: t.column };
      }
      if (isPunct(s, '{')) {
        p++;
        const body = stmts(false);
        expectPunct('}');
        return { type: 'Block', key: t.value, body, line: t.line, column: t.column };
      }
      throw unexpected(s, "'=' hoặc '{'");
    }
    if (t.type === 'keyword' && t.value === 'include') {
      p++;
      const s = peek();
      if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
      if (s.value.some((x) => x.type !== 'Text')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
      }
      p++;
      return {
        type: 'Include',
        path: s.value.map((x) => x.value).join(''),
        line: t.line,
        column: t.column,
      };
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ ở cấp cao nhất', t);
      p++;
      const nameTok = peek();
      if (nameTok.type !== 'ident') throw unexpected(nameTok, 'tên hằng');
      p++;
      expectPunct('=');
      const v = value();
      return { type: 'Const', name: nameTok.value, value: v, line: t.line, column: t.column };
    }
    throw unexpected(t, 'một câu lệnh');
  }

  function stmts(top) {
    const body = [];
    for (;;) {
      const t = peek();
      if (t.type === 'eof' || isPunct(t, '}')) {
        if (top && t.type !== 'eof') throw unexpected(t, 'một câu lệnh');
        return body;
      }
      body.push(stmt(top));
    }
  }

  const body = stmts(true);
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

function collectIncludes(body, out) {
  for (const s of body) {
    if (s.type === 'Include') out.push(s.path);
    else if (s.type === 'Block') collectIncludes(s.body, out);
  }
  return out;
}

export function parseProject(files, entry) {
  const has = (k) => Object.prototype.hasOwnProperty.call(files, k);
  if (!has(entry)) {
    return {
      ok: false,
      error: {
        code: 'PARSE_ENTRY_NOT_FOUND',
        message: `Không có tệp entry: ${entry}`,
        file: entry,
        line: 1,
        column: 1,
      },
    };
  }
  const out = {};
  let failure = null;
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) {
      failure = { ok: false, error: { ...r.error, file: name } };
      return false;
    }
    out[name] = r.ast;
    for (const path of collectIncludes(r.ast.body, [])) {
      if (has(path) && !Object.prototype.hasOwnProperty.call(out, path)) {
        if (!visit(path)) return false;
      }
    }
    return true;
  };
  if (!visit(entry)) return failure;
  return { ok: true, program: { entry, files: out } };
}
