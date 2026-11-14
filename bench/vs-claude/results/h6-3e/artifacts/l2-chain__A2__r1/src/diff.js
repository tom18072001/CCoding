// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

function badPointer(msg) {
  const e = new Error(msg);
  e.code = 'DIFF_BAD_POINTER';
  return e;
}
function applyFailed(msg) {
  const e = new Error(msg);
  e.code = 'DIFF_APPLY_FAILED';
  return e;
}

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '~' && s[i + 1] !== '0' && s[i + 1] !== '1') throw badPointer(`Escape sai trong con trỏ: ${s}`);
  }
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') throw badPointer(`Con trỏ phải bắt đầu bằng "/": ${pointer}`);
  return pointer.split('/').slice(1).map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

const isObj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);

function setOwn(o, k, v) {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function clone(x) {
  if (Array.isArray(x)) return x.map(clone);
  if (isObj(x)) {
    const o = {};
    for (const k of Object.keys(x)) setOwn(o, k, clone(x[k]));
    return o;
  }
  return x;
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
      return;
    }
    if (Array.isArray(x) && Array.isArray(y)) {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) rec(x[i], y[i], [...segs, i]);
      for (let i = m; i < y.length; i++) ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      for (let i = x.length - 1; i >= m; i--) {
        ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
      }
      return;
    }
    if (x !== y) {
      ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
    }
  };
  rec(a, b, []);
  return ops;
}

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const op of ops) {
    const segs = parsePointer(op.path);
    if (segs.length === 0) {
      if (op.op === 'remove') throw applyFailed('Không thể xóa gốc');
      root = clone(op.value);
      continue;
    }
    let parent = root;
    for (const seg of segs.slice(0, -1)) {
      if (Array.isArray(parent)) {
        if (!INDEX_RE.test(seg) || Number(seg) >= parent.length) throw applyFailed(`Không có đường dẫn: ${op.path}`);
        parent = parent[Number(seg)];
      } else if (isObj(parent)) {
        if (!Object.hasOwn(parent, seg)) throw applyFailed(`Không có đường dẫn: ${op.path}`);
        parent = parent[seg];
      } else throw applyFailed(`Không có đường dẫn: ${op.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(parent)) {
      if (op.op === 'add') {
        const idx = last === '-' ? parent.length : INDEX_RE.test(last) ? Number(last) : -1;
        if (idx < 0 || idx > parent.length) throw applyFailed(`Chỉ số không hợp lệ: ${op.path}`);
        parent.splice(idx, 0, clone(op.value));
      } else {
        if (!INDEX_RE.test(last) || Number(last) >= parent.length) throw applyFailed(`Chỉ số không hợp lệ: ${op.path}`);
        if (op.op === 'remove') parent.splice(Number(last), 1);
        else parent[Number(last)] = clone(op.value);
      }
    } else if (isObj(parent)) {
      const has = Object.hasOwn(parent, last);
      if (op.op === 'add') {
        if (has) throw applyFailed(`Khóa đã tồn tại: ${op.path}`);
        setOwn(parent, last, clone(op.value));
      } else {
        if (!has) throw applyFailed(`Khóa không tồn tại: ${op.path}`);
        if (op.op === 'remove') delete parent[last];
        else setOwn(parent, last, clone(op.value));
      }
    } else throw applyFailed(`Không có đường dẫn: ${op.path}`);
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
  const r = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) r[o.op]++;
  return r;
}
