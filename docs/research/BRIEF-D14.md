# Phòng Dev, D14: CTO duyệt luật "không chia việc khi không chạy song song được" và tùy chọn worktree của harness; dựng harness phát lại pha nghiệm thu cho E7

**Nhiệm vụ vừa. Ngân sách 6M token.** Giao 12/11/2026, chạy song song bước 2 của B-14 (giám đốc 12/11 23:47: dùng tối đa hạn mức). Cần xong **trước khi E7 chạy**, vì E7 chạy trên harness này.
- Nhánh `perf/vs-claude-loop`. Phân loại dữ liệu: **Nội bộ**.
- **Không đổi hành vi đang đo:** B-14, E7, E8 chạy trên worktree ghim (`ccoding-b14` ở `0d216eb`, `ccoding-e78` ở `d70959c`), nên D14 không ảnh hưởng tới chúng. Thấy lỗi ở harness E7/E8 thì sửa trên nhánh và ghi rõ trong báo cáo; người điều phối quyết định có ghim lại trước E7 hay không.

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

**K2: CTO duyệt harness E7 (người điều phối đã dựng, 5/11).**
- Tệp: `bench/vs-claude/e7/` (`sample.mjs`, `lib.mjs`, `run.mjs`, `analyze.mjs`, `README.md`), test `bench/vs-claude/test/e7.test.mjs`. Thiết kế ở §9 "Bản chốt E7 và E8".
- **Cách làm, không sửa `src/`:**
  - R1/R2 dựng một nhiệm vụ "đã xong thực thi" ở làn nhanh, cổng B-02 xanh, báo cáo `templateReport`, rồi gọi `resume(id, { from: 'accept' })`. Lượt gọi đi qua `Orchestrator.call()` thật;
  - R3 gọi `claude -p` với cùng văn bản, bỏ hồ sơ CTO. `runClaude` thêm tùy chọn `tools`, `allowedTools`, `permissionMode`, `maxTurns`, `stdin`; mặc định giữ đúng từng cờ cũ (có test).
- **Tìm ca hỏng:**
  - trạng thái nhiệm vụ giả thiếu trường mà `runTask` hay `accept` cần;
  - `finishWorkspace` commit vào repo của mục;
  - `waitFor` không trả khi nhiệm vụ tạm dừng vì hạn mức;
  - Windows: `npm test` qua `runCheckCommand`, đường dẫn, CRLF làm lệch vị trí đột biến (đã có kiểm `site-not-found`).
- Đánh giá có nên thêm tùy chọn `acceptOnly` thật vào `src/` thay cho nhiệm vụ giả hay không. Chưa làm trước E7.

**K3: CTO duyệt arm E8 (đã thêm).**
- `B6w4`, `B6w1` trong `bench/vs-claude/arms.json`. B6w1 có `server: "alt"`, chọn bằng `--ccoding-url-alt` và `--ccoding-data-alt` của `run.mjs`.
- Cách chạy hai server ở `bench/vs-claude/e7/README.md`. Test ở `bench/vs-claude/test/e8-arms.test.mjs`.

**K4: CTO duyệt `wallSecTask` (đã thêm).**
- `taskTimes()` trong `bench/vs-claude/lib/ccoding.mjs` ghi `wallSecTask` (`finishedAt − startedAt`), `queueSecTask` và `maxConcSubtasks` vào mỗi dòng CCoding. `wallSec` cũ giữ nguyên.
- Kiểm thêm: nhiệm vụ tạm dừng rồi tiếp tục thì `wallSecTask` gồm cả thời gian dừng, như `wallSec`. Có nên tách ra không?

## Kiểm tra
- `npm run typecheck`.
- `npm test` chạy 3 lần.
- `npm run test:bench`.
- Các lệnh kiểm của `ccoding-research` exit 0.

## Không làm
- Không chạy benchmark, không gọi `claude -p` thật.
- Không bật `selfImprove`, `osSandbox` hay `stablePrefix` mặc định.
- Không sửa `docs/research/paper/` hay `preregistration.md`.
