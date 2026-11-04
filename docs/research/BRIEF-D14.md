# Phòng Dev, D14: CTO duyệt luật "không chia việc khi không chạy song song được" và tùy chọn worktree của harness; dựng harness phát lại pha nghiệm thu cho E7

**Nhiệm vụ vừa. Ngân sách 6M token.** Giao **sau khi đợt 3e chạy xong**, để không tranh hạn mức.
- Nhánh `perf/vs-claude-loop`. Phân loại dữ liệu: **Nội bộ**.
- **Không đổi hành vi đang đo:** đợt 3e chạy trên worktree ghim, nên D14 không ảnh hưởng tới nó.

## Căn cứ
- **Giám đốc, 4/11 19:14:** "Bằng chứng hiện tại (1/1, 2/2) chưa đủ để kết luận gì. Đề tài chưa có số đo nào, và chính dữ liệu chi phí của CCoding còn đi ngược lợi ích của chạy song song. fix 2 vấn đề này".
- **V4-3f khối B** (§9, `docs/research/preregistration.md`):
  - harness `bench/vs-claude/lib/ccoding.mjs` tạo dự án `isolation: 'none'`. Vì vậy `parallelWorktrees()` trả false và hạng mục chạy lệnh làm lần lượt;
  - trong 18/42 lượt có từ 2 lượt gọi thực thi trở lên, không thấy lượt gọi nào chồng nhau đáng kể;
  - làn nhanh trong bench chỉ thêm chi phí chia việc.
- **V4-3f khối P** (`bench/vs-claude/results/p-parallel/RUNLOG.md`): ở vận hành thật có worktree, 42/54 lượt phòng chạy chồng; xung đột khi gộp 6/213.
- **Người điều phối đã sửa và commit cùng test** (vì hạn mức đang dành cho đợt đo):
  - **(a)** `fastLane.requireParallel`, mặc định true, ở `src/config.ts`, `src/lane.ts` và `src/orchestrator.ts` (`pickLane`, `scopeExceeded`):
    - khi hạng mục chạy lệnh sẽ làm lần lượt, `auto` giữ làn đơn;
    - làn đơn không nâng cấp chỉ vì phạm vi rộng. Còn đỏ hoặc có ESCALATE thì vẫn nâng.
  - **(b)** `--isolation none|worktree` của `bench/vs-claude/run.mjs`, hoặc trường `isolation` của arm. Kèm `checkoutTaskBranch` đưa thư mục chấm về commit cuối của nhánh nhiệm vụ.
  - **(c)** Test: `test/lane.test.ts`, `test/single-lane.test.ts` (ca V4-3f), `bench/vs-claude/test/isolation-v43f.test.mjs`.

## Hạng mục
**K1: CTO duyệt (a), (b), (c) như một thay đổi thật.**
- Đọc diff, chạy lại test. Tìm ca hỏng, ví dụ:
  - dự án không có git;
  - `toolAccess` không phải `exec`;
  - nhiệm vụ `joint`;
  - ép làn;
  - resume sau nâng cấp.
- Thiếu test thì thêm. Sai thì sửa.

**K2: harness phát lại pha `accept` cho E7.**
- **Đầu vào mỗi mục:**
  - đề bài;
  - thư mục repo của artifact sau khi áp đột biến của G-4 (`docs/research/analysis/g-mutation.mjs`, `applySite`), hoặc bản đúng;
  - đầu ra `npm test`.
- **Đi qua `Orchestrator.call()`**, đúng quy ước AGENTS.md. Ví dụ: tùy chọn nhiệm vụ `acceptOnly` bỏ route, plan và execute, chỉ chạy baseline, lệnh kiểm tra và pha `accept` trên workspace đã chuẩn bị, rồi ghi phán quyết vào `gate.decision cto`.
- **Arm R3** (một Claude Code đơn duyệt hay từ chối) chạy bằng đường `claude` sẵn có của harness, cùng đầu vào.
- **Test bằng runtime giả:** mục lỗi bị từ chối thì ghi `cto block`; mục đúng thì ghi `cto pass`; không lộ nhãn.

**K3: cấu hình cho E8.**
- Thêm arm `B6w4` và `B6w1` vào `bench/vs-claude/arms.json`, có `isolation: 'worktree'`, làn nhanh ép.
- `B6w1` cần `fastLane.maxParallel = 1` ở server. Ghi trong `RUNBOOK` cách chạy hai server.
- Có test cho `arms.json`.

**K4: thời gian thực của arm CCoding.**
- `bench/vs-claude/lib/ccoding.mjs` đo `wallSec` bằng vòng hỏi 10 s, nên thời gian bị làm tròn lên. Theo người phản biện, 92–100 % số lượt rơi đúng lưới 10 s. Trong khi đó `claude -p` của arm A đo chính xác. Kết quả là tỉ số thời gian bị lệch lên khoảng 5 s mỗi lượt CCoding.
- Ghi thêm `wallSecTask`, tính từ `task.startedAt`/`finishedAt` (hoặc mốc của sự kiện đầu và cuối). Giữ `wallSec` cũ để so sánh được.
- Có test.

## Kiểm tra
- `npm run typecheck`.
- `npm test` chạy 3 lần.
- `npm run test:bench`.
- Các lệnh kiểm của `ccoding-research` exit 0.

## Không làm
- Không chạy benchmark, không gọi `claude -p` thật.
- Không bật `selfImprove`, `osSandbox` hay `stablePrefix` mặc định.
- Không sửa `docs/research/paper/` hay `preregistration.md`.
