import fs from 'node:fs';
const BS = String.fromCharCode(92);
const r = fs.readFileSync('.tmp-s3/rows.md', 'utf8').trim().split('\n');
let bad = 0;
r.forEach((x, i) => { const n = x.split(BS + '|').join('').split('|').length - 2; if (n !== 9) { bad++; console.log('lỗi', i + 1, n); } });
console.log('xong', r.length, 'lỗi', bad);
