// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5. Ba pha tuần tự, pha có lỗi thì dừng.
import { buildMerged, listStrings } from './merge.js';
import { evaluate } from './evaluate.js';

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const err = (code, message, file, n) => ({ code, message, file, line: n.line, column: n.column });
const byPos = (a, b) => a.line - b.line || a.column - b.column;

/** Pha A. Trả { errors, order } — order là thứ tự thăm tiền thứ tự các tệp. */
function phaseA(program) {
  const { entry, files } = program;
  const order = [];
  const visited = new Set();
  const onPath = new Set();
  const perFile = new Map();

  const visit = (file) => {
    visited.add(file);
    onPath.add(file);
    order.push(file);
    const errors = [];
    perFile.set(file, errors);

    const stmts = (body, top) => {
      const keys = new Set();
      const consts = new Set();
      for (const st of body) {
        if (st.type === 'Assign' || st.type === 'Block') {
          if (keys.has(st.key)) {
            errors.push(err('SEM_DUPLICATE_KEY', `khóa trùng: ${st.key}`, file, st));
          }
          keys.add(st.key);
          if (st.type === 'Block') stmts(st.body, false);
        } else if (st.type === 'Const' && top) {
          if (consts.has(st.name)) {
            errors.push(err('SEM_DUPLICATE_CONST', `hằng trùng: ${st.name}`, file, st));
          }
          consts.add(st.name);
        } else if (st.type === 'Include') {
          if (!hasOwn(files, st.path)) {
            errors.push(err('SEM_INCLUDE_NOT_FOUND', `không tìm thấy tệp: ${st.path}`, file, st));
          } else if (onPath.has(st.path)) {
            errors.push(err('SEM_INCLUDE_CYCLE', `include vòng: ${st.path}`, file, st));
          } else if (!visited.has(st.path)) {
            visit(st.path);
          }
        }
      }
    };
    stmts(files[file].body, true);
    onPath.delete(file);
  };
  if (hasOwn(files, entry)) visit(entry);

  const errors = [];
  for (const f of order) errors.push(...perFile.get(f).sort(byPos));
  return { errors, order };
}

const isPure = (s) => s.parts.length === 1 && s.parts[0].type === 'Ref';

/** Pha B. */
function phaseB(program, order, merged) {
  const inOrder = new Set(order);
  const strings = listStrings(program).filter((s) => inOrder.has(s.file));

  // S(node): các chuỗi {node, file} nằm trong nút của cây hợp nhất (chỉ định nghĩa thắng).
  const collect = (n, out) => {
    if (n.kind === 'object') {
      for (const e of n.entries.values()) collect(e.node, out);
    } else if (n.ast.type === 'String') {
      out.push({ node: n.ast, file: n.file });
    } else if (n.ast.type === 'Array') {
      const walk = (v) => {
        if (v.type === 'String') out.push({ node: v, file: n.file });
        else if (v.type === 'Array') v.items.forEach(walk);
      };
      walk(n.ast);
    }
  };
  const S = (n) => {
    const out = [];
    collect(n, out);
    return out;
  };

  const edgeCache = new Map();
  const edges = (s) => {
    let e = edgeCache.get(s.node);
    if (e) return e;
    e = [];
    for (const p of s.node.parts) {
      if (p.type !== 'Ref') continue;
      const t = merged.resolve(p, s.file);
      if (t) e.push(...S(t));
    }
    edgeCache.set(s.node, e);
    return e;
  };

  const reaches = (starts, goal) => {
    const seen = new Set();
    const stack = [...starts];
    while (stack.length) {
      const c = stack.pop();
      if (c.node === goal) return true;
      if (seen.has(c.node)) continue;
      seen.add(c.node);
      stack.push(...edges(c));
    }
    return false;
  };

  // Loại đã đánh giá của đích: theo chuỗi thuần tham chiếu cho tới khi gặp nút thật.
  const evalKind = (n, seen = new Set()) => {
    for (;;) {
      if (n.kind === 'object') return 'composite';
      if (n.ast.type === 'Array') return 'composite';
      if (n.ast.type === 'String' && isPure(n.ast)) {
        if (seen.has(n.ast)) return 'scalar';
        seen.add(n.ast);
        const t = merged.resolve(n.ast.parts[0], n.file);
        if (!t) return 'scalar';
        n = t;
        continue;
      }
      return 'scalar';
    }
  };

  const perFile = new Map(order.map((f) => [f, []]));
  for (const s of strings) {
    for (const ref of s.node.parts) {
      if (ref.type !== 'Ref') continue;
      let e = null;
      if (!ref.const && s.inConst) {
        e = err('SEM_CONST_CONFIG_REF', 'hằng không được tham chiếu cấu hình', s.file, ref);
      } else {
        const target = merged.resolve(ref, s.file);
        if (!target) {
          e = err('SEM_UNDEFINED_REF', `tham chiếu không tồn tại: ${ref.path.join('.')}`, s.file, ref);
        } else if (reaches(S(target), s.node)) {
          e = err('SEM_REF_CYCLE', `vòng tham chiếu: ${ref.path.join('.')}`, s.file, ref);
        } else if (!isPure(s.node) && evalKind(target) === 'composite') {
          e = err('SEM_BAD_INTERPOLATION', 'nội suy mảng/đối tượng vào chuỗi', s.file, ref);
        }
      }
      if (e) perFile.get(s.file).push(e);
    }
  }
  const errors = [];
  for (const f of order) errors.push(...perFile.get(f).sort(byPos));
  return errors;
}

