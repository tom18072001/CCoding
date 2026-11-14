// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

function loi(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const kind = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x === 'object' ? 'object' : 'scalar');

function setKey(o, k, v) {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function clone(x) {
  if (Array.isArray(x)) return x.map(clone);
  if (isObj(x)) {
    const o = {};
    for (const k of Object.keys(x)) setKey(o, k, clone(x[k]));
    return o;
  }
  return x;
}

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  if (/~(?![01])/.test(s)) throw loi('DIFF_BAD_POINTER', `escape sai trong đoạn con trỏ: ${s}`);
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') {
    throw loi('DIFF_BAD_POINTER', `con trỏ phải bắt đầu bằng '/': ${String(pointer)}`);
  }
  return pointer.slice(1).split('/').map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, segs) => {
    const kx = kind(x);
    const ky = kind(y);
    if (kx === 'object' && ky === 'object') {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const inX = Object.hasOwn(x, k);
        const inY = Object.hasOwn(y, k);
        const p = [...segs, k];
        if (inX && !inY) ops.push({ op: 'remove', path: formatPointer(p), oldValue: clone(x[k]) });
        else if (!inX && inY) ops.push({ op: 'add', path: formatPointer(p), value: clone(y[k]) });
        else walk(x[k], y[k], p);
      }
    } else if (kx === 'array' && ky === 'array') {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) walk(x[i], y[i], [...segs, i]);
      for (let i = m; i < y.length; i++) {
        ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      }
      for (let i = x.length - 1; i >= m; i--) {
        ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
      }
    } else if (kx !== ky || (kx === 'scalar' && x !== y)) {
      ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
    }
  };
  walk(a, b, []);
  return ops;
}

function fail(msg) {
  return loi('DIFF_APPLY_FAILED', msg);
}

function arrIndex(seg, max, path) {
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) throw fail(`chỉ số mảng không hợp lệ tại ${path}`);
  const n = Number(seg);
  if (n > max) throw fail(`chỉ số mảng ngoài phạm vi tại ${path}`);
  return n;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    const segs = parsePointer(o.path);
    if (segs.length === 0) {
      if (o.op === 'replace' || o.op === 'add') root = clone(o.value);
      else throw fail('không thể xóa gốc');
      continue;
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(cur)) {
        cur = cur[arrIndex(s, cur.length - 1, o.path)];
      } else if (isObj(cur) && Object.hasOwn(cur, s)) {
        cur = cur[s];
      } else throw fail(`không tìm thấy đường dẫn ${o.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (o.op === 'add') {
        cur.splice(arrIndex(last, cur.length, o.path), 0, clone(o.value));
      } else if (o.op === 'remove') {
        cur.splice(arrIndex(last, cur.length - 1, o.path), 1);
      } else if (o.op === 'replace') {
        cur[arrIndex(last, cur.length - 1, o.path)] = clone(o.value);
      } else throw fail(`thao tác không hợp lệ: ${o.op}`);
    } else if (isObj(cur)) {
      const has = Object.hasOwn(cur, last);
      if (o.op === 'add') {
        if (has) throw fail(`khóa đã có tại ${o.path}`);
        setKey(cur, last, clone(o.value));
      } else if (o.op === 'remove') {
        if (!has) throw fail(`không có khóa tại ${o.path}`);
        delete cur[last];
      } else if (o.op === 'replace') {
        if (!has) throw fail(`không có khóa tại ${o.path}`);
        setKey(cur, last, clone(o.value));
      } else throw fail(`thao tác không hợp lệ: ${o.op}`);
    } else throw fail(`đích không phải đối tượng/mảng tại ${o.path}`);
  }
  return root;
}

export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  const j = (x) => JSON.stringify(x);
  return ops
    .map((o) => {
      const p = o.path === '' ? '(root)' : o.path;
      if (o.op === 'add') return `+ ${p} = ${j(o.value)}`;
      if (o.op === 'remove') return `- ${p} = ${j(o.oldValue)}`;
      return `~ ${p}: ${j(o.oldValue)} -> ${j(o.value)}`;
    })
    .join('\n');
}

export function formatJson(ops) {
  return JSON.stringify(ops, null, 2);
}

export function summarize(ops) {
  const r = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) if (o.op in r) r[o.op]++;
  return r;
}
