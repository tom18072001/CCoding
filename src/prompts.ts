import { truncate } from './util/fsx.js';
import type { AgentDef, ChatMessage, CheckResult, Classification, DepartmentDef, Phase, ProjectDef, Subtask, Task, ToolCallRecord, ToolName } from './types.js';

/**
 * Prompt cho từng pha. Mỗi lượt gọi gồm 3 phần:
 *   context — bối cảnh chung của nhiệm vụ trong pha đó (GIỐNG NHAU giữa các agent → runtime có cache tiền tố tận dụng được),
 *   system  — hồ sơ vị trí + quy tắc văn phòng (riêng từng agent; pha họp chỉ gửi phần tóm lược),
 *   prompt  — công việc riêng của lượt gọi.
 * Độ dài yêu cầu gốc / tài liệu đính kèm được giới hạn theo pha; khi agent có công cụ đọc file thì
 * chỉ gửi phần đầu kèm đường dẫn bản đầy đủ trong workspace.
 */

export interface Built {
  context: string;
  prompt: string;
}

const ROLE_LABEL: Record<string, string> = {
  lead: 'Trưởng phòng — lập kế hoạch, phân công, chốt quyết định, tổng hợp báo cáo',
  member: 'Thành viên chuyên môn — nhận và hoàn thành hạng mục được giao',
  reviewer: 'Người review — kiểm tra chất lượng trước khi bàn giao',
  router: 'Điều phối — định tuyến nhiệm vụ tới phòng ban phù hợp',
};

export const CLASSIFICATION_RULE: Record<Classification, string> = {
  public: 'Công khai — được dùng tự do, vẫn ghi nguồn.',
  internal: 'Nội bộ — không đưa ra ngoài phạm vi dự án, không chép bí mật/khóa truy cập vào sản phẩm.',
  confidential: 'Bảo mật — không dùng dữ liệu thật, che giấu dữ liệu cá nhân, chỉ tóm tắt ở mức cần thiết.',
  restricted: 'Hạn chế — dữ liệu cốt lõi/nhạy cảm: tuyệt đối không trích nguyên văn, chỉ làm việc trên dữ liệu đã che/giả lập.',
};

/** Tài liệu đính kèm đã trích xuất chữ. */
export interface AttachmentText {
  name: string;
  kind: string;
  chars: number;
  note?: string;
  text: string;
  /** Đường dẫn (tương đối workspace) tới bản chữ đầy đủ — khi agent có công cụ đọc file. */
  wsPath?: string;
}

export interface Ctx {
  task: Task;
  dept: DepartmentDef;
  project?: ProjectDef;
  cwd: string;
  roster: AgentDef[];
  attachments?: AttachmentText[];
  /** Agent đọc được file trong workspace (quyền công cụ của nhiệm vụ khác "none"). */
  filesAccessible?: boolean;
  /** Thư mục .ccoding/<task> (tương đối workspace) chứa inputs/ và outputs/. */
  ccDir?: string;
  branch?: string;
  /** Thư mục làm việc riêng của nhiệm vụ do CCoding tạo (không phải repo của dự án) — dùng để lưu sản phẩm thành tệp. */
  scratch?: boolean;
  /** Các hạng mục chạy lệnh trong repo dự án làm lần lượt (không ai chạy lệnh song song với mình). */
  serialWriters?: boolean;
  /** Bản đồ repo do CCoding tạo (đường dẫn tương đối workspace) + các tệp nguồn lớn. */
  repoMap?: { rel: string; large: string[] };
  /** P8: các nhiệm vụ trước của cùng dự án (pha lập kế hoạch) + tệp chi tiết. */
  projectHistory?: { text: string; rel?: string };
}

