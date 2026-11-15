# Sổ mã MAST (codebook) cho nhãn thách thức C-xx

> Phân loại dữ liệu: **Nội bộ**. Soạn bởi S2 (@literature-researcher), 3/11/2026, **trước** khi hai người gán (S3, S4) bắt đầu. Tệp này **không chứa nhãn của bất kỳ C-xx nào**.
> Nguồn: Cemri et al. (2025), *Why Do Multi-Agent LLM Systems Fail?*, arXiv:2503.13657 **v3** (26/10/2025), bản HTML https://arxiv.org/html/2503.13657v3, đọc 3/11/2026 qua `fetch_url`. Tên kiểu lỗi giữ tiếng Anh nguyên văn; phần diễn giải tiếng Việt là tóm tắt của người soạn.
> Phạm vi đọc: công cụ trả 100.000/160.349 ký tự đầu của trang (đủ các Mục 1–5, Hình 1, Bảng 1–2). Phần cuối (phụ lục sau ký tự 100.000) **chưa đọc**. Mọi chỉ dẫn "Phụ lục A.x" bên dưới do trang nêu, người soạn **chưa đối chiếu nội dung phụ lục**: nếu định nghĩa bên dưới lệch phụ lục, phụ lục thắng.

## 1. Cách dùng

1. Mỗi C-xx nhận **đúng một nhãn** từ danh sách ở §3. Người gán chỉ dựa vào triệu chứng, nguyên nhân gốc và bằng chứng ghi trong `challenges.md`.
2. Nhãn là mã chi tiết (ví dụ `FM-x.y`) hoặc `INF` hoặc `NA`. Nhóm (FM-1/2/3) suy ra từ chữ số đầu của mã.
3. Khi chọn nhãn, đọc **định nghĩa** và **không nhận** của từng FM, rồi áp quy tắc ở §5 nếu còn nhiều ứng viên.
4. Ghi kèm một câu lý do và, nếu có, nhãn ứng viên thứ hai bị loại (để phân xử về sau).

## 2. Ba nhóm của MAST (Hình 1, Mục 4)

| Nhóm | Tên (nguyên văn) | Ý chính | Định vị |
|---|---|---|---|
| FM-1 (FC1) | System Design Issues | Lỗi do đặc tả, vai trò, quản lý bước và điều kiện dừng khi thiết kế hệ | Mục 4; Phụ lục A.1; Hình 1 |
| FM-2 (FC2) | Inter-Agent Misalignment | Lệch pha khi các agent trao đổi, chia sẻ ngữ cảnh, phản hồi nhau | Mục 4; Phụ lục A.2; Hình 1 |
| FM-3 (FC3) | Task Verification | Thiếu hoặc sai khâu kiểm chứng, kết thúc sai lúc | Mục 4; Phụ lục A.3; Hình 1 |

Ghi chú: trang không nêu tỉ lệ cấp nhóm; chỉ nêu tỉ lệ từng kiểu lỗi (Mục 4). Tỉ lệ ở §3 là của **MAST-Data** (hệ khác), không dùng làm tiên nghiệm cho nhãn C-xx.

## 3. 14 kiểu lỗi

Mỗi mục: **tên (nguyên văn)** · định nghĩa tóm tắt · **không nhận** (ranh giới để phân biệt) · định vị nguồn · tỉ lệ trong MAST-Data (Mục 4).

### Nhóm FM-1 — System Design Issues

| Mã | Tên | Định nghĩa tóm tắt | Không nhận | Định vị · % |
|---|---|---|---|---|
| FM-1.1 | Disobey task specification | Không tuân thủ ràng buộc hoặc yêu cầu của tác vụ | Không phải bỏ qua *vai trò* (→ FM-1.2) hay bỏ qua *lời* agent khác (→ FM-2.5) | Mục 4 (FC1); Phụ lục A.1 · 11,8 % |
| FM-1.2 | Disobey role specification | Không tuân thủ vai trò được giao, có thể hành xử như agent khác | Không phải vi phạm yêu cầu tác vụ nói chung (→ FM-1.1) | Mục 4 (FC1); Phụ lục A.1 · 1,5 % |
| FM-1.3 | Step repetition | Lặp lại không cần thiết các bước đã hoàn thành | Không phải quay về trạng thái cũ do mất ngữ cảnh (→ FM-1.4, FM-2.1) | Mục 4 (FC1); Phụ lục A.1 · 15,7 % |
| FM-1.4 | Loss of conversation history | Ngữ cảnh bị cắt bất ngờ, quay về trạng thái hội thoại cũ | Không phải khởi động lại hội thoại có chủ đích hay ngoài ý muốn ở mức phiên (→ FM-2.1) | Mục 4 (FC1); Phụ lục A.1 · 2,80 % |
| FM-1.5 | Unaware of termination conditions | Không nhận ra điều kiện dừng nên tiếp tục không cần thiết | Không phải dừng *sớm* (→ FM-3.1) | Mục 4 (FC1); Phụ lục A.1 · 12,4 % |

