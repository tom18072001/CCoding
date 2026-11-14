// Mô hình hợp nhất và phân giải tham chiếu, dùng chung cho tầng 2 và 3.
//
// Giá trị hợp nhất (MV):
//   { t: 'obj', map: Map<khóa, MV>, file, line, column }   — vị trí là Block khởi tạo
//   { t: 'val', node, file, kp: {file,line,column} }        — nút giá trị AST của Assign thắng
// Mỗi MV có `kp`: vị trí token khóa của câu lệnh thắng.
// Đích (target) của một Ref: { mv } (đối tượng hợp nhất) hoặc { node, file } (nút giá trị AST).

export function setOwn(o, k, v) {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

export function buildContext(program) {
  const root = { t: 'obj', map: new Map(), file: program.entry, line: 1, column: 1 };
  root.kp = { file: program.entry, line: 1, column: 1 };
  const consts = new Map();
  for (const [name, ast] of Object.entries(program.files)) {
    const m = new Map();
    for (const s of ast.body) if (s.type === 'Const') m.set(s.name, s);
    consts.set(name, m);
  }
  const active = new Set();
  const mergeInto = (obj, stmts, file) => {
    for (const s of stmts) {
      if (s.type === 'Assign') {
        obj.map.set(s.key, { t: 'val', node: s.value, file, kp: { file, line: s.line, column: s.column } });
      } else if (s.type === 'Block') {
        const ex = obj.map.get(s.key);
        if (ex && ex.t === 'obj') {
          mergeInto(ex, s.body, file);
        } else {
          const o = { t: 'obj', map: new Map(), file, line: s.line, column: s.column };
          o.kp = { file, line: s.line, column: s.column };
          obj.map.set(s.key, o);
          mergeInto(o, s.body, file);
        }
      } else if (s.type === 'Include') {
        const f = Object.hasOwn(program.files, s.path) ? program.files[s.path] : null;
        if (f && !active.has(s.path)) {
          active.add(s.path);
          mergeInto(obj, f.body, s.path);
          active.delete(s.path);
        }
      }
    }
  };
  active.add(program.entry);
  mergeInto(root, program.files[program.entry].body, program.entry);
  return { program, root, consts };
}

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

function descend(cur, seg) {
  if (cur.mv) {
    const e = cur.mv.map.get(seg);
    if (!e) return undefined;
    return e.t === 'obj' ? { mv: e } : { node: e.node, file: e.file };
  }
  if (cur.node.type === 'Array' && INDEX_RE.test(seg) && Number(seg) < cur.node.items.length) {
    return { node: cur.node.items[Number(seg)], file: cur.file };
  }
  return undefined;
}

export function resolveRef(ctx, ref, file) {
  let cur;
  let rest = ref.path;
  if (ref.const) {
    const c = ctx.consts.get(file)?.get(ref.path[0]);
    if (!c) return undefined;
    cur = { node: c.value, file };
    rest = ref.path.slice(1);
  } else {
    cur = { mv: ctx.root };
  }
  for (const seg of rest) {
    cur = descend(cur, seg);
    if (!cur) return undefined;
  }
  return cur;
}

export const isPureRef = (node) => node.parts.length === 1 && node.parts[0].type === 'Ref';

function toStr(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return JSON.stringify(v);
  if (v === null) return 'null';
  if (typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

export function evalString(ctx, node, file) {
  if (node.parts.length === 0) return '';
  if (isPureRef(node)) {
    const t = resolveRef(ctx, node.parts[0], file);
    return t === undefined ? null : evalTarget(ctx, t);
  }
  let out = '';
  for (const part of node.parts) {
    if (part.type === 'Text') out += part.value;
    else {
      const t = resolveRef(ctx, part, file);
      out += t === undefined ? '' : toStr(evalTarget(ctx, t));
    }
  }
  return out;
}

export function evalNode(ctx, node, file) {
  switch (node.type) {
    case 'Number':
    case 'Bool':
      return node.value;
    case 'Null':
      return null;
    case 'Array':
      return node.items.map((it) => evalNode(ctx, it, file));
    case 'String':
      return evalString(ctx, node, file);
    default:
      return null;
  }
}

export function evalMv(ctx, mv) {
  const out = {};
  for (const [k, e] of mv.map) {
    setOwn(out, k, e.t === 'obj' ? evalMv(ctx, e) : evalNode(ctx, e.node, e.file));
  }
  return out;
}

export function evalTarget(ctx, t) {
  return t.mv ? evalMv(ctx, t.mv) : evalNode(ctx, t.node, t.file);
}
