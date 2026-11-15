// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.
// Chỉ export các tên SPEC liệt kê; hàm phụ giữ nội bộ.

function loi(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function setKey(o, k, v) {
  Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
}

function clone(x) {
  if (Array.isArray(x)) return x.map(clone);
  if (isObj(x)) {
    const r = {};
    for (const k of Object.keys(x)) setKey(r, k, clone(x[k]));
    return r;
  }
  return x;
}

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  if (/~(?![01])/.test(s)) throw loi('DIFF_BAD_POINTER', `Escape sai trong đoạn JSON Pointer: ${s}`);
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') {
    throw loi('DIFF_BAD_POINTER', `JSON Pointer phải rỗng hoặc bắt đầu bằng "/": ${String(pointer)}`);
  }
  return pointer.slice(1).split('/').map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

export function diff(a, b) {
  const ops = [];
  walk(a, b, [], ops);
  return ops;
}

function kind(x) {
  return Array.isArray(x) ? 'array' : x === null ? 'null' : typeof x;
}

function walk(x, y, segs, ops) {
  if (isObj(x) && isObj(y)) {
    const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
    for (const k of keys) {
      const inX = hasOwn(x, k);
      const inY = hasOwn(y, k);
      if (inX && !inY) {
        ops.push({ op: 'remove', path: formatPointer([...segs, k]), oldValue: clone(x[k]) });
      } else if (!inX && inY) {
        ops.push({ op: 'add', path: formatPointer([...segs, k]), value: clone(y[k]) });
      } else {
        walk(x[k], y[k], [...segs, k], ops);
      }
    }
    return;
  }
  if (Array.isArray(x) && Array.isArray(y)) {
    const n = Math.min(x.length, y.length);
    for (let i = 0; i < n; i++) walk(x[i], y[i], [...segs, i], ops);
    for (let i = n; i < y.length; i++) {
      ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
    }
    for (let i = x.length - 1; i >= n; i--) {
      ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
    }
    return;
  }
  if (kind(x) === kind(y) && x === y) return;
  ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
}

function chiSo(seg, len, choAdd, path) {
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) {
    throw loi('DIFF_APPLY_FAILED', `Chỉ số mảng không hợp lệ tại ${path}`);
  }
  const i = Number(seg);
  if (i > len || (!choAdd && i === len)) {
    throw loi('DIFF_APPLY_FAILED', `Chỉ số mảng ngoài phạm vi tại ${path}`);
  }
  return i;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    let segs;
    try {
      segs = parsePointer(o.path);
    } catch {
      throw loi('DIFF_APPLY_FAILED', `Path không hợp lệ: ${o.path}`);
    }
    if (o.op !== 'add' && o.op !== 'remove' && o.op !== 'replace') {
      throw loi('DIFF_APPLY_FAILED', `Thao tác không hợp lệ: ${String(o.op)}`);
    }
    if (segs.length === 0) {
      if (o.op === 'remove') throw loi('DIFF_APPLY_FAILED', 'Không thể remove gốc');
      root = clone(o.value);
      continue;
    }
    let cur = root;
    for (let j = 0; j < segs.length - 1; j++) {
      const s = segs[j];
      if (Array.isArray(cur)) {
        cur = cur[chiSo(s, cur.length, false, o.path)];
      } else if (isObj(cur) && hasOwn(cur, s)) {
        cur = cur[s];
      } else {
        throw loi('DIFF_APPLY_FAILED', `Không tìm thấy đường dẫn: ${o.path}`);
      }
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      const i = chiSo(last, cur.length, o.op === 'add', o.path);
      if (o.op === 'add') cur.splice(i, 0, clone(o.value));
      else if (o.op === 'remove') cur.splice(i, 1);
      else cur[i] = clone(o.value);
    } else if (isObj(cur)) {
      const co = hasOwn(cur, last);
      if (o.op === 'add') {
        if (co) throw loi('DIFF_APPLY_FAILED', `Khóa đã tồn tại: ${o.path}`);
        setKey(cur, last, clone(o.value));
      } else if (!co) {
        throw loi('DIFF_APPLY_FAILED', `Khóa không tồn tại: ${o.path}`);
      } else if (o.op === 'remove') delete cur[last];
      else setKey(cur, last, clone(o.value));
    } else {
      throw loi('DIFF_APPLY_FAILED', `Cha không phải đối tượng/mảng: ${o.path}`);
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
  const r = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) if (hasOwn(r, o.op)) r[o.op]++;
  return r;
}
