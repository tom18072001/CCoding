// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

const codeError = (code, message) => Object.assign(new Error(message), { code });
const badPointer = (m) => codeError('DIFF_BAD_POINTER', m);
const applyFailed = (m) => codeError('DIFF_APPLY_FAILED', m);

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const clone = (x) => structuredClone(x);

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  if (/~(?![01])/.test(seg)) throw badPointer(`Escape sai trong đoạn: ${seg}`);
  return seg.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (typeof pointer !== 'string') throw badPointer('Pointer phải là chuỗi');
  if (pointer === '') return [];
  if (pointer[0] !== '/') throw badPointer(`Pointer phải bắt đầu bằng "/": ${pointer}`);
  return pointer.split('/').slice(1).map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => `/${escapePointer(s)}`).join('');
}

export function diff(a, b) {
  const ops = [];
  const go = (x, y, path) => {
    if (isObj(x) && isObj(y)) {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const p = `${path}/${escapePointer(k)}`;
        const inX = Object.hasOwn(x, k);
        const inY = Object.hasOwn(y, k);
        if (inX && !inY) ops.push({ op: 'remove', path: p, oldValue: clone(x[k]) });
        else if (!inX && inY) ops.push({ op: 'add', path: p, value: clone(y[k]) });
        else go(x[k], y[k], p);
      }
    } else if (Array.isArray(x) && Array.isArray(y)) {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) go(x[i], y[i], `${path}/${i}`);
      for (let i = m; i < y.length; i++) ops.push({ op: 'add', path: `${path}/${i}`, value: clone(y[i]) });
      for (let i = x.length - 1; i >= m; i--) ops.push({ op: 'remove', path: `${path}/${i}`, oldValue: clone(x[i]) });
    } else if (x !== y) {
      ops.push({ op: 'replace', path, oldValue: clone(x), value: clone(y) });
    }
  };
  go(a, b, '');
  return ops;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    const segs = parsePointer(o.path);
    if (segs.length === 0) {
      if (o.op === 'remove') throw applyFailed('Không thể remove gốc');
      root = clone(o.value);
      continue;
    }
    let parent = root;
    for (const s of segs.slice(0, -1)) {
      if (Array.isArray(parent)) {
        if (!/^(0|[1-9][0-9]*)$/.test(s) || Number(s) >= parent.length) throw applyFailed(`Không có đường dẫn: ${o.path}`);
        parent = parent[Number(s)];
      } else if (isObj(parent) && Object.hasOwn(parent, s)) {
        parent = parent[s];
      } else {
        throw applyFailed(`Không có đường dẫn: ${o.path}`);
      }
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(parent)) {
      const isIdx = /^(0|[1-9][0-9]*)$/.test(last);
      const idx = Number(last);
      if (o.op === 'add') {
        if (last === '-') parent.push(clone(o.value));
        else if (isIdx && idx <= parent.length) parent.splice(idx, 0, clone(o.value));
        else throw applyFailed(`Chỉ số không hợp lệ: ${o.path}`);
      } else {
        if (!isIdx || idx >= parent.length) throw applyFailed(`Chỉ số không hợp lệ: ${o.path}`);
        if (o.op === 'remove') parent.splice(idx, 1);
        else parent[idx] = clone(o.value);
      }
    } else if (isObj(parent)) {
      const has = Object.hasOwn(parent, last);
      if (o.op === 'add') {
        if (has) throw applyFailed(`Khóa đã có: ${o.path}`);
      } else if (!has) {
        throw applyFailed(`Khóa không có: ${o.path}`);
      }
      if (o.op === 'remove') delete parent[last];
      else Object.defineProperty(parent, last, { value: clone(o.value), enumerable: true, writable: true, configurable: true });
    } else {
      throw applyFailed(`Cha không phải container: ${o.path}`);
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
  const s = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) s[o.op]++;
  return s;
}
