// Test hệ pet: khí hậu (habitat) + tiến hoá bằng mảnh.
//
// Khoá các yêu cầu:
//   1. Mỗi pet sống ở đúng MỘT vùng khí hậu, và vùng đó phải là zone thật.
//   2. Pet chỉ rơi từ quái trong đúng vùng của nó (kể cả khi admin gán sai).
//   3. Pet nào cũng có nguồn: drop / ghép mảnh / là đích của một công thức tiến
//      hoá — không có nội dung chết.
//   4. Công thức tiến hoá: cùng khí hậu, không vòng lặp, mảnh có nguồn rơi.
//   5. `%pet evolve` tiêu đúng 1 pet gốc + mảnh + vàng; thiếu bất cứ thứ gì thì
//      KHÔNG mất gì cả.
//   6. Pet đang active mà bị tiêu hao → pet mới đi theo, không mất buff oan.
//   7. Admin tự tạo/sửa/xoá được công thức và đổi khí hậu; tạo vòng lặp bị chặn.
//   8. Rà soát: active_pet trỏ vào pet đã mất KHÔNG còn cộng buff.
//   9. `%pet shards` chỉ ra cả công thức tiến hoá dùng mảnh đó.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, fakeMessage, quiet, loud } = require('./harness');

let db, player, pets, petCmd, seq = 0;

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  pets = require(`${ROOT}/src/game/pets`);
  petCmd = require(`${ROOT}/src/commands/pet`);
  loud();
});

const out = (m) => m._text();
// Admin pet vẫn phải có nhân vật (lệnh %pet chặn khi chưa %start).
before(() => {
  try { player.createPlayer('ADMIN_PET', 'petadmin'); } catch {}
});

const newPlayer = (level = 40, gold = 10_000) => {
  const uid = `PT${++seq}`;
  player.createPlayer(uid, `p${seq}`);
  player.updatePlayer(uid, { level, gold });
  return uid;
};
const goldOf = (uid) => db.prepare('SELECT gold FROM players WHERE user_id=?').get(uid).gold;
const levelOf = (uid) => db.prepare('SELECT level FROM players WHERE user_id=?').get(uid).level;
const activeOf = (uid) => db.prepare('SELECT active_pet FROM players WHERE user_id=?').get(uid).active_pet;
const petQty = (uid, id) => db.prepare('SELECT qty FROM player_pets WHERE user_id=? AND pet_id=?').get(uid, id)?.qty || 0;

// ─────────────────────────────────────────────────────────────
// Dữ liệu: khí hậu
// ─────────────────────────────────────────────────────────────
test('mỗi pet sống ở một vùng khí hậu có thật', () => {
  const rows = db.prepare('SELECT id, habitat FROM pets').all();
  assert.ok(rows.length >= 28, `phải có ít nhất 28 pet, đang có ${rows.length}`);
  const missing = rows.filter(r => !r.habitat);
  assert.deepStrictEqual(missing.map(r => r.id), [], 'pet chưa gán khí hậu');

  const bad = rows.filter(r => !pets.HABITATS[r.habitat]);
  assert.deepStrictEqual(bad.map(r => `${r.id}:${r.habitat}`), [], 'khí hậu không có trong danh sách');

  for (const h of Object.keys(pets.HABITATS)) {
    assert.ok(db.prepare('SELECT 1 FROM zones WHERE id=?').get(h),
      `khí hậu ${h} không phải zone thật trong DB`);
  }
});

test('cả 9 vùng khí hậu đều có pet sinh sống', () => {
  const byHab = pets.petsByHabitat();
  const empty = Object.keys(pets.HABITATS).filter(h => !(byHab.get(h) || []).length);
  assert.deepStrictEqual(empty, [], 'vùng khí hậu không có pet nào');
});

test('pet chỉ rơi ở đúng vùng khí hậu của nó', () => {
  const rows = db.prepare(`SELECT pd.monster_id, pd.pet_id, m.zone_id, p.habitat
    FROM pet_drops pd
    JOIN monsters m ON m.id = pd.monster_id
    JOIN pets p ON p.id = pd.pet_id
    WHERE pd.pet_id IS NOT NULL`).all();
  assert.ok(rows.length >= 14, 'phải có ít nhất 14 drop pet trực tiếp');
  const wrong = rows.filter(r => r.habitat && r.habitat !== r.zone_id);
  assert.deepStrictEqual(wrong.map(r => `${r.monster_id}(${r.zone_id}) → ${r.pet_id}(${r.habitat})`), []);
});

