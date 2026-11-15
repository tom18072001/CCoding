// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
//
// Hình dạng dữ liệu nội bộ (dùng chung cho check.js, pha B và C):
//   MObject = { kind: 'object', entries: Map<string, Entry>, block: Block|null, file: string }
//   Entry   = { key, node: Assign|Block (định nghĩa THẮNG, token khóa), file, value: Target }
//   AstVal  = { kind: 'ast', node: AST value, file }   // giá trị AST nguyên bản (số, chuỗi, mảng...)
//   Target  = MObject | AstVal                          // "đích" của một Ref
//   Merged  = { entry, root: MObject, consts: Map<file, Map<name, Const>>, program }

const isRefOnly = (s) => s.parts.length === 1 && s.parts[0].type === 'Ref';
const INDEX_RE = /^(0|[1-9][0-9]*)$/;

/**
 * Hợp nhất chương trình theo mục 6.1/6.2.
 * @param {{entry: string, files: Object<string, object>}} program đầu ra parseProject
 * @returns {{entry: string, root: object, consts: Map<string, Map<string, object>>, program: object}}
 *   root: MObject gốc (block null, file = entry). Mỗi MObject.entries giữ khóa theo thứ tự xuất hiện lần đầu;
 *   MObject.block là Block đã khởi tạo đối tượng (vị trí cho pha C); Entry.node là Assign/Block thắng.
 *   consts: tệp -> (tên -> nút Const) cho mọi tệp trong program.files.
 */
export function buildMerged(program) {
  const consts = new Map();
  for (const [file, ast] of Object.entries(program.files)) {
    const m = new Map();
    for (const st of ast.body) if (st.type === 'Const' && !m.has(st.name)) m.set(st.name, st);
    consts.set(file, m);
  }
  const root = { kind: 'object', entries: new Map(), block: null, file: program.entry };

  const run = (obj, file, body, stack) => {
    for (const st of body) {
      if (st.type === 'Assign') {
        obj.entries.set(st.key, { key: st.key, node: st, file, value: { kind: 'ast', node: st.value, file } });
      } else if (st.type === 'Block') {
        const cur = obj.entries.get(st.key);
        if (cur && cur.value.kind === 'object') {
          cur.node = st;
          cur.file = file;
          run(cur.value, file, st.body, stack);
        } else {
          const child = { kind: 'object', entries: new Map(), block: st, file };
          obj.entries.set(st.key, { key: st.key, node: st, file, value: child });
          run(child, file, st.body, stack);
        }
      } else if (st.type === 'Include') {
        const ast = program.files[st.path];
        if (ast && !stack.includes(st.path)) run(obj, st.path, ast.body, [...stack, st.path]);
      }
    }
  };
  const entryAst = program.files[program.entry];
  if (entryAst) run(root, program.entry, entryAst.body, [program.entry]);
  return { entry: program.entry, root, consts, program };
}

/**
 * Đi từ một đích theo các đoạn đường dẫn (đối tượng: khóa riêng; mảng: chỉ số; chuỗi/vô hướng: dừng).
 * @param {object} target Target
 * @param {string[]} segs
 * @returns {object|undefined} Target hoặc undefined nếu không tồn tại
 */
export function descend(target, segs) {
  let cur = target;
  for (const seg of segs) {
    if (cur.kind === 'object') {
      const e = cur.entries.get(seg);
      if (!e) return undefined;
      cur = e.value;
    } else if (cur.node.type === 'Array') {
      if (!INDEX_RE.test(seg)) return undefined;
      const i = Number(seg);
      if (i >= cur.node.items.length) return undefined;
      cur = { kind: 'ast', node: cur.node.items[i], file: cur.file };
    } else return undefined;
  }
  return cur;
}

