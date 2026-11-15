# Danh mục nguồn chính thức — sandbox cấp hệ điều hành cho hook (B-18, S0)

Phân loại dữ liệu: **Nội bộ**. Ngày truy cập mọi nguồn: **2026-11-03**. Người lập: @literature-researcher. Bàn giao cho S1 (@methodologist).
Quy ước: "Đã mở" = trang tải được qua `fetch_url`; đoạn trích là nguyên văn ngắn từ kết quả công cụ. Mục không mở được hoặc chỉ có nguồn thứ cấp ghi `[CHƯA KIỂM CHỨNG]`.
Lưu ý: công cụ trả về bản tóm tắt/trích của trang, một số trang bị cắt (ghi rõ ở cột "Ghi chú"). Chưa chạy thử bất kỳ cơ chế nào trên máy; mọi con số thời gian khởi động thực đo là việc của S1/Dev (D10).

## 1. Kết luận theo D1 — Claude Code sandbox có chạy native trên Windows không?

**Kết luận: KHÔNG, với chế độ sandbox có sẵn (built-in Bash sandbox) của Claude Code. Đã kiểm bằng hai trang chính thức.**
- S-01: "The sandbox runs on macOS, Linux, and WSL2. On native Windows, Claude Code runs commands unsandboxed."
- S-02: "This option does not support native Windows. On Windows hosts, use WSL2 or one of the container or VM approaches below." ("Work on a native Windows host → A container or VM, or run the Bash sandbox inside WSL2.")
- Hệ quả: trên native Windows, nếu bật `sandbox.enabled` mà không kèm `failIfUnavailable: true` thì lệnh vẫn chạy **không sandbox** (S-01: "By default, if the sandbox can't start... Claude Code runs commands without sandboxing"). S1 phải ghi rõ để khỏi hiểu nhầm là đã được bảo vệ.

**Điểm cần S1 cân nhắc riêng (nguồn mâu thuẫn một phần, ghi cả hai):**
- S-03 (README `sandbox-runtime`, kho `anthropic-experimental`): liệt kê **Windows: Alpha** — dùng `srt-win.exe` đi kèm gói npm, chạy dưới tài khoản cục bộ riêng `srt-sandbox`, token bị hạn chế ghi, bộ lọc WFP chặn mọi kết nối ra ngoài trừ loopback tới cổng proxy (mặc định 60080–60089), ACL NTFS cho `allowWrite`. Cần **một bước cài có nâng quyền một lần** (`npx @anthropic-ai/sandbox-runtime windows-install`, một lần UAC).
- Nhưng S-02 (trang chính thức của Claude Code) mô tả `sandbox-runtime` chỉ cho "Linux and WSL2 ... On macOS" và nói gói ở trạng thái "beta research preview"; **không nhắc Windows native**. Cũng lưu ý S-02 liên kết tới `github.com/anthropics/sandbox-runtime` còn tôi mở được `github.com/anthropic-experimental/sandbox-runtime` — chưa xác nhận hai URL là cùng một kho `[CHƯA KIỂM CHỨNG]`.
- README Windows chưa nêu phiên bản Windows tối thiểu (S-03, phần đã đọc); phần "Known limitations" và "Shared machines" bị cắt, **chưa đọc** `[CHƯA KIỂM CHỨNG]`.
- Giới hạn Windows đã đọc: Schannel — "Windows does not hand TLS credentials to a restricted token", nên `curl.exe`, PowerShell `Invoke-WebRequest`, .NET `HttpClient`, `winget`, cargo không kết nối HTTPS được trong sandbox; Node, Python, Java, Go chạy được. (Có thể ảnh hưởng `checkCommands` nếu chúng dùng các công cụ trên — S1 cần kiểm.) `claude-cli` là chương trình Node nên về nguyên tắc thuộc nhóm chạy được, nhưng **chưa kiểm thực tế** `[CHƯA KIỂM CHỨNG]`.
- Trạng thái alpha + tài khoản người dùng riêng + cấp quyền đọc hồ sơ người dùng ("any sandboxed session on the machine can read your profile") là rủi ro cần S1 đưa vào đánh giá bảo vệ dữ liệu.

