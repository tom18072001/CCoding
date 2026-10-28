# Đánh giá bảo vệ dữ liệu — CCoding Office

**Ngày đánh giá:** 26/10/2026 · **Phạm vi:** mã nguồn repo `CCoding` và bản chạy trên máy Windows cá nhân của chủ dự án.

**Giả định** (chưa được chủ dự án xác nhận ⇒ áp mức nhạy cảm cao hơn):
1. Công cụ cá nhân, một người dùng, chạy cục bộ (`127.0.0.1`), không mở ra Internet.
2. Brief và tài liệu dự án đưa cho agent có thể chứa thông tin nội bộ của khách hàng (cơ quan bộ/ngành, doanh nghiệp) — có thể lẫn dữ liệu cá nhân cơ bản; **không** chủ đích xử lý dữ liệu công dân hàng loạt hay bí mật nhà nước.
3. Runtime bên ngoài (Claude Code/Anthropic, Codex/OpenAI, Kimi/Moonshot, 9router chuyển tiếp) xử lý dữ liệu ở nước ngoài ⇒ mọi prompt gửi đi là **chuyển dữ liệu xuyên biên giới**.

**Kết luận cổng: ĐẠT CÓ ĐIỀU KIỆN** — đạt với điều kiện thực hiện các mục [Bắt buộc] ở phần 5, đặc biệt: dự án chứa dữ liệu khách hàng phải gắn nhãn *Bảo mật*/*Hạn chế* (chỉ chạy runtime cục bộ) và không đưa bí mật nhà nước/dữ liệu công dân thật vào hệ thống.

## 1. Phân loại

| Tập dữ liệu | Nhãn nội bộ | Phân loại pháp lý | Số chủ thể | Cấp độ HTTT |
|---|---|---|---|---|
| Brief, tài liệu dự án đưa vào agent | Nội bộ (mặc định) → **Bảo mật/Hạn chế** theo dự án | Dữ liệu khác (dùng riêng); có thể chứa DLCN cơ bản | Không chủ đích — dưới ngưỡng dữ liệu quan trọng | Công cụ cá nhân, không thuộc HTTT được phân cấp độ; **không** tích hợp vào hệ thống cấp độ 3+ |
| Prompt & sản phẩm (`data/runs/*/prompts`, `outputs`, `FINAL.md`) | Theo nhãn dự án | Như trên | Như trên | — |
| Log vị trí / phòng / hệ thống (`data/logs`) | Nội bộ | Nhật ký hệ thống | 0 (PII đã che) | — |
| Sổ cái token (`data/usage/ledger.jsonl`) | Nội bộ | Dữ liệu vận hành | 0 | — |
| Khóa API, token (`env`, `ccoding.local.json`) | **Hạn chế** | Thông tin xác thực | — | — |
| Mã nguồn, agent.md (GitHub) | Nội bộ | Dữ liệu khác | 0 | — |

Bí mật nhà nước: **cấm** đưa vào CCoding (quản lý riêng theo Luật Bảo vệ bí mật nhà nước 117/2025/QH15).

## 2. Dòng dữ liệu

```
Tom (UI/CLI) ──HTTP loopback──▶ Server 127.0.0.1 ──▶ Orchestrator
   └─ dự án: nhãn dữ liệu, workspace, runtime
Orchestrator ──▶ Prompt builder (che bí mật luôn; che PII khi Bảo mật/Hạn chế)
   ├─▶ Runtime cục bộ: mock, Ollama (local:true)                     [ở lại trên máy]
   └─▶ Runtime ngoài: claude/codex/kimi CLI, Anthropic API, 9router ★ [XUYÊN BIÊN GIỚI]
