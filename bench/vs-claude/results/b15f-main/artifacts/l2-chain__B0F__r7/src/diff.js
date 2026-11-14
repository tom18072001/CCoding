// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.
// Chỉ export đúng 9 hàm công khai; helper nội bộ không export.

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function setKey(o, k, v) {
  Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
}

function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (isObj(v)) {
    const r = {};
    for (const k of Object.keys(v)) setKey(r, k, clone(v[k]));
    return r;
  }
  return v;
}

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '~' && s[i + 1] !== '0' && s[i + 1] !== '1') {
      throw err('DIFF_BAD_POINTER', `JSON Pointer có escape sai: ${JSON.stringify(s)}`);
    }
  }
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (typeof pointer !== 'string') throw err('DIFF_BAD_POINTER', 'JSON Pointer phải là chuỗi');
  if (pointer === '') return [];
  if (pointer[0] !== '/') throw err('DIFF_BAD_POINTER', `JSON Pointer phải bắt đầu bằng "/": ${JSON.stringify(pointer)}`);
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
        if (!has(y, k)) ops.push({ op: 'remove', path: formatPointer(p), oldValue: clone(x[k]) });
        else if (!has(x, k)) ops.push({ op: 'add', path: formatPointer(p), value: clone(y[k]) });
        else walk(x[k], y[k], p);
      }
      return;
    }
    if (Array.isArray(x) && Array.isArray(y)) {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) walk(x[i], y[i], [...segs, i]);
      for (let i = m; i < y.length; i++) ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      for (let i = x.length - 1; i >= m; i--) ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
      return;
    }
    if (x === y) return;
    ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
  };
  walk(a, b, []);
  return ops;
}

function fail(op, why) {
  return err('DIFF_APPLY_FAILED', `Không áp dụng được ${op.op} tại "${op.path}": ${why}`);
}

function toIndex(seg) {
  return /^(0|[1-9][0-9]*)$/.test(seg) ? Number(seg) : -1;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const op of ops) {
    let segs;
    try {
      segs = parsePointer(op.path);
    } catch (e) {
      throw fail(op, 'đường dẫn sai');
    }
    if (op.op !== 'add' && op.op !== 'remove' && op.op !== 'replace') throw fail(op, 'thao tác không hợp lệ');
    if (segs.length === 0) {
      if (op.op === 'remove') throw fail(op, 'không thể xóa gốc');
      root = clone(op.value);
      continue;
    }
    let parent = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(parent)) {
        const idx = toIndex(s);
        if (idx < 0 || idx >= parent.length) throw fail(op, 'không tìm thấy đường dẫn');
        parent = parent[idx];
      } else if (isObj(parent) && has(parent, s)) parent = parent[s];
      else throw fail(op, 'không tìm thấy đường dẫn');
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(parent)) {
      const idx = toIndex(last);
      if (idx < 0) throw fail(op, 'chỉ số mảng sai');
      if (op.op === 'add') {
        if (idx > parent.length) throw fail(op, 'chỉ số vượt độ dài');
        parent.splice(idx, 0, clone(op.value));
      } else {
        if (idx >= parent.length) throw fail(op, 'chỉ số không tồn tại');
        if (op.op === 'remove') parent.splice(idx, 1);
        else parent[idx] = clone(op.value);
      }
    } else if (isObj(parent)) {
      const exists = has(parent, last);
      if (op.op === 'add') {
        if (exists) throw fail(op, 'khóa đã có');
        setKey(parent, last, clone(op.value));
      } else {
        if (!exists) throw fail(op, 'khóa không tồn tại');
        if (op.op === 'remove') delete parent[last];
        else setKey(parent, last, clone(op.value));
      }
    } else {
      throw fail(op, 'cha không phải đối tượng/mảng');
    }
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
  const r = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) if (has(r, o.op)) r[o.op]++;
  return r;
}
