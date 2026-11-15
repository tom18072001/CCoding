// Nội bộ: mô hình hợp nhất + phân giải tham chiếu, dùng chung cho check (tầng 2) và evaluate (tầng 3).
// Xem SPEC.md mục 6.

export function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

const INDEX = /^(0|[1-9][0-9]*)$/;

export function buildModel(program) {
  const { entry, files } = program;
  const consts = new Map();
  for (const [name, ast] of Object.entries(files)) {
    const m = new Map();
    for (const s of ast.body) if (s.type === 'Const' && !m.has(s.name)) m.set(s.name, s.value);
    consts.set(name, m);
  }
  const root = { keys: new Map(), pos: { file: entry, line: 1, column: 1 } };

  const run = (stmts, file, obj, depth) => {
    if (depth > 1000) return;
    for (const s of stmts) {
      const keyPos = { file, line: s.line, column: s.column };
      if (s.type === 'Assign') {
        obj.keys.set(s.key, { kind: 'val', node: s.value, file, keyPos });
      } else if (s.type === 'Block') {
        const ex = obj.keys.get(s.key);
        if (ex && ex.kind === 'obj') {
          run(s.body, file, ex.obj, depth);
        } else {
          const o = { keys: new Map(), pos: keyPos };
          obj.keys.set(s.key, { kind: 'obj', obj: o, keyPos });
          run(s.body, file, o, depth);
        }
      } else if (s.type === 'Include') {
        if (Object.hasOwn(files, s.path)) run(files[s.path].body, s.path, obj, depth + 1);
      }
    }
  };
  run(files[entry].body, entry, root, 0);
  return { program, root, consts };
}

// Đi tiếp qua các đoạn từ một đích (chỉ qua đối tượng/mảng; chuỗi và vô hướng thì không).
function walk(cur, segs) {
  for (const seg of segs) {
    if (!cur) return null;
    if (cur.kind === 'obj') {
      const e = cur.obj.keys.get(seg);
      if (!e) return null;
      cur = e.kind === 'obj' ? { kind: 'obj', obj: e.obj } : { kind: 'val', node: e.node, file: e.file };
    } else if (cur.node.type === 'Array') {
      if (!INDEX.test(seg)) return null;
      const idx = Number(seg);
      if (idx >= cur.node.items.length) return null;
      cur = { kind: 'val', node: cur.node.items[idx], file: cur.file };
    } else return null;
  }
  return cur;
}

// Trả về đích: {kind:'obj', obj} | {kind:'val', node, file} | null
export function resolveRef(model, file, ref) {
  if (ref.const) {
    const c = model.consts.get(file);
    const node = c && c.get(ref.path[0]);
    if (!node) return null;
    return walk({ kind: 'val', node, file }, ref.path.slice(1));
  }
  return walk({ kind: 'obj', obj: model.root }, ref.path);
}

// Giá trị có vị trí: {kind:'s'|'a'|'o', value?, items?, children?, pos}
const posOf = (file, n) => ({ file, line: n.line, column: n.column });

function relocate(lv, pos) {
  if (lv.kind === 's') return { kind: 's', value: lv.value, pos };
  if (lv.kind === 'a') return { kind: 'a', items: lv.items.map((x) => relocate(x, pos)), pos };
  const children = new Map();
  for (const [k, c] of lv.children) children.set(k, { lv: relocate(c.lv, pos), keyPos: pos });
  return { kind: 'o', children, pos };
}

function scalarText(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return JSON.stringify(v);
  if (v === null) return 'null';
  if (typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

export function evalTarget(model, t, depth = 0) {
  if (depth > 2000) return { kind: 's', value: null, pos: model.root.pos };
  if (t.kind === 'obj') {
    const children = new Map();
    for (const [k, e] of t.obj.keys) {
      const lv = e.kind === 'obj'
        ? evalTarget(model, { kind: 'obj', obj: e.obj }, depth + 1)
        : evalNode(model, e.node, e.file, depth + 1);
      children.set(k, { lv, keyPos: e.keyPos });
    }
    return { kind: 'o', children, pos: t.obj.pos };
  }
  return evalNode(model, t.node, t.file, depth + 1);
}

export function evalNode(model, node, file, depth = 0) {
  const pos = posOf(file, node);
  switch (node.type) {
    case 'Number': case 'Bool': return { kind: 's', value: node.value, pos };
    case 'Null': return { kind: 's', value: null, pos };
    case 'Array': return { kind: 'a', items: node.items.map((x) => evalNode(model, x, file, depth + 1)), pos };
    case 'String': {
      if (node.parts.length === 0) return { kind: 's', value: '', pos };
      if (node.parts.length === 1 && node.parts[0].type === 'Ref') {
        const t = resolveRef(model, file, node.parts[0]);
        if (!t) return { kind: 's', value: null, pos };
        return relocate(evalTarget(model, t, depth + 1), pos);
      }
      let out = '';
      for (const p of node.parts) {
        if (p.type === 'Text') out += p.value;
        else {
          const t = resolveRef(model, file, p);
          out += t ? scalarText(toJson(evalTarget(model, t, depth + 1))) : '';
        }
      }
      return { kind: 's', value: out, pos };
    }
    default: return { kind: 's', value: null, pos };
  }
}

export function toJson(lv) {
  if (lv.kind === 's') return lv.value;
  if (lv.kind === 'a') return lv.items.map(toJson);
  const o = {};
  for (const [k, c] of lv.children) setOwn(o, k, toJson(c.lv));
  return o;
}
