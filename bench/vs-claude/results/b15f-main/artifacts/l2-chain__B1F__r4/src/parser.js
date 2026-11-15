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
  const next = () => tokens[p++];
  const bad = (tok, want) => {
    if (tok.type === 'eof') throw new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đợi ${want}`, tok);
    throw new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi, đợi ${want}`, tok);
  };
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;
  const pos = (type, t) => ({ type, line: t.line, column: t.column });
  const copyPart = (x) => (x.type === 'Text'
    ? { type: 'Text', value: x.value }
    : { type: 'Ref', path: [...x.path], const: x.const, line: x.line, column: x.column });

  function value() {
    const t = next();
    if (t.type === 'number') return { ...pos('Number', t), value: t.value };
    if (t.type === 'string') return { ...pos('String', t), parts: t.value.map(copyPart) };
    if (t.type === 'keyword' && (t.value === 'true' || t.value === 'false')) {
      return { ...pos('Bool', t), value: t.value === 'true' };
    }
    if (t.type === 'keyword' && t.value === 'null') return pos('Null', t);
    if (isPunct(t, '[')) {
      const items = [];
      for (;;) {
        if (isPunct(peek(), ']')) { next(); break; }
        items.push(value());
        const s = next();
        if (isPunct(s, ',')) continue;
        if (isPunct(s, ']')) break;
        bad(s, "',' hoặc ']'");
      }
      return { ...pos('Array', t), items };
    }
    return bad(t, 'một giá trị');
  }

  function body(top) {
    const stmts = [];
    for (;;) {
      const t = peek();
      if (t.type === 'eof') {
        if (top) return stmts;
        bad(t, "'}'");
      }
      if (isPunct(t, '}') && !top) return stmts;
      next();
      if (t.type === 'ident') {
        const s = next();
        if (isPunct(s, '=')) {
          stmts.push({ ...pos('Assign', t), key: t.value, value: value() });
        } else if (isPunct(s, '{')) {
          const b = body(false);
          next(); // '}'
          stmts.push({ ...pos('Block', t), key: t.value, body: b });
        } else {
          bad(s, "'=' hoặc '{'");
        }
      } else if (t.type === 'keyword' && t.value === 'include') {
        const s = next();
        if (s.type !== 'string') bad(s, 'chuỗi đường dẫn');
        if (s.value.some((x) => x.type === 'Ref')) {
          throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
        }
        stmts.push({ ...pos('Include', t), path: s.value.map((x) => x.value).join('') });
      } else if (t.type === 'keyword' && t.value === 'const') {
        if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
        const n = next();
        if (n.type !== 'ident') bad(n, 'tên hằng');
        const e = next();
        if (!isPunct(e, '=')) bad(e, "'='");
        stmts.push({ ...pos('Const', t), name: n.value, value: value() });
      } else {
        bad(t, 'một câu lệnh');
      }
    }
  }

  return { type: 'File', line: 1, column: 1, body: body(true) };
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

function collectIncludes(stmts, out) {
  for (const s of stmts) {
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
  const parsed = {};
  let failure = null;
  const visit = (name) => {
    const r = parse(files[name]);
    if (!r.ok) {
      const { code, message, line, column } = r.error;
      failure = { code, message, file: name, line, column };
      return false;
    }
    parsed[name] = r.ast;
    for (const inc of collectIncludes(r.ast.body, [])) {
      if (Object.hasOwn(files, inc) && !Object.hasOwn(parsed, inc)) {
        if (!visit(inc)) return false;
      }
    }
    return true;
  };
  if (!visit(entry)) return { ok: false, error: failure };
  return { ok: true, program: { entry, files: parsed } };
}
