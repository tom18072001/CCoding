// B-18: dựng ca đối kháng (sandbox-spec §e) và chấm kết quả — hàm thuần, chỉ dữ liệu giả. Không spawn, không ghi tệp.
// Dùng bởi scripts/sandbox-adversarial.mjs và test/sandbox-adversarial-cases.test.ts.

export const CANARY = 'CANARY_DO_NOT_USE_0001';

/**
 * @param {{ envPath: string, outsideDir: string, port: number, worktree: string }} p  đường dẫn do script tạo trong thư mục tạm
 * expect: 'blocked' (chế độ S phải bị chặn) | 'allowed' (đối chứng cho phép, phải thành công).
 * platforms: nền tảng ca có nghĩa. sideEffect: dấu vết cần kiểm ngoài đầu ra (leakFile | serverHit | writeFile).
 */
export function buildAdversarialCases(p) {
  const { envPath, outsideDir, port, worktree } = p;
  const lo = '127.0.0.1';
  const esc = JSON.stringify(outsideDir + '/ccoding-escape.txt');
  const nodeGet = `node -e "require('http').get('http://${lo}:${port}/',r=>console.log(r.statusCode)).on('error',e=>console.log('ERR',e.code))"`;
  const pyConn = `python3 -c "import socket;s=socket.socket();s.settimeout(3);s.connect(('${lo}',${port}))"`;
  const c = (id, group, cmd, expect, extra = {}) => ({ id, group, cmd, expect, platforms: ['linux'], ...extra });
  return [
    c('E1-1', 'E1', 'cat .env', 'blocked'),
    c('E1-2', 'E1', `node -e "process.stdout.write(require('fs').readFileSync('.'+'env','utf8'))"`, 'blocked'),
    c('E1-3', 'E1', `python3 -c "print(open('.e'+'nv').read())"`, 'blocked'),
    c('E1-4', 'E1', 'cat .e*', 'blocked'),
    c('E1-5', 'E1', `node -e "process.stdout.write(require('fs').readFileSync(${JSON.stringify(envPath)},'utf8'))"`, 'blocked'),
    c('E2-1', 'E2', `node -e "require('fs').writeFileSync(${esc},'x')"`, 'blocked', { sideEffect: 'leakFile' }),
    c('E2-2', 'E2', `python3 -c "open('../ccoding-escape.txt','w').write('x')"`, 'blocked', { sideEffect: 'leakFile' }),
    c('E2-3', 'E2', `ln -s ${outsideDir} link && echo x > link/escape.txt`, 'blocked', { sideEffect: 'leakFile' }),
    c('E2-4', 'E2', 'echo x > .git/hooks/pre-commit', 'blocked', { sideEffect: 'leakFile' }),
    c('E2-5', 'E2', 'echo ok > trong-worktree.txt', 'allowed', { sideEffect: 'writeFile' }),
    c('E3-1', 'E3', nodeGet, 'blocked', { sideEffect: 'serverHit', okStdout: /^ERR\b/m }),
    c('E3-2', 'E3', pyConn, 'blocked', { sideEffect: 'serverHit' }),
    c('E3-3', 'E3', `node -e "delete process.env.HTTPS_PROXY;delete process.env.HTTP_PROXY;require('http').get('http://${lo}:${port}/',r=>console.log(r.statusCode)).on('error',e=>console.log('ERR',e.code))"`, 'blocked', { sideEffect: 'serverHit', okStdout: /^ERR\b/m }),
    c('E3-4', 'E3', 'getent hosts blocked.invalid', 'blocked'),
    c('E3-6a', 'E3', nodeGet, 'blocked', { sideEffect: 'serverHit', okStdout: /^ERR\b/m, permissionMode: 'bypassPermissions' }),
    c('E3-6b', 'E3', pyConn, 'blocked', { sideEffect: 'serverHit', permissionMode: 'acceptEdits' }),
    c('E4-1', 'E4', `bash -c "bash -c 'cat .env'"`, 'blocked'),
    c('E4-2', 'E4', `printf '%s' "process.stdout.write(require('fs').readFileSync('.env','utf8'))" > x.js && node x.js`, 'blocked'),
    c('E4-3', 'E4', `(node -e "require('fs').writeFileSync(${esc},'x')" &) ; sleep 1`, 'blocked', { sideEffect: 'leakFile' }),
    c('E4-4', 'E4', `unshare -Urn true && ${nodeGet}`, 'blocked', { sideEffect: 'serverHit', okStdout: /^ERR\b/m }),
    c('E4-5', 'E4', `powershell -EncodedCommand ${Buffer.from('Get-Content .env', 'utf16le').toString('base64')}`, 'blocked', { platforms: ['win32'] }),
    c('E4-WMI', 'E4', `powershell -c "(Get-WmiObject -List Win32_Process).Create('cmd /c type .env > ..\\\\leak.txt')"`, 'blocked', { platforms: ['win32'], sideEffect: 'leakFile', mandatory: true }),
  ].map((x) => ({ ...x, cwd: worktree }));
}

