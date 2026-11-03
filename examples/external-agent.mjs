#!/usr/bin/env node
// Agent ngoài mẫu cho runtime kiểu "process" (xem docs/EXTERNAL-AGENTS.md).
// Đọc yêu cầu JSON từ stdin, in kết quả JSON ra stdout. Thay phần "làm việc" bằng agent thật của bạn
// (một script gọi model riêng, một công cụ nội bộ…). Không cần khóa API của CCoding: tiến trình không được thừa hưởng biến môi trường bí mật.
let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const req = JSON.parse(raw);
const text = `Agent ngoài @${req.agent.id} (pha ${req.phase}) đã nhận ${req.prompt.length} ký tự yêu cầu.\n\nTóm tắt yêu cầu: ${req.prompt.slice(0, 200)}`;
process.stdout.write(JSON.stringify({ text, usage: { input: Math.ceil((req.system.length + req.prompt.length) / 4), output: Math.ceil(text.length / 4) }, model: 'external-echo' }));
