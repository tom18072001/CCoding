'use strict';

const CSV_HEADERS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value) {
  if (value === null || value === undefined) return '';
  let s;
  if (typeof value === 'string') {
    s = FORMULA_START.test(value) ? "'" + value : value;
  } else {
    s = String(value);
  }
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(tasks) {
  const lines = [CSV_HEADERS.join(',')];
  for (const t of tasks || []) lines.push(CSV_HEADERS.map((h) => cell(t[h])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { toCsv, CSV_HEADERS };
