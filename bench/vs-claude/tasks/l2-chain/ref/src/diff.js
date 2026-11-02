const bad = (message) => Object.assign(new Error(message), { code: 'DIFF_BAD_POINTER' });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => structuredClone(v);

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  if (/~(?![01])/.test(seg)) throw bad(`Escape không hợp lệ trong đoạn: ${seg}`);
  return seg.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (pointer[0] !== '/') throw bad('JSON Pointer phải rỗng hoặc bắt đầu bằng "/"');
  return pointer.split('/').slice(1).map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => `/${escapePointer(s)}`).join('');
}

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, segs) => {
    const path = formatPointer(segs);
    if (isObj(x) && isObj(y)) {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const inX = Object.hasOwn(x, k);
        const inY = Object.hasOwn(y, k);
        if (inX && inY) walk(x[k], y[k], [...segs, k]);
        else if (inX) ops.push({ op: 'remove', path: formatPointer([...segs, k]), oldValue: clone(x[k]) });
        else ops.push({ op: 'add', path: formatPointer([...segs, k]), value: clone(y[k]) });
      }
    } else if (Array.isArray(x) && Array.isArray(y)) {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) walk(x[i], y[i], [...segs, i]);
      for (let i = m; i < y.length; i++) ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      for (let i = x.length - 1; i >= m; i--) ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
    } else if (x !== y) {
      ops.push({ op: 'replace', path, oldValue: clone(x), value: clone(y) });
    }
  };
  walk(a, b, []);
  return ops;
}

export function applyDiff(doc, ops) {
  let cur = clone(doc);
  const fail = (m) => { throw Object.assign(new Error(m), { code: 'DIFF_APPLY_FAILED' }); };
  for (const op of ops) {
    const segs = parsePointer(op.path);
    if (segs.length === 0) {
      if (op.op === 'remove') fail('Không thể xóa gốc');
      cur = clone(op.value);
      continue;
    }
    let parent = cur;
    for (const s of segs.slice(0, -1)) {
      parent = Array.isArray(parent) ? parent[Number(s)] : isObj(parent) ? parent[s] : undefined;
      if (parent === undefined || parent === null || typeof parent !== 'object') fail(`Đường dẫn không tồn tại: ${op.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(parent)) {
      const idx = Number(last);
      if (!/^(0|[1-9][0-9]*)$/.test(last)) fail(`Chỉ số mảng không hợp lệ: ${op.path}`);
      if (op.op === 'add') { if (idx > parent.length) fail('Chỉ số vượt quá'); parent.splice(idx, 0, clone(op.value)); }
      else if (idx >= parent.length) fail('Chỉ số vượt quá');
      else if (op.op === 'remove') parent.splice(idx, 1);
      else parent[idx] = clone(op.value);
    } else {
      const has = Object.hasOwn(parent, last);
      if (op.op === 'add' ? has : !has) fail(`Thao tác ${op.op} không áp dụng được tại ${op.path}`);
      if (op.op === 'remove') delete parent[last];
      else parent[last] = clone(op.value);
    }
  }
  return cur;
}

export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  return ops
    .map((o) => {
      const p = o.path === '' ? '(root)' : o.path;
      if (o.op === 'add') return `+ ${p} = ${JSON.stringify(o.value)}`;
      if (o.op === 'remove') return `- ${p} = ${JSON.stringify(o.oldValue)}`;
      return `~ ${p}: ${JSON.stringify(o.oldValue)} -> ${JSON.stringify(o.value)}`;
    })
    .join('\n');
}

export function formatJson(ops) {
  return JSON.stringify(ops, null, 2);
}

export function summarize(ops) {
  const r = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) r[o.op]++;
  return r;
}
