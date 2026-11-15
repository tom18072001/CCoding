# Nhật ký thách thức và cách giải quyết của CCoding (26/10 → 2/11/2026)

Tổng hợp từ ghi chép làm việc của chủ dự án, `docs/PROCESS-REVIEW.md` và lịch sử git. Đã bỏ thông tin nội bộ: không có tài khoản,
mật khẩu, tên người, đường dẫn dữ liệu thật. **Dự án A** là dự án thật dùng làm tình huống nghiên cứu: một ứng dụng web nội bộ theo dõi
thực hiện văn bản chỉ đạo của một cơ quan nhà nước (Node/Prisma/PostgreSQL; nhãn dữ liệu Nội bộ; dữ liệu giả trên DEV). Tài liệu cũ gọi
là "ND57" — **khi công bố phải ẩn danh** (không nêu tên cơ quan, khách hàng, tên dự án nội bộ). Mốc thời gian theo giờ Việt Nam.

## A. Runtime và nhà cung cấp mô hình

| Ngày | Thách thức | Cách giải quyết | Bằng chứng |
|---|---|---|---|
| 27–28/10 | Cổng LLM dùng chung (9router) chứa tài khoản thuê bao không được phép dùng cho CCoding | Chủ dự án cấm dùng; tắt runtime qua cổng đó, bỏ khỏi `runtime.order`, sao lưu cấu hình trước khi đổi | commit `44ad65d`; `docs/RUNTIMES.md` |
| 28/10 | Runtime miễn phí/cục bộ: Ollama `qwen3:8b` trên GPU 4 GB ~6–7 token/s; Groq trần 8k token/phút; NVIDIA NIM chỉ cho dữ liệu Công khai | `runtime.slowModels`: pha thực thi/sửa/review chờ model nhanh mở lại (≤ 30 phút) thay vì chạy model chậm; nhãn dữ liệu quyết định runtime được phép | PROCESS-REVIEW §8–9 |
| 28/10 | **Model yếu phá code**: lượt sửa bằng qwen3-8b xóa ~430 dòng một module phân quyền rồi báo "đã sửa" | Khôi phục; không dùng model chậm/yếu cho sửa code lớn; review + lệnh kiểm tra bắt buộc trước khi tính là xong | PROCESS-REVIEW §8 |
| 28/10 | "Không còn runtime" (Ollama tắt) → nhiệm vụ tự tiếp tục rỗng 55 lần, mỗi 5 phút | Giãn 5/10/20/40/60 phút, quá 5 lần thì dừng hẳn + cảnh báo | PROCESS-REVIEW §8 |
| 28/10 | Lỗi 429 giữa vòng công cụ làm mất cả lượt | Chờ rồi thử lại chính lượt đó (`rateWaitMs` 4 phút) | PROCESS-REVIEW §8 |
| 28/10 | Runtime không có cache: mỗi lượt thực thi gửi lại 25–61 vòng, 1,4–3,0M token/lượt; phần nền ~38k ký tự mỗi vòng; đọc trùng 40–66 % | Ngân sách ngữ cảnh theo runtime; đề bài ≤ 3.000 ký tự + `PLAN.md` (229k → 125k ký tự, −46 %); bỏ đọc trùng; mô phỏng −38 % token đầu vào | PROCESS-REVIEW §9 |
| 28/10 | Bật runtime `claude-cli` (Claude Code, gói Max, không khóa API) | Bỏ mọi biến khóa khỏi môi trường; hook PreToolUse `claude-guard`; `--strict-mcp-config --setting-sources project,local`: ngữ cảnh mỗi lượt **93k → 7,6k token** | `src/runtimes/claude-cli.ts`, `src/tools/claude-guard.ts` |
| 29/10 | Trình quản lý pane (herdr) dùng lại id pane đã đóng → `pane_not_found`, hai agent cùng trỏ một pane | Bỏ pane đã đóng trước khi tạo; chỉ dùng pane khi nhãn đúng agent | commit `fef09a9`, `6f51a47` |
| 1–2/11 | Chạy benchtest chạm **hạn mức 5 giờ** của gói Max giữa vòng (C2) | Xóa lượt hỏng (chi phí $0), chạy lại sau khi hạn mức mở; harness có trần chi phí | `bench/vs-claude/results` |

