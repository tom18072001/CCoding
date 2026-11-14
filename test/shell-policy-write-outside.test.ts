import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { guardBlock } from '../src/tools/claude-guard.js';
import { outsideWriteViolation } from '../src/tools/shell-policy.js';

const root = path.resolve('workspaces/demo/wt-k3');
const cfg = { root, deny: [], allowGitCommit: true };
const sysRoot = process.env.SystemRoot || process.env.windir; // chỉ có trên Windows

const rule = (tool: 'Bash' | 'PowerShell', command: string): string | undefined => guardBlock({ tool_name: tool, tool_input: { command } }, cfg)?.rule;

// Mỗi dạng chặn: [Bash, PowerShell]
const DENIED: Array<[string, string, string]> = [
  ['rm', 'rm /etc/demo.conf', 'Remove-Item /etc/demo.conf'],
  ['del', 'rm -f /usr/local/x', 'del /var/lib/x'],
  ['rmdir', 'rmdir /opt/app', 'rmdir /opt/app'],
  ['cp đối số cuối', 'cp a.txt /usr/local/bin/a', 'Copy-Item a.txt /usr/local/bin/a'],
  ['mv đối số cuối', 'mv a.txt /opt/a.txt', 'Move-Item a.txt /opt/a.txt'],
  ['-Destination', 'cp -t /opt/dir a.txt', 'Copy-Item -Path a.txt -Destination /opt/dir'],
  ['chuyển hướng >', 'echo x > /etc/demo.conf', 'echo x > /etc/demo.conf'],
  ['chuyển hướng >>', 'echo x >> /usr/share/demo', 'echo x >> /usr/share/demo'],
  ['tee', 'echo x | tee /etc/demo.conf', 'echo x | tee -FilePath /etc/demo.conf'],
  ['wget -O', 'wget -O /usr/local/bin/x https://example.invalid/x', 'wget --output-document=/opt/x https://example.invalid/x'],
  ['curl -o', 'curl -o /opt/x https://example.invalid/x', 'curl --output /opt/x https://example.invalid/x'],
  ['-OutFile / iwr', 'curl -o /opt/y https://example.invalid/y', 'iwr https://example.invalid/y -OutFile /opt/y'],
  ['Invoke-WebRequest -OutFile', 'curl -o /opt/z https://example.invalid/z', 'Invoke-WebRequest -Uri https://example.invalid/z -OutFile /opt/z'],
  ['chmod', 'chmod 777 /etc/demo.conf', 'icacls /etc/demo.conf /grant x:F'],
  ['chown', 'chown nobody /usr/local/x', 'takeown /f /usr/local/x'],
  ['ln', 'ln -s a.txt /usr/local/bin/a', 'New-Item -ItemType SymbolicLink -Path /usr/local/bin/a'],
  ['sudo/env tiền tố', 'sudo rm /etc/demo.conf', 'FOO=1 rm /etc/demo.conf'],
  ['nối câu', 'npm test && rm /opt/x', 'npm test; Remove-Item /opt/x'],
];

for (const [label, bash, ps] of DENIED) {
  test(`outside-root-write chặn: ${label} (Bash)`, () => assert.equal(rule('Bash', bash), 'outside-root-write', bash));
  test(`outside-root-write chặn: ${label} (PowerShell)`, () => assert.equal(rule('PowerShell', ps), 'outside-root-write', ps));
}

test('outside-root-write: thư mục hệ thống Windows (khi chạy trên Windows)', { skip: !sysRoot }, () => {
  const w = sysRoot!.replace(/\\/g, '/');
  for (const c of [`rm ${w}/System32/x.dll`, `Remove-Item ${sysRoot}\\Temp\\..\\x.dll`.replace('Temp\\..\\', ''), `echo x > ${w}/win.ini`, `Copy-Item a.txt -Destination ${sysRoot}\\x`, `iwr https://example.invalid/x -OutFile ${sysRoot}\\x.exe`]) {
    assert.equal(rule('Bash', c), 'outside-root-write', c);
    assert.equal(rule('PowerShell', c), 'outside-root-write', c);
  }
});

test('outside-root-write: ổ đĩa ngoài gốc vẫn do outside-root cũ chặn', () => {
  assert.equal(rule('Bash', 'rm -f Z:/data/x'), 'outside-root');
  assert.equal(rule('PowerShell', 'Remove-Item Z:\\data\\x'), 'outside-root');
});

