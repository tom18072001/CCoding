// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

const pointerError = (msg) => Object.assign(new Error(msg), { code: 'DIFF_BAD_POINTER' });
const applyError = (msg) => Object.assign(new Error(msg), { code: 'DIFF_APPLY_FAILED' });

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  if (/~(?![01])/.test(seg)) throw pointerError(`Escape JSON Pointer sai: ${seg}`);
  return seg.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') throw pointerError(`JSON Pointer sai: ${pointer}`);
  return pointer.slice(1).split('/').map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

const kindOf = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x === 'object' ? 'object' : 'scalar');
const clone = (x) => structuredClone(x);

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, segs) => {
    const kx = kindOf(x);
    const ky = kindOf(y);
    const path = formatPointer(segs);
    if (kx === 'object' && ky === 'object') {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const inX = Object.hasOwn(x, k);
        const inY = Object.hasOwn(y, k);
        if (inX && !inY) ops.push({ op: 'remove', path: formatPointer([...segs, k]), oldValue: clone(x[k]) });
        else if (!inX && inY) ops.push({ op: 'add', path: formatPointer([...segs, k]), value: clone(y[k]) });
        else walk(x[k], y[k], [...segs, k]);
      }
    } else if (kx === 'array' && ky === 'array') {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) walk(x[i], y[i], [...segs, i]);
      for (let i = m; i < y.length; i++) ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      for (let i = x.length - 1; i >= m; i--) {
        ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
      }
    } else if (kx !== ky || x !== y) {
      ops.push({ op: 'replace', path, oldValue: clone(x), value: clone(y) });
    }
  };
  walk(a, b, []);
  return ops;
}

const IDX = /^(0|[1-9][0-9]*)$/;
const setKey = (obj, k, v) => Object.defineProperty(obj, k, { value: v, enumerable: true, writable: true, configurable: true });

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    const segs = parsePointer(o.path);
    const value = o.op === 'remove' ? undefined : clone(o.value);
    if (segs.length === 0) {
      if (o.op === 'remove') throw applyError('Không thể remove gốc');
      root = value;
      continue;
    }
    let parent = root;
    for (const s of segs.slice(0, -1)) {
      if (Array.isArray(parent)) {
        if (!IDX.test(s) || Number(s) >= parent.length) throw applyError(`Đường dẫn không tồn tại: ${o.path}`);
        parent = parent[Number(s)];
      } else if (parent !== null && typeof parent === 'object' && Object.hasOwn(parent, s)) {
        parent = parent[s];
      } else {
        throw applyError(`Đường dẫn không tồn tại: ${o.path}`);
      }
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(parent)) {
      if (o.op === 'add') {
        const i = last === '-' ? parent.length : IDX.test(last) ? Number(last) : -1;
        if (i < 0 || i > parent.length) throw applyError(`Chỉ số sai: ${o.path}`);
        parent.splice(i, 0, value);
      } else {
        if (!IDX.test(last) || Number(last) >= parent.length) throw applyError(`Chỉ số sai: ${o.path}`);
        if (o.op === 'remove') parent.splice(Number(last), 1);
        else parent[Number(last)] = value;
      }
    } else if (parent !== null && typeof parent === 'object') {
      const has = Object.hasOwn(parent, last);
      if (o.op === 'add') {
        if (has) throw applyError(`Khóa đã có: ${o.path}`);
        setKey(parent, last, value);
      } else {
        if (!has) throw applyError(`Khóa không có: ${o.path}`);
        if (o.op === 'remove') delete parent[last];
        else setKey(parent, last, value);
      }
    } else {
      throw applyError(`Đường dẫn không tồn tại: ${o.path}`);
    }
  }
  return root;
}

export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  const J = (x) => JSON.stringify(x);
  return ops
    .map((o) => {
      const p = o.path === '' ? '(root)' : o.path;
      if (o.op === 'add') return `+ ${p} = ${J(o.value)}`;
      if (o.op === 'remove') return `- ${p} = ${J(o.oldValue)}`;
      return `~ ${p}: ${J(o.oldValue)} -> ${J(o.value)}`;
    })
    .join('\n');
}

export function formatJson(ops) {
  return JSON.stringify(ops, null, 2);
}

export function summarize(ops) {
  const s = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) s[o.op]++;
  return s;
}
