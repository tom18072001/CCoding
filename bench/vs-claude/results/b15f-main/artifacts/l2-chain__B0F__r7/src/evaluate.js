// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
//
// ── Chữ ký helper dùng chung (S4/check.js bám đúng các chữ ký này) ──────────
// Cây hợp nhất KHÔNG gắn trường vào nút AST; thông tin tệp/vị trí nằm ở cấu trúc phụ:
//
//   MergedObject = { kind: 'object', file, line, column, entries: Map<string, Entry> }
//     - file/line/column: vị trí Block đã KHỞI TẠO đối tượng (6.2); gốc: entry file, 1:1.
//     - entries: Map giữ thứ tự xuất hiện lần đầu; ghi đè không đổi vị trí.
//   Entry        = { key, file, stmt, value }
//     - stmt: nút Assign/Block thắng (Assign: lần ghi cuối; Block: Block khởi tạo đối tượng,
//       không đổi khi các Block sau trộn vào), file: tệp chứa stmt.
//     - value: MergedObject | Leaf
//   Leaf         = { kind: 'node', node, file }   // node: nút giá trị AST (Number/String/Array/...)
//   Target       = MergedObject | Leaf             // đích của Ref; phần tử mảng cũng là Leaf
//   Merged       = { root: MergedObject, consts: Map<file, Map<name, Leaf>> }
//   NOT_FOUND    = Symbol (giá trị đánh dấu 'không tồn tại')
//
//   buildMerged(program) -> Merged
//   resolveRef(ref, file, merged) -> Target | NOT_FOUND
//        ref: nút Part Ref; file: tệp chứa chuỗi.
//   evaluateNode(node, file, ctx) -> giá trị JSON mới (không chia sẻ tham chiếu)
//        node: Target hoặc nút giá trị AST; ctx = { merged, stack: Set }.
//   leafOf(node, file) -> Leaf
//   isIndex(seg) -> boolean
// ─────────────────────────────────────────────────────────────────────────────

export const NOT_FOUND = Symbol('NOT_FOUND');

export function isIndex(seg) {
  return /^(0|[1-9][0-9]*)$/.test(seg);
}

export function leafOf(node, file) {
  return { kind: 'node', node, file };
}

export function buildMerged(program) {
  const consts = new Map();
  for (const [fname, ast] of Object.entries(program.files)) {
    const m = new Map();
    for (const s of ast.body) {
      if (s.type === 'Const' && !m.has(s.name)) m.set(s.name, leafOf(s.value, fname));
    }
    consts.set(fname, m);
  }
  const root = { kind: 'object', file: program.entry, line: 1, column: 1, entries: new Map() };
  const onPath = new Set();
  const run = (stmts, obj, file) => {
    for (const s of stmts) {
      if (s.type === 'Assign') {
        obj.entries.set(s.key, { key: s.key, file, stmt: s, value: leafOf(s.value, file) });
      } else if (s.type === 'Block') {
        const cur = obj.entries.get(s.key);
        if (cur && cur.value.kind === 'object') {
          run(s.body, cur.value, file);
        } else {
          const child = { kind: 'object', file, line: s.line, column: s.column, entries: new Map() };
          obj.entries.set(s.key, { key: s.key, file, stmt: s, value: child });
          run(s.body, child, file);
        }
      } else if (s.type === 'Include') {
        const target = program.files[s.path];
        if (target && !onPath.has(s.path)) {
          onPath.add(s.path);
          run(target.body, obj, s.path);
          onPath.delete(s.path);
        }
      }
    }
  };
  onPath.add(program.entry);
  run(program.files[program.entry].body, root, program.entry);
  return { root, consts };
}

function step(cur, seg) {
  if (cur.kind === 'object') {
    const e = cur.entries.get(seg);
    return e ? e.value : NOT_FOUND;
  }
  if (cur.node.type === 'Array') {
    if (!isIndex(seg)) return NOT_FOUND;
    const i = Number(seg);
    return i < cur.node.items.length ? leafOf(cur.node.items[i], cur.file) : NOT_FOUND;
  }
  return NOT_FOUND; // vô hướng hoặc chuỗi: không đi xuyên qua
}

export function resolveRef(ref, file, merged) {
  let cur;
  let rest = ref.path;
  if (ref.const) {
    cur = merged.consts.get(file)?.get(ref.path[0]);
    if (!cur) return NOT_FOUND;
    rest = ref.path.slice(1);
  } else {
    cur = merged.root;
  }
  for (const seg of rest) {
    cur = step(cur, seg);
    if (cur === NOT_FOUND) return NOT_FOUND;
  }
  return cur;
}

function setKey(o, k, v) {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function str(v) {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export function evaluateNode(node, file, ctx) {
  if (node.kind === 'object') {
    const out = {};
    for (const [k, e] of node.entries) setKey(out, k, evaluateNode(e.value, e.file, ctx));
    return out;
  }
  if (node.kind === 'node') return evaluateNode(node.node, node.file, ctx);
  switch (node.type) {
    case 'Number': case 'Bool': return node.value;
    case 'Null': return null;
    case 'Array': return node.items.map((it) => evaluateNode(it, file, ctx));
    case 'String': {
      if (ctx.stack.has(node)) throw new Error('vòng tham chiếu');
      ctx.stack.add(node);
      try {
        const refVal = (p) => {
          const t = resolveRef(p, file, ctx.merged);
          if (t === NOT_FOUND) throw new Error(`tham chiếu không tồn tại: ${p.path.join('.')}`);
          return evaluateNode(t, file, ctx);
        };
        if (node.parts.length === 1 && node.parts[0].type === 'Ref') return refVal(node.parts[0]);
        return node.parts.map((p) => (p.type === 'Text' ? p.value : str(refVal(p)))).join('');
      } finally {
        ctx.stack.delete(node);
      }
    }
    default:
      throw new Error(`nút không hỗ trợ: ${node.type}`);
  }
}

export function evaluate(program) {
  const merged = buildMerged(program);
  return evaluateNode(merged.root, program.entry, { merged, stack: new Set() });
}
