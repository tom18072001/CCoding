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

## 5. Bài học từ lượt chạy lại (27/10/2026)

- **Claude Max bị giới hạn tốc độ giữa chừng** — 9router bọc lỗi 429 trong 503 nên lúc đầu bị hiểu là lỗi mạng, cả hai gateway bị "nghỉ" và lượt gọi rơi xuống `kimi-cli` (chưa đăng nhập). Đã sửa: đọc mã lỗi gốc của nhà cung cấp, lỗi giới hạn chỉ chặn đúng model đó, Codex tiếp quản; CLI chưa đăng nhập = lỗi xác thực.
- **Lượt lập kế hoạch/review/tổng hợp lỗi từng bị coi là xong** (review rỗng = "duyệt", báo cáo rỗng vẫn "done"). Đã sửa: dừng ở trạng thái tiếp tục được; tiếp tục sẽ chạy lại hạng mục lỗi rồi review/tổng hợp lại.
- **Nhiều agent dùng chung một worktree và tự tạo/chuyển nhánh** theo quy ước của repo (`kepper/p0-…`, `kepper/p2-auth`, `kepper/p3-…`) ⇒ các agent khác làm nhầm nhánh, phải dừng để tránh đè thay đổi của nhau. Đã sửa: agent không được tạo/chuyển/xóa nhánh hay worktree (vẫn được `git merge` nhánh khác vào nhánh hiện tại).
- **Mất kết nối giữa vòng lặp công cụ dài** làm mất cả lượt (14 phút) và token không được ghi sổ. Đã sửa: thử lại lượt bị rớt; lỗi giữa chừng vẫn ghi sổ token và thao tác công cụ đã làm.
- **Phòng Nghiên cứu không có nguồn để làm tổng quan** ⇒ thêm công cụ tra cứu `search_papers` (OpenAlex), `web_search`, `fetch_url`.

## 6. Sau đợt đánh giá performance (27/10/2026)

Đánh giá hai nhiệm vụ 26/10 (8,42M token cho ngân sách 1,2M; 86% token ở các lượt chạy lại; 88% token đầu vào trong vòng lặp công cụ; 9 lần can thiệp tay) dẫn tới các thay đổi:

| Vấn đề | Thay đổi |
|---|---|
| Một nhiệm vụ gói cả bản phát hành (brief 5.761 ký tự, ngân sách 600k) | Sau khi chốt kế hoạch: **ước lượng token** (`estimate` trong cấu hình) và cảnh báo khi vượt ngân sách × 1,2 (chế độ `pause` thì dừng). Nút **"Tách hạng mục thành nhiệm vụ riêng"** / `ccoding split <task>`: mỗi hạng mục thành một nhiệm vụ có yêu cầu, bối cảnh gốc, sản phẩm đã có và ngân sách riêng; thứ tự phụ thuộc giữ bằng `after` |
| Nhiệm vụ nghiên cứu không có workspace → không kiểm kê, không lưu tệp (blocker lặp ở 6/7 review) | Nhiệm vụ không thuộc dự án có **thư mục riêng** `workspaces/<task>` với quyền `write` (đọc/ghi tệp, không chạy lệnh); tệp tạo ra được liệt kê trong báo cáo |
| Nhiều agent chạy lệnh song song trong cùng worktree | Repo dự án quyền `exec`: hạng mục **chạy lệnh** làm lần lượt (`tools.serializeWriters`), hạng mục chỉ viết tài liệu vẫn song song |
| Review chỉ đọc bản báo cáo bị cắt, QA không chạy test | Review đọc tới 60k ký tự, phần bị cắt có đường dẫn để đọc tiếp; QA có quyền chạy lệnh **bắt buộc** chạy test và ghi `checks`; review không chạy lệnh nào bị gắn cờ "chưa có bằng chứng"; review không đọc được JSON **không còn** được coi là duyệt |
| Hạng mục chạy 2–6 lần không ai để ý | Ngân sách **theo hạng mục** (mặc định 2 × ngân sách / số hạng mục) + cảnh báo khi hạng mục chạy lần thứ 3, 5… |
| Lượt gọi 12 phút mất do 502 không vào sổ | Lượt lỗi sau ≥ 60 giây không có usage được ghi sổ **ước lượng** (`call.lost`); thời gian mỗi lần thử được ghi |
| Claude Max báo 429 liên tục, lượt nào cũng thử lại rồi mới chuyển | Model vừa bị 429 **xếp sau** model khác trong `runtime.rateBackoffMs` (20 phút) cho tới khi gọi thành công lại |
| Vòng lặp công cụ: mỗi lượt rút gọn lịch sử làm hỏng cache tiền tố | Rút gọn **theo đợt** (khi phần cũ > 40k ký tự) để tiền tố ổn định → cache của Codex/OpenAI trúng nhiều hơn; tùy chọn `cacheControl` gắn điểm cache kiểu Anthropic qua gateway |

