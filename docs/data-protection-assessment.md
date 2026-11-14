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
| DET-05 | Một phần | Chuỗi băm SHA-256 từng file + `ccoding logs verify`; từ D13 có thêm sổ niêm phong tệp xoay vòng + `ccoding logs verify-seal`. Ký số mới có hướng dẫn. Nếu cần giá trị chứng cứ: WORM/Object Lock, ký số, dấu thời gian TSA, tách quyền quản trị log | Nâng cao |
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
| DET-05 | Một phần | `calls.jsonl`, `events.jsonl`, sổ cái token có chuỗi băm (`ccoding logs verify`); từ D13 có sổ niêm phong tệp xoay vòng (`ccoding logs verify-seal`); chưa WORM thật/ký số/TSA (ký số: xem hướng dẫn ở đầu `src/log-retention.ts`) | Nâng cao |
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

### Bổ sung: giám đốc duyệt/yêu cầu sửa, "việc cần sửa" tự dọn, sơ đồ văn phòng (28/10/2026, tối)

| Thay đổi | Năng lực | Đánh giá |
|---|---|---|
| Duyệt / yêu cầu sửa bằng tay (`POST /api/tasks/<id>/review`) | PRE-05, DET-01 | Ghi chú của giám đốc che bí mật trước khi lưu (`redact`) và trên trình duyệt bị chặn gửi nếu có dạng khóa/mật khẩu; đi vào prompt sửa **dưới nhãn dữ liệu của chính nhiệm vụ** (cùng tập runtime được phép). Log `review.director` chỉ ghi quyết định, hạng mục và độ dài ghi chú |
| Đánh dấu "việc cần sửa" đã sửa (`data/kpi-resolved.json`) | GOV-03 | Chỉ lưu agent, khóa mục, thời điểm, ghi chú ngắn (≤ 300 ký tự) — không chứa nội dung nhiệm vụ; KPI vẫn chấm từ log gốc (không sửa log/chuỗi băm), chỉ lọc phần hiển thị |
| Góp ý tạo từ mục KPI tự xóa khi đã sửa | PRE-06 | Giảm nội dung lặp lại gửi kèm hồ sơ agent tới runtime (tối thiểu hóa); log `agent.feedback.cleared` chỉ ghi agent/khóa mục |
| Sơ đồ văn phòng (phòng Giám đốc ở giữa, pantry time, nhấp đồ vật) | — | Chỉ đổi hình ảnh trên canvas ở trình duyệt; không gọi API ghi, không tác động nhiệm vụ/log |

**Kết luận: ĐẠT**, không thêm điều kiện.

### Bổ sung: quản lý sub-agent — git chỉ đọc, giữ lệnh shell trong worktree, giới hạn khảo sát cho claude-cli (1/11/2026)

| Thay đổi | Năng lực | Đánh giá |
|---|---|---|
| Lệnh shell bị giữ trong thư mục làm việc (hook `claude-guard` của claude-cli + `run_command`) | PRE-01, PRE-05 | **Đóng một khoảng hở**: trước đây Bash của Claude Code đọc được tệp ngoài worktree bằng đường dẫn tuyệt đối (`cat /c/Users/…/<thư mục khác>`) dù `Read` đã bị giới hạn — trên máy có thư mục dữ liệu thật của ND57 (nhãn cao hơn dữ liệu giả trong repo) mà runtime claude-cli gửi tới Anthropic. Nay chặn đường dẫn ổ đĩa, MSYS `/c/…`, UNC, `~`, `$HOME`, `$env:USERPROFILE` và `../` vượt gốc; chỉ cho thư mục tạm và thư mục cài đặt hệ thống/Node. Đây là kiểm tra theo mẫu chuỗi (không phải sandbox hệ điều hành): lệnh tự dựng đường dẫn (biến, nối chuỗi trong script) vẫn có thể lọt — giữ khuyến nghị cũ: dữ liệu thật để ngoài máy chạy agent hoặc dưới tài khoản agent không đọc được |
| `git_read` cho vai trò không có quyền chạy lệnh | PRE-01, DET-01 | Chạy `git` trực tiếp (không qua shell), chỉ lệnh con đọc; chặn `--output`, `--no-index`, `--contents`, `-O`, `--ext-diff`, `--textconv`, `-c`, `--git-dir/--work-tree` và mọi tham số trỏ tới `.env`; môi trường đã bỏ biến chứa khóa. Nội dung lịch sử git thuộc chính repo mà agent vốn đọc được — không mở thêm loại dữ liệu mới. Mỗi lần gọi ghi `tool.call` (tham số tóm tắt) |
| Giới hạn khảo sát trong hook (`data/runs/<task>/guard/*.json`) | GOV-03 | Tệp chỉ chứa 2 số đếm (số lần đọc liên tiếp, đã nhắc hay chưa), xóa khi lượt gọi xong; không chứa nội dung/tham số |
| Roster ghi năng lực công cụ trong prompt lập kế hoạch | — | Chỉ là mô tả quyền (chạy lệnh / đọc-ghi / chỉ đọc) — không chứa đường dẫn hay dữ liệu |

**Kết luận: ĐẠT**, không thêm điều kiện. Khuyến nghị: tiếp tục để thư mục dữ liệu thật (vd. `nd57-du-lieu-that`) ngoài các thư mục `workspaces/`; nhiệm vụ đụng dữ liệu thật phải gắn nhãn Bảo mật/Hạn chế (chỉ runtime cục bộ).

### Bổ sung: UX-1 — diff thay đổi, kết quả lệnh kiểm tra, luồng hoạt động trực tiếp, URL riêng, thông báo trình duyệt (1/11/2026)

| Thay đổi | Năng lực | Đánh giá |
|---|---|---|
| `GET /api/tasks/<id>/diff` (danh sách tệp, từng tệp, theo commit) | PRE-01, PRE-02, PRE-05 | Chỉ đọc git (`--no-optional-locks`, `--literal-pathspecs`, không diff driver/textconv của repo: `--no-ext-diff --no-textconv`), không ghi index/worktree. Phạm vi = commit gốc của nhiệm vụ → nhánh/worktree của chính nhiệm vụ; commit phải thuộc nhánh; tệp phải nằm trong danh sách thay đổi (không đọc được tệp tùy ý của repo); tệp mới chưa track đọc bằng `lstat` (không theo symlink ra ngoài), ≤ 1 MB. **Ẩn nội dung** `.env*`, `.npmrc`, `.netrc`, khóa/chứng chỉ (`*.pem`, `*.key`, `id_rsa`…) — chỉ hiện tên; nội dung còn lại che bí mật (`redact`) trước khi trả về. Không che PII trong mã nguồn (hiển thị cục bộ cho chủ dự án, không ghi log, không gửi runtime) — vì vậy không đưa dữ liệu thật vào repo vẫn là điều kiện như trước. API chỉ phục vụ `127.0.0.1` (hoặc cần `CCODING_TOKEN`) |
| Lọc nhật ký theo loại/hạng mục (`/events?kind=tool.call&subtask=S2`) | DET-01 | Đọc lại log đã che bí mật/PII của chính nhiệm vụ; không thêm dữ liệu mới |
| Kết quả lệnh kiểm tra trước/sau trên giao diện | — | Hiện `task.projectChecks` đã có (tổng kết + đuôi đầu ra đã che khi lưu) |
| Luồng hoạt động trực tiếp | — | Hiện sự kiện `output` SSE đã có (≤ 160 dòng/agent, chỉ trong bộ nhớ trình duyệt, mất khi tải lại trang) |
| URL riêng (`#/task/<id>`, `#/chat/<id>`…) | PRE-06 | URL chỉ chứa mã nhiệm vụ/dự án/agent — không chứa nội dung; token truy cập vẫn đọc từ `#token=` rồi xóa khỏi thanh địa chỉ như trước |
| Thông báo trình duyệt (tắt mặc định, người dùng tự bật) | PRE-06 | Chỉ tiêu đề nhiệm vụ + trạng thái (+ lý do tạm dừng), **không** nội dung báo cáo/lỗi. Nhiệm vụ nhãn **Bảo mật/Hạn chế** — hoặc khi bật "chỉ hiện mã nhiệm vụ" — chỉ hiện mã nhiệm vụ (tránh lộ trên màn khóa/chia sẻ màn hình). Cài đặt lưu `localStorage`; không gửi ra ngoài máy (Notification API của trình duyệt) |

**Kết luận: ĐẠT**, không thêm điều kiện. Khuyến nghị: khi chia sẻ màn hình, bật "chỉ hiện mã nhiệm vụ"; tệp nhạy cảm có tên khác mẫu trên (vd. `config/secrets.json`) vẫn hiện nội dung đã che theo mẫu khóa — đặt tên theo quy ước `.env*` hoặc thêm vào `.gitignore`.

### Bổ sung: benchtest biến thể tối ưu token (`ccoding bench`, 1/11/2026)

| Thay đổi | Năng lực | Đánh giá |
|---|---|---|
| Lượt bench chạy trên dự án bản sao (`bench-nd57`: clone cục bộ repo ND57, ghim commit, không `.env`) | PRE-01, PRE-02 | Repo chỉ chứa mã + dữ liệu giả như dự án gốc (nhãn **Nội bộ**, cùng tập runtime được phép); không chép `.env`, không chạm thư mục dữ liệu thật; cùng `denyCommands` (không docker/DB thật/`db push`/`migrate`) |
| `data/bench/<id>/` (spec, state, báo cáo) | GOV-03, DET-01 | Chỉ số đo (token, thời gian, số thao tác, kết quả kiểm tra) + mã nhiệm vụ + đề bài do người vận hành soạn; không chứa nội dung tệp/kết quả công cụ. Số liệu gốc vẫn ở `data/runs/<task>/calls.jsonl` (đã che bí mật/PII, chuỗi băm) |
| Lệnh nghiệm thu `accept` | PRE-05 | Do người soạn spec viết (tin cậy như `checkCommands` của dự án), chạy trong worktree của lượt bench sau khi nhiệm vụ xong; đầu ra chỉ giữ 600 ký tự cuối trong state |
| Tùy chọn `bashMaxOutput`, `repoMapMode: compact`, `phaseModels` | PRE-06 | Giảm lượng dữ liệu repo gửi lại runtime (tối thiểu hóa); `repo-index.md` chỉ chứa đường dẫn/số dòng/tên ký hiệu như bản đồ cũ, nằm trong `.ccoding` đã `.gitignore`. `phaseModels` chỉ chọn model trong runtime đã được phép theo nhãn |
| Lượt bench không nhận/không góp lịch sử dự án, không xóa góp ý hồ sơ agent | GOV-03 | Tránh rò nội dung giữa lượt đo và nhiệm vụ thật; KPI vẫn chấm từ log gốc |

**Kết luận: ĐẠT**, không thêm điều kiện. Khuyến nghị: chạy bench khi máy rảnh (harness tự chờ), không dùng repo làm việc thật làm dự án bench.

### Bổ sung: UX-2 — duyệt kế hoạch, bình luận trên diff, đẩy nhánh / fast-forward, việc nối trên nhánh trước (1/11/2026)

