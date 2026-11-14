// Không để `.only` / `only: true` trong test: một test bị bỏ sót .only làm cả bộ test chỉ chạy một ca mà vẫn xanh.
const TEST_FILE = /\.test\.[cm]?[jt]s$/;
const ONLY = [/\.only\s*\(/, /\bonly\s*:\s*true\b/];

export default {
  id: 'no-only',
  source: 'D20 — test bị khóa bằng .only vẫn xanh',
  needsBase: false,
  async run(ctx) {
    const out = [];
    for (const file of ctx.files.filter((f) => TEST_FILE.test(f) && !f.includes('/results/'))) {
      ctx.read(file).split(/\r?\n/).forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (ONLY.some((re) => re.test(line))) out.push({ file, line: i + 1, msg: 'có .only / only: true — bỏ đi, nếu không bộ test chỉ chạy một ca' });
      });
    }
    return out;
  },
};