/** Trích các mục của hồ sơ — pha họp chỉ cần sứ mệnh + chuyên môn. */
export function profileSections(body: string, titles: string[]): string {
  const out: string[] = [];
  for (const t of titles) {
    const re = new RegExp(`^##\\s+${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'm');
    const m = re.exec(body);
    if (m) out.push(`## ${t}\n${m[1].trim()}`);
  }
  return out.length ? out.join('\n\n') : truncate(body, 1500);
}

export function systemFor(agent: AgentDef, dept: DepartmentDef | undefined, cls: Classification, phase?: Phase, feedback: string[] = []): string {
  const profile = phase === 'discuss' ? profileSections(agent.body, ['Sứ mệnh', 'Chuyên môn & kỹ năng']) : agent.body;
  return `# Bạn là ${agent.title} (@${agent.id})
Đơn vị: ${dept ? dept.name : 'Văn phòng điều phối'} · Vai trò: ${ROLE_LABEL[agent.role] ?? agent.role}.
Bạn là một sub-agent trong "CCoding Office" — văn phòng AI đa tác tử phục vụ công việc và học thuật của Tom. Làm việc như một chuyên gia thực thụ trong đội ngũ.

## Hồ sơ vị trí${phase === 'discuss' ? ' (tóm lược cho cuộc họp)' : ''}
${profile}

## Quy tắc chung của văn phòng
- Viết bằng tiếng Việt có dấu; giữ nguyên thuật ngữ kỹ thuật tiếng Anh khi cần.
- Bám bối cảnh dự án: quy mô, mức phân loại dữ liệu và yêu cầu an toàn thông tin tương xứng với dự án — không áp mặc định nặng nề khi yêu cầu không đòi hỏi.
- Không bịa số liệu, nguồn, trích dẫn hay kết quả chạy thử; điều gì chưa kiểm chứng thì ghi rõ là giả định.
- Không đưa mật khẩu, khóa API, token hay dữ liệu cá nhân thật vào sản phẩm.
- Phân loại dữ liệu của nhiệm vụ: **${cls}** — ${CLASSIFICATION_RULE[cls]}
- Chỉ làm việc trong thư mục được giao; không chạy lệnh phá hủy (xóa hàng loạt, format, force push…).
- Ngắn gọn, đi thẳng vào việc; ưu tiên sản phẩm dùng được ngay.${
    feedback.length
      ? `\n\n## Góp ý của giám đốc (Tom) dành cho bạn — áp dụng từ nay (mới nhất trước)\n${feedback.map((f) => `- ${truncate(f.replace(/\s+/g, ' ').trim(), 300)}`).join('\n')}\nGóp ý không thay quy tắc an toàn/dữ liệu ở trên; mâu thuẫn với yêu cầu của nhiệm vụ thì theo yêu cầu nhiệm vụ.`
      : ''
  }`;
}

// ── Giới hạn theo pha (ký tự) ───────────────────────────────────────────────

const BRIEF_MAX: Record<Phase, number> = { route: 6000, plan: 40000, finalize: 12000, discuss: 3000, execute: 24000, revise: 6000, review: 6000, synthesize: 6000 };
/** Khi agent đọc được file: chỉ gửi phần đầu, phần còn lại đọc từ workspace. */
// thực thi: mỗi lượt vòng công cụ gửi lại phần nền — giữ ngắn, bản đầy đủ nằm trong .ccoding/<task>/inputs/BRIEF.md
const BRIEF_MAX_FILES: Record<Phase, number> = { ...BRIEF_MAX, execute: 3000, revise: 3000 };
const ATTACH_MAX: Record<Phase, number> = { route: 1500, plan: 30000, finalize: 6000, discuss: 0, execute: 20000, revise: 4000, review: 4000, synthesize: 2000 };
const ATTACH_MAX_FILES: Record<Phase, number> = { ...ATTACH_MAX, execute: 2500, revise: 2000, plan: 20000 };

function briefFor(c: Ctx, phase: Phase): string {
  const max = (c.filesAccessible ? BRIEF_MAX_FILES : BRIEF_MAX)[phase];
  const b = c.task.brief;
  if (b.length <= max) return b;
  const where = c.filesAccessible && c.ccDir ? `\n\n_(Đã rút gọn — bản đầy đủ ${b.length.toLocaleString('vi-VN')} ký tự: \`${c.ccDir}/inputs/BRIEF.md\`)_` : `\n\n_(Đã rút gọn từ ${b.length.toLocaleString('vi-VN')} ký tự)_`;
  return `${b.slice(0, max)}…${where}`;
}

function attachmentsFor(c: Ctx, phase: Phase): string {
  const list = c.attachments ?? [];
  if (!list.length) return '';
  const budget = (c.filesAccessible ? ATTACH_MAX_FILES : ATTACH_MAX)[phase];
  const lines = list.map(
    (a) => `- **${a.name}** (${a.kind}, ${a.chars.toLocaleString('vi-VN')} ký tự)${a.wsPath && c.filesAccessible ? ` — bản chữ: \`${a.wsPath}\`` : ''}${a.note ? ` — ${a.note}` : ''}`,
  );
  let body = '';
  if (budget > 0) {
    const withText = list.filter((a) => a.text.trim());
    const per = withText.length ? Math.floor(budget / withText.length) : 0;
    body = withText
      .map((a) => `### ${a.name}\n${a.text.length > per ? `${a.text.slice(0, per)}\n… _(còn ${(a.text.length - per).toLocaleString('vi-VN')} ký tự${a.wsPath && c.filesAccessible ? ` — đọc tiếp trong \`${a.wsPath}\`` : ''})_` : a.text}`)
      .join('\n\n');
  }
  return `\n## Tài liệu đính kèm\n${lines.join('\n')}${body ? `\n\n${body}` : ''}\n`;
}

