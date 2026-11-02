# Đe dọa tính hợp lệ — vòng 3 gói 3 (B-01 làn đơn, H5; study-cloud)

Phiên bản 1.0 · 3/11/2026 · S2 (R10a), T-20261103-021358-275 · Phân loại: Nội bộ.

## Tóm tắt

Có sáu đe dọa chính, ba trong số đó ảnh hưởng trực tiếp tới B-01: các arm chạy ở cửa sổ khác nhau, mẫu của A0 trong phân tích chính chỉ 6 lượt mỗi bài, và khóa đăng ký đóng muộn hơn dữ liệu. Hướng thiên lệch chỉ dự đoán được chắc cho hai trường hợp: máy dùng chung (làm `wallSec` của B7 tăng) và trần điểm (làm điểm B7 tiến sát A0, nghiêng về "tương đương"). Mọi con số nói tới ở đây lấy từ `RUNLOG.md`, `config-*.json` hoặc `git log`; tài liệu này **không dùng điểm hay kết quả TOST nào**, và được viết trước khi S1 bàn giao. Mã V3-xx là mã sai lệch ở `docs/research/preregistration.md` §9.

## Tệp đã lưu

- `docs/research/analysis/validity-round3.md` (tệp này)
- `docs/research/preregistration.md` §8 (ô khóa, hash cửa sổ, hash bộ đo) và §9 (V3-01…V3-12, trạng thái SR)

## Thiết kế & RQ

Thực nghiệm so sánh theo bài (khối = bài t1–t5), mỗi ô 9 lượt. Câu hỏi: arm B7 (làn đơn, server nhánh `7fb18ba`) có **tương đương** A0-sonnet trong biên [0,85; 1,15] về token có trọng số, thời gian thực và điểm (B-01, hợp giao ba TOST), và chi phí H5 của các cặp B0/A0, B6/A0, B7/A0 là bao nhiêu. Đây là thiết kế quan sát có can thiệp gán theo lịch xen kẽ, không ngẫu nhiên hoàn toàn (§6); suy diễn chỉ cho các bài đã đo, không khái quát sang tổng thể bài (§2.6).

## Đo lường & mẫu

Các cửa sổ (RUNLOG dòng 12–16; hash ở §8):

| Cửa sổ | Arm | Bài | Server | Bắt đầu → kết thúc (UTC, 2/11/2026) |
|---|---|---|---|---|
| W1 | A0-sonnet, B0 | R9 | `main` `e0bd2f4` | 11:41:23 → 13:15:35 |
| W2a | A0-sonnet, B0 | N4 `--judge` | `main` | 13:35:19 → ~15:05 |
| W2b | A0-sonnet, B6 | t1–t5 r1–3 | nhánh `7fb18ba` | 15:06:56 → 16:19:44 |
| W2c | A0-sonnet, B0 | s1 r4–10 | `main` | 16:21:21 → 16:40:11 |
| B7a | A0-sonnet r4–9, B7 r1–9 | t1–t5 | nhánh `7fb18ba` | 16:41:22 → 19:12:11 |

Số lượt A0 trên t1–t5: W2b r1–3 (15 lượt) + B7a r4–9 (30 lượt) = 45, tức 9 mỗi bài từ hai cửa sổ; B7: 45 lượt (9 mỗi bài). Mẫu B-01 đăng ký là 9 mỗi bài mỗi arm (§4.4(a)).

## Kế hoạch phân tích

Không áp dụng như một kế hoạch mới: kế hoạch nằm ở `preregistration.md` §3.2, §2.3 và kế hoạch nhiệm vụ. Tài liệu này chỉ ghi lại các quyết định cố định **trước** kết quả của S1 mà các đe dọa dưới đây dựa vào:

1. Phân tích chính B-01 dùng A0-sonnet **cùng cửa sổ B7a** (r4–9, 6 lượt mỗi bài). Bản gộp A0 của W2b và B7a (9 mỗi bài) là phân tích độ nhạy. Nếu hai bản cho trạng thái khác nhau thì báo cả hai và lấy bản chính làm kết luận.
2. H5 chỉ ghép cặp trong cùng cửa sổ và cùng server; so B0 với B6/B7 chỉ mô tả.
3. Phương án lùi §2.3 cho SR-01, SR-04, SR-06; không có độ nhạy USD; H3/H6 ghi "chưa đủ N" hoặc ước lượng, không p.

## Đe dọa tính hợp lệ

Hướng thiên lệch là **dự kiến** (lý luận, chưa kiểm bằng dữ liệu); "chưa rõ" nghĩa là không có căn cứ để đoán dấu.

