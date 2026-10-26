import crypto from 'node:crypto';
import { estimateTokens } from '../util/tokens.js';
import type { RuntimeConfig } from '../config.js';
import type { RunHooks, RunRequest, RunResult, Runtime, RuntimeAvailability } from '../types.js';

/**
 * Runtime mô phỏng — chạy offline, không tốn token thật.
 * Dùng để demo giao diện, kiểm thử luồng điều phối và khi dự án bị phân loại "restricted"
 * mà chưa có mô hình chạy cục bộ.
 */

interface RosterHint { id: string; name: string; title: string; role: string; skills: string[] }
interface DeptHint { id: string; name: string; keywords: string[] }
interface SubtaskHint { id: string; title: string; assignee: string; description: string; dependsOn: string[] }

function seeded(seed: string): () => number {
  let h = crypto.createHash('sha256').update(seed).digest();
  let i = 0;
  return () => {
    if (i >= h.length - 4) {
      h = crypto.createHash('sha256').update(h).digest();
      i = 0;
    }
    const v = h.readUInt32BE(i) / 0xffffffff;
    i += 4;
    return v;
  };
}

const norm = (s: string) => s.toLowerCase().normalize('NFC');

function scoreText(text: string, words: string[]): number {
  const t = norm(text);
  return words.reduce((n, w) => (w && t.includes(norm(w)) ? n + 1 : n), 0);
}

const DISCUSS: Record<string, string[]> = {
  lead: [
    'Mình chốt mục tiêu trước: sản phẩm cuối phải dùng được ngay, không làm thừa. Ai thấy phạm vi chưa rõ thì nói luôn trong vòng này.',
    'Ưu tiên làm phần lõi trước, phần mở rộng để sau. Mỗi người bàn giao kèm giả định rõ ràng nhé.',
  ],
  'solution-architect': [
    'Đề xuất tách rõ lớp dữ liệu và lớp API ngay từ đầu, ghi quyết định kiến trúc dạng ADR. Cần chốt yêu cầu phi chức năng (tải, HA, ATTT cấp độ 4) trước khi @backend-dev code.',
    'Mình sẽ rà theo 10 nhóm phản biện (resilience, dữ liệu, bảo mật, vận hành, DR, chi phí…). Rủi ro lớn nhất hiện tại là luồng dữ liệu chưa được vẽ.',
  ],
  'backend-dev': [
    'Mình làm API bằng Node.js/TypeScript, có validate đầu vào và test. Cần @solution-architect chốt schema trước để không phải làm lại.',
    'Đồng ý kế hoạch. Mình đề xuất thêm healthcheck và log có cấu trúc (JSON) để @data-engineer đẩy thẳng vào ELK.',
  ],
  'frontend-dev': ['Giao diện nên làm vanilla JS gọn nhẹ, ưu tiên trạng thái rỗng/lỗi rõ ràng. Mình cần contract API sớm từ @backend-dev.'],
  'data-engineer': [
    'Log và dữ liệu nên chuẩn hóa ECS để vào Elasticsearch dễ truy vấn; mình sẽ dựng pipeline Logstash và ILM giữ ≥ 12 tháng.',
    'Cần xác định dòng dữ liệu (lineage) từ nguồn tới báo cáo; mình đề xuất gắn trace_id xuyên suốt.',
  ],
  devops: ['Mình chuẩn bị Docker/compose và script triển khai cho cả Windows lẫn Linux, có backup và rollback. Đề nghị thêm cảnh báo khi dịch vụ chết.'],
  security: [
    'Bắt buộc chạy Data Protection Gate: phân loại dữ liệu, IAM/RBAC, mã hóa in-transit, log bất biến. Không đưa dữ liệu thật vào DEV/UAT.',
    'Mình sẽ đối chiếu yêu cầu ATTT cấp độ 4: xác thực đa yếu tố cho quản trị, nhật ký truy xuất ≥ 12 tháng, sao lưu định kỳ.',
  ],
  'ba-presales': ['Mình viết user story và tiêu chí nghiệm thu để cả nhóm bám theo; đồng thời chuẩn bị phần thuyết minh nếu cần đưa vào hồ sơ đề xuất.'],
  'qa-tester': ['Mình sẽ review theo checklist: đúng yêu cầu, có test, xử lý lỗi, không lộ bí mật. Đề nghị mỗi hạng mục ghi rõ cách kiểm chứng.'],
  'research-lead': ['Câu hỏi nghiên cứu cần hẹp và đo được. Mình đề nghị chốt phạm vi tài liệu (5 năm gần đây) và tiêu chí đánh giá trước khi viết.'],
  'literature-researcher': ['Mình sẽ tổng quan tài liệu có hệ thống: chuỗi tìm kiếm, tiêu chí chọn/loại, bảng so sánh. Chỉ trích dẫn nguồn kiểm chứng được.'],
  'data-scientist': ['Đề xuất có baseline đơn giản và chỉ số đánh giá rõ ràng; mọi số liệu thực nghiệm phải tái lập được (seed, phiên bản dữ liệu).'],
  methodologist: ['Thiết kế nghiên cứu cần nêu rõ biến, giả thuyết, mối đe dọa tính hợp lệ. Mình sẽ đề xuất phương pháp phù hợp với thời gian học buổi tối/cuối tuần.'],
  'academic-writer': ['Mình sẽ giữ văn phong học thuật, định dạng APA 7, và cấu trúc IMRaD; cần @literature-researcher gửi danh mục tài liệu đã kiểm chứng.'],
  'peer-reviewer': ['Phản biện thẳng: giả định nào chưa có bằng chứng? Đóng góp mới là gì so với nghiên cứu trước? Mình sẽ chất vấn từng kết luận.'],
  orchestrator: ['Đã định tuyến nhiệm vụ. Các phòng giữ đúng phân loại dữ liệu của dự án.'],
};

