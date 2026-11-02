// B-04: bộ phân tích lệnh shell có xét nháy — ca được nới (chỉ đọc) và bộ test ác ý (vẫn phải chặn).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { guardDecision } from '../src/tools/claude-guard.js';
import { gitReadViolation, shellParse, shellReadsOnly, shellWrites } from '../src/tools/shell-policy.js';

const root = path.resolve('.');
const cfg = { root, deny: [], allowGitCommit: false, shell: 'git-read' as const };
const decide = (command: string) => guardDecision({ tool_name: 'Bash', tool_input: { command } }, cfg);

const ALLOWED = [
  // tách có xét nháy: toán tử trong nháy chỉ là chữ
  `grep -n "a;b" docs/x.md`,
  `grep -c 'a && b' docs/x.md`,
  `grep -E "a|b" docs/x.md | head -5`,
  `grep -E 'x||y' docs/x.md`,
  `grep -n ">" docs/x.md`,
  `grep -n "a > b" docs/x.md`,
  `grep -n '<ws>' docs/x.md`,
  `git log --format="%h | %s" | head -3`,
  `grep -rn "\\"quoted\\"" docs`,
  // echo/printf/pwd/true
  `git status --short && echo ---- && git log --oneline -3`,
  `echo "a > b"`,
  `printf '%s\\n' x; git status`,
  `pwd`,
  `git status || true`,
  `git diff --stat 2>&1 | head`,
  `git log -1 2>/dev/null`,
  // sed -n nhiều địa chỉ
  `sed -n 5p docs/x.md`,
  `sed -n '12p;16p;196p;300p;386p' docs/x.md | cut -c1-200`,
  `sed -n '1,5p;10,20p;30,$p' docs/x.md`,
  `grep -n x docs/x.md | sed -n 1,200p`,
  // awk không nguy hiểm
  `awk '/^## 10\\. /{f=1} /^## K/{f=0} f' docs/x.md | grep -c 'et al'`,
  `awk -F: '{print $1}' docs/x.md`,
  `awk -v n=3 'NR==n' docs/x.md`,
];

const DENIED: Array<[string, string]> = [
  ['; rm', `git status; rm -rf x`],
  ['; rm sau chuỗi nháy', `grep 'a';rm x`],
  ['&& rm', `git status && rm x`],
  ['|| rm', `git status || rm x`],
  ['xuống dòng rm', `git status\nrm x`],
  ['& nền', `git status & rm x`],
  ['$(…)', `git log $(id)`],
  ['$(…) trong nháy kép', `grep "$(id)" docs/x.md`],
  ['$(…) lách nháy', `grep 'a'"$(id)" docs/x.md`],
  ['backtick', 'git log `id`'],
  ['backtick trong nháy kép', 'grep "`id`" docs/x.md'],
  ['heredoc', `cat <<EOF\nx\nEOF`],
  ['here-string', `cat <<< x`],
  ['chuyển hướng vào', `cat < docs/x.md`],
  ['> tệp', `git log > out.txt`],
  ['>tệp liền', `echo x >f`],
  ['echo nháy rồi >', `echo 'x' > f`],
  ['echo nháy kép rồi >>', `echo "x" >> f`],
  ['&> tệp', `git log &> out.txt`],
  ['2> tệp', `git log 2> err.txt`],
  ['> sau nháy lách', `grep 'a>b' f > g`],
  ['tee', `git log | tee out.txt`],
  ['sed -i', `sed -i 's/a/b/' f`],
  ['sed -i gộp cờ', `sed -ni 's/a/b/p' f`],
  ['sed -n kèm lệnh w', `sed -n '1w out.txt' f`],
  ['sed -n kèm e', `sed -n '1e id' f`],
  ['sed không -n', `sed 's/a/b/' f`],
  ['awk system', `awk 'BEGIN{system("id")}'`],
  ['awk system trong nháy kép', `awk "BEGIN{system(\\"id\\")}"`],
  ['awk getline', `awk 'BEGIN{"id" | getline x; print x}'`],
  ['awk ghi tệp', `awk '{print > "out"}' f`],
  ['awk ghi pipe', `awk '{print | "sh"}' f`],
  ['awk ENVIRON', `awk 'BEGIN{print ENVIRON["HOME"]}'`],
  ['awk close', `awk 'BEGIN{close("x")}'`],
  ['awk fflush', `awk 'BEGIN{fflush()}'`],
  ['awk -f', `awk -f prog.awk f`],
  ['awk -i', `awk -i inplace '{print}' f`],
  ['awk -f gộp', `awk -F: -f prog.awk f`],
  ['for', `for f in a b; do cat $f; done`],
  ['while', `while true; do cat f; done`],
  ['python', `python3 -c "print(1)"`],
  ['python heredoc', `python3 - <<'E'\nprint(1)\nE`],
  ['node', `node -e "1"`],
  ['node sau &&', `git status && node x.js`],
  ['đọc .env', `cat .env`],
  ['đọc .env trong nháy', `cat ".env"`],
  ['đọc .env nối nháy', `cat .e""nv`],
  ['đọc .env.local', `grep KEY app/.env.local`],
  ['git .env', `git show HEAD:.env`],
  ['ra ngoài root: tuyệt đối', `cat C:/Windows/../Users/x/secret.txt`],
  ['ra ngoài root: ..', `cat ../../x`],
  ['ra ngoài root: cd ..', `cd .. && ls`],
  ['ra ngoài root: ~', `ls ~/`],
  ['nháy không đóng', `grep "abc docs/x.md`],
  ['sort -o', `sort -o out.txt f`],
  ['find -exec', `find . -exec rm {} ;`],
  ['xargs', `git ls-files | xargs rm`],
  ['pipe vào sh', `git log | sh`],
  ['curl', `curl http://x`],
  ['Set-Content', `Set-Content a.txt hi`],
];

