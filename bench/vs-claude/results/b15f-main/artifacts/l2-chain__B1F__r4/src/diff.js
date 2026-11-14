// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

function loi(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : 'scalar');
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const setKey = (o, k, v) => Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });

function clone(v) {
  const k = kind(v);
  if (k === 'array') return v.map(clone);
  if (k === 'object') {
    const o = {};
    for (const key of Object.keys(v)) setKey(o, key, clone(v[key]));
    return o;
  }
  return v;
}

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '~') {
      const n = s[i + 1];
      if (n === '0') out += '~';
      else if (n === '1') out += '/';
      else throw loi('DIFF_BAD_POINTER', `JSON Pointer sai escape: "${s}"`);
      i++;
    } else out += c;
  }
  return out;
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

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, segs) => {
    const kx = kind(x);
    const ky = kind(y);
    if (kx !== ky || (kx === 'scalar' && x !== y)) {
      ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
      return;
    }
    if (kx === 'object') {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const inX = has(x, k);
        const inY = has(y, k);
        const p = [...segs, k];
        if (inX && !inY) ops.push({ op: 'remove', path: formatPointer(p), oldValue: clone(x[k]) });
        else if (!inX && inY) ops.push({ op: 'add', path: formatPointer(p), value: clone(y[k]) });
        else walk(x[k], y[k], p);
      }
    } else if (kx === 'array') {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) walk(x[i], y[i], [...segs, i]);
      for (let i = m; i < y.length; i++) ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      for (let i = x.length - 1; i >= m; i--) ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
    }
  };
  walk(a, b, []);
  return ops;
}

const fail = (msg) => loi('DIFF_APPLY_FAILED', msg);

function arrIndex(seg, max, what) {
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) throw fail(`${what}: chỉ số mảng không hợp lệ "${seg}"`);
  const i = Number(seg);
  if (i > max) throw fail(`${what}: chỉ số ${i} ngoài phạm vi`);
  return i;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    let segs;
    try {
      segs = parsePointer(o.path);
    } catch (e) {
      throw fail(`path không hợp lệ: ${JSON.stringify(o.path)}`);
    }
    if (segs.length === 0) {
      if (o.op === 'add' || o.op === 'replace') { root = clone(o.value); continue; }
      throw fail('không thể remove gốc');
    }
    let parent = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(parent)) parent = parent[arrIndex(s, parent.length - 1, o.path)];
      else if (kind(parent) === 'object' && has(parent, s)) parent = parent[s];
      else throw fail(`không tìm thấy đường dẫn: ${o.path}`);
    }
    const last = segs[segs.length - 1];
    const label = `${o.op} ${o.path}`;
    if (Array.isArray(parent)) {
      if (o.op === 'add') parent.splice(arrIndex(last, parent.length, label), 0, clone(o.value));
      else if (o.op === 'remove') parent.splice(arrIndex(last, parent.length - 1, label), 1);
      else if (o.op === 'replace') parent[arrIndex(last, parent.length - 1, label)] = clone(o.value);
      else throw fail(`thao tác không hỗ trợ: ${o.op}`);
    } else if (kind(parent) === 'object') {
      if (o.op === 'add') {
        if (has(parent, last)) throw fail(`${label}: khóa đã tồn tại`);
        setKey(parent, last, clone(o.value));
      } else if (o.op === 'remove' || o.op === 'replace') {
        if (!has(parent, last)) throw fail(`${label}: khóa không tồn tại`);
        if (o.op === 'remove') delete parent[last];
        else setKey(parent, last, clone(o.value));
      } else throw fail(`thao tác không hỗ trợ: ${o.op}`);
    } else throw fail(`${label}: cha không phải đối tượng/mảng`);
  }
  return root;
}

export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  const J = (x) => JSON.stringify(x);
  return ops
    .map((o) => {
      const p = o.path === '' ? '(root)' : o.path;
      if (o.op === 'add') return `+ ${p} = ${J(o.value)}`;
      if (o.op === 'remove') return `- ${p} = ${J(o.oldValue)}`;
      return `~ ${p}: ${J(o.oldValue)} -> ${J(o.value)}`;
    })
    .join('\n');
}

export function formatJson(ops) {
  return JSON.stringify(ops, null, 2);
}

export function summarize(ops) {
  const s = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) s[o.op]++;
  return s;
}
