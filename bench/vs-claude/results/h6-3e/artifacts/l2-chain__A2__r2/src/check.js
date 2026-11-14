// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.

import { buildModel, fileOrder, resolveRef, evalTarget, isPureRef } from './model.js';

const mk = (code, message, file, line, column) => ({ code, message, file, line, column });
const byPos = (a, b) => a.line - b.line || a.column - b.column;

// ---------- Pha A ----------
function phaseA(program) {
  const files = program.files;
  const out = [];
  const visited = new Set();
  const stack = [];
  const visit = (file) => {
    visited.add(file);
    stack.push(file);
    const errs = [];
    const children = [];
    const seenConst = new Set();
    const scan = (stmts, top) => {
      const seen = new Set();
      for (const st of stmts) {
        if (st.type === 'Assign' || st.type === 'Block') {
          if (seen.has(st.key)) errs.push(mk('SEM_DUPLICATE_KEY', `Khóa trùng: ${st.key}`, file, st.line, st.column));
          seen.add(st.key);
          if (st.type === 'Block') scan(st.body, false);
        } else if (st.type === 'Const') {
          if (seenConst.has(st.name)) errs.push(mk('SEM_DUPLICATE_CONST', `Hằng trùng: ${st.name}`, file, st.line, st.column));
          seenConst.add(st.name);
        } else if (st.type === 'Include') {
          if (!Object.hasOwn(files, st.path)) {
            errs.push(mk('SEM_INCLUDE_NOT_FOUND', `Không thấy tệp: ${st.path}`, file, st.line, st.column));
          } else if (stack.includes(st.path)) {
            errs.push(mk('SEM_INCLUDE_CYCLE', `Vòng include: ${st.path}`, file, st.line, st.column));
          } else children.push(st.path);
        }
      }
    };
    scan(files[file].body, true);
    errs.sort(byPos);
    out.push(errs);
    for (const c of children) if (!visited.has(c)) visit(c);
    stack.pop();
  };
  if (Object.hasOwn(files, program.entry)) visit(program.entry);
  return out.flat();
}

// ---------- Pha B ----------
function collectStrings(t, out) {
  if (t.kind === 'obj') {
    for (const slot of t.keys.values()) collectStrings(slot.value, out);
    return out;
  }
  collectNode(t.node, out);
  return out;
}
function collectNode(node, out) {
  if (node.type === 'String') out.add(node);
  else if (node.type === 'Array') for (const it of node.items) collectNode(it, out);
}

function walkStrings(node, cb) {
  if (node.type === 'String') cb(node);
  else if (node.type === 'Array') for (const it of node.items) walkStrings(it, cb);
}

