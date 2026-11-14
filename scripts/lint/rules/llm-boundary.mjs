// AGENTS.md: "Mọi lượt gọi LLM phải đi qua Orchestrator.call() … không gọi runtime trực tiếp từ chỗ khác".
// Danh sách lấy từ hiện trạng (D20); thêm mục mới phải có lý do và được review.
const ALLOWED = {
  'src/orchestrator.ts': 'Orchestrator.call() là cổng duy nhất gọi LLM (log, đếm token, chính sách dữ liệu)',
  'src/app.ts': 'composition root: dựng RuntimeManager và đưa cho Orchestrator',
  'src/cli.ts': 'dựng RuntimeManager cho lệnh doctor/task và phân loại lỗi runtime để hiển thị',
  'src/herdr.ts': 'chỉ dùng tiện ích tiến trình (quickRun/runProcess/resolveCommand) để gọi herdr, không gọi LLM',
  'src/tools/workspace.ts': 'chỉ dùng killTree để dừng cây tiến trình của run_command, không gọi LLM',
};

const SPEC_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]*)['"]/g;

export default {
  id: 'llm-boundary',
  source: 'AGENTS.md — Quy ước (mọi lượt gọi LLM qua Orchestrator.call)',
  needsBase: false,
  async run(ctx) {
    const out = [];
    const seen = new Set();
    for (const file of ctx.files.filter((f) => f.startsWith('src/') && /\.[cm]?[jt]s$/.test(f) && !f.startsWith('src/runtimes/'))) {
      const lines = ctx.read(file).split(/\r?\n/);
      lines.forEach((text, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(text)) return;
        for (const m of text.matchAll(SPEC_RE)) {
          if (!/(^|\/)runtimes(\/|$)/.test(m[1])) continue;
          seen.add(file);
          if (!ALLOWED[file]) out.push({ file, line: i + 1, msg: `import "${m[1]}": chỉ ${Object.keys(ALLOWED).join(', ')} được import src/runtimes/* — gọi LLM qua Orchestrator.call()` });
        }
      });
    }
    for (const file of Object.keys(ALLOWED)) {
      if (!seen.has(file)) out.push({ file: 'scripts/lint/rules/llm-boundary.mjs', line: 0, msg: `"${file}" nằm trong danh sách nhưng không còn import src/runtimes/* — xóa khỏi danh sách` });
    }
    return out;
  },
};
