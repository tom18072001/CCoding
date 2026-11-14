'use strict';

const COLUMNS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(value) {
  if (value === null || value === undefined) return '';
  let s;
  if (typeof value === 'string') {
    s = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  } else {
    s = String(value);
  }
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(tasks) {
  let out = '﻿' + COLUMNS.join(',') + '\r\n';
  for (const t of tasks || []) {
    out += COLUMNS.map((c) => cell(t[c])).join(',') + '\r\n';
  }
  return out;
}

module.exports = { toCsv };
