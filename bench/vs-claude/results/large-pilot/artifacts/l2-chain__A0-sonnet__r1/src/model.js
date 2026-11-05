// Mô hình hợp nhất + phân giải + đánh giá, dùng chung cho tầng 2 và 3 (SPEC.md mục 6).
//
// Giá trị trong cây hợp nhất:
//   { k: 'obj', map: Map<khóa, { v, kpos }>, pos }   — đối tượng đã hợp nhất
//   { k: 'node', node, file }                         — nút giá trị AST (số, chuỗi, mảng…)

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

const setOwn = (o, k, v) =>
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });

export function createModel(program) {
  const root = { k: 'obj', map: new Map(), pos: { file: program.entry, line: 1, column: 1 } };

  const consts = new Map(); // tệp -> Map<tên, Const>
  for (const [file, ast] of Object.entries(program.files)) {
    const m = new Map();
    for (const st of ast.body) if (st.type === 'Const' && !m.has(st.name)) m.set(st.name, st);
    consts.set(file, m);
  }

  const mergeBody = (obj, body, file, stack) => {
    for (const st of body) {
      const pos = { file, line: st.line, column: st.column };
      if (st.type === 'Assign') {
        obj.map.set(st.key, { v: { k: 'node', node: st.value, file }, kpos: pos });
      } else if (st.type === 'Block') {
        const ex = obj.map.get(st.key);
        if (ex && ex.v.k === 'obj') {
          ex.kpos = pos;
          mergeBody(ex.v, st.body, file, stack);
        } else {
          const o = { k: 'obj', map: new Map(), pos };
          obj.map.set(st.key, { v: o, kpos: pos });
          mergeBody(o, st.body, file, stack);
        }
      } else if (st.type === 'Include') {
        const target = Object.hasOwn(program.files, st.path) ? program.files[st.path] : null;
        if (target && !stack.includes(st.path)) {
          mergeBody(obj, target.body, st.path, [...stack, st.path]);
        }
      }
    }
  };
  mergeBody(root, program.files[program.entry].body, program.entry, [program.entry]);

  const walk = (start, segs) => {
    let cur = start;
    for (const seg of segs) {
      if (cur.k === 'obj') {
        const e = cur.map.get(seg);
        if (!e) return null;
        cur = e.v;
      } else if (cur.node.type === 'Array') {
        if (!INDEX_RE.test(seg)) return null;
        const idx = Number(seg);
        if (idx >= cur.node.items.length) return null;
        cur = { k: 'node', node: cur.node.items[idx], file: cur.file };
      } else {
        return null;
      }
    }
    return cur;
  };

  // phân giải một Ref nằm trong chuỗi của tệp `file`; null nếu không tồn tại
  const resolveRef = (ref, file) => {
    if (ref.const) {
      const c = consts.get(file)?.get(ref.path[0]);
      if (!c) return null;
      return walk({ k: 'node', node: c.value, file }, ref.path.slice(1));
    }
    return walk(root, ref.path);
  };

  const toStr = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

  const memo = new Map();
  const evalString = (node, file) => {
    const parts = node.parts;
    if (parts.length === 0) return '';
    if (parts.length === 1 && parts[0].type === 'Ref') {
      const t = resolveRef(parts[0], file);
      return t ? evalValue(t) : null;
    }
    if (memo.has(node)) return memo.get(node);
    let out = '';
    for (const p of parts) {
      if (p.type === 'Text') out += p.value;
      else {
        const t = resolveRef(p, file);
        out += t ? toStr(evalValue(t)) : '';
      }
    }
    memo.set(node, out);
    return out;
  };

  const evalValue = (v) => {
    if (v.k === 'obj') {
      const out = {};
      for (const [key, e] of v.map) setOwn(out, key, evalValue(e.v));
      return out;
    }
    const { node, file } = v;
    switch (node.type) {
      case 'Number':
      case 'Bool':
        return node.value;
      case 'Null':
        return null;
      case 'String':
        return evalString(node, file);
      case 'Array':
        return node.items.map((it) => evalValue({ k: 'node', node: it, file }));
      default:
        return null;
    }
  };

  return { root, consts, resolveRef, evalValue, evalString };
}
