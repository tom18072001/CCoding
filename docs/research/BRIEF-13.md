# Đề bài vòng 4, gói 7, cho Phòng Nghiên cứu: đặc tả B-18 (sandbox cấp hệ điều hành cho hook) và đặc tả triển khai vòng tự cải thiện RQ5

Gói nhỏ: **2 hạng mục + review, ngân sách 4M token**.
- Chỉ viết đặc tả để Phòng Dev làm ngay ở D10, gồm `improvement-backlog.md` (B-18, B-19) và tệp đặc tả trong `docs/research/`.
- Không sửa `src/`.
- Phân loại dữ liệu: **Nội bộ**. Data Protection Gate theo AGENTS.md: đây là thay đổi về biên bảo mật nên phải có đánh giá 5 lớp.

## Vì sao
- Giám đốc (3/11): "đã là đề tài thì phải fix hết, không để đề xuất sửa".
- D9 đã làm xong B-03…B-17 (`docs/research/context/d9-implementation-2026-11-03.md`).
- Còn hai mục mới là hướng hoặc thiết kế:
  - **Sandbox cấp hệ điều hành:** slide bảo vệ dữ liệu và `paper.md` §4.2, §8.2 ghi hook chỉ kiểm theo mẫu chuỗi, agent cố tình vẫn có thể lách. TeamBench tách quyền bằng hệ điều hành.
  - **Vòng tự cải thiện RQ5:** `docs/research/self-improvement/design.md` có thiết kế 7 bước, mặc định tắt, chưa triển khai. B-03 đã cung cấp nhật ký sự cố làm đầu vào.

## Hạng mục

**S1 — methodologist (research-lead duyệt): B-18, sandbox cho hook → `docs/research/sandbox-spec.md` và mục B-18 trong backlog**
- Chọn cơ chế chạy được trên **máy Windows của giám đốc**, nơi CCoding chạy qua herdr và `claude-cli`, và trên Linux, nơi chạy bench cloud. So sánh và chọn có lý do:
  - Windows: AppContainer hoặc Job Object với ACL theo worktree, Windows Sandbox, WSL.
  - Linux: bubblewrap, user namespace, seccomp.
  - Chế độ sandbox có sẵn của Claude Code CLI, nếu có. Phải kiểm bằng tài liệu chính thức, không đoán.
- Ràng buộc:
  - không dùng 9router hay khóa API ngoài;
  - không mở mạng ra ngoài;
  - giữ nguyên hook hiện có làm lớp thứ nhất;
  - mặc định **tắt** cho tới khi giám đốc duyệt.
- **Chỉ tiêu và cách kiểm:**
  - bộ test đối kháng: đọc `.env`, ghi ngoài worktree, mạng, tiến trình con lách hook;
  - không chặn nhầm `checkCommands` hiện có;
  - đo chi phí thời gian khởi động.
- **Đánh giá bảo vệ dữ liệu:** 5 lớp, 25 năng lực, pháp lý VN. Ghi vào `docs/data-protection-assessment.md` thành mục mới.

**S2 — research-lead (data-scientist hỗ trợ): B-19, triển khai vòng tự cải thiện RQ5 → `docs/research/self-improvement/implementation-spec.md` và mục B-19 trong backlog**
- Từ `design.md`, đặc tả từng bước: nhật ký sự cố (B-03, đã có) → gom nhóm lỗi → đề xuất bản vá prompt hoặc hồ sơ agent → A/B trên bộ bài giữ lại → giám đốc duyệt → áp dụng → theo dõi và rollback.
- Mỗi bước ghi rõ:
  - đầu vào, đầu ra, tệp, công tắc;
  - lượt LLM nào đi qua `Orchestrator.call()`;
  - người duyệt;
  - điều kiện rollback.
- **Bộ bài giữ lại:** chỉ định cụ thể, không dùng t1–t5 hay g1–g6 để tránh tối ưu theo bài đã biết. Cỡ mẫu A/B tính bằng công cụ đã có (`variance-decomposition.mjs` hoặc `stats.mjs`).
- **An toàn:**
  - không tự áp bản vá khi chưa có người duyệt;
  - không sửa hook hay chính sách dữ liệu bằng vòng này.

**S3 — peer-reviewer: review S1, S2**
- Đặc tả có làm được ngay không?
- Có nguồn chính thức cho mọi khẳng định về cơ chế hệ điều hành và Claude Code CLI không?
- Đánh giá bảo vệ dữ liệu có đủ không?
- Kiểm bằng "🧪 Lệnh kiểm tra của dự án".

## Không làm
- Không viết mã.
- Không chạy benchmark.
- Không sửa `paper.md`. Bài báo sẽ cập nhật sau khi D10 làm xong.
