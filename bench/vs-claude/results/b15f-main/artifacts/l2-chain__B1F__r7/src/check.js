// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
// Dùng lại lõi hợp nhất/phân giải của tầng 3 (evaluate.js), không viết lại logic.

import { mergeProgram, resolveRef, collectStrings, evaluateMerged } from './evaluate.js';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const byPos = (a, b) => a.line - b.line || a.column - b.column;

function err(code, message, file, pos) {
  return { code, message, file, line: pos.line, column: pos.column };
}

// ---------------------------------------------------------------- Pha A

function includesOf(body, out = []) {
  for (const s of body) {
    if (s.type === 'Include') out.push(s);
    else if (s.type === 'Block') includesOf(s.body, out);
  }
  return out;
}

function structErrors(file, ast, files) {
  const errs = [];
  const dupBlock = (body) => {
    const seen = new Set();
    for (const s of body) {
      if (s.type === 'Assign' || s.type === 'Block') {
        if (seen.has(s.key)) errs.push(err('SEM_DUPLICATE_KEY', `khóa trùng: ${s.key}`, file, s));
        seen.add(s.key);
        if (s.type === 'Block') dupBlock(s.body);
      }
    }
  };
  dupBlock(ast.body);
  const consts = new Set();
  for (const s of ast.body) {
    if (s.type !== 'Const') continue;
    if (consts.has(s.name)) errs.push(err('SEM_DUPLICATE_CONST', `hằng trùng: ${s.name}`, file, s));
    consts.add(s.name);
  }
  return errs;
}

// Trả { order: tệp theo thứ tự thăm lần đầu, errors: Map<tệp, lỗi[]> }
function phaseA(program) {
  const files = program.files ?? {};
  const order = [];
  const errors = new Map();
  const visited = new Set();
  const stack = [];
  const visit = (file) => {
    visited.add(file);
    order.push(file);
    stack.push(file);
    const ast = files[file];
    const errs = structErrors(file, ast, files);
    errors.set(file, errs);
    const children = [];
    for (const inc of includesOf(ast.body)) {
      if (!own(files, inc.path)) {
        errs.push(err('SEM_INCLUDE_NOT_FOUND', `không tìm thấy tệp include: ${inc.path}`, file, inc));
      } else if (stack.includes(inc.path)) {
        errs.push(err('SEM_INCLUDE_CYCLE', `vòng include: ${inc.path}`, file, inc));
      } else {
        children.push(inc.path);
      }
    }
    // Đi xuống theo thứ tự tài liệu; kiểm tra "đã thăm" tại thời điểm đi (hình thoi không phải vòng).
    for (const c of children) if (!visited.has(c)) visit(c);
    stack.pop();
  };
  if (own(files, program.entry)) visit(program.entry);
  return { order, errors };
}

// ---------------------------------------------------------------- Pha B

function collectRefs(ast) {
  const refs = []; // { ref, str, inConst }
  const value = (v, inConst) => {
    if (v.type === 'String') {
      for (const p of v.parts) if (p.type === 'Ref') refs.push({ ref: p, str: v, inConst });
    } else if (v.type === 'Array') {
      for (const it of v.items) value(it, inConst);
    }
  };
  const body = (stmts) => {
    for (const s of stmts) {
      if (s.type === 'Assign') value(s.value, false);
      else if (s.type === 'Const') value(s.value, true);
      else if (s.type === 'Block') body(s.body);
    }
  };
  body(ast.body);
  return refs;
}

// Loại của giá trị đã đánh giá tại đích (để phát hiện nội suy mảng/đối tượng).
function evalKind(merged, target, seen = new Set()) {
  if (target.kind === 'obj') return 'object';
  const { node, file } = target;
  if (node.type === 'Array') return 'array';
  if (node.type !== 'String') return 'scalar';
  if (node.parts.length === 1 && node.parts[0].type === 'Ref') {
    if (seen.has(node)) return 'scalar';
    seen.add(node);
    const t = resolveRef(merged, node.parts[0], file);
    return t ? evalKind(merged, t, seen) : 'scalar';
  }
  return 'scalar';
}

