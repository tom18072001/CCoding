// Mọi tệp *.test.{ts,mjs,js} đã track phải khớp glob của một script test trong package.json
// (trừ bài mẫu bench/vs-claude/tasks/ và results/). Nguồn: lệnh kiểm tra dự án Nghiên cứu thiếu analysis/*.test.mjs.
const TEST_FILE = /\.test\.(?:ts|mjs|js)$/;
const EXEMPT = (f) => f.startsWith('bench/vs-claude/tasks/') || f.includes('/results/');

function globToRe(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        if (g[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export default {
  id: 'orphan-tests',
  source: 'D20 — test nghiên cứu không lệnh nào chạy',
  needsBase: false,
  async run(ctx) {
    let scripts = {};
    try {
      scripts = JSON.parse(ctx.read('package.json')).scripts ?? {};
    } catch (e) {
      return [{ file: 'package.json', line: 0, msg: `không đọc được scripts: ${e.message}` }];
    }
    const pats = [];
    for (const cmd of Object.values(scripts)) {
      for (const seg of String(cmd).split(/&&|\|\||;/)) {
        const at = seg.search(/(?:^|\s)--test\b/);
        if (at < 0) continue;
        for (const tok of seg.slice(at).replace(/^\s*--test\b/, '').match(/"[^"]*"|'[^']*'|\S+/g) ?? []) {
          const t = tok.replace(/^["']|["']$/g, '');
          if (t && !t.startsWith('-')) pats.push(globToRe(t.replace(/^\.\//, '')));
        }
      }
    }
    return ctx.files
      .filter((f) => TEST_FILE.test(f) && !EXEMPT(f) && !pats.some((re) => re.test(f)))
      .map((file) => ({ file, line: 0, msg: 'tệp test không khớp glob của script test nào trong package.json (test, test:bench, test:research) — không lệnh nào chạy nó' }));
  },
};
