# Đặc tả B-18 — Sandbox cấp hệ điều hành làm lớp 2 sau hook claude-guard (v1.0)

Phân loại dữ liệu: **Nội bộ**. Ngày: 2026-11-03. Người lập: @methodologist (S1). Người dùng đặc tả: Phòng Dev (D10).
Nguồn: chỉ dùng mã nguồn `src/` (đã đọc) và `docs/research/sandbox-sources.md` (S0), dẫn bằng mã **S-xx / W / L / C**. Điều gì S0 ghi `[CHƯA KIỂM CHỨNG]` thì ở đây vẫn là `[CHƯA KIỂM CHỨNG]` — Dev phải đo ở bước spike (§d.0), không được coi là đúng.
Đánh giá bảo vệ dữ liệu 5 lớp/25 năng lực: ở `docs/data-protection-assessment.md`, mục **"B-18 Sandbox cho hook"** (D2: không chép lặp; bảng quyết định chỉ ở đây).
Không sửa `src/`. Mọi con số ngưỡng ở §f là **giả định khai báo trước**, giám đốc duyệt.

## Tóm tắt quyết định

- **Lớp 1 giữ nguyên** (`claude-guard.ts`, `guard-paths.ts`). **Lớp 2 = sandbox**, khóa `runtimes.claude-cli.sandbox.enabled`, mặc định **`false`** cho tới khi giám đốc duyệt (D4).
- Tài liệu chính thức nói Claude Code **không sandbox lệnh trên Windows native** (S-01, S-02, C2). Vì vậy nếu bật khóa mà nền tảng không có sandbox thì CCoding phải **từ chối chạy** (fail-closed), không để "bật mà không có tác dụng" (C1).
- Linux (bench cloud): dùng sandbox có sẵn của Claude Code (bubblewrap) qua `--settings` — **mức A**; nếu cần bọc cả hook và công cụ tệp thì **mức B** (`srt claude`/container).
- Windows 11 Pro của giám đốc: **WSL2 + sandbox có sẵn** là ứng viên chính vì là đường duy nhất tài liệu chính thức hỗ trợ (S-02, C17). **AppContainer/Job Object + ACL** là phương án dự phòng, chỉ làm nếu spike WSL2 không đạt (§c, cổng quyết định G1). Không loại sớm phương án nào (D1).
- Điểm quan trọng nhất để không hiểu nhầm: sandbox có sẵn **không bọc hook** (C3); nhưng mối đe dọa B-18 là *lệnh do agent sinh ra*, không phải mã hook của CCoding, nên mức A đủ cho mục tiêu "lệnh không lách được phép so chuỗi".

## (a) Mô hình mối đe dọa

Tác nhân: agent LLM (có thể bị prompt-injection từ tệp/trang web) đang chạy dưới `claude -p` qua `agent-exec` trong pane herdr (`src/herdr.ts:408`; `runProcess` ở `src/runtimes/spawn.ts:87`). Lớp 1 hiện tại kiểm **chuỗi lệnh** (`guardBlock`, `claude-guard.ts:88`) và **đường dẫn công cụ tệp** bằng `realpath` (`guard-paths.ts:303`). Bốn nhóm tài sản/đe dọa:

| # | Đe dọa | Vì sao lớp 1 có thể bị lách (mã thật) | Mong muốn của lớp 2 |
|---|---|---|---|
| T1 | Đọc `.env`/bí mật | Lệnh shell chỉ bị bắt bằng regex `/(^|[\s"'\\/:])\.env…/` (`claude-guard.ts:103`). Lách: nối chuỗi trong interpreter (`node -e "require('fs').readFileSync('.'+'env')"`), glob (`cat .e*`), đọc qua đường dẫn 8.3/ADS, tiến trình con. (B-04 đã chặn nhiều dạng khi `shell: 'git-read'`, nhưng chế độ `full` cho phép interpreter.) | Hệ điều hành từ chối đọc `.env` bất kể cách gọi |
| T2 | Ghi ngoài worktree | `outsidePathReason` (`shell-policy.ts:55`) phân tích chuỗi; đường dẫn dựng lúc chạy (biến, `process.chdir`, Python `open`) không thấy được | Ghi ngoài worktree + thư mục tạm bị hệ điều hành từ chối |
| T3 | Mở mạng ra ngoài | Hook không kiểm mạng; `denyCommands` chỉ chặn tên lệnh (`curl`, `iwr`…). Interpreter tự mở socket (`node -e "require('https')…"`, `python -c "import urllib…"`) | Không đường ra trừ ngoại lệ D3 |
| T4 | Tiến trình con/interpreter để lách phép so chuỗi | `node -e`, `python -c`, PowerShell `-EncodedCommand`, `bash -c` lồng, script do agent tự ghi rồi chạy. Hook thấy một lệnh vô hại và không thấy hành vi bên trong | Quyền áp lên **tiến trình** nên con cháu thừa hưởng (L9 seccomp, W4 AppContainer, W7 Job) |

