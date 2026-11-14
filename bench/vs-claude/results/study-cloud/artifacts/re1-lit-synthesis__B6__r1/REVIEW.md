# Tổng quan hiện trạng: phát hiện bất thường trên log

Tổng quan này chỉ dựa trên sáu bản tóm tắt trong corpus (P1–P6), đều ghi là hư cấu.

## HDFS-X (split đầy đủ)

LogGraphT [P4] đạt F1 0.962, được chính [P4] mô tả là tốt nhất mà tác giả biết. Tiếp theo là RT-AD [P3] với 0.948 và TF-LAD [P1] với 0.931.

LogBERT-lite [P2] báo cáo 0.971, nhưng trên HDFS-X-small, một tập con 10% có cách chia train/test khác. [P2] nói rõ không chạy split đầy đủ. Khảo sát [P6] cảnh báo kết quả trên HDFS-X-small không so sánh được với split đầy đủ vì tập test dễ hơn. Vì vậy 0.971 không xếp chung nhóm với các kết quả trên. [P6] không xếp hạng phương pháp nào.

## BGL-X

LogGraphT [P4] đạt 0.915, LogBERT-lite [P2] 0.902, TF-LAD [P1] 0.874 và CL-LAD [P5] 0.861. Mức nhãn khác nhau ([P1] và [P3] dùng 80%, [P5] chỉ 0.5%) nên các số này chỉ để tham khảo.

## Tranh luận về parsing

[P1] cho rằng tách log thành template là bước bắt buộc: bỏ parser làm F1 giảm 9–14 điểm trên ba benchmark. [P3] phản bác rằng parsing là tùy chọn. RT-AD trên raw token ngang hoặc vượt mô hình dùng parser, và lỗi parser trên log biến đổi làm hại các hệ thống đó. Trên HDFS-X, RT-AD (0.948) vượt TF-LAD (0.931) [P3]. Hai bài dùng mô hình và thiết lập khác nhau, không có đối chứng trực tiếp, nên chưa thể kết luận bên nào đúng.

## Học với ít nhãn

[P5] tiền huấn luyện contrastive trên log không nhãn rồi fine-tune với rất ít nhãn. Với 0.5% nhãn trên BGL-X, CL-LAD đạt F1 0.861, so với 0.701 của baseline có giám sát cùng ngân sách nhãn. Đây là bằng chứng duy nhất trong corpus ở mức nhãn dưới 1%. [P5] không đánh giá trên HDFS-X.

## Chi phí tính toán

[P4] nêu độ trễ 3.1 ms mỗi session trên một GPU A100 nhưng không báo cáo chi phí huấn luyện. [P2] nêu giới hạn tính toán là lý do không chạy split đầy đủ. Không bài nào nêu năng lượng tiêu thụ.

## Khoảng trống

1. Không có dữ liệu năng lượng, kể cả cho LogGraphT.
2. Thiếu đánh giá thống nhất: các bài dùng split, dataset và mức nhãn khác nhau.
3. Không có so sánh parser và raw-token trong cùng điều kiện giữa [P1] và [P3].

## Tài liệu tham khảo

[P1]–[P6]: các tệp `corpus/P1.md`–`corpus/P6.md`. Corpus không cung cấp tác giả hay DOI.
