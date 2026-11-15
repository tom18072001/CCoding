// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
//
// ============================ HỢP ĐỒNG HELPER (D4) ============================
// Các helper dưới đây được export từ tệp này để tầng 2 (check) dùng chung, KHÔNG xuất lại từ index.js.
// Sau khi S3 bàn giao tệp bị đóng băng: chỉ được thêm, không đổi chữ ký cũ. Mọi helper KHÔNG BAO GIỜ ném.
//
// @typedef {{file: string, line: number, column: number}} Loc
//
// MNode (nút của cây hợp nhất) là một trong hai dạng:
//   ObjNode : { kind: 'object', entries: Map<string, Entry>, block: Block|null, file: string|null }
//             - `entries` giữ thứ tự khóa theo lần xuất hiện đầu (6.2); ghi đè không đổi vị trí.
//             - `block`/`file`: nút Block AST (và tệp chứa nó) đã KHỞI TẠO đối tượng (6.2);
//               gốc thì block = null, file = entry (vị trí gốc là entry 1:1).
//   ValNode : { kind: 'value', node: Value AST, file: string }
//             - node là Number/Bool/Null/String/Array AST nguyên gốc (mảng không bao giờ trộn;
//               phần tử mảng được duyệt bằng chính node.items cùng `file`).
// Entry     : { key: string, stmt: Assign|Block, file: string, value: MNode }
//             - stmt/file: câu lệnh THẮNG (cuối cùng chạm tới khóa) và tệp chứa nó; stmt.line/column là
//               vị trí token khóa (dùng cho SEM_UNKNOWN_KEY). Giá trị Assign: stmt.value (vị trí nút giá trị).
//
// mergeProgram(program) -> Merged
//   Merged = { root: ObjNode, consts: { [file]: { [name]: Const AST } }, entry: string }
//   Hợp nhất theo 6.1/6.2. Include thiếu tệp hoặc nằm trên đường xử lý hiện tại (vòng) thì bị bỏ qua.
//
// resolvePath(merged, path, isConst, file) -> { found: boolean, target?: MNode }
//   Phân giải đường dẫn Ref (6.1). isConst = Ref.const; file = tệp chứa chuỗi (dùng cho Ref hằng).
//   target là ObjNode | ValNode. Không đi xuyên qua chuỗi/vô hướng; mảng chỉ nhận chỉ số hợp lệ.
//
// evalNode(merged, mnode) -> JSON
//   Đánh giá một MNode (6.3) thành bản sao sâu JSON thuần. Ném Error (code 'EVAL_FAILED')
//   nếu gặp ref không phân giải được hoặc vòng (chỉ xảy ra với chương trình chưa qua check).
// ==============================================================================

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

function newObj(block, file) {
  return { kind: 'object', entries: new Map(), block, file };
}

export function mergeProgram(program) {
  const files = (program && program.files) || {};
  const entry = program && program.entry;
  const consts = {};
  for (const name of Object.keys(files)) {
    const table = {};
    const body = (files[name] && files[name].body) || [];
    for (const st of body) {
      if (st.type === 'Const' && !Object.prototype.hasOwnProperty.call(table, st.name)) {
        Object.defineProperty(table, st.name, { value: st, enumerable: true, writable: true, configurable: true });
      }
    }
    consts[name] = table;
  }
  const root = newObj(null, entry);
  const active = new Set();

  function run(body, obj, file) {
    for (const st of body) {
      if (st.type === 'Assign') {
        obj.entries.set(st.key, { key: st.key, stmt: st, file, value: { kind: 'value', node: st.value, file } });
      } else if (st.type === 'Block') {
        const old = obj.entries.get(st.key);
        if (old && old.value.kind === 'object') {
          old.stmt = st;
          old.file = file;
          run(st.body, old.value, file);
        } else {
          const child = newObj(st, file);
          obj.entries.set(st.key, { key: st.key, stmt: st, file, value: child });
          run(st.body, child, file);
        }
      } else if (st.type === 'Include') {
        const target = st.path;
        if (Object.prototype.hasOwnProperty.call(files, target) && !active.has(target)) {
          active.add(target);
          run(files[target].body || [], obj, target);
          active.delete(target);
        }
      }
    }
  }

  if (entry !== undefined && Object.prototype.hasOwnProperty.call(files, entry)) {
    active.add(entry);
    run(files[entry].body || [], root, entry);
    active.delete(entry);
  }
  return { root, consts, entry };
}

function step(cur, seg) {
  if (cur.kind === 'object') {
    const e = cur.entries.get(seg);
    return e ? e.value : null;
  }
  const n = cur.node;
  if (n.type === 'Array' && INDEX_RE.test(seg)) {
    const i = Number(seg);
    if (i < n.items.length) return { kind: 'value', node: n.items[i], file: cur.file };
  }
  return null;
}

export function resolvePath(merged, path, isConst, file) {
  try {
    let cur;
    let rest;
    if (isConst) {
      const table = merged.consts[file];
      if (!table || !Object.prototype.hasOwnProperty.call(table, path[0])) return { found: false };
      const c = table[path[0]];
      cur = { kind: 'value', node: c.value, file };
      rest = path.slice(1);
    } else {
      cur = merged.root;
      rest = path;
    }
    for (const seg of rest) {
      cur = step(cur, seg);
      if (!cur) return { found: false };
    }
    return { found: true, target: cur };
  } catch {
    return { found: false };
  }
}

function setKey(obj, key, val) {
  Object.defineProperty(obj, key, { value: val, enumerable: true, writable: true, configurable: true });
}

function fail(msg) {
  const e = new Error(msg);
  e.code = 'EVAL_FAILED';
  return e;
}

export function evalNode(merged, mnode) {
  const active = new Set();

  function evalM(m) {
    if (m.kind === 'object') {
      const out = {};
      for (const [k, e] of m.entries) setKey(out, k, evalM(e.value));
      return out;
    }
    return evalV(m.node, m.file);
  }

  function evalV(node, file) {
    switch (node.type) {
      case 'Number':
      case 'Bool':
        return node.value;
      case 'Null':
        return null;
      case 'Array':
        return node.items.map((it) => evalV(it, file));
      case 'String':
        return evalStr(node, file);
      default:
        throw fail(`nút không hợp lệ: ${node.type}`);
    }
  }

  function target(ref, file) {
    const r = resolvePath(merged, ref.path, ref.const, file);
    if (!r.found) throw fail(`tham chiếu không tồn tại: ${ref.path.join('.')}`);
    return r.target;
  }

  function evalStr(node, file) {
    const parts = node.parts;
    if (parts.length === 0) return '';
    if (active.has(node)) throw fail('vòng tham chiếu');
    active.add(node);
    try {
      if (parts.length === 1 && parts[0].type === 'Ref') return evalM(target(parts[0], file));
      let s = '';
      for (const p of parts) {
        if (p.type === 'Text') {
          s += p.value;
        } else {
          const v = evalM(target(p, file));
          s += typeof v === 'string' ? v : JSON.stringify(v);
        }
      }
      return s;
    } finally {
      active.delete(node);
    }
  }

  return evalM(mnode);
}

export function evaluate(program) {
  const merged = mergeProgram(program);
  return evalNode(merged, merged.root);
}