| Thay đổi | Năng lực | Đánh giá |
|---|---|---|
| Đẩy nhánh / fast-forward vào nhánh xuất phát (`POST /api/tasks/<id>/ship`) | PRE-01, PRE-02, PRE-05, DET-01 | **Luồng dữ liệu mới ra khỏi máy**: mã trên nhánh nhiệm vụ được đẩy lên remote git của chính dự án (GitHub của chủ dự án) — chỉ khi giám đốc bấm và xác nhận, không bao giờ tự động, không `--force`, đẩy đúng sha đã kiểm. Chặn khi: còn tệp chưa commit trong worktree; kế hoạch chưa duyệt; fast-forward không được / không hỏi được remote. **Dòng thêm mới khớp mẫu bí mật** (khóa API, private key, `password=…`, chuỗi kết nối có mật khẩu — cùng bộ mẫu với `redact`) quét trên **toàn bộ phần sẽ đẩy** (cả commit kế thừa của việc nối) → phải xác nhận riêng "là dữ liệu thử" (ghi `allowSecrets` + danh sách `tệp:dòng` vào nhật ký `ship.push`). Lệnh git không hỏi đăng nhập (`GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`) — dùng thông tin đăng nhập git đã lưu sẵn của máy. `.ccoding/` (đề bài, tệp đính kèm, sản phẩm trung gian) có `.gitignore` riêng nên không vào commit. URL remote hiển thị/ghi log đã bỏ `user:token@`. Không kiểm PII trong mã (CCCD, SĐT, email trong dữ liệu mẫu) — vẫn là điều kiện "không đưa dữ liệu thật vào repo". Nhật ký `ship.push` (sha, ref, remote, cảnh báo đã bỏ qua) + tin nhắn hội thoại làm vết kiểm toán |
| Duyệt / sửa kế hoạch (`POST /api/tasks/<id>/plan`) | PRE-05, DET-01 | Tiêu đề/mô tả/chỉ dẫn do giám đốc nhập được che bí mật trước khi lưu; người làm chỉ chọn trong nhân sự của phòng/dự án (không mở thêm quyền công cụ); log `plan.edited`/`plan.approved` chỉ ghi số thay đổi, mã hạng mục, độ dài chỉ dẫn |
| Bình luận theo dòng → yêu cầu sửa (`issues` của `/review`) | PRE-05, PRE-06 | Nháp bình luận chỉ ở `localStorage` trình duyệt trên máy (xóa khi gửi); khi gửi: che bí mật (`redact`) + trình duyệt chặn gửi nếu có dạng khóa/mật khẩu; đi vào prompt sửa **dưới nhãn dữ liệu của chính nhiệm vụ** (cùng tập runtime được phép). Dòng code trích kèm bình luận lấy từ diff đã che bí mật |
| Gợi ý hạng mục theo tệp (`/diff?owners=1`) | — | Đọc lại commit + log `tool.call` đã có của chính nhiệm vụ; không thêm dữ liệu |
| Việc nối tách từ nhánh nhiệm vụ trước (`startFrom`) | GOV-03 | Cùng dự án, cùng repo, nhãn dữ liệu không thấp hơn nhiệm vụ trước (quy tắc `maxClass` có sẵn) — không mở luồng mới |
| Giữ phần cuối đầu ra lệnh | PRE-02 | Phần đuôi đầu ra vẫn che bí mật/PII trước khi lưu `projectChecks` / đưa vào prompt như trước |

**Kết luận: ĐẠT CÓ ĐIỀU KIỆN** — điều kiện: (1) chỉ bấm đẩy với repo mà remote là nơi chủ dự án được phép lưu mã đó (repo ND57/workhub chứa mã nguồn + dữ liệu giả, không chứa dữ liệu thật); (2) không tắt kiểm tra bí mật bằng cách đổi tên khóa thành dạng không khớp mẫu — khóa thật đặt trong `.env` (đã bỏ qua khỏi git). Khuyến nghị: bật branch protection trên GitHub cho nhánh xuất phát (vd. `ND57-da-nv`) nếu muốn mọi thay đổi đi qua PR — khi đó nút ⏩ sẽ bị GitHub từ chối và chỉ dùng ⬆ + ↗ PR.

### Bổ sung: UX-3 — dòng thời gian, hộp "Cần bạn", bảng lệnh Ctrl+K (1/11/2026)

| Thay đổi | Năng lực | Đánh giá |
|---|---|---|
| `GET /api/tasks/<id>/timeline` | PRE-06 | Chỉ đọc **trường thời gian** của `calls.jsonl` (ts, thời lượng, pha, hạng mục, agent, có lỗi hay không) — không trả nội dung phản hồi/prompt; sự kiện nhật ký chỉ lấy loại liên quan thời gian. Nhật ký `checks.run` thêm `setupMs` + thời lượng từng lệnh (không thêm nội dung) |
| Hộp "Cần bạn" (phím tắt duyệt/chạy tiếp/hủy) | PRE-05, DET-01 | Gọi lại đúng các API đã có (`/plan`, `/review`, `/resume`, `/cancel`) với cùng kiểm tra phía server và cùng nhật ký; hành động chờ 4 giây để hoàn tác; hủy luôn hỏi xác nhận. "Hoãn" chỉ lưu `localStorage` trình duyệt (mã nhiệm vụ + thời điểm) |
| Bảng lệnh Ctrl+K, "xem gần đây" | — | Dựng từ dữ liệu đã có trong trình duyệt; mục gần đây chỉ lưu mã nhiệm vụ/dự án (≤ 12) trong `localStorage` |

**Kết luận: ĐẠT**, không thêm điều kiện.

Sửa sau review độc lập (2/11/2026): dòng thời gian đọc `calls.jsonl` / `events.jsonl` **theo dòng, chỉ giữ trường thời gian** và nhớ đệm trong bộ nhớ tiến trình (tối đa 64 file, không ghi ra đĩa) — không thêm dữ liệu nào ra ngoài `data/`; nhật ký `workspace.merge` thêm trường `department` (mã phòng, không phải dữ liệu cá nhân). Hộp "Cần bạn" chặn gửi trùng một hành động trong 15 giây và không còn gọi `/cancel` cho việc đã dừng. **Kết luận giữ nguyên: ĐẠT.**

### Bổ sung: UX-4a — mã nhiệm vụ ngắn, cây nhiệm vụ, cột trái theo nhóm (2/11/2026)

| Thay đổi | Năng lực | Đánh giá |
|---|---|---|
| `Task.seq` + đánh số bù khi khởi động | PRE-06 | Chỉ thêm một số nguyên vào `data/runs/<id>/task.json` (tệp trạng thái, không phải nhật ký chứng cứ — chuỗi băm của nhật ký không đổi); không thêm dữ liệu cá nhân |
| `taskPrefix` trong cấu hình, `GET /api/tasks/<mã ngắn>` | PRE-05 | Tra cứu trong bộ nhớ, cùng quyền truy cập như mã đầy đủ (token server nếu bật) |
| Liên kết mã trong tin nhắn, cây nhiệm vụ, "Agent đang làm" | — | Dựng hoàn toàn trong trình duyệt từ dữ liệu đã có; trình duyệt chỉ lưu thêm kiểu xem (`view2`) và trạng thái mở/đóng cây (mã nhiệm vụ → đúng/sai, ≤ 300) trong `localStorage` |

**Kết luận: ĐẠT**, không thêm điều kiện.

### Bổ sung: UX-4b — văn phòng tối giản theo phòng ban (2/11/2026)

Chỉ thay giao diện ô Văn phòng (bỏ canvas, nhân vật giám đốc, đi lại, phòng họp/pantry/giải trí, mục "vui", bảng điều khiển bàn giám đốc; chân dung pixel tách sang `public/avatar.js`). Dữ liệu hiển thị lấy từ trạng thái agent và hội thoại đã có trong trình duyệt; không thêm API, không lưu thêm gì. **Kết luận: ĐẠT.**

### Bổ sung: UX-4c — CTO nghiệm thu, nhân sự mới (2/11/2026)

| Thay đổi | Năng lực | Đánh giá |
|---|---|---|
| Pha nghiệm thu (`accept`) của CTO | PRE-02, PRE-05, DET-01 | Một lượt gọi model qua `Orchestrator.call()` (đếm token, nhật ký, chính sách nhãn dữ liệu: Bảo mật/Hạn chế chỉ runtime cục bộ, che bí mật/PII khi ra ngoài). Đầu vào là đề bài + báo cáo tổng hợp + kết luận review + kết quả lệnh kiểm tra — cùng loại dữ liệu pha tổng hợp đã gửi, không thêm nguồn mới. CTO chỉ có công cụ đọc. Kết quả lưu `data/runs/<id>/ACCEPTANCE.md` và `task.json`; nhật ký `accept.done`/`accept.error` qua `LogStore` |
| Agent mới: Business Analyst, Technical Writer, Senior SE | PRI-01 | Hồ sơ yêu cầu dùng dữ liệu giả trong ví dụ, không chép DLCN thật vào tài liệu; Senior SE không đưa khóa sandbox thật vào code/test |
| Đề xuất việc tiếp theo | — | Chỉ soạn sẵn vào ô giao việc trong trình duyệt; không tự tạo nhiệm vụ |

**Kết luận: ĐẠT**, không thêm điều kiện. Tắt nghiệm thu nếu muốn giảm số lượt gửi dữ liệu ra runtime bên ngoài với nhiệm vụ nhãn Nội bộ.

### Bổ sung: UX-4d — Việc định kỳ, Sản phẩm, Kỹ năng & Kết nối, Kiểm toán (2/11/2026)

| Thay đổi | Năng lực | Đánh giá |
|---|---|---|
| Việc định kỳ (`data/routines.json`, bộ lập lịch trong server) | GOV-03, PRE-05, DET-01 | Nhiệm vụ mẫu (đề bài) lưu trong `data/` như nhiệm vụ thường; mỗi lần chạy đi qua đúng đường giao việc (nhãn dữ liệu theo dự án, runtime được phép, che bí mật/PII khi gửi ra ngoài, ngân sách). Tạo/sửa/xóa/chạy/bỏ qua đều ghi nhật ký có chuỗi băm (`routine.*`). Không chạy chồng (lần trước chưa xong thì bỏ qua); lỡ lịch lâu thì không chạy bù hàng loạt. `routineId` không đặt được qua API giao việc |
| Sản phẩm (`GET /api/artifacts`) | PRE-06 | Chỉ liệt kê siêu dữ liệu (đường dẫn, kích thước, thời gian) từ thư mục chạy; nội dung mở qua API tệp đã có (chặn path traversal). Tải xuống tạo trong trình duyệt từ nội dung đã mở |
| Kỹ năng & Kết nối (`GET /api/skills`) | GOV-02 | Chỉ đọc hồ sơ agent, chính sách công cụ, trạng thái runtime (không trả khóa API, chỉ trả runtime được xử lý nhãn nào) |
| Kiểm toán (`GET /api/audit`, `/api/audit/verify`) | DET-01, DET-05, RES-03 | Đọc nhật ký hệ thống (đã che bí mật/PII lúc ghi), lọc sự kiện thay đổi trạng thái/an toàn; kiểm chuỗi băm để phát hiện sửa/xóa. Đáp ứng yêu cầu truy xuất nhật ký hệ thống; **khuyến nghị** (D13: đã có sổ niêm phong `seal-ledger.jsonl` + `ccoding logs verify-seal` để phát hiện sửa/mất tệp xoay vòng; vẫn nên): sao lưu `data/logs/` sang nơi chỉ ghi thêm (WORM) để giữ ≥ 12 tháng, vì tệp trên máy vẫn có thể bị xóa cả cụm |

**Kết luận: ĐẠT CÓ ĐIỀU KIỆN** — điều kiện: đặt lịch sao lưu `data/logs/` (WORM/ký số) nếu nhật ký dùng làm chứng cứ.

#### Sửa sau review độc lập UX-4d

| Lỗi | Năng lực | Xử lý |
|---|---|---|
| Việc định kỳ chỉ giữ dự án ở chế độ "dự án"/"agent" → nhiệm vụ phòng ban/tự động/liên phòng trong dự án "Hạn chế" chạy định kỳ thành "Nội bộ", mất danh sách runtime được phép, ngân sách và worktree của dự án (**hạ nhãn dữ liệu**) | GOV-03, PRE-05 | Giữ dự án ở MỌI chế độ; form hiện ô dự án ở mọi chế độ; dự án không còn → báo lỗi khi lưu. Kiểm thử: nhiệm vụ do việc định kỳ tạo mang `projectId` và nhãn "Hạn chế" như giao tay |
| Dự án/phòng ban/agent của mẫu bị xóa → không tắt được việc định kỳ, lỗi mãi mỗi lần tới lịch | RES-01 | Tắt luôn được (không kiểm lại mẫu); bật lại thì phải sửa mẫu; công tắc trên giao diện về đúng trạng thái khi lưu lỗi |
| Lần chạy trước bị gián đoạn (server khởi động lại) chặn mọi lần sau | RES-01 | Không chặn; lần cũ để nguyên (tạm dừng). Tạm dừng chờ giám đốc (hết ngân sách, chờ duyệt…) vẫn chặn, lý do ghi rõ "cần xử lý" |
| Kiểm toán ghi sai người thao tác ("▶ Chạy ngay" thành Hệ thống; nhật ký cũ không có `data.auto` thành Giám đốc) | DET-01 | Ghi `routineManual`/`manual`; nhật ký cũ thiếu dữ liệu hiển thị "Không rõ" thay vì đoán |
| Kiểm toán sót sự kiện: kiểm tra hồi quy (`alert.checks.regression`), lệnh bị hook Claude Code chặn ("CCoding chặn lệnh"), đổi ngân sách (`budget.update`), xóa dự án (trước đây không ghi nhật ký) | DET-01, DET-05 | Bổ sung cả bốn; xóa dự án ghi `project.deleted` (có nhãn dữ liệu của dự án) |
| "Xem thêm cũ hơn" làm rơi sự kiện cùng mốc thời gian | DET-05 | Phân trang theo `seq` của chuỗi băm (duy nhất, tăng dần) |
| Kiểm chuỗi băm đọc cả tệp vào bộ nhớ một lần (chặn server, lỗi với tệp > ~512 MB) | RES-03 | API đọc luồng từng dòng (`verifyChainStream`); CLI giữ bản đọc một lần |
| Đầu vào API: body `null`, agent ngoài phòng ban, `limit` sai, mã việc định kỳ không có, `routines.json` sai dạng làm hỏng mọi lệnh CLI | GOV-03 | Báo lỗi 400/404 bằng tiếng Việt; tệp sai dạng bị bỏ qua |

