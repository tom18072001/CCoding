// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
// Ba pha liên tiếp; pha nào có lỗi thì trả lỗi pha đó và dừng.
import { buildMerged, resolveRef, stringsOf } from './merge.js';

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function mkErr(code, message, file, at) {
  return { code, message, file, line: at.line, column: at.column };
}

const byPos = (a, b) => a.line - b.line || a.column - b.column;

// ---------- Pha A ----------

function collectIncludes(body, out) {
  for (const st of body) {
    if (st.type === 'Include') out.push(st);
    else if (st.type === 'Block') collectIncludes(st.body, out);
  }
}

function dupKeys(body, file, errs) {
  const seen = new Set();
  for (const st of body) {
    if (st.type === 'Assign' || st.type === 'Block') {
      if (seen.has(st.key)) {
        errs.push(mkErr('SEM_DUPLICATE_KEY', `Khóa trùng "${st.key}" trong cùng một khối`, file, st));
      } else seen.add(st.key);
      if (st.type === 'Block') dupKeys(st.body, file, errs);
    }
  }
}

/** Trả { order: tệp theo thứ tự thăm, errors }. */
function phaseA(program) {
  const order = [];
  const errors = [];
  const visited = new Set();
  const stack = new Set();

  const visit = (file) => {
    visited.add(file);
    stack.add(file);
    order.push(file);
    const ast = program.files[file];
    const errs = [];
    dupKeys(ast.body, file, errs);
    const seenConst = new Set();
    for (const st of ast.body) {
      if (st.type === 'Const') {
        if (seenConst.has(st.name)) {
          errs.push(mkErr('SEM_DUPLICATE_CONST', `Hằng trùng "${st.name}"`, file, st));
        } else seenConst.add(st.name);
      }
    }
    const incs = [];
    collectIncludes(ast.body, incs);
    for (const inc of incs) {
      if (!has(program.files, inc.path)) {
        errs.push(mkErr('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp include "${inc.path}"`, file, inc));
      } else if (stack.has(inc.path)) {
        errs.push(mkErr('SEM_INCLUDE_CYCLE', `Include vòng tới "${inc.path}"`, file, inc));
      }
    }
    // Lỗi của tệp này đặt trước lỗi của các tệp con (tiền thứ tự).
    errs.sort(byPos);
    errors.push({ file, errs });
    const slot = errors[errors.length - 1];
    for (const inc of incs) {
      if (!has(program.files, inc.path) || stack.has(inc.path)) continue;
      if (visited.has(inc.path)) continue;
      visit(inc.path);
    }
    stack.delete(file);
    return slot;
  };

  if (has(program.files, program.entry)) visit(program.entry);
  return { order, errors: errors.flatMap((e) => e.errs) };
}

// ---------- Pha B ----------

function collectStrings(body, file, inConst, out) {
  const fromValue = (node, c) => {
    if (node.type === 'String') out.push({ node, file, inConst: c });
    else if (node.type === 'Array') for (const it of node.items) fromValue(it, c);
  };
  for (const st of body) {
    if (st.type === 'Assign') fromValue(st.value, false);
    else if (st.type === 'Const') fromValue(st.value, true);
    else if (st.type === 'Block') collectStrings(st.body, file, false, out);
  }
}

const refsOf = (s) => s.parts.filter((p) => p.type === 'Ref');

/** Loại giá trị của đích: 'object' | 'array' | 'scalar' (theo chuỗi thuần tham chiếu thì đi tiếp). */
function kindOf(merged, target, active = new Set()) {
  if (target.kind === 'object') return 'object';
  const n = target.node;
  if (n.type === 'Array') return 'array';
  if (n.type !== 'String') return 'scalar';
  if (n.parts.length === 1 && n.parts[0].type === 'Ref') {
    if (active.has(n)) return 'scalar';
    const t = resolveRef(merged, n.parts[0], target.file);
    if (!t) return 'scalar';
    active.add(n);
    const k = kindOf(merged, t, active);
    active.delete(n);
    return k;
  }
  return 'scalar';
}

function phaseB(program, order) {
  const merged = buildMerged(program);
  const perFile = order.map((file) => {
    const list = [];
    collectStrings(program.files[file].body, file, false, list);
    return list;
  });

  // Đồ thị cạnh s → S(đích từng Ref phân giải được trong s), tính lười, khóa theo nút String.
  const edgeCache = new Map();
  const edgesOf = (node, file) => {
    let e = edgeCache.get(node);
    if (!e) {
      e = [];
      for (const r of refsOf(node)) {
        const t = resolveRef(merged, r, file);
        if (t) e.push(...stringsOf(t));
      }
      edgeCache.set(node, e);
    }
    return e;
  };
  const reaches = (starts, goal) => {
    const seen = new Set();
    const todo = [...starts];
    while (todo.length) {
      const cur = todo.pop();
      if (cur.node === goal) return true;
      if (seen.has(cur.node)) continue;
      seen.add(cur.node);
      todo.push(...edgesOf(cur.node, cur.file));
    }
    return false;
  };

  const errors = [];
  order.forEach((file, i) => {
    const errs = [];
    for (const s of perFile[i]) {
      const refs = refsOf(s.node);
      const pure = s.node.parts.length === 1;
      for (const r of refs) {
        let code = null;
        let target = null;
        if (s.inConst && !r.const) {
          code = 'SEM_CONST_CONFIG_REF';
        } else {
          target = resolveRef(merged, r, file);
          if (!target) code = 'SEM_UNDEFINED_REF';
          else if (reaches(stringsOf(target), s.node)) code = 'SEM_REF_CYCLE';
          else if (!pure && kindOf(merged, target) !== 'scalar') code = 'SEM_BAD_INTERPOLATION';
        }
        if (code) {
          errs.push(mkErr(code, `Tham chiếu lỗi (${code}): \${${r.const ? '@' : ''}${r.path.join('.')}}`, file, r));
        }
      }
    }
    errs.sort(byPos);
    errors.push(...errs);
  });
  return errors;
}

// ---------- Pha C: lược đồ ----------

const posOf = (file, n) => ({ file, line: n.line, column: n.column });

// Cây giá trị đã đánh giá, kèm vị trí báo lỗi.
// { k: 'scalar'|'array'|'object', value?, items?, entries?: Map<key,{key,pos,val}>, pos }
function evalTarget(t, over, merged) {
  if (t.kind === 'object') {
    const entries = new Map();
    for (const e of t.entries.values()) {
      entries.set(e.key, {
        key: e.key,
        pos: over || posOf(e.file, e.stmt),
        val: evalTarget(e.val, over, merged),
      });
    }
    const pos = over || (t.block ? posOf(t.file, t.block) : { file: merged.program.entry, line: 1, column: 1 });
    return { k: 'object', entries, pos };
  }
  const n = t.node;
  const pos = over || posOf(t.file, n);
  switch (n.type) {
    case 'Number':
    case 'Bool':
      return { k: 'scalar', value: n.value, pos };
    case 'Null':
      return { k: 'scalar', value: null, pos };
    case 'Array':
      return {
        k: 'array',
        items: n.items.map((it) => evalTarget({ kind: 'node', node: it, file: t.file }, over, merged)),
        pos,
      };
    default: { // String
      const parts = n.parts;
      if (parts.length === 1 && parts[0].type === 'Ref') {
        const d = resolveRef(merged, parts[0], t.file);
        return evalTarget(d, over || posOf(t.file, n), merged);
      }
      let s = '';
      for (const p of parts) {
        if (p.type === 'Text') s += p.value;
        else {
          const v = evalTarget(resolveRef(merged, p, t.file), over, merged);
          s += typeof v.value === 'string' ? v.value : JSON.stringify(v.value);
        }
      }
      return { k: 'scalar', value: s, pos };
    }
  }
}

function typeOk(t, type) {
  switch (type) {
    case 'any': return true;
    case 'string': return t.k === 'scalar' && typeof t.value === 'string';
    case 'number': return t.k === 'scalar' && typeof t.value === 'number';
    case 'integer': return t.k === 'scalar' && Number.isInteger(t.value);
    case 'boolean': return t.k === 'scalar' && typeof t.value === 'boolean';
    case 'null': return t.k === 'scalar' && t.value === null;
    case 'array': return t.k === 'array';
    case 'object': return t.k === 'object';
    default: return true;
  }
}

function checkNode(t, spec, errors) {
  if (!spec || typeof spec !== 'object') return;
  const err = (code, msg, pos) => errors.push(mkErr(code, msg, pos.file, pos));
  if (spec.type !== undefined && spec.type !== 'any' && !typeOk(t, spec.type)) {
    err('SEM_TYPE_MISMATCH', `kiểu không khớp, cần ${spec.type}`, t.pos);
    return;
  }
  if (Array.isArray(spec.enum) && t.k === 'scalar' && !spec.enum.includes(t.value)) {
    err('SEM_NOT_IN_ENUM', 'giá trị không thuộc enum', t.pos);
    return;
  }
  if (t.k === 'object' && spec.fields && typeof spec.fields === 'object') {
    for (const key of Object.keys(spec.fields)) {
      const f = spec.fields[key];
      if (f && f.required === true && !t.entries.has(key)) {
        err('SEM_MISSING_REQUIRED', `thiếu khóa bắt buộc "${key}"`, t.pos);
      }
    }
    for (const e of t.entries.values()) {
      if (has(spec.fields, e.key)) checkNode(e.val, spec.fields[e.key], errors);
      else if (spec.closed === true) err('SEM_UNKNOWN_KEY', `khóa không có trong lược đồ "${e.key}"`, e.pos);
    }
  } else if (t.k === 'object' && spec.closed === true) {
    for (const e of t.entries.values()) err('SEM_UNKNOWN_KEY', `khóa không có trong lược đồ "${e.key}"`, e.pos);
  }
  if (t.k === 'array' && spec.items) {
    for (const it of t.items) checkNode(it, spec.items, errors);
  }
}

function phaseC(program, schema) {
  const merged = buildMerged(program);
  const tree = evalTarget(merged.root, null, merged);
  const errors = [];
  checkNode(tree, schema, errors);
  return errors;
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const b = phaseB(program, a.order);
  if (b.length) return b;
  if (schema) return phaseC(program, schema);
  return [];
}
