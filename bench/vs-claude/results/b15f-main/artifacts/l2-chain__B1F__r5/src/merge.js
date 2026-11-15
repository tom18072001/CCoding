// Module nội bộ dùng chung cho tầng 2 (check, pha B/C) và tầng 3 (evaluate). SPEC.md mục 6.
//
// API cho check.js:
//   buildContext(program) -> ctx
//     ctx.root: ô đối tượng gốc đã hợp nhất; ctx.program.
//   Ô (cell) có hai dạng:
//     { kind: 'object', entries: Map<khóa, entry>, origin: { node: Block, file } | null }
//        entries theo thứ tự khóa xuất hiện lần đầu (mục 6.2). origin = Block đã khởi tạo
//        đối tượng (null ở gốc: vị trí là entry, 1:1).
//        entry = { key, stmt, lastStmt, file, cell }: stmt = Assign/Block "thắng" (với đối tượng là
//        Block khởi tạo, cùng origin; với giá trị khác là Assign cuối cùng), lastStmt = câu lệnh ghi cuối,
//        file = tệp chứa stmt.
//     { kind: 'value', node, file }  — nút giá trị AST (Number/Bool/Null/String/Array) và tệp chứa nó.
//   resolveRef(ctx, ref, file) -> ô đích | undefined   (phân giải Ref cấu hình hoặc hằng của `file`)
//   collectStrings(cell) -> [{ node: String, file }]    S(đích): mọi chuỗi trong đích (chỉ định nghĩa thắng)
//   evalCell(ctx, cell) -> giá trị JSON mới (bản sao mới mỗi lần gọi)
//   evalLocated(ctx, cell) -> { value, loc: {file,line,column}, entries?: [{key, loc, node}], items?: [node] }
//        cây giá trị đã đánh giá kèm vị trí theo quy tắc pha C (mục 5). entries[].loc = vị trí token khóa
//        của câu lệnh thắng (dùng cho SEM_UNKNOWN_KEY). Bên trong chuỗi thuần tham chiếu, mọi loc là của chuỗi đó.
//   isPureRef(strNode) -> boolean
//   Ref hằng không phân giải được / khóa bị thiếu -> resolveRef trả undefined; evalCell ném Error nếu gặp.

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

function newObject(origin) {
  return { kind: 'object', entries: new Map(), origin };
}

function mergeStmts(ctx, obj, stmts, file, stack) {
  for (const st of stmts) {
    switch (st.type) {
      case 'Assign': {
        const cell = { kind: 'value', node: st.value, file };
        obj.entries.set(st.key, { key: st.key, stmt: st, lastStmt: st, file, cell });
        break;
      }
      case 'Block': {
        const old = obj.entries.get(st.key);
        if (old && old.cell.kind === 'object') {
          old.lastStmt = st;
          mergeStmts(ctx, old.cell, st.body, file, stack);
        } else {
          const cell = newObject({ node: st, file });
          obj.entries.set(st.key, { key: st.key, stmt: st, lastStmt: st, file, cell });
          mergeStmts(ctx, cell, st.body, file, stack);
        }
        break;
      }
      case 'Include': {
        const target = ctx.program.files[st.path];
        if (!target || !Object.prototype.hasOwnProperty.call(ctx.program.files, st.path)) break;
        if (stack.includes(st.path)) break; // vòng include: tầng 2 đã báo, bỏ qua để không lặp vô hạn
        stack.push(st.path);
        mergeStmts(ctx, obj, target.body, st.path, stack);
        stack.pop();
        break;
      }
      default:
        break; // Const: không vào kết quả
    }
  }
}

export function buildContext(program) {
  const ctx = { program, root: newObject(null), consts: new Map(), active: new Set() };
  const entryAst = program.files[program.entry];
  if (entryAst) mergeStmts(ctx, ctx.root, entryAst.body, program.entry, [program.entry]);
  return ctx;
}

function constsOf(ctx, file) {
  let m = ctx.consts.get(file);
  if (!m) {
    m = new Map();
    const ast = ctx.program.files[file];
    if (ast) {
      for (const st of ast.body) {
        if (st.type === 'Const' && !m.has(st.name)) m.set(st.name, st);
      }
    }
    ctx.consts.set(file, m);
  }
  return m;
}