Kết luận giữ nguyên: **ĐẠT CÓ ĐIỀU KIỆN** (điều kiện sao lưu WORM `data/logs/`). Lỗi hạ nhãn dữ liệu đã đóng trước khi phát hành — chưa từng chạy trên máy thật.

### Bổ sung: cập nhật tài liệu sau UX-4, CLI dùng mã ngắn (2/11/2026)

| Thay đổi | Năng lực | Đánh giá |
|---|---|---|
| CLI `status`/`show`/`task`/`resume`/`split` hiện và nhận mã `CC-n`; `show` tìm nhiệm vụ theo số thứ tự trong `data/runs/*/task.json` | GOV-03 | Chỉ đọc dữ liệu đã có trong `data/` trên máy; không ghi, không gửi ra ngoài. `show` hiện thêm dòng kết luận nghiệm thu (đã có trong `task.json`) |
| `ccoding.config.json` ghi rõ `taskPrefix`, `defaults.acceptance`, `planApprovalMinutes`, giới hạn pha `accept` | GOV-02 | Giá trị trùng mặc định trong mã — không đổi hành vi |
| Ảnh `docs/screenshot.png` mới | PRE-04 | Chụp từ server thử với runtime `mock` và dữ liệu mẫu (dự án "Dự án mẫu", nhiệm vụ mẫu) — **không** chụp từ máy thật, không có tên dự án/khách hàng/dữ liệu thật |
| README, `docs/ARCHITECTURE.md`, `docs/UI.md`, `docs/TOOLS.md`, `docs/RUNTIMES.md`, `docs/HERDR.md` | — | Tài liệu, không đụng dữ liệu |

**Kết luận: ĐẠT.**

### Bổ sung: làn đơn, cổng chất lượng, cổng phủ kế hoạch (B-01, B-02, B-10, 2/11/2026)

Ba thay đổi này chỉ thêm logic điều phối và kiểm tra. Chúng không đổi nhãn dữ liệu, hook, `LogStore` hay đường ghi. Dữ liệu xử lý là đề bài và mã nguồn nội bộ, không có PII mới. Dữ liệu kiểm thử là fixture và runtime `mock`.

| Thay đổi | Năng lực | Đánh giá |
|---|---|---|
| Làn đơn (`lane.pick`, `lane.escalate`), cổng chất lượng (`gate.classify`, `gate.fix`, `gate.template`, `gate.review`), cổng phủ kế hoạch (`plan.gate`, gồm quy tắc `brief-item`), vòng bổ sung sau nghiệm thu (`accept.followup`) | GOV-03, DET | Mọi lượt LLM mới (agent làn đơn, vòng sửa, sửa định dạng, sửa kế hoạch) đi qua `Orchestrator.call()`, nên vẫn được ghi log, đếm token và áp chính sách dữ liệu theo nhãn. Sự kiện mới chỉ ghi qua `LogStore` trong `data/`, đã che PII/bí mật và có chuỗi băm. Tín hiệu chọn làn (`signals`) chỉ gồm số và cờ, không chứa nội dung đề |
| `LANE-HANDOVER.md` khi nâng cấp làn | GOV-03 | Ghi trong thư mục chạy của nhiệm vụ, cùng nhãn với nhiệm vụ; chứa diff và ghi chú của agent |
| `scripts/replay-plan-gate.mjs` | PRE-04 | Công cụ phát lại chỉ đọc `bench/vs-claude/results` và `agents/**`, in ra stdout, không ghi tệp, không gọi LLM, không gửi ra ngoài |
| Cấu hình `lanes.single`, `gate.maxFixRounds` | GOV-02 | Chỉ là ngưỡng số; mặc định nằm trong `src/config.ts` |

**Kết luận: ĐẠT.** Không phát sinh khuyến nghị mới.

### Bổ sung: bộ phân tích lệnh của hook và chẩn đoán chặn (B-04, B-06, 2/11/2026)

**Loại cổng:** cổng thiết kế, kiểm tra điểm (không phải đánh giá đầy đủ). **Nhãn dữ liệu:** Nội bộ. Dữ liệu xử lý là câu lệnh shell của agent trong workspace nội bộ và nhật ký chặn. Không có PII hay dữ liệu khách hàng.

**B-04 (nới lệnh chỉ đọc):** chỉ nới quyền ĐỌC trong workspace. Quyền ghi và chạy mã không đổi: `> tệp`, `tee`, `sed -i`, heredoc, `$(…)`, backtick, `for`/`while`, `python`/`node` và `awk` có `system`/`getline`/`>`/`|` đều vẫn bị chặn. Hook đang chạy theo `dist/` đã cài, nên quy tắc mới chỉ có hiệu lực sau khi build và cài lại.

| Rủi ro | Kiểm soát | Cách kiểm |
|---|---|---|
| Lách nháy: giấu toán tử hoặc chuyển hướng trong nháy, hoặc nháy không đóng, để lệnh ghi lọt qua | Tách lệnh có xét nháy. `$(…)` và backtick bị chặn kể cả trong nháy kép. Nháy không đóng, `&` nền, `<` và `>` ra tệp bị chặn | `test/shell-policy-adversarial.test.ts` (bộ test ác ý) |
| Đọc `.env` (bí mật) qua lệnh chỉ đọc, kể cả dạng nối nháy `.e""nv` | Mọi tham số của lệnh chỉ đọc đi qua kiểm `.env`. Công cụ tệp cũng chặn `.env` | Cùng bộ test ác ý và `test/claude-guard.test.ts` |
| Đọc ngoài root workspace | `outsidePathReason` vẫn áp sau khi qua bộ lọc chỉ đọc. Hook không nhớ `cd` giữa các lượt nên không nới lệnh `cd` ra ngoài | `test/claude-guard.test.ts`, `scripts/replay-guard-deny.mjs` |
| `awk`, `sed` bị lạm dụng để ghi hoặc chạy mã | Danh sách từ khoá và cờ bị cấm (`system`, `getline`, `>`, `\|`, `close`, `ENVIRON`, `fflush`, `-f`, `-i`, `sed -i`) | Bộ test ác ý |

**B-06 (chẩn đoán chặn):** thông báo chặn có dạng `CCoding chặn câu N: \`lệnh\` <quy tắc> — <gợi ý>`, tối đa 300 ký tự, chỉ nêu tên lệnh hoặc toán tử. Mỗi lần chặn ghi một sự kiện `guard.block` qua `LogStore`:

| Nội dung | Giá trị |
|---|---|
| Trường `data` | `tool`, `clause` (từ 1), `rule` (`not-read-only`, `redirect`, `subst`, `heredoc`, `loop`, `interpreter`, `env-file`, `outside-root`, và `deny-list`, `git-branch`, `read-limit`), `cmd` (tên lệnh hoặc toán tử) |
| Không ghi | Lệnh thô, tham số, đường dẫn, nội dung tệp. Tên lệnh dài hơn 24 ký tự, có ký tự lạ hoặc giống khoá/token thì thay bằng `?` |
| Che bí mật | Qua `LogStore` (che bí mật và PII, chuỗi băm), thêm lớp lọc `safeCmdName` trước đó |
| Xác định data dir | `dataDir` trong cấu hình hook, rồi biến `CCODING_DATA_DIR`, rồi suy từ đường dẫn bộ đếm `<data>/runs/<task>/guard/<lượt>.json`. Không xác định được thì bỏ qua việc ghi |
| Nơi ghi | `<data>/logs/system.jsonl` và `<data>/runs/<task>/events.jsonl`. Không ghi ngoài `data/` |
| Lỗi ghi | Bị nuốt, không đổi quyết định chặn hay cho qua (có test) |

**Rà năng lực liên quan** (các mã còn lại: N/A, không đổi luồng dữ liệu):

| Mã | Trạng thái | Khuyến nghị |
|---|---|---|
| GOV-03 | Đạt | Sự kiện mới nằm trong `data/`, cùng nhãn Nội bộ |
| PRE-04 | Đạt | Không chép lệnh thô. Có test lệnh chứa khoá giả: thông báo và log không chứa chuỗi đó |
| DET-04 | Đạt | Che bí mật và PII qua `LogStore` trước khi ghi |
| DET-05 | Đạt | Chuỗi băm theo từng tệp log. Log làm chứng cứ cần WORM và ký số, ngoài phạm vi thay đổi này (từ D13 đã có sổ niêm phong bằng băm, xem mục D13 cuối tài liệu) |
| RES | Cần theo dõi | Thời gian lưu: nhật ký hệ thống truy xuất `guard.block` giữ ≥ 12 tháng theo khung. Chưa có tác vụ xoá tự động, cần giữ cho đến khi có chính sách lưu trữ |

**Rủi ro còn lại:** (1) hook tiến trình riêng và `LogStore` mới mở mỗi lần chặn, mỗi tiến trình có chuỗi băm riêng, nên có thể rẽ nhánh chuỗi khi nhiều hook chạy song song (log chẩn đoán, không phải chứng cứ); (2) hook dùng `dist/` cũ đến khi build và cài lại.

**Kết luận: ĐẠT CÓ ĐIỀU KIỆN.** Điều kiện: build và cài lại `dist/` trước khi đo, và đặt chính sách lưu nhật ký ≥ 12 tháng cho `data/logs`.

### Bổ sung: làm gọn làn đơn (B-11, 3/11/2026)

**Loại cổng:** cổng thiết kế, bản gọn. **Nhãn dữ liệu:** Nội bộ. Thay đổi chỉ bớt nội dung gửi runtime ở làn đơn và thêm số đo. Không có nguồn dữ liệu hay bên nhận mới.

| Thay đổi | Năng lực | Đánh giá |
|---|---|---|
| `accept = skip` (công tắc `lanes.single.slim`, mặc định `full`) | PRE-05, GOV-03 | Chỉ áp khi đủ ba điều kiện: cổng B-02 xanh, diff không chạm `sensitivePaths` (backlog 4.3), và nhãn cao hơn giữa dự án và nhiệm vụ nhỏ hơn Bảo mật. Thiếu điều kiện nào thì lùi về `brief`. `confidential` và `restricted` không bao giờ được `skip`. Nâng làn thì nghiệm thu quay về `full` |
| `accept = brief` | PRE-06 | Giảm dữ liệu gửi đi: prompt không có báo cáo các phòng, diff cắt 3.000 ký tự, trần `maxTokens` 950. Vẫn đi qua `Orchestrator.call()` nên giữ chính sách nhãn và che bí mật/PII |
| Sự kiện `accept.skipped`, `accept.brief` | DET-01, DET-04 | Ghi qua `LogStore` (che bí mật/PII, chuỗi băm). Payload chỉ có cờ, nhãn và tên lệnh kiểm tra, không có diff hay nội dung prompt |
| `promptDiet` (bật mặc định) | PRE-06 | Bỏ khối kế hoạch chung, mục đầu vào rỗng, câu về đồng nghiệp song song. Không lược quy tắc dữ liệu/bảo mật, nhãn phân loại, chỉ dẫn `CLAUDE.md`/`AGENTS.md`, quy tắc công cụ và quy tắc không đổi nhánh/không push. Test kiểm từng chuỗi này còn trong prompt |
| `compactTemplate` | — | Chỉ đổi độ dài báo cáo bằng chỉ dẫn trong prompt; không đổi `src/kpi.ts` hay cổng mẫu |
| Trường nghiên cứu mới trong `runs.jsonl` | PRE-04, GOV-03 | Chỉ là số đo và cờ: thời gian và token theo pha, `promptChars`, `lane`, `gate`, `fixRounds`, `acceptMode`. Không chứa nội dung prompt, đường dẫn hay PII. Test khẳng định nội dung lượt gọi không lọt vào kết quả. Tệp `runs.jsonl` nghiên cứu cũ không bị ghi đè |

