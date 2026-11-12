// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

const loi = (code, msg) => Object.assign(new Error(msg), { code });
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
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
  if (/~(?![01])/.test(s)) throw loi('DIFF_BAD_POINTER', `escape không hợp lệ trong pointer: ${s}`);
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') {
    throw loi('DIFF_BAD_POINTER', `pointer phải bắt đầu bằng '/': ${pointer}`);
  }
  return pointer.slice(1).split('/').map(unescapePointer);
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
        if (!hasOwn(y, k)) ops.push({ op: 'remove', path: formatPointer(p), oldValue: clone(x[k]) });
        else if (!hasOwn(x, k)) ops.push({ op: 'add', path: formatPointer(p), value: clone(y[k]) });
        else walk(x[k], y[k], p);
      }
    } else if (Array.isArray(x) && Array.isArray(y)) {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) walk(x[i], y[i], [...segs, i]);
      for (let i = m; i < y.length; i++) {
        ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      }
      for (let i = x.length - 1; i >= m; i--) {
        ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
      }
    } else if (x !== y) {
      ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
    }
  };
  walk(a, b, []);
  return ops;
}

const fail = (msg) => loi('DIFF_APPLY_FAILED', msg);

function arrIndex(seg, max) {
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) return -1;
  const n = Number(seg);
  return n <= max ? n : -1;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    const segs = parsePointer(o.path);
    if (segs.length === 0) {
      if (o.op === 'add' || o.op === 'replace') { root = clone(o.value); continue; }
      throw fail('không thể remove gốc');
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(cur)) {
        const n = arrIndex(s, cur.length - 1);
        if (n < 0) throw fail(`không có đường dẫn ${o.path}`);
        cur = cur[n];
      } else if (isObj(cur) && hasOwn(cur, s)) cur = cur[s];
      else throw fail(`không có đường dẫn ${o.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (o.op === 'add') {
        const n = arrIndex(last, cur.length);
        if (n < 0) throw fail(`chỉ số không hợp lệ: ${o.path}`);
        cur.splice(n, 0, clone(o.value));
      } else {
        const n = arrIndex(last, cur.length - 1);
        if (n < 0) throw fail(`chỉ số không tồn tại: ${o.path}`);
        if (o.op === 'remove') cur.splice(n, 1);
        else if (o.op === 'replace') cur[n] = clone(o.value);
        else throw fail(`thao tác không hợp lệ: ${o.op}`);
      }
    } else if (isObj(cur)) {
      const has = hasOwn(cur, last);
      if (o.op === 'add') {
        if (has) throw fail(`khóa đã tồn tại: ${o.path}`);
        setKey(cur, last, clone(o.value));
      } else if (o.op === 'remove') {
        if (!has) throw fail(`khóa không tồn tại: ${o.path}`);
        delete cur[last];
      } else if (o.op === 'replace') {
        if (!has) throw fail(`khóa không tồn tại: ${o.path}`);
        setKey(cur, last, clone(o.value));
      } else throw fail(`thao tác không hợp lệ: ${o.op}`);
    } else throw fail(`không có đường dẫn ${o.path}`);
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
  for (const o of ops) r[o.op]++;
  return r;
}
