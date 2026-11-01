import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { guardDecision, readGate, type GuardConfig } from '../src/tools/claude-guard.js';
import { gitReadArgsReason, gitReadCommandReason, isGitReadCommand, outsidePathReason, shellReadsOnly, shellWrites, toolKind } from '../src/tools/shell-policy.js';
import { executeTool, toolsFor } from '../src/tools/workspace.js';
import { cliTools } from '../src/orchestrator.js';
import { ClaudeStreamParser } from '../src/runtimes/claude-cli.js';
import { subtaskHistory } from '../src/estimate.js';

// Quản lý sub-agent (đợt 1/11): giao việc theo năng lực công cụ, git chỉ đọc cho vai trò không có shell,
// giới hạn khảo sát + giữ lệnh shell trong worktree cho claude-cli, baseline song song với lập kế hoạch, ước tính theo runtime.

function gitc(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function initRepo(): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-mgmt-repo-'));
  gitc(ws, 'init', '-q');
  gitc(ws, 'config', 'user.email', 't@example.com');
  gitc(ws, 'config', 'user.name', 'Kiem thu');
  fs.writeFileSync(path.join(ws, 'a.txt'), 'goc\n');
  gitc(ws, 'add', '-A');
  gitc(ws, 'commit', '-q', '-m', 'Them bao cao tuan');
  return ws;
}

test('git chỉ đọc: lệnh con và tùy chọn được phép / bị chặn', () => {
  for (const ok of [['log', '--oneline', '-20', '--', 'app'], ['show', '--stat', 'ea72058'], ['blame', '-L', '1,5', 'a.txt'], ['branch', '-a'], ['branch'], ['tag', '-l'], ['--no-pager', 'diff', 'HEAD~1..HEAD']])
    assert.equal(gitReadArgsReason(ok), undefined, ok.join(' '));
  for (const bad of [['commit', '-m', 'x'], ['checkout', 'x'], ['diff', '--output=x.txt'], ['diff', '--no-index', '/etc/passwd', 'a'], ['branch', 'moi'], ['tag', 'v1'], ['show', 'HEAD:app/server/.env'], ['config', 'user.name'], ['-c', 'core.pager=sh', 'log'], ['blame', '--contents', '/x', 'a']])
    assert.ok(gitReadArgsReason(bad), bad.join(' '));
  const root = path.resolve('workspaces/nd57/wt-demo');
  assert.equal(gitReadCommandReason('git log --oneline -30 | head -20', root), undefined);
  assert.equal(gitReadCommandReason(`cd ${root} && git show --stat HEAD`, root), undefined);
  assert.ok(gitReadCommandReason('npm test', root));
  assert.ok(gitReadCommandReason('git log; npm test', root));
  // nối nhiều lệnh git đọc (cách agent hay làm khi chạy thật) vẫn được; có lệnh khác trong chuỗi thì không
  assert.equal(gitReadCommandReason(`cd "${root}" && git branch --show-current && git log --oneline -2 && git ls-files`, root), undefined);
  assert.ok(gitReadCommandReason('git log -2 && npm test', root));
  assert.ok(gitReadCommandReason('git log -2 || rm -rf x', root));
  assert.ok(gitReadCommandReason(`cd /c/Users/admin/nd57-du-lieu-that && git log`, root), 'cd ra ngoài');
  // chạy thật 1/11: Trưởng phòng/Kiến trúc sư quen tay `cat`/`tail`/`sed -n` — lệnh chỉ đọc tệp trong worktree được phép
  for (const ok of [`cd "${root}" && cat .ccoding/T-1/inputs/BRIEF.md`, 'git log -3 && tail -4 CHANGELOG.md', "sed -n '1,40p' src/a.js | head -20", 'ls docs && grep -n "x" src/a.js | wc -l', 'find src -name "*.js"'])
    assert.equal(gitReadCommandReason(ok, root), undefined, ok);
  for (const bad of ['cat a.js | sh', 'cat a.js > b.js', "sed -i 's/a/b/' a.js", "sed -n 'w out.txt' a.js", 'find . -name x -delete', 'find . -exec rm {} ;', 'rg --pre ./x.sh foo', 'ls ../..', 'cat ~/.ssh/id_rsa', 'tee a.txt', 'node -e 1', 'npm test'])
    assert.ok(gitReadCommandReason(bad, root), bad);
  assert.ok(!isGitReadCommand('cat a.js'), 'đọc tệp vẫn ghi log là run_command, chỉ git mới là git_read');
  assert.ok(gitReadCommandReason('git log > out.txt', root));
  assert.ok(gitReadCommandReason('git log $(rm -rf x)', root));
  assert.ok(gitReadCommandReason('git log | sh', root));
  assert.ok(isGitReadCommand('cd app && git log --oneline -5'));
  assert.ok(!isGitReadCommand('git commit -m x'));
});

