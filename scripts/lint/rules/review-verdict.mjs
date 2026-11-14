// Tệp phản biện (docs/research/**/*review*.md) có đúng MỘT dòng "**Kết luận:** Đạt|Sửa nhỏ|Chưa đạt" trong 40 dòng đầu
// và không có dấu hiệu bị cắt ("hết lượt công cụ"). Nguồn: BRIEF-22b (K4 hết lượt giữa chừng, hai kết luận mâu thuẫn).
// Tệp cũ vào baseline theo băm nội dung (đã chuẩn hóa xuống dòng, nên giống nhau trên Windows và Linux): ghi "băm:<12 hex>" trong thông báo.
import { sha256Norm } from '../lib/hash.mjs';

const VERDICT_RE = /^\s*\*\*Kết luận:\*\*\s*(?:Đạt|Sửa nhỏ|Chưa đạt)\s*(?:[.:;,—–-].*)?$/u;
const TRUNC_RE = /hết lượt công cụ/iu;

export default {
  id: 'review-verdict',
  source: 'BRIEF-22b (K4) — phản biện bị cắt, hai kết luận mâu thuẫn',
  needsBase: false,
  async run(ctx) {
    const out = [];
    const files = ctx.files.filter((f) => f.startsWith('docs/research/') && f.endsWith('.md') && /review/i.test(f.split('/').pop()) && !/^BRIEF/.test(f.split('/').pop()));
    for (const file of files) {
      const text = ctx.read(file).replace(/\r\n?/g, '\n');
      const lines = text.split('\n');
      const tag = `băm:${sha256Norm(text).slice(0, 12)}`;
      const n = lines.slice(0, 40).filter((l) => VERDICT_RE.test(l)).length;
      if (n !== 1) out.push({ file, line: 0, msg: `phải có đúng 1 dòng "**Kết luận:** Đạt|Sửa nhỏ|Chưa đạt" trong 40 dòng đầu, đang có ${n} (${tag})` });
      const cut = lines.findIndex((l) => TRUNC_RE.test(l));
      if (cut >= 0) out.push({ file, line: cut + 1, msg: `dấu hiệu phản biện bị cắt ("hết lượt công cụ") — chạy lại phản biện (${tag})` });
    }
    return out;
  },
};
