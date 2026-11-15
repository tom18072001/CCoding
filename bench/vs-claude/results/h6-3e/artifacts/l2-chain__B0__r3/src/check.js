// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
import { buildModel, resolveRef, evalTarget } from './model.js';

const byPos = (a, b) => a.line - b.line || a.column - b.column;
const err = (code, message, file, line, column) => ({ code, message, file, line, column });

// ---------- Pha A ----------
function phaseA(program) {
  const { entry, files } = program;
  const order = [];
  const perFile = new Map();
  const visited = new Set();
  const onPath = new Set();

  const dupKeys = (stmts, file, errors) => {
    const seen = new Set();
    for (const s of stmts) {
      if (s.type === 'Assign' || s.type === 'Block') {
        if (seen.has(s.key)) errors.push(err('SEM_DUPLICATE_KEY', `Khóa trùng: ${s.key}`, file, s.line, s.column));
        seen.add(s.key);
        if (s.type === 'Block') dupKeys(s.body, file, errors);
      }
    }
  };
  const includes = (stmts, out = []) => {
    for (const s of stmts) {
      if (s.type === 'Include') out.push(s);
      else if (s.type === 'Block') includes(s.body, out);
    }
    return out;
  };

  const visit = (file) => {
    visited.add(file);
    onPath.add(file);
    order.push(file);
    const errors = [];
    perFile.set(file, errors);
    const ast = files[file];
    dupKeys(ast.body, file, errors);
    const consts = new Set();
    for (const s of ast.body) {
      if (s.type === 'Const') {
        if (consts.has(s.name)) errors.push(err('SEM_DUPLICATE_CONST', `Hằng trùng: ${s.name}`, file, s.line, s.column));
        consts.add(s.name);
      }
    }
    for (const inc of includes(ast.body)) {
      if (!Object.hasOwn(files, inc.path)) {
        errors.push(err('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp: ${inc.path}`, file, inc.line, inc.column));
      } else if (onPath.has(inc.path)) {
        errors.push(err('SEM_INCLUDE_CYCLE', `Vòng include: ${inc.path}`, file, inc.line, inc.column));
      } else if (!visited.has(inc.path)) {
        visit(inc.path);
      }
    }
    onPath.delete(file);
  };
  if (Object.hasOwn(files, entry)) visit(entry);
  const out = [];
  for (const f of order) out.push(...perFile.get(f).sort(byPos));
  return { errors: out, order };
}

// ---------- Pha B ----------
function collectStrings(ast) {
  const list = [];
  const val = (n, inConst) => {
    if (n.type === 'String') list.push({ node: n, inConst });
    else if (n.type === 'Array') for (const x of n.items) val(x, inConst);
  };
  const walk = (stmts) => {
    for (const s of stmts) {
      if (s.type === 'Assign') val(s.value, false);
      else if (s.type === 'Const') val(s.value, true);
      else if (s.type === 'Block') walk(s.body);
    }
  };
  walk(ast.body);
  return list;
}

function stringsOfNode(node, out) {
  if (node.type === 'String') out.push(node);
  else if (node.type === 'Array') for (const x of node.items) stringsOfNode(x, out);
}
function stringsOfTarget(t, out) {
  if (t.kind === 'val') return stringsOfNode(t.node, out);
  for (const e of t.obj.keys.values()) {
    if (e.kind === 'obj') stringsOfTarget({ kind: 'obj', obj: e.obj }, out);
    else stringsOfNode(e.node, out);
  }
}

function phaseB(program, order) {
  const model = buildModel(program);
  const fileOf = new Map(); // nút String -> tệp
  const infos = [];
  for (const file of order) {
    for (const s of collectStrings(program.files[file])) {
      fileOf.set(s.node, file);
      infos.push({ ...s, file });
    }
  }

  const edgeCache = new Map();
  const edges = (s) => {
    let e = edgeCache.get(s);
    if (e) return e;
    e = [];
    const file = fileOf.get(s);
    for (const p of s.parts) {
      if (p.type !== 'Ref') continue;
      const t = resolveRef(model, file, p);
      if (t) stringsOfTarget(t, e);
    }
    edgeCache.set(s, e);
    return e;
  };
  const reaches = (starts, goal) => {
    const seen = new Set();
    const stack = [...starts];
    while (stack.length) {
      const x = stack.pop();
      if (x === goal) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      for (const y of edges(x)) stack.push(y);
    }
    return false;
  };

  const typeOf = (t, guard) => {
    if (t.kind === 'obj') return 'object';
    const n = t.node;
    if (n.type === 'Array') return 'array';
    if (n.type === 'String' && n.parts.length === 1 && n.parts[0].type === 'Ref') {
      if (guard.has(n)) return 'scalar';
      guard.add(n);
      const t2 = resolveRef(model, t.file, n.parts[0]);
      const r = t2 ? typeOf(t2, guard) : 'scalar';
      guard.delete(n);
      return r;
    }
    return 'scalar';
  };

  const errors = [];
  for (const file of order) {
    const fileErrors = [];
    for (const { node, inConst } of infos.filter((x) => x.file === file)) {
      const pure = node.parts.length === 1 && node.parts[0].type === 'Ref';
      for (const r of node.parts) {
        if (r.type !== 'Ref') continue;
        const at = (code, msg) => fileErrors.push(err(code, msg, file, r.line, r.column));
        if (inConst && !r.const) { at('SEM_CONST_CONFIG_REF', 'const không được tham chiếu cấu hình'); continue; }
        const t = resolveRef(model, file, r);
        if (!t) { at('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${r.path.join('.')}`); continue; }
        const start = [];
        stringsOfTarget(t, start);
        if (reaches(start, node)) { at('SEM_REF_CYCLE', 'Vòng tham chiếu'); continue; }
        if (!pure && typeOf(t, new Set()) !== 'scalar' && typeOf(t, new Set()) !== 'string') {
          at('SEM_BAD_INTERPOLATION', 'Không nội suy được mảng/đối tượng vào chuỗi');
        }
      }
    }
    errors.push(...fileErrors.sort(byPos));
  }
  return { errors, model };
}

// ---------- Pha C ----------
function typeMatches(lv, type) {
  switch (type) {
    case 'string': return lv.kind === 's' && typeof lv.value === 'string';
    case 'number': return lv.kind === 's' && typeof lv.value === 'number';
    case 'integer': return lv.kind === 's' && Number.isInteger(lv.value);
    case 'boolean': return lv.kind === 's' && typeof lv.value === 'boolean';
    case 'null': return lv.kind === 's' && lv.value === null;
    case 'array': return lv.kind === 'a';
    case 'object': return lv.kind === 'o';
    default: return true;
  }
}

function phaseC(model, schema) {
  const errors = [];
  const at = (code, msg, pos) => errors.push(err(code, msg, pos.file, pos.line, pos.column));
  const validate = (lv, spec) => {
    if (!spec || typeof spec !== 'object') return;
    if (spec.type !== undefined && spec.type !== 'any' && !typeMatches(lv, spec.type)) {
      at('SEM_TYPE_MISMATCH', `Sai kiểu, cần ${spec.type}`, lv.pos);
      return;
    }
    if (Array.isArray(spec.enum) && lv.kind === 's' && !spec.enum.some((v) => v === lv.value)) {
      at('SEM_NOT_IN_ENUM', 'Giá trị không thuộc enum', lv.pos);
      return;
    }
    if (lv.kind === 'o' && spec.fields) {
      const fields = spec.fields;
      for (const k of Object.keys(fields)) {
        if (fields[k] && fields[k].required === true && !lv.children.has(k)) {
          at('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc: ${k}`, lv.pos);
        }
      }
      for (const [k, c] of lv.children) {
        if (Object.hasOwn(fields, k)) validate(c.lv, fields[k]);
        else if (spec.closed === true) at('SEM_UNKNOWN_KEY', `Khóa lạ: ${k}`, c.keyPos);
      }
    }
    if (lv.kind === 'a' && spec.items) {
      for (const it of lv.items) validate(it, spec.items);
    }
  };
  validate(evalTarget(model, { kind: 'obj', obj: model.root }), schema);
  return errors;
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const b = phaseB(program, a.order);
  if (b.errors.length) return b.errors;
  if (schema) return phaseC(b.model, schema);
  return [];
}
