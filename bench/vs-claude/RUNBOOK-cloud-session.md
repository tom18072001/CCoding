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

## Bước 3d. Còn khoảng $50 credit (quyết định của giám đốc, 3/11 10:3x giờ VN)

- **Đã duyệt:** giám đốc duyệt (a-brief) và (b) để đo arm **B7cab**. Việc triển khai lên `main` vẫn cần duyệt riêng.
- **Thứ tự dùng credit:**
  1. Chạy hết lệnh W5a đang chạy (A1 r2–3).
  2. **Không chạy** A2 × R13 và B0 × T5 của W5 trên cloud. Hai lệnh này chuyển sang chạy local.
  3. Dựng lại server 7425 **từ commit `1333eef`** (không lấy `HEAD`: Phòng Dev sắp gộp `main` mới vào nhánh, nên B7′ phải đo trên mã chưa gộp để so được với B7). Lệnh: `git worktree add ../ccoding-b7p 1333eef`. Ghi hash vào RUNLOG.
  4. **GĐ1 (điểm dừng):**
     ```bash
     node bench/vs-claude/run.mjs --arms A0-sonnet,B7cab --tasks t1-duration,t2-orders,t3-api,t4-perf,t5-logq --repeats 2 --timeout 20 $B7 --out bench/vs-claude/results/b7prime
     ```
     Lệnh này chạy 20 lượt: 10 B7cab và 10 A0. Tính R̂ theo B-11.5 (thống kê của `prereg-tests.mjs`, cho token có trọng số và thời gian thực).
     - R̂ > 1,6 ở một trong hai đại lượng: dừng, commit, báo "dừng vô ích, chưa phải kết luận".
     - R̂ ≤ 1,6 ở cả hai: chạy GĐ2.
     - Không xem điểm.
  5. **GĐ2:** cùng lệnh, đổi `--repeats 10`. Runner bỏ qua các khóa đã xong.
  6. Nếu B7cab xong mà vẫn còn credit: chạy `B7c` với cùng hai giai đoạn. A0 đã đủ khóa nên runner chỉ chạy B7c.
- **Hết credit** (429, "usage_limit_reached", "credit", "hit your … limit"):
  - Dừng ngay. **Không** chạy tiếp bằng hạn mức thường của gói.
  - Commit và push phần đã có.
  - Ghi vào RUNLOG khóa cuối cùng đã `done`.
  - Phần còn lại chạy local.

## Bước 3e. Đợt đo sau D9 (B-14, B-12, B-16, B-15, H6) — chỉ chạy khi giám đốc đã duyệt

> **Điều kiện trước khi chạy:**
> - D9b đã gộp (8 test hook Linux xanh).
> - `preregistration.md` §9 đã có các dòng của đợt 3e (BRIEF-14).
> - Giám đốc đã duyệt chi phí.
>
> E1–E3 chạy trên cloud trước 5/11 14:59 giờ VN. E4–E6 chạy local bằng hạn mức gói, trên server riêng, không đụng server 7420.
> Ước lượng USD dưới đây quy giá Sonnet 5.5; arm B có pha chạy Opus thì cao hơn. Lấy từ `results/study-cloud`, `results/b7prime` (BRIEF-14).

1. **Server 7425 từ một commit ghim, dùng chung cho cloud và local** (`run-plan.md` §5.4.2). Commit này là commit gộp D11 nếu D11 đã gộp trước lượt đầu, vì D11 thêm hash, phiên bản CLI và USD vào mỗi dòng; nếu chưa thì dùng HEAD hiện tại. §9 khóa ở `9e1694c`.
   ```bash
   git pull && git worktree add ../ccoding-3e <commit ghim> && cd ../ccoding-3e && npm ci --no-audit --no-fund && npm run build
   # ccoding.local.json như Bước 2, "server": { "port": 7425 }; chạy nền: node dist/cli.js serve
   git -C ../ccoding-3e rev-parse HEAD   # ghi vào RUNLOG
   ```
   - Bản này có B-13: `runs.jsonl` ghi `model`, token và giây theo pha.
   - Bản này có B-12: `gates.b02`, `gates.b10`, `gates.cto`.
   ```bash
   S3E="--runtime claude-cli --ccoding-url http://127.0.0.1:7425 --ccoding-data ../ccoding-3e/data --work /tmp/vb"
   ```
