// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

const loi = (code, msg) => Object.assign(new Error(msg), { code });
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const kind = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x);

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

// ---- JSON Pointer ----
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
  if (pointer[0] !== '/') throw loi('DIFF_BAD_POINTER', `JSON Pointer phải bắt đầu bằng '/': ${pointer}`);
  return pointer.slice(1).split('/').map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

// ---- diff ----
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
    } else if (Array.isArray(x) && Array.isArray(y)) {
      const n = Math.min(x.length, y.length);
      for (let i = 0; i < n; i++) walk(x[i], y[i], [...segs, i]);
      for (let i = n; i < y.length; i++) {
        ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      }
      for (let i = x.length - 1; i >= n; i--) {
        ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
      }
    } else if (kind(x) !== kind(y) || x !== y) {
      ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
    }
  };
  walk(a, b, []);
  return ops;
}

// ---- applyDiff ----
const fail = (msg) => loi('DIFF_APPLY_FAILED', msg);

function arrIndex(seg, max, path) {
  if (!/^(0|[1-9]\d*)$/.test(seg)) throw fail(`chỉ số mảng không hợp lệ tại ${path}`);
  const i = Number(seg);
  if (i > max) throw fail(`chỉ số mảng ngoài phạm vi tại ${path}`);
  return i;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    let segs;
    try {
      segs = parsePointer(o && o.path);
    } catch (e) {
      throw fail(`path sai: ${e.message}`);
    }
    const kindOp = o.op;
    if (kindOp !== 'add' && kindOp !== 'remove' && kindOp !== 'replace') {
      throw fail(`op không hỗ trợ: ${String(kindOp)}`);
    }
    if (segs.length === 0) {
      if (kindOp === 'remove') throw fail('không thể remove gốc');
      root = clone(o.value);
      continue;
    }
    let parent = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(parent)) parent = parent[arrIndex(s, parent.length - 1, o.path)];
      else if (isObj(parent) && has(parent, s)) parent = parent[s];
      else throw fail(`không tìm thấy đường dẫn ${o.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(parent)) {
      if (kindOp === 'add') parent.splice(arrIndex(last, parent.length, o.path), 0, clone(o.value));
      else {
        const i = arrIndex(last, parent.length - 1, o.path);
        if (kindOp === 'remove') parent.splice(i, 1);
        else parent[i] = clone(o.value);
      }
    } else if (isObj(parent)) {
      const e = has(parent, last);
      if (kindOp === 'add') {
        if (e) throw fail(`khóa đã tồn tại: ${o.path}`);
        setKey(parent, last, clone(o.value));
      } else {
        if (!e) throw fail(`khóa không tồn tại: ${o.path}`);
        if (kindOp === 'remove') delete parent[last];
        else setKey(parent, last, clone(o.value));
      }
    } else {
      throw fail(`cha không phải mảng/đối tượng: ${o.path}`);
    }
  }
  return root;
}

// ---- định dạng ----
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
