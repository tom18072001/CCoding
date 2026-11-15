# Đề bài vòng 4, gói 5, cho Phòng Nghiên cứu: ghi kết quả dừng sớm B7′ và cập nhật §4 Hệ thống sau khi gộp `main`

Gói nhỏ: **2 hạng mục + review, ngân sách 3M token**. Chỉ sửa:
- `docs/research/paper/paper.md`
- `improvement-backlog.md`
- `preregistration.md` (§9)
- `facts.json`, `CHANGELOG.md`

Không sửa `src/` hay `bench/`. Phân loại dữ liệu: **Nội bộ**. Đọc tệp theo đoạn.

## Đầu vào
- **B7′ đã chạy GĐ1 trên cloud** (`bench/vs-claude/results/b7prime/RUNLOG.md`, `runs.jsonl` 20 dòng; server `1333eef`; CLI 2.1.317):
  - B7cab so với A0-sonnet, 2 lượt × 5 bài T5.
  - R̂ token có trọng số **2,04** [1,45; 2,99]; R̂ thời gian **2,16** [1,53; 3,21].
  - Cả hai > 1,6, nên **dừng vô ích theo B-11.5**: không chạy GĐ2, không chạy B7c.
- **Phòng Dev đã gộp `main` `9e6079b` vào nhánh** (`docs/research/context/merge-main-2026-11-03.md`; merge `37f88b6`). Linux: typecheck và build xanh, `npm test` 285/285. Đã có `task.json` cho `l1-modules`, `l2-chain`: oracle 1,00, null ≤ 0,01.
- B-14 (chẩn đoán cache) bị hook chặn trên máy Windows nên chưa có số (`analysis/cache-diagnostic-result.md`).

## Hạng mục

**Q1 — methodologist (data-scientist kiểm số): ghi kết quả B7′**
- Tính lại R̂ từ `b7prime/runs.jsonl` bằng `bootstrapRatio` đã khóa, chỉ token và thời gian theo quy tắc dừng. **Không xem điểm.**
- Ghi vào `improvement-backlog.md` B-11.5 (kết quả GĐ1, "dừng vô ích, chưa phải kết luận") và `preregistration.md` §9 (V4-xx: B7′ dừng ở GĐ1; CLI đổi 2.1.316 → 2.1.317; B7c bị hủy trước khi có dòng nào).
- So R̂ của B7cab với ×2,50 / ×2,57 của B7, chỉ ở mức mô tả: khác cửa sổ, và n = 2 mỗi ô.
- Nêu hàm ý cho backlog:
  - ba công tắc B-11 chưa đủ đưa làn đơn tới ×1,3;
  - ứng viên tiếp theo theo `analysis/acceleration-crosscheck.md` là B-13…B-17, và B-14 cần chạy được.
- Cập nhật mục giữ chỗ B7′ trong `paper.md` §6, ghi nhãn **[Mô tả]**. Cập nhật `facts.json`.

**Q2 — academic-writer: cập nhật §4 Hệ thống của `paper.md` theo `merge-main-2026-11-03.md`**
- Mô tả CCoding hiện hành sau khi gộp `main`: KPI v2 và bộ probe, lộ trình REA, ngân sách dự án/agent, agent ngoài, giao diện v2.
- Tách rõ:
  - phần **đã có trên `main`**;
  - phần **chỉ có trên nhánh thử nghiệm**: B-01, B-02, B-04, B-05, B-06, B-10, B-11, chưa triển khai, chờ giám đốc duyệt.
- Ghi rằng các số đo W1–W5 và B7′ được đo **trước** khi gộp, theo hash server. Thêm một dòng vào §8 Đe dọa tính hiệu lực.
- Ẩn danh như mọi lần.

**Q3 — peer-reviewer: review Q1, Q2**
- R̂ có tái lập đúng không?
- Có lộ điểm không?
- §4 có tách đúng "trên main" với "chỉ trên nhánh" không?
- Kiểm bằng "🧪 Lệnh kiểm tra của dự án".

## Không làm
- Không chạy benchmark, không gọi `claude -p`.
- Không sửa slide.
