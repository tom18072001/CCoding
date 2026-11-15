# E8: nhật ký chạy

- **Kịch bản:** `results/e7-cto/setup/e78-run.ps1`, phần E8, chạy sau E7 trên cùng máy chạy. Bản ghim `970f2be`, CLI 2.1.318.
- **11:51:17 UTC (13/11/2026):** bật server A (pid 3100, cổng 7428, không cấu hình thêm) và server B (pid 32696, cổng 7429, `e8-b.json` sha256 `c9592e169d28…`). Lệnh: `run.mjs --arms A0-sonnet,B6w4,B6w1 --tasks l1-modules,t2-orders,t3-api --repeats 6 --timeout 30`, runtime claude-cli.
- **12:45:07:** lượt `A0-sonnet × t3-api × r2` gặp hạn mức, lúc đó đã có 14/54. Kịch bản chờ 30 phút rồi chạy tiếp. Không lượt CCoding nào bị tạm dừng (`pauseCount` = 0).
- **15:46:50: 54/54 xong.** Mỗi lần chạy, kịch bản kiểm B6w1 không chạy chồng (0/18) và `authSource` của A0 đều là `none`. Tắt hai server.
- **Sau đợt (16:46–16:48):**
  - Bật lại server A/B trên đúng thư mục data, chạy `p-extract.mjs` (chỉ GET), rồi tắt. Kết quả: `extract-B6w4-serverA.json`, `extract-B6w1-serverB.json` (18 nhiệm vụ mỗi server; nhãn băm, không có nội dung).
  - Chép `runs.jsonl` (sha256 `9e602c3f4469…`), `config.json`, `artifacts/`. 78 chỗ đường dẫn máy ở 37 tệp thay bằng `<root>`; `runs.jsonl` không có đường dẫn nên không đổi.
- **Không có lượt nào bị loại ngoài lượt hạn mức đã chạy lại.** Báo cáo: `report.md`.
