// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const IDX = /^(0|[1-9][0-9]*)$/;

function codeError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}
const badPointer = (m) => codeError('DIFF_BAD_POINTER', m);
const applyFailed = (m) => codeError('DIFF_APPLY_FAILED', m);

const setOwn = (obj, key, value) =>
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  if (/~(?![01])/.test(s)) throw badPointer(`Escape sai trong đoạn pointer: ${s}`);
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') throw badPointer(`Pointer không bắt đầu bằng "/": ${pointer}`);
  return pointer.split('/').slice(1).map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

function kind(x) {
  if (x === null) return 'null';
  if (Array.isArray(x)) return 'array';
  return typeof x;
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

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, path) => {
    const kx = kind(x);
    const ky = kind(y);
    if (kx === 'object' && ky === 'object') {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const p = path + '/' + escapePointer(k);
        const inX = has(x, k);
        const inY = has(y, k);
        if (inX && !inY) ops.push({ op: 'remove', path: p, oldValue: clone(x[k]) });
        else if (!inX && inY) ops.push({ op: 'add', path: p, value: clone(y[k]) });
        else walk(x[k], y[k], p);
      }
    } else if (kx === 'array' && ky === 'array') {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) walk(x[i], y[i], `${path}/${i}`);
      for (let i = m; i < y.length; i++) ops.push({ op: 'add', path: `${path}/${i}`, value: clone(y[i]) });
      for (let i = x.length - 1; i >= m; i--) ops.push({ op: 'remove', path: `${path}/${i}`, oldValue: clone(x[i]) });
    } else if (kx !== ky || x !== y) {
      ops.push({ op: 'replace', path, oldValue: clone(x), value: clone(y) });
    }
  };
  walk(a, b, '');
  return ops;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const op of ops) {
    const segs = parsePointer(op.path);
    if (!['add', 'remove', 'replace'].includes(op.op)) throw applyFailed(`Thao tác lạ: ${op.op}`);
    if (segs.length === 0) {
      if (op.op === 'remove') throw applyFailed('Không thể remove gốc');
      root = clone(op.value);
      continue;
    }
    let parent = root;
    for (const seg of segs.slice(0, -1)) {
      if (Array.isArray(parent)) {
        if (!IDX.test(seg) || Number(seg) >= parent.length) throw applyFailed(`Không có đường dẫn: ${op.path}`);
        parent = parent[Number(seg)];
      } else if (parent !== null && typeof parent === 'object') {
        if (!has(parent, seg)) throw applyFailed(`Không có đường dẫn: ${op.path}`);
        parent = parent[seg];
      } else throw applyFailed(`Không có đường dẫn: ${op.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(parent)) {
      if (!IDX.test(last)) throw applyFailed(`Chỉ số mảng sai: ${op.path}`);
      const i = Number(last);
      if (op.op === 'add') {
        if (i > parent.length) throw applyFailed(`Chỉ số vượt quá: ${op.path}`);
        parent.splice(i, 0, clone(op.value));
      } else {
        if (i >= parent.length) throw applyFailed(`Chỉ số không tồn tại: ${op.path}`);
        if (op.op === 'remove') parent.splice(i, 1);
        else parent[i] = clone(op.value);
      }
    } else if (parent !== null && typeof parent === 'object') {
      const exists = has(parent, last);
      if (op.op === 'add') {
        if (exists) throw applyFailed(`Khóa đã tồn tại: ${op.path}`);
        setOwn(parent, last, clone(op.value));
      } else {
        if (!exists) throw applyFailed(`Khóa không tồn tại: ${op.path}`);
        if (op.op === 'remove') delete parent[last];
        else setOwn(parent, last, clone(op.value));
      }
    } else throw applyFailed(`Không có đường dẫn: ${op.path}`);
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
  const s = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) if (has(s, o.op)) s[o.op]++;
  return s;
}