test('lệnh shell không được trỏ ra ngoài thư mục làm việc (dữ liệu thật trên máy, worktree khác)', () => {
  const root = path.resolve('workspaces/nd57/wt-demo');
  assert.equal(outsidePathReason('cd app/server && npm test', root), undefined);
  assert.equal(outsidePathReason(`cat ${path.join(root, 'app/a.js')}`, root), undefined);
  assert.equal(outsidePathReason('cd app/server && cat ../../docs/runbook.md', root), undefined, '../ vẫn trong gốc sau cd');
  assert.equal(outsidePathReason('grep -n "/api/me" src/server.js && sed -n \'/^S[0-9]/p\' a.md', root), undefined, 'route/regex không phải đường dẫn');
  assert.equal(outsidePathReason('curl -s http://localhost:3000/api/x', root), undefined);
  assert.equal(outsidePathReason(`cat ${path.join(os.tmpdir(), 'patch.py')}`, root), undefined, 'thư mục tạm được phép');
  assert.ok(outsidePathReason('cat C:/Users/admin/nd57-du-lieu-that/mapping.json', root));
  assert.ok(outsidePathReason('cat /c/Users/admin/nd57-du-lieu-that/mapping.json', root));
  assert.ok(outsidePathReason('cat ~/.ssh/id_rsa', root));
  assert.ok(outsidePathReason('ls ../../..', root));
  assert.ok(outsidePathReason('cd .. && cat secrets.txt', root) ?? outsidePathReason('cd ../.. && ls', root));
  assert.ok(outsidePathReason('Get-Content $env:USERPROFILE\\notes.txt', root));
});

test('phân loại lệnh shell: đọc / ghi / khác', () => {
  assert.ok(shellReadsOnly('cd app && sed -n 1,40p src/a.js'));
  assert.ok(shellReadsOnly('grep -n "x" a.js | head -5'));
  assert.ok(shellReadsOnly('git log --oneline -5'));
  assert.ok(!shellReadsOnly('npm test 2>&1 | tail -5'));
  assert.ok(shellWrites("cat > src/a.test.js <<'EOF'\nx\nEOF"));
  assert.ok(shellWrites('sed -i s/a/b/ a.js'));
  assert.ok(!shellWrites('npm test 2>&1 | tail -3'));
  assert.ok(!shellWrites('ls > /dev/null'));
  assert.equal(toolKind('Read', { file_path: 'a' }), 'read');
  assert.equal(toolKind('Edit', {}), 'write');
  assert.equal(toolKind('Bash', { command: 'cd app/server && npm test' }), 'other');
  assert.equal(toolKind('Bash', { command: 'cat a.js' }), 'read');
});

