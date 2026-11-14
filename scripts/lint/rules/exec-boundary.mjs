// Chỉ module trong danh sách được import child_process, và mỗi module phải dùng đúng cách kiểm lệnh đã ghi.
// Nguồn: D16 (rule mới chỉ nối một đường chạy lệnh, run_command chưa nối).
//  kind 'shell'      : nhận lệnh do agent/LLM đưa — bắt buộc gọi các hàm kiểm trong từng `blocks` (đoạn mã bắt đầu từ `start`).
//  kind 'fixed-argv' : chỉ chạy tệp thực thi + argv cố định do mã dựng; cấm `shell: true`.
//  kind 'operator'   : lệnh do người vận hành đặt trong cấu hình/bench, không phải do LLM; ghi rõ lý do.
//  kind 'runtime'    : lớp bọc tiến trình của runtimes (đã nằm sau llm-boundary).
const MODULES = {
  'src/tools/workspace.ts': {
    kind: 'shell',
    reason: 'run_command và git_read nhận lệnh do agent đưa',
    blocks: [
      { start: "case 'run_command': {", end: "case 'git_read'", calls: ['deniedReason', 'outsidePathReason', 'outsideWriteDecision'] },
      { start: "case 'git_read': {", end: 'default:', calls: ['gitReadArgsReason', 'outsidePathReason'] },
    ],
  },
  'src/bench.ts': { kind: 'operator', reason: 'defaultRunCommand chạy lệnh kiểm do người vận hành khai trong bench, shell: true có chủ đích' },
  'src/selfimprove.ts': { kind: 'fixed-argv', reason: 'chạy npm với argv cố định (shell chỉ bật trên Windows để gọi npm.cmd)' },
  'src/diff.ts': { kind: 'fixed-argv', reason: 'git với argv cố định, --literal-pathspecs' },
  'src/git.ts': { kind: 'fixed-argv', reason: 'git với argv cố định' },
  'src/ship.ts': { kind: 'fixed-argv', reason: 'git với argv cố định' },
  'src/orchestrator.ts': { kind: 'fixed-argv', reason: 'git ls-files cố định để dựng bản đồ repo' },
  'src/herdr.ts': { kind: 'fixed-argv', reason: 'chạy herdr với argv do mã dựng' },
  'src/util/extract.ts': { kind: 'fixed-argv', reason: 'execFile công cụ trích văn bản với argv cố định' },
  'src/runtimes/api.ts': { kind: 'runtime', reason: 'đọc biến môi trường Windows qua reg query cố định' },
  'src/runtimes/claude-cli.ts': { kind: 'runtime', reason: 'dò WSL và chạy claude -p qua runProcess' },
  'src/runtimes/spawn.ts': { kind: 'runtime', reason: 'lớp bọc spawn dùng chung của các runtime' },
};

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](?:node:)?child_process['"]/;

function blockOf(text, b) {
  const s = text.indexOf(b.start);
  if (s < 0) return null;
  const e = text.indexOf(b.end, s + b.start.length);
  return text.slice(s, e < 0 ? undefined : e);
}

export default {
  id: 'exec-boundary',
  source: 'D16 (run_command chưa nối rule), AGENTS.md — Quy ước',
  needsBase: false,
  async run(ctx) {
    const out = [];
    const seen = new Set();
    for (const file of ctx.files.filter((f) => f.startsWith('src/') && /\.[cm]?[jt]s$/.test(f))) {
      const text = ctx.read(file);
      const lines = text.split(/\r?\n/);
      const at = lines.findIndex((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && IMPORT_RE.test(l));
      if (at < 0) continue;
      seen.add(file);
      const m = MODULES[file];
      if (!m) {
        out.push({ file, line: at + 1, msg: 'import child_process ngoài danh sách module được phép (scripts/lint/rules/exec-boundary.mjs); chạy lệnh qua src/tools/workspace.ts hoặc thêm vào danh sách kèm hàm kiểm và lý do' });
        continue;
      }
      if (m.kind === 'fixed-argv') {
        const li = lines.findIndex((l) => /\bshell\s*:\s*true\b/.test(l));
        if (li >= 0) out.push({ file, line: li + 1, msg: 'module khai "fixed-argv" nhưng dùng shell: true — đổi kind (kèm hàm kiểm) hoặc bỏ shell' });
      }
      for (const b of m.blocks ?? []) {
        const body = blockOf(text, b);
        if (body === null) {
          out.push({ file, line: at + 1, msg: `không tìm thấy đoạn "${b.start}" — rule không xác minh được hàm kiểm lệnh; cập nhật rule cùng lúc đổi mã` });
          continue;
        }
        const startLine = text.slice(0, text.indexOf(b.start)).split('\n').length;
        for (const fn of b.calls) {
          if (!new RegExp(`\\b${fn}\\s*\\(`).test(body)) out.push({ file, line: startLine, msg: `${b.start} chưa gọi hàm kiểm lệnh ${fn}() — đường chạy lệnh này không được nối rule` });
        }
      }
    }
    for (const file of Object.keys(MODULES)) {
      if (!seen.has(file)) out.push({ file: 'scripts/lint/rules/exec-boundary.mjs', line: 0, msg: `"${file}" nằm trong danh sách nhưng không còn import child_process — xóa khỏi danh sách` });
    }
    return out;
  },
};
