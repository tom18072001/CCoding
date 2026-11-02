// Tầng 2 — kiểm tra ngữ nghĩa. Xem SPEC.md mục 5.

const chuaLam = (ten) => { throw new Error(`chưa làm: ${ten}`); };

export function check(program, schema) {
  return chuaLam("check");
}
