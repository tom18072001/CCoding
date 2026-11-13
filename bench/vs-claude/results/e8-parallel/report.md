# E8: chạy song song có worktree riêng — báo cáo kết quả

> Đăng ký trước: `docs/research/preregistration.md` §9 "Bản chốt E7 và E8", điều kiện đọc 4–6 của Phòng Nghiên cứu (BRIEF-19 K3). Chạy trên máy chạy Windows ngày 13/11/2026 từ 11:51 tới 15:46 UTC: 54 lượt, 3 bài × 3 arm × 6 lần. Có một lần chờ hạn mức 30 phút sau lúc 12:45; lượt duy nhất gặp hạn mức là một lượt A0-sonnet, đã chạy lại. Bản ghim `970f2be`, CLI 2.1.318.
>
> Server A (7428, cấu hình mặc định, `fastLane.maxParallel` 4) phục vụ B6w4; server B (7429, `e8-b.json` = `{"fastLane":{"maxParallel":1}}`, sha256 `c9592e169d28…`) phục vụ B6w1. Cả hai chạy cùng `dist`, mỗi server một thư mục data. Phân tích bằng `bench/vs-claude/e8/analyze.mjs`; `runs.jsonl` sha256 `9e602c3f4469…`. Xung đột khi gộp lấy bằng `docs/research/analysis/p-extract.mjs` (chỉ GET, sau đợt) ở `extract-*.json`. Đường dẫn máy trong `config.json` và `artifacts/` đã thay bằng `<root>`.

## 1. Thiết kế (nhắc lại)

- **Arm:**
  - **B6w4:** làn nhanh, mỗi hạng mục một worktree riêng, tối đa 4 hạng mục chạy cùng lúc;
  - **B6w1:** giống hệt nhưng chạy lần lượt;
  - **A0-sonnet:** Claude Code đơn, làm mốc.
- **Bài:** `l1-modules`, `t2-orders`, `t3-api`, 6 lần mỗi ô.
- **Thước đo chính:** exp(Δ) của trung bình ln `wallSecTask` (từ lúc tạo nhiệm vụ tới lúc xong) giữa B6w4 và B6w1. Δ tính trong bài rồi lấy trung bình 3 bài. p bằng hoán vị trong bài, CI bằng bootstrap phân tầng.
- **Phụ:** `wallSec` của harness, token có trọng số; mô tả số lượt chạy chồng, xung đột khi gộp, cổng kiểm tra cuối, điểm test ẩn.

## 2. Kết quả chính

| Thước đo | B6w4 / B6w1 | CI 95 % | p | n mỗi ô |
|---|--:|---|--:|---|
| **wallSecTask (chính)** | **0,520** | **[0,488; 0,552]** | **0,0001** | 6/6 ở cả 3 bài |
| wallSec (harness) | 0,530 | [0,498; 0,562] | 0,0001 | 6/6 |
| token có trọng số | 1,008 | [0,942; 1,075] | 0,84 | 6/6 |

- Chạy song song có worktree **rút thời gian hoàn thành còn khoảng một nửa** (−48 %, CI −45 % đến −51 %).
- Không thấy tốn thêm token: tỉ số 1,008, CI chứa 1.
- p là giá trị nhỏ nhất đo được với số hoán vị đã dùng (Monte Carlo), nên chỉ biết p ≤ 0,0001.

## 3. Kiểm cấu hình và mô tả (không p)

| Arm | n | Lượt có ≥ 2 hạng mục chạy cùng lúc | Lượt chia < 2 hạng mục | Cổng cuối đỏ / xanh | Điểm test ẩn TB | Pass |
|---|--:|--:|--:|--:|--:|--:|
| B6w4 | 18 | **17** | 0 | 0 / 18 | 0,995 | 13/18 |
| B6w1 | 18 | **0** (phải là 0) | 0 | 0 / 18 | 0,990 | 15/18 |
| A0-sonnet | 18 | — | — | — | 1,000 | 17/18 |

- **Gộp worktree** (`extract-*.json`):
  - B6w4: 70 lần gộp, 1 tin nhắn xung đột, không ca nào còn xung đột;
  - B6w1: 70 lần gộp, 0 xung đột;
  - không nhiệm vụ nào kết thúc với lệnh kiểm tra đỏ mới, ở cả hai arm.
- **So với Claude Code đơn A0-sonnet** (mô tả; trung bình nhân theo bài, A0 tính `wallSec`):

  | Bài | Thời gian B6w4 / A0 | Thời gian B6w1 / A0 | Token B6w4 / A0 |
  |---|--:|--:|--:|
  | l1-modules | 0,59 | 1,47 | 1,41 |
  | t2-orders | 2,08 | 3,88 | 3,95 |
  | t3-api | 1,36 | 2,07 | 2,11 |

  Chỉ ở bài chia được thành nhiều module (`l1-modules`), song song làm CCoding nhanh hơn agent đơn. Ở hai bài còn lại, CCoding vẫn chậm hơn và tốn 2–4 lần token.
- **Tạm dừng:** không lượt CCoding nào bị tạm dừng (`pauseCount` = 0 ở mọi lượt), nên lần chờ hạn mức không nằm trong `wallSecTask`.

## 4. Đọc kết quả

1. **Bench trước đây không bật song song; lần này đo được lợi ích của nó.** Giữ nguyên cách chia việc và cùng số lượt gọi (trung bình 7,0 lượt gọi và 3,9 hạng mục mỗi nhiệm vụ ở cả hai arm), chạy song song có worktree riêng làm thời gian còn khoảng một nửa (×0,52) mà không tốn thêm token.
2. **Song song bù được phần chậm của chia việc ở bài chia được, chưa bù được ở bài khác.** Ở `l1-modules`, B6w4 nhanh hơn agent đơn khoảng 40 %. Ở `t2-orders` và `t3-api`, B6w4 vẫn chậm hơn 1,4–2,1 lần và tốn 2–4 lần token. Nghĩa là song song giảm được chi phí thời gian của chia việc, nhưng không giảm token. Nên chia việc cho nhiều agent khi việc chia được thành nhiều phần độc lập.
3. **Chất lượng không đổi** (mô tả): điểm test ẩn trung bình 0,995 và 0,990. Pass ở B6w4 thấp hơn 2 lượt, nhưng n nhỏ và không có phép kiểm; ghi lại để theo dõi.

## 5. Giới hạn (điều kiện 4–6 của K3)

- σ_ln 0,178 dùng khi lập kế hoạch lấy từ arm một agent. Nhiều ô có σ = 0 vì `wallSec` lượng tử theo vòng hỏi 10 giây. Hiệu quan sát lớn hơn nhiều so với độ dao động, nên điều này không đổi kết luận.
- Server A và B lẫn với arm (mỗi arm một server). Hai server cùng mã, cùng `dist`, cùng máy, chạy xen kẽ theo cùng lịch (thứ tự arm đổi theo từng lượt), nhưng không loại được hoàn toàn khác biệt do server.
- Chỉ suy ra cho 3 bài này, làn nhanh, CLI 2.1.318, một máy chạy Windows.
