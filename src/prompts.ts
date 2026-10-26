import { truncate } from './util/fsx.js';
import type { AgentDef, ChatMessage, Classification, DepartmentDef, ProjectDef, Subtask, Task } from './types.js';

export interface Prompt {
  system: string;
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

export interface Ctx {
  task: Task;
  dept: DepartmentDef;
  project?: ProjectDef;
  cwd: string;
  roster: AgentDef[];
}

export function systemFor(agent: AgentDef, dept: DepartmentDef | undefined, cls: Classification): string {
  return `# Bạn là ${agent.title} (@${agent.id})
Đơn vị: ${dept ? dept.name : 'Văn phòng điều phối'} · Vai trò: ${ROLE_LABEL[agent.role] ?? agent.role}.
Bạn là một sub-agent trong "CCoding Office" — văn phòng AI đa tác tử phục vụ công việc và học thuật của Tom (Data Lead & Solution Architect). Hãy làm việc như một chuyên gia thực thụ trong một đội ngũ.

## Hồ sơ vị trí
${agent.body}

## Quy tắc chung của văn phòng
- Viết bằng tiếng Việt có dấu; giữ nguyên thuật ngữ kỹ thuật tiếng Anh khi cần.
- Không bịa số liệu, nguồn, trích dẫn hay kết quả chạy thử; điều gì chưa kiểm chứng thì ghi rõ là giả định.
- Không đưa mật khẩu, khóa API, token hay dữ liệu cá nhân thật vào sản phẩm.
- Phân loại dữ liệu của nhiệm vụ: **${cls}** — ${CLASSIFICATION_RULE[cls]}
- Chỉ làm việc trong thư mục được giao; không chạy lệnh phá hủy (xóa hàng loạt, format, force push…).
- Ngắn gọn, đi thẳng vào việc; ưu tiên sản phẩm dùng được ngay.`;
}

function header(c: Ctx): string {
  const p = c.project;
  return `# Nhiệm vụ ${c.task.id}: ${c.task.title}

## Yêu cầu gốc
${c.task.brief}
${
  p
    ? `\n## Dự án: ${p.name} (${p.id})\n${p.description ?? ''}\nPhân loại dữ liệu: ${p.classification}.`
    : ''
}
## Thư mục làm việc
${c.cwd}`;
}

export function rosterLines(roster: AgentDef[]): string {
  return roster
    .map((a) => `- @${a.id} — ${a.title} — vai trò: ${a.role} — kỹ năng: ${a.skills.join(', ')}${a.summary ? ` — ${a.summary}` : ''}`)
    .join('\n');
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
  return `# Định tuyến nhiệm vụ ${task.id}

## Yêu cầu
${task.brief}
${project ? `\nDự án liên quan: ${project.name} — ${project.description ?? ''}\n` : ''}
## Các phòng ban
${list}

## Việc cần làm
Chọn phòng ban xử lý. Chọn chế độ "joint" (liên phòng: Phòng Nghiên cứu làm trước, Phòng Phát triển dùng kết quả để triển khai) chỉ khi nhiệm vụ thực sự cần cả nghiên cứu học thuật lẫn xây dựng sản phẩm. Đặt tiêu đề ngắn (≤ 70 ký tự) cho nhiệm vụ.

Trả lời DUY NHẤT một khối JSON:
\`\`\`json
{ "mode": "department" | "joint", "departments": ["dev"], "title": "…", "reason": "lý do ngắn" }
\`\`\``;
}

