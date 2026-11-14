'use strict';

const CSV_HEADERS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(value) {
  if (value === null || value === undefined) return '';
  let s;
  if (typeof value === 'string') {
    s = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  } else {
    s = String(value);
  }
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Chuyển danh sách task thành chuỗi CSV (BOM, CRLF, RFC 4180, chống chèn công thức). */
function toCsv(tasks) {
  const lines = [CSV_HEADERS.join(',')];
  for (const t of tasks || []) lines.push(CSV_HEADERS.map((h) => cell(t[h])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { toCsv, CSV_HEADERS };
