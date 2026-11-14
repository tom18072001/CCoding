// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

function loi(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function setKey(o, k, v) {
  Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
}

function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (isObj(v)) {
    const o = {};
    for (const k of Object.keys(v)) setKey(o, k, clone(v[k]));
    return o;
  }
  return v;
}

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  if (/~(?![01])/.test(s)) throw loi('DIFF_BAD_POINTER', `Escape sai trong đoạn pointer: ${s}`);
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (typeof pointer !== 'string') throw loi('DIFF_BAD_POINTER', 'Pointer phải là chuỗi');
  if (pointer === '') return [];
  if (pointer[0] !== '/') throw loi('DIFF_BAD_POINTER', `Pointer phải bắt đầu bằng "/": ${pointer}`);
  return pointer.slice(1).split('/').map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, path) => {
    if (isObj(x) && isObj(y)) {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const p = path + '/' + escapePointer(k);
        const inX = has(x, k);
        const inY = has(y, k);
        if (inX && !inY) ops.push({ op: 'remove', path: p, oldValue: clone(x[k]) });
        else if (!inX && inY) ops.push({ op: 'add', path: p, value: clone(y[k]) });
        else walk(x[k], y[k], p);
      }
    } else if (Array.isArray(x) && Array.isArray(y)) {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) walk(x[i], y[i], `${path}/${i}`);
      for (let i = m; i < y.length; i++) ops.push({ op: 'add', path: `${path}/${i}`, value: clone(y[i]) });
      for (let i = x.length - 1; i >= m; i--) ops.push({ op: 'remove', path: `${path}/${i}`, oldValue: clone(x[i]) });
    } else if (x !== y) {
      ops.push({ op: 'replace', path, oldValue: clone(x), value: clone(y) });
    }
  };
  walk(a, b, '');
  return ops;
}

function fail(msg) {
  return loi('DIFF_APPLY_FAILED', msg);
}

function arrIndex(seg, len, path, allowEnd) {
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) throw fail(`Chỉ số mảng không hợp lệ tại ${path}`);
  const i = Number(seg);
  if (i > len || (!allowEnd && i === len)) throw fail(`Chỉ số mảng ngoài phạm vi tại ${path}`);
  return i;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const op of ops) {
    let segs;
    try {
      segs = parsePointer(op.path);
    } catch (e) {
      throw fail(`Pointer sai: ${op.path}`);
    }
    if (segs.length === 0) {
      if (op.op === 'add' || op.op === 'replace') { root = clone(op.value); continue; }
      throw fail('Không thể remove gốc');
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(cur)) cur = cur[arrIndex(s, cur.length, op.path, false)];
      else if (isObj(cur) && has(cur, s)) cur = cur[s];
      else throw fail(`Không tìm thấy đường dẫn ${op.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (op.op === 'add') cur.splice(arrIndex(last, cur.length, op.path, true), 0, clone(op.value));
      else if (op.op === 'remove') cur.splice(arrIndex(last, cur.length, op.path, false), 1);
      else if (op.op === 'replace') cur[arrIndex(last, cur.length, op.path, false)] = clone(op.value);
      else throw fail(`Thao tác không biết: ${op.op}`);
    } else if (isObj(cur)) {
      const co = has(cur, last);
      if (op.op === 'add') {
        if (co) throw fail(`Khóa đã có: ${op.path}`);
        setKey(cur, last, clone(op.value));
      } else if (op.op === 'remove') {
        if (!co) throw fail(`Khóa không có: ${op.path}`);
        delete cur[last];
      } else if (op.op === 'replace') {
        if (!co) throw fail(`Khóa không có: ${op.path}`);
        setKey(cur, last, clone(op.value));
      } else throw fail(`Thao tác không biết: ${op.op}`);
    } else {
      throw fail(`Không áp được tại ${op.path}`);
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
