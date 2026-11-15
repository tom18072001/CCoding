// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

function loi(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const setOwn = (o, k, v) =>
  Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });

function loai(x) {
  if (x === null) return 'null';
  if (Array.isArray(x)) return 'array';
  return typeof x === 'object' ? 'object' : typeof x;
}

function clone(x) {
  const t = loai(x);
  if (t === 'array') return x.map(clone);
  if (t === 'object') {
    const r = {};
    for (const k of Object.keys(x)) setOwn(r, k, clone(x[k]));
    return r;
  }
  return x;
}

function deepEqual(x, y) {
  const t = loai(x);
  if (t !== loai(y)) return false;
  if (t === 'array') return x.length === y.length && x.every((v, i) => deepEqual(v, y[i]));
  if (t === 'object') {
    const kx = Object.keys(x);
    const ky = Object.keys(y);
    return kx.length === ky.length && kx.every((k) => has(y, k) && deepEqual(x[k], y[k]));
  }
  return x === y;
}

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  if (/~(?![01])/.test(s)) throw loi('DIFF_BAD_POINTER', `Escape JSON Pointer không hợp lệ: ${s}`);
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') {
    throw loi('DIFF_BAD_POINTER', `JSON Pointer phải bắt đầu bằng "/": ${String(pointer)}`);
  }
  return pointer.slice(1).split('/').map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, segs) => {
    const tx = loai(x);
    const ty = loai(y);
    if (tx !== ty) {
      ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
    } else if (tx === 'object') {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const p = [...segs, k];
        if (!has(y, k)) ops.push({ op: 'remove', path: formatPointer(p), oldValue: clone(x[k]) });
        else if (!has(x, k)) ops.push({ op: 'add', path: formatPointer(p), value: clone(y[k]) });
        else walk(x[k], y[k], p);
      }
    } else if (tx === 'array') {
      const n = Math.min(x.length, y.length);
      for (let i = 0; i < n; i++) walk(x[i], y[i], [...segs, i]);
      for (let i = n; i < y.length; i++) {
        ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      }
      for (let i = x.length - 1; i >= n; i--) {
        ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
      }
    } else if (x !== y) {
      ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
    }
  };
  walk(a, b, []);
  return ops;
}

function hong(msg) {
  return loi('DIFF_APPLY_FAILED', msg);
}

function chiSo(seg, max) {
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) return -1;
  const i = Number(seg);
  return i <= max ? i : -1;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    const segs = parsePointer(o.path);
    const kind = o.op;
    if (kind !== 'add' && kind !== 'remove' && kind !== 'replace') {
      throw hong(`Thao tác không hợp lệ: ${String(kind)}`);
    }
    if (segs.length === 0) {
      if (kind === 'remove') throw hong('Không thể remove gốc');
      root = clone(o.value);
      continue;
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      const t = loai(cur);
      if (t === 'array') {
        const idx = chiSo(s, cur.length - 1);
        if (idx < 0 || idx >= cur.length) throw hong(`Không có đường dẫn ${o.path}`);
        cur = cur[idx];
      } else if (t === 'object') {
        if (!has(cur, s)) throw hong(`Không có đường dẫn ${o.path}`);
        cur = cur[s];
      } else {
        throw hong(`Không có đường dẫn ${o.path}`);
      }
    }
    const last = segs[segs.length - 1];
    const t = loai(cur);
    if (t === 'array') {
      if (kind === 'add') {
        const idx = chiSo(last, cur.length);
        if (idx < 0) throw hong(`Chỉ số không hợp lệ: ${o.path}`);
        cur.splice(idx, 0, clone(o.value));
      } else {
        const idx = chiSo(last, cur.length - 1);
        if (idx < 0 || idx >= cur.length) throw hong(`Chỉ số không có: ${o.path}`);
        if (kind === 'remove') cur.splice(idx, 1);
        else cur[idx] = clone(o.value);
      }
    } else if (t === 'object') {
      if (kind === 'add') {
        if (has(cur, last)) throw hong(`Khóa đã có: ${o.path}`);
        setOwn(cur, last, clone(o.value));
      } else {
        if (!has(cur, last)) throw hong(`Khóa không có: ${o.path}`);
        if (kind === 'remove') delete cur[last];
        else setOwn(cur, last, clone(o.value));
      }
    } else {
      throw hong(`Không có đường dẫn ${o.path}`);
    }
  }
  return root;
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
  for (const o of ops) if (has(r, o.op)) r[o.op]++;
  return r;
}

