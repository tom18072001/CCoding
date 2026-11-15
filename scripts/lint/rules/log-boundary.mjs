// AGENTS.md: "Log chỉ ghi qua LogStore (che PII/bí mật + chuỗi băm)". Ghi nối tệp trong src/ chỉ ở module trong danh sách.
const ALLOWED = {
  'src/logger.ts': 'LogStore: nơi duy nhất ghi nối log, có che PII/bí mật và chuỗi băm',
  'src/log-retention.ts': 'sổ cái lưu giữ log (ledger) ghi nối có băm',
};
const APPEND_RE = /\b(?:appendFile(?:Sync)?|createWriteStream)\s*\(|flag\s*:\s*['"]a\+?['"]/;

export default {
  id: 'log-boundary',
  source: 'AGENTS.md — Quy ước (log chỉ ghi qua LogStore)',
  needsBase: false,
  async run(ctx) {
    const out = [];
    const seen = new Set();
    for (const file of ctx.files.filter((f) => f.startsWith('src/') && /\.[cm]?[jt]s$/.test(f))) {
      ctx.read(file).split(/\r?\n/).forEach((text, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(text) || !APPEND_RE.test(text)) return;
        seen.add(file);
        if (!ALLOWED[file]) out.push({ file, line: i + 1, msg: `ghi nối tệp ngoài LogStore (${Object.keys(ALLOWED).join(', ')}) — ghi log qua LogStore để được che PII và băm chuỗi` });
      });
    }
    for (const file of Object.keys(ALLOWED)) {
      if (!seen.has(file)) out.push({ file: 'scripts/lint/rules/log-boundary.mjs', line: 0, msg: `"${file}" nằm trong danh sách nhưng không còn ghi nối tệp — xóa khỏi danh sách` });
    }
    return out;
  },
};
