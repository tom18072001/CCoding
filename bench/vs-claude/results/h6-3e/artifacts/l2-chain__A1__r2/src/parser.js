// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.
import { tokenize } from './lexer.js';

class ParseError extends Error {
  constructor(code, message, tok) {
    super(message);
    this.info = { code, message, line: tok.line, column: tok.column };
  }
}

export function parse(source) {
  const lx = tokenize(source);
  if (!lx.ok) return lx;
  const toks = lx.tokens;
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const bad = (t, what) =>
    t.type === 'eof'
      ? new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đang đợi ${what}`, t)
      : new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không mong đợi, đang đợi ${what}`, t);
  const at = (type, t, extra) => ({ type, line: t.line, column: t.column, ...extra });

  function value() {
    const t = next();
    if (t.type === 'number') return at('Number', t, { value: t.value });
    if (t.type === 'string') return at('String', t, { parts: t.value });
    if (t.type === 'keyword') {
      if (t.value === 'true') return at('Bool', t, { value: true });
      if (t.value === 'false') return at('Bool', t, { value: false });
      if (t.value === 'null') return at('Null', t, {});
    }
    if (t.type === 'punct' && t.value === '[') {
      const items = [];
      for (;;) {
        const q = peek();
        if (q.type === 'punct' && q.value === ']') { next(); break; }
        items.push(value());
        const r = peek();
        if (r.type === 'punct' && r.value === ',') { next(); continue; }
        if (r.type === 'punct' && r.value === ']') { next(); break; }
        throw bad(r, '"," hoặc "]"');
      }
      return at('Array', t, { items });
    }
    if (t.type === 'eof') p--; // giữ eof ở lại (không vượt quá cuối)
    throw bad(t, 'một giá trị');
  }

  function stmt(inBlock) {
    const t = next();
    if (t.type === 'ident') {
      const q = next();
      if (q.type === 'punct' && q.value === '=') return at('Assign', t, { key: t.value, value: value() });
      if (q.type === 'punct' && q.value === '{') return at('Block', t, { key: t.value, body: body(true) });
      throw bad(q, '"=" hoặc "{"');
    }
    if (t.type === 'keyword' && t.value === 'include') {
      const s = next();
      if (s.type !== 'string') throw bad(s, 'chuỗi đường dẫn');
      if (s.value.some((x) => x.type === 'Ref')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
      }
      return at('Include', t, { path: s.value.map((x) => x.value).join('') });
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (inBlock) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ được ở cấp cao nhất', t);
      const nm = next();
      if (nm.type !== 'ident') throw bad(nm, 'tên hằng');
      const eq = next();
      if (!(eq.type === 'punct' && eq.value === '=')) throw bad(eq, '"="');
      return at('Const', t, { name: nm.value, value: value() });
    }
    throw bad(t, 'một câu lệnh');
  }

  function body(inBlock) {
    const out = [];
    for (;;) {
      const t = peek();
      if (inBlock && t.type === 'punct' && t.value === '}') { next(); return out; }
      if (!inBlock && t.type === 'eof') return out;
      if (t.type === 'eof') throw bad(t, '"}"');
      out.push(stmt(inBlock));
    }
  }

  try {
    const stmts = body(false);
    return { ok: true, ast: { type: 'File', line: 1, column: 1, body: stmts } };
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
    return { ok: false, error: { code: 'PARSE_ENTRY_NOT_FOUND', message: `Không tìm thấy tệp vào: ${entry}`, file: entry, line: 1, column: 1 } };
  }
  const parsed = [];
  const seen = new Set();
  let error = null;
  const go = (name) => {
    seen.add(name);
    const r = parse(files[name]);
    if (!r.ok) { error = { ...r.error, file: name }; return false; }
    parsed.push([name, r.ast]);
    for (const path of includesOf(r.ast.body)) {
      if (Object.hasOwn(files, path) && !seen.has(path) && !go(path)) return false;
    }
    return true;
  };
  if (!go(entry)) {
    const { code, message, file, line, column } = error;
    return { ok: false, error: { code, message, file, line, column } };
  }
  const out = {};
  for (const [k, v] of parsed) Object.defineProperty(out, k, { value: v, writable: true, enumerable: true, configurable: true });
  return { ok: true, program: { entry, files: out } };
}
