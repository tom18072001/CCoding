// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.

import { buildModel, isPureRef } from './merge.js';

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const cmp = (a, b) => a.line - b.line || a.column - b.column;

export function check(program, schema) {
  const files = program.files;
  const mk = (code, message, file, n) => ({ code, message, file, line: n.line, column: n.column });

  // ---- Pha A ----
  const order = [];
  const buckets = [];
  const visited = new Set();
  const stack = new Set();

  function visit(name) {
    visited.add(name);
    stack.add(name);
    order.push(name);
    const bucket = [];
    buckets.push(bucket);
    const consts = new Set();
    const scan = (body, top) => {
      const seen = new Set();
      for (const st of body) {
        if (st.type === 'Assign' || st.type === 'Block') {
          if (seen.has(st.key)) bucket.push(mk('SEM_DUPLICATE_KEY', `Khóa trùng: ${st.key}`, name, st));
          seen.add(st.key);
          if (st.type === 'Block') scan(st.body, false);
        } else if (st.type === 'Const') {
          if (consts.has(st.name)) bucket.push(mk('SEM_DUPLICATE_CONST', `Hằng trùng: ${st.name}`, name, st));
          consts.add(st.name);
        } else if (st.type === 'Include') {
          if (!has(files, st.path)) bucket.push(mk('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy: ${st.path}`, name, st));
          else if (stack.has(st.path)) bucket.push(mk('SEM_INCLUDE_CYCLE', `Vòng include: ${st.path}`, name, st));
          else if (!visited.has(st.path)) visit(st.path);
        }
      }
    };
    scan(files[name].body, true);
    stack.delete(name);
    bucket.sort(cmp);
  }
  if (has(files, program.entry)) visit(program.entry);
  const a = buckets.flat();
  if (a.length) return a;

  // ---- Pha B ----
  const model = buildModel(program);
  const info = new Map(); // String node -> { file, inConst }
  const perFile = order.map((file) => {
    const strs = [];
    const val = (n, inConst) => {
      if (n.type === 'String') {
        info.set(n, { file, inConst });
        strs.push(n);
      } else if (n.type === 'Array') n.items.forEach((x) => val(x, inConst));
    };
    const walk = (body) => {
      for (const s of body) {
        if (s.type === 'Assign') val(s.value, false);
        else if (s.type === 'Block') walk(s.body);
        else if (s.type === 'Const') val(s.value, true);
      }
    };
    walk(files[file].body);
    return strs;
  });

  const stringsOf = (e, out = []) => {
    if (e.t === 'obj') for (const c of e.map.values()) stringsOf(c, out);
    else {
      const walk = (n) => {
        if (n.type === 'String') out.push(n);
        else if (n.type === 'Array') n.items.forEach(walk);
      };
      walk(e.node);
    }
    return out;
  };

  const edgeCache = new Map();
  const edges = (s) => {
    let r = edgeCache.get(s);
    if (!r) {
      r = [];
      const f = info.get(s)?.file;
      for (const part of s.parts) {
        if (part.type !== 'Ref') continue;
        const t = model.resolveRef(f, part);
        if (t) stringsOf(t, r);
      }
      edgeCache.set(s, r);
    }
    return r;
  };

  const reaches = (starts, goal) => {
    const seen = new Set(starts);
    const todo = [...starts];
    while (todo.length) {
      const n = todo.pop();
      if (n === goal) return true;
      for (const m of edges(n)) {
        if (!seen.has(m)) {
          seen.add(m);
          todo.push(m);
        }
      }
    }
    return false;
  };

  const typeOf = (e, guard = new Set()) => {
    if (e.t === 'obj') return 'obj';
    const n = e.node;
    if (n.type === 'Array') return 'arr';
    if (n.type === 'String' && isPureRef(n)) {
      if (guard.has(n)) return 'scalar';
      guard.add(n);
      const t = model.resolveRef(e.file, n.parts[0]);
      return t ? typeOf(t, guard) : 'scalar';
    }
    return 'scalar';
  };

  const bErrors = [];
  perFile.forEach((strs, idx) => {
    const file = order[idx];
    const bucket = [];
    for (const s of strs) {
      const pure = isPureRef(s);
      const { inConst } = info.get(s);
      for (const ref of s.parts) {
        if (ref.type !== 'Ref') continue;
        if (!ref.const && inConst) {
          bucket.push(mk('SEM_CONST_CONFIG_REF', 'const không được tham chiếu cấu hình', file, ref));
          continue;
        }
        const tgt = model.resolveRef(file, ref);
        if (!tgt) {
          bucket.push(mk('SEM_UNDEFINED_REF', 'Tham chiếu không tồn tại', file, ref));
          continue;
        }
        if (reaches(stringsOf(tgt), s)) {
          bucket.push(mk('SEM_REF_CYCLE', 'Vòng tham chiếu', file, ref));
          continue;
        }
        if (!pure && typeOf(tgt) !== 'scalar') {
          bucket.push(mk('SEM_BAD_INTERPOLATION', 'Nội suy mảng/đối tượng vào chuỗi', file, ref));
        }
      }
    }
    bucket.sort(cmp);
    bErrors.push(...bucket);
  });
  if (bErrors.length) return bErrors;

  // ---- Pha C ----
  if (!schema) return [];
  const tree = model.evalEntry(model.root);
  const errs = [];
  const e = (code, message, pos) => errs.push({ code, message, file: pos.file, line: pos.line, column: pos.column });

  const typeMatches = (t, type) => {
    if (type === 'object') return t.kind === 'obj';
    if (type === 'array') return t.kind === 'arr';
    if (t.kind !== 'scalar') return false;
    const v = t.value;
    switch (type) {
      case 'string': return typeof v === 'string';
      case 'number': return typeof v === 'number';
      case 'integer': return typeof v === 'number' && Number.isInteger(v);
      case 'boolean': return typeof v === 'boolean';
      case 'null': return v === null;
      default: return true;
    }
  };

  const validate = (spec, t) => {
    if (!spec || typeof spec !== 'object') return;
    if (spec.type !== undefined && spec.type !== 'any' && !typeMatches(t, spec.type)) {
      e('SEM_TYPE_MISMATCH', `Sai kiểu, cần ${spec.type}`, t.pos);
      return;
    }
    if (Array.isArray(spec.enum) && t.kind === 'scalar' && !spec.enum.some((x) => x === t.value)) {
      e('SEM_NOT_IN_ENUM', 'Giá trị ngoài enum', t.pos);
      return;
    }
    if (t.kind === 'obj' && spec.fields) {
      const own = new Set(t.children.map((c) => c.key));
      for (const k of Object.keys(spec.fields)) {
        if (spec.fields[k] && spec.fields[k].required === true && !own.has(k)) {
          e('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc: ${k}`, t.pos);
        }
      }
      for (const c of t.children) {
        if (has(spec.fields, c.key)) validate(spec.fields[c.key], c.node);
        else if (spec.closed === true) e('SEM_UNKNOWN_KEY', `Khóa lạ: ${c.key}`, c.keyPos);
      }
    }
    if (t.kind === 'arr' && spec.items) t.items.forEach((it) => validate(spec.items, it));
  };
  validate(schema, tree);
  return errs;
}
