// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
// Ba pha liên tiếp; pha nào có lỗi thì trả lỗi pha đó và dừng.
import { mergeProgram, resolveRef, stringsIn, sourcePos } from './merge.js';

const err = (code, message, file, node) => ({ code, message, file, line: node.line, column: node.column });
const byPos = (a, b) => a.line - b.line || a.column - b.column;
const has = (files, name) => Object.hasOwn(files, name);

// Thứ tự thăm tệp (tiền thứ tự) + lỗi pha A gom theo tệp.
function phaseA(program) {
  const order = [];
  const visited = new Set();
  const perFile = new Map();
  const visit = (file, path) => {
    visited.add(file);
    order.push(file);
    const errs = [];
    perFile.set(file, errs);
    const ast = program.files[file];
    const consts = new Set();
    const walk = (body, top) => {
      const seen = new Set();
      for (const st of body) {
        if (st.type === 'Assign' || st.type === 'Block') {
          if (seen.has(st.key)) errs.push(err('SEM_DUPLICATE_KEY', `khóa trùng: ${st.key}`, file, st));
          seen.add(st.key);
          if (st.type === 'Block') walk(st.body, false);
        } else if (st.type === 'Const' && top) {
          if (consts.has(st.name)) errs.push(err('SEM_DUPLICATE_CONST', `hằng trùng: ${st.name}`, file, st));
          consts.add(st.name);
        } else if (st.type === 'Include') {
          if (!has(program.files, st.path)) {
            errs.push(err('SEM_INCLUDE_NOT_FOUND', `không tìm thấy tệp include: ${st.path}`, file, st));
          } else if (path.includes(st.path)) {
            errs.push(err('SEM_INCLUDE_CYCLE', `include vòng: ${st.path}`, file, st));
          } else if (!visited.has(st.path)) {
            visit(st.path, [...path, st.path]);
          }
        }
      }
    };
    walk(ast.body, true);
  };
  if (has(program.files, program.entry)) visit(program.entry, [program.entry]);
  const errors = [];
  for (const f of order) errors.push(...perFile.get(f).sort(byPos));
  return { errors, order };
}

// Mọi chuỗi trong tệp (kể cả chuỗi bị ghi đè, trong mảng, trong const).
function stringsOfFile(ast) {
  const out = [];
  const val = (node, inConst) => {
    if (node.type === 'String') out.push({ node, inConst });
    else if (node.type === 'Array') for (const it of node.items) val(it, inConst);
  };
  const walk = (body) => {
    for (const st of body) {
      if (st.type === 'Assign') val(st.value, false);
      else if (st.type === 'Const') val(st.value, true);
      else if (st.type === 'Block') walk(st.body);
    }
  };
  walk(ast.body);
  return out;
}

const isPure = (s) => s.parts.length === 1 && s.parts[0].type === 'Ref';

function phaseB(program, order) {
  const merged = mergeProgram(program);
  const fileOf = new Map(); // String node -> file
  const perFile = new Map();
  for (const f of order) {
    const list = stringsOfFile(program.files[f]);
    perFile.set(f, list);
    for (const { node } of list) fileOf.set(node, f);
  }

  // Cạnh s -> S(đích của từng Ref phân giải được trong s)
  const edgeCache = new Map();
  const edges = (s) => {
    let e = edgeCache.get(s);
    if (e) return e;
    e = [];
    const f = fileOf.get(s);
    for (const p of s.parts) {
      if (p.type !== 'Ref') continue;
      const t = resolveRef(merged, p, f);
      if (t === undefined) continue;
      for (const x of stringsIn(t)) {
        if (!fileOf.has(x.node)) fileOf.set(x.node, x.file);
        e.push(x.node);
      }
    }
    edgeCache.set(s, e);
    return e;
  };
  const reaches = (starts, target) => {
    const seen = new Set();
    const stack = [...starts];
    while (stack.length) {
      const n = stack.pop();
      if (n === target) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const m of edges(n)) stack.push(m);
    }
    return false;
  };

  // Loại của giá trị đã đánh giá: 'object' | 'array' | 'scalar'
  const kindOf = (mv, seen = new Set()) => {
    if (mv.kind === 'object') return 'object';
    const n = mv.node;
    if (n.type === 'Array') return 'array';
    if (n.type === 'String' && isPure(n)) {
      if (seen.has(n)) return 'scalar';
      seen.add(n);
      const t = resolveRef(merged, n.parts[0], mv.file);
      return t === undefined ? 'scalar' : kindOf(t, seen);
    }
    return 'scalar';
  };

  const errors = [];
  for (const f of order) {
    const errs = [];
    for (const { node: s, inConst } of perFile.get(f)) {
      for (const p of s.parts) {
        if (p.type !== 'Ref') continue;
        if (!p.const && inConst) {
          errs.push(err('SEM_CONST_CONFIG_REF', 'hằng không được tham chiếu cấu hình', f, p));
          continue;
        }
        const t = resolveRef(merged, p, f);
        if (t === undefined) {
          errs.push(err('SEM_UNDEFINED_REF', `tham chiếu không tồn tại: ${p.path.join('.')}`, f, p));
          continue;
        }
        if (reaches(stringsIn(t).map((x) => x.node), s)) {
          errs.push(err('SEM_REF_CYCLE', `tham chiếu vòng: ${p.path.join('.')}`, f, p));
          continue;
        }
        if (!isPure(s) && kindOf(t) !== 'scalar') {
          errs.push(err('SEM_BAD_INTERPOLATION', `không nội suy được mảng/đối tượng: ${p.path.join('.')}`, f, p));
        }
      }
    }
    errors.push(...errs.sort(byPos));
  }
  return { errors, merged };
}

