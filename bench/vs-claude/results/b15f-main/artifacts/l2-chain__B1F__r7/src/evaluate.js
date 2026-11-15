// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
//
// HỢP ĐỒNG HELPER (dùng chung cho tầng 2 — check.js):
//
// mergeProgram(program) → merged
//   Hợp nhất chưa đánh giá (6.1, 6.2). `merged = { entry, program, root }`.
//   MObj (đối tượng hợp nhất): { entries: Map<khóa, Entry>, file, line, column }
//     - Map giữ thứ tự xuất hiện lần đầu (ghi đè không đổi vị trí).
//     - (file, line, column) = vị trí Block đã khởi tạo đối tượng; gốc = (entry, 1, 1).
//   Entry: { key, stmt, file, node?, obj? }
//     - stmt/file: Assign/Block THẮNG (cuối cùng chạm tới khóa) và tệp chứa nó
//       (vị trí khóa cho SEM_UNKNOWN_KEY = stmt.line/column).
//     - Giá trị vô hướng/mảng/chuỗi: `node` là nút AST giá trị thắng (obj = undefined).
//     - Đối tượng: `obj` là MObj (node = undefined).
//   Include thiếu tệp hoặc nằm trên đường include hiện tại thì bị bỏ qua (không ném).
//   Const không vào cây; bảng hằng theo tệp lấy qua resolveRef.
//
// Target (đích phân giải): { kind: 'obj', obj: MObj } | { kind: 'node', node, file }
//   `node` là nút AST giá trị (String/Array/Number/Bool/Null); `file` là tệp chứa nút.
//
// resolveRef(merged, ref, file) → Target | null
//   Phân giải một Part Ref nằm trong chuỗi của tệp `file` (6.1). null = không tồn tại.
//
// collectStrings(target) → [{ node, file }]
//   Tập S(đích) của mục 5: mọi nút String trong đích (chỉ định nghĩa thắng).
//
// evaluateMerged(merged) → Located (cây giá trị đã đánh giá, kèm vị trí, theo mục 5 pha C)
//   Located: { type: 'object'|'array'|'string'|'number'|'boolean'|'null', value?, items?, entries?,
//              file, line, column }
//     - object: entries = [{ key, value: Located, file, line, column }] theo thứ tự khóa 6.2,
//       (file,line,column) của entry = vị trí khóa; của chính nút = vị trí Block khởi tạo.
//     - array: items = Located[]; vô hướng/chuỗi: value.
//     - Giá trị đến từ chuỗi thuần tham chiếu: mọi nút bên trong mang vị trí của chuỗi đó.
//   Ném Error nếu có tham chiếu không phân giải được hoặc vòng (chỉ với chương trình chưa qua check).
//
// toPlain(located) → giá trị JSON thuần mới (không chia sẻ tham chiếu).

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function newObj(file, line, column) {
  return { entries: new Map(), file, line, column };
}

function mergeBody(ctx, obj, body, file, stack) {
  for (const stmt of body) {
    if (stmt.type === 'Assign') {
      obj.entries.set(stmt.key, { key: stmt.key, stmt, file, node: stmt.value });
    } else if (stmt.type === 'Block') {
      const old = obj.entries.get(stmt.key);
      if (old && old.obj) {
        old.stmt = stmt;
        old.file = file;
        mergeBody(ctx, old.obj, stmt.body, file, stack);
      } else {
        const child = newObj(file, stmt.line, stmt.column);
        obj.entries.set(stmt.key, { key: stmt.key, stmt, file, obj: child });
        mergeBody(ctx, child, stmt.body, file, stack);
      }
    } else if (stmt.type === 'Include') {
      const ast = own(ctx.program.files, stmt.path) ? ctx.program.files[stmt.path] : undefined;
      if (!ast || stack.includes(stmt.path)) continue;
      stack.push(stmt.path);
      mergeBody(ctx, obj, ast.body, stmt.path, stack);
      stack.pop();
    }
    // Const: không vào kết quả
  }
}

export function mergeProgram(program) {
  const root = newObj(program.entry, 1, 1);
  const merged = { entry: program.entry, program, root, _consts: new Map() };
  const ast = program.files[program.entry];
  if (ast) mergeBody(merged, root, ast.body, program.entry, [program.entry]);
  return merged;
}

function constsOf(merged, file) {
  let m = merged._consts.get(file);
  if (!m) {
    m = new Map();
    const ast = own(merged.program.files, file) ? merged.program.files[file] : undefined;
    if (ast) for (const s of ast.body) if (s.type === 'Const') m.set(s.name, s.value);
    merged._consts.set(file, m);
  }
  return m;
}