**Hệ quả cho D1:** chưa thể loại phương án nào. Giữ song song (a) AppContainer/Job Object + ACL tự làm, (b) WSL2 + bubblewrap (đường chính thức được hỗ trợ), (c) `srt` Windows alpha như phương án theo dõi, không dùng làm mặc định.

## 2. Bảng khẳng định → nguồn

Nguồn: S-01 https://code.claude.com/docs/en/sandboxing · S-02 https://code.claude.com/docs/en/sandbox-environments · S-03 https://github.com/anthropic-experimental/sandbox-runtime · S-04 https://code.claude.com/docs/en/hooks · S-05 https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation · S-06 https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-for-legacy-applications- · S-07 https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects · S-08 https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-overview · S-09 https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file · S-10 https://learn.microsoft.com/en-us/windows/wsl/wsl-config · S-11 https://learn.microsoft.com/en-us/windows/wsl/filesystems · S-12 https://github.com/containers/bubblewrap · S-13 https://manpages.debian.org/bookworm/bubblewrap/bwrap.1.en.html · S-14 https://man7.org/linux/man-pages/man7/user_namespaces.7.html · S-15 https://man7.org/linux/man-pages/man2/seccomp.2.html · S-16 https://docs.kernel.org/userspace-api/landlock.html

### 2.1 Windows (Microsoft Learn)

