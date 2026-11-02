# Chạy bộ đo `bench/vs-claude` trong một phiên Claude Code cloud (dùng credit cloud trước 5/11)

> Tài liệu này dành cho phiên **Claude Code cloud** (claude.ai/code hoặc tab Code trong app, repo `tom18072001/CCoding`, nhánh `perf/vs-claude-loop`).
> Cloud session được trừ credit trước, không tính vào hạn mức 5 giờ của gói (credit hết hạn 14:59 ngày 5/11 giờ VN).
> Phiên Chat, Cowork hay Project **không** được trừ credit.
> Kế hoạch chạy và thứ tự ưu tiên lấy từ `docs/research/run-plan.md`; giả thuyết và tiêu chí loại lượt lấy từ `docs/research/preregistration.md`.

## Prompt dán vào phiên cloud

```text
Repo này là CCoding (TypeScript, Node ≥ 22). Hãy chạy bộ đo bench/vs-claude theo bench/vs-claude/RUNBOOK-cloud-session.md, từng bước,
và commit + push kết quả lên nhánh perf/vs-claude-loop (không đụng main).
Ràng buộc:
- Không dùng 9router và không dùng API key ngoài; runtime CCoding chỉ claude-cli dùng phiên đăng nhập của chính phiên này.
- Không sửa src/; chỉ tạo tệp cấu hình cục bộ (ccoding.local.json, không commit) và kết quả trong bench/vs-claude/results/.
- Gặp lỗi hạn mức hoặc hết credit (429, "usage_limit_reached", "hit your … limit") thì dừng hàng đợi, commit phần đã có và báo lại.
- Cứ xong mỗi lệnh run.mjs thì commit + push kết quả (thông điệp tiếng Việt, ghi arm/bài/số lượt).
```

## Bước 1. Chuẩn bị

```bash
git checkout perf/vs-claude-loop && git pull
npm ci --no-audit --no-fund && npm run build
node bench/vs-claude/run.mjs --arms oracle,null --repeats 1 --out /tmp/selftest   # không gọi LLM: oracle phải 1,00 mọi bài
```

Nếu oracle có bài < 1,00, dừng và báo lại. Ví dụ đã gặp: lỗi ENOENT vì `repo/` rỗng; nhiệm vụ Dev T-20261102-175855-1e6 sửa lỗi này.

## Bước 2. Server CCoding cho các arm B

- **Nhánh đã gộp `main`** (có commit "Gộp origin/main …" của nhiệm vụ Dev T-20261102-175855-1e6): dùng luôn bản build ở bước 1.
- **Nhánh chưa gộp `main`:** dựng server từ `origin/main` để arm B0, B4, B5 đo đúng CCoding hiện hành:
  ```bash
  git worktree add ../ccoding-main origin/main && cd ../ccoding-main && npm ci --no-audit --no-fund && npm run build && cd -
  ```

Tạo `ccoding.local.json` trong thư mục server (không commit):

```json
{
  "runner": "process",
  "runtime": { "default": "auto", "order": ["claude-cli"], "maxFailover": 2 },
  "runtimes": { "claude-cli": { "command": "claude", "permissionMode": "acceptEdits", "useApiKey": true, "label": "Claude Code CLI (phiên cloud)" } },
  "models": { "claude-cli": { "opus": "opus", "sonnet": "sonnet", "haiku": "haiku" } },
  "server": { "port": 7424 }
}
```

Chạy server ở chế độ nền: `node dist/cli.js serve`. Kiểm tra bằng `curl -s http://127.0.0.1:7424/api/health`.

## Bước 3. Chạy theo `docs/research/run-plan.md` §5

```bash
export OUT=bench/vs-claude/results/study-cloud
COMMON="--runtime claude-cli --ccoding-url http://127.0.0.1:7424 --ccoding-data <thư mục server>/data --work /tmp/vb --out $OUT"
```

- Dùng §5.2 (Nhánh 2) nếu nhánh đã có t1–t5 dạng `task.json` và arm làn nhanh. Nếu chưa, dùng §5.1 (Nhánh 1).
- Thêm `$COMMON` vào mỗi lệnh. Chạy lần lượt W1 → W5; credit không bị giới hạn theo cửa sổ 5 giờ.
- Kết quả pilot đã có ở `results/pilot1/` (A0-sonnet, B0, B5 × 13 × 1). Không chạy lại pilot.
- Mỗi lệnh xong: `git add bench/vs-claude/results && git commit -m "…" && git push`.
- Trước mỗi lần chạy lại hoặc phân tích, làm bước quarantine (§5.0): lượt hỏng vì hạn mức hoặc hạ tầng chuyển sang `excluded.jsonl`.

## Bước 4. Không phân tích giữa chừng

Đăng ký trước cấm xem kết quả giữa các cửa sổ. Chỉ chạy `analyze.mjs` và `pairwise.mjs` (§5.3) khi đã đủ N theo §4, rồi commit `report-*.md`.

