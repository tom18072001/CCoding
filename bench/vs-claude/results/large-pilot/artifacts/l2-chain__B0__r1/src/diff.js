// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

import { setOwn } from './merge.js';

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

function codedError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  if (/~(?![01])/.test(seg)) throw codedError('DIFF_BAD_POINTER', `Escape sai trong JSON Pointer: ${seg}`);
  return seg.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (pointer[0] !== '/') throw codedError('DIFF_BAD_POINTER', `JSON Pointer phải bắt đầu bằng "/": ${pointer}`);
  return pointer.slice(1).split('/').map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => `/${escapePointer(s)}`).join('');
}

const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : 'scalar');
const clone = (v) => structuredClone(v);

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, segs) => {
    const kx = kindOf(x);
    const ky = kindOf(y);
    if (kx === 'object' && ky === 'object') {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const inX = Object.hasOwn(x, k);
        const inY = Object.hasOwn(y, k);
        const path = [...segs, k];
        if (inX && !inY) ops.push({ op: 'remove', path: formatPointer(path), oldValue: clone(x[k]) });
        else if (!inX && inY) ops.push({ op: 'add', path: formatPointer(path), value: clone(y[k]) });
        else walk(x[k], y[k], path);
      }
    } else if (kx === 'array' && ky === 'array') {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) walk(x[i], y[i], [...segs, i]);
      for (let i = m; i < y.length; i++) ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      for (let i = x.length - 1; i >= m; i--) {
        ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
      }
    } else if (kx !== ky || x !== y) {
      ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
    }
  };
  walk(a, b, []);
  return ops;
}

export function applyDiff(doc, ops) {
  const fail = (msg) => codedError('DIFF_APPLY_FAILED', msg);
  let root = clone(doc);
  for (const op of ops) {
    const segs = parsePointer(op.path);
    if (segs.length === 0) {
      if (op.op === 'remove') throw fail('Không thể remove gốc');
      root = clone(op.value);
      continue;
    }
    let parent = root;
    for (const seg of segs.slice(0, -1)) {
      if (Array.isArray(parent) && INDEX_RE.test(seg) && Number(seg) < parent.length) parent = parent[Number(seg)];
      else if (kindOf(parent) === 'object' && Object.hasOwn(parent, seg)) parent = parent[seg];
      else throw fail(`Đường dẫn không tồn tại: ${op.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(parent)) {
      if (!INDEX_RE.test(last)) throw fail(`Chỉ số mảng sai: ${op.path}`);
      const idx = Number(last);
      if (op.op === 'add') {
        if (idx > parent.length) throw fail(`Chỉ số ngoài mảng: ${op.path}`);
        parent.splice(idx, 0, clone(op.value));
      } else {
        if (idx >= parent.length) throw fail(`Chỉ số ngoài mảng: ${op.path}`);
        if (op.op === 'remove') parent.splice(idx, 1);
        else parent[idx] = clone(op.value);
      }
    } else if (kindOf(parent) === 'object') {
      const has = Object.hasOwn(parent, last);
      if (op.op === 'add') {
        if (has) throw fail(`Khóa đã có: ${op.path}`);
        setOwn(parent, last, clone(op.value));
      } else {
        if (!has) throw fail(`Khóa không có: ${op.path}`);
        if (op.op === 'remove') delete parent[last];
        else setOwn(parent, last, clone(op.value));
      }
    } else {
      throw fail(`Cha không phải container: ${op.path}`);
    }
  }
  return root;
}

export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  const show = (p) => (p === '' ? '(root)' : p);
  return ops.map((o) => {
    if (o.op === 'add') return `+ ${show(o.path)} = ${JSON.stringify(o.value)}`;
    if (o.op === 'remove') return `- ${show(o.path)} = ${JSON.stringify(o.oldValue)}`;
    return `~ ${show(o.path)}: ${JSON.stringify(o.oldValue)} -> ${JSON.stringify(o.value)}`;
  }).join('\n');
}

export function formatJson(ops) {
  return JSON.stringify(ops, null, 2);
}

export function summarize(ops) {
  const r = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) r[o.op]++;
  return r;
}
