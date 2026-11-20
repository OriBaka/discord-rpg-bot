// Main story is independent of daily/custom quests. Only the active step
// receives events; claims and rewards commit together in one SQLite transaction.
function getDb() { return require('../db/database'); }
const STEPS = [
  { id: 'prologue_watch', chapter: 'Mở đầu — Thị trấn không ngủ', title: 'Ngọn đèn cuối phố', kind: 'talk', qty: 1,
    text: 'Đêm xuống, mọi nhà đều treo đèn hướng về phương bắc. Bà giữ đèn tên An đặt vào tay bạn một cuốn sổ trắng. “Chúng ta vẫn canh đường ấy. Còn canh thứ gì… không ai nhớ nữa. Hãy bắt đầu bằng việc giúp người còn sống.”',
    goal: 'Nói chuyện với bà An: dùng {p}story claim.', gold: 50, xp: 10 },
  { id: 'prologue_tracks', chapter: 'Mở đầu — Thị trấn không ngủ', title: 'Dấu chân quanh hàng rào', kind: 'kill', target: 'slime', qty: 3,
    text: 'Nhựa đen bám dưới hàng rào phía rừng. Người gác cổng nhờ bạn dọn những khối nhầy để tìm lại lối tuần tra bị bỏ quên.',
    goal: 'Thắng 3 Slime sau khi nhận bước này: {p}hunt slime.', gold: 100, xp: 30, item: 'potion_s', itemQty: 2 },
  { id: 'prologue_supplies', chapter: 'Mở đầu — Thị trấn không ngủ', title: 'Củi cho đêm dài', kind: 'gather', target: 'foraging', qty: 3,
    text: 'Bà An đếm những ngọn đèn sắp cạn dầu. “Trước khi đi tìm chuyện của người chết, nhớ để lại hơi ấm cho người sống.” Bạn nhận một chuyến gom nguyên liệu ngoài bìa rừng.',
    goal: 'Thu hoạch 3 nguyên liệu bằng nghề foraging: {p}gather (xem khu vực rồi hái lượm).', gold: 100, xp: 30 },
  { id: 'chapter1_fangs', chapter: 'Chương 1 — Tiếng tru sau cột mốc', title: 'Những con sói không về tổ', kind: 'kill', target: 'wolf', qty: 3,
    text: 'Giữa đống củi có mảnh cột mốc khắc bảy vạch. Bà An nhận ra nét khắc trên huy hiệu của đoàn hộ tống xưa. Ngoài rừng, sói đang cào đất quanh một cột mốc giống hệt. Chúng không săn mồi. Chúng muốn đào thứ gì đó lên.',
    goal: 'Thắng 3 Wild Wolf: {p}hunt wolf. Giữ lại ít nhất 2 wolf_fang cho bước sau.', gold: 150, xp: 40 },
  { id: 'chapter1_offering', chapter: 'Chương 1 — Tiếng tru sau cột mốc', title: 'Dấu vết mang về', kind: 'item', target: 'wolf_fang', qty: 2,
    text: 'Thợ rèn Lâm xoay chiếc nanh dưới ánh lửa. “Có thứ làm men răng lạnh từ bên trong. Ta cần hai chiếc để đối chiếu. Đừng gọi đó là lời nguyền trước khi biết nó là gì.”',
    goal: 'Giao 2 wolf_fang bằng {p}story claim (tiêu hao). Kiếm thêm bằng {p}hunt wolf nếu thiếu.', gold: 120, xp: 30 },
  { id: 'chapter1_prepare', chapter: 'Chương 1 — Tiếng tru sau cột mốc', title: 'Chuẩn bị trước khi bước qua', kind: 'craft', qty: 1,
    text: 'Lâm đánh dấu vị trí cột mốc lên bản đồ. “Sói đầu đàn ở đó. Đừng mang mỗi lòng can đảm.” Trong lúc ông chuẩn bị dụng cụ kiểm tra, hãy tự chế hoặc nấu một món cho chuyến đi.',
    goal: 'Chế hoặc nấu thành công 1 món sau khi nhận bước này. Xem {p}craft list hoặc {p}cook list để chọn công thức và nguyên liệu.', gold: 150, xp: 40, item: 'potion_m', itemQty: 2 },
  { id: 'chapter1_alpha', chapter: 'Chương 1 — Tiếng tru sau cột mốc', title: 'Kẻ giữ cột mốc', kind: 'boss', target: 'elite_wolf', qty: 1,
    text: 'Alpha Wolf đứng chắn cột mốc, miệng không phát ra tiếng nhưng rừng vẫn vang tiếng tru. Dưới chân nó là một tấm đồng mang dấu người canh gác. Nó không phải nguồn gốc của điều bất thường — chỉ là sinh vật đã ở quá gần.',
    goal: 'Hạ elite Alpha Wolf: {p}battle elite_wolf (hoặc {p}hunt elite_wolf). Hãy trang bị và hồi máu trước; không cần đánh ngay nếu còn yếu.', gold: 250, xp: 70 },
  { id: 'chapter1_return', chapter: 'Chương 1 — Tiếng tru sau cột mốc', title: 'Tên gọi bị bỏ quên', kind: 'talk', qty: 1,
    text: 'Bà An lau tấm đồng bạn mang về. Mặt sau chỉ còn một câu: “Chúng tôi ở lại để họ được trở về.” Bà im lặng rất lâu rồi khâu một dấu chỉ lên cuốn sổ của bạn. “Thị trấn này không được dựng lên để bán hàng. Có lẽ chúng ta là con cháu của những người đứng đợi.” Ở trang kế tiếp, một địa danh hiện ra: khe băng phía bắc. Bảy vạch khắc vẫn chưa có tên. Bạn chưa tìm thấy thanh kiếm nào.',
    goal: 'Trở về báo tin: {p}story claim. Nhận kỷ vật Dấu Chỉ Người Canh Đèn.', gold: 200, xp: 50, item: 'story_watchers_mark', itemQty: 1 },
  ...require('./story_chapter2').STEPS,
];

