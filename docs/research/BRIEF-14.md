# Đề bài vòng 4, gói 8, cho Phòng Nghiên cứu: đăng ký trước đợt đo 3e (B-14, B-12, B-16, B-15, H6) và công cụ phân tích cổng

Gói nhỏ: **3 hạng mục + review, ngân sách 4M token**.
- Chỉ sửa:
  - `docs/research/preregistration.md` §9;
  - `docs/research/run-plan.md`;
  - `docs/research/analysis/`: script và test mới.
- Không sửa `src/`, không sửa `bench/`, không chạy benchmark.
- Phân loại dữ liệu: **Nội bộ**.

## Vì sao
- D9 đã làm xong mọi mục backlog (`docs/research/context/d9-implementation-2026-11-03.md`). Phần còn lại là **đo**.
- Theo `preregistration.md`, mọi phân tích mới phải ghi §9 **trước lượt đầu tiên**. Các mục cần ghi:
  - B-12 trường 6;
  - B-14 trường 6;
  - B-15 trường 6;
  - B-16 trường 6.
- Người điều phối đã soạn kế hoạch chạy ở `bench/vs-claude/RUNBOOK-cloud-session.md` Bước 3e. Kế hoạch gồm 6 phần, ước lượng chi phí ở bảng dưới:
  - E1–E3: chạy trên cloud;
  - E4–E6: chạy local;
  - nhãn người.
- Giám đốc chưa duyệt chạy. Gói này chỉ chuẩn bị để khi được duyệt thì chạy được ngay.

**Ước lượng của người điều phối.**
- **Cách tính:** USD quy giá Sonnet 5.5, gồm vào $2, ra $10, ghi cache 1 giờ $4, đọc cache $0,10 mỗi triệu token. Công thức khớp đúng `costUsd` của A0-sonnet ($0,184 mỗi lượt T5). Lấy trung bình mỗi lượt từ `results/study-cloud` và `results/b7prime`.
- **Bài lớn:** l1 size 5, l2 size 4, nên giả định ngang t5-logq.

| Phần | Nội dung | Số lượt | USD (Sonnet) | Giờ máy |
|---|---|---|---|---|
| E1 | B-14 chẩn đoán cache | 7–8 lượt `claude -p` | ≈ 0,2 | ≈ 0,3 |
| E2 | Thí điểm B-12/B-16: B7cab, B7cabO × g1–g6 × 2; B6 × g3, g4 × 2 (cổng b10 cần pha plan) | 28 | ≈ 14 | ≈ 1,4 |
| E3 | Thí điểm bài lớn: A0-sonnet, B0, B1 × l1, l2 × 1 | 6 | ≈ 8 | ≈ 0,8 |
| E4 | B-12/B-16 chính, N chốt từ thí điểm E2 | 50–92 | 23–44 | 2,3–4,2 |
| E5 | B-15 chính: B0, B1 × l1, l2 × 10 | 40 | ≈ 73 | ≈ 7 |
| E6 | H6 cho đủ N: A1 r = 3, A2 r = 2, B0 r = 3 trên l1, l2, t1–t5, trừ khóa đã có | ≈ 49 | ≈ 32 | ≈ 2,7 |

Arm B là số quy Sonnet. Pha nào chạy Opus thì chi phí cao hơn: theo B-13, `runs.jsonl` mới ghi `model` theo pha.

## Hạng mục

**P1 — methodologist (research-lead duyệt): ghi §9 cho đợt 3e trong `preregistration.md`**

Mỗi phần E1–E6 một dòng V4-xx, ghi đủ:
- giả thuyết hoặc câu hỏi;
- arm, bài, số lượt;
- thước đo chính và phụ;
- phép kiểm và CI;
- quy tắc dừng;
- quy tắc loại lượt;
- hash server: "ghi khi chạy".

Lấy số từ đặc tả đã có, **không đặt lại ngưỡng**:
- **B-12:** cỡ mẫu theo r, q, ρ ở trường 5. Quy tắc < 10 dương thật thì "chưa ước lượng được". Đơn vị phân tích là lần cổng quyết định. Ghi nhãn tại thời điểm cổng (B-12 trường 7(b)). Lượt sạch dùng để đo chặn nhầm, mục tiêu n ≥ 72.
- **B-16:** 12 cặp thí điểm, 5 điểm dừng ở `cache-diagnostic-spec.md` Phần 3, McNemar và Clopper–Pearson.
- **B-14:** bảng diễn giải ở Phần 1, n = 1 mỗi cặp, không dùng p.
- **B-15:** điều kiện "lượt đối chứng phải có pha `discuss`" là quy tắc loại.
- **H6:** quy tắc trần và suy biến v2.1 (a)–(d), không đổi.

Cách chốt N cho E4 từ thí điểm E2 phải là **công thức ghi trước**, không chọn sau khi xem điểm. Cụ thể: ước lượng q, ρ từ E2, rồi lấy N theo bảng C-3 của `agreement.md`.

Ghi thêm:
- thứ tự ưu tiên khi thiếu credit;
- câu "E1–E3 trên cloud trước 5/11 14:59; E4–E6 local bằng hạn mức gói".

**P2 — data-scientist: script phân tích cổng `docs/research/analysis/gates-pairs.mjs` và test**
- **Đầu vào:** `runs.jsonl`, gồm trường `gates.b02 {blocked, rounds}`, `gates.b10 {blocked}`, `gates.cto {pass}`. Các trường này do `gateDecisions()` trong `bench/vs-claude/lib/ccoding.mjs` đọc từ sự kiện `gate.decision` (D9 mục 3.5, 3.6). Thêm nhãn thật theo bài từ `arms.json` `_suites.gates.kinds`.
- **Đầu ra:** CSV `ref,pred,runId,gate,task,arm`, đúng cột mà `agreement.mjs --pairs` đọc.
- **Hai đơn vị:**
  - lần cổng quyết định;
  - mỗi lượt một cặp, để làm độ nhạy.
- **Trường `null`:** cổng không chạy thì lượt đó không vào mẫu của cổng ấy. Ví dụ b10 ở làn đơn: làn đơn không có pha plan.
- **Test:** bằng `runs.jsonl` giả, gồm các ca:
  - b02 chặn rồi vòng sửa chữa xong;
  - b10 `null`;
  - CTO không đạt;
  - lượt sạch.
- Thêm lệnh test vào `node docs/research/scripts/consistency-check.mjs` hoặc ghi lệnh kiểm vào README của `analysis/`.

**P3 — research-lead: cập nhật `run-plan.md`**
- Thêm §5.x "Đợt 3e" khớp RUNBOOK 3e: lệnh, thứ tự, điểm commit.
- Ghi rõ phần nào cloud, phần nào local, và điều kiện chuyển sang local.

**P4 — peer-reviewer: review P1–P3**
- Mỗi dòng §9 có truy được về trường đặc tả trong backlog hoặc spec không?
- Có ngưỡng nào đặt sau khi xem dữ liệu không?
- `gates-pairs.mjs` có khớp tên trường thật trong `bench/vs-claude/run.mjs` không? Phải đọc mã, không đoán.
- Kiểm bằng "🧪 Lệnh kiểm tra của dự án".

## Không làm
- Không chạy benchmark, không gọi `claude -p`.
- Không sửa `paper.md`.