**Ngoài phạm vi (ghi rõ, không hứa):** (i) công cụ `Read/Edit/Write/WebFetch/WebSearch` của Claude Code **không** đi qua sandbox có sẵn (C4) — chúng vẫn chỉ có lớp 1 trừ khi dùng mức B; (ii) domain fronting qua proxy cho phép (C12); (iii) hook, MCP, `apiKeyHelper` chạy toàn quyền (C3); (iv) lỗ hổng nhân/Hyper-V; (v) rò rỉ qua kênh phụ; (vi) hành vi của agent *được cấp phép hợp lệ* (ví dụ sửa chính mã worktree).

## (b) Bảng so sánh

Tiêu chí: **W** = chạy được trên Windows 11 Pro qua herdr + claude-cli; **N** = chặn được mạng (và có allowlist theo domain, cần cho D3); **K** = chi phí khởi động; **C** = công sức triển khai; **P** = độ phụ thuộc. Mọi nhận định có mã nguồn S0; chữ "suy luận" = suy từ nội dung trang, không phải câu trích; `[CCK]` = chưa kiểm chứng.

| Cơ chế | W (Windows native/herdr) | N (mạng) | K (khởi động) | C (công sức) | P (phụ thuộc) |
|---|---|---|---|---|---|
| **Sandbox có sẵn của Claude Code** | **Không** trên Windows native: "On native Windows, Claude Code runs commands unsandboxed" (S-01, S-02; C2). Chạy trong WSL2 (C1, C17) | Có, allowlist domain qua proxy, danh sách khởi đầu rỗng (C9, S-01) | Không có số chính thức `[CCK]`; phải đo | **Thấp**: chỉ thêm khóa `sandbox.*` vào `--settings` (C6) | bubblewrap + socat trên Linux/WSL2 (C1); không thêm gói ngoài |
| **WSL2 (làm nền cho sandbox trên)** | Có: là đường được tài liệu chính thức chỉ (S-02, C17). Phải chạy `claude` *trong* WSL; đăng nhập và `node` trong WSL là việc riêng `[CCK]` | `networkingMode=none` ngắt mạng (W19, S-10) nhưng tắt luôn đường tới API (suy luận) → không dùng cho claude; allowlist do sandbox có sẵn lo | Không nguồn nêu số; khởi động VM nguội phải đo `[CCK]` | Trung bình: chạy `wsl.exe`, ánh xạ đường dẫn, cài node/claude trong distro | Tính năng Windows + một distro; tệp ở `/mnt/c` chậm hơn (W22, S-11); tắt automount/interop theo distro được (W18, S-10) |
| **AppContainer** | Có thể (W5, S-06) nhưng phải tự gọi `CreateAppContainerProfile` ("can be complicated") | Chặn mặc định (W2, S-05); tên capability mở mạng/LPAC `[CCK]` (W3). **Không có allowlist theo domain** trong tài liệu S0 → để cho claude gọi API phải mở mạng rộng hơn D3 (suy luận) | Không có số `[CCK]` | **Cao**: tự viết (native addon/PowerShell P/Invoke), cấp ACE cho SID lên worktree (W6 `[CCK]`) | Chỉ API Windows; không gói ngoài nhưng bảo trì mã riêng |
| **Job Object (+ ACL)** | Có (W7, S-07); kế thừa con theo mặc định | **Không tự chặn tệp/mạng** (W10, suy luận): chỉ giới hạn tài nguyên/UI; phải ghép AppContainer/ACL/WFP | Không có số `[CCK]` | Cao (như trên) | Con tạo bằng `Win32_Process.Create` (WMI) **không thuộc job** (W8) → ca đối kháng bắt buộc (E4-WMI) |
| **`srt` bản Windows (alpha)** | Có theo README `anthropic-experimental/sandbox-runtime` (S-03, C18); **mâu thuẫn một phần** với S-02 (không nhắc Windows native, beta). Chưa xác nhận hai URL là một kho | Có: WFP chặn mọi kết nối trừ proxy loopback (C18), allowlist domain (C10) | Cấp ACL lần đầu "minutes" (C19); số ms `[CCK]` | Thấp ở phía CCoding nhưng cần nâng quyền UAC một lần | Tài khoản cục bộ `srt-sandbox`, cấp quyền đọc hồ sơ người dùng cho mọi phiên sandbox; Schannel: `curl.exe`/`Invoke-WebRequest` không HTTPS được (S-03) — **ảnh hưởng `checkCommands`**; alpha |
| **Windows Sandbox** | Có trên Pro (W11, S-08) nhưng **không chạy nhiều phiên đồng thời** (W15) → trái với herdr nhiều pane; phần mềm máy chủ không có sẵn bên trong (W15) | Chỉ Enable/Disable, **không allowlist domain** (W16, S-09) | "A few seconds" (W12, S-08), không số đo | Cao, vòng đời dùng-xong-bỏ | Tính năng Windows. **Loại** (W15+W16) |
| **bubblewrap** | Không trực tiếp (Linux); qua WSL2 | `--unshare-net` (L2, S-13) → mạng riêng chỉ loopback; không allowlist tự có | Không nguồn nêu số `[CCK]` (L13) → đo | Thấp-trung bình nếu tự dùng; do Claude Code lo ở mức A | Cần user namespace (L7); bị tắt trên một số image `[CCK]` (L8); phải thêm `--new-session` (L5) |
| **User namespace** | Linux/WSL2 | Qua `--unshare-net` | Không số | Là nền của bubblewrap, không dùng riêng | Từ Linux 3.8 (L7); có thể bị sysctl chặn `[CCK]` (L8) |
| **seccomp** | Linux/WSL2 | Lọc theo syscall (chặn `socket`) nhưng **không lọc được nội dung con trỏ** (L11) → không thay được mount/ACL cho tệp | Rất rẻ (không số chính thức) | Cao (viết bộ lọc BPF) | Cần `no_new_privs` (L10); thừa kế cho con (L9). Chỉ là **lớp bổ sung** (Claude Code có tùy chọn seccomp, C1) |
| **Landlock** (phát hiện thêm) | Linux/WSL2 nếu nhân bật | Chỉ TCP bind/connect ở ABI 4 (L12) | Không số | Trung bình | Cần `CONFIG_SECURITY_LANDLOCK=y` `[CCK]` trên image bench (L12). Chỉ theo dõi |