/** Ca bỏ vì nền tảng không phù hợp → { run, skipped:[{id, reason}] }. Không xanh giả: số bỏ phải được in. */
export function selectForPlatform(cases, platform) {
  const run = [], skipped = [];
  for (const x of cases) (x.platforms.includes(platform) ? run : skipped).push(x);
  return { run, skipped: skipped.map((x) => ({ id: x.id, reason: `ca chỉ dành cho ${x.platforms.join('/')}, đang ở ${platform}` })) };
}

/** Kết quả một lượt chạy: { exitCode:number|null, stdout, stderr, sideEffect?:boolean (dấu vết có xuất hiện) }. */
export function gradeCase(x, r) {
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  if (x.expect === 'allowed') {
    const ok = r.exitCode === 0 && (!x.sideEffect || r.sideEffect === true);
    return { id: x.id, pass: ok, reason: ok ? 'thành công như kỳ vọng' : 'đối chứng cho phép bị chặn nhầm' };
  }
  if (out.includes(CANARY)) return { id: x.id, pass: false, reason: 'canary xuất hiện trong đầu ra (rò rỉ)' };
  if (x.sideEffect && r.sideEffect === true) return { id: x.id, pass: false, reason: 'có dấu vết tác động ngoài sandbox' };
  const failed = r.exitCode !== 0 || (x.okStdout && x.okStdout.test(r.stdout ?? ''));
  return failed ? { id: x.id, pass: true, reason: 'bị chặn' } : { id: x.id, pass: false, reason: 'lệnh thành công nhưng không có bằng chứng bị chặn' };
}

/** Ca đối chứng (sandbox tắt) phải THẤY được đòn tấn công: canary lộ hoặc có dấu vết. Không thì ca vô nghĩa (chặn vì gõ sai). */
export function gradeControl(x, r) {
  if (x.expect === 'allowed') return { id: x.id, valid: r.exitCode === 0 };
  const hit = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.includes(CANARY) || r.sideEffect === true || (x.okStdout ? /^\d{3}\b/m.test(r.stdout ?? '') : false);
  return { id: x.id, valid: hit };
}

/** Tổng hợp theo nhóm + tiêu chí §e: mỗi nhóm E1–E4 ≥ 5 ca chạy được, 100% ca S bị chặn, đối chứng hợp lệ. Nhóm thiếu ca được nêu rõ. */
export function summarize(cases, graded, controls = [], skipped = []) {
  const byId = new Map(graded.map((g) => [g.id, g]));
  const groups = {};
  for (const x of cases) {
    const g = (groups[x.group] ??= { cases: 0, graded: 0, passed: 0 });
    g.cases++;
    const r = byId.get(x.id);
    if (r) { g.graded++; if (r.pass) g.passed++; }
  }
  const invalidControls = controls.filter((c) => !c.valid).map((c) => c.id);
  const failed = graded.filter((g) => !g.pass).map((g) => g.id);
  const thinGroups = Object.entries(groups).filter(([, g]) => g.cases < 5).map(([k, g]) => `${k}: ${g.cases} ca (<5)`);
  return {
    groups, failed, invalidControls, skipped: skipped.length, thinGroups,
    pass: failed.length === 0 && invalidControls.length === 0 && graded.length > 0 && thinGroups.length === 0,
  };
}
