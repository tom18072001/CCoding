// Module nội bộ: hợp nhất cấu hình và phân giải tham chiếu (SPEC.md mục 6.1, 6.2).

/**
 * Hình dạng cây hợp nhất (MNode):
 *
 * - Đối tượng: `{ kind: 'object', entries: Map<string, Entry>, origin: {file, line, column} }`
 *   `entries` giữ thứ tự xuất hiện lần đầu của khóa; `origin` là vị trí Block đã khởi tạo
 *   đối tượng (gốc: tệp entry, 1:1).
 * - Giá trị lá: `{ kind: 'value', node, file }` với `node` là nút AST giá trị
 *   (Number | Bool | Null | String | Array), `file` là tệp chứa nút đó.
 *   Mảng không được trộn; phần tử mảng được bọc khi đi qua `resolveRef`.
 *
 * Entry: `{ key, node, file, value: MNode }` — `node` (Assign | Block) và `file` là
 * định nghĩa thắng (cuối cùng) của khóa.
 *
 * Kết quả `mergeProgram`: `{ root: MNode(object), consts: Map<file, Map<name, {node, file}>> }`
 * với `node` là nút Const.
 */

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

export function mergeProgram(program) {
  const files = program.files;
  const consts = new Map();
  for (const [file, ast] of Object.entries(files)) {
    const m = new Map();
    for (const st of ast.body) {
      if (st.type === 'Const' && !m.has(st.name)) m.set(st.name, { node: st, file });
    }
    consts.set(file, m);
  }
  const root = { kind: 'object', entries: new Map(), origin: { file: program.entry, line: 1, column: 1 } };
  const onPath = new Set();
  const run = (obj, body, file) => {
    for (const st of body) {
      if (st.type === 'Assign') {
        const e = obj.entries.get(st.key);
        const value = { kind: 'value', node: st.value, file };
        if (e) { e.node = st; e.file = file; e.value = value; }
        else obj.entries.set(st.key, { key: st.key, node: st, file, value });
      } else if (st.type === 'Block') {
        const e = obj.entries.get(st.key);
        if (e && e.value.kind === 'object') {
          e.node = st; e.file = file;
          run(e.value, st.body, file);
        } else {
          const child = { kind: 'object', entries: new Map(), origin: { file, line: st.line, column: st.column } };
          if (e) { e.node = st; e.file = file; e.value = child; }
          else obj.entries.set(st.key, { key: st.key, node: st, file, value: child });
          run(child, st.body, file);
        }
      } else if (st.type === 'Include') {
        const target = Object.prototype.hasOwnProperty.call(files, st.path) ? files[st.path] : null;
        if (!target || onPath.has(st.path)) continue;
        onPath.add(st.path);
        run(obj, target.body, st.path);
        onPath.delete(st.path);
      }
    }
  };
  onPath.add(program.entry);
  run(root, files[program.entry].body, program.entry);
  return { root, consts };
}

function step(m, seg) {
  if (m.kind === 'object') {
    const e = m.entries.get(seg);
    return e ? e.value : null;
  }
  if (m.node.type === 'Array') {
    if (!INDEX_RE.test(seg)) return null;
    const i = Number(seg);
    if (i >= m.node.items.length) return null;
    return { kind: 'value', node: m.node.items[i], file: m.file };
  }
  return null; // vô hướng hoặc chuỗi: không đi xuyên qua
}

/**
 * Phân giải `ref` ({path, const}) của chuỗi nằm trong tệp `file`.
 * Trả MNode đích hoặc `null` nếu không tồn tại.
 */
export function resolveRef(tree, ref, file) {
  let cur;
  let rest;
  if (ref.const) {
    const c = tree.consts.get(file)?.get(ref.path[0]);
    if (!c) return null;
    cur = { kind: 'value', node: c.node.value, file: c.file };
    rest = ref.path.slice(1);
  } else {
    cur = tree.root;
    rest = ref.path;
  }
  for (const seg of rest) {
    cur = step(cur, seg);
    if (!cur) return null;
  }
  return cur;
}
