import test from 'node:test';
import assert from 'node:assert';
import { formatFileSize } from '@shared/format';

test('File size formatting helper logic', () => {
  assert.strictEqual(formatFileSize(0), '0 B');
  assert.strictEqual(formatFileSize(512), '512 B');
  assert.strictEqual(formatFileSize(1536), '1.5 KB');
  assert.strictEqual(formatFileSize(2 * 1024 * 1024), '2.0 MB');
});