function header(c: Ctx, phase: Phase): string {
  const p = c.project;
  return `# Nhiệm vụ ${c.task.id}: ${c.task.title}

## Yêu cầu gốc
${briefFor(c, phase)}
${p ? `\n## Dự án: ${p.name} (${p.id})\n${p.description ?? ''}\nPhân loại dữ liệu: ${p.classification}.\n` : ''}${attachmentsFor(c, phase)}
## Thư mục làm việc
${c.cwd}${c.branch ? ` (git worktree riêng, nhánh \`${c.branch}\`)` : c.scratch && c.filesAccessible ? ' (thư mục riêng của nhiệm vụ — lưu sản phẩm thành tệp tại đây)' : ''}`;
}

export function rosterLines(roster: AgentDef[]): string {
  return roster.map((a) => `- @${a.id} — ${a.title} — vai trò: ${a.role} — kỹ năng: ${a.skills.join(', ')}${a.summary ? ` — ${a.summary}` : ''}`).join('\n');
}

const PLAN_SCHEMA = `\`\`\`json
{
  "summary": "1–2 câu: cách tiếp cận tổng thể",
  "subtasks": [
    {
      "id": "S1",
      "title": "Tên hạng mục ngắn gọn",
      "assignee": "<id agent trong danh sách>",
      "description": "Việc cụ thể cần làm, đầu vào, tiêu chí hoàn thành",
      "dependsOn": [],
      "deliverable": "Sản phẩm bàn giao"
    }
  ]
}
\`\`\``;

export function routePrompt(task: Task, depts: DepartmentDef[], project?: ProjectDef): string {
  const list = depts
    .map((d) => `- **${d.id}** — ${d.name} (mục đích: ${d.purpose}). Từ khóa: ${d.keywords.slice(0, 25).join(', ')}\n  ${d.body.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.trim() ?? ''}`)
    .join('\n');
  const brief = task.brief.length > BRIEF_MAX.route ? `${task.brief.slice(0, BRIEF_MAX.route)}…` : task.brief;
  const att = task.attachments?.length ? `\nTài liệu đính kèm: ${task.attachments.map((a) => a.name).join(', ')}\n` : '';
  return `# Định tuyến nhiệm vụ ${task.id}

## Yêu cầu
${brief}
${att}${project ? `\nDự án liên quan: ${project.name} — ${project.description ?? ''}\n` : ''}
## Các phòng ban
${list}

## Việc cần làm
Chọn phòng ban xử lý. Chọn chế độ "joint" (liên phòng: Phòng Nghiên cứu làm trước, Phòng Phát triển dùng kết quả để triển khai) chỉ khi nhiệm vụ thực sự cần cả nghiên cứu học thuật lẫn xây dựng sản phẩm. Đặt tiêu đề ngắn (≤ 70 ký tự) cho nhiệm vụ.

Trả lời DUY NHẤT một khối JSON:
\`\`\`json
{ "mode": "department" | "joint", "departments": ["dev"], "title": "…", "reason": "lý do ngắn" }
\`\`\``;
}

const WEB: ToolName[] = ['search_papers', 'web_search', 'fetch_url'];

function webNote(tools: ToolName[], phase: Phase): string {
  const web = tools.filter((t) => WEB.includes(t));
  if (!web.length) return '';
  const what =
    phase === 'review'
      ? 'kiểm chứng ngẫu nhiên các trích dẫn/khẳng định quan trọng (tồn tại, đúng năm/venue/DOI)'
      : phase === 'plan'
        ? 'ước lượng nhanh quy mô tài liệu/khoảng trống trước khi chia việc (vài truy vấn)'
        : 'tìm, đọc và kiểm chứng nguồn THẬT (bài báo, tiêu chuẩn, văn bản pháp luật)';
  return `\n## Tra cứu nguồn\nBạn có ${web.join(', ')} để ${what}. search_papers = OpenAlex (tiêu đề, venue, năm, DOI, số trích dẫn, tóm tắt; lọc year_from/venue); web_search = web chung; fetch_url = đọc trang/PDF (arXiv, ACL Anthology, văn bản luật…). Quy tắc: mỗi nguồn dẫn ra phải có DOI/URL đã thấy trong kết quả công cụ; nguồn chưa đọc được ghi [CHƯA KIỂM CHỨNG]; số đếm phải nêu truy vấn + bộ lọc đã dùng để tái lập; không bịa. Gộp truy vấn có mục tiêu — mỗi lượt công cụ gửi lại cả hội thoại nên tốn token.\n`;
}

function toolNote(c: Ctx, tools: ToolName[], phase: Phase): string {
  if (!tools.length) return '';
  const wn = webNote(tools, phase);
  tools = tools.filter((t) => !WEB.includes(t));
  if (!tools.length) return wn;
  return fileToolNote(c, tools, phase) + wn;
}

function fileToolNote(c: Ctx, tools: ToolName[], phase: Phase): string {
  const read = tools.filter((t) => ['list_files', 'read_file', 'search'].includes(t));
  if (phase === 'plan' || phase === 'finalize' || phase === 'synthesize')
    return `\n## Công cụ\nBạn có thể dùng ${read.join(', ')} để khảo sát nhanh workspace (quy tắc repo như CLAUDE.md/AGENTS.md, cấu trúc, README, cấu hình, tài liệu đính kèm) trước khi trả lời — chỉ đọc những gì cần cho bước này, gộp nhiều file trong một lần read_file.${c.repoMap ? ` Bản đồ repo \`${c.repoMap.rel}\` (tệp, số dòng, route, model, hàm) có sẵn — đọc nó thay vì duyệt từng thư mục.` : ''}\n${phase === 'plan' && c.repoMap?.large.length ? `\n## Tệp nguồn lớn trong repo\n${c.repoMap.large.map((f) => `- ${f}`).join('\n')}\nHạng mục phải sửa nhiều tệp lớn trong danh sách này thì tách nhỏ theo nhóm route/chức năng (mỗi hạng mục vừa một lượt ~30 thao tác công cụ).\n` : ''}`;
  if (phase === 'review')
    return `\n## Công cụ & bằng chứng\nBạn có ${tools.join(', ')} để kiểm chứng sản phẩm THẬT trong workspace — nhận xét dựa trên bằng chứng, không dựa trên lời tự khai trong báo cáo.
${tools.includes('run_command') ? '- BẮT BUỘC chạy các lệnh kiểm tra chính liên quan tới thay đổi (test, typecheck, lint, build — đúng lệnh của repo) bằng run_command trước khi kết luận; ghi từng lệnh và exit code vào "checks". Lệnh không chạy được thì ghi lý do — không suy đoán kết quả.\n' : ''}- Báo cáo nào có ghi chú "đã cắt" thì đọc phần còn lại bằng read_file (offset) khi cần để kết luận; phần đã có ở trên thì không đọc lại.
${c.scratch ? '- Kiểm tra các tệp sản phẩm đã thực sự được lưu trong thư mục làm việc (list_files) — sản phẩm chỉ nằm trong báo cáo mà không có tệp thì ghi rõ.\n' : '- Xem code/tệp đã thay đổi (git diff ở trên, read_file) thay vì tin mô tả.\n'}- Gộp nhiều file trong một lần read_file; tối đa vài lượt.\n`;
  if (c.scratch)
    return `\n## Công cụ & cách làm
Bạn có công cụ: ${tools.join(', ')} trong thư mục làm việc riêng của nhiệm vụ \`${c.cwd}\` (không phải repo).
- Đầu vào: \`${c.ccDir ?? '.ccoding'}/inputs/\` (yêu cầu đầy đủ, tài liệu đính kèm) · sản phẩm các hạng mục khác: \`${c.ccDir ?? '.ccoding'}/outputs/\`. Kiểm kê bằng list_files trước khi làm; đọc có mục tiêu, gộp nhiều file một lần — mỗi lượt công cụ gửi lại cả hội thoại.
- LƯU sản phẩm thành tệp thật bằng write_file (vd. bảng/CSV số liệu, danh mục nguồn .bib/.md, giao thức, bản thảo) với tên rõ nghĩa, theo thư mục con hợp lý; sửa tệp có sẵn bằng edit_file. Không dán toàn bộ nội dung tệp vào câu trả lời cuối — chỉ liệt kê tệp và điểm chính.
- Không đưa dữ liệu thật, bí mật hay dữ liệu cá nhân vào tệp.
Câu trả lời cuối cùng là báo cáo bàn giao theo ĐÚNG các mục trong "Mẫu đầu ra" của bạn (giữ nguyên tên mục, mở đầu "## Tóm tắt"); mục nào không áp dụng thì ghi "Không áp dụng" thay vì bỏ. Bắt buộc liệt kê tệp đã tạo/sửa (đường dẫn).
`;
  return `\n## Công cụ & cách làm
Bạn có công cụ: ${tools.join(', ')} — làm việc THẬT trong workspace \`${c.cwd}\`${c.branch ? ` (nhánh git riêng \`${c.branch}\`, không ảnh hưởng nhánh chính)` : ''}${c.serialWriters && tools.includes('run_command') ? '; các hạng mục chạy lệnh khác làm lần lượt nên không ai cài đặt/chạy test song song với bạn' : ''}.
- Đọc quy tắc của repo trước (CLAUDE.md, AGENTS.md, README, CONTRIBUTING nếu có) và tuân thủ tuyệt đối; khảo sát repo trước khi sửa (list_files, search, read_file — gộp nhiều file một lần); giữ đúng cấu trúc, phong cách và stack sẵn có. Mỗi lượt công cụ gửi lại toàn bộ hội thoại nên tốn token: đọc có mục tiêu, không đọc lại nội dung đã có trong prompt hoặc đã đọc.
${c.repoMap ? `- BẢN ĐỒ REPO: \`${c.repoMap.rel}\` liệt kê tệp + số dòng, route, model, hàm kèm số dòng — đọc nó ĐẦU TIÊN để định vị, rồi read_file đúng đoạn (offset theo số dòng, limit vừa đủ); không đọc cả tệp lớn.\n` : ''}- Đọc/tìm code bằng read_file/search/list_files — KHÔNG dùng Get-Content/cat/rg/grep qua run_command (lỗi cú pháp shell, sai mã hóa, tốn lượt). run_command chỉ để cài đặt, build, typecheck, test, migration, git.${tools.includes('run_command') && process.platform === 'win32' ? ' Shell là PowerShell: không có {a,b}, dấu * trong đường dẫn không tự mở rộng.' : ''}
- Tạo/sửa file thật bằng write_file/edit_file; không dán toàn bộ code vào câu trả lời cuối — chỉ liệt kê file và điểm chính. GHI SỚM: đọc đủ đoạn cần sửa là sửa ngay; khảo sát không dùng quá ~1/3 số lượt công cụ — hết lượt mà chưa ghi gì là hạng mục thất bại.
${tools.includes('run_command') ? '- Test/typecheck đã ĐỎ TRƯỚC khi bạn sửa (baseline): chỉ MỘT lệnh để ghi nhận tên test lỗi rồi làm tiếp — KHÔNG đọc file/chạy lệnh để điều tra hay sửa lỗi có sẵn ngoài phạm vi hạng mục (kể cả khi nghi do môi trường); tiêu chí là không phát sinh lỗi MỚI so với baseline (so sánh danh sách test lỗi trước/sau). Bàn giao trước đã ghi baseline thì dùng luôn, không đo lại.\n' : ''}${tools.includes('run_command') ? '- Chạy kiểm tra thật bằng run_command (cài dependency nếu thiếu, typecheck, test, lint, migration trên DB dev) và báo kết quả THẬT: lệnh, exit code, tóm tắt lỗi. Lệnh nào không chạy được thì ghi rõ lý do — không bịa kết quả.\n' : '- Không có quyền chạy lệnh: ghi rõ lệnh kiểm tra cần chạy để người khác thực hiện.\n'}${c.ccDir ? `- Tài liệu đầu vào: \`${c.ccDir}/inputs/\` · sản phẩm các hạng mục khác: \`${c.ccDir}/outputs/\`.\n` : ''}- Làm và commit (nếu cần) ngay trên nhánh hiện tại của worktree — KHÔNG tạo/chuyển/xóa nhánh (các đồng nghiệp đang làm song song trong cùng worktree); cần hợp nhất nhánh khác thì \`git merge <nhánh>\` vào nhánh hiện tại. Không push, không xóa hàng loạt; không đưa dữ liệu thật hay bí mật vào code, seed, test, fixture.
Câu trả lời cuối cùng là báo cáo bàn giao theo ĐÚNG các mục trong "Mẫu đầu ra" của bạn (giữ nguyên tên mục, mở đầu "## Tóm tắt"); mục nào không áp dụng thì ghi "Không áp dụng" thay vì bỏ. Bắt buộc có: tệp đã tạo/sửa (đường dẫn) và lệnh kiểm chứng đã chạy (lệnh → exit code/kết quả thật, hoặc lý do chưa chạy).
`;
}

