import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { historyText, sectionOf, selectHistory } from '../src/history.js';
import { planPrompt } from '../src/prompts.js';
import type { Task } from '../src/types.js';
import { testApp } from './helpers.js';

const FINAL = `# Báo cáo\n\n## Phòng Phát triển\n\n### Tóm tắt\nĐã thêm phân quyền theo nghị định cho route báo cáo.\n\n### Kết quả theo hạng mục\n- S1 xong\n\n### Việc còn mở & rủi ro\n- 2 test đỏ: bảng ADR lệch ROLE_TEMPLATES.\n\n### Bước tiếp theo\n- Sửa test.\n`;

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id, title: `Việc ${id}`, brief: '', mode: 'project', projectId: 'p', classification: 'internal', status: 'done', departments: ['dev'], runs: [], options: {} as any,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 } as any, createdAt: '2026-10-28T00:00:00Z', updatedAt: '2026-10-28T00:00:00Z', ...over,
  };
}

test('P8: chọn nhiệm vụ trước cùng dự án (không lấy dữ liệu mức cao hơn), trích tóm tắt + việc còn mở', () => {
  assert.equal(sectionOf(FINAL, /^Tóm tắt/i, 500), 'Đã thêm phân quyền theo nghị định cho route báo cáo.');
  assert.match(sectionOf(FINAL, /Việc còn (mở|lại)/i, 500), /2 test đỏ/);
  assert.equal(sectionOf(FINAL, /Không có/i, 500), '');
  const cur = task('T-3', { status: 'running' });
  const all = [
    task('T-1', { finishedAt: '2026-10-27T10:00:00Z' }),
    task('T-2', { finishedAt: '2026-10-28T10:00:00Z', branch: 'nd57/goi-2', commit: 'ffad22e0000', attention: { reason: 'checks', detail: '2 test đỏ', at: '' } }),
    task('T-x', { projectId: 'khac' }),
    task('T-m', { classification: 'confidential', finishedAt: '2026-10-28T11:00:00Z' }),
    task('T-r', { status: 'running' }),
    cur,
  ];
  assert.deepEqual(selectHistory(all, cur).map((t) => t.id), ['T-2', 'T-1'], 'mới nhất trước; bỏ dự án khác, nhiệm vụ đang chạy, dữ liệu Bảo mật');
  assert.deepEqual(selectHistory(all, task('T-9', { projectId: undefined })), []);
  const text = historyText([{ task: all[1], final: FINAL }, { task: all[0] }], 1200);
  assert.match(text, /### T-2 — Việc T-2 \(xong, 2026-10-28\)/);
  assert.match(text, /nhánh `nd57\/goi-2` \(ffad22e\)/);
  assert.match(text, /⚠ cần xem: 2 test đỏ/);
  assert.match(text, /Tóm tắt: Đã thêm phân quyền/);
  assert.match(text, /Còn mở: - 2 test đỏ/);
  assert.match(text, /### T-1/);
});

test('P8: pha lập kế hoạch của dự án kèm nhiệm vụ trước; thực thi có PLAN.md và kế hoạch một dòng/hạng mục', async () => {
  const app = testApp();
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-hist-'));
  try {
    app.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: ws, classification: 'internal', toolAccess: 'write', createdAt: new Date().toISOString() });
    const t1 = app.orchestrator.submit({ brief: 'Xây API đăng nhập', projectId: 'repo', options: { discussionRounds: 0, maxRevisions: 0 } });
    assert.equal((await app.orchestrator.waitFor(t1.id)).status, 'done');
    assert.ok(!app.logs.query({ task: t1.id, limit: 2000 }).some((e) => e.kind === 'plan.history'), 'nhiệm vụ đầu tiên của dự án: chưa có lịch sử');
    const t2 = app.orchestrator.submit({ brief: 'Thêm phân quyền', projectId: 'repo', options: { discussionRounds: 0, maxRevisions: 0 } });
    assert.equal((await app.orchestrator.waitFor(t2.id)).status, 'done');
    const ev = app.logs.query({ task: t2.id, limit: 2000 }).find((e) => e.kind === 'plan.history');
    assert.ok(ev, 'có log plan.history');
    assert.match(ev!.msg, new RegExp(t1.id));
    const cc = path.join(ws, '.ccoding', t2.id);
    assert.match(fs.readFileSync(path.join(cc, 'inputs', 'PROJECT-HISTORY.md'), 'utf8'), new RegExp(`### ${t1.id}`));
    assert.match(fs.readFileSync(path.join(cc, 'PLAN.md'), 'utf8'), /# Kế hoạch chung/);
    // prompt lập kế hoạch có khối nhiệm vụ trước
    const reg = app.registry;
    const dept = reg.department('dev');
    const built = planPrompt({ task: app.store.get(t2.id)!, dept, cwd: ws, roster: reg.members('dev'), projectHistory: { text: '### T-1 — Việc cũ (xong)', rel: '.ccoding/x/inputs/PROJECT-HISTORY.md' } });
    assert.match(built.prompt, /## Nhiệm vụ trước của dự án \(mới nhất trước\) — chi tiết: `\.ccoding\/x\/inputs\/PROJECT-HISTORY\.md`/);
  } finally {
    app.cleanup();
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test('prompt thực thi khi đọc được tệp: phần nền ngắn (đề bài ≤ 3.000 ký tự, kế hoạch một dòng/hạng mục kèm PLAN.md)', async () => {
  const { executePrompt } = await import('../src/prompts.js');
  const { Registry } = await import('../src/registry.js');
  const { ROOT } = await import('../src/config.js');
  const reg = new Registry(path.join(ROOT, 'agents'), path.join(ROOT, 'departments'));
  const dept = reg.department('dev');
  const t = task('T-1', { brief: 'Yêu cầu dài. '.repeat(1000) });
  const subs = [
    { id: 'S1', title: 'API', assignee: 'backend-dev', description: 'MÔ TẢ CHI TIẾT S1 '.repeat(30), dependsOn: [], status: 'pending' },
    { id: 'S2', title: 'UI', assignee: 'frontend-dev', description: 'MÔ TẢ CHI TIẾT S2 '.repeat(30), dependsOn: ['S1'], status: 'pending' },
  ] as any[];
  const agent = reg.agent('frontend-dev');
  const withFiles = executePrompt({ task: t, dept, cwd: '/w', roster: reg.members('dev'), filesAccessible: true, ccDir: '.ccoding/T-1' }, agent, subs[1], 'Tóm tắt kế hoạch', '', [], ['read_file', 'write_file'], undefined, subs);
  assert.match(withFiles.context!, /mô tả đầy đủ: `\.ccoding\/T-1\/PLAN\.md`/);
  assert.match(withFiles.context!, /- \*\*S1\*\* API → @backend-dev\n- \*\*S2\*\* UI → @frontend-dev \(sau S1\)/);
  assert.ok(!withFiles.context!.includes('MÔ TẢ CHI TIẾT S1'), 'mô tả hạng mục khác không gửi lại mỗi lượt');
  assert.ok(withFiles.prompt.includes('MÔ TẢ CHI TIẾT S2'), 'mô tả hạng mục của mình vẫn đầy đủ');
  assert.ok(withFiles.context!.length < 3000 + 1500, `bối cảnh ${withFiles.context!.length} ký tự`);
  const noFiles = executePrompt({ task: t, dept, cwd: '/w', roster: reg.members('dev') }, agent, subs[1], 'Tóm tắt kế hoạch', '', [], [], undefined, subs);
  assert.ok(noFiles.context!.includes('MÔ TẢ CHI TIẾT S1'), 'không đọc được tệp thì giữ kế hoạch đầy đủ');
});