Kết quả ──▶ data/runs (đĩa cục bộ) ──▶ UI (SSE)
Log/token ──▶ data/logs, data/usage (che PII, chuỗi băm) ──▶ (tùy chọn) Elastic Agent → ELK nội bộ
GitHub ◀── chỉ mã nguồn (data/, workspaces/, ccoding.local.json bị .gitignore)
```
★ chặng có thể mang dữ liệu nhạy cảm — bị chặn mặc định với nhãn *Bảo mật*/*Hạn chế*.

## 3. Rà năng lực

| Mã | Trạng thái | Khuyến nghị cụ thể | Ưu tiên |
|---|---|---|---|
| GOV-01 | Một phần | Chính sách dạng code: `dataProtection.allowedRuntimes` theo nhãn; mọi ngoại lệ (mở runtime ngoài cho *Bảo mật*) ghi lý do trong `ccoding.local.json` và README dự án | Nên có |
| GOV-02 | Một phần | Chủ sở hữu & người phê duyệt: Tom. Ghi rõ người chịu trách nhiệm dữ liệu cho từng dự án khách hàng (thường là đơn vị chủ quản) | Nên có |
| GOV-03 | Một phần | Danh mục = bảng phân loại trên + cấu trúc `data/`; cập nhật khi thêm loại dữ liệu | Nên có |
| GOV-04 | Một phần | Nhãn theo dự án + regex che (email, SĐT, CCCD, thẻ Luhn, khóa API, JWT, private key). Bổ sung Presidio/ NER tiếng Việt để bắt tên người, địa chỉ | Nên có |
| GOV-05 | Một phần | `events.jsonl` + `prompts/` + `outputs/` nối task → agent → runtime → file; có thể xuất OpenLineage nếu cần | Nâng cao |
| GOV-06 | Một phần | Gửi prompt cho nhà cung cấp LLM là chia sẻ liên tổ chức: chỉ dùng gói/khóa có điều khoản không dùng dữ liệu để huấn luyện, ghi lại nhà cung cấp & mục đích theo dự án | **Bắt buộc** |
| PRE-01 | Một phần | Server chỉ nghe loopback, chặn Host/Origin lạ, bắt buộc JSON; bật `CCODING_TOKEN` nếu đổi `host`. Chạy dưới tài khoản Windows có mật khẩu/Windows Hello | **Bắt buộc** (khi mở LAN) |
| PRE-02 | N/A | Ứng dụng không có tài khoản quản trị riêng; quyền quản trị = tài khoản Windows của chủ máy | — |
| PRE-03 | Một phần | Kết nối ra ngoài qua HTTPS (TLS 1.2/1.3 do nhà cung cấp). Bật **BitLocker** cho ổ chứa `data/` và `workspaces/` | **Bắt buộc** |
| PRE-04 | Một phần | Log luôn che PII/bí mật; prompt ra ngoài luôn che bí mật, che PII khi *Bảo mật/Hạn chế*. Lưu ý: che/bí danh hóa vẫn là DLCN — chỉ khử nhận dạng mới thoát phạm vi | Nên có |
| PRE-05 | Chưa có | DLP endpoint ngoài phạm vi ứng dụng; nếu là máy công ty, dùng Defender/Purview DLP | Nâng cao |
| PRE-06 | Một phần | Kiểm soát mục đích: runtime theo nhãn, workspace riêng mỗi dự án, công cụ giới hạn theo vai trò, `acceptEdits` thay vì bỏ qua quyền; ngân sách token mỗi nhiệm vụ | Nên có |
| PRE-07 | Một phần | API cục bộ: chống CSRF/DNS-rebinding, chặn path traversal, giới hạn kích thước body; thêm rate limit nếu mở LAN | Nên có |
| DET-01 | N/A | Không có CSDL; thay bằng log `call.start/call.end` theo từng lượt gọi | — |
| DET-02 | Chưa có | Định kỳ quét `data/` và `workspaces/` tìm PII lọt (script Presidio) | Nâng cao |
| DET-03 | Chưa có | Một người dùng; ngân sách token là chốt chặn khối lượng bất thường. Có thể dùng Elastic ML trên log CCoding | Nâng cao |
| DET-04 | Một phần | Log tập trung JSONL theo vị trí/phòng/nhiệm vụ, `retentionDays: 400` (≥ 12 tháng). Đẩy `data/logs/**/*.jsonl` vào ELK nội bộ bằng Elastic Agent (filestream) | Nên có |
| DET-05 | Một phần | Chuỗi băm SHA-256 từng file + `ccoding logs verify`. Nếu cần giá trị chứng cứ: WORM/Object Lock, ký số, dấu thời gian TSA, tách quyền quản trị log | Nâng cao |
| PRI-01 | N/A | Không thu thập DLCN trực tiếp từ chủ thể; nếu tài liệu dự án có DLCN thì kế thừa căn cứ xử lý của dự án gốc | — |
| PRI-02 | Một phần | Prompt chỉ chứa brief + đầu ra liên quan (có cắt độ dài); **không đưa dữ liệu thật**, dùng dữ liệu mẫu/giả lập | **Bắt buộc** |
| PRI-03 | N/A | Không quản lý hồ sơ chủ thể dữ liệu | — |
| PRI-04 | Một phần | Nếu buộc phải đưa DLCN vào runtime nước ngoài: lập hồ sơ đánh giá tác động chuyển DLCN xuyên biên giới trước khi thực hiện. Mặc định chặn bằng nhãn | **Bắt buộc** (khi phát sinh) |
| RES-01 | Chưa có | Mã nguồn ở GitHub; sao lưu `data/` (restic/OneDrive mã hóa) nếu cần giữ lịch sử, kiểm thử khôi phục | Nên có |
| RES-02 | Một phần | Có `retentionDays` (chưa tự xóa). Bổ sung lệnh dọn theo hạn, xóa an toàn workspace khi kết thúc dự án | Nên có |
| RES-03 | Chưa có | Kịch bản: lộ khóa API → thu hồi & xoay khóa; lộ DLCN → đánh giá, thông báo ≤ 72 giờ | Nên có |

**AI/agent** (Luật Trí tuệ nhân tạo 134/2025 Đ7 → GOV-06, PRE-06, PRI-02): agent chỉ truy cập workspace của dự án; không dùng dữ liệu dự án để huấn luyện mô hình; mọi lượt gọi có log (ai, dữ liệu gì, khi nào, qua runtime nào, kết quả lưu ở đâu).

## 4. Nghĩa vụ pháp lý phát sinh

| Nghĩa vụ | Căn cứ | Hạn/ngưỡng | Người phụ trách |
|---|---|---|---|
| Thông báo vi phạm DLCN | Luật BVDLCN Đ23 | ≤ 72 giờ | Tom / đơn vị chủ quản dữ liệu |
| Hồ sơ đánh giá tác động chuyển DLCN xuyên biên giới | Luật BVDLCN Đ20; Luật Dữ liệu Đ23; NĐ 165/2025 Đ12 | Trước khi chuyển; gửi ≤ 60 ngày (Luật BVDLCN Đ21) | Tom (nếu đưa DLCN vào runtime nước ngoài) |
| Không mua, bán DLCN | Luật BVDLCN Đ7 k6 | Luôn luôn | Tom |
| Nhật ký hệ thống truy xuất được | NĐ 333/2026 | ≥ 12 tháng (cấu hình 400 ngày) | Tom |
| Không đưa bí mật nhà nước vào công cụ | Luật Bảo vệ bí mật nhà nước 117/2025/QH15 | Luôn luôn | Tom |

> Căn cứ cập nhật đến 28/9/2026; cần soát lại với Công báo trước khi trích dẫn trong hồ sơ chính thức (lưu ý NĐ 363/2026 có hiệu lực 11/11/2026).

## 5. Khuyến nghị ưu tiên

1. **[Bắt buộc]** Gắn nhãn cho mọi dự án; tài liệu khách hàng/bộ ngành ⇒ *Bảo mật* hoặc *Hạn chế* (chỉ runtime cục bộ). Nhãn mặc định hiện là *Nội bộ*.
2. **[Bắt buộc]** Không đưa bí mật nhà nước, dữ liệu công dân thật vào CCoding; dùng dữ liệu mẫu.
3. **[Bắt buộc]** Bật BitLocker cho ổ chứa `data/`, `workspaces/`.
4. **[Bắt buộc]** Khóa API chỉ để trong biến môi trường hoặc `ccoding.local.json` (đã `.gitignore`); không commit.
5. **[Bắt buộc]** Dùng nhà cung cấp/gói có cam kết không huấn luyện trên dữ liệu; ghi nhà cung cấp theo dự án.
6. **[Nên có]** Cài Ollama và đặt `openai-api.local: true` (hoặc một runtime cục bộ khác) để làm việc với dự án *Bảo mật* bằng model thật.
7. **[Nên có]** Đẩy `data/logs` vào ELK nội bộ; chạy `ccoding logs verify` định kỳ.
8. **[Nên có]** Bật `CCODING_TOKEN` nếu mở server ra ngoài `127.0.0.1`.
9. **[Nâng cao]** Presidio/NER tiếng Việt cho PII; WORM + ký số cho log nếu cần giá trị chứng cứ.

## 6. Rủi ro còn lại & câu hỏi mở

- Regex không bắt hết PII (tên người, địa chỉ, số hợp đồng).
- Agent dùng công cụ (Bash) có thể đọc file ngoài workspace nếu tài khoản Windows cho phép ⇒ nên chạy CCoding dưới tài khoản ít quyền và dùng `permissionMode: acceptEdits` (không dùng `bypassPermissions`).
- Câu hỏi mở cho chủ dự án: (1) Repo GitHub để public hay private? (2) Dự án nào sẽ chứa dữ liệu khách hàng thật? (3) Có cần đưa log CCoding vào hệ thống giám sát của công ty không?

---

## Bổ sung 26/10/2026 — Gateway Bifrost + Ollama

**Thay đổi luồng dữ liệu:** CCoding → **Bifrost (127.0.0.1:8080, trên cùng máy)** → provider (Ollama cục bộ hoặc nhà cung cấp ngoài). Thêm một chặng lưu trữ: Bifrost ghi log yêu cầu vào SQLite (`logs.db`) trong thư mục ứng dụng của nó — **mặc định có thể chứa nội dung prompt/đầu ra**, nằm ngoài `data/` và không qua bộ che PII của CCoding.

| Mã | Ảnh hưởng | Khuyến nghị | Ưu tiên |
|---|---|---|---|
| PRE-01 / PRE-06 | Tốt hơn: key ảo riêng từng phòng ban, giới hạn provider/model, ngân sách và rate limit theo key | Bật *Enforce Virtual Keys on Inference* trong Bifrost; mỗi phòng một key, chỉ cho phép provider cần thiết | Nên có |
| PRE-04 / DET-04 | Rủi ro: log nội dung trong `logs.db` của Bifrost | Tắt content logging trong Bifrost (hoặc dùng header `x-bf-disable-content-logging` khi được bật cho phép), giữ thư mục Bifrost trên ổ BitLocker | **Bắt buộc** khi dùng cho dự án Nội bộ trở lên |
| DET-04 / GOV-05 | Tốt hơn: CCoding gửi `x-bf-dim-*` (agent, phòng, task, pha, dự án) và `x-request-id` = mã lượt gọi ⇒ đối chiếu được log gateway với sổ cái token | Xuất OpenTelemetry của Bifrost vào ELK nội bộ | Nên có |
| PRE-01 | Bifrost UI/API nghe cổng 8080 | Chỉ nghe localhost; không mở cổng 8080 ra mạng LAN/Internet | **Bắt buộc** |

Header `x-bf-dim-*` chỉ mang mã định danh (agent, phòng, task, pha, dự án) — **không** chứa nội dung hay dữ liệu cá nhân. Runtime `bifrost` mặc định *không* phải cục bộ ⇒ dự án *Bảo mật*/*Hạn chế* vẫn bị chặn; các dự án này dùng runtime `ollama` (cục bộ, `local: true`).

---

## Đánh giá bảo vệ dữ liệu — CCoding v0.2 (bổ sung 26/10/2026): tệp đính kèm, công cụ workspace cho agent, bản ghi lượt gọi đầy đủ, tự chuyển tài nguyên khi hết token

**Giả định** (chủ dự án vắng mặt khi đánh giá → chọn mức nhạy cảm cao hơn): tệp đính kèm *có thể* chứa dữ liệu cá nhân cơ bản (tên, email, chức danh trong tài liệu dự án) và tài liệu nội bộ của đơn vị; repo dự án (vd. Kepper PMHub) chứa mã nguồn + cấu hình dev, *không* chứa dữ liệu thật (theo quy tắc của repo); số chủ thể < 10.000; không có bí mật nhà nước; chạy trên một máy Windows cá nhân, server chỉ nghe 127.0.0.1.

**Kết luận cổng: ĐẠT CÓ ĐIỀU KIỆN** — với nhãn *Nội bộ* trở xuống. Điều kiện: (1) không tải lên tài liệu có dữ liệu cá nhân thật/dữ liệu khách hàng cho nhiệm vụ nhãn *Nội bộ* (gắn *Bảo mật*/*Hạn chế* ⇒ chỉ runtime cục bộ); (2) tắt tùy chọn cho phép nhà cung cấp dùng dữ liệu để cải thiện mô hình trên tài khoản Claude Max và ChatGPT/Codex đang nối qua 9router; (3) dự án có quyền `exec` chỉ trỏ vào repo dev (DB dev, dữ liệu giả).

### 1. Phân loại

| Tập dữ liệu | Nhãn nội bộ | Phân loại pháp lý | Số chủ thể | Cấp độ HTTT |
|---|---|---|---|---|
| Tệp đính kèm (`data/uploads/` tạm ≤ 24 giờ → `data/runs/<task>/inputs/` + `<workspace>/.ccoding/<task>/inputs/`) | Theo nhãn nhiệm vụ/dự án (mặc định *Nội bộ*) | Dữ liệu khác; DLCN cơ bản nếu tài liệu có thông tin cá nhân | < 10.000 (giả định) | Không đổi (công cụ cá nhân, không phải HTTT phục vụ công dân) |
| Mã nguồn & cấu hình repo dự án được agent đọc/ghi | Theo dự án (Kepper: *Nội bộ*) | Dữ liệu khác | 0 (dữ liệu giả) | N/A |
| File `.env` của repo (chép sang worktree để chạy test/migration) | *Bảo mật* (khóa, chuỗi kết nối DB dev) | Dữ liệu khác — bí mật xác thực | 0 | N/A |
| Bản ghi lượt gọi đầy đủ `data/runs/<task>/calls.jsonl` (phản hồi model, tham số công cụ, lỗi) | Theo nhãn nhiệm vụ | Như tập đầu vào của nhiệm vụ | như trên | N/A |
| Sức khỏe/hạn mức runtime (bộ nhớ), cảnh báo | Nội bộ | Dữ liệu khác | 0 | N/A |

### 2. Dòng dữ liệu

```
Người dùng ──(tải tệp, 127.0.0.1)──► data/uploads/<id> ──(trích chữ cục bộ: DOCX/XLSX/PPTX/PDF/TXT)──► data/runs/<task>/inputs ──► <workspace>/.ccoding/<task>/inputs (git bỏ qua)
                                                                                                     │