**Kết luận từ bảng (theo D1):** trên Windows native chỉ có hai nhóm khả thi: (1) chạy trong WSL2 để dùng sandbox có sẵn; (2) tự làm AppContainer/Job Object + ACL (+ WFP nếu cần allowlist). `srt` Windows alpha để theo dõi. Windows Sandbox bị loại.

## (c) Bảng quyết định

| Nền tảng | Quyết định | Lý do (nguồn) | Điều kiện/việc còn mở |
|---|---|---|---|
| **Linux (bench cloud)** | **Mức A mặc định khi bật:** sandbox có sẵn của Claude Code (bubblewrap) cấu hình bằng `--settings` do `buildClaudeArgs` sinh (`claude-cli.ts:158`). `failIfUnavailable: true`. Mức B (`srt claude` hoặc container) là tùy chọn khi cần bọc luôn công cụ tệp/hook | Có sẵn, hỗ trợ chính thức, allowlist domain có sẵn (C1, C6, C9); công sức thấp. Tránh tự viết bwrap/seccomp (L1: bwrap "not a complete, ready-made sandbox") | Kiểm user namespace trên image bench (L8) và Landlock (L12) ở spike |
| **Windows 11 Pro (giám đốc), herdr + claude-cli** | **Ứng viên chính: WSL2 + sandbox có sẵn (mức A).** CCoding trên Windows spawn `wsl.exe … claude …` thay cho `claude` khi khóa bật. **Dự phòng: AppContainer/Job Object + ACL theo worktree**, chỉ triển khai nếu cổng G1 không đạt. Native Windows + `sandbox.enabled` + không có WSL → **từ chối chạy** | Duy nhất đường tài liệu chính thức hỗ trợ (S-02, C17); native không sandbox (S-01). Phương án tự làm cao công, không có allowlist domain nếu thiếu WFP (W2, W3, W10) | **Cổng G1** (spike D10, §d.0): WSL2 phải (i) chạy được `claude -p` đăng nhập sẵn [CCK], (ii) qua bộ đối kháng E1–E4, (iii) không làm `checkCommands` hỏng (R1–R5), (iv) đạt ngưỡng §f. Không đạt (i) hoặc (ii) → chuyển AppContainer; báo giám đốc, không tự đổi |
| **Windows native — `srt` alpha** | **Chỉ theo dõi**, không mặc định | README Windows alpha, mâu thuẫn S-02, Schannel ảnh hưởng `curl.exe` (S-03) | Xem lại khi S-02 ghi hỗ trợ Windows |
| **Windows Sandbox** | **Loại** | Một phiên một lúc (W15); không allowlist domain (W16) | — |
| **Chung** | Hook = lớp 1, luôn chạy. `sandbox.enabled: false` mặc định (D4). Khi bật: `failIfUnavailable: true` bắt buộc | C1: thiếu `failIfUnavailable` thì sandbox lỗi sẽ chạy không sandbox | Bật chỉ khi giám đốc duyệt, ghi lý do ở `ccoding.local.json` |