## Ghi chú
- **Credit và hạn mức.** Credit trừ trước cho cloud session. Hết credit thì hạn mức thường của gói áp dụng; khi đó dừng và báo.
- **Ghi lại phiên bản và thời gian.** Mỗi kết quả phải kèm hash commit CCoding của server (`git rev-parse HEAD` trong thư mục server) và giờ chạy, theo `run-plan.md` §6.4.

## Bước 3b. Arm làn đơn B7 (sau commit `630e2b7`: B-01, B-02, B-10 đã gộp)

Đăng ký trước gọi arm này là `SL`; trong `arms.json`, Phòng Dev đặt tên là **B7**. Giả thuyết B-01 (`docs/research/preregistration.md` §3.2) dùng ba phép TOST ±15 % so với A0-sonnet, đo token có trọng số, thời gian và điểm; mỗi bài chạy 9 lượt.

1. **Hai server, để không trộn phiên bản.** Arm B0 và B5 tiếp tục chạy trên server dựng từ `origin/main` (cổng 7424, như W1). Arm B6 và B7 chạy trên server thứ hai, dựng từ chính nhánh này (cổng 7425):
   ```bash
   git pull && git worktree add ../ccoding-branch HEAD && cd ../ccoding-branch && npm ci --no-audit --no-fund && npm run build
   # ccoding.local.json như ở Bước 2 nhưng "server": { "port": 7425 }; rồi chạy nền: node dist/cli.js serve
   git -C ../ccoding-branch rev-parse HEAD   # ghi hash này vào bảng cửa sổ (run-plan §6.4)
   ```
2. **Chạy làn đơn** (thay `<thư mục server>` bằng thư mục của server 7425):
   ```bash
   B7="--runtime claude-cli --ccoding-url http://127.0.0.1:7425 --ccoding-data <thư mục server 7425>/data --work /tmp/vb --out $OUT"
   node bench/vs-claude/run.mjs --arms A0-sonnet,B7 --tasks t1-duration,t2-orders,t3-api,t4-perf,t5-logq --repeats 9 --timeout 20 $B7
   node bench/vs-claude/run.mjs --arms A0-sonnet,B7 --tasks all --repeats 3 --timeout 20 $B7
   ```
   - Lệnh đầu cho B-01 trên t1–t5 (9 lượt mỗi bài). Lệnh sau cho bộ 13 bài, kèm `l1-modules` và `l2-chain` nếu đã có `task.json`.
   - A0-sonnet đã đủ khóa thì runner bỏ qua, nên lệnh chỉ chạy B7. Nếu còn ngân sách, chạy thêm 2 lượt A0-sonnet làm neo cùng cửa sổ: `--repeats 11`.
3. **Làn nhanh B6**, để so mô tả (không phải giả thuyết xác nhận): `--arms A0-sonnet,B6 --tasks t1-duration,t2-orders,t3-api,t4-perf,t5-logq --repeats 9`, dùng server 7425.
4. **Chỉ phân tích khi đã đủ số lượt** (§4 của đăng ký trước). Trên các bài chạm trần, B-01 chỉ dùng thời gian và token (§2.7).

## Bước 3c. Đo lại làn đơn sau B-11 (B7′) — chỉ chạy khi giám đốc đã duyệt

Đặc tả, điều kiện chạy, số lượt, điểm dừng và kết quả dự kiến nằm ở `docs/research/improvement-backlog.md` B-11.5. Phân tích phương sai nằm ở `docs/research/analysis/variance-decomposition.md`. Thứ tự ưu tiên khi thiếu thời gian cũng ghi ở đó.

1. **Dựng lại server nhánh (cổng 7425)** từ commit `2179f07` trở về sau. Commit này có công tắc `lanes.single.slim`. Ghi hash vào RUNLOG.
2. **Chỉ chạy các arm đã được duyệt:**

   | Arm | Thành phần | Cần duyệt |
   |---|---|---|
   | `B7c` | gọn prompt | không |
   | `B7cb` | `B7c` + mẫu đầu ra gọn | giám đốc duyệt (b) |
   | `B7cab` | `B7cb` + nghiệm thu CTO dạng bảng ngắn (a-brief) | giám đốc duyệt (a-brief) và (b) |

   Lệnh, chạy xen kẽ với A0-sonnet **cùng cửa sổ, cùng server**:
   ```bash
   node bench/vs-claude/run.mjs --arms A0-sonnet,<arm> --tasks t1-duration,t2-orders,t3-api,t4-perf,t5-logq --repeats 10 --timeout 20 $B7 --out bench/vs-claude/results/b7prime
   ```
3. **Điểm dừng** theo B-11.5, tính sau 20 lượt đầu của mỗi arm (10 B7′ + 10 A0).
   - Dừng và commit nếu thời gian tới 5/11 14:59 không đủ cho phần còn lại.
   - Không xem điểm, chỉ xem R̂ theo quy tắc dừng đã đăng ký.
4. **Commit và push sau mỗi lệnh.** Phòng Nghiên cứu phân tích khi đủ số lượt.
