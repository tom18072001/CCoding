// Mô hình hợp nhất dùng chung cho tầng 2 và tầng 3 (SPEC.md mục 6).

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const IDX = /^(0|[1-9][0-9]*)$/;

export class MObj {
  constructor(pos) {
    this.pos = pos;
    this.entries = new Map(); // key -> { keyPos, val: MObj | AST value node }
  }
}

export const setOwn = (obj, key, value) =>
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });

export const isPureRef = (str) => str.parts.length === 1 && str.parts[0].type === 'Ref';

function tag(node, name, map) {
  if (!node || typeof node !== 'object') return;
  if (node.type) map.set(node, name);
  if (node.body) for (const s of node.body) tag(s, name, map);
  if (node.value && typeof node.value === 'object') tag(node.value, name, map);
  if (node.items) for (const s of node.items) tag(s, name, map);
}

export class Model {
  constructor(program) {
    this.program = program;
    const files = program.files;
    this.fileOf = new WeakMap();
    this.consts = new Map();
    for (const name of Object.keys(files)) {
      tag(files[name], name, this.fileOf);
      const m = new Map();
      for (const s of files[name].body) if (s.type === 'Const' && !m.has(s.name)) m.set(s.name, s.value);
      this.consts.set(name, m);
    }
    this.root = new MObj({ file: program.entry, line: 1, column: 1 });
    this.#merge(this.root, files[program.entry].body, program.entry, new Set([program.entry]));
    this.active = new Set();
  }

  #merge(obj, stmts, file, stack) {
    for (const s of stmts) {
      if (s.type === 'Assign') {
        obj.entries.set(s.key, { keyPos: { file, line: s.line, column: s.column }, val: s.value });
      } else if (s.type === 'Block') {
        const ex = obj.entries.get(s.key);
        if (ex && ex.val instanceof MObj) {
          this.#merge(ex.val, s.body, file, stack);
        } else {
          const pos = { file, line: s.line, column: s.column };
          const m = new MObj(pos);
          obj.entries.set(s.key, { keyPos: pos, val: m });
          this.#merge(m, s.body, file, stack);
        }
      } else if (s.type === 'Include') {
        const files = this.program.files;
        if (has(files, s.path) && !stack.has(s.path)) {
          stack.add(s.path);
          this.#merge(obj, files[s.path].body, s.path, stack);
          stack.delete(s.path);
        }
      }
    }
  }

  // Phân giải Ref của chuỗi thuộc tệp `file`; trả MObj, nút AST hoặc null.
  resolve(ref, file) {
    let cur;
    let rest = ref.path;
    if (ref.const) {
      const m = this.consts.get(file);
      if (!m || !m.has(rest[0])) return null;
      cur = m.get(rest[0]);
      rest = rest.slice(1);
    } else cur = this.root;
    for (const seg of rest) {
      if (cur instanceof MObj) {
        const e = cur.entries.get(seg);
        if (!e) return null;
        cur = e.val;
      } else if (cur.type === 'Array') {
        if (!IDX.test(seg) || Number(seg) >= cur.items.length) return null;
        cur = cur.items[Number(seg)];
      } else return null;
    }
    return cur;
  }

  pos(node) {
    return { file: this.fileOf.get(node), line: node.line, column: node.column };
  }

  // Cây chú thích: {kind:'obj',pos,entries:[{key,keyPos,ann}]} | {kind:'arr',pos,items} | {kind:'scalar',pos,value}
  annotate(target) {
    if (target instanceof MObj) {
      return {
        kind: 'obj',
        pos: target.pos,
        entries: [...target.entries].map(([key, e]) => ({ key, keyPos: e.keyPos, ann: this.annotate(e.val) })),
      };
    }
    switch (target.type) {
      case 'Number':
      case 'Bool':
        return { kind: 'scalar', pos: this.pos(target), value: target.value };
      case 'Null':
        return { kind: 'scalar', pos: this.pos(target), value: null };
      case 'Array':
        return { kind: 'arr', pos: this.pos(target), items: target.items.map((x) => this.annotate(x)) };
      default:
        return this.annotateString(target);
    }
  }

  annotateString(str) {
    const pos = this.pos(str);
    const file = pos.file;
    if (this.active.has(str)) return { kind: 'scalar', pos, value: null }; // chương trình lỗi: chặn đệ quy vô hạn
    this.active.add(str);
    try {
      if (isPureRef(str)) {
        const t = this.resolve(str.parts[0], file);
        if (!t) return { kind: 'scalar', pos, value: null };
        return relocate(this.annotate(t), pos);
      }
      let out = '';
      for (const part of str.parts) {
        if (part.type === 'Text') { out += part.value; continue; }
        const t = this.resolve(part, file);
        if (!t) continue;
        out += stringify(toValue(this.annotate(t)));
      }
      return { kind: 'scalar', pos, value: out };
    } finally {
      this.active.delete(str);
    }
  }

  annotateRoot() {
    return this.annotate(this.root);
  }
}

function stringify(v) {
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function relocate(a, pos) {
  if (a.kind === 'obj') {
    return { kind: 'obj', pos, entries: a.entries.map((e) => ({ key: e.key, keyPos: pos, ann: relocate(e.ann, pos) })) };
  }
  if (a.kind === 'arr') return { kind: 'arr', pos, items: a.items.map((x) => relocate(x, pos)) };
  return { kind: 'scalar', pos, value: a.value };
}

export function toValue(a) {
  if (a.kind === 'obj') {
    const o = {};
    for (const e of a.entries) setOwn(o, e.key, toValue(e.ann));
    return o;
  }
  if (a.kind === 'arr') return a.items.map(toValue);
  return a.value;
}
