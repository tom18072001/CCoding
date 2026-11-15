// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

function codeError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function setKey(obj, key, val) {
  Object.defineProperty(obj, key, { value: val, enumerable: true, writable: true, configurable: true });
}

function clone(x) {
  if (Array.isArray(x)) return x.map(clone);
  if (x !== null && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x)) setKey(o, k, clone(x[k]));
    return o;
  }
  return x;
}

const kindOf = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x);

export function escapePointer(seg) {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg) {
  const s = String(seg);
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '~' && s[i + 1] !== '0' && s[i + 1] !== '1') {
      throw codeError('DIFF_BAD_POINTER', `Escape sai trong JSON Pointer: "${s}"`);
    }
  }
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer[0] !== '/') {
    throw codeError('DIFF_BAD_POINTER', `JSON Pointer phải bắt đầu bằng "/": "${pointer}"`);
  }
  return pointer.split('/').slice(1).map(unescapePointer);
}

export function formatPointer(segments) {
  return segments.map((s) => '/' + escapePointer(s)).join('');
}

export function diff(a, b) {
  const ops = [];
  const rec = (x, y, segs) => {
    const kx = kindOf(x);
    const ky = kindOf(y);
    if (kx === 'object' && ky === 'object') {
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
    if (kx === 'array' && ky === 'array') {
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) rec(x[i], y[i], [...segs, i]);
      for (let i = m; i < y.length; i++) {
        ops.push({ op: 'add', path: formatPointer([...segs, i]), value: clone(y[i]) });
      }
      for (let i = x.length - 1; i >= m; i--) {
        ops.push({ op: 'remove', path: formatPointer([...segs, i]), oldValue: clone(x[i]) });
      }
      return;
    }
    if (kx !== ky || x !== y) {
      ops.push({ op: 'replace', path: formatPointer(segs), oldValue: clone(x), value: clone(y) });
    }
  };
  rec(a, b, []);
  return ops;
}

const INDEX_RE = /^(0|[1-9][0-9]*)$/;
const fail = (msg) => codeError('DIFF_APPLY_FAILED', msg);

export function applyDiff(doc, ops) {
  let root = clone(doc);
  for (const op of ops) {
    const segs = parsePointer(op.path);
    if (segs.length === 0) {
      if (op.op === 'add' || op.op === 'replace') root = clone(op.value);
      else throw fail('Không thể remove gốc');
      continue;
    }
    let parent = root;
    for (const seg of segs.slice(0, -1)) {
      if (Array.isArray(parent)) {
        if (!INDEX_RE.test(seg) || Number(seg) >= parent.length) throw fail(`Không có chỉ số ${seg}`);
        parent = parent[Number(seg)];
      } else if (parent !== null && typeof parent === 'object') {
        if (!Object.hasOwn(parent, seg)) throw fail(`Không có khóa ${seg}`);
        parent = parent[seg];
      } else throw fail(`Không đi xuyên qua giá trị vô hướng tại ${seg}`);
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(parent)) {
      const ok = INDEX_RE.test(last);
      const i = Number(last);
      if (op.op === 'add') {
        if (!ok || i > parent.length) throw fail(`Chỉ số add sai: ${last}`);
        parent.splice(i, 0, clone(op.value));
      } else {
        if (!ok || i >= parent.length) throw fail(`Không có chỉ số ${last}`);
        if (op.op === 'remove') parent.splice(i, 1);
        else if (op.op === 'replace') parent[i] = clone(op.value);
        else throw fail(`Thao tác lạ: ${op.op}`);
      }
    } else if (parent !== null && typeof parent === 'object') {
      const has = Object.hasOwn(parent, last);
      if (op.op === 'add') {
        if (has) throw fail(`Khóa đã có: ${last}`);
        setKey(parent, last, clone(op.value));
      } else {
        if (!has) throw fail(`Không có khóa ${last}`);
        if (op.op === 'remove') delete parent[last];
        else if (op.op === 'replace') setKey(parent, last, clone(op.value));
        else throw fail(`Thao tác lạ: ${op.op}`);
      }
    } else throw fail('Cha không phải mảng/đối tượng');
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
  for (const o of ops) if (Object.hasOwn(r, o.op)) r[o.op]++;
  return r;
}