function migrate() {
  const db = getDb();
  require('./story_chapter2').seed(db);
  db.exec(`CREATE TABLE IF NOT EXISTS player_story (
    user_id TEXT PRIMARY KEY REFERENCES players(user_id) ON DELETE CASCADE,
    step INTEGER NOT NULL DEFAULT 0,
    progress INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.prepare(`INSERT OR IGNORE INTO items (id, name, type, tier, sell, soulbound, desc)
    VALUES ('story_watchers_mark', '🪡 Dấu Chỉ Người Canh Đèn', 'material', 'rare', 0, 1, ?)`)
    .run('Kỷ vật hoàn thành chương 1 chính tuyến. Sợi chỉ khâu hình ngọn đèn trên cuốn sổ; không mang sức mạnh chiến đấu.');
}

function start(userId) {
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM players WHERE user_id=?').get(userId)) return false;
  const now = Date.now();
  return Boolean(db.prepare('INSERT OR IGNORE INTO player_story (user_id, started_at, updated_at) VALUES (?,?,?)').run(userId, now, now).changes);
}
function status(userId) {
  const db = getDb();
  const state = db.prepare('SELECT * FROM player_story WHERE user_id=?').get(userId);
  if (!state) return null;
  const step = STEPS[state.step];
  let progress = state.progress;
  if (step?.kind === 'talk') progress = 1;
  if (step?.kind === 'item') progress = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(userId, step.target)?.qty || 0;
  return { ...state, current: step, progress: step ? Math.min(progress, step.qty) : 0 };
}
function onEvent(userId, kind, target, amount = 1) {
  if (!Number.isSafeInteger(amount) || amount <= 0) return;
  const state = status(userId);
  const step = state?.current;
  if (!step || step.kind !== kind || (step.target && step.target !== target)) return;
  getDb().prepare('UPDATE player_story SET progress=MIN(progress+?,?), updated_at=? WHERE user_id=? AND step=?')
    .run(amount, step.qty, Date.now(), userId, state.step);
}
function claim(userId) {
  const db = getDb();
  return db.transaction(() => {
    const state = status(userId);
    if (!state) return { error: 'Chưa bắt đầu. Dùng story start.' };
    const step = state.current;
    if (!step) return { error: 'Bạn đã hoàn thành toàn bộ nội dung hiện có.' };
    if (state.progress < step.qty) return { error: 'Chưa đủ mục tiêu của bước hiện tại.' };
    if (step.kind === 'item') {
      const removed = db.prepare('UPDATE inventory SET qty=qty-? WHERE user_id=? AND item_id=? AND qty>=?').run(step.qty, userId, step.target, step.qty);
      if (!removed.changes) throw new Error('Không đủ vật phẩm bàn giao');
      db.prepare('DELETE FROM inventory WHERE user_id=? AND item_id=? AND qty=0').run(userId, step.target);
    }
    // Advance before reward hooks, so rewards cannot credit the completed step.
    db.prepare('UPDATE player_story SET step=step+1, progress=0, updated_at=? WHERE user_id=?').run(Date.now(), userId);
    db.prepare('UPDATE players SET gold=gold+? WHERE user_id=?').run(step.gold, userId);
    const player = require('./player');
    player.addXpAndLevel(userId, step.xp);
    if (step.item) player.addItem(userId, step.item, step.itemQty);
    return { step };
  })();
}
module.exports = { STEPS, migrate, start, status, onEvent, claim };