test('mỗi mob tối đa 1 pet hoặc 1 shard (không cả hai)', () => {
  const bad = db.prepare(`SELECT monster_id, COUNT(*) c FROM pet_drops
    GROUP BY monster_id HAVING c > 1`).all();
  assert.deepStrictEqual(bad.map(b => `${b.monster_id}×${b.c}`), []);
});

test('pet nào cũng có nguồn (drop / ghép mảnh / đích tiến hoá)', () => {
  const rows = db.prepare('SELECT id, hidden, shard_id, shard_qty FROM pets').all();
  const drops = new Set(db.prepare('SELECT DISTINCT pet_id FROM pet_drops WHERE pet_id IS NOT NULL').all().map(r => r.pet_id));
  const targets = new Set(db.prepare('SELECT DISTINCT to_pet_id FROM pet_evolutions').all().map(r => r.to_pet_id));
  const dead = rows.filter(p =>
    !drops.has(p.id) && !targets.has(p.id) && !(p.shard_id && p.shard_qty > 0) && !p.hidden);
  assert.deepStrictEqual(dead.map(p => p.id), [], 'pet không có đường nào để lấy');
});

// ─────────────────────────────────────────────────────────────
// Dữ liệu: công thức tiến hoá
// ─────────────────────────────────────────────────────────────
test('công thức tiến hoá hợp lệ: cùng khí hậu, đủ pet, mảnh có nguồn', () => {
  const evos = db.prepare(`SELECT e.*, f.habitat fh, t.habitat th
    FROM pet_evolutions e LEFT JOIN pets f ON f.id=e.from_pet_id LEFT JOIN pets t ON t.id=e.to_pet_id`).all();
  assert.ok(evos.length >= 13, `phải có ít nhất 13 công thức, đang có ${evos.length}`);

  const problems = [];
  for (const e of evos) {
    if (!e.fh) problems.push(`${e.from_pet_id} không tồn tại`);
    if (!e.th) problems.push(`${e.to_pet_id} không tồn tại`);
    if (e.fh && e.th && e.fh !== e.th) problems.push(`${e.from_pet_id}(${e.fh})→${e.to_pet_id}(${e.th}) khác khí hậu`);
    if (!(e.shard_qty >= 1)) problems.push(`${e.from_pet_id}→${e.to_pet_id} qty sai`);
    if (!(e.gold_cost >= 0)) problems.push(`${e.from_pet_id}→${e.to_pet_id} gold sai`);
    const shardSrc = db.prepare('SELECT 1 FROM pet_drops WHERE shard_id=? LIMIT 1').get(e.shard_id);
    if (!shardSrc) problems.push(`mảnh ${e.shard_id} không rơi ở đâu`);
  }
  assert.deepStrictEqual(problems, []);
});

test('không có vòng lặp tiến hoá trong seed', () => {
  const evos = db.prepare('SELECT from_pet_id, to_pet_id FROM pet_evolutions').all();
  const graph = new Map();
  for (const e of evos) {
    if (!graph.has(e.from_pet_id)) graph.set(e.from_pet_id, []);
    graph.get(e.from_pet_id).push(e.to_pet_id);
  }
  const state = new Map(); // 0 = đang duyệt, 1 = xong
  const cycle = [];
  const dfs = (n, path) => {
    if (state.get(n) === 0) { cycle.push([...path, n].join('→')); return; }
    if (state.get(n) === 1) return;
    state.set(n, 0);
    for (const nx of graph.get(n) || []) dfs(nx, [...path, n]);
    state.set(n, 1);
  };
  for (const id of graph.keys()) dfs(id, []);
  assert.deepStrictEqual(cycle, [], 'có vòng lặp tiến hoá');
});

// ─────────────────────────────────────────────────────────────
// Hành vi: %pet evolve
// ─────────────────────────────────────────────────────────────
test('evolve: tiêu 1 pet gốc + mảnh + vàng, nhận pet đích', () => {
  const uid = newPlayer(40, 5000);
  pets.addPet('PTevolve1', 'pet_wolf_cub', 1); // tạo user phụ không ảnh hưởng
  player.createPlayer('PTevolve1', 'evo1');
  pets.addPet(uid, 'pet_wolf_cub', 2);
  pets.addShard(uid, 'shard_leaf', 10);

  const r = pets.evolve(uid, 'pet_wolf_cub', 'pet_dire_wolf');
  assert.ok(r.ok, `evolve phải thành công, nhận: ${JSON.stringify(r)}`);
  assert.strictEqual(petQty(uid, 'pet_wolf_cub'), 1, 'phải tiêu đúng 1 pet gốc (còn 1 trong 2)');
  assert.strictEqual(petQty(uid, 'pet_dire_wolf'), 1, 'phải nhận được pet đích');
  assert.strictEqual(pets.getShard(uid, 'shard_leaf'), 4, 'phải trừ đúng 6 mảnh');
  assert.strictEqual(goldOf(uid), 4800, 'phải trừ đúng 200 vàng');
});

