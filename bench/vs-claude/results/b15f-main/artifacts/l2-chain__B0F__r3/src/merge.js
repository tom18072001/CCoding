// Nội bộ (KHÔNG export qua index.js): hợp nhất + phân giải dùng chung cho check (tầng 2) và evaluate (tầng 3).
// SPEC.md mục 6.1, 6.2 và định nghĩa S(đích) ở mục 5.
//
// ───────────── API ─────────────
// mergeProgram(program) → root: ObjectNode
//   program = đầu ra parseProject. Xử lý câu lệnh của entry theo thứ tự; Include xử lý tại chỗ;
//   Const bỏ qua; tệp thiếu trong program.files hoặc đang nằm trên đường include (vòng) thì bỏ qua (không treo).
//
// ObjectNode  = { kind:'object', children: Map<string, Entry>, block: Pos|null, stmt: Stmt|null, file }
//   - Map giữ thứ tự khóa theo lần xuất hiện đầu (6.2); ghi đè không đổi chỗ.
//   - block: { file, line, column } của Block đã KHỞI TẠO đối tượng (6.2). Gốc: { file: entry, line: 1, column: 1 }.
//   - stmt: nút Assign/Block THẮNG (lần xử lý cuối) của khóa này; gốc: null. Dùng cho vị trí SEM_UNKNOWN_KEY (token khóa).
// ValueEntry  = { kind:'value', node: ValueNode(AST), file, stmt: Assign }
//   - Entry = ObjectNode | ValueEntry. node.type ∈ Number|Bool|Null|String|Array. file = tệp chứa node.
//
// Target (đích của một Ref) = ObjectNode | { kind:'node', node: ValueNode, file }
//   (node có thể là phần tử mảng; file là tệp chứa nó — dùng làm ngữ cảnh phân giải cho chuỗi bên trong)
//
// resolveRef(root, program, ref, file) → Target | null
//   ref = part {type:'Ref', path, const}; file = tệp chứa chuỗi. null nếu không phân giải được (6.1):
//   chỉ số mảng = /^(0|[1-9][0-9]*)$/ và < độ dài; không đi xuyên chuỗi/vô hướng; null vẫn tồn tại;
//   Ref hằng: hằng của CHÍNH tệp `file` (khai báo ở bất kỳ đâu trong tệp), rồi đi tiếp các đoạn sau.
//
// collectStrings(target) → Array<{ node: StringNode, file }>
//   S(đích): mọi nút String trong đích; đối tượng chỉ tính định nghĩa thắng. Không trùng nút.
//
// refsOfString(node) → Ref[] (các part type 'Ref' theo thứ tự).
// isPureRef(node) → boolean: parts gồm đúng một Ref.
//
// targetKind(root, program, target) → 'string'|'number'|'boolean'|'null'|'array'|'object'|null
//   Kiểu giá trị SAU đánh giá của đích (SEM_BAD_INTERPOLATION). Chuỗi thuần-Ref lấy kiểu của đích nó,
//   đệ quy; chuỗi khác → 'string'. null nếu chuỗi thuần-Ref không phân giải được hoặc rơi vào vòng.

const INDEX_RE = /^(0|[1-9][0-9]*)$/;

export function mergeProgram(program) {
  const root = {
    kind: 'object', children: new Map(),
    block: { file: program.entry, line: 1, column: 1 }, stmt: null, file: program.entry,
  };
  const active = new Set();
  const run = (file, target) => {
    const ast = program.files[file];
    if (!ast || active.has(file)) return;
    active.add(file);
    body(ast.body, file, target);
    active.delete(file);
  };
  const body = (stmts, file, target) => {
    for (const s of stmts) {
      if (s.type === 'Assign') {
        // Map.set trên khóa đã có giữ nguyên vị trí cũ (6.2)
        target.children.set(s.key, { kind: 'value', node: s.value, file, stmt: s });
      } else if (s.type === 'Block') {
        let obj = target.children.get(s.key);
        if (obj && obj.kind === 'object') {
          obj.stmt = s;
          obj.stmtFile = file;
        } else {
          obj = { kind: 'object', children: new Map(), block: { file, line: s.line, column: s.column }, stmt: s, stmtFile: file, file };
          target.children.set(s.key, obj);
        }
        body(s.body, file, obj);
      } else if (s.type === 'Include') {
        run(s.path, target);
      }
      // Const: bỏ qua
    }
  };
  run(program.entry, root);
  return root;
}

function constNode(program, file, name) {
  const ast = program.files[file];
  if (!ast) return null;
  for (const s of ast.body) if (s.type === 'Const' && s.name === name) return s.value;
  return null;
}

function step(cur, seg) {
  if (cur.kind === 'object') {
    const e = cur.children.get(seg);
    if (!e) return null;
    return e.kind === 'object' ? e : { kind: 'node', node: e.node, file: e.file };
  }
  if (cur.node.type === 'Array') {
    if (!INDEX_RE.test(seg)) return null;
    const i = Number(seg);
    if (i >= cur.node.items.length) return null;
    return { kind: 'node', node: cur.node.items[i], file: cur.file };
  }
  return null;
}

export function resolveRef(root, program, ref, file) {
  let cur;
  let rest;
  if (ref.const) {
    const n = constNode(program, file, ref.path[0]);
    if (!n) return null;
    cur = { kind: 'node', node: n, file };
    rest = ref.path.slice(1);
  } else {
    cur = root;
    rest = ref.path;
  }
  for (const seg of rest) {
    cur = step(cur, seg);
    if (!cur) return null;
  }
  return cur;
}

export function refsOfString(node) {
  return node.parts.filter((p) => p.type === 'Ref');
}

export function isPureRef(node) {
  return node.parts.length === 1 && node.parts[0].type === 'Ref';
}

export function collectStrings(target) {
  const out = [];
  const seen = new Set();
  const walkNode = (node, file) => {
    if (node.type === 'String') {
      if (!seen.has(node)) { seen.add(node); out.push({ node, file }); }
    } else if (node.type === 'Array') {
      for (const it of node.items) walkNode(it, file);
    }
  };
  const walk = (t) => {
    if (t.kind === 'object') {
      for (const e of t.children.values()) {
        if (e.kind === 'object') walk(e);
        else walkNode(e.node, e.file);
      }
    } else walkNode(t.node, t.file);
  };
  walk(target);
  return out;
}

export function targetKind(root, program, target) {
  const seen = new Set();
  const kindOf = (t) => {
    if (t.kind === 'object') return 'object';
    const n = t.node;
    switch (n.type) {
      case 'Number': return 'number';
      case 'Bool': return 'boolean';
      case 'Null': return 'null';
      case 'Array': return 'array';
      case 'String': {
        if (!isPureRef(n)) return 'string';
        if (seen.has(n)) return null;
        seen.add(n);
        const next = resolveRef(root, program, n.parts[0], t.file);
        const k = next ? kindOf(next) : null;
        seen.delete(n);
        return k;
      }
      default: return null;
    }
  };
  return kindOf(target);
}