**Kết luận: ĐẠT CÓ ĐIỀU KIỆN.** Điều kiện: (1) `accept` khác `full` và `compactTemplate = true` chỉ bật sau khi giám đốc duyệt; (2) dự án nhãn Bảo mật/Hạn chế không dựa vào `skip`, chỉ dùng `full` hoặc `brief`. **Rủi ro còn lại:** `gate = green` trong `runs.jsonl` phản ánh lệnh kiểm tra ở lần chạy gần nhất, không phải cờ cuối của cổng B-02; `skip` chặn cả khi chỉ có lệnh đỏ không liên quan đề bài (đọc chặt, an toàn hơn nhưng giữ lại nhiều lượt CTO).

### Bổ sung: sửa KPI v2 và bộ probe sau review (nhánh `feat/kpi-v2`, 3/11/2026)

| Thay đổi định dạng | Năng lực | Đánh giá |
|---|---|---|
| `calls.jsonl`: trường `toolsTracked: false` khi runtime không ghi thao tác công cụ (Codex/Kimi CLI) | DET-01 | Cờ boolean, không chứa dữ liệu nghiệp vụ. Bản ghi vẫn đi qua `LogStore.record` (che bí mật/PII, chuỗi băm). Nhãn theo nhiệm vụ (không đổi) |
| `calls.jsonl`: `maxTokens` = trần đầu ra thực (pha, không có thì runtime); `maxPrompt` = số token prompt lớn nhất trong các vòng công cụ | DET-01 | Chỉ số đếm token, không chứa nội dung prompt. Đi qua `LogStore.record` |
| `task.json`: `projectChecks.depts[<phòng>] = { before, latest, at }` — kết quả lệnh kiểm tra theo phòng | GOV-03, DET-01 | Chỉ lệnh, mã thoát, thời gian, dòng tổng kết (đã có sẵn trong `baseline`/`latest`); **bỏ `tail`** (đầu ra lệnh) để không nhân bản đầu ra có thể chứa dữ liệu. Nằm trong `data/runs/<task>/`, nhãn theo nhiệm vụ |
| `task.json`: `runs[].review.reviewerApproved` — kết luận gốc của reviewer trước khi CCoding ép "không duyệt" | DET-01 | Boolean; giúp truy vết quyết định (ai duyệt gì, CCoding can thiệp ra sao) — phục vụ kiểm toán chất lượng |

| Bộ probe `bench/agent-probes`: kết quả chuyển từ `bench/agent-probes/results/` (ngoài `data/`, câu trả lời thô) sang `data/probes/<thời điểm>/probes.jsonl` | PRE-02, PRE-04, DET-01 | Câu trả lời của model, chi tiết chấm, token, độ trễ. Dữ liệu tổng hợp (đề cố định, PII là số giả) — nhãn **Nội bộ**. Ghi qua `LogStore.record`: **che bí mật và PII luôn bật** (không phụ thuộc cấu hình), chuỗi băm từng dòng; `--out` ngoài `data/` bị từ chối. Thư mục `results/` cũ (nếu còn trên máy) nên xóa |
| Probe chạy mã do model sinh (`code-mask-pii`) | PRE-03, RES-01 | Trước: tiến trình con thừa hưởng toàn bộ env (lộ `PROBE_API_KEY`), ghi tệp tự do, tự in điểm. Sau: thư mục tạm, env tối thiểu, mô hình quyền của Node (chỉ đọc thư mục tạm, không ghi tệp/tạo tiến trình), timeout; điểm do tiến trình cha so. **Rủi ro còn lại:** chưa chặn mạng (cần sandbox hệ điều hành) |
| Probe gọi model trực tiếp (không qua `Orchestrator.call()`) | GOV-02 | Ngoại lệ có chủ đích, ghi trong README của probe (lý do: không có nhiệm vụ để gắn; cần `num_ctx` qua API gốc Ollama). Mặc định gọi máy cục bộ; không gửi dữ liệu thật |

Không thêm luồng dữ liệu ra ngoài, không đổi thời hạn lưu. Dữ liệu probe chuyển vào `data/` (trước đây nằm ngoài).

**Kết luận: ĐẠT CÓ ĐIỀU KIỆN** — điều kiện: không trỏ `--base-url` của probe tới nhà cung cấp bên ngoài với hồ sơ agent/đề có nội dung không được phép gửi ra ngoài; chạy probe trên máy không có dịch vụ nội bộ nhạy cảm mở không xác thực (sandbox chưa chặn mạng).

## Bổ sung 03/11/2026 — UI-7: ngân sách theo dự án/agent, sửa thuộc tính nhiệm vụ, agent ngoài (process/http)

| Hạng mục | Dữ liệu | Nhãn nội bộ | Đánh giá & biện pháp |
|---|---|---|---|
| `data/budgets.json` | Mã dự án/agent, số token, ngưỡng — không có PII | Nội bộ | Mức dùng tính lại từ sổ cái token, không ghi thêm dữ liệu. Mọi lần tạo/sửa/xóa ghi nhật ký hệ thống (`budget.policy.*`, có chuỗi băm). |
| `POST /api/tasks/:id/props` | Tiêu đề, ưu tiên nhiệm vụ | Theo nhãn của nhiệm vụ | Thay đổi ghi `task.updated` (giá trị cũ → mới) qua LogStore, nên PII trong tiêu đề vẫn được che trong log. |
| Runtime `process` | Toàn bộ prompt của lượt gọi đi vào tiến trình con | Theo nhãn của nhiệm vụ | Tiến trình chỉ nhận PATH/HOME/LANG + `CCODING_*`, không thừa hưởng khóa API của máy chủ. Mặc định coi là cục bộ; đặt `"local": false` nếu script gửi dữ liệu ra ngoài (GOV: chủ dự án chịu trách nhiệm khai báo đúng). |
| Runtime `http` | Prompt gửi tới địa chỉ cấu hình | Theo nhãn của nhiệm vụ | Chỉ coi là cục bộ khi host là loopback; máy chủ ở xa luôn bị loại với dữ liệu Bảo mật/Hạn chế dù cấu hình ghi `"local": true` (PRE). Lượt gọi vẫn đi qua `Orchestrator.call()` nên có log, đếm token, che PII như runtime khác (DET). |

Khuyến nghị: trước khi cắm agent ngoài cho dự án Bảo mật/Hạn chế, rà mã script/dịch vụ đó như một nhà xử lý dữ liệu (nơi lưu, thời gian giữ, có gửi ra ngoài không); với dịch vụ http ở xa cần hồ sơ đánh giá tác động nếu có DLCN hoặc chuyển xuyên biên giới.

**Bổ sung UI-8 (03/11/2026):** đổi dự án của nhiệm vụ chưa bắt đầu từ bảng Thuộc tính không bao giờ hạ nhãn dữ liệu. Nhãn mới là mức cao hơn giữa nhãn của dự án và nhãn đang có, nên rời một dự án Hạn chế thì nhiệm vụ vẫn mang nhãn Hạn chế. Đổi người phụ trách vẫn áp danh sách nhân sự của dự án. Mọi thay đổi ghi `task.updated` (cũ → mới, kể cả đổi nhãn). Backlog chỉ là trạng thái chờ, không tạo thêm dữ liệu.

## Bổ sung 03/11/2026 — D9/S2: biên đọc của hook claude-guard (B-08) và công tắc stablePrefix (B-14b)

Kiểm tra điểm (cổng thiết kế), nhãn dữ liệu: **Nội bộ**. Không thêm dữ liệu mới vào log; sự kiện `guard.block` vẫn chỉ ghi { tool, clause, rule, cmd } qua `LogStore`.

| Hạng mục | Thay đổi | Rủi ro | Kiểm soát | Công tắc / mặc định |
|---|---|---|---|---|
| Biên đọc ngoài worktree (G3) | Hook giải đường dẫn theo `cwd` của sự kiện rồi so `realpath` + `path.relative` với worktree đã `realpath` | `cwd` do sự kiện cung cấp có thể bị giả; symlink/junction trỏ ra ngoài | Kết quả giải ra ngoài worktree (bắt đầu bằng `..` hoặc tuyệt đối) → chặn; cwd giả ngoài worktree làm tệp tương đối giải ra ngoài nên bị chặn; thiếu cwd → giải theo root như cũ. Test đối kháng: `../`, cwd giả, symlink/junction (junction tạo được trên Windows, không skip) | `guard.useEventCwd`, BẬT |
| tool-results (G4) | Read được tệp `<cấu hình Claude>/projects/<slug>/<session_id>/tool-results/*` khi `session_id` của sự kiện khớp | Đọc nhầm kết quả công cụ của phiên khác (chứa mã/dữ liệu nhiệm vụ khác); mở rộng sang phần còn lại của `.claude/` | Chỉ công cụ Read; `session_id` phải đúng định dạng và khớp từng đoạn đường dẫn; đường dẫn chứa `..` bị chuẩn hóa rồi so lại; liên kết trong cây này bị loại bằng `realpath`; không mở `settings.json` hay thư mục khác. Nội dung tool-results là đầu ra công cụ của chính phiên, đã qua chính sách của hook khi sinh ra | `guard.allowOwnToolResults`, BẬT |
| stablePrefix | Một bộ `--tools` cố định (có Write/Edit/MultiEdit/Bash) cho mọi pha; quyền theo pha do hook quyết định | **Bề mặt cấp quyền rộng hơn ở cấp CLI**: nếu hook lỗi/không chạy, pha chỉ đọc có công cụ ghi/Bash. Pha review không còn chạy lệnh (CCoding tự chạy lệnh kiểm tra rồi đưa kết quả). Review hạng mục chạy ở thư mục gốc nhiệm vụ nên thấy cây nhiệm vụ, không thấy worktree con chưa gộp | Hook deny-by-default: pha ngoài `execute`/`revise` (kể cả thiếu hoặc sai `phase`) chặn Write, Edit, MultiEdit, NotebookEdit và TOÀN BỘ Bash — không lọc Bash bằng regex (test `; rm`, `$(...)`, backtick, `> tệp`, `tee`, `sed -i`, `node -e`); công cụ ngoài `callTools` của lượt (quyền dự án/vai trò, tra cứu web theo nhãn) cũng bị chặn; thiếu `callTools` → chỉ công cụ đọc. Hook thiếu cấu hình vẫn thoát mã 2 (chặn) | `runtimes.claude-cli.stablePrefix`, **TẮT**; chỉ bật sau khi benchtest xác nhận lợi ích cache và chủ dự án chấp nhận rủi ro trên |

Khuyến nghị: giữ `stablePrefix` tắt với dự án Bảo mật/Hạn chế; bật cho Nội bộ/Công khai khi đã có số đo cache (B-14a). Điều kiện kiểm: `npx tsx --test test/claude-guard-paths.test.ts test/claude-stable-prefix.test.ts`.

## Bổ sung 03/11/2026 — B-18 Sandbox cho hook

**Loại cổng:** cổng thiết kế đầy đủ (5 lớp, 25 năng lực) vì thay đổi chạm biên bảo mật. **Nhãn dữ liệu:** **Nội bộ**. Đặc tả và bảng quyết định nằm ở `docs/research/sandbox-spec.md` (không chép lại ở đây). Trạng thái: **lõi đã triển khai ở commit `f8ec686` (xem "Cập nhật theo mã S1" bên dưới), chưa kiểm trên máy thật**; khóa `runtimes.claude-cli.osSandbox.enabled` mặc định **false** cho tới khi giám đốc duyệt.

**Phạm vi dữ liệu:** lệnh shell của agent trong worktree; tệp `.env` (Hạn chế, chỉ là mục tiêu cần che chắn); nhật ký sự kiện `sandbox.deny`/`sandbox.unavailable` (chỉ `tool`, `rule`, `backend`; không lệnh thô, không đường dẫn). Không có PII, không dữ liệu khách hàng, không bên nhận mới. Ngoại lệ mạng duy nhất: chính `claude-cli` tới `api.anthropic.com`, `claude.ai`, `platform.claude.com` (đã có trong luồng hiện tại, không thêm luồng). Không dùng 9router hay khóa API ngoài.