2. **E1, B-14 chẩn đoán cache.**
   - Quy mô: 7–8 lượt `claude -p`, khoảng $0,2 và 20 phút. Script tự chờ 330 giây giữa các cặp.
   - Chạy trực tiếp trong shell, không qua CCoding nên không qua hook:
     ```bash
     node bench/vs-claude/cache-diagnostic.mjs --model sonnet --out bench/vs-claude/results/b14-diag/diag.csv
     ```
   - Diễn giải theo bảng của `analysis/cache-diagnostic-spec.md` Phần 1. Commit.
3. **E2, thí điểm B-12/B-16.**
   - Quy mô: 28 lượt, khoảng $14 và 1,4 giờ.
     ```bash
     node bench/vs-claude/run.mjs --arms B7cab,B7cabO --tasks suite:gates --repeats 2 --timeout 20 $S3E --out bench/vs-claude/results/gates-pilot
     node bench/vs-claude/run.mjs --arms B6 --tasks g3-qty-rename,g4-gb-unit --repeats 2 --timeout 20 $S3E --out bench/vs-claude/results/gates-pilot
     ```
   - Arm B6 chạy vì cổng b10 chỉ có ở làn có pha plan. Làn đơn không có pha này.
   - Commit sau mỗi lệnh.
   - Không xem điểm. Phòng Nghiên cứu ước lượng q, ρ và chốt N cho E4 theo công thức đã ghi ở §9.
4. **E3, thí điểm bài lớn.**
   - Quy mô: 6 lượt, khoảng $8 và 0,8 giờ.
     ```bash
     node bench/vs-claude/run.mjs --arms A0-sonnet,B0,B1 --tasks l1-modules,l2-chain --repeats 1 --timeout 40 $S3E --out bench/vs-claude/results/large-pilot
     ```
   - Kiểm lượt B0 có pha `discuss` (`byPhase.discuss`). Nếu không có, B-15 không đo được trên bài này: ghi RUNLOG và báo lại.
   - Commit.
5. **Hết credit** (429, "usage_limit_reached", "credit", "hit your … limit"):
   - Dừng ngay, commit phần đã có, ghi khóa cuối cùng vào RUNLOG.
   - **Không** chạy tiếp bằng hạn mức gói trên cloud.
6. **Local (sau 5/11 hoặc khi hết credit)**, cùng lệnh, server riêng cổng 7425 trên máy giám đốc:
   - **E4:** B-12/B-16 chính, đã chốt ở BRIEF-15. Chạy `--arms B7cab,B7cabO --tasks g1-slug-dedupe,g2-cart-coupon,g5-median-stats,g6-range-merge --repeats 16`, rồi `--arms B6 --tasks g3-qty-rename,g4-gb-unit --repeats 32`, `--out bench/vs-claude/results/gates-main`. Tổng 192 lượt, khoảng 8,8 giờ, trần 15 giờ.
   - **E5:** B-15, `--arms B0,B1 --tasks l1-modules,l2-chain --repeats 10 --timeout 40 --out bench/vs-claude/results/b15-main`. 40 lượt, khoảng 7 giờ, chia nhiều cửa sổ 5 giờ.
   - **E6:** H6, `--arms A1 --repeats 3 --timeout 20`, `--arms A2 --repeats 2 --timeout 40`, `--arms B0 --repeats 3 --timeout 40` trên `l1-modules,l2-chain,t1-duration,t2-orders,t3-api,t4-perf,t5-logq`, `--out bench/vs-claude/results/h6-3e`. Chỉ ghép cặp cùng cửa sổ và cùng server. 56 lượt, khoảng 3,1 giờ.
   - Gặp giới hạn 5 giờ thì chờ cửa sổ sau. Runner bỏ qua khóa đã `done`.
7. **Nhãn người** (giám đốc, khoảng 30–45 phút):
   - Gán 60 mục ở `docs/research/analysis/gold-sheet.csv`. Arm đã ẩn.
   - Phòng Nghiên cứu chạy `agreement.mjs` với `gold-key.csv`.