### Nhóm FM-2 — Inter-Agent Misalignment

| Mã | Tên | Định nghĩa tóm tắt | Không nhận | Định vị · % |
|---|---|---|---|---|
| FM-2.1 | Conversation reset | Hội thoại bị khởi động lại ngoài ý muốn hoặc không đúng lúc, mất ngữ cảnh | Không phải cắt ngữ cảnh dần (→ FM-1.4) | Mục 4 (FC2); Phụ lục A.2 · 2,20 % |
| FM-2.2 | Fail to ask for clarification | Không hỏi lại khi thông tin chưa rõ, hành động theo giả định sai | Không phải thiếu thông tin do agent kia *giữ lại* (→ FM-2.4) | Mục 4 (FC2); Phụ lục A.2 · 6,80 % |
| FM-2.3 | Task derailment | Lệch khỏi mục tiêu hoặc trọng tâm của tác vụ | Không phải trái ràng buộc cụ thể (→ FM-1.1) | Mục 4 (FC2); Phụ lục A.2 · 7,40 % |
| FM-2.4 | Information withholding | Agent không chia sẻ thông tin quan trọng mà agent khác cần | Không phải agent kia không hỏi (→ FM-2.2) | Mục 4 (FC2); Phụ lục A.2 · 0,85 % |
| FM-2.5 | Ignored other agent's input | Bỏ qua đầu vào hoặc khuyến nghị của agent khác | Không phải bỏ qua đặc tả tác vụ (→ FM-1.1) | Mục 4 (FC2); Phụ lục A.2 · 1,90 % |
| FM-2.6 | Reasoning-action mismatch | Lập luận và hành động không khớp nhau | Không phải kiểm chứng sai (→ FM-3.3) | Mục 4 (FC2); Phụ lục A.2 · 13,2 % |

### Nhóm FM-3 — Task Verification

| Mã | Tên | Định nghĩa tóm tắt | Không nhận | Định vị · % |
|---|---|---|---|---|
| FM-3.1 | Premature termination | Kết thúc hội thoại hoặc tác vụ khi chưa đạt mục tiêu | Không phải không biết điều kiện dừng nên chạy quá (→ FM-1.5) | Mục 4 (FC3); Phụ lục A.3 · 6,20 % |
| FM-3.2 | No or incomplete verification | Không kiểm, hoặc kiểm không đầy đủ, kết quả | Có kiểm nhưng kiểm sai/không đủ sức phát hiện → FM-3.3 | Mục 4 (FC3); Phụ lục A.3 · 8,20 % |
| FM-3.3 | Incorrect verification | Có kiểm chứng nhưng sai hoặc không đủ để bắt lỗi | Không có khâu kiểm nào (→ FM-3.2) | Mục 4 (FC3); Phụ lục A.3 · 9,10 % |

Kiểm: 5 + 6 + 3 = **14**. Tổng các tỉ lệ ghi ở trang là 11,8 + 1,5 + 15,7 + 2,80 + 12,4 + 2,20 + 6,80 + 7,40 + 0,85 + 1,90 + 13,2 + 6,20 + 8,20 + 9,10 = 100,05 % (làm tròn của nguồn; không phải lỗi của người soạn).

## 4. Hai nhãn ngoài MAST

