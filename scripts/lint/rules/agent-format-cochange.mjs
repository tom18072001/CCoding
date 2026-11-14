// AGENTS.md: "Thay đổi định dạng agent.md ⇒ cập nhật docs/AGENTS-GUIDE.md và test/registry.test.ts".
// Rule chỉ đọc danh sách tệp đổi so với mốc, không sửa gì.
const TRIGGER = 'src/registry.ts';
const COCHANGE = ['docs/AGENTS-GUIDE.md', 'test/registry.test.ts'];

export default {
  id: 'agent-format-cochange',
  source: 'AGENTS.md — Quy ước (đổi định dạng agent.md)',
  needsBase: true,
  async run(ctx) {
    const changed = ctx.changed();
    if (!changed || !changed.includes(TRIGGER)) return [];
    return COCHANGE.filter((f) => !changed.includes(f)).map((f) => ({
      file: TRIGGER,
      line: 0,
      msg: `${TRIGGER} đổi so với mốc ${ctx.base} nhưng ${f} không đổi — cập nhật cả hai (định dạng agent.md)`,
    }));
  },
};
