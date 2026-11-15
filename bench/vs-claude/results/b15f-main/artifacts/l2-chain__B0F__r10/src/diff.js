// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

function loi(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const badPointer = (m) => loi('DIFF_BAD_POINTER', m);
const applyFail = (m) => loi('DIFF_APPLY_FAILED', m);

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function setKey(o, k, v) {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
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
  if (/~(?![01])/.test(s)) throw badPointer(`escape sai trong đoạn pointer: ${s}`);
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') {
    throw badPointer(`pointer phải rỗng hoặc bắt đầu bằng "/": ${String(pointer)}`);
  }
  return pointer.split('/').slice(1).map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, segs) => {
    if (isObj(x) && isObj(y)) {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const p = [...segs, k];
        if (!has(y, k)) ops.push({ op: 'remove', path: formatPointer(p), oldValue: clone(x[k]) });
        else if (!has(x, k)) ops.push({ op: 'add', path: formatPointer(p), value: clone(y[k]) });
        else walk(x[k], y[k], p);
      }
      return;
    }
    if (Array.isArray(x) && Array.isArray(y)) {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) walk(x[i], y[i], [...segs, i]);
      for (let i = m; i < y.length; i++) {
        ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      }
      for (let i = x.length - 1; i >= m; i--) {
        ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
      }
      return;
    }
    if (x === y) return;
    ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
  };
  walk(a, b, []);
  return ops;
}

function arrIndex(seg, len, allowEnd, path) {
  if (allowEnd && seg === '-') return len;
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) throw applyFail(`chỉ số mảng không hợp lệ tại ${path}`);
  const i = Number(seg);
  if (i > len || (!allowEnd && i === len)) throw applyFail(`chỉ số mảng ngoài phạm vi tại ${path}`);
  return i;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    let segs;
    try {
      segs = parsePointer(o.path);
    } catch (e) {
      throw applyFail(`path không hợp lệ: ${o.path}`);
    }
    if (segs.length === 0) {
      if (o.op === 'add' || o.op === 'replace') { root = clone(o.value); continue; }
      throw applyFail('không thể remove gốc');
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(cur)) cur = cur[arrIndex(s, cur.length, false, o.path)];
      else if (isObj(cur) && has(cur, s)) cur = cur[s];
      else throw applyFail(`đường dẫn không tồn tại: ${o.path}`);
    }
    if (cur === null || typeof cur !== 'object') throw applyFail(`đường dẫn không tồn tại: ${o.path}`);
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (o.op === 'add') cur.splice(arrIndex(last, cur.length, true, o.path), 0, clone(o.value));
      else if (o.op === 'remove') cur.splice(arrIndex(last, cur.length, false, o.path), 1);
      else if (o.op === 'replace') cur[arrIndex(last, cur.length, false, o.path)] = clone(o.value);
      else throw applyFail(`thao tác không hợp lệ: ${o.op}`);
    } else {
      if (o.op === 'add') {
        if (has(cur, last)) throw applyFail(`khóa đã tồn tại: ${o.path}`);
        setKey(cur, last, clone(o.value));
      } else if (o.op === 'remove') {
        if (!has(cur, last)) throw applyFail(`khóa không tồn tại: ${o.path}`);
        delete cur[last];
      } else if (o.op === 'replace') {
        if (!has(cur, last)) throw applyFail(`khóa không tồn tại: ${o.path}`);
        setKey(cur, last, clone(o.value));
      } else throw applyFail(`thao tác không hợp lệ: ${o.op}`);
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
  for (const o of ops) if (has(r, o.op)) r[o.op]++;
  return r;
}
