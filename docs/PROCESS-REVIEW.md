# Rà soát quy trình & tối ưu token (sau lượt chạy T-20261026-224454-709)

Nhiệm vụ "hoàn thiện KeplerPM project" (Phòng Phát triển, chế độ Tự động) dừng ở pha review với lỗi *"Vượt ngân sách token của nhiệm vụ (609.0k/600.0k)"*. Tài liệu này phân tích log của lượt chạy, chỉ ra chỗ lãng phí và mô tả quy trình mới (CCoding v0.2).

## 1. Số liệu lượt chạy cũ

20 lượt gọi · **340.356 token vào / 268.656 token ra** · **cache đọc = 0** ở mọi lượt.

| Pha | Lượt | Input | Output | Nhận xét |
|---|---:|---:|---:|---|
| Định tuyến | 1 | 11,4k | – | Gửi cả yêu cầu gốc dài + hồ sơ điều phối viên đầy đủ để chọn 1 phòng |
| Lập kế hoạch | 1 | 13,7k | 9,8k | Hợp lý |
| **Họp** | **7** | **153k** | **3,5k** | Mỗi lượt ~21,8k token vào (~41 KB prompt) để nói ≤ 120 từ: gửi lại toàn bộ yêu cầu gốc + hồ sơ vị trí đầy đủ + kế hoạch cho từng người |
| Chốt kế hoạch | 1 | 24k | 14k | |
| Thực thi | 10 | 138k | 240,7k | Nhiều lượt chạm đúng 8.000 token ra nhưng file thu được rất nhỏ (S1 3 KB, S2a 1,7 KB): model gọi công cụ kiểu Claude Code (do 9router chèn system prompt riêng), nội dung nằm trong tham số công cụ và **bị bỏ**; S4 ra 64k token; S3a trả rỗng lần đầu; S5 lỗi 502 (9router ngắt kết nối) và **thử lại trên cùng runtime** |

Các vấn đề gốc:

1. **Ngân sách cứng = hỏng nhiệm vụ.** Chạm 600k là ném lỗi, nhiệm vụ "lỗi" dù 8/8 hạng mục đã xong; không có cách tiếp tục ngoài giao lại từ đầu.
2. **Họp là pha tốn nhất nhưng ít giá trị nhất về token** (45% input cho 1,3% output).
3. **Không có cache:** prompt đặt hồ sơ riêng từng agent lên đầu nên không có tiền tố chung; ngoài ra **9router không báo `cached_tokens`** (đã thử: gửi cùng prompt 11,8k token hai lần, kể cả với `cache_control`, đều tính đủ) và **chèn thêm ~2–4,5k token system prompt vào mỗi lượt** (cc/: ~2k, cx/: ~4,5k).
4. **Agent không có quyền đọc repo** (không gắn dự án/workspace) ⇒ làm "trên giấy", không chạy được test/migration; tài liệu PDF trong yêu cầu là đường dẫn trên máy nên agent không đọc được.
5. **Hồ sơ agent dài 1.100–1.650 từ** và mang giả định cứng (vd. luôn thiết kế ATTT cấp độ 4, xoay quanh ELK) — gửi lại ở mọi lượt.
6. **Log thiếu:** chỉ có call.start/end; không lưu phản hồi thô, phản hồi rỗng, lời gọi công cụ bị bỏ, lý do dừng (finish_reason), chuyển runtime.

## 2. Quy trình mới

