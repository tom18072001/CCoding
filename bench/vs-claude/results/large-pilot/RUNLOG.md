# Sổ chạy E3: thí điểm bài lớn (đợt 3e, V4-3e-E3)

Phân loại dữ liệu: **Nội bộ**. Bài tổng hợp, không có dữ liệu thật.

| Mục | Giá trị |
|---|---|
| Duyệt | Giám đốc duyệt đợt 3e lúc 10:02 ngày 4/11/2026, giờ VN. E3 chuyển sang local theo §9 khối (c), sai lệch ghi lúc 10:05 |
| Server 7425 | Máy giám đốc, worktree `ccoding-3e` tại `6c454f67518244af6724ca68037613f99e34ab46` (xem `results/local-3e/RUNLOG.md`) |
| Claude Code CLI | 2.1.312, ghi vào từng dòng (`claudeCliVersion`) |
| Lệnh | `run3e.ps1` phần E3: `--arms A0-sonnet,B0,B1 --tasks l1-modules,l2-chain --repeats 1 --timeout 40 --out bench\vs-claude\results\large-pilot` |
| Thời gian | `2026-11-04T11:12:16+07:00` → `12:03:05+07:00`, exit 0, một lần chạy, không chờ hạn mức |

## Kết quả chạy (không có điểm)

| Arm | Lượt `done` | Lỗi hạ tầng | Rò rỉ | Token có trọng số | USD quy giá Sonnet 5.5 | Thời gian thực |
|---|---|---|---|---|---|---|
| A0-sonnet | 2/2 | 0 | 0 | 0,91 M | 1,90 (khớp `costUsd`) | 11 phút |
| B0 | 2/2 | 0 | 0 | 1,53 M | 3,32 | 22 phút |
| B1 | 2/2 | 0 | 0 | 1,53 M | 3,32 | 18 phút |

- Wall-sum 0,84 giờ. `quotaState` rỗng, không chạm hạn mức.
- `costUsd` của arm CCoding là `null` với `costBasis: unknown-model`. Bảng giá chưa nhận tên model đầy đủ `claude-sonnet-5-5` / `claude-haiku-5-5` mà server local ghi. Cột USD ở trên tính tay bằng giá Sonnet 5.5 (in $2, out $10, ghi cache 1 giờ $4, đọc cache $0,10 mỗi triệu token), nên phần Haiku bị tính cao hơn thực. Đây là lỗi ghi chi phí, không làm hỏng lượt nào; chuyển cho Phòng Dev.
- Cả bốn lượt CCoding có đủ bản ghi cổng b02, b10 và cto. Chúng là "lượt sạch" cho E4 theo V4-3e-E4 (3).

## Thước đo chính của E3: pha `discuss` của B0

**Kết quả: không có.** Cả hai lượt B0, và cả hai lượt B1, chạy **làn nhanh** (`lane: fast`). Các pha ghi được chỉ có `route`, `plan`, `execute`, `accept`.

- **Nguyên nhân (đọc mã, không phải đọc điểm):**
  - Khi không ép làn, `chooseLane` (`src/lane.ts`, quy tắc 3) quyết định. Nhật ký `lane.pick` của server ghi:
    - **l1-modules:** 5 phần độc lập, chọn làn nhanh.
    - **l2-chain:** 7 tệp hoặc thư mục nhưng nối tiếp phụ thuộc, chọn làn đơn. Cả hai lượt đều nâng lên làn nhanh (`escalatedFrom: single`). Đích nâng là làn nhanh vì đề bài ngắn hơn `fastLane.maxBriefChars`.
  - Làn nhanh **luôn bỏ họp**: điều kiện `task.lane !== 'fast'` ở `src/orchestrator.ts`, khối "Họp thảo luận + chốt". Làn đơn thì không có pha họp.
  - Lựa chọn làn là hàm thuần của đề bài và repo, đích nâng làn cũng cố định. Vì vậy lượt B0 nào trên hai bài này cũng không có pha họp, dù có nâng làn hay không.
- **Hệ quả theo V4-3e-E3 (8):** B-15 **không đo được** trên `l1-modules` và `l2-chain` với arm B0/B1 như đã đăng ký. Theo V4-3e-E5 (8), mọi lượt B0 của E5 sẽ bị loại vì không có `discuss`, kéo theo cả cặp với B1. Vì vậy E5 như đăng ký chỉ cho ô "thiếu dữ liệu".
- **Cách xử lý:** E5 **tạm giữ**, E6 chạy trước, theo khối (b) của §9 (ghi lý do trước lượt đầu của phần bị đổi). Phòng Nghiên cứu quyết định thiết kế lại E5 và ghi §9 trước lượt đầu. Ví dụ: hai arm ép `lane: full`, tức đúng "đối chứng làn đầy đủ" mà V4-3e-E5 (1) mô tả. Giám đốc được báo trong phiên.
- Phần đo phụ (thời gian, token, test ẩn, độ dài kế hoạch) để Phòng Nghiên cứu đọc khi phân tích. Người điều phối không xem điểm.

## Ghi chú §9 (E5′)

- 4/11/2026, sau 12:40 giờ VN (mốc commit nền, chưa có giờ ghi chính xác): **E5′ đã đăng ký** trong `docs/research/preregistration.md` §9, mục `V4-3e-E5′`, trên commit nền `1a31f1f`. **Không có lượt mới** ở `large-pilot`; E5 vẫn tạm giữ, chờ giám đốc duyệt E5′.