function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length) % arr.length];
}

export class MockRuntime implements Runtime {
  id = 'mock';
  label = 'Mô phỏng (offline)';
  local = true;
  supportsTools = false;
  constructor(private cfg: RuntimeConfig) {}

  async available(): Promise<RuntimeAvailability> {
    return { ok: true, detail: 'luôn sẵn sàng — không gọi LLM thật' };
  }

  async run(req: RunRequest, hooks: RunHooks): Promise<RunResult> {
    const started = Date.now();
    const rnd = seeded(`${req.meta.taskId}:${req.meta.callId}:${req.agent.id}:${req.phase}`);
    const min = this.cfg.minDelayMs ?? 500;
    const max = Math.max(min, this.cfg.maxDelayMs ?? 1600);
    const delay = min + rnd() * (max - min);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, delay);
      hooks.signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new Error('Đã hủy'));
      });
    });
    hooks.onActivity?.(req.phase === 'execute' ? 'đang soạn sản phẩm…' : 'đang suy nghĩ…');
    const text = this.generate(req, rnd);
    hooks.onText?.(text);
    return {
      text,
      usage: {
        input: estimateTokens(req.system) + estimateTokens(req.prompt),
        output: estimateTokens(text),
        cacheRead: req.phase === 'discuss' ? Math.round(estimateTokens(req.system) * 0.8) : 0,
        cacheWrite: 0,
        costUsd: 0,
      },
      estimated: true,
      model: `mock-${req.model}`,
      runtime: this.id,
      durationMs: Date.now() - started,
    };
  }

  private generate(req: RunRequest, rnd: () => number): string {
    const h = req.hints ?? {};
    const brief = String(h.brief ?? '');
    switch (req.phase) {
      case 'route':
        return this.route(brief, (h.departments as DeptHint[]) ?? []);
      case 'plan':
        return this.plan(brief, (h.roster as RosterHint[]) ?? [], String(h.department ?? ''), rnd);
      case 'finalize':
        return `Chốt sau thảo luận: giữ nguyên phân công, bổ sung yêu cầu kiểm chứng cho từng hạng mục.\n\n\`\`\`json\n${JSON.stringify(
          { summary: h.planSummary ?? 'Kế hoạch đã chốt', decisions: ['Giữ phân công', 'Mỗi hạng mục có tiêu chí nghiệm thu'], subtasks: h.subtasks ?? [] },
          null,
          2,
        )}\n\`\`\``;
      case 'discuss': {
        const pool = DISCUSS[req.agent.id] ?? DISCUSS[req.agent.role] ?? ['Đồng ý với kế hoạch, mình sẽ bàn giao đúng hạn.'];
        return pick(pool, rnd);
      }
      case 'review': {
        const subs = (h.subtasks as SubtaskHint[]) ?? [];
        const rate = Number(this.cfg.reviewRejectRate ?? 0.25);
        const reject = Number(h.attempt ?? 0) === 0 && subs.length > 0 && rnd() < rate;
        const target = reject ? subs[Math.floor(rnd() * subs.length)] : undefined;
        return `Kết quả review:\n\n\`\`\`json\n${JSON.stringify(
          {
            approved: !reject,
            summary: reject ? `Cần bổ sung ở ${target!.id}` : 'Các hạng mục đạt yêu cầu, chỉ còn góp ý nhỏ.',
            issues: reject
              ? [{ subtask: target!.id, severity: 'major', comment: 'Thiếu phần kiểm chứng/tiêu chí nghiệm thu và giả định chưa được ghi rõ.' }]
              : subs.slice(0, 1).map((s) => ({ subtask: s.id, severity: 'minor', comment: 'Nên thêm ví dụ minh họa cụ thể.' })),
          },
          null,
          2,
        )}\n\`\`\``;
      }
      case 'synthesize':
        return this.final(brief, (h.subtasks as SubtaskHint[]) ?? [], String(h.departmentName ?? ''));
      default:
        return this.deliverable(req, h.subtask as SubtaskHint | undefined, brief, rnd);
    }
  }

  private route(brief: string, depts: DeptHint[]): string {
    const scored = depts.map((d) => ({ d, s: scoreText(brief, d.keywords) })).sort((a, b) => b.s - a.s);
    const research = scored.find((x) => x.d.id === 'research');
    const dev = scored.find((x) => x.d.id === 'dev');
    const joint = !!research && !!dev && research.s >= 2 && dev.s >= 2;
    const chosen = joint ? ['research', 'dev'] : [scored[0]?.d.id ?? 'dev'];
    return `\`\`\`json\n${JSON.stringify(
      {
        mode: joint ? 'joint' : 'department',
        departments: chosen,
        title: brief.trim().split('\n')[0].split(/[.!?](?:\s|$)/)[0].slice(0, 70),
        reason: joint
          ? 'Nhiệm vụ cần nghiên cứu trước rồi mới triển khai.'
          : `Từ khóa khớp nhiều nhất với ${scored[0]?.d.name ?? chosen[0]}.`,
      },
      null,
      2,
    )}\n\`\`\``;
  }

  private plan(brief: string, roster: RosterHint[], dept: string, rnd: () => number): string {
    const members = roster.filter((r) => r.role !== 'lead');
    const ranked = members
      .map((m) => ({ m, s: scoreText(brief, m.skills) + rnd() * 0.5 }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.m);
    const reviewer = members.find((m) => m.role === 'reviewer');
    const workers = ranked.filter((m) => m !== reviewer).slice(0, 4);
    const subtasks = workers.map((m, i) => ({
      id: `S${i + 1}`,
      title: `${m.title.split('(')[0].trim()}: phần việc chính`,
      assignee: m.id,
      description: `Thực hiện phần thuộc chuyên môn ${m.skills.slice(0, 3).join(', ')} cho yêu cầu: ${brief.slice(0, 120)}`,
      dependsOn: i === 0 ? [] : i === workers.length - 1 && workers.length > 2 ? ['S1', 'S2'] : ['S1'],
      deliverable: 'Tài liệu Markdown + file trong workspace (nếu có)',
    }));
    return `Kế hoạch ${dept}:\n\n\`\`\`json\n${JSON.stringify(
      { summary: `Chia ${subtasks.length} hạng mục theo chuyên môn, làm phần nền trước rồi song song.`, subtasks },
      null,
      2,
    )}\n\`\`\``;
  }

  private deliverable(req: RunRequest, st: SubtaskHint | undefined, brief: string, rnd: () => number): string {
    const title = st?.title ?? 'Hạng mục';
    const rev = req.phase === 'revise' ? '\n> Bản sửa sau review: đã bổ sung tiêu chí nghiệm thu và giả định.\n' : '';
    const n = 3 + Math.floor(rnd() * 3);
    const bullets = Array.from({ length: n }, (_, i) => `- Điểm ${i + 1}: phân tích theo góc nhìn ${req.agent.title.toLowerCase()} cho "${brief.slice(0, 50)}".`).join('\n');
    return `## Tóm tắt
${req.agent.title} hoàn thành **${title}**.${rev}

## Nội dung chính
${bullets}

## Giả định & rủi ro
- Giả định: yêu cầu chưa nêu số liệu cụ thể nên dùng giá trị mặc định hợp lý.
- Rủi ro: cần xác nhận lại với chủ dự án trước khi triển khai thật.

## Bàn giao
- Kết quả sẵn sàng cho các hạng mục phụ thuộc.
- Tiêu chí nghiệm thu: đối chiếu từng điểm ở trên với yêu cầu gốc.

_(Nội dung mô phỏng bởi runtime \`mock\` — cấu hình runtime thật để agent làm việc thực.)_`;
  }

  private final(brief: string, subs: SubtaskHint[], deptName: string): string {
    const rows = subs.map((s) => `| ${s.id} | ${s.title} | @${s.assignee} |`).join('\n');
    return `# Báo cáo tổng hợp — ${deptName}

## Tóm tắt điều hành
Phòng đã hoàn thành yêu cầu: ${brief.slice(0, 200)}

## Kết quả theo hạng mục
| Mã | Hạng mục | Phụ trách |
|---|---|---|
${rows}

## Quyết định chính
- Thống nhất phân công theo chuyên môn sau vòng thảo luận.
- Mọi hạng mục có tiêu chí nghiệm thu và giả định rõ ràng.

## Rủi ro & việc còn mở
- Cần chủ dự án xác nhận các giả định.

## Bước tiếp theo
1. Rà soát báo cáo và các file đầu ra.
2. Giao nhiệm vụ tiếp theo hoặc chạy lại với runtime thật.

_(Mô phỏng bởi runtime \`mock\`.)_`;
  }
}
