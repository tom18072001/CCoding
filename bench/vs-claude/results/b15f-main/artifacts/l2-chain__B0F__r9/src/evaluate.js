// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
import { mergeProgram, resolveRef } from './merge.js';

export function evaluate(program) {
  const merged = mergeProgram(program);
  const active = new Set(); // lưới an toàn chống đệ quy vô hạn (check đã loại vòng)

  const put = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });

  function evalMV(mv) {
    if (mv.kind === 'object') {
      const out = {};
      for (const [k, e] of mv.entries) put(out, k, evalMV(e.value));
      return out;
    }
    return evalNode(mv.node, mv.file);
  }

  function evalNode(node, file) {
    switch (node.type) {
      case 'Number': case 'Bool': return node.value;
      case 'Null': return null;
      case 'Array': return node.items.map((it) => evalNode(it, file));
      case 'String': return evalString(node, file);
      default: return null;
    }
  }

  function evalRef(part, file) {
    const t = resolveRef(merged, part, file);
    if (t === undefined || active.has(t)) return null;
    active.add(t);
    try { return evalMV(t); } finally { active.delete(t); }
  }

  function evalString(node, file) {
    const parts = node.parts;
    if (parts.length === 0) return '';
    if (parts.length === 1 && parts[0].type === 'Ref') return evalRef(parts[0], file);
    let s = '';
    for (const p of parts) {
      if (p.type === 'Text') { s += p.value; continue; }
      const v = evalRef(p, file);
      s += typeof v === 'string' ? v : JSON.stringify(v);
    }
    return s;
  }

  return evalMV(merged.root);
}
