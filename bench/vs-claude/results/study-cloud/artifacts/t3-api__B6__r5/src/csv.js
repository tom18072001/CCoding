'use strict';

const CSV_HEADERS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

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

function toCsv(tasks) {
  let out = '﻿' + CSV_HEADERS.join(',') + '\r\n';
  for (const t of tasks || []) out += CSV_HEADERS.map((h) => cell(t[h])).join(',') + '\r\n';
  return out;
}

module.exports = { toCsv, CSV_HEADERS };