**KPI sub-agent**: mỗi agent được chấm như nhân sự một phòng ban (Chất lượng 40 · Hiệu quả 25 · Tin cậy 20 · Tuân thủ 15) từ log — tab **KPI**, `ccoding kpi`, bảng KPI trong mỗi báo cáo nhiệm vụ, kèm "việc cần sửa" sinh tự động.

## 7. Sau lượt chạy ND57 gói 1 (27/10/2026) — đợt cải thiện 28/10

Lượt gói 1 (`nd57/da-nghi-dinh-goi-1`): 29 lượt Claude + Codex, ~14,1 triệu token vào ở Sonnet riêng một nhiệm vụ, cache Claude = 0, 62/196 thao tác là đọc tệp qua shell, review trên Codex không chạy test, nhiệm vụ báo "xong" dù còn hạng mục lỗi. Thay đổi:

| # | Vấn đề | Thay đổi |
|---|---|---|
| P1/P9 | Review không chạy test, không có bằng chứng độc lập | Dự án khai báo `setupCommands`/`checkCommands`; CCoding **tự chạy** ở baseline, sau thực thi, sau mỗi vòng sửa; hồi quy ⇒ không duyệt; review chưa duyệt ⇒ cờ **⚠ cần xem** (`docs/TOOLS.md`) |
| P5 | Đọc tệp qua `Get-Content`/`cat`/`rg` (không số dòng, đọc lại nhiều lần) | `run_command` chặn lệnh chỉ để đọc/tìm khi đã có `read_file`/`search` |
| P4 | Ước tính token theo hằng số, lệch xa thực tế | Ước tính hạng mục theo **trung vị token thực tế** của agent trong `estimate.historyDays` (30 ngày), đủ `estimate.minSamples` (2) mẫu; UI ghi rõ cơ sở ước tính |
| P3 | Agent khảo sát rộng repo lớn mỗi hạng mục | **Bản đồ repo** `.ccoding/<task>/repo-map.md` (tệp lớn, route, model, hàm kèm số dòng) trong prompt lập kế hoạch/thực thi |
| P6 | Claude Max 429 → pha nặng rơi xuống Codex chậm (~10 phút/lượt, treo >25 phút) | `runtime.slowModels` + `waitForFastMs`: model nhanh sắp mở lại thì **tạm dừng chờ** và tự tiếp tục, giữ bàn giao (`docs/RUNTIMES.md`) |
| P2 | Không có prompt cache với Claude qua 9router | Đo 28/10: đường chat của 9router bỏ system và không cache; đường `/v1/messages` cache được (lần 2 đọc ~99,9% từ cache). Cách bật mà vẫn qua Bifrost: provider kiểu *anthropic* + `cacheControl` (`docs/RUNTIMES.md`); CCoding đặt điểm cache trên kết quả công cụ mới nhất, đọc `cache_write_tokens` của Bifrost, sửa tên công cụ `_ide` |

