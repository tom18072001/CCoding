import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { guardBlock } from '../src/tools/claude-guard.js';
import { executeTool } from '../src/tools/workspace.js';
import { outsidePathReason, outsideWriteDecision } from '../src/tools/shell-policy.js';
import type { ToolPolicy } from '../src/types.js';

// K3: kiểm chặn nhầm độc lập của rule `outside-root-write`. Lệnh dev thường gặp, mọi lệnh nằm trong
// workspace (hoặc thư mục tạm) PHẢI được rule này cho qua ở CẢ HAI đường: hook claude-guard và run_command.
// Lệnh bị rule KHÁC chặn (vd. deny-list) ghi rõ trong cột `other`, không tính là chặn nhầm của outside-root-write.
// Chỉ dữ liệu giả; lệnh có tác dụng phụ không bao giờ được thực thi (chỉ kiểm quyết định).

type Shell = 'Bash' | 'PowerShell';
interface Row { cmd: string; shell: Shell; other?: string; harmless?: boolean }

const tmp = fs.realpathSync(os.tmpdir());
const tmpFile = path.join(tmp, 'ccoding-out.txt');
const ROWS: Row[] = [
  { cmd: 'npm test', shell: 'Bash' },
  { cmd: 'npm run build', shell: 'Bash' },
  { cmd: 'node --test', shell: 'Bash' },
  { cmd: 'npx tsc --noEmit', shell: 'Bash' },
  { cmd: 'git diff', shell: 'Bash' },
  { cmd: 'git status', shell: 'Bash' },
  { cmd: 'git log', shell: 'Bash' },
  { cmd: 'git add -A', shell: 'Bash' },
  { cmd: 'cat package.json', shell: 'Bash' },
  { cmd: 'ls node_modules/.bin', shell: 'Bash' },
  { cmd: 'mkdir -p dist', shell: 'Bash' },
  { cmd: 'rm -rf dist', shell: 'Bash', other: 'deny-list' },
  { cmd: 'cp a.txt b.txt', shell: 'Bash' },
  { cmd: 'mv x y', shell: 'Bash' },
  { cmd: 'echo x > out.txt', shell: 'Bash', harmless: true },
  { cmd: 'echo x > /dev/null', shell: 'Bash', harmless: true },
  { cmd: 'tee log.txt', shell: 'Bash' },
  { cmd: 'echo x | tee -a log.txt', shell: 'Bash' },
  { cmd: 'curl -o vendor/x.js https://example.invalid/x.js', shell: 'Bash' },
  { cmd: 'wget -O vendor/x.js https://example.invalid/x.js', shell: 'Bash' },
  { cmd: `echo x > "${tmpFile}"`, shell: 'Bash' },
  { cmd: 'echo x > /tmp/out.txt', shell: 'Bash' },
  { cmd: 'cd sub && mkdir -p dist', shell: 'Bash' },
  { cmd: 'Get-ChildItem', shell: 'PowerShell' },
  { cmd: 'Set-Content out.txt x', shell: 'PowerShell' },
  { cmd: 'Remove-Item dist -Recurse', shell: 'PowerShell', other: 'deny-list' },
  { cmd: 'Remove-Item out.txt', shell: 'PowerShell' },
  { cmd: 'New-Item -ItemType Directory dist', shell: 'PowerShell' },
  { cmd: 'Copy-Item a.txt b.txt', shell: 'PowerShell' },
  { cmd: 'Get-Content package.json | Set-Content out.txt', shell: 'PowerShell' },
  { cmd: `Set-Content "${tmpFile}" x`, shell: 'PowerShell' },
];
if (process.platform === 'win32') {
  // Biến môi trường kiểu Windows chỉ có nghĩa trên Windows; trên Linux `%TEMP%`/`$env:TEMP` không phải đường dẫn.
  ROWS.push({ cmd: 'Set-Content $env:TEMP\\out.txt x', shell: 'PowerShell' }, { cmd: 'echo x > %TEMP%\\out.txt', shell: 'Bash' });
} else {
  ROWS.push({ cmd: 'echo x > $TMPDIR/out.txt', shell: 'Bash' }); // $TMPDIR là cách ghi thư mục tạm trên Linux/macOS
}

function ws(): { root: string; policy: ToolPolicy; cleanup: () => void } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-owfp-')));
  fs.mkdirSync(path.join(root, 'sub'));
  const policy: ToolPolicy = { root, allow: ['run_command'], maxTurns: 5, commandTimeoutSec: 30, maxOutputChars: 4000, denyCommands: [], allowGitCommit: false };
  return { root, policy, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('bảng có ít nhất 20 lệnh, đủ Bash và PowerShell', () => {
  assert.ok(ROWS.length >= 20);
  assert.ok(ROWS.some((r) => r.shell === 'Bash') && ROWS.some((r) => r.shell === 'PowerShell'));
});

for (const row of ROWS) {
  test(`outside-root-write không chặn nhầm [${row.shell}]: ${row.cmd}`, async () => {
    const { root, policy, cleanup } = ws();
    try {
      // Đường 1: hook claude-guard
      const g = guardBlock({ tool_name: row.shell, tool_input: { command: row.cmd } }, { root, deny: [], allowGitCommit: false });
      assert.notEqual(g?.rule, 'outside-root-write', `guard chặn nhầm: ${g?.reason}`);
      assert.notEqual(g?.rule, 'outside-root', `guard chặn nhầm (outside-root): ${g?.reason}`);
      assert.equal(g?.rule, row.other, `guard: rule nguồn phải là ${row.other ?? 'không chặn'}, thực tế ${g?.rule}`);

      // Đường 2: run_command dùng đúng hàm quyết định chung
      assert.equal(outsideWriteDecision(row.cmd, root), undefined, 'hàm quyết định chung chặn nhầm');
      assert.equal(outsidePathReason(row.cmd, root), undefined, 'outsidePathReason chặn nhầm');
      if (row.harmless) {
        const r = await executeTool('run_command', { command: row.cmd }, policy);
        assert.doesNotMatch(r.output, /outside-root-write|bị chặn/, `run_command chặn nhầm: ${r.output}`);
      }
    } finally {
      cleanup();
    }
  });
}