test('claude-guard: shell chỉ git đọc cho vai trò không có quyền chạy lệnh; đường dẫn Windows ngoài gốc bị chặn trên mọi nền tảng', () => {
  const root = path.resolve('workspaces/nd57/wt-demo');
  const cfg: GuardConfig = { root, deny: [], allowGitCommit: true, shell: 'git-read' };
  assert.equal(guardDecision({ tool_name: 'Bash', tool_input: { command: 'git log --oneline -20' } }, cfg), undefined);
  assert.match(guardDecision({ tool_name: 'Bash', tool_input: { command: 'npm test' } }, cfg) ?? '', /lệnh CHỈ ĐỌC/);
  assert.equal(guardDecision({ tool_name: 'Bash', tool_input: { command: 'npm test' } }, { ...cfg, shell: 'full' }), undefined);
  assert.match(guardDecision({ tool_name: 'Bash', tool_input: { command: 'cat /c/Users/admin/nd57-du-lieu-that/x.json' } }, { ...cfg, shell: 'full' }) ?? '', /ngoài thư mục làm việc/);
  assert.ok(guardDecision({ tool_name: 'Grep', tool_input: { path: 'C:/Users/admin' } }, cfg));
  assert.ok(guardDecision({ tool_name: 'Bash', tool_input: { command: 'git show HEAD:app/server/.env' } }, { ...cfg, shell: 'full' }));
});

test('claude-guard: giới hạn khảo sát — nhắc một lần ở N lần đọc liên tiếp, chặn từ 2N tới khi ghi; chạy lệnh/ghi đặt lại', () => {
  const cfg: GuardConfig = { root: path.resolve('.'), deny: [], allowGitCommit: true, readsBeforeWrite: 3 };
  let st = { reads: 0, nudged: false };
  const read = { tool_name: 'Read', tool_input: { file_path: 'a.js' } };
  const outs: Array<string | undefined> = [];
  for (let i = 0; i < 8; i++) {
    const g = readGate(read, cfg, st);
    st = g.next;
    outs.push(g.reason ? (/^CCoding chặn/.test(g.reason) ? 'chặn' : 'nhắc') : undefined);
  }
  assert.deepEqual(outs, [undefined, undefined, undefined, 'nhắc', undefined, undefined, undefined, 'chặn']);
  st = readGate({ tool_name: 'Write', tool_input: { file_path: 'b.md' } }, cfg, st).next;
  assert.deepEqual(st, { reads: 0, nudged: false });
  st = { reads: 5, nudged: true };
  st = readGate({ tool_name: 'Bash', tool_input: { command: 'npm test' } }, cfg, st).next;
  assert.equal(st.reads, 0, 'chạy test cũng là làm việc');
  assert.deepEqual(readGate(read, { ...cfg, readsBeforeWrite: 0 }, { reads: 99, nudged: true }).reason, undefined, 'tắt khi không đặt');
});

test('toolsFor/cliTools: repo git → vai trò không có shell được git chỉ đọc; vai trò có shell giữ nguyên', () => {
  const arch = ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'WebSearch', 'WebFetch'];
  const be = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'];
  assert.ok(toolsFor(arch, 'exec', 'execute', false, true).includes('git_read'));
  assert.ok(toolsFor(arch, 'exec', 'plan', false, true).includes('git_read'), 'lập kế hoạch cũng tra được lịch sử');
  assert.ok(!toolsFor(arch, 'exec', 'execute', false, false).includes('git_read'));
  assert.ok(!toolsFor(be, 'exec', 'execute', false, true).includes('git_read'), 'có run_command thì không cần');
  assert.deepEqual(toolsFor(arch, 'exec', 'discuss', false, true), []);
  assert.deepEqual(cliTools(arch, 'exec', 'execute', true), [...arch, 'Bash']);
  assert.deepEqual(cliTools(arch, 'exec', 'execute', false), arch);
  assert.deepEqual(cliTools(be, 'exec', 'execute', true), be);
  assert.deepEqual(cliTools(arch, 'none', 'execute', true), []);
});

