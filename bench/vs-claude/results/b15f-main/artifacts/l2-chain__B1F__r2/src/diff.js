// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function loi(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (v !== null && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) setOwn(out, k, clone(v[k]));
    return out;
  }
  return v;
}

const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  if (/~(?![01])/.test(s)) throw loi('DIFF_BAD_POINTER', `JSON Pointer sai escape: ${s}`);
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (typeof pointer !== 'string') throw loi('DIFF_BAD_POINTER', 'JSON Pointer phải là chuỗi');
  if (pointer === '') return [];
  if (pointer[0] !== '/') throw loi('DIFF_BAD_POINTER', `JSON Pointer phải bắt đầu bằng "/": ${pointer}`);
  return pointer.slice(1).split('/').map(unescapePointer);
}

export function formatPointer(segments) {
  let out = '';
  for (const s of segments) out += '/' + escapePointer(s);
  return out;
}

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, path) => {
    const kx = kind(x);
    const ky = kind(y);
    if (kx !== ky) {
      ops.push({ op: 'replace', path, oldValue: clone(x), value: clone(y) });
    } else if (kx === 'object') {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const p = path + '/' + escapePointer(k);
        const inX = hasOwn(x, k);
        const inY = hasOwn(y, k);
        if (inX && !inY) ops.push({ op: 'remove', path: p, oldValue: clone(x[k]) });
        else if (!inX && inY) ops.push({ op: 'add', path: p, value: clone(y[k]) });
        else walk(x[k], y[k], p);
      }
    } else if (kx === 'array') {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) walk(x[i], y[i], path + '/' + i);
      for (let i = m; i < y.length; i++) ops.push({ op: 'add', path: path + '/' + i, value: clone(y[i]) });
      for (let i = x.length - 1; i >= m; i--) ops.push({ op: 'remove', path: path + '/' + i, oldValue: clone(x[i]) });
    } else if (x !== y) {
      ops.push({ op: 'replace', path, oldValue: clone(x), value: clone(y) });
    }
  };
  walk(a, b, '');
  return ops;
}

const fail = (msg) => loi('DIFF_APPLY_FAILED', msg);

function arrayIndex(seg, max, what) {
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) throw fail(`chỉ số mảng không hợp lệ: ${seg}`);
  const i = Number(seg);
  if (i > max) throw fail(`chỉ số mảng vượt giới hạn (${what}): ${seg}`);
  return i;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    const segs = parsePointer(o.path);
    if (segs.length === 0) {
      if (o.op === 'add' || o.op === 'replace') root = clone(o.value);
      else throw fail('không thể remove gốc');
      continue;
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(cur)) {
        const idx = arrayIndex(s, cur.length - 1, 'đường dẫn');
        cur = cur[idx];
      } else if (cur !== null && typeof cur === 'object' && hasOwn(cur, s)) {
        cur = cur[s];
      } else {
        throw fail(`không tìm thấy đường dẫn: ${o.path}`);
      }
      if (cur === undefined) throw fail(`không tìm thấy đường dẫn: ${o.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (o.op === 'add') {
        cur.splice(arrayIndex(last, cur.length, 'add'), 0, clone(o.value));
      } else if (o.op === 'remove') {
        cur.splice(arrayIndex(last, cur.length - 1, 'remove'), 1);
      } else if (o.op === 'replace') {
        cur[arrayIndex(last, cur.length - 1, 'replace')] = clone(o.value);
      } else throw fail(`thao tác không hỗ trợ: ${o.op}`);
    } else if (cur !== null && typeof cur === 'object') {
      const has = hasOwn(cur, last);
      if (o.op === 'add') {
        if (has) throw fail(`khóa đã tồn tại: ${o.path}`);
        setOwn(cur, last, clone(o.value));
      } else if (o.op === 'remove') {
        if (!has) throw fail(`khóa không tồn tại: ${o.path}`);
        delete cur[last];
      } else if (o.op === 'replace') {
        if (!has) throw fail(`khóa không tồn tại: ${o.path}`);
        setOwn(cur, last, clone(o.value));
      } else throw fail(`thao tác không hỗ trợ: ${o.op}`);
    } else {
      throw fail(`không thể áp vào giá trị vô hướng: ${o.path}`);
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
  for (const o of ops) if (hasOwn(r, o.op)) r[o.op]++;
  return r;
}
