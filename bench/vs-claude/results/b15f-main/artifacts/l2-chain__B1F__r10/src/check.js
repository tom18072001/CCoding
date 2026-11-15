// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
// Ba pha A → B → C; pha nào có lỗi thì trả lỗi pha đó và dừng. Không ném.
import { buildMerged, resolveRef, collectStrings, stringsOfFile, evaluateString } from './evaluate.js';

const mk = (code, message, file, line, column) => ({ code, message, file, line, column });
const byPos = (a, b) => a.line - b.line || a.column - b.column;
const isRefOnly = (s) => s.parts.length === 1 && s.parts[0].type === 'Ref';
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Mọi câu lệnh include của một danh sách câu lệnh, theo thứ tự tài liệu (kể cả trong khối).
function* includesOf(body) {
  for (const st of body) {
    if (st.type === 'Include') yield st;
    else if (st.type === 'Block') yield* includesOf(st.body);
  }
}

// ---------- Pha A ----------
function phaseA(program) {
  const errors = [];
  const order = [];
  const visited = new Set();
  const onPath = new Set();

  const dupKeys = (file, body, out) => {
    const seen = new Set();
    for (const st of body) {
      if (st.type !== 'Assign' && st.type !== 'Block') continue;
      if (seen.has(st.key)) out.push(mk('SEM_DUPLICATE_KEY', `khóa trùng: ${st.key}`, file, st.line, st.column));
      else seen.add(st.key);
      if (st.type === 'Block') dupKeys(file, st.body, out);
    }
  };

  const visit = (file) => {
    visited.add(file);
    onPath.add(file);
    order.push(file);
    const ast = program.files[file];
    const local = [];
    dupKeys(file, ast.body, local);
    const consts = new Set();
    for (const st of ast.body) {
      if (st.type !== 'Const') continue;
      if (consts.has(st.name)) local.push(mk('SEM_DUPLICATE_CONST', `hằng trùng: ${st.name}`, file, st.line, st.column));
      else consts.add(st.name);
    }
    const children = [];
    for (const inc of includesOf(ast.body)) {
      if (!has(program.files, inc.path)) {
        local.push(mk('SEM_INCLUDE_NOT_FOUND', `không tìm thấy tệp: ${inc.path}`, file, inc.line, inc.column));
      } else if (onPath.has(inc.path)) {
        local.push(mk('SEM_INCLUDE_CYCLE', `include vòng: ${inc.path}`, file, inc.line, inc.column));
      } else children.push(inc.path);
    }
    // Lỗi của tệp này đứng trước lỗi của các tệp được thăm sau nó (tiền thứ tự).
    errors.push({ file, list: local });
    for (const c of children) if (!visited.has(c)) visit(c);
    onPath.delete(file);
  };

  if (has(program.files, program.entry)) visit(program.entry);
  const flat = [];
  for (const g of errors) flat.push(...g.list.sort(byPos));
  return { errors: flat, order };
}

// ---------- Pha B ----------
// Loại "kết cấu" của đích sau khi đánh giá, không đệ quy vô hạn (vòng coi như vô hướng).
function isComposite(merged, target, seen = new Set()) {
  if (target.kind === 'object') return true;
  const n = target.node;
  if (n.type === 'Array') return true;
  if (n.type === 'String' && isRefOnly(n)) {
    if (seen.has(n)) return false;
    seen.add(n);
    const t = resolveRef(merged, n.parts[0], target.file);
    return t ? isComposite(merged, t, seen) : false;
  }
  return false;
}

function phaseB(merged, order) {
  const program = merged.program;
  const edgeMemo = new Map();
  const edges = (node, file) => {
    let e = edgeMemo.get(node);
    if (!e) {
      e = [];
      for (const p of node.parts) {
        if (p.type !== 'Ref') continue;
        const t = resolveRef(merged, p, file);
        if (t) e.push(...collectStrings(t));
      }
      edgeMemo.set(node, e);
    }
    return e;
  };
  const inCycle = (ref, s, file) => {
    const t = resolveRef(merged, ref, file);
    const seen = new Set();
    const stack = [...collectStrings(t)];
    while (stack.length) {
      const cur = stack.pop();
      if (cur.node === s) return true;
      if (seen.has(cur.node)) continue;
      seen.add(cur.node);
      stack.push(...edges(cur.node, cur.file));
    }
    return false;
  };

  const errors = [];
  for (const file of order) {
    const local = [];
    for (const { node: s, inConst } of stringsOfFile(program.files[file])) {
      const pure = isRefOnly(s);
      for (const ref of s.parts) {
        if (ref.type !== 'Ref') continue;
        const at = (code, msg) => local.push(mk(code, msg, file, ref.line, ref.column));
        const name = (ref.const ? '@' : '') + ref.path.join('.');
        if (!ref.const && inConst) {
          at('SEM_CONST_CONFIG_REF', `hằng không được tham chiếu cấu hình: ${name}`);
          continue;
        }
        const target = resolveRef(merged, ref, file);
        if (!target) {
          at('SEM_UNDEFINED_REF', `tham chiếu không tồn tại: ${name}`);
          continue;
        }
        if (inCycle(ref, s, file)) {
          at('SEM_REF_CYCLE', `tham chiếu vòng: ${name}`);
          continue;
        }
        if (!pure && isComposite(merged, target)) {
          at('SEM_BAD_INTERPOLATION', `không nội suy mảng/đối tượng vào chuỗi: ${name}`);
        }
      }
    }
    errors.push(...local.sort(byPos));
  }
  return errors;
}

