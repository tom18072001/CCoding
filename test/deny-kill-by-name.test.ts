import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { deniedReason } from '../src/tools/workspace.js';
import { guardDecision } from '../src/tools/claude-guard.js';

// Chỉ kiểm bằng regex/hàm — KHÔNG spawn lệnh diệt nào.

const POSITIVE: Array<[string, string]> = [
  ['taskkill /F /IM node.exe', 'taskkill /IM'],
  ['taskkill /f /im node', 'taskkill /im không .exe'],
  ['taskkill -im node.exe -f', 'taskkill -im'],
  ['taskkill /F /FI "IMAGENAME eq node.exe"', 'taskkill /FI'],
  ['Stop-Process -Name node -Force', 'Stop-Process -Name'],
  ['Stop-Process -ProcessName node', 'Stop-Process -ProcessName'],
  ['Stop-Process -N node', 'Stop-Process -N'],
  ['Stop-Process -Na node', 'Stop-Process -Na'],
  ['Get-Process node | Stop-Process -Force', 'Get-Process | Stop-Process'],
  ['gps node | kill', 'gps | kill'],
  ['Get-Process node | spps', 'Get-Process | spps'],
  ['killall node', 'killall'],
  ['pkill -f node', 'pkill'],
  ['npm test; pkill node', 'pkill sau dấu ;'],
  ['bash -c "pkill node"', 'pkill trong bash -c'],
  ['wmic process where name="node.exe" delete', 'wmic delete'],
  ['wmic process where name="node.exe" call terminate', 'wmic call terminate'],
  ['kill -1', 'kill -1'],
  ['kill -9 -1', 'kill -9 -1'],
  ['kill -s KILL -1', 'kill -s KILL -1'],
];

const NEGATIVE = [
  'taskkill /PID 1234 /T /F',
  'kill 1234',
  'kill -9 1234',
  'Stop-Process -Id 1234',
  'git log --grep=kill',
  'grep -rn killall src',
  'npm test -- --test-name-pattern=kill',
];

test('deny-kill-by-name: mỗi mẫu có ca dương qua deniedReason', () => {
  for (const [cmd, label] of POSITIVE) {
    const why = deniedReason(cmd);
    assert.ok(why, `${label}: "${cmd}" phải bị chặn`);
    assert.match(why, /diệt tiến trình theo tên/, label);
    assert.match(why, /PID/, label);
  }
});

test('deny-kill-by-name: không chặn nhầm lệnh diệt theo PID hay lệnh vô hại', () => {
  for (const cmd of NEGATIVE) assert.equal(deniedReason(cmd), undefined, cmd);
});

test('deny-kill-by-name: hook claude-guard chặn và không chặn nhầm', () => {
  const cfg = { root: path.resolve('workspaces/nd57/wt-demo'), deny: [], allowGitCommit: true };
  for (const command of ['taskkill /F /IM node.exe', 'pkill -f node', 'Get-Process node | Stop-Process']) {
    assert.match(guardDecision({ tool_name: 'Bash', tool_input: { command } }, cfg) ?? '', /chặn/, command);
  }
  for (const command of ['taskkill /PID 1234 /T /F', 'kill -9 1234']) {
    assert.equal(guardDecision({ tool_name: 'Bash', tool_input: { command } }, cfg), undefined, command);
  }
});
