// Nội bộ (không phải API công khai): dựng cây cấu hình hợp nhất và phân giải đường dẫn.
// Dùng chung cho evaluate (tầng 3) và check (tầng 2). Xem SPEC.md mục 6.1, 6.2.
//
// Cấu trúc:
//   Obj  = { kind: 'object', entries: Map<string, Entry>, block, file }
//          block = Block đã khởi tạo đối tượng (null với gốc), file = tệp chứa block (gốc: entry)
//   Leaf = { kind: 'node', node, file }   node = nút AST giá trị (Number/Bool/Null/String/Array)
//   Entry = { key, stmt, file, val }      stmt = Assign/Block thắng của khóa, val = Obj | Leaf
//   Merged = { root: Obj, consts: Map<tệp, Map<tên, Leaf>>, program }

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

export function isArrayIndex(seg) {
  return INDEX_RE.test(seg);
}

function newObject(block, file) {
  return { kind: 'object', entries: new Map(), block, file };
}

function setEntry(obj, key, stmt, file, val) {
  const cur = obj.entries.get(key);
  if (cur) {
    cur.stmt = stmt;
    cur.file = file;
    cur.val = val;
  } else {
    obj.entries.set(key, { key, stmt, file, val });
  }
}

function applyBody(obj, body, file, program, stack) {
  for (const st of body) {
    if (st.type === 'Assign') {
      setEntry(obj, st.key, st, file, { kind: 'node', node: st.value, file });
    } else if (st.type === 'Block') {
      const cur = obj.entries.get(st.key);
      let target;
      if (cur && cur.val.kind === 'object') {
        target = cur.val;
        cur.stmt = st;
        cur.file = file;
      } else {
        target = newObject(st, file);
        setEntry(obj, st.key, st, file, target);
      }
      applyBody(target, st.body, file, program, stack);
    } else if (st.type === 'Include') {
      const inc = Object.prototype.hasOwnProperty.call(program.files, st.path) ? program.files[st.path] : null;
      if (!inc || stack.has(st.path)) continue; // không tìm thấy / vòng: tầng 2 báo lỗi
      stack.add(st.path);
      applyBody(obj, inc.body, st.path, program, stack);
      stack.delete(st.path);
    }
    // Const: không vào kết quả
  }
}

/** Dựng cây hợp nhất từ program (đầu ra parseProject). */
export function buildMerged(program) {
  const consts = new Map();
  for (const file of Object.keys(program.files)) {
    const table = new Map();
    for (const st of program.files[file].body) {
      if (st.type === 'Const' && !table.has(st.name)) {
        table.set(st.name, { kind: 'node', node: st.value, file });
      }
    }
    consts.set(file, table);
  }
  const root = newObject(null, program.entry);
  const entryAst = program.files[program.entry];
  if (entryAst) {
    applyBody(root, entryAst.body, program.entry, program, new Set([program.entry]));
  }
  return { root, consts, program };
}

/** Đi tiếp các đoạn từ một đích (Obj hoặc Leaf). Trả đích mới hoặc null. */
export function walkSegments(target, segs) {
  let cur = target;
  for (const seg of segs) {
    if (!cur) return null;
    if (cur.kind === 'object') {
      const e = cur.entries.get(seg);
      cur = e ? e.val : null;
    } else if (cur.node.type === 'Array') {
      if (!isArrayIndex(seg)) return null;
      const i = Number(seg);
      if (i >= cur.node.items.length) return null;
      cur = { kind: 'node', node: cur.node.items[i], file: cur.file };
    } else {
      return null; // vô hướng hoặc chuỗi: không đi xuyên qua
    }
  }
  return cur;
}

/** Phân giải Ref (nút Part) nằm trong chuỗi thuộc `file`. Trả đích hoặc null. */
export function resolveRef(merged, ref, file) {
  if (ref.const) {
    const table = merged.consts.get(file);
    const c = table ? table.get(ref.path[0]) : undefined;
    if (!c) return null;
    return walkSegments(c, ref.path.slice(1));
  }
  return walkSegments(merged.root, ref.path);
}

function collectNodeStrings(node, file, out) {
  if (node.type === 'String') out.push({ node, file });
  else if (node.type === 'Array') for (const it of node.items) collectNodeStrings(it, file, out);
}

/** Mọi nút String trong một đích (chính nó / trong mảng / trong đối tượng hợp nhất, chỉ định nghĩa thắng). */
export function stringsOf(target, out = []) {
  if (!target) return out;
  if (target.kind === 'object') {
    for (const e of target.entries.values()) stringsOf(e.val, out);
  } else {
    collectNodeStrings(target.node, target.file, out);
  }
  return out;
}
