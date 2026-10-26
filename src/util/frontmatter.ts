import YAML from 'yaml';

export interface Parsed<T> {
  data: T;
  body: string;
}

/** Tách YAML frontmatter (--- ... ---) khỏi phần thân Markdown. */
export function parseFrontmatter<T = Record<string, unknown>>(text: string, file = '<inline>'): Parsed<T> {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!src.startsWith('---\n')) return { data: {} as T, body: src.trim() };
  const end = src.indexOf('\n---', 4);
  if (end < 0) throw new Error(`${file}: frontmatter không đóng bằng ---`);
  const yamlText = src.slice(4, end);
  let data: unknown;
  try {
    data = YAML.parse(yamlText) ?? {};
  } catch (e) {
    throw new Error(`${file}: YAML lỗi — ${(e as Error).message}`);
  }
  const rest = src.slice(end + 4).replace(/^[^\n]*\n/, '');
  return { data: data as T, body: rest.trim() };
}
