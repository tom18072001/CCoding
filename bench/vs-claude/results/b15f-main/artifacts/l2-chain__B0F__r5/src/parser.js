// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.
//
// Hình dạng nút AST (mọi nút có type, line, column — vị trí token đầu của nút):
//   File    { body: Stmt[] }                 (luôn 1:1)
//   Assign  { key, value: Value }
//   Block   { key, body: Stmt[] }
//   Include { path: string }
//   Const   { name, value: Value }
//   Number  { value }   Bool { value }   Null {}
//   String  { parts: Part[] }   Part = {type:'Text', value}
//                                     | {type:'Ref', path: string[], const: boolean, line, column}
//   Array   { items: Value[] }
// parse(source)            -> {ok:true, ast} | {ok:false, error:{code,message,line,column}}
// parseProject(files, e)   -> {ok:true, program:{entry, files:{[tên]:AST}}}  (khóa theo tiền thứ tự)
//                           | {ok:false, error:{code,message,file,line,column}}

import { tokenize } from './lexer.js';

class Stop {
  constructor(error) { this.error = error; }
}

function parseTokens(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const bad = (tok, what) => {
    if (tok.type === 'eof') {
      throw new Stop({ code: 'PARSE_UNEXPECTED_EOF', message: `Hết tệp khi đợi ${what}`, line: tok.line, column: tok.column });
    }
    throw new Stop({ code: 'PARSE_UNEXPECTED_TOKEN', message: `Token không mong đợi khi đợi ${what}`, line: tok.line, column: tok.column });
  };
  const isPunct = (tok, v) => tok.type === 'punct' && tok.value === v;
  const pos = (tok) => ({ line: tok.line, column: tok.column });

  function value() {
    const t = peek();
    if (t.type === 'number') { p++; return { type: 'Number', ...pos(t), value: t.value }; }
    if (t.type === 'string') { p++; return { type: 'String', ...pos(t), parts: t.value }; }
    if (t.type === 'keyword' && (t.value === 'true' || t.value === 'false')) {
      p++;
      return { type: 'Bool', ...pos(t), value: t.value === 'true' };
    }
    if (t.type === 'keyword' && t.value === 'null') { p++; return { type: 'Null', ...pos(t) }; }
    if (isPunct(t, '[')) {
      p++;
      const items = [];
      while (true) {
        if (isPunct(peek(), ']')) { p++; break; }
        items.push(value());
        const s = peek();
        if (isPunct(s, ',')) { p++; continue; }
        if (isPunct(s, ']')) { p++; break; }
        bad(s, "',' hoặc ']'");
      }
      return { type: 'Array', ...pos(t), items };
    }
    return bad(t, 'giá trị');
  }

  function stmt(top) {
    const t = peek();
    if (t.type === 'ident') {
      p++;
      const n = peek();
      if (isPunct(n, '=')) {
        p++;
        return { type: 'Assign', ...pos(t), key: t.value, value: value() };
      }
      if (isPunct(n, '{')) {
        p++;
        return { type: 'Block', ...pos(t), key: t.value, body: stmts(false) };
      }
      return bad(n, "'=' hoặc '{'");
    }
    if (t.type === 'keyword' && t.value === 'include') {
      p++;
      const s = peek();
      if (s.type !== 'string') return bad(s, 'chuỗi đường dẫn');
      if (s.value.some((x) => x.type === 'Ref')) {
        throw new Stop({ code: 'PARSE_BAD_INCLUDE', message: 'include không được chứa nội suy', ...pos(s) });
      }
      p++;
      return { type: 'Include', ...pos(t), path: s.value.map((x) => x.value).join('') };
    }
    if (t.type === 'keyword' && t.value === 'const') {
      if (!top) {
        throw new Stop({ code: 'PARSE_CONST_NOT_TOP', message: 'const chỉ được ở cấp cao nhất', ...pos(t) });
      }
      p++;
      const name = peek();
      if (name.type !== 'ident') return bad(name, 'tên hằng');
      p++;
      const eq = peek();
      if (!isPunct(eq, '=')) return bad(eq, "'='");
      p++;
      return { type: 'Const', ...pos(t), name: name.value, value: value() };
    }
    return bad(t, 'câu lệnh');
  }

  function stmts(top) {
    const body = [];
    while (true) {
      const t = peek();
      if (top) {
        if (t.type === 'eof') break;
      } else {
        if (isPunct(t, '}')) { p++; break; }
        if (t.type === 'eof') bad(t, "'}'");
      }
      body.push(stmt(top));
    }
    return body;
  }

  return { type: 'File', line: 1, column: 1, body: stmts(true) };
}

export function parse(source) {
  try {
    const lx = tokenize(source);
    if (!lx.ok) return lx;
    return { ok: true, ast: parseTokens(lx.tokens) };
  } catch (e) {
    if (e instanceof Stop) return { ok: false, error: e.error };
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
  const has = (name) => Object.prototype.hasOwnProperty.call(files, name);
  if (!has(entry)) {
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
  if (!visit(entry)) return { ok: false, error: failure };
  return { ok: true, program: { entry, files: out } };
}
