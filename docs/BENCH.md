# Benchtest biến thể (`ccoding bench`)

Đo trước khi đổi mặc định: chạy **cùng một đề bài** trên **cùng một dự án** với từng biến thể tùy chọn nhiệm vụ, xen kẽ, lặp ≥ 2 lần, chỉ khi máy không có nhiệm vụ thật — rồi so với biến thể gốc. Mặc định của CCoding chỉ đổi khi báo cáo cho thấy biến thể **tốt hơn rõ** mà **chất lượng không kém**.

## Vì sao có

Đo 7 gói ND57 chạy bằng claude-cli (1/11/2026): chi phí quy đổi chia ra đầu ra 38 % · ghi cache 34 % · đọc cache 28 %. Kết quả công cụ bị gửi lại ở mọi lượt sau trong cùng lượt gọi (29,9 triệu ký tự ≈ 9,3 triệu token trên 37,3 triệu token đọc cache); bản đồ repo bản đầy đủ (~18,5k ký tự) được đọc trọn rồi gửi lại (tệp `.ccoding/` gửi lại 3,5 triệu ký tự); pha họp 21 lượt ghi cache 303k nhưng chỉ đọc lại 54k. Các ý tối ưu (theo tài liệu tham khảo về tối ưu prompt/cache) đều có thể làm agent phải đọc lại nhiều hơn hoặc làm kém đi — nên đo bằng lượt chạy thật trước.

## Tùy chọn nhiệm vụ đo được

Đặt trong `options` khi giao việc (API `POST /api/tasks`) hoặc trong spec bench; bỏ trống = theo cấu hình (hành vi hiện tại).

| Tùy chọn | Ý nghĩa | Cấu hình toàn cục tương ứng |
|---|---|---|
| `bashMaxOutput` | claude-cli: cắt đầu ra lệnh shell ở N ký tự (`BASH_MAX_OUTPUT_LENGTH`; Claude Code mặc định 30.000). Kẹp 2.000–200.000 | `tools.bashMaxOutput` |
| `repoMapMode` | `full` (bản đồ cũ ≤ 28k ký tự, liệt kê hàm từng tệp) · `compact` (≤ 6k: thư mục theo số dòng, tệp lớn, tệp có route/schema + chỉ mục `.ccoding/<task>/repo-index.md` mỗi dòng `tệp:dòng  loại  tên` để tra bằng search) | `tools.repoMapMode` |
| `phaseModels` | Model theo pha cho riêng nhiệm vụ, vd. `{ "synthesize": "sonnet" }` — ưu tiên hơn model theo agent của dự án | `phases.models` |
| `discussionRounds` | Số vòng họp (0 = bỏ họp) | `defaults.discussionRounds` |
| `variant` | Nhãn lượt bench (CCoding tự đặt `<bench>/<biến thể>#<lần>`) | — |

**Nhiệm vụ có `variant` là lượt đo**: không nhận lịch sử dự án (mọi lượt cùng đầu vào), không vào lịch sử của nhiệm vụ khác, không tự xóa góp ý trong hồ sơ agent. Tiêu đề có tiền tố `[bench <tên> <lượt>]`.

## Spec

```json
{
  "name": "nd57-3d",
  "projectId": "bench-nd57",
  "title": "ND57 Gói 3d (bench)",
  "brief": "…đề bài nguyên văn…",
  "options": { "maxParallel": 3, "maxRevisions": 1, "budgetTokens": 5000000, "runtime": "claude-cli" },
  "variants": [
    { "id": "V0", "label": "Hiện tại", "options": {} },
    { "id": "V1", "label": "Cắt đầu ra shell 12k", "options": { "bashMaxOutput": 12000 } },
    { "id": "V2", "label": "Cắt 12k + bản đồ gọn", "options": { "bashMaxOutput": 12000, "repoMapMode": "compact" } }
  ],
  "repeats": 2,
  "accept": ["node <máy-chạy>/ccoding-bench/accept/run-accept.cjs <máy-chạy>/ccoding-bench/accept/goi3d.test.js app/server/src"],
  "idle": { "quietSec": 180, "pollSec": 20, "maxWaitMin": 720 },
  "runTimeoutMin": 60,
  "gapSec": 0
}
```

