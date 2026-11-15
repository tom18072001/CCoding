// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
import { buildMerged, resolveRef, evaluateNode, leafOf, NOT_FOUND } from './evaluate.js';

const err = (code, message, file, node) => ({ code, message, file, line: node.line, column: node.column });
const byPos = (a, b) => a.line - b.line || a.column - b.column;

// ── Pha A ───────────────────────────────────────────────────────────────────
function phaseA(program) {
  const order = []; // thứ tự thăm tiền thứ tự
  const groups = [];
  const visited = new Set();
  const onPath = new Set();

  const visit = (file) => {
    visited.add(file);
    onPath.add(file);
    order.push(file);
    const errs = [];
    groups.push(errs);
    const includes = [];
    const seenConst = new Set();
    const scan = (stmts, top) => {
      const keys = new Set();
      for (const s of stmts) {
        if (s.type === 'Assign' || s.type === 'Block') {
          if (keys.has(s.key)) errs.push(err('SEM_DUPLICATE_KEY', `khóa trùng: ${s.key}`, file, s));
          keys.add(s.key);
          if (s.type === 'Block') scan(s.body, false);
        } else if (s.type === 'Const') {
          if (seenConst.has(s.name)) errs.push(err('SEM_DUPLICATE_CONST', `hằng trùng: ${s.name}`, file, s));
          seenConst.add(s.name);
        } else if (s.type === 'Include') {
          includes.push(s);
        }
      }
    };
    // includes theo thứ tự tài liệu (kể cả trong khối): scan duyệt tiền thứ tự nên đúng thứ tự
    scan(program.files[file].body, true);
    for (const inc of includes) {
      if (!Object.prototype.hasOwnProperty.call(program.files, inc.path)) {
        errs.push(err('SEM_INCLUDE_NOT_FOUND', `không tìm thấy tệp include: ${inc.path}`, file, inc));
      } else if (onPath.has(inc.path)) {
        errs.push(err('SEM_INCLUDE_CYCLE', `include vòng: ${inc.path}`, file, inc));
      } else if (!visited.has(inc.path)) {
        visit(inc.path);
      }
    }
    onPath.delete(file);
  };
  visit(program.entry);
  const out = [];
  for (const g of groups) out.push(...g.sort(byPos));
  return { order, errors: out };
}

// ── Pha B ───────────────────────────────────────────────────────────────────
function collectStrings(program, order) {
  const list = []; // { node, file, inConst }
  const val = (v, file, inConst) => {
    if (v.type === 'String') list.push({ node: v, file, inConst });
    else if (v.type === 'Array') for (const it of v.items) val(it, file, inConst);
  };
  const walk = (stmts, file) => {
    for (const s of stmts) {
      if (s.type === 'Assign') val(s.value, file, false);
      else if (s.type === 'Const') val(s.value, file, true);
      else if (s.type === 'Block') walk(s.body, file);
    }
  };
  const perFile = new Map();
  for (const f of order) {
    list.length = 0;
    walk(program.files[f].body, f);
    perFile.set(f, [...list]);
  }
  return perFile;
}

const isPure = (str) => str.parts.length === 1 && str.parts[0].type === 'Ref';

function stringsIn(t, out, info) {
  if (t.kind === 'object') {
    for (const e of t.entries.values()) stringsIn(e.value, out, info);
    return out;
  }
  const walk = (n) => {
    if (n.type === 'String') out.add(n);
    else if (n.type === 'Array') n.items.forEach(walk);
  };
  walk(t.node);
  return out;
}

