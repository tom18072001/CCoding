// Tài liệu Nghiên cứu không được để mục trống/chỗ giữ: "(pha review điền)", "chưa điền", TBD, TODO, "<điền", "XX %".
// Nguồn: V4 gói 13 (T7: tiêu đề "pha review điền" bị để lại trong bản phản biện).
const PATTERNS = [
  ['(pha review điền)', /\(pha review điền\)/iu],
  ['chưa điền', /chưa điền/iu],
  ['TBD', /(?<![\p{L}\d_])TBD(?![\p{L}\d_])/u],
  ['TODO', /(?<![\p{L}\d_])TODO(?![\p{L}\d_])/u],
  ['<điền', /<điền/iu],
  ['XX %', /(?<![\p{L}\d_])XX\s?%/u],
];

export default {
  id: 'placeholders',
  source: 'V4 gói 13 (T7) — mục để trống "pha review điền"',
  needsBase: false,
  async run(ctx) {
    const out = [];
    for (const file of ctx.files.filter((f) => f.startsWith('docs/research/') && f.endsWith('.md'))) {
      ctx.read(file).split(/\r?\n/).forEach((ln, i) => {
        const hit = PATTERNS.find(([, re]) => re.test(ln));
        if (hit) out.push({ file, line: i + 1, msg: `chỗ giữ chưa điền: ${hit[0]} — điền nội dung thật hoặc bỏ mục` });
      });
    }
    return out;
  },
};
