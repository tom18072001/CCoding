// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
import { Model, MObj, isPureRef } from './merge.js';

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const byPos = (a, b) => a.line - b.line || a.column - b.column;

function err(code, message, file, line, column) {
  return { code, message, file, line, column };
}

// ---- Pha A ----
function phaseA(program) {
  const files = program.files;
  const groups = [];
  const order = [];
  const visited = new Set();
  const stack = new Set();

  function visit(name) {
    visited.add(name);
    order.push(name);
    stack.add(name);
    const errs = [];
    groups.push(errs);
    const includes = [];

    const walk = (body) => {
      const seen = new Set();
      for (const s of body) {
        if (s.type === 'Assign' || s.type === 'Block') {
          if (seen.has(s.key)) errs.push(err('SEM_DUPLICATE_KEY', `Khóa trùng: ${s.key}`, name, s.line, s.column));
          else seen.add(s.key);
          if (s.type === 'Block') walk(s.body);
        } else if (s.type === 'Include') includes.push(s);
      }
    };
    walk(files[name].body);

    const seenConst = new Set();
    for (const s of files[name].body) {
      if (s.type !== 'Const') continue;
      if (seenConst.has(s.name)) errs.push(err('SEM_DUPLICATE_CONST', `Hằng trùng: ${s.name}`, name, s.line, s.column));
      else seenConst.add(s.name);
    }

    // includes theo thứ tự tài liệu (walk ở trên không giữ thứ tự khi lẫn khối) — sắp lại theo vị trí
    includes.sort(byPos);
    for (const inc of includes) {
      if (stack.has(inc.path)) {
        errs.push(err('SEM_INCLUDE_CYCLE', `Vòng include: ${inc.path}`, name, inc.line, inc.column));
      } else if (!has(files, inc.path)) {
        errs.push(err('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp: ${inc.path}`, name, inc.line, inc.column));
      } else if (!visited.has(inc.path)) visit(inc.path);
    }
    stack.delete(name);
    errs.sort(byPos);
  }

  if (has(files, program.entry)) visit(program.entry);
  return { errors: groups.flat(), order };
}

// ---- Pha B ----
function collectRefs(body, inConst, out) {
  const value = (v, isConst) => {
    if (v.type === 'String') {
      for (const p of v.parts) if (p.type === 'Ref') out.push({ str: v, ref: p, inConst: isConst });
    } else if (v.type === 'Array') for (const x of v.items) value(x, isConst);
  };
  for (const s of body) {
    if (s.type === 'Assign') value(s.value, false);
    else if (s.type === 'Block') collectRefs(s.body, false, out);
    else if (s.type === 'Const') value(s.value, true);
  }
  return out;
}

function phaseB(program, order, model) {
  const errors = [];
  const edgeCache = new Map();

  const strings = (target, out = new Set()) => {
    if (target instanceof MObj) {
      for (const e of target.entries.values()) strings(e.val, out);
    } else if (target.type === 'String') out.add(target);
    else if (target.type === 'Array') for (const x of target.items) strings(x, out);
    return out;
  };
  const edges = (t) => {
    if (edgeCache.has(t)) return edgeCache.get(t);
    const set = new Set();
    const file = model.fileOf.get(t);
    for (const p of t.parts) {
      if (p.type !== 'Ref') continue;
      const tg = model.resolve(p, file);
      if (tg) for (const x of strings(tg)) set.add(x);
    }
    edgeCache.set(t, set);
    return set;
  };
  const cyclic = (s, target) => {
    const seen = new Set();
    const queue = [...strings(target)];
    while (queue.length) {
      const x = queue.pop();
      if (x === s) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      for (const y of edges(x)) queue.push(y);
    }
    return false;
  };
  const kindOf = (target, guard = new Set()) => {
    if (target instanceof MObj) return 'object';
    if (target.type === 'Array') return 'array';
    if (target.type !== 'String') return 'scalar';
    if (!isPureRef(target)) return 'scalar';
    if (guard.has(target)) return 'scalar';
    guard.add(target);
    const t = model.resolve(target.parts[0], model.fileOf.get(target));
    return t ? kindOf(t, guard) : 'scalar';
  };

  for (const name of order) {
    const refs = collectRefs(program.files[name].body, false, []);
    refs.sort((a, b) => byPos(a.ref, b.ref));
    for (const { str, ref, inConst } of refs) {
      const at = (code, msg) => errors.push(err(code, msg, name, ref.line, ref.column));
      if (!ref.const && inConst) { at('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình'); continue; }
      const target = model.resolve(ref, name);
      if (!target) { at('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${ref.path.join('.')}`); continue; }
      if (cyclic(str, target)) { at('SEM_REF_CYCLE', 'Vòng tham chiếu'); continue; }
      if (!isPureRef(str)) {
        const k = kindOf(target);
        if (k === 'array' || k === 'object') at('SEM_BAD_INTERPOLATION', 'Không thể nội suy mảng/đối tượng vào chuỗi');
      }
    }
  }
  return errors;
}

// ---- Pha C ----
function typeMatches(a, type) {
  switch (type) {
    case 'string': return a.kind === 'scalar' && typeof a.value === 'string';
    case 'number': return a.kind === 'scalar' && typeof a.value === 'number';
    case 'integer': return a.kind === 'scalar' && Number.isInteger(a.value);
    case 'boolean': return a.kind === 'scalar' && typeof a.value === 'boolean';
    case 'null': return a.kind === 'scalar' && a.value === null;
    case 'array': return a.kind === 'arr';
    case 'object': return a.kind === 'obj';
    default: return true;
  }
}

function validate(a, spec, errors) {
  if (!spec || typeof spec !== 'object') return;
  const push = (code, msg, pos) => errors.push(err(code, msg, pos.file, pos.line, pos.column));
  if (spec.type && spec.type !== 'any' && !typeMatches(a, spec.type)) {
    push('SEM_TYPE_MISMATCH', `Sai kiểu, cần ${spec.type}`, a.pos);
    return;
  }
  if (Array.isArray(spec.enum) && a.kind === 'scalar' && !spec.enum.some((v) => v === a.value)) {
    push('SEM_NOT_IN_ENUM', 'Giá trị không thuộc enum', a.pos);
    return;
  }
  if (a.kind === 'obj' && spec.fields) {
    for (const k of Object.keys(spec.fields)) {
      const f = spec.fields[k];
      if (f && f.required === true && !a.entries.some((e) => e.key === k)) {
        push('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc: ${k}`, a.pos);
      }
    }
    for (const e of a.entries) {
      if (has(spec.fields, e.key)) validate(e.ann, spec.fields[e.key], errors);
      else if (spec.closed === true) push('SEM_UNKNOWN_KEY', `Khóa không được phép: ${e.key}`, e.keyPos);
    }
  }
  if (a.kind === 'arr' && spec.items) for (const x of a.items) validate(x, spec.items, errors);
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const model = new Model(program);
  const b = phaseB(program, a.order, model);
  if (b.length) return b;
  if (!schema) return [];
  const errors = [];
  validate(model.annotateRoot(), schema, errors);
  return errors;
}
