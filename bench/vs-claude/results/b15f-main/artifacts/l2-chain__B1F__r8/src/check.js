// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
// Hiện có pha A (cấu trúc) và pha B (tham chiếu); pha C (lược đồ) do hạng mục sau bổ sung.

import { mergeProgram, resolveRef, stringsOf } from './merge.js';

const cmpPos = (a, b) => a.line - b.line || a.column - b.column;

function mkErr(code, message, file, pos) {
  return { code, message, file, line: pos.line, column: pos.column };
}

// Thứ tự thăm tệp (tiền thứ tự theo include) + lỗi pha A.
function phaseA(program) {
  const files = program.files;
  const has = (n) => Object.hasOwn(files, n);
  const order = [];
  const errors = [];
  const visited = new Set();
  const onPath = new Set();

  function visit(name) {
    visited.add(name);
    onPath.add(name);
    order.push(name);
    const errs = [];
    errors.push(errs);
    const seenConst = new Set();

    const walkBody = (body, top) => {
      const keys = new Set();
      for (const st of body) {
        if (st.type === 'Assign' || st.type === 'Block') {
          if (keys.has(st.key)) {
            errs.push(mkErr('SEM_DUPLICATE_KEY', `Khóa trùng: ${st.key}`, name, st));
          } else {
            keys.add(st.key);
          }
          if (st.type === 'Block') walkBody(st.body, false);
        } else if (st.type === 'Const') {
          if (seenConst.has(st.name)) {
            errs.push(mkErr('SEM_DUPLICATE_CONST', `Hằng trùng: ${st.name}`, name, st));
          } else {
            seenConst.add(st.name);
          }
        } else if (st.type === 'Include') {
          if (!has(st.path)) {
            errs.push(mkErr('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp: ${st.path}`, name, st));
          } else if (onPath.has(st.path)) {
            errs.push(mkErr('SEM_INCLUDE_CYCLE', `Include vòng: ${st.path}`, name, st));
          } else if (!visited.has(st.path)) {
            visit(st.path);
          }
        }
      }
    };
    walkBody(files[name].body, true);
    onPath.delete(name);
  }

  if (has(program.entry)) visit(program.entry);
  const out = [];
  for (const errs of errors) out.push(...errs.sort(cmpPos));
  return { order, errors: out };
}

// Kiểu đã đánh giá của đích: 'object' | 'array' | 'scalar' | null (không xác định do vòng).
function evalKind(merged, target, seen) {
  if (target.kind === 'object') return 'object';
  const node = target.node;
  if (node.type === 'Array') return 'array';
  if (node.type !== 'String') return 'scalar';
  const parts = node.parts;
  if (parts.length === 1 && parts[0].type === 'Ref') {
    if (seen.has(node)) return null;
    seen.add(node);
    const t = resolveRef(merged, parts[0], target.file);
    if (!t) return null;
    return evalKind(merged, t, seen);
  }
  return 'scalar';
}

function phaseB(program, order) {
  const merged = mergeProgram(program);
  const files = program.files;

  // Thu mọi String (kèm cờ inConst) theo tệp.
  const perFile = new Map();
  const fileOf = new Map();
  for (const name of order) {
    const list = [];
    const addNode = (node, inConst) => {
      if (node.type === 'String') {
        list.push({ node, inConst });
        fileOf.set(node, name);
      } else if (node.type === 'Array') {
        for (const it of node.items) addNode(it, inConst);
      }
    };
    const walk = (body) => {
      for (const st of body) {
        if (st.type === 'Assign') addNode(st.value, false);
        else if (st.type === 'Const') addNode(st.value, true);
        else if (st.type === 'Block') walk(st.body);
      }
    };
    walk(files[name].body);
    perFile.set(name, list);
  }

  // Cạnh s → S(đích của từng Ref phân giải được trong s).
  const edgeCache = new Map();
  const edgesOf = (node, file) => {
    let e = edgeCache.get(node);
    if (!e) {
      e = [];
      for (const p of node.parts) {
        if (p.type !== 'Ref') continue;
        const t = resolveRef(merged, p, file);
        if (t) e.push(...stringsOf(t));
      }
      edgeCache.set(node, e);
    }
    return e;
  };

  const reaches = (starts, goal) => {
    const seen = new Set();
    const stack = [...starts];
    while (stack.length) {
      const { node, file } = stack.pop();
      if (node === goal) return true;
      if (seen.has(node)) continue;
      seen.add(node);
      stack.push(...edgesOf(node, file));
    }
    return false;
  };

  const out = [];
  for (const name of order) {
    const errs = [];
    for (const { node, inConst } of perFile.get(name)) {
      const pure = node.parts.length === 1 && node.parts[0].type === 'Ref';
      for (const r of node.parts) {
        if (r.type !== 'Ref') continue;
        if (inConst && !r.const) {
          errs.push(mkErr('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình', name, r));
          continue;
        }
        const target = resolveRef(merged, r, name);
        if (!target) {
          errs.push(mkErr('SEM_UNDEFINED_REF', 'Tham chiếu không tồn tại', name, r));
          continue;
        }
        if (reaches(stringsOf(target), node)) {
          errs.push(mkErr('SEM_REF_CYCLE', 'Tham chiếu vòng', name, r));
          continue;
        }
        if (!pure) {
          const k = evalKind(merged, target, new Set());
          if (k === 'object' || k === 'array') {
            errs.push(mkErr('SEM_BAD_INTERPOLATION', 'Nội suy mảng/đối tượng vào chuỗi', name, r));
          }
        }
      }
    }
    out.push(...errs.sort(cmpPos));
  }
  return out;
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const b = phaseB(program, a.order);
  if (b.length) return b;
  if (schema === undefined || schema === null) return [];
  return phaseC(program, schema);
}

function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

// Dựng cây { v, pos, keys?: [{key, pos, tree}], items?: [tree] } từ đích đã hợp nhất.
function buildTree(merged, t, ovr) {
  if (t.kind === 'object') {
    const v = {};
    const keys = [];
    for (const [k, e] of t.entries) {
      const tree = buildTree(merged, e.value, ovr);
      setOwn(v, k, tree.v);
      keys.push({ key: k, pos: { file: e.file, line: e.stmt.line, column: e.stmt.column }, tree });
    }
    return { v, pos: ovr || { file: t.file, line: t.line, column: t.column }, keys };
  }
  const node = t.node;
  const here = ovr || { file: t.file, line: node.line, column: node.column };
  switch (node.type) {
    case 'Number': case 'Bool': return { v: node.value, pos: here };
    case 'Null': return { v: null, pos: here };
    case 'Array': {
      const items = node.items.map((n) => buildTree(merged, { kind: 'value', node: n, file: t.file }, ovr));
      return { v: items.map((i) => i.v), pos: here, items };
    }
    case 'String': {
      const parts = node.parts;
      if (parts.length === 0) return { v: '', pos: here };
      if (parts.length === 1 && parts[0].type === 'Ref') {
        const target = resolveRef(merged, parts[0], t.file);
        return buildTree(merged, target, here);
      }
      let out = '';
      for (const p of parts) {
        if (p.type === 'Text') { out += p.value; continue; }
        const v = buildTree(merged, resolveRef(merged, p, t.file), null).v;
        out += typeof v === 'string' ? v : JSON.stringify(v);
      }
      return { v: out, pos: here };
    }
    default: throw new Error(`nút giá trị không hợp lệ: ${node.type}`);
  }
}

const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function typeOk(type, v) {
  const k = kindOf(v);
  if (type === 'integer') return k === 'number' && Number.isInteger(v);
  return k === type;
}

function phaseC(program, schema) {
  const merged = mergeProgram(program);
  const tree = buildTree(merged, merged.root, null);
  const errors = [];
  const err = (code, message, pos) => errors.push(mkErr(code, message, pos.file, pos));

  function go(tr, spec, path) {
    if (!spec || typeof spec !== 'object') return;
    const v = tr.v;
    if (spec.type !== undefined && spec.type !== 'any' && !typeOk(spec.type, v)) {
      err('SEM_TYPE_MISMATCH', `${path || '(root)'}: cần kiểu ${spec.type}`, tr.pos);
      return;
    }
    if (Array.isArray(spec.enum)) {
      const k = kindOf(v);
      if (k !== 'object' && k !== 'array' && !spec.enum.some((e) => e === v)) {
        err('SEM_NOT_IN_ENUM', `${path || '(root)'}: giá trị không thuộc enum`, tr.pos);
        return;
      }
    }
    if (tr.keys && spec.fields) {
      const present = new Set(tr.keys.map((k) => k.key));
      for (const fk of Object.keys(spec.fields)) {
        const fs = spec.fields[fk];
        if (fs && fs.required === true && !present.has(fk)) {
          err('SEM_MISSING_REQUIRED', `${path || '(root)'}: thiếu khóa bắt buộc ${fk}`, tr.pos);
        }
      }
      for (const k of tr.keys) {
        if (Object.hasOwn(spec.fields, k.key)) go(k.tree, spec.fields[k.key], `${path}/${k.key}`);
        else if (spec.closed === true) err('SEM_UNKNOWN_KEY', `${path}/${k.key}: khóa không được phép`, k.pos);
      }
    }
    if (tr.items && spec.items) {
      tr.items.forEach((it, i) => go(it, spec.items, `${path}/${i}`));
    }
  }
  go(tree, schema, '');
  return errors;
}
