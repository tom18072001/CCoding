// Mô hình hợp nhất dùng chung cho tầng 2 và tầng 3 (SPEC.md mục 6).

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function setKey(o, k, v) {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

export const isPureRef = (node) => node.parts.length === 1 && node.parts[0].type === 'Ref';

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

export function buildModel(program) {
  const files = program.files;
  const root = { t: 'obj', map: new Map(), file: program.entry, stmt: null };
  const stack = new Set();
  const constCache = new Map();

  function run(body, file, obj) {
    for (const st of body) {
      if (st.type === 'Assign') {
        obj.map.set(st.key, { t: 'val', node: st.value, file, stmt: st });
      } else if (st.type === 'Block') {
        const ex = obj.map.get(st.key);
        if (ex && ex.t === 'obj') run(st.body, file, ex);
        else {
          const o = { t: 'obj', map: new Map(), file, stmt: st };
          obj.map.set(st.key, o);
          run(st.body, file, o);
        }
      } else if (st.type === 'Include') {
        if (has(files, st.path) && !stack.has(st.path)) {
          stack.add(st.path);
          run(files[st.path].body, st.path, obj);
          stack.delete(st.path);
        }
      }
    }
  }
  stack.add(program.entry);
  if (has(files, program.entry)) run(files[program.entry].body, program.entry, root);

  function constsOf(file) {
    let m = constCache.get(file);
    if (!m) {
      m = new Map();
      if (has(files, file)) for (const s of files[file].body) if (s.type === 'Const') m.set(s.name, s);
      constCache.set(file, m);
    }
    return m;
  }

  function step(cur, seg) {
    if (cur.t === 'obj') return cur.map.get(seg) ?? null;
    const n = cur.node;
    if (n.type === 'Array' && INDEX_RE.test(seg)) {
      const i = Number(seg);
      if (i < n.items.length) return { t: 'val', node: n.items[i], file: cur.file, stmt: null };
    }
    return null;
  }

  function resolveRef(file, ref) {
    let cur;
    let segs = ref.path;
    if (ref.const) {
      const c = constsOf(file).get(segs[0]);
      if (!c) return null;
      cur = { t: 'val', node: c.value, file, stmt: c };
      segs = segs.slice(1);
    } else cur = root;
    for (const s of segs) {
      cur = step(cur, s);
      if (!cur) return null;
    }
    return cur;
  }

  const posOf = (file, n) => ({ file, line: n.line, column: n.column });

  // Cây đã đánh giá có vị trí. `ov` là vị trí ghi đè (giá trị đến từ chuỗi thuần tham chiếu).
  function evalEntry(e, ov = null) {
    if (e.t === 'obj') {
      const pos = ov ?? (e.stmt ? posOf(e.file, e.stmt) : posOf(e.file, { line: 1, column: 1 }));
      const children = [];
      for (const [key, c] of e.map) {
        children.push({ key, keyPos: ov ?? posOf(c.file, c.stmt), node: evalEntry(c, ov) });
      }
      return { kind: 'obj', pos, children };
    }
    const n = e.node;
    const pos = ov ?? posOf(e.file, n);
    switch (n.type) {
      case 'Number':
      case 'Bool':
        return { kind: 'scalar', value: n.value, pos };
      case 'Null':
        return { kind: 'scalar', value: null, pos };
      case 'Array':
        return {
          kind: 'arr',
          pos,
          items: n.items.map((it) => evalEntry({ t: 'val', node: it, file: e.file, stmt: null }, ov)),
        };
      default: {
        if (n.parts.length === 0) return { kind: 'scalar', value: '', pos };
        if (isPureRef(n)) {
          const tgt = resolveRef(e.file, n.parts[0]);
          if (!tgt) return { kind: 'scalar', value: null, pos };
          return evalEntry(tgt, pos);
        }
        let s = '';
        for (const part of n.parts) {
          if (part.type === 'Text') s += part.value;
          else {
            const tgt = resolveRef(e.file, part);
            if (!tgt) s += 'null';
            else {
              const t = evalEntry(tgt, pos);
              s += t.kind === 'scalar' && typeof t.value === 'string' ? t.value : JSON.stringify(toJSON(t));
            }
          }
        }
        return { kind: 'scalar', value: s, pos };
      }
    }
  }

  return { root, resolveRef, constsOf, evalEntry };
}

export function toJSON(t) {
  if (t.kind === 'scalar') return t.value;
  if (t.kind === 'arr') return t.items.map(toJSON);
  const o = {};
  for (const c of t.children) setKey(o, c.key, toJSON(c.node));
  return o;
}