Chưa làm (đợt 3, sau khi đo lại trên gói 2): P7 CSDL kiểm thử dùng chung cho dự án, P8 ghi chú ngữ cảnh giữa các nhiệm vụ.

## 8. Lượt đo gói 2 ND57 (28/10/2026) và các sửa trong lúc chạy

Nhiệm vụ `T-20261028-085918-6fa` "Phân quyền Người · Nghị định · Đơn vị" (7 hạng mục), nhánh `nd57/da-nghi-dinh-goi-2` trên ND57.

| | Gói 1 (27/10) + nhiệm vụ sửa lỗi | Gói 2 (28/10) |
|---|---|---|
| Lượt gọi | 32 + 6 | 42 (11 trên Codex khi Claude Max hết hạn mức) |
| Đầu vào không cache | 14,52M + 0,64M | 1,68M |
| Đọc / ghi cache | 0 / 0 (+0,26M Codex) | 29,76M / 4,05M (84% đầu vào đọc từ cache) |
| Đầu vào quy đổi theo giá (đọc ×0,1, ghi ×1,25) | 15,19M | 9,71M (−36%) |
| Test | 249/249 | 324/326 (baseline 255) — 2 test mới đỏ: bảng ADR lệch `ROLE_TEMPLATES`; giám sát/quản trị vẫn xem hàng chờ duyệt và duyệt được báo cáo |
| Thời gian | 73 + 52 phút | 166 phút, trong đó ~75 phút chờ Claude Max hết 429 |

Sửa trong lúc chạy (đã đẩy lên `main`): trần token vòng công cụ tính phần đọc cache 10% (`tools.cachedInputWeight`), input kiểu OpenAI không đếm lại phần ghi cache, 429 giữa vòng công cụ chờ rồi thử lại chính lượt đó (`rateWaitMs`), thực thi 60 lượt / sửa 24 lượt (cấu hình máy), chờ model nhanh tối đa 30 phút tính từ lần lỗi đầu (`HealthInfo.since`), review giữ vòng và danh sách hạng mục đang sửa qua tạm dừng (`reviewRound`, `revising`) và chạy lại lệnh kiểm tra khi workspace đổi sau lần đo gần nhất (`staleAt`) — lượt này review vòng cuối dựa trên kết quả kiểm tra cũ (317/317) trong khi workspace đã có 2 test đỏ.

Còn tốn: hạng mục ADR của kiến trúc sư ~2,5M token (88 lần đọc/tìm); backend vẫn thường 14–26 lượt mới ghi tệp đầu tiên và quen đọc/sửa tệp qua PowerShell (bị chặn, mất lượt); hạng mục "áp quyền cho cả nhóm route" quá lớn (S3: 353 thao tác, 6 lần chạy).

Từ 28/10 trưa: **tắt** `bifrost` và `openai-api` (9router) theo yêu cầu chủ dự án — không dùng tài khoản Claude/Codex trong 9router.

## 9. Tối ưu cho runtime miễn phí / cục bộ (28/10/2026, tối)

Sau khi tắt 9router, CCoding chạy trên Cerebras/NVIDIA miễn phí và Ollama cục bộ — **không có cache** kiểu Claude (hoặc có nhưng hạn mức tính theo phút/ngày), nên mọi token gửi lại đều tính. Đo lại gói 2 (chỉ số đếm, không nội dung):

| Chỉ số (29 lượt thực thi/sửa) | Gói 2 |
|---|---|
| Lượt công cụ mỗi lượt gọi | 12–102 (thực thi thường 25–61) |
| Đầu vào mỗi lượt gọi | 0,3–3,0M token (trung bình ~1,1M) |
| Phần nền gửi lại mỗi lượt (hồ sơ + bối cảnh + đề bài) | 30–36k ký tự ≈ 13–17k token |
| Đọc trước lần ghi đầu | tới 70 (QA), 65 (frontend), 48 (backend S4) |
| Đọc trùng (cùng tham số) | 40–66% số lần đọc — phần lớn do rút gọn lịch sử rồi đọc lại |

