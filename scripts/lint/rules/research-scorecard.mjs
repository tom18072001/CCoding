// Bảng điểm agent đủ dòng và trùng đầu ra script. Chạy scorecard.mjs --check.
// Nguồn: BRIEF-22b (scorecard.mjs --check kiểm đủ 20 dòng).
import { runScript } from '../lib/script-rule.mjs';

export default {
  id: 'research-scorecard',
  source: 'BRIEF-22b — scorecard thiếu dòng agent',
  needsBase: false,
  async run(ctx) {
    return runScript(ctx, 'docs/research/analysis/decisions/scorecard.mjs', ['--check']);
  },
};
