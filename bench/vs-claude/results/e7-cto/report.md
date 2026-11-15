# E7: nghiệm thu của CTO trên lỗi lọt cổng `npm test` — báo cáo kết quả

> Đăng ký trước: `docs/research/preregistration.md` §9 "Bản chốt E7 và E8" (1)–(8), điều kiện đọc của Phòng Nghiên cứu (BRIEF-19 K3), các sai lệch ghi ở §9 và `RUNLOG.md`. Chạy trên máy chạy Windows ngày 13/11/2026: bước 2 từ 03:37 tới 11:51 UTC, chạy lại 16 cặp lúc 16:33–16:45 UTC. Bản ghim cuối `909abb6`, CLI 2.1.318, `dist` sha256 gộp `bbd93f0798e9…` (không đổi trong cả đợt). Phân tích bằng `bench/vs-claude/e7/analyze.mjs`; dữ liệu `runs.jsonl` sha256 `13870b8086cd…`.

## 1. Thiết kế (nhắc lại)

- **Mẫu:** 128 mục (64 sản phẩm có lỗi cài bằng máy mà `npm test` của chính sản phẩm không bắt được, 64 sản phẩm đúng ghép cặp theo bài), lấy từ G. Nhãn kiểm 3 lần: 64/64 mục lỗi trượt test ẩn 3/3, 64/64 mục đúng đạt 3/3 (`label-trials.jsonl`).
- **Ba cách nghiệm thu, cùng văn bản yêu cầu, cùng công cụ chỉ đọc, cùng trần 6 lượt:**
  - **R1:** CTO của CCoding, Sonnet, qua `Orchestrator`;
  - **R2:** như R1 nhưng dùng Opus;
  - **R3:** Claude Code đơn (`claude -p`, Sonnet), cùng văn bản nhưng bỏ phần "vai trò".
- **Phép kiểm chính:** McNemar chính xác hai phía, R1 so với R3, trên 64 mục lỗi; đọc cùng bootstrap hai tầng theo bài. Dưới 10 cặp bất đồng thì p chỉ mô tả.

## 2. Kết quả

Mục chốt: 128.

| Arm | Recall (lỗi bị chặn) | CP 95 % | Bootstrap theo bài | Chặn nhầm (đúng bị chặn) | CP 95 % | Không đọc được kết luận | wtok TB | USD |
|---|---|---|---|---|---|---|---|---|
| R1 | 63/64 = 98,4 % | [91,6; 100,0] | [93,2; 100,0] | 27/64 = 42,2 % | [29,9; 55,2] | 0 | 38.162 | 11,84 |
| R2 | 55/64 = 85,9 % | [75,0; 93,4] | [69,8; 100,0] | 4/64 = 6,3 % | [1,7; 15,2] | 13 | 52.154 | 31,34 |
| R3 | 61/64 = 95,3 % | [86,9; 99,0] | [88,6; 100,0] | 30/64 = 46,9 % | [34,3; 59,8] | 1 | 33.342 | 10,06 |

**Phép kiểm chính (McNemar chính xác, hai phía), R1 so với R3 trên 64 mục lỗi:** chỉ R1 chặn 3, chỉ R3 chặn 1, p = 0,6250. Hiệu recall R1 − R3 = 3,1 điểm % [-5,1; 11,4] (bootstrap hai tầng theo bài). **Đọc: p chỉ mô tả (4 cặp bất đồng < 10).**

R1 − R3 là hiệu của hồ sơ CTO **cộng** lớp vận hành CCoding (BRIEF-19 K3 điều kiện 3), không phải của riêng hồ sơ.

**Phụ (mô tả):**
- R1 so với R2, mục lỗi (n = 64): chỉ R1 chặn 8, chỉ R2 chặn 0, p = 0,0078.
- R2 so với R3, mục lỗi (n = 64): chỉ R2 chặn 2, chỉ R3 chặn 8, p = 0,1094.
- R1 so với R3, mục đúng (n = 64): chỉ R1 chặn 9, chỉ R3 chặn 12, p = 0,6636.
- R1 so với R2, mục đúng (n = 64): chỉ R1 chặn 24, chỉ R2 chặn 1, p = 0,0000.

**Độ nhạy:**
- Coi "không đọc được kết luận" là chặn (§9 E7 (6)): n = 64, chỉ R1 3, chỉ R3 1, p = 0,6250; hiệu 3,1 điểm % [-5,1; 11,4].
- Bỏ `t5-logq` (điều kiện 2): n = 55, chỉ R1 3, chỉ R3 1, p = 0,6250; hiệu 3,6 điểm % [-5,7; 13,1]; đọc: p chỉ mô tả (4 cặp bất đồng < 10).
- Lượt accept lỗi hạ tầng bị ghi nhầm là "không đọc được" rồi phân loại lại và chạy lại (16 cặp: R1 8, R2 8): giữ kết quả như đã ghi lúc đầu: chỉ R1 3, chỉ R3 3, p = 1,0000; bỏ các mục có cặp R1 hoặc R3 bị phân loại lại: n = 62, chỉ R1 3, chỉ R3 1, p = 0,6250.
- R3 chạm trần lượt trước bản sửa 13/11 (2 cặp, ghi nhầm là lỗi hạ tầng rồi chạy lại: 0bb51824b9, e59884e561): coi lượt đầu là không đọc được (không chặn): chỉ R1 3, chỉ R3 1, p = 0,6250; bỏ các cặp này: n = 64, chỉ R1 3, chỉ R3 1, p = 0,6250.

**Chạm trần lượt (dòng done có `capped`):** R1 0, R2 0, R3 1 (R1, R2 không ghi trường này: runtime CCoding xử lý trần lượt bên trong).