| Mã | Dùng khi | Không dùng khi |
|---|---|---|
| **INF** (hạ tầng) | Nguyên nhân gốc nằm ở môi trường chạy, không ở thiết kế hay hành vi agent: lỗi nhà cung cấp/API, giới hạn tốc độ, hết hạn mức, lỗi shell/hệ điều hành/đường dẫn, lỗi công cụ ghi/đọc tệp, hạ tầng benchmark, lỗi worktree/git thuần kỹ thuật. Do CCoding thêm vì MAST phân tích **vết hội thoại** của agent, không bao phủ lỗi môi trường chạy | Lỗi hạ tầng *bị agent xử lý sai* mà nguyên nhân gốc là hành vi agent (xét FM phù hợp); lỗi do prompt/đặc tả (FM-1) |
| **NA** (ngoài MAST) | Thách thức không phải một lỗi hệ/agent: lỗi phương pháp đo, thống kê, thiết kế thí nghiệm, tài liệu/trích dẫn, quy trình dự án, quyết định phạm vi | Có thể gán một FM hoặc INF dù hơi gượng; xem quy tắc §5 |

MAST là taxonomy lỗi của *hệ đa agent*; INF và NA là mở rộng của CCoding, **không thuộc 14 kiểu của MAST** và phải nêu rõ như vậy khi báo cáo.

## 5. Quy tắc chọn một nhãn duy nhất

Áp theo thứ tự; dừng ở quy tắc đầu tiên quyết định được.

1. **Nguyên nhân gốc, không phải triệu chứng.** Gán theo điều đã gây ra thách thức theo mô tả "nguyên nhân gốc" trong `challenges.md`, không theo hậu quả cuối cùng nhìn thấy.
2. **Trước khi chọn FM, loại INF và NA.** Nếu nguyên nhân gốc là môi trường chạy → `INF`. Nếu không phải lỗi hành vi/thiết kế của hệ agent → `NA`.
3. **Điểm can thiệp.** Nếu nhiều FM cùng khớp, chọn FM ứng với chỗ *sửa* trong `challenges.md` ("cách giải quyết"): sửa đặc tả/vai trò/điều kiện dừng → FM-1.x; sửa luồng thông tin giữa agent → FM-2.x; sửa khâu kiểm → FM-3.x.
4. **Cặp dễ lẫn** (dùng cột "Không nhận" ở §3):
   - có kiểm nhưng sai → FM-3.3; không kiểm hoặc kiểm thiếu → FM-3.2;
   - dừng sớm → FM-3.1; không biết khi nào dừng → FM-1.5;
   - agent kia không được cho thông tin → FM-2.4; agent không hỏi dù thiếu → FM-2.2;
   - trái ràng buộc cụ thể → FM-1.1; trôi mục tiêu chung → FM-2.3; trái vai trò → FM-1.2.
5. **Nhiều lỗi trong một thách thức:** chọn lỗi *xuất hiện sớm nhất trong chuỗi nhân quả* mà nếu sửa thì các lỗi sau không xảy ra. Nếu vẫn hòa, chọn FM có **mã nhỏ hơn** (FM-1 < FM-2 < FM-3, rồi theo số sau dấu chấm) và ghi nhãn thứ hai trong cột lý do. (Quy tắc hòa chỉ để mọi người phân xử cùng cách, không có hàm ý về mức nghiêm trọng.)
6. **Không có nhãn "nhiều FM".** Không gán hai nhãn cho một C-xx. Không dùng `NA` để né quyết định khó giữa hai FM.
7. **Không suy từ tỉ lệ MAST-Data.** Tần suất ở §3 mô tả hệ khác, không dùng để chọn nhãn "nhiều khả năng nhất".

## 6. Giới hạn của sổ mã

- Phụ lục A (định nghĩa chi tiết, ví dụ) **chưa đọc** (xem phần đầu). Cột "Không nhận" là suy luận của người soạn từ tên và định nghĩa ngắn ở Mục 4, **không phải nguyên văn MAST**.
- MAST định nghĩa lỗi trên vết hội thoại của agent; áp vào "thách thức dự án" (gồm quyết định thiết kế, lỗi đo, lỗi hạ tầng) là một chuyển đổi của CCoding. Nhãn FM ở đây là phân loại tương tự, không phải chú thích theo quy trình MAST.
- Sổ mã được đóng băng khi S3/S4 bắt đầu gán; mọi sửa đổi sau đó phải ghi ở CHANGELOG và thông báo cho người phân xử.
