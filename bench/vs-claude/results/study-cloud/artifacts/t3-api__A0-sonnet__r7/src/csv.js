'use strict';

const COLUMNS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(tasks) {
  const lines = [COLUMNS.join(','), ...tasks.map((t) => COLUMNS.map((c) => cell(t[c])).join(','))];
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

module.exports = { toCsv };