test('evolve: pet đang active thì pet mới đi theo (không mất buff)', () => {
  const uid = newPlayer(40, 5000);
  pets.addPet(uid, 'pet_bat', 1);
  pets.addShard(uid, 'shard_gloom', 6);
  pets.setActivePet(uid, 'pet_bat');
  assert.strictEqual(pets.getPetBonus(uid).drop_pct, 5);

  const r = pets.evolve(uid, 'pet_bat', 'pet_vampire_bat');
  assert.ok(r.ok);
  assert.strictEqual(activeOf(uid), 'pet_vampire_bat');
  assert.strictEqual(pets.getActivePet(uid).id, 'pet_vampire_bat');
  assert.strictEqual(pets.getPetBonus(uid).drop_pct, 8, 'buff phải là của pet mới');
});

test('evolve: thiếu mảnh thì không mất gì', () => {
  const uid = newPlayer(40, 5000);
  pets.addPet(uid, 'pet_spider', 1);
  pets.addShard(uid, 'shard_gloom', 5);

  const r = pets.evolve(uid, 'pet_spider', 'pet_web_matriarch');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'not_enough_shards');
  assert.strictEqual(petQty(uid, 'pet_spider'), 1);
  assert.strictEqual(pets.getShard(uid, 'shard_gloom'), 5);
  assert.strictEqual(goldOf(uid), 5000);
});

test('evolve: thiếu vàng thì không mất gì', () => {
  const uid = newPlayer(40, 100);
  pets.addPet(uid, 'pet_baby_scorpion', 1);
  pets.addShard(uid, 'shard_sun', 6);

  const r = pets.evolve(uid, 'pet_baby_scorpion', 'pet_scorpion_king');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'not_enough_gold');
  assert.strictEqual(petQty(uid, 'pet_baby_scorpion'), 1);
  assert.strictEqual(pets.getShard(uid, 'shard_sun'), 6);
  assert.strictEqual(goldOf(uid), 100);
});

test('evolve: chưa đủ cấp thì không mất gì', () => {
  const uid = newPlayer(5, 5000);
  pets.addPet(uid, 'pet_mini_dragon', 1);
  pets.addShard(uid, 'shard_star', 12);

  const r = pets.evolve(uid, 'pet_mini_dragon', 'pet_mini_void_dragon');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'level_too_low');
  assert.strictEqual(r.need, 35);
  assert.strictEqual(petQty(uid, 'pet_mini_dragon'), 1);
  assert.strictEqual(pets.getShard(uid, 'shard_star'), 12);
});

test('evolve: không sở hữu pet gốc thì chặn', () => {
  const uid = newPlayer(50, 9000);
  pets.addShard(uid, 'shard_leaf', 99);
  const r = pets.evolve(uid, 'pet_wolf_cub', 'pet_dire_wolf');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'no_base_pet');
  assert.strictEqual(pets.getShard(uid, 'shard_leaf'), 99);
});

test('evolve: pet nhiều hướng thì phải chọn đích', () => {
  const uid = newPlayer(40, 9000);
  pets.addPet(uid, 'pet_slime', 1);
  pets.addShard(uid, 'shard_leaf', 20);
  pets.addShard(uid, 'shard_mire', 20);
  // Thêm nhánh thứ 2 (cùng khí hậu forest) để thành 2 hướng
  const c = pets.createEvolution({
    from_pet_id: 'pet_slime', to_pet_id: 'pet_dire_wolf',
    shard_id: 'shard_leaf', shard_qty: 4, gold_cost: 50, min_level: 5,
  });
  assert.ok(c.ok, JSON.stringify(c));

  const amb = pets.evolve(uid, 'pet_slime');
  assert.strictEqual(amb.ok, false);
  assert.strictEqual(amb.reason, 'ambiguous');
  assert.strictEqual(amb.choices.length, 2);

  const pick = pets.evolve(uid, 'pet_slime', 'pet_dire_wolf');
  assert.ok(pick.ok, JSON.stringify(pick));
  assert.strictEqual(petQty(uid, 'pet_slime'), 0);

  pets.deleteEvolution('pet_slime', 'pet_dire_wolf');
});