Repo dự án ──(git worktree, nhánh ccoding/<task>)──► worktree ◄──(read/write/edit/run_command của agent, sandbox theo quy ước)
                                                                                                     │
Prompt (bối cảnh + hồ sơ + công việc) + kết quả công cụ ──[che bí mật; + che PII nếu Bảo mật/Hạn chế]──► ★ Bifrost (localhost, không lưu nội dung) ──► ★ 9router (localhost) ──► ★★ Anthropic (Claude Max) | ★★ OpenAI (Codex) — tự chuyển khi hết hạn mức
Phản hồi ──► data/runs/<task>/{outputs, calls.jsonl (che + băm chuỗi), events.jsonl} ──► giao diện 127.0.0.1
```
★ chặng có nội dung tài liệu/mã nguồn; ★★ chặng **ra khỏi máy, xuyên biên giới** (nhà cung cấp Mỹ). Nhãn *Bảo mật*/*Hạn chế* bị chặn ở chặng ★★ (chỉ runtime `local: true`).

### 3. Rà năng lực

| Mã | Trạng thái | Khuyến nghị cụ thể | Ưu tiên |
|---|---|---|---|
| GOV-01 | Một phần | Chính sách công cụ (quyền `none/read/write/exec`, danh sách lệnh cấm, worktree) đã là policy-as-code trong `ccoding.config.json` + dự án; ghi ngoại lệ (`denyCommands`, `toolAccess`) vào mô tả dự án | Nên có |
| GOV-02 | Một phần | Tom là chủ sở hữu & người phê duyệt; ghi rõ trong mỗi dự án ai được bật `exec` | Nên có |
| GOV-03 | Một phần | Mỗi tệp đính kèm có siêu dữ liệu (tên, loại, kích thước, sha256, số ký tự) trong log `upload` và `task.attachments` | Nên có |
| GOV-04 | Một phần | Nhãn lấy theo dự án/mặc định; chưa tự phát hiện PII trong tệp tải lên → **Nâng cao:** quét Presidio/NER tiếng Việt lúc tải lên, gợi ý nâng nhãn | Nâng cao |
| GOV-05 | Một phần | Dòng dữ liệu theo lượt gọi truy được qua `callId` (sổ cái ↔ calls.jsonl ↔ header `x-request-id` của Bifrost); thay đổi repo truy qua nhánh git `ccoding/<task>` | Nên có |
| GOV-06 | Chưa có | Hai nhà cung cấp ngoài (Anthropic, OpenAI) nhận dữ liệu; chuỗi model trong runtime `bifrost` trộn hai nhà cung cấp ⇒ dự án cần giữ một nhà cung cấp thì ghim `runtime`/`models` của dự án hoặc tách runtime riêng | **Bắt buộc** (khi dự án có ràng buộc nhà cung cấp) |
| PRE-01 | Một phần | Server chỉ nghe 127.0.0.1, chống DNS rebinding/CSRF; upload cần header `X-Filename` (chặn form chéo trang); bật `CCODING_TOKEN` nếu mở ra LAN | Bắt buộc (đã có) |
| PRE-02 | N/A | Không có tài khoản quản trị riêng của CCoding; nhưng lệnh của agent chạy **dưới tài khoản Windows của người dùng** ⇒ xem Rủi ro còn lại | — |
| PRE-03 | Một phần | Kết nối ra ngoài đi qua 9router (TLS tới nhà cung cấp); dữ liệu tại chỗ chưa mã hóa ⇒ bật BitLocker cho ổ chứa `data/`, `workspaces/` | **Bắt buộc** |
| PRE-04 | Một phần | Che bí mật (và PII khi *Bảo mật/Hạn chế*) cho prompt, **kết quả công cụ**, log, calls.jsonl; chặn đọc `.env*`, khóa, `.git/` qua công cụ; biến môi trường chứa khóa bị loại khỏi lệnh của agent | Bắt buộc (đã có) |
| PRE-05 | Chưa có | Không có DLP; giảm thiểu bằng chặn `curl/iwr … | sh`, `ssh/scp`, in biến môi trường; nâng cao: chặn mạng ra ngoài cho tiến trình lệnh của agent (Windows Firewall theo chương trình/tài khoản) | Nâng cao |
| PRE-06 | Một phần | Quyền công cụ theo pha (họp: không công cụ; lập kế hoạch/tổng hợp: chỉ đọc; review: đọc + chạy test; thực thi: theo quyền dự án); không push, không đổi nhánh, không reset DB | Bắt buộc (đã có) |
| PRE-07 | Một phần | Bifrost bắt buộc key ảo theo phòng; 9router cần API key; cả hai chỉ nghe localhost | Bắt buộc (đã có) |
| DET-01 | Một phần | Mỗi thao tác công cụ ghi `tool.call` (tên, tham số tóm tắt — không ghi nội dung file, kết quả, thời gian) theo agent/nhiệm vụ | Nên có |
| DET-02 | Chưa có | Định kỳ rà `workspaces/` và `.ccoding/` trong các repo; xóa worktree đã merge (`git worktree remove`) | Nên có |
| DET-03 | N/A | Một người dùng, một máy — chưa cần UEBA; cảnh báo hiện có: hết hạn mức, ngân sách 80/100%, lỗi xác thực runtime | — |
| DET-04 | Một phần | Log tập trung trong `data/logs` (hệ thống/agent/phòng/nhiệm vụ), giữ 400 ngày (≥ 12 tháng); nên đẩy về ELK nội bộ | Nên có |
| DET-05 | Một phần | `calls.jsonl`, `events.jsonl`, sổ cái token có chuỗi băm (`ccoding logs verify`); chưa WORM/ký số/TSA | Nâng cao |
| PRI-01 | N/A | CCoding không thu thập dữ liệu từ chủ thể; tài liệu do người dùng chủ động đưa vào | — |
| PRI-02 | Một phần | Tối thiểu hóa: mỗi pha chỉ gửi phần yêu cầu/tài liệu cần thiết (giới hạn ký tự theo pha), phần còn lại agent tự đọc trong workspace khi cần | Nên có |
| PRI-03 | Một phần | Xóa được theo nhiệm vụ (`data/runs/<task>`, `.ccoding/<task>`); tệp tải lên tạm tự xóa sau 24 giờ hoặc ngay khi gắn vào nhiệm vụ | Nên có |
| PRI-04 | Chưa có | Nếu tài liệu có DLCN và gửi tới Anthropic/OpenAI (Mỹ) ⇒ **chuyển DLCN xuyên biên giới**: cần hồ sơ đánh giá tác động trước khi làm; cách đơn giản nhất là **không** đưa DLCN thật vào nhiệm vụ nhãn *Nội bộ* | **Bắt buộc** (khi có DLCN) |
| RES-01 | Một phần | Thay đổi của agent nằm trên nhánh git riêng (khôi phục được bằng git); `data/` cần sao lưu định kỳ (restic/Borg tới ổ ngoài) | Nên có |
| RES-02 | Một phần | `retentionDays: 400`; tệp tải lên tạm 24 giờ; chưa có tác vụ tự xóa `data/runs` quá hạn ⇒ thêm lịch dọn | Nên có |
| RES-03 | Một phần | Cảnh báo + tạm dừng nhiệm vụ khi hết tài nguyên; kịch bản sự cố DLCN (72 giờ) theo quy trình chung của Tom | Nên có |

**AI (Luật Trí tuệ nhân tạo 134/2025 Đ7):** agent được truy cập dữ liệu trong phạm vi workspace dự án và tài liệu đính kèm; dữ liệu đi tới mô hình bên thứ ba ⇒ kiểm soát qua nhãn phân loại (chặn runtime ngoài với *Bảo mật/Hạn chế*), quyền công cụ theo dự án, và cài đặt "không dùng dữ liệu để huấn luyện" của tài khoản nhà cung cấp.

### 4. Nghĩa vụ pháp lý phát sinh

| Nghĩa vụ | Căn cứ | Hạn/ngưỡng | Người phụ trách |
|---|---|---|---|
| Hồ sơ đánh giá tác động chuyển DLCN xuyên biên giới (nếu tài liệu đính kèm/repo có DLCN gửi tới Anthropic/OpenAI) | Luật BVDLCN Đ20, Đ21; Luật Dữ liệu Đ23; NĐ 165/2025 Đ12 | Trước khi chuyển; gửi ≤ 60 ngày | Tom |
| Thông báo vi phạm DLCN (vd. agent làm lộ dữ liệu qua lệnh/kết quả) | Luật BVDLCN Đ23 | ≤ 72 giờ | Tom |
| Nhật ký hệ thống truy xuất được | NĐ 333/2026 | ≥ 12 tháng (đang 400 ngày) | Tom |
| Không dùng dữ liệu thật trên DEV (migration/test do agent chạy) | Quy tắc dự án (Kepper CLAUDE.md) + nguyên tắc PRE-04 | Luôn luôn | Chủ repo |
| Không đưa bí mật nhà nước vào công cụ | Luật Bảo vệ bí mật nhà nước 117/2025/QH15 | Luôn luôn | Tom |

> Căn cứ cập nhật đến 28/9/2026; soát lại với Công báo trước khi trích dẫn chính thức (NĐ 363/2026 hiệu lực 11/11/2026).

### 5. Khuyến nghị ưu tiên

1. **[Bắt buộc]** Tắt tùy chọn cho phép dùng dữ liệu để cải thiện mô hình trên tài khoản Claude (gói Max) và ChatGPT (Codex) đang nối với 9router; kiểm tra lại sau mỗi lần nhà cung cấp đổi điều khoản.
2. **[Bắt buộc]** Tài liệu có dữ liệu cá nhân/khách hàng thật ⇒ gắn dự án *Bảo mật* hoặc *Hạn chế* (chỉ runtime cục bộ) hoặc dùng bản đã che; không tải lên cho nhiệm vụ *Nội bộ*.
3. **[Bắt buộc]** Chỉ bật `toolAccess: exec` cho repo dev, DB dev chứa dữ liệu giả; giữ `isolation: worktree` (nhánh `ccoding/<task>`, người dùng tự review/merge/push).
4. **[Bắt buộc]** BitLocker cho ổ chứa `data/`, `workspaces/` (chứa tài liệu, `.env` chép sang worktree, calls.jsonl).
5. **[Nên có]** Chạy server CCoding dưới tài khoản Windows ít quyền (hoặc Windows Sandbox/VM) — lệnh của agent kế thừa quyền của tài khoản này.
6. **[Nên có]** Dọn worktree sau khi merge; lịch xóa `data/runs` quá `retentionDays`.
7. **[Nên có]** Ghim nhà cung cấp cho dự án có ràng buộc (dự án đặt `runtime` + `models` riêng) vì chuỗi dự phòng mặc định chuyển Claude Max → Codex.
8. **[Nâng cao]** Quét PII tệp tải lên (Presidio + NER tiếng Việt), chặn mạng ra ngoài cho lệnh của agent, WORM/ký số cho calls.jsonl nếu cần giá trị chứng cứ.

### 6. Rủi ro còn lại & câu hỏi mở

- **Sandbox theo quy ước, không phải cô lập hệ điều hành:** công cụ file chặn thoát thư mục/symlink và file bí mật, nhưng `run_command` chạy shell thật dưới tài khoản người dùng — một lệnh không nằm trong danh sách cấm vẫn có thể đọc file ngoài workspace. Giảm thiểu: danh sách lệnh cấm, loại biến môi trường chứa khóa, che bí mật trong kết quả gửi đi, log từng lệnh; chấp nhận rủi ro cho repo dev, không dùng `exec` cho dự án nhạy cảm.
- Regex che PII không bắt hết tên người/địa chỉ trong tài liệu tiếng Việt.
- Trích xuất PDF dạng ảnh/scan không có chữ (chưa OCR) ⇒ agent không đọc được; ghi chú hiện trong tệp đính kèm.
- 9router không báo `cached_tokens` ⇒ không đo được cache; không ảnh hưởng dữ liệu.
- Câu hỏi mở: (1) Tài khoản Claude Max/ChatGPT là cá nhân hay tổ chức (ảnh hưởng điều khoản dữ liệu)? (2) Repo Kepper có dữ liệu thật nào ngoài `.env` cần loại khỏi worktree không? (3) Có cần tách runtime riêng cho Codex để dự án chọn nhà cung cấp không?

### Bổ sung: công cụ tra cứu web cho agent (27/10/2026)

- **Luồng mới:** agent có `WebSearch/WebFetch` gửi truy vấn tới OpenAlex (`api.openalex.org`) và DuckDuckGo, tải trang/PDF công khai qua `fetch_url`. Truy vấn có thể chứa thuật ngữ của nhiệm vụ ⇒ **chỉ bật với nhãn Công khai/Nội bộ** (tự tắt với *Bảo mật/Hạn chế*), tắt toàn cục bằng `tools.web: false`.
- **PRE-07/PRE-05:** `fetch_url` chỉ http/https, phân giải DNS và **chặn địa chỉ nội bộ** (127.0.0.0/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10, ::1, fc00::/7, fe80::/10) ở mọi lần chuyển hướng — agent không gọi được Bifrost/9router/CCoding hay thiết bị LAN.
- **DET-01:** mỗi truy vấn/URL được ghi log `tool.call` (truy vấn, URL — không ghi nội dung trang).
- **Rủi ro còn lại:** nội dung trang web là dữ liệu không tin cậy (có thể chứa chỉ dẫn độc hại nhắm vào model) — agent chỉ dùng làm nguồn tham khảo; công cụ ghi file/chạy lệnh vẫn bị giới hạn bởi quyền dự án và danh sách lệnh cấm.

### Bổ sung: thư mục làm việc cho nhiệm vụ không thuộc dự án, tách nhiệm vụ, KPI (27/10/2026)

Đánh giá theo Data Protection Gate cho các thay đổi sau đợt đánh giá performance:

- **Thư mục làm việc riêng (`workspaces/<task>`, quyền `write`):** sản phẩm của agent nay được lưu thành tệp ngay trên máy (cùng ổ với `data/`). Không có luồng dữ liệu mới ra ngoài — nội dung tệp vốn đã nằm trong prompt/đầu ra gửi tới runtime. Không cấp `run_command` cho loại nhiệm vụ này. Áp dụng cùng khuyến nghị **BitLocker** và lịch xóa theo `retentionDays` như `data/runs` (GOV-03/PRE-03). Nhãn *Bảo mật/Hạn chế*: chỉ runtime cục bộ như trước.
- **Tách nhiệm vụ:** nhiệm vụ mới nhận bản sao yêu cầu gốc, tệp đính kèm và sản phẩm đã có của nhiệm vụ gốc vào `data/runs/<task mới>/inputs/` — tăng số bản sao trên máy (PRE-06 tối thiểu hóa): khi dọn nhiệm vụ gốc cần dọn cả nhiệm vụ đã tách. Nhãn phân loại được kế thừa từ dự án/cấu hình như nhiệm vụ gốc.
- **KPI sub-agent:** tính lại từ log sẵn có (`calls.jsonl`, `task.json`, `transcript.jsonl`), lưu `kpi.json` trong thư mục nhiệm vụ; chỉ chứa số liệu và đoạn trích ≤ 140 ký tự lời nhận xét review (đã che bí mật/PII khi ghi hội thoại). Không gửi ra ngoài.
- **`cacheControl` (tùy chọn):** chỉ thêm trường đánh dấu cache vào yêu cầu gửi gateway, không đổi nội dung gửi đi; nhà cung cấp giữ bản cache ngắn hạn theo điều khoản của họ — với dự án có ràng buộc, không bật cho runtime bên ngoài.
- **Ghi sổ lượt gọi bị mất (`call.lost`):** chỉ số token ước lượng và thời gian, không ghi thêm nội dung (DET-01, phục vụ đối soát chi phí).

### Bổ sung: nhánh xuất phát, tệp chép sang worktree và lệnh cấm cấu hình trên giao diện (27/10/2026)

Thay đổi: dự án có thêm `baseRef` (worktree tách từ vd. `origin/main` thay vì HEAD đang đứng; CCoding `git fetch` nhánh đó trước), và form **Dự án** trên giao diện cho đặt `worktreeCopy` (ghi «không» = không chép tệp nào) cùng `denyCommands` riêng.

- **PRE-06 (tối thiểu hóa) / PRE-03:** với repo mà thư mục gốc chứa `.env` của môi trường thật (vd. clone `workhub` chứa ND57 đang vận hành), đặt `worktreeCopy: []` để **không chép bí mật/kết nối DB thật** sang worktree — agent không có cách chạm DB thật dù được `run_command`. Đây là cấu hình bắt buộc cho dự án `nd57`.
- **PRE-05 (đặc quyền tối thiểu):** `denyCommands` của dự án chặn docker, cổng container/DB đang chạy (4000/4100/4200/5434–5436/55432), `prisma db push`, `migrate dev|deploy|reset`, các script seed/backfill — chỉ cho `prisma validate|format|generate|migrate diff --script` (không cần DB). Regex được kiểm tra hợp lệ khi lưu.
- **`baseRef`:** chỉ nhận tên ref an toàn (không bắt đầu bằng `-`, không `..`) ⇒ không chèn được tham số git. `git fetch` đi tới remote đã cấu hình sẵn của repo (GitHub của chủ dự án), không thêm đích mới.
- **GOV-02 (phân loại):** dự án `nd57` gắn nhãn **Nội bộ** (văn bản triển khai, danh mục nhiệm vụ, tên đơn vị TW Đoàn đã có sẵn trong repo; không đưa dữ liệu báo cáo thật). Nội dung mật của nghị định (gói 4 trong đề xuất) **không** được đưa vào repo hay prompt; nếu sau này có, phải chuyển nhãn *Bảo mật/Hạn chế* và chỉ dùng runtime cục bộ.
- **Rủi ro còn lại:** agent đọc được các tệp .docx/.pdf văn bản TW Đoàn đã commit trong repo ND57 và nội dung đó có thể vào prompt gửi runtime đám mây (9router → Claude/Codex) — chấp nhận ở nhãn Nội bộ; chủ dự án cân nhắc đưa các văn bản gốc ra khỏi git nếu chúng không còn là tài liệu công khai.

### Bổ sung: lệnh kiểm tra do CCoding tự chạy, chặn đọc tệp qua shell, bản đồ repo, chờ model nhanh, cache Claude qua Bifrost (28/10/2026)

Đánh giá theo Data Protection Gate cho đợt cải thiện P1–P6 (xem `docs/PROCESS-REVIEW.md` mục 7). **Kết luận: ĐẠT CÓ ĐIỀU KIỆN** (giữ các điều kiện cũ; điều kiện mới ở mục cuối).

| Thay đổi | Năng lực | Đánh giá |
|---|---|---|
| `setupCommands`/`checkCommands` của dự án (CCoding chạy trong worktree ở baseline/sau thực thi/sau sửa) | PRE-05, PRE-07, DET-01 | Lệnh do chủ dự án khai báo, kiểm tra với danh sách lệnh cấm (toàn cục + dự án) **khi lưu** (API trả 400) và **khi chạy**; cùng sandbox với `run_command` (không biến môi trường chứa khóa, giới hạn thời gian, khóa workspace). Không có luồng dữ liệu mới ra ngoài. Phần cuối đầu ra (≤ 4.000 ký tự) lưu trong `task.json` và vào prompt review **đã che bí mật + PII**; log `checks.run` chỉ ghi lệnh, exit code, dòng tóm tắt. Dự án `nd57`: `worktreeCopy: []` nên `npm test` chạy không có `.env` thật, không chạm DB đang vận hành |
| Chặn đọc/tìm tệp qua shell khi có `read_file`/`search` | PRE-05, PRE-06 | Giảm lượng nội dung tệp đi ra runtime (đọc theo đoạn, không trùng lặp) và đưa mọi lần đọc qua công cụ có kiểm soát đường dẫn (chặn `.env*`, khóa, `.git/`) — trước đây `Get-Content .env` chỉ bị chặn bởi quy tắc riêng |
| Bản đồ repo `.ccoding/<task>/repo-map.md` | PRE-06, GOV-03 | Chỉ chứa cấu trúc (đường dẫn, số dòng, tên route/model/hàm) — không chứa nội dung tệp, giá trị cấu hình hay dữ liệu; nằm trong thư mục `.ccoding` đã `.gitignore`. Đi vào prompt như các bối cảnh khác (cùng chính sách nhãn) |
| Ước tính theo lịch sử (`estimate.historyDays`) | — | Đọc số token trong `task.json` sẵn có, không lưu thêm |
| Chờ model nhanh (`runtime.slowModels`), ghi chú bàn giao trên hạng mục (`subtask.handover`) | RES-01, DET-01 | Bàn giao chỉ gồm tên công cụ + tham số tóm tắt (≤ 160 ký tự/thao tác, ≤ 12.000 ký tự), lưu trong `task.json` cùng chỗ với lịch sử nhiệm vụ; không đổi runtime/nhãn được phép |
| Cache Claude: provider kiểu *anthropic* trong Bifrost → 9router `/v1/messages`, `cacheControl` | PRE-01, GOV-05 (xuyên biên giới) | Cùng đích (9router → gói Claude Max) và cùng nội dung như trước, **không thêm bên nhận mới**; nhà cung cấp giữ bản cache ngắn hạn (5 phút–1 giờ) theo điều khoản của họ. Bifrost vẫn áp key ảo, `disable_content_logging`, `enforce_auth_on_inference`. Đo thử chỉ dùng văn bản tổng hợp (không có dữ liệu thật); Bifrost thử nghiệm chạy tạm ở cổng 8091 rồi tắt |

**Điều kiện mới:**
1. [Bắt buộc] `checkCommands` chỉ chạy test/kiểm tra **không cần DB/dịch vụ thật** (vd. `npm test`, `npm run check` của ND57); lệnh cần DB phải trỏ DB kiểm thử riêng (P7, chưa làm) — không bao giờ dùng `.env` của môi trường vận hành.
2. [Bắt buộc] Không bật `cacheControl`/provider mới cho dự án *Bảo mật/Hạn chế* (vốn chỉ chạy runtime cục bộ).
3. [Khuyến nghị] Sau khi chuyển Claude sang provider kiểu *anthropic*, kiểm tra trên bảng điều khiển Bifrost rằng log vẫn không lưu nội dung (`disable_content_logging`) và key ảo của 3 phòng đều được cấp provider mới.

### Bổ sung: tắt runtime 9router (28/10/2026, trưa)

Theo yêu cầu chủ dự án, CCoding **không dùng** các tài khoản Claude/Codex đặt trong 9router: `runtimes.bifrost.disabled = true`, `runtimes["openai-api"].disabled = true`, `runtime.order = ["ollama"]` (cấu hình máy). Runtime tắt không được thăm dò hay gọi, kể cả khi nhiệm vụ/dự án/agent chỉ định (GOV-01, PRE-05). Phương án thay thế phải qua cổng này trước khi bật: model miễn phí qua API bên ngoài thường **dùng nội dung để cải thiện sản phẩm** (vd. Gemini API gói miễn phí) ⇒ chỉ cho dữ liệu *Công khai*; dữ liệu *Nội bộ* trở lên dùng runtime cục bộ (Ollama) hoặc gói trả phí có cam kết không huấn luyện.

### Bổ sung: Ollama cục bộ và API miễn phí (28/10/2026, chiều)

- **Ollama 0.40.12** cài từ bộ cài chính thức (kiểm SHA256 theo `sha256sum.txt` của bản phát hành và chữ ký Authenticode *Ollama Inc.*), model `qwen3:8b` từ registry chính thức; chạy tại `127.0.0.1:11434` (không mở ra mạng) ⇒ runtime cục bộ duy nhất được phép cho dữ liệu *Bảo mật/Hạn chế* (PRE-01, GOV-05 không phát sinh chuyển xuyên biên giới).
- **API miễn phí** (khóa do chủ dự án tự tạo, lưu biến môi trường người dùng; CCoding chỉ đọc tên biến, không ghi log khóa): `allowedRuntimes` theo nhãn — *Công khai*: mọi runtime; *Nội bộ*: cục bộ, Cerebras, Groq (không huấn luyện/không lưu mặc định theo điều khoản nhà cung cấp — chủ dự án xác nhận lại trong bảng điều khiển); NVIDIA NIM gói miễn phí ghi log ⇒ **chỉ Công khai**. Mọi lượt gọi API ngoài vẫn là chuyển dữ liệu ra nước ngoài (Mỹ) ⇒ vẫn áp nghĩa vụ đánh giá tác động khi có DLCN.
- Thử nghiệm chỉ dùng văn bản tổng hợp.

### Bổ sung: space log trên herdr (28/10/2026, chiều)

`ccoding herdr logs` dựng 4 workspace herdr (Log · Hệ thống / Nhiệm vụ / Phòng ban / Agent) — mỗi pane chỉ chạy `ccoding logs -f …`, `logs ls`, `status --watch`, `usage --watch` để **hiển thị** các tệp log sẵn có trong `data/` (đã che bí mật/PII khi ghi qua `LogStore`). Không tạo kho log mới, không ghi thêm, không đổi chuỗi băm hay thời hạn lưu (DET-01, DET-03); không có luồng dữ liệu ra ngoài máy. Herdr chạy cục bộ trên máy chủ dự án, nên ai vào được phiên herdr cũng xem được các log này — giữ quyền truy cập máy như hiện tại (GOV-04). **Kết luận: ĐẠT**, không thêm điều kiện.

### Bổ sung: tối ưu ngữ cảnh và lịch sử dự án (28/10/2026, tối)

- **Lịch sử dự án (P8)**: pha lập kế hoạch nhận tóm tắt ≤ 3 nhiệm vụ trước **của cùng dự án**, chỉ nhiệm vụ có phân loại dữ liệu **≤** nhiệm vụ hiện tại (không đưa nội dung Bảo mật vào nhiệm vụ Nội bộ chạy runtime ngoài). Nguồn là `FINAL.md`/`task.json` đã có trong `data/runs`, đi ra runtime qua cùng bước che bí mật/PII như mọi prompt (GOV-03, PRE-05). Bản chi tiết `.ccoding/<task>/inputs/PROJECT-HISTORY.md` và `PLAN.md` nằm trong thư mục `.ccoding` đã `.gitignore` của worktree — không vào git.
- **Ngân sách ngữ cảnh / giới hạn khảo sát**: chỉ bớt nội dung gửi đi (ít token, ít lần gửi lại nội dung tệp ra nhà cung cấp) — giảm phơi nhiễm dữ liệu (PRE-06). Không đổi log, sổ cái token hay chuỗi băm.
- Số liệu đo lấy từ `calls.jsonl` chỉ gồm số đếm (tên công cụ, cỡ đầu ra, số lượt), không có nội dung; tệp trung gian nằm ngoài repo.

**Kết luận: ĐẠT**, không thêm điều kiện.

### Bổ sung: phòng giám đốc, giao việc riêng, góp ý, thư viện prompt, hạn mức (28/10/2026, tối)

| Thay đổi | Năng lực | Đánh giá |
|---|---|---|
| Giao việc riêng (`mode: "agent"`) | GOV-03, PRE-05 | Cùng luồng như nhiệm vụ thường: nhãn dữ liệu theo dự án/mặc định, `allowedRuntimes`, worktree, lệnh cấm, review, log + sổ cái token; ít lượt gọi hơn (bỏ định tuyến/lập kế hoạch/họp/tổng hợp) ⇒ ít dữ liệu đi ra ngoài hơn |
| Góp ý cho agent (`data/feedback/<agent>.json`) | PRE-06, DET-01 | Nội dung do chủ dự án viết, lưu cục bộ trong `data/`; ≤ 5 góp ý đang bật đi vào system prompt **qua cùng bước che bí mật/PII** như mọi prompt gửi runtime ngoài. Log `agent.feedback` chỉ ghi agent, có/không đánh giá và độ dài — không ghi nội dung. Không lưu dữ liệu cá nhân của người khác; chủ dự án tự xóa/tắt được |
| Thư viện prompt (`data/prompts.json`) | GOV-03 | Cục bộ, không gửi đi khi chưa dùng; khi chèn vào yêu cầu thì đi theo luồng nhiệm vụ (nhãn của nhiệm vụ). Kiểm tra khi gõ chạy **trong trình duyệt** (không gọi model) và cảnh báo khi yêu cầu có dạng khóa API/private key/mật khẩu |
| Tab Hạn mức (`/api/quota`) | PRE-01 | Chỉ trả **tên** biến môi trường chứa khóa và đã đặt hay chưa — không trả giá trị; header giới hạn của nhà cung cấp chỉ giữ `x-ratelimit-*`/`retry-after` (lọc bỏ mọi header khác), lưu trong bộ nhớ tiến trình, không ghi đĩa |
| Trò vui trong văn phòng | — | Chỉ đổi hình ảnh trên canvas ở trình duyệt; không gọi API ghi, không tác động nhiệm vụ/log |

**Kết luận: ĐẠT**, không thêm điều kiện. Khuyến nghị: không dán dữ liệu thật/bí mật vào góp ý và prompt mẫu (chúng được gửi kèm hồ sơ agent tới runtime theo nhãn của nhiệm vụ).

### Bổ sung: chỉ dẫn bổ sung, giao tiếp nối, màn quản lý kiểu Drive và màn Prompt kiểu chat (28/10/2026, tối)

| Thay đổi | Năng lực | Đánh giá |
|---|---|---|
| Chỉ dẫn bổ sung cho việc đang chạy (`POST /api/tasks/<id>/notes`) | PRE-05, PRE-06, DET-01 | Nội dung do chủ dự án viết; lưu `task.notes` **đã che bí mật** (≤ 30 mục, ≤ 4.000 ký tự) và tin nhắn hội thoại qua `message()` (che bí mật + PII theo cấu hình); log qua `LogStore`. Đưa vào phần đầu prompt các lượt sau **dưới nhãn dữ liệu của chính nhiệm vụ** ⇒ đi tới cùng tập runtime được phép, không mở luồng mới |
| Giao tiếp nối (`followUp`) | GOV-03, PRE-01 | Kế thừa dự án/chế độ/agent; báo cáo trước chép vào `inputs/NHIEM-VU-TRUOC.md` trong thư mục `.ccoding` của nhiệm vụ (không vào git). Nhãn dữ liệu = **mức cao hơn** giữa dự án/mặc định và nhiệm vụ trước (`maxClass`) ⇒ nội dung Bảo mật không thể theo nhánh tiếp nối sang runtime ngoài |
| Màn Drive + màn Prompt (chỉ trình duyệt) | PRE-06 | Hiển thị lại dữ liệu đã có từ API cục bộ (`/api/tasks`, `/file`, `/notes`); xem trước tệp dùng cùng route `/api/tasks/<id>/file` (đã chặn đường dẫn ra ngoài thư mục nhiệm vụ). Trạng thái giao diện (gắn sao, hội thoại đang mở, bộ lọc) chỉ ở `localStorage` của trình duyệt trên máy — không chứa nội dung nhiệm vụ |
| Chặn nhầm bí mật trước khi gửi | PRE-02 | Ô soạn cuộc mới và ô trả lời **từ chối gửi** khi nội dung có dạng khóa API (`sk-`, `gsk_`, `csk-`, `nvapi-`, `AKIA…`), private key hay `mật khẩu: …`; đây là lớp phòng ngừa thêm — server vẫn che bí mật trước khi lưu/gửi |

**Kết luận: ĐẠT**, không thêm điều kiện. Khuyến nghị giữ nguyên: không dán dữ liệu thật/bí mật vào chỉ dẫn hay yêu cầu tiếp nối.
