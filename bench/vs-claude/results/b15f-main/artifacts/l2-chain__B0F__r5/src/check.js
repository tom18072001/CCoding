// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
// Ba pha A (cấu trúc) → B (tham chiếu) → C (lược đồ); pha có lỗi thì dừng.
// Logic hợp nhất/phân giải dùng lại hoàn toàn từ merge.js và evaluate.js.
import { merge, resolveRef, stringsIn, targetPosition } from './merge.js';
import { evaluateTarget } from './evaluate.js';

const err = (code, message, file, line, column) => ({ code, message, file, line, column });
const byPos = (a, b) => a.line - b.line || a.column - b.column;

export function check(program, schema) {
  const { errors: a, order } = phaseA(program);
  if (a.length) return a;
  const ctx = merge(program);
  const b = phaseB(ctx, order);
  if (b.length) return b;
  if (schema) return phaseC(ctx, schema);
  return [];
}

// ---------- Pha A ----------
function phaseA(program) {
  const perFile = new Map(); // file -> lỗi, theo thứ tự thăm lần đầu
  const order = [];
  const visited = new Set();
  const stack = new Set();

  const visit = (file) => {
    visited.add(file);
    stack.add(file);
    order.push(file);
    const list = [];
    perFile.set(file, list);

    const walk = (body, top) => {
      const keys = new Set();
      const consts = new Set();
      for (const st of body) {
        if (st.type === 'Assign' || st.type === 'Block') {
          if (keys.has(st.key)) {
            list.push(err('SEM_DUPLICATE_KEY', `Khóa trùng: ${st.key}`, file, st.line, st.column));
          }
          keys.add(st.key);
          if (st.type === 'Block') walk(st.body, false);
        } else if (st.type === 'Const' && top) {
          if (consts.has(st.name)) {
            list.push(err('SEM_DUPLICATE_CONST', `Hằng trùng: ${st.name}`, file, st.line, st.column));
          }
          consts.add(st.name);
        } else if (st.type === 'Include') {
          if (!Object.hasOwn(program.files, st.path)) {
            list.push(err('SEM_INCLUDE_NOT_FOUND', `Không thấy tệp include: ${st.path}`, file, st.line, st.column));
          } else if (stack.has(st.path)) {
            list.push(err('SEM_INCLUDE_CYCLE', `Vòng include: ${st.path}`, file, st.line, st.column));
          } else if (!visited.has(st.path)) {
            visit(st.path);
          }
        }
      }
    };
    walk(program.files[file].body, true);
    stack.delete(file);
  };

  if (Object.hasOwn(program.files, program.entry)) visit(program.entry);
  const errors = [];
  for (const list of perFile.values()) errors.push(...list.sort(byPos));
  return { errors, order };
}

// ---------- Pha B ----------
function isPureRef(node) {
  return node.parts.length === 1 && node.parts[0].type === 'Ref';
}

function collectStrings(ast) {
  const out = []; // { node, inConst }
  const val = (node, inConst) => {
    if (node.type === 'String') out.push({ node, inConst });
    else if (node.type === 'Array') for (const it of node.items) val(it, inConst);
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

function phaseB(ctx, order) {
  const errors = [];
  const edgeCache = new Map(); // String node -> [{node, file}]
  const refsOf = (node) => node.parts.filter((p) => p.type === 'Ref');
  const edges = (node, file) => {
    let e = edgeCache.get(node);
    if (!e) {
      e = [];
      for (const r of refsOf(node)) {
        const t = resolveRef(ctx, r, file);
        if (t) e.push(...stringsIn(t));
      }
      edgeCache.set(node, e);
    }
    return e;
  };
  // Từ tập xuất phát có tới được `goal` không (0 hoặc nhiều bước)?
  const reaches = (starts, goal) => {
    const seen = new Set();
    const todo = [...starts];
    while (todo.length) {
      const { node, file } = todo.pop();
      if (node === goal) return true;
      if (seen.has(node)) continue;
      seen.add(node);
      todo.push(...edges(node, file));
    }
    return false;
  };

  for (const file of order) {
    const list = [];
    for (const { node, inConst } of collectStrings(ctx.program.files[file])) {
      const pure = isPureRef(node);
      for (const r of refsOf(node)) {
        const at = (code, msg) => list.push(err(code, msg, file, r.line, r.column));
        if (inConst && !r.const) {
          at('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình');
          continue;
        }
        const t = resolveRef(ctx, r, file);
        if (!t) {
          at('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${r.path.join('.')}`);
          continue;
        }
        if (reaches(stringsIn(t), node)) {
          at('SEM_REF_CYCLE', `Vòng tham chiếu: ${r.path.join('.')}`);
          continue;
        }
        if (!pure) {
          let v;
          try { v = evaluateTarget(ctx, t); } catch { continue; }
          if (v !== null && typeof v === 'object') {
            at('SEM_BAD_INTERPOLATION', `Nội suy mảng/đối tượng: ${r.path.join('.')}`);
          }
        }
      }
    }
    errors.push(...list.sort(byPos));
  }
  return errors;
}

// ---------- Pha C ----------
function kindOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v; // string | number | boolean | object
}

function typeMatches(type, v) {
  const k = kindOf(v);
  if (type === 'integer') return k === 'number' && Number.isInteger(v);
  return k === type;
}

function phaseC(ctx, schema) {
  const errors = [];

  // override: vị trí của chuỗi thuần tham chiếu ngoài cùng đang chứa giá trị này (hoặc null).
  const walk = (target, spec, override) => {
    if (target.kind === 'node' && target.node.type === 'String' && isPureRef(target.node)) {
      const next = resolveRef(ctx, target.node.parts[0], target.file);
      if (next) return walk(next, spec, override || targetPosition(target));
    }
    const pos = override || targetPosition(target);
    const push = (code, msg) => errors.push(err(code, msg, pos.file, pos.line, pos.column));
    const value = evaluateTarget(ctx, target);
    const kind = kindOf(value);

    if (spec.type && spec.type !== 'any' && !typeMatches(spec.type, value)) {
      push('SEM_TYPE_MISMATCH', `Kiểu không khớp, cần ${spec.type}`);
      return;
    }
    if (Array.isArray(spec.enum) && kind !== 'array' && kind !== 'object' && !spec.enum.includes(value)) {
      push('SEM_NOT_IN_ENUM', 'Giá trị không thuộc enum');
      return;
    }
    if (target.kind === 'object' && spec.fields) {
      const fields = spec.fields;
      for (const k of Object.keys(fields)) {
        if (fields[k] && fields[k].required === true && !target.entries.has(k)) {
          push('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc: ${k}`);
        }
      }
      for (const [k, e] of target.entries) {
        if (Object.hasOwn(fields, k)) {
          walk(e.value, fields[k], override);
        } else if (spec.closed === true) {
          errors.push(err('SEM_UNKNOWN_KEY', `Khóa lạ: ${k}`, e.file, e.node.line, e.node.column));
        }
      }
    } else if (target.kind === 'node' && target.node.type === 'Array' && spec.items) {
      for (const it of target.node.items) {
        walk({ kind: 'node', node: it, file: target.file }, spec.items, override);
      }
    }
  };

  walk(ctx.root, schema, null);
  return errors;
}
