'use strict';

const COLUMNS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

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

/** Chuyển danh sách nhiệm vụ thành CSV (BOM + tiêu đề, RFC 4180, chống chèn công thức). */
function toCsv(tasks) {
  const lines = [COLUMNS.join(',')];
  for (const t of tasks || []) lines.push(COLUMNS.map((c) => cell(t[c])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { toCsv, COLUMNS };
