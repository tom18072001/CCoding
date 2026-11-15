import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { COMPACT_REPORT_NOTE, executePrompt, type Ctx } from '../src/prompts.js';
import { Registry } from '../src/registry.js';
import { ROOT } from '../src/config.js';
import { templateGate } from '../src/quality-gate.js';
import { templateCoverage, templateHeadings } from '../src/kpi.js';
import type { Task } from '../src/types.js';

const reg = new Registry(path.join(ROOT, 'agents'), path.join(ROOT, 'departments'));
const dept = reg.department('dev');
const agent = reg.agent('senior-swe');

const task = {
  id: 'T-1', title: 'Việc nhỏ', brief: 'Sửa lỗi làm tròn trong src/a.js', mode: 'project', projectId: 'p', classification: 'internal', status: 'running', departments: ['dev'], runs: [], options: {} as any,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 } as any, createdAt: '2026-11-03T00:00:00Z', updatedAt: '2026-11-03T00:00:00Z',
} as Task;
const st = { id: 'S1', title: 'Việc nhỏ', assignee: 'senior-swe', description: 'Làm trọn đề bài.', dependsOn: [], status: 'pending', deliverable: 'Báo cáo bàn giao theo mẫu' } as any;
const TOOLS = ['list_files', 'read_file', 'search', 'write_file', 'edit_file', 'run_command'] as any[];
const project = { id: 'p', name: 'Dự án thử', description: 'Repo thử', classification: 'internal' } as any;

function build(over: Partial<Ctx> = {}) {
  const c: Ctx = { task, dept, project, cwd: '/w', roster: reg.members('dev'), filesAccessible: true, ccDir: '.ccoding/T-1', branch: 'ccoding/t-1', lane: 'fast', repoMap: { rel: '.ccoding/T-1/repo-map.md', large: [] }, ...over };
  const b = executePrompt(c, agent, st, 'Làn đơn: một agent', '', [], TOOLS, undefined, [st]);
  return `${b.context}\n=====\n${b.prompt}`;
}

test('B-11(c): promptDiet bỏ kế hoạch đa bên/đồng nghiệp/mục đầu vào rỗng, giữ quy tắc dữ liệu + AGENTS.md + quy tắc công cụ', () => {
  const full = build();
  const diet = build({ singleSlim: { diet: true, compact: false } });
  assert.match(full, /Kế hoạch chung đã chốt/);
  assert.match(full, /đồng nghiệp đang làm song song/);
  assert.match(full, /Đầu vào từ các hạng mục trước/);
  assert.doesNotMatch(diet, /Kế hoạch chung đã chốt/);
  assert.doesNotMatch(diet, /đồng nghiệp|merge <nhánh>|worktree CON|roster|cuộc họp/i);
  assert.doesNotMatch(diet, /Đầu vào từ các hạng mục trước/);
  assert.ok(diet.length < full.length, `diet ${diet.length} < full ${full.length}`);
  // phần tuyệt đối không được lược
  for (const keep of ['Phân loại dữ liệu: internal', 'CLAUDE.md, AGENTS.md', 'KHÔNG dùng Get-Content', 'không đưa dữ liệu thật hay bí mật', 'KHÔNG tạo/chuyển/xóa nhánh', 'Không push', 'Mẫu đầu ra']) {
    assert.ok(diet.includes(keep), `diet vẫn còn: ${keep}`);
  }
});

test('B-11(c): repo nhỏ → danh sách tệp gọn thay bản đồ repo; không có files → giữ bản đồ repo', () => {
  const files = ['src/a.js', 'src/b.js', 'test/a.test.js'];
  const small = build({ singleSlim: { diet: true, compact: false, files } });
  assert.match(small, /DANH SÁCH TỆP CỦA REPO \(3 tệp/);
  assert.match(small, /\n {2}src\/a\.js\n {2}src\/b\.js\n {2}test\/a\.test\.js\n/);
  assert.doesNotMatch(small, /BẢN ĐỒ REPO/);
  const big = build({ singleSlim: { diet: true, compact: false } });
  assert.match(big, /BẢN ĐỒ REPO/);
  assert.doesNotMatch(big, /DANH SÁCH TỆP/);
  // diet tắt thì files bị bỏ qua
  assert.doesNotMatch(build({ singleSlim: { diet: false, compact: false, files } }), /DANH SÁCH TỆP/);
});

test('B-11(c): promptDiet tắt → prompt giống hệt bản không có singleSlim; (iv) làn fast/full không đổi', () => {
  const base = build();
  assert.equal(build({ singleSlim: { diet: false, compact: false } }), base);
  assert.equal(build({ singleSlim: undefined, lane: 'full' }), build({ lane: 'full' }));
  // làn nhanh nhiều hạng mục: kế hoạch + chỉ dẫn đồng nghiệp còn nguyên
  assert.match(base, /Kế hoạch chung đã chốt/);
  assert.match(base, /\*\*S1\*\* Việc nhỏ → @senior-swe/);
  assert.doesNotMatch(base, /Báo cáo gọn \(làn đơn\)/);
});

test('B-11(b): compactTemplate thêm chỉ dẫn gọn, vẫn đòi đủ "Mẫu đầu ra"; không đụng phần còn lại', () => {
  const base = build();
  const compact = build({ singleSlim: { diet: false, compact: true } });
  assert.ok(compact.includes(COMPACT_REPORT_NOTE));
  assert.match(compact, /ĐỦ MỌI tiêu đề/);
  assert.match(compact, /1–3 dòng/);
  assert.match(compact, /KHÔNG chép lại mã hay diff/);
  assert.match(compact, /800 token/);
  assert.ok(compact.endsWith('mở đầu bằng mục "## Tóm tắt" (2–4 câu).'));
  assert.equal(compact.replace(`\n${COMPACT_REPORT_NOTE}\n`, ''), base);
});

test('B-11(b): báo cáo gọn mẫu (1–3 dòng/mục) qua cổng mẫu B-02, templateCoverage = 100 %', () => {
  const headings = templateHeadings(agent.body);
  assert.ok(headings.length >= 4, 'hồ sơ có nhiều tiêu đề mẫu');
  const report = ['## Tóm tắt', 'Sửa làm tròn trong `src/a.js`; test xanh.', ...headings.filter((h) => !/^Tóm tắt/i.test(h)).flatMap((h) => [`## ${h}`, 'Xem `src/a.js`; không có gì thêm.'])].join('\n');
  assert.ok(report.split(/\s+/).length < 400, 'báo cáo gọn');
  assert.equal(templateCoverage(report, headings).coverage, 1);
  const g = templateGate(report, agent.body);
  assert.deepEqual(g.missing, []);
  assert.equal(g.coverage, 1);
  assert.ok(g.ok, 'cổng mẫu đạt');
});
