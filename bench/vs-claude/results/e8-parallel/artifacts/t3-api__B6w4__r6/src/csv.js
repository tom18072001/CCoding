'use strict';

const CSV_HEADERS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    let s = value;
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[,"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  const s = String(value);
  return /[,"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Chuyển danh sách task thành CSV (BOM, CRLF, chống công thức). */
function toCsv(tasks) {
  const lines = [CSV_HEADERS.join(',')];
  for (const t of tasks || []) lines.push(CSV_HEADERS.map((h) => cell(t[h])).join(','));
  return '﻿' + lines.map((l) => l + '\r\n').join('');
}

module.exports = { toCsv, CSV_HEADERS };