export function planPrompt(c: Ctx, priorContext: string | undefined, tools: ToolName[] = []): Built {
  return {
    context: header(c, 'plan'),
    prompt: `${priorContext ? `## Kết quả từ phòng trước (liên phòng)\n${truncate(priorContext, 12000)}\n\n` : ''}${
      c.projectHistory
        ? `## Nhiệm vụ trước của dự án (mới nhất trước)${c.projectHistory.rel ? ` — chi tiết: \`${c.projectHistory.rel}\`` : ''}\n${c.projectHistory.text}\nDùng để nối tiếp: không lập lại việc đã xong, đưa việc còn mở/lỗi còn lại vào kế hoạch khi liên quan tới yêu cầu, dùng nhánh/kết quả đã có thay vì khảo sát lại.\n\n`
        : ''
    }## Điều lệ phòng
${truncate(c.dept.body, 3000)}

## Nhân sự có thể giao việc
${rosterLines(c.roster)}
${toolNote(c, tools, 'plan')}
## Việc của bạn (Trưởng phòng): LẬP KẾ HOẠCH
Phân rã yêu cầu thành 2–7 hạng mục rõ ràng, giao cho đúng người theo kỹ năng, quy mô tương xứng với yêu cầu (việc nhỏ thì ít hạng mục). Quy tắc:
- \`assignee\` phải là một id trong danh sách trên (không có dấu @). Hạn chế tự giao cho bản thân; người review sẽ kiểm tra ở bước sau nên không cần tạo hạng mục "review".
- \`dependsOn\` chỉ trỏ tới id hạng mục khác; tối đa hóa phần chạy song song.
- Mỗi hạng mục phải có tiêu chí hoàn thành kiểm chứng được${c.filesAccessible ? '; với dự án có repo, ghi rõ phần code/thư mục liên quan và lệnh kiểm tra (test/typecheck/migration) cần chạy' : ''}.${c.filesAccessible ? '\n- Cỡ hạng mục: một người phải làm xong trong MỘT lượt (~30 thao tác công cụ). Repo có tệp nguồn lớn (hàng nghìn dòng như server.js) thì mỗi hạng mục chỉ sửa ít tệp lớn — tách theo nhóm endpoint/màn hình/bảng (vd. "module + route mới" riêng, "lọc danh sách A, B" riêng, "test" riêng) thay vì gộp "toàn bộ API".' : ''}

Trả lời bằng một khối JSON theo mẫu:
${PLAN_SCHEMA}`,
  };
}

