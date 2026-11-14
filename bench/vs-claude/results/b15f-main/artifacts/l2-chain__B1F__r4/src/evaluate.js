// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.

import { mergeProgram, resolveRef } from './merge.js';

function setKey(obj, key, val) {
  Object.defineProperty(obj, key, { value: val, enumerable: true, writable: true, configurable: true });
}

export function evaluate(program) {
  const tree = mergeProgram(program);
  let depth = 0;

  const guard = (fn) => {
    if (++depth > 1000) throw new Error('vòng tham chiếu hoặc lồng quá sâu');
    try { return fn(); } finally { depth--; }
  };

  const evalM = (m) => guard(() => {
    if (m.kind === 'object') {
      const out = {};
      for (const [k, e] of m.entries) setKey(out, k, evalM(e.value));
      return out;
    }
    return evalNode(m.node, m.file);
  });

  const evalNode = (node, file) => {
    switch (node.type) {
      case 'Number': case 'Bool': return node.value;
      case 'Null': return null;
      case 'Array': return node.items.map((it) => guard(() => evalNode(it, file)));
      case 'String': return evalString(node, file);
      default: throw new Error(`nút không hợp lệ: ${node.type}`);
    }
  };

  const target = (ref, file) => {
    const t = resolveRef(tree, ref, file);
    if (!t) throw new Error(`tham chiếu không phân giải được: ${ref.path.join('.')}`);
    return t;
  };

  const evalString = (node, file) => {
    const parts = node.parts;
    if (parts.length === 1 && parts[0].type === 'Ref') return evalM(target(parts[0], file));
    let s = '';
    for (const p of parts) {
      if (p.type === 'Text') { s += p.value; continue; }
      const v = evalM(target(p, file));
      s += typeof v === 'number' ? JSON.stringify(v) : String(v);
    }
    return s;
  };

  return evalM(tree.root);
}
