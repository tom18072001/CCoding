'use strict';

const HEADER = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(v) {
  if (v === null || v === undefined) return '';
  let s;
  if (typeof v === 'string') {
    s = /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  } else {
    s = String(v);
  }
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Xuất danh sách nhiệm vụ thành CSV (BOM, CRLF, RFC 4180, chống chèn công thức). */
function toCsv(tasks) {
  let out = '﻿' + HEADER.join(',') + '\r\n';
  for (const t of tasks || []) out += HEADER.map((k) => cell(t[k])).join(',') + '\r\n';
  return out;
}

module.exports = { toCsv };
