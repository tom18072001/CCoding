import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlan } from '../src/planner.js';
import { parseAgent } from '../src/registry.js';

const agent = (id: string, role: string, skills: string[], name = id) =>
  parseAgent(`${id}.md`, `---\nid: ${id}\nname: ${name}\ntitle: ${id} title\ndepartment: dev\nrole: ${role}\nskills: [${skills.join(', ')}]\n---\nbody`);

const lead = agent('dev-lead', 'lead', ['planning'], 'Trưởng phòng');
const roster = [lead, agent('backend-dev', 'member', ['nodejs', 'api'], 'Backend Developer')];

test('parsePlan (FX15): người nhận ngoài roster ghi vào assigneeUnmatched, người nhận hợp lệ thì không', () => {
  const text = '```json\n{"summary":"ok","subtasks":[{"id":"S1","title":"A","assignee":"ghost-agent","description":"nodejs api","dependsOn":[]},{"id":"S2","title":"B","assignee":"@backend-dev","description":"x","dependsOn":[]}]}\n```';
  const p = parsePlan(text, roster, lead, 'brief');
  assert.equal(p.subtasks[0].assigneeUnmatched, 'ghost-agent');
  assert.equal(p.subtasks[1].assigneeUnmatched, undefined);
  assert.equal(p.subtasks[1].assignee, 'backend-dev');
});
