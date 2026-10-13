import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseNativeTable } from '../src/nativeTableMode.js';

test('normal Android builds open the LibGDX gameplay table', () => {
  assert.equal(shouldUseNativeTable({ isAndroidShell: true }), true);
});

test('Android gameplay cannot fall through to the React table', () => {
  assert.equal(shouldUseNativeTable({ isAndroidShell: true, reactTableFlag: '1' }), true);
  assert.equal(shouldUseNativeTable({ isAndroidShell: false }), false);
  assert.equal(shouldUseNativeTable({ isAndroidShell: false, reactTableFlag: '1' }), false);
});
