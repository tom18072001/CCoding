# Giao diện: quản lý nhiệm vụ, màn Prompt, văn phòng, hạn mức

Giao diện web (http://127.0.0.1:7420) chỉ phục vụ máy cục bộ, không đăng nhập. Lần đầu mở có **hướng dẫn nhanh**; bấm ❓ (hoặc phím `?`) để xem lại trợ giúp, các chế độ giao việc, nhãn dữ liệu, phím tắt và thuật ngữ.

## Bố cục

| Cột | Nội dung |
|---|---|
| **Trái — điều hướng** | **＋ Mới** (nhiệm vụ, giao riêng, dự án, prompt, tải tệp), các mục chính, cây **Dự án → Nhiệm vụ** (như thư mục), gắn sao, gần đây ngoài dự án, ⛽ token hôm nay. Nút `«`/`»` thu gọn thành dải biểu tượng (mặc định thu gọn ở màn Prompt, nhớ riêng cho từng màn). |
| **Giữa — màn chính** | Kiểu Drive: *Tổng quan* (việc đang chạy, cần quyết định, dự án, gần đây), *Dự án* dạng thư mục (chuột phải/⋮ để thao tác), trang dự án có ô soạn + nhân sự, *Nhiệm vụ* (lọc, sắp xếp, danh sách/lưới, gắn sao, menu chuột phải), trang nhiệm vụ đầy đủ (kế hoạch, lệnh kiểm tra, sản phẩm, 🧬 thay đổi, token, nhật ký, lượt gọi, ô soạn cuối trang). Ô tìm `/` tìm nhiệm vụ, dự án, agent. Mỗi màn có URL riêng (Back/Forward dùng được). |
| **Phải — ô phụ** | Thẻ **🏢 Văn phòng** (sơ đồ pixel + dòng sự kiện mới nhất ở trên) và **📄 Xem trước** (báo cáo/tệp sản phẩm mở từ hội thoại, chép nội dung). `⤢` phóng to, `✕`/phím `V` ẩn hiện. |

## Màn 💬 Prompt (kiểu ứng dụng chat)

- **Cột hội thoại**: mỗi hội thoại là một chuỗi nhiệm vụ nối nhau bằng *giao tiếp nối* (`followUpOf`); nhóm *Đang chạy* / Hôm nay / Hôm qua / 7 ngày…; tìm theo tiêu đề/nội dung; lọc theo dự án hoặc *Ngoài dự án*; `↪n` = số lượt tiếp nối. Vùng giữa hẹp (< 820 px) thì cột này thành ngăn kéo (nút ☰).
- **Cuộc mới**: ô soạn đầy đủ ở giữa (mẫu prompt, 📚 thư viện, 🧱 soạn theo khung, đính kèm, chế độ/phòng/dự án/agent, 🔐 luồng dữ liệu, tùy chọn ngân sách…). Giao xong là chuyển sang hội thoại.
- **Hội thoại**: yêu cầu của bạn (bong bóng bên phải, kèm tệp đính kèm) → trả lời của văn phòng: lý do định tuyến, **khối "n tin trao đổi"** (gom gọn kế hoạch/thảo luận/bàn giao/review — bấm để mở; khối cuối tự mở khi việc đang chạy), tiến độ từng phòng (thanh pha, hạng mục, người làm, "sản phẩm"), trạng thái đang chạy (⏸ tạm dừng, hủy), hộp tạm dừng/lỗi (▶ chạy tiếp, +50% ngân sách) và **báo cáo cuối** hiển thị trọn, tệp sản phẩm dạng chip (mở ở 📄 Xem trước), ⧉ chép, ↻ giao lại tương tự. **📋 Quản lý** mở trang nhiệm vụ đầy đủ; trang nhiệm vụ có nút **💬 Dạng hội thoại**.
- **Ô trả lời** (dưới cùng, `Enter` gửi · `Shift+Enter` xuống dòng):
  - việc **đang chạy/chờ/tạm dừng** → **chỉ dẫn bổ sung** (`POST /api/tasks/<id>/notes`): hiện trong hội thoại như tin nhắn của bạn và được đưa vào phần đầu prompt của các lượt gọi sau (lượt đang chạy làm nốt theo yêu cầu cũ); tối đa 30 chỉ dẫn/nhiệm vụ, 4.000 ký tự/chỉ dẫn;
  - việc **đã kết thúc** → **giao tiếp nối** (`POST /api/tasks` với `followUp`): kế thừa chế độ/dự án/phòng/agent (đổi được người nhận ở "Giao cho"), báo cáo trước đưa vào `inputs/NHIEM-VU-TRUOC.md`, nhãn dữ liệu không thấp hơn nhiệm vụ trước; cho phép đính kèm tệp.
  - Nội dung có dạng khóa API/private key/mật khẩu bị **chặn ngay trên trình duyệt** (cả ô soạn cuộc mới); server vẫn che bí mật trước khi lưu/gửi.
- Trong màn Prompt, bấm nhiệm vụ ở cây bên trái hoặc dòng sự kiện ở ô phụ sẽ mở dạng hội thoại; ở nơi khác thì mở trang nhiệm vụ.

## Giám đốc duyệt / yêu cầu sửa bằng tay

Khi nhiệm vụ không chạy và có hạng mục đã xong, cuối hội thoại (và đầu trang nhiệm vụ) có khối **⚖ Quyết định của giám đốc**:

- **✅ Duyệt kết quả** (hiện khi reviewer chưa duyệt / nhiệm vụ "⚠ cần xem"): coi kết quả là đạt, bỏ cờ cần xem, không gọi model.
- **✋ Yêu cầu sửa…**: ghi cần sửa gì + chọn hạng mục (mặc định: hạng mục reviewer còn nêu lỗi, không có thì mọi hạng mục) → yêu cầu thành lỗi `[major]` gửi cho người phụ trách → **một vòng sửa** → reviewer **duyệt lại** → viết lại báo cáo tổng hợp. Phòng không có reviewer riêng (vd. việc giao riêng cho chính reviewer) thì sửa xong chờ giám đốc xem.
- Hội thoại ghi lại quyết định (tin nhắn của giám đốc); API `POST /api/tasks/<id>/review` `{ "decision": "approve" | "reject", "note": "…", "subtasks": ["S1"], "department": "dev" }`.

## Việc cần sửa theo agent (tab KPI) — sửa rồi thì xóa

- Mỗi mục có khóa ổn định (vd. `tools-fail`, `template`, `exec-evidence`, `review-quality`…). Bấm **✓ Đã sửa** khi đã sửa nguyên nhân (agent.md, cách giao việc, cấu hình): mục **ẩn ngay** và chỉ hiện lại (gắn "↻ Tái diễn") nếu các nhiệm vụ tạo **sau** mốc đánh dấu vẫn sinh lại đúng mục đó. Lưu ở `data/kpi-resolved.json`; **Bỏ đánh dấu** trong khối "Đã sửa / tự hết".
- **Tự hết**: mục từng xuất hiện ở một nhiệm vụ nhưng **2 nhiệm vụ gần nhất** của agent sau đó không còn → tự chuyển sang "Đã sửa / tự hết". Mục chỉ vượt ngưỡng khi cộng dồn nhiều nhiệm vụ thì giữ nguyên.
- Mẫu đầu ra / "## Tóm tắt" / lệnh kiểm chứng chấm trên **bản cuối của mỗi hạng mục**: thiếu ở lần đầu nhưng đã sửa ở vòng sửa thì không còn bị tính.
- **💬 Nhắc agent**: thêm mục thành góp ý trong hồ sơ agent (đi vào system prompt các lượt sau); góp ý này **tự xóa** khi mục đã sửa (đánh dấu tay, tự hết, hoặc không còn trong 30 ngày) — kiểm tra lại sau mỗi nhiệm vụ xong.
- `ccoding kpi` hiện khóa từng mục và số mục đã ẩn; API `POST /api/kpi/resolve { agentId, key, note?, undo? }`, `GET /api/kpi?raw=1` để xem bản chưa lọc.

## Trang mới trên cột trái (UX-4d)

- **🔁 Việc định kỳ** (`#/routines`, mục Làm việc): giao lại một nhiệm vụ mẫu theo lịch — **hằng ngày HH:MM**, **các thứ trong tuần lúc HH:MM**, hoặc **mỗi N giờ** (1–168), theo đồng hồ máy chạy CCoding. Mẫu gồm chế độ giao việc (tự động/phòng ban/dự án/liên phòng/giao riêng), **dự án (ở mọi chế độ — nhiệm vụ tạo ra mang nhãn dữ liệu, runtime được phép, ngân sách, worktree của dự án như giao tay)**, tiêu đề, nội dung, ngân sách, vòng họp, review, CTO nghiệm thu. Mỗi lần chạy là một nhiệm vụ bình thường (mang `routineId`). Lần trước chưa xong (chờ/đang chạy, hoặc tạm dừng chờ xử lý: hết ngân sách, chờ duyệt kế hoạch, chờ hạn mức…) → bỏ qua lần này, dòng ⚠ ghi "cần xử lý"; lần trước **bị gián đoạn** do server khởi động lại thì không chặn; server tắt lỡ lịch **≤ 6 giờ** thì chạy bù một lần, lâu hơn thì bỏ qua tới lịch kế tiếp (lý do hiện ở dòng ⚠). Bật/tắt (tắt luôn được, kể cả khi dự án/phòng ban/agent của mẫu đã bị xóa; bật lại thì phải sửa mẫu), ▶ Chạy ngay, ✎ Sửa, 🗑 Xóa; chuột phải một nhiệm vụ → **Lặp lại định kỳ…** để soạn sẵn từ nhiệm vụ đó. Bộ lập lịch chỉ chạy trong `ccoding serve` (nhịp 30 giây). Lưu ở `data/routines.json`. API: `GET/POST /api/routines`, `POST /api/routines/<id>` (sửa), `POST /api/routines/<id>/run`, `DELETE /api/routines/<id>`.
- **📦 Sản phẩm** (`#/artifacts`): mọi thứ agent làm ra — 📄 báo cáo tổng hợp, 🧩 sản phẩm từng hạng mục, ✅ kết luận nghiệm thu, 🧬 thay đổi mã trên nhánh. Lọc theo loại, dự án, agent, từ khóa; bấm để xem trước (Markdown), ⬇ tải xuống, mở trang nhiệm vụ hoặc diff. API `GET /api/artifacts?kind=&project=&agent=&q=`.
- **🧩 Kỹ năng & Kết nối** (`#/skills`, mục Tổ chức): kỹ năng khai báo trong hồ sơ agent (lọc theo kỹ năng hoặc tên agent; bấm ảnh để mở hồ sơ), công cụ từng agent được dùng và chính sách quyền (mặc định, trong dự án, tra cứu web), kết nối: runtime (đang chạy được không, có trong thứ tự chạy, được xử lý nhãn dữ liệu nào), dự án git, herdr. API `GET /api/skills`.
- **🛡 Kiểm toán** (`#/audit`, mục Tổ chức): ai làm gì lúc nào — giao/hủy/tiếp tục nhiệm vụ, duyệt/sửa kế hoạch, quyết định review, đổi ngân sách, CTO nghiệm thu, đẩy nhánh, lưu/xóa dự án, kiểm tra hồi quy, góp ý agent, việc định kỳ, tải tệp, lệnh bị chặn, khởi động/dừng server; người làm là 👤 Giám đốc (kể cả "▶ Chạy ngay" việc định kỳ), ⚙ Hệ thống (tự tiếp tục, việc định kỳ tới lịch), agent, hoặc ❔ Không rõ (nhật ký cũ thiếu dữ liệu). Lọc theo nhóm và nội dung, "Xem thêm" để lùi về trước (phân trang theo số thứ tự dòng nhật ký); **🔗 Kiểm chuỗi băm** đọc lại toàn bộ `data/logs/system.jsonl` và báo dòng đầu tiên bị sửa (nếu có). API `GET /api/audit?cat=&q=&beforeSeq=`, `GET /api/audit/verify` (đọc luồng, không chặn server).

## Nghiệm thu của CTO và nhân sự mới (UX-4c)

- **CTO nghiệm thu**: sau khi mọi phòng tổng hợp xong, agent `cto` đối chiếu đề bài với báo cáo tổng hợp, kết luận review và lệnh kiểm tra CCoding tự chạy (đọc thêm tệp trong worktree khi cần), kết luận từng tiêu chí **Đạt / Không / Chưa kiểm được** kèm bằng chứng, nêu rủi ro, việc còn mở và đề xuất việc tiếp theo. Kết quả: tin "nghiệm thu" trong hội thoại, tệp `ACCEPTANCE.md`, khung **✅ CTO nghiệm thu / ✋ CTO chưa nghiệm thu** ở trang nhiệm vụ, hội thoại và hộp Cần bạn (bảng tiêu chí; bấm một việc tiếp theo để **soạn sẵn** việc tiếp nối — sửa rồi mới giao, CTO không tự giao). Chưa nghiệm thu → nhiệm vụ "cần xem" (Cần bạn, cảnh báo); giám đốc **Duyệt** thì bỏ "cần xem". Báo cáo tổng hợp viết lại (làm lại từ review/tổng hợp, yêu cầu sửa) thì nghiệm thu lại; không đổi thì không gọi lại. Bỏ qua với việc giao riêng một agent; tắt ở ô **CTO nghiệm thu khi xong** trong form giao việc, `options.acceptance: false` hoặc `defaults.acceptance: false`. Dòng thời gian có pha **Nghiệm thu (CTO)**.
- **Nhân sự mới phòng Phát triển**: **Business Analyst** (`business-analyst` — yêu cầu, bảng gap, tiêu chí nghiệm thu, ma trận truy vết), **Technical Writer** (`tech-writer` — viết lại tài liệu cho người đọc đích), **Senior Software Engineer** (`senior-swe` — tích hợp, idempotent, lỗi gốc, refactor, rà mã). `ba-presales` thu hẹp thành **Pre-sales & HSDT** (giữ mã cũ để dữ liệu cũ không đổi). Trưởng phòng Phát triển giao việc theo các vai trò mới.

## Văn phòng (ô bên phải, tối giản từ UX-4b)

Ô **🏢 Văn phòng** chia theo phòng ban: phòng **Điều phối · CTO** ở trên (agent không thuộc phòng ban làm việc nào), bên dưới mỗi phòng ban một phòng (Phát triển, Nghiên cứu…; ô phóng to `⤢` xếp hai cột). Mỗi agent một bàn: chân dung pixel, **vòng màu trạng thái** (rảnh · nghĩ · làm · họp · review · chờ · lỗi), màn hình trên bàn sáng khi đang làm, **bong bóng** việc đang làm hoặc câu vừa nói. Dòng đầu: số nhiệm vụ đang chạy và cuộc họp đang diễn ra.

- **Bấm vào một agent** → menu: 📝 Giao việc riêng · 💬 Góp ý / đánh giá · 📋 Mở việc đang làm (mã CC-n) · 💰 Tăng ngân sách việc đang làm · 👀 Xem hồ sơ; chọn bằng `1`–`9` hoặc ↑/↓ + `Enter`, `Esc` đóng. **Nhấp đúp** → mở hồ sơ.
- **Luồng hoạt động** bên dưới: tab **Tất cả** + các agent vừa có hoạt động (bấm để lọc), mỗi dòng có mã nhiệm vụ; bấm dòng để mở nhiệm vụ.
- **Thanh trạng thái** dưới cùng: các agent đang bận và việc họ đang làm (bấm → hồ sơ).
- Đã bỏ: nhân vật giám đốc và đi lại `W` `A` `S` `D` / `E`, phòng họp, pantry, góc giải trí, các mục "vui" (cà phê, đập tay, chuyện cười, nhạc, trò "Bắt bug"), bảng điều khiển bàn giám đốc (thông tin đó có ở 🏠 Tổng quan và ⛽ Hạn mức). Chân dung pixel tách sang `public/avatar.js`.

## Giao việc riêng cho một agent

Chế độ **Giao riêng** (`mode: "agent"`): một agent làm luôn — bỏ định tuyến, lập kế hoạch và họp; vẫn chạy trong dự án (worktree, lệnh kiểm tra) nếu chọn dự án; reviewer của phòng vẫn review (trừ khi agent được giao chính là reviewer); báo cáo cuối lấy luôn bàn giao của agent (không tốn thêm lượt trưởng phòng).

```http
POST /api/tasks
{ "mode": "agent", "agentId": "backend-dev", "projectId": "nd57", "brief": "…", "options": { "budgetTokens": 400000 } }
```

Điều phối viên không nhận việc riêng; dự án có danh sách `agents` thì chỉ giao được cho người trong danh sách. Nút **↻ Giao lại tương tự** trong chi tiết nhiệm vụ điền sẵn form với yêu cầu, chế độ, phòng/dự án/agent của nhiệm vụ đó.

## Góp ý cho agent

Góp ý (kèm 👍/👎, gắn nhiệm vụ tùy chọn) lưu ở `data/feedback/<agent>.json`. **Tối đa 5 góp ý đang bật, mới nhất trước**, được thêm vào hồ sơ (system prompt) của agent ở mọi lượt gọi sau, mục "Góp ý của giám đốc (Tom)"; góp ý không thay quy tắc an toàn/dữ liệu và nhường yêu cầu của nhiệm vụ khi mâu thuẫn. Bật/tắt hoặc xóa từng góp ý trong hộp thoại. Log chỉ ghi "có góp ý + độ dài", không ghi nội dung.

`GET/POST /api/agents/<id>/feedback` · `POST /api/agents/<id>/feedback/<fid>` `{ "active": false }` · `DELETE /api/agents/<id>/feedback/<fid>`

## Prompt: thư viện, khung soạn, kiểm tra

- **📚 Thư viện prompt** (`data/prompts.json`): 5 mẫu có sẵn (tính năng mới, sửa lỗi, review, tổng quan tài liệu, tài liệu kỹ thuật) + prompt của bạn; tìm theo tiêu đề/nhãn/nội dung; Chèn / Thêm vào cuối / Sửa / Nhân bản / Xóa; prompt có thể nhớ chế độ + agent để chèn là chọn luôn. `GET/POST /api/prompts`, `DELETE /api/prompts/<id>`, `POST /api/prompts/<id>/use`.
- **🧱 Soạn theo khung**: Mục tiêu · Bối cảnh · Phạm vi (làm / không làm) · Tiêu chí hoàn thành · Ràng buộc · Đầu ra → Markdown.
- **Kiểm tra khi gõ** (cục bộ, không gọi model): "Độ rõ x/5" theo mục tiêu, phạm vi, tiêu chí xong, đầu ra, ràng buộc; cảnh báo yêu cầu quá ngắn, việc dự án chưa nêu tệp/route, và **chặn nhầm bí mật** (khóa API, private key, mật khẩu dán vào yêu cầu).
- Dòng **🔐 luồng dữ liệu** dưới form: nhãn dữ liệu của việc (theo dự án hoặc mặc định) và các runtime được phép + sẵn sàng sẽ xử lý (cục bộ / ra ngoài).

## Tab Hạn mức

`GET /api/quota`: mỗi runtime — trong thứ tự chạy hay không, đã tắt, biến môi trường chứa khóa **đã đặt hay chưa** (không bao giờ trả giá trị), token đã dùng hôm nay (sổ cái CCoding) so với `dailyTokenLimit` (runtime và từng model trong chuỗi), trạng thái tạm ngừng (429/hết hạn mức), và **header giới hạn của nhà cung cấp** ở lượt gọi gần nhất (`x-ratelimit-remaining-tokens[-minute|-day]`, `…-requests…`, `retry-after` — Cerebras, Groq, OpenRouter, OpenAI…) hiển thị thành "Token/ngày: còn A / B". Runtime CLI (Claude Code, Codex, Kimi) không trả số còn lại qua CCoding.

## Phím tắt

| Phím | Việc |
|---|---|
| `?` / `H` | Trợ giúp |
| `N` | Giao việc mới (con trỏ vào ô Yêu cầu) |
| `/` | Tìm nhanh nhiệm vụ, dự án, agent |
| `V` | Ẩn/hiện ô phụ bên phải |
| `1`–`7` | Tổng quan · Dự án · Nhiệm vụ · Prompt · Nhân sự · Hạn mức · Nhật ký |
| `Ctrl`+`K` / `⌘K` | Bảng lệnh |
| `I` | Hộp 📥 Cần bạn (trong hộp: `J`/`K`, `Enter`, `O`, `1`, `2`, `H`, `X`, `Z`) |
| `Ctrl`+`Enter` | Giao việc ở ô soạn lớn (cuộc mới, trang dự án, trang nhiệm vụ) |
| `Enter` / `Shift`+`Enter` | Gửi / xuống dòng ở ô trả lời của hội thoại |
| `W` `A` `S` `D` / `E` | Đi / tương tác |
| `Esc` | Đóng hộp thoại, menu, hướng dẫn |

Phím tắt không chạy khi đang gõ trong ô nhập hoặc có hộp thoại mở.

## Thấy được việc agent làm (UX-1, 1/11/2026)

- **URL riêng cho từng màn** — nút Back/Forward của trình duyệt, mở tab mới, gửi link (chỉ chứa mã, không chứa nội dung): `#/chat/<nhiệm vụ>` · `#/task/<nhiệm vụ>[/diff|final|files|tokens|events|calls]` · `#/tasks[/attention|starred…]` · `#/project/<mã>` · `#/agent/<id>` · `#/home`, `#/kpi`, `#/logs`… Mở thẳng URL của nhiệm vụ vừa giao (SSE chưa tới) hoặc cũ ngoài 100 việc gần nhất vẫn được — giao diện tải nhiệm vụ rồi mở.
- **🧬 Thay đổi** (tab trong trang nhiệm vụ; chip "🧬 Thay đổi +a −d · n tệp" ở cuối hội thoại, trên dòng đang chạy và hộp tạm dừng/lỗi): diff so với commit gốc của nhiệm vụ. Worktree còn → gồm cả phần **chưa commit** và tệp mới (agent đang làm); worktree đã gỡ → lấy từ nhánh trong repo. Chọn **từng commit** (commit gộp `--no-ff` của hạng mục khi chạy song song ⇒ xem riêng phần hạng mục mang vào). Bấm tệp để mở diff (số dòng cũ/mới), **Mở tất cả**, ↻ đọc lại. Tệp `.env*`, khóa, chứng chỉ chỉ hiện tên; nội dung đã che bí mật. `GET /api/tasks/<id>/diff[?commit=<sha>][&file=<đường dẫn>]`.
- **🧪 Lệnh kiểm tra** (đầu trang nhiệm vụ; chip trong hội thoại): bảng lệnh × *trước khi sửa* (baseline) → *sau thực thi / sau vòng sửa*, dòng tổng kết, thời gian; lệnh **đạt → hỏng** tô đỏ "hồi quy", hỏng → đạt ghi "đã sửa"; "Đuôi đầu ra" của lệnh hỏng. Tự mở khi có lệnh hỏng.
- **Luồng hoạt động trực tiếp**: dưới mỗi hạng mục đang chạy (hội thoại và trang nhiệm vụ) có dòng việc agent đang làm (lệnh, tệp đang đọc/ghi — cập nhật theo sự kiện) và **Xem luồng** (≤ 160 dòng gần nhất). Tải lại trang giữa chừng → luồng lấy các công cụ đã dùng từ nhật ký. **📜 hoạt động** ở mỗi hạng mục (trang nhiệm vụ) liệt kê lệnh/công cụ đã dùng (`GET /api/tasks/<id>/events?kind=tool.call&subtask=S2`).
- **Tín hiệu "chờ bạn"**: tiêu đề tab `(n) ▶ CCoding Office` — *n* = việc cần bạn (tạm dừng, lỗi, "cần xem"), ▶ = có việc đang chạy; favicon có chấm đỏ khi *n* > 0.
- **Thông báo trình duyệt** (🔔 → đầu bảng Cảnh báo; tắt mặc định): chọn loại — ✅ xong, ⚠ xong nhưng cần xem, ⏸ tạm dừng, ❌ lỗi; *khi không xem CCoding* hoặc *luôn luôn*; âm báo; **chỉ hiện mã nhiệm vụ** (nhãn Bảo mật/Hạn chế luôn chỉ hiện mã). Thông báo chỉ có tiêu đề + trạng thái; bấm vào mở đúng hội thoại. Cần mở CCoding qua `http://127.0.0.1`/`localhost` (trình duyệt chặn thông báo ở địa chỉ không an toàn khác).

## Duyệt và gộp (UX-2, 1/11/2026)

- **📝 Duyệt kế hoạch trước khi thực thi** — tích *Duyệt kế hoạch trước khi thực thi* trong ⚙ Tùy chọn của ô soạn, hoặc đặt *Duyệt kế hoạch: Luôn…* trong form dự án (mọi nhiệm vụ của dự án; nhiệm vụ gửi `options.planApproval: false` để tắt riêng). Sau khi chốt kế hoạch, nhiệm vụ **tạm dừng với lý do "chờ duyệt kế hoạch"** (lệnh chuẩn bị + baseline vẫn chạy xong). Hộp duyệt (hội thoại và trang nhiệm vụ): mỗi hạng mục sửa được tiêu đề, mô tả/tiêu chí xong, **người làm** (chỉ nhân sự của phòng/dự án, kèm năng lực công cụ: chạy lệnh / đọc-ghi / chỉ đọc), **phụ thuộc** ("S1, S2" — chặn tự phụ thuộc, phụ thuộc không tồn tại, phụ thuộc vòng), **bỏ** hạng mục (bỏ luôn khỏi phụ thuộc của hạng mục khác); ước tính token; chỉ dẫn kèm khi duyệt (thành chỉ dẫn bổ sung). **✅ Duyệt & thực thi** / **💾 Lưu thay đổi** / **↺ Bỏ sửa** / **Hủy nhiệm vụ**. Bản nháp sửa giữ khi trang vẽ lại. Bấm "Tiếp tục" thường cũng là duyệt. **Cổng duyệt nằm ngay trước pha thực thi**: hủy rồi tiếp tục, hay yêu cầu sửa (bị từ chối khi còn kế hoạch chờ duyệt) đều không bỏ qua được bước duyệt. Ước tính vượt ngân sách được cảnh báo trên hộp duyệt và kiểm lại một lần sau khi duyệt (chế độ "dừng khi chạm trần" → tạm dừng vì ngân sách). `defaults.planApprovalMinutes` > 0 (cấu hình máy) → tự duyệt khi chờ quá số phút đó (mặc định 0 = chờ). Giao riêng cho một agent không có bước này. Thông báo trình duyệt có loại *📝 Kế hoạch chờ duyệt*. `POST /api/tasks/<id>/plan { department?, subtasks: [{ id, assignee?, dependsOn?, title?, description?, remove? }], approve?, note? }`.
- **💬 Bình luận theo dòng trên diff** (tab 🧬 Thay đổi): bấm **số dòng** bên trái (dòng mới hoặc dòng bị xóa) → gõ bình luận (`Ctrl+Enter` lưu). Bình luận lưu nháp trong trình duyệt theo nhiệm vụ (`localStorage`), hiện ngay dưới dòng; khi xong bấm **Gửi thành yêu cầu sửa…** → mỗi bình luận chọn hạng mục nhận sửa (gợi ý "✓ đã sửa tệp này" theo commit `CCoding <task> S2:` / commit gộp hạng mục / lệnh ghi tệp trong nhật ký), ghi chú chung → một vòng sửa, **mỗi bình luận một lỗi** `[major]` kèm `tệp:dòng` + dòng code → reviewer duyệt lại → viết lại báo cáo. `POST /api/tasks/<id>/review { decision: "reject", note?, issues: [{ subtask, comment, department? }] }`; `GET /api/tasks/<id>/diff?owners=1`.
- **Thẻ tóm tắt hoàn tất** (đầu báo cáo trong hội thoại, đầu trang nhiệm vụ): thời gian, token, hạng mục xong/tổng (+ số phải sửa), thay đổi +/− · số tệp, lệnh kiểm tra trước → sau, review, nhánh / commit đã đẩy.
- **🚀 Sẵn sàng gộp…** (nhiệm vụ trên nhánh git của dự án, không chạy): kiểm review đã duyệt, lệnh kiểm tra, phần chưa commit trong worktree, **dòng thêm mới trông như khóa/mật khẩu**, fast-forward được vào nhánh xuất phát hay không (fetch remote; không được thì liệt kê tệp xung đột bằng `git merge-tree`), nhánh đã đẩy chưa. Nút **⬆ Đẩy nhánh** (`git push <remote> <sha>:refs/heads/<nhánh nhiệm vụ>`), **⏩ Đẩy vào <nhánh xuất phát>** (chỉ khi nhánh xuất phát của dự án dạng `origin/<nhánh>` và là fast-forward; review chưa duyệt / lệnh kiểm tra hỏng → hỏi "vẫn đẩy?"), **↗ Mở PR trên GitHub** (trang so sánh, sau khi đã đẩy nhánh). **Không bao giờ `--force`**; đẩy đúng commit đã kiểm (sha); chặn khi còn tệp chưa commit hoặc kế hoạch chưa duyệt; dòng giống khóa/mật khẩu (quét **toàn bộ phần sẽ đẩy**, kể cả commit kế thừa từ nhiệm vụ trước, báo `tệp:dòng`) phải xác nhận là dữ liệu thử; fast-forward chỉ khi hỏi được remote và nhánh xuất phát có thật trên remote (`origin/HEAD` không được coi là nhánh); cảnh báo cần xác nhận "vẫn đẩy": review chưa duyệt / không có review, lệnh kiểm tra hỏng, nhiệm vụ chưa xong, **gồm commit của nhiệm vụ trước** (việc nối), xung đột, không hỏi được remote. Lệnh git chạy bất đồng bộ, không hỏi đăng nhập (`GCM_INTERACTIVE=never`). Hội thoại ghi "🚀 Giám đốc đẩy…", nhật ký `ship.push`. `GET /api/tasks/<id>/ship` (ref cục bộ), `POST /api/tasks/<id>/ship { action: "check" }` (hỏi remote), `{ action: "push" | "ff", override?, allowSecrets? }`.
- **Việc nối làm tiếp trên nhánh của việc trước**: giao tiếp nối trong cùng dự án repo → worktree mới tách từ **nhánh của nhiệm vụ trước** (thay đổi chưa gộp đã có sẵn; diff của việc mới chỉ gồm phần mới). Bỏ tích **🌿 nối tiếp nhánh** ở ô trả lời để tách từ nhánh xuất phát của dự án (`continueBranch: false`). Nhánh trước đã bị xóa → tự quay về nhánh xuất phát.
- Lệnh kiểm tra / `run_command` có đầu ra dài: giữ **phần đầu và phần cuối**, bỏ đoạn giữa (trước đây giữ phần đầu ⇒ `npm test` 592 test chỉ còn dòng `> pkg test`, mất dòng tổng kết).

## Theo dõi song song và điều hướng (UX-3, 1/11/2026)

- **⏱ Dòng thời gian** (tab trong trang nhiệm vụ, `#/task/<id>/timeline`; bảng lệnh → "Dòng thời gian các hạng mục"): mỗi hạng mục một làn, **mỗi lượt gọi agent một thanh theo thời lượng thật** (màu theo pha: lập kế hoạch, họp, thực thi, review, sửa theo review, tổng hợp; lệnh chuẩn bị / lệnh kiểm tra), làn "Lập kế hoạch · họp · review · tổng hợp" của mỗi phòng, khoảng **tạm dừng** (sọc xám), mốc **◆ gộp worktree con**, đoạn **chờ** (hạng mục đã sẵn sàng vì phụ thuộc xong mà chưa bắt đầu — thiếu "ghế"/agent bận), thanh **đang chạy** (sọc chuyển động) và **lỗi / bị ngắt** (viền đỏ). Thanh đầu: tổng thời gian, thời gian tạm dừng, thời gian thực thi (% thời gian chạy), **song song tối đa**, **đường găng** (chuỗi phụ thuộc quyết định thời gian xong, vd. S1 → S2 → S4 · 9 phút — các làn găng có vạch đỏ). Thu phóng 1×/2×/4× (khi một vạch chia dưới 1 phút thì nhãn trục có giây). Khoảng **tạm dừng** gồm cả thời gian chờ sau khi nhiệm vụ lỗi/xong rồi được chạy tiếp, và thời gian server bị khởi động lại giữa chừng (lượt gọi dở lúc đó hiện là **bị ngắt**, không phải "đang chạy"). Đường găng và mốc "sẵn sàng" chỉ tính lượt **thực thi** (lượt sửa theo review chạy sau, không tính). Trang tự làm mới mỗi 5 giây khi việc đang chạy và tab còn mở (vẽ lại theo sự kiện dùng dữ liệu đệm, không gọi lại API); server đọc `calls.jsonl` theo dòng và chỉ đọc phần mới ghi thêm. Dữ liệu từ `calls.jsonl` + nhật ký nhiệm vụ: `GET /api/tasks/<id>/timeline`. (Thay cho kịch bản phân tích chạy tay `analyze-runs.cjs` khi chỉ cần xem đường găng.)
- **📥 Cần bạn** (cột trái, phím `I`, `#/inbox`): mọi việc chờ bạn quyết — 📝 kế hoạch chờ duyệt, ⏸ tạm dừng (ngân sách, hết tài nguyên, thủ công, server khởi động lại), ❌ lỗi, ⚠ xong nhưng cần xem; danh sách bên trái, xem trước bên phải (hộp duyệt kế hoạch / tóm tắt + lệnh kiểm tra + ⚖ duyệt/yêu cầu sửa / hộp tạm dừng). Phím: `J`/`K` (↓/↑) chọn · `Enter` mở hội thoại · `O` trang nhiệm vụ · `1` hành động chính (duyệt kế hoạch kèm bản nháp sửa / duyệt kết quả / chạy tiếp) · `2` hành động phụ (sửa kế hoạch / yêu cầu sửa / +50% ngân sách) · `H` hoãn 4 giờ (bấm lại để bỏ hoãn; lưu trong trình duyệt) · `X` hủy (hỏi xác nhận; chỉ với kế hoạch chờ duyệt / tạm dừng — việc lỗi hay đã xong không cần hủy) · `Z` / `Esc` hoàn tác (chỉ khi có hành động đang chờ). Phím không bị bắt khi đang gõ, khi `Enter` trên một nút đang chọn, khi menu tương tác của văn phòng (`E`) hay bảng lệnh đang mở. **Hành động `1`/`2` chờ 4 giây rồi mới gửi** (thanh "⏳ Sẽ … — Hoàn tác (Z)") — duyệt nhầm không tốn token; bấm việc khác trong lúc chờ thì hành động trước được gửi ngay; bấm lại cùng hành động trên cùng việc thì không gửi lần hai. Tổng quan → "⚠ Cần bạn quyết định" có lối tắt sang hộp này.
- **Bảng lệnh `Ctrl`+`K`** (`⌘K` trên Mac, dùng được cả khi đang gõ): gõ không dấu cũng được ("duyet ke hoach", chữ cái đầu "dtg" → "Dòng thời gian"). Nhóm: **Nhiệm vụ đang mở** (mở hội thoại / trang nhiệm vụ / dòng thời gian / thay đổi / báo cáo / lượt gọi, tạm dừng, chạy tiếp, hủy, duyệt kế hoạch, duyệt kết quả, sẵn sàng gộp, giao lại tương tự, chép mã), **Xem gần đây**, **Đi tới** (mọi màn), **Tạo & thao tác** (nhiệm vụ mới, giao riêng, dự án, prompt, tải tệp, ẩn/hiện văn phòng, thông báo, trợ giúp), **Nhiệm vụ / Dự án / Agent** (khi gõ). `↑`/`↓` chọn · `Enter` chạy · `Esc` đóng.

## Mã ngắn, cây nhiệm vụ, cột trái theo nhóm (UX-4a, 2/11/2026)

- **Mã nhiệm vụ ngắn `CC-94`**: mỗi nhiệm vụ có số thứ tự (`seq` trong `task.json`), nhiệm vụ cũ được đánh số bù theo lúc tạo khi server khởi động. Tiền tố đặt bằng `taskPrefix` trong `ccoding.config.json` (1–8 chữ in hoa/số, vd. `"ICS"`; mặc định `CC`). Mã hiện ở danh sách, trang nhiệm vụ, hộp Cần bạn, bảng lệnh (chép mã), tìm kiếm; URL dùng mã (`#/task/CC-94`, `#/chat/CC-94`); gõ `CC-94` (hoặc mã đầy đủ `T-…`) trong tin nhắn/báo cáo → thành liên kết mở nhiệm vụ (trong khối `code` và trong liên kết ngoài thì giữ nguyên). `GET /api/tasks/CC-94` cũng nhận mã ngắn.
- **Danh sách dạng cây** (mặc định ở 📋 Nhiệm vụ và trang dự án; nút 🌳 / ☰ bảng / ▦ lưới): nhiệm vụ gốc → **hạng mục** (S1, S2… kèm người làm) → **nhiệm vụ con** (việc nối tiếp, việc tách từ hạng mục), lồng nhiều tầng. Mỗi dòng: biểu tượng trạng thái (○ chờ · ◔ đang chạy · ✓ xong · ✕ lỗi · ‖ tạm dừng · − hủy/bỏ qua · ! cần xem), mã, nhãn **● đang chạy**, **↳ n đang chạy** (cộng dồn việc đang chạy bên dưới), chờ duyệt kế hoạch / cần xem, tên, dự án, người làm, thời gian tương đối (vừa xong · 7 phút · 2 giờ · 3 ngày). Xếp theo "Mới cập nhật" thì có vạch **Cũ hơn một ngày**. Nhánh đang chạy hoặc còn việc con chưa xong tự mở; bấm ▸/▾ (hoặc ←/→) để mở/đóng — trình duyệt nhớ 300 lần gần nhất; ↑/↓ chuyển dòng, `Enter` mở. Tổng quan dùng dòng gọn (không lồng).
- **Cột trái xếp theo nhóm** (giống các ứng dụng quản lý việc): 🔎 Tìm (mở bảng lệnh Ctrl+K) · 🏠 Tổng quan **● n** (nhiệm vụ đang chạy thật, không tính việc chờ) · 📥 Cần bạn — **Làm việc**: Nhiệm vụ, Dự án (các dự án hiện ngay bên dưới, theo hoạt động gần nhất, kèm số việc đang chạy), Prompt, Gắn sao, Thư viện prompt — **Tổ chức**: Nhân sự, Token, Hạn mức, KPI, Nhật ký — **Agent đang làm** (ảnh, tên, số việc; bấm mở hồ sơ) — **Gần đây** (6 nhiệm vụ cập nhật gần nhất, chấm xanh = đang chạy) — đồng hồ token.

## Gợi ý tiếp theo (chưa làm)

Lộ trình UX-2/UX-3 (rà soát 1/11/2026, so với Devin, Codex, Copilot, Cursor, Conductor, LangSmith, Linear…):

- Tiếp theo: biểu đồ xu hướng token/KPI; chạy bản thử ứng dụng trong worktree (`previewCommand`); "ghế" song song theo vai trò (dòng thời gian cho thấy đoạn *chờ*).
- Khác: tải gói sản phẩm (.zip); bảng điều khiển trên điện thoại; chủ đề sáng/tối và cỡ chữ; dấu "!" trên nhân vật văn phòng khi việc cần bạn.
