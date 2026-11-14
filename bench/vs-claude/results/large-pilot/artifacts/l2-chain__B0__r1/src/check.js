// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.

import { buildProject, evalLoc, isPureRef, resolveRef } from './merge.js';

const byPos = (a, b) => a.line - b.line || a.column - b.column;
const mkErr = (code, message, file, at) => ({ code, message, file, line: at.line, column: at.column });

// Pha A — cấu trúc theo từng tệp.
function phaseA(program) {
  const files = program.files;
  const order = [];
  const groups = [];
  const visited = new Set();

  function dupKeys(stmts, file, errs) {
    const seen = new Set();
    for (const st of stmts) {
      if (st.type !== 'Assign' && st.type !== 'Block') continue;
      if (seen.has(st.key)) errs.push(mkErr('SEM_DUPLICATE_KEY', `Khóa trùng: ${st.key}`, file, st));
      seen.add(st.key);
      if (st.type === 'Block') dupKeys(st.body, file, errs);
    }
  }

  function includes(stmts, out) {
    for (const st of stmts) {
      if (st.type === 'Include') out.push(st);
      else if (st.type === 'Block') includes(st.body, out);
    }
    return out;
  }

  function visit(name, stack) {
    visited.add(name);
    order.push(name);
    const ast = files[name];
    const errs = [];
    dupKeys(ast.body, name, errs);
    const consts = new Set();
    for (const st of ast.body) {
      if (st.type !== 'Const') continue;
      if (consts.has(st.name)) errs.push(mkErr('SEM_DUPLICATE_CONST', `Hằng trùng: ${st.name}`, name, st));
      consts.add(st.name);
    }
    const incs = includes(ast.body, []);
    for (const inc of incs) {
      if (!Object.hasOwn(files, inc.path)) {
        errs.push(mkErr('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp: ${inc.path}`, name, inc));
      } else if (stack.includes(inc.path)) {
        errs.push(mkErr('SEM_INCLUDE_CYCLE', `Vòng include: ${inc.path}`, name, inc));
      }
    }
    errs.sort(byPos);
    groups.push(errs);
    for (const inc of incs) {
      if (Object.hasOwn(files, inc.path) && !stack.includes(inc.path) && !visited.has(inc.path)) {
        visit(inc.path, [...stack, inc.path]);
      }
    }
  }

  if (Object.hasOwn(files, program.entry)) visit(program.entry, [program.entry]);
  return { order, errors: groups.flat() };
}

// Thu mọi chuỗi (theo thứ tự tài liệu) của một tệp.
function collectStrings(ast, file, out) {
  const value = (v, inConst) => {
    if (v.type === 'String') out.push({ node: v, file, inConst });
    else if (v.type === 'Array') for (const it of v.items) value(it, inConst);
  };
  const walk = (stmts) => {
    for (const st of stmts) {
      if (st.type === 'Assign') value(st.value, false);
      else if (st.type === 'Const') value(st.value, true);
      else if (st.type === 'Block') walk(st.body);
    }
  };
  walk(ast.body);
  return out;
}

function stringsOf(n, out = []) {
  if (n.t === 'obj') {
    for (const c of n.map.values()) stringsOf(c, out);
    return out;
  }
  const collect = (v) => {
    if (v.type === 'String') out.push(v);
    else if (v.type === 'Array') v.items.forEach(collect);
  };
  collect(n.node);
  return out;
}

// 'compound' nếu giá trị đánh giá của nút là mảng/đối tượng, ngược lại 'scalar' (lặp, chịu được chuỗi tham chiếu dài).
function kindOf(ctx, n) {
  const seen = new Set();
  while (n.t !== 'obj' && n.node.type !== 'Array') {
    if (!isPureRef(n.node) || seen.has(n.node)) return 'scalar';
    seen.add(n.node);
    const target = resolveRef(ctx, n.node.parts[0], n.file);
    if (!target) return 'scalar';
    n = target;
  }
  return 'compound';
}

// Pha B — tham chiếu.
function phaseB(ctx, order) {
  const all = [];
  const fileOf = new Map();
  for (const file of order) {
    const strs = collectStrings(ctx.program.files[file], file, []);
    for (const s of strs) fileOf.set(s.node, file);
    all.push(strs);
  }

  const edgeCache = new Map();
  const edges = (s) => {
    let e = edgeCache.get(s);
    if (e) return e;
    e = [];
    const file = fileOf.get(s);
    for (const part of s.parts) {
      if (part.type !== 'Ref') continue;
      const target = resolveRef(ctx, part, file);
      if (target) for (const t of stringsOf(target)) e.push(t);
    }
    edgeCache.set(s, e);
    return e;
  };
  // `r` (thuộc chuỗi s) là vòng ⇔ có t ∈ S(đích r) mà t tới được s; vì s → t qua r nên điều đó
  // tương đương t cùng thành phần liên thông mạnh với s. Tarjan lặp: tuyến tính, không đệ quy.
  const comp = new Map();
  {
    const index = new Map();
    const low = new Map();
    const onSt = new Set();
    const st = [];
    let counter = 0;
    let compId = 0;
    for (const root of fileOf.keys()) {
      if (index.has(root)) continue;
      const work = [{ v: root, i: 0 }];
      index.set(root, counter);
      low.set(root, counter++);
      st.push(root);
      onSt.add(root);
      while (work.length) {
        const fr = work[work.length - 1];
        const es = edges(fr.v);
        if (fr.i < es.length) {
          const w = es[fr.i++];
          if (!index.has(w)) {
            index.set(w, counter);
            low.set(w, counter++);
            st.push(w);
            onSt.add(w);
            work.push({ v: w, i: 0 });
          } else if (onSt.has(w)) {
            low.set(fr.v, Math.min(low.get(fr.v), index.get(w)));
          }
        } else {
          work.pop();
          if (work.length) {
            const par = work[work.length - 1].v;
            low.set(par, Math.min(low.get(par), low.get(fr.v)));
          }
          if (low.get(fr.v) === index.get(fr.v)) {
            let w;
            do {
              w = st.pop();
              onSt.delete(w);
              comp.set(w, compId);
            } while (w !== fr.v);
            compId++;
          }
        }
      }
    }
  }
  const reaches = (starts, goal) => {
    const c = comp.get(goal);
    for (const t of starts) if (comp.get(t) === c) return true;
    return false;
  };

  const errors = [];
  for (const strs of all) {
    const errs = [];
    for (const { node, file, inConst } of strs) {
      const mixed = node.parts.length > 1 || node.parts.some((p) => p.type === 'Text');
      for (const ref of node.parts) {
        if (ref.type !== 'Ref') continue;
        if (!ref.const && inConst) {
          errs.push(mkErr('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình', file, ref));
          continue;
        }
        const target = resolveRef(ctx, ref, file);
        if (!target) {
          errs.push(mkErr('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${ref.path.join('.')}`, file, ref));
          continue;
        }
        if (reaches(stringsOf(target), node)) {
          errs.push(mkErr('SEM_REF_CYCLE', 'Vòng tham chiếu', file, ref));
          continue;
        }
        if (mixed && kindOf(ctx, target) === 'compound') {
          errs.push(mkErr('SEM_BAD_INTERPOLATION', 'Nội suy mảng/đối tượng vào chuỗi', file, ref));
        }
      }
    }
    errs.sort(byPos);
    errors.push(...errs);
  }
  return errors;
}

// Pha C — lược đồ.
function phaseC(ctx, schema) {
  const errors = [];
  const err = (code, message, pos) => errors.push(mkErr(code, message, pos.file, pos));
  const typeOk = (loc, type) => {
    switch (type) {
      case 'string': return loc.kind === 'scalar' && typeof loc.value === 'string';
      case 'number': return loc.kind === 'scalar' && typeof loc.value === 'number';
      case 'integer': return loc.kind === 'scalar' && Number.isInteger(loc.value);
      case 'boolean': return loc.kind === 'scalar' && typeof loc.value === 'boolean';
      case 'null': return loc.kind === 'scalar' && loc.value === null;
      case 'array': return loc.kind === 'arr';
      case 'object': return loc.kind === 'obj';
      default: return true;
    }
  };

  function walk(loc, spec) {
    if (!spec) return;
    if (spec.type && spec.type !== 'any' && !typeOk(loc, spec.type)) {
      err('SEM_TYPE_MISMATCH', `Sai kiểu, cần ${spec.type}`, loc.pos);
      return;
    }
    if (spec.enum && loc.kind === 'scalar' && !spec.enum.some((v) => v === loc.value)) {
      err('SEM_NOT_IN_ENUM', 'Giá trị không thuộc enum', loc.pos);
      return;
    }
    if (loc.kind === 'obj' && spec.fields) {
      const fields = spec.fields;
      const has = new Set(loc.entries.map((e) => e.key));
      for (const k of Object.keys(fields)) {
        if (fields[k] && fields[k].required === true && !has.has(k)) {
          err('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc: ${k}`, loc.pos);
        }
      }
      for (const e of loc.entries) {
        if (Object.hasOwn(fields, e.key)) walk(e.loc, fields[e.key]);
        else if (spec.closed === true) err('SEM_UNKNOWN_KEY', `Khóa lạ: ${e.key}`, e.keyPos);
      }
    }
    if (loc.kind === 'arr' && spec.items) for (const it of loc.items) walk(it, spec.items);
  }

  walk(evalLoc(ctx, ctx.root), schema);
  return errors;
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const ctx = buildProject(program);
  const b = phaseB(ctx, a.order);
  if (b.length) return b;
  if (schema) return phaseC(ctx, schema);
  return [];
}
