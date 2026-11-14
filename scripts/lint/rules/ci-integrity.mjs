// .github/workflows/ci.yml phải còn nguyên: mọi nhánh + PR, ma trận 2 OS × Node 22/24, đủ năm bước, bước sạch cây ở cuối,
// và không có đường nào làm đỏ thành xanh (continue-on-error, `|| true`, if: false). Nguồn: D20 — "cứ fail lỗi là hỏng luôn".
import { parse } from 'yaml';

const CI = '.github/workflows/ci.yml';
const STEPS = [
  ['typecheck', /^npm run typecheck\b/m],
  ['lint', /^npm run lint\b/m],
  ['test', /^npm (?:run )?test\s*$/m],
  ['test:bench', /^npm run test:bench\b/m],
  ['test:research', /^npm run test:research\b/m],
];
const BAD = [
  [/\bcontinue-on-error\b/, 'continue-on-error'],
  [/\|\|\s*(?:true\b|:(?:\s|$)|exit\s+0\b)/, '`|| true` (hoặc tương đương)'],
  [/\bif\s*:\s*(?:\$\{\{\s*)?(?:false|0)\s*(?:\}\})?\s*$/, 'if: false'],
  [/\bset\s+\+e\b/, 'set +e'],
];

export default {
  id: 'ci-integrity',
  source: 'D20 — CI không được làm đỏ thành xanh',
  needsBase: false,
  async run(ctx) {
    const out = [];
    const err = (file, line, msg) => out.push({ file, line, msg });

    for (const file of ctx.files.filter((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f))) {
      ctx.read(file).split(/\r?\n/).forEach((raw, i) => {
        const line = raw.replace(/(^|\s)#.*$/, '');
        for (const [re, what] of BAD) if (re.test(line)) err(file, i + 1, `cấm ${what}: bước lỗi phải làm CI đỏ`);
      });
    }

    if (!ctx.files.includes(CI)) return [...out, { file: CI, line: 0, msg: 'thiếu workflow CI' }];
    let doc;
    try {
      doc = parse(ctx.read(CI));
    } catch (e) {
      return [...out, { file: CI, line: 0, msg: `YAML không hợp lệ: ${e.message}` }];
    }
    const on = doc?.on ?? doc?.[true];
    const isObj = on && typeof on === 'object' && !Array.isArray(on);
    const has = (k) => (Array.isArray(on) ? on.includes(k) : on === k || (isObj && k in on));
    if (!has('push')) err(CI, 0, 'thiếu trigger push');
    else if (isObj && on.push && typeof on.push === 'object') {
      const p = on.push;
      const b = p.branches;
      if (p['branches-ignore'] || p.paths || p['paths-ignore'] || p.tags || (b && !(Array.isArray(b) && b.includes('**')))) err(CI, 0, "push phải chạy trên mọi nhánh: branches: ['**'] (không branches-ignore, paths)");
    }
    if (!has('pull_request')) err(CI, 0, 'thiếu trigger pull_request');
    else if (isObj && on.pull_request && typeof on.pull_request === 'object') {
      const p = on.pull_request;
      if (p.branches || p.paths || p['paths-ignore'] || p['branches-ignore']) err(CI, 0, 'pull_request không được lọc nhánh/đường dẫn');
    }

    const jobs = Object.entries(doc?.jobs ?? {});
    if (!jobs.length) return [...out, { file: CI, line: 0, msg: 'workflow không có job nào' }];
    for (const [name, job] of jobs) {
      const at = `job "${name}"`;
      const m = job?.strategy?.matrix ?? {};
      const os = [].concat(m.os ?? []);
      const node = [].concat(m.node ?? m['node-version'] ?? []).map(String);
      for (const o of ['ubuntu-latest', 'windows-latest']) if (!os.includes(o)) err(CI, 0, `${at}: ma trận thiếu ${o}`);
      for (const n of ['22', '24']) if (!node.includes(n)) err(CI, 0, `${at}: ma trận thiếu Node ${n}`);
      if (job?.strategy?.['fail-fast'] === true) err(CI, 0, `${at}: fail-fast: true che mất ô ma trận lỗi — đặt false`);
      const steps = Array.isArray(job?.steps) ? job.steps : [];
      const checkout = steps.find((s) => /^actions\/checkout@/.test(s?.uses ?? ''));
      if (!checkout) err(CI, 0, `${at}: thiếu actions/checkout`);
      else if (String(checkout.with?.['fetch-depth']) !== '0') err(CI, 0, `${at}: checkout cần fetch-depth: 0 để tính mốc LINT_BASE`);
      let last = -1;
      for (const [label, re] of STEPS) {
        const idx = steps.findIndex((s) => typeof s?.run === 'string' && re.test(s.run));
        if (idx < 0) {
          err(CI, 0, `${at}: thiếu bước "${label}"`);
          continue;
        }
        if (idx < last) err(CI, 0, `${at}: bước "${label}" sai thứ tự (typecheck, lint, test, test:bench, test:research)`);
        last = Math.max(last, idx);
        if (steps[idx]['continue-on-error'] !== undefined || steps[idx].if !== undefined) err(CI, 0, `${at}: bước "${label}" không được có if/continue-on-error`);
      }
      const lintIdx = steps.findIndex((s) => typeof s?.run === 'string' && STEPS[1][1].test(s.run));
      const baseStep = steps.findIndex((s) => typeof s?.run === 'string' && /LINT_BASE/.test(s.run) && /GITHUB_ENV/.test(s.run));
      if (baseStep < 0 || (lintIdx >= 0 && baseStep > lintIdx)) err(CI, 0, `${at}: thiếu bước đặt LINT_BASE (ghi vào GITHUB_ENV) trước bước lint`);
      const tail = steps[steps.length - 1];
      if (!tail || typeof tail.run !== 'string' || !/git status --porcelain/.test(tail.run) || !/\bexit\s+1\b/.test(tail.run)) err(CI, 0, `${at}: bước cuối phải kiểm "git status --porcelain" rỗng và exit 1 nếu không`);
      else if (tail.shell !== 'bash') err(CI, 0, `${at}: bước sạch cây phải đặt shell: bash (chạy giống nhau trên Windows)`);
    }
    return out;
  },
};
