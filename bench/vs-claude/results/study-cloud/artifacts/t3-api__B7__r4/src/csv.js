'use strict';

const COLUMNS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') {
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    return /[,"\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  return String(v);
}

function toCsv(tasks) {
  const lines = [COLUMNS.join(','), ...tasks.map((t) => COLUMNS.map((c) => cell(t[c])).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { toCsv };
