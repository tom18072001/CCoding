/**
 * Ước lượng số token khi runtime không trả về usage (ví dụ một số CLI).
 * Tiếng Việt có dấu thường tốn token hơn tiếng Anh nên ký tự ngoài ASCII được tính nặng hơn.
 * Kết quả luôn được gắn cờ `estimated` trong sổ cái token.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let ascii = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii++;
    else other++;
  }
  return Math.max(1, Math.ceil(ascii / 4 + other / 1.6));
}