// ---------- Pha C ----------
function phaseC(merged, schema) {
  const errors = [];
  const err = (code, message, loc) => errors.push(mk(code, message, loc.file, loc.line, loc.column));
  const nodeLoc = (t) => ({ file: t.file, line: t.node.line, column: t.node.column });
  const objLoc = (o) =>
    o.block ? { file: o.file, line: o.block.line, column: o.block.column } : { file: o.file, line: 1, column: 1 };

  const walk = (target, spec, override) => {
    if (!spec || typeof spec !== 'object') return;
    let t = target;
    let ov = override;
    // Chuỗi thuần tham chiếu: giá trị là đích; vị trí là chuỗi ngoài cùng.
    const seen = new Set();
    while (t.kind === 'ast' && t.node.type === 'String' && isRefOnly(t.node)) {
      if (seen.has(t.node)) return;
      seen.add(t.node);
      if (!ov) ov = nodeLoc(t);
      const n = resolveRef(merged, t.node.parts[0], t.file);
      if (!n) return;
      t = n;
    }
    const loc = ov ?? (t.kind === 'object' ? objLoc(t) : nodeLoc(t));
    let kind;
    let scalar;
    if (t.kind === 'object') kind = 'object';
    else {
      const n = t.node;
      if (n.type === 'Array') kind = 'array';
      else if (n.type === 'Number') (kind = 'number'), (scalar = n.value);
      else if (n.type === 'Bool') (kind = 'boolean'), (scalar = n.value);
      else if (n.type === 'Null') (kind = 'null'), (scalar = null);
      else (kind = 'string'), (scalar = evaluateString(merged, n, t.file));
    }

    // 1. type
    const type = spec.type;
    if (type && type !== 'any') {
      const ok = type === 'integer' ? kind === 'number' && Number.isInteger(scalar) : type === kind;
      if (!ok && ['string', 'number', 'integer', 'boolean', 'null', 'array', 'object'].includes(type)) {
        err('SEM_TYPE_MISMATCH', `sai kiểu, cần ${type}, có ${kind}`, loc);
        return;
      }
    }
    // 2. enum
    if (Array.isArray(spec.enum) && kind !== 'object' && kind !== 'array') {
      if (!spec.enum.some((v) => v === scalar)) {
        err('SEM_NOT_IN_ENUM', 'giá trị không thuộc enum', loc);
        return;
      }
    }
    // 3. fields
    if (kind === 'object' && spec.fields && typeof spec.fields === 'object') {
      for (const [k, sub] of Object.entries(spec.fields)) {
        if (sub && sub.required === true && !t.entries.has(k)) {
          err('SEM_MISSING_REQUIRED', `thiếu khóa bắt buộc: ${k}`, loc);
        }
      }
      for (const [k, e] of t.entries) {
        if (has(spec.fields, k)) walk(e.value, spec.fields[k], ov);
        else if (spec.closed === true) {
          err('SEM_UNKNOWN_KEY', `khóa không được phép: ${k}`, { file: e.file, line: e.node.line, column: e.node.column });
        }
      }
    }
    // 4. items
    if (kind === 'array' && spec.items) {
      for (const it of t.node.items) walk({ kind: 'ast', node: it, file: t.file }, spec.items, ov);
    }
  };

  walk(merged.root, schema, null);
  return errors;
}

/**
 * @param {{entry: string, files: Object<string, object>}} program đầu ra parseProject
 * @param {object} [schema]
 * @returns {{code: string, message: string, file: string, line: number, column: number}[]}
 */
export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  if (!a.order.length) return [];
  const merged = buildMerged(program);
  const b = phaseB(merged, a.order);
  if (b.length) return b;
  if (schema === undefined || schema === null) return [];
  return phaseC(merged, schema);
}
