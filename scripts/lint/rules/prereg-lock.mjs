// Đăng ký trước (docs/research/preregistration.md) chỉ được THÊM ở §9. Khối đã khóa đổi hoặc mất ⇒ lỗi;
// khối mới phải được khóa bằng `node scripts/lint/prereg-lock.mjs --add-new`; "Lịch sử bản" chỉ thêm dòng.
// Nguồn: quy tắc đăng ký trước từ v2.0, nhắc ở mọi đề bài (sửa ngoài §9).
import { PREREG, LOCK, splitBlocks, compare } from '../lib/prereg.mjs';

export default {
  id: 'prereg-lock',
  source: 'quy tắc đăng ký trước từ v2.0 — chỉ thêm ở §9',
  needsBase: false,
  async run(ctx) {
    if (!ctx.files.includes(PREREG)) return [{ file: PREREG, line: 0, msg: 'không thấy tệp đăng ký trước' }];
    if (!ctx.files.includes(LOCK)) return [{ file: LOCK, line: 0, msg: 'thiếu tệp khóa — chạy node scripts/lint/prereg-lock.mjs --add-new (lần khóa đầu)' }];
    let lock;
    try {
      lock = JSON.parse(ctx.read(LOCK));
      if (!Array.isArray(lock.blocks) || !Array.isArray(lock.history)) throw new Error('thiếu blocks/history');
    } catch (e) {
      return [{ file: LOCK, line: 0, msg: `tệp khóa không hợp lệ: ${e.message}` }];
    }
    const out = [];
    // khóa chỉ được thêm so với mốc: mục cũ không được đổi mã băm hoặc mất
    if (ctx.baseRev) {
      let before = null;
      try {
        before = JSON.parse(ctx.git(['show', `${ctx.baseRev}:${LOCK}`]));
      } catch {
        before = null;
      }
      if (before && Array.isArray(before.blocks)) {
        const now = new Map(lock.blocks.map((b) => [b.key, b.sha256]));
        for (const b of before.blocks) {
          if (!now.has(b.key)) out.push({ file: LOCK, line: 0, msg: `mục khóa "${b.key}" đã bị xóa so với mốc` });
          else if (now.get(b.key) !== b.sha256) out.push({ file: LOCK, line: 0, msg: `mã băm khóa của "${b.key}" bị ghi đè so với mốc (chỉ được thêm)` });
        }
      }
    }
    const { errors, fresh } = compare(splitBlocks(ctx.read(PREREG)), lock);
    for (const e of errors) out.push({ file: PREREG, line: e.line, msg: e.msg });
    for (const b of fresh) out.push({ file: PREREG, line: b.start, msg: `khối mới ở §9 "${b.key}" chưa vào tệp khóa — chạy node scripts/lint/prereg-lock.mjs --add-new rồi để reviewer duyệt ${LOCK}` });
    return out;
  },
};
