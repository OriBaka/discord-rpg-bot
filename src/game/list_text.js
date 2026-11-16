// Cắt danh sách dài thành chuỗi vừa giới hạn mà KHÔNG cắt giữa dòng và KHÔNG
// im lặng: phần bị bỏ luôn được báo "… còn N dòng".
//
// Vì sao cần: nhiều lệnh dùng `lines.join('\n').slice(0, 4000)` — slice cắt giữa
// một dòng nên người chơi thấy ký tự cụt, và không biết còn bao nhiêu mục nữa.
// Với nội dung admin tạo được lúc chạy (recipe, thành tựu, pet, code) danh sách
// chỉ dài thêm, nên phần "còn lại" phải hiện ra thành thông tin.
function clipLines(lines, max = 3800, opts = {}) {
  const list = (lines || []).filter((l) => l !== undefined && l !== null);
  const suffixOf = opts.suffix || ((n) => `… còn **${n}** dòng nữa`);
  const out = [];
  let len = 0;
  for (let i = 0; i < list.length; i++) {
    const line = String(list[i]);
    const add = (out.length ? 1 : 0) + line.length;
    // Chừa ~60 ký tự cho dòng "còn N dòng nữa"
    if (len + add > max - 60) {
      const left = list.length - i;
      const note = suffixOf(left);
      out.push(note);
      return out.join('\n');
    }
    out.push(line);
    len += add;
  }
  return out.join('\n');
}

module.exports = { clipLines };
