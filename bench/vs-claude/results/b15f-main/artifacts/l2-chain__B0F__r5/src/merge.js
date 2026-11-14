// Hợp nhất có vị trí (SPEC mục 6.1–6.2). Dùng chung cho evaluate và check.
//
// API (không ném với chương trình đã parse; include thiếu hoặc đang nằm trên đường
// duyệt bị bỏ qua, nên an toàn với đầu vào có lỗi):
//
//   merge(program) -> ctx = { program, root, constants }
//     root: Target kiểu 'object' (gốc, origin = null, file = program.entry).
//     constants: { [file]: { [name]: ConstNode } } cho MỌI tệp trong program.files
//                (const trùng tên: giữ cái đầu tiên).
//
//   Target (đích của một đường dẫn) là một trong hai dạng:
//     { kind: 'object', entries: Map<string, Entry>, origin: BlockNode|null, file }
//         - entries giữ thứ tự khóa theo lần xuất hiện đầu (6.2).
//         - origin: Block đã KHỞI TẠO đối tượng (vị trí đối tượng cho pha C);
//           file: tệp chứa origin (gốc: entry, origin null => vị trí 1:1 của entry).
//     { kind: 'node', node, file }
//         - node: nút giá trị AST (Number|Bool|Null|String|Array); file: tệp chứa nút.
//         - phần tử mảng cũng là Target 'node' (file = tệp của mảng).
//
//   Entry = { key, node, file, value: Target }
//     node: định nghĩa THẮNG gần nhất (Assign hoặc Block cuối cùng chạm khóa) —
//           vị trí token khóa cho SEM_UNKNOWN_KEY; file: tệp chứa node đó.
//     value: Target của giá trị cuối cùng.
//     Với Assign: value = { kind:'node', node: Assign.value, file }.
//
//   resolvePath(ctx, path, isConst, file) -> Target | null
//     path: string[] như Ref.path; isConst: Ref.const; file: tệp chứa chuỗi.
//     Cấu hình: đi từ root; đối tượng tra khóa riêng; mảng tra chỉ số
//     (^(0|[1-9]\d*)$, trong phạm vi); vô hướng/chuỗi mà còn đoạn => null.
//     Hằng: lấy ctx.constants[file][path[0]] (null nếu không có) rồi đi tiếp path.slice(1).
//
//   resolveRef(ctx, ref, file) = resolvePath(ctx, ref.path, ref.const, file)
//
//   stringsIn(target) -> [{ node: StringNode, file }]
//     Mọi nút String nằm trong đích (chính nó; trong mảng; trong đối tượng chỉ tính
//     định nghĩa thắng) — chính là S(đích) ở mục 5.
//
//   targetPosition(target) -> { file, line, column }
//     'node' => vị trí nút; 'object' => vị trí origin (gốc: entry, 1:1).
//
// Giá trị đã đánh giá của một Target: evaluateTarget(ctx, target) trong evaluate.js
// (ném Error có code 'EVAL_CYCLE' / 'EVAL_UNDEFINED_REF' nếu chương trình có lỗi).

export function merge(program) {
  const constants = {};
  for (const [file, ast] of Object.entries(program.files)) {
    const table = (constants[file] = Object.create(null));
    for (const st of ast.body) {
      if (st.type === 'Const' && !(st.name in table)) table[st.name] = st;
    }
  }
  const root = newObject(null, program.entry);
  const ctx = { program, root, constants };
  const entryAst = program.files[program.entry];
  if (entryAst) mergeBody(ctx, root, entryAst.body, program.entry, new Set([program.entry]));
  return ctx;
}

function newObject(origin, file) {
  return { kind: 'object', entries: new Map(), origin, file };
}

function mergeBody(ctx, obj, body, file, stack) {
  for (const st of body) {
    if (st.type === 'Assign') {
      obj.entries.set(st.key, {
        key: st.key, node: st, file,
        value: { kind: 'node', node: st.value, file },
      });
    } else if (st.type === 'Block') {
      const old = obj.entries.get(st.key);
      let child;
      if (old && old.value.kind === 'object') {
        child = old.value;
        old.node = st;
        old.file = file;
      } else {
        child = newObject(st, file);
        obj.entries.set(st.key, { key: st.key, node: st, file, value: child });
      }
      mergeBody(ctx, child, st.body, file, stack);
    } else if (st.type === 'Include') {
      const target = Object.hasOwn(ctx.program.files, st.path) ? ctx.program.files[st.path] : null;
      if (!target || stack.has(st.path)) continue;
      stack.add(st.path);
      mergeBody(ctx, obj, target.body, st.path, stack);
      stack.delete(st.path);
    }
  }
}

const INDEX = /^(0|[1-9][0-9]*)$/;

export function resolvePath(ctx, path, isConst, file) {
  let cur;
  let rest = path;
  if (isConst) {
    const table = Object.hasOwn(ctx.constants, file) ? ctx.constants[file] : null;
    const c = table && table[path[0]];
    if (!c) return null;
    cur = { kind: 'node', node: c.value, file };
    rest = path.slice(1);
  } else {
    cur = ctx.root;
  }
  for (const seg of rest) {
    if (cur.kind === 'object') {
      const e = cur.entries.get(seg);
      if (!e) return null;
      cur = e.value;
    } else if (cur.node.type === 'Array') {
      if (!INDEX.test(seg)) return null;
      const i = Number(seg);
      if (i >= cur.node.items.length) return null;
      cur = { kind: 'node', node: cur.node.items[i], file: cur.file };
    } else {
      return null;
    }
  }
  return cur;
}

export function resolveRef(ctx, ref, file) {
  return resolvePath(ctx, ref.path, ref.const, file);
}

export function stringsIn(target) {
  const out = [];
  const walkNode = (node, file) => {
    if (node.type === 'String') out.push({ node, file });
    else if (node.type === 'Array') for (const it of node.items) walkNode(it, file);
  };
  const walk = (t) => {
    if (t.kind === 'object') for (const e of t.entries.values()) walk(e.value);
    else walkNode(t.node, t.file);
  };
  walk(target);
  return out;
}

export function targetPosition(target) {
  if (target.kind === 'node') return { file: target.file, line: target.node.line, column: target.node.column };
  if (target.origin) return { file: target.file, line: target.origin.line, column: target.origin.column };
  return { file: target.file, line: 1, column: 1 };
}
