// Câu vượt mức bằng chứng trong tệp kết quả. Mẫu ở scripts/lint/overclaim.json (mẫu, lý do, nguồn).
// Áp cho paper/**, analysis/**/report.md, improvement-backlog.md, bench/vs-claude/results/*/report.md.
// Chữ trong ngoặc kép hoặc backtick (trích để phê bình) được bỏ qua, và khối mã rào.
import fs from 'node:fs';
import path from 'node:path';

const INCLUDE = [
  /^docs\/research\/paper\/.+\.md$/,
  /^docs\/research\/analysis\/(?:.+\/)?report\.md$/,
  /^docs\/research\/improvement-backlog\.md$/,
  /^bench\/vs-claude\/results\/[^/]+\/report\.md$/,
];
const QUOTED = [/`[^`\n]*`/g, /"[^"\n]*"/g, /“[^”\n]*”/g, /«[^»\n]*»/g];

export const stripQuoted = (ln) => QUOTED.reduce((s, re) => s.replace(re, (m) => ' '.repeat(m.length)), ln);

export default {
  id: 'overclaim',
  source: 'BRIEF-21, BRIEF-22b, phản biện K4 v0.7 — câu vượt mức bằng chứng',
  needsBase: false,
  async run(ctx) {
    const cfgPath = path.join(ctx.root, 'scripts/lint/overclaim.json');
    let cfg;
    try {
      cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch (e) {
      return [{ file: 'scripts/lint/overclaim.json', line: 0, msg: `không đọc được danh sách mẫu: ${e.message}` }];
    }
    const out = [];
    const pats = [];
    for (const p of cfg.patterns ?? []) {
      if (!p?.id || !p.pattern || !p.reason || !p.source) {
        out.push({ file: 'scripts/lint/overclaim.json', line: 0, msg: `mẫu "${p?.id ?? '?'}" thiếu id/pattern/reason/source` });
        continue;
      }
      try {
        pats.push({ ...p, re: new RegExp(p.pattern, 'iu') });
      } catch (e) {
        out.push({ file: 'scripts/lint/overclaim.json', line: 0, msg: `mẫu "${p.id}" không phải regex hợp lệ: ${e.message}` });
      }
    }
    for (const file of ctx.files.filter((f) => INCLUDE.some((re) => re.test(f)))) {
      let fence = false;
      ctx.read(file).split(/\r?\n/).forEach((ln, i) => {
        if (/^\s*(```|~~~)/.test(ln)) {
          fence = !fence;
          return;
        }
        if (fence) return;
        const s = stripQuoted(ln);
        for (const p of pats) {
          const m = p.re.exec(s);
          if (m) out.push({ file, line: i + 1, msg: `vượt mức bằng chứng [${p.id}] "${m[0]}": ${p.reason} (nguồn: ${p.source})` });
        }
      });
    }
    return out;
  },
};
