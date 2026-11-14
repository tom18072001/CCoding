// Không dùng `node --test <thư mục>/`: hỏng trên Node 24 Windows (coi thư mục là module, 0 test, exit 1).
// Dùng glob trong ngoặc kép. Nguồn: BRIEF-22c K3.
const SCAN = (f) => f === 'package.json' || f === 'README.md' || /^\.github\/workflows\/.+\.ya?ml$/.test(f) || /^docs\/.+\.md$/.test(f);

export default {
  id: 'test-glob',
  source: 'BRIEF-22c K3 — node --test <thư mục>/ hỏng trên Windows',
  needsBase: false,
  async run(ctx) {
    const out = [];
    const dirs = new Set();
    for (const f of ctx.files) {
      const parts = f.split('/');
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    }
    for (const file of ctx.files.filter(SCAN)) {
      ctx.read(file).split(/\r?\n/).forEach((line, i) => {
        const m = /(?:^|[\s"'`])(?:node|tsx)\s+(?:[^\s|&;]+\s+)*?--test\b(.*)$/.exec(line);
        if (!m) return;
        let rest = m[1].split(/\||&&|;/)[0];
        if (file.endsWith('.md')) rest = rest.split('`')[0]; // trong văn xuôi, lệnh kết thúc ở dấu ` đóng
        let first = true;
        for (const tok of rest.match(/"[^"]*"|'[^']*'|\S+/g) ?? []) {
          const t = tok.replace(/^["']+|["'),.]+$/g, '').replace(/\\/g, '/');
          if (!t || t.startsWith('-') || /[*?{}<>]/.test(t)) continue;
          // không có dấu / thì chỉ tính khi là đối số đầu tiên (tránh nhầm chữ thường trong văn xuôi)
          const isFirst = first;
          first = false;
          if (!t.includes('/') && !isFirst) continue;
          if (t.endsWith('/') || dirs.has(t.replace(/^\.\//, ''))) {
            out.push({ file, line: i + 1, msg: `"--test ${t}" truyền thư mục — dùng glob trong ngoặc kép, vd. "${t.replace(/\/$/, '')}/*.test.mjs"` });
          }
        }
      });
    }
    return out;
  },
};
