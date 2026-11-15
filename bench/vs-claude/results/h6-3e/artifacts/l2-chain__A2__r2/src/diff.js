// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

const fail = (code, message) => Object.assign(new Error(message), { code });
const isObj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);

function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
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

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  if (/~(?![01])/.test(seg)) throw fail('DIFF_BAD_POINTER', `Escape sai trong con trỏ: ${seg}`);
  return seg.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') throw fail('DIFF_BAD_POINTER', `Con trỏ sai: ${pointer}`);
  return pointer.slice(1).split('/').map(unescapePointer);
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
        const p = formatPointer([...segs, k]);
        if (inX && !inY) ops.push({ op: 'remove', path: p, oldValue: clone(x[k]) });
        else if (!inX && inY) ops.push({ op: 'add', path: p, value: clone(y[k]) });
        else rec(x[k], y[k], [...segs, k]);
      }
      return;
    }
    if (Array.isArray(x) && Array.isArray(y)) {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) rec(x[i], y[i], [...segs, i]);
      for (let i = m; i < y.length; i++) ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      for (let i = x.length - 1; i >= m; i--) ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
      return;
    }
    if (x !== y) ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
  };
  rec(a, b, []);
  return ops;
}

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    const segs = parsePointer(o.path);
    if (o.op !== 'add' && o.op !== 'remove' && o.op !== 'replace') throw fail('DIFF_APPLY_FAILED', `Thao tác lạ: ${o.op}`);
    if (segs.length === 0) {
      if (o.op === 'remove') throw fail('DIFF_APPLY_FAILED', 'Không thể xóa gốc');
      root = clone(o.value);
      continue;
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(cur) && INDEX_RE.test(s) && Number(s) < cur.length) cur = cur[Number(s)];
      else if (isObj(cur) && Object.hasOwn(cur, s)) cur = cur[s];
      else throw fail('DIFF_APPLY_FAILED', `Đường dẫn không tồn tại: ${o.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (!INDEX_RE.test(last)) throw fail('DIFF_APPLY_FAILED', `Chỉ số sai: ${o.path}`);
      const i = Number(last);
      if (o.op === 'add') {
        if (i > cur.length) throw fail('DIFF_APPLY_FAILED', `Chỉ số vượt: ${o.path}`);
        cur.splice(i, 0, clone(o.value));
      } else {
        if (i >= cur.length) throw fail('DIFF_APPLY_FAILED', `Chỉ số không có: ${o.path}`);
        if (o.op === 'remove') cur.splice(i, 1);
        else cur[i] = clone(o.value);
      }
    } else if (isObj(cur)) {
      const has = Object.hasOwn(cur, last);
      if (o.op === 'add') {
        if (has) throw fail('DIFF_APPLY_FAILED', `Khóa đã có: ${o.path}`);
        setOwn(cur, last, clone(o.value));
      } else {
        if (!has) throw fail('DIFF_APPLY_FAILED', `Khóa không có: ${o.path}`);
        if (o.op === 'remove') delete cur[last];
        else setOwn(cur, last, clone(o.value));
      }
    } else throw fail('DIFF_APPLY_FAILED', `Không phải vùng chứa: ${o.path}`);
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
  for (const o of ops) r[o.op]++;
  return r;
}
