# SQLite optimization

## Scope

`src/db/optimize.js` adds 12 non-unique indexes for existing query patterns:

- Players: level/XP leaderboard (stable user ID tie-break), gold ordering.
- Monsters: zone lookup.
- Guilds: level/XP leaderboard and existing `LOWER(tag)` / `LOWER(name)` lookups.
- Guild invites: recipient and creation time.
- Player quests: user, claimed state and quest ID.
- Market listings: expiration and newest-first ordering.
- Market sales: latest overall and latest per item.
- Raid bosses: latest ended raid.

The primary keys already index inventory `(user_id,item_id)` and monster drops
`(monster_id,item_id)`. Adding separate indexes for those leftmost lookup keys
would waste space and increase write work, so this change does not do that.
No existing index is dropped. No uniqueness constraints or gameplay data change.

Indexes are created idempotently during startup, with a second pass after deferred
feature migrations to support circular module loading. The first deployment may
start more slowly while SQLite builds indexes; the DB will grow to store them.
Normal existing backups should be retained before deployment as usual.

After startup migrations, `PRAGMA optimize` runs once with `analysis_limit=400`
and the limit is restored afterward. This is bounded statistics maintenance,
not a periodic full `ANALYZE`. It does not change synchronous mode, WAL mode,
foreign key enforcement, or delete historical records. No automatic VACUUM.

## Commands

- `npm run db:check`: opens the existing `DB_PATH` read-only, reports quick_check,
  journal mode, DB/WAL size, reusable free pages and explicit indexes. It does
  **not** run migrations/seed or create a missing DB. It is a diagnostic, not a
  repair tool. Run off-peak because quick_check still reads the database.
- `npm run db:benchmark`: runs synthetic data in memory, never opens DB_PATH.
  Prints timing and `EXPLAIN QUERY PLAN` before/after for 30,000 rows per table.

Example sandbox measurement (100 measured iterations, 5 warmups):

| Query | Before | After |
|---|---:|---:|
| Level leaderboard LIMIT 20 | 2.4554 ms | 0.0267 ms |
| Latest 20 sales for one item | 1.4344 ms | 0.0189 ms |

Both queries changed from table scan + temporary sort to index access without
temporary sorting. These are synthetic results, **not** production measurements
or guaranteed speedups. Small live DBs may show little visible difference.

## Limits and operational safety

Leading-wildcard searches (`LIKE '%term%'`), aggregate counts/sums and deep OFFSET
pagination still have costs; these indexes do not claim to solve those. Measure
actual workload before introducing FTS or cached counters. Indexes cost disk
space and maintenance on writes, so avoid adding indexes indiscriminately.

SQLite reuses free pages internally. A large freelist is not corruption and does
not require VACUUM during gameplay. If disk reclamation becomes necessary, take
and verify a backup, stop bot/web, ensure sufficient disk space, and plan a
separate maintenance window. Never delete live WAL/SHM files to shrink the DB.
Foreign keys are deliberately not enabled here: existing orphan rows and delete
paths need a dedicated audit before changing enforcement.
