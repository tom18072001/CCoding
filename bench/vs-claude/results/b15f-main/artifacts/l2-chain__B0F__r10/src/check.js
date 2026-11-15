// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
// Ba pha A (cấu trúc) → B (tham chiếu) → C (lược đồ); pha nào có lỗi thì dừng ở pha đó.
// Hợp nhất/phân giải dùng helper của evaluate.js (hợp đồng D4); không ném ra ngoài.

import { mergeProgram, resolvePath, evalNode } from './evaluate.js';

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function mkErr(code, message, file, node) {
  return { code, message, file, line: node.line, column: node.column };
}

const byPos = (a, b) => a.line - b.line || a.column - b.column;

function includesOf(body, out = []) {
  for (const st of body) {
    if (st.type === 'Include') out.push(st);
    else if (st.type === 'Block') includesOf(st.body, out);
  }
  return out;
}

// Duyệt tệp tiền thứ tự theo include (tệp có trong program.files, mỗi tệp một lần).
function fileOrder(program) {
  const files = program.files || {};
  const order = [];
  const seen = new Set();
  const visit = (name) => {
    seen.add(name);
    order.push(name);
    for (const inc of includesOf(files[name].body || [])) {
      if (has(files, inc.path) && !seen.has(inc.path)) visit(inc.path);
    }
  };
  if (program.entry !== undefined && has(files, program.entry)) visit(program.entry);
  return order;
}

// ------------------------------- Pha A -------------------------------
function phaseA(program) {
  const files = program.files || {};
  const errors = [];
  const seen = new Set();
  const path = new Set();

  const visit = (name) => {
    seen.add(name);
    path.add(name);
    const local = [];
    const descend = [];
    const scan = (body) => {
      const keys = new Set();
      const consts = new Set();
      for (const st of body) {
        if (st.type === 'Assign' || st.type === 'Block') {
          if (keys.has(st.key)) local.push(mkErr('SEM_DUPLICATE_KEY', 'khóa trùng: ' + st.key, name, st));
          keys.add(st.key);
          if (st.type === 'Block') scan(st.body);
        } else if (st.type === 'Const') {
          if (consts.has(st.name)) local.push(mkErr('SEM_DUPLICATE_CONST', 'hằng trùng: ' + st.name, name, st));
          consts.add(st.name);
        } else if (st.type === 'Include') {
          if (!has(files, st.path)) local.push(mkErr('SEM_INCLUDE_NOT_FOUND', 'không tìm thấy tệp: ' + st.path, name, st));
          else if (path.has(st.path)) local.push(mkErr('SEM_INCLUDE_CYCLE', 'include vòng: ' + st.path, name, st));
          else descend.push(st.path);
        }
      }
    };
    scan((files[name] && files[name].body) || []);
    local.sort(byPos);
    errors.push(...local);
    for (const p of descend) if (!seen.has(p)) visit(p);
    path.delete(name);
  };
  if (program.entry !== undefined && has(files, program.entry)) visit(program.entry);
  return errors;
}

// ------------------------------- Pha B -------------------------------
const isPure = (s) => s.parts.length === 1 && s.parts[0].type === 'Ref';

function stringsInValue(node, out) {
  if (node.type === 'String') out.push(node);
  else if (node.type === 'Array') for (const it of node.items) stringsInValue(it, out);
  return out;
}

function stringsInM(m, out) {
  if (m.kind === 'object') for (const e of m.entries.values()) stringsInM(e.value, out);
  else stringsInValue(m.node, out);
  return out;
}

function phaseB(program, merged, order) {
  const files = program.files;
  const info = new Map(); // String node -> { file, inConst }
  const perFile = [];
  for (const name of order) {
    const list = [];
    const walk = (node, inConst) => {
      if (node.type === 'String') {
        info.set(node, { file: name, inConst });
        list.push(node);
      } else if (node.type === 'Array') for (const it of node.items) walk(it, inConst);
    };
    const walkBody = (body) => {
      for (const st of body) {
        if (st.type === 'Assign') walk(st.value, false);
        else if (st.type === 'Const') walk(st.value, true);
        else if (st.type === 'Block') walkBody(st.body);
      }
    };
    walkBody(files[name].body || []);
    perFile.push([name, list]);
  }

  const resolveRef = (ref, file) => resolvePath(merged, ref.path, ref.const, file);

  const edgeCache = new Map();
  const edgesOf = (s) => {
    let e = edgeCache.get(s);
    if (e) return e;
    e = [];
    const file = info.get(s).file;
    for (const p of s.parts) {
      if (p.type !== 'Ref') continue;
      const r = resolveRef(p, file);
      if (r.found) stringsInM(r.target, e);
    }
    edgeCache.set(s, e);
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
      if (info.has(n)) stack.push(...edgesOf(n));
    }
    return false;
  };

  // loại giá trị đã đánh giá của đích: 'object' | 'array' | 'scalar'
  const kindOf = (m, depth = 0) => {
    if (depth > 200) return 'scalar';
    if (m.kind === 'object') return 'object';
    const n = m.node;
    if (n.type === 'Array') return 'array';
    if (n.type === 'String' && isPure(n)) {
      const r = resolveRef(n.parts[0], m.file);
      return r.found ? kindOf(r.target, depth + 1) : 'scalar';
    }
    return 'scalar';
  };

  const errors = [];
  for (const [name, list] of perFile) {
    const local = [];
    for (const s of list) {
      const { inConst } = info.get(s);
      for (const p of s.parts) {
        if (p.type !== 'Ref') continue;
        let code = null;
        if (!p.const && inConst) code = 'SEM_CONST_CONFIG_REF';
        else {
          const r = resolveRef(p, name);
          if (!r.found) code = 'SEM_UNDEFINED_REF';
          else if (reaches(stringsInM(r.target, []), s)) code = 'SEM_REF_CYCLE';
          else if (!isPure(s) && kindOf(r.target) !== 'scalar') code = 'SEM_BAD_INTERPOLATION';
        }
        if (code) local.push(mkErr(code, code + ': ' + p.path.join('.'), name, p));
      }
    }
    local.sort(byPos);
    errors.push(...local);
  }
  return errors;
}

