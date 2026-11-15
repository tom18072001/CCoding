// Nội bộ (không xuất qua index.js): hợp nhất có vết vị trí, phân giải Ref, đánh giá chuỗi.
// Xem SPEC.md mục 6. An toàn với chương trình chưa qua check (không ném khi phân giải).
//
// Mô hình:
//   ObjNode  = { kind: 'object', file, block, entries: Map<string, Entry> }
//              block = nút Block đã khởi tạo đối tượng (null với gốc); file = tệp chứa block (gốc: entry)
//   Entry    = { key, file, stmt, first, value }
//              stmt = Assign/Block ghi gần nhất (thắng); first = câu lệnh đầu tiên của khóa hiện tại
//              file = tệp chứa stmt; value = ObjNode | ValNode
//   ValNode  = { kind: 'node', node, file }   node: nút giá trị AST (Number/String/Array/...)
//   Target   = ObjNode | ValNode (phần tử mảng cũng là ValNode)

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

export function merge(program) {
  const root = { kind: 'object', file: program.entry, block: null, entries: new Map() };
  const consts = new Map();
  for (const [file, ast] of Object.entries(program.files ?? {})) {
    const table = new Map();
    for (const s of ast.body) {
      if (s.type === 'Const' && !table.has(s.name)) table.set(s.name, { kind: 'node', node: s.value, file });
    }
    consts.set(file, table);
  }
  const ctx = { program, root, consts };
  const entryAst = program.files?.[program.entry];
  if (entryAst) fill(ctx, root, entryAst.body, program.entry, new Set([program.entry]));
  return ctx;
}

function fill(ctx, obj, body, file, stack) {
  for (const s of body) {
    if (s.type === 'Assign') {
      obj.entries.set(s.key, {
        key: s.key, file, stmt: s, first: s, value: { kind: 'node', node: s.value, file },
      });
    } else if (s.type === 'Block') {
      const cur = obj.entries.get(s.key);
      if (cur && cur.value.kind === 'object') {
        cur.stmt = s;
        cur.file = file;
        fill(ctx, cur.value, s.body, file, stack);
      } else {
        const child = { kind: 'object', file, block: s, entries: new Map() };
        obj.entries.set(s.key, { key: s.key, file, stmt: s, first: s, value: child });
        fill(ctx, child, s.body, file, stack);
      }
    } else if (s.type === 'Include') {
      if (!Object.hasOwn(ctx.program.files, s.path) || stack.has(s.path)) continue;
      stack.add(s.path);
      fill(ctx, obj, ctx.program.files[s.path].body, s.path, stack);
      stack.delete(s.path);
    }
  }
}

// Phân giải Ref của chuỗi nằm trong `file`. Trả { found: true, target } | { found: false }. Không ném.
export function resolveRef(ctx, ref, file) {
  let cur;
  let rest;
  if (ref.const) {
    const c = ctx.consts.get(file)?.get(ref.path[0]);
    if (!c) return { found: false };
    cur = c;
    rest = ref.path.slice(1);
  } else {
    cur = ctx.root;
    rest = ref.path;
  }
  for (const seg of rest) {
    if (cur.kind === 'object') {
      const e = cur.entries.get(seg);
      if (!e) return { found: false };
      cur = e.value;
    } else if (cur.node.type === 'Array') {
      if (!INDEX_RE.test(seg)) return { found: false };
      const i = Number(seg);
      if (!(i < cur.node.items.length)) return { found: false };
      cur = { kind: 'node', node: cur.node.items[i], file: cur.file };
    } else {
      return { found: false };
    }
  }
  return { found: true, target: cur };
}

// Mọi nút String nằm trong target (chỉ định nghĩa thắng): [{ node, file }]
export function stringsOf(target, out = []) {
  if (target.kind === 'object') {
    for (const e of target.entries.values()) stringsOf(e.value, out);
  } else if (target.node.type === 'String') {
    out.push({ node: target.node, file: target.file });
  } else if (target.node.type === 'Array') {
    for (const it of target.node.items) stringsOf({ kind: 'node', node: it, file: target.file }, out);
  }
  return out;
}

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// Đánh giá target thành JSON mới (không chia sẻ tham chiếu). `visiting`: tập nút String đang đánh giá.
export function evalTarget(ctx, target, visiting = new Set()) {
  if (target.kind === 'object') {
    const out = {};
    for (const [k, e] of target.entries) {
      Object.defineProperty(out, k, {
        value: evalTarget(ctx, e.value, visiting), enumerable: true, writable: true, configurable: true,
      });
    }
    return out;
  }
  const { node, file } = target;
  switch (node.type) {
    case 'Number': case 'Bool': return node.value;
    case 'Null': return null;
    case 'Array': return node.items.map((it) => evalTarget(ctx, { kind: 'node', node: it, file }, visiting));
    case 'String': return evalString(ctx, node, file, visiting);
    default: throw fail('EVAL_BAD_NODE', `Nút không hợp lệ: ${node.type}`);
  }
}

export function evalString(ctx, node, file, visiting = new Set()) {
  if (visiting.has(node)) throw fail('EVAL_CYCLE', 'Vòng tham chiếu');
  visiting.add(node);
  try {
    const refVal = (ref) => {
      const r = resolveRef(ctx, ref, file);
      if (!r.found) throw fail('EVAL_UNDEFINED_REF', `Tham chiếu không tồn tại: ${ref.path.join('.')}`);
      return evalTarget(ctx, r.target, visiting);
    };
    const parts = node.parts;
    if (parts.length === 1 && parts[0].type === 'Ref') return refVal(parts[0]);
    let s = '';
    for (const p of parts) {
      if (p.type === 'Text') s += p.value;
      else {
        const v = refVal(p);
        s += typeof v === 'string' ? v : JSON.stringify(v);
      }
    }
    return s;
  } finally {
    visiting.delete(node);
  }
}
