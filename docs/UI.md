# Giao diện: quản lý nhiệm vụ, màn Prompt, phòng giám đốc, hạn mức

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

## Phòng giám đốc

Sơ đồ: hàng trên **Phát triển | Giám đốc | Nghiên cứu**, hàng dưới **Phòng họp | Điều phối | Pantry | Góc giải trí**, hành lang chạy suốt giữa. Hai vách ngăn của phòng Giám đốc có **cửa tắt** sang thẳng phòng Phát triển và phòng Nghiên cứu (đi WASD hoặc nhấp đúp — đường đi tự chọn cửa tắt; nhấp vào cửa mở menu của phòng bên kia). Nhân vật cà vạt đỏ trong phòng Giám đốc là bạn.

| Thao tác | Phím / chuột |
|---|---|
| Đi | `W` `A` `S` `D` (mọi lúc trừ khi đang gõ); phím mũi tên khi trỏ chuột/focus ở văn phòng; nhấp đúp lên sàn để đi tới |
| Tương tác với người/phòng gần nhất | `E` → menu, chọn bằng `1`–`9` hoặc ↑/↓ + Enter, `Esc` đóng |
| Mở hồ sơ agent | nhấp vào agent (như trước) |
| Tương tác với đồ vật / phòng **không cần đi tới** | trỏ chuột (viền vàng + nhãn) rồi nhấp — cùng menu như bấm `E` |

Menu khi đứng cạnh **agent**: 📝 Giao việc riêng · 💬 Góp ý / đánh giá · 💰 Tăng ngân sách việc đang làm · 👀 Xem hồ sơ · và các mục *vui* (☕ mời cà phê, 🙌 đập tay, 😂 kể chuyện cười, 🌟 khen) — mục *vui* chỉ đổi hình ảnh trên sơ đồ (bong bóng, hiệu ứng; agent rảnh có thể đi pantry rồi tự về), **không** chạm vào nhiệm vụ, token hay log.

**Nhấp thẳng vào đồ vật**: 🍱 **bàn ăn pantry → Pantry time** (mọi agent đang rảnh ra pantry nghỉ 30 giây, bảng "PANTRY TIME" đếm ngược, rồi tự về chỗ; agent đang làm không bị gọi), 💧 cây nước, 📺 TV điều phối, bảng phòng họp, 📋 bảng trắng phòng Phát triển, 📚 giá sách phòng Nghiên cứu, cửa các phòng, đàn/máy giải trí, bàn/màn hình/sofa phòng giám đốc.

Menu khi đứng cạnh **phòng/đồ vật**: cửa phòng Phát triển/Nghiên cứu (giao việc cho phòng, xem nhân sự, cổ vũ) · phòng họp (xem cuộc họp đang diễn ra) · điều phối (giao việc tự động) · pantry (pha cà phê, mời cả văn phòng) · bàn giám đốc (📊 bảng điều khiển, giao việc mới, thư viện prompt, hạn mức, trợ giúp) · màn hình trên tường · góc giải trí (🎹 đàn, 🕹 trò "Bắt bug" 15 giây).

**Bảng điều khiển**: token hôm nay, việc đang chạy, agent đang bận, việc cần bạn quyết định (tạm dừng, lỗi, "cần xem"), tài nguyên theo thứ tự chạy (đã dùng, còn lại, chưa đặt khóa, đang tạm ngừng). Màn hình trên tường phòng giám đốc hiện tóm tắt (làm mới 30 giây).

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

## Gợi ý tiếp theo (chưa làm)

Lộ trình UX-2/UX-3 (rà soát 1/11/2026, so với Devin, Codex, Copilot, Cursor, Conductor, LangSmith, Linear…):

- Tiếp theo: biểu đồ xu hướng token/KPI; chạy bản thử ứng dụng trong worktree (`previewCommand`); "ghế" song song theo vai trò (dòng thời gian cho thấy đoạn *chờ*).
- Khác: tải gói sản phẩm (.zip); bảng điều khiển trên điện thoại; chủ đề sáng/tối và cỡ chữ; dấu "!" trên nhân vật văn phòng khi việc cần bạn.
