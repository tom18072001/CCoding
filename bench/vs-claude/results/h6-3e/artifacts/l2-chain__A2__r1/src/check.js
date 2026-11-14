// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
import { buildContext, resolveRef, isPureRef, evalString } from './merge.js';

const mkErr = (code, message, file, node) => ({ code, message, file, line: node.line, column: node.column });
const byPos = (a, b) => a.line - b.line || a.column - b.column;

// ---------- Pha A ----------
function phaseA(program) {
  const errors = [];
  const visited = new Set();
  const path = new Set();

  const collectIncludes = (stmts, out = []) => {
    for (const s of stmts) {
      if (s.type === 'Include') out.push(s);
      else if (s.type === 'Block') collectIncludes(s.body, out);
    }
    return out;
  };

  const checkBlock = (stmts, file, errs) => {
    const seen = new Set();
    for (const s of stmts) {
      if (s.type === 'Assign' || s.type === 'Block') {
        if (seen.has(s.key)) errs.push(mkErr('SEM_DUPLICATE_KEY', `Khóa trùng: ${s.key}`, file, s));
        seen.add(s.key);
        if (s.type === 'Block') checkBlock(s.body, file, errs);
      }
    }
  };

  const visit = (file) => {
    visited.add(file);
    path.add(file);
    const ast = program.files[file];
    const errs = [];
    checkBlock(ast.body, file, errs);
    const consts = new Set();
    for (const s of ast.body) {
      if (s.type === 'Const') {
        if (consts.has(s.name)) errs.push(mkErr('SEM_DUPLICATE_CONST', `Hằng trùng: ${s.name}`, file, s));
        consts.add(s.name);
      }
    }
    const incs = collectIncludes(ast.body);
    for (const inc of incs) {
      if (!Object.hasOwn(program.files, inc.path)) {
        errs.push(mkErr('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp: ${inc.path}`, file, inc));
      } else if (path.has(inc.path)) {
        errs.push(mkErr('SEM_INCLUDE_CYCLE', `Vòng include: ${inc.path}`, file, inc));
      }
    }
    errors.push(...errs.sort(byPos));
    for (const inc of incs) {
      if (Object.hasOwn(program.files, inc.path) && !path.has(inc.path) && !visited.has(inc.path)) {
        visit(inc.path);
      }
    }
    path.delete(file);
  };
  visit(program.entry);
  return { errors, order: [...visited] };
}

// ---------- Pha B ----------
function collectStringNodes(node, out) {
  if (node.type === 'String') out.push(node);
  else if (node.type === 'Array') for (const it of node.items) collectStringNodes(it, out);
}

function phaseB(program, order, ctx) {
  const errors = [];
  // Mọi chuỗi: { node, file, inConst }
  const strings = [];
  const walk = (stmts, file) => {
    for (const s of stmts) {
      const nodes = [];
      if (s.type === 'Assign') {
        collectStringNodes(s.value, nodes);
        for (const n of nodes) strings.push({ node: n, file, inConst: false });
      } else if (s.type === 'Const') {
        collectStringNodes(s.value, nodes);
        for (const n of nodes) strings.push({ node: n, file, inConst: true });
      } else if (s.type === 'Block') walk(s.body, file);
    }
  };
  const byFile = new Map();
  for (const f of order) {
    const start = strings.length;
    walk(program.files[f].body, f);
    byFile.set(f, strings.slice(start));
  }

  const fileOf = new Map();
  for (const e of strings) fileOf.set(e.node, e.file);

  const targetCache = new Map();
  const targetOf = (ref, file) => {
    if (!targetCache.has(ref)) targetCache.set(ref, resolveRef(ctx, ref, file));
    return targetCache.get(ref);
  };

  // S(đích)
  const stringsOfTarget = (t) => {
    const out = [];
    const fromMv = (mv) => {
      for (const e of mv.map.values()) {
        if (e.t === 'obj') fromMv(e);
        else collectStringNodes(e.node, out);
      }
    };
    if (t.mv) fromMv(t.mv);
    else collectStringNodes(t.node, out);
    return out;
  };

  const succCache = new Map();
  const succ = (s) => {
    if (!succCache.has(s)) {
      const file = fileOf.get(s);
      const out = [];
      for (const part of s.parts) {
        if (part.type !== 'Ref') continue;
        const t = targetOf(part, file);
        if (t) out.push(...stringsOfTarget(t));
      }
      succCache.set(s, out);
    }
    return succCache.get(s);
  };

  const reaches = (from, goal) => {
    const seen = new Set();
    const stack = [...from];
    while (stack.length) {
      const x = stack.pop();
      if (x === goal) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...succ(x));
    }
    return false;
  };

  // loại giá trị đã đánh giá của đích
  const kindOf = (t, visiting = new Set()) => {
    if (t.mv) return 'object';
    const n = t.node;
    if (n.type === 'Array') return 'array';
    if (n.type === 'String' && isPureRef(n)) {
      if (visiting.has(n)) return 'scalar';
      visiting.add(n);
      const t2 = targetOf(n.parts[0], t.file);
      const k = t2 ? kindOf(t2, visiting) : 'scalar';
      visiting.delete(n);
      return k;
    }
    return 'scalar';
  };

  for (const f of order) {
    const errs = [];
    for (const { node, file, inConst } of byFile.get(f)) {
      const pure = isPureRef(node);
      for (const ref of node.parts) {
        if (ref.type !== 'Ref') continue;
        if (!ref.const && inConst) {
          errs.push(mkErr('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình', file, ref));
          continue;
        }
        const t = targetOf(ref, file);
        if (!t) {
          errs.push(mkErr('SEM_UNDEFINED_REF', 'Tham chiếu không tồn tại', file, ref));
          continue;
        }
        if (reaches(stringsOfTarget(t), node)) {
          errs.push(mkErr('SEM_REF_CYCLE', 'Vòng tham chiếu', file, ref));
          continue;
        }
        if (!pure) {
          const k = kindOf(t);
          if (k === 'array' || k === 'object') {
            errs.push(mkErr('SEM_BAD_INTERPOLATION', 'Không thể nội suy mảng/đối tượng vào chuỗi', file, ref));
          }
        }
      }
    }
    errors.push(...errs.sort(byPos));
  }
  return errors;
}

// ---------- Pha C ----------
function provTarget(ctx, t, override) {
  if (t.mv) return provMv(ctx, t.mv, override);
  return provNode(ctx, t.node, t.file, override);
}

function provMv(ctx, mv, override) {
  const keys = [];
  for (const [key, e] of mv.map) {
    keys.push({
      key,
      kpos: override ?? e.kp,
      child: e.t === 'obj' ? provMv(ctx, e, override) : provNode(ctx, e.node, e.file, override),
    });
  }
  return { kind: 'object', pos: override ?? { file: mv.file, line: mv.line, column: mv.column }, keys };
}

function provNode(ctx, node, file, override) {
  const pos = override ?? { file, line: node.line, column: node.column };
  switch (node.type) {
    case 'Number':
      return { kind: 'number', value: node.value, pos };
    case 'Bool':
      return { kind: 'boolean', value: node.value, pos };
    case 'Null':
      return { kind: 'null', value: null, pos };
    case 'Array':
      return { kind: 'array', pos, items: node.items.map((it) => provNode(ctx, it, file, override)) };
    default: {
      if (isPureRef(node)) {
        const t = resolveRef(ctx, node.parts[0], file);
        if (t) return provTarget(ctx, t, pos);
      }
      return { kind: 'string', value: evalString(ctx, node, file), pos };
    }
  }
}

function typeMatches(type, p) {
  switch (type) {
    case 'integer':
      return p.kind === 'number' && Number.isInteger(p.value);
    case 'string':
    case 'number':
    case 'boolean':
    case 'null':
    case 'array':
    case 'object':
      return p.kind === type;
    default:
      return true;
  }
}

function validate(spec, p, errors) {
  const at = (code, message, pos) => errors.push({ code, message, file: pos.file, line: pos.line, column: pos.column });
  if (!spec || typeof spec !== 'object') return;
  if (spec.type && spec.type !== 'any' && !typeMatches(spec.type, p)) {
    at('SEM_TYPE_MISMATCH', `Sai kiểu, cần ${spec.type}`, p.pos);
    return;
  }
  const scalar = p.kind !== 'array' && p.kind !== 'object';
  if (Array.isArray(spec.enum) && scalar && !spec.enum.some((x) => x === p.value)) {
    at('SEM_NOT_IN_ENUM', 'Giá trị không thuộc enum', p.pos);
    return;
  }
  if (p.kind === 'object' && spec.fields && typeof spec.fields === 'object') {
    const have = new Set(p.keys.map((k) => k.key));
    for (const [fk, fs] of Object.entries(spec.fields)) {
      if (fs && fs.required === true && !have.has(fk)) at('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc: ${fk}`, p.pos);
    }
    for (const k of p.keys) {
      if (Object.hasOwn(spec.fields, k.key)) validate(spec.fields[k.key], k.child, errors);
      else if (spec.closed === true) at('SEM_UNKNOWN_KEY', `Khóa không được phép: ${k.key}`, k.kpos);
    }
  }
  if (p.kind === 'array' && spec.items) {
    for (const it of p.items) validate(spec.items, it, errors);
  }
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const ctx = buildContext(program);
  const b = phaseB(program, a.order, ctx);
  if (b.length) return b;
  if (!schema) return [];
  const errors = [];
  validate(schema, provMv(ctx, ctx.root, undefined), errors);
  return errors;
}