// Pha C: kiểm lược đồ trên giá trị đã đánh giá của cấu hình hợp nhất (SPEC mục 5, 6).
// V = { kind: 'object'|'array'|'scalar', pos, value?, items?, defs? } — pos là vị trí báo lỗi.
function phaseC(program, merged, schema) {
  if (!schema) return [];
  const errors = [];
  const active = new Set();
  const posErr = (code, message, pos) => ({ code, message, file: pos.file, line: pos.line, column: pos.column });
  const nodePos = (node, file) => ({ file, line: node.line, column: node.column });

  function fromMV(mv, over) {
    if (mv.kind === 'object') {
      const defs = [...mv.entries].map(([key, e]) => ({ key, def: e.def, v: fromMV(e.value, over) }));
      return { kind: 'object', pos: over ?? sourcePos(mv), defs };
    }
    return fromNode(mv.node, mv.file, over);
  }

  function fromNode(node, file, over) {
    const pos = over ?? nodePos(node, file);
    switch (node.type) {
      case 'Number': case 'Bool': return { kind: 'scalar', pos, value: node.value };
      case 'Null': return { kind: 'scalar', pos, value: null };
      case 'Array': return { kind: 'array', pos, items: node.items.map((it) => fromNode(it, file, over)) };
      case 'String': {
        const parts = node.parts;
        if (parts.length === 0) return { kind: 'scalar', pos, value: '' };
        const own = over ?? nodePos(node, file);
        if (parts.length === 1 && parts[0].type === 'Ref') {
          const t = resolveRef(merged, parts[0], file);
          if (t === undefined || active.has(t)) return { kind: 'scalar', pos: own, value: null };
          active.add(t);
          try { return fromMV(t, own); } finally { active.delete(t); }
        }
        let str = '';
        for (const p of parts) {
          if (p.type === 'Text') { str += p.value; continue; }
          const t = resolveRef(merged, p, file);
          if (t === undefined || active.has(t)) { str += 'null'; continue; }
          active.add(t);
          try {
            const v = fromMV(t, own);
            str += v.kind === 'scalar' ? (typeof v.value === 'string' ? v.value : JSON.stringify(v.value)) : '';
          } finally { active.delete(t); }
        }
        return { kind: 'scalar', pos, value: str };
      }
      default: return { kind: 'scalar', pos, value: null };
    }
  }

  const typeOf = (v) => (v.kind !== 'scalar' ? v.kind : v.value === null ? 'null' : typeof v.value);
  const matches = (v, type) => {
    switch (type) {
      case 'integer': return v.kind === 'scalar' && Number.isInteger(v.value);
      case 'number': return v.kind === 'scalar' && typeof v.value === 'number';
      case 'string': return v.kind === 'scalar' && typeof v.value === 'string';
      case 'boolean': return v.kind === 'scalar' && typeof v.value === 'boolean';
      case 'null': return v.kind === 'scalar' && v.value === null;
      case 'array': return v.kind === 'array';
      case 'object': return v.kind === 'object';
      default: return true;
    }
  };

  function validate(v, spec) {
    if (!spec || typeof spec !== 'object') return;
    if (spec.type !== undefined && spec.type !== 'any' && !matches(v, spec.type)) {
      errors.push(posErr('SEM_TYPE_MISMATCH', `kiểu mong đợi ${spec.type}, nhận ${typeOf(v)}`, v.pos));
      return;
    }
    if (Array.isArray(spec.enum) && v.kind === 'scalar' && !spec.enum.includes(v.value)) {
      errors.push(posErr('SEM_NOT_IN_ENUM', `giá trị không thuộc enum: ${JSON.stringify(v.value)}`, v.pos));
      return;
    }
    if (v.kind === 'object' && spec.fields && typeof spec.fields === 'object') {
      const fields = spec.fields;
      const present = new Set(v.defs.map((d) => d.key));
      for (const k of Object.keys(fields)) {
        if (fields[k] && fields[k].required === true && !present.has(k)) {
          errors.push(posErr('SEM_MISSING_REQUIRED', `thiếu khóa bắt buộc: ${k}`, v.pos));
        }
      }
      for (const d of v.defs) {
        if (Object.hasOwn(fields, d.key)) validate(d.v, fields[d.key]);
        else if (spec.closed === true) {
          errors.push(posErr('SEM_UNKNOWN_KEY', `khóa không được phép: ${d.key}`, nodePos(d.def.node, d.def.file)));
        }
      }
    } else if (v.kind === 'array' && spec.items) {
      for (const it of v.items) validate(it, spec.items);
    }
  }

  validate(fromMV(merged.root), schema);
  return errors;
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const b = phaseB(program, a.order);
  if (b.errors.length) return b.errors;
  return phaseC(program, b.merged, schema);
}
