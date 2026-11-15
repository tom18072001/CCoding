# range

Khoảng là {start, end}, NỬA MỞ [start, end), số nguyên, start < end.

- overlaps(a, b): true khi hai khoảng có điểm chung. Hai khoảng chỉ chạm đầu mút ([1,3) và [3,5)) KHÔNG chồng.
- mergeRanges(ranges): gộp các khoảng chồng nhau thành khoảng lớn nhất, trả mảng mới sắp theo start. Khoảng chỉ chạm đầu mút giữ riêng. Khoảng có start >= end → RangeError. Không làm thay đổi mảng hoặc đối tượng đầu vào. Mảng rỗng → [].