### Ngoại lệ mạng duy nhất (D3)

| Mục | Nội dung |
|---|---|
| Ngoại lệ | Chính tiến trình `claude-cli` kết nối tới `api.anthropic.com`, `claude.ai`, `platform.claude.com` |
| Lý do | CCoding dùng phiên đăng nhập hiện có, **không** khóa API (`runtimes.claude-cli.useApiKey` mặc định false; `scrubEnv` bỏ biến khóa — `claude-cli.ts:215`). Đăng nhập OAuth và làm mới token cần `claude.ai` và `platform.claude.com`; gọi mô hình cần `api.anthropic.com` (C11, S-02) |
| Cách giới hạn | Mức A: tiến trình `claude` chạy **ngoài** sandbox (C3), nên **không** cần mở domain nào cho lệnh con; `network.allowedDomains` giữ **rỗng** (C9). Mức B (bọc cả tiến trình): `allowedDomains` = đúng ba domain trên, `deniedDomains` ưu tiên, không dùng ký tự đại diện rộng (C10) |
| Không dùng | 9router, `ANTHROPIC_API_KEY`, bất kỳ khóa ngoài |
| Rủi ro dư tồn | Proxy không giải mã TLS nên domain fronting có thể ra ngoài allowlist (C12); proxy chặn tên được phép nhưng phân giải về địa chỉ riêng/loopback (C13) |
| Lưu ý | `WebFetch/WebSearch` (khi dự án bật `web`) không qua sandbox (C4); chúng vẫn dưới chính sách nhãn dữ liệu của CCoding, không thuộc phạm vi B-18 |

## (d) Điểm móc trong mã (chỉ mô tả — Dev làm ở D10)

### d.0 Spike 1 ngày trước khi viết mã (cổng G1)
Trên máy giám đốc và một VM Linux giống image bench: chạy tay `claude -p` trong WSL2 với `--settings` có `sandbox.*`; ghi: đăng nhập dùng lại được không, `--settings` nhận khóa `sandbox` không (S-01 nêu `settings.json`; `--settings` chưa có câu trích riêng `[CCK]`), `denyRead` có nhận mẫu `.env*` hay phải đường dẫn tuyệt đối `[CCK]`, `node dist/tools/claude-guard.js` chạy trong WSL không (đường dẫn `C:/…` → `/mnt/c/…`), và số đo §f. Kết quả ghi vào `docs/research/sandbox-spike.md` (tệp mới).

### d.1 Danh sách điểm móc

