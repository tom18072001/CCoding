// Không track tệp chèn chưa gộp / bản nháp để lại: *-insert.md, DRAFT-*, *.orig, *.rej, *.bak, *~.
// FINAL.md, ACCEPTANCE.md chỉ được có nếu nằm trong ALLOWED (cần review).
// Thêm: (1) tệp khớp mẫu nháp của repo (.ccoding/scratch.json, so bằng matchScratch của src/scratch.ts — không chép mẫu hay bộ so glob);
// (2) tệp ở gốc repo không nằm trong ROOT_ALLOW. Ngoại lệ đi qua scripts/lint/allow.json như các luật khác.
// Nguồn: BRIEF-22 (C1), D18a (DRAFT-paused.md), BRIEF-25 (k2-tmp/a.mjs bị sót), BRIEF-26b (_ed.py ở gốc repo).
import { loadTs } from '../lib/load-ts.mjs';

const ALLOWED = [];
// Tệp được phép nằm ở gốc repo. Thêm tệp gốc hợp lệ mới: sửa danh sách này (cần review) hoặc ghi ngoại lệ trong allow.json.
const ROOT_ALLOW = [
  '.gitattributes',
  '.gitignore',
  '.npmrc',
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'ccoding.config.json',
  'ccoding.local.example.json',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.test.json',
];
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
  source: 'BRIEF-22 (C1), D18a, BRIEF-25 (k2-tmp/a.mjs), BRIEF-26b (_ed.py) — tệp chèn chưa gộp, bản nháp để lại, tệp lạ ở gốc',
  needsBase: false,
  async run(ctx) {
    const { loadScratchPatterns, matchScratch } = await loadTs(ctx.root, 'src/scratch.ts');
    const scratch = loadScratchPatterns(ctx.root);
    const out = [];
    for (const file of ctx.files) {
      const base = file.split('/').pop();
      const hit = PATTERNS.find(([re]) => re.test(base));
      if (hit) {
        out.push({ file, line: 0, msg: `tệp thừa khớp ${hit[1]} — gộp nội dung vào tệp chính rồi xóa` });
        continue;
      }
      if (/^(FINAL|ACCEPTANCE)\.md$/.test(base) && !ALLOWED.includes(file)) {
        out.push({ file, line: 0, msg: `${base} không nằm trong danh sách cho phép (scripts/lint/rules/stray-files.mjs)` });
        continue;
      }
      if (scratch && matchScratch(file, scratch)) {
        out.push({ file, line: 0, msg: `tệp nháp khớp mẫu trong .ccoding/scratch.json — chuyển vào .scratch/ (đã được git exclude) hoặc xóa` });
        continue;
      }
      if (!file.includes('/') && !ROOT_ALLOW.includes(file)) {
        out.push({ file, line: 0, msg: `tệp lạ ở gốc repo, không nằm trong ROOT_ALLOW (scripts/lint/rules/stray-files.mjs) — chuyển vào thư mục đúng, vào .scratch/ nếu là tệp nháp, hoặc xóa` });
      }
    }
    return out;
  },
};
