// AGENTS.md: "Hạn chế phụ thuộc runtime (hiện chỉ có `yaml`)".
const ALLOWED = ['yaml'];
const FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];

export default {
  id: 'deps-allowlist',
  source: 'AGENTS.md — Quy ước (phụ thuộc runtime)',
  needsBase: false,
  async run(ctx) {
    if (!ctx.files.includes('package.json')) return [];
    const text = ctx.read('package.json');
    const lines = text.split(/\r?\n/);
    const pkg = JSON.parse(text);
    const out = [];
    for (const field of FIELDS) {
      for (const name of Object.keys(pkg[field] ?? {})) {
        if (ALLOWED.includes(name)) continue;
        const line = lines.findIndex((l) => l.includes(`"${name}"`)) + 1;
        out.push({ file: 'package.json', line, msg: `"${name}" trong ${field} không nằm trong danh sách cho phép (${ALLOWED.join(', ')}); đưa vào devDependencies hoặc bỏ` });
      }
    }
    return out;
  },
};
