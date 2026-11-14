// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
// Lõi hợp nhất `mergeProgram` có lưu dấu vị trí được dùng chung cho evaluate (tầng 3) và check (tầng 2).

/**
 * @typedef {{ kind: 'leaf', node: object, file: string }} LeafTarget
 *   Một nút giá trị AST (Number/String/Bool/Null/Array) và tệp chứa nó.
 *   Phần tử mảng cũng là LeafTarget (cùng tệp với mảng).
 *
 * @typedef {{ kind: 'object', block: (object|null), file: string, entries: Map<string, MergedEntry> }} MergedObject
 *   Đối tượng đã hợp nhất. `entries` giữ thứ tự khóa theo lần xuất hiện đầu (mục 6.2).
 *   `block` là nút Block đã KHỞI TẠO đối tượng (vị trí đối tượng, mục 6.2); gốc có `block: null`
 *   và `file` là tệp entry (vị trí 1:1).
 *
 * @typedef {{ key: string, stmt: object, file: string, value: (MergedObject|LeafTarget) }} MergedEntry
 *   `stmt` là nút Assign/Block thắng của khóa (nguyên vẹn từ AST); với khối được trộn sâu thì là Block khởi tạo.
 *   `file` là tệp chứa `stmt`.
 *
 * @typedef {{ root: MergedObject, consts: Map<string, Map<string, object>> }} MergedProgram
 *   `consts`: tên tệp → (tên const → nút Const nguyên vẹn).
 */

/**
 * Hợp nhất chương trình (đầu ra `parseProject`) theo SPEC mục 6.1–6.2.
 * - Giữ nguyên nút AST của định nghĩa thắng, không sao chép/sửa AST.
 * - Include xử lý tại chỗ vào đối tượng hiện hành; include thiếu tệp hoặc đang nằm trên đường include
 *   (vòng) bị bỏ qua (tầng 2 mới là nơi báo lỗi).
 * - Block trộn sâu nếu giá trị cũ của khóa là đối tượng, ngược lại thay mới; mảng không trộn.
 * - Mọi tham chiếu chưa được phân giải ở đây.
 * @param {{ entry: string, files: Object<string, object> }} program
 * @returns {MergedProgram}
 */
export function mergeProgram(program) {
  const files = program.files;
  /** @type {Map<string, Map<string, object>>} */
  const consts = new Map();
  for (const name of Object.keys(files)) {
    const table = new Map();
    for (const st of files[name].body) {
      if (st.type === 'Const' && !table.has(st.name)) table.set(st.name, st);
    }
    consts.set(name, table);
  }

  /** @type {MergedObject} */
  const root = { kind: 'object', block: null, file: program.entry, entries: new Map() };
  const stack = [];

  const run = (obj, stmts, file) => {
    for (const st of stmts) {
      if (st.type === 'Assign') {
        obj.entries.set(st.key, { key: st.key, stmt: st, file, value: { kind: 'leaf', node: st.value, file } });
      } else if (st.type === 'Block') {
        const old = obj.entries.get(st.key);
        let target;
        if (old && old.value.kind === 'object') {
          target = old.value;
        } else {
          target = { kind: 'object', block: st, file, entries: new Map() };
          obj.entries.set(st.key, { key: st.key, stmt: st, file, value: target });
        }
        run(target, st.body, file);
      } else if (st.type === 'Include') {
        if (!Object.hasOwn(files, st.path) || stack.includes(st.path)) continue;
        stack.push(st.path);
        run(obj, files[st.path].body, st.path);
        stack.pop();
      }
    }
  };

  if (Object.hasOwn(files, program.entry)) {
    stack.push(program.entry);
    run(root, files[program.entry].body, program.entry);
    stack.pop();
  }
  return { root, consts };
}

const INDEX = /^(?:0|[1-9][0-9]*)$/;

/**
 * Phân giải đường dẫn của một Ref (SPEC 6.1) trên chương trình đã hợp nhất.
 * - Đối tượng: theo khóa riêng (chính xác từng ký tự). Mảng: theo chỉ số nguyên không âm, không số 0 đứng đầu, trong biên.
 * - Không đi xuyên qua chuỗi hay vô hướng khi còn đoạn.
 * - Ref hằng: tra hằng `path[0]` trong bảng const của `file` (tệp chứa chuỗi), đi tiếp các đoạn sau (chỉ qua mảng).
 * @param {MergedProgram} merged
 * @param {{ path: string[], const: boolean }} ref  nút Ref của Part
 * @param {string} file  tệp chứa chuỗi có Ref
 * @returns {(MergedObject|LeafTarget|undefined)} đích, hoặc `undefined` nếu không phân giải được
 */
