// Mọi chỗ bỏ qua test phải có lý do và khớp test/skips.json (tệp, tên test, điều kiện, lý do).
// Nếu có docs/diagnostics/skipped-tests.md (D18d) thì mỗi mục phải được nhắc ở đó (theo tên test hoặc đường dẫn tệp).
// Nguồn: D18a, D18c (số test bỏ qua lệch, không ai giải thích).
const TEST_FILE = /\.test\.[cm]?[jt]s$/;
const SKIP_CALL = /\b(?:test|it|describe|suite)\.(?:skip|todo)\s*\(|\bt\.(?:skip|todo)\s*\(/;
const SKIP_OPT = /\b(?:skip|todo)\s*:/;
const REGISTRY = 'test/skips.json';
const DOC = 'docs/diagnostics/skipped-tests.md';

// xóa nội dung chuỗi (giữ dấu nháy) để `skip:` nằm trong tên test không bị tính là tùy chọn
const blank = (line) => line.replace(/(['"`])((?:\\.|(?!\1).)*)\1/g, (m, q, body) => q + ' '.repeat(body.length) + q);

function titleOf(line) {
  const m = /\b(?:test|it|describe|suite)(?:\.(?:skip|todo))?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/.exec(line);
  return m ? m[2] : null;
}

export default {
  id: 'skip-registry',
  source: 'D18a, D18c — số test bỏ qua lệch, không ai giải thích',
  needsBase: false,
  async run(ctx) {
    const out = [];
    const sites = [];
    for (const file of ctx.files.filter((f) => TEST_FILE.test(f) && !f.includes('/results/') && !f.includes('bench/vs-claude/tasks/'))) {
      ctx.read(file).split(/\r?\n/).forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        const bare = blank(line);
        if (!(SKIP_CALL.test(bare) || SKIP_OPT.test(bare))) return;
        const name = titleOf(line);
        if (name === null) return; // không phải dòng khai báo test
        const optAt = bare.search(SKIP_OPT);
        const opt = optAt < 0 ? '' : line.slice(optAt);
        if (!SKIP_CALL.test(bare) && !/['"`]/.test(opt)) out.push({ file, line: i + 1, msg: `skip không kèm lý do (chuỗi) ở test "${name}"` });
        sites.push({ file, line: i + 1, name });
      });
    }

    let reg = [];
    try {
      const j = JSON.parse(ctx.read(REGISTRY));
      if (!Array.isArray(j.entries)) throw new Error('thiếu mảng "entries"');
      reg = j.entries;
    } catch (e) {
      out.push({ file: REGISTRY, line: 0, msg: `thiếu hoặc không đọc được sổ đăng ký test bỏ qua: ${e.message}` });
    }
    reg.forEach((e, i) => {
      const miss = ['file', 'name', 'condition', 'reason'].filter((k) => typeof e?.[k] !== 'string' || !e[k].trim());
      if (miss.length) out.push({ file: REGISTRY, line: 0, msg: `mục #${i + 1} thiếu trường: ${miss.join(', ')}` });
    });
    const used = new Set();
    for (const s of sites) {
      const i = reg.findIndex((e, k) => !used.has(k) && e?.file === s.file && e?.name === s.name);
      if (i < 0) out.push({ file: s.file, line: s.line, msg: `test bỏ qua "${s.name}" chưa có trong ${REGISTRY} (cần file, name, condition, reason)` });
      else used.add(i);
    }
    reg.forEach((e, i) => {
      if (!used.has(i) && e?.file) out.push({ file: REGISTRY, line: 0, msg: `mục #${i + 1} (${e.file}: "${e.name}") không còn khớp test bỏ qua nào — xóa mục` });
    });

    if (ctx.files.includes(DOC)) {
      const doc = ctx.read(DOC);
      for (const e of reg) {
        if (e?.file && !doc.includes(e.name) && !doc.includes(e.file)) out.push({ file: DOC, line: 0, msg: `không nhắc test bỏ qua "${e.name}" (${e.file})` });
      }
    }
    return out;
  },
};
