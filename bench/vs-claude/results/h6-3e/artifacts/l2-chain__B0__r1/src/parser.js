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
  const toks = lexed.tokens;
  let p = 0;

  const bad = (tok, what) =>
    tok.type === 'eof'
      ? new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đợi ${what}`, tok)
      : new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi, đợi ${what}`, tok);
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;
  const node = (type, tok, fields) => ({ type, ...fields, line: tok.line, column: tok.column });

  function value() {
    const t = toks[p];
    if (t.type === 'number') {
      p++;
      return node('Number', t, { value: t.value });
    }
    if (t.type === 'string') {
      p++;
      return node('String', t, { parts: t.value });
    }
    if (t.type === 'keyword' && (t.value === 'true' || t.value === 'false')) {
      p++;
      return node('Bool', t, { value: t.value === 'true' });
    }
    if (t.type === 'keyword' && t.value === 'null') {
      p++;
      return node('Null', t, {});
    }
    if (isPunct(t, '[')) {
      p++;
      const items = [];
      for (;;) {
        if (isPunct(toks[p], ']')) {
          p++;
          break;
        }
        items.push(value());
        if (isPunct(toks[p], ',')) {
          p++;
          continue;
        }
        if (isPunct(toks[p], ']')) {
          p++;
          break;
        }
        throw bad(toks[p], '`,` hoặc `]`');
      }
      return node('Array', t, { items });
    }
    throw bad(t, 'giá trị');
  }

  function stmt(top) {
    const t = toks[p];
    if (t.type === 'keyword' && t.value === 'include') {
      p++;
      const s = toks[p];
      if (s.type !== 'string') throw bad(s, 'chuỗi đường dẫn');
      if (s.value.some((x) => x.type === 'Ref')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được có nội suy', s);
      }
      p++;
      return node('Include', t, { path: s.value.map((x) => x.value).join('') });
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ hợp lệ ở cấp cao nhất', t);
      p++;
      const n = toks[p];
      if (n.type !== 'ident') throw bad(n, 'tên hằng');
      p++;
      if (!isPunct(toks[p], '=')) throw bad(toks[p], '`=`');
      p++;
      return node('Const', t, { name: n.value, value: value() });
    }
    if (t.type === 'ident') {
      p++;
      if (isPunct(toks[p], '=')) {
        p++;
        return node('Assign', t, { key: t.value, value: value() });
      }
      if (isPunct(toks[p], '{')) {
        p++;
        const body = [];
        while (!isPunct(toks[p], '}')) {
          if (toks[p].type === 'eof') throw bad(toks[p], '`}`');
          body.push(stmt(false));
        }
        p++;
        return node('Block', t, { key: t.value, body });
      }
      throw bad(toks[p], '`=` hoặc `{`');
    }
    throw bad(t, 'câu lệnh');
  }

  try {
    const body = [];
    while (toks[p].type !== 'eof') body.push(stmt(true));
    return { ok: true, ast: { type: 'File', body, line: 1, column: 1 } };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.info };
    throw e;
  }
}

export function includesOf(body, out = []) {
  for (const s of body) {
    if (s.type === 'Include') out.push(s);
    else if (s.type === 'Block') includesOf(s.body, out);
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
      failure = { ...r.error, file: name };
      return false;
    }
    parsed[name] = r.ast;
    for (const inc of includesOf(r.ast.body)) {
      if (Object.hasOwn(files, inc.path) && !Object.hasOwn(parsed, inc.path)) {
        if (!visit(inc.path)) return false;
      }
    }
    return true;
  };
  if (!visit(entry)) return { ok: false, error: failure };
  return { ok: true, program: { entry, files: parsed } };
}
