// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
import { buildMerged, resolveRef } from './merge.js';

function setKey(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

/** Đánh giá một đích (Obj | Leaf) của cây hợp nhất thành JSON mới (không chia sẻ tham chiếu). */
export function evaluateTarget(merged, target, active = new Set()) {
  if (target.kind === 'object') {
    const out = {};
    for (const [k, e] of target.entries) setKey(out, k, evaluateTarget(merged, e.val, active));
    return out;
  }
  return evaluateNode(merged, target.node, target.file, active);
}

/** Đánh giá một nút giá trị AST thuộc tệp `file`. */
export function evaluateNode(merged, node, file, active = new Set()) {
  switch (node.type) {
    case 'Number':
    case 'Bool':
      return node.value;
    case 'Null':
      return null;
    case 'Array':
      return node.items.map((it) => evaluateNode(merged, it, file, active));
    case 'String':
      return evaluateString(merged, node, file, active);
    default:
      throw new Error(`nút giá trị không hợp lệ: ${node.type}`);
  }
}

function stringify(v) {
  return typeof v === 'string' ? v : JSON.stringify(v); // số, bool, null
}

/** Đánh giá nút String (mục 6.3). */
export function evaluateString(merged, node, file, active = new Set()) {
  const parts = node.parts;
  if (parts.length === 0) return '';
  if (active.has(node)) throw new Error('vòng tham chiếu');
  active.add(node);
  try {
    const val = (ref) => {
      const t = resolveRef(merged, ref, file);
      if (!t) throw new Error(`tham chiếu không tồn tại: ${ref.path.join('.')}`);
      return evaluateTarget(merged, t, active);
    };
    if (parts.length === 1 && parts[0].type === 'Ref') return val(parts[0]);
    let s = '';
    for (const p of parts) s += p.type === 'Text' ? p.value : stringify(val(p));
    return s;
  } finally {
    active.delete(node);
  }
}

export function evaluate(program) {
  const merged = buildMerged(program);
  return evaluateTarget(merged, merged.root);
}
