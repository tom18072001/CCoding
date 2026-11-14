// Mọi bảng trong performance/token-analysis.md phải trùng đầu ra của script. Chạy token-analysis.mjs --check.
// Nguồn: BRIEF-3, BRIEF-4b, BRIEF-4c — bảng lệch khi results/ có thêm lượt.
import { runScript } from '../lib/script-rule.mjs';

export default {
  id: 'research-token',
  source: 'BRIEF-3, BRIEF-4b, BRIEF-4c — bảng token lệch khỏi script',
  needsBase: false,
  async run(ctx) {
    return runScript(ctx, 'docs/research/performance/scripts/token-analysis.mjs', ['--check', 'docs/research/performance/token-analysis.md']);
  },
};