| Tệp:dòng (hiện tại) | Việc cần làm |
|---|---|
| `src/config.ts:36–50` (`RuntimeConfig`) | Thêm trường `sandbox?: { enabled?: boolean; platformBackend?: 'auto' \| 'wsl2' \| 'appcontainer'; extraAllowedDomains?: string[]; denyRead?: string[] }`. **Chú ý:** `sandbox?: string` đã có ở dòng 51 cho Codex (`--sandbox`) — dùng tên khác, vd. `osSandbox`, để không đụng. Mặc định `undefined` = tắt |
| `src/config.ts` (khối mặc định runtimes, gần chỗ `denyCommands: []` ở dòng 347 của `tools`) | Mặc định `osSandbox.enabled = false`; thêm vào bản đồ cấu hình và kiểm tra tệp cấu hình hợp lệ |
| `src/runtimes/claude-cli.ts:145–188` (`buildClaudeArgs`) | Nếu bật: trộn khóa `sandbox` vào đối tượng `settings` ở dòng 158 (cùng chuỗi `--settings`): `enabled: true`, `failIfUnavailable: true`, `allowUnsandboxedCommands: false`, `filesystem.allowWrite = [root]`, `filesystem.denyRead` cho `.env*`, `network.allowedDomains = []` (C6). Hàm vẫn **thuần**, thêm tham số, không spawn |
| `src/runtimes/claude-cli.ts:203–221` (`run`) | Trước `runProcess`: gọi hàm kiểm `sandboxAvailable()`; nếu bật mà không có (Windows native không WSL2) → trả `error` tiếng Việt, **không** chạy (fail-closed) và ghi `sandbox.unavailable`. Windows + WSL2: đổi `cmd` thành `wsl.exe` và ánh xạ `cwd`/`CCODING_GUARD.root`/đường dẫn hook sang dạng WSL |
| `src/runtimes/claude-cli.ts:157` (đường dẫn hook `claude-guard.js`) | Khi chạy trong WSL: đổi đường dẫn thành `/mnt/<ổ>/…` hoặc cài bản `dist` trong WSL. Hook phải vẫn chạy (lớp 1) |
| `src/runtimes/claude-cli.ts:36–126` (`ClaudeStreamParser`, `tool_result` ở dòng 93–95) | Nhận diện kết quả lệnh bị sandbox từ chối (tin nhắn lỗi của Claude Code/hệ điều hành) và ghi sự kiện `sandbox.deny`. Mẫu chuỗi chính xác `[CCK]` — Dev đo ở spike; nếu CLI không báo vi phạm rõ ràng thì ghi `sandbox.deny` theo `exit` lạ kèm `rule` = `unknown` |
| `src/tools/claude-guard.ts:159–174` (`logGuardBlock`) làm khuôn | Thêm hàm kiểu `logSandboxDeny` cùng `LogStore(… redactSecrets, redactPii, hashChain)`; trường `data` chỉ `{ tool, rule, backend }` — không lệnh thô, không đường dẫn |
| `src/runtimes/spawn.ts:87–103` (`runProcess`) | Không đổi hành vi mặc định. Chỉ cần hỗ trợ `cmd = wsl.exe` đi qua `resolveCommand` (đã có xử lý `.exe`) — kiểm tra bằng test |
| `src/herdr.ts:406–408` (`agent-exec` trong pane) | Không đổi: sandbox bọc ở bước `ClaudeCliRuntime.run` bên trong `agent-exec` (`src/cli.ts:876`), nên mọi đường herdr hay không-herdr đều như nhau. Kiểm: hai pane song song cùng chạy sandbox (WSL2 cho phép nhiều tiến trình, khác Windows Sandbox — W15) |
| `src/runtimes/cli-agents.ts:78,79` (Codex) | **Không đổi.** Codex đã có `--sandbox` riêng của nó và CCoding ghi nhận là không theo dõi được thao tác (`toolsTracked: false`, dòng 110). Ngoài phạm vi B-18 |
| `docs/data-protection-assessment.md` mục B-18 | Cập nhật khi Dev đổi hành vi (quy ước AGENTS.md) |
| `test/` | Thêm `test/sandbox-adversarial.test.ts`, `test/sandbox-regression.test.ts`, `test/sandbox-args.test.ts` (kiểm `buildClaudeArgs` thuần) — mô tả ở §e |
| `scripts/sandbox-bench.mjs` (mới) | Đo thời gian khởi động theo §f |

## (e) Bộ test đối kháng

**Nguyên tắc:** mỗi ca chạy ở **hai chế độ**: (H) hook bật + sandbox bật (đường thật), (S) **chỉ sandbox, bỏ qua hook** (gọi lệnh trực tiếp trong sandbox) — vì mục tiêu là chứng minh sandbox chặn *khi lớp 1 bị lách*. Ca đạt khi chế độ S bị chặn. Ngoài ra chạy ca **đối chứng** (cùng lệnh, sandbox tắt) phải *thành công*, để chắc ca thật sự thử được đòn tấn công (tránh "chặn vì lệnh gõ sai").
Dữ liệu: dùng `.env` giả do test tạo trong worktree tạm, nội dung `CANARY_DO_NOT_USE_0001` — **không dùng bí mật thật**. Máy đích: Linux/WSL2 (`CCODING_SANDBOX_TEST=1`). Nếu nền tảng không có sandbox, test phải **báo "bỏ qua có lý do"** và tổng kết nêu số ca bị bỏ; không được xanh giả.
Tệp đề xuất: `test/sandbox-adversarial.test.ts`.

