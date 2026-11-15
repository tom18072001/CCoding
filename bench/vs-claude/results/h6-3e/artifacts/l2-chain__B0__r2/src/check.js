// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.

import { buildMerged, resolveRef, evaluateAnnotated } from './merge.js';

const byPos = (a, b) => a.line - b.line || a.column - b.column;

function includesOf(stmts, out = []) {
  for (const s of stmts) {
    if (s.type === 'Include') out.push(s);
    else if (s.type === 'Block') includesOf(s.body, out);
  }
  return out;
}

// Thứ tự thăm tệp (tiền thứ tự) + lỗi pha A theo tệp.
function phaseA(program) {
  const errors = [];
  const visited = new Set();
  const stack = [];
  const order = [];
  const visit = (file) => {
    visited.add(file);
    order.push(file);
    stack.push(file);
    const ast = program.files[file];
    const mine = [];
    const err = (code, message, n) => mine.push({ code, message, file, line: n.line, column: n.column });

    const dupKeys = (stmts) => {
      const seen = new Set();
      for (const s of stmts) {
        if (s.type === 'Assign' || s.type === 'Block') {
          if (seen.has(s.key)) err('SEM_DUPLICATE_KEY', `Khóa trùng "${s.key}"`, s);
          seen.add(s.key);
          if (s.type === 'Block') dupKeys(s.body);
        }
      }
    };
    dupKeys(ast.body);
    const consts = new Set();
    for (const s of ast.body) {
      if (s.type !== 'Const') continue;
      if (consts.has(s.name)) err('SEM_DUPLICATE_CONST', `Hằng trùng "${s.name}"`, s);
      consts.add(s.name);
    }

    const incs = includesOf(ast.body);
    const toVisit = [];
    for (const inc of incs) {
      if (!Object.hasOwn(program.files, inc.path)) {
        err('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp "${inc.path}"`, inc);
      } else if (stack.includes(inc.path)) {
        err('SEM_INCLUDE_CYCLE', `Vòng include tới "${inc.path}"`, inc);
      } else {
        toVisit.push(inc.path);
      }
    }
    mine.sort(byPos);
    errors.push(...mine);
    // Thăm theo thứ tự tài liệu; kiểm tra "đã thăm" lúc thực sự đi xuống.
    for (const p of toVisit) if (!visited.has(p)) visit(p);
    stack.pop();
  };
  if (Object.hasOwn(program.files, program.entry)) visit(program.entry);
  return { errors, order };
}

function forEachString(node, fn) {
  if (node.type === 'String') fn(node);
  else if (node.type === 'Array') for (const i of node.items) forEachString(i, fn);
}

function phaseB(program, order) {
  const root = buildMerged(program);
  const fileOf = new Map(); // String node -> file
  const refsOf = []; // { file, ref, str, inConst }
  for (const file of order) {
    const add = (str, inConst) => {
      fileOf.set(str, file);
      for (const p of str.parts) if (p.type === 'Ref') refsOf.push({ file, ref: p, str, inConst });
    };
    const walk = (stmts) => {
      for (const s of stmts) {
        if (s.type === 'Assign') forEachString(s.value, (x) => add(x, false));
        else if (s.type === 'Const') forEachString(s.value, (x) => add(x, true));
        else if (s.type === 'Block') walk(s.body);
      }
    };
    walk(program.files[file].body);
  }

  const stringsOf = (t, out = []) => {
    if (t.kind === 'node') forEachString(t.node, (x) => out.push(x));
    else for (const e of t.map.values()) stringsOf(e, out);
    return out;
  };

  const targetCache = new Map();
  const targetOf = (str, ref) => {
    let m = targetCache.get(ref);
    if (m === undefined) {
      m = resolveRef(program, root, fileOf.get(str), ref);
      targetCache.set(ref, m);
    }
    return m;
  };
  const edgeCache = new Map();
  const edges = (s) => {
    let e = edgeCache.get(s);
    if (!e) {
      e = [];
      for (const p of s.parts) {
        if (p.type !== 'Ref') continue;
        const t = targetOf(s, p);
        if (t) stringsOf(t, e);
      }
      edgeCache.set(s, e);
    }
    return e;
  };
  const reaches = (starts, goal) => {
    const seen = new Set();
    const todo = [...starts];
    while (todo.length) {
      const x = todo.pop();
      if (x === goal) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      todo.push(...edges(x));
    }
    return false;
  };

  // Loại giá trị đã đánh giá của đích: 'composite' (mảng/đối tượng) hay không.
  const isComposite = (t, seen = new Set()) => {
    if (t.kind === 'obj') return true;
    const n = t.node;
    if (n.type === 'Array') return true;
    if (n.type !== 'String') return false;
    if (n.parts.length === 1 && n.parts[0].type === 'Ref') {
      if (seen.has(n)) return false;
      seen.add(n);
      const nt = targetOf(n, n.parts[0]);
      return nt ? isComposite(nt, seen) : false;
    }
    return false;
  };

  const out = [];
  for (const { file, ref, str, inConst } of refsOf) {
    const mk = (code, message) => out.push({ code, message, file, line: ref.line, column: ref.column });
    if (!ref.const && inConst) {
      mk('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình');
      continue;
    }
    const t = targetOf(str, ref);
    if (!t) {
      mk('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${ref.path.join('.')}`);
      continue;
    }
    if (reaches(stringsOf(t), str)) {
      mk('SEM_REF_CYCLE', 'Vòng tham chiếu');
      continue;
    }
    const pure = str.parts.length === 1;
    if (!pure && isComposite(t)) mk('SEM_BAD_INTERPOLATION', 'Không nội suy mảng/đối tượng vào chuỗi');
  }
  // Gom theo tệp theo thứ tự thăm, trong tệp theo vị trí.
  const rank = new Map(order.map((f, i) => [f, i]));
  return out
    .map((e, i) => [e, i])
    .sort((x, y) => rank.get(x[0].file) - rank.get(y[0].file) || byPos(x[0], y[0]) || x[1] - y[1])
    .map((x) => x[0]);
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function typeMatches(v, type) {
  switch (type) {
    case 'any': return true;
    case 'integer': return typeof v === 'number' && Number.isInteger(v);
    case 'number': return typeof v === 'number';
    default: return typeOf(v) === type;
  }
}

function phaseC(program, schema) {
  const errs = [];
  const root = evaluateAnnotated(program);
  const push = (code, message, pos) =>
    errs.push({ code, message, file: pos.file, line: pos.line, column: pos.column });
  const walk = (a, spec) => {
    if (!spec || typeof spec !== 'object') return;
    const v = a.v;
    if (spec.type && spec.type !== 'any' && !typeMatches(v, spec.type)) {
      push('SEM_TYPE_MISMATCH', `Sai kiểu, cần ${spec.type}`, a.pos);
      return;
    }
    const kind = typeOf(v);
    if (Array.isArray(spec.enum) && kind !== 'array' && kind !== 'object' && !spec.enum.includes(v)) {
      push('SEM_NOT_IN_ENUM', 'Giá trị ngoài enum', a.pos);
      return;
    }
    if (kind === 'object' && spec.fields) {
      for (const k of Object.keys(spec.fields)) {
        if (spec.fields[k] && spec.fields[k].required === true && !a.kids.has(k)) {
          push('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc "${k}"`, a.pos);
        }
      }
      for (const [k, child] of a.kids) {
        if (Object.hasOwn(spec.fields, k)) walk(child, spec.fields[k]);
        else if (spec.closed === true) push('SEM_UNKNOWN_KEY', `Khóa lạ "${k}"`, child.keyPos);
      }
    }
    if (kind === 'array' && spec.items) {
      for (const child of a.kids) walk(child, spec.items);
    }
  };
  walk(root, schema);
  return errs;
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const b = phaseB(program, a.order);
  if (b.length) return b;
  if (schema) return phaseC(program, schema);
  return [];
}
