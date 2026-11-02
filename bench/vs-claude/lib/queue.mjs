// Hàng đợi của runner: lượt nào đã xong, lane nào CCoding hỗ trợ, và kiểm arm trước khi gửi task. Hàm thuần để test.
import fs from 'node:fs';
import path from 'node:path';

export const EXIT_RATE_LIMIT = 3;

/** Dòng infra (hạn mức, lỗi hạ tầng) không phải kết quả của arm: lượt đó phải chạy lại. */
export const isDoneRow = (row) => row.status !== 'infra';

export function doneKeys(runsText) {
  const keys = new Set();
  for (const l of String(runsText).split('\n')) {
    if (!l.trim()) continue;
    let row;
    try { row = JSON.parse(l); } catch { continue; }
    if (row.key && isDoneRow(row)) keys.add(row.key);
  }
  return keys;
}

/** Các giá trị lane mà CCoding hiểu, đọc từ union `lane?:` trong TaskOptions (src/types.ts hoặc dist/types.d.ts). */
export function supportedLanes(repoRoot) {
  for (const f of ['src/types.ts', 'dist/types.d.ts']) {
    const p = path.join(repoRoot, f);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, 'utf8').match(/^\s*lane\?:\s*((?:'[\w-]+'\s*\|?\s*)+);/m);
    if (m) return [...m[1].matchAll(/'([\w-]+)'/g)].map((x) => x[1]);
  }
  return [];
}

/** Trả về danh sách lỗi (rỗng nếu ổn). Không tự lùi sang lane khác. */
export function checkArms(armIds, arms, lanes) {
  const errs = [];
  for (const id of armIds) {
    const lane = arms[id]?.options?.lane;
    if (arms[id]?.kind === 'ccoding' && lane && !lanes.includes(lane)) {
      errs.push(`Arm ${id} cần lane '${lane}'${arms[id].pending ? ` (${arms[id].pending})` : ''} — CCoding hiện chưa hỗ trợ`);
    }
  }
  return errs;
}
