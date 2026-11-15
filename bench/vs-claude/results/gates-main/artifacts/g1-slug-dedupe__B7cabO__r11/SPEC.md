# slug

- slugify(s): chữ thường, bỏ dấu tiếng Việt (đ → d), mọi chuỗi ký tự không phải [a-z0-9] thành MỘT dấu '-', không có '-' ở đầu/cuối. Chuỗi rỗng hoặc chỉ ký tự đặc biệt → ''.
- uniqueSlugs(titles): trả mảng slug cùng độ dài, theo thứ tự. Slug đã dùng thì thêm hậu tố '-2', '-3'… vào slug gốc cho tới khi chưa dùng (kể cả khi trùng với slug của tiêu đề khác). Slug rỗng thay bằng 'untitled' rồi áp cùng quy tắc.