export function resolveRef(merged, ref, file) {
  let cur;
  let i = 0;
  if (ref.const) {
    const c = merged.consts.get(file)?.get(ref.path[0]);
    if (!c) return undefined;
    cur = { kind: 'leaf', node: c.value, file };
    i = 1;
  } else {
    cur = merged.root;
  }
  for (; i < ref.path.length; i++) {
    const seg = ref.path[i];
    if (cur.kind === 'object') {
      const e = cur.entries.get(seg);
      if (!e) return undefined;
      cur = e.value;
    } else if (cur.node.type === 'Array' && INDEX.test(seg) && Number(seg) < cur.node.items.length) {
      cur = { kind: 'leaf', node: cur.node.items[Number(seg)], file: cur.file };
    } else {
      return undefined;
    }
  }
  return cur;
}

function setProp(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (v !== null && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) setProp(o, k, clone(v[k]));
    return o;
  }
  return v;
}

function toText(v) {
  if (typeof v === 'string') return v;
  if (v === null) return 'null';
  if (typeof v === 'number') return JSON.stringify(v);
  if (typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

/**
 * Tạo bộ đánh giá đệ quy có memo trên chương trình đã hợp nhất. Kết quả của `evalTarget` có thể
 * chia sẻ tham chiếu với memo nội bộ; người gọi cần `clone` nếu muốn giữ riêng (evaluate đã làm sẵn ở các Ref).
 * @param {MergedProgram} merged
 * @returns {{ evalTarget: (t: (MergedObject|LeafTarget)) => any }}
 */
export function createEvaluator(merged) {
  const memo = new Map();
  const busy = new Set();

  const once = (key, fn) => {
    if (memo.has(key)) return memo.get(key);
    if (busy.has(key)) throw new Error('vòng tham chiếu khi đánh giá');
    busy.add(key);
    try {
      const v = fn();
      memo.set(key, v);
      return v;
    } finally {
      busy.delete(key);
    }
  };

  const refTarget = (ref, file) => {
    const t = resolveRef(merged, ref, file);
    if (!t) throw new Error(`tham chiếu không tồn tại: ${ref.path.join('.')}`);
    return t;
  };

  const evalTarget = (t) => (t.kind === 'object' ? evalObject(t) : evalNode(t.node, t.file));

  const evalObject = (obj) =>
    once(obj, () => {
      const out = {};
      for (const [k, e] of obj.entries) setProp(out, k, evalTarget(e.value));
      return out;
    });

  const evalNode = (node, file) =>
    once(node, () => {
      switch (node.type) {
        case 'Number':
        case 'Bool':
          return node.value;
        case 'Null':
          return null;
        case 'Array':
          return node.items.map((it) => evalNode(it, file));
        case 'String': {
          const parts = node.parts;
          if (parts.length === 0) return '';
          if (parts.length === 1 && parts[0].type === 'Ref') {
            return clone(evalTarget(refTarget(parts[0], file)));
          }
          let s = '';
          for (const p of parts) s += p.type === 'Text' ? p.value : toText(evalTarget(refTarget(p, file)));
          return s;
        }
        default:
          throw new Error(`nút giá trị không hợp lệ: ${node.type}`);
      }
    });

  return { evalTarget };
}

/**
 * Đánh giá chương trình đã qua `check` không lỗi thành giá trị JSON thuần (SPEC mục 6).
 * Tham chiếu được phân giải sau khi hợp nhất xong; chuỗi chỉ gồm một Ref giữ nguyên kiểu;
 * kết quả không chia sẻ tham chiếu giữa các phần.
 * @param {{ entry: string, files: Object<string, object> }} program
 * @returns {any}
 */
export function evaluate(program) {
  const merged = mergeProgram(program);
  const { evalTarget } = createEvaluator(merged);
  return clone(evalTarget(merged.root));
}
