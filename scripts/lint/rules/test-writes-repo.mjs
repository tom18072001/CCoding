// Test không được ghi vào cây repo: tệp test ghi/xóa/chép/đổi tên với đường dẫn ghép từ HERE, ROOT, __dirname,
// import.meta.dirname (hay biến suy ra từ chúng) mà không qua thư mục tạm. Hai test chạy song song sẽ đua nhau
// (D22: analyze-sr tạo bài tạm trong bench/vs-claude/tasks/ làm isolation-v43f ENOENT). Ngoại lệ: scripts/lint/allow.json.
// D23: stringMask nhận regex literal (vd. /'/); biến trung gian gán thẳng từ HERE/ROOT/… hoặc từ biến đã nhiễm cũng bị bắt.
// GIỚI HẠN CÒN LẠI (phân tích văn bản, không phải trình phân tích cú pháp): (1) đường dẫn repo truyền qua THAM SỐ hàm
// (function w(dir) { fs.writeFileSync(dir, …) } rồi gọi w(HERE)); (2) THUỘC TÍNH đối tượng (o.dir = HERE; fs.mkdirSync(o.dir)) và
// destructuring; (3) giá trị IMPORT từ tệp khác (import { repoDir } from './x.mjs'); (4) tên biến khai báo nhiều lần trong
// tệp bị bỏ qua; (5) regex ngay sau ")" hoặc "}" bị coi là phép chia.
const TEST_FILE = /\.test\.[cm]?[jt]s$/;
// Tên hàm -> chỉ số đối số là ĐÍCH ghi (-1: mọi đối số đường dẫn trong 2 đối số đầu).
const WRITERS = {
  writeFileSync: [0], appendFileSync: [0], mkdirSync: [0], rmSync: [0], rmdirSync: [0], unlinkSync: [0], truncateSync: [0],
  copyFileSync: [1], cpSync: [1], renameSync: [0, 1], symlinkSync: [1],
  writeFile: [0], appendFile: [0], mkdir: [0], rm: [0], unlink: [0], copyFile: [1], cp: [1], rename: [0, 1],
};
const REPO_REF = /\b(?:HERE|ROOT|__dirname)\b|import\.meta\.(?:dirname|url)/;
const PATHY = /^\s*(?:\([^)]*\)\s*=>\s*|[A-Za-z_$][\w$]*\s*=>\s*)?(?:path\.(?:join|resolve|normalize|dirname|relative)\s*\(|fileURLToPath\s*\(|`|'|")/;
const BARE = /^\s*[A-Za-z_$][\w$.]*\s*$/; // gán thẳng một tên (vd. const base = HERE)
const TMP_REF =/mkdtemp|tmpdir\s*\(/;
const CALL = new RegExp(String.raw`\b(?:fs\.|fsp\.|promises\.)?(${Object.keys(WRITERS).join('|')})\s*\(`, 'g');

/** Cắt đối số cấp trên cùng của lời gọi mở ở `open` (vị trí sau dấu "("). */
function splitArgs(src, open) {
  const args = [];
  let depth = 0, cur = '', q = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (q) { cur += c; if (c === '\\') cur += src[++i] ?? ''; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (depth === 0) { args.push(cur); return args; } depth--; }
    if (c === ',' && depth === 0) { args.push(cur); cur = ''; continue; }
    cur += c;
  }
  args.push(cur);
  return args;
}

/** Biến khai báo đúng một lần trong tệp, gán từ đường dẫn repo (không qua thư mục tạm): tên -> true. Tên khai báo nhiều lần bị bỏ (tránh trùng tên cục bộ như dir/root). */
function taintedVars(src) {
  const decls = [...src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*([^;\n]+)/g)];
  const count = new Map();
  for (const m of decls) count.set(m[1], (count.get(m[1]) ?? 0) + 1);
  const t = new Set();
  for (let pass = 0; pass < 3; pass++) {
    for (const m of decls) {
      if (count.get(m[1]) !== 1 || ['HERE', 'ROOT'].includes(m[1])) continue;
      const rhs = m[2];
      if (TMP_REF.test(rhs) || !(PATHY.test(rhs) || BARE.test(rhs))) continue; // chỉ biểu thức dựng đường dẫn mới lan nhiễm; đọc dữ liệu từ repo thì không
      if (REPO_REF.test(rhs) || [...t].some((v) => new RegExp(String.raw`\b${v}\b`).test(rhs))) t.add(m[1]);
    }
  }
  return t;
}

const RE_KEYWORD = /^(?:return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await)$/;
/** Dấu "/" tại i mở regex (true) hay là phép chia (false): xét token đứng trước. */
function regexAllowed(src, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0) return true;
  const c = src[j];
  if (/[\w$]/.test(c)) { let k = j; while (k >= 0 && /[\w$]/.test(src[k])) k--; return RE_KEYWORD.test(src.slice(k + 1, j + 1)); }
  return !/[)\]}'"`]/.test(c);
}
/** Vị trí dấu "/" đóng regex bắt đầu ở i (tính lớp [...] và ký tự thoát); -1 nếu hết dòng mà chưa đóng (không phải regex). */
function regexEnd(src, i) {
  let cls = false;
  for (let k = i + 1; k < src.length && src[k] !== '\n'; k++) {
    const c = src[k];
    if (c === '\\') k++;
    else if (cls) { if (c === ']') cls = false; }
    else if (c === '[') cls = true;
    else if (c === '/') { while (/[a-z]/i.test(src[k + 1] ?? '')) k++; return k; }
  }
  return -1;
}

/** Mảng boolean: true tại vị trí nằm trong nội dung chuỗi/template (không tính `${…}` là mã) hoặc comment. Mã nhúng trong chuỗi (fixture) không phải lời gọi thật. */
function stringMask(src) {
  const mask = new Array(src.length).fill(false);
  const stack = []; // 'code' | '`' ; mỗi `${` đẩy 'code', `}` khớp thì bật ra
  let mode = 'code', braces = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') mask[i++] = true; i--; continue; }
      if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; for (; i < end; i++) mask[i] = true; i--; continue; }
      if (c === '/' && regexAllowed(src, i)) {
        const e = regexEnd(src, i);
        if (e > 0) { for (; i <= e; i++) mask[i] = true; i--; continue; }
      }
      if (c === '"' || c === "'") {
        mask[i] = true;
        for (i++; i < src.length && src[i] !== c && src[i] !== '\n'; i++) { mask[i] = true; if (src[i] === '\\') mask[++i] = true; }
        if (i < src.length) mask[i] = true;
        continue;
      }
      if (c === '`') { mask[i] = true; stack.push(braces); braces = []; mode = '`'; continue; }
      if (c === '{') braces.push(1);
      else if (c === '}') {
        if (braces.length) braces.pop();
        else if (stack.length) { braces = stack.pop(); mode = '`'; mask[i] = true; }
      }
    } else {
      mask[i] = true;
      if (c === '\\') mask[++i] = true;
      else if (c === '`') { braces = stack.pop(); mode = 'code'; }
      else if (c === '$' && n === '{') { mask[++i] = true; stack.push(braces); braces = []; mode = 'code'; }
    }
  }
  return mask;
}

