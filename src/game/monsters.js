// Quái vật. min_level = level tối thiểu để gặp.
// drops: [{ item_id, chance (0..1), qty }]
const MONSTERS = [
  {
    id: 'slime', name: '🟢 Slime', min_level: 1, max_level: 3,
    hp: 30, atk: 5, def: 1, xp: 8, gold: [5, 12],
    drops: [{ item_id: 'slime_gel', chance: 0.8, qty: 1 }],
  },
  {
    id: 'wolf', name: '🐺 Sói Hoang', min_level: 3, max_level: 7,
    hp: 70, atk: 12, def: 3, xp: 20, gold: [12, 25],
    drops: [{ item_id: 'wolf_fang', chance: 0.5, qty: 1 }],
  },
  {
    id: 'goblin', name: '👺 Goblin', min_level: 5, max_level: 10,
    hp: 120, atk: 18, def: 6, xp: 40, gold: [25, 50],
    drops: [
      { item_id: 'goblin_ear', chance: 0.6, qty: 1 },
      { item_id: 'potion_s',   chance: 0.2, qty: 1 },
    ],
  },
  {
    id: 'orc', name: '👹 Orc Chiến Binh', min_level: 8, max_level: 15,
    hp: 250, atk: 28, def: 12, xp: 90, gold: [60, 120],
    drops: [
      { item_id: 'orc_tusk',  chance: 0.5, qty: 1 },
      { item_id: 'potion_m',  chance: 0.15, qty: 1 },
    ],
  },
  {
    id: 'dragon', name: '🐉 Rồng Cổ Đại', min_level: 15, max_level: 99,
    hp: 800, atk: 60, def: 25, xp: 350, gold: [300, 600],
    drops: [
      { item_id: 'dragon_scale', chance: 0.7, qty: 1 },
      { item_id: 'potion_l',     chance: 0.3, qty: 1 },
    ],
  },
];

function pickMonsterForLevel(level) {
  const pool = MONSTERS.filter(m => level >= m.min_level && level <= m.max_level + 3);
  if (pool.length === 0) return MONSTERS[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = { MONSTERS, pickMonsterForLevel }; 
