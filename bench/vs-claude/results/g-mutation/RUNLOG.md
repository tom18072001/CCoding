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
