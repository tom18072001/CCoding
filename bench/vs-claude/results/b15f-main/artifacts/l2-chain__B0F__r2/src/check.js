// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
// Pha A (cấu trúc) và pha B (tham chiếu). Pha C (lược đồ) do hạng mục S6 bổ sung ở `phaC`.

import { merge, resolveRef, evaluate } from './evaluate.js';

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const byPos = (x, y) => x.line - y.line || x.column - y.column;
const err = (code, message, file, line, column) => ({ code, message, file, line, column });

// ── Pha A ──────────────────────────────────────────────────────────────
function phaseA(program) {
  const files = program.files || {};
  const errors = [];
  const order = []; // thứ tự thăm lần đầu (tiền thứ tự)
  const visited = new Set();
  const onPath = new Set();

  const visit = (file) => {
    visited.add(file);
    order.push(file);
    onPath.add(file);
    const local = [];
    const children = [];

    const walk = (body, top) => {
      const keys = new Map();
      const consts = new Set();
      for (const s of body) {
        if (s.type === 'Assign' || s.type === 'Block') {
          if (keys.has(s.key)) {
            local.push(err('SEM_DUPLICATE_KEY', `khóa trùng: ${s.key}`, file, s.line, s.column));
          }
          keys.set(s.key, true);
          if (s.type === 'Block') walk(s.body, false);
        } else if (s.type === 'Const' && top) {
          if (consts.has(s.name)) {
            local.push(err('SEM_DUPLICATE_CONST', `hằng trùng: ${s.name}`, file, s.line, s.column));
          }
          consts.add(s.name);
        } else if (s.type === 'Include') {
          if (!hasOwn(files, s.path)) {
            local.push(err('SEM_INCLUDE_NOT_FOUND', `không tìm thấy tệp: ${s.path}`, file, s.line, s.column));
          } else if (onPath.has(s.path)) {
            local.push(err('SEM_INCLUDE_CYCLE', `include vòng: ${s.path}`, file, s.line, s.column));
          } else {
            children.push(s.path);
          }
        }
      }
    };
    walk(files[file].body, true);

    // Lỗi của tệp này được gom trước khi xuống tệp con (thứ tự thăm lần đầu).
    local.sort(byPos);
    errors.push(...local);
    for (const c of children) {
      if (!visited.has(c)) visit(c);
    }
    onPath.delete(file);
  };

  if (hasOwn(files, program.entry)) visit(program.entry);
  return { errors, order };
}

