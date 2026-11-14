// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
//
// ═══ HỢP ĐỒNG GIAO DIỆN (cho check pha B/C — S5, S6) ═══
//
// merge(program) → Merged
//   Merged = {
//     program,                          // chương trình đầu vào
//     root:    ObjectNode,              // đối tượng gốc đã hợp nhất
//     strings: StringInfo[],            // MỌI nút String (kể cả bị ghi đè, trong mảng, trong const),
//                                       // mỗi nút String AST một lần, theo thứ tự xử lý
//     consts:  Map<file, Map<name, ConstInfo>>, // hằng cấp cao nhất của mọi tệp tới được
//   }
//   ObjectNode = {
//     kind: 'object',
//     file, line, column,               // vị trí Block đã KHỞI TẠO đối tượng (mục 6.2); gốc: {entry, 1, 1}
//     entries: Map<string, Entry>,      // thứ tự chèn = thứ tự xuất hiện đầu (mục 6.2)
//   }
//   Entry = {
//     key,
//     stmt,                             // nút thắng: Assign hoặc Block CUỐI CÙNG đặt khóa này (line/column = token khóa)
//     file,                             // tệp chứa stmt
//     value: ObjectNode | ValueNode,
//   }
//   ValueNode = { kind: 'value', node: <nút Value AST>, file }   // node.type: Number|Bool|Null|String|Array
//   StringInfo = { node, file, const: boolean, constName?: string }  // const=true nếu nằm trong giá trị của một Const
//   ConstInfo  = { stmt: Const, value: ValueNode }               // khai báo trùng: lấy cái đầu tiên
//
// resolveRef(merged, ref, file) → ObjectNode | ValueNode | null
//   Phân giải một Part Ref của chuỗi nằm trong tệp `file` (mục 6.1). null = không tồn tại.
//   Phần tử mảng trả về ValueNode { kind:'value', node: phần tử, file } (file của mảng chứa nó).
//   Đích String là ValueNode có node.type === 'String'.
//
// evaluate(program) → JSON thuần (mục 6.3). Ném Error nếu chương trình có vòng tham chiếu.

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const INDEX = /^(0|[1-9][0-9]*)$/;

function setKey(obj, key, value) {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

export function merge(program) {
  const merged = { program, root: null, strings: [], consts: new Map() };
  const seenStrings = new Set();
  const onStack = new Set();
  const root = { kind: 'object', file: program.entry, line: 1, column: 1, entries: new Map() };
  merged.root = root;

  const collect = (node, file, constName) => {
    if (node.type === 'String') {
      if (seenStrings.has(node)) return;
      seenStrings.add(node);
      const info = { node, file, const: constName !== undefined };
      if (constName !== undefined) info.constName = constName;
      merged.strings.push(info);
    } else if (node.type === 'Array') {
      for (const it of node.items) collect(it, file, constName);
    }
  };

  const registerConsts = (file, ast) => {
    if (merged.consts.has(file)) return;
    const m = new Map();
    for (const s of ast.body) {
      if (s.type === 'Const' && !m.has(s.name)) m.set(s.name, { stmt: s, value: { kind: 'value', node: s.value, file } });
    }
    merged.consts.set(file, m);
  };

  const runBody = (body, obj, file) => {
    for (const s of body) {
      if (s.type === 'Assign') {
        collect(s.value, file);
        const v = { kind: 'value', node: s.value, file };
        const e = obj.entries.get(s.key);
        if (e) { e.stmt = s; e.file = file; e.value = v; }
        else obj.entries.set(s.key, { key: s.key, stmt: s, file, value: v });
      } else if (s.type === 'Block') {
        const e = obj.entries.get(s.key);
        let target;
        if (e && e.value.kind === 'object') {
          target = e.value;
          e.stmt = s; e.file = file;
        } else {
          target = { kind: 'object', file, line: s.line, column: s.column, entries: new Map() };
          if (e) { e.stmt = s; e.file = file; e.value = target; }
          else obj.entries.set(s.key, { key: s.key, stmt: s, file, value: target });
        }
        runBody(s.body, target, file);
      } else if (s.type === 'Include') {
        const ast = hasOwn(program.files, s.path) ? program.files[s.path] : null;
        if (!ast || onStack.has(s.path)) continue;
        runFile(s.path, ast, obj);
      } else if (s.type === 'Const') {
        collect(s.value, file, s.name);
      }
    }
  };

  const runFile = (file, ast, obj) => {
    registerConsts(file, ast);
    onStack.add(file);
    runBody(ast.body, obj, file);
    onStack.delete(file);
  };

  if (hasOwn(program.files, program.entry)) runFile(program.entry, program.files[program.entry], root);
  return merged;
}

export function resolveRef(merged, ref, file) {
  const path = ref.path;
  let cur;
  let i = 0;
  if (ref.const) {
    const c = merged.consts.get(file)?.get(path[0]);
    if (!c) return null;
    cur = c.value;
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
    } else if (cur.node.type === 'Array' && INDEX.test(seg) && Number(seg) < cur.node.items.length) {
      cur = { kind: 'value', node: cur.node.items[Number(seg)], file: cur.file };
    } else {
      return null;
    }
  }
  return cur;
}

export function evaluate(program) {
  const merged = merge(program);
  const inProgress = new Set();

  const evalTarget = (t) => {
    if (t.kind === 'object') {
      const out = {};
      for (const [k, e] of t.entries) setKey(out, k, evalTarget(e.value));
      return out;
    }
    return evalNode(t.node, t.file);
  };

  const evalNode = (node, file) => {
    switch (node.type) {
      case 'Number': case 'Bool': return node.value;
      case 'Null': return null;
      case 'Array': return node.items.map((it) => evalNode(it, file));
      case 'String': return evalString(node, file);
      default: throw new Error(`nút giá trị lạ: ${node.type}`);
    }
  };

  const evalString = (node, file) => {
    const parts = node.parts;
    if (parts.length === 0) return '';
    if (inProgress.has(node)) throw new Error('vòng tham chiếu');
    inProgress.add(node);
    try {
      const get = (ref) => {
        const t = resolveRef(merged, ref, file);
        if (!t) throw new Error(`tham chiếu không tồn tại: ${ref.path.join('.')}`);
        return evalTarget(t);
      };
      if (parts.length === 1 && parts[0].type === 'Ref') return get(parts[0]);
      let s = '';
      for (const p of parts) {
        if (p.type === 'Text') { s += p.value; continue; }
        const v = get(p);
        s += typeof v === 'string' ? v : JSON.stringify(v);
      }
      return s;
    } finally {
      inProgress.delete(node);
    }
  };

  return evalTarget(merged.root);
}
