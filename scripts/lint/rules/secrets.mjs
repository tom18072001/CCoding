// K3 — bí mật trong tệp chữ đã track (data-protection-assessment.md: PRE/DET cho repo công khai).
// Thông điệp không bao giờ chứa giá trị khớp: dòng được làm sạch (đoạn khớp → [ẨN]) để neo allow.json dùng được.
const PEM = ['-----BEGIN ', '(?:[A-Z0-9]+ )*', 'PRIVATE KEY', '-----'].join('');
const PATTERNS = [
  { id: 'khóa Anthropic', re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { id: 'token GitHub (ghp_/gho_/ghu_/ghs_/ghr_)', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/g },
  { id: 'token GitHub (github_pat_)', re: /\bgithub_pat_[A-Za-z0-9_]{22,}/g },
  { id: 'khóa truy cập AWS', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'khối khóa riêng PEM', re: new RegExp(PEM, 'g') },
  { id: 'CCODING_LOG_HMAC_KEY có giá trị', re: /CCODING_LOG_HMAC_KEY(?:=(?![<$%{\s"'`]|\.\.\.|…)|\s*[=:]\s*["'](?!<|\$|\.\.\.|…))[^\s"'`]+/g },
];

/** Tệp nhị phân: có byte NUL ở 8 KB đầu. */
export const isBinary = (text) => text.slice(0, 8192).includes('\u0000');

export default {
  id: 'secrets',
  source: 'docs/data-protection-assessment.md — PRE/DET repo công khai; AGENTS.md (Data Protection Gate)',
  needsBase: false,
  async run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (file.startsWith('scripts/lint/rules/secrets.mjs')) continue; // mẫu regex, không phải bí mật
      let text;
      try {
        text = ctx.read(file);
      } catch {
        continue;
      }
      if (isBinary(text)) continue;
      text.split(/\r?\n/).forEach((line, i) => {
        for (const p of PATTERNS) {
          p.re.lastIndex = 0;
          if (!p.re.test(line)) continue;
          p.re.lastIndex = 0;
          const clean = line.replace(p.re, '[ẨN]').trim().slice(0, 100);
          out.push({ file, line: i + 1, msg: `${p.id} — không commit bí mật; dùng biến môi trường. Dòng đã làm sạch: ${clean}` });
        }
      });
    }
    return out;
  },
};
