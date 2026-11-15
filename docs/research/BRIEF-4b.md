# Đề bài vòng 3, gói 2b, cho Phòng Nghiên cứu (2/11/2026): sửa lỗi review của gói 2, làm mới bảng với C9, ghi nhận pilot

Gói 2 (T-20261102-175854-65c) đã được gộp vào `perf/vs-claude-loop` ở commit 0320f44. Peer-reviewer kết luận "Sửa lớn", CTO chưa nghiệm thu. Gói này chỉ sửa đúng các lỗi đã nêu. Tối đa 3 hạng mục, ngân sách 2,5M token.

## Hạng mục

**F1 — methodologist: sửa `preregistration.md` (lỗi major).** Họ Holm ở §2.5 gồm H1, H2, H3, H6 (K = 4). Nhưng p của H1 và H2 lấy từ phép hoán vị đổi dấu theo bài (`analyze.mjs:51`). Với n bài thì p một phía nhỏ nhất là 1/2ⁿ: H1 ở Nhánh 1 có 3 bài, p ≥ 0,125; ở Nhánh 2 có 4 bài, p ≥ 0,0625. Như vậy H1 và H2 không bao giờ "xác nhận" được, mà §3.1 vẫn ghi "đạt".
- Sửa sao cho mỗi giả thuyết chính kiểm định được với số lượt và số bài thật trước 5/11. Các hướng có thể chọn, lập luận rõ lựa chọn của phòng:
  - hoán vị theo lượt, phân tầng theo bài;
  - thêm bài, gồm t1–t5, `l1-modules`, `l2-chain` đã có `task.json` sau nhiệm vụ Dev T-20261102-175855-1e6;
  - đổi H1/H2 sang ước lượng kèm CI, không còn là phép kiểm xác nhận;
  - tách họ Holm.
- Ghi đề xuất sửa `analyze.mjs` (nếu cần) thành mục SR mới, để Phòng Dev làm. Không tự sửa mã.
- Cập nhật cột "Trước 5/11" ở §3.1 cho đúng.

**F2 — methodologist và data-scientist: sửa 5 lỗi minor.**
1. §4.1 và run-plan §5.0: thống nhất cách chạy lại sau khi loại lượt (cùng khóa và cùng rep, hay rep mới).
2. §4.1 cấm người quyết định loại lượt xem `wallSec`/`tokens`, nhưng tiêu chí Q và T ở §4.3 lại dùng chúng. Ghi ngoại lệ hoặc sửa tiêu chí.
3. `suite-review.md`:
   - dòng 14: "Ba grader regex (a1, r1)" sửa thành hai bài;
   - dòng H10 (khoảng dòng 90): sửa "xem SR-12" thành SR-05;
   - tách SR-08 thành SR-08a (P0) và SR-08b (P1).
4. `run-plan.md` §3: ghi rõ ngay tại chỗ rằng các arm chạy ở cửa sổ khác với cặp A0-sonnet + B0. Phải ghi hash CCoding và thời điểm mỗi cửa sổ. Nếu còn ngân sách, chạy kèm vài lượt B0 làm neo.
5. Thống nhất quy ước tên `ĐK-P_i` và `P_i` giữa backlog §6 và preregistration §3.3.

**F3 — data-scientist: làm mới `token-analysis.md` cho C9.**
- `node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md` đang ĐỎ vì `results/` đã có C9 (một phần).
- Sinh lại bảng để lệnh về exit 0.
- Ghi C9 là vòng dừng giữa chừng do hạn mức. Ghi 4 lượt đã bị loại, xem `context/c9-partial-2026-11-02.md`.

## Dữ liệu mới: pilot bộ đo của giám đốc
Cloud chạy server dựng từ `main` (e0bd2f4), 1 lượt mỗi ô, chưa dùng `--judge`. Mới xong 23/39 lượt lúc giao việc; kết quả đầy đủ sẽ ở `bench/vs-claude/results/pilot1/`.

| Bài | Arm | Điểm | Thời gian | Token có trọng số |
|---|---|---:|---:|---:|
| c1-iis-ecs | A0-sonnet | 1.00 | 13s | 32483 |
| c1-iis-ecs | B0 | 1.00 | 170s | 217148 |
| c1-iis-ecs | B5 | 1.00 | 40s | 58430 |
| c2-burst-alert | A0-sonnet | 1.00 | 10s | 29464 |
| c2-burst-alert | B0 | 1.00 | 150s | 210630 |
| c2-burst-alert | B5 | 1.00 | 40s | 50588 |
| c3-shop-bugs | A0-sonnet | 1.00 | 18s | 41830 |
| c3-shop-bugs | B0 | 1.00 | 160s | 222182 |
| c3-shop-bugs | B5 | 1.00 | 40s | 66644 |
| c4-audit-chain | A0-sonnet | 1.00 | 37s | 64460 |
| c4-audit-chain | B0 | 1.00 | 230s | 276640 |
| c4-audit-chain | B5 | 1.00 | 70s | 95445 |
| c5-tickets-api | A0-sonnet | 1.00 | 34s | 58652 |
| c5-tickets-api | B0 | 1.00 | 350s | 325182 |
| c5-tickets-api | B5 | 1.00 | 70s | 93461 |
| l2-knights | A0-sonnet | 1.00 | 10s | 25206 |
| l2-knights | B0 | 1.00 | 120s | 155093 |
| l2-knights | B5 | 1.00 | 30s | 33957 |
| l4-startup-order | A0-sonnet | 1.00 | 10s | 44810 |
| l4-startup-order | B0 | 1.00 | 160s | 222408 |
| l4-startup-order | B5 | 1.00 | 30s | 42207 |
| re1-lit-synthesis | A0-sonnet | 1.00 | 19s | 41898 |
| re1-lit-synthesis | B0 | 1.00 | 190s | 302089 |
| re1-lit-synthesis | B5 | 1.00 | 30s | 51231 |

**Ghi nhận và cần xét trong F1:**
- Mọi lượt đều đạt 1,00 ở cả ba arm: **chạm trần**. Với các bài này, chất lượng không phân biệt được các arm, chỉ thời gian và token khác nhau.
- B0 tốn khoảng 4–7 lần token và 8–17 lần thời gian so với A0-sonnet. B5 (một agent trong CCoding) tốn khoảng 1,3–2 lần token và 2–4 lần thời gian.
- Nếu chạm trần kéo dài, thì H1 ("CCoding tốt hơn ở việc tách được") và H10 ("lợi thế tăng theo size") không thể đúng về điểm trên bộ 13 bài. Cần bài khó hơn: `l1-modules`, `l2-chain` (192 và 149 test ẩn), t1–t5.
- Ghi hướng xử lý vào đăng ký trước, và đề xuất bài cần thêm. Nêu rõ đây là quan sát pilot n = 1, không phải kết luận.

## Không làm
Không sửa `src/` hay `bench/`. Không viết lại paper hay slide.