// ─────────────────────────────────────────────────────────────
// Admin: công thức + khí hậu
// ─────────────────────────────────────────────────────────────
test('admin tạo được công thức, sai khí hậu bị chặn', () => {
  // Pet rừng → pet núi lửa = sai
  const bad = pets.createEvolution({
    from_pet_id: 'pet_baby_rat', to_pet_id: 'pet_ember_pup',
    shard_id: 'shard_leaf', shard_qty: 3,
  });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.reason, 'habitat_mismatch');

  // Tạo pet mới cùng vùng rồi nâng cấp nó
  const made = pets.createPet({ id: 'pet_test_mouse', name: 'Test Mouse', icon: '🐭', tier: 'rare', desc: 'Chuột thử nghiệm sống trong rừng.', habitat: 'forest' });
  assert.strictEqual(made.id, 'pet_test_mouse');
  const ok = pets.createEvolution({
    from_pet_id: 'pet_baby_rat', to_pet_id: 'pet_test_mouse',
    shard_id: 'shard_leaf', shard_qty: 3, gold_cost: 10, min_level: 2,
  });
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.ok(pets.getEvolution('pet_baby_rat', 'pet_test_mouse'));

  // Xoá
  assert.ok(pets.deleteEvolution('pet_baby_rat', 'pet_test_mouse'));
  assert.strictEqual(pets.getEvolution('pet_baby_rat', 'pet_test_mouse'), null);
  pets.deletePet('pet_test_mouse');
});

test('admin tạo vòng lặp tiến hoá bị chặn', () => {
  const made = pets.createPet({ id: 'pet_test_wolf2', name: 'Test Wolf2', icon: '🐺', tier: 'epic', desc: 'Sói thử nghiệm sống trong rừng.', habitat: 'forest' });
  assert.ok(made);
  assert.ok(pets.createEvolution({ from_pet_id: 'pet_dire_wolf', to_pet_id: 'pet_test_wolf2', shard_id: 'shard_leaf', shard_qty: 2 }).ok);

  const cyc = pets.createEvolution({ from_pet_id: 'pet_test_wolf2', to_pet_id: 'pet_dire_wolf', shard_id: 'shard_leaf', shard_qty: 2 });
  assert.strictEqual(cyc.ok, false);
  assert.strictEqual(cyc.reason, 'cycle');

  // Tự tiến hoá thành chính mình cũng bị chặn
  const self = pets.createEvolution({ from_pet_id: 'pet_dire_wolf', to_pet_id: 'pet_dire_wolf', shard_id: 'shard_leaf', shard_qty: 2 });
  assert.strictEqual(self.reason, 'same_pet');

  pets.deletePet('pet_test_wolf2');
});

test('admin đổi khí hậu; khí hậu lạ bị chặn', () => {
  const r = pets.setHabitat('pet_snowman', 'mountain');
  assert.ok(r.ok);
  const bad = pets.setHabitat('pet_snowman', 'moon');
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.reason, 'unknown_habitat');

  const made = pets.createPet({ id: 'pet_test_moon', name: 'Moon Test', icon: '🌙', tier: 'rare', desc: 'Pet thử nghiệm không vùng.', habitat: '' });
  assert.strictEqual(made.habitat, '');
  pets.deletePet('pet_test_moon');
});

// ─────────────────────────────────────────────────────────────
// Rà soát: các lỗi cũ đã sửa
// ─────────────────────────────────────────────────────────────
test('active_pet trỏ vào pet đã mất KHÔNG còn cộng buff', () => {
  const uid = newPlayer(30, 1000);
  pets.addPet(uid, 'pet_yeti_cub', 1);
  pets.setActivePet(uid, 'pet_yeti_cub');
  assert.ok(pets.getPetBonus(uid).atk > 0);

  // Mất pet (bán/xoá/tiêu hao) mà active_pet còn sót
  db.prepare('DELETE FROM player_pets WHERE user_id=? AND pet_id=?').run(uid, 'pet_yeti_cub');
  assert.strictEqual(pets.getActivePet(uid), null, 'không sở hữu thì không có pet active');
  assert.strictEqual(pets.getPetBonus(uid).atk, 0, 'buff phải về 0');
  assert.strictEqual(activeOf(uid), '', 'active_pet phải được dọn');
});

test('xoá pet dọn luôn công thức + active_pet', () => {
  const uid = newPlayer(30, 1000);
  pets.createPet({ id: 'pet_tmp_a', name: 'Tmp A', icon: '🐭', tier: 'rare', desc: 'Pet tạm A sống trong rừng.', habitat: 'forest' });
  pets.createPet({ id: 'pet_tmp_b', name: 'Tmp B', icon: '🐭', tier: 'epic', desc: 'Pet tạm B sống trong rừng.', habitat: 'forest' });
  pets.createEvolution({ from_pet_id: 'pet_tmp_a', to_pet_id: 'pet_tmp_b', shard_id: 'shard_leaf', shard_qty: 1 });
  pets.addPet(uid, 'pet_tmp_b', 1);
  pets.setActivePet(uid, 'pet_tmp_b');

  assert.ok(pets.deletePet('pet_tmp_b'));
  assert.strictEqual(db.prepare('SELECT 1 FROM pet_evolutions WHERE to_pet_id=?').get('pet_tmp_b'), undefined);
  assert.strictEqual(activeOf(uid), '');
  assert.strictEqual(pets.getPetBonus(uid).atk, 0);
  pets.deletePet('pet_tmp_a');
});

