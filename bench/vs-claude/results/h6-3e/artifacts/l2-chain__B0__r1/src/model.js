// Mô hình hợp nhất dùng chung cho tầng 2 và 3 (SPEC.md mục 6). Nội bộ, không xuất qua index.
//
// Nút hợp nhất:
//   { kind: 'obj', block, file, entries: Map<khóa, { stmt, file, value: nút }> }
//   { kind: 'leaf', ast, file }   (ast là nút giá trị của AST)

const leaf = (ast, file) => ({ kind: 'leaf', ast, file });
const INDEX_RE = /^(0|[1-9][0-9]*)$/;

export function buildModel(program) {
  const consts = new Map();
  for (const [f, ast] of Object.entries(program.files)) {
    const m = new Map();
    for (const s of ast.body) if (s.type === 'Const' && !m.has(s.name)) m.set(s.name, s.value);
    consts.set(f, m);
  }
  const root = { kind: 'obj', block: null, file: program.entry, entries: new Map() };

  const fill = (target, body, file, depth) => {
    if (depth > 1000) return;
    for (const s of body) {
      if (s.type === 'Assign') {
        target.entries.set(s.key, { stmt: s, file, value: leaf(s.value, file) });
      } else if (s.type === 'Block') {
        const ex = target.entries.get(s.key);
        if (ex && ex.value.kind === 'obj') {
          fill(ex.value, s.body, file, depth + 1);
        } else {
          const obj = { kind: 'obj', block: s, file, entries: new Map() };
          target.entries.set(s.key, { stmt: s, file, value: obj });
          fill(obj, s.body, file, depth + 1);
        }
      } else if (s.type === 'Include') {
        if (Object.hasOwn(program.files, s.path)) fill(target, program.files[s.path].body, s.path, depth + 1);
      }
    }
  };
  const entryAst = program.files[program.entry];
  if (entryAst) fill(root, entryAst.body, program.entry, 0);
  return { program, consts, root };
}

// Phân giải một Ref trong chuỗi thuộc tệp `file`. Trả nút hợp nhất hoặc null.
export function resolveRef(model, ref, file) {
  let cur;
  let segs = ref.path;
  if (ref.const) {
    const m = model.consts.get(file);
    if (!m || !m.has(segs[0])) return null;
    cur = leaf(m.get(segs[0]), file);
    segs = segs.slice(1);
  } else {
    cur = model.root;
  }
  for (const seg of segs) {
    if (cur.kind === 'obj') {
      const e = cur.entries.get(seg);
      if (!e) return null;
      cur = e.value;
    } else if (cur.ast.type === 'Array') {
      if (!INDEX_RE.test(seg)) return null;
      const i = Number(seg);
      if (i >= cur.ast.items.length) return null;
      cur = leaf(cur.ast.items[i], cur.file);
    } else {
      return null;
    }
  }
  return cur;
}

export function isPureRef(strAst) {
  return strAst.parts.length === 1 && strAst.parts[0].type === 'Ref';
}

// Góc nhìn đã đánh giá của một nút: { type, value?, keys?, items?, loc }.
// `ovr` là vị trí ghi đè khi giá trị đến từ chuỗi thuần tham chiếu.
export function view(model, node, ovr, depth = 0) {
  const L = (file, a) => ovr ?? { file, line: a.line, column: a.column };
  if (depth > 500) return { type: 'null', value: null, loc: L(node.file, { line: 1, column: 1 }) };
  if (node.kind === 'obj') {
    const loc = ovr ?? {
      file: node.block ? node.file : model.program.entry,
      line: node.block ? node.block.line : 1,
      column: node.block ? node.block.column : 1,
    };
    return {
      type: 'object',
      loc,
      keys: [...node.entries].map(([key, e]) => ({
        key,
        keyLoc: ovr ?? { file: e.file, line: e.stmt.line, column: e.stmt.column },
        child: () => view(model, e.value, ovr, depth + 1),
      })),
    };
  }
  const { ast, file } = node;
  switch (ast.type) {
    case 'Number':
      return { type: 'number', value: ast.value, loc: L(file, ast) };
    case 'Bool':
      return { type: 'boolean', value: ast.value, loc: L(file, ast) };
    case 'Null':
      return { type: 'null', value: null, loc: L(file, ast) };
    case 'Array':
      return {
        type: 'array',
        loc: L(file, ast),
        items: ast.items.map((it) => () => view(model, leaf(it, file), ovr, depth + 1)),
      };
    default: {
      // String
      if (isPureRef(ast)) {
        const t = resolveRef(model, ast.parts[0], file);
        if (!t) return { type: 'null', value: null, loc: L(file, ast) };
        return view(model, t, ovr ?? L(file, ast), depth + 1);
      }
      let s = '';
      for (const part of ast.parts) {
        if (part.type === 'Text') {
          s += part.value;
          continue;
        }
        const t = resolveRef(model, part, file);
        if (!t) continue;
        const v = toJson(view(model, t, undefined, depth + 1));
        s += typeof v === 'string' ? v : v === null ? 'null' : JSON.stringify(v);
      }
      return { type: 'string', value: s, loc: L(file, ast) };
    }
  }
}

export function toJson(v) {
  if (v.type === 'object') return Object.fromEntries(v.keys.map((k) => [k.key, toJson(k.child())]));
  if (v.type === 'array') return v.items.map((f) => toJson(f()));
  return v.value;
}
