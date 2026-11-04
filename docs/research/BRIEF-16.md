# Đề bài vòng 4, gói 10, cho Phòng Nghiên cứu: tiếp nhận D11 và kết quả E1, E2; khóa lại bộ bài giữ lại

Gói vừa: **4 hạng mục + review, ngân sách 6M token**.
- Được sửa:
  - `docs/research/` (gồm `paper/paper.md`, `preregistration.md` §9, `improvement-backlog.md`, `self-improvement/holdout-lock.json` và các tài liệu đi kèm);
  - `bench/vs-claude/results/*/RUNLOG.md`.
- Không sửa `src/` hay mã của `bench/`. Không chạy benchmark.
- Phân loại dữ liệu: **Nội bộ**.

## Căn cứ
- **D11 đã gộp** (`902fc78`): làm 26/27 mục SR. Riêng SR-08a còn cần người gán nhãn. Tài liệu: `docs/research/context/d11-suite-review-2026-11-04.md`.
- **Chạy lại `analyze.mjs` mới trên `study-cloud`** làm đảo ba phán quyết (D11 §2):
  - **H2:** từ SUPPORTED thành not supported, vì SR-04 phán theo cận trên CI.
  - **H6:** thành insufficient data, vì tập bài khai báo có n = 0.
  - **H7:** từ not supported thành SUPPORTED, với tỉ số SD gộp 0,00, vì sd gộp của B0 bằng 0.
  - Ngoài ra, H3, H4, H8 và H9 chuyển thành insufficient data.
- **CTO của D11 lưu ý:** phần thống kê mới (`bench/vs-claude/lib/stats.mjs`: `bootP`, `permStratified`, `permTwoSample`, `h6Combine`) chưa ai ngoài người viết đọc mã.
- **Holdout lệch hash:** người điều phối chạy trên Linux thì `holdout-sample-size.mjs --size` báo lệch hash ở cả 10 bài giữ lại, vì D11 sửa `task.json` (SR-05 `sizeBasis`) và `hidden/` (SR-16, SR-17, SR-24…). Bốn test `test/selfimprove.test.ts` (CT-09, CT-12, CT-13, CT-19) đỏ đúng như thiết kế, với thông điệp "báo Phòng Nghiên cứu, không sửa lock". Chưa có lượt A/B nào của B-19.
- **E1 đã xong** (`bench/vs-claude/results/b14-diag/`): đổi bộ công cụ làm h = 0,00; đổi `cwd` vẫn h = 0,98.
- **E2 đã xong** (`bench/vs-claude/results/gates-pilot/`): 28/28 lượt; có sai lệch "lỡ thấy điểm 6 lượt", đã ghi trong RUNLOG.

## Hạng mục

**K1 — data-scientist (research-lead duyệt): khóa lại bộ bài giữ lại B-19**
- Đọc diff của 10 bài giữ lại từ `8b0b6c3` tới `902fc78`. Xác nhận:
  - thay đổi chỉ là sửa bộ chấm hoặc siêu dữ liệu;
  - không làm lộ đáp án;
  - không đổi độ khó theo hướng có lợi cho một nhánh.
- Rồi chạy `--hash`, cập nhật `holdout-lock.json` và các bảng trong `holdout-and-sample-size.md`. Kiểm bằng `--check`.
- Nếu cỡ mẫu đổi thì cập nhật cả tài liệu. Cập nhật kỳ vọng hash trong test, nếu test đọc trực tiếp từ lock.
- Ghi sai lệch vào `preregistration.md` §9: lý do khóa lại, chưa có lượt A/B nào, hash cũ và hash mới.

**K2 — methodologist và peer-reviewer: thẩm định thống kê của D11 và các phán quyết bị đảo**
- **Đọc mã** `bench/vs-claude/lib/stats.mjs` và phần nối vào `analyze.mjs`. Đối chiếu với `preregistration.md` §2.4–§2.7 và quy tắc trần, suy biến v2.1. Thử các ca biên:
  - suy biến;
  - trần;
  - n < 3 bài.
- **H7 với "tỉ số SD gộp 0,00":** quyết định đây là kết quả hợp lệ hay là lỗi suy biến cần quy tắc như H6.
- **H2 và H6:** xác nhận phán quyết mới đúng quy tắc đã đăng ký.
- **So với `prereg-tests.mjs`** (script ngoài đã dùng cho bài báo): chỗ nào hai bên lệch thì ghi rõ con số nào là chính thức.

**K3 — academic-writer (data-scientist kiểm): cập nhật bài báo lên v0.5**
- Cập nhật trong `paper.md`:
  - Bảng 10 (H1–H10) theo K2;
  - §6 và §8 theo kết quả E1: nguồn ghi cache là bộ công cụ đổi theo pha;
  - E2 ở mức mô tả, không có kết luận recall.
- Ghi rõ những gì vẫn chưa có:
  - recall chính thức (E4);
  - bài lớn (E3, E5);
  - H6 đủ N (E6);
  - nhãn người.
- **Đặt tên:** dùng tên dễ hiểu đã dùng ở bộ slide, ví dụ "agent đơn", "làn một agent", "đủ phòng". Lần đầu nhắc mã arm thì kèm định nghĩa. Bài báo không được dùng tên dự án nội bộ hay tài liệu nội bộ.
- `facts.json` và `CHANGELOG.md` đồng bộ.

**K4 — research-lead: phân tích mô tả E2 và đăng ký bước 2 của B-14**
- Chạy `gates-pairs.mjs` trên `results/gates-pilot/runs.jsonl` theo §9 V4-3e-E2: q̂, tỉ lệ bất đồng, chi phí mỗi lượt theo arm.
  - Không suy diễn recall.
  - N của E4 giữ nguyên (R = 16 / 32).
- Viết mục §9 mới cho **bước 2 của B-14**: A/B công tắc `runtimes.claude-cli.stablePrefix`. Ghi đủ bài, arm, số lượt (tính bằng công cụ có sẵn), thước đo, phép kiểm và điểm dừng, trước lượt đầu.
- Cập nhật trạng thái B-12, B-14, B-16 trong `improvement-backlog.md`.

**K5 — peer-reviewer: review K1–K4**
- Có khóa lại nào được làm sau khi đã xem dữ liệu A/B không? Phải không có.
- Mọi phán quyết mới có truy về đúng quy tắc đã đăng ký không?
- Kiểm bằng "🧪 Lệnh kiểm tra của dự án".
- Sau K1, test CT-09, CT-12, CT-13, CT-19 phải xanh.

## Không làm
- Không chạy benchmark, không gọi `claude -p`.
- Không sửa `src/`.
