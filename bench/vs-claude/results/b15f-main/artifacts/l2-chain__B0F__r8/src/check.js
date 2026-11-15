// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
// Pha B và C dùng lõi hợp nhất của tầng 3 (mergeProgram, resolveRef, createEvaluator), không tự hợp nhất lại.

import { mergeProgram, resolveRef, createEvaluator } from './evaluate.js';

const err = (code, message, file, node) => ({
  code,
  message,
  file,
  line: node.line,
  column: node.column,
});

const byPos = (a, b) => a.line - b.line || a.column - b.column;

/** Chuỗi thuần tham chiếu: đúng một Ref, không Text. */
const isPureRef = (s) => s.parts.length === 1 && s.parts[0].type === 'Ref';

/**
 * Pha A. Trả { errors, order } với order là thứ tự thăm tệp (tiền thứ tự).
 */
function phaseA(program) {
  const files = program.files;
  const has = (n) => Object.hasOwn(files, n);
  const order = [];
  const perFile = new Map();
  const visited = new Set();
  const path = new Set();

  const visit = (name) => {
    visited.add(name);
    path.add(name);
    order.push(name);
    const mine = [];
    perFile.set(name, mine);

    const walkBlock = (stmts, top) => {
      const seenKeys = new Set();
      const seenConsts = new Set();
      for (const st of stmts) {
        if (st.type === 'Assign' || st.type === 'Block') {
          if (seenKeys.has(st.key)) {
            mine.push(err('SEM_DUPLICATE_KEY', `khóa trùng: ${st.key}`, name, st));
          } else seenKeys.add(st.key);
          if (st.type === 'Block') walkBlock(st.body, false);
        } else if (st.type === 'Const') {
          if (top) {
            if (seenConsts.has(st.name)) {
              mine.push(err('SEM_DUPLICATE_CONST', `const trùng: ${st.name}`, name, st));
            } else seenConsts.add(st.name);
          }
        } else if (st.type === 'Include') {
          if (!has(st.path)) {
            mine.push(err('SEM_INCLUDE_NOT_FOUND', `không tìm thấy tệp include: ${st.path}`, name, st));
          } else if (path.has(st.path)) {
            mine.push(err('SEM_INCLUDE_CYCLE', `include vòng: ${st.path}`, name, st));
          } else if (!visited.has(st.path)) {
            visit(st.path);
          }
        }
      }
    };
    walkBlock(files[name].body, true);

    path.delete(name);
    mine.sort(byPos);
  };

  if (has(program.entry)) visit(program.entry);
  return { errors: order.flatMap((n) => perFile.get(n)), order };
}

/** Gọi cb cho mọi nút String trong một nút giá trị (kể cả trong mảng lồng nhau). */
function eachString(node, cb) {
  if (node.type === 'String') cb(node);
  else if (node.type === 'Array') for (const it of node.items) eachString(it, cb);
}

/** Tập nút String trong một đích đã phân giải (chỉ định nghĩa thắng). */
function stringsOf(target, out) {
  if (target.kind === 'leaf') eachString(target.node, (s) => out.push(s));
  else for (const e of target.entries.values()) stringsOf(e.value, out);
  return out;
}

