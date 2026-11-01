import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { locate, ownersOf } from '../src/diff.js';
import { compareUrl, cleanUrl, shipStatus, shipPush, ShipError } from '../src/ship.js';
import { runCheckCommand } from '../src/tools/workspace.js';
import type { Task } from '../src/types.js';
import { testApp } from './helpers.js';

// UX-2: duyệt kế hoạch trước khi thực thi, bình luận theo dòng → yêu cầu sửa, sẵn sàng gộp / đẩy nhánh, việc nối trên nhánh trước.

function gitc(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
function ident(dir: string) {
  gitc(dir, 'config', 'user.email', 't@example.com');
  gitc(dir, 'config', 'user.name', 'Kiem thu');
}

test('duyệt kế hoạch: dừng sau khi chốt, sửa người làm/bỏ hạng mục/chặn phụ thuộc vòng, duyệt → thực thi theo kế hoạch đã sửa', async () => {
  const app = testApp();
  try {
    const t = app.orchestrator.submit({ brief: 'Thiết kế API quản lý hồ sơ, có phân quyền, log kiểm toán, test và tài liệu', mode: 'department', department: 'dev', options: { planApproval: true, discussionRounds: 0 } });
    assert.equal(t.options.planApproval, true);
    const p = await app.orchestrator.waitFor(t.id);
    assert.equal(p.status, 'paused');
    assert.equal(p.pause?.reason, 'plan');
    const run = p.runs[0];
    assert.ok(run.planReview, 'có thông tin chờ duyệt');
    assert.ok(run.planReview!.roster.length >= 3);
    assert.ok(run.planReview!.roster.every((r) => typeof r.cap === 'string'));
    assert.ok(run.estimate && run.estimate.tokens > 0, 'có ước tính để hiện trên màn duyệt');
    assert.ok(run.subtasks.length >= 2, `kế hoạch mock có ${run.subtasks.length} hạng mục`);
    assert.ok(run.subtasks.every((s) => s.status === 'pending' && s.attempts === 0), 'chưa thực thi hạng mục nào');
    const [a, b] = run.subtasks;
    const other = run.planReview!.roster.find((r) => r.id !== a.assignee && r.id !== 'dev-lead')!.id;
    // lỗi: người ngoài phòng, phụ thuộc không tồn tại, phụ thuộc vòng, bỏ hết
    assert.throws(() => app.orchestrator.updatePlan(t.id, { subtasks: [{ id: a.id, assignee: 'literature-researcher' }] }), /không thuộc nhân sự/);
    assert.throws(() => app.orchestrator.updatePlan(t.id, { subtasks: [{ id: a.id, dependsOn: ['S99'] }] }), /không tồn tại/);
    assert.throws(() => app.orchestrator.updatePlan(t.id, { subtasks: [{ id: a.id, dependsOn: [b.id] }, { id: b.id, dependsOn: [a.id] }] }), /Phụ thuộc vòng/);
    assert.throws(() => app.orchestrator.updatePlan(t.id, { subtasks: run.subtasks.map((s) => ({ id: s.id, remove: true })) }), /ít nhất một/);
    // lưu thay đổi (chưa duyệt)
    const removeId = run.subtasks.at(-1)!.id;
    const saved = app.orchestrator.updatePlan(t.id, { subtasks: [{ id: a.id, assignee: other, title: 'Tiêu đề mới api_key=sk-abcdefghijklmnopqrstuvwxyz012345' }, { id: removeId, remove: true }] });
    assert.equal(saved.status, 'paused');
    const r2 = saved.runs[0];
    assert.equal(r2.subtasks.find((s) => s.id === a.id)!.assignee, other);
    assert.ok(!r2.subtasks.some((s) => s.id === removeId));
    assert.ok(!r2.subtasks.some((s) => s.dependsOn.includes(removeId)), 'bỏ hạng mục thì bỏ luôn khỏi phụ thuộc');
    assert.ok(!r2.subtasks.find((s) => s.id === a.id)!.title.includes('sk-abcdef'), 'che bí mật trong tiêu đề');
    assert.ok(r2.planReview!.edits! >= 2);
    assert.ok(app.store.transcript(t.id).some((m) => m.text.startsWith('📝 Giám đốc sửa kế hoạch')));
    // duyệt + chỉ dẫn → chạy tiếp tới xong, không dừng lần nữa
    const go = app.orchestrator.updatePlan(t.id, { approve: true, note: 'Ưu tiên test trước' });
    assert.ok(['queued', 'running'].includes(go.status), go.status);
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const r3 = done.runs[0];
    assert.equal(r3.planReview!.by, 'director');
    assert.ok(r3.planReview!.approvedAt);
    assert.ok(!r3.subtasks.some((s) => s.id === removeId));
    assert.equal(r3.subtasks.find((s) => s.id === a.id)!.assignee, other);
    assert.ok(r3.subtasks.every((s) => s.status === 'done'));
    assert.ok(done.notes?.some((n) => n.text === 'Ưu tiên test trước'));
    assert.throws(() => app.orchestrator.updatePlan(t.id, { approve: true }), /không ở bước chờ duyệt/);
    // nhiệm vụ không bật duyệt → không dừng
    const t2 = app.orchestrator.submit({ brief: 'Viết hàm kiểm tra email', mode: 'department', department: 'dev', options: { discussionRounds: 0 } });
    assert.equal((await app.orchestrator.waitFor(t2.id)).status, 'done');
  } finally {
    app.cleanup();
  }
});

test('duyệt kế hoạch: Tiếp tục thường = duyệt; dự án bật planApproval áp cho mọi nhiệm vụ; giao riêng không dừng', async () => {
  const app = testApp();
  try {
    app.store.saveProject({ id: 'pa', name: 'Duyệt', department: 'dev', classification: 'internal', planApproval: true, createdAt: new Date().toISOString() } as never);
    const t = app.orchestrator.submit({ brief: 'Lập kế hoạch kiểm thử và viết test cho module báo cáo', projectId: 'pa', options: { discussionRounds: 0 } });
    assert.equal(t.options.planApproval, true);
    assert.equal((await app.orchestrator.waitFor(t.id)).pause?.reason, 'plan');
    app.orchestrator.resume(t.id, {});
    const d = await app.orchestrator.waitFor(t.id);
    assert.equal(d.status, 'done');
    assert.equal(d.runs[0].planReview!.by, 'director');
    const solo = app.orchestrator.submit({ brief: 'Viết kế hoạch kiểm thử', agentId: 'qa-tester', projectId: 'pa' });
    assert.equal((await app.orchestrator.waitFor(solo.id)).status, 'done', 'giao riêng không có kế hoạch để duyệt');
    // nhiệm vụ tắt rõ ràng dù dự án bật
    const off = app.orchestrator.submit({ brief: 'Viết README', projectId: 'pa', options: { planApproval: false, discussionRounds: 0 } });
    assert.equal(off.options.planApproval, undefined);
  } finally {
    app.cleanup();
  }
});

test('bình luận theo dòng → lỗi riêng cho từng hạng mục, một vòng sửa', async () => {
  const app = testApp();
  try {
    const t = app.orchestrator.submit({ brief: 'Viết API đăng nhập và trang đăng nhập, kèm test', mode: 'department', department: 'dev', options: { discussionRounds: 0 } });
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const [s1, s2] = done.runs[0].subtasks;
    assert.throws(() => app.orchestrator.reviewDecision(t.id, { decision: 'reject' }), /Ghi rõ cần sửa gì/);
    const r = app.orchestrator.reviewDecision(t.id, {
      decision: 'reject',
      issues: [
        { subtask: s1.id, comment: '`src/auth.js:12` — thiếu kiểm tra mật khẩu rỗng\n> if (!user) return' },
        { subtask: s1.id, comment: '`src/auth.js:40` — trả 500 thay vì 401' },
        ...(s2 ? [{ subtask: s2.id, comment: '`web/login.html:3` — thiếu nhãn cho ô mật khẩu' }] : []),
      ],
    });
    assert.ok(['queued', 'running'].includes(r.status), r.status);
    const rv = r.runs[0].review!;
    assert.equal(rv.by, 'director');
    const forS1 = rv.issues.filter((i) => i.subtask === s1.id);
    assert.equal(forS1.length, 2, 'mỗi bình luận một lỗi');
    assert.ok(forS1.every((i) => i.severity === 'major' && i.comment.includes('bình luận trên diff')));
    assert.ok(forS1.some((i) => i.comment.includes('src/auth.js:12')));
    assert.deepEqual(r.runs[0].revising?.sort(), [s1.id, s2?.id].filter(Boolean).sort());
    assert.ok(app.store.transcript(t.id).some((m) => m.kind === 'decision' && m.text.includes('src/auth.js:40')));
    const again = await app.orchestrator.waitFor(t.id);
    assert.equal(again.status, 'done');
  } finally {
    app.cleanup();
  }
});

test('ownersOf: tệp → hạng mục theo commit (S/gộp) và lệnh ghi tệp trong nhật ký', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-own-'));
  try {
    const repo = path.join(root, 'repo');
    fs.mkdirSync(repo);
    gitc(repo, 'init', '-q', '-b', 'main');
    ident(repo);
    fs.writeFileSync(path.join(repo, 'a.txt'), '1\n');
    gitc(repo, 'add', '-A');
    gitc(repo, 'commit', '-q', '-m', 'init');
    const base = gitc(repo, 'rev-parse', 'HEAD');
    gitc(repo, 'checkout', '-q', '-b', 'ccoding/t-9');
    fs.writeFileSync(path.join(repo, 'a.txt'), '2\n');
    gitc(repo, 'commit', '-qam', 'CCoding T-9 S1: sửa a');
    gitc(repo, 'checkout', '-q', '-b', 'ccoding/t-9--s2');
    fs.writeFileSync(path.join(repo, 'b.txt'), 'b\n');
    gitc(repo, 'add', '-A');
    gitc(repo, 'commit', '-qm', 'CCoding T-9 S2: thêm b');
    gitc(repo, 'checkout', '-q', 'ccoding/t-9');
    gitc(repo, 'merge', '-q', '--no-ff', '-m', 'CCoding T-9: gộp S2 — thêm b', 'ccoding/t-9--s2');
    fs.mkdirSync(path.join(repo, 'web'));
    fs.writeFileSync(path.join(repo, 'web', 'c.html'), '<p>\n');
    gitc(repo, 'add', '-A');
    gitc(repo, 'commit', '-qm', 'CCoding T-9: Tiêu đề nhiệm vụ');
    const src = locate({ workspace: undefined, branch: 'ccoding/t-9', baseRef: base }, repo)!;
    const own = ownersOf(src, 'T-9', ['a.txt', 'b.txt', 'web/c.html'], [
      { subtaskId: 'S3', name: 'write_file', args: 'web/c.html (4 ký tự)' },
      { subtaskId: 'S3', name: 'edit_file', args: 'C:\\Users\\x\\workspaces\\p\\wt-T-9--S3\\web\\c.html' },
      { subtaskId: 'S6', name: 'edit_file', args: 'C:\\Users\\x\\workspaces\\p\\wt-T-9\\b.txt' },
      { subtaskId: 'S4', name: 'read_file', args: 'a.txt' },
      { subtaskId: 'S5', name: 'write_file', args: 'other/a.txt (1 ký tự)' },
    ]);
    assert.deepEqual(own['a.txt'], ['S1']);
    assert.deepEqual(own['b.txt'], ['S2', 'S6']);
    assert.deepEqual(own['web/c.html'], ['S3']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('sẵn sàng gộp: đẩy nhánh, fast-forward vào nhánh xuất phát, chặn khi không ff / có bí mật / chưa commit; link PR GitHub', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-ship-'));
  try {
    const remote = path.join(root, 'remote.git');
    gitc(root, 'init', '-q', '--bare', '-b', 'main', remote);
    const seed = path.join(root, 'seed');
    gitc(root, 'clone', '-q', remote, seed);
    ident(seed);
    fs.writeFileSync(path.join(seed, 'a.txt'), '1\n');
    gitc(seed, 'add', '-A');
    gitc(seed, 'commit', '-qm', 'init');
    gitc(seed, 'push', '-q', 'origin', 'HEAD:main');
    const repo = path.join(root, 'repo');
    gitc(root, 'clone', '-q', remote, repo);
    ident(repo);
    const wt = path.join(root, 'wt');
    gitc(repo, 'worktree', 'add', '-q', '--no-track', '-b', 'ccoding/t-1', wt, 'origin/main');
    const base = gitc(wt, 'rev-parse', 'HEAD');
    fs.writeFileSync(path.join(wt, 'a.txt'), '2\n');
    gitc(wt, 'commit', '-qam', 'CCoding T-1: sửa a');
    const task = { id: 'T-1', status: 'done', branch: 'ccoding/t-1', baseRef: base, workspace: wt, runs: [{ department: 'dev', subtasks: [{ id: 'S1', status: 'done' }], review: { approved: true, summary: '', issues: [] } }], projectChecks: { baseline: [{ command: 'npm test', ok: true }], latest: [{ command: 'npm test', ok: true }] } } as unknown as Task;
    let st = await shipStatus(task, repo, 'origin/main', { fetch: true });
    assert.equal(st.remote, 'origin');
    assert.equal(st.baseBranch, 'main');
    assert.equal(st.ahead, 1);
    assert.equal(st.behind, 0);
    assert.equal(st.ff, true);
    assert.equal(st.pushed, false);
    assert.equal(st.review, 'approved');
    assert.deepEqual(st.blockers, []);
    // phần chưa commit chặn đẩy
    fs.writeFileSync(path.join(wt, 'tmp.txt'), 'x\n');
    assert.ok((await shipStatus(task, repo, 'origin/main')).blockers.some((b) => b.includes('chưa commit')));
    await assert.rejects(shipPush(task, repo, 'origin/main', 'push'), (e: unknown) => e instanceof ShipError && e.status === 409);
    fs.rmSync(path.join(wt, 'tmp.txt'));
    // đẩy nhánh
    const p = await shipPush(task, repo, 'origin/main', 'push');
    assert.equal(p.ref, 'ccoding/t-1');
    assert.equal(gitc(remote, 'rev-parse', 'refs/heads/ccoding/t-1'), p.head);
    assert.equal((await shipStatus(task, repo, 'origin/main', { fetch: true })).pushed, true);
    // review chưa duyệt → ff cần xác nhận
    (task as { attention?: unknown }).attention = { reason: 'review', detail: 'x', at: '' };
    await assert.rejects(shipPush(task, repo, 'origin/main', 'ff'), /vẫn đẩy/);
    (task as { attention?: unknown }).attention = undefined;
    // fast-forward vào main
    const ff = await shipPush(task, repo, 'origin/main', 'ff');
    assert.equal(ff.ref, 'main');
    assert.equal(gitc(remote, 'rev-parse', 'refs/heads/main'), ff.head);
    // main có commit mới từ nơi khác → không ff, báo xung đột
    gitc(seed, 'pull', '-q', 'origin', 'main');
    fs.writeFileSync(path.join(seed, 'a.txt'), '3\n');
    gitc(seed, 'commit', '-qam', 'khác');
    gitc(seed, 'push', '-q', 'origin', 'HEAD:main');
    fs.writeFileSync(path.join(wt, 'a.txt'), '4\n');
    gitc(wt, 'commit', '-qam', 'CCoding T-1: sửa tiếp');
    st = await shipStatus(task, repo, 'origin/main', { fetch: true });
    assert.equal(st.ff, false);
    assert.equal(st.behind, 1);
    assert.deepEqual(st.conflicts, ['a.txt']);
    await assert.rejects(shipPush(task, repo, 'origin/main', 'ff'), /không fast-forward/);
    // bí mật trong dòng thêm mới → chặn cả đẩy nhánh
    fs.writeFileSync(path.join(wt, 'cfg.js'), "const key = 'sk-abcdefghijklmnopqrstuvwxyz0123456789';\n");
    gitc(wt, 'add', '-A');
    gitc(wt, 'commit', '-qm', 'cfg');
    st = await shipStatus(task, repo, 'origin/main');
    assert.deepEqual(st.secrets, ['cfg.js:1']);
    await assert.rejects(shipPush(task, repo, 'origin/main', 'push'), /khóa\/mật khẩu/);
    // xác nhận là dữ liệu thử → đẩy nhánh được
    assert.equal((await shipPush(task, repo, 'origin/main', 'push', { allowSecrets: true })).ref, 'ccoding/t-1');
    // origin/HEAD không phải nhánh → không có nhánh xuất phát để fast-forward (không tạo refs/heads/HEAD)
    const sh = await shipStatus(task, repo, 'origin/HEAD', { fetch: true });
    assert.equal(sh.baseBranch, undefined);
    await assert.rejects(shipPush(task, repo, 'origin/HEAD', 'ff', { override: true, allowSecrets: true }), /không phải nhánh remote/);
    assert.equal(spawnSync('git', ['-C', remote, 'rev-parse', '--verify', '-q', 'refs/heads/HEAD']).status, 1);
    // nhánh xuất phát không có trên remote → không ff
    await assert.rejects(shipPush(task, repo, 'origin/khong-co', 'ff', { override: true, allowSecrets: true }), /Không có nhánh|không fast-forward|không có commit mới|Không hỏi được/);
    // nhiệm vụ chưa xong → cảnh báo
    assert.ok((await shipStatus({ ...task, status: 'failed' } as Task, repo, 'origin/main')).warnings.some((w) => w.includes('chưa xong')));
    // URL
    assert.equal(cleanUrl('https://u:ghp_x@github.com/a/b.git'), 'https://github.com/a/b.git');
    assert.equal(compareUrl('git@github.com:tom/ND57.git', 'ND57-da-nv', 'ccoding/t-1'), 'https://github.com/tom/ND57/compare/ND57-da-nv...ccoding/t-1?expand=1');
    assert.equal(compareUrl('https://gitlab.com/a/b.git', 'main', 'x'), undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('việc nối trong dự án repo: worktree tách từ nhánh của nhiệm vụ trước (tắt được), nhánh không còn → về nhánh xuất phát', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-cont-'));
  const app = testApp();
  try {
    const repo = path.join(root, 'repo');
    fs.mkdirSync(repo);
    gitc(repo, 'init', '-q', '-b', 'main');
    ident(repo);
    fs.writeFileSync(path.join(repo, 'a.txt'), '1\n');
    gitc(repo, 'add', '-A');
    gitc(repo, 'commit', '-qm', 'init');
    app.store.saveProject({ id: 'cb', name: 'Nối', department: 'dev', workspace: repo, classification: 'internal', toolAccess: 'write', isolation: 'worktree', createdAt: new Date().toISOString() } as never);
    const t1 = app.orchestrator.submit({ brief: 'Viết README', projectId: 'cb', agentId: 'qa-tester' });
    const d1 = await app.orchestrator.waitFor(t1.id);
    assert.equal(d1.status, 'done', d1.error);
    assert.ok(d1.branch);
    // thêm một commit lên nhánh nhiệm vụ trước để kiểm việc nối có nó
    fs.writeFileSync(path.join(d1.workspace!, 'tu-viec-truoc.txt'), 'x\n');
    gitc(d1.workspace!, 'add', '-A');
    gitc(d1.workspace!, 'commit', '-qm', 'việc trước');
    const head1 = gitc(d1.workspace!, 'rev-parse', 'HEAD');
    const t2 = app.orchestrator.submit({ brief: 'Bổ sung mục cài đặt', followUp: t1.id });
    assert.equal(t2.startFrom, d1.branch);
    assert.match(t2.brief, /tách từ nhánh/);
    const d2 = await app.orchestrator.waitFor(t2.id);
    assert.equal(d2.baseRef, head1, 'worktree mới tách từ HEAD nhánh trước');
    assert.ok(fs.existsSync(path.join(d2.workspace!, 'tu-viec-truoc.txt')));
    const t3 = app.orchestrator.submit({ brief: 'Làm lại từ đầu', followUp: t1.id, continueBranch: false });
    assert.equal(t3.startFrom, undefined);
    await app.orchestrator.waitFor(t3.id);
  } finally {
    app.cleanup();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('đầu ra lệnh dài: giữ phần cuối (dòng tổng kết test) thay vì cắt mất', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-out-'));
  try {
    const script = path.join(dir, 'gen.cjs');
    fs.writeFileSync(script, "for (let i = 0; i < 3000; i++) console.log('✔ test số ' + i + ' chạy đúng (1.2ms)'); console.log('ℹ tests 592'); console.log('ℹ pass 592'); console.log('ℹ fail 0');\n");
    const r = await runCheckCommand(`node "${script}"`, dir, { denyCommands: [], timeoutSec: 60, maxChars: 2000 });
    assert.ok(!r.tail.includes('\uFFFD'), 'không vỡ ký tự tiếng Việt giữa hai đoạn dữ liệu');
    assert.equal(r.ok, true);
    assert.match(r.summary, /tests 592/);
    assert.match(r.summary, /fail 0/);
    assert.match(r.tail, /ℹ fail 0/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cổng duyệt kế hoạch: hủy rồi tiếp tục vẫn phải duyệt; không yêu cầu sửa khi kế hoạch chờ duyệt; cảnh báo ngân sách sau khi duyệt', async () => {
  const app = testApp();
  try {
    const t = app.orchestrator.submit({ brief: 'Thiết kế API quản lý hồ sơ, có phân quyền, log kiểm toán, test và tài liệu', mode: 'department', department: 'dev', options: { planApproval: true, discussionRounds: 0, budgetMode: 'pause', budgetTokens: 200000 } });
    assert.equal((await app.orchestrator.waitFor(t.id)).pause?.reason, 'plan');
    assert.throws(() => app.orchestrator.reviewDecision(t.id, { decision: 'reject', note: 'sửa đi' }), /chờ duyệt/);
    // hủy khi đang chờ duyệt rồi tiếp tục → dừng lại ở bước duyệt, chưa thực thi gì
    assert.ok(app.orchestrator.cancel(t.id));
    app.orchestrator.resume(t.id, {});
    const again = await app.orchestrator.waitFor(t.id);
    assert.equal(again.status, 'paused');
    assert.equal(again.pause?.reason, 'plan');
    assert.ok(again.runs[0].subtasks.every((s) => s.attempts === 0), 'chưa hạng mục nào chạy');
    // duyệt → ước tính (~1,4M) vượt ngân sách 200k ở chế độ "pause" → dừng vì ngân sách MỘT lần
    app.orchestrator.updatePlan(t.id, { approve: true });
    const b = await app.orchestrator.waitFor(t.id);
    assert.equal(b.status, 'paused');
    assert.equal(b.pause?.reason, 'budget');
    assert.ok(b.runs[0].planReview?.approvedAt);
    assert.ok(app.store.transcript(t.id).some((m) => m.text.startsWith('📏')));
    app.orchestrator.resume(t.id, { budgetMode: 'complete' });
    assert.equal((await app.orchestrator.waitFor(t.id)).status, 'done');
    // phòng chỉ định không chờ duyệt → từ chối
    assert.throws(() => app.orchestrator.updatePlan(t.id, { department: 'dev', approve: true }), /không ở bước chờ duyệt/);
  } finally {
    app.cleanup();
  }
});

test('việc nối: quét bí mật và đếm cả commit kế thừa từ nhiệm vụ trước', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-inh-'));
  try {
    const remote = path.join(root, 'remote.git');
    gitc(root, 'init', '-q', '--bare', '-b', 'main', remote);
    const repo = path.join(root, 'repo');
    gitc(root, 'clone', '-q', remote, repo);
    ident(repo);
    fs.writeFileSync(path.join(repo, 'a.txt'), '1\n');
    gitc(repo, 'add', '-A');
    gitc(repo, 'commit', '-qm', 'init');
    gitc(repo, 'push', '-q', 'origin', 'HEAD:main');
    gitc(repo, 'fetch', '-q', 'origin');
    // nhiệm vụ trước: commit có khóa
    gitc(repo, 'branch', 'ccoding/t-1', 'origin/main');
    const w1 = path.join(root, 'w1');
    gitc(repo, 'worktree', 'add', '-q', w1, 'ccoding/t-1');
    fs.writeFileSync(path.join(w1, 'cfg.js'), "const k = 'sk-abcdefghijklmnopqrstuvwxyz0123456789';\n");
    gitc(w1, 'add', '-A');
    gitc(w1, 'commit', '-qm', 'T-1');
    const prevHead = gitc(w1, 'rev-parse', 'HEAD');
    // việc nối tách từ nhánh trước, chỉ sửa a.txt
    const w2 = path.join(root, 'w2');
    gitc(repo, 'worktree', 'add', '-q', '-b', 'ccoding/t-2', w2, 'ccoding/t-1');
    fs.writeFileSync(path.join(w2, 'a.txt'), '2\n');
    gitc(w2, 'commit', '-qam', 'T-2');
    const task = { id: 'T-2', status: 'done', branch: 'ccoding/t-2', baseRef: prevHead, startFrom: 'ccoding/t-1', followUpOf: 'T-1', workspace: w2, runs: [{ department: 'dev', subtasks: [{ id: 'S1', status: 'done' }], review: { approved: true, summary: '', issues: [] } }] } as unknown as Task;
    const st = await shipStatus(task, repo, 'origin/main', { fetch: true }, { inheritedFrom: { taskId: 'T-1', head: prevHead, reviewOk: false } });
    assert.equal(st.ahead, 2);
    assert.deepEqual(st.secrets, ['cfg.js:1'], 'quét cả commit của nhiệm vụ trước');
    assert.deepEqual(st.inherited, { taskId: 'T-1', commits: 1, reviewOk: false });
    assert.ok(st.warnings.some((w) => w.includes('nhiệm vụ trước T-1')));
    await assert.rejects(shipPush(task, repo, 'origin/main', 'ff', { allowSecrets: true }), /vẫn đẩy/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('liên phòng: bình luận gắn phòng chỉ nhắm hạng mục của phòng đó', async () => {
  const app = testApp();
  try {
    const t = app.orchestrator.submit({ brief: 'Tổng quan tài liệu về kiểm soát truy cập rồi hiện thực API kiểm quyền', mode: 'joint', options: { discussionRounds: 0 } });
    const d = await app.orchestrator.waitFor(t.id);
    assert.equal(d.status, 'done', d.error);
    assert.equal(d.runs.length, 2);
    const dev = d.runs.find((r) => r.department === 'dev')!;
    const res = d.runs.find((r) => r.department === 'research')!;
    assert.ok(dev.subtasks.some((s) => s.id === 'S1') && res.subtasks.some((s) => s.id === 'S1'));
    const r = app.orchestrator.reviewDecision(t.id, { decision: 'reject', issues: [{ subtask: 'S1', department: 'dev', comment: '`src/acl.js:3` — thiếu kiểm quyền' }] });
    assert.deepEqual(r.runs.find((x) => x.department === 'dev')!.revising, ['S1']);
    assert.equal(r.runs.find((x) => x.department === 'research')!.revising, undefined, 'phòng Nghiên cứu không bị sửa');
    await app.orchestrator.waitFor(t.id);
  } finally {
    app.cleanup();
  }
});