test('outside-root-write: thông báo có clause và tên lệnh, không chép đường dẫn vào cmd', () => {
  const b = guardBlock({ tool_name: 'Bash', tool_input: { command: 'npm test && rm /opt/secret-dir' } }, cfg);
  assert.equal(b?.rule, 'outside-root-write');
  assert.equal(b?.clause, 2);
  assert.equal(b?.cmd, 'rm');
  const r = guardBlock({ tool_name: 'Bash', tool_input: { command: 'echo x > /opt/y' } }, cfg);
  assert.equal(r?.cmd, '>');
});

const ALLOWED_READ_RUN = [
  'ls /usr/bin',
  'cat /etc/os-release',
  '/usr/bin/env node x.js',
  '/usr/bin/node x.js',
  '/usr/bin/git status',
  'node /usr/lib/node_modules/npm/bin/npm-cli.js -v',
  'grep -r foo /usr/share/doc',
  'Get-Content /etc/os-release',
  'Get-ChildItem /usr/bin',
];
for (const c of ALLOWED_READ_RUN) {
  test(`cho qua đọc/chạy từ thư mục hệ thống: ${c}`, () => {
    assert.equal(outsideWriteViolation(c, root), undefined, c);
    assert.equal(rule('Bash', c), undefined, c);
  });
}

// D7: tải về thư mục con của workspace bắt buộc qua
const ALLOWED_IN_ROOT = [
  'wget -O vendor/x.js https://example.invalid/x.js',
  'wget --output-document=vendor/x.js https://example.invalid/x.js',
  'curl -o vendor/x.js https://example.invalid/x.js',
  'curl --output vendor/x.js https://example.invalid/x.js',
  'iwr https://example.invalid/x.js -OutFile vendor\\x.js',
  'Invoke-WebRequest -Uri https://example.invalid/x.js -OutFile vendor/x.js',
  'rm -f out/a.txt',
  'Remove-Item out\\a.txt',
  'cp a.txt out/a.txt',
  'Copy-Item a.txt -Destination out/a.txt',
  'mv a.txt out/',
  'chmod +x scripts/run.sh',
  'ln -s a.txt out/link',
  'echo x >> logs/a.txt',
  'echo x | tee out/a.txt',
  'echo x > /dev/null',
  'npm test 2>/dev/null',
  'echo x > /tmp/k3-demo.txt',
  'cp a.txt /tmp/a.txt',
  'echo x > $null',
  `echo x > ${path.join(root, 'out.txt').replace(/\\/g, '/')}`,
  'grep "a > b" notes.txt',
  `echo 'rm /etc/x' > note.txt`,
];
for (const c of ALLOWED_IN_ROOT) {
  test(`cho qua thao tác trong workspace/tạm: ${c}`, () => {
    assert.equal(outsideWriteViolation(c, root), undefined, c);
    assert.equal(rule('Bash', c), undefined, c);
    assert.equal(rule('PowerShell', c), undefined, c);
  });
}

const DEV_COMMANDS = [
  'npm test',
  'node --test',
  'node --test test/a.test.ts',
  'git diff',
  'git diff --stat HEAD~1',
  'git status',
  'git log --oneline -5',
  'npx tsc',
  'npx tsc --noEmit -p tsconfig.json',
  'cat package.json',
  'ls node_modules/.bin',
  'npm run typecheck',
  'node -e "console.log(1 > 0)"',
  'mkdir -p out && cp a out/',
  'npm test 2>&1 | tail',
  'npm test 2>&1 | tail -20',
  'echo x > out.txt',
  'npm ci && npm run build',
];
test('danh sách lệnh dev (≥ 12) không bị rule outside-root-write chặn', () => {
  assert.ok(DEV_COMMANDS.length >= 12);
  for (const c of DEV_COMMANDS) {
    assert.equal(outsideWriteViolation(c, root), undefined, c);
    assert.equal(rule('Bash', c), undefined, c);
    assert.equal(rule('PowerShell', c), undefined, c);
  }
});

test('outside-root-write: dd of= (dd nằm trong denyCommands mặc định nên kiểm thẳng bộ phân tích)', () => {
  assert.ok(outsideWriteViolation('dd if=a.bin of=/opt/disk.img', root));
  assert.equal(outsideWriteViolation('dd if=a.bin of=out/disk.img', root), undefined);
});

test('tầng git-read không đổi: lệnh ghi vẫn bị rule cũ (không phải outside-root-write) chặn trước', () => {
  const b = guardBlock({ tool_name: 'Bash', tool_input: { command: 'rm /opt/x' } }, { ...cfg, shell: 'git-read' });
  assert.ok(b);
  assert.notEqual(b?.rule, 'outside-root-write');
});