- `variants[0]` là gốc. Mỗi lượt: `{ budgetMode: "complete", ...options, ...variant.options, variant }`.
- Thứ tự **xen kẽ, xoay mỗi lần lặp** (V0 V1 V2 · V1 V2 V0 · …) — bù trôi theo thời gian và cache ấm của lượt trước.
- `accept`: lệnh nghiệm thu chạy trong worktree của nhiệm vụ sau khi xong (do người soạn spec viết, coi là tin cậy) — vd. chép **test ẩn** (test của lời giải thật, agent không thấy) vào repo rồi chạy. Exit 0 = đạt.
- `idle.quietSec`: chỉ bắt đầu một lượt khi **không có nhiệm vụ thật nào** đang chạy/chờ trong ngần ấy giây liên tục; chờ quá `maxWaitMin` thì dừng (chạy tiếp bằng `resume`). Nhiệm vụ thật chen vào giữa một lượt → lượt đó ghi "chạy chồng" và không tính thời gian.
- `runTimeoutMin`: lượt quá thời gian bị hủy, ghi hỏng.
- `isolate` (mặc định bật): xong lượt (sau nghiệm thu) thì lưu nhánh nhiệm vụ thành `<lượt>.bundle` (`gốc..nhánh`) + `<lượt>.patch` trong thư mục bench rồi **gỡ worktree + nhánh** khỏi repo dự án — lượt sau không thấy lời giải của lượt trước qua `git log --all`/`git branch`. Xem lại: `git fetch <tệp .bundle> <nhánh>` trong repo dự án, hoặc đọc patch.

Dự án bench nên là **bản sao** repo (clone cục bộ, không `.env`, không remote, chỉ giữ lịch sử tới commit gốc — xóa nhánh/tag khác rồi `git gc --prune=now` để agent không tìm thấy lời giải thật; `baseRef` ghim vào commit đó) với cùng `setupCommands`/`checkCommands`/`denyCommands` như dự án thật — để lượt bench không đụng repo làm việc và mọi lượt cùng điểm xuất phát. Đề bài tốt: một gói đã làm thật (có lời giải để rút test ẩn), cỡ 3–5 hạng mục, ~10 phút.

## Lệnh

```bash
ccoding bench run spec.json --dry-run   # xem thứ tự lượt + tùy chọn từng lượt
ccoding bench run spec.json             # cần server đang chạy; chạy nền được (Start-Process / herdr pane)
ccoding bench ls
ccoding bench resume <id>               # chạy tiếp (lượt đang chạy dở thì theo dõi tiếp, không giao lại)
ccoding bench report <id> [--json]
```

Kết quả ở `data/bench/<id>/`: `spec.json`, `state.json` (ghi sau mỗi lượt), `report.md`, `report.json`.

## Số đo

- **Token quy đổi** = đầu vào + 1,25 × ghi cache + 0,1 × đọc cache + 5 × đầu ra (tỉ lệ giá API, đơn vị token đầu vào) — chỉ số chính, vì gói đăng ký không tính tiền theo token nhưng hạn mức tỉ lệ với khối lượng này. USD do runtime báo chỉ để so tương đối giữa model.
- **Thời gian**: `startedAt → finishedAt` của nhiệm vụ, chỉ lượt "sạch" (không chạy chồng, không tạm dừng).
- **Theo pha**: token quy đổi + giây gọi cộng dồn.
- **Công cụ**: tổng, đọc/tìm (kể cả git chỉ đọc, lệnh shell chỉ đọc), ghi/sửa, lệnh khác (test/build), lỗi; **ký tự gửi lại** ≈ Σ độ dài kết quả công cụ × số lượt còn lại trong lượt gọi.
- **Chất lượng**: hạng mục xong, review cuối duyệt, cờ "cần xem", lệnh kiểm tra của dự án sau cùng đạt, lệnh nghiệm thu đạt.

## Kết luận sơ bộ trong báo cáo

- **Chất lượng kém hơn gốc** (ít lượt xong hơn, tỉ lệ duyệt/kiểm tra/nghiệm thu thấp hơn, nhiều "cần xem" hơn) → không đổi mặc định, dù rẻ hơn.
- **Tốt hơn rõ**: token quy đổi giảm ≥ 10 % **và** dải min–max không chồng với gốc → có thể đổi mặc định.
- Giảm nhưng dải chồng nhau → "nằm trong biên dao động", chạy thêm lượt.

Ít lượt lặp nên không dùng kiểm định thống kê; LLM dao động giữa các lượt — đọc thêm bảng từng lượt trước khi quyết.
