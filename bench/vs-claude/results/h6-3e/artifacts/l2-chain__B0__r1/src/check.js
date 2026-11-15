// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.
import { includesOf } from './parser.js';
import { buildModel, resolveRef, isPureRef, view } from './model.js';

const mk = (code, message, file, line, column) => ({ code, message, file, line, column });
const byPos = (a, b) => a.line - b.line || a.column - b.column;

export function check(program, schema) {
  const files = program.files;
  const order = [];
  const perFile = new Map();
  const visited = new Set();
  const onPath = new Set();

  // ---- Pha A ----
  const visit = (name) => {
    visited.add(name);
    onPath.add(name);
    order.push(name);
    const errs = [];
    perFile.set(name, errs);
    const ast = files[name];

    const dupKeys = (body) => {
      const seen = new Set();
      for (const s of body) {
        if (s.type === 'Assign' || s.type === 'Block') {
          if (seen.has(s.key)) errs.push(mk('SEM_DUPLICATE_KEY', `Trùng khóa: ${s.key}`, name, s.line, s.column));
          seen.add(s.key);
          if (s.type === 'Block') dupKeys(s.body);
        }
      }
    };
    dupKeys(ast.body);
    const seenConst = new Set();
    for (const s of ast.body) {
      if (s.type !== 'Const') continue;
      if (seenConst.has(s.name)) errs.push(mk('SEM_DUPLICATE_CONST', `Trùng hằng: ${s.name}`, name, s.line, s.column));
      seenConst.add(s.name);
    }

    for (const inc of includesOf(ast.body)) {
      if (!Object.hasOwn(files, inc.path)) {
        errs.push(mk('SEM_INCLUDE_NOT_FOUND', `Không thấy tệp: ${inc.path}`, name, inc.line, inc.column));
      } else if (onPath.has(inc.path)) {
        errs.push(mk('SEM_INCLUDE_CYCLE', `Vòng include: ${inc.path}`, name, inc.line, inc.column));
      } else if (!visited.has(inc.path)) {
        visit(inc.path);
      }
    }
    onPath.delete(name);
  };
  if (!Object.hasOwn(files, program.entry)) return [];
  visit(program.entry);

  const a = order.flatMap((f) => [...perFile.get(f)].sort(byPos));
  if (a.length) return a;

  // ---- Pha B ----
  const model = buildModel(program);
  const info = new Map(); // String AST -> { file, refs, edges }

  const strOf = (ast, out) => {
    if (ast.type === 'String') out.push(ast);
    else if (ast.type === 'Array') for (const it of ast.items) strOf(it, out);
    return out;
  };
  const stringsOf = (t) => {
    if (t.kind === 'leaf') return strOf(t.ast, []);
    const out = [];
    for (const e of t.entries.values()) out.push(...stringsOf(e.value));
    return out;
  };

  const walkValue = (v, file, inConst, out) => {
    if (v.type === 'String') out.push({ node: v, file, inConst });
    else if (v.type === 'Array') for (const it of v.items) walkValue(it, file, inConst, out);
  };
  const walkBody = (body, file, out) => {
    for (const s of body) {
      if (s.type === 'Assign') walkValue(s.value, file, false, out);
      else if (s.type === 'Const') walkValue(s.value, file, true, out);
      else if (s.type === 'Block') walkBody(s.body, file, out);
    }
  };
  const strings = [];
  for (const f of order) walkBody(files[f].body, f, strings);

  for (const { node, file, inConst } of strings) {
    const refs = [];
    for (const part of node.parts) {
      if (part.type !== 'Ref') continue;
      if (inConst && !part.const) {
        refs.push({ ref: part, status: 'CCR' });
        continue;
      }
      const target = resolveRef(model, part, file);
      refs.push(target ? { ref: part, status: 'OK', target } : { ref: part, status: 'UNDEF' });
    }
    info.set(node, { file, refs, edges: null });
  }
  const edgesOf = (s) => {
    const inf = info.get(s);
    if (!inf.edges) {
      const set = new Set();
      for (const r of inf.refs) if (r.status === 'OK') for (const x of stringsOf(r.target)) set.add(x);
      inf.edges = [...set];
    }
    return inf.edges;
  };
  const reaches = (start, goal) => {
    const seen = new Set();
    const stack = [...start];
    while (stack.length) {
      const n = stack.pop();
      if (n === goal) return true;
      if (seen.has(n) || !info.has(n)) continue;
      seen.add(n);
      stack.push(...edgesOf(n));
    }
    return false;
  };
  const evalKind = (t, seen) => {
    if (t.kind === 'obj') return 'object';
    if (t.ast.type === 'Array') return 'array';
    if (t.ast.type === 'String' && isPureRef(t.ast)) {
      if (seen.has(t.ast)) return 'scalar';
      seen.add(t.ast);
      const t2 = resolveRef(model, t.ast.parts[0], t.file);
      return t2 ? evalKind(t2, seen) : 'scalar';
    }
    return 'scalar';
  };

  const bErrs = new Map();
  for (const { node, file } of strings) {
    const inf = info.get(node);
    const pure = isPureRef(node);
    for (const r of inf.refs) {
      let code = null;
      if (r.status === 'CCR') code = 'SEM_CONST_CONFIG_REF';
      else if (r.status === 'UNDEF') code = 'SEM_UNDEFINED_REF';
      else if (reaches(stringsOf(r.target), node)) code = 'SEM_REF_CYCLE';
      else if (!pure && evalKind(r.target, new Set()) !== 'scalar') code = 'SEM_BAD_INTERPOLATION';
      if (code) {
        if (!bErrs.has(file)) bErrs.set(file, []);
        bErrs.get(file).push(mk(code, `Tham chiếu lỗi (${code})`, file, r.ref.line, r.ref.column));
      }
    }
  }
  const b = order.flatMap((f) => (bErrs.get(f) ?? []).sort(byPos));
  if (b.length) return b;

  // ---- Pha C ----
  if (!schema) return [];
  const errs = [];
  const err = (code, loc, message) => errs.push(mk(code, message, loc.file, loc.line, loc.column));
  const typeOk = (v, t) => (t === 'integer' ? v.type === 'number' && Number.isInteger(v.value) : v.type === t);

  const validate = (v, spec) => {
    if (!spec || typeof spec !== 'object') return;
    if (spec.type && spec.type !== 'any' && !typeOk(v, spec.type)) {
      err('SEM_TYPE_MISMATCH', v.loc, `Sai kiểu, cần ${spec.type}`);
      return;
    }
    if (Array.isArray(spec.enum) && v.type !== 'object' && v.type !== 'array') {
      if (!spec.enum.some((e) => e === v.value)) {
        err('SEM_NOT_IN_ENUM', v.loc, 'Giá trị ngoài enum');
        return;
      }
    }
    if (v.type === 'object' && spec.fields) {
      const have = new Set(v.keys.map((k) => k.key));
      for (const [k, s] of Object.entries(spec.fields)) {
        if (s && s.required === true && !have.has(k)) err('SEM_MISSING_REQUIRED', v.loc, `Thiếu khóa bắt buộc: ${k}`);
      }
      for (const k of v.keys) {
        if (Object.hasOwn(spec.fields, k.key)) validate(k.child(), spec.fields[k.key]);
        else if (spec.closed === true) err('SEM_UNKNOWN_KEY', k.keyLoc, `Khóa lạ: ${k.key}`);
      }
    }
    if (v.type === 'array' && spec.items) {
      for (const f of v.items) validate(f(), spec.items);
    }
  };
  validate(view(model, model.root), schema);
  return errs;
}
