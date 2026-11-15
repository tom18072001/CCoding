/**
 * Mô-đun hợp nhất có nguồn gốc (nội bộ, dùng chung cho evaluate và check). SPEC mục 6.1, 6.2.
 *
 * HỢP ĐỒNG
 *
 * buildMerged(program) → merged
 *   program: đầu ra parseProject (`{ entry, files }`). Xử lý câu lệnh của entry theo thứ tự;
 *   `Include` chèn tại chỗ (tệp thiếu hoặc đang nằm trên đường include bị bỏ qua, không ném);
 *   `Const` không vào cây.
 *   merged = { root, constsByFile, resolve(ref, file) }
 *
 * Nút của cây hợp nhất (chỉ có hai loại):
 *   { kind: 'object', file, line, column, entries: Map<string, Entry> }
 *       file/line/column = vị trí Block đã KHỞI TẠO đối tượng (mục 6.2).
 *       Gốc: file = entry, line = 1, column = 1.
 *       Map giữ thứ tự xuất hiện lần đầu của khóa; ghi đè không đổi vị trí.
 *   { kind: 'value', ast, file }
 *       ast = nút AST giá trị thắng (Number/Bool/Null/String/Array), file = tệp chứa nó.
 *       Phần tử mảng cũng là nút 'value' (ast = nút phần tử, cùng file).
 *   Entry = { key, node, file, line, column }
 *       file/line/column = vị trí token khóa của Assign/Block THẮNG (câu lệnh gần nhất đặt khóa;
 *       Block trộn vào đối tượng có sẵn cũng cập nhật vị trí này, nhưng không đổi vị trí khởi tạo
 *       của đối tượng).
 *
 * constsByFile: Map<tênTệp, Map<tênHằng, { node: Const, file, value: nút 'value' }>>
 *   Mỗi tệp trong program.files có một Map (kể cả rỗng). Trùng tên: giữ cái đầu tiên.
 *
 * merged.resolve(ref, file) / resolve(merged, ref, file) → nút (object|value) hoặc null.
 *   Ref hằng: lấy hằng của `file` rồi đi các đoạn sau. Ref cấu hình: đi từ gốc.
 *   Mỗi đoạn: đối tượng → khóa riêng chính xác; mảng → chỉ số nguyên không âm, không số 0 đứng đầu,
 *   trong phạm vi; vô hướng hoặc chuỗi mà còn đoạn → null. null (Null) là đích tồn tại.
 *
 * listStrings(program) → [{ node: String, file, inConst }]
 *   Mọi nút String của mọi tệp trong program.files (thứ tự tệp rồi thứ tự tài liệu), gồm chuỗi
 *   trong mảng, chuỗi trong const và chuỗi bị ghi đè. inConst = nằm trong giá trị của một Const.
 */

const posOf = (n, file) => ({ file, line: n.line, column: n.column });

export function buildMerged(program) {
  const { entry, files } = program;
  const has = (f) => Object.prototype.hasOwnProperty.call(files, f);
  const constsByFile = new Map();
  for (const [file, ast] of Object.entries(files)) {
    const m = new Map();
    for (const st of ast.body) {
      if (st.type === 'Const' && !m.has(st.name)) {
        m.set(st.name, { node: st, file, value: { kind: 'value', ast: st.value, file } });
      }
    }
    constsByFile.set(file, m);
  }

  const root = { kind: 'object', file: entry, line: 1, column: 1, entries: new Map() };

  const run = (file, target, path) => {
    if (!has(file) || path.includes(file)) return;
    const inner = [...path, file];
    const exec = (body, obj) => {
      for (const st of body) {
        if (st.type === 'Assign') {
          obj.entries.set(st.key, {
            key: st.key,
            node: { kind: 'value', ast: st.value, file },
            ...posOf(st, file),
          });
        } else if (st.type === 'Block') {
          const old = obj.entries.get(st.key);
          let child;
          if (old && old.node.kind === 'object') {
            child = old.node;
            old.file = file;
            old.line = st.line;
            old.column = st.column;
          } else {
            child = { kind: 'object', ...posOf(st, file), entries: new Map() };
            obj.entries.set(st.key, { key: st.key, node: child, ...posOf(st, file) });
          }
          exec(st.body, child);
        } else if (st.type === 'Include') {
          run(st.path, obj, inner);
        }
      }
    };
    exec(files[file].body, target);
  };
  run(entry, root, []);

  const merged = { root, constsByFile };
  merged.resolve = (ref, file) => resolve(merged, ref, file);
  return merged;
}

const INDEX = /^(0|[1-9][0-9]*)$/;

function step(node, seg) {
  if (node.kind === 'object') {
    const e = node.entries.get(seg);
    return e ? e.node : null;
  }
  if (node.ast.type === 'Array') {
    if (!INDEX.test(seg)) return null;
    const i = Number(seg);
    if (i >= node.ast.items.length) return null;
    return { kind: 'value', ast: node.ast.items[i], file: node.file };
  }
  return null;
}

export function resolve(merged, ref, file) {
  let cur;
  let rest;
  if (ref.const) {
    const c = merged.constsByFile.get(file)?.get(ref.path[0]);
    if (!c) return null;
    cur = c.value;
    rest = ref.path.slice(1);
  } else {
    cur = merged.root;
    rest = ref.path;
  }
  for (const seg of rest) {
    cur = step(cur, seg);
    if (!cur) return null;
  }
  return cur;
}

export function listStrings(program) {
  const out = [];
  const walk = (v, file, inConst) => {
    if (v.type === 'String') out.push({ node: v, file, inConst });
    else if (v.type === 'Array') for (const it of v.items) walk(it, file, inConst);
  };
  const stmts = (body, file) => {
    for (const st of body) {
      if (st.type === 'Assign') walk(st.value, file, false);
      else if (st.type === 'Const') walk(st.value, file, true);
      else if (st.type === 'Block') stmts(st.body, file);
    }
  };
  for (const [file, ast] of Object.entries(program.files)) stmts(ast.body, file);
  return out;
}
