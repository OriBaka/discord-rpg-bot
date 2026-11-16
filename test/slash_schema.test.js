const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sameCommands } = require('../src/slash/schema');
const adm = { name: 'adm', description: 'Admin', options: [
  { type: 1, name: 'stats', description: 'Stats' },
] };

test('slash sync detects new backup subcommand despite identical command names', () => {
  const updated = { ...adm, options: [...adm.options, { type: 1, name: 'backup', description: 'Backup' }] };
  assert.equal(sameCommands([adm], [updated]), false);
});

test('slash sync ignores Discord metadata, default fields and top-level ordering', () => {
  const other = { name: 'me', description: 'Profile' };
  const remote = { ...adm, id: '123', version: '456', type: 1, dm_permission: true,
    default_member_permissions: null, options: [{ ...adm.options[0], required: false, autocomplete: false, options: [] }] };
  assert.equal(sameCommands([other, remote], [adm, other]), true);
});

test('slash sync detects option edits and removed commands', () => {
  assert.equal(sameCommands([adm], [{ ...adm, options: [] }]), false);
  assert.equal(sameCommands([adm], []), false);
  assert.equal(sameCommands([adm], [{ ...adm, default_member_permissions: '8' }]), false);
});
