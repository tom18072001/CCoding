// Nội bộ: hợp nhất cấu hình, phân giải tham chiếu và đánh giá có vị trí (dùng cho tầng 2 và 3).
// Xem SPEC.md mục 6.

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

export function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

// Nút hợp nhất:
//   { t: 'obj', map: Map, pos, keyPos }   — đối tượng; pos = vị trí Block khởi tạo
//   { t: 'val', node, file, keyPos }      — giá trị AST (Number/String/Array/...) thuộc tệp `file`
export function buildProject(program) {
  const files = program.files;
  const consts = new Map();
  for (const [name, ast] of Object.entries(files)) {
    const m = new Map();
    for (const st of ast.body) if (st.type === 'Const') m.set(st.name, { t: 'val', node: st.value, file: name });
    consts.set(name, m);
  }

  const root = { t: 'obj', map: new Map(), pos: { file: program.entry, line: 1, column: 1 }, keyPos: null };

  function process(obj, stmts, file, stack) {
    for (const st of stmts) {
      const keyPos = { file, line: st.line, column: st.column };
      if (st.type === 'Assign') {
        obj.map.set(st.key, { t: 'val', node: st.value, file, keyPos });
      } else if (st.type === 'Block') {
        let target = obj.map.get(st.key);
        if (target && target.t === 'obj') {
          // SPEC 5 chưa nói rõ vị trí khóa khi nhiều Block cùng khóa được trộn: đọc sát 6.2 —
          // đối tượng thuộc về Block đã khởi tạo nó, nên keyPos giữ nguyên là của Block đó.
        } else {
          target = { t: 'obj', map: new Map(), pos: keyPos, keyPos };
          obj.map.set(st.key, target);
        }
        process(target, st.body, file, stack);
      } else if (st.type === 'Include') {
        if (Object.hasOwn(files, st.path) && !stack.includes(st.path)) {
          process(obj, files[st.path].body, st.path, [...stack, st.path]);
        }
      }
    }
  }
  if (Object.hasOwn(files, program.entry)) process(root, files[program.entry].body, program.entry, [program.entry]);
  return { program, consts, root, memo: new Map(), pureMemo: new Map() };
}

function step(cur, seg) {
  if (cur.t === 'obj') return cur.map.get(seg);
  if (cur.node.type === 'Array' && INDEX_RE.test(seg)) {
    const idx = Number(seg);
    if (idx < cur.node.items.length) return { t: 'val', node: cur.node.items[idx], file: cur.file };
  }
  return undefined;
}

// Phân giải một Ref trong chuỗi thuộc tệp `file`; trả nút hợp nhất hoặc undefined.
export function resolveRef(ctx, ref, file) {
  let cur;
  let from = 0;
  if (ref.const) {
    cur = ctx.consts.get(file)?.get(ref.path[0]);
    from = 1;
  } else {
    cur = ctx.root;
  }
  for (let k = from; cur && k < ref.path.length; k++) cur = step(cur, ref.path[k]);
  return cur;
}

export const isPureRef = (node) => node.type === 'String' && node.parts.length === 1 && node.parts[0].type === 'Ref';

function scalarToString(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return JSON.stringify(v);
  return String(v);
}

// Đánh giá nút hợp nhất thành cây có vị trí:
//   { kind: 'obj', pos, entries: [{key, keyPos, loc}] } | { kind: 'arr', pos, items } | { kind: 'scalar', pos, value }
// `override` là vị trí chuỗi thuần tham chiếu ngoài cùng (nếu có).
export function evalLoc(ctx, n, override = null) {
  if (n.t === 'obj') {
    const entries = [];
    for (const [key, child] of n.map) {
      entries.push({ key, keyPos: override ?? child.keyPos, loc: evalLoc(ctx, child, override) });
    }
    return { kind: 'obj', pos: override ?? n.pos, entries };
  }
  const node = n.node;
  const own = { file: n.file, line: node.line, column: node.column };
  const pos = override ?? own;
  switch (node.type) {
    case 'Number':
    case 'Bool':
      return { kind: 'scalar', pos, value: node.value };
    case 'Null':
      return { kind: 'scalar', pos, value: null };
    case 'Array':
      return {
        kind: 'arr',
        pos,
        items: node.items.map((item) => evalLoc(ctx, { t: 'val', node: item, file: n.file }, override)),
      };
    default: {
      if (isPureRef(node)) {
        return evalLoc(ctx, followPure(ctx, n), override ?? own);
      }
      return { kind: 'scalar', pos, value: evalString(ctx, node, n.file) };
    }
  }
}

// Đi theo chuỗi các chuỗi thuần tham chiếu (lặp, không đệ quy) tới nút không còn là chuỗi thuần tham chiếu.
// Chuỗi tham chiếu rất dài không làm tràn ngăn xếp.
function followPure(ctx, n) {
  const path = [];
  const seen = new Set();
  let cur = n;
  while (cur.t === 'val' && isPureRef(cur.node)) {
    const hit = ctx.pureMemo.get(cur.node);
    if (hit) {
      cur = hit;
      break;
    }
    if (seen.has(cur.node)) throw new Error('Vòng tham chiếu');
    seen.add(cur.node);
    path.push(cur.node);
    const target = resolveRef(ctx, cur.node.parts[0], cur.file);
    if (!target) throw new Error('Tham chiếu không phân giải được');
    cur = target;
  }
  for (const node of path) ctx.pureMemo.set(node, cur); // ghi nhớ để chuỗi dài không tốn O(n²)
  return cur;
}

// Đánh giá chuỗi có nội suy bằng ngăn xếp tường minh (nội suy lồng sâu không đệ quy JS).
function evalString(ctx, root, rootFile) {
  const stack = [{ node: root, file: rootFile }];
  const onStack = new Set([root]);
  const refsOf = (node, file) =>
    node.parts.filter((p) => p.type === 'Ref').map((ref) => {
      const target = resolveRef(ctx, ref, file);
      if (!target) throw new Error('Tham chiếu không phân giải được');
      return followPure(ctx, target);
    });
  while (stack.length) {
    const { node, file } = stack[stack.length - 1];
    if (ctx.memo.has(node)) {
      stack.pop();
      onStack.delete(node);
      continue;
    }
    const finals = refsOf(node, file);
    let pending = false;
    for (const f of finals) {
      if (f.t === 'val' && f.node.type === 'String' && !ctx.memo.has(f.node)) {
        if (onStack.has(f.node)) throw new Error('Vòng tham chiếu');
        onStack.add(f.node);
        stack.push({ node: f.node, file: f.file });
        pending = true;
      }
    }
    if (pending) continue;
    let out = '';
    let k = 0;
    for (const part of node.parts) {
      if (part.type === 'Text') {
        out += part.value;
        continue;
      }
      const f = finals[k++];
      if (f.t === 'obj' || f.node.type === 'Array') throw new Error('Nội suy giá trị phức hợp');
      if (f.node.type === 'String') out += ctx.memo.get(f.node);
      else out += scalarToString(f.node.type === 'Null' ? null : f.node.value);
    }
    ctx.memo.set(node, out);
  }
  return ctx.memo.get(root);
}

export function locToJson(loc) {
  if (loc.kind === 'scalar') return loc.value;
  if (loc.kind === 'arr') return loc.items.map(locToJson);
  const obj = {};
  for (const e of loc.entries) setOwn(obj, e.key, locToJson(e.loc));
  return obj;
}
