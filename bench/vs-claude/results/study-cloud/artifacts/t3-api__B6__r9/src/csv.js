'use strict';

const COLUMNS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function needsQuote(s) {
  return /[,"\r\n]/.test(s);
}

function cell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return needsQuote(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(tasks) {
  let out = '﻿' + COLUMNS.join(',') + '\r\n';
  for (const t of tasks || []) {
    out += COLUMNS.map((c) => cell(t[c])).join(',') + '\r\n';
  }
  return out;
}

module.exports = { toCsv };