| # | Khẳng định | Nguồn | Đoạn trích ngắn | Trạng thái |
|---|---|---|---|---|
| W1 | AppContainer cô lập tệp, mạng, tiến trình; quyền cấp theo nguyên tắc tối thiểu | S-05 | "Granular access can be granted for Internet access, Intranet access, and acting as a server." / "Read-write access can be granted to specific persistent files and registry keys." | Đã mở |
| W2 | Mạng bị chặn mặc định trong AppContainer, chỉ mở khi được cấp | S-05, S-06 | "Isolating the app from accessing hardware, files, registry, other apps, network connectivity, and network resources without specific permission." | Đã mở (dạng tổng quát) |
| W3 | Tên cụ thể capability `internetClient` làm điều kiện mở mạng; LPAC khác AppContainer thường ở điểm nào | — | Trang capabilities (`.../capabilities-and-appcontainer-isolation`) trả 404; S-05/S-06 không nêu tên capability hay LPAC | `[CHƯA KIỂM CHỨNG]` |
| W4 | Tiến trình con của tiến trình trong AppContainer thừa hưởng token (kể cả mức toàn vẹn thấp) | S-06 | "the child process typically inherits the parent's token. That token includes the integrity level (IL) and app container info." / "if you are in an app container, then the integrity level (IL) is always low." | Đã mở |
| W5 | Tiến trình không đóng gói chạy trong AppContainer cần tự tạo hồ sơ bằng `CreateAppContainerProfile`; "can be complicated" | S-06 | "If you're not packaging your app, then you have to do the same things by calling those Win32 APIs yourself; but it can be complicated." | Đã mở |
| W6 | Cấp ACL thư mục (SID của AppContainer) cho worktree | S-05 (nguyên tắc cấp quyền cụ thể); API cấp ACE cho SID AppContainer chưa có trang riêng | — | `[CHƯA KIỂM CHỨNG]` cho cú pháp/API cụ thể |
| W7 | Job Object: tiến trình con mặc định cùng job; không thể gỡ liên kết sau khi gán | S-07 | "by default any child processes it creates using CreateProcess are also associated with the job." / "After a process is associated with a job, the association cannot be broken." | Đã mở |
| W8 | Tiến trình con thoát job được **chỉ khi** job bật BREAKAWAY_OK/SILENT_BREAKAWAY_OK; kẽ hở: con tạo bằng `Win32_Process.Create` (WMI) không thuộc job | S-07 | "Child processes created using Win32_Process.Create are not associated with the job." / "Prevent breakaways of any kind by setting neither the JOB_OBJECT_LIMIT_BREAKAWAY_OK nor the JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK limit." | Đã mở — **kẽ hở WMI cần đưa vào bộ test đối kháng** |
| W9 | `KILL_ON_JOB_CLOSE` giết toàn bộ tiến trình khi đóng handle cuối | S-07 | "closing the last job object handle terminates all associated processes and then destroys the job object itself." | Đã mở |
| W10 | Job Object tự nó **không** hạn chế đọc tệp hay mạng (chỉ giới hạn tài nguyên/giám sát/UI); nên cần AppContainer/ACL/WFP đi kèm | S-07 | Danh sách giới hạn chỉ gồm working set, ưu tiên, thời gian, CPU rate, UI restrictions, thông báo (không có mục tệp/mạng). Đây là **suy luận** từ nội dung trang, không phải câu trích | Suy luận |
| W11 | Windows Sandbox: yêu cầu bản Pro/Enterprise/Education; không hỗ trợ Home | S-08 | "Windows Sandbox is currently not supported on Windows Home edition." Bảng edition: Pro, Enterprise, Pro Education/SE, Education = Yes | Đã mở (máy giám đốc là Windows 11 Pro theo môi trường phiên này) |
| W12 | Windows Sandbox khởi động "vài giây"; không nêu con số | S-08 | "Takes a few seconds to launch" | Đã mở; số đo thực `[CHƯA KIỂM CHỨNG]` |
| W13 | Windows Sandbox: mạng bật mặc định, tắt được bằng `.wsb` | S-08, S-09 | "Networking is enabled by default." / `<Networking>Disable</Networking>`: "Disables networking in the sandbox." | Đã mở |
| W14 | `.wsb` ánh xạ thư mục chỉ đọc; thư mục ghi ánh xạ thì thay đổi còn lại sau khi hủy sandbox | S-09 | `<ReadOnly>`: "If true, enforces read-only access"; "Changes made ... to a mapped folder with write-permissions will persist after a Sandbox is disposed." | Đã mở |
| W15 | Windows Sandbox không chạy nhiều phiên cùng lúc; phần mềm máy chủ không có sẵn bên trong | S-08 | "Windows Sandbox currently doesn't allow multiple instances to run simultaneously." / "Host-installed software isn't available in the sandbox." | Đã mở — **bất lợi lớn cho herdr chạy song song nhiều pane và cho claude-cli (phải cài lại trong sandbox, cần đăng nhập)** |
| W16 | Windows Sandbox: mạng "Disable" tắt luôn đường tới API Anthropic → xung đột D3, không có allowlist theo domain | S-09 | Chỉ có giá trị Enable/Disable/Default, không có lọc theo domain | Đã mở (suy luận từ danh sách giá trị) |
| W17 | WSL: `automount` mặc định bật, ổ C: được gắn tại `/mnt/c` | S-10 | "`true` causes fixed drives (i.e `C:/` or `D:/`) to be automatically mounted with DrvFs under `/mnt`." | Đã mở |
| W18 | WSL: có thể tắt automount và interop Windows theo từng distro | S-10 | "Setting these to false will block the launch of Windows processes and block adding $PATH environment variables." (`[interop] enabled=false`) | Đã mở |
| W19 | WSL2: `networkingMode=none` ngắt mạng WSL; `firewall` cho phép Windows Firewall lọc lưu lượng WSL (Windows 11 22H2+) | S-10 | "If the value is `none`, the WSL network is disconnected." | Đã mở — nhưng `none` tắt luôn đường tới API Anthropic; **không có allowlist theo domain trong cấu hình WSL** (suy luận) |
| W20 | WSL: Windows chạy được công cụ Linux và ngược lại, tiến trình Windows "Run as the active Windows user" | S-11 | "Run as the active Windows user." / "Have the same permission rights as the WSL process." | Đã mở — nếu không tắt interop, lệnh trong WSL có thể gọi `.exe` trên máy chủ |
| W21 | WSL **không phải ranh giới bảo mật** giữa distro/host cùng người dùng; dùng VM tách riêng cho mã không tin cậy | wsl.dev/security (URL trả 404); chỉ có tóm tắt từ kết quả tìm kiếm, nguồn thứ cấp | — | `[CHƯA KIỂM CHỨNG]` — S1 không được dựa vào câu này như bằng chứng chính thức |
| W22 | Hiệu năng WSL: không khuyến nghị đặt tệp dự án ở `/mnt/c` | S-11 | "For the fastest performance speed, store your files in the WSL file system if you are working in a Linux command line" | Đã mở |

### 2.2 Linux (man page / repo chính thức)

