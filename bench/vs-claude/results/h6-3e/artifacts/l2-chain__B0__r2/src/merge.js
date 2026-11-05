// Nội bộ: hợp nhất cấu hình và đánh giá có chú thích vị trí (dùng chung cho check và evaluate).
// Xem SPEC.md mục 6.

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

function setKey(obj, key, val) {
  Object.defineProperty(obj, key, { value: val, enumerable: true, writable: true, configurable: true });
}

export function cloneJson(x) {
  if (Array.isArray(x)) return x.map(cloneJson);
  if (x !== null && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x)) setKey(o, k, cloneJson(x[k]));
    return o;
  }
  return x;
}

// Cây hợp nhất: nút đối tượng { kind:'obj', map, pos } hoặc nút giá trị { kind:'node', node, file, keyPos }.
export function buildMerged(program) {
  const root = { kind: 'obj', map: new Map(), pos: { file: program.entry, line: 1, column: 1 } };
  const stack = [];
  const run = (stmts, file, obj) => {
    for (const s of stmts) {
      if (s.type === 'Assign') {
        obj.map.set(s.key, {
          kind: 'node', node: s.value, file, keyPos: { file, line: s.line, column: s.column },
        });
      } else if (s.type === 'Block') {
        const old = obj.map.get(s.key);
        let target;
        if (old && old.kind === 'obj') target = old;
        else {
          target = { kind: 'obj', map: new Map(), pos: { file, line: s.line, column: s.column } };
          target.keyPos = target.pos;
          obj.map.set(s.key, target);
        }
        run(s.body, file, target);
      } else if (s.type === 'Include') {
        const ast = Object.hasOwn(program.files, s.path) ? program.files[s.path] : null;
        if (ast && !stack.includes(s.path)) {
          stack.push(s.path);
          run(ast.body, s.path, obj);
          stack.pop();
        }
      }
    }
  };
  stack.push(program.entry);
  run(program.files[program.entry].body, program.entry, root);
  root.keyPos = root.pos;
  return root;
}

export function constNode(program, file, name) {
  const ast = program.files[file];
  if (!ast) return null;
  for (const s of ast.body) if (s.type === 'Const' && s.name === name) return s.value;
  return null;
}

// Phân giải Ref trong chuỗi thuộc `file`. Trả đích { kind:'obj'... } | { kind:'node', node, file } | null.
export function resolveRef(program, root, file, ref) {
  let cur;
  let segs = ref.path;
  if (ref.const) {
    const node = constNode(program, file, segs[0]);
    if (!node) return null;
    cur = { kind: 'node', node, file };
    segs = segs.slice(1);
  } else {
    cur = root;
  }
  for (const seg of segs) {
    if (cur.kind === 'obj') {
      const nx = cur.map.get(seg);
      if (!nx) return null;
      cur = nx;
    } else if (cur.node.type === 'Array') {
      if (!INDEX_RE.test(seg)) return null;
      const i = Number(seg);
      if (i >= cur.node.items.length) return null;
      cur = { kind: 'node', node: cur.node.items[i], file: cur.file };
    } else {
      return null;
    }
  }
  return cur;
}

const at = (file, n) => ({ file, line: n.line, column: n.column });

function overridePos(a, pos) {
  const out = { v: cloneJson(a.v), pos, keyPos: pos };
  if (a.kids instanceof Map) {
    out.kids = new Map();
    for (const [k, c] of a.kids) out.kids.set(k, overridePos(c, pos));
  } else if (a.kids) {
    out.kids = a.kids.map((c) => overridePos(c, pos));
  }
  return out;
}

const scalarToString = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

// Đánh giá cấu hình hợp nhất thành cây chú thích { v, pos, keyPos, kids }.
export function evaluateAnnotated(program) {
  const root = buildMerged(program);
  const strMemo = new Map();
  const objMemo = new Map();
  const running = new Set();

  const evalTarget = (t) => {
    if (t.kind === 'node') return evalNode(t.node, t.file);
    if (objMemo.has(t)) return objMemo.get(t);
    const v = {};
    const kids = new Map();
    for (const [k, e] of t.map) {
      const ca = evalTarget(e);
      const wrapped = { v: ca.v, pos: ca.pos, kids: ca.kids, keyPos: e.keyPos };
      kids.set(k, wrapped);
      setKey(v, k, ca.v);
    }
    const a = { v, pos: t.pos, keyPos: t.keyPos, kids };
    objMemo.set(t, a);
    return a;
  };

  const evalNode = (node, file) => {
    switch (node.type) {
      case 'Number':
      case 'Bool':
        return { v: node.value, pos: at(file, node) };
      case 'Null':
        return { v: null, pos: at(file, node) };
      case 'Array': {
        const kids = node.items.map((i) => evalNode(i, file));
        return { v: kids.map((k) => k.v), pos: at(file, node), kids };
      }
      default:
        return evalString(node, file);
    }
  };

  const evalString = (node, file) => {
    if (strMemo.has(node)) return strMemo.get(node);
    if (running.has(node)) throw new Error('Vòng tham chiếu khi đánh giá');
    running.add(node);
    const pos = at(file, node);
    let result;
    const parts = node.parts;
    if (parts.length === 0) result = { v: '', pos };
    else if (parts.length === 1 && parts[0].type === 'Ref') {
      const t = resolveRef(program, root, file, parts[0]);
      if (!t) throw new Error('Tham chiếu không tồn tại');
      result = overridePos(evalTarget(t), pos);
    } else {
      let s = '';
      for (const p of parts) {
        if (p.type === 'Text') s += p.value;
        else {
          const t = resolveRef(program, root, file, p);
          if (!t) throw new Error('Tham chiếu không tồn tại');
          s += scalarToString(evalTarget(t).v);
        }
      }
      result = { v: s, pos };
    }
    running.delete(node);
    strMemo.set(node, result);
    return result;
  };

  return evalTarget(root);
}
