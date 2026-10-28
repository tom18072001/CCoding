import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact } from '../src/util/redact.js';

test('redact: che số CCCD 12 chữ số (bắt đầu bằng mã tỉnh 0xx), không che mốc thời gian tên migration', () => {
  assert.match(redact('CCCD 001099012345 của người dùng', { secrets: false, pii: true }), /\[CCCD\]/);
  const mig = 'prisma/migrations/202610290001_decree_scoped_unique/migration.sql';
  assert.equal(redact(mig, { secrets: false, pii: true }), mig);
});
