# Viết và tùy biến agent.md

Mỗi nhân sự là một file Markdown trong `agents/` (thư mục con tùy ý). Frontmatter YAML là **siêu dữ liệu** (dùng cho phân công, giao diện, runtime); phần thân là **hồ sơ vị trí** — được gửi làm system prompt **mỗi lượt** agent làm việc, nên phải ngắn.

## Frontmatter

```yaml
---
id: backend-dev                 # duy nhất, chữ thường-gạch-ngang
name: "Backend Developer"       # tên vị trí (role) — không dùng tên người
short: "Backend"                # nhãn ngắn trên sơ đồ văn phòng (≤ 14 ký tự)
title: "Backend Developer (API, CSDL & migration)"
department: dev                 # id phòng ban (departments/<id>.md) — "office" cho điều phối viên
role: member                    # lead | member | reviewer | router
model: sonnet                   # opus | sonnet | haiku hoặc id model đầy đủ
runtime: inherit                # hoặc claude-cli | codex-cli | kimi-cli | anthropic-api | openai-api | mock
tools: [Read, Write, Edit, Glob, Grep, Bash]   # công cụ workspace được dùng (xem bảng dưới)
skills: [nodejs, typescript, rest-api, database, orm-migration]   # ≥ 5 thẻ — trưởng phòng dựa vào đây để giao việc
summary: "Một câu mô tả vai trò (hiện trong danh sách nhân sự của trưởng phòng)."
look: { hair: "#2b1d0e", shirt: "#2563eb", skin: "#f1c27d" }  # màu nhân vật pixel
sources:
  - "Tom skill: phan-bien-giai-phap-he-thong"
  - "community: VoltAgent/awesome-claude-code-subagents (backend-developer) — paraphrased"
---
```

### Công cụ (`tools`)

Chỉ dùng các tên sau; runtime API ánh xạ sang công cụ sandbox trong thư mục dự án:

| Tên trong `tools` | Công cụ sandbox | Dùng để |
|---|---|---|
| `Read` | `read_file` | đọc tệp |
| `Glob` | `list_files` | liệt kê tệp |
| `Grep` | `search` | tìm trong tệp |
| `Write` | `write_file` | tạo/ghi tệp |
| `Edit` | `edit_file` | sửa tệp |
| `Bash` | `run_command` | chạy test, typecheck, migration trên DB dev… |
| `WebSearch` | `search_papers`, `web_search` | tìm bài báo (OpenAlex), tìm web — chỉ dữ liệu Công khai/Nội bộ |
| `WebFetch` | `fetch_url` | đọc trang/PDF công khai (chặn địa chỉ nội bộ) |

Pha thực thi/sửa nhận đủ `tools`; pha lập kế hoạch/review/tổng hợp chỉ nhận phần chỉ đọc (`Read`, `Glob`, `Grep`). Gợi ý theo vai trò: thành viên hiện thực và QA — đủ 6; ATTT — `Read, Glob, Grep, Bash, Write`; kiến trúc, BA, viết, tổng quan, phương pháp — `Read, Glob, Grep, Write, Edit`; trưởng phòng — `Read, Glob, Grep, Write`; phản biện — `Read, Glob, Grep`; điều phối — `[]` hoặc `[Read]`.

Hồ sơ phải nói rõ cách dùng công cụ: đọc repo trước khi đề xuất/sửa, chạy lệnh kiểm chứng thật và báo kết quả thật (chưa chạy thì ghi "chưa chạy"), liệt kê tệp đã sửa; không `git push`, không force/reset, không commit vào main, không lệnh phá hủy, không dữ liệu cá nhân thật trong seed/test/fixture, không secret trong đầu ra.

## Phần thân (các mục bắt buộc — kiểm thử `test/registry.test.ts` kiểm tra)

```
## Sứ mệnh                          (≤ 3 câu, đứng độc lập)
## Trách nhiệm
## Chuyên môn & kỹ năng             (≤ 8 gạch đầu dòng, đứng độc lập)
## Điều chỉnh theo bối cảnh dự án   (vai trò co giãn thế nào theo loại dự án, quy mô, nhãn, cấp độ ATTT)
## Quy trình làm việc
## Mẫu đầu ra                       (bắt đầu bằng "## Tóm tắt" 2–4 câu)
## Phối hợp & bàn giao
## Definition of Done
## Giới hạn & an toàn
```

Trưởng phòng thêm `## Cách phân rã nhiệm vụ`; reviewer thêm `## Tiêu chí review`; điều phối viên thêm `## Quy tắc định tuyến`.

