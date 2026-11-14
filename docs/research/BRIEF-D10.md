# Phòng Dev, D10: triển khai B-18 (sandbox cấp hệ điều hành cho hook) và B-19 (vòng tự cải thiện RQ5), cùng một trường ghi cho B-12

**Nhiệm vụ lớn, có hai phần độc lập.** Trưởng phòng lập kế hoạch nhiều hạng mục và chạy song song theo đồ thị phụ thuộc.
- Ngân sách: 20M token.
- Chỉ làm trên nhánh `perf/vs-claude-loop`, không đẩy lên `main`.
- Phân loại dữ liệu: **Nội bộ**. Áp dụng Data Protection Gate theo AGENTS.md.

## Căn cứ
- Quyết định của giám đốc (3/11 19:56): "đã là đề tài thì phải fix hết, không để đề xuất sửa".
- Phòng Nghiên cứu đã viết đặc tả (BRIEF-13, gộp ở `742fbcb`):
  - **B-18:** `docs/research/sandbox-spec.md` (điểm móc §d.1, test §e, đo §f, rollback §g), nguồn ở `docs/research/sandbox-sources.md`, đánh giá bảo vệ dữ liệu ở `docs/data-protection-assessment.md` mục "B-18 Sandbox cho hook".
  - **B-19:** `docs/research/self-improvement/implementation-spec.md` (cấu hình §1, bảy bước §3, an toàn §4, test CT-01…CT-20 §6), bộ bài giữ lại ở `holdout-lock.json`.
  - Mục B-18 và B-19 trong `docs/research/improvement-backlog.md`.
- **Nguyên tắc:**
  - Thay đổi hành vi đặt sau công tắc, **mặc định tắt**. Khi tắt, prompt và hành vi trùng từng byte với bản trước, có test băm chụp như `test/s3-incident-difficulty.test.ts`. Băm chụp phải **theo nền tảng** nếu prompt có đoạn riêng cho win32.
  - Mọi lượt LLM đi qua `Orchestrator.call()`. Log đi qua `LogStore`.
  - Mỗi commit ghi mã B-xx. Mỗi mục có test.

## Hạng mục

**A. B-18: sandbox lớp 2, khóa `runtimes.claude-cli.osSandbox.enabled`, mặc định `false`**

1. **Spike G1 (§d.0), chỉ kiểm không xâm lấn** trên máy giám đốc:
   - Kiểm `wsl -l -v`, `claude --version`, và cờ `--settings` có nhận khóa `sandbox` không. Kiểm bằng `claude --help` và tài liệu, **không** chạy `claude -p`, vì hook chặn `claude` là đúng.
   - **Không cài** distro WSL hay phần mềm nào. Việc cài cần giám đốc duyệt riêng.
   - Ghi kết quả vào `docs/research/context/d10-implementation-2026-11-04.md`.
2. **Cấu hình và dựng lệnh** theo §d.1:
   - Trường `osSandbox`, không đụng trường `sandbox` của Codex.
   - `buildClaudeArgs` trộn khóa `sandbox` vào cùng chuỗi `--settings`, gồm `failIfUnavailable`, `allowUnsandboxedCommands: false`, `allowWrite = [root]`, `denyRead` cho `.env*`, mạng `strictAllowlist`, đúng như đặc tả.
3. **Không có sandbox thì từ chối chạy (fail-closed):** khi bật khóa mà nền tảng không có sandbox (Windows native không có WSL2), trả lỗi tiếng Việt, ghi `sandbox.unavailable` và **không chạy**.
4. **Backend WSL2:** viết đường đổi `cmd` thành `wsl.exe` và ánh xạ `cwd`, `CCODING_GUARD.root`, đường dẫn hook sang dạng WSL.
   - Có test thuần cho phần ánh xạ.
   - Đánh dấu "chưa kiểm trên máy thật" cho tới khi spike có distro.
5. **Ghi log:**
   - `logSandboxDeny` qua `LogStore`, dữ liệu chỉ `{ tool, rule, backend }`.
   - Parser nhận diện lệnh bị từ chối, ví dụ `Read-only file system` hay proxy 403.