| # | Khẳng định | Nguồn | Đoạn trích ngắn | Trạng thái |
|---|---|---|---|---|
| L1 | bubblewrap dựng sandbox bằng user namespace cho người dùng thường, không có chính sách sẵn | S-12 | "not a complete, ready-made sandbox with a specific security policy" | Đã mở |
| L2 | `--unshare-net`: mạng riêng (chỉ loopback) | S-13 (S-12 mô tả hành vi) | "Create a new network namespace." | Đã mở |
| L3 | `--ro-bind SRC DEST`, `--bind SRC DEST` | S-13 | "Bind mount the host path SRC readonly on DEST." / "Bind mount the host path SRC on DEST." | Đã mở |
| L4 | `--die-with-parent`, `--new-session`, `--clearenv`, `--tmpfs`, `--seccomp FD` | S-13 | "Ensures child process (COMMAND) dies when bwrap's parent dies." / "Create a new terminal session for the sandbox (calls setsid())." / "Unset all environment variables, except for PWD ..." | Đã mở |
| L5 | `--new-session` cần để chống TIOCSTI thoát sandbox | S-12 | "argument `--new-session` is needed to protect against out-of-sandbox command execution" | Đã mở |
| L6 | Mọi thứ gắn vào sandbox có thể bị lợi dụng để leo quyền | S-12 | (tóm tắt: bảo vệ phụ thuộc hoàn toàn vào đối số truyền vào) | Đã mở (dạng tóm tắt) |
| L7 | Từ Linux 3.8 tiến trình không đặc quyền tạo được user namespace | S-14 | "Since Linux 3.8, unprivileged processes can create user namespaces." | Đã mở |
| L8 | Sysctl chặn user namespace (`max_user_namespaces`, `unprivileged_userns_clone`...) — ảnh hưởng máy cloud bench | S-14 không nhắc | — | `[CHƯA KIỂM CHỨNG]` — S1 phải kiểm trên image bench, kể cả khi chạy trong container |
| L9 | seccomp: lọc theo số syscall và đối số bằng BPF; bộ lọc thừa kế qua fork/clone/execve | S-15 | "any child processes will be constrained to the same system call filters as the parent." | Đã mở |
| L10 | seccomp cần `no_new_privs` (nếu không có CAP_SYS_ADMIN) | S-15 | "the thread must already have the no_new_privs bit set." | Đã mở |
| L11 | seccomp không lọc được nội dung con trỏ (TOCTOU); đối số bị cắt sau kiểm | S-15 | "arguments are often silently truncated before being processed, but after the seccomp check." | Đã mở (một phần; con trỏ là suy luận) |
| L12 | Landlock: tự hạn chế quyền của tiến trình, không cần root; hạn chế tệp (từ 5.13), TCP bind/connect (ABI 4), thừa kế cho tiến trình con | S-16 | "Landlock empowers any process, including unprivileged ones, to securely restrict themselves." / "Every new thread resulting from a clone(2) inherits Landlock domain restrictions from its parent." | Đã mở — cần `CONFIG_SECURITY_LANDLOCK=y` và bật trong danh sách LSM; chưa kiểm trên image bench `[CHƯA KIỂM CHỨNG]` |
| L13 | Thời gian khởi động bubblewrap | Không có nguồn chính thức nêu số | — | `[CHƯA KIỂM CHỨNG]` — phải đo (chỉ tiêu của S1) |

### 2.3 Claude Code CLI và `sandbox-runtime`

