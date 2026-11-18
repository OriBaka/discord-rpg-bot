'use strict';
const $ = id => document.getElementById(id);
const number = n => new Intl.NumberFormat('vi-VN').format(n || 0);
const classes = { melee: 'Chiến binh', magic: 'Pháp sư', ranged: 'Cung thủ' };
const labels = { items: 'Sổ tay vật phẩm', item: 'Nguồn kiếm vật phẩm', overview: 'Tổng quan', players: 'Nhà thám hiểm', market: 'Chợ giao thương', guilds: 'Bang hội', profile: 'Hồ sơ nhà thám hiểm' };
const titles = { items: 'Biết đường đi. Tìm điều cần.', item: 'Mỗi vật phẩm, một câu chuyện.', overview: 'Thế giới đang chuyển mình.', players: 'Những người viết nên hành trình.', market: 'Mỗi món đồ, một cơ hội mới.', guilds: 'Đi cùng nhau. Đi xa hơn.', profile: 'Dấu ấn của một nhà thám hiểm.' };
let state = { view: 'overview', page: 1, q: '', id: '' };
let controller;
function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
function linkPlayer(p) {
  const a = el('a'); a.href = '#profile/' + encodeURIComponent(p.user_id);
  const wrap = el('span', undefined, 'person');
  wrap.append(el('span', [...p.name][0] || '?', 'avatar'), el('span', p.name)); a.append(wrap); return a;
}
function table(headers, rows, empty = 'Chưa có dữ liệu. Những trang đầu vẫn đang chờ được viết.') {
  if (!rows.length) return el('div', empty, 'empty');
  const t = el('table'); const thead = el('thead'); const head = el('tr');
  for (const h of headers) head.append(el('th', h)); thead.append(head); t.append(thead);
  const body = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    for (const value of row) { const td = el('td'); if (value instanceof Node) td.append(value); else td.textContent = String(value ?? '—'); tr.append(td); }
    body.append(tr);
  }
  t.append(body); return t;
}
function playerRows(items, offset = 0) {
  return items.map((p, i) => [el('span', String(offset + i + 1).padStart(2, '0'), 'rank'), linkPlayer(p), classes[p.primary_class] || 'Tân thủ', el('span', 'Lv. ' + p.level, 'level'), number(p.xp) + ' XP']);
}
async function api(url, signal) {
  const res = await fetch(url, { signal });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Không thể tải dữ liệu.');
  return data;
}
function readRoute() {
  const route = location.hash.slice(1);
  if (route.startsWith('item/')) return { view: 'item', id: route.slice(5), page: 1, q: '' };
  if (route.startsWith('profile/')) return { view: 'profile', id: route.slice(8), page: 1, q: '' };
  return { view: ['players', 'market', 'guilds', 'items'].includes(route) ? route : 'overview', page: 1, q: '', id: '' };
}
async function render() {
  controller?.abort(); controller = new AbortController(); const signal = controller.signal;
  $('feedback').textContent = 'Đang mở sổ ghi chép…';
  $('main').setAttribute('aria-busy', 'true');
  $('breadcrumb').textContent = labels[state.view]; $('page-title').textContent = titles[state.view];
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.view === state.view || state.view === 'profile' && a.dataset.view === 'players'));
  $('overview').hidden = state.view !== 'overview'; $('profile').hidden = !['profile', 'item'].includes(state.view);
  $('browse').hidden = !['players', 'market', 'guilds', 'items'].includes(state.view);
  for (const id of ['stats', 'leaders', 'results', 'profile']) $(id).replaceChildren();
  $('prev').disabled = true; $('next').disabled = true;
  try {
    if (state.view === 'overview') {
      const data = await api('/api/overview', signal);
      for (const [title, value, note] of [['Nhà thám hiểm', data.players, 'Những hành trình đã bắt đầu'], ['Bang hội', data.guilds, 'Cùng xây một mái nhà'], ['Tin chợ đang mở', data.listings, 'Cơ hội đang chờ bạn'], ['Vàng thuế đã hủy', data.taxBurned, 'Từ khi bật sổ thuế chợ']]) {
        const card = el('div', undefined, 'stat'); card.append(el('small', title), el('strong', number(value)), el('span', note)); $('stats').append(card);
      }
      $('leaders').replaceChildren(table(['HẠNG', 'NHÀ THÁM HIỂM', 'CLASS', 'CẤP ĐỘ', 'KINH NGHIỆM'], playerRows(data.leaders)));
    } else if (state.view === 'item') {
      const data = await api('/api/items/' + encodeURIComponent(state.id), signal);
      const card = el('article', undefined, 'panel profile-card');
      card.append(el('div', data.item.id + ' / ' + data.item.tier, 'eyebrow'), el('h2', data.item.name), el('p', data.item.desc));
      for (const [label, rows] of [['Nguồn kiếm', data.sources], ['Dùng để chế / nấu', data.uses]]) {
        card.append(el('h3', label)); const list = el('ul');
        for (const row of rows) list.append(el('li', row));
        if (!rows.length) list.append(el('li', 'Chưa ghi nhận trong các nguồn được tra cứu.'));
        card.append(list);
      }
      card.append(el('p', data.note, 'muted')); $('profile').replaceChildren(card);
    } else if (state.view === 'profile') {
      const p = await api('/api/players/' + encodeURIComponent(state.id), signal);
      const card = el('article', undefined, 'panel profile-card'); card.append(el('div', 'HỒ SƠ CÔNG KHAI', 'eyebrow'), el('h2', p.name));
      const meta = el('div', undefined, 'profile-meta');
      meta.append(el('span', 'Lv. ' + p.level), el('span', classes[p.primary_class] || 'Tân thủ'), el('span', p.guild ? `[${p.guild.tag}] ${p.guild.name}` : 'Chưa có bang hội'));
      for (const a of p.appearance) meta.append(el('span', a.name));
      if (p.aura) meta.append(el('span', `${p.aura.effect} · ${p.aura.tier} +${p.aura.percent}%`));
      card.append(meta, el('h3', 'Trang bị đang mặc'), table(['VỊ TRÍ', 'TRANG BỊ', 'PHẨM CHẤT'], p.equipment.map(e => [e.slot, e.name, e.tier]), 'Nhà thám hiểm chưa trang bị vật phẩm.'));
      card.append(el('p', 'Túi đồ, vàng cá nhân và tiến độ truyện không được công khai trên web.', 'muted'));
      $('profile').replaceChildren(card);
    } else {
      $('search').placeholder = state.view === 'items' ? 'Tìm tên hoặc ID vật phẩm…' : state.view === 'players' ? 'Tìm theo tên hoặc Discord ID…' : state.view === 'market' ? 'Tìm theo tên hoặc mã vật phẩm…' : 'Tìm theo tên hoặc tag bang hội…';
      $('search').value = state.q;
      $('list-title').textContent = state.view === 'players' ? 'Bảng xếp hạng cấp độ' : labels[state.view];
      const data = await api(`/api/${state.view}?page=${state.page}&q=${encodeURIComponent(state.q)}`, signal);
      if (state.view === 'items') $('results').replaceChildren(table(['VẬT PHẨM', 'ID', 'LOẠI', 'PHẨM CHẤT'], data.items.map(i => {
        const a = el('a', i.name); a.href = '#item/' + encodeURIComponent(i.id); return [a, i.id, i.type, i.tier];
      })));
      if (state.view === 'players') $('results').replaceChildren(table(['HẠNG', 'NHÀ THÁM HIỂM', 'CLASS', 'CẤP ĐỘ', 'KINH NGHIỆM'], playerRows(data.items, (state.page - 1) * data.pageSize)));
      if (state.view === 'market') $('results').replaceChildren(table(['VẬT PHẨM', 'PHẨM CHẤT', 'SỐ LƯỢNG', 'GIÁ / MÓN', 'NGƯỜI BÁN', 'MÃ TIN'], data.items.map(i => [i.name, i.tier, number(i.qty), number(i.price) + ' vàng', i.seller, '#' + i.id])));
      if (state.view === 'guilds') $('results').replaceChildren(table(['BANG HỘI', 'CẤP', 'THÀNH VIÊN', 'CÔNG TRÌNH'], data.items.map(g => [`[${g.tag}] ${g.name}`, 'Lv. ' + g.level, number(g.members), g.buildings.map(b => `${b.name} Lv.${b.level}`).join(' · ') || 'Chưa xây dựng'])));
      const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
      $('result-count').textContent = number(data.total) + ' kết quả'; $('page-info').textContent = `Trang ${state.page} / ${pages}`;
      $('prev').disabled = state.page <= 1; $('next').disabled = state.page >= pages;
      $('list-note').textContent = state.view === 'market' ? 'Chỉ hiển thị tin chưa hết hạn. Thuế bán 5% làm tròn lên. Dùng %market trong Discord để mua; tin có thể thay đổi sau khi tải trang.' : 'Dữ liệu toàn bot, sắp xếp theo cấp độ. Tìm kiếm tên không phân biệt hoa thường với ký tự ASCII.';
    }
    $('feedback').textContent = '';
    $('updated').textContent = 'Cập nhật ' + new Date().toLocaleTimeString('vi-VN') + ' · Chỉ đọc';
  } catch (err) {
    if (err.name !== 'AbortError') $('feedback').textContent = err.message + ' Nhấn Làm mới để thử lại.';
  } finally { if (!signal.aborted) $('main').setAttribute('aria-busy', 'false'); }
}
window.addEventListener('hashchange', () => { state = readRoute(); render(); });
$('search-form').addEventListener('submit', e => { e.preventDefault(); state.q = $('search').value.trim(); state.page = 1; render(); });
$('refresh').addEventListener('click', () => render());
$('prev').addEventListener('click', () => { if (state.page > 1) { state.page--; render(); } });
$('next').addEventListener('click', () => { state.page++; render(); });
state = readRoute(); render();