Ở pha họp, hệ thống có thể chỉ gửi `## Sứ mệnh` và `## Chuyên môn & kỹ năng` để tiết kiệm token — hai mục này phải hiểu được khi đứng riêng và nên đặt trước mọi khối code.

**Độ dài:** 450–700 từ mỗi agent (điều phối ≤ 600), hồ sơ phòng ban ≤ 400 (đếm bằng `wc -w`, tính cả frontmatter). Không lặp lại quy tắc chung mà `systemFor()` đã chèn (tiếng Việt, không bịa, nhãn dữ liệu, không lệnh phá hủy) hay giới hạn 120 từ của pha họp.

**Không** khai báo định dạng JSON máy đọc trong agent.md — bộ điều phối tự thêm yêu cầu định dạng cho từng pha (kế hoạch, review, định tuyến).

## Nguyên tắc tương xứng

Hồ sơ không được giả định sẵn loại dự án. Mỗi vai trò phải:

- **Xác lập bối cảnh trước** từ brief, mô tả dự án, tệp đính kèm, repo: loại hệ thống, người dùng, quy mô, stack hiện có, nhãn dữ liệu (Công khai/Nội bộ/Bảo mật/Hạn chế), nghĩa vụ pháp lý. Thiếu thì ghi giả định có tên.
- **Định cỡ công việc theo bối cảnh**: sửa lỗi trong web app có sẵn khác hệ thống mới cho cơ quan nhà nước.
- **Cấp độ ATTT** (NĐ 85/2016/NĐ-CP, TT 12/2022/TT-BTTTT — soát văn bản thay thế hiện hành) xác định theo phân loại HTTT của từng dự án: đề xuất có căn cứ hoặc ghi là giả định cần xác nhận; **không mặc định cấp độ 4**.
- **Ưu tiên stack hiện có**; công nghệ quen thuộc (ví dụ ELK) chỉ là một phương án khi phù hợp.
- **Giữ Data Protection Gate theo mức rủi ro**: luôn gắn nhãn, không dữ liệu thật trên DEV/UAT, che PII trước khi vào log/index, ngưỡng lưu nhật ký và thông báo sự cố DLCN ≤ 72 giờ khi áp dụng; độ sâu đánh giá (gọn/đầy đủ) theo nhãn và loại dữ liệu.

## Phòng ban (`departments/<id>.md`)

```yaml
---
id: dev
name: Phòng Phát triển Dự án
short: Phát triển
purpose: work          # work | academic | …
lead: dev-lead
reviewer: qa-tester
members: [dev-lead, solution-architect, …]
color: "#2563eb"
keywords: [api, web app, migration, triển khai, elk, …]   # ≥ 20; định tuyến dự phòng bằng từ khóa (so khớp chuỗi con)
---
## Sứ mệnh
…
```

Bộ định tuyến chỉ thấy 25 từ khóa đầu và dòng đầu tiên của `## Sứ mệnh` — đặt từ khóa tiêu biểu nhất lên trước, câu đầu tiên mô tả đủ phạm vi phòng. Tránh từ khóa quá ngắn dễ khớp nhầm chuỗi con.

Agent khai báo `department: <id>` tự động thuộc phòng đó kể cả khi không có trong `members`. Giao diện xếp tối đa 9 bàn cho `dev` và 6 bàn cho `research`; người thêm vào sau đứng ở hành lang.

## Nguồn tham khảo của bộ hồ sơ hiện tại

- **Skill của Tom**: `phan-bien-giai-phap-he-thong` (phản biện 10 nhóm), `data-protection-gate` (khung bảo vệ dữ liệu), `chat-van-ke-hoach` (chất vấn kế hoạch), `senior-prompt-engineer`, `sharepoint-audit`, `sharepoint-data-layer`, `power-automate-m365-basic`.
- **Skill Anthropic**: engineering (architecture, system-design, code-review, testing-strategy, debug, deploy-checklist, incident-response, documentation), data (analyze, statistical-analysis, sql, validate-data), design (accessibility, ux-copy, research-synthesis), deep-research, doc-coauthoring, brainstorming.
- **Cộng đồng** (diễn đạt lại, không chép nguyên văn): VoltAgent/awesome-claude-code-subagents, wshobson/agents, contains-studio/agents.

Sau khi sửa agent.md: giao diện tự dùng bản mới cho nhiệm vụ tiếp theo khi gọi `POST /api/reload` (hoặc khởi động lại server).