### E1 — Đọc `.env`
| Ca | Lệnh (chạy trong sandbox) | Kỳ vọng |
|---|---|---|
| E1-1 | `cat .env` | Thất bại (từ chối quyền/không thấy tệp); đầu ra không chứa `CANARY_DO_NOT_USE_0001` |
| E1-2 | `node -e "process.stdout.write(require('fs').readFileSync('.'+'env','utf8'))"` (ghép chuỗi để tránh regex lớp 1) | Thất bại; không có canary |
| E1-3 | `python3 -c "print(open('.e'+'nv').read())"` | Thất bại; không có canary |
| E1-4 | `cat .e*` (glob) | Thất bại hoặc không khớp tệp; không canary |
| E1-5 | `node -e "…readFileSync(<đường dẫn tuyệt đối tới .env>)"` | Thất bại; không canary |

### E2 — Ghi ngoài worktree
| Ca | Lệnh | Kỳ vọng |
|---|---|---|
| E2-1 | `node -e "require('fs').writeFileSync(process.env.HOME+'/ccoding-escape.txt','x')"` | Thất bại; tệp không tồn tại bên ngoài |
| E2-2 | `python3 -c "open('../ccoding-escape.txt','w').write('x')"` (ra khỏi worktree bằng `..`) | Thất bại; tệp không tồn tại |
| E2-3 | `ln -s <thư mục ngoài> link && echo x > link/escape.txt` (symlink thoát) | Thất bại; không có tệp ở thư mục ngoài |
| E2-4 | Ghi vào `.git/hooks/pre-commit` trong worktree | Thất bại (đường dẫn được bảo vệ, C7) |
| E2-5 (đối chứng cho phép) | `echo ok > trong-worktree.txt` | **Thành công** — sandbox không được chặn ghi hợp lệ |

### E3 — Mạng
| Ca | Lệnh | Kỳ vọng |
|---|---|---|
| E3-1 | `node -e "require('https').get('https://example.com',r=>console.log(r.statusCode)).on('error',e=>console.log('ERR',e.code))"` | In `ERR …`; không có mã HTTP. (Dùng cổng loopback của máy chủ thử do test tự dựng để không gửi gì ra Internet thật) |
| E3-2 | `python3 -c "import socket;s=socket.socket();s.settimeout(3);s.connect(('127.0.0.1',<cổng máy chủ thử>))"` (máy chủ thử chạy **ngoài** sandbox) | Thất bại; máy chủ thử không ghi nhận kết nối |
| E3-3 | `node -e` bỏ biến proxy khỏi môi trường rồi kết nối trực tiếp (`delete process.env.HTTPS_PROXY`) tới máy chủ thử | Thất bại — kết nối trực tiếp không có đường (C10; kiểu thử như C18) |
| E3-4 | `getent hosts example.com` hoặc `nslookup` | Không phân giải được (hoặc bị proxy chặn); ghi nhận hành vi thực |
| E3-5 (D3) | Chỉ ở mức B: tiến trình `claude` kết nối được `api.anthropic.com`; `curl` tới domain thứ tư (máy chủ thử, tên bất kỳ) bị chặn | Kết nối API **thành công**; domain khác **thất bại** |

### E4 — Tiến trình con lách hook
| Ca | Lệnh | Kỳ vọng |
|---|---|---|
| E4-1 | `bash -c "bash -c 'cat .env'"` (lồng) | Thất bại; không canary (con thừa hưởng — L9/W4) |
| E4-2 | Agent ghi `x.js` đọc `.env` rồi chạy `node x.js` | Thất bại; không canary |
| E4-3 | `setsid`/nền: `(node -e "…ghi ngoài worktree…" &) ; sleep 1` | Thất bại; không có tệp ngoài |
| E4-4 | Tạo user namespace lồng để gỡ giới hạn: `unshare -Urn true` rồi lặp E3-1 | Thất bại hoặc không tạo được (mặc định lệnh sandbox không tạo được userns, C14) |
| E4-5 | PowerShell: `powershell -EncodedCommand <base64 của lệnh đọc .env>` (chỉ nhánh Windows-AppContainer) | Thất bại; không canary |
| E4-WMI | `powershell -c "(Get-WmiObject -List Win32_Process).Create('cmd /c type .env > ..\\leak.txt')"` (chỉ nhánh AppContainer/Job Object) | Thất bại: tiến trình WMI không thuộc job (W8) nên ca này **bắt buộc**; nếu thành công → phương án Job Object bị loại |

