// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
import { mergeProgram, resolveRef, isPureRef } from './merge.js';

function setKey(obj, k, v) {
  Object.defineProperty(obj, k, { value: v, enumerable: true, writable: true, configurable: true });
}

export function evaluate(program) {
  const root = mergeProgram(program);
  const active = new Set();

  const evalTarget = (t) => (t.kind === 'object' ? evalObject(t) : evalNode(t.node, t.file));

  const evalObject = (obj) => {
    const out = {};
    for (const [k, e] of obj.children) {
      setKey(out, k, e.kind === 'object' ? evalObject(e) : evalNode(e.node, e.file));
    }
    return out;
  };

  const evalNode = (node, file) => {
    switch (node.type) {
      case 'Number': case 'Bool': return node.value;
      case 'Null': return null;
      case 'Array': return node.items.map((it) => evalNode(it, file));
      case 'String': return evalString(node, file);
      default: throw new Error(`nút không hợp lệ: ${node.type}`);
    }
  };

  const evalString = (node, file) => {
    if (node.parts.length === 0) return '';
    if (active.has(node)) throw new Error('vòng tham chiếu');
    active.add(node);
    try {
      const resolve = (ref) => {
        const t = resolveRef(root, program, ref, file);
        if (!t) throw new Error(`tham chiếu không tồn tại: ${ref.path.join('.')}`);
        return evalTarget(t);
      };
      if (isPureRef(node)) return resolve(node.parts[0]);
      let s = '';
      for (const p of node.parts) {
        if (p.type === 'Text') { s += p.value; continue; }
        const v = resolve(p);
        s += typeof v === 'string' ? v : JSON.stringify(v);
      }
      return s;
    } finally {
      active.delete(node);
    }
  };

  return evalObject(root);
}