/** Pha B. */
function phaseB(program, order, merged) {
  const fileOf = new Map(); // String node -> tên tệp
  const perFile = new Map(); // tệp -> [{ ref, str, inConst }]
  for (const name of order) {
    const list = [];
    perFile.set(name, list);
    const onValue = (v, inConst) =>
      eachString(v, (s) => {
        fileOf.set(s, name);
        for (const p of s.parts) if (p.type === 'Ref') list.push({ ref: p, str: s, inConst });
      });
    const walk = (stmts) => {
      for (const st of stmts) {
        if (st.type === 'Assign') onValue(st.value, false);
        else if (st.type === 'Const') onValue(st.value, true);
        else if (st.type === 'Block') walk(st.body);
      }
    };
    walk(program.files[name].body);
  }

  // Cạnh: s -> S(đích của từng Ref phân giải được trong s)
  const edgeMemo = new Map();
  const edges = (s) => {
    let e = edgeMemo.get(s);
    if (!e) {
      e = [];
      for (const p of s.parts) {
        if (p.type !== 'Ref') continue;
        const t = resolveRef(merged, p, fileOf.get(s));
        if (t) stringsOf(t, e);
      }
      edgeMemo.set(s, e);
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

  // Loại của giá trị đã đánh giá của đích, không ném (chuỗi thuần tham chiếu đi theo đích).
  const kindOf = (t, seen) => {
    if (t.kind === 'object') return 'object';
    const n = t.node;
    if (n.type === 'Array') return 'array';
    if (n.type === 'String' && isPureRef(n)) {
      if (seen.has(n)) return 'unknown';
      seen.add(n);
      const t2 = resolveRef(merged, n.parts[0], t.file);
      return t2 ? kindOf(t2, seen) : 'unknown';
    }
    return 'scalar';
  };

  const errors = [];
  for (const name of order) {
    const mine = [];
    for (const { ref, str, inConst } of perFile.get(name)) {
      if (inConst && !ref.const) {
        mine.push(err('SEM_CONST_CONFIG_REF', 'hằng không được tham chiếu cấu hình', name, ref));
        continue;
      }
      const t = resolveRef(merged, ref, name);
      if (!t) {
        mine.push(err('SEM_UNDEFINED_REF', `tham chiếu không tồn tại: ${ref.path.join('.')}`, name, ref));
        continue;
      }
      if (reaches(stringsOf(t, []), str)) {
        mine.push(err('SEM_REF_CYCLE', `vòng tham chiếu: ${ref.path.join('.')}`, name, ref));
        continue;
      }
      if (!isPureRef(str)) {
        const k = kindOf(t, new Set());
        if (k === 'array' || k === 'object') {
          mine.push(err('SEM_BAD_INTERPOLATION', 'không nội suy mảng/đối tượng vào chuỗi', name, ref));
        }
      }
    }
    mine.sort(byPos);
    errors.push(...mine);
  }
  return errors;
}

const typeOfValue = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function typeMatches(type, v) {
  if (type === 'any') return true;
  if (type === 'integer') return typeof v === 'number' && Number.isInteger(v);
  return typeOfValue(v) === type;
}

/**
 * Pha C: duyệt song song giá trị đã đánh giá, nút hợp nhất (để lấy vị trí) và đặc tả.
 * `fixed` là vị trí cố định khi đang ở trong chuỗi thuần tham chiếu (khi đó không còn nút hợp nhất).
 */
function phaseC(merged, schema, entry) {
  const errors = [];
  const at = (file, node) => ({ file, line: node.line, column: node.column });
  const push = (code, message, p) => errors.push({ code, message, file: p.file, line: p.line, column: p.column });

  const walk = (val, spec, target, fixedIn) => {
    let fixed = fixedIn;
    let t = target;
    let pos;
    if (fixed) {
      pos = fixed;
      t = null;
    } else if (t.kind === 'object') {
      pos = t.block ? at(t.file, t.block) : { file: entry, line: 1, column: 1 };
    } else {
      pos = at(t.file, t.node);
      if (t.node.type === 'String' && isPureRef(t.node)) {
        fixed = pos; // chuỗi thuần tham chiếu: mọi thứ bên trong dùng vị trí chuỗi
        t = null;
      }
    }

    if (spec.type && spec.type !== 'any' && !typeMatches(spec.type, val)) {
      push('SEM_TYPE_MISMATCH', `kiểu không khớp, cần ${spec.type}`, pos);
      return;
    }
    const isArr = Array.isArray(val);
    const isObj = val !== null && typeof val === 'object' && !isArr;
    if (spec.enum && !isObj && !isArr && !spec.enum.some((x) => x === val)) {
      push('SEM_NOT_IN_ENUM', 'giá trị không thuộc enum', pos);
      return;
    }
    if (isObj && spec.fields) {
      const fields = spec.fields;
      for (const k of Object.keys(fields)) {
        if (fields[k] && fields[k].required === true && !Object.hasOwn(val, k)) {
          push('SEM_MISSING_REQUIRED', `thiếu khóa bắt buộc: ${k}`, pos);
        }
      }
      for (const k of Object.keys(val)) {
        const child = t ? t.entries.get(k) : null;
        if (Object.hasOwn(fields, k)) {
          walk(val[k], fields[k], child ? child.value : null, fixed);
        } else if (spec.closed === true) {
          push('SEM_UNKNOWN_KEY', `khóa không được phép: ${k}`, fixed || at(child.file, child.stmt));
        }
      }
    }
    if (isArr && spec.items) {
      for (let i = 0; i < val.length; i++) {
        const sub = t ? { kind: 'leaf', node: t.node.items[i], file: t.file } : null;
        walk(val[i], spec.items, sub, fixed);
      }
    }
  };

  const ev = createEvaluator(merged);
  walk(ev.evalTarget(merged.root), schema, merged.root, null);
  return errors;
}

/**
 * Kiểm tra ngữ nghĩa ba pha; pha nào có lỗi thì trả lỗi của pha đó và dừng.
 * @param {{ entry: string, files: Object<string, object> }} program
 * @param {object} [schema]
 * @returns {Array<{code: string, message: string, file: string, line: number, column: number}>}
 */
export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const merged = mergeProgram(program);
  const b = phaseB(program, a.order, merged);
  if (b.length) return b;
  if (schema === undefined || schema === null) return [];
  return phaseC(merged, schema, program.entry);
}
