// Module NỘI BỘ của tầng 3 (không xuất qua index.js). Xem SPEC.md mục 6.
//
// INTERFACE xuất ra (dùng bởi evaluate.js và check.js):
//   buildModel(program) -> model = { root, consts, files }
//     root   : MObj gốc. MObj = { kind:'obj', entries: Map<khóa, Entry>, pos:{file,line,column} }
//              - entries giữ thứ tự xuất hiện lần đầu (ghi đè không đổi vị trí khóa).
//              - pos = vị trí Block đã KHỞI TẠO đối tượng (mục 6.2); gốc = {file: entry, 1, 1}.
//     Entry  : { target, keyPos } — keyPos = {file,line,column} của token khóa của
//              Assign/Block thắng (định nghĩa cuối cùng đặt/trộn khóa đó).
//     Target : { kind:'obj', obj: MObj } | { kind:'node', node: AST value, file: tệp chứa nút }
//     consts : Map<tênTệp, Map<tênHằng, Target>> — hằng cấp cao nhất theo từng tệp (tệp tới được).
//     files  : program.files
//   constsOf(model, file) -> Map<tên, Target> (rỗng nếu không có)
//   resolveRef(model, ref, file) -> Target | undefined
//     ref = nút Ref; file = tệp chứa chuỗi. Chỉ khóa riêng; mảng cần chỉ số hợp lệ trong phạm vi;
//     không đi xuyên chuỗi/vô hướng. Ref hằng tra hằng của `file`.
//   evaluateTarget(model, target) -> JSON thuần mới (không chia sẻ tham chiếu).
//   evaluateString(model, node, file) -> giá trị của nút String (mục 6.3).
// Hàm đệ quy gặp vòng tham chiếu hoặc Ref không phân giải được thì ném Error.

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

export function buildModel(program) {
  const files = program.files;
  const consts = new Map();
  const root = { kind: 'obj', entries: new Map(), pos: { file: program.entry, line: 1, column: 1 } };
  const model = { root, consts, files };
  const stack = new Set();

  function processBody(file, body, obj, top) {
    if (top && !consts.has(file)) consts.set(file, new Map());
    for (const st of body) {
      switch (st.type) {
        case 'Assign':
          obj.entries.set(st.key, {
            target: { kind: 'node', node: st.value, file },
            keyPos: { file, line: st.line, column: st.column },
          });
          break;
        case 'Block': {
          const old = obj.entries.get(st.key);
          const child = old && old.target.kind === 'obj'
            ? old.target.obj
            : { kind: 'obj', entries: new Map(), pos: { file, line: st.line, column: st.column } };
          obj.entries.set(st.key, {
            target: { kind: 'obj', obj: child },
            keyPos: { file, line: st.line, column: st.column },
          });
          processBody(file, st.body, child, false);
          break;
        }
        case 'Include': {
          const f = st.path;
          if (!Object.hasOwn(files, f) || stack.has(f)) break;
          stack.add(f);
          processBody(f, files[f].body, obj, true);
          stack.delete(f);
          break;
        }
        case 'Const':
          if (top) consts.get(file).set(st.name, { kind: 'node', node: st.value, file });
          break;
      }
    }
  }

  stack.add(program.entry);
  processBody(program.entry, files[program.entry].body, root, true);
  return model;
}

export function constsOf(model, file) {
  return model.consts.get(file) ?? new Map();
}

function step(target, seg) {
  if (target.kind === 'obj') return target.obj.entries.get(seg)?.target;
  const n = target.node;
  if (n.type === 'Array') {
    if (!INDEX_RE.test(seg)) return undefined;
    const i = Number(seg);
    if (i >= n.items.length) return undefined;
    return { kind: 'node', node: n.items[i], file: target.file };
  }
  return undefined;
}

export function resolveRef(model, ref, file) {
  let cur;
  let rest;
  if (ref.const) {
    cur = constsOf(model, file).get(ref.path[0]);
    rest = ref.path.slice(1);
  } else {
    cur = { kind: 'obj', obj: model.root };
    rest = ref.path;
  }
  for (const seg of rest) {
    if (cur === undefined) return undefined;
    cur = step(cur, seg);
  }
  return cur;
}

function scalarToText(v) {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

function evalTarget(model, target, active) {
  if (target.kind === 'obj') {
    const out = {};
    for (const [k, e] of target.obj.entries) setOwn(out, k, evalTarget(model, e.target, active));
    return out;
  }
  const n = target.node;
  switch (n.type) {
    case 'Number':
    case 'Bool':
      return n.value;
    case 'Null':
      return null;
    case 'Array':
      return n.items.map((it) => evalTarget(model, { kind: 'node', node: it, file: target.file }, active));
    case 'String':
      return evalString(model, n, target.file, active);
    default:
      throw new Error(`nút giá trị không hợp lệ: ${n.type}`);
  }
}

function evalString(model, node, file, active) {
  if (node.parts.length === 0) return '';
  if (active.has(node)) throw new Error('vòng tham chiếu');
  active.add(node);
  try {
    const val = (ref) => {
      const t = resolveRef(model, ref, file);
      if (!t) throw new Error(`tham chiếu không phân giải được: ${ref.path.join('.')}`);
      return evalTarget(model, t, active);
    };
    if (node.parts.length === 1 && node.parts[0].type === 'Ref') return val(node.parts[0]);
    let s = '';
    for (const p of node.parts) s += p.type === 'Text' ? p.value : scalarToText(val(p));
    return s;
  } finally {
    active.delete(node);
  }
}

export function evaluateTarget(model, target) {
  return evalTarget(model, target, new Set());
}

export function evaluateString(model, node, file) {
  return evalString(model, node, file, new Set());
}
