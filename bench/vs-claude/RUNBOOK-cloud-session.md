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
