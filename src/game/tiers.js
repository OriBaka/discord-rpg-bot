// Hệ thống độ hiếm (tier)
const TIERS = {
  common:    { name: 'Phổ thông',  emoji: '⚪', color: 0x95A5A6, order: 1 },
  rare:      { name: 'Hiếm',       emoji: '🔵', color: 0x3498DB, order: 2 },
  epic:      { name: 'Sử thi',     emoji: '🟣', color: 0x9B59B6, order: 3 },
  legendary: { name: 'Huyền thoại', emoji: '🟠', color: 0xE67E22, order: 4 },
};

function tierInfo(tierKey) {
  return TIERS[tierKey] || TIERS.common;
}

function tierBadge(tierKey) {
  const t = tierInfo(tierKey);
  return `${t.emoji} ${t.name}`;
}

module.exports = { TIERS, tierInfo, tierBadge }; 
