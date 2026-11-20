// Reproducible audit, never opens the configured/live database when run as CLI.
// Combat executes tactical_turn.evaluate + battle.pickMobAction (production rules).
// Persistence parity and fixture legality are covered by test/build_audit.test.js.
const LEVELS = [8, 18, 30, 40, 45];
const CLASSES = ['melee', 'magic', 'ranged'];
function combinations(xs, n) {
  if (!n) return [[]];
  return xs.flatMap((x, i) => combinations(xs.slice(i + 1), n - 1).map(tail => [x, ...tail]));
}
function gearFor(db, cls, level, style) {
  const { points } = require('../src/game/gear_identity');
  const sources = new Set(db.prepare(`SELECT item_id id FROM shop UNION SELECT item_id FROM monster_drops
    UNION SELECT output_id FROM recipes`).all().map(r => r.id));
  const rows = db.prepare("SELECT * FROM items WHERE type IN ('weapon','armor','offhand','accessory') AND min_level<=? AND (class_req='' OR class_req IS NULL OR class_req=?)").all(level, cls).filter(i => sources.has(i.id));
  const weaponTypes = require('../src/game/classes').CLASSES[cls].weapon_types;
  const select = (filter, value) => rows.filter(filter).sort((a, b) =>
    (style === 'neutral' ? Math.abs(points(a)) - Math.abs(points(b)) : (points(b) - points(a)) * (style === 'attack' ? 1 : -1))
    || value(b) - value(a)
    || a.id.localeCompare(b.id))[0]?.id;
  const eq = {};
  eq.weapon = select(i => i.type === 'weapon' && weaponTypes.includes(i.weapon_type), i => i.atk);
  eq.offhand = select(i => i.type === 'offhand', i => i.atk + i.def);
  for (const slot of ['head', 'chest', 'legs', 'feet', 'hands']) eq[slot] = select(i => i.type === 'armor' && i.armor_slot === slot, i => i.def);
  for (const [slot, type] of [['ring1', 'ring'], ['ring2', 'ring'], ['necklace', 'necklace'], ['special', 'special']]) eq[slot] = select(i => i.type === 'accessory' && i.accessory_type === type, i => i.atk + i.def);
  return Object.fromEntries(Object.entries(eq).filter(([, id]) => id));
}
function makeFixture(db, cls, level, style, uid) {
  const player = require('../src/game/player'), classes = require('../src/game/classes');
  const stats = classes.statsAtLevel(cls, level);
  player.createPlayer(uid, uid);
  player.updatePlayer(uid, { level, primary_class: cls, atk: stats.atk, def: stats.def, hp: stats.max_hp, max_hp: stats.max_hp });
  const eq = gearFor(db, cls, level, style);
  for (const [slot, id] of Object.entries(eq)) {
    player.addItem(uid, id); // includes two copies when the same ring is selected
    require('../src/game/slots').setEquipped(uid, slot, id);
  }
  // Explicit optimistic acquisition assumption, not a claim about farming time.
  const tomes = require('../src/game/skill_tomes');
  for (const s of tomes.catalog().filter(s => s.class === cls && s.level <= level)) {
    player.addItem(uid, tomes.bookId(s.id));
    const learned = tomes.learn(uid, tomes.bookId(s.id));
    if (learned.error) throw new Error(learned.error);
  }
  return { player: player.getPlayer(uid), eq, stats: player.getEffectiveStats(player.getPlayer(uid)),
    stance: require('../src/game/gear_identity').score(Object.values(eq).map(id => require('../src/game/items').getItem(id))) };
}
function initial(fixture, target, ids) {
  const s = fixture.stats;
  return { mode: 'tower', rules_version: 2, round: 1, turn: 'a', status: 'active',
    class_a: fixture.player.primary_class, class_b: '', skills_a: JSON.stringify(ids), skills_b: '[]',
    hp_a: s.max_hp, max_hp_a: s.max_hp, hp_b: target.hp, max_hp_b: target.hp,
    atk_a: s.atk, def_a: s.def, atk_b: target.atk, def_b: target.def, is_elite: target.is_elite ?? target.elite_tier ?? (target.boss ? 2 : 0),
    buffs_a: '{}', buffs_b: '{}', cooldowns_a: '{}', cooldowns_b: '{}', energy_a: 60, energy_b: 60 };
}
function advance(b, actor, action) {
  const r = require('../src/game/tactical_turn').evaluate(b, actor, action);
  if (r.error) throw new Error(`${action}: ${r.error}`);
  return { ...b, ...r.updates, ...(r.winner ? { status: 'ended', winner: r.winner } : {}) };
}
function response(b) {
  return b.status === 'active' ? advance(b, 'b', require('../src/game/battle').pickMobAction(b)) : b;
}
function utility(b) {
  if (b.winner) return b.winner === 'a' ? 10000 + b.hp_a / b.max_hp_a : -10000;
  const own = JSON.parse(b.buffs_a), enemy = JSON.parse(b.buffs_b);
  const dot = (enemy.burn?.value || 0) + (enemy.bleed?.value || 0);
  return (1 - b.hp_b / b.max_hp_b) * 1000 + b.hp_a / b.max_hp_a * 180 + b.energy_a * 0.08
    + dot / b.max_hp_b * 1500 + (own.momentum ? 5 : 0) + (enemy.mark ? 5 : 0)
    + (own.atk_up?.value || 0) * 25 + (enemy.def_down?.value || 0) * 20;
}
function choose(b, policy) {
  if (policy === 'basic') return 'attack';
  const evaluate = require('../src/game/tactical_turn').evaluate;
  const candidates = ['attack', 'defend', ...JSON.parse(b.skills_a)];
  let best = 'attack', value = -Infinity;
  for (const id of candidates) {
    const result = evaluate(b, 'a', id);
    if (result.error) continue;
    let score;
    if (policy === 'greedy') {
      const next = { ...b, ...result.updates };
      score = b.hp_b - next.hp_b;
    } else score = utility(response(advance(b, 'a', id)));
    if (score > value) { best = id; value = score; }
  }
  return best;
}
function fight(start, policy) {
  let b = { ...start }; const actions = {}; let turns = 0;
  while (b.status === 'active' && turns < 120) {
    const id = choose(b, policy); actions[id] = (actions[id] || 0) + 1;
    b = response(advance(b, 'a', id)); turns++;
    if (!Number.isFinite(b.hp_a + b.hp_b + b.energy_a) || b.energy_a < 0 || b.energy_a > 100) throw new Error('Invalid battle state');
  }
  return { winner: b.winner || 'draw', turns, hp: Number((Math.max(0, b.hp_a) / b.max_hp_a * 100).toFixed(1)), actions };
}
function targets(db, level) {
  const tower = require('../src/game/tower');
  const floor = Array.from({ length: 15 }, (_, i) => tower.floorInfo(i + 1)).filter(f => f.level <= level).at(-1);
  const id = level < 18 ? 'elite_wolf' : level < 30 ? 'elite_lich' : level < 40 ? 'boss_demon_king' : level < 45 ? 'boss_wyrm' : 'boss_void_lord';
  return [{ ...floor, id: `tower_${floor.floor}` }, db.prepare('SELECT * FROM monsters WHERE id=?').get(id)];
}
function skillProbes() {
  const skills = require('../src/game/skills');
  return [0, 100, 200, 400, 600].map(def => {
    const a = { atk: 100, hp: 800, max_hp: 1000, buffs: {} }, t = { def, hp: 1000, max_hp: 2000, buffs: { mark: { turns: 3 } } };
    return { def, aimed: skills.getSkill('aimed_shot').resolve(a, t).dmg, falcon: skills.getSkill('falcon_dive').resolve(a, t).dmg };
  });
}
function run(db, sweep = false) {
  const skills = require('../src/game/skills'), builds = require('../src/game/skill_builds');
  const rows = []; const fixtures = []; let seq = 0;
  for (const cls of CLASSES) for (const level of LEVELS) for (const gear of ['neutral', 'attack', 'guard']) {
    const fixture = makeFixture(db, cls, level, gear, `__AUDIT_${++seq}`);
    fixtures.push({ cls, level, gear, stance: fixture.stance, stats: fixture.stats, equipment: fixture.eq });
    const baseline = skills.getSkillsForClass(cls).filter(s => !s.book && s.level <= level).map(s => s.id);
    const base = baseline.slice(0, 4);
    const earned = skills.getSkillsForClass(cls).filter(s => s.book && s.level <= level && s.source.kind !== 'event').map(s => s.id);
    const limited = skills.getSkillsForClass(cls).filter(s => s.book && s.level <= level && s.source.kind === 'event').map(s => s.id);
    const packs = [['base', base], ['earned', [...base.slice(0, 2), ...earned.slice(-2)]], ...(limited.length ? [['limited', [...base.slice(0, 2), earned.at(-1), limited[0]]]] : [])];
    for (const ids of combinations(baseline, Math.min(4, baseline.length))) packs.push(['baseline-sweep', ids]);
    if (sweep && level === 45) {
      const pool = builds.unlocked(cls, level, fixture.player.user_id).map(s => s.id);
      for (const ids of combinations(pool, 4)) packs.push(['sweep', ids]);
    }
    for (const [pool, ids] of packs) {
      if (new Set(ids).size !== ids.length || ids.some(id => !id)) throw new Error('Invalid loadout fixture');
      const legal = builds.set(fixture.player.user_id, cls, level, ids);
      if (legal.error) throw new Error(legal.error);
      for (const target of targets(db, level)) for (const policy of pool.endsWith('sweep') ? ['greedy', 'tactical'] : ['basic', 'greedy', 'tactical']) {
        rows.push({ cls, level, gear, stance: fixture.stance, pool, ids, target: target.id, policy, ...fight(initial(fixture, target, ids), policy) });
      }
    }
  }
  return { fixtures, rows, probes: skillProbes() };
}
module.exports = { LEVELS, CLASSES, combinations, gearFor, makeFixture, initial, advance, response, choose, fight, run, skillProbes };
if (require.main === module) {
  const fs = require('fs'), os = require('os'), path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-build-audit-'));
  process.env.DB_PATH = path.join(dir, 'audit.db');
  const log = console.log; let db;
  try {
    console.log = () => {}; db = require('../src/db/database'); console.log = log;
    const results = run(db, process.argv.includes('--sweep'));
    fs.mkdirSync('.cache/build-audit', { recursive: true });
    fs.writeFileSync('.cache/build-audit/results.json', JSON.stringify(results));
    log(`Saved ${results.rows.length} deterministic battles to .cache/build-audit/results.json (temporary fresh DB; live DB ignored).`);
    log(JSON.stringify(results.probes));
  } finally { console.log = log; if (db?.open) db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}
