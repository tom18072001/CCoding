// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
// Ba pha nối tiếp (A cấu trúc, B tham chiếu, C lược đồ); pha nào có lỗi thì trả lỗi pha đó và dừng.

import { buildModel, constsOf, resolveRef, evaluateTarget } from './merge.js';

const err = (code, message, file, line, column) => ({ code, message, file, line, column });
const byPos = (x, y) => x.line - y.line || x.column - y.column;

// ---------- Pha A ----------
function phaseA(program) {
  const files = program.files;
  const errsByFile = new Map(); // theo thứ tự thăm lần đầu
  const visited = new Set();
  const path = new Set();

  function visit(file) {
    visited.add(file);
    path.add(file);
    const errs = [];
    errsByFile.set(file, errs);
    const seenConst = new Set();

    function walkBody(body, top) {
      const seenKeys = new Set();
      for (const st of body) {
        switch (st.type) {
          case 'Assign':
          case 'Block':
            if (seenKeys.has(st.key)) {
              errs.push(err('SEM_DUPLICATE_KEY', `khóa trùng: ${st.key}`, file, st.line, st.column));
            }
            seenKeys.add(st.key);
            if (st.type === 'Block') walkBody(st.body, false);
            break;
          case 'Const':
            if (top) {
              if (seenConst.has(st.name)) {
                errs.push(err('SEM_DUPLICATE_CONST', `hằng trùng: ${st.name}`, file, st.line, st.column));
              }
              seenConst.add(st.name);
            }
            break;
          case 'Include':
            if (!Object.hasOwn(files, st.path)) {
              errs.push(err('SEM_INCLUDE_NOT_FOUND', `không tìm thấy tệp: ${st.path}`, file, st.line, st.column));
            } else if (path.has(st.path)) {
              errs.push(err('SEM_INCLUDE_CYCLE', `include vòng: ${st.path}`, file, st.line, st.column));
            } else if (!visited.has(st.path)) {
              visit(st.path);
            }
            break;
        }
      }
    }

    walkBody(files[file].body, true);
    path.delete(file);
  }

  if (Object.hasOwn(files, program.entry)) visit(program.entry);
  const out = [];
  for (const errs of errsByFile.values()) out.push(...errs.sort(byPos));
  return { errors: out, order: [...errsByFile.keys()] };
}

// ---------- Pha B ----------
function phaseB(program, order) {
  const model = buildModel(program);
  const stringFile = new Map(); // nút String -> tệp chứa
  const items = []; // { file, str, ref, inConst }

  function walkValue(v, file, inConst) {
    if (v.type === 'String') {
      stringFile.set(v, file);
      for (const p of v.parts) if (p.type === 'Ref') items.push({ file, str: v, ref: p, inConst });
    } else if (v.type === 'Array') {
      for (const it of v.items) walkValue(it, file, inConst);
    }
  }
  function walkBody(body, file) {
    for (const st of body) {
      if (st.type === 'Assign') walkValue(st.value, file, false);
      else if (st.type === 'Const') walkValue(st.value, file, true);
      else if (st.type === 'Block') walkBody(st.body, file);
    }
  }
  for (const f of order) walkBody(program.files[f].body, f);

  // S(đích): mọi nút String trong đích (chỉ định nghĩa thắng).
  function collect(target, out) {
    if (target.kind === 'obj') {
      for (const e of target.obj.entries.values()) collect(e.target, out);
      return out;
    }
    const n = target.node;
    if (n.type === 'String') out.add(n);
    else if (n.type === 'Array') {
      for (const it of n.items) collect({ kind: 'node', node: it, file: target.file }, out);
    }
    return out;
  }

  const edgeCache = new Map();
  function edges(s) {
    let e = edgeCache.get(s);
    if (e) return e;
    e = new Set();
    for (const p of s.parts) {
      if (p.type !== 'Ref') continue;
      const t = resolveRef(model, p, stringFile.get(s));
      if (t) collect(t, e);
    }
    edgeCache.set(s, e);
    return e;
  }
  function reaches(start, goal) {
    const seen = new Set();
    const stack = [...start];
    while (stack.length) {
      const n = stack.pop();
      if (n === goal) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const m of edges(n)) stack.push(m);
    }
    return false;
  }

  // Loại giá trị đã đánh giá của đích (không đánh giá thật): 'object' | 'array' | 'scalar'.
  function kindOf(target, guard = new Set()) {
    if (target.kind === 'obj') return 'object';
    const n = target.node;
    if (n.type === 'Array') return 'array';
    if (n.type === 'String' && n.parts.length === 1 && n.parts[0].type === 'Ref') {
      if (guard.has(n)) return 'scalar';
      guard.add(n);
      const t = resolveRef(model, n.parts[0], target.file);
      return t ? kindOf(t, guard) : 'scalar';
    }
    return 'scalar';
  }

  const byFile = new Map(order.map((f) => [f, []]));
  for (const { file, str, ref, inConst } of items) {
    let code = null;
    let target;
    if (!ref.const && inConst) code = 'SEM_CONST_CONFIG_REF';
    else {
      target = resolveRef(model, ref, file);
      if (!target) code = 'SEM_UNDEFINED_REF';
      else if (reaches(collect(target, new Set()), str)) code = 'SEM_REF_CYCLE';
      else {
        const pure = str.parts.length === 1;
        if (!pure && kindOf(target) !== 'scalar') code = 'SEM_BAD_INTERPOLATION';
      }
    }
    if (code) {
      byFile.get(file).push(err(code, `${code}: ${ref.const ? '@' : ''}${ref.path.join('.')}`, file, ref.line, ref.column));
    }
  }
  const out = [];
  for (const errs of byFile.values()) out.push(...errs.sort(byPos));
  return { errors: out, model };
}

