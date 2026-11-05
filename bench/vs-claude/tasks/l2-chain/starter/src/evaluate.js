// Tầng 3 — đánh giá thành JSON. Xem SPEC.md mục 6.

const chuaLam = (ten) => { throw new Error(`chưa làm: ${ten}`); };

export function evaluate(program) {
  return chuaLam("evaluate");
}
