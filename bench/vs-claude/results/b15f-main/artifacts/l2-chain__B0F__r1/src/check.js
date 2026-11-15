// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5 (pha A, B, C).
import { merge, isMergedObject, resolveRef, collectStrings, evaluateString } from './merge.js';

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function err(code, message, file, node) {
  return { code, message, file, line: node.line, column: node.column };
}

// Pha A: duyệt tiền thứ tự theo include; lỗi gom theo tệp, sắp (line, column).
function phaseA(program) {
  const errors = [];
  const visited = new Set();
  const stack = new Set();

  function visit(file) {
    visited.add(file);
    stack.add(file);
    const local = [];
    const children = [];
    const ast = program.files[file];

    const walk = (body, top) => {
      const keys = new Set();
      const consts = new Set();
      for (const st of body) {
        if (st.type === 'Assign' || st.type === 'Block') {
          if (keys.has(st.key)) {
            local.push(err('SEM_DUPLICATE_KEY', `Khóa trùng: ${st.key}`, file, st));
          }
          keys.add(st.key);
          if (st.type === 'Block') walk(st.body, false);
        } else if (st.type === 'Const') {
          if (top) {
            if (consts.has(st.name)) {
              local.push(err('SEM_DUPLICATE_CONST', `Hằng trùng: ${st.name}`, file, st));
            }
            consts.add(st.name);
          }
        } else if (st.type === 'Include') {
          if (!has(program.files, st.path)) {
            local.push(err('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp: ${st.path}`, file, st));
          } else if (stack.has(st.path)) {
            local.push(err('SEM_INCLUDE_CYCLE', `Vòng include: ${st.path}`, file, st));
          } else {
            children.push(st.path);
          }
        }
      }
    };
    walk(ast.body, true);

    local.sort((a, b) => a.line - b.line || a.column - b.column);
    errors.push(...local);

    // Đi xuống theo thứ tự tài liệu; kiểm lại visited vì con trước có thể đã thăm.
    for (const c of children) {
      if (!visited.has(c)) visit(c);
    }
    stack.delete(file);
  }

  if (program && program.files && has(program.files, program.entry)) visit(program.entry);
  return errors;
}

// Thứ tự tệp tiền thứ tự theo include, mỗi tệp một lần (như mục 4).
function fileOrder(program) {
  const order = [];
  const seen = new Set();
  const visit = (file) => {
    seen.add(file);
    order.push(file);
    const go = (body) => {
      for (const st of body) {
        if (st.type === 'Block') go(st.body);
        else if (st.type === 'Include' && has(program.files, st.path) && !seen.has(st.path)) visit(st.path);
      }
    };
    go(program.files[file].body);
  };
  if (has(program.files, program.entry)) visit(program.entry);
  return order;
}

// Mọi chuỗi (kể cả trong mảng, const, định nghĩa bị ghi đè) của một tệp.
function stringsOfFile(ast) {
  const out = [];
  const val = (n, inConst) => {
    if (n.type === 'String') out.push({ node: n, inConst });
    else if (n.type === 'Array') for (const it of n.items) val(it, inConst);
  };
  const go = (body) => {
    for (const st of body) {
      if (st.type === 'Assign') val(st.value, false);
      else if (st.type === 'Const') val(st.value, true);
      else if (st.type === 'Block') go(st.body);
    }
  };
  go(ast.body);
  return out;
}

const isPure = (str) => str.parts.length === 1 && str.parts[0].type === 'Ref';

function phaseB(program) {
  const merged = merge(program);
  const succMemo = new Map();
  const succ = (str) => {
    let r = succMemo.get(str);
    if (!r) {
      r = [];
      const f = merged.fileOf.get(str);
      for (const p of str.parts) {
        if (p.type !== 'Ref') continue;
        const res = resolveRef(merged, p, f);
        if (res.found) r.push(...collectStrings(res.target));
      }
      succMemo.set(str, r);
    }
    return r;
  };
  const reaches = (starts, goal) => {
    const seen = new Set();
    const stack = [...starts];
    while (stack.length) {
      const n = stack.pop();
      if (n === goal) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...succ(n));
    }
    return false;
  };
  const kind = (node, seen) => {
    if (isMergedObject(node)) return 'object';
    if (node.type === 'Array') return 'array';
    if (node.type === 'String' && isPure(node) && !seen.has(node)) {
      seen.add(node);
      const res = resolveRef(merged, node.parts[0], merged.fileOf.get(node));
      return res.found ? kind(res.target, seen) : 'scalar';
    }
    return 'scalar';
  };

  const errors = [];
  for (const file of fileOrder(program)) {
    const local = [];
    for (const { node, inConst } of stringsOfFile(program.files[file])) {
      for (const r of node.parts) {
        if (r.type !== 'Ref') continue;
        const at = (code, message) => local.push(err(code, message, file, r));
        if (inConst && !r.const) {
          at('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình');
          continue;
        }
        const res = resolveRef(merged, r, file);
        if (!res.found) {
          at('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${r.path.join('.')}`);
          continue;
        }
        if (reaches(collectStrings(res.target), node)) {
          at('SEM_REF_CYCLE', `Vòng tham chiếu: ${r.path.join('.')}`);
          continue;
        }
        if (!isPure(node) && kind(res.target, new Set()) !== 'scalar') {
          at('SEM_BAD_INTERPOLATION', `Không thể nội suy mảng/đối tượng: ${r.path.join('.')}`);
        }
      }
    }
    local.sort((a, b) => a.line - b.line || a.column - b.column);
    errors.push(...local);
  }
  return errors;
}

function phaseC(program, schema) {
  const merged = merge(program);
  const errors = [];
  const push = (code, message, loc) =>
    errors.push({ code, message, file: loc.file, line: loc.line, column: loc.column });

  // node: nút giá trị | MergedObject; own: vị trí riêng; over: vị trí ghi đè (chuỗi thuần tham chiếu).
  function visit(node, spec, own, over) {
    if (!spec || typeof spec !== 'object') return;
    let n = node;
    let ov = over;
    for (let i = 0; i < 1000 && n.type === 'String' && isPure(n); i++) {
      const f = merged.fileOf.get(n) ?? own.file;
      if (!ov) ov = { file: f, line: n.line, column: n.column };
      const res = resolveRef(merged, n.parts[0], f);
      if (!res.found) return;
      n = res.target;
    }
    const loc = ov || own;
    let kind;
    let scalar;
    let isScalar = false;
    if (isMergedObject(n)) kind = 'object';
    else if (n.type === 'Array') kind = 'array';
    else {
      isScalar = true;
      if (n.type === 'String') { kind = 'string'; scalar = evaluateString(merged, n); }
      else if (n.type === 'Number') { kind = 'number'; scalar = n.value; }
      else if (n.type === 'Bool') { kind = 'boolean'; scalar = n.value; }
      else { kind = 'null'; scalar = null; }
    }
    const t = spec.type;
    if (t !== undefined && t !== 'any') {
      const ok = t === 'integer' ? kind === 'number' && Number.isInteger(scalar) : t === kind;
      if (!ok) { push('SEM_TYPE_MISMATCH', `Kiểu không khớp: cần ${t}, có ${kind}`, loc); return; }
    }
    if (Array.isArray(spec.enum) && isScalar && !spec.enum.some((v) => v === scalar)) {
      push('SEM_NOT_IN_ENUM', 'Giá trị không thuộc enum', loc);
      return;
    }
    if (kind === 'object' && spec.fields && typeof spec.fields === 'object') {
      for (const k of Object.keys(spec.fields)) {
        const fs = spec.fields[k];
        if (fs && fs.required === true && !n.entries.has(k)) {
          push('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc: ${k}`, loc);
        }
      }
      for (const [k, e] of n.entries) {
        if (has(spec.fields, k)) {
          const childOwn = isMergedObject(e.value)
            ? e.value.block
            : { file: e.file, line: e.value.line, column: e.value.column };
          visit(e.value, spec.fields[k], childOwn, ov);
        } else if (spec.closed === true) {
          push('SEM_UNKNOWN_KEY', `Khóa không được phép: ${k}`, { file: e.file, line: e.node.line, column: e.node.column });
        }
      }
    }
    if (kind === 'array' && spec.items) {
      const file = own.file;
      n.items.forEach((it) => {
        visit(it, spec.items, { file: merged.fileOf.get(it) ?? file, line: it.line, column: it.column }, ov);
      });
    }
  }

  visit(merged.root, schema, merged.root.block, null);
  return errors;
}

export function check(program, schema) {
  try {
    const a = phaseA(program);
    if (a.length) return a;
    const b = phaseB(program);
    if (b.length) return b;
    if (schema !== undefined && schema !== null) return phaseC(program, schema);
    return [];
  } catch (e) {
    return [{ code: 'SEM_INTERNAL', message: String(e && e.message), file: program && program.entry, line: 1, column: 1 }];
  }
}
