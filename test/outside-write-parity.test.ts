import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { guardBlock } from '../src/tools/claude-guard.js';
import { executeTool } from '../src/tools/workspace.js';
import { outsideWriteDecision } from '../src/tools/shell-policy.js';
import type { ToolPolicy } from '../src/types.js';

// K1: hook claude-guard và run_command phải cho CÙNG quyết định trên cùng lệnh (chỉ dữ liệu giả).
const sysRoot = process.env.SystemRoot || process.env.windir; // chỉ có trên Windows

// [nhãn, lệnh, bị chặn?]. Ca chặn không bao giờ được thực thi; ca cho qua chỉ dùng lệnh vô hại.
const TABLE: Array<[string, string, boolean]> = [
  ['xóa trong /etc', 'rm /etc/demo.conf', true],
  ['xóa đệ quy /usr', 'rm -f /usr/local/demo', true],
  ['chmod /etc', 'chmod 777 /etc/demo.conf', true],
  ['chown /usr', 'chown nobody /usr/local/x', true],
  ['ghi > /etc', 'echo x > /etc/demo.conf', true],
  ['ghi >> /usr', 'echo x >> /usr/share/demo', true],
  ['tee /etc', 'echo x | tee /etc/demo.conf', true],
  ['cp ra /opt', 'cp a.txt /opt/a.txt', true],
  ['mv ra /opt', 'mv a.txt /opt/a.txt', true],
  ['curl -o /opt', 'curl -o /opt/x https://example.invalid/x', true],
  ['wget -O /usr', 'wget -O /usr/local/bin/x https://example.invalid/x', true],
  ['nối câu', 'node -v && rm /opt/x', true],
  ['PowerShell Remove-Item', 'Remove-Item /etc/demo.conf', true],
  ['ghi trong workspace', 'echo x > out.txt', false],
  ['ghi trong thư mục con', 'echo x > sub/out.txt', false],
  ['/dev/null', 'echo x > /dev/null', false],
  ['node -v', 'node -v', false],
  ['echo thuần', 'echo hello', false],
];
if (sysRoot) {
  TABLE.push(['Windows xóa', `rm ${sysRoot}\\demo.txt`, true], ['Windows Remove-Item', `Remove-Item ${sysRoot}\\demo.txt`, true]);
}

function ws(): { root: string; policy: ToolPolicy; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-owp-'));
  fs.mkdirSync(path.join(root, 'sub'));
  const policy: ToolPolicy = {
    root,
    allow: ['run_command'],
    maxTurns: 5,
    commandTimeoutSec: 30,
    maxOutputChars: 4000,
    denyCommands: [],
    allowGitCommit: false,
  };
  return { root, policy, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

const guard = (cmd: string, root: string) => guardBlock({ tool_name: 'Bash', tool_input: { command: cmd } }, { root, deny: [], allowGitCommit: false });

for (const [label, cmd, blocked] of TABLE) {
  test(`outside-write parity: ${label} → ${blocked ? 'chặn' : 'cho qua'} ở cả hai đường`, async () => {
    const { root, policy, cleanup } = ws();
    try {
      const real = fs.realpathSync(root);
      const decision = outsideWriteDecision(cmd, real);
      const g = guard(cmd, real);
      const r = await executeTool('run_command', { command: cmd }, policy);
      if (blocked) {
        assert.ok(g, `guard phải chặn: ${cmd}`);
        assert.equal(r.ok, false, `run_command phải chặn: ${cmd}`);
        assert.match(r.output, /bị chặn/);
        if (decision) {
          assert.equal(g.rule, 'outside-root-write');
          assert.match(r.output, /outside-root-write/);
        }
      } else {
        assert.equal(decision, undefined);
        assert.equal(g, undefined, `guard phải cho qua: ${cmd}`);
        assert.doesNotMatch(r.output, /bị chặn/, `run_command không được chặn: ${cmd}`);
      }
    } finally {
      cleanup();
    }
  });
}

test('outside-write parity: thông điệp run_command nêu tên rule và cùng lý do với guard', async () => {
  const { root, policy, cleanup } = ws();
  try {
    const cmd = 'rm /etc/demo.conf';
    const real = fs.realpathSync(root);
    const d = outsideWriteDecision(cmd, real);
    assert.ok(d);
    const g = guard(cmd, real);
    assert.equal(g?.rule, 'outside-root-write');
    assert.ok(g?.reason.includes(d.reason));
    const r = await executeTool('run_command', { command: cmd }, policy);
    assert.ok(r.output.includes(d.reason));
  } finally {
    cleanup();
  }
});