export default {
  id: 'test-writes-repo',
  source: 'D22 — test ghi vào cây repo làm test khác đua nhau (ENOENT) và làm bẩn worktree',
  needsBase: false,
  async run(ctx) {
    const out = [];
    for (const file of ctx.files.filter((f) => TEST_FILE.test(f) && !f.includes('/results/'))) {
      const src = ctx.read(file);
      const tainted = taintedVars(src);
      const dirty = (a) => !TMP_REF.test(a) && (REPO_REF.test(a) || [...tainted].some((v) => new RegExp(String.raw`\b${v}\b`).test(a)));
      const mask = stringMask(src);
      for (const m of src.matchAll(CALL)) {
        if (mask[m.index]) continue; // nằm trong chuỗi/template/comment (vd. fixture của test rule)
        const before = src.lastIndexOf('\n', m.index);
        if (/^\s*(\/\/|\*|\/\*)/.test(src.slice(before + 1, m.index + 1))) continue;
        const args = splitArgs(src, m.index + m[0].length);
        const bad = WRITERS[m[1]].some((i) => args[i] !== undefined && dirty(args[i]));
        if (bad) {
          const line = src.slice(0, m.index).split('\n').length;
          out.push({ file, line, msg: `${m[1]}() ghi vào đường dẫn ghép từ thư mục repo — dùng fs.mkdtempSync(path.join(os.tmpdir(), …) (ngoại lệ có lý do: allow.json)` });
        }
      }
    }
    return out;
  },
};
