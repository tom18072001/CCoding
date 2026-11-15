// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5. Hợp nhất/phân giải lấy từ merge.js (dùng chung với evaluate).
import { mergeProgram, resolveRef, refsOfString, isPureRef, collectStrings, targetKind } from './merge.js';
import { evaluate } from './evaluate.js';

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const byPos = (a, b) => a.line - b.line || a.column - b.column;
const err = (code, message, file, line, column) => ({ code, message, file, line, column });

// ── Pha A ──
function phaseA(program) {
  const order = [];
  const done = new Set();
  const stack = new Set();
  const errs = new Map();
  const visit = (file) => {
    order.push(file);
    done.add(file);
    stack.add(file);
    const list = [];
    errs.set(file, list);
    const walk = (stmts) => {
      const keys = new Set();
      const consts = new Set();
      for (const s of stmts) {
        if (s.type === 'Assign' || s.type === 'Block') {
          if (keys.has(s.key)) list.push(err('SEM_DUPLICATE_KEY', `Khóa trùng: ${s.key}`, file, s.line, s.column));
          keys.add(s.key);
          if (s.type === 'Block') walk(s.body);
        } else if (s.type === 'Const') {
          if (consts.has(s.name)) list.push(err('SEM_DUPLICATE_CONST', `Hằng trùng: ${s.name}`, file, s.line, s.column));
          consts.add(s.name);
        } else if (s.type === 'Include') {
          if (!hasOwn(program.files, s.path)) {
            list.push(err('SEM_INCLUDE_NOT_FOUND', `Không thấy tệp include: ${s.path}`, file, s.line, s.column));
          } else if (stack.has(s.path)) {
            list.push(err('SEM_INCLUDE_CYCLE', `Include vòng: ${s.path}`, file, s.line, s.column));
          } else if (!done.has(s.path)) {
            visit(s.path);
          }
        }
      }
    };
    walk(program.files[file].body);
    stack.delete(file);
  };
  if (hasOwn(program.files, program.entry)) visit(program.entry);
  const out = [];
  for (const f of order) out.push(...errs.get(f).sort(byPos));
  return { order, errors: out };
}

