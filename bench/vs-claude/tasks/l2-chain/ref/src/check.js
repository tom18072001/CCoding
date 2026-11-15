import { includesOf } from './parser.js';
import { buildModel } from './core.js';

const mk = (code, message, file, line, column) => ({ code, message, file, line, column });
const byPos = (a, b) => a.line - b.line || a.column - b.column;

function phaseA(program) {
  const perFile = new Map();
  const visited = new Set();
  const order = [];
  const dupBody = (body, file, errs) => {
    const seen = new Set();
    for (const s of body) {
      if (s.type === 'Assign' || s.type === 'Block') {
        if (seen.has(s.key)) errs.push(mk('SEM_DUPLICATE_KEY', `Khóa trùng: ${s.key}`, file, s.line, s.column));
        seen.add(s.key);
        if (s.type === 'Block') dupBody(s.body, file, errs);
      }
    }
  };
  const visit = (name, stack) => {
    visited.add(name);
    order.push(name);
    const errs = [];
    perFile.set(name, errs);
    const ast = program.files[name];
    dupBody(ast.body, name, errs);
    const consts = new Set();
    for (const s of ast.body) {
      if (s.type !== 'Const') continue;
      if (consts.has(s.name)) errs.push(mk('SEM_DUPLICATE_CONST', `Hằng trùng: ${s.name}`, name, s.line, s.column));
      consts.add(s.name);
    }
    for (const inc of includesOf(ast.body)) {
      if (!Object.hasOwn(program.files, inc.path)) errs.push(mk('SEM_INCLUDE_NOT_FOUND', `Không tìm thấy tệp: ${inc.path}`, name, inc.line, inc.column));
      else if (stack.includes(inc.path)) errs.push(mk('SEM_INCLUDE_CYCLE', `Vòng include: ${inc.path}`, name, inc.line, inc.column));
      else if (!visited.has(inc.path)) visit(inc.path, [...stack, inc.path]);
    }
  };
  visit(program.entry, [program.entry]);
  return order.flatMap((f) => perFile.get(f).sort(byPos));
}

