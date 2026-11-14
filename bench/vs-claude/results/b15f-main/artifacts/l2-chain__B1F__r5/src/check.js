// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
import { buildContext, resolveRef, collectStrings, isPureRef, evalCell, evalLocated } from './merge.js';

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const byPos = (a, b) => a.line - b.line || a.column - b.column;
const mk = (code, message, file, pos) => ({ code, message, file, line: pos.line, column: pos.column });

// ---------- Pha A ----------
function phaseA(program) {
  const order = [];
  const errsByFile = new Map();
  const visited = new Set();
  const onPath = new Set();

  function visit(file) {
    visited.add(file);
    onPath.add(file);
    order.push(file);
    const errs = [];
    errsByFile.set(file, errs);
    const ast = program.files[file];

    const consts = new Set();
    for (const st of ast.body) {
      if (st.type === 'Const') {
        if (consts.has(st.name)) errs.push(mk('SEM_DUPLICATE_CONST', `Hằng '${st.name}' khai báo lặp`, file, st));
        else consts.add(st.name);
      }
    }

    const walk = (stmts) => {
      const keys = new Set();
      for (const st of stmts) {
        if (st.type === 'Assign' || st.type === 'Block') {
          if (keys.has(st.key)) errs.push(mk('SEM_DUPLICATE_KEY', `Khóa '${st.key}' trùng trong cùng khối`, file, st));
          else keys.add(st.key);
          if (st.type === 'Block') walk(st.body);
        } else if (st.type === 'Include') {
          if (!has(program.files, st.path)) {
            errs.push(mk('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp include '${st.path}'`, file, st));
          } else if (onPath.has(st.path)) {
            errs.push(mk('SEM_INCLUDE_CYCLE', `Vòng include tới '${st.path}'`, file, st));
          } else if (!visited.has(st.path)) {
            visit(st.path);
          }
        }
      }
    };
    walk(ast.body);
    onPath.delete(file);
  }

  if (has(program.files, program.entry)) visit(program.entry);
  const out = [];
  for (const f of order) out.push(...errsByFile.get(f).sort(byPos));
  return { order, errors: out };
}

// ---------- Pha B ----------
function phaseB(program, order) {
  const ctx = buildContext(program);
  const edgeCache = new Map(); // String node -> [{node,file}]

  const edgesOf = (s) => {
    let e = edgeCache.get(s.node);
    if (!e) {
      e = [];
      for (const p of s.node.parts) {
        if (p.type !== 'Ref') continue;
        const t = resolveRef(ctx, p, s.file);
        if (t) e.push(...collectStrings(t));
      }
      edgeCache.set(s.node, e);
    }
    return e;
  };

  const reaches = (start, goal) => {
    const seen = new Set();
    const stack = [...start];
    while (stack.length) {
      const s = stack.pop();
      if (s.node === goal) return true;
      if (seen.has(s.node)) continue;
      seen.add(s.node);
      stack.push(...edgesOf(s));
    }
    return false;
  };

  const isContainer = (target) => {
    try {
      const v = evalCell(ctx, target);
      return v !== null && typeof v === 'object';
    } catch {
      return false; // đích có lỗi riêng đã được báo ở Ref khác
    }
  };

  const out = [];
  for (const file of order) {
    const errs = [];
    const checkString = (node, inConst) => {
      const pure = isPureRef(node);
      for (const r of node.parts) {
        if (r.type !== 'Ref') continue;
        if (inConst && !r.const) {
          errs.push(mk('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình', file, r));
          continue;
        }
        const t = resolveRef(ctx, r, file);
        if (!t) {
          errs.push(mk('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${r.const ? '@' : ''}${r.path.join('.')}`, file, r));
          continue;
        }
        if (reaches(collectStrings(t), node)) {
          errs.push(mk('SEM_REF_CYCLE', 'Vòng tham chiếu', file, r));
          continue;
        }
        if (!pure && isContainer(t)) {
          errs.push(mk('SEM_BAD_INTERPOLATION', 'Nội suy giá trị mảng/đối tượng vào chuỗi', file, r));
        }
      }
    };
    const walkValue = (v, inConst) => {
      if (v.type === 'String') checkString(v, inConst);
      else if (v.type === 'Array') for (const it of v.items) walkValue(it, inConst);
    };
    const walk = (stmts) => {
      for (const st of stmts) {
        if (st.type === 'Assign') walkValue(st.value, false);
        else if (st.type === 'Const') walkValue(st.value, true);
        else if (st.type === 'Block') walk(st.body);
      }
    };
    walk(program.files[file].body);
    out.push(...errs.sort(byPos));
  }
  return { ctx, errors: out };
}

// ---------- Pha C ----------
function kindOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v; // object | string | number | boolean
}

function typeOk(type, v) {
  switch (type) {
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number';
    case 'integer': return typeof v === 'number' && Number.isInteger(v);
    case 'boolean': return typeof v === 'boolean';
    case 'null': return v === null;
    case 'array': return Array.isArray(v);
    case 'object': return kindOf(v) === 'object';
    default: return true;
  }
}

function phaseC(ctx, schema) {
  const errs = [];
  const at = (code, message, loc) => errs.push(mk(code, message, loc.file, loc));

  const validate = (n, spec) => {
    if (!spec || typeof spec !== 'object') return;
    const v = n.value;
    if (spec.type && spec.type !== 'any' && !typeOk(spec.type, v)) {
      at('SEM_TYPE_MISMATCH', `Kiểu không khớp: cần ${spec.type}, có ${kindOf(v)}`, n.loc);
      return;
    }
    const k = kindOf(v);
    if (Array.isArray(spec.enum) && k !== 'array' && k !== 'object' && !spec.enum.some((x) => x === v)) {
      at('SEM_NOT_IN_ENUM', 'Giá trị không thuộc enum', n.loc);
      return;
    }
    if (k === 'object' && spec.fields && typeof spec.fields === 'object') {
      for (const key of Object.keys(spec.fields)) {
        const fs = spec.fields[key];
        if (fs && fs.required === true && !has(v, key)) {
          at('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc '${key}'`, n.loc);
        }
      }
      for (const e of n.entries) {
        if (has(spec.fields, e.key)) validate(e.node, spec.fields[e.key]);
        else if (spec.closed === true) at('SEM_UNKNOWN_KEY', `Khóa không được phép '${e.key}'`, e.loc);
      }
    }
    if (k === 'array' && spec.items && n.items) {
      for (const it of n.items) validate(it, spec.items);
    }
  };

  let root;
  try {
    root = evalLocated(ctx, ctx.root);
  } catch {
    return errs;
  }
  validate(root, schema);
  return errs;
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const b = phaseB(program, a.order);
  if (b.errors.length) return b.errors;
  if (schema === undefined || schema === null) return [];
  return phaseC(b.ctx, schema);
}
