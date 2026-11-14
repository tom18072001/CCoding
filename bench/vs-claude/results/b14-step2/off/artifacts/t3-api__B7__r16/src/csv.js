'use strict';

const COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(tasks) {
  const lines = [COLS.join(','), ...tasks.map((t) => COLS.map((c) => cell(t[c])).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { toCsv };
