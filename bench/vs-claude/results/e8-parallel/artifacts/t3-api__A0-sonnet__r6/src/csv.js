'use strict';

const COLUMNS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return String(v);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return /[,"\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function toCsv(tasks) {
  const lines = [COLUMNS.join(','), ...tasks.map((t) => COLUMNS.map((c) => cell(t[c])).join(','))];
  return '﻿' + lines.map((l) => l + '\r\n').join('');
}

module.exports = { toCsv };