test('addPetDrop thay thế dòng cũ thay vì nhân đôi tỉ lệ', () => {
  const mob = 'forest_wisp';
  const before = db.prepare('SELECT COUNT(*) c FROM pet_drops WHERE monster_id=?').get(mob).c;
  pets.addPetDrop(mob, { shard_id: 'shard_leaf', chance: 0.18, qty: 1 });
  pets.addPetDrop(mob, { shard_id: 'shard_leaf', chance: 0.20, qty: 1 });
  const after = db.prepare('SELECT COUNT(*) c FROM pet_drops WHERE monster_id=?').get(mob).c;
  assert.strictEqual(after, before, 'gán lại cùng một drop không được tạo dòng mới');
  const row = db.prepare('SELECT chance FROM pet_drops WHERE monster_id=? AND shard_id=?').get(mob, 'shard_leaf');
  assert.strictEqual(row.chance, 0.20);

  pets.addPetDrop(mob, { shard_id: 'shard_leaf', chance: 0.18, qty: 1 }); // trả về seed
});

test('addPetDrop chặn gán pet sai khí hậu ngay từ đầu', () => {
  assert.throws(() => pets.addPetDrop('giant_rat', { pet_id: 'pet_ember_pup', chance: 0.1 }),
    /sai khí hậu/);
  // Đúng vùng thì được
  assert.doesNotThrow(() => pets.addPetDrop('giant_rat', { pet_id: 'pet_slime_king', chance: 0.001 }));
  db.prepare('DELETE FROM pet_drops WHERE monster_id=? AND pet_id=?').run('giant_rat', 'pet_slime_king');
  assert.throws(() => pets.addPetDrop('giant_rat', { pet_id: 'pet_khong_ton_tai', chance: 0.1 }), /không tồn tại/);
});

test('rollPetDrops bỏ qua pet sai khí hậu dù drop table có dòng đó', () => {
  const realRandom = Math.random;
  Math.random = () => 0; // luôn rơi
  try {
    const mob = db.prepare("SELECT id, zone_id FROM monsters WHERE zone_id='forest' LIMIT 1").get();
    // Chèn thẳng vào bảng (mô phỏng dữ liệu cũ/dirty mà addPetDrop đã chặn)
    db.prepare('INSERT OR REPLACE INTO pet_drops (monster_id, pet_id, shard_id, chance, qty) VALUES (?,?,?,?,?)')
      .run(mob.id, 'pet_ember_hound', null, 1, 1);
    const got = pets.rollPetDrops(mob.id, 0);
    assert.ok(!got.some(g => g.pet_id === 'pet_ember_hound'),
      `pet lửa không được rơi ở rừng: ${JSON.stringify(got)}`);

    // Pet vô gia cư (habitat='') thì được phép rơi ở mọi nơi
    pets.createPet({ id: 'pet_tmp_nomad', name: 'Nomad', icon: '🐾', tier: 'common', desc: 'Pet không thuộc vùng nào.', habitat: '' });
    pets.addPetDrop(mob.id, { pet_id: 'pet_tmp_nomad', chance: 1, qty: 1 });
    const got2 = pets.rollPetDrops(mob.id, 0);
    assert.ok(got2.some(g => g.pet_id === 'pet_tmp_nomad'), 'pet không vùng phải rơi được');

    db.prepare('DELETE FROM pet_drops WHERE monster_id=? AND (pet_id=? OR pet_id=?)').run(mob.id, 'pet_ember_hound', 'pet_tmp_nomad');
    pets.deletePet('pet_tmp_nomad');
  } finally {
    Math.random = realRandom;
  }
});

test('drop bonus không đẩy tỉ lệ vượt 100%', () => {
  const realRandom = Math.random;
  let calls = 0;
  Math.random = () => { calls++; return 0.999999; };
  try {
    const mob = db.prepare("SELECT id FROM monsters WHERE id='slime'").get();
    // slime 0.40 × (1 + 200/100) = 1.2 → phải kẹp còn 1.0 ⇒ luôn rơi
    const got = pets.rollPetDrops(mob.id, 200);
    assert.strictEqual(got.length, 1, 'kẹp trần 100% rồi thì phải rơi');
  } finally {
    Math.random = realRandom;
  }
});