export function transcriptText(msgs: ChatMessage[], names: Map<string, string>, max = 9000): string {
  const text = msgs
    .filter((m) => m.kind !== 'system')
    .map((m) => `**${names.get(m.from) ?? m.from}** (@${m.from}${m.round ? `, vòng ${m.round}` : ''}): ${m.text}`)
    .join('\n\n');
  return text.length > max ? `…\n${text.slice(-max)}` : text || '(chưa có ý kiến)';
}

export function planText(subtasks: Subtask[]): string {
  return subtasks
    .map((s) => `- **${s.id}** ${s.title} → @${s.assignee}${s.dependsOn.length ? ` (sau ${s.dependsOn.join(', ')})` : ''}\n  ${s.description}${s.deliverable ? `\n  Bàn giao: ${s.deliverable}` : ''}`)
    .join('\n');
}

export function discussPrompt(c: Ctx, agent: AgentDef, planSummary: string, subtasks: Subtask[], transcript: string, round: number, rounds: number): Built {
  const mine = subtasks.filter((s) => s.assignee === agent.id).map((s) => `${s.id} ${s.title}`);
  return {
    context: `${header(c, 'discuss')}

## Kế hoạch dự thảo của trưởng phòng
${planSummary}
${planText(subtasks)}`,
    prompt: `## Biên bản họp đến lúc này
${transcript}

## Việc của bạn: PHÁT BIỂU TRONG CUỘC HỌP (vòng ${round}/${rounds})
${mine.length ? `Phần việc dự kiến của bạn: ${mine.join('; ')}.` : 'Bạn chưa được giao hạng mục nào — góp ý từ góc nhìn chuyên môn của mình.'}
Phát biểu ngắn (≤ 100 từ) như trong một cuộc họp thật: đồng ý/không đồng ý, rủi ro, đề xuất chỉnh phân công hoặc phụ thuộc, câu hỏi cần làm rõ. Có thể @nhắc đồng nghiệp. Không lặp lại ý người khác đã nói. Chỉ trả về lời phát biểu, không tiêu đề.`,
  };
}

