// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.
import { merge, resolveRef } from './merge.js';

export function evaluate(program) {
  const ctx = merge(program);
  return evaluateTarget(ctx, ctx.root);
}

// Đánh giá một Target của merge.js thành giá trị JSON mới (không chia sẻ tham chiếu).
export function evaluateTarget(ctx, target, active = new Set()) {
  if (target.kind === 'object') {
    const out = {};
    for (const [k, e] of target.entries) {
      Object.defineProperty(out, k, {
        value: evaluateTarget(ctx, e.value, active), enumerable: true, writable: true, configurable: true,
      });
    }
    return out;
  }
  return evalNode(ctx, target.node, target.file, active);
}

function evalNode(ctx, node, file, active) {
  switch (node.type) {
    case 'Number': case 'Bool': return node.value;
    case 'Null': return null;
    case 'Array': return node.items.map((it) => evalNode(ctx, it, file, active));
    case 'String': return evalString(ctx, node, file, active);
    default: throw new Error(`nút giá trị lạ: ${node.type}`);
  }
}

function evalString(ctx, node, file, active) {
  const parts = node.parts;
  if (parts.length === 0) return '';
  if (active.has(node)) {
    throw Object.assign(new Error('vòng tham chiếu'), { code: 'EVAL_CYCLE' });
  }
  active.add(node);
  try {
    const val = (ref) => {
      const t = resolveRef(ctx, ref, file);
      if (!t) throw Object.assign(new Error('tham chiếu không tồn tại'), { code: 'EVAL_UNDEFINED_REF' });
      return evaluateTarget(ctx, t, active);
    };
    if (parts.length === 1 && parts[0].type === 'Ref') return val(parts[0]);
    let s = '';
    for (const p of parts) {
      if (p.type === 'Text') { s += p.value; continue; }
      const v = val(p);
      s += typeof v === 'string' ? v : JSON.stringify(v);
    }
    return s;
  } finally {
    active.delete(node);
  }
}