```
Giao việc (yêu cầu + tệp đính kèm, chọn dự án/repo, ngân sách + chế độ)
  → Chuẩn bị workspace: git worktree + nhánh ccoding/<task>; .ccoding/<task>/inputs (yêu cầu đầy đủ + chữ trích từ tệp)
  → Định tuyến (Haiku, yêu cầu ≤ 6k ký tự)            ── bỏ qua khi đã chọn phòng/dự án
  → Lập kế hoạch (trưởng phòng, được ĐỌC repo)          ── checkpoint "planned"
  → Họp (chỉ khi ≥ 3 hạng mục & ≥ 2 người; ≤ 5 người; Haiku; hồ sơ tóm lược) → Chốt   ── checkpoint "finalized"
  → Thực thi song song: agent ĐỌC/GHI file, CHẠY lệnh thật (test, typecheck, migration DB dev) trong worktree
      · đầu vào từ hạng mục trước = tóm tắt + đường dẫn file (tự đọc khi cần)
      · đầu ra 32k token, bị cắt thì tự viết tiếp      ── checkpoint "executed"
  → Review (người review đọc thay đổi + chạy test để xác nhận) → Sửa (có công cụ)      ── checkpoint "reviewed"
  → Báo cáo tổng hợp (kèm thống kê thay đổi git) → commit trên nhánh ccoding/<task> (không push)
```

Xuyên suốt:

- **Ngân sách có 2 chế độ.** *Chạy tới khi hoàn thành* (mặc định): chỉ cảnh báo ở 80%, 100% và mỗi +50%. *Tạm dừng chờ quyết định*: chạm trần thì **tạm dừng** (không phải lỗi), giữ toàn bộ tiến độ. Nhiệm vụ tạm dừng/lỗi/đã hủy có các nút: **Chạy tới khi hoàn thành**, **+50% ngân sách & tiếp tục**, **Đóng gói vào dự án** (gắn repo/workspace, quyền công cụ, rồi chạy tiếp), **Chạy lại hạng mục đã xong** (vd. để áp dụng bản nháp vào repo thật). Server khởi động lại giữa chừng ⇒ nhiệm vụ chuyển "tạm dừng", tiếp tục từ checkpoint.
- **Hết token ⇒ tự chuyển tài nguyên.** Mỗi bí danh model là một chuỗi dự phòng (vd. Claude Max Sonnet → Codex GPT-6 Sol). Lỗi hết hạn mức/giới hạn tốc độ/mất kết nối/phản hồi rỗng/model không hỗ trợ ⇒ đánh dấu tài nguyên "nghỉ" (theo `Retry-After`/thời điểm reset, mặc định 30 phút) và **thử ngay tài nguyên kế tiếp** — không thử lại chỗ vừa lỗi. Có thể đặt `dailyTokenLimit` cho từng mục ("mốc miễn phí") để tự chuyển khi vượt. Hết sạch tài nguyên ⇒ tạm dừng nhiệm vụ và **tự tiếp tục** khi tài nguyên sớm nhất mở lại. Mọi sự kiện có **cảnh báo** (chuông + thông báo nổi trên giao diện, log, thông báo herdr).
- **Log đầy đủ.** Mỗi lượt gọi có bản ghi trong `data/runs/<task>/calls.jsonl` (che bí mật/PII, chuỗi băm): runtime/model đã thử và lỗi từng lần, kích thước prompt theo phần (hồ sơ/bối cảnh/công việc), max_tokens, finish_reason, số lượt công cụ, từng thao tác công cụ, phản hồi thô (kể cả rỗng). Log nhiệm vụ thêm: `tool.call`, `runtime.error`, `runtime.failover`, `call.diag`, `call.truncated`, `call.continue`, `budget.*`, `task.paused/resumed`, `workspace.*`. Giao diện có tab **🧾 Nhật ký** và **📡 Lượt gọi** cho từng nhiệm vụ.

## 3. Token: đã tối ưu chưa và tối ưu gì

