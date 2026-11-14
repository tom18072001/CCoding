// Một số chỉ có một giá trị trong tài liệu Nghiên cứu; không còn cụm lỗi thời; không còn đường dẫn máy.
// Chạy consistency-check.mjs. Nguồn: BRIEF-22 tiêu chí 5 (hai giá trị cho một số; CHANGELOG ghi "không đổi số").
import { runScript } from '../lib/script-rule.mjs';

export default {
  id: 'research-facts',
  source: 'BRIEF-22 tiêu chí 5 — hai giá trị cho một số',
  needsBase: false,
  async run(ctx) {
    return runScript(ctx, 'docs/research/scripts/consistency-check.mjs', []);
  },
};
