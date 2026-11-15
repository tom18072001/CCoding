// Lõi hợp nhất nội bộ dùng chung cho check (tầng 2) và evaluate (tầng 3). SPEC.md mục 6.1–6.3.
//
// Cây hợp nhất gồm hai loại nút:
//   ObjNode : { kind: 'object', entries: Map<khóa, Entry>, loc: {file,line,column} }
//             loc là vị trí Block đã khởi tạo đối tượng (gốc: tệp entry, 1:1).
//   Entry   : { key, stmt, file, value }
//             stmt = Assign/Block thắng của khóa, file = tệp chứa stmt, value = Target.
//   Target  : ObjNode | { kind: 'value', node, file }
//             node là nút giá trị AST (Number/String/Array/...), file là tệp chứa nó.
// Map giữ thứ tự chèn đầu tiên; ghi đè khóa đã có không đổi vị trí.

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

export function mergeProgram(program) {
  const root = newObject({ file: program.entry, line: 1, column: 1 });
  const consts = new Map(); // tệp -> Map<tên, nút giá trị>
  const constsOf = (file) => {
    let m = consts.get(file);
    if (!m) {
      m = new Map();
      const ast = program.files[file];
      if (ast) {
        for (const s of ast.body) {
          if (s.type === 'Const' && !m.has(s.name)) m.set(s.name, s.value);
        }
      }
      consts.set(file, m);
    }
    return m;
  };

  const stack = [];
  const processBody = (obj, body, file) => {
    for (const s of body) {
      if (s.type === 'Assign') {
        setEntry(obj, s.key, s, file, { kind: 'value', node: s.value, file });
      } else if (s.type === 'Block') {
        const old = obj.entries.get(s.key);
        let child;
        if (old && old.value.kind === 'object') {
          child = old.value;
          old.stmt = s;
          old.file = file;
        } else {
          child = newObject({ file, line: s.line, column: s.column });
          setEntry(obj, s.key, s, file, child);
        }
        processBody(child, s.body, file);
      } else if (s.type === 'Include') {
        const inc = hasOwn(program.files, s.path) ? program.files[s.path] : null;
        if (inc && !stack.includes(s.path)) {
          stack.push(s.path);
          processBody(obj, inc.body, s.path);
          stack.pop();
        }
      }
      // Const: không vào kết quả
    }
  };
  stack.push(program.entry);
  const entryAst = program.files[program.entry];
  if (entryAst) processBody(root, entryAst.body, program.entry);
  stack.pop();

  return { root, program, constsOf };
}

function hasOwn(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function newObject(loc) {
  return { kind: 'object', entries: new Map(), loc };
}

function setEntry(obj, key, stmt, file, value) {
  const old = obj.entries.get(key);
  if (old) {
    old.stmt = stmt;
    old.file = file;
    old.value = value;
  } else {
    obj.entries.set(key, { key, stmt, file, value });
  }
}

// Phân giải Ref (nút Part kiểu 'Ref') nằm trong chuỗi của tệp `file`. Trả Target hoặc null.
export function resolveRef(merged, ref, file) {
  const path = ref.path;
  let cur;
  let i = 0;
  if (ref.const) {
    const node = merged.constsOf(file).get(path[0]);
    if (node === undefined) return null;
    cur = { kind: 'value', node, file };
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
      if (!INDEX_RE.test(seg)) return null;
      const idx = Number(seg);
      if (idx >= cur.node.items.length) return null;
      cur = { kind: 'value', node: cur.node.items[idx], file: cur.file };
    } else {
      return null;
    }
  }
  return cur;
}

// S(đích): mọi nút String (kèm tệp) nằm trong đích; đối tượng chỉ tính định nghĩa thắng.
export function stringsOf(target, out = []) {
  if (target.kind === 'object') {
    for (const e of target.entries.values()) stringsOf(e.value, out);
  } else {
    collectValueStrings(target.node, target.file, out);
  }
  return out;
}

function collectValueStrings(node, file, out) {
  if (node.type === 'String') out.push({ node, file });
  else if (node.type === 'Array') for (const it of node.items) collectValueStrings(it, file, out);
}

function setProp(o, k, v) {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

// Đánh giá một Target thành JSON thuần mới (không chia sẻ tham chiếu).
export function evaluateTarget(merged, target, active = new Set()) {
  if (target.kind === 'object') {
    const out = {};
    for (const e of target.entries.values()) setProp(out, e.key, evaluateTarget(merged, e.value, active));
    return out;
  }
  return evaluateValue(merged, target.node, target.file, active);
}

export function evaluateValue(merged, node, file, active = new Set()) {
  switch (node.type) {
    case 'Number':
    case 'Bool':
      return node.value;
    case 'Null':
      return null;
    case 'Array':
      return node.items.map((it) => evaluateValue(merged, it, file, active));
    case 'String':
      return evaluateString(merged, node, file, active);
    default:
      throw new Error(`Nút giá trị không hợp lệ: ${node.type}`);
  }
}

function evaluateString(merged, node, file, active) {
  const parts = node.parts;
  if (parts.length === 0) return '';
  if (active.has(node)) throw new Error('Vòng tham chiếu khi đánh giá chuỗi');
  active.add(node);
  try {
    const resolve = (p) => {
      const t = resolveRef(merged, p, file);
      if (!t) throw new Error(`Tham chiếu không phân giải được: ${p.path.join('.')}`);
      return t;
    };
    if (parts.length === 1 && parts[0].type === 'Ref') {
      return evaluateTarget(merged, resolve(parts[0]), active);
    }
    let s = '';
    for (const p of parts) {
      if (p.type === 'Text') {
        s += p.value;
        continue;
      }
      const v = evaluateTarget(merged, resolve(p), active);
      if (typeof v === 'string') s += v;
      else if (typeof v === 'number') s += JSON.stringify(v);
      else if (v === null || typeof v === 'boolean') s += String(v);
      else throw new Error('Nội suy giá trị mảng/đối tượng vào chuỗi nối');
    }
    return s;
  } finally {
    active.delete(node);
  }
}
