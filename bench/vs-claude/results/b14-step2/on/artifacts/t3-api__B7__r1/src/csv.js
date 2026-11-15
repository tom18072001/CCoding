'use strict';

const COLUMNS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(tasks) {
  const rows = [COLUMNS.join(',')];
  for (const t of tasks) rows.push(COLUMNS.map((c) => cell(t[c])).join(','));
  return '﻿' + rows.join('\r\n') + '\r\n';
}

module.exports = { toCsv, cell };
