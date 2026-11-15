// Module NỘI BỘ (không xuất qua index.js): hợp nhất có vị trí + phân giải + đánh giá.
// Dùng chung cho evaluate (tầng 3) và check (tầng 2, pha B/C). Xem SPEC.md mục 6.
//
// API
// ---
// createMerged(program) → m   (program = đầu ra parseProject; không ném với chương trình hợp lệ ở pha A)
//   m.root          : MObj gốc, pos = { file: entry, line: 1, column: 1 }
//   m.constOf(file, name) → { node: <nút Value>, file, decl: <nút Const> } | null
//   m.resolve(ref, fileName) → Target | null
//        ref = Part kiểu Ref ({path, const}); fileName = tệp chứa chuỗi. null = không tồn tại.
//   m.evalTarget(target) → giá trị JSON mới (bản sao, đánh giá đệ quy). Ném Error code
//        'EVAL_CYCLE' nếu gặp vòng, 'EVAL_UNRESOLVED' nếu Ref không phân giải được.
//   m.evalString(stringNode, file) → giá trị JSON (theo 6.3)
//   m.stringsOf(target) → [{ node: nút String, file }]  mọi chuỗi trong đích (chỉ định nghĩa thắng)
//   m.isPureRef(stringNode) → boolean (đúng một Ref, không Text)
//
// Target (đích) là một trong:
//   MObj                       — đối tượng đã hợp nhất:
//        { entries: Map<khóa, { value: Target, def: { node, file, line, column } }>, pos: { file, line, column } }
//        Map giữ thứ tự xuất hiện lần đầu (6.2). def = Assign/Block THẮNG (cuối cùng), line/column = token khóa.
//        pos = vị trí Block đã khởi tạo đối tượng (6.2).
//   { node, file }             — nút giá trị AST (Number/Bool/Null/String/Array) và tệp chứa nó.
//        Phần tử mảng: { node: items[i], file }. node.line/column là vị trí nút giá trị.
// Hàm tiện ích xuất kèm: isObj(target).

export class MObj {
  constructor(pos) {
    this.entries = new Map();
    this.pos = pos;
  }
}

export const isObj = (t) => t instanceof MObj;

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

export function createMerged(program) {
  const files = program.files;
  const has = (name) => Object.hasOwn(files, name);
  const root = new MObj({ file: program.entry, line: 1, column: 1 });

  function mergeBody(body, file, obj, stack) {
    for (const st of body) {
      if (st.type === 'Assign') {
        obj.entries.set(st.key, {
          value: { node: st.value, file },
          def: { node: st, file, line: st.line, column: st.column },
        });
      } else if (st.type === 'Block') {
        const old = obj.entries.get(st.key);
        const def = { node: st, file, line: st.line, column: st.column };
        if (old && isObj(old.value)) {
          old.def = def;
          mergeBody(st.body, file, old.value, stack);
        } else {
          const child = new MObj({ file, line: st.line, column: st.column });
          obj.entries.set(st.key, { value: child, def });
          mergeBody(st.body, file, child, stack);
        }
      } else if (st.type === 'Include') {
        if (!has(st.path) || stack.has(st.path)) continue;
        stack.add(st.path);
        mergeBody(files[st.path].body, st.path, obj, stack);
        stack.delete(st.path);
      }
    }
  }
  if (has(program.entry)) {
    mergeBody(files[program.entry].body, program.entry, root, new Set([program.entry]));
  }

  const constCache = new Map();
  function constTable(file) {
    let t = constCache.get(file);
    if (!t) {
      t = new Map();
      if (has(file)) {
        for (const st of files[file].body) {
          if (st.type === 'Const' && !t.has(st.name)) t.set(st.name, st);
        }
      }
      constCache.set(file, t);
    }
    return t;
  }
  function constOf(file, name) {
    const c = constTable(file).get(name);
    return c ? { node: c.value, file, decl: c } : null;
  }

  function step(t, seg) {
    if (isObj(t)) {
      const e = t.entries.get(seg);
      return e ? e.value : null;
    }
    if (t.node.type === 'Array') {
      if (!INDEX_RE.test(seg)) return null;
      const i = Number(seg);
      return i < t.node.items.length ? { node: t.node.items[i], file: t.file } : null;
    }
    return null;
  }

  function resolve(ref, fileName) {
    let segs = ref.path;
    let cur;
    if (ref.const) {
      cur = constOf(fileName, segs[0]);
      segs = segs.slice(1);
    } else {
      cur = root;
    }
    if (!cur) return null;
    for (const s of segs) {
      cur = step(cur, s);
      if (!cur) return null;
    }
    return cur;
  }

  const isPureRef = (s) => s.parts.length === 1 && s.parts[0].type === 'Ref';

  const active = new Set();
  function evalString(node, file) {
    if (active.has(node)) {
      const e = new Error('vòng tham chiếu khi đánh giá');
      e.code = 'EVAL_CYCLE';
      throw e;
    }
    active.add(node);
    try {
      if (node.parts.length === 0) return '';
      if (isPureRef(node)) return evalRef(node.parts[0], file);
      let out = '';
      for (const p of node.parts) {
        if (p.type === 'Text') out += p.value;
        else {
          const v = evalRef(p, file);
          out += typeof v === 'string' ? v : JSON.stringify(v);
        }
      }
      return out;
    } finally {
      active.delete(node);
    }
  }

  function evalRef(ref, file) {
    const t = resolve(ref, file);
    if (!t) {
      const e = new Error(`tham chiếu không phân giải được: ${ref.path.join('.')}`);
      e.code = 'EVAL_UNRESOLVED';
      throw e;
    }
    return evalTarget(t);
  }

  function evalTarget(t) {
    if (isObj(t)) {
      const out = {};
      for (const [k, e] of t.entries) setOwn(out, k, evalTarget(e.value));
      return out;
    }
    const n = t.node;
    switch (n.type) {
      case 'String':
        return evalString(n, t.file);
      case 'Array':
        return n.items.map((it) => evalTarget({ node: it, file: t.file }));
      case 'Null':
        return null;
      default:
        return n.value;
    }
  }

  function stringsOf(t, out = []) {
    if (isObj(t)) {
      for (const e of t.entries.values()) stringsOf(e.value, out);
    } else if (t.node.type === 'String') {
      out.push({ node: t.node, file: t.file });
    } else if (t.node.type === 'Array') {
      for (const it of t.node.items) stringsOf({ node: it, file: t.file }, out);
    }
    return out;
  }

  return { root, constOf, resolve, evalTarget, evalString, stringsOf, isPureRef };
}
