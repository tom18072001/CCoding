// Nội bộ (KHÔNG export qua index.js): hợp nhất + phân giải dùng chung cho check (tầng 2) và evaluate (tầng 3).
// SPEC.md mục 6. Mọi vị trí là { file, line, column }.
//
// API nội bộ
//   visitOrder(program) -> string[]
//       Tên tệp tới được từ entry, tiền thứ tự theo include, mỗi tệp một lần (bỏ qua include thiếu/đang trên đường duyệt).
//   buildModel(program) -> model
//       Hợp nhất theo 6.1. model = { program, root }. Nút của model:
//         đối tượng: { kind:'obj', origin:pos(Block khởi tạo; gốc = entry 1:1), keys: Map<khóa, {def:{node,file}, value}> }
//           - Map giữ thứ tự xuất hiện lần đầu (6.2). def = Assign/Block CUỐI CÙNG chạm tới khóa (định nghĩa thắng;
//             khối trộn vào đối tượng có sẵn cũng cập nhật def).
//         giá trị:   { kind:'val', ast:<nút Value>, file }  (vô hướng, chuỗi, mảng — nguyên AST, chưa đánh giá)
//   listRefs(program) -> [{ file, string:<nút String>, ref:<Part Ref>, inConst, pure }]
//       Mọi Ref của mọi chuỗi (kể cả trong mảng, const, chuỗi bị ghi đè) theo tệp (visitOrder) rồi thứ tự tài liệu.
//       pure = chuỗi chỉ gồm đúng một Ref.
//   resolveRef(model, file, ref) -> { found:false } | { found:true, target }
//       target là nút model (obj hoặc val). Ref hằng lấy const của tệp `file`. Không đi xuyên chuỗi.
//   stringsOf(target) -> [{ node:<String>, file }]
//       S(đích) (mục 5): chỉ định nghĩa thắng. Định danh chuỗi = chính nút AST `node`.
//   evalTree(model) / evalTarget(model, target, ov?) -> cây có nguồn (cho pha C):
//         { kind:'scalar', value, pos } | { kind:'array', items:[cây], pos }
//         | { kind:'object', pos, entries:[{ key, pos:<vị trí khóa thắng>, node:cây }] }  (đúng thứ tự khóa 6.2)
//       Vị trí: Assign → nút giá trị; phần tử mảng → phần tử; đối tượng → Block khởi tạo;
//       chuỗi thuần tham chiếu "${x}" → vị trí CHUỖI đó cho giá trị và mọi thứ bên trong (kể cả vị trí khóa).
//   toValue(tree) -> JSON thuần mới (không chia sẻ tham chiếu).
// Đánh giá ném Error{code:'EVAL_UNRESOLVED'|'EVAL_CYCLE'|'EVAL_BAD_INTERPOLATION'} nếu chương trình chưa qua check.

const INDEX = /^(0|[1-9][0-9]*)$/;
const fail = (code, msg) => Object.assign(new Error(msg), { code });
const posOf = (node, file) => ({ file, line: node.line, column: node.column });

export function visitOrder(program) {
  const seen = new Set();
  const out = [];
  const go = (file) => {
    if (seen.has(file) || !Object.hasOwn(program.files, file)) return;
    seen.add(file);
    out.push(file);
    walkIncludes(program.files[file].body, go);
  };
  go(program.entry);
  return out;
}

function walkIncludes(body, go) {
  for (const s of body) {
    if (s.type === 'Include') go(s.path);
    else if (s.type === 'Block') walkIncludes(s.body, go);
  }
}

export function buildModel(program) {
  const newObj = (origin) => ({ kind: 'obj', origin, keys: new Map() });
  const root = newObj({ file: program.entry, line: 1, column: 1 });
  const merge = (obj, body, file, stack) => {
    for (const s of body) {
      if (s.type === 'Assign') {
        // Map.set giữ vị trí khóa cũ khi ghi đè
        obj.keys.set(s.key, { def: { node: s, file }, value: { kind: 'val', ast: s.value, file } });
      } else if (s.type === 'Block') {
        const cur = obj.keys.get(s.key);
        if (cur && cur.value.kind === 'obj') {
          cur.def = { node: s, file };
          merge(cur.value, s.body, file, stack);
        } else {
          const child = newObj(posOf(s, file));
          obj.keys.set(s.key, { def: { node: s, file }, value: child });
          merge(child, s.body, file, stack);
        }
      } else if (s.type === 'Include') {
        if (!Object.hasOwn(program.files, s.path) || stack.includes(s.path)) continue;
        merge(obj, program.files[s.path].body, s.path, [...stack, s.path]);
      }
    }
  };
  merge(root, program.files[program.entry].body, program.entry, [program.entry]);
  return { program, root };
}

