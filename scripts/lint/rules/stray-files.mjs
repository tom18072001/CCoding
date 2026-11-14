// Không track tệp chèn chưa gộp / bản nháp để lại: *-insert.md, DRAFT-*, *.orig, *.rej, *.bak, *~.
// FINAL.md, ACCEPTANCE.md chỉ được có nếu nằm trong ALLOWED (cần review). Nguồn: BRIEF-22 (C1), D18a (DRAFT-paused.md).
const ALLOWED = [];
const PATTERNS = [
  [/-insert\.md$/, '*-insert.md'],
  [/^DRAFT-/, 'DRAFT-*'],
  [/\.orig$/, '*.orig'],
  [/\.rej$/, '*.rej'],
  [/\.bak$/, '*.bak'],
  [/~$/, '*~'],
];

export default {
  id: 'stray-files',
  source: 'BRIEF-22 (C1), D18a — tệp chèn chưa gộp, bản nháp để lại',
  needsBase: false,
  async run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      const base = file.split('/').pop();
      const hit = PATTERNS.find(([re]) => re.test(base));
      if (hit) out.push({ file, line: 0, msg: `tệp thừa khớp ${hit[1]} — gộp nội dung vào tệp chính rồi xóa` });
      else if (/^(FINAL|ACCEPTANCE)\.md$/.test(base) && !ALLOWED.includes(file)) out.push({ file, line: 0, msg: `${base} không nằm trong danh sách cho phép (scripts/lint/rules/stray-files.mjs)` });
    }
    return out;
  },
};
