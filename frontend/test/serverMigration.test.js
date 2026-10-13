import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateSavedServer } from '../src/serverMigration.js';
test('migration moves only explicitly retired endpoints and preserves custom servers', () => {
  const next = 'https://new.example';
  assert.equal(migrateSavedServer('https://old.example/', next, 'https://old.example'), next);
  assert.equal(migrateSavedServer('https://custom.example', next, 'https://old.example'), 'https://custom.example');
  assert.equal(migrateSavedServer(null, next), next);
  assert.equal(migrateSavedServer('https://old.example', next), 'https://old.example');
});
