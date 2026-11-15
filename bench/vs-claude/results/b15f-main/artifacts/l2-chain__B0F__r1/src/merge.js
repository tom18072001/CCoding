/**
 * Tầng 3 — hợp nhất chương trình và phân giải tham chiếu (SPEC.md mục 6).
 * HỢP ĐỒNG CHUNG cho evaluate.js (S3) và check.js pha B/C (S4b). Chỉ được THÊM export, không đổi chữ ký.
 *
 * Kiểu:
 *   ValueNode    = nút AST giá trị (Number|Bool|Null|String|Array) — nguyên bản từ parser, không sao chép.
 *   MergedObject = { type: 'Object', entries: Map<string, Entry>, block: {file,line,column} }
 *                  entries giữ thứ tự khóa xuất hiện lần đầu (6.2). `block` = vị trí Block đã KHỞI TẠO đối tượng
 *                  (gốc: { file: entry, line: 1, column: 1 }).
 *   Entry        = { value: ValueNode|MergedObject, node: Assign|Block, file: string }
 *                  node/file = câu lệnh THẮNG (xử lý sau cùng, kể cả Block trộn vào) của khóa và tệp chứa nó.
 *                  Với Assign: value là node.value; phần tử mảng là ValueNode con của Array.
 *   Merged       = { root: MergedObject, fileOf: WeakMap<StringNode, string>, consts: Map<string, Map<string, ValueNode>> }
 *                  fileOf: tệp chứa mỗi nút String đã gặp (kể cả trong mảng, trong const, trong định nghĩa bị ghi đè).
 *                  consts: tệp -> (tên hằng -> ValueNode), hằng khai báo ở bất kỳ đâu trong tệp.
 *   Siêu dữ liệu nằm NGOÀI cây giá trị; AST không bị sửa.
 *
 * Export:
 *   merge(program) -> Merged                       (không ném; include thiếu/vòng thì bỏ qua)
 *   isMergedObject(x) -> boolean
 *   resolveRef(merged, ref, file) -> { found: false } | { found: true, target: ValueNode|MergedObject }
 *        ref: nút Ref { path, const }; file: tệp chứa chuỗi. Cấu hình: đối tượng theo khóa riêng, mảng theo chỉ số
 *        chuẩn, không đi xuyên chuỗi/vô hướng. Hằng: hằng của `file`, rồi đi tiếp chỉ qua mảng.
 *   collectStrings(target) -> StringNode[]         S(đích): chuỗi trong đích (chỉ định nghĩa thắng), thứ tự duyệt sâu.
 *   evaluateValue(merged, target, file?) -> JSON   đánh giá đệ quy (mới hoàn toàn mỗi lần gọi, không chia sẻ tham chiếu).
 *        `file` chỉ cần cho String nằm ngoài fileOf (thường bỏ qua). Vòng tham chiếu -> ném Error code 'EVAL_CYCLE'.
 *   evaluateString(merged, strNode) -> JSON        đánh giá một nút String theo 6.3.
 *   evaluateMerged(merged) -> JSON                 đánh giá gốc.
 */

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const INDEX_RE = /^(0|[1-9][0-9]*)$/;

export function isMergedObject(x) {
  return x !== null && typeof x === 'object' && x.type === 'Object' && x.entries instanceof Map;
}

function registerStrings(node, file, fileOf) {
  if (node.type === 'String') fileOf.set(node, file);
  else if (node.type === 'Array') for (const it of node.items) registerStrings(it, file, fileOf);
}