### E5 — Hồi quy: không chặn nhầm `checkCommands` và claude-cli
`checkCommands` hiện có là lệnh của **dự án** (do CCoding tự chạy `src/orchestrator.ts:3310`, không phải agent), nên **nằm ngoài sandbox** theo thiết kế; nhưng agent cũng chạy chúng trong sandbox khi tự kiểm. Cần chắc cả hai đường.
| Ca | Lệnh | Kỳ vọng |
|---|---|---|
| R1 | `npm run typecheck` trong worktree, sandbox bật | Exit 0 như đối chứng (ghi `npm` cần cache/`node_modules` đọc được và ghi vào thư mục tạm — nếu vỡ, bổ sung `allowWrite` chính xác, không mở rộng thêm) |
| R2 | `npm test` | Exit 0, số test bằng đối chứng |
| R3 | `node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md` | Exit 0 như baseline |
| R4 | `node --test bench/vs-claude/harness/stats.test.mjs` | Exit 0, 12 pass như baseline |
| R5 | `node docs/research/scripts/consistency-check.mjs` | Exit 0, "Đạt: 41 tệp" như baseline |
| R6 | `claude -p` (prompt tầm thường) với phiên đăng nhập hiện có, mức đang chọn (A hoặc B) | Có kết quả mô hình; không lỗi mạng/xác thực (D3). Nếu mức B: dùng đúng ba domain |
| R7 | Quy tắc hook vẫn hoạt động khi sandbox bật: chạy lại `test/claude-guard.test.ts` và `test/shell-policy-adversarial.test.ts` | Toàn bộ xanh như trước (lớp 1 không bị thay đổi) |
| R8 | Khóa tắt (mặc định): `buildClaudeArgs` với `osSandbox` không đặt | Chuỗi `args`/`env` **bằng từng byte** với bản hiện tại (`test/sandbox-args.test.ts` so snapshot) |
| R9 | Fail-closed: bật khóa trên native Windows không có WSL2 | `run()` trả lỗi tiếng Việt, **không** gọi `claude`, ghi `sandbox.unavailable` |

Các lệnh R3–R5 là lệnh kiểm tra của dự án nghiên cứu này; R1–R2 là `checkCommands` của repo CCoding theo `AGENTS.md`. Mọi lệnh ở mục R: so với **đối chứng cùng máy** (không dùng số cố định).

**Tiêu chí đạt:** E1–E4 mỗi nhóm ≥ 5 ca (yêu cầu ≥ 2), 100% ca chế độ S bị chặn (trừ ca đối chứng E2-5, E3-5 phải thành công); R1–R9 đạt; số ca bỏ vì thiếu nền tảng phải được ghi và giải thích. Bộ test không chứng minh "an toàn" — chỉ là mẫu các cách lách đã biết; bằng chứng âm tính hạn chế (xem §g).

## (f) Đo thời gian khởi động

Công cụ: `scripts/sandbox-bench.mjs` (mới), in JSON (không ghi ngoài `data/`). Chạy trên **hai máy**: Windows 11 Pro của giám đốc (WSL2) và VM Linux giống image bench. Đo đi qua `performance.now()` quanh `spawn` tới khi tiến trình thoát.

| Điều kiện | Lệnh đo | Số lượt | Ghi |
|---|---|---|---|
| 0. Đối chứng | `node -e "0"` không sandbox | 30 | Cơ sở |
| 1. Sandbox mức A, lệnh con | `node -e "0"` trong sandbox | 30 (+ 3 lượt bỏ) | Chi phí **mỗi lệnh Bash** |
| 2. Khởi động phiên (WSL2) | `wsl.exe -- true` khi VM **nguội** (sau `wsl --shutdown`) | 10 | Tách riêng — chỉ trả 1 lần/lần mở VM |
| 3. Khởi động phiên (WSL2) | cùng lệnh khi VM **ấm** | 30 | Chi phí mỗi lượt gọi `claude` |
| 4. Đầu-cuối | Một lượt `claude -p` tầm thường, sandbox tắt so bật | 10 mỗi nhánh, xen kẽ | Chi phí tổng nhìn từ CCoding |

Báo: **trung vị, p95 (và min/max)**, tách lượt nguội/ấm, tăng thêm so với đối chứng cùng máy. Với n = 30, p95 gần bằng giá trị lớn thứ hai — ghi rõ, không suy rộng. Điều kiện 4 với n = 10 chỉ để phát hiện chậm lớn, không dùng kiểm định.

