// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.
import { setOwn } from './model.js';

const codeErr = (code, message) => Object.assign(new Error(message), { code });
const isObj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);

function clone(x) {
  if (Array.isArray(x)) return x.map(clone);
  if (isObj(x)) {
    const o = {};
    for (const k of Object.keys(x)) setOwn(o, k, clone(x[k]));
    return o;
  }
  return x;
}

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  if (/~(?![01])/.test(seg)) throw codeErr('DIFF_BAD_POINTER', `Escape sai trong con trỏ: ${seg}`);
  return seg.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') throw codeErr('DIFF_BAD_POINTER', 'Con trỏ phải bắt đầu bằng /');
  return pointer.slice(1).split('/').map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

export function diff(a, b) {
  const ops = [];
  const rec = (x, y, segs) => {
    if (isObj(x) && isObj(y)) {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const inX = Object.hasOwn(x, k), inY = Object.hasOwn(y, k);
        const p = [...segs, k];
        if (inX && !inY) ops.push({ op: 'remove', path: formatPointer(p), oldValue: clone(x[k]) });
        else if (!inX && inY) ops.push({ op: 'add', path: formatPointer(p), value: clone(y[k]) });
        else rec(x[k], y[k], p);
      }
    } else if (Array.isArray(x) && Array.isArray(y)) {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) rec(x[i], y[i], [...segs, i]);
      for (let i = m; i < y.length; i++) ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      for (let i = x.length - 1; i >= m; i--) ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
    } else if (x !== y) {
      ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
    }
  };
  rec(a, b, []);
  return ops;
}

const failApply = (msg) => codeErr('DIFF_APPLY_FAILED', msg);
const ARR_IDX = /^(0|[1-9][0-9]*)$/;

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const op of ops) {
    const segs = parsePointer(op.path);
    if (segs.length === 0) {
      if (op.op === 'remove') throw failApply('Không thể xóa gốc');
      root = clone(op.value);
      continue;
    }
    let parent = root;
    for (const s of segs.slice(0, -1)) {
      if (Array.isArray(parent)) {
        if (!ARR_IDX.test(s) || Number(s) >= parent.length) throw failApply(`Đường dẫn không tồn tại: ${op.path}`);
        parent = parent[Number(s)];
      } else if (isObj(parent) && Object.hasOwn(parent, s)) parent = parent[s];
      else throw failApply(`Đường dẫn không tồn tại: ${op.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(parent)) {
      if (!ARR_IDX.test(last)) throw failApply(`Chỉ số sai: ${op.path}`);
      const idx = Number(last);
      if (op.op === 'add') {
        if (idx > parent.length) throw failApply(`Chỉ số vượt biên: ${op.path}`);
        parent.splice(idx, 0, clone(op.value));
      } else {
        if (idx >= parent.length) throw failApply(`Chỉ số không có: ${op.path}`);
        if (op.op === 'remove') parent.splice(idx, 1);
        else if (op.op === 'replace') parent[idx] = clone(op.value);
        else throw failApply(`Thao tác lạ: ${op.op}`);
      }
    } else if (isObj(parent)) {
      const has = Object.hasOwn(parent, last);
      if (op.op === 'add') {
        if (has) throw failApply(`Khóa đã có: ${op.path}`);
        setOwn(parent, last, clone(op.value));
      } else if (op.op === 'remove' || op.op === 'replace') {
        if (!has) throw failApply(`Khóa không có: ${op.path}`);
        if (op.op === 'remove') delete parent[last];
        else setOwn(parent, last, clone(op.value));
      } else throw failApply(`Thao tác lạ: ${op.op}`);
    } else throw failApply(`Cha không phải container: ${op.path}`);
  }
  return root;
}

export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  const j = (v) => JSON.stringify(v);
  return ops.map((o) => {
    const p = o.path === '' ? '(root)' : o.path;
    if (o.op === 'add') return `+ ${p} = ${j(o.value)}`;
    if (o.op === 'remove') return `- ${p} = ${j(o.oldValue)}`;
    return `~ ${p}: ${j(o.oldValue)} -> ${j(o.value)}`;
  }).join('\n');
}

export function formatJson(ops) {
  return JSON.stringify(ops, null, 2);
}

export function summarize(ops) {
  const s = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) if (Object.hasOwn(s, o.op)) s[o.op]++;
  return s;
}