test('mảnh tiến hoá hiện trong recipesUsingShard cùng công thức ghép', () => {
  const forLeaf = pets.recipesUsingShard('shard_leaf');
  const forSlimeShard = pets.recipesUsingShard('slime_shard');
  assert.ok(forSlimeShard.some(r => r.kind === 'combine' && r.pet_id === 'pet_slime'), 'phải có công thức ghép Slime');
  assert.ok(forLeaf.some(r => r.kind === 'evolve' && r.to_id === 'pet_dire_wolf'), 'phải có công thức tiến hoá Dire Wolf');
});

test('cleanup giữ pet tiến hoá, không xoá oan', () => {
  const res = pets.cleanupExtraPets();
  assert.deepStrictEqual(res.deletedIds, [], 'không được coi pet tiến hoá là pet thừa');
  assert.strictEqual(db.prepare("SELECT 1 FROM pets WHERE id='pet_dire_wolf'").get() !== undefined, true);
});

test('migrate chạy lại nhiều lần không nhân đôi dữ liệu', () => {
  const before = {
    pets: db.prepare('SELECT COUNT(*) c FROM pets').get().c,
    drops: db.prepare('SELECT COUNT(*) c FROM pet_drops').get().c,
    evos: db.prepare('SELECT COUNT(*) c FROM pet_evolutions').get().c,
  };
  pets.migrate();
  pets.migrate();
  const after = {
    pets: db.prepare('SELECT COUNT(*) c FROM pets').get().c,
    drops: db.prepare('SELECT COUNT(*) c FROM pet_drops').get().c,
    evos: db.prepare('SELECT COUNT(*) c FROM pet_evolutions').get().c,
  };
  assert.deepStrictEqual(after, before);
});

test('unique index chặn dòng drop trùng (NULL-safe)', () => {
  const mob = 'giant_rat';
  const before = db.prepare('SELECT COUNT(*) c FROM pet_drops WHERE monster_id=?').get(mob).c;
  // Cùng khoá nhưng NULL ở 2 cột khác nhau — PK cũ không chặn được trường hợp này.
  db.prepare('INSERT OR IGNORE INTO pet_drops (monster_id, pet_id, shard_id, chance, qty) VALUES (?,?,?,?,?)')
    .run(mob, 'pet_baby_rat', null, 0.5, 1);
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM pet_drops WHERE monster_id=?').get(mob).c, before);
  assert.strictEqual(db.prepare('SELECT chance FROM pet_drops WHERE monster_id=? AND pet_id=?').get(mob, 'pet_baby_rat').chance, 0.02,
    'dòng seed không bị ghi đè bởi INSERT OR IGNORE');
});

test('resetDropsToDefault khôi phục đủ và vẫn đúng khí hậu', () => {
  const n = pets.resetDropsToDefault();
  assert.strictEqual(n, pets.SEED_DROPS.length);
  const rows = db.prepare(`SELECT pd.pet_id, m.zone_id, p.habitat FROM pet_drops pd
    JOIN monsters m ON m.id=pd.monster_id JOIN pets p ON p.id=pd.pet_id
    WHERE pd.pet_id IS NOT NULL`).all();
  const wrong = rows.filter(r => r.habitat && r.habitat !== r.zone_id);
  assert.deepStrictEqual(wrong, []);
});

// ─────────────────────────────────────────────────────────────
// Command-level
// ─────────────────────────────────────────────────────────────
test('%pet evolve (không tham số) chỉ ra pet nào sẵn sàng', async () => {
  const uid = newPlayer(40, 5000);
  pets.addPet(uid, 'pet_wolf_cub', 1);
  pets.addShard(uid, 'shard_leaf', 6);

  const m = fakeMessage(uid);
  await petCmd.execute(m, ['evolve']);
  const t = out(m);
  assert.ok(t.includes('Wolf Cub'), `thiếu tên pet:\\n${t}`);
  assert.ok(t.includes('Dire Wolf'), `thiếu pet đích:\\n${t}`);
  assert.ok(/SẴN SÀNG/.test(t), `phải báo sẵn sàng:\\n${t}`);
});

