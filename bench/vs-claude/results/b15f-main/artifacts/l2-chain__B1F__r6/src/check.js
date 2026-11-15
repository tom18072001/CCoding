// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5. Ba pha A/B/C, pha nào có lỗi thì dừng ở pha đó.
import { buildModel, listRefs, resolveRef, stringsOf, evalTree } from './resolve.js';

const err = (code, message, file, node) => ({ code, message, file, line: node.line, column: node.column });
const byPos = (a, b) => a.line - b.line || a.column - b.column;

// ---------- Pha A ----------
function phaseA(program) {
  const perFile = []; // theo thứ tự thăm lần đầu
  const seen = new Set();
  const onPath = new Set();

  const visit = (file) => {
    seen.add(file);
    onPath.add(file);
    const errs = [];
    perFile.push(errs);
    const ast = program.files[file];

    const dupKeys = (body) => {
      const keys = new Set();
      for (const s of body) {
        if (s.type !== 'Assign' && s.type !== 'Block') continue;
        if (keys.has(s.key)) errs.push(err('SEM_DUPLICATE_KEY', `khóa trùng: ${s.key}`, file, s));
        else keys.add(s.key);
      }
    };
    const consts = new Set();
    const walk = (body, top) => {
      dupKeys(body);
      for (const s of body) {
        if (s.type === 'Const' && top) {
          if (consts.has(s.name)) errs.push(err('SEM_DUPLICATE_CONST', `hằng trùng: ${s.name}`, file, s));
          else consts.add(s.name);
        } else if (s.type === 'Block') walk(s.body, false);
        else if (s.type === 'Include') {
          if (!Object.hasOwn(program.files, s.path)) {
            errs.push(err('SEM_INCLUDE_NOT_FOUND', `không tìm thấy tệp: ${s.path}`, file, s));
          } else if (onPath.has(s.path)) {
            errs.push(err('SEM_INCLUDE_CYCLE', `include vòng: ${s.path}`, file, s));
          } else if (!seen.has(s.path)) {
            visit(s.path);
          }
        }
      }
    };
    walk(ast.body, true);
    onPath.delete(file);
  };

  if (Object.hasOwn(program.files, program.entry)) visit(program.entry);
  return perFile.flatMap((errs) => errs.sort(byPos));
}

// ---------- Pha B ----------
function kindOf(model, target, file, guard = new Set()) {
  if (target.kind === 'obj') return 'object';
  const ast = target.ast;
  if (ast.type === 'Array') return 'array';
  if (ast.type !== 'String') return 'scalar';
  if (ast.parts.length === 1 && ast.parts[0].type === 'Ref') {
    if (guard.has(ast)) return null;
    guard.add(ast);
    const r = resolveRef(model, target.file, ast.parts[0]);
    return r.found ? kindOf(model, r.target, target.file, guard) : null;
  }
  return 'scalar';
}

function phaseB(program) {
  const model = buildModel(program);
  const order = new Map(Object.keys(program.files).map((f, i) => [f, i]));
  const refs = listRefs(program);

  // đồ thị cạnh: chuỗi -> các chuỗi trong S(đích của từng Ref phân giải được)
  const edges = new Map();
  const targets = new Map(); // ref -> target | null
  for (const r of refs) {
    const res = resolveRef(model, r.file, r.ref);
    targets.set(r.ref, res.found ? res.target : null);
    if (!res.found) continue;
    let list = edges.get(r.string);
    if (!list) edges.set(r.string, (list = []));
    for (const x of stringsOf(res.target)) list.push(x.node);
  }
  const reaches = (starts, goal) => {
    const vis = new Set();
    const stack = [...starts];
    while (stack.length) {
      const n = stack.pop();
      if (n === goal) return true;
      if (vis.has(n)) continue;
      vis.add(n);
      for (const m of edges.get(n) ?? []) stack.push(m);
    }
    return false;
  };

  const errs = [];
  for (const r of refs) {
    const target = targets.get(r.ref);
    let e = null;
    if (r.inConst && !r.ref.const) {
      e = 'SEM_CONST_CONFIG_REF';
    } else if (!target) {
      e = 'SEM_UNDEFINED_REF';
    } else if (reaches(stringsOf(target).map((x) => x.node), r.string)) {
      e = 'SEM_REF_CYCLE';
    } else if (!r.pure) {
      const k = kindOf(model, target, r.file);
      if (k === 'array' || k === 'object') e = 'SEM_BAD_INTERPOLATION';
    }
    if (e) errs.push({ ...err(e, `${e}: \${${r.ref.const ? '@' : ''}${r.ref.path.join('.')}}`, r.file, r.ref), _o: order.get(r.file) });
  }
  errs.sort((a, b) => a._o - b._o || byPos(a, b));
  return { errs: errs.map(({ _o, ...rest }) => rest), model };
}

// ---------- Pha C ----------
function phaseC(model, schema) {
  const errs = [];
  const at = (code, message, pos) => errs.push({ code, message, file: pos.file, line: pos.line, column: pos.column });
  const typeOk = (t, tree) => {
    switch (t) {
      case 'string': return tree.kind === 'scalar' && typeof tree.value === 'string';
      case 'number': return tree.kind === 'scalar' && typeof tree.value === 'number';
      case 'integer': return tree.kind === 'scalar' && Number.isInteger(tree.value);
      case 'boolean': return tree.kind === 'scalar' && typeof tree.value === 'boolean';
      case 'null': return tree.kind === 'scalar' && tree.value === null;
      case 'array': return tree.kind === 'array';
      case 'object': return tree.kind === 'object';
      default: return true;
    }
  };
  const go = (tree, spec, where) => {
    if (!spec || typeof spec !== 'object') return;
    if (spec.type !== undefined && spec.type !== 'any' && !typeOk(spec.type, tree)) {
      at('SEM_TYPE_MISMATCH', `${where}: sai kiểu, cần ${spec.type}`, tree.pos);
      return;
    }
    if (Array.isArray(spec.enum) && tree.kind === 'scalar' && !spec.enum.some((v) => v === tree.value)) {
      at('SEM_NOT_IN_ENUM', `${where}: giá trị không thuộc enum`, tree.pos);
      return;
    }
    if (tree.kind === 'object' && spec.fields) {
      const fields = spec.fields;
      const has = new Set(tree.entries.map((e) => e.key));
      for (const k of Object.keys(fields)) {
        if (fields[k] && fields[k].required === true && !has.has(k)) {
          at('SEM_MISSING_REQUIRED', `${where}: thiếu khóa bắt buộc ${k}`, tree.pos);
        }
      }
      for (const e of tree.entries) {
        if (Object.hasOwn(fields, e.key)) go(e.node, fields[e.key], `${where}.${e.key}`);
        else if (spec.closed === true) at('SEM_UNKNOWN_KEY', `${where}: khóa lạ ${e.key}`, e.pos);
      }
    }
    if (tree.kind === 'array' && spec.items) {
      tree.items.forEach((it, i) => go(it, spec.items, `${where}[${i}]`));
    }
  };
  go(evalTree(model), schema, '$');
  return errs;
}

export function check(program, schema) {
  try {
    const a = phaseA(program);
    if (a.length) return a;
    const { errs, model } = phaseB(program);
    if (errs.length) return errs;
    if (schema === undefined || schema === null) return [];
    return phaseC(model, schema);
  } catch (e) {
    return [{ code: 'SEM_INTERNAL', message: String(e && e.message), file: program?.entry, line: 1, column: 1 }];
  }
}