**Năm lớp:** (1) Quản trị: khóa bật/tắt do giám đốc duyệt, ghi lý do ở `ccoding.local.json`. (2) Phòng ngừa: hook (lớp 1) giữ nguyên + sandbox hệ điều hành (lớp 2). (3) Phát hiện: `sandbox.deny` qua `LogStore`. (4) Quyền riêng tư: tối thiểu hóa, không ghi lệnh thô. (5) Khôi phục: tắt khóa là về trạng thái cũ.

| Mã | Trạng thái | Đánh giá / khuyến nghị cho B-18 | Mức |
|---|---|---|---|
| GOV-01 | Một phần | Chính sách dạng code: thêm `osSandbox` vào `ccoding.config.json`; mặc định tắt; bật phải có lý do ghi ở `ccoding.local.json` | Nên có |
| GOV-02 | Một phần | Người duyệt bật/tắt và duyệt ngưỡng đo: Tom. Ghi người duyệt và ngày vào đặc tả khi duyệt | Nên có |
| GOV-03 | Một phần | Loại dữ liệu mới: sự kiện `sandbox.*` (Nội bộ). Cập nhật bảng phân loại khi triển khai | Nên có |
| GOV-04 | Đạt (phạm vi này) | Không có PII mới. `.env` thuộc nhãn Hạn chế; test đối kháng chỉ dùng `.env` giả chứa chuỗi canary, không bí mật thật | Nên có |
| GOV-05 | Một phần | Truy vết: `sandbox.deny` có `taskId`, đối chiếu được với `guard.block` của lớp 1 | Nên có |
| GOV-06 | Một phần | Không thêm nhà cung cấp. Ngoại lệ mạng chỉ tới Anthropic như hiện nay; mức B không được mở domain nào khác | **Bắt buộc** (giữ nguyên) |
| PRE-01 | Một phần | Không đổi bề mặt mạng của máy chủ CCoding (vẫn loopback). Cài WSL2/AppContainer cần quyền quản trị một lần: ghi lại ai cài, cấp quyền tối thiểu | Bắt buộc (giữ nguyên) |
| PRE-02 | Một phần | Lệnh agent hiện chạy dưới tài khoản Windows của người dùng; sandbox thu hẹp quyền này. Không dùng tài khoản quản trị cho agent. `srt` Windows tạo tài khoản `srt-sandbox` (S-03) — nếu dùng sau này phải đánh giá lại | Nên có |
| PRE-03 | Một phần | Bật BitLocker cho ổ chứa `data/`, `workspaces/` (như cũ). Nếu worktree chuyển vào đĩa ảo WSL (ext4.vhdx) thì cũng phải được mã hóa: **cần kiểm** | **Bắt buộc** |
| PRE-04 | Một phần | Mục tiêu chính: hệ điều hành chặn đọc `.env` kể cả khi regex lớp 1 bị lách (nhóm E1). `sandbox.deny` che bí mật/PII qua `LogStore` | Bắt buộc |
| PRE-05 | Một phần | Mục tiêu chính: chặn mạng ra ngoài cho lệnh agent (trước đây ghi "Nâng cao"). Mức A: allowlist rỗng + `network.strictAllowlist: true` bắt buộc (thiếu thì ở `bypassPermissions` host ngoài allowlist vẫn qua — S-01; cần Claude Code ≥ v2.1.219); mức B: đúng 3 domain + `strictAllowlist`. Rủi ro dư tồn: domain fronting | Nên có |
| PRE-06 | Một phần | Kiểm soát mục đích: ghi chỉ trong worktree + thư mục tạm; `failIfUnavailable: true`; từ chối chạy khi nền tảng không hỗ trợ | Bắt buộc |
| PRE-07 | N/A | Không thêm API cục bộ | — |
| DET-01 | Một phần | Thêm sự kiện `sandbox.deny`, `sandbox.unavailable`; trường `data` chỉ `{ tool, rule, backend }` | Nên có |
| DET-02 | Chưa có | Rà `workspaces/` tìm tệp rò rỉ (như cũ). Thêm: sau thử nghiệm đối kháng xóa mọi tệp canary/`leak.txt` | Nâng cao |
| DET-03 | Một phần | Nhiều `sandbox.deny` trong một nhiệm vụ là tín hiệu prompt-injection. Đề xuất cảnh báo khi ≥ 3 sự kiện/nhiệm vụ (ngưỡng giả định, giám đốc chốt) | Nâng cao |
| DET-04 | Một phần | `sandbox.deny` ghi qua `LogStore` (`redactSecrets`, `redactPii`, `hashChain`) vào `<data>/logs/system.jsonl` và nhật ký nhiệm vụ. **Giữ ≥ 12 tháng** (`retentionDays: 400`); nhật ký xử lý dữ liệu cốt lõi/quan trọng ≥ 6 tháng | **Bắt buộc** — **Cập nhật D10b/S2:** `logSandboxDeny` và `logSandboxUnavailable` không còn bỏ qua im lặng. Khi xác định được dataDir vẫn ghi `system.jsonl` qua LogStore (che bí mật/PII + chuỗi băm). Chỉ khi KHÔNG xác định được dataDir hoặc `LogStore.write` ném lỗi mới ghi một dòng stderr cố định `{tool, rule, backend}` kèm loại lỗi, không chứa lệnh thô, đường dẫn hay message gốc. stderr là cảnh báo vận hành, không phải nơi lưu log; quyết định chặn và fail-closed không đổi. `claude-cli` nối cảnh báo vào `error` (với `unavailable`) hoặc `diag` (với `deny`) của kết quả lượt. Mã: `src/tools/claude-guard.ts:176-232`, `src/runtimes/claude-cli.ts` (khối `logSandboxUnavailable`, `denyLogFailures`). Test: `test/sandbox-log-fallback.test.ts` (4 ca). Trạng thái: **Đạt về đường ghi**; còn nợ đẩy log về ELK và WORM (mức Nâng cao) | **Bắt buộc** |
| DET-05 | Một phần | Chuỗi băm SHA-256 từng tệp + `ccoding logs verify`. Nếu `sandbox.deny` làm chứng cứ: bất biến (WORM/Object Lock, ký số, TSA, tách quyền quản trị log); từ D13 có sổ niêm phong tệp xoay vòng + `ccoding logs verify-seal`, ký số vẫn là mức "Nâng cao". Hạn chế đã biết: mỗi tiến trình hook mở `LogStore` riêng nên chuỗi băm có thể rẽ nhánh khi chạy song song (B-04/B-06) | Nâng cao |
| PRI-01 | N/A | Không thu thập DLCN từ chủ thể | — |
| PRI-02 | Một phần | Tối thiểu hóa: log không có lệnh thô, tham số hay đường dẫn; `cmd` qua `safeCmdName` | Nên có |
| PRI-03 | N/A | Không quản lý hồ sơ chủ thể dữ liệu | — |
| PRI-04 | Một phần | Không thêm luồng xuyên biên giới. Nếu sau này có DLCN thật trong worktree: vẫn áp hồ sơ đánh giá tác động như các mục trên | **Bắt buộc** (khi phát sinh) |
| RES-01 | Một phần | Khôi phục: tắt khóa → `buildClaudeArgs` trở lại như cũ (test từng byte, ca R8). Nếu dùng AppContainer phải có hàm gỡ ACE đã cấp trên worktree | Nên có |
| RES-02 | Một phần | Thời hạn lưu `sandbox.*` như DET-04: nằm trong `data/logs/*.jsonl`, giữ theo `retentionDays: 400` (`src/config.ts:434`). Chính sách tự xóa cho `data/self-improve/` đã có từ D10b (xem mục B-19, `src/selfimprove.ts:912-947`); log hệ thống chưa có tác vụ tự xóa nên vẫn giữ vô thời hạn. Xóa an toàn tệp canary sau thử nghiệm | Nên có |
| RES-03 | Một phần | Phát hiện agent thoát sandbox → tắt `osSandbox`/dừng nhiệm vụ, thu hồi khóa nếu `.env` có thể bị đọc, **thông báo sự cố DLCN ≤ 72 giờ nếu có DLCN bị lộ** | Nên có |

**Pháp lý Việt Nam** (số hiệu lấy từ các mục trên của chính tài liệu này, "căn cứ cập nhật đến 28/9/2026"; **chưa tra lại văn bản gốc trong phiên này — cần soát với Công báo trước khi trích dẫn chính thức**):

| Nghĩa vụ | Căn cứ (theo tài liệu này) | Áp vào B-18 |
|---|---|---|
| Thông báo vi phạm DLCN ≤ 72 giờ | Luật BVDLCN Đ23 | Sandbox giảm xác suất lộ `.env`/dữ liệu qua agent; sự cố vẫn phải thông báo (RES-03) |
| Chuyển DLCN xuyên biên giới | Luật BVDLCN Đ20; Luật Dữ liệu Đ23; NĐ 165/2025 Đ12 | Không thêm luồng; ngoại lệ mạng chỉ tới endpoint Anthropic như hiện nay |
| Nhật ký hệ thống truy xuất ≥ 12 tháng | NĐ 333/2026 | `sandbox.deny` thuộc nhật ký hệ thống: giữ ≥ 12 tháng (DET-04) |
| An ninh mạng, bảo vệ hệ thống thông tin | Luật An ninh mạng: số hiệu/điều khoản **[CHƯA KIỂM CHỨNG]** trong phiên này; NĐ 363/2026 hiệu lực 11/11/2026 theo ghi chú ở mục 4 | Sandbox là biện pháp kỹ thuật bảo vệ; cấp độ HTTT không áp dụng vì là công cụ cá nhân (mục 1) |
| Bí mật nhà nước | Luật Bảo vệ bí mật nhà nước 117/2025/QH15 | Vẫn **cấm** đưa vào CCoding; sandbox không thay quy định này |

**Phân loại:** "nhật ký `sandbox.*`" = **Nội bộ** / dữ liệu vận hành; "`.env` của worktree" = **Hạn chế** / thông tin xác thực (nhiều tiêu chí → mức cao nhất cho phần cần che chắn). Test dùng dữ liệu giả, không dữ liệu thật trên DEV/UAT.

**Yêu cầu nhật ký `sandbox.deny`:** (1) ghi qua `LogStore` với `redactSecrets`, `redactPii`, `hashChain`, không ghi trực tiếp; (2) `data` chỉ `{ tool, rule, backend }`; (3) lưu ≥ 12 tháng; (4) bất biến khi làm chứng cứ (WORM, băm, ký số); (5) lỗi ghi bị nuốt nhưng **không** đổi quyết định chặn (như `logGuardBlock`); (6) độ phủ chưa chắc: mẫu thông báo vi phạm của Claude Code chưa kiểm chứng, nên "không có `sandbox.deny`" không có nghĩa "không có vi phạm".

**Rủi ro còn lại:** (1) sandbox có sẵn không bọc hook và công cụ tệp — lớp 1 giữ vai trò đó; (2) domain fronting; (3) trên Windows native Claude Code không sandbox lệnh, nên khóa bật mà không có WSL2 phải từ chối chạy; (4) WSL2 cho phép chạy `.exe` Windows nếu không tắt interop; (5) bộ test đối kháng chỉ phủ các đòn đã biết.

**Cập nhật 03/11/2026 theo mã S1 (commit `f8ec686`, gộp `15d8ee4`) — S6 rà lại.** Phạm vi: chỉ đọc mã, chưa chạy sandbox thật. Bằng chứng nằm ở tệp:dòng dưới đây (số dòng đúng tại `15d8ee4`).