function step(cell, seg) {
  if (cell.kind === 'object') {
    const e = cell.entries.get(seg);
    return e ? e.cell : undefined;
  }
  if (cell.node.type === 'Array') {
    if (!INDEX_RE.test(seg)) return undefined;
    const i = Number(seg);
    if (i >= cell.node.items.length) return undefined;
    return { kind: 'value', node: cell.node.items[i], file: cell.file };
  }
  return undefined; // vô hướng hoặc chuỗi: không đi xuyên qua
}

export function resolveRef(ctx, ref, file) {
  const path = ref.path;
  let cur;
  let i = 0;
  if (ref.const) {
    const c = constsOf(ctx, file).get(path[0]);
    if (!c) return undefined;
    cur = { kind: 'value', node: c.value, file };
    i = 1;
  } else {
    cur = ctx.root;
  }
  for (; i < path.length; i++) {
    cur = step(cur, path[i]);
    if (!cur) return undefined;
  }
  return cur;
}

export function isPureRef(strNode) {
  return strNode.parts.length === 1 && strNode.parts[0].type === 'Ref';
}

export function collectStrings(cell) {
  const out = [];
  const walkNode = (node, file) => {
    if (node.type === 'String') out.push({ node, file });
    else if (node.type === 'Array') for (const it of node.items) walkNode(it, file);
  };
  const walk = (c) => {
    if (c.kind === 'object') for (const e of c.entries.values()) walk(e.cell);
    else walkNode(c.node, c.file);
  };
  walk(cell);
  return out;
}

function setKey(obj, key, val) {
  Object.defineProperty(obj, key, { value: val, enumerable: true, writable: true, configurable: true });
}

function mustResolve(ctx, ref, file) {
  const t = resolveRef(ctx, ref, file);
  if (!t) {
    const e = new Error(`Tham chiếu không phân giải được: ${ref.const ? '@' : ''}${ref.path.join('.')}`);
    e.code = 'EVAL_UNRESOLVED_REF';
    throw e;
  }
  return t;
}

function scalarToText(v) {
  return typeof v === 'string' ? v : v === null ? 'null' : typeof v === 'number' ? JSON.stringify(v) : String(v);
}

// loc: nếu khác null thì ép mọi vị trí bên trong về loc này (giá trị đến từ chuỗi thuần tham chiếu).
function locOf(node, file) {
  return { file, line: node.line, column: node.column };
}

function evalStringLocated(ctx, node, file, forced) {
  const loc = forced || locOf(node, file);
  if (ctx.active.has(node)) {
    const e = new Error('Vòng tham chiếu khi đánh giá');
    e.code = 'EVAL_CYCLE';
    throw e;
  }
  ctx.active.add(node);
  try {
    const parts = node.parts;
    if (parts.length === 0) return { value: '', loc };
    if (isPureRef(node)) {
      const target = mustResolve(ctx, parts[0], file);
      return cellLocated(ctx, target, loc);
    }
    let s = '';
    for (const p of parts) {
      if (p.type === 'Text') s += p.value;
      else {
        const t = mustResolve(ctx, p, file);
        s += scalarToText(cellLocated(ctx, t, null).value);
      }
    }
    return { value: s, loc };
  } finally {
    ctx.active.delete(node);
  }
}

function nodeLocated(ctx, node, file, forced) {
  switch (node.type) {
    case 'Number':
    case 'Bool':
      return { value: node.value, loc: forced || locOf(node, file) };
    case 'Null':
      return { value: null, loc: forced || locOf(node, file) };
    case 'String':
      return evalStringLocated(ctx, node, file, forced);
    case 'Array': {
      const items = node.items.map((it) => nodeLocated(ctx, it, file, forced));
      return { value: items.map((x) => x.value), loc: forced || locOf(node, file), items };
    }
    default:
      throw new Error(`Nút giá trị lạ: ${node.type}`);
  }
}

function cellLocated(ctx, cell, forced) {
  if (cell.kind === 'value') return nodeLocated(ctx, cell.node, cell.file, forced);
  const value = {};
  const entries = [];
  for (const e of cell.entries.values()) {
    const n = cellLocated(ctx, e.cell, forced);
    setKey(value, e.key, n.value);
    entries.push({ key: e.key, loc: forced || locOf(e.stmt, e.file), node: n });
  }
  const loc = forced || (cell.origin ? locOf(cell.origin.node, cell.origin.file) : { file: ctx.program.entry, line: 1, column: 1 });
  return { value, loc, entries };
}

export function evalLocated(ctx, cell) {
  return cellLocated(ctx, cell, null);
}

export function evalCell(ctx, cell) {
  return cellLocated(ctx, cell, null).value;
}