export function finalizePrompt(c: Ctx, planSummary: string, subtasks: Subtask[], transcript: string): Built {
  return {
    context: header(c, 'finalize'),
    prompt: `## Kế hoạch dự thảo
${planSummary}
${planText(subtasks)}

## Biên bản họp
${transcript}

## Nhân sự
${rosterLines(c.roster)}

## Việc của bạn (Trưởng phòng): CHỐT KẾ HOẠCH SAU HỌP
Cân nhắc các góp ý hợp lý, điều chỉnh hạng mục/phân công/phụ thuộc nếu cần, ghi các quyết định chính. Trả lời bằng một khối JSON cùng mẫu kế hoạch, thêm trường "decisions":
${PLAN_SCHEMA.replace('"summary": "1–2 câu: cách tiếp cận tổng thể",', '"summary": "1–2 câu: cách tiếp cận tổng thể",\n  "decisions": ["Quyết định 1", "Quyết định 2"],')}`,
  };
}

function planBlock(planSummary: string, decisions: string, subtasks: Subtask[], fullAt?: string): string {
  // fullAt: agent đọc được tệp → mỗi hạng mục một dòng (mô tả đầy đủ trong tệp); phần này gửi lại ở mọi lượt công cụ
  return `## Kế hoạch chung đã chốt${fullAt ? ` (mô tả đầy đủ: \`${fullAt}\`)` : ''}
${planSummary}
${decisions ? `Quyết định chính: ${decisions}\n` : ''}${fullAt ? planLines(subtasks) : planText(subtasks)}`;
}

/** Mỗi hạng mục một dòng: mã, tên, người làm, phụ thuộc. */
export function planLines(subtasks: Subtask[]): string {
  return subtasks.map((s) => `- **${s.id}** ${s.title} → @${s.assignee}${s.dependsOn.length ? ` (sau ${s.dependsOn.join(', ')})` : ''}`).join('\n');
}

/** Nội dung `.ccoding/<task>/PLAN.md` — kế hoạch đầy đủ cho agent đọc khi cần. */
export function planFile(planSummary: string, decisions: string, subtasks: Subtask[]): string {
  return `# Kế hoạch chung\n\n${planSummary}\n${decisions ? `\nQuyết định chính: ${decisions}\n` : ''}\n${planText(subtasks)}\n`;
}

export interface DepInput {
  st: Subtask;
  text: string;
  /** Đường dẫn bản đầy đủ trong workspace (khi đọc được file). */
  wsPath?: string;
}

function depsText(c: Ctx, deps: DepInput[], total: number): string {
  if (!deps.length) return '(không có)';
  const per = Math.floor(total / deps.length);
  return deps
    .map((d) => {
      const more = d.wsPath && c.filesAccessible ? ` — bản đầy đủ: \`${d.wsPath}\`` : '';
      return `### ${d.st.id} — ${d.st.title} (@${d.st.assignee})${more}\n${truncate(d.text, per)}`;
    })
    .join('\n\n');
}

/** Ngữ cảnh khi cho một hạng mục chạy tiếp sau khi chạm trần công cụ. */
export interface Continuation {
  n: number;
  max: number;
  previous: string;
  changes: string;
  /** Nhiệm vụ được tiếp tục sau khi hạng mục dừng giữa chừng ở lượt chạy trước. */
  resumed?: boolean;
}