Thay đổi:
1. **Ngân sách ngữ cảnh theo runtime** (`toolContextTokens`, `contextWindow` — `docs/RUNTIMES.md`): rút gọn ngay khi vượt, hiệu chỉnh ký tự/token theo usage thật, không bao giờ vượt `num_ctx` của Ollama.
2. **Phần nền thực thi gọn**: đề bài ≤ 3.000 ký tự (bản đầy đủ `inputs/BRIEF.md`), tài liệu đính kèm ≤ 2.500, đầu vào hạng mục trước ≤ 3.500, kế hoạch chung mỗi hạng mục một dòng + `PLAN.md`.
3. **Giới hạn khảo sát** `tools.readsBeforeWrite` (16): nhắc ở 16 lần đọc liên tiếp, từ chối đọc ở 32 cho tới khi ghi.
4. **P8 — lịch sử dự án** cho pha lập kế hoạch (`inputs/PROJECT-HISTORY.md`).

Mô phỏng trên dữ liệu gói 2: (1) −20–22%, (1)+(2) ≈ −35% token đầu vào; (3) giảm số lượt (chưa đo được trước khi chạy thật). P7 (CSDL kiểm thử dùng chung) để sau: cần DB riêng cho dự án, không dùng các container đang vận hành.

## 10. Quản lý sub-agent sau 7 gói ND57 chạy bằng claude-cli (1/11/2026)

Đo từ `data/runs/<task>/events.jsonl`, `calls.jsonl`, `kpi.json` (chỉ số đếm, không nội dung) — gói 2b → 4b, cùng runtime claude-cli:

| Gói | Hạng mục | Thời gian | Tổng thời lượng lượt thực thi | Token | Song song tối đa | Vòng sửa | Kết quả review |
|---|---:|---:|---:|---:|---:|---:|---|
| 2b | 3 | 14,0′ | 6,3′ | 2,18M | 1 | 1 | duyệt |
| 3 | 7 | 38,2′ | 29,5′ | 12,55M | 2 | 1 | đạt có điều kiện (⚠ cần xem) |
| 3b | 4 | 20,1′ | 10,7′ | 3,87M | 1 | 1 | duyệt |
| 3c | 4 | 14,8′ | 12,0′ | 4,20M | 2 | 0 | duyệt |
| 3d | 3 | 10,5′ | 5,0′ | 1,80M | 1 | 1 | duyệt |
| 4 | 7 | 44,0′ | 32,5′ | 14,75M | 2 | 1 | chưa duyệt (⚠ cần xem) |
| 4b | 5 | 8,6′ | 10,3′ | 2,49M | **3** (worktree con) | 0 | duyệt |

Nhận xét:
- Thực thi chiếm 70–85% thời gian. Gói 3 và 4 gần như là **một chuỗi phụ thuộc** (gói 4: S1→S2→…→S7) nên dù có worktree con cũng không song song được; 4b (kế hoạch có ý thức song song, không họp) chạy 3 lượt cùng lúc.
- **Họp đổi kế hoạch 6/6 lần nhưng gần như chỉ để THÊM phụ thuộc** (gói 3b: S1, S2, S3 độc lập → S1→S2→S3; gói 3d: ADR phụ thuộc cả S1, S2) — vừa tốn 1–1,6 phút vừa kéo dài đường găng.
- **Giao sai năng lực công cụ**: gói 4 giao "khảo cổ commit" cho Kiến trúc sư (hồ sơ không có `Bash`) — không chạy được `git log` → 57 lần đọc trước lần ghi đầu, 4,02M token (gấp 2,6 trung vị phòng), review không duyệt hai vòng (review đã gợi ý "người có shell"), phải làm lại ở gói 4b. Trưởng phòng lập kế hoạch không thấy ai có quyền gì.
- **Giới hạn khảo sát `readsBeforeWrite` không áp cho claude-cli** — chỉ có trong vòng công cụ của CCoding; Kiến trúc sư gói 3 (S7: 2,18M + sửa 2,74M) và gói 4 (S1) đọc dài trước khi ghi.
- **Lệnh shell của claude-cli đọc được tệp ngoài worktree** (hook chỉ giữ `Read/Write/Grep/Glob`); có agent ghi tệp tạm ra `/tmp`, và trên máy có thư mục dữ liệu thật của ND57.
- Lệnh chuẩn bị + baseline chạy **sau** khi chốt kế hoạch: ~35–70 giây trên đường găng mỗi gói (4b: 68 giây giữa kế hoạch xong và lượt thực thi đầu).
- Ước tính token lấy cả mẫu thời qwen/9router: gói 2b báo ~8,73M (Backend ~4,07M/hạng mục) trong khi thực tế 2,18M → cảnh báo "nhiệm vụ quá lớn" giả.
- KPI "đọc code bằng run_command — lỗi PowerShell" đếm **mọi** lệnh shell (kể cả test/build) và áp cả cho claude-cli (Git Bash) → "việc cần sửa" giả cho Backend/Data/Frontend.

