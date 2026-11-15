// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

function loi(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

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
        const hx = has(x, k);
        const hy = has(y, k);
        if (hx && !hy) ops.push({ op: 'remove', path: p, oldValue: clone(x[k]) });
        else if (!hx && hy) ops.push({ op: 'add', path: p, value: clone(y[k]) });
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

const fail = (msg) => loi('DIFF_APPLY_FAILED', msg);

function arrIndex(seg, len, allowEnd, path) {
  if (allowEnd && seg === '-') return len;
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) throw fail(`Chỉ số mảng không hợp lệ tại ${path}`);
  const i = Number(seg);
  if (i > len || (!allowEnd && i === len)) throw fail(`Chỉ số mảng ngoài phạm vi tại ${path}`);
  return i;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    let segs;
    try {
      segs = parsePointer(o.path);
    } catch (e) {
      throw fail(`Path không hợp lệ: ${o.path}`);
    }
    if (o.op !== 'add' && o.op !== 'remove' && o.op !== 'replace') throw fail(`Thao tác không hợp lệ: ${o.op}`);
    if (segs.length === 0) {
      if (o.op === 'remove') throw fail('Không thể remove gốc');
      root = clone(o.value);
      continue;
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(cur)) cur = cur[arrIndex(s, cur.length, false, o.path)];
      else if (isObj(cur) && has(cur, s)) cur = cur[s];
      else throw fail(`Không tìm thấy đường dẫn ${o.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (o.op === 'add') cur.splice(arrIndex(last, cur.length, true, o.path), 0, clone(o.value));
      else if (o.op === 'remove') cur.splice(arrIndex(last, cur.length, false, o.path), 1);
      else cur[arrIndex(last, cur.length, false, o.path)] = clone(o.value);
    } else if (isObj(cur)) {
      const e = has(cur, last);
      if (o.op === 'add') {
        if (e) throw fail(`Khóa đã tồn tại: ${o.path}`);
        setKey(cur, last, clone(o.value));
      } else {
        if (!e) throw fail(`Khóa không tồn tại: ${o.path}`);
        if (o.op === 'remove') delete cur[last];
        else setKey(cur, last, clone(o.value));
      }
    } else {
      throw fail(`Cha của ${o.path} không phải đối tượng/mảng`);
    }
  }
  return root;
}

export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  const p = (o) => (o.path === '' ? '(root)' : o.path);
  return ops.map((o) => {
    if (o.op === 'add') return `+ ${p(o)} = ${JSON.stringify(o.value)}`;
    if (o.op === 'remove') return `- ${p(o)} = ${JSON.stringify(o.oldValue)}`;
    return `~ ${p(o)}: ${JSON.stringify(o.oldValue)} -> ${JSON.stringify(o.value)}`;
  }).join('\n');
}

export function formatJson(ops) {
  return JSON.stringify(ops, null, 2);
}

export function summarize(ops) {
  const r = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) if (o.op in r) r[o.op]++;
  return r;
}
