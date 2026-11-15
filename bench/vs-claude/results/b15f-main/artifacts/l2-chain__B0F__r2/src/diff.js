// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

const loi = (code, message) => Object.assign(new Error(message), { code });
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);

function clone(x) {
  if (Array.isArray(x)) return x.map(clone);
  if (isObj(x)) {
    const r = {};
    for (const k of Object.keys(x)) Object.defineProperty(r, k, { value: clone(x[k]), enumerable: true, writable: true, configurable: true });
    return r;
  }
  return x;
}

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  if (/~(?![01])/.test(s)) throw loi('DIFF_BAD_POINTER', `escape sai trong đoạn: ${s}`);
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (typeof pointer !== 'string') throw loi('DIFF_BAD_POINTER', 'pointer phải là chuỗi');
  if (pointer === '') return [];
  if (pointer[0] !== '/') throw loi('DIFF_BAD_POINTER', `pointer phải bắt đầu bằng "/": ${pointer}`);
  return pointer.slice(1).split('/').map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, segs) => {
    const path = formatPointer(segs);
    if (isObj(x) && isObj(y)) {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const p = [...segs, k];
        if (!has(y, k)) ops.push({ op: 'remove', path: formatPointer(p), oldValue: clone(x[k]) });
        else if (!has(x, k)) ops.push({ op: 'add', path: formatPointer(p), value: clone(y[k]) });
        else walk(x[k], y[k], p);
      }
    } else if (Array.isArray(x) && Array.isArray(y)) {
      const n = Math.min(x.length, y.length);
      for (let i = 0; i < n; i++) walk(x[i], y[i], [...segs, i]);
      for (let i = n; i < y.length; i++) ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      for (let i = x.length - 1; i >= n; i--) ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
    } else if (x !== y) {
      ops.push({ op: 'replace', path, oldValue: clone(x), value: clone(y) });
    }
  };
  walk(a, b, []);
  return ops;
}

const fail = (msg) => loi('DIFF_APPLY_FAILED', msg);
const isIndex = (s) => /^(0|[1-9]\d*)$/.test(s);

function setKey(o, k, v) {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    let segs;
    try { segs = parsePointer(o.path); } catch (e) { throw fail(`đường dẫn sai: ${o.path}`); }
    if (segs.length === 0) {
      if (o.op === 'replace' || o.op === 'add') { root = clone(o.value); continue; }
      throw fail('không thể remove gốc');
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(cur)) {
        if (!isIndex(s) || Number(s) >= cur.length) throw fail(`không có đường dẫn: ${o.path}`);
        cur = cur[Number(s)];
      } else if (isObj(cur)) {
        if (!has(cur, s)) throw fail(`không có đường dẫn: ${o.path}`);
        cur = cur[s];
      } else throw fail(`không có đường dẫn: ${o.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (!isIndex(last)) throw fail(`chỉ số sai: ${o.path}`);
      const idx = Number(last);
      if (o.op === 'add') {
        if (idx > cur.length) throw fail(`chỉ số vượt: ${o.path}`);
        cur.splice(idx, 0, clone(o.value));
      } else {
        if (idx >= cur.length) throw fail(`chỉ số không có: ${o.path}`);
        if (o.op === 'remove') cur.splice(idx, 1);
        else if (o.op === 'replace') cur[idx] = clone(o.value);
        else throw fail(`op không hợp lệ: ${o.op}`);
      }
    } else if (isObj(cur)) {
      if (o.op === 'add') {
        if (has(cur, last)) throw fail(`khóa đã có: ${o.path}`);
        setKey(cur, last, clone(o.value));
      } else if (o.op === 'remove' || o.op === 'replace') {
        if (!has(cur, last)) throw fail(`khóa không có: ${o.path}`);
        if (o.op === 'remove') delete cur[last];
        else setKey(cur, last, clone(o.value));
      } else throw fail(`op không hợp lệ: ${o.op}`);
    } else throw fail(`cha không phải container: ${o.path}`);
  }
  return root;
}

export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  return ops.map((o) => {
    const p = o.path === '' ? '(root)' : o.path;
    if (o.op === 'add') return `+ ${p} = ${JSON.stringify(o.value)}`;
    if (o.op === 'remove') return `- ${p} = ${JSON.stringify(o.oldValue)}`;
    return `~ ${p}: ${JSON.stringify(o.oldValue)} -> ${JSON.stringify(o.value)}`;
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
