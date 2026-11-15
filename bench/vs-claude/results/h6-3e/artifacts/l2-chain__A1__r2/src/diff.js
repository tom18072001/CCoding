// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

const mkErr = (code, message) => Object.assign(new Error(message), { code });
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const setOwn = (o, k, v) =>
  Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

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
  if (/~(?![01])/.test(seg)) throw mkErr('DIFF_BAD_POINTER', `Escape sai trong JSON Pointer: ${seg}`);
  return seg.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') {
    throw mkErr('DIFF_BAD_POINTER', `JSON Pointer phải bắt đầu bằng "/": ${pointer}`);
  }
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
        const inX = hasOwn(x, k);
        const inY = hasOwn(y, k);
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

const fail = (msg) => mkErr('DIFF_APPLY_FAILED', msg);
const INDEX_RE = /^(0|[1-9][0-9]*)$/;

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    const segs = parsePointer(o.path);
    if (segs.length === 0) {
      if (o.op === 'remove') throw fail('Không thể xóa gốc');
      root = clone(o.value);
      continue;
    }
    let cur = root;
    for (const seg of segs.slice(0, -1)) {
      if (Array.isArray(cur)) {
        if (!INDEX_RE.test(seg) || Number(seg) >= cur.length) throw fail(`Đường dẫn không tồn tại: ${o.path}`);
        cur = cur[Number(seg)];
      } else if (isObj(cur)) {
        if (!hasOwn(cur, seg)) throw fail(`Đường dẫn không tồn tại: ${o.path}`);
        cur = cur[seg];
      } else throw fail(`Đường dẫn không tồn tại: ${o.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (!INDEX_RE.test(last)) throw fail(`Chỉ số mảng sai: ${o.path}`);
      const idx = Number(last);
      if (o.op === 'add') {
        if (idx > cur.length) throw fail(`Chỉ số vượt quá: ${o.path}`);
        cur.splice(idx, 0, clone(o.value));
      } else {
        if (idx >= cur.length) throw fail(`Chỉ số không tồn tại: ${o.path}`);
        if (o.op === 'remove') cur.splice(idx, 1);
        else if (o.op === 'replace') cur[idx] = clone(o.value);
        else throw fail(`Thao tác không hợp lệ: ${o.op}`);
      }
    } else if (isObj(cur)) {
      const has = hasOwn(cur, last);
      if (o.op === 'add') {
        if (has) throw fail(`Khóa đã tồn tại: ${o.path}`);
        setOwn(cur, last, clone(o.value));
      } else if (o.op === 'remove' || o.op === 'replace') {
        if (!has) throw fail(`Khóa không tồn tại: ${o.path}`);
        if (o.op === 'remove') delete cur[last];
        else setOwn(cur, last, clone(o.value));
      } else throw fail(`Thao tác không hợp lệ: ${o.op}`);
    } else throw fail(`Đường dẫn không tồn tại: ${o.path}`);
  }
  return root;
}

export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  const J = (v) => JSON.stringify(v);
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
  const r = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) if (hasOwn(r, o.op)) r[o.op]++;
  return r;
}
