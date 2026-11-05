// Mô hình hợp nhất dùng chung cho tầng 2 và tầng 3 (SPEC.md mục 6).
//
// Giá trị hợp nhất M:
//   { t: 'obj', entries: Map<khóa, { stmt, val: M }>, file, line, column }  (vị trí = Block khởi tạo)
//   { t: 'val', node: nút giá trị AST, file }

export const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export const setOwn = (o, k, v) =>
  Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

export const isPureRef = (node) => node.parts.length === 1 && node.parts[0].type === 'Ref';

export function buildModel(program) {
  const files = program.files;
  const consts = new Map();
  for (const f of Object.keys(files)) {
    const m = new Map();
    for (const st of files[f].body) if (st.type === 'Const' && !m.has(st.name)) m.set(st.name, st);
    consts.set(f, m);
  }

  const root = { t: 'obj', entries: new Map(), file: program.entry, line: 1, column: 1 };

  function merge(stmts, file, target, stack) {
    for (const st of stmts) {
      if (st.type === 'Assign') {
        target.entries.set(st.key, { stmt: st, file, val: { t: 'val', node: st.value, file } });
      } else if (st.type === 'Block') {
        const ex = target.entries.get(st.key);
        if (ex && ex.val.t === 'obj') {
          merge(st.body, file, ex.val, stack);
        } else {
          const obj = { t: 'obj', entries: new Map(), file, line: st.line, column: st.column };
          target.entries.set(st.key, { stmt: st, file, val: obj });
          merge(st.body, file, obj, stack);
        }
      } else if (st.type === 'Include') {
        if (hasOwn(files, st.path) && !stack.has(st.path)) {
          stack.add(st.path);
          merge(files[st.path].body, st.path, target, stack);
          stack.delete(st.path);
        }
      }
    }
  }
  if (hasOwn(files, program.entry)) merge(files[program.entry].body, program.entry, root, new Set([program.entry]));

  function descend(cur, segs) {
    for (const seg of segs) {
      if (cur.t === 'obj') {
        const e = cur.entries.get(seg);
        if (!e) return null;
        cur = e.val;
      } else if (cur.node.type === 'Array') {
        if (!INDEX_RE.test(seg)) return null;
        const idx = Number(seg);
        if (idx >= cur.node.items.length) return null;
        cur = { t: 'val', node: cur.node.items[idx], file: cur.file };
      } else {
        return null;
      }
    }
    return cur;
  }

  // Phân giải một Ref nằm trong tệp `file`; trả M hoặc null.
  function resolve(ref, file) {
    if (ref.const) {
      const c = consts.get(file)?.get(ref.path[0]);
      if (!c) return null;
      return descend({ t: 'val', node: c.value, file }, ref.path.slice(1));
    }
    return descend(root, ref.path);
  }

  const strMemo = new Map();
  const stringify = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

  function evalString(node, file) {
    if (node.parts.length === 0) return '';
    if (isPureRef(node)) {
      const target = resolve(node.parts[0], file);
      if (!target) throw new Error('Tham chiếu không phân giải được');
      return evalM(target);
    }
    if (strMemo.has(node)) return strMemo.get(node);
    let out = '';
    for (const part of node.parts) {
      if (part.type === 'Text') out += part.value;
      else {
        const target = resolve(part, file);
        if (!target) throw new Error('Tham chiếu không phân giải được');
        out += stringify(evalM(target));
      }
    }
    strMemo.set(node, out);
    return out;
  }

  function evalNode(node, file) {
    switch (node.type) {
      case 'Number':
      case 'Bool':
        return node.value;
      case 'Null':
        return null;
      case 'String':
        return evalString(node, file);
      case 'Array':
        return node.items.map((it) => evalNode(it, file));
      default:
        throw new Error(`Nút không hợp lệ: ${node.type}`);
    }
  }

  function evalM(M) {
    if (M.t === 'obj') {
      const out = {};
      for (const [k, e] of M.entries) setOwn(out, k, evalM(e.val));
      return out;
    }
    return evalNode(M.node, M.file);
  }

  return { root, consts, resolve, evalM, evalString };
}
