'use strict';
// Xuất CSV (RFC 4180) có chống chèn công thức.

const COLUMNS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(tasks) {
  let out = '﻿' + COLUMNS.join(',') + '\r\n';
  for (const t of tasks) out += COLUMNS.map((c) => cell(t[c])).join(',') + '\r\n';
  return out;
}

module.exports = { toCsv };
