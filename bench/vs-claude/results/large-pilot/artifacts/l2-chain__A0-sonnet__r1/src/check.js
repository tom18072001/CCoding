// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.

import { createModel } from './model.js';

const mkErr = (code, message, file, line, column) => ({ code, message, file, line, column });
const byPos = (a, b) => a.line - b.line || a.column - b.column;
const isPureRef = (node) => node.parts.length === 1 && node.parts[0].type === 'Ref';

export function check(program, schema) {
  // ---------- Pha A: cấu trúc theo từng tệp ----------
  const order = [];
  const perFile = new Map();
  const state = new Map(); // 1 = đang trên đường duyệt, 2 = xong

  const visit = (name) => {
    state.set(name, 1);
    order.push(name);
    const errs = [];
    perFile.set(name, errs);
    const ast = program.files[name];
    const consts = new Set();

    const walk = (body) => {
      const keys = new Set();
      for (const st of body) {
        if (st.type === 'Assign' || st.type === 'Block') {
          if (keys.has(st.key)) {
            errs.push(mkErr('SEM_DUPLICATE_KEY', `Khóa trùng: ${st.key}`, name, st.line, st.column));
          }
          keys.add(st.key);
          if (st.type === 'Block') walk(st.body);
        } else if (st.type === 'Const') {
          if (consts.has(st.name)) {
            errs.push(mkErr('SEM_DUPLICATE_CONST', `Hằng trùng: ${st.name}`, name, st.line, st.column));
          }
          consts.add(st.name);
        } else if (st.type === 'Include') {
          if (!Object.hasOwn(program.files, st.path)) {
            errs.push(mkErr('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp: ${st.path}`, name, st.line, st.column));
          } else if (state.get(st.path) === 1) {
            errs.push(mkErr('SEM_INCLUDE_CYCLE', `Vòng include: ${st.path}`, name, st.line, st.column));
          } else if (!state.has(st.path)) {
            visit(st.path);
          }
        }
      }
    };
    walk(ast.body);
    state.set(name, 2);
  };
  visit(program.entry);

  const phaseA = order.flatMap((f) => perFile.get(f).sort(byPos));
  if (phaseA.length) return phaseA;

  const model = createModel(program);
  const { resolveRef } = model;

  // ---------- Pha B: tham chiếu ----------
  const strings = []; // { node, file, inConst }
  const fileOf = new Map();
  for (const file of order) {
    const addValue = (v, inConst) => {
      if (v.type === 'String') {
        strings.push({ node: v, file, inConst });
        fileOf.set(v, file);
      } else if (v.type === 'Array') {
        for (const it of v.items) addValue(it, inConst);
      }
    };
    const walk = (body) => {
      for (const st of body) {
        if (st.type === 'Assign') addValue(st.value, false);
        else if (st.type === 'Const') addValue(st.value, true);
        else if (st.type === 'Block') walk(st.body);
      }
    };
    walk(program.files[file].body);
  }

  // tập nút String nằm trong đích
  const stringsIn = (t, out = []) => {
    if (t.k === 'obj') {
      for (const e of t.map.values()) stringsIn(e.v, out);
    } else if (t.node.type === 'String') {
      out.push(t.node);
    } else if (t.node.type === 'Array') {
      for (const it of t.node.items) stringsIn({ k: 'node', node: it, file: t.file }, out);
    }
    return out;
  };

  const edgeCache = new Map();
  const edges = (s) => {
    let e = edgeCache.get(s);
    if (!e) {
      e = [];
      for (const p of s.parts) {
        if (p.type !== 'Ref') continue;
        const t = resolveRef(p, fileOf.get(s));
        if (t) stringsIn(t, e);
      }
      edgeCache.set(s, e);
    }
    return e;
  };

  const reaches = (starts, goal) => {
    const seen = new Set(starts);
    const stack = [...starts];
    while (stack.length) {
      const cur = stack.pop();
      if (cur === goal) return true;
      for (const nx of edges(cur)) {
        if (!seen.has(nx)) { seen.add(nx); stack.push(nx); }
      }
    }
    return false;
  };

  const kindOf = (t, seen = new Set()) => {
    if (t.k === 'obj') return 'object';
    const n = t.node;
    if (n.type === 'Array') return 'array';
    if (n.type === 'String' && isPureRef(n)) {
      if (seen.has(n)) return 'scalar';
      seen.add(n);
      const t2 = resolveRef(n.parts[0], t.file);
      return t2 ? kindOf(t2, seen) : 'scalar';
    }
    return 'scalar';
  };

  const refErrors = new Map(order.map((f) => [f, []]));
  for (const { node, file, inConst } of strings) {
    const pure = isPureRef(node);
    for (const r of node.parts) {
      if (r.type !== 'Ref') continue;
      const at = (code, msg) => refErrors.get(file).push(mkErr(code, msg, file, r.line, r.column));
      if (inConst && !r.const) {
        at('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình');
        continue;
      }
      const target = resolveRef(r, file);
      if (!target) {
        at('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${r.path.join('.')}`);
        continue;
      }
      if (reaches(stringsIn(target), node)) {
        at('SEM_REF_CYCLE', `Vòng tham chiếu: ${r.path.join('.')}`);
        continue;
      }
      if (!pure && kindOf(target) !== 'scalar') {
        at('SEM_BAD_INTERPOLATION', `Không thể nội suy mảng/đối tượng: ${r.path.join('.')}`);
      }
    }
  }
  const phaseB = order.flatMap((f) => refErrors.get(f).sort(byPos));
  if (phaseB.length) return phaseB;

  // ---------- Pha C: lược đồ ----------
  if (schema === undefined || schema === null) return [];
  const errors = [];

  // view: { kind: 'object'|'array'|'scalar', pos, ... } — `over` là vị trí ghi đè (chuỗi thuần tham chiếu)
  const view = (t, over) => {
    if (t.k === 'obj') {
      return {
        kind: 'object',
        pos: over ?? t.pos,
        entries: [...t.map].map(([key, e]) => ({ key, kpos: over ?? e.kpos, child: e.v })),
        over,
      };
    }
    const n = t.node;
    const pos = over ?? { file: t.file, line: n.line, column: n.column };
    if (n.type === 'Array') {
      return { kind: 'array', pos, items: n.items.map((it) => ({ k: 'node', node: it, file: t.file })), over };
    }
    if (n.type === 'String' && isPureRef(n)) {
      return view(resolveRef(n.parts[0], t.file), pos);
    }
    return { kind: 'scalar', pos, value: model.evalValue(t) };
  };

  const typeOk = (type, vw) => {
    switch (type) {
      case 'object': return vw.kind === 'object';
      case 'array': return vw.kind === 'array';
      case 'string': return vw.kind === 'scalar' && typeof vw.value === 'string';
      case 'number': return vw.kind === 'scalar' && typeof vw.value === 'number';
      case 'integer': return vw.kind === 'scalar' && Number.isInteger(vw.value);
      case 'boolean': return vw.kind === 'scalar' && typeof vw.value === 'boolean';
      case 'null': return vw.kind === 'scalar' && vw.value === null;
      default: return true;
    }
  };

  const validate = (spec, t, over) => {
    const vw = view(t, over);
    const err = (code, msg, pos) => errors.push(mkErr(code, msg, pos.file, pos.line, pos.column));
    if (spec.type !== undefined && spec.type !== 'any' && !typeOk(spec.type, vw)) {
      err('SEM_TYPE_MISMATCH', `Sai kiểu, cần ${spec.type}`, vw.pos);
      return;
    }
    if (spec.enum !== undefined && vw.kind === 'scalar' && !spec.enum.includes(vw.value)) {
      err('SEM_NOT_IN_ENUM', 'Giá trị không thuộc enum', vw.pos);
      return;
    }
    if (vw.kind === 'object' && spec.fields) {
      const fields = spec.fields;
      for (const k of Object.keys(fields)) {
        if (fields[k] && fields[k].required === true && !vw.entries.some((e) => e.key === k)) {
          err('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc: ${k}`, vw.pos);
        }
      }
      for (const e of vw.entries) {
        if (Object.hasOwn(fields, e.key)) validate(fields[e.key], e.child, vw.over);
        else if (spec.closed === true) err('SEM_UNKNOWN_KEY', `Khóa không được phép: ${e.key}`, e.kpos);
      }
    } else if (vw.kind === 'object' && spec.closed === true) {
      for (const e of vw.entries) err('SEM_UNKNOWN_KEY', `Khóa không được phép: ${e.key}`, e.kpos);
    }
    if (vw.kind === 'array' && spec.items) {
      for (const it of vw.items) validate(spec.items, it, vw.over);
    }
  };
  validate(schema, model.root, undefined);
  return errors;
}
