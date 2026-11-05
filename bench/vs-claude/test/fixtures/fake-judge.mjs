// Bin giả cho `claude -p`: không gọi mạng. Hành vi theo biến môi trường FAKE_JUDGE_MODE và --model.
//   mode=A: luôn trả winner "A" (thiên vị vị trí → hai thứ tự khác nhau → hòa)
//   mode=pref: chọn bên có chứa "GOOD" (đúng cả hai thứ tự); checklist: true nếu tài liệu có "GOOD"
//   mode=flip2: như pref, nhưng khi --model là "judge-two" thì chọn ngược
import { appendFileSync } from 'node:fs';
const a = process.argv.slice(2);
const prompt = a[a.indexOf('-p') + 1];
const model = a[a.indexOf('--model') + 1];
if (process.env.FAKE_JUDGE_LOG) appendFileSync(process.env.FAKE_JUDGE_LOG, `${model}\n${prompt.includes('CHECKLIST') ? 'checklist' : 'pair'}\n`);
const mode = process.env.FAKE_JUDGE_MODE ?? 'pref';
let result;
if (prompt.includes('CHECKLIST')) {
  const good = prompt.split('DOCUMENT:')[1].includes('GOOD');
  const ids = [...prompt.matchAll(/^- (\w+):/gm)].map((m) => m[1]);
  result = JSON.stringify(Object.fromEntries(ids.map((id, i) => [id, mode === 'flip2' && model === 'judge-two' ? (i === 0 ? !good : good) : good])));
} else {
  const A = prompt.split('DELIVERABLE A:')[1].split('DELIVERABLE B:')[0];
  const B = prompt.split('DELIVERABLE B:')[1];
  let w = A.includes('GOOD') && !B.includes('GOOD') ? 'A' : B.includes('GOOD') && !A.includes('GOOD') ? 'B' : 'tie';
  if (mode === 'A') w = 'A';
  if (mode === 'flip2' && model === 'judge-two' && w !== 'tie') w = w === 'A' ? 'B' : 'A';
  result = JSON.stringify({ winner: w, reason: 'fake' });
}
process.stdout.write(JSON.stringify({ result, usage: {}, total_cost_usd: 0 }));
