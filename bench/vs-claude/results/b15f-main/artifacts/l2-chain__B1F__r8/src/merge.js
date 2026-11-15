// Nội bộ (không export qua index.js): hợp nhất + phân giải tham chiếu dùng chung cho evaluate (tầng 3)
// và check (tầng 2, pha B/C). SPEC.md mục 6.1–6.2.
//
// API
//   mergeProgram(program) → { root, consts, program }
//     root   : Obj  — đối tượng gốc đã hợp nhất.
//     consts : Map<tênTệp, Map<tênHằng, Leaf>> — bảng hằng theo từng tệp trong program.files
//              (trùng tên: giữ khai báo đầu; trường hợp đó pha A đã báo lỗi).
//   Obj  = { kind: 'object', entries: Map<khóa, Entry>, file, line, column }
//          entries giữ thứ tự khóa theo lần xuất hiện đầu tiên (ghi đè không đổi chỗ).
//          file/line/column = vị trí Block đã khởi tạo đối tượng (gốc: entry, 1:1) — dùng cho SEM_* pha C.
//   Entry = { key, stmt, file, lastStmt, lastFile, value }
//          stmt/file = Assign/Block THẮNG tại token khóa (với Block: Block khởi tạo đối tượng; các Block
//          trộn sau vào đối tượng đó chỉ cập nhật lastStmt/lastFile). Dùng cho SEM_UNKNOWN_KEY.
//          value: Obj | Leaf.
//   Leaf  = { kind: 'value', node, file } — node là nút giá trị AST (Number|Bool|Null|String|Array),
//          file là tệp chứa nút đó (cần để phân giải ref hằng và báo vị trí).
//   resolveRef(merged, ref, file) → Obj | Leaf | null
//          Phân giải Ref (nút Part) của chuỗi nằm trong `file`; null = không tồn tại.
//          Phần tử mảng trả về Leaf mới (cùng file) — so sánh bằng `.node`, không bằng định danh Leaf.
//   stringsOf(target) → Array<{ node, file }> — S(đích): các nút String trong đích, chỉ tính định nghĩa thắng.
//   isIndex(seg) — đoạn là chỉ số nguyên không âm, không số 0 đứng đầu.

export function isIndex(seg) {
  return /^(0|[1-9][0-9]*)$/.test(seg);
}

function newObj(file, line, column) {
  return { kind: 'object', entries: new Map(), file, line, column };
}

export function mergeProgram(program) {
  const files = program.files;
  const has = (name) => Object.hasOwn(files, name);
  const consts = new Map();
  for (const name of Object.keys(files)) {
    const table = new Map();
    for (const st of files[name].body) {
      if (st.type === 'Const' && !table.has(st.name)) {
        table.set(st.name, { kind: 'value', node: st.value, file: name });
      }
    }
    consts.set(name, table);
  }

  const root = newObj(program.entry, 1, 1);
  const stack = new Set();

  function setEntry(obj, st, file, value) {
    const old = obj.entries.get(st.key);
    if (old) {
      old.stmt = st; old.file = file; old.lastStmt = st; old.lastFile = file; old.value = value;
    } else {
      obj.entries.set(st.key, { key: st.key, stmt: st, file, lastStmt: st, lastFile: file, value });
    }
  }

  function run(obj, body, file) {
    for (const st of body) {
      if (st.type === 'Assign') {
        setEntry(obj, st, file, { kind: 'value', node: st.value, file });
      } else if (st.type === 'Block') {
        const old = obj.entries.get(st.key);
        if (old && old.value.kind === 'object') {
          old.lastStmt = st; old.lastFile = file;
          run(old.value, st.body, file);
        } else {
          const child = newObj(file, st.line, st.column);
          setEntry(obj, st, file, child);
          run(child, st.body, file);
        }
      } else if (st.type === 'Include') {
        if (has(st.path) && !stack.has(st.path)) {
          stack.add(st.path);
          run(obj, files[st.path].body, st.path);
          stack.delete(st.path);
        }
      }
      // Const: bỏ qua
    }
  }

  stack.add(program.entry);
  if (has(program.entry)) run(root, files[program.entry].body, program.entry);
  return { root, consts, program };
}

export function resolveRef(merged, ref, file) {
  const path = ref.path;
  let cur;
  let i = 0;
  if (ref.const) {
    const table = merged.consts.get(file);
    cur = table && table.get(path[0]);
    if (!cur) return null;
    i = 1;
  } else {
    cur = merged.root;
  }
  for (; i < path.length; i++) {
    const seg = path[i];
    if (cur.kind === 'object') {
      const e = cur.entries.get(seg);
      if (!e) return null;
      cur = e.value;
    } else if (cur.node.type === 'Array') {
      if (!isIndex(seg)) return null;
      const idx = Number(seg);
      if (idx >= cur.node.items.length) return null;
      cur = { kind: 'value', node: cur.node.items[idx], file: cur.file };
    } else {
      return null;
    }
  }
  return cur;
}

export function stringsOf(target) {
  const out = [];
  const seen = new Set();
  const walkNode = (node, file) => {
    if (node.type === 'String') {
      if (!seen.has(node)) { seen.add(node); out.push({ node, file }); }
    } else if (node.type === 'Array') {
      for (const it of node.items) walkNode(it, file);
    }
  };
  const walk = (t) => {
    if (t.kind === 'object') {
      for (const e of t.entries.values()) walk(e.value);
    } else {
      walkNode(t.node, t.file);
    }
  };
  walk(target);
  return out;
}
