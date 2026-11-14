// Tham chiếu `tệp:dòng` trong tài liệu Nghiên cứu phải đúng ở mốc đã ghi. Chạy logic-map-check.mjs --strict.
// Nguồn: BRIEF-22 (C2: 12/34), BRIEF-22b (C2-r: 14/24).
import { runScript } from '../lib/script-rule.mjs';

export default {
  id: 'research-file-line',
  source: 'BRIEF-22 (C2), BRIEF-22b (C2-r) — tham chiếu tệp:dòng sai',
  needsBase: false,
  async run(ctx) {
    return runScript(ctx, 'docs/research/scripts/logic-map-check.mjs', ['--strict']);
  },
};