// ── Pha B ──────────────────────────────────────────────────────────────
function phaseB(program, order) {
  const merged = merge(program);
  const fileRank = new Map(order.map((f, i) => [f, i]));

  // S(đích): các nút String nằm trong đích (chỉ định nghĩa thắng).
  const stringsOf = (t, out = []) => {
    if (t.kind === 'object') {
      for (const e of t.entries.values()) stringsOf(e.value, out);
    } else {
      collectAst(t.node, out);
    }
    return out;
  };
  const collectAst = (node, out) => {
    if (node.type === 'String') out.push(node);
    else if (node.type === 'Array') for (const it of node.items) collectAst(it, out);
  };

  // Cạnh: String → S(đích của từng Ref phân giải được trong nó).
  const stringFile = new Map();
  for (const info of merged.strings) stringFile.set(info.node, info.file);
  const edgeCache = new Map();
  const edges = (node) => {
    let e = edgeCache.get(node);
    if (e) return e;
    e = [];
    const file = stringFile.get(node);
    for (const p of node.parts) {
      if (p.type !== 'Ref') continue;
      const t = resolveRef(merged, p, file);
      if (t) stringsOf(t, e);
    }
    edgeCache.set(node, e);
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

  // Kiểu đích khi đánh giá: 'composite' (mảng/đối tượng) hay 'scalar'.
  const isComposite = (t, seen = new Set()) => {
    if (t.kind === 'object') return true;
    const n = t.node;
    if (n.type === 'Array') return true;
    if (n.type !== 'String') return false;
    if (n.parts.length === 1 && n.parts[0].type === 'Ref') {
      if (seen.has(n)) return false;
      seen.add(n);
      const t2 = resolveRef(merged, n.parts[0], t.file);
      return t2 ? isComposite(t2, seen) : false;
    }
    return false;
  };

  const errors = [];
  for (const info of merged.strings) {
    const { node, file } = info;
    const pure = node.parts.length === 1 && node.parts[0].type === 'Ref';
    for (const p of node.parts) {
      if (p.type !== 'Ref') continue;
      if (!p.const && info.const) {
        errors.push(err('SEM_CONST_CONFIG_REF', 'hằng không được tham chiếu cấu hình', file, p.line, p.column));
        continue;
      }
      const t = resolveRef(merged, p, file);
      if (!t) {
        errors.push(err('SEM_UNDEFINED_REF', `tham chiếu không tồn tại: ${p.path.join('.')}`, file, p.line, p.column));
        continue;
      }
      if (reaches(stringsOf(t), node)) {
        errors.push(err('SEM_REF_CYCLE', `vòng tham chiếu: ${p.path.join('.')}`, file, p.line, p.column));
        continue;
      }
      if (!pure && isComposite(t)) {
        errors.push(err('SEM_BAD_INTERPOLATION', `không nội suy mảng/đối tượng: ${p.path.join('.')}`, file, p.line, p.column));
      }
    }
  }
  errors.sort((x, y) => (fileRank.get(x.file) - fileRank.get(y.file)) || byPos(x, y));
  return { errors, merged };
}

// ── Pha C ──────────────────────────────────────────────────────────────
// Duyệt song song cây đích của merge (để lấy vị trí) và giá trị đã đánh giá (để kiểm kiểu).
function phaseC(program, schema, merged) {
  const value = evaluate(program);
  const errors = [];

  const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  const typeOk = (type, v) => {
    const k = kindOf(v);
    if (type === 'integer') return k === 'number' && Number.isInteger(v);
    return k === type;
  };

  // t: ObjectNode | ValueNode; val: giá trị đã đánh giá của t; over: vị trí chuỗi thuần tham chiếu ngoài cùng.
  const walk = (t, val, spec, over) => {
    while (t.kind === 'value' && t.node.type === 'String' && t.node.parts.length === 1 && t.node.parts[0].type === 'Ref') {
      if (!over) over = { file: t.file, line: t.node.line, column: t.node.column };
      const next = resolveRef(merged, t.node.parts[0], t.file);
      if (!next) break;
      t = next;
    }
    const pos = over || (t.kind === 'object'
      ? { file: t.file, line: t.line, column: t.column }
      : { file: t.file, line: t.node.line, column: t.node.column });
    const fail = (code, message) => errors.push(err(code, message, pos.file, pos.line, pos.column));

    if (spec.type !== undefined && spec.type !== 'any' && !typeOk(spec.type, val)) {
      fail('SEM_TYPE_MISMATCH', `kiểu không khớp: cần ${spec.type}, có ${kindOf(val)}`);
      return;
    }
    const k = kindOf(val);
    if (Array.isArray(spec.enum) && k !== 'object' && k !== 'array' && !spec.enum.includes(val)) {
      fail('SEM_NOT_IN_ENUM', `giá trị không thuộc enum: ${JSON.stringify(val)}`);
      return;
    }
    if (k === 'object' && spec.fields && t.kind === 'object') {
      const fields = spec.fields;
      for (const key of Object.keys(fields)) {
        if (fields[key] && fields[key].required === true && !t.entries.has(key)) {
          fail('SEM_MISSING_REQUIRED', `thiếu khóa bắt buộc: ${key}`);
        }
      }
      for (const [key, e] of t.entries) {
        if (hasOwn(fields, key)) {
          walk(e.value, val[key], fields[key], over);
        } else if (spec.closed === true) {
          errors.push(err('SEM_UNKNOWN_KEY', `khóa không có trong lược đồ: ${key}`, e.file, e.stmt.line, e.stmt.column));
        }
      }
    } else if (k === 'array' && spec.items && t.kind === 'value' && t.node.type === 'Array') {
      t.node.items.forEach((it, i) => walk({ kind: 'value', node: it, file: t.file }, val[i], spec.items, over));
    }
  };

  walk(merged.root, value, schema, null);
  return errors;
}

export function check(program, schema) {
  try {
    const a = phaseA(program);
    if (a.errors.length) return a.errors;
    const b = phaseB(program, a.order);
    if (b.errors.length) return b.errors;
    if (schema) return phaseC(program, schema, b.merged);
    return [];
  } catch (e) {
    return [err('SEM_INTERNAL', String(e && e.message), program && program.entry, 1, 1)];
  }
}
