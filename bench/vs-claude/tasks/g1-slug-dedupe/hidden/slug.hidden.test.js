'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, uniqueSlugs } = require('../src/slug');

test('hidden/slugify cắt hai đầu', () => { assert.equal(slugify('--Hi!!'), 'hi'); });
test('hidden/slugify gộp ký tự đặc biệt', () => { assert.equal(slugify('a___b   c'), 'a-b-c'); });
test('hidden/slugify chỉ ký tự đặc biệt', () => { assert.equal(slugify('?!'), ''); });
test('hidden/slugify tiếng Việt', () => { assert.equal(slugify('Đặng Thị Ánh'), 'dang-thi-anh'); });
test('hidden/uniqueSlugs cơ bản', () => { assert.deepEqual(uniqueSlugs(['A', 'a', 'A!']), ['a', 'a-2', 'a-3']); });
test('hidden/uniqueSlugs trùng với hậu tố tự nhiên', () => { assert.deepEqual(uniqueSlugs(['a', 'a', 'a-2']), ['a', 'a-2', 'a-2-2']); });
test('hidden/uniqueSlugs rỗng thành untitled', () => { assert.deepEqual(uniqueSlugs(['!', '?', '']), ['untitled', 'untitled-2', 'untitled-3']); });
test('hidden/uniqueSlugs mảng rỗng', () => { assert.deepEqual(uniqueSlugs([]), []); });
test('hidden/uniqueSlugs không đổi đầu vào', () => { const x = ['B', 'b']; uniqueSlugs(x); assert.deepEqual(x, ['B', 'b']); });
