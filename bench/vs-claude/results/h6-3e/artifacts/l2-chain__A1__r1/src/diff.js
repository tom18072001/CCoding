// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

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
  if (/~(?![01])/.test(s)) throw badPointer(`Escape sai trong con trỏ: ${s}`);
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (typeof pointer !== 'string') throw badPointer('Con trỏ phải là chuỗi');
  if (pointer === '') return [];
  if (pointer[0] !== '/') throw badPointer(`Con trỏ phải bắt đầu bằng "/": ${pointer}`);
  return pointer.split('/').slice(1).map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (v !== null && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) {
      Object.defineProperty(o, k, { value: clone(v[k]), enumerable: true, writable: true, configurable: true });
    }
    return o;
  }
  return v;
}

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

export function diff(a, b) {
  const ops = [];
  const rec = (x, y, segs) => {
    if (isObj(x) && isObj(y)) {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const p = [...segs, k];
        if (!has(y, k)) ops.push({ op: 'remove', path: formatPointer(p), oldValue: clone(x[k]) });
        else if (!has(x, k)) ops.push({ op: 'add', path: formatPointer(p), value: clone(y[k]) });
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
    } else if (x !== y) {
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
      if (op.op === 'add' || op.op === 'replace') root = clone(op.value);
      else throw applyFailed('Không thể remove gốc');
      continue;
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(cur) && INDEX_RE.test(s) && Number(s) < cur.length) cur = cur[Number(s)];
      else if (isObj(cur) && has(cur, s)) cur = cur[s];
      else throw applyFailed(`Đường dẫn không tồn tại: ${op.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (op.op === 'add') {
        const idx = last === '-' ? cur.length : INDEX_RE.test(last) ? Number(last) : -1;
        if (idx < 0 || idx > cur.length) throw applyFailed(`Chỉ số không hợp lệ: ${op.path}`);
        cur.splice(idx, 0, clone(op.value));
      } else {
        if (!INDEX_RE.test(last) || Number(last) >= cur.length) throw applyFailed(`Chỉ số không có: ${op.path}`);
        if (op.op === 'remove') cur.splice(Number(last), 1);
        else if (op.op === 'replace') cur[Number(last)] = clone(op.value);
        else throw applyFailed(`Thao tác lạ: ${op.op}`);
      }
    } else if (isObj(cur)) {
      const set = (v) =>
        Object.defineProperty(cur, last, { value: v, enumerable: true, writable: true, configurable: true });
      if (op.op === 'add') {
        if (has(cur, last)) throw applyFailed(`Khóa đã có: ${op.path}`);
        set(clone(op.value));
      } else if (op.op === 'remove') {
        if (!has(cur, last)) throw applyFailed(`Khóa không có: ${op.path}`);
        delete cur[last];
      } else if (op.op === 'replace') {
        if (!has(cur, last)) throw applyFailed(`Khóa không có: ${op.path}`);
        set(clone(op.value));
      } else throw applyFailed(`Thao tác lạ: ${op.op}`);
    } else throw applyFailed(`Không thể áp vào giá trị vô hướng: ${op.path}`);
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
  const s = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) if (has(s, o.op)) s[o.op]++;
  return s;
}
