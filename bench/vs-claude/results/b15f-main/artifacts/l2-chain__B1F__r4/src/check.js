// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.

import { mergeProgram, resolveRef } from './merge.js';

const mk = (code, message, file, pos) => ({ code, message, file, line: pos.line, column: pos.column });
const byPos = (a, b) => a.line - b.line || a.column - b.column;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** Thứ tự thăm tiền thứ tự + lỗi pha A theo tệp. */
function phaseA(program) {
  const files = program.files;
  const order = [];
  const perFile = new Map();
  const onPath = new Set();
  const visited = new Set();

  const dupKeys = (body, errs, file) => {
    const seen = new Set();
    for (const st of body) {
      if (st.type === 'Assign' || st.type === 'Block') {
        if (seen.has(st.key)) errs.push(mk('SEM_DUPLICATE_KEY', `Khóa trùng: ${st.key}`, file, st));
        else seen.add(st.key);
        if (st.type === 'Block') dupKeys(st.body, errs, file);
      }
    }
  };
  const includes = (body, errs, file) => {
    for (const st of body) {
      if (st.type === 'Block') includes(st.body, errs, file);
      else if (st.type === 'Include') {
        if (!has(files, st.path)) errs.push(mk('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp include: ${st.path}`, file, st));
        else if (onPath.has(st.path)) errs.push(mk('SEM_INCLUDE_CYCLE', `Include vòng: ${st.path}`, file, st));
        else if (!visited.has(st.path)) visit(st.path);
      }
    }
  };
  const visit = (file) => {
    visited.add(file);
    onPath.add(file);
    order.push(file);
    const errs = [];
    perFile.set(file, errs);
    const body = files[file].body;
    dupKeys(body, errs, file);
    const seenConst = new Set();
    for (const st of body) {
      if (st.type === 'Const') {
        if (seenConst.has(st.name)) errs.push(mk('SEM_DUPLICATE_CONST', `Hằng trùng: ${st.name}`, file, st));
        else seenConst.add(st.name);
      }
    }
    includes(body, errs, file);
    onPath.delete(file);
  };
  if (has(files, program.entry)) visit(program.entry);
  const out = [];
  for (const f of order) out.push(...perFile.get(f).sort(byPos));
  return { order, errors: out };
}

function stringsIn(node, out) {
  if (node.type === 'String') out.push(node);
  else if (node.type === 'Array') for (const it of node.items) stringsIn(it, out);
  return out;
}

function collectStrings(body, out) {
  for (const st of body) {
    if (st.type === 'Assign') for (const s of stringsIn(st.value, [])) out.push({ s, inConst: false });
    else if (st.type === 'Const') for (const s of stringsIn(st.value, [])) out.push({ s, inConst: true });
    else if (st.type === 'Block') collectStrings(st.body, out);
  }
  return out;
}

const refsOf = (s) => s.parts.filter((p) => p.type === 'Ref');
const isPure = (s) => s.parts.length === 1 && s.parts[0].type === 'Ref';

/** S(đích): mọi nút String trong MNode (chỉ định nghĩa thắng). */
function stringsOfM(m, out) {
  if (m.kind === 'object') for (const e of m.entries.values()) stringsOfM(e.value, out);
  else stringsIn(m.node, out);
  return out;
}

function phaseB(program, order, tree) {
  const edgeCache = new Map();
  const targetOf = (ref, file) => resolveRef(tree, ref, file);
  const fileOf = new Map();
  for (const f of order) for (const { s } of collectStrings(program.files[f].body, [])) fileOf.set(s, f);

  const edges = (s) => {
    let e = edgeCache.get(s);
    if (!e) {
      e = [];
      for (const r of refsOf(s)) {
        const t = targetOf(r, fileOf.get(s));
        if (t) stringsOfM(t, e);
      }
      edgeCache.set(s, e);
    }
    return e;
  };
  const reaches = (starts, goal) => {
    const seen = new Set();
    const stack = [...starts];
    while (stack.length) {
      const n = stack.pop();
      if (n === goal) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const m of edges(n)) stack.push(m);
    }
    return false;
  };
  const composite = (m) => {
    const seen = new Set();
    let cur = m;
    while (cur) {
      if (cur.kind === 'object') return true;
      const n = cur.node;
      if (n.type === 'Array') return true;
      if (n.type === 'String' && isPure(n)) {
        if (seen.has(n)) return false;
        seen.add(n);
        cur = targetOf(n.parts[0], cur.file);
        continue;
      }
      return false;
    }
    return false;
  };

  const errors = [];
  for (const f of order) {
    const errs = [];
    for (const { s, inConst } of collectStrings(program.files[f].body, [])) {
      for (const r of refsOf(s)) {
        const where = { line: r.line, column: r.column };
        if (inConst && !r.const) {
          errs.push(mk('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình', f, where));
          continue;
        }
        const t = targetOf(r, f);
        if (!t) {
          errs.push(mk('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${r.path.join('.')}`, f, where));
          continue;
        }
        if (reaches(stringsOfM(t, []), s)) {
          errs.push(mk('SEM_REF_CYCLE', `Tham chiếu vòng: ${r.path.join('.')}`, f, where));
          continue;
        }
        if (!isPure(s) && composite(t)) {
          errs.push(mk('SEM_BAD_INTERPOLATION', 'Nội suy mảng/đối tượng vào chuỗi', f, where));
        }
      }
    }
    errors.push(...errs.sort(byPos));
  }
  return errors;
}

// ---- Pha C ----

function phaseC(program, tree, schema) {
  const at = (file, n) => ({ file, line: n.line, column: n.column });

  const descM = (m, ov) => {
    if (m.kind === 'object') {
      const keys = [];
      for (const [k, e] of m.entries) keys.push({ key: k, entry: e, d: descM(e.value, ov) });
      return { t: 'object', loc: ov ?? { ...m.origin }, keys };
    }
    return descNode(m.node, m.file, ov);
  };
  const descNode = (node, file, ov) => {
    const loc = ov ?? at(file, node);
    switch (node.type) {
      case 'Number': case 'Bool': return { t: 'scalar', loc, value: node.value };
      case 'Null': return { t: 'scalar', loc, value: null };
      case 'Array': return { t: 'array', loc, items: node.items.map((it) => descNode(it, file, ov)) };
      default: {
        if (isPure(node)) return descM(resolveRef(tree, node.parts[0], file), loc);
        let s = '';
        for (const p of node.parts) {
          if (p.type === 'Text') s += p.value;
          else {
            const v = toValue(descM(resolveRef(tree, p, file)));
            s += typeof v === 'number' ? JSON.stringify(v) : String(v);
          }
        }
        return { t: 'scalar', loc, value: s };
      }
    }
  };
  const toValue = (d) => {
    if (d.t === 'scalar') return d.value;
    if (d.t === 'array') return d.items.map(toValue);
    const o = {};
    for (const k of d.keys) Object.defineProperty(o, k.key, { value: toValue(k.d), enumerable: true, writable: true, configurable: true });
    return o;
  };

  const typeOk = (type, d) => {
    switch (type) {
      case 'object': return d.t === 'object';
      case 'array': return d.t === 'array';
      case 'null': return d.t === 'scalar' && d.value === null;
      case 'string': return d.t === 'scalar' && typeof d.value === 'string';
      case 'number': return d.t === 'scalar' && typeof d.value === 'number';
      case 'integer': return d.t === 'scalar' && Number.isInteger(d.value);
      case 'boolean': return d.t === 'scalar' && typeof d.value === 'boolean';
      default: return true;
    }
  };

  const errors = [];
  const err = (code, msg, loc) => errors.push(mk(code, msg, loc.file, loc));
  const walk = (d, spec, name) => {
    if (spec.type && spec.type !== 'any' && !typeOk(spec.type, d)) {
      err('SEM_TYPE_MISMATCH', `Sai kiểu tại ${name}: cần ${spec.type}`, d.loc);
      return;
    }
    if (spec.enum && d.t === 'scalar' && !spec.enum.some((x) => x === d.value)) {
      err('SEM_NOT_IN_ENUM', `Giá trị không thuộc enum tại ${name}`, d.loc);
      return;
    }
    if (d.t === 'object' && spec.fields) {
      const fields = spec.fields;
      for (const k of Object.keys(fields)) {
        if (fields[k] && fields[k].required === true && !d.keys.some((x) => x.key === k)) {
          err('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc: ${k}`, d.loc);
        }
      }
      for (const k of d.keys) {
        if (has(fields, k.key)) walk(k.d, fields[k.key], `${name}.${k.key}`);
        else if (spec.closed === true) {
          err('SEM_UNKNOWN_KEY', `Khóa không được phép: ${k.key}`, at(k.entry.file, k.entry.node));
        }
      }
    }
    if (d.t === 'array' && spec.items) {
      d.items.forEach((it, i) => walk(it, spec.items, `${name}[${i}]`));
    }
  };
  walk(descM(tree.root), schema, '(root)');
  return errors;
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const tree = mergeProgram(program);
  const b = phaseB(program, a.order, tree);
  if (b.length) return b;
  if (!schema) return [];
  return phaseC(program, tree, schema);
}
