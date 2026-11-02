// B-04: phát lại các lệnh `git-read-deny` của CSV KPI qua hàm thật (gitReadCommandReason + guardDecision), in số qua/chặn.
// Chạy: node --import tsx scripts/replay-guard-deny.mjs [csv] [--json] [--policy <shell-policy.ts cũ>]
//   --policy: đo bằng bản shell-policy khác (vd. bản trước khi sửa, `git show <commit>:src/tools/shell-policy.ts`) — chỉ gọi gitReadCommandReason.
// Dấu `<ws>/wt-…` trong CSV là chỗ giữ đường dẫn worktree đã che; được thay bằng root của repo này (worktree của lượt chạy gốc).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as current from '../src/tools/shell-policy.ts';
import { guardDecision } from '../src/tools/claude-guard.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const pi = args.indexOf('--policy');
const policyPath = pi >= 0 ? path.resolve(args[pi + 1]) : undefined;
const csvPath = args.find((a, i) => !a.startsWith('--') && i !== pi + 1) ?? path.join(root, 'docs/research/context/tool-failures-2026-11-02.csv');
const policy = policyPath ? await import(pathToFileURL(policyPath).href) : current;

/** CSV RFC 4180 (trường có nháy kép, xuống dòng trong trường). */
function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// Phân loại theo bản shell-policy HIỆN TẠI (cố định cho cả hai lần đo): chạy mã (thông dịch/vòng lặp ở đầu câu) > ghi (chuyển hướng/sed -i/tee) > đọc.
const EXEC_HEAD = /^(python[\d.]*|node|nodejs|npx?|bash|sh|pwsh|powershell|ruby|perl|php|deno|bun|for|while|until)$/i;
function classify(c) {
  const p = current.shellParse(c);
  const heads = p.stmts.flatMap((segs) => segs.map((s) => s.trim().split(/\s+/)[0] ?? ''));
  if (heads.some((h) => EXEC_HEAD.test(h)) || (p.bad && /(^|[\s;&|(])(python3?|node)\s/.test(c))) return 'chạy mã';
  return current.shellWrites(c) ? 'ghi' : 'đọc';
}
const mask = (c) => c.replace(/\s+/g, ' ').replace(/(key|token|secret|password|pass)(\s*[=:]\s*)\S+/gi, '$1$2***').replace(/(sk|ghp|xox[bp])-?[A-Za-z0-9_-]{12,}/g, '***').slice(0, 110);

const [head, ...rows] = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const ci = (n) => head.indexOf(n);
const rootFwd = root.replace(/\\/g, '/');
// CSV cắt lệnh ở 240 ký tự: nếu bị cắt giữa nháy thì đóng nháy giả định để xét phần còn thấy được.
const closeTruncated = (c) => (c.length >= 239 && current.shellParse(c).bad?.cmd === "nháy không đóng" ? [c + "'", c + '"'].find((x) => current.shellParse(x).bad?.cmd !== "nháy không đóng") ?? c : c);
const cmds = rows.filter((r) => r[ci('category')] === 'git-read-deny').map((r) => closeTruncated(r[ci('command_or_path')].replace(/<ws>\/wt-[\w-]+/g, rootFwd)));

const cfg = { root, deny: [], allowGitCommit: false, shell: 'git-read' };
const out = cmds.map((c, i) => {
  const reason = policy.gitReadCommandReason(c, root);
  const g = policyPath ? undefined : guardDecision({ tool_name: 'Bash', tool_input: { command: c } }, cfg);
  return { n: i + 1, cmd: mask(c), kind: classify(c), pass: !reason && !g };
});

if (args.includes('--json')) console.log(JSON.stringify(out));
else {
  console.log('| # | lệnh | loại | kết quả |\n|---|---|---|---|');
  for (const o of out) console.log(`| ${o.n} | \`${o.cmd.replace(/\|/g, '\\|')}\` | ${o.kind} | ${o.pass ? 'QUA' : 'CHẶN'} |`);
  const by = (k) => out.filter((o) => o.kind === k);
  console.log(`\nTổng ${out.length}: qua ${out.filter((o) => o.pass).length}, chặn ${out.filter((o) => !o.pass).length}`);
  for (const k of ['đọc', 'ghi', 'chạy mã']) console.log(`- ${k}: ${by(k).length} lệnh, qua ${by(k).filter((o) => o.pass).length}`);
}
