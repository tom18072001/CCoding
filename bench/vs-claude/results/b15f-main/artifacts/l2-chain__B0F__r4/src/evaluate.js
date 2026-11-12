// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
import { buildMerged, resolve } from './merge.js';

const setKey = (obj, k, v) =>
  Object.defineProperty(obj, k, { value: v, enumerable: true, writable: true, configurable: true });

export function evaluate(program) {
  const merged = buildMerged(program);
  const active = new Set();

  const evalNode = (node) => {
    if (node.kind === 'object') {
      const out = {};
      for (const [k, e] of node.entries) setKey(out, k, evalNode(e.node));
      return out;
    }
    const a = node.ast;
    switch (a.type) {
      case 'Number':
      case 'Bool':
        return a.value;
      case 'Null':
        return null;
      case 'Array':
        return a.items.map((it) => evalNode({ kind: 'value', ast: it, file: node.file }));
      case 'String':
        return evalString(a, node.file);
      default:
        throw new Error(`nút không hợp lệ: ${a.type}`);
    }
  };

  const target = (ref, file) => {
    const t = resolve(merged, ref, file);
    if (!t) throw new Error(`tham chiếu không tồn tại: ${ref.path.join('.')}`);
    return t;
  };

  const evalString = (s, file) => {
    if (active.has(s)) throw new Error('vòng tham chiếu');
    active.add(s);
    try {
      const { parts } = s;
      if (parts.length === 1 && parts[0].type === 'Ref') return evalNode(target(parts[0], file));
      let out = '';
      for (const p of parts) {
        if (p.type === 'Text') {
          out += p.value;
          continue;
        }
        const v = evalNode(target(p, file));
        if (v !== null && typeof v === 'object') throw new Error('nội suy mảng/đối tượng vào chuỗi');
        out += typeof v === 'string' ? v : typeof v === 'number' ? JSON.stringify(v) : String(v);
      }
      return out;
    } finally {
      active.delete(s);
    }
  };

  return evalNode(merged.root);
}
