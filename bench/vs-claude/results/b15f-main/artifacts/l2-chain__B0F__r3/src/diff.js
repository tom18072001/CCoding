// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

function loi(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function setOwn(o, k, v) {
  Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
}

function clone(x) {
  if (Array.isArray(x)) return x.map(clone);
  if (isObj(x)) {
    const r = {};
    for (const k of Object.keys(x)) setOwn(r, k, clone(x[k]));
    return r;
  }
  return x;
}

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  if (/~(?![01])/.test(s)) throw loi('DIFF_BAD_POINTER', `escape sai trong đoạn pointer: ${s}`);
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
        const inX = own(x, k);
        const inY = own(y, k);
        if (inX && !inY) ops.push({ op: 'remove', path: formatPointer([...segs, k]), oldValue: clone(x[k]) });
        else if (!inX && inY) ops.push({ op: 'add', path: formatPointer([...segs, k]), value: clone(y[k]) });
        else walk(x[k], y[k], [...segs, k]);
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
    // khác loại hoặc vô hướng khác nhau
    ops.push({ op: 'replace', path, oldValue: clone(x), value: clone(y) });
  };
  walk(a, b, []);
  return ops;
}

function fail(msg) {
  return loi('DIFF_APPLY_FAILED', msg);
}

function arrIndex(seg, max, path) {
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) throw fail(`chỉ số mảng không hợp lệ tại ${path}`);
  const n = Number(seg);
  if (n > max) throw fail(`chỉ số mảng ngoài phạm vi tại ${path}`);
  return n;
}

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    const segs = parsePointer(o.path);
    if (segs.length === 0) {
      if (o.op === 'remove') throw fail('không thể xóa gốc');
      if (o.op !== 'add' && o.op !== 'replace') throw fail(`op không hợp lệ: ${o.op}`);
      root = clone(o.value);
      continue;
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(cur)) cur = cur[arrIndex(s, cur.length - 1, o.path)];
      else if (isObj(cur) && own(cur, s)) cur = cur[s];
      else throw fail(`không tìm thấy đường dẫn ${o.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (o.op === 'add') cur.splice(arrIndex(last, cur.length, o.path), 0, clone(o.value));
      else if (o.op === 'remove') cur.splice(arrIndex(last, cur.length - 1, o.path), 1);
      else if (o.op === 'replace') cur[arrIndex(last, cur.length - 1, o.path)] = clone(o.value);
      else throw fail(`op không hợp lệ: ${o.op}`);
    } else if (isObj(cur)) {
      if (o.op === 'add') {
        if (own(cur, last)) throw fail(`khóa đã có tại ${o.path}`);
        setOwn(cur, last, clone(o.value));
      } else if (o.op === 'remove') {
        if (!own(cur, last)) throw fail(`khóa không có tại ${o.path}`);
        delete cur[last];
      } else if (o.op === 'replace') {
        if (!own(cur, last)) throw fail(`khóa không có tại ${o.path}`);
        setOwn(cur, last, clone(o.value));
      } else throw fail(`op không hợp lệ: ${o.op}`);
    } else {
      throw fail(`cha không phải đối tượng/mảng tại ${o.path}`);
    }
  }
  return root;
}

export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  const J = (x) => JSON.stringify(x);
  return ops.map((o) => {
    const p = o.path === '' ? '(root)' : o.path;
    if (o.op === 'add') return `+ ${p} = ${J(o.value)}`;
    if (o.op === 'remove') return `- ${p} = ${J(o.oldValue)}`;
    return `~ ${p}: ${J(o.oldValue)} -> ${J(o.value)}`;
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
