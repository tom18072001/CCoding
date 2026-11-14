// Băm chung của lint: đổi CRLF → LF rồi mới sha256, để cùng nội dung cho cùng mã băm trên Windows (autocrlf) và Linux.
import crypto from 'node:crypto';

/** Chuẩn hóa xuống dòng: \r\n → \n (không đụng \r đơn). Nhận chuỗi hoặc Buffer (đọc như UTF-8). */
export function normalizeEol(input) {
  const s = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
  return s.replace(/\r\n/g, '\n');
}

/** sha256 hex của nội dung đã chuẩn hóa CRLF → LF. */
export function sha256Norm(input) {
  return crypto.createHash('sha256').update(normalizeEol(input), 'utf8').digest('hex');
}