| # | Khẳng định | Nguồn | Đoạn trích ngắn | Trạng thái |
|---|---|---|---|---|
| C1 | Sandbox có sẵn: macOS (Seatbelt), Linux và WSL2 (bubblewrap + socat, seccomp tùy chọn); **tắt mặc định** | S-01 | "The sandbox is off by default." / "uses bubblewrap for isolation" | Đã mở |
| C2 | **Native Windows không hỗ trợ** (xem mục 1) | S-01, S-02 | "On native Windows, Claude Code runs commands unsandboxed." | Đã mở |
| C3 | Sandbox chỉ phủ lệnh shell và tiến trình con; **command hooks chạy ngoài sandbox với toàn quyền** | S-01 | "command hooks, local MCP servers, plugin monitors, LSP servers, and helper commands such as your status line command and `apiKeyHelper` run with your full access" | Đã mở — **hệ quả trực tiếp cho B-18: sandbox built-in không bọc hook; muốn bọc hook phải bọc cả tiến trình Claude Code bằng `srt claude` hoặc container/VM** |
| C4 | Công cụ Read/Edit/Write/WebFetch/WebSearch tuân theo luật quyền, không qua sandbox | S-01, S-02 | "A `denyRead` entry doesn't stop the Read tool." | Đã mở |
| C5 | Cách bọc toàn bộ tiến trình, gồm công cụ tệp, MCP, hook: `srt claude` (runtime), dev container, VM | S-02 | "The whole Claude Code process, including file tools, MCP servers, and hooks" / "srt claude" | Đã mở; runtime ghi là "beta research preview" |
| C6 | Khóa `settings.json`: `sandbox.enabled`, `failIfUnavailable`, `allowUnsandboxedCommands`, `autoAllowBashIfSandboxed`, `excludedCommands`, `filesystem.{allowWrite,denyRead,allowRead}`, `network.{allowedDomains,deniedDomains,strictAllowlist,httpProxyPort}`, `credentials.{files,envVars}` | S-01 | Ví dụ JSON trong trang | Đã mở |
| C7 | Ghi mặc định: thư mục làm việc, thư mục tạm của người dùng, thư mục đã thêm; đường dẫn được bảo vệ (`.claude/settings*`, `.mcp.json`, `.bashrc`, `.git/hooks`) bị chặn ghi | S-01 | "the working directory, a per-user temp directory, and directories you've added." | Đã mở |
| C8 | Đọc mặc định: **gần như cả máy**, gồm tệp bí mật; muốn chặn đọc `.env` phải dùng `denyRead`/`credentials` | S-01 | "Most of the machine, including credential files such as `~/.ssh` and `~/.aws/credentials`." | Đã mở — liên quan test "đọc `.env`" |
| C9 | **Cơ chế allowlist mạng (D3):** lệnh trong sandbox không có đường ra trực tiếp; lưu lượng đi qua proxy trên máy, kiểm từng host theo `allowedDomains`, **danh sách khởi đầu rỗng** | S-01 | "Connections go through a proxy on your machine that checks each host against your allowed domains, which start empty." | Đã mở |
| C10 | `srt`: "By default, all network access is denied ... An empty allowedDomains list means no network access."; HTTP/HTTPS qua proxy HTTP, TCP khác qua SOCKS5; `deniedDomains` ưu tiên; hỗ trợ ký tự đại diện | S-03 | "Both HTTP/HTTPS (via HTTP proxy) and other TCP traffic (via SOCKS5 proxy) are mediated by these proxies" | Đã mở |
| C11 | Tên miền cần cho phiên Claude Code chạy trong `srt`: `api.anthropic.com` (hoặc endpoint nhà cung cấp cấu hình); `claude.ai` và `platform.claude.com` cho đăng nhập OAuth/làm mới token (bỏ được nếu dùng khóa API — nhưng **dự án cấm khóa API ngoài, nên giữ phiên đăng nhập → cần cả ba**) | S-02 | "`api.anthropic.com`, or your configured provider's endpoint." / "`claude.ai` and `platform.claude.com`, which OAuth sign-in and token refresh require." | Đã mở — **D3 phải ghi cả `claude.ai` và `platform.claude.com`, không chỉ `api.anthropic.com`** |
| C12 | Giới hạn của allowlist: proxy không giải mã TLS, quyết định theo hostname client khai; có thể bị domain fronting; cho phép domain rộng như `github.com` tạo đường rò rỉ | S-01 | "code running inside the sandbox can potentially use domain fronting or similar techniques to reach hosts outside the allowlist." | Đã mở — S1 ghi là rủi ro dư tồn |
| C13 | Proxy chặn hostname được phép nhưng phân giải về loopback/link-local/riêng | S-01 | "The sandbox proxy blocks allowed hostnames that resolve to loopback or private link-local addresses." | Đã mở |
| C14 | `allowNestedUserNamespaces: true` và `enableWeakerNestedSandbox` làm yếu ranh giới; mặc định lệnh sandbox không tạo được user namespace | S-01 | "you turn off a security boundary: code from a sandboxed command can end up running outside the sandbox." | Đã mở |
| C15 | Sandbox và quyền là hai lớp bổ sung nhau; quy tắc deny vẫn được tôn trọng khi auto-allow | S-01 | "Permission rules control which tools Claude Code can use ... Sandboxing provides OS-level enforcement" | Đã mở |
| C16 | Quan hệ với hook `PreToolUse`: hook chặn bằng exit 2 hoặc JSON `permissionDecision: "deny"`; exit 1 **không** chặn; hook hết hạn không chặn; bộ lọc `if` chỉ ở mức "best-effort" nên khuyến nghị dùng hệ thống quyền để cưỡng chế cứng | S-04 | "Exit code 1 without valid JSON output is a non-blocking error" / "use the permission system rather than a hook to enforce a hard allow or deny." | Đã mở (đọc 100.000 ký tự đầu của 284.276) |
| C17 | Windows native: tài liệu chính thức chỉ định hướng "container, VM, hoặc Bash sandbox trong WSL2" | S-02 | "Work on a native Windows host → A container or VM, or run the Bash sandbox inside WSL2" | Đã mở |
| C18 | `srt` Windows (alpha): tài khoản `srt-sandbox`, WFP, ACL NTFS, token hạn chế ghi, job object, một bước nâng quyền; mỗi `initialize()` chạy thăm dò thoát mạng và "refuses to start if any of them gets out" | S-03 | "a process that strips its proxy environment and connects directly is blocked at the kernel." | Đã mở một phần (README bị cắt ở 100.000/171.212 ký tự) |
| C19 | Chi phí khởi động `srt` Windows: lần đầu cấp ACL cho mỗi gốc `allowWrite` "takes time proportional to the tree"; cấp hồ sơ người dùng mất "minutes the first time"; không có con số mili-giây | S-03 | "expect minutes on a large profile, and no other session of yours can start while it runs." | Đã mở; số đo thực `[CHƯA KIỂM CHỨNG]` |
| C20 | Giấy phép `sandbox-runtime`: Apache-2.0 | S-03 | "Apache-2.0 license" | Đã mở |