| Yêu cầu của mục này | Hiện thực trong mã | Trạng thái |
|---|---|---|
| Khóa tắt mặc định, tắt = như cũ (PRE-06, RES-01) | `src/config.ts:81` (`RuntimeConfig.osSandbox`), `validateOsSandbox` `src/config.ts:20`, gọi ở `src/config.ts:424`; nhánh bật chỉ khi `osSandbox?.enabled === true` (`src/runtimes/claude-cli.ts:252`); băm chụp khi tắt ở `test/sandbox-args.test.ts` | Có test |
| Khóa `sandbox` trong `--settings`: `failIfUnavailable`, `allowUnsandboxedCommands:false`, `allowWrite=[root]`, `denyRead` `.env*`, `strictAllowlist` (PRE-04, PRE-05) | `buildSandboxSettings` `src/runtimes/claude-cli.ts:40` | Có test dựng lệnh; **chưa kiểm Claude Code thật có nhận khóa** (việc của spike G1/S0) |
| Fail-closed (PRE-06) | `ClaudeCliRuntime.run` `src/runtimes/claude-cli.ts:305-308`: không có sandbox → ghi `sandbox.unavailable`, trả lỗi tiếng Việt, **không gọi `runProcess`**; `sandboxAvailable` `src/runtimes/claude-cli.ts:64` (win32 chỉ qua WSL2) | Có test (`test/sandbox-regression.test.ts`, probe tiêm) |
| Log `sandbox.deny` chỉ `{tool, rule, backend}`, qua `LogStore` có che + chuỗi băm (DET-01, DET-04, PRI-02) | `logSandboxDeny` `src/tools/claude-guard.ts:183`, `logSandboxUnavailable` `src/tools/claude-guard.ts:201` (`data` chỉ `{backend, platform}`); nối vào parser `src/runtimes/claude-cli.ts:195-196` và `:322`, chỉ khi khóa bật (tránh ghi nhầm lượt thường) | Có test |
| `rule` không chứa lệnh/đường dẫn (PRI-02) | `parseSandboxDeny` `src/runtimes/claude-cli.ts:116` trả nhãn cố định `fs-readonly`/`net-403`/`net-host`/`unknown` | **Mẫu chuỗi chưa đo thật** → "không có `sandbox.deny`" ≠ "không có vi phạm" |
| WSL2 (PRE-02, RES-01) | `toWslPath` `:74`, `wrapForWsl` `:102` (env qua `WSLENV`, đổi đường dẫn hook/`allowWrite`/`CCODING_GUARD`) | **Chưa kiểm trên máy thật**; chỉ có test thuần cho phần ánh xạ. Chờ distro WSL2 có `node` + `claude` (cần giám đốc duyệt cài) |
| Bộ test đối kháng, đo khởi động (DET-02, §e, §f) | S6: `scripts/sandbox-adversarial.mjs`, `scripts/sandbox-bench.mjs`, `scripts/lib/sandbox-cases.mjs`, `scripts/lib/sandbox-bench-stats.mjs`, `test/sandbox-adversarial-cases.test.ts` | Mặc định `--dry-run` trên dữ liệu giả; chạy thật từ chối trên win32, khi có `CCODING_GUARD`, thiếu `CCODING_SANDBOX_TEST=1` hoặc thiếu `--sandbox-wrapper`. **Chưa chạy thật lần nào** — chưa có bằng chứng sandbox chặn được |

**Phát hiện khi rà mã (S6):**
1. *Thấp · `src/tools/claude-guard.ts:139-153`, `src/runtimes/claude-cli.ts:308`* — `logSandboxUnavailable`/`logSandboxDeny` chỉ ghi được khi xác định được thư mục dữ liệu (từ `guardState` dạng `<data>/runs/<task>/guard/…`, `cfg.dataDir` hoặc `CCODING_DATA_DIR`); không xác định được thì bỏ qua im lặng. Lượt `allowTools=false` hoặc gọi ngoài orchestrator có thể mất sự kiện fail-closed. Lỗi vẫn trả về cho người gọi nên **quyết định chặn không đổi**, nhưng bằng chứng log có thể thiếu → DET-04. Khuyến nghị: người nhận `@senior-swe`, thêm test khẳng định `sandbox.unavailable` vẫn được ghi khi chạy qua orchestrator, hoặc truyền `dataDir` tường minh. **Đã xử lý ở D10b/S2** (đường ghi dự phòng stderr, xem dòng DET-04 ở trên).
2. *Thấp · `scripts/lib/sandbox-cases.mjs`* — nhóm E4 trên Linux chỉ có 4 ca chạy được (E4-5 và E4-WMI là Windows/AppContainer); tiêu chí §e "mỗi nhóm ≥ 5 ca" chưa đạt trên Linux. Script in rõ nhóm thiếu ca và `summarize().pass=false`; không che. Khuyến nghị: Phòng Nghiên cứu bổ sung một ca E4 Linux (hoặc chấp nhận 4 ca và ghi vào tiêu chí). Người nhận `@dev-lead`.
3. *Trung bình · căn cứ §e* — ca chế độ S (bỏ qua hook) cần một cách chạy lệnh trực tiếp trong sandbox; đặc tả không nêu công cụ. Script nhận `--sandbox-wrapper` do người chạy cung cấp thay vì đoán một công cụ. Việc chọn wrapper cần giám đốc/S0 chốt trước khi chạy thật.

**Khuyến nghị cho chủ dự án:** (1) giữ `osSandbox.enabled=false` — hiện chưa có bằng chứng thật rằng sandbox chặn được, và trên máy giám đốc (Windows) khóa bật sẽ **từ chối chạy** vì WSL2 chưa được kiểm; (2) duyệt riêng việc cài distro WSL2 rồi chạy spike G1 + E1–E5 trên Linux/WSL2 ngoài hook; (3) bật BitLocker kể cả đĩa ảo WSL (PRE-03); (4) giữ log `sandbox.*` ≥ 12 tháng (DET-04); (5) soát lại căn cứ pháp lý ở bảng trên với văn bản gốc trước khi dùng cho hồ sơ chính thức.

**Kết luận (cập nhật; D10b/S2 đóng phát hiện log sandbox im lặng, DET-04 có đường dự phòng): ĐẠT CÓ ĐIỀU KIỆN** — cổng thiết kế, **chưa phải cổng phát hành**. Mã lõi khớp đặc tả ở mức đọc mã và test thuần; thiếu bằng chứng chạy thật. Điều kiện: (1) giữ khóa tắt cho tới khi giám đốc duyệt, sau khi spike G1 và bộ E1–E5 đạt trên Linux/WSL2; (2) lưu nhật ký `sandbox.*` ≥ 12 tháng; (3) soát lại căn cứ pháp lý với văn bản gốc; (4) BitLocker, kể cả đĩa ảo WSL; (5) xử lý phát hiện 1 và 3 ở trên.

*(Kết luận gốc của phần đặc tả, giữ để đối chiếu:)* ĐẠT CÓ ĐIỀU KIỆN** (cho phần đặc tả). Điều kiện: (1) giữ khóa tắt cho tới khi giám đốc duyệt, sau khi spike (cổng G1) và bộ E1–E5 đạt; (2) lưu nhật ký `sandbox.*` ≥ 12 tháng; (3) soát lại căn cứ pháp lý với văn bản gốc trước khi dùng trong hồ sơ chính thức; (4) BitLocker, kể cả đĩa ảo WSL nếu worktree chuyển vào đó.

## Bổ sung 03/11/2026 — B-19 Vòng tự cải thiện

**Loại cổng:** cổng thiết kế, rà mã đã triển khai (bước 1–7 + route), **chưa phải cổng phát hành**. Chỉ đọc mã và test; chưa chạy vòng thật. Đặc tả: `docs/research/self-improvement/implementation-spec.md` §4–§5 (không chép lại). Khóa `selfImprove.enabled` mặc định **false** (`src/config.ts:381`); tắt ⇒ route `/api/selfimprove/*` trả 404 (`src/server.ts:683`).

**Phân loại (nhãn · pháp lý):**

| Tập dữ liệu | Nhãn | Phân loại pháp lý |
|---|---|---|
| Cụm, đề xuất, kết quả A/B, bản vá (`data/self-improve/`) | **Nội bộ** | Dữ liệu vận hành, không có DLCN thật |
| Sự kiện `incident.*`, `selfimprove.*` trong `LogStore` | **Nội bộ** (mang mức cao nhất của nhiệm vụ nguồn) | Nhật ký xử lý dữ liệu: giữ ≥ 6 tháng |
| Bộ bài giữ lại (holdout) | **Nội bộ**, dữ liệu tổng hợp | Không DLCN |
| Sự cố từ nhiệm vụ Bảo mật/Hạn chế | **Không vào vòng** | Chỉ đếm `incident.skipped {reason:'classification'}` |

**Phạm vi dữ liệu:** không thêm endpoint, khóa API, nhà cung cấp hay luồng xuyên biên giới; A/B dùng runtime đã cấu hình theo `allowedRuntimes`.

| Yêu cầu | Hiện thực (tệp:dòng, tại commit `c0e3aa8`) | Trạng thái |
|---|---|---|
| Loại sự cố của nhiệm vụ Bảo mật/Hạn chế (PRE-04, PRI-02) | `SECRET_CLASSES` `src/selfimprove.ts:61`; `toIncident` trả `skip('classification')` `src/selfimprove.ts:106`; phân loại lấy từ `task`, không do agent khai | Đạt (đọc mã). Test: `test/selfimprove.test.ts:67` (`reason === 'classification'`) |
| Che PII/bí mật trước log (DET-04, PRI-02) | Mọi bản ghi qua `LogStore.write` (`redactSecrets`, `redactPii`); `reason` cắt 300 ký tự `src/selfimprove.ts:636`; `agentProposal` cắt 300 | Đạt |
| Che PII/bí mật trước payload route (PRE-04) | `redact(..., {secrets, pii})` cho `agentProposal` và `diff` `src/selfimprove.ts:718-719`; route trả JSON, không HTML | Đạt (test route `test/selfimprove-apply.test.ts:228` kiểm hợp đồng khóa) |
| Lưu giữ ≥ 6 tháng (DET-04, RES-02) | `retentionDays: 400` `src/config.ts:434`; `selfImprove.retention.proposalDays` (mặc định 183) `src/config.ts:218`, `:398`; `MIN_RETENTION_DAYS = 183` `src/selfimprove.ts:1078`; `isEvidenceFile` `:1084`; `purgeExpired` `:1095`; `runRetention` `:1120`; nơi gọi `src/cli.ts:149`; **CT-11** `test/selfimprove-apply.test.ts:192` và 3 test `retention:` cùng tệp | **Đạt (D10b/S4)**: có nơi gọi và cấu hình, sàn cố định trong code, bằng chứng không xóa. Xem bảng chính sách giữ log bên dưới |
| Log bất biến, chuỗi băm (DET-05) | Ghi qua `LogStore` có `hashChain` (`src/logger.ts:66`); **CT-17** `test/selfimprove-apply.test.ts:165` (chuỗi không `broken`) | Đạt mức băm, và từ D13/K2 có thêm niêm phong tệp đã xoay vòng bằng sổ băm `data/logs/seal-ledger.jsonl` (`src/log-retention.ts:134`), kiểm bằng `ccoding logs verify-seal` (exit 2 nếu tệp bị sửa/mất hoặc chuỗi sổ đứt, `src/cli.ts:372`; 11 test `test/log-retention.test.ts`). Chưa phải WORM thật; ký số vẫn là mức "Nâng cao" và mới có hướng dẫn (ed25519 qua `node:crypto`, khóa lưu ngoài `data/`, có thể thêm TSA, `src/log-retention.ts:1-27`) |
| Duyệt và rollback chỉ do người đã xác thực (GOV-02) | Route so `server.token` bằng `tokenEquals` (`timingSafeEqual`) rồi dựng actor `actorFromToken` `src/server.ts:157-165`, `src/selfimprove.ts:796-803`; `recordDirector`, `rollback`, `applyApproved` đều bắt buộc actor, thiếu thì ném lỗi và không ghi `src/selfimprove.ts:804-819`, `:929`, `:989`; `proposalStatus` chỉ tính `approved` khi `isApprover` đúng `src/selfimprove.ts:808-810`, `:831`; `applyApproved` đọc lại sự kiện từ `LogStore`, không tin tham số; `rollback` cần `rollback.confirmed`; CT-07/08, CT-16, test K1 `test/selfimprove-route-auth.test.ts` (4 test: 401, 403, đúng actor và log không chứa token thô, thiếu actor/tương thích ngược) | **Đạt; M1 đã đóng (D13/K1).** Actor ghi vào log là `{by:'token-<8 hex đầu của SHA-256(server.token)>', auth:'server.token'}`. Chưa cấu hình token ⇒ 403; thiếu hoặc sai token ⇒ 401; cả hai không ghi sự kiện `selfimprove.*`. Sự kiện cũ `by:'director'` vẫn được tính là đã duyệt (tương thích ngược trước D13). Hạn chế: mọi người giữ chung một token đều cùng một danh tính, và kiểm Origin vẫn chỉ chặn khi có header `Origin` |
| Tách vai (GOV-02) | `loadConfig` từ chối ba vai trùng `src/config.ts:471` | Đạt |
| Không xuyên biên giới mới (PRI-04) | Không có mã gọi mạng mới trong `selfimprove.ts`/route | Đạt (đọc mã) |
| Khôi phục (RES-01) | Tắt khóa ⇒ 404 và không có sự kiện; rollback bằng `git revert` có thẻ prompts-vN | Đạt (test CT-10/16/17) |