test('%pet evolve <pet> thực hiện tiến hoá', async () => {
  const uid = newPlayer(40, 5000);
  pets.addPet(uid, 'pet_bear_cub', 1);
  pets.addShard(uid, 'shard_leaf', 6);

  const m = fakeMessage(uid);
  await petCmd.execute(m, ['evolve', 'pet_bear_cub']);
  const t = out(m);
  assert.ok(/TIẾN HOÁ/.test(t) && t.includes('War Bear'), `output:\\n${t}`);
  assert.strictEqual(petQty(uid, 'pet_war_bear'), 1);
  assert.strictEqual(petQty(uid, 'pet_bear_cub'), 0);
  assert.strictEqual(goldOf(uid), 4800);
});

test('%pet evolve báo thiếu mảnh rõ ràng', async () => {
  const uid = newPlayer(40, 5000);
  pets.addPet(uid, 'pet_spider', 1);
  pets.addShard(uid, 'shard_gloom', 2);

  const m = fakeMessage(uid);
  await petCmd.execute(m, ['evolve', 'pet_spider']);
  const t = out(m);
  assert.ok(t.includes('shard_gloom') && t.includes('2'), `output:\\n${t}`);
  assert.strictEqual(petQty(uid, 'pet_spider'), 1);
});

test('%pet shards chỉ ra công thức tiến hoá dùng mảnh', async () => {
  const uid = newPlayer(40, 5000);
  pets.addShard(uid, 'shard_scale', 10);
  const m = fakeMessage(uid);
  await petCmd.execute(m, ['shards']);
  const t = out(m);
  assert.ok(t.includes('tiến hoá'), `thiếu nhãn tiến hoá:\\n${t}`);
  assert.ok(t.includes('pet_dragonling'), `thiếu pet gốc:\\n${t}`);
});

test('%pet collection nhóm theo khí hậu và hiện nguồn tiến hoá', async () => {
  const uid = newPlayer(40, 5000);
  const m = fakeMessage(uid);
  await petCmd.execute(m, ['collection']);
  const t = out(m);
  for (const label of ['Wildwood Forest', "Dragon's Lair", 'Frozen Abyss', 'Ember Peak']) {
    assert.ok(t.includes(label), `thiếu vùng ${label}:\\n${t.slice(0, 500)}`);
  }
  assert.ok(t.includes('🧬'), `thiếu dấu hiệu tiến hoá:\\n${t.slice(0, 500)}`);
  // Không được cắt cụt giữa chừng: pet cuối cùng vẫn phải xuất hiện
  assert.ok(t.includes('Astral Panther') || t.includes('pet_astral_panther'));
});

test('%pet map liệt kê 9 vùng', async () => {
  const uid = newPlayer(40, 5000);
  const m = fakeMessage(uid);
  await petCmd.execute(m, ['map']);
  const t = out(m);
  const hits = Object.keys(pets.HABITATS).filter(h => t.includes(pets.habitatInfo(h).label)).length;
  assert.ok(hits >= 8, `chỉ thấy ${hits} vùng trong %pet map:\\n${t}`);
});

test('%pet admin evolve tạo công thức từ lệnh', async () => {
  const m = fakeMessage('ADMIN_PET', { admin: true });
  pets.createPet({ id: 'pet_tmp_cmd', name: 'Tmp Cmd', icon: '🐭', tier: 'rare', desc: 'Pet tạm cho test lệnh.', habitat: 'cave' });
  m.content = '%pet admin evolve pet_bat pet_tmp_cmd shard=shard_gloom qty=3 gold=50 level=5';
  await petCmd.execute(m, ['admin', 'evolve', 'pet_bat', 'pet_tmp_cmd']);
  const t = out(m);
  assert.ok(t.includes('Công thức'), `output:\\n${t}`);
  const rec = pets.getEvolution('pet_bat', 'pet_tmp_cmd');
  assert.ok(rec);
  assert.strictEqual(rec.shard_qty, 3);
  assert.strictEqual(rec.gold_cost, 50);
  assert.strictEqual(rec.min_level, 5);

  // sai khí hậu qua lệnh
  const m2 = fakeMessage('ADMIN_PET', { admin: true });
  m2.content = '%pet admin evolve pet_bat pet_bear_cub shard=shard_gloom qty=3';
  await petCmd.execute(m2, ['admin', 'evolve', 'pet_bat', 'pet_bear_cub']);
  assert.ok(out(m2).includes('Sai khí hậu'), out(m2));

  // liệt kê + xoá
  const m3 = fakeMessage('ADMIN_PET', { admin: true });
  m3.content = '%pet admin evolves pet_bat';
  await petCmd.execute(m3, ['admin', 'evolves', 'pet_bat']);
  assert.ok(out(m3).includes('pet_tmp_cmd'), out(m3));

  const m4 = fakeMessage('ADMIN_PET', { admin: true });
  m4.content = '%pet admin unevolve pet_bat pet_tmp_cmd';
  await petCmd.execute(m4, ['admin', 'unevolve', 'pet_bat', 'pet_tmp_cmd']);
  assert.strictEqual(pets.getEvolution('pet_bat', 'pet_tmp_cmd'), null);
  pets.deletePet('pet_tmp_cmd');
});

