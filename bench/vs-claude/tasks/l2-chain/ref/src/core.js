import { includesOf } from './parser.js';

const IDX = /^(0|[1-9][0-9]*)$/;

// Thứ tự duyệt tệp: tiền thứ tự theo include, mỗi tệp một lần
export function fileOrder(program) {
  const seen = new Set();
  const out = [];
  const visit = (name) => {
    if (seen.has(name) || !Object.hasOwn(program.files, name)) return;
    seen.add(name);
    out.push(name);
    for (const inc of includesOf(program.files[name].body)) visit(inc.path);
  };
  visit(program.entry);
  return out;
}

function stringsIn(node, out = []) {
  if (node.type === 'String') out.push(node);
  else if (node.type === 'Array') for (const it of node.items) stringsIn(it, out);
  return out;
}

export function buildModel(program) {
  const order = fileOrder(program);
  const consts = new Map();
  const markBody = (body, file) => {
    for (const s of body) {
      if (s.type === 'Const') consts.get(file).set(s.name, s.value);
      else if (s.type === 'Block') markBody(s.body, file);
    }
  };
  for (const f of order) { consts.set(f, new Map()); markBody(program.files[f].body, f); }

  const pos = (file, n) => ({ file, line: n.line, column: n.column });
  const root = { kind: 'object', pos: { file: program.entry, line: 1, column: 1 }, keyPos: null, map: new Map() };
  const merge = (file, body, obj, stack) => {
    for (const s of body) {
      if (s.type === 'Assign') {
        obj.map.set(s.key, { kind: 'node', node: s.value, file, keyPos: pos(file, s) });
      } else if (s.type === 'Block') {
        const ex = obj.map.get(s.key);
        let o = ex;
        if (!ex || ex.kind !== 'object') {
          o = { kind: 'object', pos: pos(file, s), keyPos: pos(file, s), map: new Map() };
          obj.map.set(s.key, o);
        }
        merge(file, s.body, o, stack);
      } else if (s.type === 'Include') {
        if (Object.hasOwn(program.files, s.path) && !stack.includes(s.path)) {
          merge(s.path, program.files[s.path].body, obj, [...stack, s.path]);
        }
      }
    }
  };
  merge(program.entry, program.files[program.entry].body, root, [program.entry]);

  const step = (cur, seg) => {
    if (!cur) return null;
    if (cur.kind === 'object') return cur.map.get(seg) ?? null;
    if (cur.node.type === 'Array' && IDX.test(seg)) {
      const it = cur.node.items[Number(seg)];
      return it ? { kind: 'node', node: it, file: cur.file, keyPos: pos(cur.file, it) } : null;
    }
    return null;
  };
  const resolve = (ref, file) => {
    if (ref.const) {
      const c = consts.get(file)?.get(ref.path[0]);
      if (!c) return null;
      let cur = { kind: 'node', node: c, file, keyPos: pos(file, c) };
      for (const seg of ref.path.slice(1)) cur = step(cur, seg);
      return cur;
    }
    let cur = root;
    for (const seg of ref.path) cur = step(cur, seg);
    return cur;
  };
  const stringsOfEntry = (e, out = []) => {
    if (!e) return out;
    if (e.kind === 'object') for (const v of e.map.values()) stringsOfEntry(v, out);
    else stringsIn(e.node, out);
    return out;
  };

  const UNRESOLVED = Symbol('unresolved');
  const evalNode = (node, file, stack) => {
    switch (node.type) {
      case 'Number': case 'Bool': return node.value;
      case 'Null': return null;
      case 'Array': return node.items.map((it) => evalNode(it, file, stack));
      default: break;
    }
    if (stack.has(node)) throw UNRESOLVED;
    stack.add(node);
    try {
      const evalRef = (r) => {
        const t = resolve(r, file);
        if (!t) throw UNRESOLVED;
        return evalEntry(t, stack);
      };
      const parts = node.parts;
      if (parts.length === 1 && parts[0].type === 'Ref') return evalRef(parts[0]);
      let s = '';
      for (const part of parts) {
        if (part.type === 'Text') { s += part.value; continue; }
        const v = evalRef(part);
        if (v !== null && typeof v === 'object') throw UNRESOLVED;
        s += typeof v === 'string' ? v : JSON.stringify(v);
      }
      return s;
    } finally {
      stack.delete(node);
    }
  };
  const evalEntry = (e, stack) => {
    if (e.kind === 'object') {
      const o = {};
      for (const [k, v] of e.map) Object.defineProperty(o, k, { value: evalEntry(v, stack), writable: true, enumerable: true, configurable: true });
      return o;
    }
    return evalNode(e.node, e.file, stack);
  };

  return { order, consts, root, resolve, stringsOfEntry, evalEntry, evalNode, UNRESOLVED, pos };
}
