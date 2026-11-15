// Mô hình hợp nhất dùng chung cho tầng 2 và 3 (SPEC.md mục 6).
// Obj: { kind:'obj', keys: Map<string, Slot>, origin }  Slot: { value: Obj|Val, kpos }
// Val: { kind:'val', node, file }  — nút giá trị AST cùng tệp định nghĩa.

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

export function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

export function buildModel(program) {
  const files = program.files;
  const consts = new Map(); // file -> Map(name -> Const stmt)
  for (const f of Object.keys(files)) {
    const m = new Map();
    for (const st of files[f].body) if (st.type === 'Const' && !m.has(st.name)) m.set(st.name, st);
    consts.set(f, m);
  }
  const root = { kind: 'obj', keys: new Map(), origin: { file: program.entry, line: 1, column: 1 } };
  const run = (stmts, file, obj, stack) => {
    for (const st of stmts) {
      if (st.type === 'Assign') {
        obj.keys.set(st.key, {
          value: { kind: 'val', node: st.value, file },
          kpos: { file, line: st.line, column: st.column },
        });
      } else if (st.type === 'Block') {
        const slot = obj.keys.get(st.key);
        if (slot && slot.value.kind === 'obj') run(st.body, file, slot.value, stack);
        else {
          const pos = { file, line: st.line, column: st.column };
          const o = { kind: 'obj', keys: new Map(), origin: pos };
          obj.keys.set(st.key, { value: o, kpos: pos });
          run(st.body, file, o, stack);
        }
      } else if (st.type === 'Include') {
        if (Object.hasOwn(files, st.path) && !stack.includes(st.path)) {
          run(files[st.path].body, st.path, obj, [...stack, st.path]);
        }
      }
    }
  };
  if (Object.hasOwn(files, program.entry)) run(files[program.entry].body, program.entry, root, [program.entry]);
  return { program, root, consts };
}

// Thứ tự tệp tiền thứ tự theo include (mỗi tệp một lần).
export function fileOrder(program) {
  const order = [];
  const seen = new Set();
  const walk = (stmts, out) => {
    for (const s of stmts) {
      if (s.type === 'Include') out.push(s.path);
      else if (s.type === 'Block') walk(s.body, out);
    }
  };
  const visit = (f) => {
    seen.add(f);
    order.push(f);
    const incs = [];
    walk(program.files[f].body, incs);
    for (const p of incs) if (Object.hasOwn(program.files, p) && !seen.has(p)) visit(p);
  };
  if (Object.hasOwn(program.files, program.entry)) visit(program.entry);
  return order;
}

function step(cur, seg) {
  if (cur.kind === 'obj') {
    const slot = cur.keys.get(seg);
    return slot ? slot.value : undefined;
  }
  if (cur.node.type === 'Array' && INDEX_RE.test(seg)) {
    const i = Number(seg);
    if (i < cur.node.items.length) return { kind: 'val', node: cur.node.items[i], file: cur.file };
  }
  return undefined;
}

// Phân giải một Ref trong chuỗi thuộc `file`; trả đích (Obj|Val) hoặc undefined.
export function resolveRef(model, file, ref) {
  let cur;
  let segs = ref.path;
  if (ref.const) {
    const c = model.consts.get(file)?.get(ref.path[0]);
    if (!c) return undefined;
    cur = { kind: 'val', node: c.value, file };
    segs = ref.path.slice(1);
  } else cur = model.root;
  for (const seg of segs) {
    cur = step(cur, seg);
    if (cur === undefined) return undefined;
  }
  return cur;
}

const isRef = (p) => p.type === 'Ref';
export const isPureRef = (node) => node.parts.length === 1 && isRef(node.parts[0]);

export function evalTarget(model, t) {
  if (t.kind === 'obj') {
    const out = {};
    for (const [k, slot] of t.keys) setOwn(out, k, evalTarget(model, slot.value));
    return out;
  }
  const node = t.node;
  switch (node.type) {
    case 'Number':
    case 'Bool':
      return node.value;
    case 'Null':
      return null;
    case 'Array':
      return node.items.map((it) => evalTarget(model, { kind: 'val', node: it, file: t.file }));
    case 'String': {
      if (node.parts.length === 0) return '';
      if (isPureRef(node)) return evalTarget(model, resolveRef(model, t.file, node.parts[0]));
      let s = '';
      for (const part of node.parts) {
        if (part.type === 'Text') { s += part.value; continue; }
        const v = evalTarget(model, resolveRef(model, t.file, part));
        s += typeof v === 'string' ? v : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(JSON.stringify(v));
      }
      return s;
    }
    default:
      return null;
  }
}
