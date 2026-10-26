import { truncate } from './util/fsx.js';
import type { AgentDef, ChatMessage, Classification, DepartmentDef, Phase, ProjectDef, Subtask, Task, ToolName } from './types.js';

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

export function systemFor(agent: AgentDef, dept: DepartmentDef | undefined, cls: Classification, phase?: Phase): string {
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
- Ngắn gọn, đi thẳng vào việc; ưu tiên sản phẩm dùng được ngay.`;
}

// ── Giới hạn theo pha (ký tự) ───────────────────────────────────────────────

const BRIEF_MAX: Record<Phase, number> = { route: 6000, plan: 40000, finalize: 12000, discuss: 3000, execute: 24000, revise: 6000, review: 6000, synthesize: 6000 };
/** Khi agent đọc được file: chỉ gửi phần đầu, phần còn lại đọc từ workspace. */
const BRIEF_MAX_FILES: Record<Phase, number> = { ...BRIEF_MAX, execute: 8000 };
const ATTACH_MAX: Record<Phase, number> = { route: 1500, plan: 30000, finalize: 6000, discuss: 0, execute: 20000, revise: 4000, review: 4000, synthesize: 2000 };
const ATTACH_MAX_FILES: Record<Phase, number> = { ...ATTACH_MAX, execute: 6000, plan: 20000 };

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
${c.cwd}${c.branch ? ` (git worktree riêng, nhánh \`${c.branch}\`)` : ''}`;
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
    return `\n## Công cụ\nBạn có thể dùng ${read.join(', ')} để khảo sát nhanh workspace (quy tắc repo như CLAUDE.md/AGENTS.md, cấu trúc, README, cấu hình, tài liệu đính kèm) trước khi trả lời — chỉ đọc những gì cần cho bước này, gộp nhiều file trong một lần read_file.\n`;
  if (phase === 'review')
    return `\n## Công cụ\nBạn có ${tools.join(', ')} để kiểm chứng sản phẩm thật trong workspace (xem code đã thay đổi${tools.includes('run_command') ? ', chạy test/typecheck để xác nhận' : ''}). Nội dung các báo cáo ĐÃ có ở trên — KHÔNG đọc lại file báo cáo trong .ccoding; chỉ dùng công cụ cho điều chưa có (code, test). Tối đa vài lượt, gộp nhiều file một lần. Nhận xét dựa trên bằng chứng.\n`;
  return `\n## Công cụ & cách làm
Bạn có công cụ: ${tools.join(', ')} — làm việc THẬT trong workspace \`${c.cwd}\`${c.branch ? ` (nhánh git riêng \`${c.branch}\`, không ảnh hưởng nhánh chính)` : ''}.
- Đọc quy tắc của repo trước (CLAUDE.md, AGENTS.md, README, CONTRIBUTING nếu có) và tuân thủ tuyệt đối; khảo sát repo trước khi sửa (list_files, search, read_file — gộp nhiều file một lần); giữ đúng cấu trúc, phong cách và stack sẵn có. Mỗi lượt công cụ gửi lại toàn bộ hội thoại nên tốn token: đọc có mục tiêu, không đọc lại nội dung đã có trong prompt hoặc đã đọc.
- Tạo/sửa file thật bằng write_file/edit_file; không dán toàn bộ code vào câu trả lời cuối — chỉ liệt kê file và điểm chính.
${tools.includes('run_command') ? '- Chạy kiểm tra thật bằng run_command (cài dependency nếu thiếu, typecheck, test, lint, migration trên DB dev) và báo kết quả THẬT: lệnh, exit code, tóm tắt lỗi. Lệnh nào không chạy được thì ghi rõ lý do — không bịa kết quả.\n' : '- Không có quyền chạy lệnh: ghi rõ lệnh kiểm tra cần chạy để người khác thực hiện.\n'}${c.ccDir ? `- Tài liệu đầu vào: \`${c.ccDir}/inputs/\` · sản phẩm các hạng mục khác: \`${c.ccDir}/outputs/\`.\n` : ''}- Làm và commit (nếu cần) ngay trên nhánh hiện tại của worktree — KHÔNG tạo/chuyển/xóa nhánh (các đồng nghiệp đang làm song song trong cùng worktree); cần hợp nhất nhánh khác thì \`git merge <nhánh>\` vào nhánh hiện tại. Không push, không xóa hàng loạt; không đưa dữ liệu thật hay bí mật vào code, seed, test, fixture.
Câu trả lời cuối cùng là báo cáo bàn giao theo "Mẫu đầu ra" của bạn, mở đầu "## Tóm tắt", có thêm "## File đã thay đổi" và "## Kiểm tra đã chạy".
`;
}