## B. Quản trị và giới hạn sub-agent

| Ngày | Thách thức | Cách giải quyết |
|---|---|---|
| 27/10 | KPI tính lỗi hạ tầng vào điểm agent; "đã kiểm chứng" khi chỉ đọc code | KPI 4 nhóm (Chất lượng 40 · Hiệu quả 25 · Tin cậy 20 · Tuân thủ 15) chấm từ log; tách lỗi hạ tầng; chỉ tính kiểm chứng khi chạy test/typecheck/lint/build thật |
| 28/10 | Agent đọc vô hạn trước khi ghi (QA đọc 70 lần trước lần ghi đầu) | `tools.readsBeforeWrite`: nhắc ở 16 lần đọc liên tiếp, chặn từ 32 tới khi ghi; nhắc ghi tệp ở 35 %/65 % ngân sách công cụ |
| 28/10 | Agent đọc tệp qua shell (`cat`, `Get-Content`, `rg`) khi đã có công cụ đọc → KPI và kiểm soát sai | Chặn đọc/tìm qua shell khi có `read_file`/`search` |
| 28/10 | Claude Code chạy lệnh nguy hiểm/ra ngoài phạm vi | Hook `claude-guard`: lệnh cấm mặc định + của dự án, chặn tạo/chuyển nhánh, rebase, `reset --hard`, push; giữ Read/Edit/Write trong worktree; chặn `.env`; `--allowedTools` theo quyền CCoding cấp (none/read/write/exec) |
| 28/10 | KPI báo 0/7 lượt chạy test dù agent có chạy (claude-cli không ghi lệnh công cụ) | claude-cli ghi `tool.call` (Bash → run_command, Read → read_file…) |
| 28/10 | Giám đốc yêu cầu sửa bằng ghi chú ngắn → 4/6 agent trả về "không rõ bước nào" | Mỗi lỗi ghi rõ hạng mục được chọn + việc mặc định |
| 1/11 | Giao "khảo cổ commit" cho Kiến trúc sư không có Bash: 57 lần đọc trước lần ghi đầu, 4,0M token, review không duyệt | Prompt lập kế hoạch ghi **năng lực công cụ từng người** + quy tắc giao theo năng lực; `git_read` (git chỉ đọc không qua shell) |
| 1/11 | Lệnh shell trỏ ra thư mục dữ liệu thật ngoài worktree | Hook chặn đường dẫn tuyệt đối/`~`/`$HOME`/`../` vượt gốc — **kiểm theo mẫu chuỗi, không phải sandbox hệ điều hành** (hạn chế còn mở) |
| 1/11 | Review qua claude-cli chỉ có công cụ đọc → QA luôn ghi "không chạy được lệnh" | Pha review được dùng Bash (commit `6f51a47`) |
| 1/11 | Thay đổi chưa commit trong worktree bị review tính là lỗi → mỗi gói thêm một vòng sửa | CCoding tự commit khi xong; review không tính (commit `0601a36`) |
| 2/11 | Lệnh Bash vô tình đọc stdin (`cat` không đối số) treo tới hết giờ (> 7 phút) | Hook bọc lệnh `{ …\n} </dev/null` qua `updatedInput` (commit `0e82b82`) |
| 27/10 → nay | Tự cải thiện: góp ý 👍/👎 và nút "💬 Nhắc agent" → ≤ 5 góp ý vào system prompt, tự xóa khi lỗi KPI hết | **Thủ công**; chưa có nhật ký sự cố có cấu trúc, chưa tự đề xuất sửa prompt, chưa có A/B, chưa có rollback |

## C. Điều phối, song song và hiệu năng