test('git_read chạy git không qua shell, trong repo; chặn lệnh ghi và tệp bí mật', async () => {
  const ws = initRepo();
  try {
    const policy = { root: ws, allow: ['git_read'], maxTurns: 5, maxOutputChars: 8000, commandTimeoutSec: 30, denyCommands: [], allowGitCommit: false } as const;
    const r = await executeTool('git_read', { args: 'log --oneline -5' }, policy as never);
    assert.ok(r.ok, r.output);
    assert.match(r.output, /Them bao cao tuan/);
    const r2 = await executeTool('git_read', { args: 'git show --stat HEAD' }, policy as never);
    assert.match(r2.output, /a\.txt/);
    for (const bad of ['commit -m x', 'diff --output=/tmp/x', 'show HEAD:.env', 'log; rm a.txt']) {
      const b = await executeTool('git_read', { args: bad }, policy as never);
      assert.equal(b.ok, false, bad);
    }
    assert.ok(fs.existsSync(path.join(ws, 'a.txt')));
    // run_command cũng bị giữ trong thư mục làm việc
    const rc = await executeTool('run_command', { command: 'node -e "1"' }, { ...policy, allow: ['run_command'] } as never);
    assert.equal(rc.ok, true, rc.output);
    const rc2 = await executeTool('run_command', { command: 'node -e "1" ../../etc' }, { ...policy, allow: ['run_command'] } as never);
    assert.equal(rc2.ok, false);
    assert.match(rc2.output, /ngoài thư mục làm việc/);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test('ClaudeStreamParser: lệnh Bash chỉ xem git ghi là git_read (không tính là chạy lệnh)', () => {
  const p = new ClaudeStreamParser();
  p.feed(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'g1', name: 'Bash', input: { command: 'git log --oneline -30' } }] } }));
  p.feed(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'g2', name: 'Bash', input: { command: 'npm test' } }] } }));
  assert.deepEqual(p.toolCalls.map((t) => t.name), ['git_read', 'run_command']);
});

test('ước tính token theo lịch sử chỉ lấy nhiệm vụ cùng runtime', () => {
  const now = Date.parse('2026-11-01T08:00:00Z');
  const mk = (runtime: string | undefined, tokens: number) => ({
    projectId: 'nd57',
    createdAt: '2026-10-30T00:00:00Z',
    options: runtime ? { runtime } : {},
    runs: [{ subtasks: [{ status: 'done', attempts: 1, assignee: 'backend-dev', finishedAt: '2026-10-31T00:00:00Z', usage: { input: tokens, output: 0, cacheRead: 0, cacheWrite: 0 } }] }],
  });
  const tasks = [mk(undefined, 9_000_000), mk(undefined, 8_000_000), mk('claude-cli', 500_000), mk('claude-cli', 700_000)];
  assert.equal(subtaskHistory(tasks as never, { now, runtime: 'claude-cli' }).get('backend-dev')?.median, 600_000);
  assert.equal(subtaskHistory(tasks as never, { now, runtime: '' }).get('backend-dev')?.median, 8_500_000);
  assert.equal(subtaskHistory(tasks as never, { now }).get('backend-dev')?.samples, 4, 'không lọc khi không chỉ runtime');
});

