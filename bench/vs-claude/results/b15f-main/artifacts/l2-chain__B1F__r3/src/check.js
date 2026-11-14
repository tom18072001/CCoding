// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
// Dùng src/merge.js cho hợp nhất có vị trí và phân giải đường dẫn (không viết logic thứ hai).

import { createMerged, isObj } from './merge.js';

const mk = (code, message, file, line, column) => ({ code, message, file, line, column });
const byPos = (a, b) => a.line - b.line || a.column - b.column;

// ───────────── Pha A ─────────────
function phaseA(program) {
  const files = program.files;
  const has = (n) => Object.hasOwn(files, n);
  const order = []; // tên tệp theo thứ tự thăm đầu tiên
  const groups = []; // lỗi theo tệp, cùng thứ tự
  const visited = new Set();
  const onPath = new Set();

  function visit(file) {
    visited.add(file);
    onPath.add(file);
    order.push(file);
    const errs = [];
    groups.push(errs);

    const walk = (body, top) => {
      const seen = new Set();
      const consts = new Set();
      for (const st of body) {
        if (st.type === 'Assign' || st.type === 'Block') {
          if (seen.has(st.key)) {
            errs.push(mk('SEM_DUPLICATE_KEY', `Khóa "${st.key}" bị khai báo trùng trong cùng một khối`, file, st.line, st.column));
          }
          seen.add(st.key);
          if (st.type === 'Block') walk(st.body, false);
        } else if (st.type === 'Const' && top) {
          if (consts.has(st.name)) {
            errs.push(mk('SEM_DUPLICATE_CONST', `Hằng "${st.name}" bị khai báo trùng`, file, st.line, st.column));
          }
          consts.add(st.name);
        } else if (st.type === 'Include') {
          if (!has(st.path)) {
            errs.push(mk('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp include "${st.path}"`, file, st.line, st.column));
          } else if (onPath.has(st.path)) {
            errs.push(mk('SEM_INCLUDE_CYCLE', `Include vòng tới "${st.path}"`, file, st.line, st.column));
          } else if (!visited.has(st.path)) {
            visit(st.path);
          }
        }
      }
    };
    walk(files[file].body, true);
    onPath.delete(file);
  }

  if (has(program.entry)) visit(program.entry);
  const errors = [];
  for (const g of groups) errors.push(...g.sort(byPos));
  return { errors, order };
}

// ───────────── Pha B ─────────────
function stringsInFile(ast) {
  const out = [];
  const val = (v, inConst) => {
    if (v.type === 'String') out.push({ node: v, inConst });
    else if (v.type === 'Array') for (const it of v.items) val(it, inConst);
  };
  const walk = (body) => {
    for (const st of body) {
      if (st.type === 'Assign') val(st.value, false);
      else if (st.type === 'Const') val(st.value, true);
      else if (st.type === 'Block') walk(st.body);
    }
  };
  walk(ast.body);
  return out;
}

function phaseB(program, order, m) {
  const files = program.files;
  const fileOf = new Map(); // nút String -> tệp
  const perFile = order.map((file) => {
    const list = stringsInFile(files[file]);
    for (const s of list) fileOf.set(s.node, file);
    return { file, list };
  });
  const refsOf = (node) => node.parts.filter((p) => p.type === 'Ref');
  const name = (r) => `${r.const ? '@' : ''}${r.path.join('.')}`;

  const targetCache = new Map();
  const targetOf = (ref, file) => {
    if (!targetCache.has(ref)) targetCache.set(ref, m.resolve(ref, file));
    return targetCache.get(ref);
  };
  // Cạnh: s -> S(đích của từng Ref phân giải được trong s)
  const edgeCache = new Map();
  const edges = (node) => {
    let e = edgeCache.get(node);
    if (!e) {
      e = [];
      const file = fileOf.get(node);
      for (const r of refsOf(node)) {
        const t = targetOf(r, file);
        if (t) for (const s of m.stringsOf(t)) e.push(s.node);
      }
      edgeCache.set(node, e);
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
      for (const x of edges(n)) stack.push(x);
    }
    return false;
  };

  // Đích có giá trị đã đánh giá là mảng/đối tượng? (đi theo chuỗi thuần tham chiếu)
  const compCache = new Map();
  const isComposite = (t, guard = new Set()) => {
    if (isObj(t)) return true;
    const n = t.node;
    if (n.type === 'Array') return true;
    if (n.type !== 'String' || !m.isPureRef(n)) return false;
    if (compCache.has(n)) return compCache.get(n);
    if (guard.has(n)) return false;
    guard.add(n);
    const nt = targetOf(n.parts[0], t.file);
    const r = nt ? isComposite(nt, guard) : false;
    guard.delete(n);
    compCache.set(n, r);
    return r;
  };

  const errors = [];
  for (const { file, list } of perFile) {
    const errs = [];
    for (const { node, inConst } of list) {
      const pure = m.isPureRef(node);
      for (const r of refsOf(node)) {
        if (!r.const && inConst) {
          errs.push(mk('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình (chỉ được tham chiếu hằng khác)', file, r.line, r.column));
          continue;
        }
        const t = targetOf(r, file);
        if (!t) {
          errs.push(mk('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${name(r)}`, file, r.line, r.column));
          continue;
        }
        if (reaches(m.stringsOf(t).map((s) => s.node), node)) {
          errs.push(mk('SEM_REF_CYCLE', `Tham chiếu vòng: ${name(r)}`, file, r.line, r.column));
          continue;
        }
        if (!pure && isComposite(t)) {
          errs.push(mk('SEM_BAD_INTERPOLATION', `Không thể nội suy mảng/đối tượng vào chuỗi: ${name(r)}`, file, r.line, r.column));
        }
      }
    }
    errors.push(...errs.sort(byPos));
  }
  return errors;
}

// ───────────── Pha C ─────────────
function phaseC(schema, m) {
  const errors = [];
  const MAX_HOPS = 10000;

  const typeOk = (type, v) => {
    switch (type) {
      case 'integer': return typeof v === 'number' && Number.isInteger(v);
      case 'number': return typeof v === 'number';
      case 'string': return typeof v === 'string';
      case 'boolean': return typeof v === 'boolean';
      case 'null': return v === null;
      case 'array': return Array.isArray(v);
      case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
      default: return true;
    }
  };

  function walk(target, spec, ovr) {
    // đi theo chuỗi thuần tham chiếu; vị trí = chuỗi ngoài cùng
    let hops = 0;
    while (!isObj(target) && target.node.type === 'String' && m.isPureRef(target.node) && hops++ < MAX_HOPS) {
      if (!ovr) ovr = { file: target.file, line: target.node.line, column: target.node.column };
      const nt = m.resolve(target.node.parts[0], target.file);
      if (!nt) return;
      target = nt;
    }
    const pos = ovr ?? (isObj(target)
      ? target.pos
      : { file: target.file, line: target.node.line, column: target.node.column });
    const err = (code, message, p = pos) => errors.push(mk(code, message, p.file, p.line, p.column));
    const hasType = spec.type && spec.type !== 'any';

    let arrayNode = null;
    if (isObj(target)) {
      if (hasType && !typeOk(spec.type, {})) {
        return err('SEM_TYPE_MISMATCH', `Kiểu không khớp: cần ${spec.type}, nhận object`);
      }
    } else {
      const n = target.node;
      let scalar;
      let kind;
      if (n.type === 'Array') { kind = 'array'; arrayNode = n; }
      else if (n.type === 'String') { scalar = m.evalString(n, target.file); kind = 'string'; }
      else if (n.type === 'Null') { scalar = null; kind = 'null'; }
      else { scalar = n.value; kind = typeof n.value; }
      if (hasType && !typeOk(spec.type, kind === 'array' ? [] : scalar)) {
        return err('SEM_TYPE_MISMATCH', `Kiểu không khớp: cần ${spec.type}, nhận ${kind}`);
      }
      if (!arrayNode && Array.isArray(spec.enum) && !spec.enum.includes(scalar)) {
        return err('SEM_NOT_IN_ENUM', 'Giá trị không thuộc danh sách enum cho phép');
      }
    }

    if (isObj(target) && spec.fields && typeof spec.fields === 'object') {
      for (const k of Object.keys(spec.fields)) {
        if (spec.fields[k] && spec.fields[k].required === true && !target.entries.has(k)) {
          err('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc "${k}"`);
        }
      }
      for (const [k, e] of target.entries) {
        if (Object.hasOwn(spec.fields, k)) {
          walk(e.value, spec.fields[k], ovr);
        } else if (spec.closed === true) {
          err('SEM_UNKNOWN_KEY', `Khóa "${k}" không có trong lược đồ`, ovr ?? { file: e.def.file, line: e.def.line, column: e.def.column });
        }
      }
    }

    if (arrayNode && spec.items) {
      for (const it of arrayNode.items) walk({ node: it, file: target.file }, spec.items, ovr);
    }
  }

  walk(m.root, schema, null);
  return errors;
}

export function check(program, schema) {
  try {
    const a = phaseA(program);
    if (a.errors.length) return a.errors;
    const m = createMerged(program);
    const b = phaseB(program, a.order, m);
    if (b.length) return b;
    if (schema === undefined || schema === null) return [];
    return phaseC(schema, m);
  } catch (e) {
    return [mk('SEM_INTERNAL', `Lỗi nội bộ khi kiểm tra: ${e && e.message}`, program?.entry ?? '', 1, 1)];
  }
}