const INDEX = /^(0|[1-9][0-9]*)$/;

export function resolveRef(merged, ref, file) {
  const path = ref.path;
  let cur;
  let i = 0;
  if (ref.const) {
    const v = constsOf(merged, file).get(path[0]);
    if (!v) return null;
    cur = { kind: 'node', node: v, file };
    i = 1;
  } else {
    cur = { kind: 'obj', obj: merged.root };
  }
  for (; i < path.length; i++) {
    const seg = path[i];
    if (cur.kind === 'obj') {
      const e = cur.obj.entries.get(seg);
      if (!e) return null;
      cur = e.obj ? { kind: 'obj', obj: e.obj } : { kind: 'node', node: e.node, file: e.file };
    } else if (cur.node.type === 'Array') {
      if (!INDEX.test(seg)) return null;
      const idx = Number(seg);
      if (idx >= cur.node.items.length) return null;
      cur = { kind: 'node', node: cur.node.items[idx], file: cur.file };
    } else {
      return null;
    }
  }
  return cur;
}

export function collectStrings(target) {
  const out = [];
  const walkNode = (node, file) => {
    if (node.type === 'String') out.push({ node, file });
    else if (node.type === 'Array') for (const it of node.items) walkNode(it, file);
  };
  const walk = (t) => {
    if (t.kind === 'node') return walkNode(t.node, t.file);
    for (const e of t.obj.entries.values()) {
      if (e.obj) walk({ kind: 'obj', obj: e.obj });
      else walkNode(e.node, e.file);
    }
  };
  walk(target);
  return out;
}

function toText(loc) {
  switch (loc.type) {
    case 'string': return loc.value;
    case 'number': return JSON.stringify(loc.value);
    case 'boolean': return String(loc.value);
    case 'null': return 'null';
    default: return JSON.stringify(toPlain(loc)); // không xảy ra với chương trình đã qua check
  }
}

function evalTarget(merged, target, override, stack) {
  const at = (file, n) => override ?? { file, line: n.line, column: n.column };
  if (target.kind === 'obj') {
    const o = target.obj;
    const entries = [];
    for (const e of o.entries.values()) {
      const child = e.obj ? { kind: 'obj', obj: e.obj } : { kind: 'node', node: e.node, file: e.file };
      entries.push({
        key: e.key,
        value: evalTarget(merged, child, override, stack),
        ...(override ?? { file: e.file, line: e.stmt.line, column: e.stmt.column }),
      });
    }
    return { type: 'object', entries, ...(override ?? { file: o.file, line: o.line, column: o.column }) };
  }
  const { node, file } = target;
  switch (node.type) {
    case 'Number': return { type: 'number', value: node.value, ...at(file, node) };
    case 'Bool': return { type: 'boolean', value: node.value, ...at(file, node) };
    case 'Null': return { type: 'null', value: null, ...at(file, node) };
    case 'Array':
      return {
        type: 'array',
        items: node.items.map((it) => evalTarget(merged, { kind: 'node', node: it, file }, override, stack)),
        ...at(file, node),
      };
    case 'String': {
      const loc = at(file, node);
      if (node.parts.length === 0) return { type: 'string', value: '', ...loc };
      if (stack.has(node)) throw new Error('vòng tham chiếu');
      stack.add(node);
      try {
        const resolve = (r) => {
          const t = resolveRef(merged, r, file);
          if (!t) throw new Error(`tham chiếu không tồn tại: ${r.const ? '@' : ''}${r.path.join('.')}`);
          return t;
        };
        if (node.parts.length === 1 && node.parts[0].type === 'Ref') {
          return evalTarget(merged, resolve(node.parts[0]), override ?? loc, stack);
        }
        let s = '';
        for (const p of node.parts) {
          s += p.type === 'Text' ? p.value : toText(evalTarget(merged, resolve(p), override, stack));
        }
        return { type: 'string', value: s, ...loc };
      } finally {
        stack.delete(node);
      }
    }
    default:
      throw new Error(`nút không hỗ trợ: ${node.type}`);
  }
}

export function evaluateMerged(merged) {
  return evalTarget(merged, { kind: 'obj', obj: merged.root }, null, new Set());
}

export function toPlain(loc) {
  switch (loc.type) {
    case 'object': {
      const out = {};
      for (const e of loc.entries) {
        Object.defineProperty(out, e.key, {
          value: toPlain(e.value), enumerable: true, writable: true, configurable: true,
        });
      }
      return out;
    }
    case 'array': return loc.items.map(toPlain);
    default: return loc.value;
  }
}

export function evaluate(program) {
  return toPlain(evaluateMerged(mergeProgram(program)));
}
