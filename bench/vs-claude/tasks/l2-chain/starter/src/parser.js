// Tầng 1b — bộ phân tích cú pháp. Xem SPEC.md mục 4.

const chuaLam = (ten) => { throw new Error(`chưa làm: ${ten}`); };

export function parse(source) {
  return chuaLam("parse");
}

export function parseProject(files, entry) {
  return chuaLam("parseProject");
}
