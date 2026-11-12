// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
import { mergeProgram, resolveRef } from './merge.js';

function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

export function evaluate(program) {
  const merged = mergeProgram(program);

  function evalTarget(t, active) {
    if (t.kind === 'object') {
      const out = {};
      for (const [k, e] of t.entries) setOwn(out, k, evalTarget(e.value, active));
      return out;
    }
    return evalNode(t.node, t.file, active);
  }

  function evalNode(node, file, active) {
    switch (node.type) {
      case 'Number': case 'Bool': return node.value;
      case 'Null': return null;
      case 'Array': return node.items.map((n) => evalNode(n, file, active));
      case 'String': return evalString(node, file, active);
      default: throw new Error(`nút giá trị không hợp lệ: ${node.type}`);
    }
  }

  function evalRef(part, file, active) {
    const target = resolveRef(merged, part, file);
    if (!target) throw new Error(`tham chiếu không tồn tại: ${part.path.join('.')}`);
    return evalTarget(target, active);
  }

  function evalString(node, file, active) {
    if (active.has(node)) throw new Error('vòng tham chiếu');
    active.add(node);
    try {
      const parts = node.parts;
      if (parts.length === 0) return '';
      if (parts.length === 1 && parts[0].type === 'Ref') return evalRef(parts[0], file, active);
      let s = '';
      for (const p of parts) {
        if (p.type === 'Text') { s += p.value; continue; }
        const v = evalRef(p, file, active);
        if (typeof v === 'string') s += v;
        else if (typeof v === 'number') s += JSON.stringify(v);
        else if (v === null || typeof v === 'boolean') s += String(v);
        else throw new Error('nội suy mảng/đối tượng vào chuỗi');
      }
      return s;
    } finally {
      active.delete(node);
    }
  }

  return evalTarget(merged.root, new Set());
}