const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function typeOk(type, v) {
  if (type === undefined || type === 'any') return true;
  const k = kindOf(v);
  if (type === 'integer') return k === 'number' && Number.isInteger(v);
  return k === type;
}

/** Pha C: kiểm lược đồ trên giá trị đã đánh giá, song song với cây hợp nhất. */
function phaseC(program, schema, merged) {
  const value = evaluate(program);
  const errors = [];

  const walk = (node, val, spec, override) => {
    // theo chuỗi thuần tham chiếu: vị trí là của chuỗi ngoài cùng
    while (node.kind === 'value' && node.ast.type === 'String' && isPure(node.ast)) {
      if (!override) {
        override = { file: node.file, line: node.ast.line, column: node.ast.column };
      }
      const t = merged.resolve(node.ast.parts[0], node.file);
      if (!t) return;
      node = t;
    }
    const pos =
      override ||
      (node.kind === 'object'
        ? { file: node.file, line: node.line, column: node.column }
        : { file: node.file, line: node.ast.line, column: node.ast.column });
    const at = (code, message, p = pos) => errors.push(err(code, message, p.file, p));

    if (!spec) return;
    if (!typeOk(spec.type, val)) {
      at('SEM_TYPE_MISMATCH', `kiểu không khớp, cần ${spec.type}`);
      return;
    }
    if (spec.enum && (val === null || typeof val !== 'object') && !spec.enum.includes(val)) {
      at('SEM_NOT_IN_ENUM', 'giá trị không thuộc enum');
      return;
    }
    if (node.kind === 'object' && spec.fields) {
      for (const k of Object.keys(spec.fields)) {
        if (spec.fields[k] && spec.fields[k].required === true && !node.entries.has(k)) {
          at('SEM_MISSING_REQUIRED', `thiếu khóa bắt buộc: ${k}`);
        }
      }
      for (const [k, e] of node.entries) {
        if (hasOwn(spec.fields, k)) {
          walk(e.node, val[k], spec.fields[k], override);
        } else if (spec.closed === true) {
          at('SEM_UNKNOWN_KEY', `khóa không có trong lược đồ: ${k}`, e);
        }
      }
    } else if (node.kind === 'value' && node.ast.type === 'Array' && spec.items) {
      node.ast.items.forEach((it, i) => {
        walk({ kind: 'value', ast: it, file: node.file }, val[i], spec.items, override);
      });
    }
  };

  walk(merged.root, value, schema, null);
  return errors;
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const merged = buildMerged(program);
  const b = phaseB(program, a.order, merged);
  if (b.length) return b;
  if (schema === undefined || schema === null) return [];
  return phaseC(program, schema, merged);
}