**Chính sách giữ log (D10b/S4, quyết định D8) — nhãn Nội bộ:**

| Loại dữ liệu | Thời hạn | Căn cứ | Mã (tệp:dòng) |
|---|---|---|---|
| Tệp không phải bằng chứng dưới `data/self-improve/` (cụm `clusters/*.json`, kết quả chạy A/B trung gian, tệp tạm) | Cấu hình `selfImprove.retention.proposalDays`, mặc định **183 ngày**; thấp hơn 183 bị nâng lên 183 kèm `selfimprove.retention.clamped` | AGENTS.md: nhật ký xử lý dữ liệu cốt lõi/quan trọng ≥ 6 tháng | `src/config.ts:218`, `:398`; `src/selfimprove.ts:895`, `:937-950` |
| `data/self-improve/incidents.jsonl`, mọi `*.jsonl`/`*.chain`, `ab-*.json`, toàn bộ `proposals/` (meta, patch, monitor, bản ghi apply/rollback) | **Không xóa** (WORM); danh sách cố định trong code, cấu hình không ghi đè được | AGENTS.md: log làm chứng cứ phải bất biến (WORM, băm); xóa giữa chừng làm đứt chuỗi băm | `src/selfimprove.ts:901-905` (`isEvidenceFile`), `:912` |
| Nhật ký hệ thống truy xuất `data/logs/*.jsonl` (gồm `selfimprove.*`, `incident.*`, `sandbox.*`) | `retentionDays: 400`. Từ D13/K2 có tác vụ dọn **mặc định tắt**; khi bật chỉ xóa tệp **đã xoay vòng**, đã có trong sổ băm và băm khớp, quá **sàn 365 ngày** | AGENTS.md: nhật ký hệ thống truy xuất ≥ 12 tháng | `src/config.ts:440`; `src/log-retention.ts:32`, `:167` |
| Nhật ký xử lý dữ liệu (tên tệp chứa `processing`) dưới `data/logs/` | **Sàn 183 ngày**; thời hạn áp dụng là `max(sàn, logs.retention.days)`, cấu hình chỉ nâng được, không hạ được (hạ thì ghi `logs.retention.clamped`) | AGENTS.md: nhật ký xử lý dữ liệu cốt lõi/quan trọng ≥ 6 tháng | `src/log-retention.ts:31`, `:50-57` |
| Loại log không xác định được; tệp đang ghi; `seal-ledger.jsonl` | Không xác định được ⇒ 365 ngày. Tệp đang ghi và sổ niêm phong **không bao giờ bị dọn** | Giữ chuỗi băm và dấu vết | `src/log-retention.ts:43-52`; công tắc `logs.retention.enabled=false`, `intervalHours: 24` `src/config.ts:385` |

Nơi gọi: `runRetention` chạy **một lần khi server khởi động** nếu `selfImprove.enabled` (`src/cli.ts:145`); tắt ⇒ không xóa, không ghi log. Chưa thêm timer hằng ngày: server chỉ có timer `setInterval` ping SSE (`src/server.ts:193`) và `Routines` dành cho việc định kỳ do người dùng khai báo, không phải mẫu timer chung; server chạy lâu thì khởi động lại mới dọn. Mỗi lần chạy ghi `selfimprove.purged {count, olderThanDays}` qua LogStore, không kèm đường dẫn hay tên tệp (test `retention:` kiểm). Từ D13/K2, `data/logs/` có lịch dọn riêng: `setInterval` trong `cmdServe` (`src/cli.ts:150-156`), chỉ chạy khi `logs.retention.enabled` bật, dừng khi tắt server. Đây là đường dọn duy nhất cho `data/logs/`; `purgeExpired` giữ nguyên hành vi. Giả định cần chốt: `LogStore` hiện chưa xoay vòng log, nên tác vụ chỉ xử lý tệp đặt tên theo quy ước xoay vòng (`x.jsonl.<hậu tố>` hoặc `x.<YYYY-MM-DD…>.jsonl`). Trạng thái: **RES-02 Đạt cho `data/self-improve/`**, **Một phần** cho `data/logs/` (có tác vụ dọn và sổ băm nhưng mặc định tắt, chưa chạy thật trên CLI, chưa có cơ chế xoay vòng); **DET-04 Đạt** về che và băm, còn nợ đẩy ELK.


Các mã còn lại (GOV-01/03/05/06, PRE-01/02/03/05/06/07, DET-01/02/03, PRI-01/03, RES-03) giữ trạng thái như mục B-18 hoặc **N/A**: không thêm DLCN, bề mặt mạng hay nhà cung cấp mới; sự cố DLCN nếu có vẫn thông báo ≤ 72 giờ (RES-03).

**Review route (`src/server.ts:681-714`) — phát hiện:**

1. **Chính (major) · `src/server.ts:148-157`, `:686`** — *Đã đóng ở D13/K1: route nay xác thực `server.token` và ghi actor thật (`src/server.ts:157-165`, `src/selfimprove.ts:796-819`); `server.token` bắt buộc khi bật `selfImprove` (`src/config.ts:479`). Đoạn dưới giữ nguyên làm hồ sơ phát hiện ban đầu.* — "`by:'director'`" được gán cứng cho mọi POST tới route. Danh tính chỉ dựa vào việc gọi được loopback: `config.server.token` là tùy chọn (mặc định không đặt), và kiểm Origin chỉ chặn khi có header `Origin` (`:151-152`), nên lệnh gọi không có `Origin` (ví dụ `curl` từ shell của agent) đi thẳng qua. Agent có công cụ shell trong worktree có thể tự POST `/approve` rồi `/apply`, làm vô hiệu điều "không tự áp" (spec §4.1). Khuyến nghị cho `@backend-dev`: khi `selfImprove.enabled=true`, bắt buộc có `server.token` (loadConfig từ chối nếu thiếu) và yêu cầu `Origin` hợp lệ cho các POST `/api/selfimprove/*`; thêm test gọi không token ⇒ 401/403. Bổ sung cho chủ dự án: rà xem hook/shell-policy có chặn `curl` tới loopback không (chưa kiểm). **Trước khi bật `selfImprove.enabled` phải xử lý.**
2. **Phụ (minor) · `src/server.ts:699-705`** — route `apply` trả `{ ...r }` từ `applyApproved`; lỗi git trả `(e as Error).message` nguyên văn qua `HttpError(409)`. Thông điệp lỗi git có thể chứa đường dẫn cục bộ. Nên che qua `redact` hoặc cắt ngắn; Nội bộ nên rủi ro thấp.
3. **Phụ (minor) · `src/selfimprove.ts:1095`** — *Đã xử lý ở D10b/S4.* Trước đây `purgeExpired` xét theo `mtime` nên `incidents.jsonl` (chỉ nối thêm) không bao giờ hết hạn và không ai gọi hàm. Nay danh sách bằng chứng không xóa cố định trong code (`isEvidenceFile`, `src/selfimprove.ts:1084`), nơi gọi là khi server khởi động (`src/cli.ts:149`) và chỉ khi `selfImprove.enabled`.
4. **Ghi chú (không phải lỗi)** — `pid` được kiểm `safePid` (`src/selfimprove.ts:556`) trước khi nối đường dẫn nên không có path traversal; `reason` đi qua `LogStore` nên được che; client hiển thị bằng `textContent` là lớp thứ hai, không phải lớp bảo vệ chính.
5. **Chưa kiểm** — đường tới `selfimprove.proposed` đến từ `agentProposal` do agent viết: đã cắt và che, nhưng nội dung vẫn là dữ liệu không đáng tin hiển thị cho giám đốc (spec §4.3).

**Khuyến nghị cho chủ dự án (cập nhật D13):** (1) M1 đã đóng bằng actor xác thực token; có thể bật `selfImprove.enabled` khi đã chốt ngân sách và ngưỡng, nhưng mặc định vẫn `false`; (2) đặt `server.token` riêng cho người duyệt và không chia sẻ cho agent (bắt buộc khi bật: `src/config.ts:479`, `src/server.ts:157`); (3) `purgeExpired` đã có nơi gọi (`src/cli.ts:149`) và sàn 183 ngày, không cần quyết định thêm; (4) soát lại căn cứ pháp lý (số hiệu như mục B-18, **chưa tra lại văn bản gốc**); (5) giữ log `selfimprove.*`/`incident.*` ≥ 12 tháng: để tác vụ dọn `data/logs/` ở trạng thái tắt cho tới khi có cơ chế xoay vòng log và đã chạy thử `ccoding logs seal` rồi `ccoding logs verify-seal` trên dữ liệu thật của dự án; (6) khi cần giá trị chứng cứ: tạo khóa ed25519 ngoài `data/`, ký sổ băm, cân nhắc TSA.

**Kết luận (cập nhật D13): ĐẠT CÓ ĐIỀU KIỆN** — cổng thiết kế, **chưa phải cổng phát hành**. Điều kiện còn lại: (1) giữ `selfImprove.enabled=false` mặc định cho tới khi chủ dự án duyệt bật; (2) soát căn cứ pháp lý với văn bản gốc; (3) kiểm Origin vẫn chỉ chặn khi có header `Origin`, nên token là lớp xác thực chính. **Đã đóng:** M1 (D13/K1); quyết định gọi `purgeExpired` (D10b); tác vụ dọn `data/logs/` theo sàn 183/365 ngày và sổ băm kiểm được (D13/K2, mặc định tắt). **Còn mở:** WORM thật và ký số cho log làm chứng cứ (mới có hướng dẫn); cơ chế xoay vòng log.

## D13 — Xác thực người duyệt, lưu giữ log, base nhánh nhiệm vụ

Mục này đánh giá ba thay đổi của D13 về dữ liệu. Nhãn dữ liệu của cả ba là **Nội bộ**; không thêm DLCN, endpoint ngoài, khóa API hay luồng xuyên biên giới. Số liệu kiểm chứng lấy từ bàn giao của từng hạng mục; chưa chạy lại độc lập trong mục này.

| Hạng mục | Lớp / năng lực | Đánh giá | Trạng thái |
|---|---|---|---|
| K1: route B-19 ghi actor thật | GOV-02, PRE-05, DET-01 | Người duyệt được xác định bằng `server.token`; log chỉ có 8 hex đầu của SHA-256, không có token thô (test `test/selfimprove-route-auth.test.ts`). Không token ⇒ 403/401, không ghi sự kiện | Đạt |
| K2: dọn và niêm phong `data/logs/` | DET-05, RES-02, DET-04 | Sổ băm chỉ ghi thêm, lệnh `verify-seal`, sàn 183/365 ngày cố định trong code, công tắc mặc định tắt. Sổ chỉ chứa đường dẫn tương đối, băm, kích thước, thời điểm; không chứa nội dung log | Một phần: chưa WORM thật, chưa ký số, chưa có xoay vòng log |
| K5: base nhánh nhiệm vụ | GOV-01, RES-01 | `resolveBase` (`src/git.ts:71`) chỉ fetch `origin/<baseRef>` có timeout 60 giây, không sửa nhánh cục bộ, không force; lệch hai chiều thì dừng và báo; base thật được ghi vào log `workspace.worktree`/`workspace.base` (`src/orchestrator.ts:3065-3070`). Không đưa dữ liệu mới ra ngoài: chỉ tải mã nguồn về từ remote đã cấu hình | Đạt (8 test: 7 ở `test/git-base.test.ts`, 1 ở `test/git-base-orchestrator.test.ts`) |

