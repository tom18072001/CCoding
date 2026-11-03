'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('hidden/UNITS.GB', () => { assert.equal(UNITS.GB, 1073741824); });
test('hidden/format GB nguyên', () => { assert.equal(formatSize(3 * 1024 ** 3), '3 GB'); });
test('hidden/format GB lẻ', () => { assert.equal(formatSize(1.5 * 1024 ** 3), '1.5 GB'); });
test('hidden/parse GB', () => { assert.equal(parseSize('2GB'), 2147483648); });
test('hidden/parse gb thường, khoảng trắng', () => { assert.equal(parseSize(' 1.5 gb '), 1610612736); });
test('hidden/validate', () => { assert.equal(isValidUnit('gb'), true); assert.equal(isValidUnit('GB'), true); assert.equal(isValidUnit('TB'), false); });
test('hidden/parse cũ, lạ và 0.5GB', () => { assert.equal(parseSize('10MB') + parseSize('1GB'), 1084227584); assert.throws(() => parseSize('1TB'), TypeError); assert.equal(parseSize('0.5GB'), 536870912); });
test('hidden/format sát và đúng ngưỡng GB', () => { assert.equal(formatSize(1024 ** 3 - 1024 ** 2), '1023 MB'); assert.equal(formatSize(1024 ** 3), '1 GB'); });
