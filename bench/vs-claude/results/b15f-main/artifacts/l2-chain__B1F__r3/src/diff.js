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
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '~') {
      const n = s[i + 1];
      if (n !== '0' && n !== '1') throw loi('DIFF_BAD_POINTER', `escape sai trong con trỏ: ${s}`);
      i++;
    }
  }
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') {
    throw loi('DIFF_BAD_POINTER', `con trỏ phải bắt đầu bằng '/': ${pointer}`);
  }
  return pointer.slice(1).split('/').map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, path) => {
    if (isObj(x) && isObj(y)) {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const p = path + '/' + escapePointer(k);
        const hx = Object.hasOwn(x, k);
        const hy = Object.hasOwn(y, k);
        if (hx && !hy) ops.push({ op: 'remove', path: p, oldValue: clone(x[k]) });
        else if (!hx && hy) ops.push({ op: 'add', path: p, value: clone(y[k]) });
        else walk(x[k], y[k], p);
      }
    } else if (Array.isArray(x) && Array.isArray(y)) {
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

function setKey(o, k, v) {
  Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
}

function arrIndex(seg, max) {
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) return -1;
  const n = Number(seg);
  return n <= max ? n : -1;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  const fail = (msg) => { throw loi('DIFF_APPLY_FAILED', msg); };
  for (const o of ops) {
    const segs = parsePointer(o.path);
    if (segs.length === 0) {
      if (o.op === 'remove') fail('không thể remove gốc');
      root = clone(o.value);
      continue;
    }
    let parent = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(parent)) {
        const n = arrIndex(s, parent.length - 1);
        if (n < 0) fail(`không có đường dẫn ${o.path}`);
        parent = parent[n];
      } else if (isObj(parent) && Object.hasOwn(parent, s)) {
        parent = parent[s];
      } else fail(`không có đường dẫn ${o.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(parent)) {
      if (o.op === 'add') {
        const n = last === '-' ? parent.length : arrIndex(last, parent.length);
        if (n < 0) fail(`chỉ số sai: ${o.path}`);
        parent.splice(n, 0, clone(o.value));
      } else {
        const n = arrIndex(last, parent.length - 1);
        if (n < 0) fail(`chỉ số không có: ${o.path}`);
        if (o.op === 'remove') parent.splice(n, 1);
        else if (o.op === 'replace') parent[n] = clone(o.value);
        else fail(`op không hợp lệ: ${o.op}`);
      }
    } else if (isObj(parent)) {
      const has = Object.hasOwn(parent, last);
      if (o.op === 'add') {
        if (has) fail(`khóa đã có: ${o.path}`);
        setKey(parent, last, clone(o.value));
      } else if (o.op === 'remove') {
        if (!has) fail(`khóa không có: ${o.path}`);
        delete parent[last];
      } else if (o.op === 'replace') {
        if (!has) fail(`khóa không có: ${o.path}`);
        setKey(parent, last, clone(o.value));
      } else fail(`op không hợp lệ: ${o.op}`);
    } else fail(`đích không phải container: ${o.path}`);
  }
  return root;
}

export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  const j = JSON.stringify;
  return ops.map((o) => {
    const p = o.path === '' ? '(root)' : o.path;
    if (o.op === 'add') return `+ ${p} = ${j(o.value)}`;
    if (o.op === 'remove') return `- ${p} = ${j(o.oldValue)}`;
    return `~ ${p}: ${j(o.oldValue)} -> ${j(o.value)}`;
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
