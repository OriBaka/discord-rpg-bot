// Compare registration fields, not Discord-generated IDs/version metadata.
function signature(command) {
  const option = o => ({
    type: o.type, name: o.name, description: o.description,
    required: Boolean(o.required), autocomplete: Boolean(o.autocomplete),
    choices: o.choices || [], options: (o.options || []).map(option),
    channel_types: o.channel_types || [],
    min_value: o.min_value ?? null, max_value: o.max_value ?? null,
    min_length: o.min_length ?? null, max_length: o.max_length ?? null,
  });
  return JSON.stringify({
    ...option({ ...command, type: command.type || 1 }),
    default_member_permissions: command.default_member_permissions ?? null,
    dm_permission: command.dm_permission ?? true,
  });
}

function sameCommands(existing, desired) {
  if (!Array.isArray(existing) || existing.length !== desired.length) return false;
  const remote = new Map(existing.map(c => [c.name, signature(c)]));
  return desired.every(c => remote.get(c.name) === signature(c));
}
module.exports = { sameCommands };
