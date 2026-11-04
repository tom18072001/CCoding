# Sổ chạy V4-3f-G: cổng lệnh kiểm tra trên lỗi cài bằng máy

Mốc khóa đăng ký trước: `f5a31dc` (§9 "Đăng ký trước V4-3f").

Phân loại dữ liệu: **Nội bộ**. Bài tổng hợp, không có dữ liệu thật. Không gọi LLM.

| Mục | Giá trị |
|---|---|
| Đầu vào | `results/study-cloud/runs.jsonl` sha256 `0dcee84066a9d9ee2d62a9ff36e594492f1f1dd62a5cbc9e607f24aec2a2cffb`; `results/study-cloud/artifacts/` (440 thư mục) |
| `g-mutation.mjs` | sha256 `a771f0121870522c95af006aac6b7732a896707b678c28085bac200f91c1628f` |
| `g-analyze.mjs` | sha256 `44c28b8f7230d8b86766377f5f2f3eaa43419e7c99d55abd6cd40353fee08760` |
| Máy | container Linux của phiên điều phối, 2 lõi, Node v22.23.4. Không dùng máy giám đốc (đợt 3e đang chạy ở đó) |
| Lệnh | `node docs/research/analysis/g-mutation.mjs --runs bench/vs-claude/results/study-cloud/runs.jsonl --artifacts bench/vs-claude/results/study-cloud/artifacts --tasks bench/vs-claude/tasks --out bench/vs-claude/results/g-mutation/g-mutation.jsonl --perRun 12 --seed 20261104 --jobs 2 --exclude t4-perf` |

## Sai lệch G-a (ghi 4/11 lúc 19:39, trong lúc chạy, trước khi tính G-1/G-2)

- **Phát hiện:** hạn 60 s cho `npm test` ngắn hơn hạn thật của B-02, là `tools.commandTimeoutSec` = 600 s (`src/config.ts`). Phát hiện khi xem tiến độ: có lượt `t4-perf` ở base. Theo §9, bộ test của bài này chạy khoảng 190 s.
- **Xử lý:**
  - G-1 và G-2: mọi lượt base có `vTimeout` được chạy lại `npm test` với hạn 600 s, đúng như B-02, bằng `g-rebase.mjs`. Kết quả lần chạy lại thay cho `vRed`. Số lượt chạy lại được báo.
  - G-3 không đổi. Lượt đủ điều kiện đột biến có base ≤ 30 s. Đột biến quá 60 s gần như chắc là treo, nên với hạn 600 s cũng đỏ. Số đột biến quá hạn được báo.
- Người điều phối chưa xem G-1/G-2 khi ghi mục này.