function phaseB(program, order) {
  const merged = mergeProgram(program);
  const edgeCache = new Map();
  const edgesOf = (str, file) => {
    let e = edgeCache.get(str);
    if (!e) {
      e = [];
      for (const p of str.parts) {
        if (p.type !== 'Ref') continue;
        const t = resolveRef(merged, p, file);
        if (t) e.push(...collectStrings(t));
      }
      edgeCache.set(str, e);
    }
    return e;
  };
  const reaches = (seeds, goal) => {
    const seen = new Set();
    const todo = [...seeds];
    while (todo.length) {
      const { node, file } = todo.pop();
      if (node === goal) return true;
      if (seen.has(node)) continue;
      seen.add(node);
      todo.push(...edgesOf(node, file));
    }
    return false;
  };

  const out = [];
  for (const file of order) {
    const errs = [];
    for (const { ref, str, inConst } of collectRefs(program.files[file])) {
      const where = `${ref.const ? '@' : ''}${ref.path.join('.')}`;
      if (!ref.const && inConst) {
        errs.push(err('SEM_CONST_CONFIG_REF', `hằng không được tham chiếu cấu hình: ${where}`, file, ref));
        continue;
      }
      const target = resolveRef(merged, ref, file);
      if (!target) {
        errs.push(err('SEM_UNDEFINED_REF', `tham chiếu không tồn tại: ${where}`, file, ref));
        continue;
      }
      if (reaches(collectStrings(target), str)) {
        errs.push(err('SEM_REF_CYCLE', `vòng tham chiếu: ${where}`, file, ref));
        continue;
      }
      const pure = str.parts.length === 1;
      if (!pure) {
        const kind = evalKind(merged, target);
        if (kind === 'array' || kind === 'object') {
          errs.push(err('SEM_BAD_INTERPOLATION', `không nội suy được mảng/đối tượng: ${where}`, file, ref));
        }
      }
    }
    errs.sort(byPos);
    out.push(...errs);
  }
  return { errors: out, merged };
}

// ---------------------------------------------------------------- Pha C

function kindOf(loc) {
  return loc.type; // object|array|string|number|boolean|null
}

function typeMatches(type, loc) {
  switch (type) {
    case 'string': return loc.type === 'string';
    case 'number': return loc.type === 'number';
    case 'integer': return loc.type === 'number' && Number.isInteger(loc.value);
    case 'boolean': return loc.type === 'boolean';
    case 'null': return loc.type === 'null';
    case 'array': return loc.type === 'array';
    case 'object': return loc.type === 'object';
    default: return true;
  }
}

function phaseC(loc, spec, out) {
  if (!spec || typeof spec !== 'object') return;
  const at = (code, message, p = loc) => out.push(err(code, message, p.file, p));
  if (spec.type !== undefined && spec.type !== 'any' && !typeMatches(spec.type, loc)) {
    at('SEM_TYPE_MISMATCH', `kiểu không khớp: cần ${spec.type}, có ${kindOf(loc)}`);
    return;
  }
  const scalar = loc.type !== 'object' && loc.type !== 'array';
  if (Array.isArray(spec.enum) && scalar && !spec.enum.some((v) => v === loc.value)) {
    at('SEM_NOT_IN_ENUM', 'giá trị không thuộc enum');
    return;
  }
  if (loc.type === 'object' && spec.fields && typeof spec.fields === 'object') {
    const present = new Set(loc.entries.map((e) => e.key));
    for (const k of Object.keys(spec.fields)) {
      if (spec.fields[k] && spec.fields[k].required === true && !present.has(k)) {
        at('SEM_MISSING_REQUIRED', `thiếu khóa bắt buộc: ${k}`);
      }
    }
    for (const e of loc.entries) {
      if (own(spec.fields, e.key)) phaseC(e.value, spec.fields[e.key], out);
      else if (spec.closed === true) at('SEM_UNKNOWN_KEY', `khóa không có trong lược đồ: ${e.key}`, e);
    }
  }
  if (loc.type === 'array' && spec.items) {
    for (const it of loc.items) phaseC(it, spec.items, out);
  }
}

// ---------------------------------------------------------------- API

export function check(program, schema) {
  try {
    const a = phaseA(program);
    const aErrs = a.order.flatMap((f) => a.errors.get(f).slice().sort(byPos));
    if (aErrs.length) return aErrs;

    const b = phaseB(program, a.order);
    if (b.errors.length) return b.errors;

    if (!schema) return [];
    const out = [];
    phaseC(evaluateMerged(b.merged), schema, out);
    return out;
  } catch {
    return [];
  }
}