Thay đổi (`main`, 1/11):

| # | Thay đổi | Tệp |
|---|---|---|
| M1 | Roster trong prompt **lập kế hoạch và chốt kế hoạch** ghi năng lực công cụ từng người (*chạy lệnh* / *đọc/ghi tệp, xem lịch sử git — KHÔNG chạy test/build* / *chỉ đọc*) + quy tắc giao việc theo năng lực | `prompts.ts`, `orchestrator.ts` (`capabilities`) |
| M2 | **`git_read`**: repo git ⇒ vai trò không có `Bash` được git chỉ đọc (log/show/diff/blame/status/grep…) — vòng công cụ CCoding chạy `git` không qua shell; claude-cli thêm `Bash` nhưng hook chỉ cho git đọc. Lệnh Bash chỉ xem git ghi log/KPI là `git_read` | `tools/shell-policy.ts`, `tools/workspace.ts`, `tools/claude-guard.ts`, `runtimes/claude-cli.ts` |
| M3 | **Giới hạn khảo sát cho claude-cli** trong hook (nhắc ở 16 lần đọc liên tiếp, chặn đọc từ 32 tới khi ghi; chạy test/ghi đặt lại) | `tools/claude-guard.ts` |
| M4 | **Lệnh shell bị giữ trong thư mục làm việc** (claude-cli và `run_command`): chặn `C:\…`, `/c/…`, UNC, `~/`, `$HOME`, `../` vượt gốc; cho thư mục tạm/cài đặt hệ thống | `tools/shell-policy.ts` |
| M5 | **Chuẩn bị + baseline song song với lập kế hoạch/họp** (`tools.earlyBaseline`, mặc định bật) | `orchestrator.ts` |
| M6 | Chốt kế hoạch khi chạy song song: chỉ thêm phụ thuộc khi thật sự cần kết quả/hợp đồng hoặc sửa cùng đoạn tệp; thống nhất giao diện thì ghi vào `decisions` | `prompts.ts` |
| M7 | Ước tính token chỉ lấy lịch sử nhiệm vụ **cùng runtime** | `estimate.ts`, `orchestrator.ts` |
| M8 | KPI "đọc code qua shell" chỉ đếm lệnh thật sự đọc/tìm (cat, grep, sed -n, ls…) | `kpi.ts` |

Chưa làm (đề xuất tiếp, cần số liệu thêm sau vài gói):
- **"Ghế" cho mỗi vai trò** (một agent làm ≤ 2 hạng mục song song khi mỗi hạng mục có worktree con, mỗi ghế một pane herdr): lợi ích hiện bị chuỗi phụ thuộc che khuất — đo lại sau M6.
- **Review theo từng hạng mục ngay khi gộp xong** (review cuối chỉ kiểm tích hợp + lệnh kiểm tra) để vòng sửa bắt đầu sớm; 5/7 gói cần một vòng sửa, mất 0,5–8 phút ở cuối.
- **Tạo sẵn việc nối từ lỗi review còn mở** khi nhiệm vụ "⚠ cần xem" (gói 3 → 3b, 4 → 4b đều do chủ dự án tự viết đề bài).