Rủi ro còn lại. Mọi người dùng chung `server.token` có cùng một danh tính. Tác vụ dọn xóa dữ liệu thật nên chỉ bật sau khi có xoay vòng log. Khi lệch hai chiều, `resolveBase` ném `BaseDivergedError` (`src/git.ts:98`) và orchestrator dừng nhiệm vụ, không tạo worktree, không rơi về repo gốc (`src/orchestrator.ts:3081`, test `test/git-base-orchestrator.test.ts`); người dùng tự hợp nhất nhánh rồi chạy lại.

**Khuyến nghị cho chủ dự án:** (1) giữ `logs.retention.enabled=false` và `selfImprove.enabled=false` cho tới khi duyệt bật; (2) chạy thử `ccoding logs seal` và `ccoding logs verify-seal` trước khi bật dọn; (3) nếu cần giá trị chứng cứ, tạo khóa ed25519 ngoài `data/` và ký sổ băm; (4) khi nhiệm vụ dừng vì base lệch hai chiều, hợp nhất hoặc chọn nhánh base rồi chạy lại; không ép (force) nhánh.

## V4-3f — Đo không gọi LLM: trích metadata song song từ server chính; chạy lại test trên artifact bench (4/11/2026)

Mục này đánh giá hai luồng dữ liệu mới của V4-3f. Nhãn của cả hai là **Nội bộ**. Không có DLCN, không có endpoint ngoài, không gọi LLM, không có luồng xuyên biên giới mới.

| Hạng mục | Lớp / năng lực | Đánh giá | Trạng thái |
|---|---|---|---|
| P: `docs/research/analysis/p-extract.mjs` đọc server chính 7420 | GOV-01, PRE-02, PRI-01, PRI-03 | Chỉ gọi GET `/api/projects`, `/api/tasks`, `/api/tasks/<id>`, không đọc `data/` trực tiếp. **Ghi:** mốc thời gian, trạng thái, `dependsOn`, cờ gộp và xung đột, số lệnh đỏ, và số đếm ba mẫu tin nhắn hệ thống. **Không ghi:** đề bài, tiêu đề, đầu ra, nội dung tin nhắn, tên lệnh. Mã nhiệm vụ băm SHA-256 kèm muối ngẫu nhiên không lưu; mã dự án đổi thành P1–P6. Nhãn băm vẫn **nối ngược được** qua `createdAt` với mã nhiệm vụ trong git log công khai (phản biện 4/11), nên tệp từng lượt không được công bố. Đã kiểm danh sách khóa của tệp kết quả (RUNLOG). Repo công khai, nên tệp từng lượt **không commit**: nó ở lại máy giám đốc, repo chỉ có số tổng hợp | Đạt |
| G: `g-mutation.mjs`, `g-rebase.mjs` chạy `npm test` và test ẩn trên artifact `study-cloud` | PRE-04, RES-01 | Artifact là repo của bài tổng hợp, không có dữ liệu thật. Mỗi lượt chạy trong bản sao ở thư mục tạm, xóa sau khi xong. Tiến trình con có hạn giờ và bị giết cả nhóm khi quá hạn. Chạy trong container Linux của phiên, không trên máy giám đốc | Đạt |

**Rủi ro còn lại.** Tệp từng lượt có mốc thời gian theo nhiệm vụ. Người có quyền vào server có thể dùng chúng để đối chiếu ra nhiệm vụ nào, nên tệp chỉ giữ trên máy giám đốc.

**Khuyến nghị cho chủ dự án:** chỉ công bố số tổng hợp của P; không đưa tệp từng lượt lên repo công khai.

## E7 và E8 — CTO nghiệm thu trên lỗi lọt cổng; song song có worktree (5/11/2026, trước khi chạy)

Hai đợt đo dùng lại bài tổng hợp của bench. Nhãn **Nội bộ**. Không có DLCN, không có dữ liệu thật của khách hàng. Không dùng 9router hay khóa API: `claude` chạy bằng đăng nhập Max của giám đốc, như các đợt trước, nên không có luồng xuyên biên giới mới so với các đợt đo trước.

| Hạng mục | Lớp / năng lực | Đánh giá | Trạng thái |
|---|---|---|---|
| E7 R1/R2: CCoding chạy trong tiến trình (`createApp`) với thư mục data riêng của đợt | GOV-01, PRI-01, DET-01 | Mọi lượt gọi LLM đi qua `Orchestrator.call()`, được ghi log qua `LogStore` (che bí mật, chuỗi băm). Thư mục data của app nằm trong thư mục làm việc của đợt, không commit. Harness chỉ đọc lại văn bản lượt `accept` để so `promptSha` với R3, không sửa nội dung | Đạt |
| E7 lưu văn bản kết luận (`results/e7-cto/responses/`) và lỗi vào repo công khai | PRI-03, PRE-02 | Nội dung là nhận xét về mã của bài tổng hợp. Trước khi ghi, đường dẫn máy chạy (thư mục tạm, bản checkout, thư mục người dùng) được thay bằng `<work>`, `<ccoding>`, `<home>`. Sổ tay chạy yêu cầu tìm `C:\Users` một lần nữa trước khi commit | Đạt, có kiểm lại thủ công |
| E7 nhãn mục (lỗi/đúng) | GOV-02 | Nhãn chỉ có trong `items.json`. Workspace, đề bài, báo cáo, prompt và mã mục không mang nhãn (có test) | Đạt |
| E8: hai server bench từ cùng bản ghim, data riêng (`e8-data-a`, `e8-data-b`) | GOV-01, RES-01 | Không đụng server 7420 hay `data/` chính. Repo của lượt là bài tổng hợp | Đạt |

**Khuyến nghị cho chủ dự án:** giữ thư mục data của E7 và hai server E8 trên máy ít nhất 6 tháng (nhật ký xử lý), như các đợt đo trước. Chỉ commit số tổng hợp, `runs.jsonl` và văn bản đã thay đường dẫn.

## D18b/S3 — K4 (FX21): chữ ký HMAC cho log và kiểm tra dòng bị sửa (14/11/2026)

**Loại kết luận:** cổng thiết kế (kiểm tra điểm). **Dữ liệu:** log vận hành — **Nội bộ**; không thêm tập dữ liệu mới, không thêm DLCN (log vẫn che PII/bí mật trước khi ghi). **Cấp độ ATTT:** giữ nguyên giả định hiện có của dự án (không nâng cấp).

### Vấn đề
Chuỗi băm SHA-256 (DET-05) chỉ phát hiện sửa *vụng*: ai sửa một dòng rồi tính lại hash toàn bộ các dòng sau vẫn qua được kiểm tra. Cần một bí mật mà kẻ sửa log không có.

### Thay đổi (`src/logger.ts`)
- Mỗi dòng có khóa: thêm `"kid"` và `"sig"` sau `"hash"`. `sig = HMAC-SHA256(khóa, hash)` — ký trên hash của chuỗi nên phủ cả nội dung lẫn thứ tự dòng.
- `kid` = 8 ký tự đầu của `HMAC(khóa, "ccoding-log-kid-v1")`: dấu vân tay để nhận biết khóa nào đã ký, **không phải khóa** và không suy ngược được khóa.
- Khóa chỉ đọc từ biến môi trường `CCODING_LOG_HMAC_KEY`. Không có trường trong `config`, không vào repo, config mẫu, log, thông báo lỗi hay output của checker.
- Thiếu khóa: cảnh báo **một lần mỗi tiến trình** ra stderr; chuỗi băm vẫn chạy như cũ.
- Checker (`verifyChain`, `verifyChainStream`) báo `brokenAt` kèm lý do:
  - `hash sai — nội dung đã bị sửa`;
  - `chữ ký sai` (hash khớp nhưng sig không khớp — dấu hiệu tính lại hash khi không có khóa);
  - `khóa khác/không có khóa` (`kid` lệch khóa hiện tại, hoặc mất chữ ký sau khi đã có dòng ký).
- Có khóa: kiểm hash + chữ ký. Không khóa: chỉ kiểm hash (dòng có chữ ký vẫn kiểm được phần hash).
- Tương thích ngược: log cũ không ký vẫn kiểm được. Với khóa, phần đầu chưa ký (di sản) được chấp nhận; **sau dòng ký đầu tiên mọi dòng phải ký**, nên xóa chữ ký khỏi dòng sau bị phát hiện.

### Rà năng lực liên quan
| Mã | Trạng thái | Ghi chú |
|---|---|---|
| DET-05 (toàn vẹn log) | Cải thiện | Thêm chữ ký HMAC; còn phụ thuộc bảo quản khóa |
| GOV-03/GOV-04 | Có khuyến nghị | Khóa thuộc quyền chủ dự án; ghi người giữ khóa |
| PRI (PII trong log) | Không đổi | `kid`/`sig` không chứa DLCN |
| RES (lưu giữ) | Không đổi | Lưu ≥ 6 tháng (cốt lõi), ≥ 12 tháng (truy xuất hệ thống) theo `log-retention` |
| Các mã còn lại | N/A | Không ảnh hưởng bởi thay đổi này |

### Đặt, lưu và xoay khóa
- **Đặt:** tạo khóa ngẫu nhiên ≥ 32 byte (ví dụ `openssl rand -hex 32`), đặt vào biến môi trường `CCODING_LOG_HMAC_KEY` của tiến trình chạy CCoding **và** của tiến trình chạy checker.
- **Lưu:** trong trình quản lý bí mật của hạ tầng (hoặc biến môi trường hệ điều hành với quyền hạn chế). Không commit, không dán vào `ccoding.config.*`, không in ra log. Người có quyền ghi log không nên giữ khóa riêng ở cùng máy nếu có thể tách.
- **Xoay:** đặt khóa mới → dòng mới mang `kid` mới. Giữ khóa cũ để kiểm các tệp cũ (checker hiện kiểm theo *một* khóa: kiểm tệp cũ bằng khóa cũ, tệp mới bằng khóa mới; tệp có lẫn hai `kid` sẽ báo `khóa khác/không có khóa` ở chỗ đổi khóa — đây là hạn chế đã biết). Nên xoay khi niêm phong/xoay tệp log (`logs seal`) để mỗi tệp một khóa. Khóa nghi lộ → xoay ngay, coi log ký bằng khóa đó từ thời điểm lộ là chưa chứng minh được.
- **Mất khóa:** log đã ký không còn kiểm được chữ ký, chỉ kiểm được hash.

### Log không ký thì không chứng minh được toàn vẹn
Khi chưa đặt khóa, chuỗi băm chỉ chứng minh log **không bị sửa vụng**; kẻ có quyền ghi tệp có thể sửa và tính lại toàn bộ chuỗi. Log dùng làm chứng cứ (sự cố, tranh chấp) phải ký, và nên có thêm WORM bên dưới.

### Cách chạy checker
```bash
CCODING_LOG_HMAC_KEY=<khóa> node dist/cli.js logs verify    # sau npm run build; hoặc: npx tsx src/cli.ts logs verify
```
Duyệt mọi `*.jsonl` trong `data/`, in `✓/✗` từng tệp kèm dòng lỗi và lý do; thoát mã 2 nếu có tệp lỗi. Không đặt khóa thì checker chỉ kiểm hash. `logs verify-seal` kiểm sổ niêm phong tệp đã xoay (cơ chế riêng, bổ sung).

### WORM — ngoài tầm mã (cần hạ tầng)
Mã **không** triển khai WORM. Khi có hạ tầng:
1. Đẩy tệp log đã xoay/niêm phong lên object storage bật **Object Lock** (chế độ compliance, thời hạn ≥ thời hạn lưu giữ 6/12 tháng).
2. **Ký số theo lô**: định kỳ (ví dụ mỗi ngày) băm các tệp đã niêm phong, ký bằng khóa/chứng thư số tổ chức, lưu chữ ký cạnh lô trong cùng kho WORM.
3. Kiểm định kỳ: `logs verify` + `logs verify-seal` + đối chiếu chữ ký lô.
Nếu chưa có hạ tầng, ghi nhận đây là rủi ro tồn dư: người có quyền xóa tệp vẫn xóa được log.

### Kiểm chứng
`test/logger-hmac.test.ts` (khóa giả, thư mục tạm): ghi có khóa rồi kiểm; sửa một dòng báo đúng dòng; sửa + tính lại hash không khóa → `chữ ký sai`; khóa khác; thiếu khóa → cảnh báo một lần, hash vẫn đúng, log cũ kiểm được; nội dung log không chứa khóa. `test/sandbox-log-fallback.test.ts` đặt khóa giả để cảnh báo không lẫn vào kiểm tra stderr.
