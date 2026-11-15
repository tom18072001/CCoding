// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.

import { collectIncludes } from './parser.js';
import { buildModel, isPureRef } from './model.js';

const err = (code, message, file, line, column) => ({ code, message, file, line, column });
const byPos = (a, b) => a.line - b.line || a.column - b.column;

// Thứ tự thăm tệp: tiền thứ tự theo include, mỗi tệp một lần.
function visitOrder(program) {
  const order = [];
  const seen = new Set();
  const go = (name) => {
    seen.add(name);
    order.push(name);
    for (const inc of collectIncludes(program.files[name].body)) {
      if (Object.hasOwn(program.files, inc.path) && !seen.has(inc.path)) go(inc.path);
    }
  };
  if (Object.hasOwn(program.files, program.entry)) go(program.entry);
  return order;
}

function phaseA(program) {
  const { files } = program;
  const perFile = new Map();
  const order = [];
  const stack = [];
  const go = (name) => {
    const errors = [];
    perFile.set(name, errors);
    order.push(name);
    stack.push(name);
    const ast = files[name];

    const checkBody = (body) => {
      const keys = new Set();
      for (const s of body) {
        if (s.type === 'Assign' || s.type === 'Block') {
          if (keys.has(s.key)) errors.push(err('SEM_DUPLICATE_KEY', `Khóa trùng: ${s.key}`, name, s.line, s.column));
          keys.add(s.key);
          if (s.type === 'Block') checkBody(s.body);
        }
      }
    };
    checkBody(ast.body);

    const consts = new Set();
    for (const s of ast.body) {
      if (s.type !== 'Const') continue;
      if (consts.has(s.name)) errors.push(err('SEM_DUPLICATE_CONST', `Hằng trùng: ${s.name}`, name, s.line, s.column));
      consts.add(s.name);
    }

    const pending = [];
    for (const inc of collectIncludes(ast.body)) {
      if (!Object.hasOwn(files, inc.path)) {
        errors.push(err('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp: ${inc.path}`, name, inc.line, inc.column));
      } else if (stack.includes(inc.path)) {
        errors.push(err('SEM_INCLUDE_CYCLE', `Include vòng: ${inc.path}`, name, inc.line, inc.column));
      } else {
        pending.push(inc.path);
      }
    }
    for (const p of pending) if (!perFile.has(p)) go(p);
    stack.pop();
  };
  if (Object.hasOwn(files, program.entry)) go(program.entry);
  const out = [];
  for (const name of order) out.push(...perFile.get(name).sort(byPos));
  return out;
}

function collectStrings(node, out = []) {
  if (node.type === 'String') out.push(node);
  else if (node.type === 'Array') for (const x of node.items) collectStrings(x, out);
  return out;
}

function phaseB(program, model, order) {
  const { resolve } = model;
  const fileOf = new Map();
  const perFile = new Map();
  const strings = new Map(); // tệp -> [{ node, inConst }]
  for (const name of order) {
    const list = [];
    strings.set(name, list);
    const walk = (body) => {
      for (const s of body) {
        if (s.type === 'Block') walk(s.body);
        else if (s.type === 'Assign' || s.type === 'Const') {
          for (const str of collectStrings(s.value)) {
            list.push({ node: str, inConst: s.type === 'Const' });
            fileOf.set(str, name);
          }
        }
      }
    };
    walk(program.files[name].body);
  }

  // S(đích): mọi nút String nằm trong đích (chỉ định nghĩa thắng).
  const stringsIn = (t, out = []) => {
    if (t.kind === 'obj') for (const v of t.keys.values()) stringsIn(v, out);
    else collectStrings(t.node, out);
    return out;
  };

  const edgeMemo = new Map();
  const edges = (s) => {
    if (edgeMemo.has(s)) return edgeMemo.get(s);
    const res = [];
    for (const p of s.parts) {
      if (p.type !== 'Ref') continue;
      const t = resolve(p, fileOf.get(s));
      if (t) res.push(...stringsIn(t));
    }
    edgeMemo.set(s, res);
    return res;
  };
  const inCycle = (s, target) => {
    const seen = new Set();
    const todo = stringsIn(target);
    while (todo.length) {
      const x = todo.pop();
      if (x === s) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      todo.push(...edges(x));
    }
    return false;
  };

  // Loại giá trị đã đánh giá của đích: 'array' | 'object' | 'scalar'.
  const kindOf = (t, guard = new Set()) => {
    if (t.kind === 'obj') return 'object';
    if (t.node.type === 'Array') return 'array';
    if (isPureRef(t.node) && !guard.has(t.node)) {
      guard.add(t.node);
      const next = resolve(t.node.parts[0], t.file);
      return next ? kindOf(next, guard) : 'scalar';
    }
    return 'scalar';
  };

  for (const name of order) {
    const errors = [];
    for (const { node, inConst } of strings.get(name)) {
      const pure = isPureRef(node);
      for (const p of node.parts) {
        if (p.type !== 'Ref') continue;
        const e = (code, msg) => errors.push(err(code, msg, name, p.line, p.column));
        if (inConst && !p.const) { e('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình'); continue; }
        const t = resolve(p, name);
        if (!t) { e('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${p.path.join('.')}`); continue; }
        if (inCycle(node, t)) { e('SEM_REF_CYCLE', 'Tham chiếu vòng'); continue; }
        if (!pure && kindOf(t) !== 'scalar') e('SEM_BAD_INTERPOLATION', 'Không nội suy mảng/đối tượng vào chuỗi');
      }
    }
    perFile.set(name, errors.sort(byPos));
  }
  return order.flatMap((n) => perFile.get(n));
}

function phaseC(program, model, schema) {
  const { resolve, evalTarget } = model;
  const errors = [];
  const typeOk = (type, kind, value) => {
    switch (type) {
      case 'string': return kind === 'string';
      case 'number': return kind === 'number';
      case 'integer': return kind === 'number' && Number.isInteger(value);
      case 'boolean': return kind === 'boolean';
      case 'null': return kind === 'null';
      case 'array': return kind === 'array';
      case 'object': return kind === 'object';
      default: return true;
    }
  };

  const walk = (t, spec, ovr) => {
    // đi theo các chuỗi thuần tham chiếu tới giá trị thật
    while (t.kind === 'val' && t.node.type === 'String' && t.node.parts.length === 1 && t.node.parts[0].type === 'Ref') {
      ovr = ovr ?? { file: t.file, line: t.node.line, column: t.node.column };
      t = resolve(t.node.parts[0], t.file);
    }
    const pos = ovr ?? (t.kind === 'obj' ? t.pos : { file: t.file, line: t.node.line, column: t.node.column });
    const push = (code, msg, at = pos) => errors.push(err(code, msg, at.file, at.line, at.column));

    let kind;
    let value;
    if (t.kind === 'obj') kind = 'object';
    else if (t.node.type === 'Array') kind = 'array';
    else {
      value = evalTarget(t);
      kind = value === null ? 'null' : typeof value;
    }

    if (spec.type && spec.type !== 'any' && !typeOk(spec.type, kind, value)) {
      push('SEM_TYPE_MISMATCH', `Sai kiểu, cần ${spec.type}`);
      return;
    }
    if (spec.enum && kind !== 'object' && kind !== 'array') {
      if (!spec.enum.some((e) => e === value)) {
        push('SEM_NOT_IN_ENUM', 'Giá trị không thuộc enum');
        return;
      }
    }
    if (kind === 'object' && spec.fields) {
      for (const [k, sub] of Object.entries(spec.fields)) {
        if (sub && sub.required === true && !t.keys.has(k)) push('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc: ${k}`);
      }
      for (const [k, child] of t.keys) {
        if (Object.hasOwn(spec.fields, k)) walk(child, spec.fields[k], ovr);
        else if (spec.closed === true) push('SEM_UNKNOWN_KEY', `Khóa không được phép: ${k}`, child.keyPos);
      }
    }
    if (kind === 'array' && spec.items) {
      for (const item of t.node.items) walk({ kind: 'val', node: item, file: t.file }, spec.items, ovr);
    }
  };
  walk(model.root, schema, null);
  return errors;
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.length > 0) return a;
  const model = buildModel(program);
  const b = phaseB(program, model, visitOrder(program));
  if (b.length > 0) return b;
  if (!schema) return [];
  return phaseC(program, model, schema);
}
