// Nạp module TypeScript của src/ từ rule .mjs bằng đúng mã đang chạy (không chép lại). Dùng tsx (devDependency sẵn có).
import { pathToFileURL } from 'node:url';
import path from 'node:path';

let registered = false;
export async function loadTs(root, rel) {
  if (!registered) {
    const { register } = await import('tsx/esm/api');
    register();
    registered = true;
  }
  return import(pathToFileURL(path.join(root, rel)).href);
}