export function executePrompt(
  c: Ctx,
  agent: AgentDef,
  st: Subtask,
  planSummary: string,
  decisions: string,
  deps: DepInput[],
  tools: ToolName[],
  priorContext?: string,
  subtasks: Subtask[] = [],
  draft?: { text: string; wsPath?: string },
  continuation?: Continuation,
): Built {
  const canWrite = tools.includes('write_file');
  const draftBlock = draft?.text
    ? `\n## Bản trước của hạng mục này${draft.wsPath && c.filesAccessible ? ` (đầy đủ: \`${draft.wsPath}\`)` : ''}\nĐây là bản đã làm ở lần chạy trước${canWrite ? ' (chỉ ở dạng văn bản, CHƯA áp dụng vào workspace)' : ''}. Tận dụng nội dung đúng, ${canWrite ? 'áp dụng thật vào repo, kiểm chứng bằng lệnh' : 'hoàn thiện'} và sửa chỗ sai — không viết lại từ đầu nếu không cần.\n${truncate(draft.text, c.filesAccessible ? 6000 : 14000)}\n`
    : '';
  const contBlock = continuation
    ? `\n## ↻ CHẠY TIẾP (lần ${continuation.n}/${continuation.max}) — hạng mục chưa xong ở lần trước
${continuation.resumed ? 'Nhiệm vụ vừa được tiếp tục; lượt chạy trước của hạng mục này dừng giữa chừng (phần đã ghi vẫn còn trong workspace).' : 'Lần chạy trước hết lượt/ngân sách công cụ khi CHƯA XONG.'} Đây là ngữ cảnh mới: KHÔNG khảo sát lại từ đầu — dựa vào bàn giao dở dang và trạng thái workspace dưới đây, đọc đúng đoạn cần sửa và GHI TỆP trong ~5 lượt đầu (tạo module/tệp mới trước, rồi nối vào tệp lớn bằng edit_file nhỏ), làm nốt phần còn lại, rồi chạy kiểm chứng.
### Bàn giao dở dang của lần trước
${truncate(continuation.previous, 7000)}
### Thay đổi hiện có trong workspace (so với điểm xuất phát)
${continuation.changes ? '```\n' + truncate(continuation.changes, 3000) + '\n```' : '(chưa có thay đổi nào được ghi)'}
`
    : '';
  return {
    context: `${header(c, 'execute')}
${priorContext ? `\n## Kết quả từ phòng trước (liên phòng)\n${truncate(priorContext, 8000)}\n` : ''}
${planBlock(planSummary, decisions, subtasks, c.filesAccessible && c.ccDir ? `${c.ccDir}/PLAN.md` : undefined)}`,
    prompt: `## Hạng mục của bạn: ${st.id} — ${st.title}
${st.description}
${st.deliverable ? `Sản phẩm bàn giao: ${st.deliverable}` : ''}

## Đầu vào từ các hạng mục trước
${depsText(c, deps, c.filesAccessible ? 3500 : 16000)}
${draftBlock}${contBlock}${checksBlock(c.task, 'execute')}${toolNote(c, tools, 'execute')}${
      canWrite
        ? ''
        : `\n## Cách làm\nBạn trả lời bằng văn bản. Nếu cần tạo file, đưa nội dung đầy đủ trong khối code và ghi rõ tên file ngay phía trên khối đó.\n`
    }
Câu trả lời CUỐI CÙNG phải là sản phẩm bàn giao hoàn chỉnh theo "Mẫu đầu ra" trong hồ sơ vị trí của bạn, mở đầu bằng mục "## Tóm tắt" (2–4 câu).`,
  };
}

export function reviewPrompt(c: Ctx, items: DepInput[], tools: ToolName[] = [], changes = ''): Built {
  const canRead = tools.includes('read_file');
  const per = Math.max(4000, Math.floor(60000 / Math.max(1, items.length)));
  const body = (i: DepInput) => {
    if (i.text.length <= per) return i.text;
    const rest = (i.text.length - per).toLocaleString('vi-VN');
    return `${i.text.slice(0, per)}\n\n> ✂ ĐÃ CẮT — còn ${rest} ký tự${i.wsPath && canRead ? `; đọc tiếp: read_file \`${i.wsPath}\` (offset theo dòng)` : ' (không đọc được phần còn lại — chỉ kết luận trên phần hiển thị và ghi rõ)'}`;
  };
  return {
    context: header(c, 'review'),
    prompt: `## Các sản phẩm cần review
${items.map((i) => `### ${i.st.id} — ${i.st.title} (@${i.st.assignee})${i.wsPath && c.filesAccessible ? ` — bản đầy đủ: \`${i.wsPath}\`` : ''}\nTiêu chí: ${i.st.description}\n\n${body(i)}`).join('\n\n---\n\n')}
${changes ? `\n## Thay đổi trong workspace (git)\n\`\`\`\n${truncate(changes, 4000)}\n\`\`\`\n` : ''}${checksBlock(c.task, 'review')}${toolNote(c, tools, 'review')}
## Việc của bạn: REVIEW CHẤT LƯỢNG
Đánh giá từng hạng mục theo tiêu chí review trong hồ sơ của bạn, tương xứng với quy mô và yêu cầu của nhiệm vụ. Mức độ: "blocker" (sai/thiếu nghiêm trọng, không thể bàn giao), "major" (cần sửa trước khi bàn giao), "minor" (góp ý thêm). Chỉ đặt "approved": false khi có blocker/major.

Trả lời bằng một khối JSON${tools.includes('run_command') ? ' ("checks" là các lệnh bạn ĐÃ chạy thật)' : ''}:
\`\`\`json
{ "approved": true, "summary": "nhận xét chung", "issues": [ { "subtask": "S1", "severity": "major", "comment": "vấn đề + cách sửa" } ]${tools.includes('run_command') ? ', "checks": [ { "command": "npm test", "exitCode": 0, "note": "148/148 đạt" } ]' : ''} }
\`\`\``,
  };
}