export function planPrompt(c: Ctx, priorContext?: string): string {
  return `${header(c)}
${priorContext ? `\n## Kết quả từ phòng trước (liên phòng)\n${truncate(priorContext, 12000)}\n` : ''}
## Điều lệ phòng
${truncate(c.dept.body, 3000)}

## Nhân sự có thể giao việc
${rosterLines(c.roster)}

## Việc của bạn (Trưởng phòng): LẬP KẾ HOẠCH
Phân rã yêu cầu thành 2–7 hạng mục rõ ràng, giao cho đúng người theo kỹ năng. Quy tắc:
- \`assignee\` phải là một id trong danh sách trên (không có dấu @). Hạn chế tự giao cho bản thân; người review sẽ kiểm tra ở bước sau nên không cần tạo hạng mục "review".
- \`dependsOn\` chỉ trỏ tới id hạng mục khác; tối đa hóa phần chạy song song.
- Mỗi hạng mục phải có tiêu chí hoàn thành kiểm chứng được.

Trả lời bằng một khối JSON theo mẫu:
${PLAN_SCHEMA}`;
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

export function discussPrompt(c: Ctx, agent: AgentDef, planSummary: string, subtasks: Subtask[], transcript: string, round: number, rounds: number): string {
  const mine = subtasks.filter((s) => s.assignee === agent.id).map((s) => `${s.id} ${s.title}`);
  return `${header(c)}

## Kế hoạch dự thảo của trưởng phòng
${planSummary}
${planText(subtasks)}

## Biên bản họp đến lúc này
${transcript}

## Việc của bạn: PHÁT BIỂU TRONG CUỘC HỌP (vòng ${round}/${rounds})
${mine.length ? `Phần việc dự kiến của bạn: ${mine.join('; ')}.` : 'Bạn chưa được giao hạng mục nào — góp ý từ góc nhìn chuyên môn của mình.'}
Phát biểu ngắn (≤ 120 từ) như trong một cuộc họp thật: đồng ý/không đồng ý, rủi ro, đề xuất chỉnh phân công hoặc phụ thuộc, câu hỏi cần làm rõ. Có thể @nhắc đồng nghiệp. Không lặp lại ý người khác đã nói. Chỉ trả về lời phát biểu, không tiêu đề.`;
}

export function finalizePrompt(c: Ctx, planSummary: string, subtasks: Subtask[], transcript: string): string {
  return `${header(c)}

## Kế hoạch dự thảo
${planSummary}
${planText(subtasks)}

## Biên bản họp
${transcript}

## Nhân sự
${rosterLines(c.roster)}

## Việc của bạn (Trưởng phòng): CHỐT KẾ HOẠCH SAU HỌP
Cân nhắc các góp ý hợp lý, điều chỉnh hạng mục/phân công/phụ thuộc nếu cần, ghi các quyết định chính. Trả lời bằng một khối JSON cùng mẫu kế hoạch, thêm trường "decisions":
${PLAN_SCHEMA.replace('"summary": "1–2 câu: cách tiếp cận tổng thể",', '"summary": "1–2 câu: cách tiếp cận tổng thể",\n  "decisions": ["Quyết định 1", "Quyết định 2"],')}`;
}

export function executePrompt(
  c: Ctx,
  agent: AgentDef,
  st: Subtask,
  planSummary: string,
  decisions: string,
  deps: Array<{ st: Subtask; text: string }>,
  allowTools: boolean,
  priorContext?: string,
): string {
  const depText = deps.length
    ? deps.map((d) => `### ${d.st.id} — ${d.st.title} (@${d.st.assignee})\n${truncate(d.text, Math.floor(16000 / deps.length))}`).join('\n\n')
    : '(không có)';
  return `${header(c)}
${priorContext ? `\n## Kết quả từ phòng trước (liên phòng)\n${truncate(priorContext, 8000)}\n` : ''}
## Kế hoạch chung đã chốt
${planSummary}
${decisions ? `Quyết định chính: ${decisions}` : ''}

## Hạng mục của bạn: ${st.id} — ${st.title}
${st.description}
${st.deliverable ? `Sản phẩm bàn giao: ${st.deliverable}` : ''}

## Đầu vào từ các hạng mục trước
${depText}

## Cách làm
${
  allowTools
    ? `Bạn được dùng công cụ (${agent.tools.join(', ')}) trong thư mục làm việc. Hãy tạo/sửa file thật khi phù hợp (code, cấu hình, tài liệu) và liệt kê đường dẫn trong phần bàn giao.`
    : 'Bạn trả lời bằng văn bản. Nếu cần tạo file, đưa nội dung đầy đủ trong khối code và ghi rõ tên file ngay phía trên khối đó.'
}
Câu trả lời CUỐI CÙNG phải là sản phẩm bàn giao hoàn chỉnh theo "Mẫu đầu ra" trong hồ sơ vị trí của bạn, mở đầu bằng mục "## Tóm tắt" (2–4 câu).`;
}

export function reviewPrompt(c: Ctx, items: Array<{ st: Subtask; text: string }>): string {
  const per = Math.max(2500, Math.floor(40000 / Math.max(1, items.length)));
  return `${header(c)}

## Các sản phẩm cần review
${items.map((i) => `### ${i.st.id} — ${i.st.title} (@${i.st.assignee})\nTiêu chí: ${i.st.description}\n\n${truncate(i.text, per)}`).join('\n\n---\n\n')}

## Việc của bạn: REVIEW CHẤT LƯỢNG
Đánh giá từng hạng mục theo tiêu chí review trong hồ sơ của bạn. Mức độ: "blocker" (sai/thiếu nghiêm trọng, không thể bàn giao), "major" (cần sửa trước khi bàn giao), "minor" (góp ý thêm). Chỉ đặt "approved": false khi có blocker/major.

Trả lời bằng một khối JSON:
\`\`\`json
{ "approved": true, "summary": "nhận xét chung", "issues": [ { "subtask": "S1", "severity": "major", "comment": "vấn đề + cách sửa" } ] }
\`\`\``;
}

export function revisePrompt(c: Ctx, st: Subtask, previous: string, issues: string): string {
  return `${header(c)}

## Hạng mục: ${st.id} — ${st.title}
${st.description}

## Bản trước của bạn
${truncate(previous, 16000)}

## Góp ý review cần xử lý
${issues}

## Việc của bạn: SỬA THEO REVIEW
Xử lý triệt để từng góp ý. Trả về BẢN HOÀN CHỈNH MỚI của sản phẩm (không chỉ phần thay đổi), mở đầu bằng "## Tóm tắt" và thêm mục "## Đã sửa theo review".`;
}

export function synthesizePrompt(
  c: Ctx,
  planSummary: string,
  decisions: string,
  items: Array<{ st: Subtask; text: string }>,
  review: string,
  priorContext?: string,
): string {
  const per = Math.max(2000, Math.floor(36000 / Math.max(1, items.length)));
  return `${header(c)}
${priorContext ? `\n## Kết quả từ phòng trước (liên phòng)\n${truncate(priorContext, 6000)}\n` : ''}
## Kế hoạch & quyết định
${planSummary}
${decisions}

## Sản phẩm của các thành viên
${items.map((i) => `### ${i.st.id} — ${i.st.title} (@${i.st.assignee})\n${truncate(i.text, per)}`).join('\n\n')}

## Kết luận review
${review || '(không review)'}

## Việc của bạn (Trưởng phòng): BÁO CÁO TỔNG HỢP
Viết báo cáo cuối cùng gửi Tom bằng Markdown với các mục:
# <tiêu đề>
## Tóm tắt điều hành
## Kết quả theo hạng mục (bảng: mã, hạng mục, phụ trách, kết quả, file)
## Quyết định & thảo luận chính
## Rủi ro, giả định & việc còn mở
## Bước tiếp theo đề xuất
Không lặp nguyên văn sản phẩm; tóm lược và dẫn tới file đầu ra.`;
}