test('%pet admin habitat đổi vùng và báo lỗi vùng lạ', async () => {
  const m = fakeMessage('ADMIN_PET', { admin: true });
  pets.createPet({ id: 'pet_tmp_hab', name: 'Tmp Hab', icon: '🐾', tier: 'common', desc: 'Pet tạm đổi khí hậu.', habitat: 'forest' });
  m.content = '%pet admin habitat pet_tmp_hab swamp';
  await petCmd.execute(m, ['admin', 'habitat', 'pet_tmp_hab', 'swamp']);
  assert.strictEqual(pets.getPet('pet_tmp_hab').habitat, 'swamp');

  const m2 = fakeMessage('ADMIN_PET', { admin: true });
  m2.content = '%pet admin habitat pet_tmp_hab moon';
  await petCmd.execute(m2, ['admin', 'habitat', 'pet_tmp_hab', 'moon']);
  assert.ok(out(m2).includes('không có'), out(m2));
  assert.strictEqual(pets.getPet('pet_tmp_hab').habitat, 'swamp');
  pets.deletePet('pet_tmp_hab');
});

test('%pet admin create nhận habitat', async () => {
  const m = fakeMessage('ADMIN_PET', { admin: true });
  m.content = '%pet admin create pet_tmp_new name="Tmp New" tier=rare habitat=desert desc="Pet tạo bằng lệnh."';
  await petCmd.execute(m, ['admin', 'create', 'pet_tmp_new']);
  const p = pets.getPet('pet_tmp_new');
  assert.ok(p, out(m));
  assert.strictEqual(p.habitat, 'desert');
  pets.deletePet('pet_tmp_new');
});

// ─────────────────────────────────────────────────────────────
// Giới hạn embed của Discord (không được vượt, nếu không lệnh sẽ lỗi khi gửi)
// ─────────────────────────────────────────────────────────────
async function rawEmbed(uid, args) {
  const m = fakeMessage(uid);
  let payload = null;
  m.reply = async (p) => { payload = p; return { id: 'R' }; };
  await petCmd.execute(m, args);
  const e = payload.embeds[0];
  return e.data || e;
}

test('%pet collection không vượt giới hạn embed', async () => {
  const e = await rawEmbed(newPlayer(40, 1000), ['collection']);
  assert.ok(e.fields.length <= 25, `quá 25 field: ${e.fields.length}`);
  for (const f of e.fields) {
    assert.ok(f.value.length <= 1024, `field "${f.name}" dài ${f.value.length} > 1024`);
    assert.ok(f.name.length <= 256, `tên field quá dài: ${f.name}`);
  }
  const total = (e.title || '').length + (e.description || '').length +
    e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  assert.ok(total <= 6000, `tổng embed ${total} > 6000`);
});

test('%pet collection vẫn vừa embed khi sở hữu TẤT CẢ pet', async () => {
  const uid = newPlayer(50, 1000);
  for (const p of pets.getAllPets()) pets.addPet(uid, p.id, 1);
  const e = await rawEmbed(uid, ['collection']);
  assert.ok(e.fields.length <= 25, `quá 25 field: ${e.fields.length}`);
  for (const f of e.fields) assert.ok(f.value.length <= 1024, `field "${f.name}" dài ${f.value.length}`);
  const total = (e.title || '').length + (e.description || '').length +
    e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  assert.ok(total <= 6000, `tổng embed ${total} > 6000`);
});

test('%pet (pet của mình) không vượt giới hạn embed dù có 28 pet', async () => {
  const uid = newPlayer(50, 1000);
  for (const p of pets.getAllPets()) pets.addPet(uid, p.id, 1);
  const e = await rawEmbed(uid, []);
  const total = (e.title || '').length + (e.description || '').length +
    (e.fields || []).reduce((n, f) => n + f.name.length + f.value.length, 0);
  assert.ok(total <= 6000, `tổng embed ${total} > 6000`);
  assert.ok((e.description || '').length <= 4096, `description ${e.description.length} > 4096`);
});

test('%pet map không vượt giới hạn embed', async () => {
  const e = await rawEmbed(newPlayer(40, 1000), ['map']);
  assert.ok((e.description || '').length <= 4096, `description ${e.description.length} > 4096`);
  const total = (e.title || '').length + (e.description || '').length;
  assert.ok(total <= 6000, `tổng embed ${total} > 6000`);
});
