// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5. Ba pha A/B/C, pha nào có lỗi thì dừng ở pha đó.
import { mergeProgram, resolveRef, stringsOf, evaluateValue } from './merge.js';

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const byPos = (a, b) => a.line - b.line || a.column - b.column;

function err(code, message, file, line, column) {
  return { code, message, file, line, column };
}

export function check(program, schema) {
  if (!program || !program.files || !hasOwn(program.files, program.entry)) return [];

  // ---- Pha A ----
  const order = []; // tệp theo thứ tự thăm tiền thứ tự
  const perFile = new Map();
  const visited = new Set();
  const stack = [];

  const visit = (file) => {
    visited.add(file);
    order.push(file);
    const errs = [];
    perFile.set(file, errs);
    stack.push(file);

    const scanBody = (body, top) => {
      const seen = new Set();
      const seenConst = new Set();
      for (const s of body) {
        if (s.type === 'Assign' || s.type === 'Block') {
          if (seen.has(s.key)) {
            errs.push(err('SEM_DUPLICATE_KEY', `Khóa trùng: ${s.key}`, file, s.line, s.column));
          }
          seen.add(s.key);
          if (s.type === 'Block') scanBody(s.body, false);
        } else if (s.type === 'Const' && top) {
          if (seenConst.has(s.name)) {
            errs.push(err('SEM_DUPLICATE_CONST', `Hằng trùng: ${s.name}`, file, s.line, s.column));
          }
          seenConst.add(s.name);
        } else if (s.type === 'Include') {
          if (!hasOwn(program.files, s.path)) {
            errs.push(err('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp include: ${s.path}`, file, s.line, s.column));
          } else if (stack.includes(s.path)) {
            errs.push(err('SEM_INCLUDE_CYCLE', `Include vòng: ${s.path}`, file, s.line, s.column));
          } else if (!visited.has(s.path)) {
            visit(s.path);
          }
        }
      }
    };
    scanBody(program.files[file].body, true);
    stack.pop();
    errs.sort(byPos);
  };
  visit(program.entry);

  const phaseA = order.flatMap((f) => perFile.get(f));
  if (phaseA.length) return phaseA;

  // ---- Pha B ----
  const merged = mergeProgram(program);
  const phaseB = checkRefs(program, merged, order);
  if (phaseB.length) return phaseB;

  // ---- Pha C ----
  if (!schema) return [];
  return checkSchema(merged, schema);
}

const isPure = (str) => str.parts.length === 1 && str.parts[0].type === 'Ref';

// Gom mọi String của một tệp, kèm cờ nằm trong const.
function collectStrings(ast) {
  const out = [];
  const val = (node, inConst) => {
    if (node.type === 'String') out.push({ node, inConst });
    else if (node.type === 'Array') for (const it of node.items) val(it, inConst);
  };
  const body = (b) => {
    for (const s of b) {
      if (s.type === 'Assign') val(s.value, false);
      else if (s.type === 'Const') val(s.value, true);
      else if (s.type === 'Block') body(s.body);
    }
  };
  body(ast.body);
  return out;
}

function checkRefs(program, merged, order) {
  const fileOf = new Map(); // String node -> tệp
  const infos = [];
  for (const file of order) {
    for (const s of collectStrings(program.files[file])) {
      fileOf.set(s.node, file);
      infos.push({ ...s, file });
    }
  }

  // Cạnh: s -> S(đích của từng Ref phân giải được trong s)
  const succCache = new Map();
  const succ = (node) => {
    let r = succCache.get(node);
    if (!r) {
      r = [];
      const file = fileOf.get(node);
      for (const p of node.parts) {
        if (p.type !== 'Ref') continue;
        const t = resolveRef(merged, p, file);
        if (t) for (const x of stringsOf(t)) r.push(x.node);
      }
      succCache.set(node, r);
    }
    return r;
  };
  const reaches = (starts, goal) => {
    const seen = new Set();
    const st = [...starts];
    while (st.length) {
      const n = st.pop();
      if (n === goal) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const m of succ(n)) st.push(m);
    }
    return false;
  };

  // Loại giá trị đã đánh giá của đích: 'object' | 'array' | 'scalar'
  const kindOf = (t, guard = new Set()) => {
    if (t.kind === 'object') return 'object';
    const n = t.node;
    if (n.type === 'Array') return 'array';
    if (n.type === 'String' && isPure(n)) {
      if (guard.has(n)) return 'scalar';
      guard.add(n);
      const t2 = resolveRef(merged, n.parts[0], t.file);
      return t2 ? kindOf(t2, guard) : 'scalar';
    }
    return 'scalar';
  };

  const errors = [];
  for (const file of order) {
    const here = [];
    for (const { node, inConst, file: f } of infos) {
      if (f !== file) continue;
      for (const r of node.parts) {
        if (r.type !== 'Ref') continue;
        const at = (code, msg) => here.push(err(code, msg, file, r.line, r.column));
        if (inConst && !r.const) {
          at('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình');
          continue;
        }
        const t = resolveRef(merged, r, file);
        if (!t) {
          at('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${r.path.join('.')}`);
          continue;
        }
        if (reaches(stringsOf(t).map((x) => x.node), node)) {
          at('SEM_REF_CYCLE', `Vòng tham chiếu: ${r.path.join('.')}`);
          continue;
        }
        if (!isPure(node) && kindOf(t) !== 'scalar') {
          at('SEM_BAD_INTERPOLATION', `Nội suy mảng/đối tượng vào chuỗi: ${r.path.join('.')}`);
        }
      }
    }
    here.sort(byPos);
    errors.push(...here);
  }
  return errors;
}

function checkSchema(merged, schema) {
  const errors = [];
  const push = (code, msg, loc) => errors.push(err(code, msg, loc.file, loc.line, loc.column));
  const nodeLoc = (node, file) => ({ file, line: node.line, column: node.column });

  // `force`: vị trí ép buộc khi giá trị đến từ chuỗi thuần tham chiếu (áp cho giá trị và mọi thứ bên trong).
  const walk = (target, spec, force) => {
    if (!spec) return;
    let view;
    if (target.kind === 'object') {
      view = { kind: 'object', loc: force || target.loc, entries: target.entries };
    } else {
      const { node, file } = target;
      if (node.type === 'String' && isPure(node)) {
        const t = resolveRef(merged, node.parts[0], file);
        walk(t, spec, force || nodeLoc(node, file));
        return;
      }
      const loc = force || nodeLoc(node, file);
      if (node.type === 'Array') view = { kind: 'array', loc, items: node.items, file };
      else if (node.type === 'Null') view = { kind: 'null', loc, value: null };
      else if (node.type === 'Bool') view = { kind: 'boolean', loc, value: node.value };
      else if (node.type === 'Number') view = { kind: 'number', loc, value: node.value };
      else view = { kind: 'string', loc, value: evaluateValue(merged, node, file) };
    }

    const t = spec.type;
    if (t && t !== 'any') {
      const ok =
        t === 'integer' ? view.kind === 'number' && Number.isInteger(view.value) : t === view.kind;
      if (!ok) {
        push('SEM_TYPE_MISMATCH', `Kiểu không khớp: cần ${t}, có ${view.kind}`, view.loc);
        return;
      }
    }
    if (Array.isArray(spec.enum) && view.kind !== 'object' && view.kind !== 'array') {
      if (!spec.enum.includes(view.value)) {
        push('SEM_NOT_IN_ENUM', 'Giá trị ngoài enum', view.loc);
        return;
      }
    }
    if (view.kind === 'object' && spec.fields) {
      for (const k of Object.keys(spec.fields)) {
        if (spec.fields[k] && spec.fields[k].required === true && !view.entries.has(k)) {
          push('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc: ${k}`, view.loc);
        }
      }
      for (const e of view.entries.values()) {
        if (hasOwn(spec.fields, e.key)) walk(e.value, spec.fields[e.key], force);
        else if (spec.closed === true) {
          push('SEM_UNKNOWN_KEY', `Khóa không được phép: ${e.key}`, nodeLoc(e.stmt, e.file));
        }
      }
    }
    if (view.kind === 'array' && spec.items) {
      for (const it of view.items) walk({ kind: 'value', node: it, file: view.file }, spec.items, force);
    }
  };
  walk(merged.root, schema);
  return errors;
}