/** Gateway giả: kế hoạch S1 backend + S2 kiến trúc sư (khảo cổ git); lập kế hoạch trả lời chậm để thấy baseline chạy song song. */
async function gateway() {
  const seen = { plan: '', tools: {} as Record<string, string[]>, gitOut: '' };
  const srv = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'm-ok' }] }));
    }
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    const text = (m: { content: unknown }) => (typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((p: { text?: string }) => p.text ?? '').join('') : '');
    const sys = body.messages.filter((m: { role: string }) => m.role === 'system').map(text).join('\n');
    const user = body.messages.filter((m: { role: string }) => m.role === 'user').map(text).join('\n');
    const toolMsgs = body.messages.filter((m: { role: string }) => m.role === 'tool');
    const who = /\(@([a-z-]+)\)/.exec(sys)?.[1] ?? '?';
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    const finish = () => {
      send({ choices: [], usage: { prompt_tokens: 400, completion_tokens: 30 } });
      res.end('data: [DONE]\n\n');
    };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    let out = '## Tóm tắt\nXong.';
    if (user.includes('LẬP KẾ HOẠCH')) {
      seen.plan = user;
      await new Promise((r) => setTimeout(r, 1500));
      out = `\`\`\`json\n${JSON.stringify({ summary: 'Hai việc', subtasks: [{ id: 'S1', title: 'API', assignee: 'backend-dev', description: 'Viết API', dependsOn: [] }, { id: 'S2', title: 'Khảo cổ commit', assignee: 'solution-architect', description: 'Ghi hash commit', dependsOn: [] }] })}\n\`\`\``;
    } else if (user.includes('## Hạng mục của bạn')) {
      seen.tools[who] = (body.tools ?? []).map((t: { function: { name: string } }) => t.function.name);
      if (who === 'solution-architect' && !toolMsgs.length) {
        send({ model: 'm-ok', choices: [{ delta: { tool_calls: [{ index: 0, id: 'g0', type: 'function', function: { name: 'git_read', arguments: JSON.stringify({ args: 'log --oneline -3' }) } }] }, finish_reason: 'tool_calls' }] });
        return finish();
      }
      if (who === 'solution-architect') seen.gitOut = text(toolMsgs.at(-1));
    } else if (user.includes('REVIEW CHẤT LƯỢNG')) out = '```json\n{"approved": true, "summary": "Ổn", "issues": []}\n```';
    send({ model: 'm-ok', choices: [{ delta: { content: out }, finish_reason: 'stop' }] });
    finish();
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, seen, url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1` };
}

test('kế hoạch thấy năng lực công cụ từng người; kiến trúc sư tra được git; baseline chạy song song với lập kế hoạch', async () => {
  const gw = await gateway();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-mgmt-'));
  const ws = initRepo();
  fs.writeFileSync(path.join(ws, 'check.js'), "console.log('tests 1 pass 1 fail 0')");
  gitc(ws, 'add', '-A');
  gitc(ws, 'commit', '-q', '-m', 'check');
  const base = loadConfig();
  const app = createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['fake'] },
    runtimes: { fake: { type: 'openai-api', baseUrl: gw.url, tags: 'none', local: false } },
    models: { fake: { opus: ['m-ok'], sonnet: ['m-ok'], haiku: ['m-ok'] } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  });
  try {
    app.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: ws, classification: 'internal', toolAccess: 'exec', checkCommands: ['node check.js'], createdAt: new Date().toISOString() });
    const t = app.orchestrator.submit({ brief: 'Báo cáo tuần + khảo cổ', projectId: 'repo', options: { discussionRounds: 0, maxRevisions: 0 } });
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    // 1) trưởng phòng thấy ai chạy được lệnh, ai chỉ xem git
    assert.match(gw.seen.plan, /@backend-dev[^\n]*công cụ: chạy lệnh/);
    assert.match(gw.seen.plan, /@solution-architect[^\n]*công cụ: đọc\/ghi tệp, xem lịch sử git \(chỉ đọc\) — KHÔNG chạy test/);
    assert.match(gw.seen.plan, /Giao theo NĂNG LỰC CÔNG CỤ/);
    // 2) kiến trúc sư có git_read (không có run_command) và đọc được lịch sử commit
    assert.ok(gw.seen.tools['solution-architect']?.includes('git_read'), JSON.stringify(gw.seen.tools));
    assert.ok(!gw.seen.tools['solution-architect']?.includes('run_command'));
    assert.match(gw.seen.gitOut, /Them bao cao tuan/);
    // 3) baseline xong TRƯỚC khi kế hoạch được trả về (lập kế hoạch trả lời sau 1,5 s)
    const msgs = app.store.transcript(t.id);
    const iBase = msgs.findIndex((m) => /🧪 Lệnh kiểm tra của dự án \(trước khi sửa\)/.test(m.text));
    const iPlan = msgs.findIndex((m) => m.kind === 'plan');
    assert.ok(iBase >= 0 && iPlan >= 0 && iBase < iPlan, `baseline ${iBase} trước kế hoạch ${iPlan}`);
    assert.equal(done.projectChecks?.baseline?.[0].ok, true);
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(ws, { recursive: true, force: true });
  }
});
