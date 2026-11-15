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
  const next = () => tokens[p++];
  const unexpected = (tok, what) => (tok.type === 'eof'
    ? new ParseError('PARSE_UNEXPECTED_EOF', `Hết tệp khi đợi ${what}`, tok)
    : new ParseError('PARSE_UNEXPECTED_TOKEN', `Token không hợp lệ khi đợi ${what}`, tok));
  const isPunct = (t, v) => t.type === 'punct' && t.value === v;
  const at = (type, tok) => ({ type, line: tok.line, column: tok.column });

  // Lặp bằng ngăn xếp tường minh để mảng lồng sâu không tràn stack.
  function parseValue() {
    const stack = [];
    for (;;) {
      let val;
      const top = stack[stack.length - 1];
      if (top && isPunct(peek(), ']')) {
        next();
        stack.pop();
        val = { ...at('Array', top.tok), items: top.items };
      } else {
        const t = peek();
        if (t.type === 'number') { next(); val = { ...at('Number', t), value: t.value }; }
        else if (t.type === 'string') { next(); val = { ...at('String', t), parts: t.value }; }
        else if (t.type === 'keyword' && (t.value === 'true' || t.value === 'false')) {
          next();
          val = { ...at('Bool', t), value: t.value === 'true' };
        } else if (t.type === 'keyword' && t.value === 'null') { next(); val = at('Null', t); }
        else if (isPunct(t, '[')) { next(); stack.push({ tok: t, items: [] }); continue; }
        else throw unexpected(t, 'giá trị');
      }
      for (;;) {
        const owner = stack[stack.length - 1];
        if (!owner) return val;
        owner.items.push(val);
        const sep = peek();
        if (isPunct(sep, ',')) { next(); break; }
        if (isPunct(sep, ']')) {
          next();
          stack.pop();
          val = { ...at('Array', owner.tok), items: owner.items };
          continue;
        }
        throw unexpected(sep, '`,` hoặc `]`');
      }
    }
  }

  // Một câu lệnh; với khối chỉ mở khối và trả nút rỗng (thân do vòng ngoài điền).
  function parseStmt(top) {
    const t = next();
    if (t.type === 'keyword' && t.value === 'include') {
      const s = peek();
      if (s.type !== 'string') throw unexpected(s, 'chuỗi đường dẫn');
      next();
      if (s.value.some((x) => x.type === 'Ref')) {
        throw new ParseError('PARSE_BAD_INCLUDE', 'include không được chứa nội suy', s);
      }
      return { ...at('Include', t), path: s.value.map((x) => x.value).join('') };
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (!top) throw new ParseError('PARSE_CONST_NOT_TOP', 'const chỉ ở cấp cao nhất', t);
      const name = peek();
      if (name.type !== 'ident') throw unexpected(name, 'tên hằng');
      next();
      const eq = peek();
      if (!isPunct(eq, '=')) throw unexpected(eq, '`=`');
      next();
      return { ...at('Const', t), name: name.value, value: parseValue() };
    }
    if (t.type === 'ident') {
      const n = peek();
      if (isPunct(n, '=')) {
        next();
        return { ...at('Assign', t), key: t.value, value: parseValue() };
      }
      if (isPunct(n, '{')) {
        next();
        return { ...at('Block', t), key: t.value, body: [] };
      }
      throw unexpected(n, '`=` hoặc `{`');
    }
    throw unexpected(t, 'câu lệnh');
  }

  const root = { type: 'File', line: 1, column: 1, body: [] };
  const frames = [{ node: root, top: true }];
  for (;;) {
    const f = frames[frames.length - 1];
    const t = peek();
    if (f.top) {
      if (t.type === 'eof') break;
    } else {
      if (isPunct(t, '}')) { next(); frames.pop(); continue; }
      if (t.type === 'eof') throw unexpected(t, '`}`');
    }
    const st = parseStmt(f.top);
    f.node.body.push(st);
    if (st.type === 'Block') frames.push({ node: st, top: false });
  }
  return root;
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

// Include theo thứ tự tài liệu (tiền thứ tự), không đệ quy.
function collectIncludes(stmts) {
  const out = [];
  const stack = [[stmts, 0]];
  while (stack.length) {
    const fr = stack[stack.length - 1];
    if (fr[1] >= fr[0].length) { stack.pop(); continue; }
    const st = fr[0][fr[1]++];
    if (st.type === 'Include') out.push(st.path);
    else if (st.type === 'Block') stack.push([st.body, 0]);
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
  const seen = new Set();

  // Duyệt sâu tiền thứ tự bằng ngăn xếp tường minh (chuỗi include dài không tràn stack).
  const stack = [{ name: entry, incs: null, i: 0 }];
  seen.add(entry);
  while (stack.length) {
    const fr = stack[stack.length - 1];
    if (fr.incs === null) {
      const r = parse(files[fr.name]);
      if (!r.ok) {
        const { code, message, line, column } = r.error;
        return { ok: false, error: { code, message, file: fr.name, line, column } };
      }
      Object.defineProperty(parsed, fr.name, { value: r.ast, enumerable: true, writable: true, configurable: true });
      fr.incs = collectIncludes(r.ast.body);
    }
    if (fr.i >= fr.incs.length) { stack.pop(); continue; }
    const path = fr.incs[fr.i++];
    if (Object.hasOwn(files, path) && !seen.has(path)) {
      seen.add(path);
      stack.push({ name: path, incs: null, i: 0 });
    }
  }
  return { ok: true, program: { entry, files: parsed } };
}
