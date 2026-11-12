// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

function loi(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const loai = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  if (/~(?![01])/.test(s)) throw loi('DIFF_BAD_POINTER', `Escape sai trong JSON Pointer: ${s}`);
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') {
    throw loi('DIFF_BAD_POINTER', `JSON Pointer phải bắt đầu bằng "/": ${pointer}`);
  }
  return pointer.slice(1).split('/').map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, segs) => {
    const tx = loai(x);
    const ty = loai(y);
    if (tx === 'object' && ty === 'object') {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const p = [...segs, k];
        if (!has(y, k)) ops.push({ op: 'remove', path: formatPointer(p), oldValue: clone(x[k]) });
        else if (!has(x, k)) ops.push({ op: 'add', path: formatPointer(p), value: clone(y[k]) });
        else walk(x[k], y[k], p);
      }
    } else if (tx === 'array' && ty === 'array') {
      const n = Math.min(x.length, y.length);
      for (let i = 0; i < n; i++) walk(x[i], y[i], [...segs, i]);
      for (let i = n; i < y.length; i++) {
        ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      }
      for (let i = x.length - 1; i >= n; i--) {
        ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
      }
    } else if (tx !== ty || x !== y) {
      ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
    }
  };
  walk(a, b, []);
  return ops;
}

const fail = (msg) => loi('DIFF_APPLY_FAILED', msg);
const isIndex = (s) => /^(0|[1-9]\d*)$/.test(s);

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const o of ops) {
    const segs = parsePointer(o.path);
    if (segs.length === 0) {
      if (o.op === 'remove') throw fail('Không thể remove gốc');
      if (o.op !== 'add' && o.op !== 'replace') throw fail(`Thao tác không hợp lệ: ${o.op}`);
      root = clone(o.value);
      continue;
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(cur)) {
        if (!isIndex(s) || Number(s) >= cur.length) throw fail(`Không có đường dẫn: ${o.path}`);
        cur = cur[Number(s)];
      } else if (cur !== null && typeof cur === 'object') {
        if (!has(cur, s)) throw fail(`Không có đường dẫn: ${o.path}`);
        cur = cur[s];
      } else throw fail(`Không có đường dẫn: ${o.path}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (!isIndex(last)) throw fail(`Chỉ số mảng sai: ${o.path}`);
      const idx = Number(last);
      if (o.op === 'add') {
        if (idx > cur.length) throw fail(`Chỉ số vượt quá độ dài: ${o.path}`);
        cur.splice(idx, 0, clone(o.value));
      } else if (o.op === 'remove') {
        if (idx >= cur.length) throw fail(`Không có chỉ số: ${o.path}`);
        cur.splice(idx, 1);
      } else if (o.op === 'replace') {
        if (idx >= cur.length) throw fail(`Không có chỉ số: ${o.path}`);
        cur[idx] = clone(o.value);
      } else throw fail(`Thao tác không hợp lệ: ${o.op}`);
    } else if (cur !== null && typeof cur === 'object') {
      if (o.op === 'add') {
        if (has(cur, last)) throw fail(`Khóa đã có: ${o.path}`);
        cur[last] = clone(o.value);
      } else if (o.op === 'remove') {
        if (!has(cur, last)) throw fail(`Không có khóa: ${o.path}`);
        delete cur[last];
      } else if (o.op === 'replace') {
        if (!has(cur, last)) throw fail(`Không có khóa: ${o.path}`);
        cur[last] = clone(o.value);
      } else throw fail(`Thao tác không hợp lệ: ${o.op}`);
    } else throw fail(`Cha không phải container: ${o.path}`);
  }
  return root;
}

export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  const j = (v) => JSON.stringify(v);
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
  const r = { add: 0, remove: 0, replace: 0 };
  for (const o of ops) r[o.op]++;
  return r;
}