6. **Test** `test/sandbox-args.test.ts`, `sandbox-regression.test.ts`:
   - dựng lệnh;
   - fail-closed;
   - ánh xạ đường dẫn;
   - parser từ chối;
   - không chặn nhầm `checkCommands` (E5).
7. **Script đối kháng chạy thật** `scripts/sandbox-adversarial.mjs` (E1–E4 §e) và **đo khởi động** `scripts/sandbox-bench.mjs` (§f).
   - Chỉ viết và test bằng dữ liệu giả, **không chạy thật** trong nhiệm vụ này. Người điều phối sẽ chạy trên Linux ngoài hook.
8. **Bảo vệ dữ liệu:** cập nhật `docs/data-protection-assessment.md` mục B-18 theo hành vi đã làm.

**B. B-19: vòng tự cải thiện, module `src/selfimprove.ts`, khóa `selfImprove.enabled: false`**

1. **Bảy bước theo §3 của đặc tả**, đủ 8 trường mỗi bước:
   - Đầu vào lấy từ nhật ký sự cố B-03.
   - Gom nhóm và đề xuất bản vá đi qua `Orchestrator.call()`.
   - A/B trên bộ giữ lại, hash phải khớp `holdout-lock.json` trước khi chạy. Lệnh A/B chỉ được **dựng sẵn**, không tự chạy benchmark.
2. **An toàn §4, có test:**
   - **Không tự áp bản vá:** bước 6 chỉ chạy khi có sự kiện `selfimprove.approved` do giám đốc tạo. Rollback cũng cần giám đốc xác nhận.
   - **Danh sách cấm:** hook, `claude-guard`, `CLASSIFICATION_RULE`, `dataProtection`.
   - Sự cố của nhiệm vụ Bảo mật hoặc Hạn chế bị loại.
3. **Giao diện tối thiểu** (JS thuần trong `public/`, chữ tiếng Việt):
   - danh sách đề xuất bản vá;
   - nút "Duyệt" và "Từ chối" tạo sự kiện;
   - nút "Rollback" có xác nhận.

   Chỉ hiện khi khóa bật.
4. **Xử lý hai điều kiện chặn của S2a** (backlog B-19 trường 7) trước lần A/B đầu:
   - bài giữ lại có `starter/` hoặc `repo/`;
   - cờ `leak` khi chưa có sandbox.
5. **Test chấp nhận CT-01…CT-20 (§6).** Thêm mục "B-19 Vòng tự cải thiện" vào `docs/data-protection-assessment.md`.

**C. B-12: ghi trạng thái lệnh kiểm vào sự kiện `gate.decision` của b02**
- Thêm vào payload `checks: { red, total }` tại thời điểm cổng quyết định. Đây là trường thêm; trường cũ giữ nguyên.
- `bench/vs-claude/lib/ccoding.mjs` `gateDecisions()` đọc thêm trường này thành `gates.b02.checksRed`. Dữ liệu cũ không có trường thì để `null`.
- **Lý do:** đăng ký trước đòi nhãn "tại thời điểm cổng" (B-12 trường 7(b)). Phòng Nghiên cứu chốt cách dùng ở BRIEF-15.
- Có test.

## Kiểm tra
- `npm run typecheck` và `npm test` phải xanh, chạy 3 lần.
- Với các test có hành vi riêng theo nền tảng, ghi cả kết quả kỳ vọng cho Linux. Người điều phối chạy lại trên Linux.
- Viết `docs/research/context/d10-implementation-2026-11-04.md` cho Phòng Nghiên cứu. Mỗi mục ghi:
  - mã B-xx;
  - công tắc và giá trị mặc định;
  - tệp, commit, test;
  - phần còn cần đo hoặc cần duyệt.

## Không làm
- Không bật mặc định `osSandbox` hay `selfImprove`.
- Không cài phần mềm trên máy giám đốc.
- Không chạy benchmark thật hay `claude -p`.
- Không sửa `docs/research/paper/`.
