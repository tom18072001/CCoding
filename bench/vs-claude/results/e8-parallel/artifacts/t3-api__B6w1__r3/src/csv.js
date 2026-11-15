'use strict';

const COLUMNS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(v) {
  if (v === null || v === undefined) return '';
  let s;
  if (typeof v === 'string') {
    s = /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  } else {
    s = String(v);
  }
  return /[,"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(tasks) {
  const lines = [COLUMNS.join(',')];
  for (const t of tasks || []) lines.push(COLUMNS.map((c) => cell(t[c])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { toCsv };
