// Mô hình hợp nhất dùng chung cho tầng 2 (pha B, C) và tầng 3. Xem SPEC.md mục 6.
//
// Đích (target) là một trong:
//   { kind: 'obj', keys: Map<string, target>, pos, keyPos }  — đối tượng đã hợp nhất
//   { kind: 'val', node, file, keyPos? }                     — nút giá trị AST trong tệp `file`

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

export function isPureRef(node) {
  return node.type === 'String' && node.parts.length === 1 && node.parts[0].type === 'Ref';
}

export function buildModel(program) {
  const { files } = program;
  const consts = new Map();
  for (const [name, ast] of Object.entries(files)) {
    const m = new Map();
    for (const s of ast.body) {
      if (s.type === 'Const' && !m.has(s.name)) m.set(s.name, s.value);
    }
    consts.set(name, m);
  }

  const root = { kind: 'obj', keys: new Map(), pos: { file: program.entry, line: 1, column: 1 }, keyPos: null };
  const stack = [];
  const run = (fileName, obj) => {
    const ast = files[fileName];
    if (!ast || stack.includes(fileName)) return;
    stack.push(fileName);
    apply(ast.body, fileName, obj);
    stack.pop();
  };
  const apply = (body, fileName, obj) => {
    for (const s of body) {
      const pos = { file: fileName, line: s.line, column: s.column };
      if (s.type === 'Assign') {
        obj.keys.set(s.key, { kind: 'val', node: s.value, file: fileName, keyPos: pos });
      } else if (s.type === 'Block') {
        let o = obj.keys.get(s.key);
        if (!o || o.kind !== 'obj') {
          o = { kind: 'obj', keys: new Map(), pos, keyPos: pos };
          obj.keys.set(s.key, o);
        }
        apply(s.body, fileName, o);
      } else if (s.type === 'Include') {
        run(s.path, obj);
      }
    }
  };
  run(program.entry, root);

  const step = (cur, seg) => {
    if (cur.kind === 'obj') return cur.keys.get(seg) ?? null;
    if (cur.node.type === 'Array' && INDEX_RE.test(seg)) {
      const item = cur.node.items[Number(seg)];
      return item ? { kind: 'val', node: item, file: cur.file } : null;
    }
    return null;
  };

  function resolve(ref, fileName) {
    let cur;
    let rest;
    if (ref.const) {
      const v = consts.get(fileName)?.get(ref.path[0]);
      if (!v) return null;
      cur = { kind: 'val', node: v, file: fileName };
      rest = ref.path.slice(1);
    } else {
      cur = root;
      rest = ref.path;
    }
    for (const seg of rest) {
      cur = step(cur, seg);
      if (!cur) return null;
    }
    return cur;
  }

  function evalTarget(t) {
    if (t.kind === 'obj') {
      const out = {};
      for (const [k, v] of t.keys) {
        Object.defineProperty(out, k, { value: evalTarget(v), enumerable: true, writable: true, configurable: true });
      }
      return out;
    }
    return evalNode(t.node, t.file);
  }

  function evalNode(node, fileName) {
    switch (node.type) {
      case 'Number': case 'Bool': return node.value;
      case 'Null': return null;
      case 'Array': return node.items.map((x) => evalNode(x, fileName));
      default: return evalString(node, fileName);
    }
  }

  function evalString(node, fileName) {
    if (node.parts.length === 0) return '';
    const lookup = (ref) => {
      const t = resolve(ref, fileName);
      if (!t) throw new Error(`Tham chiếu không phân giải được: ${ref.path.join('.')}`);
      return evalTarget(t);
    };
    if (isPureRef(node)) return lookup(node.parts[0]);
    return node.parts.map((p) => {
      if (p.type === 'Text') return p.value;
      const v = lookup(p);
      return typeof v === 'string' ? v : JSON.stringify(v);
    }).join('');
  }

  return { root, consts, resolve, evalTarget };
}