| Ngày | Quan sát | Cách giải quyết / kết quả |
|---|---|---|
| 1/11 | 7 gói của dự án A: thực thi chiếm 70–85 % thời gian; gói 3/4 là chuỗi phụ thuộc gần như tuyến tính; họp đổi kế hoạch 6/6 lần nhưng chủ yếu THÊM phụ thuộc; setup + baseline nằm trên đường găng ~1 phút | Setup + baseline song song với lập kế hoạch; chốt kế hoạch chỉ thêm phụ thuộc khi thật cần |
| 1/11 | Hạng mục chạy lệnh phải làm lần lượt vì dùng chung worktree | **Worktree con song song** + tự gộp `--no-ff` + giải xung đột trong worktree con mới. Gói 4 (7 hạng mục tuần tự): 44 phút, 14,75M token → gói 4b (5 hạng mục song song, không xung đột): **8,5 phút, 2,49M token** |
| 1/11 | `git worktree remove` trên worktree có `node_modules` là junction xóa luôn thư mục đích | Worktree con cài phụ thuộc thật, không dùng junction; so dấu vân tay tệp khai báo phụ thuộc để chạy lại lệnh chuẩn bị |
| 1/11 | Ước tính token lấy mẫu từ runtime khác (báo 8,7M, thực tế 2,2M) | Ước tính chỉ lấy lịch sử cùng runtime |
| 1–2/11 | Benchtest vs Claude Code thuần: CCoding chậm 1,5–2,5 lần, đắt 1,7–2,2 lần (chất lượng ngang) | Làn nhanh + điều phối song song + bỏ họp + tổng hợp theo mẫu → nhanh hơn Claude Code ở 3/5 bài (PROCESS-REVIEW §13) |
| 2/11 | Hai nhiệm vụ cùng lúc trên một server tranh agent (một agent một việc) → lập kế hoạch chờ nhau 34 giây | Benchtest chạy mỗi hệ tuần tự; chưa có "ghế" ≤ 2 hạng mục/vai trò (đề xuất mở) |
| 2/11 | Kế hoạch 4 hạng mục độc lập nhưng `maxParallel` 3 → hạng mục lớn nhất chờ 30–50 giây | Làn nhanh nâng `maxParallel` theo số hạng mục độc lập (commit `d7600f6`) |
| 2/11 | Chạy trên Windows chậm 2–3 lần so với cloud Linux (cùng bài) | Chưa xử lý — cần đo tách (khởi động `claude`, git, npm, hook) |

## D. Chất lượng thật bắt được nhờ review độc lập (dự án A)

- Review cuối gói 2 phát hiện **nâng quyền**: bước chuyển dữ liệu gán vai trò giám sát hệ thống cho hồ sơ cũ → sửa ở gói 2b, thêm test
  tương đương quyền (mọi hồ sơ cũ × mọi khóa quyền × xem/thao tác).
- Review gói 3 "đạt có điều kiện": báo cáo năm chỉ gộp kỳ tháng (sai cho chu kỳ quý/năm), migration chưa tự áp ở entrypoint → gói 3b.
- Chủ dự án tự phát hiện một lỗi phân quyền khi chạy bản thử (vai trò cũ được quyền ở mọi nghị định khác) → gói 3d.
- Số test của dự án A tăng 249 → 592 qua 9 gói; hiệu năng trang tổng hợp 1,07–1,24 s → 26–193 ms; 30 người đồng thời p95 8,7 s → ~0,2–0,34 s.

## E. Số liệu 9 gói của dự án A (claude-cli trừ gói 1–2)

| Gói | Thời gian | Token (kể cả cache) | Ghi chú |
|---|--:|--:|---|
| 1 | — | 14,52M | nền tảng; 249 test |
| 2 | — | 38,1M | kẹt ở vòng sửa (runtime cục bộ tắt, model yếu phá code); đóng bằng claude-cli 7 phút / 1,3M |
| 2b | 15 phút | 2,18M | sửa nâng quyền; 352 test |
| 3 | 38 phút | 12,55M | 417 test |
| 3b | ~20 phút | 3,87M | 446 test |
| 3c | ~15 phút | 4,2M | hiệu năng truy vấn |
| 3d | ~10 phút | 1,8M | lỗi phân quyền; 481 test |
| 4 | 44 phút | 14,75M | 7 hạng mục làm lần lượt; 568 test |
| 4b | 8,5 phút | 2,49M | 5 hạng mục song song bằng worktree con; 592 test |