export function merge(program) {
  const entryFile = program.entry;
  const files = program.files;
  const fileOf = new WeakMap();
  const consts = new Map();
  const root = { type: 'Object', entries: new Map(), block: { file: entryFile, line: 1, column: 1 } };
  const stack = [];

  function run(file, body, obj) {
    for (const st of body) {
      if (st.type === 'Assign') {
        registerStrings(st.value, file, fileOf);
        obj.entries.set(st.key, { value: st.value, node: st, file });
      } else if (st.type === 'Block') {
        const old = obj.entries.get(st.key);
        let child;
        if (old && isMergedObject(old.value)) {
          child = old.value;
          old.node = st;
          old.file = file;
        } else {
          child = { type: 'Object', entries: new Map(), block: { file, line: st.line, column: st.column } };
          obj.entries.set(st.key, { value: child, node: st, file });
        }
        run(file, st.body, child);
      } else if (st.type === 'Include') {
        if (hasOwn(files, st.path) && !stack.includes(st.path)) visit(st.path, obj);
      }
    }
  }

  function visit(file, obj) {
    const ast = files[file];
    if (!consts.has(file)) {
      const m = new Map();
      for (const st of ast.body) {
        if (st.type === 'Const') {
          registerStrings(st.value, file, fileOf);
          if (!m.has(st.name)) m.set(st.name, st.value);
        }
      }
      consts.set(file, m);
    }
    stack.push(file);
    run(file, ast.body, obj);
    stack.pop();
  }

  if (hasOwn(files, entryFile)) visit(entryFile, root);
  return { root, fileOf, consts };
}

function walkPath(start, segs) {
  let cur = start;
  for (const seg of segs) {
    if (isMergedObject(cur)) {
      const e = cur.entries.get(seg);
      if (!e) return { found: false };
      cur = e.value;
    } else if (cur.type === 'Array') {
      if (!INDEX_RE.test(seg)) return { found: false };
      const i = Number(seg);
      if (!(i < cur.items.length)) return { found: false };
      cur = cur.items[i];
    } else {
      return { found: false };
    }
  }
  return { found: true, target: cur };
}

export function resolveRef(merged, ref, file) {
  if (ref.const) {
    const c = merged.consts.get(file);
    const start = c && c.get(ref.path[0]);
    if (!start) return { found: false };
    return walkPath(start, ref.path.slice(1));
  }
  return walkPath(merged.root, ref.path);
}

export function collectStrings(target) {
  const out = [];
  (function go(n) {
    if (isMergedObject(n)) for (const e of n.entries.values()) go(e.value);
    else if (n.type === 'String') out.push(n);
    else if (n.type === 'Array') for (const it of n.items) go(it);
  })(target);
  return out;
}

function scalarToText(v) {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export function evaluateValue(merged, target, file, active = new Set()) {
  if (isMergedObject(target)) {
    const out = {};
    for (const [k, e] of target.entries) {
      Object.defineProperty(out, k, {
        value: evaluateValue(merged, e.value, e.file, active),
        enumerable: true, writable: true, configurable: true,
      });
    }
    return out;
  }
  switch (target.type) {
    case 'Number': case 'Bool': return target.value;
    case 'Null': return null;
    case 'Array': return target.items.map((it) => evaluateValue(merged, it, file, active));
    case 'String': {
      const f = merged.fileOf.get(target) ?? file;
      if (active.has(target)) {
        const e = new Error('Vòng tham chiếu khi đánh giá');
        e.code = 'EVAL_CYCLE';
        throw e;
      }
      active.add(target);
      try {
        const parts = target.parts;
        const ev = (r) => {
          const res = resolveRef(merged, r, f);
          if (!res.found) {
            const e = new Error('Tham chiếu không phân giải được');
            e.code = 'EVAL_UNDEFINED_REF';
            throw e;
          }
          return evaluateValue(merged, res.target, f, active);
        };
        if (parts.length === 1 && parts[0].type === 'Ref') return ev(parts[0]);
        let s = '';
        for (const p of parts) s += p.type === 'Text' ? p.value : scalarToText(ev(p));
        return s;
      } finally {
        active.delete(target);
      }
    }
    default:
      throw new Error(`Nút không hỗ trợ: ${target.type}`);
  }
}

export function evaluateString(merged, strNode) {
  return evaluateValue(merged, strNode, merged.fileOf.get(strNode));
}

export function evaluateMerged(merged) {
  return evaluateValue(merged, merged.root, merged.root.block.file);
}