**Không đọc được kết luận theo arm:** R1 0, R2 13, R3 1 — **lệch giữa các arm: tách nguyên nhân trước khi đọc recall (điều kiện 3)**.

## 3. Theo bài

| Bài | R1 lỗi bị chặn | R2 lỗi bị chặn | R3 lỗi bị chặn | R1 đúng bị chặn | R2 đúng bị chặn | R3 đúng bị chặn | chỉ R1 / chỉ R3 |
|---|--:|--:|--:|--:|--:|--:|---|
| c1-iis-ecs | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0 / 0 |
| c2-burst-alert | 10/10 | 10/10 | 10/10 | 8/10 | 0/10 | 9/10 | 0 / 0 |
| c3-shop-bugs | 10/10 | 10/10 | 9/10 | 2/10 | 0/10 | 1/10 | 1 / 0 |
| c5-tickets-api | 10/10 | 10/10 | 9/10 | 0/10 | 0/10 | 0/10 | 1 / 0 |
| t1-duration | 4/4 | 4/4 | 4/4 | 3/4 | 3/4 | 1/4 | 0 / 0 |
| t2-orders | 10/10 | 8/10 | 9/10 | 5/10 | 0/10 | 6/10 | 1 / 0 |
| t3-api | 9/10 | 6/10 | 10/10 | 4/10 | 1/10 | 7/10 | 0 / 1 |
| t5-logq | 9/9 | 6/9 | 9/9 | 5/9 | 0/9 | 6/9 | 0 / 0 |

## 4. Recall theo số lần test ẩn trượt khi kiểm nhãn (điều kiện 2; mô tả)

| Trượt | n | R1 | R2 | R3 |
|---|--:|--:|--:|--:|
| 3/3 | 64 | 63 | 55 | 61 |

## 5. Tách nguyên nhân "không đọc được kết luận" (điều kiện 3)

- **R2, 13 lượt** (6 mục lỗi, 7 mục đúng): Opus dừng giữa chừng khi đang đọc mã (chạm trần 6 lượt) nên không viết kết luận. Coi các lượt này là chặn (mô tả) thì R2 chặn 61/64 mục lỗi = 95,3 % và chặn nhầm 11/64 = 17,2 %. Trần 6 lượt bất lợi cho Opus, vì Opus tra cứu nhiều hơn trước khi kết luận.
- **R3, 1 lượt** (mục đúng): chạm trần, không có văn bản.
- **R1:** 0 lượt.
- 16 lượt R1/R2 ban đầu là lỗi xác thực 403 (Cloudflare) chứ không phải kết luận. Chúng được phân loại lại thành lỗi hạ tầng và chạy lại (RUNLOG, §9). Bảng ở mục 2 là sau khi chạy lại; độ nhạy "như đã ghi lúc đầu" cũng ở mục 2.

## 6. Đọc kết quả

1. **Câu hỏi chính, chưa trả lời được bằng phép kiểm:** CTO của CCoding (R1) và Claude Code đơn (R3) cùng chặn gần hết lỗi lọt cổng (98,4 % và 95,3 %). Chúng chỉ bất đồng ở 4 mục lỗi (3 so với 1), nên theo luật đọc, p chỉ mô tả. Hiệu R1 − R3 là +3,1 điểm % với CI [−5,1; 11,4]: chưa đủ để nói lớp CCoding giúp nghiệm thu bắt lỗi tốt hơn, và cũng chưa đủ để nói hai bên tương đương. Mọi phân tích độ nhạy cho cùng cách đọc.
2. **Giá của recall cao là chặn nhầm nhiều:** với Sonnet, cả R1 và R3 chặn nhầm gần một nửa sản phẩm đúng (42,2 % và 46,9 %). Trên bộ này, nghiệm thu bằng Sonnet bắt lỗi chủ yếu nhờ hay từ chối, không phải nhờ phân biệt tốt. Nếu dùng làm cổng thật, cứ khoảng 2 sản phẩm đúng thì có 1 bị trả lại.
3. **Mô hình quan trọng hơn khung (mô tả):** CTO Opus (R2) chặn nhầm chỉ 6,3 %, recall thấp hơn (85,9 %), nhưng tốn khoảng 2,6 lần tiền so với R1. Theo Youden J (recall − tỉ lệ chặn nhầm): R1 0,56, R2 0,80, R3 0,48. So R1 với R2 trên mục đúng: chỉ R1 chặn 24, chỉ R2 chặn 1 (p < 0,0001, mô tả, không hiệu chỉnh đa phép thử).
4. **Theo bài:** chặn nhầm dồn ở `c2-burst-alert` (Sonnet 8–9/10), `t3-api`, `t2-orders`, `t5-logq`. Ở `c5-tickets-api` và `c1-iis-ecs` không bài nào bị chặn nhầm.

## 7. Giới hạn

- Lỗi là lỗi cài bằng máy, không phải lỗi tự nhiên. Mục lỗi được chọn vì lọt `npm test` của chính sản phẩm. 8 bài, 1 nhà cung cấp mô hình, CLI 2.1.318.
- R1 − R3 là hiệu của hồ sơ CTO **cộng** lớp vận hành CCoding, không tách được riêng phần hồ sơ.
- Trần 6 lượt chung cho mọi arm. Opus (R2) chạm trần nhiều hơn hẳn.
- 16 lượt được chạy lại muộn hơn khoảng 6–7 giờ và **sau khi** người điều phối đã xem kết quả chính. Độ nhạy "như đã ghi lúc đầu" và "bỏ mục bị phân loại lại" cho cùng cách đọc.
- Nguyên nhân 403 chỉ xảy ra trên đường runtime của CCoding hiện chưa rõ. Lỗi CCoding dùng thông báo lỗi làm văn bản nghiệm thu đã ghi vào backlog cho Phòng Dev.
