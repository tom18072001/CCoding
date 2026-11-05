'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');

test('UNITS', () => { assert.equal(UNITS.MB, 1048576); });
test('formatSize', () => { assert.equal(formatSize(1536), '1.5 KB'); assert.equal(formatSize(2 * 1024 ** 2), '2 MB'); });
