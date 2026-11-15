// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

function loi(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (v !== null && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) setOwn(out, k, clone(v[k]));
    return out;
  }
  return v;
}

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  if (/~(?![01])/.test(s)) throw loi('DIFF_BAD_POINTER', `JSON Pointer không hợp lệ: escape sai trong "${s}"`);
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') {
    throw loi('DIFF_BAD_POINTER', `JSON Pointer phải rỗng hoặc bắt đầu bằng "/": ${String(pointer)}`);
  }
  return pointer.slice(1).split('/').map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : 'scalar');

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, segs) => {
    const kx = kind(x);
    const ky = kind(y);
    const path = () => formatPointer(segs);
    if (kx === 'object' && ky === 'object') {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const inX = hasOwn(x, k);
        const inY = hasOwn(y, k);
        const p = [...segs, k];
        if (inX && !inY) ops.push({ op: 'remove', path: formatPointer(p), oldValue: clone(x[k]) });
        else if (!inX && inY) ops.push({ op: 'add', path: formatPointer(p), value: clone(y[k]) });
        else walk(x[k], y[k], p);
      }
    } else if (kx === 'array' && ky === 'array') {
      const n = Math.min(x.length, y.length);
      for (let i = 0; i < n; i++) walk(x[i], y[i], [...segs, i]);
      for (let i = n; i < y.length; i++) {
        ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      }
      for (let i = x.length - 1; i >= n; i--) {
        ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
      }
    } else if (kx !== ky || x !== y) {
      ops.push({ op: 'replace', path: path(), oldValue: clone(x), value: clone(y) });
    }
  };
  walk(a, b, []);
  return ops;
}

const fail = (msg) => loi('DIFF_APPLY_FAILED', msg);
const INDEX = /^(0|[1-9][0-9]*)$/;

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    const segs = parsePointer(o.path);
    if (segs.length === 0) {
      if (o.op === 'add' || o.op === 'replace') root = clone(o.value);
      else fail(`Không thể ${o.op} gốc`);
      continue;
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(cur)) {
        if (!INDEX.test(s) || Number(s) >= cur.length) throw fail(`Không tìm thấy đường dẫn ${o.path}`);
        cur = cur[Number(s)];
      } else if (cur !== null && typeof cur === 'object') {
        if (!hasOwn(cur, s)) throw fail(`Không tìm thấy đường dẫn ${o.path}`);
        cur = cur[s];
      } else {
        throw fail(`Không tìm thấy đường dẫn ${o.path}`);
      }
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (!INDEX.test(last)) throw fail(`Chỉ số mảng không hợp lệ: ${o.path}`);
      const idx = Number(last);
      if (o.op === 'add') {
        if (idx > cur.length) throw fail(`Chỉ số vượt quá độ dài mảng: ${o.path}`);
        cur.splice(idx, 0, clone(o.value));
      } else if (o.op === 'remove' || o.op === 'replace') {
        if (idx >= cur.length) throw fail(`Không có phần tử tại ${o.path}`);
        if (o.op === 'remove') cur.splice(idx, 1);
        else cur[idx] = clone(o.value);
      } else throw fail(`Thao tác không hợp lệ: ${o.op}`);
    } else if (cur !== null && typeof cur === 'object') {
      const has = hasOwn(cur, last);
      if (o.op === 'add') {
        if (has) throw fail(`Khóa đã có: ${o.path}`);
        setOwn(cur, last, clone(o.value));
      } else if (o.op === 'remove' || o.op === 'replace') {
        if (!has) throw fail(`Không có khóa: ${o.path}`);
        if (o.op === 'remove') delete cur[last];
        else setOwn(cur, last, clone(o.value));
      } else throw fail(`Thao tác không hợp lệ: ${o.op}`);
    } else {
      throw fail(`Không tìm thấy đường dẫn ${o.path}`);
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
  for (const o of ops) if (hasOwn(r, o.op)) r[o.op]++;
  return r;
}
