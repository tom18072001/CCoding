// Kiểm "baseline chỉ được giảm" theo khóa: mỗi mục ở HEAD phải có ở mốc.
// Khóa = (rule, tệp, neo) hoặc (rule, tệp, sha256 đã chuẩn hóa CRLF→LF).
// Ca chuyển tiếp (đổi cách băm): mục HEAD khớp (rule, tệp) của một mục mốc và sha256 bằng băm chuẩn hóa của blob `git show <mốc>:<tệp>` ⇒ đạt.
import { sha256Norm } from './hash.mjs';

const keyOf = (e) => `${e.rule}\0${e.file}\0${e.sha256 ? `sha:${e.sha256}` : `anchor:${e.anchor}`}`;

/**
 * @param {object[]} head  mục baseline ở cây làm việc
 * @param {object[]|null} before  mục baseline ở mốc; null = mốc chưa có baseline.json (đạt)
 * @param {(file: string) => (Buffer|string|null)} showAtBase  nội dung tệp ở mốc, null nếu không có
 * @returns {object[]} các mục HEAD không có ở mốc (mới thêm)
 */
export function addedBaselineEntries(head, before, showAtBase) {
  if (!before) return [];
  const known = new Set(before.map(keyOf));
  const pairs = new Set(before.map((e) => `${e.rule}\0${e.file}`));
  const blobSha = new Map();
  const shaAtBase = (file) => {
    if (!blobSha.has(file)) {
      const b = showAtBase(file);
      blobSha.set(file, b == null ? null : sha256Norm(b));
    }
    return blobSha.get(file);
  };
  return head.filter((e) => {
    if (known.has(keyOf(e))) return false;
    if (e.sha256 && pairs.has(`${e.rule}\0${e.file}`) && shaAtBase(e.file) === e.sha256) return false;
    return true;
  });
}
