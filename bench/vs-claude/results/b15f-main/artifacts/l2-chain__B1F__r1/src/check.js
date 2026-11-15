// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
// Ba pha liên tiếp; pha nào có lỗi thì trả lỗi của pha đó và dừng. Không ném.

import { merge, resolveRef, stringsOf, evalTarget } from './merge.js';

const err = (code, message, file, pos) => ({ code, message, file, line: pos.line, column: pos.column });
const byPos = (a, b) => a.line - b.line || a.column - b.column;

export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const ctx = merge(program);
  const b = phaseB(ctx, a.order);
  if (b.length) return b;
  if (schema === undefined || schema === null) return [];
  return phaseC(ctx, schema);
}

// ---------- Pha A ----------
function phaseA(program) {
  const files = program.files ?? {};
  const order = [];
  const errors = [];
  if (!Object.hasOwn(files, program.entry)) return { order, errors };
  const visited = new Set();
  const onPath = new Set();

  const visit = (file) => {
    visited.add(file);
    onPath.add(file);
    order.push(file);
    const mine = [];
    const includes = [];
    const dupBlock = (body, top) => {
      const keys = new Set();
      const consts = new Set();
      for (const s of body) {
        if (s.type === 'Assign' || s.type === 'Block') {
          if (keys.has(s.key)) mine.push(err('SEM_DUPLICATE_KEY', `Khóa trùng: ${s.key}`, file, s));
          keys.add(s.key);
          if (s.type === 'Block') dupBlock(s.body, false);
        } else if (s.type === 'Const' && top) {
          if (consts.has(s.name)) mine.push(err('SEM_DUPLICATE_CONST', `Hằng trùng: ${s.name}`, file, s));
          consts.add(s.name);
        } else if (s.type === 'Include') {
          includes.push(s);
        }
      }
    };
    // includes cần theo thứ tự tài liệu kể cả trong khối: dupBlock thu theo thứ tự duyệt sâu,
    // đúng thứ tự tài liệu vì khối được duyệt tại chỗ.
    dupBlock(files[file].body, true);
    // Đệ quy xuống include sau khi đã gom lỗi cấu trúc của tệp này; lỗi include thêm vào `mine`.
    const slot = errors.length;
    errors.push(null); // giữ chỗ để lỗi gom theo tệp, theo thứ tự thăm lần đầu
    for (const inc of includes) {
      if (!Object.hasOwn(files, inc.path)) {
        mine.push(err('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp include: ${inc.path}`, file, inc));
      } else if (onPath.has(inc.path)) {
        mine.push(err('SEM_INCLUDE_CYCLE', `Vòng include: ${inc.path}`, file, inc));
      } else if (!visited.has(inc.path)) {
        visit(inc.path);
      }
    }
    mine.sort(byPos);
    errors[slot] = mine;
    onPath.delete(file);
  };

  visit(program.entry);
  return { order, errors: errors.flat() };
}

// ---------- Pha B ----------
function phaseB(ctx, order) {
  const files = ctx.program.files;
  // Thu mọi String (nút AST) của mỗi tệp kèm cờ "nằm trong const".
  const fileOf = new Map(); // String node -> file
  const perFile = new Map(); // file -> [{ node, inConst }]
  for (const file of order) {
    const list = [];
    const val = (v, inConst) => {
      if (v.type === 'String') {
        list.push({ node: v, inConst });
        fileOf.set(v, file);
      } else if (v.type === 'Array') for (const it of v.items) val(it, inConst);
    };
    const body = (stmts) => {
      for (const s of stmts) {
        if (s.type === 'Assign') val(s.value, false);
        else if (s.type === 'Const') val(s.value, true);
        else if (s.type === 'Block') body(s.body);
      }
    };
    body(files[file].body);
    perFile.set(file, list);
  }

  const refs = (node) => node.parts.filter((p) => p.type === 'Ref');
  const targetOf = new Map(); // Ref -> target | null
  for (const [file, list] of perFile) {
    for (const { node } of list) {
      for (const r of refs(node)) {
        const res = resolveRef(ctx, r, file);
        targetOf.set(r, res.found ? res.target : null);
      }
    }
  }

  // Cạnh s -> S(đích của từng Ref phân giải được trong s), memo.
  const edgeCache = new Map();
  const edges = (s) => {
    let e = edgeCache.get(s);
    if (!e) {
      e = [];
      for (const r of refs(s)) {
        const t = targetOf.get(r);
        if (t) for (const x of stringsOf(t)) e.push(x.node);
      }
      edgeCache.set(s, e);
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
      for (const m of edges(n)) stack.push(m);
    }
    return false;
  };

  // Loại giá trị đã đánh giá của đích: 'array' | 'object' | 'scalar' (không cần đánh giá đầy đủ).
  const kindOf = (t, visiting = new Set()) => {
    if (t.kind === 'object') return 'object';
    const n = t.node;
    if (n.type === 'Array') return 'array';
    if (n.type !== 'String') return 'scalar';
    if (visiting.has(n)) return 'scalar';
    if (n.parts.length === 1 && n.parts[0].type === 'Ref') {
      const sub = targetOf.get(n.parts[0]);
      if (!sub) return 'scalar';
      visiting.add(n);
      const k = kindOf(sub, visiting);
      visiting.delete(n);
      return k;
    }
    return 'scalar';
  };

  const errors = [];
  for (const file of order) {
    const mine = [];
    for (const { node, inConst } of perFile.get(file)) {
      const rs = refs(node);
      const pure = node.parts.length === 1 && rs.length === 1;
      for (const r of rs) {
        const t = targetOf.get(r);
        if (!r.const && inConst) {
          mine.push(err('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình', file, r));
        } else if (!t) {
          mine.push(err('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${r.path.join('.')}`, file, r));
        } else if (reaches(stringsOf(t).map((x) => x.node), node)) {
          mine.push(err('SEM_REF_CYCLE', `Vòng tham chiếu: ${r.path.join('.')}`, file, r));
        } else if (!pure && kindOf(t) !== 'scalar') {
          mine.push(err('SEM_BAD_INTERPOLATION', `Không nội suy được mảng/đối tượng: ${r.path.join('.')}`, file, r));
        }
      }
    }
    mine.sort(byPos);
    errors.push(...mine);
  }
  return errors;
}

// ---------- Pha C ----------
function phaseC(ctx, schema) {
  const errors = [];
  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  const typeOk = (t, v) => {
    if (t === 'any') return true;
    if (t === 'integer') return typeof v === 'number' && Number.isInteger(v);
    return typeOf(v) === t;
  };

  // Phân giải chuỗi thuần tham chiếu tới đích cuối; trả { target, pos } (pos: vị trí ghi đè nếu có).
  const settle = (target, override) => {
    let cur = target;
    let pos = override;
    for (let guard = 0; guard < 10000; guard++) {
      if (cur.kind !== 'node' || cur.node.type !== 'String') break;
      const parts = cur.node.parts;
      if (!(parts.length === 1 && parts[0].type === 'Ref')) break;
      if (!pos) pos = { file: cur.file, line: cur.node.line, column: cur.node.column };
      const r = resolveRef(ctx, parts[0], cur.file);
      if (!r.found) break;
      cur = r.target;
    }
    return { target: cur, pos };
  };

  const walk = (target, spec, override) => {
    if (!spec || typeof spec !== 'object') return;
    const s = settle(target, override);
    const t = s.target;
    let pos = s.pos;
    let value;
    let kind;
    if (t.kind === 'object') {
      kind = 'object';
      if (!pos) pos = t.block ? { file: t.file, line: t.block.line, column: t.block.column } : { file: ctx.program.entry, line: 1, column: 1 };
    } else {
      value = evalTarget(ctx, t);
      kind = typeOf(value);
      if (!pos) pos = { file: t.file, line: t.node.line, column: t.node.column };
    }
    const bad = (code, message, at = pos) => errors.push(err(code, message, at.file, at));
    if (spec.type !== undefined && spec.type !== 'any') {
      const ok = kind === 'object' ? spec.type === 'object' : typeOk(spec.type, value);
      if (!ok) return bad('SEM_TYPE_MISMATCH', `Kiểu không khớp: cần ${spec.type}, có ${kind}`);
    }
    if (Array.isArray(spec.enum) && kind !== 'object' && kind !== 'array') {
      if (!spec.enum.some((e) => e === value)) return bad('SEM_NOT_IN_ENUM', 'Giá trị không thuộc enum');
    }
    if (kind === 'object' && spec.fields && typeof spec.fields === 'object') {
      for (const [k, f] of Object.entries(spec.fields)) {
        if (f && f.required === true && !t.entries.has(k)) bad('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc: ${k}`);
      }
      for (const [k, e] of t.entries) {
        if (Object.hasOwn(spec.fields, k)) walk(e.value, spec.fields[k], s.pos);
        else if (spec.closed === true) {
          errors.push(err('SEM_UNKNOWN_KEY', `Khóa không được phép: ${k}`, e.file, e.stmt));
        }
      }
    }
    if (kind === 'array' && spec.items) {
      const node = t.node;
      node.items.forEach((it) => walk({ kind: 'node', node: it, file: t.file }, spec.items, s.pos));
    }
  };

  walk(ctx.root, schema, undefined);
  return errors;
}
