'use strict';

const CSV_HEADERS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];
const BOM = '﻿';

/** Escape một ô theo RFC 4180 + chống chèn công thức (chỉ với chuỗi). */
function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(tasks) {
  let out = BOM + CSV_HEADERS.join(',') + '\r\n';
  for (const t of tasks || []) {
    out += CSV_HEADERS.map((h) => escapeCell(t[h])).join(',') + '\r\n';
  }
  return out;
}

module.exports = { toCsv, escapeCell, CSV_HEADERS };