## 11. Kiểm tra chạy song song bằng lượt chạy thật (1/11/2026)

Repo nháp `C:\Users\admin\ccoding-partest` (không dữ liệu, nhãn Công khai), dự án `partest` (`setupCommands: npm ci`, `checkCommands: npm test`), claude-cli, `T-20261101-154016-5fe`: 5 hạng mục — S1 Backend, S2 Data, S3 DevOps chạy lệnh độc lập; S4 Frontend phụ thuộc S1; S5 Kiến trúc sư ghi ADR từ lịch sử git; S1 và S2 cố ý cùng thêm dòng cuối `CHANGELOG.md`.

| Tính năng | Kết quả |
|---|---|
| Baseline song song với lập kế hoạch | ✓ baseline xong ở giây 3, kế hoạch xong giây 38 |
| Worktree con + lệnh chuẩn bị riêng | ✓ S1–S3 tách ở giây 38–39, `npm ci` 2 giây mỗi worktree, 4 lượt gọi đồng thời (S1–S3 + S5) |
| Gộp | ✓ S2 gộp sạch; S3, S4 gộp sạch |
| Xung đột khi gộp | ✓ S1 xung đột `CHANGELOG.md` → làm lại trong worktree chính, agent tự `git merge` và giữ cả hai dòng (13 giây) |
| Chờ phụ thuộc gộp xong | ✓ S4 tách worktree sau khi S1 gộp xong (giây 73) |
| Dọn dẹp | ✓ không còn worktree con / nhánh tạm; chỉ còn worktree + nhánh nhiệm vụ |
| Kiểm tra sau thực thi, review | ✓ `npm test` đạt, QA chạy lệnh, duyệt; không "cần xem" |
| git chỉ đọc qua hook | ✓ Kiến trúc sư/Trưởng phòng đọc được `git log/show/ls-files`, nhưng **lần đầu mỗi lượt bị chặn** vì agent nối `cd … && git … && git …` |

Lỗi/thiếu sót tìm được và đã sửa:
1. **Hạng mục tài liệu làm trong worktree chính** trong khi các worktree con gộp vào đó → CCoding commit dở tệp ADR của Kiến trúc sư ("phần đã làm trước khi gộp S3"), có thể đụng tệp đang gộp. Nay hạng mục chỉ ghi tệp cũng có worktree con (không chạy `setupCommands`).
2. **Phụ thuộc mới không được cài lại ở worktree nhiệm vụ**: hạng mục thêm thư viện cài trong worktree con, sau khi gộp, lệnh kiểm tra chạy ở worktree nhiệm vụ với `node_modules` cũ → hồi quy giả, review không duyệt. Nay so dấu vân tay tệp khai báo phụ thuộc với lúc chuẩn bị, khác thì chạy lại lệnh chuẩn bị (có test hồi quy — test đỏ với code cũ).
3. **Báo cáo ghi "commit: không có thay đổi"** khi mọi thay đổi vào nhánh qua gộp → nay ghi HEAD + số commit trên nhánh.
4. **git chỉ đọc không cho nối lệnh** → mất một lượt mỗi agent; nay cho nối nhiều lệnh git đọc bằng `&&` (vẫn chặn `||`, lệnh khác, chuyển hướng, `$(…)`).

Còn để ý: hạng mục làm lại sau xung đột giữ khóa worktree chính suốt lượt làm lại — S3 xong ở giây 58 nhưng phải chờ tới giây 72 mới gộp được. Với code thật lượt làm lại có thể vài phút; hướng sửa: làm lại trong một worktree con mới tách từ HEAD nhánh nhiệm vụ (agent gộp nhánh cũ ở đó) rồi CCoding gộp lại như hạng mục thường.