test('B-04: lệnh chỉ đọc có nháy/echo/sed -n/awk được cho qua', () => {
  for (const c of ALLOWED) assert.equal(decide(c), undefined, c);
});

test('B-04 (ác ý): các dạng ghi/chạy mã/đọc bí mật/ra ngoài vẫn bị chặn', () => {
  for (const [name, c] of DENIED) assert.ok(decide(c), `${name}: ${c}`);
});

test('B-04: toán tử chỉ tách ngoài nháy; < > trong nháy không phải chuyển hướng', () => {
  const p = shellParse(`grep "a;b" f && echo 'x|y' | head`);
  assert.equal(p.bad, undefined);
  assert.equal(p.stmts.length, 2);
  assert.equal(p.stmts[1].length, 2);
  assert.equal(shellParse(`grep ">" f`).bad, undefined);
  assert.equal(shellParse(`grep '<' f`).bad, undefined);
  assert.equal(shellParse(`echo x >f`).bad?.rule, 'redirect');
  assert.equal(shellParse(`echo 'x' > f`).bad?.rule, 'redirect');
  assert.equal(shellParse(`cat <<E`).bad?.rule, 'heredoc');
  assert.equal(shellParse(`echo $(id)`).bad?.rule, 'subst');
  assert.equal(shellParse(`echo "$(id)"`).bad?.rule, 'subst');
  assert.equal(shellParse(`echo '$(id)'`).bad, undefined);
  assert.equal(shellParse('echo `id`').bad?.rule, 'subst');
});

test('B-04: vi phạm nêu số câu, mã quy tắc và tên lệnh (không chép lệnh thô)', () => {
  assert.deepEqual(gitReadViolation('git status && python3 x.py'), { clause: 2, rule: 'interpreter', cmd: 'python3', why: undefined });
  assert.equal(gitReadViolation('git status; for f in a; do cat $f; done')?.rule, 'loop');
  assert.equal(gitReadViolation('cat .env')?.rule, 'env-file');
  assert.equal(gitReadViolation('git status')?.rule, undefined);
  assert.equal(gitReadViolation('git status && ls')?.clause, undefined);
  assert.equal(gitReadViolation('git status && curl x')?.clause, 2);
});

test('B-04: shellWrites/shellReadsOnly xét nháy', () => {
  assert.equal(shellWrites(`grep -n "a > b" f`), false);
  assert.equal(shellWrites(`grep -n "tee" f`), false);
  assert.equal(shellWrites(`echo x > f`), true);
  assert.equal(shellWrites(`echo "x" >> f`), true);
  assert.equal(shellWrites(`git log 2>&1 | head`), false);
  assert.equal(shellWrites(`cmd 2>/dev/null`), false);
  assert.equal(shellWrites(`sed -i s/a/b/ f`), true);
  assert.equal(shellWrites(`git log | tee x`), true);
  assert.equal(shellWrites(`python3 - <<'E'\nx\nE`), true);
  assert.equal(shellReadsOnly(`grep "a;b" f && echo ---- && sed -n 1,5p f`), true);
  assert.equal(shellReadsOnly(`echo hi`), false);
  assert.equal(shellReadsOnly(`grep x f; rm f`), false);
  assert.equal(shellReadsOnly(`grep "a > b" f`), true);
});