export function listRefs(program) {
  const res = [];
  const fromValue = (v, file, inConst) => {
    if (v.type === 'Array') { for (const i of v.items) fromValue(i, file, inConst); return; }
    if (v.type !== 'String') return;
    const pure = v.parts.length === 1 && v.parts[0].type === 'Ref';
    for (const p of v.parts) if (p.type === 'Ref') res.push({ file, string: v, ref: p, inConst, pure });
  };
  const fromBody = (body, file) => {
    for (const s of body) {
      if (s.type === 'Assign') fromValue(s.value, file, false);
      else if (s.type === 'Const') fromValue(s.value, file, true);
      else if (s.type === 'Block') fromBody(s.body, file);
    }
  };
  for (const f of visitOrder(program)) fromBody(program.files[f].body, f);
  return res;
}

export function resolveRef(model, file, ref) {
  const path = ref.path;
  let cur;
  let i = 0;
  if (ref.const) {
    const body = model.program.files[file]?.body ?? [];
    const c = body.find((s) => s.type === 'Const' && s.name === path[0]);
    if (!c) return { found: false };
    cur = { kind: 'val', ast: c.value, file };
    i = 1;
  } else cur = model.root;
  for (; i < path.length; i++) {
    const seg = path[i];
    if (cur.kind === 'obj') {
      const e = cur.keys.get(seg);
      if (!e) return { found: false };
      cur = e.value;
    } else if (cur.ast.type === 'Array') {
      if (!INDEX.test(seg) || Number(seg) >= cur.ast.items.length) return { found: false };
      cur = { kind: 'val', ast: cur.ast.items[Number(seg)], file: cur.file };
    } else return { found: false };
  }
  return { found: true, target: cur };
}

export function stringsOf(target) {
  const out = [];
  const val = (ast, file) => {
    if (ast.type === 'String') out.push({ node: ast, file });
    else if (ast.type === 'Array') for (const it of ast.items) val(it, file);
  };
  const go = (n) => {
    if (n.kind === 'val') val(n.ast, n.file);
    else for (const e of n.keys.values()) go(e.value);
  };
  go(target);
  return out;
}

export function evalTarget(model, target, ov = null, stack = []) {
  const lookup = (file, ref) => {
    const r = resolveRef(model, file, ref);
    if (!r.found) throw fail('EVAL_UNRESOLVED', `tham chiếu không phân giải được: ${ref.path.join('.')}`);
    return r.target;
  };
  const evalVal = (ast, file, ov) => {
    const pos = ov || posOf(ast, file);
    switch (ast.type) {
      case 'Number': case 'Bool': return { kind: 'scalar', value: ast.value, pos };
      case 'Null': return { kind: 'scalar', value: null, pos };
      case 'Array': return { kind: 'array', pos, items: ast.items.map((i) => evalVal(i, file, ov)) };
      case 'String': return evalString(ast, file, ov, pos);
      default: throw fail('EVAL_UNRESOLVED', `nút không hợp lệ: ${ast.type}`);
    }
  };
  const evalNode = (n, ov) => {
    if (n.kind === 'val') return evalVal(n.ast, n.file, ov);
    return {
      kind: 'object',
      pos: ov || n.origin,
      entries: [...n.keys].map(([key, e]) => ({
        key, pos: ov || posOf(e.def.node, e.def.file), node: evalNode(e.value, ov),
      })),
    };
  };
  const evalString = (ast, file, ov, pos) => {
    if (stack.includes(ast)) throw fail('EVAL_CYCLE', 'vòng tham chiếu');
    stack.push(ast);
    try {
      if (ast.parts.length === 0) return { kind: 'scalar', value: '', pos };
      if (ast.parts.length === 1 && ast.parts[0].type === 'Ref') {
        return evalNode(lookup(file, ast.parts[0]), ov || pos);
      }
      let s = '';
      for (const p of ast.parts) {
        if (p.type === 'Text') { s += p.value; continue; }
        const t = evalNode(lookup(file, p), null);
        if (t.kind !== 'scalar') throw fail('EVAL_BAD_INTERPOLATION', 'nội suy mảng/đối tượng');
        s += typeof t.value === 'string' ? t.value : JSON.stringify(t.value);
      }
      return { kind: 'scalar', value: s, pos };
    } finally { stack.pop(); }
  };
  return evalNode(target, ov);
}

export function evalTree(model) {
  return evalTarget(model, model.root, null, []);
}

export function toValue(tree) {
  if (tree.kind === 'scalar') return tree.value;
  if (tree.kind === 'array') return tree.items.map(toValue);
  const o = {};
  for (const e of tree.entries) {
    Object.defineProperty(o, e.key, { value: toValue(e.node), enumerable: true, writable: true, configurable: true });
  }
  return o;
}