| Hạng mục | Trước | Sau | Ước tính tiết kiệm (với nhiệm vụ cỡ T-…709) |
|---|---|---|---|
| Hồ sơ agent | 1.100–1.650 từ, giả định cứng | 450–700 từ, theo bối cảnh dự án; pha họp chỉ gửi *Sứ mệnh + Chuyên môn* | ~50–60% phần hồ sơ mỗi lượt |
| Họp | 7 lượt × ~21,8k | ≤ 5 người, Haiku, yêu cầu gốc ≤ 3k ký tự, biên bản ≤ 6k ký tự, tự bỏ họp khi kế hoạch nhỏ | ~150k → ~25–35k |
| Định tuyến | 11,4k, model của điều phối viên | Haiku, yêu cầu ≤ 6k ký tự | ~11k → ~4k |
| Đầu ra bị mất do model gọi công cụ không tồn tại | nhiều lượt × 8k token ra "mất trắng" | công cụ thật được xử lý; nếu runtime không có công cụ thì nhắc model viết thẳng văn bản | không mất output |
| Lỗi 502 / rỗng | thử lại cùng runtime | chuyển ngay tài nguyên khác, nghỉ tài nguyên lỗi | bớt lượt hỏng |
| Phụ thuộc giữa hạng mục, review, tổng hợp | dán nguyên văn (≤ 16k–40k ký tự) | tóm tắt + đường dẫn file khi agent đọc được file | ~30–50% các pha này |
| Cache tiền tố | không có tiền tố chung | bối cảnh chung của nhiệm vụ đặt ĐẦU prompt (giống nhau giữa các agent cùng pha); Anthropic API trực tiếp dùng `cache_control` | có hiệu lực với Anthropic API trực tiếp / OpenAI / Ollama; **qua 9router hiện không đo được** |

**Đánh giá:** lượt chạy cũ *chưa tối ưu* — khoảng 45% input dồn vào pha họp, một phần lớn output bị mất. Với quy trình mới, phần "giấy tờ" (định tuyến + họp + hồ sơ) giảm ước tính **40–50% input**. Ngược lại, khi agent làm thật trên repo, pha thực thi sẽ tốn thêm token cho vòng lặp công cụ (mỗi lượt công cụ gửi lại lịch sử); đã giới hạn bằng: số lượt công cụ theo pha (thực thi 30, sửa 12, review 8), **trần token đầu vào cho mỗi vòng lặp** (thực thi 400k, sửa 150k, review 120k), rút gọn kết quả công cụ cũ (giữ nguyên 4 kết quả gần nhất), rút gọn nội dung file đã ghi trong lịch sử, đọc nhiều file trong một lượt, và **chỉ cấp công cụ cho nhiệm vụ thuộc dự án có workspace thật**.

> Bài học khi chạy lại T-…b64 (nghiên cứu, không có repo): bản đầu cho phép công cụ ở mọi nhiệm vụ — người review tốn 434k token trong 12 lượt chỉ để đọc lại các báo cáo vốn đã có trong prompt, một lượt sửa tốn 269k token cho 3,7k token đầu ra. Đã sửa bằng các giới hạn trên. Đây là chi phí đổi lấy **sản phẩm chạy được và đã kiểm chứng** thay vì bản nháp trên giấy.

**Về cache với Claude Max:** 9router không trả số token cache nên CCoding hiển thị cache = 0; không có nghĩa nhà cung cấp không cache phía sau. Muốn đo/chủ động cache: dùng runtime `anthropic-api` (khóa API riêng) — CCoding đặt `cache_control` cho khối bối cảnh chung và hồ sơ vị trí.

## 4. Việc nên làm tiếp

- Gắn mọi nhiệm vụ làm việc trên mã nguồn vào **dự án có workspace = repo** (quyền `exec`, cách ly `worktree`) để agent đọc repo, sửa và chạy test thật.
- Đính kèm tài liệu (PDF/DOCX/XLSX…) thay vì dán đường dẫn trên máy; PDF dạng scan cần OCR (chưa hỗ trợ) — cài Poppler (`pdftotext`) để trích chữ PDF tốt hơn.
- Nếu có tài nguyên miễn phí muốn dùng trước Claude Max: đặt nó ở đầu chuỗi model kèm `dailyTokenLimit` (xem `docs/RUNTIMES.md`).
