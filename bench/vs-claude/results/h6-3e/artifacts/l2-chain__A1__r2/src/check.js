// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
import { buildModel, hasOwn, isPureRef } from './core.js';

const byPos = (a, b) => a.line - b.line || a.column - b.column;
const err = (code, message, file, line, column) => ({ code, message, file, line, column });

// ---------- Pha A ----------
function phaseA(program) {
  const files = program.files;
  const errors = [];
  const order = [];
  const visited = new Set();
  const stack = new Set();

  function visit(f) {
    visited.add(f);
    stack.add(f);
    order.push(f);
    const own = [];
    const includes = [];
    const constNames = new Set();
    const walk = (stmts) => {
      const keys = new Set();
      for (const st of stmts) {
        if (st.type === 'Assign' || st.type === 'Block') {
          if (keys.has(st.key)) own.push(err('SEM_DUPLICATE_KEY', `Khóa trùng: ${st.key}`, f, st.line, st.column));
          else keys.add(st.key);
          if (st.type === 'Block') walk(st.body);
        } else if (st.type === 'Const') {
          if (constNames.has(st.name)) own.push(err('SEM_DUPLICATE_CONST', `Hằng trùng: ${st.name}`, f, st.line, st.column));
          else constNames.add(st.name);
        } else if (st.type === 'Include') {
          includes.push(st);
        }
      }
    };
    walk(files[f].body);
    const descend = [];
    for (const inc of includes) {
      if (!hasOwn(files, inc.path)) {
        own.push(err('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp: ${inc.path}`, f, inc.line, inc.column));
      } else if (stack.has(inc.path)) {
        own.push(err('SEM_INCLUDE_CYCLE', `Vòng include: ${inc.path}`, f, inc.line, inc.column));
      } else descend.push(inc.path);
    }
    own.sort(byPos);
    errors.push(...own);
    for (const path of descend) if (!visited.has(path)) visit(path);
    stack.delete(f);
  }
  if (hasOwn(files, program.entry)) visit(program.entry);
  return { errors, order };
}

// ---------- Pha B ----------
function collectStrings(program, order) {
  const list = []; // { node, file, inConst }
  const fromNode = (node, file, inConst) => {
    if (node.type === 'String') list.push({ node, file, inConst });
    else if (node.type === 'Array') for (const it of node.items) fromNode(it, file, inConst);
  };
  for (const f of order) {
    const walk = (stmts) => {
      for (const st of stmts) {
        if (st.type === 'Assign') fromNode(st.value, f, false);
        else if (st.type === 'Const') fromNode(st.value, f, true);
        else if (st.type === 'Block') walk(st.body);
      }
    };
    walk(program.files[f].body);
  }
  return list;
}

function stringsInNode(node, out) {
  if (node.type === 'String') out.push(node);
  else if (node.type === 'Array') for (const it of node.items) stringsInNode(it, out);
  return out;
}

function stringsOfM(M, out = []) {
  if (M.t === 'obj') for (const e of M.entries.values()) stringsOfM(e.val, out);
  else stringsInNode(M.node, out);
  return out;
}

function phaseB(program, order, model) {
  const strings = collectStrings(program, order);
  const fileOf = new Map(strings.map((x) => [x.node, x.file]));

  const edgeMemo = new Map();
  const edges = (s) => {
    let e = edgeMemo.get(s);
    if (e) return e;
    e = [];
    for (const part of s.parts) {
      if (part.type !== 'Ref') continue;
      const t = model.resolve(part, fileOf.get(s));
      if (t) stringsOfM(t, e);
    }
    edgeMemo.set(s, e);
    return e;
  };

  const reaches = (starts, goal) => {
    const seen = new Set();
    const todo = [...starts];
    while (todo.length) {
      const x = todo.pop();
      if (x === goal) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      for (const y of edges(x)) todo.push(y);
    }
    return false;
  };

  // Loại giá trị đã đánh giá của đích: 'object' | 'array' | 'scalar' | null (chưa biết)
  const kindOf = (M, guard = new Set()) => {
    if (M.t === 'obj') return 'object';
    const node = M.node;
    if (node.type === 'Array') return 'array';
    if (node.type !== 'String') return 'scalar';
    if (!isPureRef(node)) return 'scalar';
    if (guard.has(node)) return null;
    guard.add(node);
    const t = model.resolve(node.parts[0], M.file);
    return t ? kindOf(t, guard) : null;
  };

  const errors = [];
  const perFile = new Map(order.map((f) => [f, []]));
  for (const { node, file, inConst } of strings) {
    const pure = isPureRef(node);
    for (const ref of node.parts) {
      if (ref.type !== 'Ref') continue;
      let e = null;
      const target = model.resolve(ref, file);
      if (!ref.const && inConst) {
        e = err('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình', file, ref.line, ref.column);
      } else if (!target) {
        e = err('SEM_UNDEFINED_REF', 'Tham chiếu không tồn tại', file, ref.line, ref.column);
      } else if (reaches(stringsOfM(target), node)) {
        e = err('SEM_REF_CYCLE', 'Vòng tham chiếu', file, ref.line, ref.column);
      } else if (!pure) {
        const k = kindOf(target);
        if (k === 'object' || k === 'array') {
          e = err('SEM_BAD_INTERPOLATION', 'Không thể nội suy mảng/đối tượng vào chuỗi', file, ref.line, ref.column);
        }
      }
      if (e) perFile.get(file).push(e);
    }
  }
  for (const f of order) {
    const l = perFile.get(f).sort(byPos);
    errors.push(...l);
  }
  return errors;
}

// ---------- Pha C ----------
function phaseC(program, schema, model) {
  const errors = [];
  const P = (pos) => ({ file: pos.file, line: pos.line, column: pos.column });

  // Dựng "khung nhìn" giá trị đã đánh giá cùng vị trí; ov = vị trí ghi đè (chuỗi thuần tham chiếu).
  function view(M, ov) {
    if (M.t === 'obj') {
      const pos = ov || { file: M.file, line: M.line, column: M.column };
      const keys = [];
      for (const [k, e] of M.entries) {
        keys.push({
          key: k,
          keyPos: ov || { file: e.file, line: e.stmt.line, column: e.stmt.column },
          child: () => view(e.val, ov),
        });
      }
      return { kind: 'object', pos, keys };
    }
    const node = M.node;
    const here = ov || { file: M.file, line: node.line, column: node.column };
    if (node.type === 'Array') {
      return {
        kind: 'array',
        pos: here,
        items: node.items.map((it) => () => view({ t: 'val', node: it, file: M.file }, ov)),
      };
    }
    if (node.type === 'String' && isPureRef(node)) {
      return view(model.resolve(node.parts[0], M.file), ov || here);
    }
    const value = model.evalM(M);
    const kind = value === null ? 'null' : typeof value;
    return { kind, pos: here, value };
  }

  const typeOk = (t, v) => {
    if (t === 'integer') return v.kind === 'number' && Number.isInteger(v.value);
    return v.kind === t;
  };

  function validate(v, spec) {
    if (spec.type && spec.type !== 'any' && !typeOk(spec.type, v)) {
      errors.push({ code: 'SEM_TYPE_MISMATCH', message: `Sai kiểu, cần ${spec.type}`, ...P(v.pos) });
      return;
    }
    const scalar = v.kind !== 'object' && v.kind !== 'array';
    if (spec.enum && scalar && !spec.enum.includes(v.value)) {
      errors.push({ code: 'SEM_NOT_IN_ENUM', message: 'Giá trị không thuộc enum', ...P(v.pos) });
      return;
    }
    if (v.kind === 'object' && spec.fields) {
      const present = new Set(v.keys.map((k) => k.key));
      for (const k of Object.keys(spec.fields)) {
        if (spec.fields[k] && spec.fields[k].required === true && !present.has(k)) {
          errors.push({ code: 'SEM_MISSING_REQUIRED', message: `Thiếu khóa bắt buộc: ${k}`, ...P(v.pos) });
        }
      }
      for (const k of v.keys) {
        if (hasOwn(spec.fields, k.key)) validate(k.child(), spec.fields[k.key]);
        else if (spec.closed === true) {
          errors.push({ code: 'SEM_UNKNOWN_KEY', message: `Khóa không có trong lược đồ: ${k.key}`, ...P(k.keyPos) });
        }
      }
    }
    if (v.kind === 'array' && spec.items) {
      for (const it of v.items) validate(it(), spec.items);
    }
  }

  validate(view(model.root, null), schema);
  return errors;
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.errors.length) return a.errors;
  const model = buildModel(program);
  const b = phaseB(program, a.order, model);
  if (b.length) return b;
  if (schema) return phaseC(program, schema, model);
  return [];
}