function phaseB(program, order) {
  const merged = buildMerged(program);
  const perFile = collectStrings(program, order);
  const fileOf = new Map();
  for (const [f, l] of perFile) for (const x of l) fileOf.set(x.node, f);

  const targetOf = (ref, str) => resolveRef(ref, fileOf.get(str), merged);

  const edgeMemo = new Map();
  const edges = (str) => {
    let s = edgeMemo.get(str);
    if (s) return s;
    s = new Set();
    for (const p of str.parts) {
      if (p.type !== 'Ref') continue;
      const t = targetOf(p, str);
      if (t !== NOT_FOUND) stringsIn(t, s);
    }
    edgeMemo.set(str, s);
    return s;
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

  // loại giá trị đã đánh giá của đích: 'container' (mảng/đối tượng) | 'scalar' | null (không xác định)
  const kindOf = (t, seen = new Set()) => {
    if (t === NOT_FOUND) return null;
    if (t.kind === 'object') return 'container';
    const n = t.node;
    if (n.type === 'Array') return 'container';
    if (n.type !== 'String') return 'scalar';
    if (!isPure(n)) return 'scalar';
    if (seen.has(n)) return null;
    seen.add(n);
    return kindOf(targetOf(n.parts[0], n), seen);
  };

  const errors = [];
  for (const f of order) {
    const errs = [];
    for (const { node, file, inConst } of perFile.get(f)) {
      for (const p of node.parts) {
        if (p.type !== 'Ref') continue;
        if (inConst && !p.const) {
          errs.push(err('SEM_CONST_CONFIG_REF', 'hằng không được tham chiếu cấu hình', file, p));
          continue;
        }
        const t = targetOf(p, node);
        if (t === NOT_FOUND) {
          errs.push(err('SEM_UNDEFINED_REF', `tham chiếu không tồn tại: ${p.path.join('.')}`, file, p));
          continue;
        }
        if (reaches(stringsIn(t, new Set()), node)) {
          errs.push(err('SEM_REF_CYCLE', `vòng tham chiếu: ${p.path.join('.')}`, file, p));
          continue;
        }
        if (!isPure(node) && kindOf(t) === 'container') {
          errs.push(err('SEM_BAD_INTERPOLATION', `không nội suy được mảng/đối tượng: ${p.path.join('.')}`, file, p));
        }
      }
    }
    errors.push(...errs.sort(byPos));
  }
  return { errors, merged };
}

// ── Pha C ───────────────────────────────────────────────────────────────────
function phaseC(program, merged, schema) {
  const errors = [];
  const ctx = { merged, stack: new Set() };
  const at = (file, n) => ({ file, line: n.line, column: n.column });
  const push = (code, message, p) => errors.push({ code, message, file: p.file, line: p.line, column: p.column });

  const walk = (t, spec, ovr) => {
    // đi theo chuỗi thuần tham chiếu; vị trí là chuỗi ngoài cùng
    while (t.kind === 'node' && t.node.type === 'String' && isPure(t.node)) {
      ovr = ovr || at(t.file, t.node);
      t = resolveRef(t.node.parts[0], t.file, merged);
    }
    const pos = ovr || (t.kind === 'object' ? at(t.file, t) : at(t.file, t.node));
    let kind;
    if (t.kind === 'object') kind = 'object';
    else {
      switch (t.node.type) {
        case 'Number': kind = Number.isInteger(t.node.value) ? 'integer' : 'number'; break;
        case 'String': kind = 'string'; break;
        case 'Bool': kind = 'boolean'; break;
        case 'Null': kind = 'null'; break;
        default: kind = 'array';
      }
    }
    if (spec.type && spec.type !== 'any') {
      const ok = spec.type === kind || (spec.type === 'number' && kind === 'integer');
      if (!ok) return push('SEM_TYPE_MISMATCH', `kiểu không khớp: cần ${spec.type}, có ${kind}`, pos);
    }
    const scalar = kind !== 'object' && kind !== 'array';
    if (spec.enum && scalar) {
      const v = evaluateNode(t, t.file, ctx);
      if (!spec.enum.includes(v)) return push('SEM_NOT_IN_ENUM', 'giá trị ngoài enum', pos);
    }
    if (kind === 'object' && spec.fields) {
      for (const [k, sub] of Object.entries(spec.fields)) {
        if (sub && sub.required === true && !t.entries.has(k)) push('SEM_MISSING_REQUIRED', `thiếu khóa bắt buộc: ${k}`, pos);
      }
      for (const [k, e] of t.entries) {
        if (Object.prototype.hasOwnProperty.call(spec.fields, k)) walk(e.value, spec.fields[k], ovr);
        else if (spec.closed === true) push('SEM_UNKNOWN_KEY', `khóa không được phép: ${k}`, ovr || at(e.file, e.stmt));
      }
    }
    if (kind === 'array' && spec.items) {
      for (const it of t.node.items) walk(leafOf(it, t.file), spec.items, ovr);
    }
  };
  walk(merged.root, schema, null);
  return errors;
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const b = phaseB(program, a.order);
  if (b.errors.length) return b.errors;
  if (!schema) return [];
  return phaseC(program, b.merged, schema);
}