/**
 * Phân giải một Ref.
 * @param {object} merged đầu ra buildMerged
 * @param {{path: string[], const: boolean}} ref nút Ref
 * @param {string} file tệp chứa chuỗi có Ref (dùng cho Ref hằng)
 * @returns {object|undefined} Target (MObject | AstVal) hoặc undefined nếu không phân giải được
 */
export function resolveRef(merged, ref, file) {
  if (ref.const) {
    const c = merged.consts.get(file)?.get(ref.path[0]);
    if (!c) return undefined;
    return descend({ kind: 'ast', node: c.value, file }, ref.path.slice(1));
  }
  return descend(merged.root, ref.path);
}

/**
 * Liệt kê các nút String nằm trong một đích: chính nó nếu là chuỗi, mọi chuỗi trong mảng,
 * mọi chuỗi trong đối tượng (chỉ định nghĩa thắng). Đây chính là S(đích) của pha B.
 * @param {object} target Target
 * @returns {{node: object, file: string}[]} theo thứ tự duyệt
 */
export function collectStrings(target) {
  const out = [];
  const walk = (t) => {
    if (t.kind === 'object') {
      for (const e of t.entries.values()) walk(e.value);
    } else if (t.node.type === 'String') out.push({ node: t.node, file: t.file });
    else if (t.node.type === 'Array') {
      for (const it of t.node.items) walk({ kind: 'ast', node: it, file: t.file });
    }
  };
  walk(target);
  return out;
}

/**
 * Liệt kê mọi chuỗi trong một tệp AST (kể cả trong mảng, khối, const), theo thứ tự tài liệu.
 * @param {object} fileAst nút File
 * @returns {{node: object, inConst: boolean}[]}
 */
export function stringsOfFile(fileAst) {
  const out = [];
  const val = (v, inConst) => {
    if (v.type === 'String') out.push({ node: v, inConst });
    else if (v.type === 'Array') for (const it of v.items) val(it, inConst);
  };
  const body = (b) => {
    for (const st of b) {
      if (st.type === 'Assign') val(st.value, false);
      else if (st.type === 'Block') body(st.body);
      else if (st.type === 'Const') val(st.value, true);
    }
  };
  body(fileAst.body);
  return out;
}

const stringify = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

/**
 * Đánh giá một đích thành giá trị JSON thuần (bản sao mới, không chia sẻ tham chiếu).
 * @param {object} merged đầu ra buildMerged
 * @param {object} target Target
 * @returns {*}
 */
export function evaluateTarget(merged, target) {
  if (target.kind === 'object') {
    const out = {};
    for (const [k, e] of target.entries) {
      Object.defineProperty(out, k, { value: evaluateTarget(merged, e.value), enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  const { node, file } = target;
  switch (node.type) {
    case 'Number':
    case 'Bool':
      return node.value;
    case 'Null':
      return null;
    case 'Array':
      return node.items.map((it) => evaluateTarget(merged, { kind: 'ast', node: it, file }));
    case 'String':
      return evaluateString(merged, node, file);
    default:
      return null;
  }
}

/**
 * Đánh giá một nút String (mục 6.3).
 * @param {object} merged
 * @param {object} node nút String
 * @param {string} file tệp chứa chuỗi
 * @returns {*}
 */
export function evaluateString(merged, node, file) {
  const parts = node.parts;
  if (parts.length === 0) return '';
  const val = (ref) => {
    const t = resolveRef(merged, ref, file);
    if (!t) throw new Error(`tham chiếu không phân giải được: ${ref.path.join('.')}`);
    return evaluateTarget(merged, t);
  };
  if (isRefOnly(node)) return val(parts[0]);
  let s = '';
  for (const p of parts) s += p.type === 'Text' ? p.value : stringify(val(p));
  return s;
}

/**
 * @param {{entry: string, files: object}} program đã qua check không lỗi
 * @returns {*} giá trị JSON thuần
 */
export function evaluate(program) {
  const merged = buildMerged(program);
  return evaluateTarget(merged, merged.root);
}