## 3. Điểm chưa kiểm chứng (S1 phải đo hoặc ghi giả định)

1. W3 — tên capability `internetClient` và LPAC: trang Microsoft Learn về capabilities trả 404; chưa có đoạn trích. Cần mở lại bằng URL khác hoặc ghi "chưa kiểm chứng".
2. W6 — API/cú pháp cấp ACL cho SID AppContainer trên thư mục worktree.
3. W21 — "WSL không phải ranh giới bảo mật": chỉ có nguồn thứ cấp (tóm tắt tìm kiếm). Không dùng làm căn cứ loại WSL.
4. L8, L12 — user namespace và Landlock có bật trên image Linux của bench cloud không (kể cả khi chạy trong container).
5. C18 phần bị cắt ("Known limitations", "Shared machines", phiên bản Windows tối thiểu) và quan hệ giữa hai URL `anthropic-experimental/sandbox-runtime` và `anthropics/sandbox-runtime`.
6. Thời gian khởi động: Windows Sandbox "vài giây", `srt` Windows (phút cho lần cấp ACL đầu), bubblewrap — **không nguồn nào cho số đo**; phải đo theo chỉ tiêu của S1.
7. Việc `claude-cli` chạy được trong `srt` Windows (Schannel) và qua proxy — chưa thử.
8. Trang `hooks` chỉ đọc 100.000/284.276 ký tự; câu "hook chạy với toàn quyền" lấy từ S-01, không từ S-04.

## 4. Nhật ký truy vấn