// ------------------------------- Pha C -------------------------------
function phaseC(merged, schema) {
  const errors = [];
  const at = (file, n) => ({ file, line: n.line, column: n.column });
  const push = (code, message, loc) =>
    errors.push({ code, message, file: loc.file, line: loc.line, column: loc.column });

  // Giải chuỗi thuần tham chiếu tới đích cuối; vị trí của chuỗi ngoài cùng phủ lên mọi thứ bên trong.
  const settle = (m, ov) => {
    for (let i = 0; i < 1000; i++) {
      if (m.kind === 'value' && m.node.type === 'String' && isPure(m.node)) {
        const ref = m.node.parts[0];
        const r = resolvePath(merged, ref.path, ref.const, m.file);
        if (!r.found) break;
        ov = ov || at(m.file, m.node);
        m = r.target;
      } else break;
    }
    let loc = ov;
    if (!loc) {
      if (m.kind === 'object') loc = m.block ? at(m.file, m.block) : { file: merged.entry, line: 1, column: 1 };
      else loc = at(m.file, m.node);
    }
    return { m, loc, ov };
  };

  const typeOk = (type, kind, v) => {
    switch (type) {
      case 'string': return kind === 'scalar' && typeof v === 'string';
      case 'number': return kind === 'scalar' && typeof v === 'number';
      case 'integer': return kind === 'scalar' && Number.isInteger(v);
      case 'boolean': return kind === 'scalar' && typeof v === 'boolean';
      case 'null': return kind === 'scalar' && v === null;
      case 'array': return kind === 'array';
      case 'object': return kind === 'object';
      default: return true;
    }
  };

  const walk = (m0, spec, ov0) => {
    if (!spec || typeof spec !== 'object') return;
    const { m, loc, ov } = settle(m0, ov0);
    let kind;
    let value;
    if (m.kind === 'object') kind = 'object';
    else if (m.node.type === 'Array') kind = 'array';
    else {
      kind = 'scalar';
      value = m.node.type === 'Null' ? null : m.node.type === 'String' ? evalNode(merged, m) : m.node.value;
    }
    if (spec.type !== undefined && spec.type !== 'any' && !typeOk(spec.type, kind, value)) {
      push('SEM_TYPE_MISMATCH', 'kiểu không khớp, cần ' + spec.type, loc);
      return;
    }
    if (Array.isArray(spec.enum) && kind === 'scalar' && !spec.enum.some((e) => e === value)) {
      push('SEM_NOT_IN_ENUM', 'giá trị không thuộc enum', loc);
      return;
    }
    if (kind === 'object' && spec.fields && typeof spec.fields === 'object') {
      for (const k of Object.keys(spec.fields)) {
        const f = spec.fields[k];
        if (f && f.required === true && !m.entries.has(k)) push('SEM_MISSING_REQUIRED', 'thiếu khóa bắt buộc: ' + k, loc);
      }
      for (const [k, e] of m.entries) {
        if (has(spec.fields, k)) walk(e.value, spec.fields[k], ov);
        else if (spec.closed === true) push('SEM_UNKNOWN_KEY', 'khóa không được phép: ' + k, at(e.file, e.stmt));
      }
    }
    if (kind === 'array' && spec.items) {
      for (const it of m.node.items) walk({ kind: 'value', node: it, file: m.file }, spec.items, ov);
    }
  };

  walk(merged.root, schema, null);
  return errors;
}

export function check(program, schema) {
  try {
    const a = phaseA(program);
    if (a.length) return a;
    const order = fileOrder(program);
    const merged = mergeProgram(program);
    const b = phaseB(program, merged, order);
    if (b.length) return b;
    if (schema === undefined || schema === null) return [];
    return phaseC(merged, schema);
  } catch (e) {
    return [{ code: 'SEM_INTERNAL', message: String(e && e.message), file: program && program.entry, line: 1, column: 1 }];
  }
}
