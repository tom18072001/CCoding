// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

function loi(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function setOwn(o, k, v) {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function clone(x) {
  if (Array.isArray(x)) return x.map(clone);
  if (x !== null && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x)) setOwn(o, k, clone(x[k]));
    return o;
  }
  return x;
}

const loai = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x);

// ---- JSON Pointer ----
export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  if (/~(?![01])/.test(s)) throw loi('DIFF_BAD_POINTER', `JSON Pointer sai: escape không hợp lệ trong "${s}"`);
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

// ---- diff ----
export function diff(a, b) {
  const ops = [];
  walk(a, b, [], ops);
  return ops;
}

function walk(x, y, segs, ops) {
  const tx = loai(x);
  const ty = loai(y);
  if (tx === 'object' && ty === 'object') {
    const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
    for (const k of keys) {
      const p = [...segs, k];
      if (!has(y, k)) ops.push({ op: 'remove', path: formatPointer(p), oldValue: clone(x[k]) });
      else if (!has(x, k)) ops.push({ op: 'add', path: formatPointer(p), value: clone(y[k]) });
      else walk(x[k], y[k], p, ops);
    }
    return;
  }
  if (tx === 'array' && ty === 'array') {
    const n = Math.min(x.length, y.length);
    for (let i = 0; i < n; i++) walk(x[i], y[i], [...segs, i], ops);
    for (let i = n; i < y.length; i++) ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
    for (let i = x.length - 1; i >= n; i--) ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
    return;
  }
  if (tx !== ty || (tx !== 'object' && tx !== 'array' && x !== y)) {
    ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
  }
}

// ---- applyDiff ----
function fail(msg) {
  return loi('DIFF_APPLY_FAILED', msg);
}

function arrIndex(seg, max, path) {
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) throw fail(`chỉ số mảng không hợp lệ tại ${path}`);
  const i = Number(seg);
  if (i > max) throw fail(`chỉ số mảng ngoài phạm vi tại ${path}`);
  return i;
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
    if (o.op !== 'add' && o.op !== 'remove' && o.op !== 'replace') throw fail(`thao tác không hợp lệ: ${o.op}`);
    if (segs.length === 0) {
      if (o.op === 'remove') throw fail('không thể remove gốc');
      root = clone(o.value);
      continue;
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(cur)) cur = cur[arrIndex(s, cur.length - 1, o.path)];
      else if (cur !== null && typeof cur === 'object' && has(cur, s)) cur = cur[s];
      else throw fail(`không tìm thấy đường dẫn ${o.path}`);
      if (cur === undefined) throw fail(`không tìm thấy đường dẫn ${o.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (o.op === 'add') {
        cur.splice(arrIndex(last, cur.length, o.path), 0, clone(o.value));
      } else {
        const i = arrIndex(last, cur.length - 1, o.path);
        if (i >= cur.length) throw fail(`chỉ số không có tại ${o.path}`);
        if (o.op === 'remove') cur.splice(i, 1);
        else cur[i] = clone(o.value);
      }
    } else if (cur !== null && typeof cur === 'object') {
      const co = has(cur, last);
      if (o.op === 'add') {
        if (co) throw fail(`khóa đã có tại ${o.path}`);
        setOwn(cur, last, clone(o.value));
      } else {
        if (!co) throw fail(`khóa không có tại ${o.path}`);
        if (o.op === 'remove') delete cur[last];
        else setOwn(cur, last, clone(o.value));
      }
    } else {
      throw fail(`không tìm thấy đường dẫn ${o.path}`);
    }
  }
  return root;
}

// ---- định dạng ----
export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  const p = (o) => (o.path === '' ? '(root)' : o.path);
  return ops
    .map((o) => {
      if (o.op === 'add') return `+ ${p(o)} = ${JSON.stringify(o.value)}`;
      if (o.op === 'remove') return `- ${p(o)} = ${JSON.stringify(o.oldValue)}`;
      return `~ ${p(o)}: ${JSON.stringify(o.oldValue)} -> ${JSON.stringify(o.value)}`;
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
