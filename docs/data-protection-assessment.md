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