function phaseB(program, m) {
  const items = [];
  const constNodes = new Set();
  const walkVal = (node, file, isConst) => {
    if (node.type === 'String') {
      items.push({ node, file });
      if (isConst) constNodes.add(node);
    } else if (node.type === 'Array') for (const it of node.items) walkVal(it, file, isConst);
  };
  const walk = (body, file) => {
    for (const s of body) {
      if (s.type === 'Assign') walkVal(s.value, file, false);
      else if (s.type === 'Const') walkVal(s.value, file, true);
      else if (s.type === 'Block') walk(s.body, file);
    }
  };
  for (const f of m.order) walk(program.files[f].body, f);

  const info = new Map();
  for (const { node, file } of items) {
    const refs = node.parts.filter((p) => p.type === 'Ref').map((ref) => {
      if (!ref.const && constNodes.has(node)) return { ref, status: 'constconfig', strings: [] };
      const t = m.resolve(ref, file);
      return t ? { ref, status: 'ok', target: t, strings: m.stringsOfEntry(t) } : { ref, status: 'undef', strings: [] };
    });
    info.set(node, { file, refs });
  }
  const reaches = (starts, goal) => {
    const seen = new Set();
    const stack = [...starts];
    while (stack.length) {
      const n = stack.pop();
      if (n === goal) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      const inf = info.get(n);
      if (inf) for (const r of inf.refs) stack.push(...r.strings);
    }
    return false;
  };
  const perFile = new Map(m.order.map((f) => [f, []]));
  for (const [node, inf] of info) {
    const pure = node.parts.length === 1;
    for (const r of inf.refs) {
      const ref = r.ref;
      let e = null;
      if (r.status === 'constconfig') e = mk('SEM_CONST_CONFIG_REF', 'Hằng không được tham chiếu cấu hình', inf.file, ref.line, ref.column);
      else if (r.status === 'undef') e = mk('SEM_UNDEFINED_REF', `Tham chiếu không tồn tại: ${ref.path.join('.')}`, inf.file, ref.line, ref.column);
      else if (reaches(r.strings, node)) e = mk('SEM_REF_CYCLE', 'Tham chiếu vòng', inf.file, ref.line, ref.column);
      else if (!pure) {
        let v = 0;
        try { v = m.evalEntry(r.target, new Set()); } catch (x) { if (x !== m.UNRESOLVED) throw x; }
        if (v !== null && typeof v === 'object') e = mk('SEM_BAD_INTERPOLATION', 'Nội suy giữa chuỗi phải là giá trị vô hướng', inf.file, ref.line, ref.column);
      }
      if (e) perFile.get(inf.file).push(e);
    }
  }
  return m.order.flatMap((f) => perFile.get(f).sort(byPos));
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function fromJson(v, pos) {
  if (Array.isArray(v)) return { type: 'array', pos, keyPos: pos, children: v.map((x) => fromJson(x, pos)) };
  if (v !== null && typeof v === 'object') {
    return { type: 'object', pos, keyPos: pos, children: new Map(Object.entries(v).map(([k, x]) => [k, fromJson(x, pos)])) };
  }
  return { type: typeOf(v), pos, keyPos: pos, value: v };
}

function typed(m, e) {
  if (e.kind === 'object') {
    return { type: 'object', pos: e.pos, keyPos: e.keyPos, children: new Map([...e.map].map(([k, v]) => [k, typed(m, v)])) };
  }
  const n = e.node;
  const pos = m.pos(e.file, n);
  if (n.type === 'Array') {
    return { type: 'array', pos, keyPos: e.keyPos, children: n.items.map((it) => typed(m, { kind: 'node', node: it, file: e.file, keyPos: m.pos(e.file, it) })) };
  }
  if (n.type === 'String') {
    const t = fromJson(m.evalNode(n, e.file, new Set()), pos);
    t.keyPos = e.keyPos;
    return t;
  }
  const value = n.type === 'Null' ? null : n.value;
  return { type: typeOf(value), pos, keyPos: e.keyPos, value };
}

function phaseC(m, schema) {
  const errs = [];
  const at = (code, message, p) => errs.push(mk(code, message, p.file, p.line, p.column));
  const matches = (want, t) => want === 'any' || want === t.type || (want === 'integer' && t.type === 'number' && Number.isInteger(t.value));
  const walk = (t, spec) => {
    if (spec.type && !matches(spec.type, t)) { at('SEM_TYPE_MISMATCH', `Cần ${spec.type}, gặp ${t.type}`, t.pos); return; }
    if (spec.enum && t.children === undefined && !spec.enum.includes(t.value)) { at('SEM_NOT_IN_ENUM', 'Giá trị ngoài danh sách cho phép', t.pos); return; }
    if (t.type === 'object' && spec.fields) {
      for (const [k, fs] of Object.entries(spec.fields)) if (fs.required && !t.children.has(k)) at('SEM_MISSING_REQUIRED', `Thiếu khóa bắt buộc: ${k}`, t.pos);
      for (const [k, c] of t.children) {
        if (Object.hasOwn(spec.fields, k)) walk(c, spec.fields[k]);
        else if (spec.closed) at('SEM_UNKNOWN_KEY', `Khóa không có trong lược đồ: ${k}`, c.keyPos);
      }
    }
    if (t.type === 'array' && spec.items) for (const c of t.children) walk(c, spec.items);
  };
  walk(typed(m, m.root), schema);
  return errs;
}

export function check(program, schema) {
  const a = phaseA(program);
  if (a.length) return a;
  const m = buildModel(program);
  const b = phaseB(program, m);
  if (b.length) return b;
  return schema ? phaseC(m, schema) : [];
}