// ── Pha B ──
function phaseB(program, order) {
  const root = mergeProgram(program);
  const edgeCache = new Map();
  const edges = (node, file) => {
    let e = edgeCache.get(node);
    if (!e) {
      e = [];
      for (const r of refsOfString(node)) {
        const t = resolveRef(root, program, r, file);
        if (t) e.push(...collectStrings(t));
      }
      edgeCache.set(node, e);
    }
    return e;
  };
  const reaches = (starts, goal) => {
    const seen = new Set();
    const st = [...starts];
    while (st.length) {
      const { node, file } = st.pop();
      if (node === goal) return true;
      if (seen.has(node)) continue;
      seen.add(node);
      st.push(...edges(node, file));
    }
    return false;
  };
  const out = [];
  for (const file of order) {
    const list = [];
    const str = (node, inConst) => {
      const pure = isPureRef(node);
      for (const r of refsOfString(node)) {
        const mk = (code, msg) => list.push(err(code, msg, file, r.line, r.column));
        if (inConst && !r.const) { mk('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình'); continue; }
        const t = resolveRef(root, program, r, file);
        if (!t) { mk('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${r.path.join('.')}`); continue; }
        if (reaches(collectStrings(t), node)) { mk('SEM_REF_CYCLE', 'Tham chiếu vòng'); continue; }
        if (!pure) {
          const k = targetKind(root, program, t);
          if (k === 'array' || k === 'object') mk('SEM_BAD_INTERPOLATION', 'Không nội suy mảng/đối tượng vào chuỗi');
        }
      }
    };
    const val = (v, inConst) => {
      if (v.type === 'String') str(v, inConst);
      else if (v.type === 'Array') for (const it of v.items) val(it, inConst);
    };
    const walk = (stmts) => {
      for (const s of stmts) {
        if (s.type === 'Assign') val(s.value, false);
        else if (s.type === 'Const') val(s.value, true);
        else if (s.type === 'Block') walk(s.body);
      }
    };
    walk(program.files[file].body);
    out.push(...list.sort(byPos));
  }
  return { root, errors: out };
}

// ── Pha C ──
function kindOfValue(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function typeMatches(type, v) {
  const k = kindOfValue(v);
  if (type === 'integer') return k === 'number' && Number.isInteger(v);
  return k === type;
}

function phaseC(program, root, schema) {
  const config = evaluate(program);
  const out = [];
  const at = (code, msg, p) => out.push(err(code, msg, p.file, p.line, p.column));
  const nodePos = (node, file) => ({ file, line: node.line, column: node.column });

  // ctx: { kind:'object', on } | { kind:'array', node, file } | null (vô hướng / trong chuỗi thuần tham chiếu)
  // forced: vị trí cưỡng bức cho mọi thứ bên trong chuỗi thuần tham chiếu, hoặc null
  const validate = (value, spec, pos, ctx, forced) => {
    if (!spec || typeof spec !== 'object') return;
    const p0 = forced || pos;
    if (spec.type && spec.type !== 'any' && !typeMatches(spec.type, value)) {
      at('SEM_TYPE_MISMATCH', `Sai kiểu, cần ${spec.type}`, p0);
      return;
    }
    const k = kindOfValue(value);
    if (Array.isArray(spec.enum) && k !== 'array' && k !== 'object' && !spec.enum.some((e) => e === value)) {
      at('SEM_NOT_IN_ENUM', 'Giá trị ngoài enum', p0);
      return;
    }
    if (k === 'object' && spec.fields && typeof spec.fields === 'object') {
      for (const fk of Object.keys(spec.fields)) {
        const fs = spec.fields[fk];
        if (fs && fs.required === true && !hasOwn(value, fk)) at('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc: ${fk}`, p0);
      }
      const objCtx = !forced && ctx && ctx.kind === 'object' ? ctx.on : null;
      const keys = objCtx ? [...objCtx.children.keys()] : Object.keys(value);
      for (const key of keys) {
        const e = objCtx ? objCtx.children.get(key) : null;
        if (hasOwn(spec.fields, key)) {
          let cpos = forced || p0;
          let cctx = null;
          let cforced = forced;
          if (e) {
            if (e.kind === 'object') { cpos = e.block; cctx = { kind: 'object', on: e }; }
            else {
              cpos = nodePos(e.node, e.file);
              if (e.node.type === 'Array') cctx = { kind: 'array', node: e.node, file: e.file };
              else if (e.node.type === 'String' && isPureRef(e.node)) cforced = cpos;
            }
          }
          validate(value[key], spec.fields[key], cpos, cctx, cforced);
        } else if (spec.closed === true) {
          let p = p0;
          if (!forced && e) p = { file: e.kind === 'object' ? e.stmtFile : e.file, line: e.stmt.line, column: e.stmt.column };
          at('SEM_UNKNOWN_KEY', `Khóa lạ: ${key}`, p);
        }
      }
    }
    if (k === 'array' && spec.items) {
      value.forEach((item, i) => {
        if (!forced && ctx && ctx.kind === 'array') {
          const n = ctx.node.items[i];
          const cpos = nodePos(n, ctx.file);
          const cforced = n.type === 'String' && isPureRef(n) ? cpos : null;
          const cctx = n.type === 'Array' && !cforced ? { kind: 'array', node: n, file: ctx.file } : null;
          validate(item, spec.items, cpos, cctx, cforced);
        } else {
          validate(item, spec.items, p0, null, forced);
        }
      });
    }
  };
  validate(config, schema, root.block, { kind: 'object', on: root }, null);
  return out;
}

export function check(program, schema) {
  try {
    const a = phaseA(program);
    if (a.errors.length) return a.errors;
    const b = phaseB(program, a.order);
    if (b.errors.length) return b.errors;
    if (schema) return phaseC(program, b.root, schema);
    return [];
  } catch (e) {
    return [err('SEM_INTERNAL', String(e && e.message), program && program.entry, 1, 1)];
  }
}