| # | Đe dọa (loại) | Bằng chứng | Hướng thiên lệch dự kiến | Biện pháp |
|---|---|---|---|---|
| 1 | **Các arm chạy ở cửa sổ thời gian khác nhau** (nội tại). B0 ở W1/W2a/W2c, B6 ở W2b, B7 ở B7a; mỗi cặp chỉ so trong cùng cửa sổ, nhưng B6 và B7 không so được trực tiếp ngoài việc cùng A0. Trong B7a, A0 và B7 xen kẽ cùng lệnh nên trôi theo thời gian nhỏ hơn, nhưng cửa sổ dài 2 giờ 31 phút (RL:16). | RL:12–16; lịch xen kẽ `run.mjs:42-52` | Chưa rõ dấu. Nếu hạn mức hoặc tải server dốc dần theo giờ, arm đứng muộn trong cửa sổ bị phạt `wallSec`; ở B7a xen kẽ nên phạt chia gần đều, dấu về 0 | Chỉ ghép cặp trong cùng cửa sổ (§2.5 kế hoạch). Báo thứ tự chạy thực từ `at` (khám phá, §5 mục 7) và so A0 giữa W2b và B7a (đe dọa 2). Không có thay đổi hạn mức: không gặp Q (RL:76) |
| 2 | **Gộp hay tách A0 của W2b và B7a** (nội tại, kết luận thống kê). Quyết định đã chốt **trước kết quả S1**: phân tích chính tách (A0 r4–9 cùng cửa sổ B7a, 6 lượt mỗi bài, dưới 9 của §4.4(a)); gộp (9 mỗi bài, hai cửa sổ cách nhau, W2b 15:06–16:19Z, B7a 16:41–19:12Z) là độ nhạy. Hệ quả: n_A0 = 6 làm bootstrap lấy lại lượt rộng hơn, CI TOST rộng hơn. | V3-07; RL:14, RL:16, RL:76 | Bản chính (n = 6): CI rộng hơn nên khó "tương đương", thiên về **bảo thủ** (không dễ xác nhận B-01). Bản gộp: CI hẹp hơn nhưng trộn hai cửa sổ; nếu A0 trôi theo thời gian thì thiên lệch dấu chưa rõ. Chọn bản có lợi sau khi thấy kết quả sẽ là thiên lệch lựa chọn; vì vậy đã cố định trước | Báo cả hai bản cạnh nhau, lấy bản chính làm kết luận, ghi hai cạnh B-01 có khác trạng thái hay không. Báo thêm phép so A0 W2b với A0 B7a theo bài (mô tả, kèm CI) để định lượng trôi. Không đổi quyết định này sau khi có kết quả |
| 3 | **Máy cloud chạy song song / dùng chung** (nội tại, cấu trúc của `wallSec`). `run.mjs` tuần tự (không tìm thấy `Promise.all` hay hàng đợi song song), nhưng hai server (7424, 7425) cùng máy, thêm trình theo dõi tự commit dừng lúc 18:41Z và khởi động lại (RL:84), và không có bản ghi M thực dùng hay xác nhận giám đốc không dùng CCoding trong cửa sổ. | V3-10; RL:84; `run-plan.md` §2, R1 | `wallSec`: tải nền cộng thêm vào cả hai arm theo xen kẽ, nhưng arm B7 có nhiều lượt gọi và dài hơn (wall dài nhất 380 s so với 124 s của A0, RL:80–81) nên bị ảnh hưởng nhiều hơn theo tỉ lệ tuyệt đối; tỉ số thời gian B7/A0 bị **thổi lên** (nghiêng khỏi tương đương). Token có trọng số và điểm không bị ảnh hưởng | Dùng trung vị theo ô (không dùng trung bình). Báo đuôi trên (wall dài nhất). Kết luận B-01(b) ghi kèm giới hạn "đo trên máy dùng chung, không cô lập". Nếu B-01(b) không tương đương thì cần chạy lại thời gian trên máy cô lập trước khi coi là bác bỏ |
| 4 | **Bài chạm trần** (kết luận thống kê, liên hệ §2.7). t1–t5 từng đạt 1,000 ở 36/36 lượt A0-sonnet (C7–C9; §2.7, §2.5(a)). Nếu cả hai arm ≥ 0,99 ở mọi lượt thì tỉ số điểm ≡ 1, CI suy biến, TOST (c) "đạt" vì trần, không vì tương đương thật. §2.7 loại bài chạm trần khỏi bằng chứng **điểm** (chỉ thời gian và token), nhưng nêu rõ đánh giá trần chỉ bằng pilot, và pilot không có t1–t5. | §2.7; §2.5(a); V3-05 (t4 chấm lại ở `7fb18ba`: null 16/19) | **Thiên về tương đương** (dễ xác nhận giả ở (c)). Dấu ngược chỉ khi grader t4 làm sàn thấp hơn trần ở một arm | Áp quy tắc §2.7 cho (c): bài mà mọi lượt cả hai arm ≥ 0,99 không vào bằng chứng điểm của (c); báo số bài còn lại. Nếu còn ít hơn 3 bài thì (c) ghi "không đủ bằng chứng điểm", và B-01 không được ghi "xác nhận" chỉ dựa trên (a)(b). Đánh giá trần trên dữ liệu xác nhận là sai lệch so với §2.7 ("chỉ bằng pilot"), nên ghi vào §9 nếu S1 phải dùng nó (S3 xử lý) |
| 5 | **Khác server làm nhiễu so sánh B0 với B6/B7** (nội tại). B0 chạy `main` `e0bd2f4`; B6/B7 chạy nhánh `7fb18ba`, khác 11 tệp `src/` (+1257/−32). B0 không chạy t1–t5, nên không có B0 so B7 cùng bài. Mọi chênh B7 so B0 gồm: khác lane, khác mã, khác bài (R9 so T5), khác cửa sổ. | V3-02, V3-03, V3-11; RL:42 | Không đoán được dấu. Hai nguồn chênh (mã `orchestrator`, lane) không tách được từ dữ liệu này | Chỉ mô tả, mọi bảng có chú thích khác server; không có kết luận suy diễn B0 so B6/B7. H5 ghép cặp với A0 cùng cửa sổ và cùng server, nên tỉ lệ H5 của B0 và B7 đều là so với A0 và có thể đặt cạnh nhau như mô tả, không phải như phép so trực tiếp |
| 6 | **Khóa đăng ký muộn hơn lúc dữ liệu đã có** (nội tại, kết luận thống kê). Không có commit khóa; §8 ô khóa trống; script `prereg-tests.mjs` viết sau mọi dữ liệu; commit cuối `preregistration.md` trước vòng này là `9f54757` 12:25:31Z, dữ liệu W1 từ `e51e5fb` 11:44:17Z. Người chạy thấy điểm của 2 lượt t1 r8 (RL:85). Quy tắc loại, biên, hạt, B chỉ được "đóng băng" bằng thứ tự commit của S1. | V3-01, V3-09 | Thiên về dấu của người phân tích: tự do ở quy tắc loại, hạt và cách tính (nếu thay đổi sau khi thấy kết quả) có thể làm TOST "đạt" dễ hơn. Mức tự do thực tế thấp vì §2.3, §4.3, §3.2 đã đăng ký cách tính, biên, hạt 20261102, nhưng số mẫu bootstrap (SR-04) không có trong đăng ký và được chốt B = 4000 hai tầng trong kế hoạch này | Thứ tự hai commit của S1: commit 1 (script, test, quy tắc loại) rồi mới commit 2 (sinh bảng); hash commit 1 và sha256 script ghi ở đầu bảng và ở §8; sau commit 2 không sửa quy tắc loại hay biên. Báo kết luận B-01 kèm nhãn "khóa muộn, phương án lùi §2.3". Độ nhạy bỏ 2 lượt t1 r8 và bỏ bài t1 (V3-09) |
| 7 | **Chế độ chấm bị lẫn** (cấu trúc). `--judge` chỉ ở W2a; điểm t1–t5 chấm bằng grader code; grader regex hay lệch (§6 hàng grader). | V3-08 | Không ảnh hưởng B-01(c) trên t1–t5 (cùng chế độ ở cả hai arm). Ảnh hưởng điểm mô tả N4 so R9/T5 | Không so điểm N4 với R9/T5; chỉ mô tả theo bài |
| 8 | **Ngoại tại** (ngoại tại). 5 bài tổng hợp JS/Node, một mô hình (Sonnet), một runtime; t1–t5 đã dùng để tinh chỉnh CCoding (C1–C8) (§6 hàng ngoại tại). | §6 | Lạc quan cho B7 (đã tinh chỉnh trên đúng các bài này) | Kết luận B-01 giới hạn ở t1–t5, A0-sonnet, `claude-cli`; không nói về bài khác hay Opus |

### Hệ quả cho kết luận

Kết luận "đưa B-01 lên `main`" không thể dựa chỉ vào B-01 đạt: (a) phải có đe dọa 4 được xử lý (số bài không chạm trần cho (c)); (b) đe dọa 3 làm (b) có thể sai theo chiều bất lợi cho B7, nên "không tương đương ở (b)" ít chắc chắn hơn "tương đương ở (b)"; (c) đe dọa 6 buộc nhãn "khóa muộn". B-02 và B-10 không được đo bằng dữ liệu này (đo bằng phát lại B02-M trên ca t5, `preregistration.md` §3.2); điều đó thuộc S3 và không suy ra từ B-01.

## Đạo đức & dữ liệu

Không có người tham gia; không áp dụng đồng ý có hiểu biết. Dữ liệu là nhật ký chạy bench trên bài tổng hợp, phân loại Nội bộ, không có DLCN. Tài liệu không chứa bí mật, khóa hay đường dẫn cloud. Không có thay đổi thiết kế hay luồng dữ liệu nên không cần cập nhật `docs/data-protection-assessment.md`.
