// K3 — bài báo ẩn danh chủ dự án (quyết định 14/11 mục 2): docs/research/paper/** dùng vai, không dùng tên riêng.
// Danh sách tên nằm ở đây (cấu hình rule). Thêm tên mới = sửa mảng NAMES.
const NAMES = ['Tom'];
const SCOPE = /^docs\/research\/paper\//;
const re = new RegExp(String.raw`(?<![\p{L}\p{N}_])(?:` + NAMES.join('|') + String.raw`)(?![\p{L}\p{N}_])`, 'iu');

export default {
  id: 'paper-anonymity',
  source: 'quyết định 14/11 mục 2 (BRIEF-D20); docs/data-protection-assessment.md',
  needsBase: false,
  async run(ctx) {
    const out = [];
    for (const file of ctx.files.filter((f) => SCOPE.test(f) && /\.(md|txt|tex|bib)$/i.test(f))) {
      ctx.read(file).split(/\r?\n/).forEach((line, i) => {
        if (re.test(line)) out.push({ file, line: i + 1, msg: 'tên riêng của chủ dự án trong bài báo — dùng vai ("tác giả", "chủ dự án")' });
      });
    }
    return out;
  },
};
