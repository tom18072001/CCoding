# Viết và tùy biến agent.md

Mỗi nhân sự là một file Markdown trong `agents/` (thư mục con tùy ý). Frontmatter YAML là **siêu dữ liệu** (dùng cho phân công, giao diện, runtime); phần thân là **hồ sơ vị trí** — được gửi làm system prompt mỗi khi agent làm việc.

## Frontmatter

```yaml
---
id: backend-dev                 # duy nhất, chữ thường-gạch-ngang
name: Bảo                       # tên hiển thị
title: "Backend Developer (Node.js/TypeScript)"
department: dev                 # id phòng ban (departments/<id>.md) — "office" cho điều phối viên
role: member                    # lead | member | reviewer | router
model: sonnet                   # opus | sonnet | haiku hoặc id model đầy đủ
runtime: inherit                # hoặc claude-cli | codex-cli | kimi-cli | anthropic-api | openai-api | mock
tools: [Read, Write, Edit, Glob, Grep, Bash]   # công cụ Claude Code được dùng khi thực thi
skills: [nodejs, typescript, rest-api]         # thẻ kỹ năng — trưởng phòng dựa vào đây để giao việc
summary: "Một câu mô tả vai trò (hiện trong danh sách nhân sự của trưởng phòng)."
look: { hair: "#2b1d0e", shirt: "#2563eb", skin: "#f1c27d" }  # màu nhân vật pixel
sources:
  - "Tom skill: phan-bien-giai-phap-he-thong"
  - "community: VoltAgent/awesome-claude-code-subagents (backend-developer) — paraphrased"
---
```

## Phần thân (các mục bắt buộc — kiểm thử `test/registry.test.ts` kiểm tra)

```
## Sứ mệnh
## Trách nhiệm
## Chuyên môn & kỹ năng
## Quy trình làm việc
## Mẫu đầu ra
## Phối hợp & bàn giao
## Definition of Done
## Giới hạn & an toàn
```

Trưởng phòng thêm `## Cách phân rã nhiệm vụ`; reviewer thêm `## Tiêu chí review`; điều phối viên thêm `## Quy tắc định tuyến`.

**Không** khai báo định dạng JSON máy đọc trong agent.md — bộ điều phối tự thêm yêu cầu định dạng cho từng pha (kế hoạch, review, định tuyến).

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
keywords: [api, triển khai, elk, …]   # dùng cho định tuyến dự phòng bằng từ khóa
---
## Sứ mệnh
…
```

Agent khai báo `department: <id>` tự động thuộc phòng đó kể cả khi không có trong `members`. Giao diện xếp tối đa 9 bàn cho `dev` và 6 bàn cho `research`; người thêm vào sau đứng ở hành lang.

## Nguồn tham khảo của bộ hồ sơ hiện tại

- **Skill của Tom**: `phan-bien-giai-phap-he-thong` (phản biện 10 nhóm), `data-protection-gate` (khung bảo vệ dữ liệu), `chat-van-ke-hoach` (chất vấn kế hoạch), `senior-prompt-engineer`, `sharepoint-audit`, `sharepoint-data-layer`, `power-automate-m365-basic`.
- **Skill Anthropic**: engineering (architecture, system-design, code-review, testing-strategy, debug, deploy-checklist, incident-response, documentation), data (analyze, statistical-analysis, sql, validate-data), design (accessibility, ux-copy, research-synthesis), deep-research, doc-coauthoring, brainstorming.
- **Cộng đồng** (diễn đạt lại, không chép nguyên văn): VoltAgent/awesome-claude-code-subagents, wshobson/agents, contains-studio/agents.

Sau khi sửa agent.md: giao diện tự dùng bản mới cho nhiệm vụ tiếp theo khi gọi `POST /api/reload` (hoặc khởi động lại server).