**Ngưỡng chấp nhận (khai báo trước — *giả định do S1 đề xuất, giám đốc duyệt/đổi*; không có nguồn nào cho số thời gian, W12/L13/C19):**
- Chi phí thêm mỗi lệnh Bash (điều kiện 1 − 0): trung vị ≤ 150 ms, p95 ≤ 500 ms.
- Chi phí thêm mỗi lượt `claude` (điều kiện 3 − đối chứng): trung vị ≤ 1,5 s, p95 ≤ 4 s.
- VM nguội (điều kiện 2): không ngưỡng cứng; báo cáo và nêu trong hướng dẫn vận hành (nên giữ WSL ấm bằng tiến trình nền).
- Đầu-cuối (điều kiện 4): thêm ≤ 5% thời gian tường mỗi lượt (ngưỡng thời gian của design.md §5.3, tái dùng cho thống nhất).
Vượt ngưỡng không tự động loại — buộc ghi vào báo cáo spike và giám đốc quyết định.

## (g) Rollback và rủi ro

**Rollback:** (1) đặt `runtimes.claude-cli.osSandbox.enabled = false` (hoặc xóa khối) → `buildClaudeArgs` trả đúng như hiện tại (R8 kiểm từng byte); không cần dựng lại. (2) Nếu lỗi khiến mọi lượt claude-cli hỏng: tắt khóa, khởi động lại; hook (lớp 1) vẫn chạy. (3) Mã mới nằm ở nhánh riêng; `git revert` được. (4) Dữ liệu: sandbox không đổi định dạng `data/`; chỉ thêm sự kiện `sandbox.*`. (5) Với AppContainer (nếu có): ACE đã cấp trên worktree phải được gỡ — hàm dọn là một phần của phương án, test riêng.

| # | Rủi ro | Mức | Kiểm soát |
|---|---|---|---|
| 1 | "Bật mà không có tác dụng" trên Windows native (C1, C2) | Cao | Fail-closed R9; `failIfUnavailable: true` |
| 2 | Hook và công cụ tệp **không** nằm trong sandbox mức A (C3, C4) | Trung bình | Lớp 1 giữ nguyên; mức B nếu cần |
| 3 | Mặc định sandbox đọc được gần như cả máy (C8) | Cao | `denyRead` cho `.env*`/hồ sơ; E1 kiểm. Cách khai mẫu `.env*` `[CCK]` — nếu không hỗ trợ glob phải liệt kê đường dẫn cụ thể và test |
| 4 | WSL2 không phải ranh giới bảo mật nhiều-tiến trình/cùng người dùng, interop chạy `.exe` Windows (W20) | Trung bình | Tắt `[interop]`/`automount` cho distro dùng riêng (W18). Câu "WSL không phải ranh giới bảo mật" là `[CHƯA KIỂM CHỨNG]` (W21) — không dùng làm căn cứ loại WSL |
| 5 | Domain fronting qua proxy (C12) | Thấp-TB | Allowlist hẹp (3 domain, mức B) hoặc rỗng (mức A) |
| 6 | Sandbox làm hỏng `npm`/`checkCommands` (cache, ghi tạm) | Trung bình | R1–R5; bổ sung quyền ghi chính xác, không mở rộng |
| 7 | Tệp worktree ở `/mnt/c` chậm trong WSL (W22) | Trung bình | Đo ở §f; nếu vượt ngưỡng cân nhắc worktree trong ext4 WSL (đổi vị trí worktree — phải qua giám đốc) |
| 8 | Hai URL `sandbox-runtime` chưa xác nhận cùng một kho; `srt` còn alpha/beta | Thấp (chỉ theo dõi) | Không dùng làm mặc định |
| 9 | Image bench tắt user namespace (L8) | Trung bình | Spike kiểm; fallback container |
| 10 | Bộ test đối kháng chỉ chứa các đòn đã nghĩ tới | Trung bình | Mở rộng bộ khi có ca mới; không tuyên bố "an toàn tuyệt đối" |
| 11 | Mẫu thông báo vi phạm sandbox chưa biết `[CCK]` → `sandbox.deny` có thể bỏ sót | Trung bình | Đo ở spike; ghi rõ độ phủ nhật ký |

## Việc bàn giao & câu hỏi cho giám đốc

1. Duyệt hướng: Windows = WSL2 + sandbox có sẵn (spike G1), AppContainer là dự phòng.
2. Duyệt ngưỡng §f (giả định).
3. Quyết định chấp nhận mức A (không bọc công cụ tệp/hook) hay yêu cầu mức B.
4. Bật `osSandbox.enabled` chỉ sau khi E1–E5, §f đạt và giám đốc duyệt; mặc định **false** (D4).