export function revisePrompt(c: Ctx, st: Subtask, previous: string, issues: string, tools: ToolName[] = [], wsPath?: string): Built {
  return {
    context: header(c, 'revise'),
    prompt: `## Hạng mục: ${st.id} — ${st.title}
${st.description}

## Bản trước của bạn${wsPath && c.filesAccessible ? ` (bản đầy đủ: \`${wsPath}\`)` : ''}
${truncate(previous, c.filesAccessible ? 8000 : 16000)}

## Góp ý review cần xử lý
${issues}
${toolNote(c, tools, 'revise')}
## Việc của bạn: SỬA THEO REVIEW
Xử lý triệt để từng góp ý (sửa file thật nếu có công cụ). Trả về BẢN HOÀN CHỈNH MỚI của báo cáo bàn giao (không chỉ phần thay đổi), mở đầu bằng "## Tóm tắt" và thêm mục "## Đã sửa theo review".`,
  };
}

export function synthesizePrompt(
  c: Ctx,
  planSummary: string,
  decisions: string,
  items: DepInput[],
  review: string,
  priorContext?: string,
  changes = '',
  tools: ToolName[] = [],
): Built {
  const per = Math.max(1500, Math.floor(30000 / Math.max(1, items.length)));
  return {
    context: header(c, 'synthesize'),
    prompt: `${priorContext ? `## Kết quả từ phòng trước (liên phòng)\n${truncate(priorContext, 6000)}\n\n` : ''}## Kế hoạch & quyết định
${planSummary}
${decisions}

## Sản phẩm của các thành viên
${items.map((i) => `### ${i.st.id} — ${i.st.title} (@${i.st.assignee})${i.wsPath && c.filesAccessible ? ` — \`${i.wsPath}\`` : ''}\n${truncate(i.text, per)}`).join('\n\n')}
${changes ? `\n## Thay đổi trong workspace (git)\n\`\`\`\n${truncate(changes, 4000)}\n\`\`\`\n` : ''}
## Kết luận review
${review || '(không review)'}
${checksBlock(c.task, 'synthesize')}${toolNote(c, tools, 'synthesize')}
## Việc của bạn (Trưởng phòng): BÁO CÁO TỔNG HỢP
Viết báo cáo cuối cùng gửi Tom bằng Markdown: dòng đầu "# <tiêu đề>", sau đó ĐÚNG các mục trong "Mẫu đầu ra" của bạn (giữ nguyên tên mục, bắt đầu "## Tóm tắt" — kết luận trước). Bên trong các mục đó bắt buộc có:
- bảng kết quả theo hạng mục: mã · hạng mục · phụ trách · kết quả (đạt/chưa đạt theo review, kèm bằng chứng) · tệp;
- quyết định chính, rủi ro/giả định, việc còn mở;
- bước tiếp theo đề xuất — phần còn lớn so với một nhiệm vụ thì đề xuất tách thành các nhiệm vụ riêng (mỗi nhiệm vụ một gói việc, có tiêu chí xong).
Không lặp nguyên văn sản phẩm; tóm lược và dẫn tới file đầu ra${changes ? '; nêu rõ nhánh git và cách review/merge thay đổi' : ''}.`,
  };
}

/** Lời nhắc viết tiếp khi đầu ra bị cắt do giới hạn độ dài. */
export function continuePrompt(original: string, partial: string): string {
  return `${original}

## Phần bạn đã viết (bị cắt do giới hạn độ dài)
…${partial.slice(-2500)}

## Việc của bạn
Viết TIẾP ngay từ chỗ bị cắt ở trên — không lặp lại phần đã viết, không mở đầu lại, không thêm lời dẫn.`;
}

/** Ghi chú cho lần thử trên runtime khác khi lần trước đã thao tác workspace rồi mới lỗi (giới hạn tốc độ, mất kết nối…). */
export function handoverNote(label: string, kind: string, calls: ToolCallRecord[]): string {
  const lines = calls.slice(-40).map((tc) => `- ${tc.name} ${tc.args.replace(/\s+/g, ' ').slice(0, 160)} ${tc.ok ? '✓' : '✗'}`);
  return `## ⚠️ Lần thử trước bị ngắt giữa chừng (${label}: ${kind})
Lần thử trước đã thực hiện các thao tác dưới đây TRONG WORKSPACE trước khi lỗi — thay đổi (và commit, nếu có) vẫn còn. Kiểm tra \`git status\`/\`git log -3\`/\`git diff\` trước, rồi làm TIẾP phần còn thiếu và chạy kiểm chứng — KHÔNG làm lại, không sửa chồng.
${lines.join('\n')}${calls.length > 40 ? `\n- … (${calls.length - 40} thao tác trước đó)` : ''}`;
}

const checkLine = (r: CheckResult) =>
  `- \`${r.command}\` → ${r.denied ? `bị chặn (${r.denied})` : r.timedOut ? 'hết thời gian' : `exit ${r.code}`}${r.summary && !r.denied ? ` — ${r.summary}` : ''}`;

/** Kết quả lệnh kiểm tra của dự án do CCoding tự chạy — bằng chứng không phụ thuộc agent/model. */
export function checksBlock(task: Task, phase: 'execute' | 'review' | 'synthesize'): string {
  const pc = task.projectChecks;
  if (!pc?.baseline?.length && !pc?.latest?.length) return '';
  const parts = ['\n## Lệnh kiểm tra của dự án (CCoding tự chạy, không qua agent)'];
  if (pc.baseline?.length) parts.push(`Trước khi sửa (baseline):\n${pc.baseline.map(checkLine).join('\n')}`);
  if (phase !== 'execute' && pc.latest?.length) {
    parts.push(`Sau ${pc.latestAfter === 'revise' ? 'vòng sửa gần nhất' : 'thực thi'}:\n${pc.latest.map(checkLine).join('\n')}`);
    if (phase === 'review')
      for (const r of pc.latest.filter((x) => !x.ok && x.tail)) parts.push(`Đầu ra của \`${r.command}\` (phần cuối):\n\`\`\`\n${r.tail.slice(-2500)}\n\`\`\``);
  }
  if (phase === 'execute')
    parts.push('Đây là kết quả đo sẵn trước khi sửa — KHÔNG đo lại baseline. Lỗi đã có ở baseline không phải việc của hạng mục này trừ khi yêu cầu nói rõ. Sau khi sửa, chạy lại đúng các lệnh trên để kiểm chứng phần của mình; CCoding sẽ tự chạy lại chúng trước review.');
  if (phase === 'review')
    parts.push('Đây là bằng chứng chạy thật: kết luận dựa trên nó. Lệnh đạt ở baseline mà lỗi sau khi sửa = lỗi do thay đổi lần này → không duyệt. Không cần chạy lại các lệnh trên; chỉ chạy lệnh khác khi cần kiểm một điểm cụ thể.');
  if (phase === 'synthesize') parts.push('Ghi kết quả các lệnh này (trước/sau) vào báo cáo như bằng chứng kiểm chứng.');
  return `${parts.join('\n')}\n`;
}
