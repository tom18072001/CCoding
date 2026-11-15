// Tầng 3 — hợp nhất chương trình (SPEC mục 6.1, 6.2). Module dùng chung cho check (S4, S5) và evaluate.
//
// ============================ HỢP ĐỒNG API ============================
// Kiểu giá trị đã hợp nhất (MV) — chỉ có hai dạng:
//   ObjectMV = { kind: 'object', origin: Pos, entries: Map<string, Entry> }
//       origin  : vị trí Block đã khởi tạo đối tượng (6.2). Gốc: { file: entry, line: 1, column: 1 }.
//       entries : Map giữ thứ tự khóa theo lần xuất hiện đầu (6.2).
//       Entry   = { def: { node, file }, value: MV }
//                 def.node  là nút Assign hoặc Block THẮNG (lần xử lý cuối cùng chạm tới khóa này,
//                 kể cả Block trộn vào); def.file là tệp chứa nó.
//   LeafMV   = { kind: 'leaf', node, file }
//       node là nút giá trị AST (Number | Bool | Null | String | Array) — Array giữ nguyên nút AST,
//       phần tử mảng là nút AST thô, không bao giờ được trộn. file là tệp chứa nút đó.
//   Pos      = { file, line, column }
//
// Hàm công khai:
//   mergeProgram(program) -> Merged = { root: ObjectMV, program, consts }
//       Không ném. Include không có trong program.files hoặc đang nằm trên đường xử lý (vòng) bị bỏ qua.
//   getDefs(obj: ObjectMV) -> Array<{ key, node, file, value: MV }>   (theo thứ tự khóa; node = Assign|Block thắng)
//   objectOrigin(obj: ObjectMV) -> Pos
//   constTable(merged, file) -> Map<string, ConstNode>   (rỗng nếu tệp không có hằng; ConstNode.value là nút giá trị)
//   resolveRef(merged, ref, file) -> MV | undefined
//       ref là Part kiểu Ref ({ path, const }); file là tệp chứa chuỗi. 'Không tồn tại' = undefined
//       (null của cfg là LeafMV có node.type === 'Null', KHÔNG phải undefined).
//       Chỉ đi qua đối tượng và mảng; chỉ số mảng /^(0|[1-9][0-9]*)$/ và nằm trong mảng; không đi xuyên chuỗi/vô hướng.
//       Ref hằng: lấy hằng path[0] của `file` rồi đi tiếp path.slice(1) (chỉ qua mảng).
//   stringsIn(mv: MV) -> Array<{ node: StringNode, file }>
//       mọi nút String nằm trong mv (chính nó nếu là chuỗi, mọi chuỗi trong mảng lồng nhau,
//       mọi chuỗi trong đối tượng — chỉ định nghĩa thắng), theo thứ tự duyệt. Để dựng đồ thị vòng.
//   sourcePos(mv: MV) -> Pos
//       đối tượng: origin; leaf: vị trí nút giá trị (file, node.line, node.column). Dùng cho pha C.
// ======================================================================

export function mergeProgram(program) {
  const consts = new Map();
  const root = { kind: 'object', origin: { file: program.entry, line: 1, column: 1 }, entries: new Map() };
  const merged = { root, program, consts };
  for (const [file, ast] of Object.entries(program.files)) {
    const m = new Map();
    for (const st of ast.body) if (st.type === 'Const' && !m.has(st.name)) m.set(st.name, st);
    consts.set(file, m);
  }
  const ast = Object.hasOwn(program.files, program.entry) ? program.files[program.entry] : null;
  if (ast) run(ast.body, program.entry, root, [program.entry], program);
  return merged;
}

function run(body, file, obj, stack, program) {
  for (const st of body) {
    if (st.type === 'Assign') {
      obj.entries.set(st.key, { def: { node: st, file }, value: { kind: 'leaf', node: st.value, file } });
    } else if (st.type === 'Block') {
      const old = obj.entries.get(st.key);
      if (old && old.value.kind === 'object') {
        old.def = { node: st, file };
        run(st.body, file, old.value, stack, program);
      } else {
        const child = { kind: 'object', origin: { file, line: st.line, column: st.column }, entries: new Map() };
        // Map.set trên khóa có sẵn giữ nguyên vị trí khóa (6.2).
        obj.entries.set(st.key, { def: { node: st, file }, value: child });
        run(st.body, file, child, stack, program);
      }
    } else if (st.type === 'Include') {
      const sub = Object.hasOwn(program.files, st.path) ? program.files[st.path] : null;
      if (sub && !stack.includes(st.path)) run(sub.body, st.path, obj, [...stack, st.path], program);
    }
  }
}

export function getDefs(obj) {
  return [...obj.entries].map(([key, e]) => ({ key, node: e.def.node, file: e.def.file, value: e.value }));
}

export function objectOrigin(obj) {
  return obj.origin;
}

const EMPTY = new Map();
export function constTable(merged, file) {
  return merged.consts.get(file) ?? EMPTY;
}

const INDEX = /^(0|[1-9][0-9]*)$/;

function step(mv, seg) {
  if (mv.kind === 'object') {
    const e = mv.entries.get(seg);
    return e ? e.value : undefined;
  }
  if (mv.node.type === 'Array' && INDEX.test(seg)) {
    const i = Number(seg);
    if (i < mv.node.items.length) return { kind: 'leaf', node: mv.node.items[i], file: mv.file };
  }
  return undefined;
}

export function resolveRef(merged, ref, file) {
  let cur;
  let rest = ref.path;
  if (ref.const) {
    const c = constTable(merged, file).get(ref.path[0]);
    if (!c) return undefined;
    cur = { kind: 'leaf', node: c.value, file };
    rest = ref.path.slice(1);
  } else {
    cur = merged.root;
  }
  for (const seg of rest) {
    cur = step(cur, seg);
    if (cur === undefined) return undefined;
  }
  return cur;
}

export function stringsIn(mv) {
  const out = [];
  const walkNode = (node, file) => {
    if (node.type === 'String') out.push({ node, file });
    else if (node.type === 'Array') for (const it of node.items) walkNode(it, file);
  };
  const walk = (v) => {
    if (v.kind === 'object') for (const e of v.entries.values()) walk(e.value);
    else walkNode(v.node, v.file);
  };
  walk(mv);
  return out;
}

export function sourcePos(mv) {
  if (mv.kind === 'object') return mv.origin;
  return { file: mv.file, line: mv.node.line, column: mv.node.column };
}
