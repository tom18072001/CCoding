import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breakCycles, keywordRoute, matchAssignee, newSubtask, parsePlan, parseReview, parseRoute, readySubtasks } from '../src/planner.js';
import { parseAgent } from '../src/registry.js';
import { extractJson } from '../src/util/json-extract.js';

const agent = (id: string, role: string, skills: string[], name = id) =>
  parseAgent(`${id}.md`, `---\nid: ${id}\nname: ${name}\ntitle: ${id} title\ndepartment: dev\nrole: ${role}\nskills: [${skills.join(', ')}]\n---\nbody`);

const lead = agent('dev-lead', 'lead', ['planning'], 'Minh');
const roster = [lead, agent('backend-dev', 'member', ['nodejs', 'api'], 'Bảo'), agent('data-engineer', 'member', ['logstash', 'elasticsearch'], 'Hùng'), agent('qa-tester', 'reviewer', ['testing'], 'Phúc')];

test('extractJson đọc được khối ```json và JSON lẫn trong văn bản', () => {
  assert.deepEqual(extractJson('abc ```json\n{"a":1}\n``` x'), { a: 1 });
  assert.deepEqual(extractJson('Kết quả: {"a": {"b": "}"}, } xong'), { a: { b: '}' } });
  assert.equal(extractJson('không có json'), undefined);
});

test('parsePlan chuẩn hóa id, người nhận và phụ thuộc', () => {
  const text = '```json\n{"summary":"ok","subtasks":[{"id":"S1","title":"Pipeline","assignee":"@data-engineer","description":"logstash","dependsOn":[]},{"id":"S2","title":"API","assignee":"Bảo","description":"api","dependsOn":["S1","S9"]}]}\n```';
  const p = parsePlan(text, roster, lead, 'brief');
  assert.equal(p.parsed, true);
  assert.equal(p.subtasks.length, 2);
  assert.equal(p.subtasks[0].assignee, 'data-engineer');
  assert.equal(p.subtasks[1].assignee, 'backend-dev');
  assert.deepEqual(p.subtasks[1].dependsOn, ['S1']);
});

test('parsePlan dự phòng khi trưởng phòng trả lời sai định dạng', () => {
  const p = parsePlan('xin lỗi tôi không biết', roster, lead, 'xây dựng pipeline logstash');
  assert.equal(p.parsed, false);
  assert.ok(p.subtasks.length >= 1);
  assert.equal(p.subtasks[0].assignee, 'data-engineer');
});

test('matchAssignee theo kỹ năng khi tên không khớp', () => {
  assert.equal(matchAssignee('kỹ sư dữ liệu', roster, 'cấu hình elasticsearch')?.id, 'data-engineer');
});

test('breakCycles loại bỏ phụ thuộc vòng', () => {
  const s = [newSubtask({ id: 'A', title: 'a', assignee: 'x', dependsOn: ['B'] }), newSubtask({ id: 'B', title: 'b', assignee: 'y', dependsOn: ['A'] })];
  breakCycles(s);
  const edges = s.flatMap((x) => x.dependsOn.map((d) => `${d}->${x.id}`));
  assert.equal(edges.length, 1);
});

test('readySubtasks tôn trọng phụ thuộc và mỗi agent một việc', () => {
  const s = [
    newSubtask({ id: 'S1', title: '', assignee: 'a' }),
    newSubtask({ id: 'S2', title: '', assignee: 'a' }),
    newSubtask({ id: 'S3', title: '', assignee: 'b', dependsOn: ['S1'] }),
    newSubtask({ id: 'S4', title: '', assignee: 'c' }),
  ];
  assert.deepEqual(readySubtasks(s, new Set()).map((x) => x.id), ['S1', 'S4']);
  s[0].status = 'done';
  assert.deepEqual(readySubtasks(s, new Set(['c'])).map((x) => x.id), ['S2', 'S3']);
});

test('parseReview: major/blocker làm approved=false', () => {
  const r = parseReview('```json\n{"approved":true,"summary":"x","issues":[{"subtask":"S1","severity":"major","comment":"thiếu test"}]}\n```', ['S1']);
  assert.equal(r.approved, false);
  assert.equal(r.issues[0].severity, 'major');
  const ok = parseReview('```json\n{"approved":true,"summary":"tốt","issues":[{"subtask":"S1","severity":"minor","comment":"nit"}]}\n```', ['S1']);
  assert.equal(ok.approved, true);
});

test('định tuyến: router JSON và từ khóa', () => {
  const r = parseRoute('```json\n{"mode":"joint","departments":["dev","research"],"reason":"cần cả hai"}\n```', ['dev', 'research']);
  assert.deepEqual(r?.departments, ['research', 'dev']);
  const depts = [
    { id: 'dev', keywords: ['api', 'logstash', 'triển khai'] },
    { id: 'research', keywords: ['nghiên cứu', 'luận văn', 'tổng quan'] },
  ];
  assert.deepEqual(keywordRoute('viết tổng quan tài liệu cho luận văn', depts).departments, ['research']);
  assert.deepEqual(keywordRoute('nghiên cứu tổng quan rồi triển khai api logstash', depts).departments, ['research', 'dev']);
});
