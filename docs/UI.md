# Giao diện: phòng giám đốc, giao việc riêng, prompt, hạn mức

Giao diện web (http://127.0.0.1:7420) chỉ phục vụ máy cục bộ, không đăng nhập. Lần đầu mở có **hướng dẫn nhanh 5 bước**; bấm ❓ (hoặc phím `?`) để xem lại trợ giúp, các chế độ giao việc, nhãn dữ liệu, phím tắt và thuật ngữ.

## Phòng giám đốc

Bên phải sơ đồ văn phòng là **Phòng Giám đốc**; nhân vật cà vạt đỏ là bạn.

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
| `1`–`7` | Giao việc · Nhiệm vụ · Nhân sự · Token · Hạn mức · KPI · Nhật ký |
| `W` `A` `S` `D` / `E` | Đi / tương tác |
| `Esc` | Đóng hộp thoại, menu, hướng dẫn |

Phím tắt không chạy khi đang gõ trong ô nhập hoặc có hộp thoại mở.

## Gợi ý tiếp theo (chưa làm)

- Gửi chỉ dẫn bổ sung cho nhiệm vụ **đang chạy** (đưa vào prompt các hạng mục kế tiếp) và tự duyệt/từ chối review bằng tay.
- Xem diff tệp đã sửa ngay trong nhiệm vụ; tải gói sản phẩm (.zip).
- Thông báo trình duyệt khi nhiệm vụ xong/tạm dừng; ước tính token trước khi giao.
- Bảng điều khiển trên điện thoại: phím ảo cho phòng giám đốc, thanh trên gọn hơn.
- Chủ đề sáng/tối và cỡ chữ; lịch sử yêu cầu đã giao để tìm lại.