function phaseB(program, model, order) {
  const stringFile = new Map();
  const perFile = new Map(); // file -> [{node, inConst}]
  for (const f of order) {
    const list = [];
    const visitStmts = (stmts) => {
      for (const st of stmts) {
        if (st.type === 'Assign') walkStrings(st.value, (n) => { stringFile.set(n, f); list.push({ node: n, inConst: false }); });
        else if (st.type === 'Const') walkStrings(st.value, (n) => { stringFile.set(n, f); list.push({ node: n, inConst: true }); });
        else if (st.type === 'Block') visitStmts(st.body);
      }
    };
    visitStmts(program.files[f].body);
    perFile.set(f, list);
  }

  const succMemo = new Map();
  const succ = (node) => {
    let r = succMemo.get(node);
    if (r) return r;
    r = new Set();
    for (const part of node.parts) {
      if (part.type !== 'Ref') continue;
      const t = resolveRef(model, stringFile.get(node), part);
      if (t) collectStrings(t, r);
    }
    succMemo.set(node, r);
    return r;
  };
  const reaches = (starts, goal) => {
    const seen = new Set();
    const queue = [...starts];
    while (queue.length) {
      const n = queue.pop();
      if (n === goal) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const m of succ(n)) queue.push(m);
    }
    return false;
  };
  // Kiểu đã đánh giá của đích (không ném khi có vòng/không phân giải).
  const kindOf = (t, guard) => {
    if (t.kind === 'obj') return 'object';
    const node = t.node;
    if (node.type === 'Array') return 'array';
    if (node.type === 'String') {
      if (node.parts.length === 1 && node.parts[0].type === 'Ref') {
        if (guard.has(node)) return 'scalar';
        const t2 = resolveRef(model, stringFile.get(node), node.parts[0]);
        if (!t2) return 'scalar';
        guard.add(node);
        const k = kindOf(t2, guard);
        guard.delete(node);
        return k;
      }
    }
    return 'scalar';
  };

  const errs = [];
  for (const f of order) {
    const fe = [];
    for (const { node, inConst } of perFile.get(f)) {
      const pure = isPureRef(node);
      for (const ref of node.parts) {
        if (ref.type !== 'Ref') continue;
        if (inConst && !ref.const) {
          fe.push(mk('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình', f, ref.line, ref.column));
          continue;
        }
        const t = resolveRef(model, f, ref);
        if (!t) {
          fe.push(mk('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${ref.path.join('.')}`, f, ref.line, ref.column));
          continue;
        }
        if (reaches(collectStrings(t, new Set()), node)) {
          fe.push(mk('SEM_REF_CYCLE', 'Vòng tham chiếu', f, ref.line, ref.column));
          continue;
        }
        if (!pure) {
          const k = kindOf(t, new Set());
          if (k === 'array' || k === 'object') {
            fe.push(mk('SEM_BAD_INTERPOLATION', 'Nội suy mảng/đối tượng vào chuỗi', f, ref.line, ref.column));
          }
        }
      }
    }
    fe.sort(byPos);
    errs.push(...fe);
  }
  return errs;
}

// ---------- Pha C ----------
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function phaseC(program, model, schema) {
  const errs = [];
  const err = (code, msg, pos) => errs.push(mk(code, msg, pos.file, pos.line, pos.column));
  const nodePos = (file, node) => ({ file, line: node.line, column: node.column });

  // Đi xuyên các chuỗi thuần tham chiếu; trả { t, ov }.
  const locate = (t, ov) => {
    let guard = 0;
    while (t.kind === 'val' && t.node.type === 'String' && isPureRef(t.node) && guard++ < 1000) {
      ov = ov || nodePos(t.file, t.node);
      t = resolveRef(model, t.file, t.node.parts[0]);
    }
    return { t, ov };
  };

  const rec = (t0, spec, ov0) => {
    if (!spec) return;
    const { t, ov } = locate(t0, ov0);
    const value = evalTarget(model, t);
    const pos = ov || (t.kind === 'obj' ? t.origin : nodePos(t.file, t.node));
    const vt = typeOf(value);
    if (spec.type !== undefined && spec.type !== 'any') {
      const ok = spec.type === 'integer' ? Number.isInteger(value) : spec.type === vt;
      if (!ok) { err('SEM_TYPE_MISMATCH', `Sai kiểu, cần ${spec.type}`, pos); return; }
    }
    if (Array.isArray(spec.enum) && vt !== 'array' && vt !== 'object') {
      if (!spec.enum.some((e) => e === value)) { err('SEM_NOT_IN_ENUM', 'Giá trị ngoài enum', pos); return; }
    }
    if (vt === 'object' && spec.fields) {
      for (const k of Object.keys(spec.fields)) {
        if (spec.fields[k] && spec.fields[k].required === true && !Object.hasOwn(value, k)) {
          err('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc: ${k}`, pos);
        }
      }
      for (const [k, slot] of t.keys) {
        if (Object.hasOwn(spec.fields, k)) rec(slot.value, spec.fields[k], ov);
        else if (spec.closed === true) err('SEM_UNKNOWN_KEY', `Khóa lạ: ${k}`, ov || slot.kpos);
      }
    }
    if (vt === 'array' && spec.items) {
      for (const it of t.node.items) rec({ kind: 'val', node: it, file: t.file }, spec.items, ov);
    }
  };
  rec(model.root, schema, undefined);
  return errs;
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.length) return a;
  const model = buildModel(program);
  const order = fileOrder(program);
  const b = phaseB(program, model, order);
  if (b.length) return b;
  if (schema) return phaseC(program, model, schema);
  return [];
}
