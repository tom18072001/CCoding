// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

function loi(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  if (/~(?![01])/.test(s)) {
    throw loi('DIFF_BAD_POINTER', `JSON Pointer sai escape: "${s}"`);
  }
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (typeof pointer !== 'string') throw loi('DIFF_BAD_POINTER', 'JSON Pointer phải là chuỗi');
  if (pointer === '') return [];
  if (pointer[0] !== '/') throw loi('DIFF_BAD_POINTER', `JSON Pointer phải bắt đầu bằng "/": "${pointer}"`);
  return pointer.slice(1).split('/').map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function setKey(o, k, v) {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (isObj(v)) {
    const r = {};
    for (const k of Object.keys(v)) setKey(r, k, clone(v[k]));
    return r;
  }
  return v;
}

function loai(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, path) => {
    const tx = loai(x);
    const ty = loai(y);
    if (tx === 'object' && ty === 'object') {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const p = path + '/' + escapePointer(k);
        const inX = has(x, k);
        const inY = has(y, k);
        if (inX && !inY) ops.push({ op: 'remove', path: p, oldValue: clone(x[k]) });
        else if (!inX && inY) ops.push({ op: 'add', path: p, value: clone(y[k]) });
        else walk(x[k], y[k], p);
      }
      return;
    }
    if (tx === 'array' && ty === 'array') {
      const n = Math.min(x.length, y.length);
      for (let i = 0; i < n; i++) walk(x[i], y[i], path + '/' + i);
      for (let i = n; i < y.length; i++) ops.push({ op: 'add', path: path + '/' + i, value: clone(y[i]) });
      for (let i = x.length - 1; i >= n; i--) ops.push({ op: 'remove', path: path + '/' + i, oldValue: clone(x[i]) });
      return;
    }
    if (tx !== ty || x !== y) {
      ops.push({ op: 'replace', path, oldValue: clone(x), value: clone(y) });
    }
  };
  walk(a, b, '');
  return ops;
}

function fail(msg) {
  return loi('DIFF_APPLY_FAILED', msg);
}

function chiSo(seg, len, choPhep) {
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) return -1;
  const i = Number(seg);
  return i < len || (choPhep && i === len) ? i : -1;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    let segs;
    try {
      segs = parsePointer(o.path);
    } catch (e) {
      throw fail(`path không hợp lệ: ${o.path}`);
    }
    if (segs.length === 0) {
      if (o.op === 'add' || o.op === 'replace') { root = clone(o.value); continue; }
      throw fail('không thể remove gốc');
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(cur)) {
        const idx = chiSo(s, cur.length, false);
        if (idx < 0) throw fail(`không có đường dẫn: ${o.path}`);
        cur = cur[idx];
      } else if (isObj(cur) && has(cur, s)) {
        cur = cur[s];
      } else {
        throw fail(`không có đường dẫn: ${o.path}`);
      }
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (o.op === 'add') {
        const idx = chiSo(last, cur.length, true);
        if (idx < 0) throw fail(`chỉ số ngoài phạm vi: ${o.path}`);
        cur.splice(idx, 0, clone(o.value));
      } else if (o.op === 'remove' || o.op === 'replace') {
        const idx = chiSo(last, cur.length, false);
        if (idx < 0) throw fail(`chỉ số không có: ${o.path}`);
        if (o.op === 'remove') cur.splice(idx, 1);
        else cur[idx] = clone(o.value);
      } else throw fail(`op không hợp lệ: ${o.op}`);
    } else if (isObj(cur)) {
      if (o.op === 'add') {
        if (has(cur, last)) throw fail(`khóa đã có: ${o.path}`);
        setKey(cur, last, clone(o.value));
      } else if (o.op === 'remove' || o.op === 'replace') {
        if (!has(cur, last)) throw fail(`khóa không có: ${o.path}`);
        if (o.op === 'remove') delete cur[last];
        else setKey(cur, last, clone(o.value));
      } else throw fail(`op không hợp lệ: ${o.op}`);
    } else {
      throw fail(`không có đường dẫn: ${o.path}`);
    }
  }
  return root;
}

export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  return ops.map((o) => {
    const p = o.path === '' ? '(root)' : o.path;
    if (o.op === 'add') return `+ ${p} = ${JSON.stringify(o.value)}`;
    if (o.op === 'remove') return `- ${p} = ${JSON.stringify(o.oldValue)}`;
    return `~ ${p}: ${JSON.stringify(o.oldValue)} -> ${JSON.stringify(o.value)}`;
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