| # | Công cụ | Truy vấn / URL | Bộ lọc | Ngày | Kết quả |
|---|---|---|---|---|---|
| 1 | fetch_url | code.claude.com/docs/en/sandboxing | — | 2026-11-03 | Mở được (đọc 0–100.000/107.872 ký tự) |
| 2 | fetch_url | github.com/anthropic-experimental/sandbox-runtime | — | 2026-11-03 | Mở được (0–100.000/171.212); gọi lần hai chuyên mục Windows, cùng giới hạn |
| 3 | fetch_url | learn.microsoft.com/.../secauthz/appcontainer-isolation | — | 2026-11-03 | Mở được |
| 4 | fetch_url | learn.microsoft.com/.../procthread/job-objects | — | 2026-11-03 | Mở được |
| 5 | fetch_url | .../windows-sandbox/windows-sandbox-overview | — | 2026-11-03 | Mở được |
| 6 | fetch_url | .../windows-sandbox-configure-using-wsb-file | — | 2026-11-03 | Mở được |
| 7 | fetch_url | learn.microsoft.com/en-us/windows/wsl/filesystems | — | 2026-11-03 | Mở được |
| 8 | fetch_url | learn.microsoft.com/en-us/windows/wsl/wsl-config | — | 2026-11-03 | Mở được |
| 9 | fetch_url | github.com/containers/bubblewrap | — | 2026-11-03 | Mở được (README; không nêu `--unshare-net`, `--bind`, `--die-with-parent`) |
| 10 | fetch_url | man7.org/.../user_namespaces.7.html | — | 2026-11-03 | Mở được |
| 11 | fetch_url | man7.org/.../seccomp.2.html | — | 2026-11-03 | Mở được |
| 12 | fetch_url | man7.org/linux/man-pages/man1/bwrap.1.html | — | 2026-11-03 | **404** (không có trang này) |
| 13 | fetch_url | docs.kernel.org/userspace-api/landlock.html | — | 2026-11-03 | Mở được |
| 14 | fetch_url | code.claude.com/docs/en/hooks | — | 2026-11-03 | Mở được (0–100.000/284.276) |
| 15 | fetch_url | .../appcontainer-for-legacy-applications- | — | 2026-11-03 | Mở được |
| 16 | fetch_url | code.claude.com/docs/en/sandboxing (offset 100000) | — | 2026-11-03 | Mở được (phần Limitations) |
| 17 | fetch_url | manpages.debian.org/bookworm/bubblewrap/bwrap.1.en.html | — | 2026-11-03 | Mở được (thay cho #12) |
| 18 | fetch_url | .../secauthz/capabilities-and-appcontainer-isolation | — | 2026-11-03 | **404** |
| 19 | web_search | "Windows Subsystem for Linux WSL 2 security boundary virtual machine Microsoft Learn" | chuẩn | 2026-11-03 | 7 kết quả; không có trang Microsoft Learn chính thức nêu rõ; 1 nguồn thứ cấp (wsl.dev) |
| 20 | fetch_url | wsl.dev/security/ | — | 2026-11-03 | **404** |
| 21 | fetch_url | code.claude.com/docs/en/sandbox-environments | — | 2026-11-03 | Mở được |

Số liệu: 21 lượt gọi; 17 mở được; 3 lỗi 404; 1 lượt tìm web. 15 nguồn chính (S-01…S-16, trừ trùng) được đưa vào bảng; `sandbox-environments` (S-02) và `hooks` (S-04) dùng làm nguồn. Không đưa chi tiết dự án nội bộ vào truy vấn.

## 5. Bàn giao cho S1

- **Quyết định D1:** sandbox built-in của Claude Code KHÔNG chạy native trên Windows (S-01, S-02). Giữ AppContainer/Job Object + ACL và WSL2 song song; ghi `srt` Windows (alpha) như phương án theo dõi.
- **Điểm mới ảnh hưởng thiết kế:** (i) sandbox built-in không bọc hook — hook chạy toàn quyền (C3); muốn bọc phải bọc cả tiến trình Claude Code (`srt claude`, container hoặc VM). (ii) Mặc định đọc được gần như cả máy, kể cả `.env` (C8) nên cần `denyRead`. (iii) `failIfUnavailable` phải bật, nếu không sandbox lỗi sẽ im lặng chạy không sandbox (C1). (iv) D3 phải liệt kê `api.anthropic.com`, `claude.ai`, `platform.claude.com` (C11) và ghi rủi ro domain fronting (C12). (v) Windows Sandbox không chạy nhiều phiên và không có allowlist domain (W15, W16) — nhiều khả năng loại; (vi) Job Object cần AppContainer/WFP đi kèm mới chặn tệp/mạng (W10) và có kẽ hở WMI (W8).
