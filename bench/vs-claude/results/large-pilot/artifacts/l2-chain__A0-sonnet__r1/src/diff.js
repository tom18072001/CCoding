// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

const diffError = (code, message) => Object.assign(new Error(message), { code });
const badPointer = (m) => diffError('DIFF_BAD_POINTER', m);
const applyFailed = (m) => diffError('DIFF_APPLY_FAILED', m);

const isObj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
const INDEX_RE = /^(0|[1-9][0-9]*)$/;

const setOwn = (o, k, v) =>
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });

function clone(x) {
  if (Array.isArray(x)) return x.map(clone);
  if (isObj(x)) {
    const o = {};
    for (const k of Object.keys(x)) setOwn(o, k, clone(x[k]));
    return o;
  }
  return x;
}

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  if (/~(?![01])/.test(seg)) throw badPointer(`Escape sai trong đoạn con trỏ: ${seg}`);
  return seg.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') throw badPointer(`Con trỏ không hợp lệ: ${pointer}`);
  return pointer.split('/').slice(1).map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

export function diff(a, b) {
  const ops = [];
  const rec = (x, y, segs) => {
    if (isObj(x) && isObj(y)) {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const inX = Object.hasOwn(x, k);
        const inY = Object.hasOwn(y, k);
        const p = [...segs, k];
        if (inX && !inY) ops.push({ op: 'remove', path: formatPointer(p), oldValue: clone(x[k]) });
        else if (!inX && inY) ops.push({ op: 'add', path: formatPointer(p), value: clone(y[k]) });
        else rec(x[k], y[k], p);
      }
    } else if (Array.isArray(x) && Array.isArray(y)) {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) rec(x[i], y[i], [...segs, i]);
      for (let i = m; i < y.length; i++) {
        ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      }
      for (let i = x.length - 1; i >= m; i--) {
        ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
      }
    } else if (!(x === y)) {
      ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
    }
  };
  rec(a, b, []);
  return ops;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    const segs = parsePointer(o.path);
    if (segs.length === 0) {
      if (o.op === 'add' || o.op === 'replace') root = clone(o.value);
      else throw applyFailed('Không thể xóa gốc');
      continue;
    }
    let parent = root;
    for (const s of segs.slice(0, -1)) {
      if (Array.isArray(parent)) {
        if (!INDEX_RE.test(s) || Number(s) >= parent.length) throw applyFailed(`Không có đường dẫn: ${o.path}`);
        parent = parent[Number(s)];
      } else if (isObj(parent)) {
        if (!Object.hasOwn(parent, s)) throw applyFailed(`Không có đường dẫn: ${o.path}`);
        parent = parent[s];
      } else {
        throw applyFailed(`Không có đường dẫn: ${o.path}`);
      }
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(parent)) {
      if (o.op === 'add') {
        const idx = last === '-' ? parent.length : INDEX_RE.test(last) ? Number(last) : -1;
        if (idx < 0 || idx > parent.length) throw applyFailed(`Chỉ số không hợp lệ: ${o.path}`);
        parent.splice(idx, 0, clone(o.value));
      } else {
        if (!INDEX_RE.test(last) || Number(last) >= parent.length) throw applyFailed(`Không có đường dẫn: ${o.path}`);
        if (o.op === 'remove') parent.splice(Number(last), 1);
        else if (o.op === 'replace') parent[Number(last)] = clone(o.value);
        else throw applyFailed(`Thao tác không hợp lệ: ${o.op}`);
      }
    } else if (isObj(parent)) {
      const has = Object.hasOwn(parent, last);
      if (o.op === 'add') {
        if (has) throw applyFailed(`Khóa đã có: ${o.path}`);
        setOwn(parent, last, clone(o.value));
      } else if (o.op === 'remove' || o.op === 'replace') {
        if (!has) throw applyFailed(`Không có đường dẫn: ${o.path}`);
        if (o.op === 'remove') delete parent[last];
        else setOwn(parent, last, clone(o.value));
      } else {
        throw applyFailed(`Thao tác không hợp lệ: ${o.op}`);
      }
    } else {
      throw applyFailed(`Không có đường dẫn: ${o.path}`);
    }
  }
  return root;
}

export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  const show = (p) => (p === '' ? '(root)' : p);
  return ops
    .map((o) => {
      if (o.op === 'add') return `+ ${show(o.path)} = ${JSON.stringify(o.value)}`;
      if (o.op === 'remove') return `- ${show(o.path)} = ${JSON.stringify(o.oldValue)}`;
      return `~ ${show(o.path)}: ${JSON.stringify(o.oldValue)} -> ${JSON.stringify(o.value)}`;
    })
    .join('\n');
}

export function formatJson(ops) {
  return JSON.stringify(ops, null, 2);
}

export function summarize(ops) {
  const s = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) if (Object.hasOwn(s, o.op)) s[o.op]++;
  return s;
}
