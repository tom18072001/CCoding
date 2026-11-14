// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

function loi(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const kieu = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const co = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function sao(v) {
  if (Array.isArray(v)) return v.map(sao);
  if (v !== null && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = sao(v[k]);
    return o;
  }
  return v;
}

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '~') { out += c; continue; }
    const n = s[i + 1];
    if (n === '0') out += '~';
    else if (n === '1') out += '/';
    else throw loi('DIFF_BAD_POINTER', `escape sai trong đoạn pointer: ${s}`);
    i++;
  }
  return out;
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') {
    throw loi('DIFF_BAD_POINTER', `pointer phải bắt đầu bằng "/": ${pointer}`);
  }
  return pointer.slice(1).split('/').map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

export function diff(a, b) {
  const ops = [];
  const walk = (x, y, segs) => {
    const kx = kieu(x);
    const ky = kieu(y);
    if (kx === 'object' && ky === 'object') {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
      for (const k of keys) {
        const inX = co(x, k);
        const inY = co(y, k);
        const p = [...segs, k];
        if (inX && !inY) ops.push({ op: 'remove', path: formatPointer(p), oldValue: sao(x[k]) });
        else if (!inX && inY) ops.push({ op: 'add', path: formatPointer(p), value: sao(y[k]) });
        else walk(x[k], y[k], p);
      }
    } else if (kx === 'array' && ky === 'array') {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) walk(x[i], y[i], [...segs, i]);
      for (let i = m; i < y.length; i++) {
        ops.push({ op: 'add', path: formatPointer([...segs, i]), value: sao(y[i]) });
      }
      for (let i = x.length - 1; i >= m; i--) {
        ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: sao(x[i]) });
      }
    } else if (kx !== ky || x !== y) {
      ops.push({ op: 'replace', path: formatPointer(segs), oldValue: sao(x), value: sao(y) });
    }
  };
  walk(a, b, []);
  return ops;
}

function chiSo(seg, max) {
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) return -1;
  const n = Number(seg);
  return n <= max ? n : -1;
}

export function applyDiff(doc, ops) {
  let root = sao(doc);
  for (const o of ops) {
    const segs = parsePointer(o.path);
    const fail = (why) => loi('DIFF_APPLY_FAILED', `${o.op} ${o.path}: ${why}`);
    if (segs.length === 0) {
      if (o.op === 'remove') throw fail('không thể xóa gốc');
      root = sao(o.value);
      continue;
    }
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (Array.isArray(cur)) {
        const n = chiSo(s, cur.length - 1);
        if (n < 0) throw fail('đường dẫn không tồn tại');
        cur = cur[n];
      } else if (cur !== null && typeof cur === 'object' && co(cur, s)) {
        cur = cur[s];
      } else throw fail('đường dẫn không tồn tại');
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      if (o.op === 'add') {
        const n = chiSo(last, cur.length);
        if (n < 0) throw fail('chỉ số ngoài phạm vi');
        cur.splice(n, 0, sao(o.value));
      } else {
        const n = chiSo(last, cur.length - 1);
        if (n < 0) throw fail('chỉ số không có');
        if (o.op === 'remove') cur.splice(n, 1);
        else cur[n] = sao(o.value);
      }
    } else if (cur !== null && typeof cur === 'object') {
      const has = co(cur, last);
      if (o.op === 'add') {
        if (has) throw fail('khóa đã có');
        cur[last] = sao(o.value);
      } else {
        if (!has) throw fail('khóa không có');
        if (o.op === 'remove') delete cur[last];
        else cur[last] = sao(o.value);
      }
    } else throw fail('đích không phải mảng/đối tượng');
  }
  return root;
}

export function formatText(ops) {
  if (ops.length === 0) return 'Không có thay đổi';
  const p = (o) => (o.path === '' ? '(root)' : o.path);
  return ops.map((o) => {
    if (o.op === 'add') return `+ ${p(o)} = ${JSON.stringify(o.value)}`;
    if (o.op === 'remove') return `- ${p(o)} = ${JSON.stringify(o.oldValue)}`;
    return `~ ${p(o)}: ${JSON.stringify(o.oldValue)} -> ${JSON.stringify(o.value)}`;
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