// ---------- Pha C ----------
function typeOk(type, v) {
  switch (type) {
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number';
    case 'integer': return Number.isInteger(v);
    case 'boolean': return typeof v === 'boolean';
    case 'null': return v === null;
    case 'array': return Array.isArray(v);
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
    default: return true;
  }
}

function phaseC(program, model, schema) {
  const errors = [];
  const add = (code, msg, pos) => errors.push(err(code, msg, pos.file, pos.line, pos.column));
  const isPureRef = (n) => n.type === 'String' && n.parts.length === 1 && n.parts[0].type === 'Ref';

  // Đi qua chuỗi thuần tham chiếu tới đích thật; vị trí ghi đè là của chuỗi ngoài cùng.
  function deref(target, override) {
    let pos = override;
    let guard = 0;
    while (target.kind === 'node' && isPureRef(target.node) && guard++ < 10000) {
      const n = target.node;
      if (!pos) pos = { file: target.file, line: n.line, column: n.column };
      const t = resolveRef(model, n.parts[0], target.file);
      if (!t) break;
      target = t;
    }
    return { target, override: pos };
  }

  function visit(target, spec, override) {
    if (!spec || typeof spec !== 'object') return;
    const d = deref(target, override);
    target = d.target;
    override = d.override;
    let pos;
    if (override) pos = override;
    else if (target.kind === 'obj') pos = target.obj.pos;
    else pos = { file: target.file, line: target.node.line, column: target.node.column };

    const isObj = target.kind === 'obj';
    const isArr = !isObj && target.node.type === 'Array';
    const value = isObj || isArr ? undefined : evaluateTarget(model, target);
    const kindVal = isObj ? {} : isArr ? [] : value;

    if (spec.type !== undefined && spec.type !== 'any' && !typeOk(spec.type, kindVal)) {
      add('SEM_TYPE_MISMATCH', `sai kiểu, cần ${spec.type}`, pos);
      return;
    }
    if (Array.isArray(spec.enum) && !isObj && !isArr && !spec.enum.some((e) => e === value)) {
      add('SEM_NOT_IN_ENUM', 'giá trị không thuộc enum', pos);
      return;
    }
    if (isObj && spec.fields && typeof spec.fields === 'object') {
      const fields = spec.fields;
      for (const k of Object.keys(fields)) {
        if (fields[k] && fields[k].required === true && !target.obj.entries.has(k)) {
          add('SEM_MISSING_REQUIRED', `thiếu khóa bắt buộc: ${k}`, pos);
        }
      }
      for (const [k, e] of target.obj.entries) {
        if (Object.hasOwn(fields, k)) visit(e.target, fields[k], override);
        else if (spec.closed === true) add('SEM_UNKNOWN_KEY', `khóa không được phép: ${k}`, e.keyPos);
      }
    }
    if (isArr && spec.items) {
      for (const it of target.node.items) {
        visit({ kind: 'node', node: it, file: target.file }, spec.items, override);
      }
    }
  }

  visit({ kind: 'obj', obj: model.root }, schema, null);
  return errors;
}

export function check(program, schema) {
  if (!program || !program.files || !Object.hasOwn(program.files, program.entry)) return [];
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const b = phaseB(program, a.order);
  if (b.errors.length) return b.errors;
  if (schema === undefined || schema === null) return [];
  return phaseC(program, b.model, schema);
}
