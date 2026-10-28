# Giao diện: quản lý nhiệm vụ, màn Prompt, phòng giám đốc, hạn mức

Giao diện web (http://127.0.0.1:7420) chỉ phục vụ máy cục bộ, không đăng nhập. Lần đầu mở có **hướng dẫn nhanh**; bấm ❓ (hoặc phím `?`) để xem lại trợ giúp, các chế độ giao việc, nhãn dữ liệu, phím tắt và thuật ngữ.

## Bố cục

| Cột | Nội dung |
|---|---|
| **Trái — điều hướng** | **＋ Mới** (nhiệm vụ, giao riêng, dự án, prompt, tải tệp), các mục chính, cây **Dự án → Nhiệm vụ** (như thư mục), gắn sao, gần đây ngoài dự án, ⛽ token hôm nay. Nút `«`/`»` thu gọn thành dải biểu tượng (mặc định thu gọn ở màn Prompt, nhớ riêng cho từng màn). |
| **Giữa — màn chính** | Kiểu Drive: *Tổng quan* (việc đang chạy, cần quyết định, dự án, gần đây), *Dự án* dạng thư mục (chuột phải/⋮ để thao tác), trang dự án có ô soạn + nhân sự, *Nhiệm vụ* (lọc, sắp xếp, danh sách/lưới, gắn sao, menu chuột phải), trang nhiệm vụ đầy đủ (kế hoạch, sản phẩm, token, nhật ký, lượt gọi, ô soạn cuối trang). Ô tìm `/` tìm nhiệm vụ, dự án, agent. |
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

## Phòng giám đốc

Trong ô phụ 🏢 Văn phòng, bên phải sơ đồ là **Phòng Giám đốc**; nhân vật cà vạt đỏ là bạn.

| Thao tác | Phím / chuột |
|---|---|
| Đi | `W` `A` `S` `D` (mọi lúc trừ khi đang gõ); phím mũi tên khi trỏ chuột/focus ở văn phòng; nhấp đúp lên sàn để đi tới |
| Tương tác với người/phòng gần nhất | `E` → menu, chọn bằng `1`–`9` hoặc ↑/↓ + Enter, `Esc` đóng |
| Mở hồ sơ agent | nhấp vào agent (như trước) |

Menu khi đứng cạnh **agent**: 📝 Giao việc riêng · 💬 Góp ý / đánh giá · 💰 Tăng ngân sách việc đang làm · 👀 Xem hồ sơ · và các mục *vui* (☕ mời cà phê, 🙌 đập tay, 😂 kể chuyện cười, 🌟 khen) — mục *vui* chỉ đổi hình ảnh trên sơ đồ (bong bóng, hiệu ứng; agent rảnh có thể đi pantry rồi tự về), **không** chạm vào nhiệm vụ, token hay log.

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
| `Ctrl`+`Enter` | Giao việc ở ô soạn lớn (cuộc mới, trang dự án, trang nhiệm vụ) |
| `Enter` / `Shift`+`Enter` | Gửi / xuống dòng ở ô trả lời của hội thoại |
| `W` `A` `S` `D` / `E` | Đi / tương tác |
| `Esc` | Đóng hộp thoại, menu, hướng dẫn |

Phím tắt không chạy khi đang gõ trong ô nhập hoặc có hộp thoại mở.

## Gợi ý tiếp theo (chưa làm)

- Tự duyệt/từ chối review bằng tay ngay trong hội thoại.
- Xem diff tệp đã sửa ngay trong nhiệm vụ; tải gói sản phẩm (.zip).
- Thông báo trình duyệt khi nhiệm vụ xong/tạm dừng; ước tính token trước khi giao.
- Bảng điều khiển trên điện thoại: phím ảo cho phòng giám đốc, thanh trên gọn hơn.
- Chủ đề sáng/tối và cỡ chữ; lịch sử yêu cầu đã giao để tìm lại.