export function planPrompt(c: Ctx, priorContext: string | undefined, tools: ToolName[] = []): Built {
  return {
    context: header(c, 'plan'),
    prompt: `${priorContext ? `## Kết quả từ phòng trước (liên phòng)\n${truncate(priorContext, 12000)}\n\n` : ''}## Điều lệ phòng
${truncate(c.dept.body, 3000)}

## Nhân sự có thể giao việc
${rosterLines(c.roster)}
${toolNote(c, tools, 'plan')}
## Việc của bạn (Trưởng phòng): LẬP KẾ HOẠCH
Phân rã yêu cầu thành 2–7 hạng mục rõ ràng, giao cho đúng người theo kỹ năng, quy mô tương xứng với yêu cầu (việc nhỏ thì ít hạng mục). Quy tắc:
- \`assignee\` phải là một id trong danh sách trên (không có dấu @). Hạn chế tự giao cho bản thân; người review sẽ kiểm tra ở bước sau nên không cần tạo hạng mục "review".
- \`dependsOn\` chỉ trỏ tới id hạng mục khác; tối đa hóa phần chạy song song.
- Mỗi hạng mục phải có tiêu chí hoàn thành kiểm chứng được${c.filesAccessible ? '; với dự án có repo, ghi rõ phần code/thư mục liên quan và lệnh kiểm tra (test/typecheck/migration) cần chạy' : ''}.

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

function planBlock(planSummary: string, decisions: string, subtasks: Subtask[]): string {
  return `## Kế hoạch chung đã chốt
${planSummary}
${decisions ? `Quyết định chính: ${decisions}\n` : ''}${planText(subtasks)}`;
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
): Built {
  const canWrite = tools.includes('write_file');
  const draftBlock = draft?.text
    ? `\n## Bản trước của hạng mục này${draft.wsPath && c.filesAccessible ? ` (đầy đủ: \`${draft.wsPath}\`)` : ''}\nĐây là bản đã làm ở lần chạy trước${canWrite ? ' (chỉ ở dạng văn bản, CHƯA áp dụng vào workspace)' : ''}. Tận dụng nội dung đúng, ${canWrite ? 'áp dụng thật vào repo, kiểm chứng bằng lệnh' : 'hoàn thiện'} và sửa chỗ sai — không viết lại từ đầu nếu không cần.\n${truncate(draft.text, c.filesAccessible ? 6000 : 14000)}\n`
    : '';
  return {
    context: `${header(c, 'execute')}
${priorContext ? `\n## Kết quả từ phòng trước (liên phòng)\n${truncate(priorContext, 8000)}\n` : ''}
${planBlock(planSummary, decisions, subtasks)}`,
    prompt: `## Hạng mục của bạn: ${st.id} — ${st.title}
${st.description}
${st.deliverable ? `Sản phẩm bàn giao: ${st.deliverable}` : ''}

## Đầu vào từ các hạng mục trước
${depsText(c, deps, c.filesAccessible ? 6000 : 16000)}
${draftBlock}${toolNote(c, tools, 'execute')}${
      canWrite
        ? ''
        : `\n## Cách làm\nBạn trả lời bằng văn bản. Nếu cần tạo file, đưa nội dung đầy đủ trong khối code và ghi rõ tên file ngay phía trên khối đó.\n`
    }
Câu trả lời CUỐI CÙNG phải là sản phẩm bàn giao hoàn chỉnh theo "Mẫu đầu ra" trong hồ sơ vị trí của bạn, mở đầu bằng mục "## Tóm tắt" (2–4 câu).`,
  };
}

export function reviewPrompt(c: Ctx, items: DepInput[], tools: ToolName[] = [], changes = ''): Built {
  const per = Math.max(2500, Math.floor((c.filesAccessible ? 24000 : 40000) / Math.max(1, items.length)));
  return {
    context: header(c, 'review'),
    prompt: `## Các sản phẩm cần review
${items.map((i) => `### ${i.st.id} — ${i.st.title} (@${i.st.assignee})${i.wsPath && c.filesAccessible ? ` — bản đầy đủ: \`${i.wsPath}\`` : ''}\nTiêu chí: ${i.st.description}\n\n${truncate(i.text, per)}`).join('\n\n---\n\n')}
${changes ? `\n## Thay đổi trong workspace (git)\n\`\`\`\n${truncate(changes, 4000)}\n\`\`\`\n` : ''}${toolNote(c, tools, 'review')}
## Việc của bạn: REVIEW CHẤT LƯỢNG
Đánh giá từng hạng mục theo tiêu chí review trong hồ sơ của bạn, tương xứng với quy mô và yêu cầu của nhiệm vụ. Mức độ: "blocker" (sai/thiếu nghiêm trọng, không thể bàn giao), "major" (cần sửa trước khi bàn giao), "minor" (góp ý thêm). Chỉ đặt "approved": false khi có blocker/major.

Trả lời bằng một khối JSON:
\`\`\`json
{ "approved": true, "summary": "nhận xét chung", "issues": [ { "subtask": "S1", "severity": "major", "comment": "vấn đề + cách sửa" } ] }
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
${toolNote(c, tools, 'synthesize')}
## Việc của bạn (Trưởng phòng): BÁO CÁO TỔNG HỢP
Viết báo cáo cuối cùng gửi Tom bằng Markdown với các mục:
# <tiêu đề>
## Tóm tắt điều hành
## Kết quả theo hạng mục (bảng: mã, hạng mục, phụ trách, kết quả, file)
## Quyết định & thảo luận chính
## Rủi ro, giả định & việc còn mở
## Bước tiếp theo đề xuất
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
